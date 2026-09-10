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

/**
 * THE INTAKE DOOR'S REQUEST (CUL-870 / N-3b; §3.1a, §4.5).
 *
 * The second piece of Noticed-card state that has to be visible outside Home's card
 * tree, and it is here for a sharper reason than the overlay's.
 *
 * `guards/homeWrites.test.ts` scans Home's COMPUTED IMPORT CLOSURE — Home plus every
 * card, plus every module they transitively reach — and reds on any write helper outside
 * the two-class allow-set. `IntakeFirstMealSheet` calls `insertMeal`. If the Noticed card
 * imported it, the sheet would join that closure and the meal write would BE a third Home
 * write class, which is a Tier-2 amendment to `docs/nyx-med-strip-requirements.md` §0.1
 * and emphatically not a marker.
 *
 * That is not a technicality to route around; it is the guard describing the shape the
 * app already has. The sheet is a DOORWAY's destination (§4.5: "the chip is a doorway in
 * the sense the shipped TodayZone nudge already is"), and every other surface that writes
 * a meal — the FAB, the picker, photo capture, the completion card — mounts outside Home
 * for exactly the same reason. So the card publishes a REQUEST, the root layout
 * (`app/_layout.tsx`, beside `<MealCompletionCard/>`) owns the sheet, and Home's closure
 * never contains a meal write.
 *
 * WHY THE PET RIDES ON THE REQUEST rather than being re-read at save: C-9 / T-11. The
 * door was tapped on ONE animal's card. A header switch while the sheet is up must not
 * re-point the meal at the other cat — the same rule `insertLook` obeys, applied to the
 * row this sheet writes.
 */
export interface IntakeDoorRequest {
  petId: string;
  petName: string;
  /** For the food line's possessive. `pets.sex` is NOT NULL with an `unknown` member. */
  sex: 'male' | 'female' | 'unknown';
  /** Did the Noticed card have words selected when the door was tapped? Only then does
   *  the sheet promise they are kept — a reassurance about an empty card is a claim
   *  about nothing. */
  cardHasSelections: boolean;
}

interface UiState {
  /** The live capture overlay, or null when no Home card owns the corner. */
  captureOverlay: CaptureOverlay | null;
  setCaptureOverlay: (overlay: CaptureOverlay | null) => void;
  /** The intake door's open request, or null when the sheet is down. */
  intakeDoor: IntakeDoorRequest | null;
  openIntakeDoor: (request: IntakeDoorRequest) => void;
  closeIntakeDoor: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  captureOverlay: null,
  setCaptureOverlay: (captureOverlay) => set({ captureOverlay }),
  intakeDoor: null,
  openIntakeDoor: (intakeDoor) => set({ intakeDoor }),
  closeIntakeDoor: () => set({ intakeDoor: null }),
}));
