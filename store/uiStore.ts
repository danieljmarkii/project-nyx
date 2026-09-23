import { create } from 'zustand';
import type { EventTypeKey } from '../constants/eventTypes';

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

/**
 * The types the log sheet can open STRAIGHT AT its confirm (CUL-504). Everything the
 * sheet completes in place, and nothing it hands off: Meal, Medication and Weight route
 * out to their own screens from the grid, and a `check_in` is a look, whose only door is
 * the Noticed card (E-6). Spelled here rather than imported from the sheet because this
 * file is in Home's import closure (see below) and the sheet is not allowed to be.
 */
export type LogSheetConfirmType = Exclude<
  EventTypeKey,
  'meal' | 'medication' | 'weight_check' | 'check_in'
>;

/**
 * THE LOG SHEET'S REQUEST (CUL-503 / CUL-504, "one door, one confirm").
 *
 * Every "start a log" door in the app opens ONE sheet, `EventTypeSheet`, mounted once by
 * `components/log/LogSheetHost.tsx` in the root layout. It used to be mounted inside the
 * FAB, which reached it by a prop, so every other door (the Home nudge, Ask's empty
 * record, the day summary) pushed the full-screen `/log` picker instead and an owner met
 * two different logging surfaces depending on how they arrived.
 *
 * Why the root and why a request, for the same two reasons as the intake door above:
 *
 *   • HOME'S CLOSURE. `TodayZone` is a Home card, and the sheet's confirm writes a row
 *     (`insertSimpleEvent`). If the card imported the sheet, that write would join Home's
 *     computed import closure and `guards/homeWrites.test.ts` would red on it — correctly,
 *     because Home would then carry a fourth write class. The card publishes this request;
 *     the host owns the surface.
 *   • PRESENTATION. Ask and the day summary are root stack screens pushed OVER the tabs,
 *     so a sheet mounted in the tabs layout would be presenting from a screen that is not
 *     on top. The root mount sits above every stack screen.
 *
 * The request is the sheet's visibility: non-null while it is up. `initialType` starts
 * the open at the confirm instead of the grid — the FAB's Vomit / Loose stool quick
 * taps. Null opens the grid.
 */
export interface LogSheetRequest {
  initialType: LogSheetConfirmType | null;
}

interface UiState {
  /** The live capture overlay, or null when no Home card owns the corner. */
  captureOverlay: CaptureOverlay | null;
  setCaptureOverlay: (overlay: CaptureOverlay | null) => void;
  /** The intake door's open request, or null when the sheet is down. */
  intakeDoor: IntakeDoorRequest | null;
  openIntakeDoor: (request: IntakeDoorRequest) => void;
  closeIntakeDoor: () => void;
  /** The log sheet's open request, or null when the sheet is down. */
  logSheet: LogSheetRequest | null;
  /** How many times the log sheet has been opened. Only ever counts up: the host keys
   *  the sheet on it, so every open mounts a fresh sheet whose starting stage is read
   *  at mount (EventTypeSheet's `initialType`), while a close keeps the instance so the
   *  Modal still slides out. */
  logSheetOpens: number;
  /** Open the log sheet at its grid, or straight at the confirm for `initialType`. */
  openLogSheet: (initialType?: LogSheetConfirmType) => void;
  closeLogSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  captureOverlay: null,
  setCaptureOverlay: (captureOverlay) => set({ captureOverlay }),
  intakeDoor: null,
  openIntakeDoor: (intakeDoor) => set({ intakeDoor }),
  closeIntakeDoor: () => set({ intakeDoor: null }),
  logSheet: null,
  logSheetOpens: 0,
  openLogSheet: (initialType) =>
    set((st) => ({
      logSheet: { initialType: initialType ?? null },
      logSheetOpens: st.logSheetOpens + 1,
    })),
  closeLogSheet: () => set({ logSheet: null }),
}));
