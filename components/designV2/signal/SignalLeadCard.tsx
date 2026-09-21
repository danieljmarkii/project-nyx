import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { useSyncStore } from '../../../store/syncStore';
import type { CachedFinding, PriorityClass, SignalFinding } from '../../../lib/signal';
import { foldIdentity } from '../../../lib/signalFold';
import { loadSignalLead, type SignalLeadModel } from '../../../lib/signalLead';
import { WeeklyBars } from '../../charts/WeeklyBars';
import { DOOR_A11Y_HINT, InsightCard, RAIL_WIDTH } from '../../home/InsightCard';
import { Skeleton } from '../../ui/Skeleton';
import { ThemedText } from '../../ui/ThemedText';

// SignalLeadCard — the Signal card on Home under Design v2 (D2-3 · CUL-1065; design
// authority `docs/culprit-design-v4-mockups.html` §01): a title, a chart and one line.
//
//   Vomiting, day 55 of the rabbit trial       ← the title names the thing and the window
//   [ the weekly bars, a count on every week ]  ← `WeeklyBars`, over `signalWeeks`
//   2 this week so far · 3 last week            ← `weekLine`, read off the same buckets
//
// THE FACE IS A DOOR. One `Pressable`, one verb: it opens the Signal's own screen and
// never folds, never expands (the fold spec §3's face tap, amended on round 3 — the
// control moved to the screen and the strip). No control row, no chevron in the words.
//
// S1 HOLDS: a SAFETY finding does not take this canvas. It renders the shipped plain-text
// `InsightCard` — sentence, rail, sample line — with the same door (`onOpen`), so as the
// benign lead gains a chart, plainness stays the severity signal. The rail here is the
// class colour as on every Signal row; this component never paints a verdict word.
//
// THE READ IS THIS COMPONENT'S. It lives inside `components/designV2/`, so with the flag
// off it is never mounted and the record is never read for it — the async half of the
// flag-off guard, proven in `SignalLeadCard.test.tsx` by the zone's own suite. While the
// read is in flight the card is a content-shaped skeleton (C-12: a read that has not
// answered is never an empty chart); a read that fails falls back to the shipped card,
// which draws from the cache alone — correct-but-plain over confidently blank.

const RAIL_COLOR: Record<PriorityClass, string> = {
  safety: theme.colorEventSymptom,
  insight: theme.colorAccent,
};

interface Props {
  cached: CachedFinding;
  /** The pet the findings belong to (C-9) — the zone's `petId`, never the store's active pet. */
  petId: string;
  petName: string;
  onOpen: (finding: SignalFinding) => void;
  /** The shipped card's props for the safety branch and the fallback. */
  trialRunning?: boolean;
  backBecause?: Parameters<typeof InsightCard>[0]['backBecause'];
  onTouch?: (finding: SignalFinding) => void;
}

type Load = { status: 'loading' } | { status: 'ready'; model: SignalLeadModel } | { status: 'failed' };

export function SignalLeadCard({ cached, petId, petName, onOpen, trialRunning = false, backBecause = null, onTouch }: Props) {
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const signalTick = useSyncStore((s) => s.signalTick);
  const identity = foldIdentity(cached.finding);
  const safety = cached.finding.priorityClass === 'safety';
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    if (safety) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadSignalLead(petId, cached)
      .then((model) => {
        if (!cancelled) setLoad({ status: 'ready', model });
      })
      .catch((e) => {
        console.warn('[signal-lead] load failed:', e);
        if (!cancelled) setLoad({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
    // The finding's content, not the cached object's identity: a re-read that produced
    // the same payload must not redraw the chart under the owner's eyes (C-30).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, identity, JSON.stringify(cached.finding), hydrationTick, signalTick, safety]);

  // S1: a safety lead is the shipped plain card, with the door. The fallback is the same.
  if (safety || load.status === 'failed') {
    return (
      <InsightCard
        cached={cached}
        petName={petName}
        isLead
        trialRunning={trialRunning}
        onOpen={onOpen}
        backBecause={backBecause}
        onTouch={onTouch}
      />
    );
  }

  const rail = RAIL_COLOR[cached.finding.priorityClass];

  if (load.status === 'loading') {
    return (
      <View style={styles.row} testID="signal-lead-skeleton">
        <View style={[styles.rail, { backgroundColor: rail }]} />
        <View style={styles.content} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Skeleton width="80%" height={theme.lineHeightSignal - 8} radius={theme.radiusSmall} />
          <Skeleton height={72} radius={theme.radiusSmall} style={styles.skeletonChart} />
          <Skeleton width="55%" height={theme.textSM} />
        </View>
      </View>
    );
  }

  const { model } = load;
  const label = model.line ? `${model.title}. ${model.line}.` : `${model.title}.`;
  return (
    <View style={styles.row} testID="signal-lead-card">
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <Pressable
        onPress={() => {
          onTouch?.(cached.finding);
          onOpen(cached.finding);
        }}
        hitSlop={FACE_HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={DOOR_A11Y_HINT}
        style={styles.content}
        testID="signal-lead-face"
      >
        {/* The title in the display face: Newsreader at the Signal size, weight 400 (the only
            face loaded — never a fontWeight here; the explicit family wins in ThemedText). */}
        <ThemedText style={styles.title} testID="signal-lead-title">
          {model.title}
        </ThemedText>
        {model.weekly && model.noun ? (
          <View style={styles.chart}>
            <WeeklyBars model={model.weekly} noun={model.noun} identity={identity} />
          </View>
        ) : null}
        {model.line ? (
          <ThemedText style={styles.line} testID="signal-lead-line">
            {model.line}
          </ThemedText>
        ) : null}
      </Pressable>
    </View>
  );
}

/** The shipped face's slop: reaches up and sideways, never down into the next row. */
const FACE_HITSLOP = { top: 8, left: 8, right: 8, bottom: 0 } as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.space2,
    minHeight: 44,
    paddingVertical: theme.space2,
  },
  rail: {
    width: RAIL_WIDTH,
    borderRadius: 2,
    opacity: 0.85,
  },
  content: {
    flex: 1,
    gap: theme.space1,
  },
  // The shipped lead sentence's face (`InsightCard`'s `sentenceLead`), on the title now.
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  chart: {
    marginTop: theme.space0_5,
  },
  line: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
  },
  skeletonChart: {
    marginVertical: theme.space0_5,
  },
});
