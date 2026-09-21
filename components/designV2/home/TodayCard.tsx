// Today — the look as the header, the day's count, the spine (Design v2 — the whole
// day, D2-4 / CUL-1066; the round-4 page §01; Principle 3 as two jobs, §07: Home
// answers "is she okay" and "what happened today", in that order — this card is the
// second job).
//
// ── WHAT IT READS, AND HOW EACH READ FAILS ────────────────────────────────────
//   • Today's rows — the store (`useEvents`), clipped to the pet and the local day. Its
//     read state (`todayRead`, C-12) gives the three states below "has rows": a skeleton
//     until the read answers for THIS pet, an error line with a retry on a failed read,
//     and the quiet day's designed empty state only once the read answered with nothing.
//   • The photo set, the feedings and the free-fed spans — local SQLite
//     (`lib/spineReads.ts`), re-read whenever the row set or the sync tick changes. A
//     failed read leaves the previous facts in place; a node without them is a node
//     without a glyph or a timing, never a wrong one.
//   • The reads on the photographed symptoms — `event_ai_analysis`, OBSERVED, never
//     triggered (the issue: "an observe-only read … never a trigger"). Issued only for
//     rows that have a photo, so a day with none issues no server read at all — which is
//     also what the flag-off proof measures (C-41: no row AND no read).
//   • The `working` fact — `analysisChainOutstanding` per photographed row (C-30). While a
//     chain is outstanding the node shows the breathing tick; when it settles the rows are
//     re-read and the read lands ON that node. A row the server left at `pending` is
//     watched the way the sections watch it (`watchAnalysisRow`), then re-read.
//
// The model is pure (`buildSpine`) and the states are the card's; nothing here decides a
// clinical fact.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { useEvents } from '../../../hooks/useEvents';
import { analysisChainOutstanding, awaitAnalysisChain, watchAnalysisRow } from '../../../lib/analysis';
import { DEFAULT_MEAL_TIMING_CONFIG } from '../../../lib/mealTiming';
import { buildSpine, countLine, type SpineAnalysisRow } from '../../../lib/spineNode';
import {
  readAnalysisRows,
  readFeedingsSince,
  readFreeFedSpans,
  readPhotographedIds,
  type FreeFedSpan,
} from '../../../lib/spineReads';
import type { FeedingRow } from '../../../lib/patternsTiming';
import { eventTintCategory } from '../../../lib/dayEvents';
import { useEventStore } from '../../../store/eventStore';
import { usePetStore } from '../../../store/petStore';
import { useSyncStore } from '../../../store/syncStore';
import { Card } from '../../ui/Card';
import { SectionLabel } from '../../ui/SectionLabel';
import { SkeletonRows } from '../../ui/Skeleton';
import { ThemedText } from '../../ui/ThemedText';
import { LookHeader } from './LookHeader';
import { Spine } from './Spine';

/** The quiet day (Principle 5) — says what to do, without a nudge. `nyx-voice`: plain,
 *  warm, no exclamation, no claim about how she is. The last sentence rides only when
 *  the look is on the card. */
export const TODAY_EMPTY_LINE = 'Nothing logged yet today. Meals, symptoms and medication go in with the + button.';
export const TODAY_EMPTY_LOOK_LINE = 'The look above is enough to start.';
export const TODAY_FAILED_LINE = 'Couldn’t read today’s log.';
export const TODAY_RETRY = 'Try again';

interface Props {
  trialNotEating?: boolean | null;
  /** The look header's position, for Home's pinned exits (T-21). */
  onLookLayout?: (e: LayoutChangeEvent) => void;
  /** Overridable navigation for the spine's rows. */
  onOpenEvent?: (id: string) => void;
}

interface Facts {
  petId: string;
  photographed: Set<string>;
  feedings: FeedingRow[];
  freeFedSpans: FreeFedSpan[];
}

export function TodayCard({ trialNotEating = null, onLookLayout, onOpenEvent }: Props) {
  const activePet = usePetStore((s) => s.activePet);
  const petId = activePet?.id ?? null;
  const { todayEvents, loadTodayEvents } = useEvents();
  const todayRead = useEventStore((s) => s.todayRead);
  const hydrationTick = useSyncStore((s) => s.hydrationTick);

  // The local day's start, once per mount (TodayZone's guard against a backdated row
  // the optimistic prepend put in the store).
  const dayStartMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const rows = useMemo(
    () =>
      todayEvents.filter(
        (e) => e.pet_id === petId && Date.parse(e.occurred_at) >= dayStartMs,
      ),
    [todayEvents, petId, dayStartMs],
  );
  // The ids that can carry a read: photographed symptoms. Read as a stable key so the
  // effects below re-run on a change in the SET, not on every store reference.
  const symptomIds = useMemo(
    () => rows.filter((e) => eventTintCategory(e.event_type) === 'symptom').map((e) => e.id).sort(),
    [rows],
  );
  const rowKey = useMemo(() => rows.map((e) => e.id).sort().join('|'), [rows]);

  const [facts, setFacts] = useState<Facts | null>(null);
  const [analysis, setAnalysis] = useState<Map<string, SpineAnalysisRow>>(() => new Map());
  const [working, setWorking] = useState<Set<string>>(() => new Set());
  const activePetIdRef = useRef<string | null>(null);
  activePetIdRef.current = petId;

  // ── The local facts: photos, feedings, spans ─────────────────────────────────
  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    const ids = rowKey ? rowKey.split('|') : [];
    const since = new Date(dayStartMs - DEFAULT_MEAL_TIMING_CONFIG.feedingLookbackHours * 3_600_000).toISOString();
    Promise.all([readPhotographedIds(ids), readFeedingsSince(petId, since), readFreeFedSpans(petId)])
      .then(([photographed, feedings, freeFedSpans]) => {
        if (cancelled || activePetIdRef.current !== petId) return;
        setFacts({ petId, photographed, feedings, freeFedSpans });
      })
      .catch((e) => console.warn('[TodayCard] facts read failed:', e));
    return () => {
      cancelled = true;
    };
  }, [petId, rowKey, dayStartMs, hydrationTick]);

  // ── The reads, observed ───────────────────────────────────────────────────────
  const photographedSymptoms = useMemo(() => {
    if (!facts || facts.petId !== petId) return [];
    return symptomIds.filter((id) => facts.photographed.has(id));
  }, [facts, petId, symptomIds]);
  const photographedKey = photographedSymptoms.join('|');

  const refreshAnalysis = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setAnalysis(new Map());
      return;
    }
    const next = await readAnalysisRows(ids);
    if (activePetIdRef.current !== petId) return;
    setAnalysis(next);
  }, [petId]);

  useEffect(() => {
    const ids = photographedKey ? photographedKey.split('|') : [];
    let cancelled = false;
    void refreshAnalysis(ids);
    // The working fact per row (C-30), and the settle that re-reads.
    const outstanding = ids.filter((id) => analysisChainOutstanding(id));
    setWorking(new Set(outstanding));
    for (const id of outstanding) {
      void awaitAnalysisChain(id).then(() => {
        if (cancelled) return;
        setWorking((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        void refreshAnalysis(ids);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photographedKey, refreshAnalysis, hydrationTick]);

  // A row the server left at `pending` — watched as the sections watch it, then re-read.
  useEffect(() => {
    const pendingIds = [...analysis.values()].filter((r) => r.status === 'pending').map((r) => r.event_id);
    if (pendingIds.length === 0) return;
    const ids = photographedKey ? photographedKey.split('|') : [];
    const teardowns = pendingIds.map((id) =>
      watchAnalysisRow(
        id,
        async () => {
          const next = await readAnalysisRows([id]);
          const row = next.get(id);
          if (row && row.status !== 'pending') {
            void refreshAnalysis(ids);
            return true;
          }
          return false;
        },
        () => {},
      ),
    );
    return () => teardowns.forEach((t) => t());
  }, [analysis, photographedKey, refreshAnalysis]);

  const model = useMemo(
    () =>
      buildSpine({
        rows,
        photographed: facts && facts.petId === petId ? facts.photographed : new Set(),
        analysis,
        working,
        feedings: facts && facts.petId === petId ? facts.feedings : [],
        freeFedSpans: facts && facts.petId === petId ? facts.freeFedSpans : [],
      }),
    [rows, facts, petId, analysis, working],
  );

  const readState: 'loading' | 'ready' | 'failed' =
    todayRead && todayRead.petId === petId ? todayRead.state : 'loading';
  const line = countLine(model);

  return (
    <Card testID="today-card">
      <SectionLabel label="Today" header />
      <LookHeader trialNotEating={trialNotEating} onLayout={onLookLayout} />

      {readState === 'loading' ? (
        <SkeletonRows count={3} leadingSize={11} paddingHorizontal={0} separator={false} />
      ) : readState === 'failed' ? (
        <View style={styles.failed} testID="today-failed">
          <ThemedText style={styles.failedText}>{TODAY_FAILED_LINE}</ThemedText>
          <Pressable
            onPress={() => void loadTodayEvents()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={TODAY_RETRY}
            style={styles.retry}
          >
            <ThemedText style={styles.retryText}>{TODAY_RETRY}</ThemedText>
          </Pressable>
        </View>
      ) : model.nodes.length === 0 ? (
        <ThemedText style={styles.empty} testID="today-empty">
          {TODAY_EMPTY_LINE}
          <LookTail />
        </ThemedText>
      ) : (
        <>
          {line ? (
            <ThemedText style={styles.count} testID="today-count-line">
              <ThemedText style={styles.countNum}>{model.total}</ThemedText>
              {line.slice(String(model.total).length)}
            </ThemedText>
          ) : null}
          <Spine nodes={model.nodes} onOpen={onOpenEvent} />
        </>
      )}
    </Card>
  );
}

/** The empty line's last sentence, only when the look is on the card. Reads the same
 *  gate the header does so the sentence cannot point at a header that is not there. */
function LookTail() {
  const activePet = usePetStore((s) => s.activePet);
  const species = activePet?.species;
  // The header renders for cats and dogs on the rollout; `other` has no vocabulary. The
  // flag halves are the header's own reads; here the species is the one fact that can
  // make the sentence a lie on its own, so it is the one checked.
  if (species !== 'cat' && species !== 'dog') return null;
  return <ThemedText> {TODAY_EMPTY_LOOK_LINE}</ThemedText>;
}

/** Overridable so a test opens a row without a router. */
export function openEvent(id: string): void {
  router.push({ pathname: '/event/[id]', params: { id } });
}

const styles = StyleSheet.create({
  count: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space1,
  },
  countNum: { fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  empty: {
    marginTop: theme.space1,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  failed: { marginTop: theme.space1, gap: theme.space0_5 },
  failedText: { fontSize: theme.textMD, color: theme.colorTextSecondary, lineHeight: theme.lineHeightBody },
  // 28 + 2 × the 8pt slop = the 44pt floor (C-5), spelled out as the chips do.
  retry: { alignSelf: 'flex-start', paddingVertical: theme.space1, minHeight: 44 - 16, justifyContent: 'center' },
  retryText: { fontSize: theme.textSM, fontWeight: theme.weightMedium, color: theme.colorAccentInk },
});
