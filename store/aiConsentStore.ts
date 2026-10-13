import { useAuthStore } from './authStore';
import { cachedAiConsent, useAiConsentStore } from './aiConsentState';
import {
  fetchAiConsent,
  writeAiConsent,
  type AiConsentRead,
  type AiConsentRow,
  type AiConsentSource,
  type AiConsentWrite,
} from '../lib/aiConsent';

export { cachedAiConsent, useAiConsentStore };

// The phone's copy of the owner's AI consent (CUL-1834). The server row is the
// truth and the gate reads only that; this cache exists so a door does not wait on
// the network once an answer is known, and so Settings' row can say On / Off.
//
// The state itself (keyed by user id, reset on sign-out) is `store/aiConsentState.ts`.
//
// WHY A KNOWN ANSWER IS TRUSTED AND A MISSING ONE IS NOT. The table has no DELETE
// for clients (migration 100 §4), so once a row exists it exists for the life of
// the account: "this owner answered" can never go stale. "Never asked" can, because
// the owner may have answered on another phone. So a door re-reads before it asks,
// and only a fresh "no row" puts a sheet up.

// Reads the server row into the cache. A stale response (the account changed while
// it was in flight) still returns to its caller but never lands in the cache.
// Bumped by every saved write. A read that started before a write landed carries
// the older answer, so it never overwrites the newer one in the cache (a focus read
// racing a Settings flip would otherwise put the previous answer back).
let writeSeq = 0;

export async function loadAiConsent(userId: string): Promise<AiConsentRead> {
  const seqAtStart = writeSeq;
  const read = await fetchAiConsent(userId);
  if (read.status === 'ok' && isCurrentUser(userId) && writeSeq === seqAtStart) {
    useAiConsentStore.getState().setRow(userId, read.row);
  }
  return read;
}

// What a door does. 'ask' only on a fresh read that found no answer. 'declined' on a
// recorded no: the door honours it on the phone too, so a photo that will never be
// read is never taken, and nothing is sent even while a server function runs without
// its gate (the six CUL-552 holds lift in PR-17, after this client ships). 'proceed'
// only on a yes the phone holds: cached, or just read. 'unreadable' on a failed or
// stalled read: the door sends nothing and the screen says try again (CUL-1933, the
// CUL-1930 stopgap). It used to proceed, trusting the server's gate to fail closed,
// but that gate is held until PR-17, so an unasked or declined owner's photos and
// questions left on a slow network.
export type ConsentDoorState = 'ask' | 'declined' | 'proceed' | 'unreadable';

// A door waits at most this long for the read; past it, the door stops as on a
// failed read, so a stalled network ends in a "try again", never a silent hang.
export const CONSENT_READ_TIMEOUT_MS = 4000;

function doorStateOf(row: AiConsentRow | null): ConsentDoorState {
  if (row === null) return 'ask';
  return row.granted ? 'proceed' : 'declined';
}

export async function consentDoorState(userId: string): Promise<ConsentDoorState> {
  const cached = cachedAiConsent(userId);
  if (cached) return doorStateOf(cached);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timedOut = new Promise<AiConsentRead>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'error' }), CONSENT_READ_TIMEOUT_MS);
  });
  try {
    const read = await Promise.race([loadAiConsent(userId), timedOut]);
    return read.status === 'ok' ? doorStateOf(read.row) : 'unreadable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Saves Allow or Don't allow. Not now never reaches here.
export async function saveAiConsent(
  userId: string,
  granted: boolean,
  source: AiConsentSource,
): Promise<AiConsentWrite> {
  const result = await writeAiConsent({ userId, granted, source });
  if (result.status === 'saved') writeSeq += 1;
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
