// The Noticed grid's pinned exits — the way back and the Done bar (CUL-871 / N-4a;
// docs/nyx-daily-look-requirements.md §3.1a, T-21; the review's E-9).
//
// WHY THEY ARE HOME'S AND NOT THE CARD'S. The card lives inside Home's `ScrollView`,
// so anything absolutely positioned inside it scrolls away with it — which is exactly
// the failure T-21 was written for: rounds 2 and 3 put the way back at the FOOT of the
// word list, and the PM found it unusable on a long list. So this is a second absolute
// layer beside `PullToRefreshSky`, mounted by the screen, reading the handles the card
// published (`store/uiStore.ts`).
//
// ── EACH EXIT APPEARS ONLY WHEN ITS OWN ROW HAS SCROLLED OUT OF REACH ────────
// The card renders BOTH controls in its flow, always. This layer draws a pinned copy of
// one only while that copy is the only one on screen:
//
//   • the way back pins once the card's TOP has passed the top of the viewport, and
//   • the Done bar pins while the card's BOTTOM is below the bottom of the viewport.
//
// That is what keeps the promise "never over a safety card": the top exit can only
// appear while the top of the screen is the card's own grid, because the card's top is
// above the fold by construction. And because the in-flow rows never leave the layout,
// nothing reflows as the owner scrolls — the pin is a copy, not a move.
//
// ── AND THE FAB STEPS ASIDE ──────────────────────────────────────────────────
// The Done bar and the FAB want the same corner (the FAB's box is 72–128 pt off the
// screen bottom; this bar sits in Home's body, whose own bottom edge is the tab bar).
// They would overlap, so the FAB reads `captureOverlay` and stands down while the grid
// is open — `LookExits.test.tsx` pins the overlap, so the hide is load-bearing rather
// than decorative.

import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { useUiStore } from '../../store/uiStore';
import { LOOK_DONE, LOOK_FEWER_WORDS } from '../../lib/lookCard';

/** The bar's own box, exported so the geometry test can compare it with the FAB's
 *  rather than restating either (C-5: assert the rendered geometry, never the tokens). */
export const DONE_BAR_BOTTOM = theme.space2;
export const DONE_BAR_MIN_HEIGHT = 56;

export interface ExitVisibility {
  /** The card's top has passed the top of the viewport. */
  backPinned: boolean;
  /** The card's bottom is below the bottom of the viewport. */
  donePinned: boolean;
}

/**
 * Decide which exits pin, from one rect and the viewport.
 *
 * Pure and exported: this is the part that is easy to get wrong and impossible to see
 * in a screenshot, and it should be testable without a scroll gesture.
 *
 * `null` measurements mean "not measured yet", and the honest answer then is to pin
 * NEITHER: the in-flow rows are on screen by construction on the first paint (the grid
 * has just been opened by a tap on this card), so nothing is out of reach yet.
 */
export function exitVisibility(params: {
  cardTop: number | null;
  cardHeight: number | null;
  scrollY: number;
  viewportHeight: number | null;
}): ExitVisibility {
  const { cardTop, cardHeight, scrollY, viewportHeight } = params;
  if (cardTop === null || cardHeight === null || viewportHeight === null) {
    return { backPinned: false, donePinned: false };
  }
  const cardBottom = cardTop + cardHeight;
  const viewportBottom = scrollY + viewportHeight;
  // Any part of the card on screen at all — an exit for a card the owner has scrolled
  // past is chrome over someone else's content.
  const onScreen = cardBottom > scrollY && cardTop < viewportBottom;
  return {
    backPinned: onScreen && cardTop < scrollY,
    donePinned: onScreen && cardBottom > viewportBottom,
  };
}

export function LookExits({ backPinned, donePinned }: ExitVisibility) {
  const overlay = useUiStore((s) => s.captureOverlay);
  if (!overlay || !overlay.inViewport) return null;
  const showBack = backPinned;
  const showDone = donePinned && overlay.summary !== null && overlay.onDone !== null;
  if (!showBack && !showDone) return null;

  return (
    // box-none: the layer itself is never a target — only the two controls are, so the
    // grid underneath stays fully tappable between them.
    <View style={styles.layer} pointerEvents="box-none" testID="look-exits">
      {showBack && (
        <Pressable
          onPress={overlay.onBack}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Show fewer words"
          testID="look-exit-back"
        >
          <ThemedText style={styles.backText}>{LOOK_FEWER_WORDS}</ThemedText>
        </Pressable>
      )}
      {showDone && (
        <View style={styles.doneBar} testID="look-exit-done-bar">
          <ThemedText style={styles.summary} numberOfLines={2}>
            {overlay.summary}
          </ThemedText>
          <Pressable
            onPress={overlay.onDone ?? undefined}
            disabled={overlay.busy}
            style={styles.doneButton}
            accessibilityRole="button"
            accessibilityLabel={`${LOOK_DONE}. ${overlay.summary}`}
            testID="look-exit-done"
          >
            <ThemedText style={styles.doneText}>{LOOK_DONE}</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  back: {
    position: 'absolute',
    top: theme.space1,
    left: theme.space3,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  doneBar: {
    position: 'absolute',
    left: theme.space2,
    right: theme.space2,
    bottom: DONE_BAR_BOTTOM,
    minHeight: DONE_BAR_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space2,
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  summary: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextPrimary,
  },
  doneButton: {
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space3,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorNeutralDark,
    minHeight: 44,
    justifyContent: 'center',
  },
  doneText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
});
