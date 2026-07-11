import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { NightGround } from './NightGround';
import { WhorlSpinner } from './WhorlSpinner';

// The night moment (B-284 §6): when a full-screen wait has nothing else to show yet
// — cold-start hydration, vet-report generation, a photo read — the wait itself
// becomes a branded screen: the night ground, the Whorl at medium-large scale as a
// background TEXTURE (0.9–1.1× width, 40–55% stroke opacity; the core dot stays the
// one full-opacity focal point), and one warm line lower-third.
//
// Presentational + lifecycle: hosts toggle `visible`; the moment holds for at least
// MIN_HOLD_MS (no sub-600ms flash) and DISSOLVES over DISSOLVE_MS to whatever is
// behind it (Home / the report). Reduced-motion: the whole composition is static
// (WhorlSpinner + NightGround render their static frames) and the fades are instant
// — the copy carries the moment.
//
// Trigger discipline lives with the CALLER (all three of: full-screen blocking wait
// AND >~2s AND real work on the pet's behalf) — this component only renders the moment.
//
// It fills its PARENT (absolute fill) and self-measures via onLayout, so it composes
// two ways: mounted at the app root it fills the window (cold start); dropped into a
// screen's flex body it fills just that body — leaving a custom Header + its back
// button tappable above (the report / capture screens), never trapping navigation.
// The solid colorBrandNight fill paints immediately, covering the one-frame measure gap.

const MIN_HOLD_MS = 600;
const DISSOLVE_MS = 700;

// Whorl scale/opacity within the §6 ranges — the exact values are an on-device
// tuning AC, locked at the N3 QA pass on the PM's phone, then recorded in the spec.
const WHORL_WIDTH_FRACTION = 1.0; // 0.9–1.1× screen width
const WHORL_RIDGE_OPACITY = 0.5; // 40–55% stroke opacity (background texture)
const WHORL_CENTER_Y_FRACTION = 0.36; // centered upper-middle

export interface NightMomentProps {
  visible: boolean;
  /** Lower-third title (§9, display face). */
  title: string;
  /** One short line under the title (§9). */
  subtitle: string;
}

export function NightMoment({ visible, title, subtitle }: NightMomentProps) {
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const shownAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard the deferred dissolve callback so a mid-dissolve unmount (e.g. the pet
  // clears during hydration) never calls setState on an unmounted component.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // A component that MOUNTS already-visible (report/capture sites pass a hardcoded
  // `visible`) is primed opaque by the initial useRef — so on that first run we must
  // NOT reset to 0 and re-fade, which flashes the screen behind through. Fade in only
  // on a genuine false→true transition (cold start).
  const firstRun = useRef(true);

  useEffect(() => {
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (visible) {
      setMounted(true);
      shownAt.current = Date.now();
      if (reduced || isFirst) {
        opacity.setValue(1);
      } else {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: theme.durationMedium,
          useNativeDriver: true,
        }).start();
      }
    } else {
      // Hold at least MIN_HOLD_MS from when it appeared, then dissolve out.
      const elapsed = Date.now() - shownAt.current;
      const wait = Math.max(0, MIN_HOLD_MS - elapsed);
      hideTimer.current = setTimeout(() => {
        if (!alive.current) return;
        if (reduced) {
          opacity.setValue(0);
          setMounted(false);
        } else {
          Animated.timing(opacity, {
            toValue: 0,
            duration: DISSOLVE_MS,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished && alive.current) setMounted(false);
          });
        }
      }, wait);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, reduced, opacity]);

  if (!mounted && !visible) return null;

  const { w, h } = size;
  const whorlPx = w * WHORL_WIDTH_FRACTION;
  const whorlTop = h * WHORL_CENTER_Y_FRACTION - whorlPx / 2;

  return (
    // Blocks taps beneath while up (it IS the wait). The solid night fill paints
    // before the SVG layers measure, so there's no flash of the screen behind.
    <Animated.View style={[styles.fill, { opacity }]} pointerEvents={visible ? 'auto' : 'none'} onLayout={onLayout}>
      {w > 0 && h > 0 && (
        <>
          <NightGround width={w} height={h} />
          {/* Background-texture whorl — behind the copy, dimmed ridges, full-opacity dot. */}
          <View style={[styles.whorlLayer, { top: whorlTop, left: (w - whorlPx) / 2 }]} pointerEvents="none">
            <WhorlSpinner size={whorlPx} ground="night" ridgeOpacity={WHORL_RIDGE_OPACITY} />
          </View>
        </>
      )}
      <View style={styles.copy} pointerEvents="none">
        <Text style={styles.title} accessibilityRole="text">
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colorBrandNight,
    // Above the Stack/Toast layers, matching ColdStartOverlay's takeover z.
    zIndex: 100,
  },
  whorlLayer: {
    position: 'absolute',
  },
  copy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.space6,
    alignItems: 'center',
    paddingHorizontal: theme.space4,
    gap: theme.space1,
  },
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textPageTitle,
    color: theme.colorMoonlight,
    textAlign: 'center',
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextOnNightMuted,
    textAlign: 'center',
    lineHeight: theme.lineHeightBody,
  },
});
