// A look word's chip — the chosen state (CUL-871 / N-4a; daily-look spec §3.1a R15/R16).
//
// It is `components/ui/FilterChip.tsx`'s accent treatment carried further, not a new
// visual language: a chosen chip must mean the same thing on every screen of the app.
// What round 4 asked for ("ramp it up by about 20 percent") is a deeper wash, an ink
// one notch darker, a heavier hairline and a mark — louder, still the same idea.
//
// ── SELECTION CHANGES COLOUR AND NEVER GEOMETRY ──────────────────────────────
// The round-2 product read blocked a chip that GREW when chosen, and round 3 found the
// same defect again in a new mechanism: a check that widens a pill moves the next tap
// target, so the second word an owner reaches for is no longer under her thumb. Three
// things keep the box still, and each is arithmetic rather than intention:
//
//   1. The check is drawn INSIDE the pill's own padding — PAD_LEFT (14) becomes
//      PAD_LEFT_MARKED (4) + CHECK_W (7) + CHECK_GAP (3), which is 14. The test asserts
//      that identity, not a screenshot.
//   2. The heavier hairline is an INSET RING — an absolutely-positioned overlay inside
//      the border box — so `borderWidth` never changes.
//   3. The settle ring is TRANSIENT and absolutely positioned OUTSIDE the flow: it
//      draws out to 4 pt and fades to nothing, so no halo ever sits in the 6 pt gap
//      between two chosen chips (C-5).
//
// The label's weight is 500 in both states for the same reason: a bold swap re-flows
// the text inside the pill.
//
// ── THE HINT IS THE GLOSS (§4.1 rule 12) ─────────────────────────────────────
// Home shows the head word; the grid shows *head, gloss*. The gloss is never dropped,
// and where it is not visible it is the chip's accessibility hint — "Lip-licking"
// alone lost the findable half (Sam), and a screen-reader user should not be the one
// who loses it.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

/** The unchosen pill's left padding, and the three numbers that replace it when the
 *  mark is drawn. Exported because the geometry test asserts the identity between them
 *  rather than trusting the styles below to agree (`LookChip.test.tsx`). */
export const PAD_LEFT = 14;
export const PAD_LEFT_MARKED = 4;
export const CHECK_W = 7;
export const CHECK_GAP = 3;

/** The transient settle ring: 4 pt out, 300 ms, a 1.02 overshoot — selection
 *  vocabulary, not a toggle's. It fades to nothing, so it is never a resting halo. */
export const SETTLE_RING_PT = 4;
export const SETTLE_MS = 300;

interface Props {
  label: string;
  /** The gloss, when the visible label does not already carry it. Becomes the
   *  accessibility hint. Null on the grid, where the label IS *head, gloss*. */
  hint?: string | null;
  selected: boolean;
  onPress: () => void;
  /** Reduced motion: the end state, no draw (§3.1a). */
  reducedMotion?: boolean;
  testID?: string;
}

export function LookChip({ label, hint, selected, onPress, reducedMotion = false, testID }: Props) {
  const settle = useRef(new Animated.Value(0)).current;
  const wasSelected = useRef(selected);

  useEffect(() => {
    const became = selected && !wasSelected.current;
    wasSelected.current = selected;
    if (!became || reducedMotion) return;
    settle.setValue(0);
    const anim = Animated.timing(settle, {
      toValue: 1,
      duration: SETTLE_MS,
      // The overshoot the mock names (cubic-bezier(.2,.8,.2,1.18)) — a ring that
      // passes its size and settles, rather than easing politely into it.
      easing: Easing.bezier(0.2, 0.8, 0.2, 1.18),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      // Pin the end state: the ring's job is to be GONE, and a native-driver value
      // that never wrote back would leave it half-drawn on the next commit.
      if (finished) settle.setValue(1);
    });
    return () => anim.stop();
  }, [selected, reducedMotion, settle]);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipRest]}
      // A word is one of many that can be true at once (*more than one can be true*),
      // so it is a checkbox, never a radio — and a checkbox announces `checked`, where
      // TalkBack reads a `selected` checkbox as "not checked" whatever the visual says
      // (the B-168 finding, inherited from FilterChip).
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={hint ?? undefined}
      // Vertical-only, so two chips in a row never share a tap zone (C-5). The 6 pt
      // row gap plus this 6 pt reach on each side is the geometry the grid is laid
      // out against.
      hitSlop={{ top: 6, bottom: 6 }}
    >
      {selected && (
        <>
          {/* The heavier hairline, drawn INSIDE the border box so nothing grows. */}
          <View pointerEvents="none" style={styles.insetRing} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.settleRing,
              {
                opacity: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [
                  { scale: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
                ],
              },
            ]}
          />
          <View style={styles.checkSlot}>
            <Check
              size={CHECK_W}
              color={theme.colorAccentInkSelected}
              strokeWidth={3}
              // Decorative: `accessibilityState.checked` already says it, and a screen
              // reader announcing "check" over the word would say it twice.
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        </>
      )}
      <ThemedText style={[styles.label, selected && styles.labelSelected]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: PAD_LEFT,
    borderRadius: theme.radiusFull,
    // Constant in both states — the heavier chosen ring is the inset overlay, never a
    // thicker border (which would move the label by half a point and re-wrap a row).
    borderWidth: 1,
  },
  chipRest: {
    paddingLeft: PAD_LEFT,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  chipSelected: {
    // 4 + 7 + 3 = 14. The identity the test pins.
    paddingLeft: PAD_LEFT_MARKED,
    borderColor: theme.colorAccentInkSelected,
    backgroundColor: theme.colorAccentWashDeep,
  },
  checkSlot: {
    width: CHECK_W,
    marginRight: CHECK_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insetRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorAccentInkSelected,
  },
  settleRing: {
    position: 'absolute',
    top: -SETTLE_RING_PT,
    left: -SETTLE_RING_PT,
    right: -SETTLE_RING_PT,
    bottom: -SETTLE_RING_PT,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorAccentInkSelected,
  },
  label: {
    fontSize: theme.textSM,
    // 500 in BOTH states (see the header): a weight swap re-flows the pill.
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  labelSelected: {
    // The selected ink, at full opacity — `colorAccentInk` measures 4.40:1 on this
    // wash, under AA (constants/theme.contrast.test.ts pins both halves).
    color: theme.colorAccentInkSelected,
  },
});
