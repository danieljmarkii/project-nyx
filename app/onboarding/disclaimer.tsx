import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { recordDisclaimerAcceptance } from '../../lib/legal';
import { DISCLAIMER_URL } from '../../constants/links';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

// The veterinary-disclaimer acknowledgment (B-270) — the first stop after account
// creation, before any pet data is entered. Body + button copy are VERBATIM from
// docs/legal/veterinary-disclaimer.md's appendix (nyx-voice checked there); the
// full document is one tap away at the hosted URL.
//
// Placement: onboarding is the sanctioned moment for a deliberate decision
// (Principle 1 forbids decisions at moment of EVENT — mid-log — not at setup),
// and putting it before pet setup means every account carries the record before
// any health data exists. The warm "all set" terminus stays untouched.
//
// The button tap IS the acknowledgment — one tap, no checkbox-then-continue
// two-step. It AWAITS the server write: an acceptance that isn't recorded is
// worth little in a dispute, so on failure the owner stays here with a calm
// retry rather than advancing unrecorded. A re-walk of this screen (mid-flow
// quit → resume) re-inserts and the PK conflict maps to already-recorded — the
// first acceptance stands (lib/legal.ts).
//
// The standard title face, not Newsreader — this is the app's plain honest
// register, not a warm brand moment (the B-284 register rule).
export default function DisclaimerScreen() {
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);

  // The root layout gates every screen on a live session, so a missing user is a
  // stray render mid-signout — draw nothing rather than a screen that can't record.
  if (!user) return null;

  async function handleOpenFullDisclaimer() {
    // A failed open is honest, never silent (mirrors app/settings.tsx).
    try {
      await Linking.openURL(DISCLAIMER_URL);
    } catch (e) {
      console.warn('[Disclaimer] open link failed:', e);
      Alert.alert("Couldn't open link", `You can find the full disclaimer at ${DISCLAIMER_URL}.`);
    }
  }

  async function handleAcknowledge() {
    const userId = user?.id;
    if (!userId || saving) return;
    setSaving(true);
    const result = await recordDisclaimerAcceptance(userId);
    setSaving(false);
    if (result.status === 'error') {
      // Stay here — advancing with an unrecorded acceptance defeats the point.
      Alert.alert("Couldn't save your acknowledgment", 'Check your connection and try again.');
      return;
    }
    // replace, not push: acknowledged is a one-way door — no swiping back into
    // the acceptance from pet setup.
    router.replace('/onboarding/pet-type');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.grow} />

        <Text style={styles.title}>Before you start</Text>
        {/* Verbatim appendix copy — edit docs/legal/veterinary-disclaimer.md
            first if this ever needs to change, then mirror it here. */}
        <Text style={styles.copy}>
          Culprit helps you notice and record — it can&apos;t examine your pet, and it never
          gives the all-clear. For diagnosis, treatment, or anything urgent, your vet is the
          call.
        </Text>

        <TouchableOpacity
          onPress={handleOpenFullDisclaimer}
          style={styles.fullLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="link"
          accessibilityLabel="Read the full disclaimer"
          testID="disclaimer-full-link"
        >
          <Text style={styles.fullLinkText}>Read the full disclaimer</Text>
        </TouchableOpacity>

        <View style={styles.grow} />

        <PrimaryButton
          label="I understand Culprit is not a substitute for veterinary care."
          onPress={handleAcknowledge}
          loading={saving}
          testID="disclaimer-acknowledge"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  body: {
    flex: 1,
    paddingBottom: theme.space2,
  },
  grow: {
    flexGrow: 1,
    minHeight: theme.space4,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    letterSpacing: theme.trackingTight,
    marginBottom: theme.space2,
  },
  copy: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  fullLink: {
    minHeight: theme.space5,
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  fullLinkText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
    textDecorationLine: 'underline',
  },
});
