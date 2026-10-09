import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';

// The completion cards' check (CUL-1691). One vector node: a solid teal disc, the
// check knocked out of it in the card's own ground, and — on a celebrate beat only —
// the warm-gold halo DRAWN as a radial gradient behind it, starting after a 2pt gap of
// that same ground (spec §1, D2), so the gold never touches the disc.
//
// Why not a ring plus a layer shadow, as before: the old badge's fill was 6% white with
// no `shadowPath`, so iOS traced the gold shadow off the composite alpha — a 1.5pt ring
// and a 3pt stroke — and re-rasterised it offscreen on every frame of the spring. The
// halo hugged two thin lines and read as grain on device. A drawn gradient has nothing
// to trace and stays vector at every scale the caller's transform passes through.
//
// The box is MARK_SIZE square and the halo paints outside it (absolute, not clipped),
// so the slot a caller measures (the meal card's flight target) keeps its geometry.

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

interface CompletionMarkProps {
  /** The celebrate warmth. Off over a refusal, a calm symptom, a weight (CUL-894). */
  halo: boolean;
}

export function CompletionMark({ halo }: CompletionMarkProps) {
  const gradientId = `completion-mark-halo-${useId()}`;
  return (
    <View style={styles.box} pointerEvents="none">
      {halo && (
        <Svg testID="completion-mark-halo" width={HALO_SIZE} height={HALO_SIZE} style={styles.halo}>
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
      )}
      <Svg testID="completion-mark-disc" width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 32 32">
        <Circle cx={16} cy={16} r={16} fill={theme.colorAccentGlyph} />
        <Path
          testID="completion-mark-check"
          d="M10 16.6l4.1 4.1 8-8.6"
          stroke={COMPLETION_GROUND}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
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
  },
});
