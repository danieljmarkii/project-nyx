// The Day Summary screen's loader (B-661 PR 4).
//
// The read half of the pure `buildDaySummary` (`lib/daySummary.ts`): it fetches
// each pet's TODAY rows from the local mirror and folds them into the model the
// `/day-summary` screen renders. Local-first on purpose — the summary is opened
// from a lock-screen notification, often offline, so it reads the SQLite the sync
// layer keeps (the same choice the trial card, med strip and Today zone made),
// never a live Supabase round-trip.
//
// Multi-pet by construction (§5.3: one screen, sectioned per pet, active pet
// first): it loads EVERY pet, ordered active-first via the shipped
// `orderPetsActiveFirst`, and hands them to the builder in that order. Recompute
// triggers mirror the other Home loaders — the pet set, the active pet, and every
// hydration tick (an event another device pushed changes what "today" holds).
import { useEffect, useState } from 'react';
import { getTimeline } from '../lib/db';
import {
  buildDaySummary,
  localDayBoundsIso,
  type DaySummaryModel,
  type DaySummaryPetInput,
} from '../lib/daySummary';
import { usePetStore, orderPetsActiveFirst, type Pet } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

// A day's events for one pet is a small set (the local-day bounds already clip the
// query); this cap only guards a pathological backfill from unbounded reads.
const DAY_ROW_LIMIT = 500;

export type DaySummaryState =
  | { status: 'loading'; model: null }
  | { status: 'ready'; model: DaySummaryModel }
  | { status: 'error'; model: null };

export function useDaySummary(): DaySummaryState {
  const pets = usePetStore((s) => s.pets);
  const activePetId = usePetStore((s) => s.activePet?.id ?? null);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const [state, setState] = useState<DaySummaryState>({ status: 'loading', model: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', model: null });

    (async () => {
      try {
        // Bake the instant once, so both the SQL prefetch bound and the builder's
        // local-day clip measure "today" from the same moment (the accepted
        // load-time snapshot behaviour of useDietTrial / useMedStrips).
        const nowMs = Date.now();
        const { after, before } = localDayBoundsIso(nowMs);
        // Active pet first (§5.3). A generic {id} helper, so the Pet[] passes through.
        const ordered = orderPetsActiveFirst(pets, activePetId);

        const perPet: DaySummaryPetInput[] = await Promise.all(
          ordered.map(async (p: Pet) => ({
            pet: { id: p.id, name: p.name, species: p.species },
            // getTimeline already filters deleted_at IS NULL; the builder re-filters
            // it (and re-clips the day) as the single enforcement point.
            rows: await getTimeline(p.id, DAY_ROW_LIMIT, 0, null, after, before),
          })),
        );
        if (cancelled) return;
        setState({ status: 'ready', model: buildDaySummary({ pets: perPet, nowMs }) });
      } catch (e) {
        // Honest degradation: a failed read shows the error state, NEVER an empty
        // "nothing logged today" (a silent read failure read as a false all-clear —
        // the §11 #2 / clinical-guardrails rule the DayEventsSheet also follows).
        console.error('[DaySummary] load failed:', e);
        if (!cancelled) setState({ status: 'error', model: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pets, activePetId, hydrationTick]);

  return state;
}
