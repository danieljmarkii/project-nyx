// The owner's answer to "may Culprit send this to Anthropic?" (CUL-552 PR 3a,
// CUL-1834; App Review 5.1.2(i)). The state lives in `ai_consent` (migration 100):
// one current row per account, which the Edge Functions' gate reads
// (`supabase/functions/_shared/aiConsent.ts`). This module is the client's only
// reader and writer of it.
//
// THE 10-11 BINDING RULES (CUL-552), each enforced here:
//  - Remote first, never the sync queue. Consent is not a record the owner logged
//    offline and reconciles later: a yes that sat in a queue would be a yes the
//    server never saw, and a no that sat there would let the gate keep sending.
//    So a write either lands now or fails visibly, and the caller keeps the sheet up.
//  - Every yes mints a `legal_acceptances` row (document 'ai_consent', version = the
//    copy the owner saw). It is written BEFORE the state row: if the state write then
//    fails, the server still reads no and nothing is sent, and a yes the owner did
//    give is on record. The other order could leave a yes the gate acts on with no
//    record of the words it was given against.
//  - Reads name their columns. `ai_consent_events` grants SELECT by column and leaves
//    out `id`, so a `select('*')` there fails outright (migration 100 §5).
//  - Not now writes nothing (D13: the demo account stays at zero rows). Only Allow
//    and Don't allow call `writeAiConsent`.
//  - `source` is a closed set the table CHECKs. The in-context doors write
//    'backstop' and Settings writes 'settings' (team call on CUL-1832, no migration).
//    The type admits nothing else, so a new door cannot invent a value that fails
//    with 23514.

import { supabase } from './supabase';

export const AI_CONSENT_SCOPE = 'ai_boundary';
export const AI_CONSENT_DOCUMENT = 'ai_consent';
// Names the wording the owner answered (mock round 4, approved by the PM
// 2026-10-12 on CUL-1834). Bump it whenever a string in constants/aiConsentCopy.ts
// changes meaning: a yes given against old words is not a yes to new ones.
export const AI_CONSENT_COPY_VERSION = '2026-10-12';

export type AiConsentSource = 'backstop' | 'settings';
export const AI_CONSENT_SOURCES: readonly AiConsentSource[] = ['backstop', 'settings'];

import type { AiConsentRow } from './aiConsentTypes';
export type { AiConsentRow } from './aiConsentTypes';

export type AiConsentRead =
  | { status: 'ok'; row: AiConsentRow | null }
  | { status: 'error' };

const UNIQUE_VIOLATION = '23505';

interface ConsentDbRow {
  granted: boolean;
  copy_version: string;
  source: string;
  decided_at: string;
}

function toRow(r: ConsentDbRow): AiConsentRow {
  return {
    granted: r.granted,
    copyVersion: r.copy_version,
    source: r.source,
    decidedAt: r.decided_at,
  };
}

// The current answer. `row: null` means never asked, which the gate reads as no
// and a door reads as "ask". A failed read is its own state: never a no, never an
// ask, because asking on a failed read would re-ask an owner who already answered.
export async function fetchAiConsent(userId: string): Promise<AiConsentRead> {
  const { data, error } = await supabase
    .from('ai_consent')
    .select('granted, copy_version, source, decided_at')
    .eq('user_id', userId)
    .eq('scope', AI_CONSENT_SCOPE)
    .maybeSingle();
  if (error) {
    console.warn('[aiConsent] read failed:', error.message);
    return { status: 'error' };
  }
  return { status: 'ok', row: data ? toRow(data as ConsentDbRow) : null };
}

// Whether this account ever said yes. Settings' Off state says "Reads that already
// ran stay on their records." only to an owner for whom that can be true (mock
// round 4, F10). Read from the history, because the state row only holds the
// latest answer. A failed read answers false: the line is then left out, which
// says less, never something untrue.
export async function hasEverGrantedAiConsent(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_consent_events')
    .select('granted, decided_at')
    .eq('user_id', userId)
    .eq('scope', AI_CONSENT_SCOPE)
    .eq('granted', true)
    .limit(1);
  if (error) {
    console.warn('[aiConsent] history read failed:', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export type AiConsentWrite =
  | { status: 'saved'; row: AiConsentRow }
  | { status: 'error' };

// Writes an answer, remote first. decided_at is never sent: the column is not
// client-writable and the trigger stamps it (migration 100 §2). The returned row
// carries the server's stamp, so "On since" is never the device clock.
export async function writeAiConsent(args: {
  userId: string;
  granted: boolean;
  source: AiConsentSource;
}): Promise<AiConsentWrite> {
  const { userId, granted, source } = args;

  if (granted) {
    // Plain insert, never upsert: legal_acceptances has no UPDATE policy, and the
    // first yes under a copy version is the record that stands (migration 032).
    const { error: legalError } = await supabase.from('legal_acceptances').insert({
      user_id: userId,
      document: AI_CONSENT_DOCUMENT,
      version: AI_CONSENT_COPY_VERSION,
    });
    if (legalError && legalError.code !== UNIQUE_VIOLATION) {
      console.warn('[aiConsent] acceptance record failed:', legalError.message);
      return { status: 'error' };
    }
  }

  const { data, error } = await supabase
    .from('ai_consent')
    .upsert(
      {
        user_id: userId,
        scope: AI_CONSENT_SCOPE,
        granted,
        copy_version: AI_CONSENT_COPY_VERSION,
        source,
      },
      { onConflict: 'user_id,scope' },
    )
    .select('granted, copy_version, source, decided_at')
    .single();
  if (error || !data) {
    console.warn('[aiConsent] write failed:', error?.message ?? 'no row returned');
    return { status: 'error' };
  }
  return { status: 'saved', row: toRow(data as ConsentDbRow) };
}
