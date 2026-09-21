import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { useDesignV2 } from '../../hooks/useDesignV2';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { parseSignalRouteParams } from '../../lib/signalRoute';
import { SignalScreen } from '../../components/designV2/signal/SignalScreen';
import { SIGNAL_OPEN_MOTION } from '../../components/motion/signalOpenMotion';
import { Header } from '../../components/ui/Header';
import { ThemedText } from '../../components/ui/ThemedText';

// The Signal's own screen, as a route (D2-3 · CUL-1065; `docs/culprit-design-v4-mockups.html`
// §03 / §06 — Dir. of Engineering: "this is a route: back-gesture, deep link and
// VoiceOver focus for free, on the engines the app already ships"). `id` is the finding's
// identity, `pet` its pet (C-9) — `lib/signalRoute.ts` builds and parses both.
//
// THIS FILE HOLDS THE GATE AND DRAWS NOTHING OF THE REDESIGN. `useDesignV2()` decides;
// `SignalScreen` (the namespace) draws. Flag-off — a stale deep link on a device the
// redesign is not on for — renders the small inline screen below: no namespace node, no
// record read (the screen's own suite proves the read is never issued), and the route
// still answers so the link does not dead-end. That is the tree the flag-off guard
// compares against the namespace-absent one (`guards/designV2FlagOff.test.tsx`).
//
// THE RISE is the route's own transition: `slide_from_bottom` at the fold's `openMs`, so
// the screen rises with the fold's physics and Back is the same curve reversed, natively.
// Reduced motion: `none`. (`animationDuration` is honoured on iOS; Android takes the
// platform's default for the animation, which is inside the 700ms budget.)

export const OFF_TITLE = 'Nothing to show here';
export const OFF_BODY = "This screen is part of a redesign that isn't on for this account yet.";

export default function SignalRoute() {
  const live = useDesignV2();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string; pet?: string }>();
  const parsed = parseSignalRouteParams(params);

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
        <SignalScreen petId={parsed.petId} identity={parsed.identity} />
      ) : (
        <View style={styles.off} testID="signal-route-off">
          <Header title="Signal" leading="back" onLeadingPress={() => router.back()} />
          <View style={styles.offBody}>
            <ThemedText style={styles.offTitle}>{OFF_TITLE}</ThemedText>
            <ThemedText style={styles.offText}>{OFF_BODY}</ThemedText>
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
    gap: theme.space1,
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
