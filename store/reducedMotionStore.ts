import { create } from 'zustand';
import { AccessibilityInfo } from 'react-native';

// The OS Reduce Motion setting, read ONCE at app start (CUL-1123).
//
// WHY A STORE. `useReducedMotion` used to be `useState(false)` plus an async
// `AccessibilityInfo.isReduceMotionEnabled()` in an effect, in every component. So
// every component's FIRST render believed Reduce Motion was off, whatever the owner had
// set, and learned the truth a commit later. Anything that moves on mount read that
// first value: the Signal screen's push took `slide_from_bottom`, a chart's draw in
// started and then snapped to its end when the answer landed, and the completion cards
// seeded their animated values from it. The tests could not see this, because they
// mocked the hook to `true` from the first render, a state production never produced
// (C-35). And every mounted instance opened its own OS subscription.
//
// Now there is one read and one subscription for the app's lifetime, started by the root
// layout at module load, and the root's render gate waits for the answer
// (`gateOpen`), so the first frame of the tree already knows. Every
// `useReducedMotion()` call reads this store and gets the real value on its first render.
//
// THREE STATES, AND UNKNOWN IS STILL. `reduceMotion` is `null` until the OS answers.
// `stillWhenUnknown` is the one place that decides what `null` means, and it means
// "reduced": a component that renders before the answer shows its static frame and
// starts nothing, so no motion can begin and then snap. That costs a non reduced reader
// at most one skipped mount motion, and only when the gate below gave up waiting; the
// opposite default costs a reader who asked for stillness the motion they asked to
// avoid. A failed read stays unknown for the same reason.
//
// NOT ACCOUNT STATE. This is a device setting, so it is not in `wipeLocalSession`: the
// next account on the same phone has the same OS setting.

/**
 * How long the root layout waits for the OS before it renders anyway. The read is a
 * native call that answers within a frame or two, and it starts at module load, before
 * the fonts the same gate already waits on, so in practice this bound never binds. It
 * exists so a bridge that never answers can never hold the app behind its splash: the
 * tree renders with the value unknown (so still), and moves once the answer lands.
 */
export const REDUCED_MOTION_GATE_MS = 1000;

interface ReducedMotionState {
  /** The OS setting: `null` until the first answer, from the read or a change event. */
  reduceMotion: boolean | null;
  /** The root may render: the OS answered, the read failed, or the wait ran out. */
  gateOpen: boolean;
}

export const useReducedMotionStore = create<ReducedMotionState>(() => ({
  reduceMotion: null,
  gateOpen: false,
}));

/** THE RULE: an unknown setting reads as reduced, so nothing moves before the answer. */
export function stillWhenUnknown(reduceMotion: boolean | null): boolean {
  return reduceMotion ?? true;
}

/**
 * The setting at the moment of the call, for an event handler: a programmatic scroll
 * passes `animated: !reducedMotionNow()`. A callback reads it here rather than closing
 * over a render's value, so it is current at the tap and the callback never has to be
 * rebuilt when the setting changes.
 */
export function reducedMotionNow(): boolean {
  return stillWhenUnknown(useReducedMotionStore.getState().reduceMotion);
}

let started = false;

/**
 * Start the one read and the one subscription. Idempotent; the root layout calls it at
 * module load, beside the splash hold, so the answer is in flight before the first render.
 *
 * SUBSCRIBE FIRST, THEN READ, AND THE EVENT WINS. The owner can flip the setting while
 * the read is in flight. The change event carries the new value; the read may answer
 * with the value from before the flip, and may land after the event. So the read's
 * answer is applied only while nothing has answered yet, and an event always applies.
 */
export function startReducedMotionRead(): void {
  if (started) return;
  started = true;
  AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
    useReducedMotionStore.setState({ reduceMotion: enabled, gateOpen: true });
  });
  const giveUp = setTimeout(() => {
    useReducedMotionStore.setState({ gateOpen: true });
  }, REDUCED_MOTION_GATE_MS);
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled: boolean) => {
      clearTimeout(giveUp);
      useReducedMotionStore.setState((s) =>
        s.reduceMotion === null ? { reduceMotion: enabled, gateOpen: true } : { gateOpen: true },
      );
    })
    .catch((e: unknown) => {
      clearTimeout(giveUp);
      // Unknown stays unknown, so still: see the header. The gate opens so a failed
      // read never holds the splash, and a later change event still lands.
      console.warn('[reduced-motion] the OS read failed; treating motion as reduced:', e);
      useReducedMotionStore.setState({ gateOpen: true });
    });
}

// Test-only reset, so a fixture can stage the read from the start.
export function __resetReducedMotionForTest(): void {
  started = false;
  useReducedMotionStore.setState({ reduceMotion: null, gateOpen: false });
}
