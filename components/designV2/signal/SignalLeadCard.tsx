import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../constants/theme';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { measureNodeInWindow } from '../../../lib/measureNode';
import { useSyncStore } from '../../../store/syncStore';
import type { CachedFinding, PriorityClass, SignalFinding } from '../../../lib/signal';
import { foldIdentity } from '../../../lib/signalFold';
import { loadSignalLead, type SignalLeadModel } from '../../../lib/signalLead';
import { WeeklyBars } from '../../charts/WeeklyBars';
import { RAIL_WIDTH } from '../../home/InsightCard';
import { FLIGHT_ENABLED, FLIGHT_MOTION, flightActiveFor, retargetSource, stageFlight, useFlightState } from '../../motion/flightMotion';
import { Skeleton } from '../../ui/Skeleton';
import { ThemedText } from '../../ui/ThemedText';
import { DOOR_A11Y_HINT, SignalRow } from './SignalRow';

// SignalLeadCard — the Signal card on Home under Design v2 (D2-3 · CUL-1065; design
// authority `docs/culprit-design-v4-mockups.html` §01): a title, a chart and one line.
//
//   Vomiting, day 55 of the rabbit trial       ← the title names the thing and the window
//   [ the weekly bars, a count on every week ]  ← `WeeklyBars`, over `signalWeeks`
//   2 this week so far · 3 last week            ← `weekLine`, read off the same buckets
//
// THE FACE IS A DOOR. One `Pressable`, one verb: it opens the Signal's own screen and
// never expands. No control row; the chevron sits beside the title (CUL-1270). There is no
// fold under Design v2 (CUL-1285).
//
// S1 HOLDS: a SAFETY finding does not take this canvas. It renders the Signal row
// (`SignalRow`, CUL-1270) — the headline and the ask in words, no chart — with the same
// door, so as the benign lead gains a chart, plainness stays the severity signal. The rail
// here is the class colour as on every Signal row; this component never paints a verdict
// word. The zone routes a safety lead to the row directly; this branch is the backstop.
//
// THE READ IS THIS COMPONENT'S. It lives inside `components/designV2/`, so with the flag
// off it is never mounted and the record is never read for it — the async half of the
// flag-off guard, proven in `SignalLeadCard.test.tsx` by the zone's own suite. While the
// read is in flight the card is a content-shaped skeleton (C-12: a read that has not
// answered is never an empty chart); a read that fails falls back to the Signal row,
// which draws from the cache alone — correct-but-plain over confidently blank.
//
// THE FLIGHT (D2-6 · CUL-1069, `components/motion/flightMotion.ts`): the door measures the
// chart in window coordinates first, stages the flight with the chart's own element, and
// only then opens — so the clone is on screen at the chart's place before the push. While
// a flight is live for this finding the chart is hidden (the clone IS the chart); on the
// way back it re-measures so the clone lands where the chart is now. A measurement the
// platform declines, reduced motion, a chartless card or the kill switch off: the plain
// door, D2-3's rise.

/**
 * The chart's width on Home, from the window's: the page's padding (`app/(tabs)/index.tsx`
 * `styles.scroll`), the zone's `Card` padding, the rail and the row's gap. The screen's
 * hero is this layout scaled (one aspect for both charts — the flight's contract), so the
 * formula lives here with the card that owns the layout, and `SignalLeadCard.test.tsx`
 * pins every term against the rendered styles.
 */
export const LEAD_CHART_INSETS = {
  pagePadding: theme.space3,
  cardPadding: theme.space3,
  rail: RAIL_WIDTH,
  rowGap: theme.space2,
} as const;
export function leadChartWidth(windowWidth: number): number {
  const { pagePadding, cardPadding, rail, rowGap } = LEAD_CHART_INSETS;
  return windowWidth - 2 * pagePadding - 2 * cardPadding - rail - rowGap;
}

const RAIL_COLOR: Record<PriorityClass, string> = {
  safety: theme.colorEventSymptom,
  insight: theme.colorAccent,
};

interface Props {
  cached: CachedFinding;
  /** The pet the findings belong to (C-9) — the zone's `petId`, never the store's active pet. */
  petId: string;
  onOpen: (finding: SignalFinding) => void;
}

type Load = { status: 'loading' } | { status: 'ready'; model: SignalLeadModel } | { status: 'failed' };

export function SignalLeadCard({ cached, petId, onOpen }: Props) {
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const signalTick = useSyncStore((s) => s.signalTick);
  const identity = foldIdentity(cached.finding);
  const safety = cached.finding.priorityClass === 'safety';
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const reducedMotion = useReducedMotion();
  const flightState = useFlightState();
  const flightLive = flightActiveFor(flightState, identity);
  const chartRef = useRef<View>(null);

  // On the way back the chart may not be where it was (a re-ranked Home, a scroll): tell
  // the inbound clone where to land. Twice — once now, once after the ground has faded in,
  // when a screen the navigator had detached is measurable again. Zeros are declined.
  const inbound = flightState.phase === 'inbound' && flightState.flight?.identity === identity;
  useEffect(() => {
    if (!inbound) return;
    let cancelled = false;
    const attempt = () =>
      measureNodeInWindow(chartRef.current, (rect) => {
        if (!cancelled && rect && rect.width > 0 && rect.height > 0) retargetSource(identity, rect);
      });
    const t1 = setTimeout(attempt, 0);
    const t2 = setTimeout(attempt, FLIGHT_MOTION.groundMs);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [inbound, identity]);

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

  // S1: a safety lead is the plain row, with the door. The fallback is the same.
  if (safety || load.status === 'failed') {
    return <SignalRow cached={cached} petId={petId} onOpen={onOpen} isLead />;
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
  const chart = model.weekly && model.noun ? <WeeklyBars model={model.weekly} noun={model.noun} identity={identity} /> : null;
  const open = () => onOpen(cached.finding);
  const press = () => {
    if (!FLIGHT_ENABLED || reducedMotion || !chart) {
      open();
      return;
    }
    measureNodeInWindow(chartRef.current, (rect) => {
      if (rect && rect.width > 0 && rect.height > 0) {
        stageFlight({ identity, title: model.title, source: rect, element: chart });
      }
      open();
    });
  };
  return (
    <View style={styles.row} testID="signal-lead-card">
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <Pressable
        onPress={press}
        hitSlop={FACE_HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={DOOR_A11Y_HINT}
        style={styles.content}
        testID="signal-lead-face"
      >
        {/* The title in the display face: Newsreader at the Signal size, weight 400 (the only
            face loaded — never a fontWeight here; the explicit family wins in ThemedText). */}
        {/* The chevron sits beside the title (CUL-1270: every card looks like the door it
            is), never beside the chart — the chart's width is the flight's contract. */}
        <View style={styles.titleRow}>
          <ThemedText style={styles.title} testID="signal-lead-title">
            {model.title}
          </ThemedText>
          <View style={styles.chevronBox}>
            {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
            <Text style={styles.chevron}>›</Text>
          </View>
        </View>
        {chart ? (
          <View style={styles.chart}>
            {/* The measured node: the chart's own box, no margin — the same box the screen's
                hero slot reproduces. `collapsable={false}` so the view exists natively. */}
            <View ref={chartRef} collapsable={false} style={flightLive ? styles.chartHidden : undefined} testID="signal-lead-chart">
              {chart}
            </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
  },
  chevronBox: {
    width: 28,
    height: 28,
    marginTop: (theme.lineHeightSignal - 28) / 2,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorSurfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: theme.textLG,
    lineHeight: theme.textLG + 2,
    color: theme.colorTextTertiary,
  },
  // The shipped lead sentence's face (`InsightCard`'s `sentenceLead`), on the title now.
  title: {
    flex: 1,
    fontFamily: theme.fontDisplay,
    fontSize: theme.textSignal,
    lineHeight: theme.lineHeightSignal,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  chart: {
    marginTop: theme.space0_5,
  },
  chartHidden: {
    opacity: 0,
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
