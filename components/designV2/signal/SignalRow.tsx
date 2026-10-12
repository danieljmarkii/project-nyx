import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../constants/theme';
import type { CachedFinding, PriorityClass, ReflectionFinding, SignalFinding } from '../../../lib/signal';
import { type CompareRow, dotLaneModel, isTimingFinding, symptomWord, timingCompareRows, timingReceiptDegrades } from '../../../lib/signalCopy';
import { askStandalone, rowReadsScreen, signalHomeLabel, trialSoFarClause, signalHomeLine, signalHomeLineFromScreen } from '../../../lib/signalHomeLine';
import { countedHomePair } from '../../../lib/signalCounts';
import { foldIdentity } from '../../../lib/signalFold';
import { CARE_WATCHED_LINE, CARE_WATCHED_TAG, careBackLine, careStateBody, careStateViewOf, type CareStateView } from '../../../lib/careState';
import { loadSignalRowScreen, loadSignalRowTrial, type SignalRowScreen } from '../../../lib/signalLead';
import { useSyncStore } from '../../../store/syncStore';
import { useMinuteNow } from '../../../hooks/useIncidentFloorFacts';
import { signalTrialWindowFor } from '../../../lib/signalTrialAnchor';
import type { SignalTrialWindow } from '../../../lib/signalWindows';
import { DotLane, StackedCompare } from '../../home/SignalReceipts';
import { RAIL_WIDTH } from '../../home/InsightCard';
import { ThemedText } from '../../ui/ThemedText';

// SignalRow — one Signal finding on Home under Design v2 (CUL-1270 · D1 = B; design
// authority `docs/culprit-design-v2-device-mockups.html` §01, "The ruled design (B)").
//
//   PHOTO READ · SEP 22                                  ← the eyebrow (the photo read only)
//   Possible foreign material in a vomit photo       ›   ← the headline = the screen's title
//   Worth a call to your vet                             ← the ask, in words, on Home
//
//   Vomiting soon after meals                        ›
//   [ the timing lane, miniature ]                       ← insight rows only (never safety)
//   9 of 10 timed episodes within 30 min of eating
//
// THE ROW IS A DOOR. One `Pressable`, one verb: it opens the finding's own screen, and
// never expands. The chevron is what makes a lower card LOOK like a door — the PM's device
// reaction was that nothing below the lead did.
//
// THERE IS NO FOLD ON HOME (CUL-1285, PM-ruled 2026-09-26): every card is already a row,
// so "Keep it compact" had almost nothing left to compact and no mark on Home to say it
// had. Home's fold was deleted with the pre-redesign surface at Design v2's GA (CUL-1071).
//
// S1 HOLDS, AND IS STRUCTURAL HERE: a safety row never draws a thumbnail — the branch that
// draws one is guarded on `priorityClass === 'insight'` and `SignalRow.test.tsx` asserts no
// chart node on every safety type. Plain means words, not length: a safety row is the
// headline and the ask, and the full sentence lives on the finding's screen.
//
// THE ASK NEVER GOES BEHIND A TAP. A safety row always prints its ask (clinical-guardrails),
// in the symptom ink, and its spoken label carries it too.
//
// THE THUMBNAIL IS DRAWN FROM THE FINDING, not from a second read of the record, so the
// picture and the line beside it can never disagree (the PM's ruling on CUL-1270, build
// call i): the timing lane from `dotLaneModel` (the shipped card-face receipt, degrading to
// its compare above the legibility cap), and for the frequency comparison the shipped
// Shape C pair from `currentCount` / `priorCount` — absent when the density gate withholds
// the prior (S2: never a numerator-only visual). Every other type is words only.
//
// Touch geometry (C-5): rows are stacked between hairlines, so the row's own box — its
// padding included — is the whole target and carries NO slop: two adjacent doors abut and
// never overlap, and the 44pt floor is the row's `minHeight`.

const RAIL_COLOR: Record<PriorityClass, string> = {
  safety: theme.colorEventSymptom,
  insight: theme.colorAccent,
};

/** A Signal door's hint (the rows and the lead card), told apart from the shipped card's
 *  "Shows the evidence…". */
export const DOOR_A11Y_HINT = 'Opens this signal';

/** The row's floor: every door clears 44pt on its own box, with no slop to share. */
export const ROW_MIN_HEIGHT = 44;

interface Props {
  cached: CachedFinding;
  /** The pet the finding belongs to (C-9) — the zone's `petId`, never the active pet. */
  petId: string;
  onOpen: (finding: SignalFinding) => void;
  /** The top card of the zone: the headline takes the display face. */
  isLead?: boolean;
  /** The cache row's `generated_at` (CUL-1360): with the local trial, it says whether a trial
   *  finding counted THIS trial. Required, so a row can never title an older trial's finding
   *  with the running trial's name by leaving it out; null only when the row carried none. */
  generatedAt: string | null;
}

export function SignalRow({ cached, petId, onOpen, isLead = false, generatedAt }: Props) {
  const { finding } = cached;
  // The trial card names the local trial's identity and day, as its screen does; every
  // other claim is the same claim on a trial day, so no other row reads it.
  const [trial, setTrial] = useState<SignalTrialWindow | null>(null);
  const namesTrial = finding.type === 'trial_response';
  useEffect(() => {
    if (!namesTrial) return;
    let cancelled = false;
    // `loadSignalRowTrial` never rejects: a failed read resolves null and is logged there.
    void loadSignalRowTrial(petId).then((t) => {
      if (!cancelled) setTrial(t);
    });
    return () => {
      cancelled = true;
    };
  }, [namesTrial, petId]);

  // GC-4 PR 2 (CUL-1569): a row whose screen restates the finding from the record reads that
  // screen's own model — the loader the door opens — so the row and the screen state one count.
  // `undefined` while the read is in flight, null when it answered with no screen to match.
  // The answer is KEYED to the finding it answers (the code review): a re-ranked row, a regen or
  // a pet switch renders a frame before the effect re-reads, and an unkeyed answer would pair
  // the new finding's ask with the old finding's numbers for that frame.
  const [answer, setAnswer] = useState<{ key: string; screen: SignalRowScreen } | null>(null);
  const readsScreen = rowReadsScreen(finding);
  const identity = foldIdentity(finding);
  const readKey = `${petId}|${identity}|${generatedAt ?? ''}`;
  // A log, a sync or a regen re-reads the record, as the lead card does (the adversarial pass
  // on #1053: offline logs that turn a fall into a rise must not leave a stale falling pair).
  // A tick re-read keeps the answer on screen while it runs, so nothing redraws for nothing (C-30).
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  const nowMs = useMinuteNow();
  const signalTick = useSyncStore((s) => s.signalTick);
  useEffect(() => {
    if (!readsScreen) return;
    let cancelled = false;
    // `loadSignalRowScreen` never rejects: a failed read resolves null and is logged there.
    void loadSignalRowScreen(petId, finding).then((m) => {
      if (!cancelled) setAnswer({ key: readKey, screen: m });
    });
    return () => {
      cancelled = true;
    };
  }, [readsScreen, readKey, hydrationTick, signalTick]);
  const screen: SignalRowScreen | undefined = answer?.key === readKey ? answer.screen : undefined;

  // A trial finding counted over a trial since replaced speaks in its own day (CUL-1360).
  // PR-30c (CUL-1739): a call now steps to its dated form a day after its read, on the minute.
  const base = signalHomeLine(finding, signalTrialWindowFor(finding, { generatedAt, trial }), nowMs);
  if (!base) return null;
  // While the screen's read is in flight, or when it did not answer, a safety row keeps the
  // finding's own words (the ask never waits on a read, and no safety type is ever set aside);
  // an insight row holds its count and pair back — in flight, because the number may change
  // under the owner's eye (C-12); unanswered, because the masking rule fails closed and the row
  // cannot know a falling pair is safe to print. A screen that SETS THE FINDING ASIDE (a
  // masking span beside a compared window, CUL-1440) states no comparing count, so the row
  // states none either, keeping only a risen trial's count the screen keeps. Home has no
  // masking rule of its own, so this is the only place the row learns it (the adversarial
  // passes on #1053).
  const ready = readsScreen && screen?.kind === 'ready' ? screen : null;
  const quietInsight = readsScreen && (screen === undefined || screen.kind === 'unanswered') && finding.priorityClass !== 'safety';
  const setAside = readsScreen && screen?.kind === 'set_aside' ? screen : null;
  const line = ready
    ? signalHomeLineFromScreen(finding, base, ready)
    : setAside
      ? { ...base, count: setAside.keptLine }
      : quietInsight
        ? {
            ...base,
            // A rising trial card keeps its trial count on a read that did not answer: the card
            // reached Home because the contrast moved, and a bare "day 14 of 56" would read as
            // routine (C-37). The count is trial-only and compares nothing, so it stays true even
            // where the screen, had it answered, would have set the pair aside (a masked trial
            // whose calendar-day rate sits under the baseline's). In flight it waits (C-12).
            count:
              screen?.kind === 'unanswered' && finding.type === 'trial_response' && finding.comparisonDirection === 'more_during_trial'
                ? trialSoFarClause(finding)
                : null,
          }
        : base;

  // EN-9 (PR-35): a concern the owner answered is drawn as what it now is. Display only:
  // the row stays one door and writes nothing (Home's three write classes, C-33).
  const care = careStateViewOf(finding);
  if (care && (care.state === 'with_vet' || care.state === 'recheck_booked')) {
    return <WatchedRow care={care} onOpen={() => onOpen(finding)} isLead={isLead} />;
  }
  const backLine = care ? careBackLine(care) : null;

  const safety = finding.priorityClass === 'safety';
  // A frequency row whose pair renders prints its counts in the pair, not twice (S10).
  const pair = finding.type === 'reflection' && !quietInsight && !setAside ? rowPairOf(finding, ready) : null;
  const subCount = pair ? null : line.count;
  const thumbnail = safety ? null : <Thumbnail finding={finding} pair={pair} />;

  return (
    <Pressable
      onPress={() => onOpen(finding)}
      accessibilityRole="button"
      accessibilityLabel={backLine ? `${backLine} ${signalHomeLabel(line)}` : signalHomeLabel(line)}
      accessibilityHint={DOOR_A11Y_HINT}
      style={styles.row}
      testID="signal-row"
    >
      <View style={[styles.rail, { backgroundColor: RAIL_COLOR[finding.priorityClass] }]} />
      <View style={styles.body}>
        {backLine ? (
          <ThemedText style={styles.backLine} testID="signal-row-back">
            {backLine}
          </ThemedText>
        ) : null}
        {line.eyebrow ? (
          <ThemedText style={styles.eyebrow} testID="signal-row-eyebrow">
            {line.eyebrow}
          </ThemedText>
        ) : null}
        <ThemedText style={isLead ? styles.headlineLead : styles.headline} testID="signal-row-headline">
          {line.headline}
        </ThemedText>
        {thumbnail}
        <SubLine count={subCount} ask={line.ask} />
      </View>
      <View style={isLead ? styles.chevronLead : styles.chevronBox}>
        {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

/**
 * A concern the owner said the vet knows about (EN-9; mock round 3 §01 1c–1e, ruled D6 on
 * CUL-1440): the "Your vet knows" tag, the sign, the server's sentence (who said what, when,
 * and what has been logged since) and, on `with_vet`, the line saying what the state does.
 * The rail keeps the safety colour, lighter: the finding is still a safety finding (§0.2
 * call 3), and colour never carries the state alone (§7) — the tag says it in words.
 * No ask: the server quiets it, and `signalHomeLine` already drops it for this state.
 */
function WatchedRow({ care, onOpen, isLead }: { care: CareStateView; onOpen: () => void; isLead: boolean }) {
  const sign = symptomWord(care.sign);
  const title = sign.charAt(0).toUpperCase() + sign.slice(1);
  const body = careStateBody(care);
  const tail = care.state === 'with_vet' ? CARE_WATCHED_LINE : null;
  // One sentence, read whole (§7): "Vomiting, your vet knows. {sentence}. {what it does}"
  const label = [`${title}, your vet knows.`, body, tail].filter((x): x is string => !!x).join(' ');
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={DOOR_A11Y_HINT}
      style={styles.row}
      testID="signal-row"
    >
      <View style={[styles.rail, styles.railWatched]} />
      <View style={styles.body}>
        <ThemedText style={styles.careTag} testID="signal-row-care-tag">
          {CARE_WATCHED_TAG}
        </ThemedText>
        <ThemedText style={isLead ? styles.headlineLead : styles.headline} testID="signal-row-headline">
          {title}
        </ThemedText>
        {body ? (
          <ThemedText style={styles.sub} testID="signal-row-care-body">
            {body}
          </ThemedText>
        ) : null}
        {tail ? (
          <ThemedText style={styles.careLine} testID="signal-row-care-line">
            {tail}
          </ThemedText>
        ) : null}
      </View>
      <View style={isLead ? styles.chevronLead : styles.chevronBox}>
        {/* geist-ok: Icon glyph, not copy — stays a raw <Text> (the strips' chevron). */}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

// The count, then the ask. With a count, the ask rides the same line after a middle dot
// ("14 episodes since August · worth booking a vet visit"); alone, it stands on its own line
// with a capital. The ask is its own node either way, in the symptom INK (4.5:1 on the card's
// white — C-1: the bright rose is a glyph tint, never text on a light ground).
function SubLine({ count, ask }: { count: string | null; ask: string | null }) {
  if (count && ask) {
    return (
      <ThemedText style={styles.sub} testID="signal-row-sub">
        {count}
        {' · '}
        <ThemedText style={styles.askInline} testID="signal-row-ask">
          {ask}
        </ThemedText>
      </ThemedText>
    );
  }
  if (ask) {
    return (
      <ThemedText style={styles.askAlone} testID="signal-row-ask">
        {askStandalone(ask)}
      </ThemedText>
    );
  }
  if (count) {
    return (
      <ThemedText style={styles.sub} testID="signal-row-sub">
        {count}
      </ThemedText>
    );
  }
  return null;
}

// The insight row's miniature of the evidence its screen draws. Decorative in context:
// the row is one accessible button whose label already says every number, so the picture
// never self-labels (a label here would be swallowed by the Pressable — SignalReceipts).
function Thumbnail({ finding, pair }: { finding: SignalFinding; pair: CompareRow[] | null }) {
  if (finding.priorityClass !== 'insight') return null;
  if (isTimingFinding(finding)) {
    return (
      <View style={styles.thumb} testID="signal-row-thumb-lane" accessible={false}>
        {timingReceiptDegrades(finding) ? <StackedCompare rows={timingCompareRows(finding)} /> : <DotLane model={dotLaneModel(finding)} />}
      </View>
    );
  }
  if (finding.type === 'reflection') return <WeekPair rows={pair} />;
  return null;
}

/**
 * The reflection row's pair: the screen's composed counts where its sentence was composed
 * (CUL-1569) — the last 7 days and the 7 before, absent wherever the sentence left the
 * earlier window out — else the finding's own pair (`weekPairOf`), as the engine's sentence
 * on that screen states it.
 */
export function rowPairOf(finding: ReflectionFinding, screen: Extract<SignalRowScreen, { kind: 'ready' }> | null): CompareRow[] | null {
  if (screen?.composed) {
    const p = countedHomePair(screen.composed.counts, screen.composed.priorStated);
    return p
      ? [
          { label: 'Last 7 days', count: p.recent, tone: 'concern' },
          { label: '7 before', count: p.prior, tone: 'muted' },
        ]
      : null;
  }
  return weekPairOf(finding);
}

/**
 * The frequency comparison's pair, this week then last — the order its count line and its
 * sentence read in. Null when SR-4's density gate withholds the prior: with no prior there
 * is no pair, and a lone bar would be the numerator-only visual S2 forbids. A flat week
 * prints the engine's own prior beside its current, as the shipped strip always has.
 */
export function weekPairOf(finding: ReflectionFinding): CompareRow[] | null {
  if (finding.direction === 'improving' && finding.density?.comparable === false) return null;
  return [
    { label: 'This week', count: finding.currentCount, tone: 'concern' },
    { label: 'Last week', count: finding.priorCount, tone: 'muted' },
  ];
}

// The pair is the shipped Shape C stacked compare (§4 — Shapes A and C only; both counts
// printed), not a new receipt shape. It prints the counts, so the row does not print them
// again beside it (S10) — they stay in the row's spoken label.
function WeekPair({ rows }: { rows: CompareRow[] | null }) {
  if (!rows) return null;
  return (
    <View style={styles.thumb} testID="signal-row-thumb-pair" accessible={false}>
      <StackedCompare rows={rows} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: theme.space1,
  },
  rail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    borderRadius: 2,
    opacity: 0.85,
  },
  // "Your vet knows": the same rose, lighter. The tag carries the state in words.
  railWatched: {
    backgroundColor: theme.colorEventSymptom,
    opacity: 0.35,
  },
  careTag: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    fontWeight: theme.weightMedium,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorEventSymptomInk,
  },
  careLine: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
  },
  // DF-8's "Back because …" line, above the lane's own headline and ask.
  backLine: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorEventSymptomInk,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    fontWeight: theme.weightMedium,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
  },
  // The lead keeps the display face (Newsreader, weight 400 — the only face loaded),
  // a size down from the lead card's canvas: a door, not a paragraph.
  headlineLead: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG + 2,
    lineHeight: theme.lineHeightBody + 2,
    letterSpacing: theme.trackingTight,
    color: theme.colorTextPrimary,
  },
  headline: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  sub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    fontVariant: ['tabular-nums'],
  },
  askInline: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorEventSymptomInk,
  },
  askAlone: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    fontWeight: theme.weightMedium,
    color: theme.colorEventSymptomInk,
  },
  thumb: {
    marginTop: theme.space0_5,
    marginBottom: 2,
  },
  chevronBox: {
    width: 22,
    alignItems: 'center',
  },
  chevronLead: {
    width: 28,
    height: 28,
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
});
