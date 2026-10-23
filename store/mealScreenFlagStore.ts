// The trial heads-up waiting for a meal's own screen (CUL-2088, PM ruling (a)).
//
// A food put into a meal after the fact (Change on the edit screen, a mix from the meal's
// screen, a bowl-editor save) has no completion card to land on, and a fresh log whose card
// a newer log replaced before it showed has lost its card (CUL-2106), so its heads-up is handed
// here and the meal's screen shows it as a line the next time it is in front of the owner
// (`components/event/TrialHeadsUpLine.tsx`). The line spends the once-per-food ledger only
// once it is on screen, as the card does; a heads-up that is never shown spends nothing.
//
// In memory only: an app restart drops it, which leaves the food unspent and warned about
// at its next feeding, the loud direction. It names a food and a trial, so the sign-out
// teardown clears it (`lib/session.ts`).
import { create } from 'zustand';
import type { LogTimeTrialFlag } from '../lib/trialContaminant';
import type { TrialFoodSelection } from '../lib/dietTrialSetup';

/** What put the food in the meal, which decides the line's "saved" clause: a fresh log was
 *  not a change (mock frame 7d), an edit was (7a to 7c). Required, so a new writer cannot
 *  fall back to the wrong sentence. */
export type HeadsUpOrigin = 'log' | 'edit';

export interface MealScreenFlag {
  flag: LogTimeTrialFlag;
  origin: HeadsUpOrigin;
  /** The flagged food as the add-to-list sheet writes it. Null when its row is not on
   *  this phone; the line then offers no add door. */
  food: TrialFoodSelection | null;
}

interface MealScreenFlagState {
  /** eventId → the heads-up waiting for that meal's screen. */
  pending: Record<string, MealScreenFlag>;
  /** The newest edit's verdict for a meal: a flag waits, null clears an older one. */
  put: (eventId: string, next: MealScreenFlag | null) => void;
  /** Hand the waiting heads-up to the one screen that will show it, and forget it. */
  take: (eventId: string) => MealScreenFlag | null;
  reset: () => void;
}

export const useMealScreenFlagStore = create<MealScreenFlagState>((set, get) => ({
  pending: {},
  put: (eventId, next) => {
    const { [eventId]: _old, ...rest } = get().pending;
    set({ pending: next ? { ...rest, [eventId]: next } : rest });
  },
  take: (eventId) => {
    const held = get().pending[eventId] ?? null;
    if (held) {
      const { [eventId]: _taken, ...rest } = get().pending;
      set({ pending: rest });
    }
    return held;
  },
  reset: () => set({ pending: {} }),
}));
