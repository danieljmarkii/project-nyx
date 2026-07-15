import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';
import { useAppConfig } from '../../hooks/useAppConfig';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

// Paywall — the mocked upgrade screen (B-251 PR 10, spec §3.7, mockup 11). It sits
// AFTER value is delivered (Pawfolio's delayed-paywall pattern) and BEFORE the warm
// completion. It is deliberately NON-FUNCTIONAL: no StoreKit, no purchase, no
// selection state — the freemium gate ("which features sit behind a paywall") is an
// open PM question (D9), so this reserves the flow slot and shows the intended shape
// without committing to what it sells. Both the prominent "Maybe later" and the
// mocked "Start 7-day free trial" simply advance to the completion screen; neither
// charges anything or claims a subscription (the next screen makes no such claim).
//
// Principle 7 is the load-bearing invariant here — premium wraps CONVENIENCE, never
// care — so the free-tier line ("Always free: logging, health alerts, trends & vet
// reports") is explicit and names the care features that stay free forever.
//
// This screen sits OUTSIDE the 5-step progress bar (spec §3 / S5), so it draws no
// OnboardingHeader/ProgressBar — just a top-right "Maybe later" escape, matching the
// mockup. The dark surface is a deliberate premium feel (first solid dark screen in
// the app; tokens in constants/theme.ts).

// Illustrative premium features — MOCK content, not a ratified gate (the freemium
// gate is open, D9). Deliberately CONVENIENCE-ONLY so the mock never implies a gate
// on care (Principle 7 / PR-10 AC "no gated care"): the mockup's original bullets
// were reworked after the pm-feature-review flagged them — "Multi-pet profiles"
// ships FREE today (B-086) and contradicts the completion screen's "add pets
// anytime"; "Advanced correlation views" is the core intelligence surface (care,
// Principle 3); "Full history, beyond 90 days" would truncate the free trend view +
// vet report for a >90-day diet trial. These three are safe convenience placeholders
// until the PM ratifies the real gate. The free-tier line below is the invariant.
const PREMIUM_FEATURES = [
  'Custom app themes',
  'Home-screen widgets',
  'Priority support',
];

export default function PaywallScreen() {
  const { activePet } = usePetStore();

  // T2-5 — the paywall is gated on `paywall_enabled` (monetization spec §6.5). The
  // primary gate lives one screen back (pet-age routes past the paywall when it's
  // off), so this screen normally only mounts when the flag is on. This is the
  // defensive backstop: a stale client or a stray deep link straight here must not
  // land on a dead, non-functional trial CTA — bounce to the completion screen
  // instead. Fails CLOSED (shipped client default `false`, lib/appConfig.ts).
  const { paywall_enabled: paywallEnabled } = useAppConfig();

  // This is the only solid dark surface in the flow, so the status-bar icons must
  // flip to light while it's focused — and flip BACK when it blurs, whether the
  // owner goes forward to the (light) done screen or swipes back to the (light) age
  // step. Setting it imperatively on focus + restoring on blur avoids the leak a
  // persistent <StatusBar> component would cause (light icons stranded on the next
  // light screen). 'auto' restores the app-wide baseline the root layout sets.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  // Escape hatch: the paywall is only reachable after the pet exists (pushed from
  // the age step); a stray deep link straight here restarts pet setup. A no-pet
  // entry is the more broken state, so it takes precedence over the flag bounce.
  useEffect(() => {
    if (!activePet) {
      router.replace('/onboarding/pet-type');
      return;
    }
    // Paywall flagged off but reached anyway (stale client / deep link): don't show
    // the dead mock — hand straight to the completion screen (T2-5).
    if (!paywallEnabled) router.replace('/onboarding/done');
  }, [activePet, paywallEnabled]);

  // Render nothing while either guard bounces, so no dead paywall flashes.
  if (!activePet || !paywallEnabled) return null;

  // "Maybe later" advances to the completion screen. Push (not replace) so the flow
  // stack stays intact; the done screen locks its own back gesture, so this can't be
  // swiped back into.
  function advance() {
    router.push('/onboarding/done');
  }

  // The trial CTA is a MOCK — there is no StoreKit and no purchase. Rather than
  // silently no-op (which reads as "a trial started / I'll be charged" or "this is
  // broken" — pm-feature-review), it honestly acknowledges Premium isn't live yet,
  // reinforces the free-tier promise, then advances. No charge, no subscription
  // claim; the free path ("Maybe later") stays the faster one tap.
  function handleTrial() {
    if (!activePet) return; // re-guard so the closure narrows activePet (see pet-age)
    Alert.alert(
      'Premium is on its way',
      `It's not quite ready yet — and everything that keeps ${activePet.name} healthy is already free.`,
      [{ text: 'Continue', onPress: advance }],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.skip}
          testID="paywall-maybe-later"
        >
          <Text style={styles.skipText}>Maybe later</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Culprit Premium</Text>
        <Text style={styles.subtitle}>
          {`Everything that keeps ${activePet.name} healthy is free. Premium just adds convenience.`}
        </Text>

        {/* Static, non-interactive pricing display — no selection, no purchase. */}
        <View style={styles.priceRow}>
          <View style={[styles.priceTile, styles.priceTileFeatured]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Best value</Text>
            </View>
            <Text style={styles.priceLabel}>Yearly</Text>
            <Text style={styles.priceAmount}>
              £29.99
              <Text style={styles.priceUnit}> /yr</Text>
            </Text>
          </View>
          <View style={styles.priceTile}>
            <Text style={styles.priceLabel}>Monthly</Text>
            <Text style={styles.priceAmount}>
              £3.99
              <Text style={styles.priceUnit}> /mo</Text>
            </Text>
          </View>
        </View>

        <View style={styles.features}>
          {PREMIUM_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Check size={18} color={theme.colorAccent} strokeWidth={2.5} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.grow} />

        <PrimaryButton
          label="Start 7-day free trial"
          onPress={handleTrial}
          // Teal accent — the near-black 'primary' fill would vanish on the dark
          // surface; accent is both visible and the premium-action colour.
          variant="accent"
          testID="paywall-start-trial"
        />
        {/* Principle 7 — the explicit, load-bearing free-tier line. */}
        <Text style={styles.freeLine}>
          <Text style={styles.freeLineEmphasis}>Always free:</Text>
          {' logging, health alerts, trends & vet reports.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurfaceDark,
    paddingHorizontal: theme.space3,
  },
  topRow: {
    flexDirection: 'row',
    // "Maybe later" hugs the right; no back affordance (the paywall is a forward
    // soft-wall — the mockup's top-left is empty).
    justifyContent: 'flex-end',
    minHeight: theme.space4,
    paddingTop: theme.space1,
  },
  skip: {
    height: theme.space5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  skipText: {
    // Full-white, not the dim secondary grey — the free escape must read clearly on
    // the dark surface (Pets > $ / spec §3.7 "a clear 'Maybe later' advances"), not
    // as the faintest element competing with the sale (pm-feature-review).
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
  body: {
    flexGrow: 1,
    paddingBottom: theme.space2,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
    letterSpacing: theme.trackingTight,
    marginTop: theme.space2,
    marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDarkSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space3,
  },
  priceRow: {
    flexDirection: 'row',
    columnGap: theme.space2,
    marginBottom: theme.space3,
  },
  priceTile: {
    flex: 1,
    backgroundColor: theme.colorSurfaceDarkElevated,
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorderOnDark,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
  },
  // The featured tile carries the accent ring — the "you'd pick this" cue. 1.5px
  // is a rule (accent outline), not layout rhythm, so it sits below the 8pt grid.
  priceTileFeatured: {
    borderWidth: 1.5,
    borderColor: theme.colorAccent,
  },
  badge: {
    position: 'absolute',
    top: -theme.space1,
    right: theme.space2,
    backgroundColor: theme.colorAccent,
    borderRadius: theme.radiusFull,
    paddingHorizontal: theme.space1,
    paddingVertical: theme.spaceMicro,
  },
  badgeText: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorNeutralDark,
  },
  priceLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSecondary,
    marginBottom: theme.spaceMicro,
  },
  priceAmount: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
  },
  priceUnit: {
    fontSize: theme.textSM,
    fontWeight: theme.weightRegular,
    color: theme.colorTextOnDarkSecondary,
  },
  features: {
    rowGap: theme.space2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.space1,
  },
  featureText: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
  },
  grow: {
    flex: 1,
    minHeight: theme.space4,
  },
  freeLine: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSecondary,
    textAlign: 'center',
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space2,
  },
  freeLineEmphasis: {
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentSoft,
  },
});
