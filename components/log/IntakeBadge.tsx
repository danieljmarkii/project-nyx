import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { IntakeRating, INTAKE_OPTIONS } from './IntakeChipRow';

// The read-only intake badge (B-035). A meal's logged WSAVA intake rating, rendered as a
// quiet fact next to the food name in History — NOT the editable IntakeChipRow (that's the
// log/edit surface). Split out for two reasons the old shared read-only branch got wrong:
//
//   1. NON-CHIP. The old badge reused `FilterChip` in its active state — a teal-outlined,
//      sentence-cased pill identical to History's own "All" date/type filter pills — so a
//      passive fact read as a tappable control (it isn't; taps fall through to the row).
//      This is a plain filled tint tag in small-caps: no outline, no teal-as-affordance,
//      pointerEvents none. It reads as a status tag (the sibling of the "Unconfirmed" dose
//      tag), never a filter chip.
//
//   2. TWO-TIER PALETTE (the safety fix). The old badge coloured every rating the same calm
//      teal, so `Refused`/`Picked` — decline, a disease signal under the intake-is-not-
//      preference invariant — read exactly as benign as `All`. Here the palette splits at the
//      FINISHED line: a meal eaten in full is calm; reduced or declined intake carries the
//      calm symptom-rose "attention" register (never alarm — no klaxon, no red, the same tint
//      the safety banners use). Decline is never coloured as if it were fine.

export type IntakeTier = 'positive' | 'decline';

// The tier split. POSITIVE is enumerated and everything else falls to `decline`, so the SAFE
// error direction is structural: a rating this function can't place lands on the attention
// side, never silently benign.
//
// `some` sits on the DECLINE side deliberately. It is partial intake — a potential decline
// signal — and the codebase already draws its "finished" line at most|all (lib/analytics
// FINISHED_SCORE) and treats the medication analog (`partial`) as a concern state
// (AdherenceChipRow). Colouring `some` calm would let a cat eating progressively less
// (most → some → some) read as benign the whole way down, which is exactly the false-
// reassurance the intake anti-pattern forbids. Over-distinguishing reduced intake is the safe
// cost; hiding it is not. (The some/most boundary is the Data Scientist / Dr. Chen call.)
const POSITIVE: ReadonlySet<IntakeRating> = new Set<IntakeRating>(['all', 'most']);

export function intakeTier(rating: IntakeRating): IntakeTier {
  return POSITIVE.has(rating) ? 'positive' : 'decline';
}

// Display label sourced from IntakeChipRow's own options, so the badge and the editable row
// can never drift to two spellings of the same WSAVA rating.
const LABEL: Record<IntakeRating, string> = INTAKE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<IntakeRating, string>,
);

interface Props {
  // Null renders nothing — an unrated meal stays visually quiet (matching the old read-only
  // convention and History's NULL-intake-renders-nothing rule).
  rating: IntakeRating | null;
}

export function IntakeBadge({ rating }: Props) {
  if (rating === null) return null;
  const tier = intakeTier(rating);
  // Fall back to the raw value if an out-of-enum rating ever reaches here (DB/SQLite enum
  // drift). `intakeTier` already places an unknown rating on the safe `decline` side; this keeps
  // the render path honest too, so a stray value shows in the attention tier instead of throwing
  // on `undefined.toLowerCase()` and crashing the row to its error boundary.
  const label = LABEL[rating] ?? rating;
  return (
    // pointerEvents none so a tap falls through to the row's own expand/long-press gesture:
    // the badge is decoration over the row, never a dead touch target on top of it.
    <View
      style={[styles.badge, tier === 'positive' ? styles.positive : styles.decline]}
      pointerEvents="none"
      accessible
      accessibilityLabel={`Intake: ${label.toLowerCase()}`}
    >
      <Text style={[styles.label, tier === 'positive' ? styles.labelPositive : styles.labelDecline]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // flexShrink:0 so the badge holds its width and the flex:1 food name beside it absorbs the
  // truncation (mirrors the format tag), keeping the badge pinned to the right rail.
  badge: {
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
    borderRadius: theme.radiusFull,
    flexShrink: 0,
  },
  // Positive = calm. The soft accent tint / darkened-teal ink pair the app already uses for a
  // calm, on-brand "fine" mark (the widget's finished-meal ✓), not the full-strength teal
  // outline of a tappable chip — so it reads calm without reading interactive.
  positive: {
    backgroundColor: theme.colorAccentLight,
  },
  // Decline = attention, never alarm. The symptom-light tint + deep-rose small-caps ink is the
  // exact pair the design system reserves for a small-caps label on a safety surface
  // (colorEventSymptomInk's documented role) — firm enough to distinguish decline, calm enough
  // never to spike anxiety.
  decline: {
    backgroundColor: theme.colorEventSymptomLight,
  },
  // Small-caps, not sentence case: this is the meta-tag register (the format tag / the
  // "Unconfirmed" dose tag), which is what stops it rhyming with the sentence-cased filter
  // pills the old badge was mistaken for.
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
  },
  labelPositive: {
    color: theme.colorAccentInk,
  },
  labelDecline: {
    color: theme.colorEventSymptomInk,
  },
});
