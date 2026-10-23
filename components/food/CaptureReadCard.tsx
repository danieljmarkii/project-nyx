// Food capture's read card (CUL-1910, capture design round P3 + P4; mock
// `docs/culprit-capture-design-pass-mockups.html` §05, §06, §16).
//
// ONE CARD FOR THE WAIT AND THE READ. While the label photos upload and are read, the
// card holds the tick at its rail, named for the request; when the read answers, the tick
// grows into the card's rail and the facts fill in place. The choreography is the node
// arrival's (`useNodeArrival`, components/motion/arrivalMotion.ts), constants unchanged,
// the same one History's spine row runs: this file binds it, it owns no number.
//
// THE TRIGGER IS THE REQUEST (C-30): `reading` is the screen's own in-flight flag, and
// the arrival fires only on reading → landed on this mount. A read that fails never lands
// here (the screen leaves for the typed form), so nothing arrives that was not read.
//
// The rail is the good-fact teal (`colorRoles.positive.glyphOnLight`): the label was read.
// It says nothing about the pet, and the provenance line under the facts still says when
// the ingredient list was not read, so a partial read never looks complete (§07).
import { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { useNodeArrival } from '../motion/arrivalMotion';
import { GUTTER_RAIL, HomeCard } from '../surfaces/home/HomeCard';
import { Line, SilhouetteFrame } from '../surfaces/waits/Silhouette';
import { TICK_MOTION } from '../surfaces/waits/Tick';
import { CAPTURE_WAIT_LABEL } from '../surfaces/waits/CaptureSilhouette';
import { FactRows, type Fact } from '../ui/FactRows';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';

export const CAPTURE_READ_HEADING = 'Read from your photo';

export interface CaptureReadCardProps {
  /** The upload-and-read request is in flight. */
  reading: boolean;
  facts: readonly Fact[];
  /** The protein provenance line, rendered by the caller (ProteinDisclosure). */
  provenance?: ReactNode;
  /** The capture's identity; a change mid-flight abandons the arrival. */
  identity: string;
}

export function CaptureReadCard({ reading, facts, provenance, identity }: CaptureReadCardProps) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const arrival = useNodeArrival({
    awaitingRead: reading,
    landed: !reading,
    reducedMotion,
    appActive,
    identity,
    tickHeight: TICK_MOTION.height,
  });
  const { values, heldHeight, railHeight, inFlight, breathing } = arrival;
  const railOut = railHeight != null;

  const waiting = (
    <View style={styles.waiting} accessible accessibilityRole="progressbar" accessibilityLabel={CAPTURE_WAIT_LABEL}>
      <ThemedText variant="caption" style={styles.waitingLabel}>{CAPTURE_WAIT_LABEL}</ThemedText>
      <SilhouetteFrame testID="capture-read-silhouette" style={styles.lines}>
        <Line width="70%" />
        <Line width="90%" />
        <Line width="55%" />
        <Line width="80%" />
      </SilhouetteFrame>
    </View>
  );

  return (
    <HomeCard testID="capture-read-card">
      <View>
        {/* THE ONE RAIL: the same element waiting and landed; only its style changes. */}
        <Animated.View
          testID="capture-read-rail"
          style={[
            GUTTER_RAIL,
            reading ? styles.railTick : styles.railLanded,
            railOut
              ? {
                  top: 0,
                  bottom: undefined,
                  height: railHeight,
                  transform: [{ translateY: values.railShift }, { scaleY: values.railScale }],
                }
              : reading
                ? styles.railTickPlace
                : styles.railFull,
            breathing ? { opacity: values.tickOpacity } : null,
          ]}
        />
        {/* The clip holds the waiting box's height through the rail's beat. It wraps the
            content only: the rail hangs in the card's gutter, outside it. */}
        <View style={[heldHeight != null ? { height: heldHeight, overflow: 'hidden' } : null, inFlight ? styles.clip : null]}>
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (reading) arrival.onPendingLayout(h);
              else arrival.onContentLayout(h);
            }}
          >
            {reading ? (
              waiting
            ) : (
              <Animated.View style={{ opacity: values.bodyOpacity, transform: [{ translateY: values.bodyShift }] }}>
                <SectionLabel label={CAPTURE_READ_HEADING} />
                <FactRows facts={facts} testID="capture-read-facts" />
                {provenance}
              </Animated.View>
            )}
            {inFlight ? (
              // The waiting line, leaving in the rail's own window: out of the flow, so the
              // facts can already be in it at opacity 0.
              <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: values.pendingOpacity }]}>
                {waiting}
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    </HomeCard>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  railTick: {
    backgroundColor: theme.colorBorderStrong,
  },
  railLanded: {
    backgroundColor: colorRoles.positive.glyphOnLight,
  },
  railTickPlace: {
    top: 0,
    height: TICK_MOTION.height,
  },
  railFull: {
    top: 0,
    bottom: 0,
  },
  waiting: {
    gap: theme.space1,
  },
  waitingLabel: {
    color: theme.colorTextSecondary,
  },
  lines: {
    gap: theme.space1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
