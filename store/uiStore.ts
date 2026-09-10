import { create } from 'zustand';

// Home's capture overlay — the one piece of card state that has to be visible OUTSIDE
// Home's card tree (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md T-21, and the
// review's E-9).
//
// WHY A STORE AND NOT A PROP. Two consumers sit in trees the Noticed card cannot reach:
//
//   • THE FAB mounts in `app/(tabs)/_layout.tsx` beside the whole tab navigator, so it
//     outlives every screen and there is no prop path from a Home card to it ("the FAB
//     has no hide prop today"). It steps aside while the grid is open, because the
//     pinned Done bar stands exactly where it does.
//   • THE PINNED EXITS are drawn by Home itself, as a second absolute layer beside
//     `PullToRefreshSky`. They cannot live inside the card: the card is inside the
//     ScrollView, so anything absolutely positioned in it scrolls away with it — which
//     is the whole problem T-21 was written for (the PM found a way back at the foot of
//     a long word list unusable).
//
// The card keeps the BEHAVIOUR (`onBack` / `onDone` are its own closures) and this
// store carries only the handles, so nothing is re-implemented in two trees and there
// is no tick, no request-consumed-in-a-ref, no second state machine.
//
// IT FAILS OPEN. The FAB is how logging happens, so every path that leaves the grid —
// Done, the way back, a pet switch, an unmount mid-transition — clears this, and the
// card clears it on unmount as a backstop. A stuck overlay costs the owner the app's
// primary control, which is a worse failure than a Done bar sharing a corner for a
// frame.
//
// DELIBERATELY NOT A GENERAL "an overlay is up" FLAG. The only writer is the Noticed
// card's unfolded grid. A flag that meant more than that would invite every future
// sheet to hide the FAB, one PR at a time, with nothing to point at.

export interface CaptureOverlay {
  /** The Done bar's sentence — the record being offered, naming the pet (*Mochi ·
   *  off, didn't want the walk*). Null while nothing is chosen, which is also how the
   *  layer knows not to draw a Done bar at all. */
  summary: string | null;
  /** Is any part of the owning card on screen? The exits are for reaching a control
   *  that has scrolled away, never for painting over a card the owner has left. */
  inViewport: boolean;
  /** The commit is in flight — the bar stands down rather than taking a second tap. */
  busy: boolean;
  /** The way back (*‹ Show fewer words*). Always present while the grid is open. */
  onBack: () => void;
  /** Commit. Null exactly when `summary` is null. */
  onDone: (() => void) | null;
}

interface UiState {
  /** The live capture overlay, or null when no Home card owns the corner. */
  captureOverlay: CaptureOverlay | null;
  setCaptureOverlay: (overlay: CaptureOverlay | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  captureOverlay: null,
  setCaptureOverlay: (captureOverlay) => set({ captureOverlay }),
}));
