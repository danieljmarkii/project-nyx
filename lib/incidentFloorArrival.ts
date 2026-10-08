// A server re-check's answer, said once (Engines v3 PR-28b, CUL-1436;
// docs/nyx-incident-tiers-requirements.md §8.7, §6 items 3 and 4).
//
// The drain (`lib/sync.ts`, `drainIncidentFloorQueue`) hands this module the reads the
// server re-floored around one log. It copies each to the phone, so every surface that reads
// the copy (Home's spine, History, the month) shows the stored tier, then applies the
// one-arrival rule (`pickBoutArrival`): a read is raised only above the louder of what the
// phone's copy said before this answer and what this phone already showed. At most one
// sentence follows, and only on the completion card of the log that raised it, while that
// card is still up (§6 item 3, PMD-14 = A). With no card up the raise arrives where the
// read lives: its record, which shows the stored tier when opened.

import { readCopies } from './readCopy';
import { effectiveTierRank, TIER_RANK, type TierRank } from './incidentTier';
import type { FloorTier } from './incidentFloor';
import { pickBoutArrival } from './incidentFloorPreview';
import { readShownTiers } from './incidentTierShown';
import { getDb } from './db';
import { useMomentStore } from '../store/momentStore';
import { useSyncStore } from '../store/syncStore';

function tierOfRank(rank: TierRank): FloorTier | null {
  if (rank === TIER_RANK.call_now) return 'call_now';
  if (rank === TIER_RANK.call_today) return 'call_today';
  return null;
}

export interface FloorLanding {
  triggerEventId: string;
  petId: string;
  eventIds: readonly string[];
  /** True once a sign-out has moved on from the account that asked. */
  stale: () => boolean;
}

/** Never throws: a failure costs the sentence, never the stored tier, which every surface
 *  reads from the record. */
export async function onFloorLanded(landing: FloorLanding): Promise<void> {
  try {
    const ids = [...new Set(landing.eventIds)];
    const before = await readCopies(ids);
    const shownBefore = await readShownTiers(ids);
    // Copy each re-floored read to the phone. Lazy: lib/sync.ts is the module calling this.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { refreshReadCopyOutcome } = require('./sync') as typeof import('./sync');
    let moved = false;
    for (const id of ids) {
      if (landing.stale()) return;
      if ((await refreshReadCopyOutcome(id)) === 'changed') moved = true;
    }
    if (landing.stale()) return;
    if (moved) useSyncStore.getState().bumpHydrationTick();

    const after = await readCopies(ids);
    const atRows = await getDb().getAllAsync<{ id: string; occurred_at: string }>(
      `SELECT id, occurred_at FROM events WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    );
    const atOf = new Map(atRows.map((r) => [r.id, r.occurred_at]));
    const reads: { eventId: string; at: string; tier: FloorTier }[] = [];
    const prior = new Map<string, TierRank>();
    for (const id of ids) {
      const copy = after.get(id);
      const tier = copy ? tierOfRank(effectiveTierRank(copy)) : null;
      const at = atOf.get(id);
      if (!tier || !at) continue;
      reads.push({ eventId: id, at, tier });
      const was = before.get(id);
      const said = shownBefore.get(id);
      const saidRank = said === 'call_now' ? TIER_RANK.call_now : said === 'call_today' ? TIER_RANK.call_today : TIER_RANK.quiet;
      prior.set(id, Math.max(was ? effectiveTierRank(was) : TIER_RANK.quiet, saidRank) as TierRank);
    }
    const { announce, raised } = pickBoutArrival(reads, prior);
    if (!announce || landing.stale()) return;
    // The register records the bout as said only if the card takes the line (a visible card
    // for this log, not undone, and not already saying a louder call). With no card up,
    // nothing announced it, and the record shows the stored tier on its own when opened.
    useMomentStore.getState().patchFloorLine(landing.triggerEventId, {
      eventId: announce.eventId,
      vomitAt: announce.at,
      tier: announce.tier,
      self: announce.eventId === landing.triggerEventId,
      device: false,
      petId: landing.petId,
      raised: raised.map((r) => ({ eventId: r.eventId, tier: r.tier })),
    });
  } catch (e) {
    console.warn('[floor] landing not said:', e);
  }
}
