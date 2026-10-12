import { create } from 'zustand';
import { useAuthStore } from './authStore';
import {
  fetchAiConsent,
  writeAiConsent,
  type AiConsentRead,
  type AiConsentRow,
  type AiConsentSource,
  type AiConsentWrite,
} from '../lib/aiConsent';

// The phone's copy of the owner's AI consent (CUL-1834). The server row is the
// truth and the gate reads only that; this cache exists so a door does not wait on
// the network once an answer is known, and so Settings' row can say On / Off.
//
// KEYED BY USER ID. Every entry names the account it was read for, and a response
// that lands after the account changed is dropped: on a shared phone, the next
// owner must never be shown, or be spared a question by, the previous owner's
// answer. `reset()` runs in `wipeLocalSession` (FR-9 parity).
//
// WHY A KNOWN ANSWER IS TRUSTED AND A MISSING ONE IS NOT. The table has no DELETE
// for clients (migration 100 §4), so once a row exists it exists for the life of
// the account: "this owner answered" can never go stale. "Never asked" can, because
// the owner may have answered on another phone. So a door re-reads before it asks,
// and only a fresh "no row" puts a sheet up.

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

// Reads the server row into the cache. A stale response (the account changed while
// it was in flight) still returns to its caller but never lands in the cache.
export async function loadAiConsent(userId: string): Promise<AiConsentRead> {
  const read = await fetchAiConsent(userId);
  if (read.status === 'ok' && isCurrentUser(userId)) {
    useAiConsentStore.getState().setRow(userId, read.row);
  }
  return read;
}

// Whether a door should put the permission sheet up. True only on a fresh read that
// found no answer. A failed read never asks: the server fails closed on its own, and
// re-asking an owner who already answered is the worse error at a door.
export async function needsAiConsentAsk(userId: string): Promise<boolean> {
  const cached = cachedAiConsent(userId);
  if (cached) return false;
  const read = await loadAiConsent(userId);
  return read.status === 'ok' && read.row === null;
}

// Saves Allow or Don't allow. Not now never reaches here.
export async function saveAiConsent(
  userId: string,
  granted: boolean,
  source: AiConsentSource,
): Promise<AiConsentWrite> {
  const result = await writeAiConsent({ userId, granted, source });
  if (result.status === 'saved' && isCurrentUser(userId)) {
    useAiConsentStore.getState().setRow(userId, result.row);
  }
  return result;
}

function isCurrentUser(userId: string): boolean {
  return useAuthStore.getState().user?.id === userId;
}

export function clearAiConsent(): void {
  useAiConsentStore.getState().reset();
}
