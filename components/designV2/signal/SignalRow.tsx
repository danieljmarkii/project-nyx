import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../constants/theme';
import type { CachedFinding, PriorityClass, ReflectionFinding, SignalFinding } from '../../../lib/signal';
import { backBecauseCopy, type CompareRow, dotLaneModel, isTimingFinding, stripDayLocal, timingCompareRows, timingReceiptDegrades } from '../../../lib/signalCopy';
import type { BackBecauseReason } from '../../../lib/signalFold';
import { askStandalone, signalHomeLabel, signalHomeLine } from '../../../lib/signalHomeLine';
import { loadSignalRowTrial } from '../../../lib/signalLead';
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
// THE ROW IS A DOOR. One `Pressable`, one verb: it opens the finding's own screen, folded
// or not. It never folds and never expands (the fold spec's face tap; the fold control is
// the screen's). The chevron is what makes a lower card LOOK like a door — the PM's device
// reaction was that nothing below the lead did.
//
// S1 HOLDS, AND IS STRUCTURAL HERE: a safety row never draws a thumbnail — the branch that
// draws one is guarded on `priorityClass === 'insight'` and `SignalRow.test.tsx` asserts no
// chart node on every safety type. Plain means words, not length: a safety row is the
// headline and the ask, and the full sentence lives on the finding's screen.
//
// THE ASK NEVER GOES BEHIND A TAP. A safety row prints its ask whether or not it is folded
// (clinical-guardrails), in the symptom ink, and its spoken label carries it too.
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
  /** The reader compacted this card from its screen: the headline and the ask only. */
  folded?: boolean;
  /** Present when the RECORD re-opened this card (DF-8): the one line that says why. */
  backBecause?: BackBecauseReason | null;
  /** Any owner touch clears a Back-because line (fold spec §5.3). */
  onTouch?: (finding: SignalFinding) => void;
  /** The record's most recent episode of this finding's symptom (fold spec §3.4) — a folded
   *  STANDING safety row keeps its date, a DATE and never a counter. Null / absent: no date. */
  lastEpisodeIso?: string | null;
}

export function SignalRow({ cached, petId, onOpen, isLead = false, folded = false, backBecause = null, onTouch, lastEpisodeIso = null }: Props) {
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

  const line = signalHomeLine(finding, trial);
  if (!line) return null;

  const safety = finding.priorityClass === 'safety';
  const backLine = backBecause ? backBecauseCopy(backBecause) : null;
  // Folded, a safety row keeps what the fold spec keeps on a safety strip: its ask, its date
  // (the photo read's eyebrow; a standing concern's last episode, from the record). A worried
  // owner coming back sees when it last happened, not only that it recurs.
  const lastDay = folded && safety && lastEpisodeIso ? stripDayLocal(lastEpisodeIso) : null;
  const showEyebrow = line.eyebrow != null && (!folded || safety);
  // An open frequency row whose pair renders prints its counts in the pair, not twice (S10).
  const pairDrawn = !folded && finding.type === 'reflection' && weekPairOf(finding) != null;
  const subCount = folded ? (lastDay ? `Last episode ${lastDay.short}` : null) : pairDrawn ? null : line.count;
  let label = signalHomeLabel({ ...line, eyebrow: showEyebrow ? line.eyebrow : null }, folded, lastDay ? lastDay.spoken : null);
  if (backLine) label = `${backLine} ${label}`;
  const thumbnail = !safety && !folded ? <Thumbnail finding={finding} /> : null;

  const open = () => {
    onTouch?.(finding);
    onOpen(finding);
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={DOOR_A11Y_HINT}
      style={folded ? [styles.row, styles.rowFolded] : styles.row}
      testID="signal-row"
    >
      <View style={[styles.rail, { backgroundColor: RAIL_COLOR[finding.priorityClass] }]} />
      <View style={styles.body}>
        {backLine ? <ThemedText style={styles.backBecause}>{backLine}</ThemedText> : null}
        {showEyebrow ? (
          <ThemedText style={styles.eyebrow} testID="signal-row-eyebrow">
            {line.eyebrow}
          </ThemedText>
        ) : null}
        <ThemedText style={isLead && !folded ? styles.headlineLead : styles.headline} testID="signal-row-headline">
          {line.headline}
        </ThemedText>
        {thumbnail}
        <SubLine count={subCount} ask={line.ask} />
      </View>
      <View style={isLead && !folded ? styles.chevronLead : styles.chevronBox}>
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
function Thumbnail({ finding }: { finding: SignalFinding }) {
  if (finding.priorityClass !== 'insight') return null;
  if (isTimingFinding(finding)) {
    return (
      <View style={styles.thumb} testID="signal-row-thumb-lane" accessible={false}>
        {timingReceiptDegrades(finding) ? <StackedCompare rows={timingCompareRows(finding)} /> : <DotLane model={dotLaneModel(finding)} />}
      </View>
    );
  }
  if (finding.type === 'reflection') return <WeekPair finding={finding} />;
  return null;
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
function WeekPair({ finding }: { finding: ReflectionFinding }) {
  const rows = weekPairOf(finding);
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
  rowFolded: {
    paddingVertical: theme.space0_5,
  },
  rail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    borderRadius: 2,
    opacity: 0.85,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  backBecause: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightXS,
    color: theme.colorTextSecondary,
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
