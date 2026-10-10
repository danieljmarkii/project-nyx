import { useId, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';
import {
  COMPLETION_MOTION, checkRevealFor, type CheckReveal, type CompletionMarkMotion,
} from '../motion/completionMotion';

// The completion cards' check (CUL-1691). A solid teal disc, the check knocked out of it
// in the card's own ground, and — on a celebrate beat only — the warm-gold halo DRAWN as
// a radial gradient behind it, starting after a 2pt gap of that same ground (spec §1,
// D2), so the gold never touches the disc.
//
// Why not a ring plus a layer shadow, as before: the old badge's fill was 6% white with
// no `shadowPath`, so iOS traced the gold shadow off the composite alpha — a 1.5pt ring
// and a 3pt stroke — and re-rasterised it offscreen on every frame of the spring. The
// halo hugged two thin lines and read as grain on device. A drawn gradient has nothing
// to trace and stays vector at every scale the caller's transform passes through.
//
// THREE LAYERS (spec §3 item 2): the halo, the disc, and the check's window, each a View
// the motion moves; the SVG inside each is drawn once and never animated (§2.5: no
// animated react-native-svg prop, and scale lives on Views, never on `<G>`). With no
// `motion` passed every layer is drawn at rest, so a card that has not adopted the
// motion is drawn exactly as before.
//
// The box is MARK_SIZE square and the halo paints outside it (absolute, not clipped),
// so the slot a caller measures (the meal card's flight target) keeps its geometry.
//
// Silent by construction, and named in `guards/haptics.test.ts`'s ALWAYS_SCANNED: the
// mark sits beside a vet-call line on the meal and named cards.

export const MARK_SIZE = 32;
const HALO_SIZE = 52;
// The ground the check is knocked out in and the halo's gap shows. It IS the cards'
// ground: the three completion cards paint their `card` with this constant, so the knock-out can never drift from the surface it sits on.
export const COMPLETION_GROUND = theme.colorSurface;
// The halo's stops, as fractions of its 26pt radius: transparent out to r18 (the
// disc's r16 plus the 2pt gap), the gold's peak at r18.2, fading to nothing at r26.
// A 0.2pt ramp reads as a hard stop and needs no two stops at one offset.
export const HALO_GAP_OFFSET = 0.692;
export const HALO_PEAK_OFFSET = 0.7;
/** The check, in the mark's 32pt viewBox: a short stroke down, a long stroke up. ONE
 *  constant, drawn by this mark and by the flight's vessel (`MealMark.tsx`), so the
 *  release compares one glyph. */
export const CHECK_PATH_D = 'M10 16.6l4.1 4.1 8-8.6';
export const CHECK_STROKE_WIDTH = 2.6;

interface CompletionMarkProps {
  /** The celebrate warmth. Off over a refusal, a calm symptom, a weight (CUL-894). */
  halo: boolean;
  /** The card's clock. Absent: every layer at rest. */
  motion?: CompletionMarkMotion;
  /** Overrides the platform's technique; for tests. */
  reveal?: CheckReveal;
}

const BOX = COMPLETION_MOTION.checkBox;

/** The check, drawn once at the mark's full size. */
export function CheckGlyph({ size = MARK_SIZE, testID }: { size?: number; testID?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        testID={testID}
        d={CHECK_PATH_D}
        stroke={COMPLETION_GROUND}
        strokeWidth={CHECK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function CompletionMark({ halo, motion, reveal = checkRevealFor() }: CompletionMarkProps) {
  const gradientId = `completion-mark-halo-${useId()}`;
  const write = motion?.write;
  // Built once per clock, so a re-render never re-attaches the native graph.
  const slide = useMemo(
    () => (write
      ? {
          outer: Animated.multiply(Animated.add(write, -1), BOX.w),
          inner: Animated.multiply(Animated.subtract(1, write), BOX.w),
          cover: Animated.subtract(1, write),
        }
      : null),
    [write],
  );
  return (
    <View style={styles.box} pointerEvents="none">
      {halo && (
        <Animated.View
          testID="completion-mark-halo-layer"
          style={[styles.halo, motion ? { opacity: motion.halo } : null]}
        >
          <Svg testID="completion-mark-halo" width={HALO_SIZE} height={HALO_SIZE}>
            <Defs>
              <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
                <Stop offset={0} stopColor={theme.colorMomentGlow} stopOpacity={0} />
                <Stop offset={HALO_GAP_OFFSET} stopColor={theme.colorMomentGlow} stopOpacity={0} />
                <Stop offset={HALO_PEAK_OFFSET} stopColor={theme.colorMomentGlow} stopOpacity={0.34} />
                <Stop offset={1} stopColor={theme.colorMomentGlow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={HALO_SIZE / 2} cy={HALO_SIZE / 2} r={HALO_SIZE / 2} fill={`url(#${gradientId})`} />
          </Svg>
        </Animated.View>
      )}
      <Animated.View
        testID="completion-mark-disc-layer"
        style={[styles.disc, motion ? { opacity: motion.layers, transform: [{ scale: motion.disc }] } : null]}
      >
        <Svg testID="completion-mark-disc" width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 32 32">
          <Circle cx={16} cy={16} r={16} fill={theme.colorAccentGlyph} />
        </Svg>
        {reveal === 'window' ? (
          // The window: the outer View clips at the check's box and slides −w → 0; the
          // inner slides +w → 0 off the same value, so the check itself never moves.
          <Animated.View
            testID="completion-mark-check-window"
            style={[
              styles.window,
              slide ? { transform: [{ translateX: slide.outer }] } : null,
            ]}
          >
            <Animated.View
              style={[
                styles.windowInner,
                slide ? { transform: [{ translateX: slide.inner }] } : null,
              ]}
            >
              <CheckGlyph testID="completion-mark-check" />
            </Animated.View>
          </Animated.View>
        ) : (
          // The cover: a teal patch over the static check, shrinking toward its right
          // edge as the check is written (and growing back from it on Undo, tip first).
          <View style={styles.coverHost} testID="completion-mark-check-cover-host">
            <CheckGlyph testID="completion-mark-check" />
            {slide && (
              <Animated.View
                testID="completion-mark-check-cover"
                style={[styles.cover, { transform: [{ scaleX: slide.cover }] }]}
              />
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  halo: {
    position: 'absolute',
    left: (MARK_SIZE - HALO_SIZE) / 2,
    top: (MARK_SIZE - HALO_SIZE) / 2,
    width: HALO_SIZE,
    height: HALO_SIZE,
  },
  disc: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  window: {
    position: 'absolute',
    left: BOX.x,
    top: BOX.y,
    width: BOX.w,
    height: BOX.h,
    overflow: 'hidden',
  },
  windowInner: {
    position: 'absolute',
    left: -BOX.x,
    top: -BOX.y,
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  coverHost: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  cover: {
    position: 'absolute',
    left: BOX.x,
    top: BOX.y,
    width: BOX.w,
    height: BOX.h,
    backgroundColor: theme.colorAccentGlyph,
    transformOrigin: 'right',
  },
});
