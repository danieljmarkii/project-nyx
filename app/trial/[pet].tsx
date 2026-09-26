import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTrialScreen } from '../../hooks/useTrialScreen';
import { parseTrialRouteParams } from '../../lib/trialRoute';
import { profileFocusHref } from '../../lib/profileFocus';
import { TrialScreen } from '../../components/trialScreen/TrialScreen';
import { SIGNAL_OPEN_MOTION } from '../../components/motion/signalOpenMotion';
import { Header } from '../../components/ui/Header';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ThemedText } from '../../components/ui/ThemedText';

// The trial's own screen, as a route (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md`
// §2 S1, S10, §6, §7). `pet` is the trial's pet: every read, door and sheet on the screen
// takes it, never `activePet` (C-9). `lib/trialRoute.ts` builds and parses it.
//
// THIS FILE HOLDS THE GATE AND DRAWS NOTHING OF THE FEATURE (the Signal route's shape).
// `useTrialScreen()` decides; `TrialScreen` (the namespace) draws. Flag-off (a stale link on
// a device the flag is off for) renders the small screen below: no namespace node, no trial
// read (the screen's own suite proves no read is issued over a fixture that would answer),
// and the route still answers so the link does not dead-end. That is the tree the flag-off
// guard compares against the namespace-absent one (`guards/trialScreenFlagOff.test.tsx`).
//
// THE RISE is the route's own transition: `slide_from_bottom` at the Signal screen's
// `riseMs`, so the trial rises with the Signal's physics and Back is the same curve
// reversed, natively (C-30: lift the constant, never restate it). Reduced motion: `none`.

export const OFF_TITLE = 'Nothing to show here';
export const OFF_BODY = "This screen isn't on for this account yet. The trial is on the Pet tab.";
export const OFF_ACTION = 'Open the Pet tab';

export default function TrialRoute() {
  const live = useTrialScreen();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ pet?: string }>();
  const parsed = parseTrialRouteParams(params);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: reducedMotion ? 'none' : 'slide_from_bottom',
          animationDuration: SIGNAL_OPEN_MOTION.riseMs,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      {live && parsed ? (
        <TrialScreen petId={parsed.petId} />
      ) : (
        <View style={styles.off} testID="trial-route-off">
          <Header title="Diet trial" leading="back" onLeadingPress={() => router.back()} />
          <View style={styles.offBody}>
            <ThemedText style={styles.offTitle}>{OFF_TITLE}</ThemedText>
            <ThemedText style={styles.offText}>{OFF_BODY}</ThemedText>
            <PrimaryButton
              label={OFF_ACTION}
              variant="secondary"
              onPress={() => router.push(profileFocusHref({ focus: 'trial', nowMs: Date.now() }))}
              testID="trial-route-off-action"
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  off: {
    flex: 1,
  },
  offBody: {
    padding: theme.space3,
    gap: theme.space2,
  },
  offTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  offText: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextSecondary,
  },
});
