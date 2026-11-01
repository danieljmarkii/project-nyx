import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { PrimaryButton, Skeleton, ThemedText } from '../ui';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { useReportComposer } from '../../hooks/useReportComposer';
import { DRAW_IN_ORIGIN, useDrawIn } from '../motion/drawInMotion';
import { reducedMotionNow } from '../../store/reducedMotionStore';
import { RangeCalendarSheet } from './RangeCalendarSheet';
import {
  COUNTS_FAILED_LINE,
  COUNTS_INCOMPLETE_LINE,
  WINDOW_LABEL,
  afterDisclosure,
  composerNoteOf,
  countsUpdatedAnnouncement,
  coverageA11yLabel,
  coverageLine,
  emptyNote,
  leadLine,
  liveCardCopy,
  loggedDaysWords,
  openFailedCopy,
  symptomEntriesWords,
  thinNote,
  weightLine,
  windowDatesLine,
  type ComposerCounts,
  type ComposerWindow,
} from '../../lib/reportComposer';

// The composer, b1 to b4 (Vet report v2 PR-16, CUL-2296; spec §10.1, §10.7, §14; round 5 mock
// `docs/culprit-vet-report-v3-mockups.html` §R5.3). The first screen after "Vet report", behind
// `report_composer_v2`: which days should the vet see, answered with counts before anything builds.
//
// ORDER IS THE SAFETY RULE. The live-flag card sits first, above "Which days should the vet see?",
// and it is painted in the composer's first frame or not at all (the hook holds the whole screen on
// one skeleton until the flags and the first counts are both in). Nothing below it can push it: a
// window change only changes what sits under it. No haptic and no motion on the card: it arrives
// with the screen, and a flag is never a moment to celebrate or to animate (Principle 9).
//
// MOTION (§14), every piece lifted from `components/motion/`: the coverage strip draws in ONCE,
// on the first paint (`drawInMotion`, the flow's one chart draw); a window change drops the
// counts to Skeleton in the same commit as the tap and crossfades the new ones in over
// `durationFast` (never counting up); the strip re-fills by that crossfade, never re-draws; the
// date sheet rises by `sheetMotion`. Reduce Motion: everything instant.

interface Props {
  petId: string;
  /** The record's pet (C-9): the screen and every line name this pet, never the active one. */
  petName: string;
  /** Preview the report for the chosen window. `kind` says whether it is one the app chose. */
  onPreview: (w: ComposerWindow) => void;
}

export function ReportComposer({ petId, petName, onPreview }: Props) {
  const insets = useSafeAreaInsets();
  const c = useReportComposer(petId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();

  // The counts crossfade in when a window change lands. The value sits at 1 until then.
  const countsOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (c.landed === 0) return;
    if (reducedMotionNow()) {
      countsOpacity.setValue(1);
    } else {
      countsOpacity.setValue(0);
      Animated.timing(countsOpacity, { toValue: 1, duration: theme.durationFast, useNativeDriver: true }).start();
    }
    if (c.counts && c.open) AccessibilityInfo.announceForAccessibility(countsUpdatedAnnouncement(c.counts, c.open.today));
  }, [c.landed]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the landing, never on a re-render

  if (c.screen === 'loading') {
    return (
      <View style={styles.body} testID="composer-loading" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.pad}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={56} style={styles.skelGap} />
          <Skeleton height={56} style={styles.skelGap} />
          <Skeleton height={56} style={styles.skelGap} />
          <Skeleton height={14} width="60%" style={styles.skelGap} />
        </View>
      </View>
    );
  }

  if (c.screen === 'failed' || !c.open || !c.selected) {
    const copy = openFailedCopy(petName);
    return (
      <View style={[styles.body, styles.center]} testID="composer-failed">
        <ThemedText style={styles.failedTitle}>{copy.title}</ThemedText>
        <ThemedText style={styles.muted}>{copy.body}</ThemedText>
        <PrimaryButton label="Try again" onPress={c.retry} variant="secondary" style={styles.retry} />
      </View>
    );
  }

  const { open, selected, counts } = c;
  const today = open.today;
  const card = liveCardCopy(open.live, petName);
  const liveHasFlags = open.live.state === 'flags';
  const counting = c.countsState === 'counting';
  const isCustom = selected.kind === 'custom';
  const shown: ComposerCounts | null = counting ? null : counts;

  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: theme.space3 }]}>
        {card && (
          // The call card: one 56-day set, first on the screen, read first by VoiceOver.
          <View
            style={styles.card}
            testID="composer-live-card"
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${card.title}. ${card.body}`}
          >
            <View style={styles.cardRail} />
            <View style={styles.cardText}>
              <ThemedText style={styles.cardTitle}>{card.title}</ThemedText>
              <ThemedText style={styles.cardBody}>{card.body}</ThemedText>
            </View>
          </View>
        )}

        <ThemedText style={styles.question} accessibilityRole="header">
          {isCustom ? 'Your dates' : 'Which days should the vet see?'}
        </ThemedText>

        {!isCustom && (
          <View accessibilityRole="radiogroup">
            {open.windows.map((w) => {
              const on = w.startDate === selected.startDate && w.endDate === selected.endDate && w.kind === selected.kind;
              return (
                <Pressable
                  key={`${w.kind}-${w.startDate}`}
                  testID={`composer-window-${w.kind}`}
                  onPress={() => {
                    if (!on) c.select(w);
                  }}
                  style={[styles.row, on && styles.rowOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${WINDOW_LABEL[w.kind]}, ${windowDatesLine(w, today)}`}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowLabel}>{WINDOW_LABEL[w.kind]}</ThemedText>
                    <ThemedText style={styles.rowDates}>{windowDatesLine(w, today)}</ThemedText>
                    {on && (
                      <Animated.View style={{ opacity: countsOpacity }}>
                        {shown ? (
                          <ThemedText style={styles.rowCounts} testID="composer-row-counts">
                            {symptomEntriesWords(shown.symptomEntries)} · {loggedDaysWords(shown.loggedDays)}
                          </ThemedText>
                        ) : counting ? (
                          <Skeleton height={14} width="60%" style={styles.inlineSkel} />
                        ) : null}
                      </Animated.View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {isCustom && (
          <View style={[styles.row, styles.rowOn]} testID="composer-window-custom">
            <View style={styles.rowText}>
              <ThemedText style={styles.rowDates}>{windowDatesLine(selected, today)}</ThemedText>
              <Animated.View style={{ opacity: countsOpacity }}>
                {shown ? (
                  <ThemedText style={styles.rowCounts} testID="composer-row-counts">
                    {symptomEntriesWords(shown.symptomEntries)} · {loggedDaysWords(shown.loggedDays)}
                  </ThemedText>
                ) : counting ? (
                  <Skeleton height={14} width="60%" style={styles.inlineSkel} />
                ) : null}
              </Animated.View>
            </View>
          </View>
        )}

        <View style={styles.linkRow}>
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={styles.link}
            testID="composer-choose-dates"
            accessibilityRole="button"
            accessibilityLabel="Choose dates"
          >
            <ThemedText style={styles.linkText}>Choose dates</ThemedText>
          </Pressable>
          {isCustom && (
            <Pressable
              onPress={() => c.select(open.windows[0])}
              style={styles.link}
              testID="composer-back-to-windows"
              accessibilityRole="button"
              accessibilityLabel="Back to the suggested windows"
            >
              <ThemedText style={styles.linkText}>Suggested windows</ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.covers} testID="composer-covers">
          <ThemedText style={styles.coversHead} accessibilityRole="header">
            What it covers
          </ThemedText>
          {counts && (
            <CoverageStrip
              counts={counts}
              today={today}
              dim={counting}
              opacity={countsOpacity}
              reducedMotion={reducedMotion}
              appActive={appActive}
            />
          )}
          {c.countsState === 'failed' ? (
            <View>
              <ThemedText style={styles.line} testID="composer-counts-failed">
                {COUNTS_FAILED_LINE}
              </ThemedText>
              <PrimaryButton label="Try again" onPress={c.retry} variant="secondary" style={styles.retry} />
            </View>
          ) : shown ? (
            <Animated.View style={{ opacity: countsOpacity }} testID="composer-summary">
              <ThemedText style={styles.line}>{coverageLine(shown)}</ThemedText>
              {leadLine(shown) && <ThemedText style={styles.line}>{leadLine(shown)}</ThemedText>}
              <ThemedText style={styles.line}>{weightLine(shown, today)}</ThemedText>
              {shown.incomplete && <ThemedText style={styles.note}>{COUNTS_INCOMPLETE_LINE}</ThemedText>}
              {composerNoteOf(shown) === 'empty' && (
                <ThemedText style={styles.note} testID="composer-note-empty">
                  {emptyNote()}
                </ThemedText>
              )}
              {composerNoteOf(shown) === 'thin' && (
                <ThemedText style={styles.note} testID="composer-note-thin">
                  {thinNote()}
                </ThemedText>
              )}
              {c.after && (
                <ThemedText style={styles.note} testID="composer-after">
                  {afterDisclosure(c.after, shown.endDate, today, liveHasFlags)}
                </ThemedText>
              )}
            </Animated.View>
          ) : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="composer-counting">
              <Skeleton height={14} width="80%" style={styles.inlineSkel} />
              <Skeleton height={14} width="65%" style={styles.inlineSkel} />
              <Skeleton height={14} width="50%" style={styles.inlineSkel} />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
        <PrimaryButton
          label="Preview report"
          // Never a preview of counts still in flight: the window on screen is the one previewed.
          disabled={counting}
          onPress={() => onPreview(selected)}
          testID="composer-preview"
        />
      </View>

      <RangeCalendarSheet
        visible={sheetOpen}
        petId={petId}
        today={today}
        initial={selected}
        onClose={() => setSheetOpen(false)}
        onUse={(start, end, days) => {
          setSheetOpen(false);
          c.select({ kind: 'custom', startDate: start, endDate: end, days });
        }}
      />
    </View>
  );
}

// ── The coverage strip ──────────────────────────────────────────────────────

/**
 * One cell per day of the window: filled where the day has an entry, a hairline where it has none.
 * Drawn in once, on the composer's first paint; a window change swaps it by the counts' crossfade
 * (`opacity`), never a redraw. An unread day list draws nothing rather than an empty strip (C-12).
 */
function CoverageStrip({
  counts,
  today,
  dim,
  opacity,
  reducedMotion,
  appActive,
}: {
  counts: ComposerCounts;
  today: string;
  dim: boolean;
  opacity: Animated.Value;
  reducedMotion: boolean;
  appActive: boolean;
}) {
  const days = counts.windowDays;
  const draw = useDrawIn({
    kind: 'dots',
    count: days,
    drawIn: true,
    // One identity for the composer's life: the strip draws once and never again (§14).
    identity: 'composer-strip',
    reducedMotion,
    appActive,
  });
  if (counts.loggedDayKeys === null) return null;
  const logged = new Set(counts.loggedDayKeys);
  const [y, m, d] = counts.startDate.split('-').map(Number);
  const startUtc = Date.UTC(y, m - 1, d);
  const cells = Array.from({ length: days }, (_, i) => new Date(startUtc + i * 86_400_000).toISOString().slice(0, 10));
  return (
    // The dim (counts in flight) and the crossfade (counts landing) sit on two nodes, so neither
    // overwrites the other's opacity.
    <View style={dim ? styles.stripDim : undefined}>
    <Animated.View
      style={[styles.strip, { opacity }]}
      testID="composer-strip"
      accessible
      accessibilityRole="image"
      accessibilityLabel={coverageA11yLabel(counts, today)}
    >
      {cells.map((day, i) => (
        <Animated.View
          key={day}
          style={[styles.cell, logged.has(day) ? styles.cellOn : styles.cellOff, draw.markStyle(i)]}
        />
      ))}
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: theme.colorSurface },
  pad: { paddingHorizontal: theme.space2, paddingTop: theme.space2, gap: theme.space2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: theme.space3, gap: theme.space2 },
  skelGap: { marginTop: theme.space2 },
  inlineSkel: { marginTop: theme.space1 },
  failedTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  muted: { fontSize: theme.textMD, color: theme.colorTextSecondary, textAlign: 'center' },
  retry: { marginTop: theme.space2, paddingHorizontal: theme.space3 },

  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colorEventSymptomBorder,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    overflow: 'hidden',
  },
  cardRail: { width: theme.railWidth, backgroundColor: theme.colorEventSymptom },
  cardText: { flex: 1, padding: theme.space2, gap: theme.space1 },
  cardTitle: { fontSize: theme.textMD, fontWeight: theme.weightSemibold, color: theme.colorEventSymptomInk },
  cardBody: { fontSize: theme.textSM, color: theme.colorTextPrimary },

  question: { fontSize: theme.textLG, fontWeight: theme.weightSemibold, color: theme.colorTextPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
    minHeight: 56,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    marginBottom: theme.space1,
  },
  rowOn: { borderColor: theme.colorBorderStrong, backgroundColor: theme.colorSurfaceSubtle },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radiusFull,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spaceMicro,
  },
  radioOn: { borderColor: theme.colorTextPrimary },
  radioDot: { width: 10, height: 10, borderRadius: theme.radiusFull, backgroundColor: theme.colorTextPrimary },
  rowText: { flex: 1, gap: theme.spaceMicro },
  rowLabel: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  rowDates: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  rowCounts: { fontSize: theme.textSM, color: theme.colorTextPrimary, marginTop: theme.space1 },

  linkRow: { flexDirection: 'row', columnGap: theme.space3, rowGap: theme.space1, flexWrap: 'wrap' },
  link: { minHeight: theme.hitTarget, justifyContent: 'center' },
  linkText: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextPrimary, textDecorationLine: 'underline' },

  covers: { gap: theme.space1, paddingTop: theme.space1 },
  coversHead: { fontSize: theme.textSM, fontWeight: theme.weightSemibold, color: theme.colorTextSecondary },
  strip: { flexDirection: 'row', height: 14, columnGap: StyleSheet.hairlineWidth, marginVertical: theme.space1 },
  stripDim: { opacity: 0.4 },
  cell: { flex: 1, borderRadius: StyleSheet.hairlineWidth, transformOrigin: DRAW_IN_ORIGIN.dots },
  cellOn: { backgroundColor: theme.colorTextSecondary },
  cellOff: { backgroundColor: theme.colorChartEmpty },
  line: { fontSize: theme.textMD, color: theme.colorTextPrimary },
  note: { fontSize: theme.textSM, color: theme.colorTextSecondary, marginTop: theme.space1 },

  bar: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
});
