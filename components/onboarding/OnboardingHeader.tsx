import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ProgressBar } from './ProgressBar';

interface Props {
  // 1-based index of the pet-setup step this screen is (type = 1, name = 2, …).
  step: number;
  // The pet-setup flow is 5 steps (type, name, breed, gender, age); paywall/done
  // sit outside the bar (spec §3 / S5).
  totalSteps?: number;
  // When set, a prominent Skip affordance sits top-right — the skippable optional
  // steps (breed / gender / age, mockup 08–10) render it; the required steps
  // (type / name) omit it. Skipping is the field-level advance, so it lives in the
  // chrome beside back, not as a second button competing with Continue.
  onSkip?: () => void;
  // Skip copy (default "Skip"); the age step overrides it ("Not sure? Skip").
  skipLabel?: string;
}

/**
 * Shared top chrome for the onboarding pet-setup steps (B-251 PR 7): a back
 * affordance, the segmented {@link ProgressBar}, and a plain "Step N of M" label.
 * The onboarding _layout hides the native header (each step draws its own), so
 * this is the "where am I / how do I get back" frame every pet-setup screen
 * inherits.
 *
 * Back is shown only when there is somewhere to return to (`router.canGoBack()`):
 * the first onboarding screen is reached via a `replace` (from usePet, or from
 * the account step once PR 6 lands) and has no back entry, so it renders an
 * equal-size spacer instead — the progress row keeps identical vertical rhythm
 * whether or not a back button is present. On a pushed step (name onward) the
 * gesture-back and this button both pop to the previous step, which keeps its own
 * state; the pet-setup values themselves (type/name) are backed by the shared
 * onboarding draft so they also survive a back-then-forward loop (§6 / AC "back
 * preserves entered values"). This component owns only the back affordance, not
 * that persistence.
 */
export function OnboardingHeader({ step, totalSteps = 5, onSkip, skipLabel = 'Skip' }: Props) {
  const canGoBack = router.canGoBack();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            // 24pt glyph → expand the tap zone to clear the 44pt floor.
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.back}
            testID="onboarding-back"
          >
            <ChevronLeft size={24} color={theme.colorTextPrimary} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          // Reserve the back button's footprint so the progress row doesn't jump
          // between an entry step (no back) and a pushed step (back present).
          <View style={styles.back} />
        )}

        {onSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.skip}
            testID="onboarding-skip"
          >
            <Text style={styles.skipText}>{skipLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ProgressBar current={step} total={totalSteps} />

      {/* Visible progress text. The ProgressBar already announces "Step N of M"
          via its progressbar role, so this copy is hidden from assistive tech to
          avoid a duplicate announcement — it's a visual echo only. */}
      <Text style={styles.stepLabel} importantForAccessibility="no" accessibilityElementsHidden>
        {`Step ${step} of ${totalSteps}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Sits inside each screen's horizontal padding; owns only its vertical rhythm.
    paddingTop: theme.space1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Back hugs the left, Skip the right. With a single child (back or its
    // spacer, on a step with no Skip) this is equivalent to flex-start, so the
    // required steps are visually unchanged.
    justifyContent: 'space-between',
    minHeight: theme.space4, // 32 — a stable top row whether back shows or not
    marginBottom: theme.space1,
  },
  back: {
    // ≥44pt target; left-aligned so the chevron hugs the screen edge.
    width: theme.space5,
    height: theme.space5,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginLeft: -theme.space1, // optical-align the chevron to the content edge
  },
  skip: {
    // ≥44pt target; right-aligned so the label hugs the screen edge. hitSlop
    // carries the rest of the touch floor around the short text.
    height: theme.space5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  skipText: {
    // Prominent (mockup "skip strong") — the single interactive accent + a
    // semibold weight, so the optional tail stays fast to move through.
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccent,
  },
  stepLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    marginTop: theme.space1,
  },
});
