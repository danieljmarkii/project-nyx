import { create } from 'zustand';
import type { AiConsentRow } from '../lib/aiConsentTypes';

// The phone's copy of the owner's AI consent (CUL-1834): the state alone. The reads and
// writes that fill it live in `store/aiConsentStore.ts`, which re-exports all of this; a
// surface that only RENDERS by the answer (Home's rows, CUL-1174) imports this module so
// that no consent writer enters its import closure (`guards/homeWrites.test.ts`).
//
// KEYED BY USER ID. Every entry names the account it was read for, and a response that
// lands after the account changed is dropped (`store/aiConsentStore.ts`): on a shared
// phone, the next owner must never be shown, or be spared a question by, the previous
// owner's answer. `reset()` runs in `wipeLocalSession` (FR-9 parity).

interface AiConsentState {
  userId: string | null;
  // undefined: not read yet for this user. null: read, and no answer on file.
  row: AiConsentRow | null | undefined;
  setRow: (userId: string, row: AiConsentRow | null) => void;
  reset: () => void;
}

export const useAiConsentStore = create<AiConsentState>((set) => ({
  userId: null,
  row: undefined,
  setRow: (userId, row) => set({ userId, row }),
  reset: () => set({ userId: null, row: undefined }),
}));

// The cached answer for this user, or undefined when nothing has been read for them.
export function cachedAiConsent(userId: string): AiConsentRow | null | undefined {
  const s = useAiConsentStore.getState();
  return s.userId === userId ? s.row : undefined;
}
