import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { PILL_GLYPH } from '../../lib/fanBudget';
import { EventIcon } from '../event/EventIcon';
import { useAppActive } from '../../hooks/useAppActive';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMomentStore } from '../../store/momentStore';
import { setHeroReady, useFlightState } from '../motion/flightMotion';
import { COMPLETION_MOTION, EASE, checkRevealFor, easedSegment, type CheckReveal } from '../motion/completionMotion';
import { CheckGlyph } from './CompletionMark';

// The food pill's meal disc, and the vessel the + path flies (CUL-1643, CUL-1691 PR 2).
//
// Moved out of `components/log/FAB.tsx` (spec §3 item 2): the disc is drawn twice, in
// the pill and as the flight's clone at the root, and the clone now carries the landing
// itself. FAB keeps `insertMeal` and the `showMeal` call (`guards/completionCard.test.ts`)
// and imports both components from here. Named in `guards/haptics.test.ts`'s
// ALWAYS_SCANNED: the vessel lands on a card that can carry a vet-call line, and a
// "landed" buzz here would read as natural and be wrong. Silent.

/** A food pill's meal disc: 28pt, the meal tint, the meal glyph. `hidden` while its own
 *  clone flies, so the disc is never in two places. */
export function MealMark({ hidden = false }: { hidden?: boolean }) {
  return (
    <View style={[styles.glyph, styles.meal, hidden && styles.flown]}>
      <EventIcon type="meal" size={16} />
    </View>
  );
}

interface FlightVesselProps {
  /** The meal's event id: the flight's identity and the card's record. */
  identity: string;
  /** Overrides the platform's technique; for tests. */
  reveal?: CheckReveal;
}

/**
 * The + path's clone: the meal disc, then on the flight's `landed` phase a teal fill
 * grows from its centre and reveals the white check — one beat (§2.2). When the fill is
 * done the vessel RELEASES the flight (`setHeroReady`), so the card's own mark replaces
 * it in one commit. The card no longer releases anything; one owner per path.
 *
 * Nothing may leave a + flight in `landed`: the vessel releases at once on app blur and
 * under Reduce Motion, and its valve releases `discFillMs + valveSlackMs` after `landed`
 * with no report. Once its card has gone (hidden, superseded, undone) the vessel fades
 * itself and NOTHING releases it: the card's scheduled abort is the only end, so a
 * landing can never unmount a clone part-faded (§2.3 Exit).
 */
export function FlightVessel({ identity, reveal = checkRevealFor() }: FlightVesselProps) {
  const { phase, flight } = useFlightState();
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const visible = useMomentStore((s) => s.visible);
  const cardId = useMomentStore((s) => s.payload?.eventId ?? null);
  const removed = useMomentStore((s) => s.removed);

  const fillClock = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const nodes = useMemo(() => {
    const scale = easedSegment(fillClock, 0, COMPLETION_MOTION.discFillMs, COMPLETION_MOTION.vesselFromScale, 1, EASE.fill);
    return {
      scale,
      // The check's net scale is 1 on every frame: the growing circle REVEALS a
      // full-size check rather than growing one.
      counter: Animated.divide(1, scale),
      // `'cover'`: the check fades in over the fill's last 60ms instead.
      coverCheck: easedSegment(fillClock, COMPLETION_MOTION.discFillMs - 60, 60, 0, 1, EASE.linear),
    };
  }, [fillClock]);
  const [filling, setFilling] = useState(false);

  const started = useRef(false);
  const released = useRef(false);
  const leaving = useRef(false);
  const seenShown = useRef(false);
  const fill = useRef<Animated.CompositeAnimation | null>(null);
  const valve = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearValve = () => {
    if (valve.current) clearTimeout(valve.current);
    valve.current = null;
  };

  // Pin the fill whole and hand the flight back. Finished or not: a stopped fill still
  // releases, so the clone never waits in `landed`.
  const release = () => {
    if (released.current || leaving.current) return;
    released.current = true;
    clearValve();
    fill.current?.stop();
    fill.current = null;
    fillClock.setValue(COMPLETION_MOTION.discFillMs);
    setHeroReady(identity, true);
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;

  const landedHere = phase === 'landed' && flight?.identity === identity;
  useEffect(() => {
    if (!landedHere || started.current || leaving.current) return;
    started.current = true;
    setFilling(true);
    if (reduced || !appActive) {
      releaseRef.current();
      return;
    }
    fillClock.setValue(0);
    const a = Animated.timing(fillClock, {
      toValue: COMPLETION_MOTION.discFillMs,
      duration: COMPLETION_MOTION.discFillMs,
      easing: EASE.linear,
      useNativeDriver: true,
    });
    fill.current = a;
    a.start(() => releaseRef.current());
    valve.current = setTimeout(() => releaseRef.current(), COMPLETION_MOTION.discFillMs + COMPLETION_MOTION.valveSlackMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landedHere]);

  useEffect(() => {
    if (!appActive && started.current) releaseRef.current();
  }, [appActive]);

  // The card leaving takes the vessel with it: on the EDGE, never a level check.
  const mine = visible && cardId === identity && !removed;
  useEffect(() => {
    if (mine) {
      seenShown.current = true;
      return;
    }
    if (!seenShown.current || leaving.current) return;
    leaving.current = true;
    clearValve();
    fill.current?.stop();
    fill.current = null;
    Animated.timing(opacity, {
      toValue: 0,
      duration: removed && cardId === identity ? COMPLETION_MOTION.unwriteMs : COMPLETION_MOTION.exitMs,
      easing: EASE.exit,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  useEffect(() => () => {
    clearValve();
    fill.current?.stop();
  }, []);

  return (
    <Animated.View testID="flight-vessel" style={[styles.glyph, { opacity }]}>
      <MealMark />
      {filling && (
        <Animated.View testID="flight-vessel-fill" style={[styles.fill, { transform: [{ scale: nodes.scale }] }]}>
          {reveal === 'window' && (
            <Animated.View style={[styles.fillCheck, { transform: [{ scale: nodes.counter }] }]}>
              <CheckGlyph size={PILL_GLYPH} testID="flight-vessel-check" />
            </Animated.View>
          )}
        </Animated.View>
      )}
      {filling && reveal === 'cover' && (
        <Animated.View style={[styles.fillCheck, { opacity: nodes.coverCheck }]}>
          <CheckGlyph size={PILL_GLYPH} testID="flight-vessel-check" />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: PILL_GLYPH,
    height: PILL_GLYPH,
    borderRadius: PILL_GLYPH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meal: {
    backgroundColor: theme.colorEventMealLight,
  },
  // CUL-1643: the chosen food's mark while its clone flies, so it is never in two places.
  flown: {
    opacity: 0,
  },
  // A circle the vessel's size over the meal disc: the card's disc teal, clipped round.
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PILL_GLYPH,
    height: PILL_GLYPH,
    borderRadius: PILL_GLYPH / 2,
    overflow: 'hidden',
    backgroundColor: theme.colorAccentGlyph,
  },
  fillCheck: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PILL_GLYPH,
    height: PILL_GLYPH,
  },
});
