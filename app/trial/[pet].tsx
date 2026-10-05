import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { parseTrialRouteParams } from '../../lib/trialRoute';
import { PROFILE_ROUTE } from '../../lib/profileFocus';
import { TrialScreen } from '../../components/trialScreen/TrialScreen';
import { SIGNAL_OPEN_MOTION } from '../../components/motion/signalOpenMotion';
import { Header } from '../../components/ui/Header';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ThemedText } from '../../components/ui/ThemedText';

// The trial's own screen, as a route (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md`
// §2 S1, S10, §6, §7). `pet` is the trial's pet: every read, door and sheet on the screen
// takes it, never `activePet` (C-9). `lib/trialRoute.ts` builds and parses it.
//
// THIS FILE DRAWS NOTHING OF THE FEATURE (the Signal route's shape): `TrialScreen` draws.
// The trial screen is on for every account since TS-GA (CUL-1307), so the only fallback
// left is a link that names no pet (a corrupted deep link): the small screen below, with no
// trial read, and a way to the pet's tab so the link does not dead-end.
//
// THE RISE is the route's own transition: `slide_from_bottom` at the Signal screen's
// `riseMs`, so the trial rises with the Signal's physics and Back is the same curve
// reversed, natively (C-30: lift the constant, never restate it). Reduced motion: `none`.

export const OFF_TITLE = 'Nothing to show here';
// No tab is labelled "Pet": the bar draws the active pet's NAME there (CUL-1339 voice pass,
// 2026-10-03). This screen knows no pet, so it says "your pet's tab".
export const BAD_LINK_BODY = "This link doesn't name a pet. The trial is on your pet's tab.";
export const OFF_ACTION = "Open your pet's tab";

export default function TrialRoute() {
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
      {parsed ? (
        <TrialScreen petId={parsed.petId} />
      ) : (
        <View style={styles.off} testID="trial-route-off">
          <Header title="Diet trial" leading="back" onLeadingPress={() => router.back()} />
          <View style={styles.offBody}>
            <ThemedText style={styles.offTitle}>{OFF_TITLE}</ThemedText>
            <ThemedText style={styles.offText}>{BAD_LINK_BODY}</ThemedText>
            <PrimaryButton
              label={OFF_ACTION}
              variant="secondary"
              onPress={() => router.push(PROFILE_ROUTE)}
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
