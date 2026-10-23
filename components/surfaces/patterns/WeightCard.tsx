import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { theme, shadows } from '../../../constants/theme';
import { weightBand } from '../../../lib/chartModels';
import { weightDeltaLine } from '../../../lib/chartCopy';
import { formatWeightDate, kgToLbsNum, type WeightReading } from '../../../lib/weight';
import { petNameOrYours, pluralize } from '../../../lib/dashboardCards';
import { WeightDots } from '../../charts/WeightDots';
import { ThemedText } from '../../ui/ThemedText';

// WeightCard (Design v2) — readings as dots by DATE on a stepped band (D2-5 · CUL-1067;
// design authority `docs/culprit-design-v4-mockups.html` §04 option A, ruled R4-4: "dots by
// date on a fixed ±10% band with no fill and the delta spoken", amended by CUL-1716: the
// band steps to ±20 / ±30 % when a reading falls outside ±10 %,
// `docs/culprit-weight-card-mockups.html`). The only
// weight card on Patterns since Design v2's GA (CUL-1071) deleted the old one.
//
//   six readings ... the dots where their dates are, the band's edges labelled, the delta
//                    spoken beside its caveat
//   two readings ... the pair on the same band — a 2 % change looks like 2 %
//   one reading .... the number and its date: "One reading is a number, not a line"
//   none ........... the shipped card's own invitation to weigh (Principle 5)
//
// CLINICAL GUARDRAIL, inherited whole from the shipped card (B-186, Dr. Chen): a weight
// trend NEVER reassures. Loss is the danger signal and a rising or flat line is not
// wellness, so the dots are neutral grey (`WeightDots`), the words carry direction and
// never a verdict (`weightDeltaLine`), and the home-scale caveat is GATED to a home
// scale's own noise — beside a 15 % loss it would be reassurance, so it is absent there,
// and beside a run that only ever moved one way the run is stated instead (PMD-3 as GC-7
// ruled it, CUL-1553). The gate reads the STORED kilograms, never the rounded pounds.
//
// Values are converted to the display unit here (the app shows pounds over a kg column,
// `kgToLbsNum`) so the chart's numbers, the delta and the history screen agree; the
// band is a ratio and does not care.
//
// ONE POPULATION (GC-7 item 4): the header counts the readings the dots draw and the
// words describe, "Weight · last 12 of 30 readings", so a number in the header never
// describes a different set of readings from the line under it. The record's total is
// named beside the window and labels the door, "All 30" (CUL-223: the window may index,
// only the total is spoken as the total).

interface Props {
  /** The readings drawn, oldest first — the caller's window. */
  readings: readonly WeightReading[];
  /** How many readings the pet HAS — the whole record. */
  readingCount: number;
  petName?: string;
  /** Whose readings the `All ›` door opens (CUL-574: passed, never re-read from the selection). */
  petId: string;
  drawIn?: boolean;
}

const UNIT = 'lbs';
/** A home scale's own wobble, in the STORED unit: about 0.2 kg on a bathroom or pet
 *  scale. The caveat's ABSOLUTE bound, strict (`weightDeltaLine`); the fractional one is
 *  `HOME_SCALE_NOISE_FRAC`. */
export const HOME_SCALE_NOISE_KG = 0.2;

/** "Weight · 6 readings", or "Weight · last 12 of 30 readings" when the dots draw a
 *  window of the record. */
export function weightHeader(drawn: number, total: number): string {
  if (total <= 0 && drawn <= 0) return 'Weight';
  if (drawn >= total || drawn === 0) return `Weight · ${Math.max(drawn, total)} ${pluralize(Math.max(drawn, total), 'reading')}`;
  return `Weight · last ${drawn} of ${total} readings`;
}

export function WeightCard({ readings, readingCount, petName, petId, drawIn = false }: Props) {
  const name = petNameOrYours(petName);
  // One set of readings for both models: a stored weight that rounds to 0.0 lbs is not
  // drawn, so it must not set the line's direction from the kilograms either.
  const drawable = readings.filter((r) => kgToLbsNum(r.weightKg) > 0);
  const model = weightBand(drawable.map((r) => ({ value: kgToLbsNum(r.weightKg), occurredAt: r.occurredAt })));
  const modelKg = weightBand(drawable.map((r) => ({ value: r.weightKg, occurredAt: r.occurredAt })));
  const count = Math.max(readingCount, model.points.length);
  const delta = weightDeltaLine(model, UNIT, formatWeightDate, { model: modelKg, noiseAbs: HOME_SCALE_NOISE_KG });

  return (
    <View style={styles.card} testID="weight-card-v2">
      <View style={styles.headerRow}>
        <ThemedText style={styles.label} testID="weight-card-header">
          {weightHeader(model.points.length, count)}
        </ThemedText>
        {count > 0 && (
          // The header's door: "All ›" into the readings list — except at ONE reading,
          // where the design authority draws "Add ›" (§04): a list holding the number
          // already on screen is a dead end, and the wanted next step is the second
          // reading that draws the band.
          <Pressable
            style={styles.door}
            onPress={() =>
              count === 1
                ? router.push('/log?type=weight_check')
                : router.push({ pathname: '/weight-history', params: { petId } })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={count === 1 ? 'Add a second reading' : `All ${count} ${pluralize(count, 'reading')}`}
            testID="weight-card-door"
          >
            <ThemedText style={styles.doorText}>{count === 1 ? 'Add' : `All ${count}`}</ThemedText>
            <ChevronRight size={14} color={theme.colorTextTertiary} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {model.state === 'empty' ? (
        <ThemedText style={styles.emptyText}>
          No weigh-ins logged yet. Weighing {name} now and then is the simplest way to keep an eye on changes over time.
        </ThemedText>
      ) : (
        <View style={styles.body}>
          {/* Draws once per pet (CUL-1223): the pet is the identity, so a re-read never replays. */}
          <WeightDots model={model} unit={UNIT} formatDate={formatWeightDate} drawIn={drawIn} identity={`weight:${petId}`} />
          {model.state === 'number' ? (
            <ThemedText style={styles.note} testID="weight-card-note">
              One reading is a number, not a line. The second one draws the band.
            </ThemedText>
          ) : delta != null ? (
            <ThemedText style={styles.note} testID="weight-card-delta">
              {delta}
            </ThemedText>
          ) : null}
        </View>
      )}

      {/* The primary action, every state — the next reading is always the wanted next step.
          No hitSlop: a 44pt box, with the door above it (C-5). */}
      <Pressable
        onPress={() => router.push('/log?type=weight_check')}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Log a weigh-in for ${name}`}
      >
        <ThemedText style={styles.actionText}>Log a weigh-in</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
    ...shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  label: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spaceMicro,
    minHeight: 28,
  },
  doorText: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
  body: {
    gap: theme.space1,
  },
  note: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightXS,
  },
  emptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
});
