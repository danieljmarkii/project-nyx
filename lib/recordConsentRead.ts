// The two reads behind a record's mount-trigger decision (CUL-1835): when its photo was
// attached, and the owner's consent read fresh. The decision itself is the pure
// `mountSendDecision` (lib/recordConsent.ts).

import { supabase } from './supabase';
import { getEventPhotoTimes } from './db';
import { useAuthStore } from '../store/authStore';
import { CONSENT_READ_TIMEOUT_MS, loadAiConsent } from '../store/aiConsentStore';
import type { AiConsentRead } from './aiConsent';
import { mountSendDecision, parseStoredInstant, type ConsentFact, type MountSend, type PhotoFact } from './recordConsent';

// The phone's attachment row first: it carries the CAPTURE time, which is the fact the
// promise turns on. The server's copy is stamped at upload, and an upload that failed
// while reading was off lands after the yes, which is exactly the photo this gate holds.
// The server is asked only when this phone has no row (a photo logged on another phone).
export async function readPhotoFact(eventId: string): Promise<PhotoFact> {
  try {
    const local = await getEventPhotoTimes(eventId);
    if (local.length > 0) return oldest(local);
  } catch (e) {
    console.warn('[recordConsent] local photo read failed:', e);
  }
  try {
    const { data, error } = await supabase
      .from('event_attachments')
      .select('created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.warn('[recordConsent] photo read failed:', error.message);
      return { kind: 'unknown' };
    }
    const first = (data ?? [])[0] as { created_at?: string | null } | undefined;
    return first?.created_at ? { kind: 'added', at: first.created_at } : { kind: 'none' };
  } catch (e) {
    console.warn('[recordConsent] photo read threw:', e);
    return { kind: 'unknown' };
  }
}

// The earliest instant, parsed (C-40). A stamp that will not parse is handed on as it is,
// so the decision reads it as unknown and holds: one unreadable photo time cannot be
// skipped over in favour of a later one.
function oldest(stamps: string[]): PhotoFact {
  let best: { at: string; ms: number } | null = null;
  for (const at of stamps) {
    const ms = parseStoredInstant(at);
    if (ms === null) return { kind: 'added', at };
    if (!best || ms < best.ms) best = { at, ms };
  }
  return best ? { kind: 'added', at: best.at } : { kind: 'unknown' };
}

// Always a fresh read, never the cache: a cached no could be a yes given on another phone
// since, and a send decided on the stale no would hand the server a pre-yes photo it would
// then read. Bounded like a door's read; a stall is a failed read.
export async function readConsentFact(userId: string | null): Promise<ConsentFact> {
  if (!userId) return { kind: 'error' };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timedOut = new Promise<AiConsentRead>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'error' }), CONSENT_READ_TIMEOUT_MS);
  });
  try {
    const read = await Promise.race([
      loadAiConsent(userId).catch((): AiConsentRead => ({ status: 'error' })),
      timedOut,
    ]);
    return read.status === 'ok' ? { kind: 'ok', row: read.row } : { kind: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Whether a record's mount trigger may run. The photo is read first: a photoless record
 *  never waits on the consent read. */
export async function mountSendFor(eventId: string): Promise<MountSend> {
  const photo = await readPhotoFact(eventId);
  if (photo.kind === 'none') return 'send';
  const consent = await readConsentFact(useAuthStore.getState().user?.id ?? null);
  return mountSendDecision(photo, consent);
}
