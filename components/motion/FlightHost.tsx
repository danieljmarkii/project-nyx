import { Animated, StyleSheet, View } from 'react-native';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useFlightClone } from './flightMotion';

// The flight's clone, at the ROOT (D2-6 · CUL-1069). Mounted once in `app/_layout.tsx`
// above the whole stack, so a push cannot unmount it: the card's chart is drawn here at
// the card's own size and place, and the three native-driver values in `flightMotion.ts`
// carry it — uniformly scaled and translated, `transformOrigin` at its top-left corner
// so the pose IS the rect — to the screen's hero and back. Idle, this renders nothing.
//
// Invisible to everything but the eye: `pointerEvents="none"` (a tap during the flight
// reaches the screen underneath), and hidden from assistive tech on both platforms —
// VoiceOver's focus goes to the screen's title, never to a clone that is about to leave.
// No haptic here and none may be added (the module's header; `guards/haptics.test.ts`).
// It carries the meal mark too (CUL-1643), so it paints above the completion cards.

export function FlightHost() {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const { state, values } = useFlightClone({ reducedMotion, appActive });
  if (state.phase === 'idle' || !state.flight) return null;
  const { source, element } = state.flight;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.layer]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="flight-host"
    >
      <Animated.View
        style={[
          styles.clone,
          {
            width: source.width,
            transform: [{ translateX: values.translateX }, { translateY: values.translateY }, { scale: values.scale }],
          },
        ]}
        testID="flight-clone"
      >
        {element}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the completion cards (CUL-1643): the meal mark lands INTO the meal card's check,
  // and the card's wrapper is `zIndex` 50 / `elevation` 12, so being drawn after it is not
  // enough. With no background the elevation casts no shadow; it only orders the layer.
  layer: {
    zIndex: 60,
    elevation: 13,
  },
  clone: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
});
