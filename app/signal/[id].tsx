import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { parseSignalRouteParams } from '../../lib/signalRoute';
import { SignalScreen } from '../../components/designV2/signal/SignalScreen';
import { useAuthStore } from '../../store/authStore';
import { FLIGHT_MOTION, peekFlight } from '../../components/motion/flightMotion';
import { SIGNAL_OPEN_MOTION } from '../../components/motion/signalOpenMotion';
import { Header } from '../../components/ui/Header';
import { ThemedText } from '../../components/ui/ThemedText';

// The Signal's own screen, as a route (D2-3 · CUL-1065; `docs/culprit-design-v4-mockups.html`
// §03 / §06 — Dir. of Engineering: "this is a route: back-gesture, deep link and
// VoiceOver focus for free, on the engines the app already ships"). `id` is the finding's
// identity, `pet` its pet (C-9) — `lib/signalRoute.ts` builds and parses both.
//
// THIS FILE DRAWS NOTHING OF THE SCREEN: `SignalScreen` draws. Design v2 is on for every
// account since its GA (CUL-1071), so two fallbacks are left, each the small inline screen
// below with no record read: a link that does not parse, and NO SESSION. The second is the
// sign-out fence (MFU-9). The `design_v2` gate used to be this screen's only protection at
// sign-out (the allowlist fails closed once the session goes); with it gone, a Signal
// screen still mounted when SIGNED_OUT lands would keep the previous owner's finding on
// screen. Three halves now hold that: `wipeLocalSession` aborts the flight (its record
// carries the finding's title), the SIGNED_OUT handler unwinds the stack before it routes
// to auth (`app/_layout.tsx`), and this fence draws nothing of the record the moment the
// session is null, whatever the navigator does.
//
// THE RISE is the route's own transition: `slide_from_bottom` at the fold's `openMs`, so
// the screen rises with the fold's physics and Back is the same curve reversed, natively.
// Reduced motion: `none`. (`animationDuration` is honoured on iOS; Android takes the
// platform's default for the animation, which is inside the 700ms budget.)
//
// THE FLIGHT (D2-6 · CUL-1069): when the card staged one for this identity, the slide is
// SUPPRESSED — the transition is a `fade` at the flight's `groundMs`, so Home crossfades
// into the screen under the chart flying at the root (`FlightHost`), and Back is the same
// fade reversed. Latched on the first render: the pop must use the transition the push
// used, whatever the store says by then.

export const OFF_TITLE = 'Nothing to show here';
export const OFF_BODY = "This link doesn't open a signal. Your pet's Signals are on Home.";

export default function SignalRoute() {
  const signedIn = useAuthStore((s) => s.session != null);
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string; pet?: string }>();
  const parsed = parseSignalRouteParams(params);
  const [flew] = useState(() => (signedIn && parsed ? peekFlight(parsed.identity) : false));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: reducedMotion ? 'none' : flew ? 'fade' : 'slide_from_bottom',
          animationDuration: flew ? FLIGHT_MOTION.groundMs : SIGNAL_OPEN_MOTION.riseMs,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      {signedIn && parsed ? (
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
