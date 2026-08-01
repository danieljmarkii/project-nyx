// The Home medication strip (B-614 PR M2, §8 — the trial strip's sibling).
//
// One compact card PER active/recent medication (D3), rendered BELOW `TrialStrip`
// and ABOVE `TodayZone`: the diet trial is the wedge's primary object and runs
// 8–12 weeks, a 14-day course is the shorter-lived guest (§8/D9). Same rationale
// as `TrialStrip` — a medication is CONTEXT, not an insight, so Principle 3's lead
// stays with the Signal zone.
//
// ── M2 IS CONTEXT-ONLY: NO CONFIRM BUTTON YET ─────────────────────────────────
// The card is useful as context on its own — it is round 1's Option A — and
// splitting the read path from the write path keeps M3's review about the one
// thing that is new and load-bearing: a write action on Home (§10). So this
// deliberately renders `model.header` / the bar / `model.line` and IGNORES
// `model.confirm`; the confirm button and its optimistic state 10 land in M3.
//
// Every visible fact is computed by the pure `resolveMedStrips` (M1) — this
// component makes no clinical judgement. It draws the day-progress bar only when
// `progressFraction` is non-null (never a dose-derived fraction — N2), and the
// withholding fact (§6) in the concern colour, never a cheery coverage line over a
// refusal (N3).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';
import type { MedStripModel } from '../../lib/medStrip';

interface Props {
  model: MedStripModel;
  /** Overridable so the test drives navigation without a router mock. */
  onPress?: () => void;
}

export function MedStrip({ model, onPress }: Props) {
  // A withholding record replaces the coverage line with the fact (§6/N3); render
  // that fact in the concern colour. The intake-decline-only case carries no line
  // (it defers to the Signal card above), so gate on the line being present too.
  const isFlag = model.withholding.length > 0 && model.line !== null;

  const a11yLabel = [model.header, model.line]
    .filter((s): s is string => s != null)
    .join('. ');

  return (
    <Pressable
      onPress={onPress ?? (() => router.push('/(tabs)/profile'))}
      accessibilityRole="button"
      accessibilityLabel={`${a11yLabel}. Open medications.`}
      testID="med-strip"
    >
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.header}>{model.header}</Text>
          <Text style={styles.chevron}>›</Text>
        </View>

        {/* N2 — day progress and nothing else, and only when there is an honest
            denominator. `progressFraction` is null for ongoing/ad-hoc/collapsed
            cards, so its presence IS the "draw a bar" signal (no second rule). */}
        {model.progressFraction !== null && (
          <View style={styles.progressTrack} testID="med-strip-track">
            <View
              testID="med-strip-fill"
              style={[styles.progressFill, { width: `${model.progressFraction * 100}%` }]}
            />
          </View>
        )}

        {model.line !== null && (
          <Text style={[styles.line, isFlag && styles.lineFlag]}>{model.line}</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    // Leave room for the chevron rather than letting a long "day 17 — 3 days past"
    // header shove it off the row.
    flex: 1,
  },
  chevron: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
    marginLeft: theme.space2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: theme.space2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colorAccent,
  },
  line: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  // The withholding fact (§6). `colorEventSymptom` is the app's established
  // concern-text token — every other safety/concern line uses it (EventRow,
  // TodayZone, Badge). The mock's #B4123B is a print-legibility choice for paper;
  // the shipped surface uses the token, per the theme-tokens-only convention. The
  // exact register locks at M5 behind `clinical-guardrails`.
  lineFlag: {
    color: theme.colorEventSymptom,
  },
});
