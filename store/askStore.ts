import { create } from 'zustand';
import { AppState, AppStateStatus } from 'react-native';
import { uuid } from '../lib/utils';
import type { AskAnswerBody, AskCapReached, AskTurn } from '../lib/ask';

// Ask — the in-memory conversation store (B-228, PR A5; requirements D8/D9, §3.2, §10).
//
// D8: the conversation is held in EPHEMERAL in-memory client state and SURVIVES every
// in-app navigation — including a provenance tap-through to History/Patterns and back
// (the most-encouraged interaction). It ends ONLY on:
//   • app background/kill  (the AppState 'background' subscription below — NOT the
//     transient 'inactive' the app-switcher / an in-app push produces, so a tap-through
//     never ends it),
//   • an idle timeout      (IDLE_MS — checked on surface focus, not by a timer),
//   • an explicit "new conversation" (startNew).
// It is NEVER ended by a bare navigation-away, and NO durable transcript is persisted
// (§10 — a module-level Zustand store: it never touches disk or the server, and is gone
// on app kill). This is why it lives in a store, not screen state: screen state would
// reset on every unmount, which is exactly the tap-through the review flagged (D8).
//
// D9: the free `ask_conversation` credit commits on the first SUBSTANTIVE answer. The
// wire the store hands the server (askTurns) carries each assistant turn's `substantive`
// flag, so the stateless server can tell whether this conversation already spent its
// credit — a follow-up after a tap-through stays ONE conversation, never a second credit.

// A rendered message. A user turn is the owner's question; an assistant turn is the
// full typed answer body (or a client-built offline deflection), which the card renders.
export type AskMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; body: AskAnswerBody };

// Idle end-trigger (S7 provisional lean: ~30-min idle OR app background). Checked on
// focus rather than on a background timer — a stale conversation resets the next time
// the owner opens Ask, which is the only moment it matters.
const IDLE_MS = 30 * 60 * 1000;

interface AskState {
  /** The pet the current conversation is scoped to. A pet SWITCH re-scopes → fresh
   *  conversation (every answer is pet-specific; carrying turns across pets would let
   *  one pet's context bleed into another's answer). */
  petId: string | null;
  messages: AskMessage[];
  /** A model answer is in flight (drives the thinking skeleton). */
  thinking: boolean;
  /** Set when the server returned cap_reached — the surface shows the calm cap band and
   *  degrades to navigation (§9.3). Cleared by startNew / a successful answer. */
  capped: AskCapReached | null;
  /** The flag resolved off for this caller server-side (fail-closed). Shouldn't normally
   *  be reachable — the Home pill hides when the flag is off — but handled honestly. */
  disabled: boolean;
  /** The last question asked, for the §16.1 #3 symptom-shaped cap-copy branch. */
  lastQuestion: string | null;
  lastActivityMs: number;

  /** Point the store at the active pet, resetting the conversation on a pet switch and
   *  expiring a stale one (idle). Call on surface focus. Idempotent for the same pet
   *  within the idle window (returns without touching state). */
  focusPet: (petId: string | null) => void;
  /** Start a fresh conversation for the current pet (explicit-new; the "＋" affordance). */
  startNew: () => void;
  /** Optimistically add the owner's question and enter the thinking state. */
  pushQuestion: (text: string) => void;
  /** Resolve the in-flight question with a server (or client-deflection) answer body. */
  resolveAnswer: (body: AskAnswerBody) => void;
  /** Resolve the in-flight question with a typed cap-reached body (§9.3). */
  resolveCapped: (cap: AskCapReached) => void;
  /** Resolve with feature-disabled (flag off). */
  resolveDisabled: () => void;
  /** The prior conversation as wire turns (D8/D9) — sent so the server serves follow-ups
   *  and honors the credit rule without persisting a transcript. */
  askTurns: () => AskTurn[];
  /** End the conversation on a real app background (NOT the app-switcher 'inactive'). */
  endOnBackground: () => void;
}

const FRESH = {
  messages: [] as AskMessage[],
  thinking: false,
  capped: null as AskCapReached | null,
  disabled: false,
  lastQuestion: null as string | null,
};

export const useAskStore = create<AskState>((set, get) => ({
  petId: null,
  ...FRESH,
  lastActivityMs: 0,

  focusPet: (petId) => {
    const s = get();
    const switched = petId !== s.petId;
    const idle = s.messages.length > 0 && Date.now() - s.lastActivityMs > IDLE_MS;
    if (switched || idle) {
      set({ petId, ...FRESH, lastActivityMs: Date.now() });
    }
  },

  startNew: () => set((s) => ({ ...FRESH, petId: s.petId, lastActivityMs: Date.now() })),

  pushQuestion: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: uuid(), role: 'user', text }],
      thinking: true,
      capped: null,
      lastQuestion: text,
      lastActivityMs: Date.now(),
    })),

  resolveAnswer: (body) =>
    set((s) => ({
      messages: [...s.messages, { id: uuid(), role: 'assistant', body }],
      thinking: false,
      capped: null,
      lastActivityMs: Date.now(),
    })),

  // The optimistic user bubble stays (they DID ask); the cap band renders beneath it
  // and the input degrades to navigation. Honest: "you asked this, and here's why
  // there's no answer right now", never a silent drop.
  resolveCapped: (cap) => set({ thinking: false, capped: cap, lastActivityMs: Date.now() }),

  resolveDisabled: () => set({ thinking: false, disabled: true, lastActivityMs: Date.now() }),

  askTurns: () => {
    const msgs = get().messages;
    const turns: AskTurn[] = [];
    for (const m of msgs) {
      if (m.role === 'user') {
        turns.push({ role: 'user', content: m.text });
      } else {
        // The assistant turn's content is what the model "said" (headline + detail), and
        // `substantive` carries the D9 credit state so the server never double-charges.
        const content = `${m.body.headline} ${m.body.detail}`.trim();
        turns.push({ role: 'assistant', content, substantive: m.body.substantive === true });
      }
    }
    return turns;
  },

  endOnBackground: () =>
    set((s) => (s.messages.length === 0 && !s.capped ? s : { ...FRESH, petId: s.petId, lastActivityMs: Date.now() })),
}));

// D8 background end-trigger. Registered ONCE at module load (the store is a singleton),
// mirroring useAppActive's single AppState subscription. Only a true 'background' ends
// the conversation — 'inactive' (iOS app-switcher, incoming call, an in-app modal
// transition) is deliberately excluded so a provenance tap-through never ends it.
let appStateBound = false;
export function bindAskAppStateListener(): void {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'background') useAskStore.getState().endOnBackground();
  });
}
bindAskAppStateListener();
