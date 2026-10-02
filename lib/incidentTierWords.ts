// The tier-word map: every owner-facing word for a per-incident read's tier, in one place
// (EN-3, CUL-1133; Engines v3 PR-27; docs/nyx-incident-tiers-requirements.md §2).
//
// `lib/incidentTier.ts` holds the ORDER and no words, so the Edge Functions can import it.
// This file holds the WORDS and is client-only: nothing under supabase/functions imports it,
// so a label edit never redeploys analyze-* (C-26). Every surface that names a read (the
// record's card, the gallery tiles, the History and Home row, the month and its chart text)
// asks `tierDisplayOf` which words stand and reads them from `TIER_WORDS`. A build guard
// (`guards/incidentTierWords.test.ts`) fails on the literal "worth a call" outside this
// file, so no surface can name a read in its own words again (WBC-1).
//
// ── WHICH WORDS STAND (the resolver) ─────────────────────────────────────────
//   1. THE LOUDER COLUMN. `tier` sits beside `recommendation` (migration 079), and a row
//      reads as the louder of the two (`effectiveTierRank`), so a missed dual-write or a
//      rolled-back build writing only `recommendation` can never render calmer than
//      either column.
//   2. STATUS AHEAD OF TIER (the PR-26 handoff, review F6). A call stands at ANY status:
//      presence escalates, and a failed re-read never buries one (CUL-812). A QUIET tier
//      stands only on a read that finished (`FINISHED_READ_STATUSES`): a failed or capped
//      row can still carry an earlier `logged`, and standing it would be a calm read over
//      a photo nothing has read. The resolver returns null there, and each surface draws
//      its own honest not-read frame.
//   3. NEW WORDS ONLY ON A NEW-RULE ROW. A row is new-rule when the server stamped it under
//      the EN-3 key (`engine_flags`); the stamp decides, never a tier's presence (spec §1).
//      Every other row is an earlier-rule
//      read and keeps today's words to the byte: an old "Worth a call" is never relabelled
//      "call now" or "call today", because nobody knows which it would have been (spec §5).
//      This is also what keeps the change dark: nothing writes a tier or the stamp until
//      the key is seeded (CUL-1407), so every row on every phone today resolves to the
//      shipped words.
//   4. A VALUE THIS BUILD DOES NOT KNOW, in either column, is spoken as "Worth a call"
//      (CUL-1277): never blank, never calm, and never a newer word than the build can back.
//      One exception is louder, not softer: a new-rule `call_now` keeps its words beside an
//      unknown verdict, because "Call your vet now" is the stronger ask.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
// It never decides which tier a finding earns (the floor's job, server-side), and it has
// no wellness word (clinical-guardrails Pattern 1): the lowest tier is "Keep an eye out",
// which is today's `monitor` wording. The watch-for list that tier carries, the call's
// "what to tell them" line and the pet's call-now signs are generated from the floor's rows
// and land with EN-4 (PR-28), never hand-written here (spec §3, BRK-3).

import { effectiveTierRank, isIncidentTier, TIER_RANK } from './incidentTier';
import { isQuietVerdict } from './incidentVerdict';

/** The key a new-rule read is stamped with (`engine_flags`). One key covers EN-3's server
 *  half and EN-7, which ship together (PR-26); `lib/stoolForm.ts` names the same string for
 *  the stool re-check, and a test holds the two equal, so a split of EN-7's key is a red
 *  build here rather than a silent change to which rows speak the new words. */
export const EN3_ENGINE_KEY = 'engines_v3_en3';

/** The finished statuses a quiet verdict stands on. Mirrors `FINISHED_READ_STATUSES` in
 *  `lib/incidentReadState.ts`, which imports THIS list, so the two cannot drift. */
export const TIER_FINISHED_STATUSES: readonly string[] = ['completed', 'uncertain'];

/**
 * What a surface draws. The four new-rule tiers, and the two shipped words an earlier-rule
 * row keeps (`worth_a_call` also carries any value this build does not know).
 * "Part of a pattern" is drawn at render from a live finding (K2) and is not built here:
 * it lands with the finding's evidence set, and until then a `logged` read says
 * "Keep an eye out".
 */
export type TierDisplay =
  | 'call_now'
  | 'call_today'
  | 'logged'
  | 'not_enough_to_say'
  | 'worth_a_call'
  | 'monitor';

/** How a tier is drawn. Colour never carries a tier alone (GAP-32): the two calls share the
 *  rose, and fill against outline plus the words tell them apart. */
export type TierTone = 'call_filled' | 'call_outline' | 'neutral' | 'muted';

export interface TierWords {
  /** The chip / the card's label, the full phrase. */
  label: string;
  /** A narrow row's chip (History, the Home spine). The accessible label is always `label`. */
  short: string;
  /** The "read as" form, lower case, for the month, chart text and gallery labels. */
  readAs: string;
  /** The record's action line under a call: the service and what to do if it is closed.
   *  Null for the quiet tiers and for an earlier-rule read, which keeps today's card. */
  action: string | null;
  tone: TierTone;
  /** A call: paints the month's day and ranks with the rose on every surface. */
  call: boolean;
  /** Which rule's population a call counts in. The month never adds the two (spec §5). */
  rule: 'tiered' | 'earlier';
}

export const TIER_WORDS: Readonly<Record<TierDisplay, TierWords>> = {
  call_now: {
    label: 'Call your vet now',
    short: 'Call now',
    readAs: 'call now',
    action: "Call your vet now. If they're closed, call an emergency clinic.",
    tone: 'call_filled',
    call: true,
    rule: 'tiered',
  },
  call_today: {
    label: 'Call your vet today',
    short: 'Call today',
    readAs: 'call today',
    // No action line yet. The spec's line gives leave to wait ("if they're closed, first
    // thing tomorrow") only beside its exception ("or an emergency clinic tonight if
    // {this pet's call-now signs}"), and those signs come from EN-4's rows (PR-28). Until
    // they exist every call the engine writes is call today, a photo of digested blood
    // included, so the leave to wait would be calmer than today's "Worth a call"
    // (adversarial pass on PR-27). CUL-1432 carries the line.
    action: null,
    tone: 'call_outline',
    call: true,
    rule: 'tiered',
  },
  logged: {
    label: 'Keep an eye out',
    short: 'Keep an eye out',
    readAs: 'keep an eye out',
    action: null,
    tone: 'neutral',
    call: false,
    rule: 'tiered',
  },
  not_enough_to_say: {
    label: 'Not enough to say yet',
    short: 'Not enough to say yet',
    readAs: 'not read',
    action: null,
    tone: 'muted',
    call: false,
    rule: 'tiered',
  },
  // The shipped words, verbatim, for an earlier-rule read and for any value this build
  // does not know. Never edited: an old read keeps the words it had (spec §5).
  worth_a_call: {
    label: 'Worth a call',
    short: 'Worth a call',
    readAs: 'worth a call',
    action: null,
    tone: 'call_filled',
    call: true,
    rule: 'earlier',
  },
  monitor: {
    label: 'Keep an eye out',
    short: 'Keep an eye out',
    readAs: 'keep an eye out',
    action: null,
    tone: 'neutral',
    call: false,
    rule: 'earlier',
  },
};

/** A call as the month stores a photographed day's read: the new-rule calls, or the shipped
 *  "worth a call" of an earlier-rule read (and of any value this build does not know). */
export type CallDisplay = 'call_now' | 'call_today' | 'worth_a_call';

export function isCallDisplay(value: unknown): value is CallDisplay {
  return value === 'call_now' || value === 'call_today' || value === 'worth_a_call';
}

/** The louder of two calls for one day or one bout: call now over the rest, and between
 *  the two call-today words the new rule's, so a day reads in the newer words. */
export function louderCall(a: CallDisplay | null, b: CallDisplay | null): CallDisplay | null {
  const rank = (d: CallDisplay | null) => (d === 'call_now' ? 3 : d === 'call_today' ? 2 : d === 'worth_a_call' ? 1 : 0);
  return rank(b) > rank(a) ? b : a;
}

/** The new rule's calls, read together, for a count that holds both (the month's legend and
 *  its sentence): "call now or call today". Built from the map's own words. */
export const TIERED_CALLS_READ_AS = `${TIER_WORDS.call_now.readAs} or ${TIER_WORDS.call_today.readAs}`;

/** The shipped recommendation enum's words, verbatim. Kept for the readers that name an
 *  earlier-rule verdict by its enum (`lib/incidentReadState.ts` re-exports it). */
export const INCIDENT_REC_LABEL = {
  worth_a_call: TIER_WORDS.worth_a_call.label,
  monitor: TIER_WORDS.monitor.label,
  not_enough_to_say: TIER_WORDS.not_enough_to_say.label,
} as const;

const KNOWN_VERDICTS: readonly string[] = ['worth_a_call', 'monitor', 'not_enough_to_say'];

/** The columns the resolver reads. Text throughout: a server may hold values this build
 *  has never seen, and they must fail toward the rose, never throw. */
export interface TierRow {
  status?: string | null;
  tier?: string | null;
  recommendation?: string | null;
  /** The server's `text[]` as an array, or the phone's copy's JSON text of it. */
  engine_flags?: unknown;
}

function engineKeys(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Whether the row's words were written under the new rule: the rule-version STAMP decides,
 *  never the presence of a tier (spec §1). A rolled-back build's write leaves a stale tier
 *  beside a stamp without the key; that row is an earlier-rule read, and its words and its
 *  month population follow the stamp. The tier still counts toward the louder column. */
export function isTieredRow(row: TierRow | null | undefined): boolean {
  if (!row) return false;
  return engineKeys(row.engine_flags).includes(EN3_ENGINE_KEY);
}

/**
 * The words that stand for this row, or null when none do: no verdict at all, or a quiet
 * one on a read that did not finish (the header's rule 2). Never null for a call.
 */
export function tierDisplayOf(row: TierRow | null | undefined): TierDisplay | null {
  if (!row) return null;
  const tier = row.tier ?? null;
  const rec = row.recommendation ?? null;
  if (tier === null && rec === null) return null;

  if (effectiveTierRank(row) !== TIER_RANK.quiet) {
    // A call now is spoken as one only on a new-rule row; an unstamped stale call now (a
    // rollback) is still the louder column's call, in the shipped words.
    if (tier === 'call_now' && isTieredRow(row)) return 'call_now';
    // A value this build does not know, in either column, keeps the shipped words.
    if (tier !== null && !isIncidentTier(tier)) return 'worth_a_call';
    if (rec !== null && !KNOWN_VERDICTS.includes(rec)) return 'worth_a_call';
    if (!isTieredRow(row)) return 'worth_a_call';
    // A new-rule row whose louder column is call today: a `call_today` tier, or a
    // `worth_a_call` written beside a quiet tier (a flag-off write after a rollback).
    return 'call_today';
  }

  if (!TIER_FINISHED_STATUSES.includes(row.status ?? '')) return null;
  // The two quiet tiers share a rank; the less calm one wins a disagreement between the
  // columns, so a read that could not say never stands as one that looked.
  if (rec === 'not_enough_to_say' || tier === 'not_enough_to_say') return 'not_enough_to_say';
  // Only `monitor` / `logged` are left (the rank says quiet, and an unknown value ranks as
  // a call), so a quiet verdict here is a read that looked.
  if (rec !== null && !isQuietVerdict(rec)) return null;
  return isTieredRow(row) ? 'logged' : 'monitor';
}

/** Whether the row stands as a call (either rule), decided on the same max as every
 *  surface: presence escalates at any status. */
export function isCallRow(row: TierRow | null | undefined): boolean {
  if (!row) return false;
  return effectiveTierRank(row) !== TIER_RANK.quiet;
}

// ── CUL-819 (a): a call held over a read that did not finish ───────────────────
//
// When a re-read over a call fails, the server keeps the call and records only the error
// (`buildFailureWrite`'s error-only shape), and a rescue writes a call with status
// `failed`. Either way the call on screen is not a read of the photo the owner now sees.
// Disclosed beside the verdict, never reverted (PM ruling (a), 2026-09-26; the diet
// trial's blackout rule). New-rule rows only, so the change is dark until the key is on.

// The words say only what the row can back, and the row cannot back much: a timeout that
// left the call's own read standing (error-only), a rescue written from the record, and a
// rescue that carries this run's own photo finding whose SAVE failed (CUL-815) all look
// alike to the phone. So one line for all of them, which claims neither where the call
// came from nor that the read never finished: only that the latest attempt hit a problem
// and the call stands (adversarial pass on PR-27).
export const HELD_CALL_DISCLOSURE = 'The latest read hit a problem. This call stands.';
/** The observations under a held call describe the read before the latest attempt. */
export const EARLIER_READ_LABEL = 'From the earlier read';

/**
 * The disclosure a call carries when its latest run did not finish, or null. Null on an
 * earlier-rule row (dark until the key is on), on a quiet row, and while a run is pending
 * (the section shows the re-read in place instead, CUL-827).
 */
export function heldCallDisclosureOf(
  row: (TierRow & { error?: string | null }) | null | undefined,
): string | null {
  if (!row || !isCallRow(row) || !isTieredRow(row)) return null;
  if (row.status === 'pending') return null;
  if (row.status === 'failed') return HELD_CALL_DISCLOSURE;
  return typeof row.error === 'string' && row.error.length > 0 ? HELD_CALL_DISCLOSURE : null;
}
