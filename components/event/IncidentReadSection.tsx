// The AI READ section's frame, and the stage the read ARRIVES on (CUL-804 · incident
// spec §7). One component for the vomit and stool sections, for the same reason
// `IncidentReadCard` is one: a motion that must look identical on both surfaces belongs in
// the one place both render.
//
// IDLE IS THE SHIPPED TREE, TO THE BYTE. Waiting or settled, this renders exactly what the
// two sections rendered before PR 3 — a `View` holding the label and one child — and the
// `onLayout` the pending box carries adds no node. Every wrapper below mounts only while a
// beat is in flight, which is what the §7 snapshot proves: the arrival adds nothing to the
// tree an owner is actually looking at.
//
// The three nodes that mount for ~450ms and then leave:
//   · the CLIP — the content slot held at the pending box's height, `overflow: hidden`
//     for the whole flight so the box opens AROUND the content rather than revealing it
//     all at once when the height is released;
//   · the LAND — the content's own fade-and-drift (beat 3), and the measurement the rail's
//     explicit height comes from;
//   · the GHOST — the pending box, out of the flow at the slot's own offset, fading over
//     the card that replaced it. It is hidden from assistive tech: a screen reader must
//     hear the read that landed, never the spinner copy that is on its way out.
import { type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { type IncidentArrival } from '../motion/arrivalMotion';
import { ThemedText } from '../ui/ThemedText';
import { IncidentReadPending } from './IncidentReadCard';

export const INCIDENT_READ_SECTION_LABEL = 'AI READ';

export function IncidentReadSection({
  arrival,
  pending,
  children,
}: {
  arrival: IncidentArrival;
  /** The analysis has not resolved — the pending box is the section's whole content. */
  pending: boolean;
  /** The landed content: the read card, or the failed / capped / not-enough card. */
  children?: ReactNode;
}) {
  const { phase, inFlight, heldHeight, slotTop, values } = arrival;

  let slot: ReactNode;
  if (pending) {
    slot = (
      <IncidentReadPending
        onLayout={(e) => arrival.onPendingLayout(e.nativeEvent.layout.height, e.nativeEvent.layout.y)}
      />
    );
  } else if (phase === 'crossfade') {
    // Reduced motion: opacity only. No clip, no translate, no held height.
    slot = (
      <Animated.View testID="incident-read-land" style={{ opacity: values.bodyOpacity }}>
        {children}
      </Animated.View>
    );
  } else if (inFlight) {
    slot = (
      <View testID="incident-read-clip" style={[styles.clip, heldHeight != null ? { height: heldHeight } : null]}>
        <Animated.View
          testID="incident-read-land"
          onLayout={(e) => arrival.onContentLayout(e.nativeEvent.layout.height)}
          style={{ opacity: values.bodyOpacity, transform: [{ translateY: values.bodyShift }] }}
        >
          {children}
        </Animated.View>
      </View>
    );
  } else {
    slot = children;
  }

  return (
    <View testID="incident-read-section" style={styles.section}>
      <ThemedText style={styles.sectionLabel}>{INCIDENT_READ_SECTION_LABEL}</ThemedText>
      {inFlight ? (
        <Animated.View
          testID="incident-read-ghost"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.ghost, slotTop != null ? { top: slotTop } : null, { opacity: values.pendingOpacity }]}
        >
          <IncidentReadPending />
        </Animated.View>
      ) : null}
      {slot}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: theme.space3,
  },
  sectionLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWidest,
    marginBottom: theme.space1,
  },
  // `overflow: hidden` holds for the WHOLE flight, not just while a height is held:
  // releasing both in the same commit would paint the content at full height the instant
  // beat 2 starts, and the box would animate around something already fully visible.
  clip: {
    overflow: 'hidden',
  },
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
