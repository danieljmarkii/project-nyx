import { getDb } from './db';
import { readCopies } from './readCopy';
import { isWorthACall } from './readState';
import { tierDisplayOf } from './incidentTierWords';
import { TIER_RANK, type TierRank } from './incidentTier';
import { syncPendingVetCalls } from './sync';
import { toLocalDayKey, uuid } from './utils';
import {
  BOUT_MS,
  CALL_NOTE_MAX,
  boutAnchorFor,
  callCovers,
  callRecordsOf,
  followUpStateOf,
  followUpWindow,
  incidentFamilyOf,
  type CallRecord,
  type CallTierRead,
  type FollowUpAnswer,
  type FollowUpRow,
  type FollowUpState,
  type VetCallRow,
  type WorthIt,
} from './vetCallState';

// The call record and its follow-up, on the phone (Engines v3 PR-36, CUL-1419;
// docs/nyx-care-state-requirements.md §6). The rules live in `lib/vetCallState.ts`, pure;
// this module is the storage around them, in the PR-35 shape (`lib/careAnswers.ts`): every
// write lands LOCAL-FIRST and the push follows, and every correction is a NEW row, because
// 082 grants no UPDATE.
//
// WHO SEES WHAT. The note is the owner's own words, shown back to her on the call record and
// nowhere else: no Edge Function selects it (guards/careRecord.test.ts), and nothing here
// hands it to one. The call and its answer reach no report and no share (§3.4, AC 9).

/** The rank of the read on this event, or null when it does not ask for a call. Decided
 *  by the one verdict reader (`isWorthACall`, the rose) and the tier-word map, so a read the
 *  record shows in the rose is exactly a read that offers "I've called". */
function callTierRankOf(copy: Parameters<typeof isWorthACall>[0]): TierRank | null {
  if (!isWorthACall(copy)) return null;
  return tierDisplayOf(copy ?? null) === 'call_now' ? TIER_RANK.call_now : TIER_RANK.call_today;
}

interface LocalEvent {
  id: string;
  pet_id: string;
  event_type: string;
  occurred_at: string;
}

/** The pet's call-tier reads of one family whose events fall in [fromMs, toMs]. */
async function callTierReadsBetween(
  petId: string,
  family: CallTierRead['family'],
  fromMs: number,
  toMs: number,
): Promise<CallTierRead[]> {
  const events = await getDb().getAllAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events
      WHERE pet_id = ? AND deleted_at IS NULL`,
    [petId],
  );
  // Parsed, never compared as text (C-40): two spellings of one instant sort apart.
  const inRange = events.filter((e) => {
    const t = new Date(e.occurred_at).getTime();
    return incidentFamilyOf(e.event_type) === family && t >= fromMs && t <= toMs;
  });
  const copies = await readCopies(inRange.map((e) => e.id));
  const out: CallTierRead[] = [];
  for (const e of inRange) {
    const rank = callTierRankOf(copies.get(e.id) ?? null);
    if (rank === null) continue;
    out.push({ eventId: e.id, family, occurredAt: e.occurred_at, rank });
  }
  return out;
}

async function readCallRows(petId: string): Promise<{ calls: VetCallRow[]; ledger: FollowUpRow[] }> {
  const db = getDb();
  const [calls, ledger] = await Promise.all([
    db.getAllAsync<VetCallRow>(
      `SELECT id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at
         FROM vet_calls WHERE pet_id = ?`,
      [petId],
    ),
    db.getAllAsync<FollowUpRow>(
      `SELECT id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at
         FROM vet_call_follow_ups WHERE pet_id = ?`,
      [petId],
    ),
  ]);
  return { calls, ledger };
}

/** One call, as the screens show it. */
export interface CallView {
  call: CallRecord;
  followUp: FollowUpState;
  /** The event the call is about (the bout's first read), for its type and its day. */
  eventType: string | null;
}

/** Every live call for the pet, newest first. An undone call is not listed (its Undo was the
 *  owner taking it back). */
export async function readCallsForPet(petId: string, now: number = Date.now()): Promise<CallView[]> {
  const { calls, ledger } = await readCallRows(petId);
  const records = callRecordsOf(calls).filter((c) => !c.withdrawn);
  if (records.length === 0) return [];
  const types = await getDb().getAllAsync<{ id: string; event_type: string }>(
    `SELECT id, event_type FROM events WHERE id IN (${records.map(() => '?').join(', ')})`,
    records.map((r) => r.eventId),
  );
  const typeOf = new Map(types.map((t) => [t.id, t.event_type]));
  return records
    .map((call) => ({ call, followUp: followUpStateOf(call, ledger, now), eventType: typeOf.get(call.eventId) ?? null }))
    .sort((a, b) => (a.call.calledOn < b.call.calledOn ? 1 : a.call.calledOn > b.call.calledOn ? -1 : 0));
}

/** One call by id, or null. */
export async function readCall(callId: string, now: number = Date.now()): Promise<CallView | null> {
  const row = await getDb().getFirstAsync<{ pet_id: string }>(
    `SELECT pet_id FROM vet_calls WHERE id = ?`,
    [callId],
  );
  if (!row) return null;
  const all = await readCallsForPet(row.pet_id, now);
  return all.find((v) => v.call.id === callId) ?? null;
}

/** What the incident screen shows for one event: whether its read asks for a call, and the
 *  live call that covers it (§6.1), if any. */
export interface IncidentCallState {
  /** The read on this event asks for a call. False also when the event is not a vomit or a
   *  stool, or has no read on this phone. */
  callTier: boolean;
  covering: CallView | null;
}

export async function readIncidentCallState(eventId: string, now: number = Date.now()): Promise<IncidentCallState> {
  const ev = await getDb().getFirstAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events WHERE id = ?`,
    [eventId],
  );
  const family = incidentFamilyOf(ev?.event_type);
  if (!ev || !family) return { callTier: false, covering: null };
  const t = new Date(ev.occurred_at).getTime();
  // Every call-tier read that could anchor a bout covering this one: the 24 hours before it.
  const reads = await callTierReadsBetween(ev.pet_id, family, t - BOUT_MS, t);
  const self = reads.find((r) => r.eventId === eventId);
  if (!self) return { callTier: false, covering: null };
  const views = await readCallsForPet(ev.pet_id, now);
  const byEvent = new Map(reads.map((r) => [r.eventId, r]));
  const covering =
    views.find((v) => {
      const anchor = byEvent.get(v.call.eventId);
      return anchor !== undefined && callCovers(anchor, self);
    }) ?? null;
  return { callTier: true, covering };
}

// ── Writes ──────────────────────────────────────────────────────────────────────

/** Push the call queues. Never rejects: a failed push leaves the rows queued. */
export async function pushVetCalls(): Promise<void> {
  try {
    await syncPendingVetCalls();
  } catch (err) {
    console.warn('[vetCalls] push failed (queued):', err);
  }
}

/**
 * "I've called" on the read on `eventId`. Writes one call, attached to the bout's first
 * read (§6.1), and its one owed follow-up, due 48 hours from now. If a live call already
 * covers this read, writes nothing and returns that call's id: three reads of one bout owe
 * one follow-up (AC 10), and a second tap is never a second call.
 *
 * Throws when the read does not ask for a call: the control is drawn only on one, and a
 * call row over a calm read would be a record the owner never made.
 */
export async function recordCall(
  eventId: string,
  opts: { now?: number; newId?: () => string } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? uuid;
  const state = await readIncidentCallState(eventId, now);
  if (!state.callTier) throw new Error('vet call: this read does not ask for a call');
  if (state.covering) return state.covering.call.id;
  const ev = await getDb().getFirstAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events WHERE id = ?`,
    [eventId],
  );
  const family = incidentFamilyOf(ev?.event_type);
  if (!ev || !family) throw new Error('vet call: no such incident');
  const t = new Date(ev.occurred_at).getTime();
  const reads = await callTierReadsBetween(ev.pet_id, family, t - BOUT_MS, t);
  const tapped = reads.find((r) => r.eventId === eventId);
  if (!tapped) throw new Error('vet call: this read does not ask for a call');
  const anchor = boutAnchorFor(tapped, reads);

  const callId = newId();
  const ledgerId = newId();
  const createdAt = new Date(now).toISOString();
  const { dueAt, expiresAt } = followUpWindow(now);
  const db = getDb();
  await db.runAsync(
    `INSERT INTO vet_calls (id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at, synced)
     VALUES (?, ?, ?, ?, NULL, NULL, 0, ?, 0)`,
    [callId, ev.pet_id, toLocalDayKey(new Date(now)), anchor.eventId, createdAt],
  );
  await db.runAsync(
    `INSERT INTO vet_call_follow_ups
       (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
     VALUES (?, ?, ?, ?, 'called', 'owed', NULL, NULL, ?, ?, ?, 0)`,
    [ledgerId, ev.pet_id, callId, anchor.eventId, dueAt, expiresAt, createdAt],
  );
  return callId;
}

async function rootCall(callId: string): Promise<VetCallRow> {
  const root = await getDb().getFirstAsync<VetCallRow>(
    `SELECT id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at
       FROM vet_calls WHERE id = ? AND supersedes IS NULL`,
    [callId],
  );
  if (!root) throw new Error('vet call: no such call on this phone');
  return root;
}

/**
 * Undo "I've called" (C-21, the one reversal): a new call row naming the call, withdrawn,
 * and a `withdrawn` ledger row, so nothing is asked (§6.3). The escalation's ask was never
 * lowered by the call, so there is nothing to restore on screen but the two answers.
 */
export async function undoCall(callId: string, opts: { now?: number; newId?: () => string } = {}): Promise<void> {
  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? uuid;
  const root = await rootCall(callId);
  const db = getDb();
  const owed = await db.getFirstAsync<{ due_at: string; expires_at: string }>(
    `SELECT due_at, expires_at FROM vet_call_follow_ups WHERE vet_call_id = ? AND status = 'owed' LIMIT 1`,
    [callId],
  );
  const createdAt = new Date(now).toISOString();
  await db.runAsync(
    `INSERT INTO vet_calls (id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at, synced)
     VALUES (?, ?, ?, ?, NULL, ?, 1, ?, 0)`,
    [newId(), root.pet_id, root.called_on, root.event_id, root.id, createdAt],
  );
  const window = owed
    ? { dueAt: owed.due_at, expiresAt: owed.expires_at }
    : followUpWindow(new Date(root.created_at).getTime());
  await db.runAsync(
    `INSERT INTO vet_call_follow_ups
       (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
     VALUES (?, ?, ?, ?, 'called', 'withdrawn', NULL, NULL, ?, ?, ?, 0)`,
    [
      newId(), root.pet_id, root.id, root.event_id, window.dueAt, window.expiresAt,
      createdAt,
    ],
  );
}

/** Bound and tidy a note the way the field does, or null when it is empty. */
export function normalizeCallNote(note: string | null): string | null {
  const t = (note ?? '').trim();
  if (t.length === 0) return null;
  return t.slice(0, CALL_NOTE_MAX);
}

/** Save the call's note (written after the save, never required): a new call row naming the
 *  call, carrying the whole note. An emptied note is a row with none. */
export async function saveCallNote(
  callId: string,
  note: string | null,
  opts: { now?: number; newId?: () => string } = {},
): Promise<void> {
  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? uuid;
  const root = await rootCall(callId);
  await getDb().runAsync(
    `INSERT INTO vet_calls (id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)`,
    [newId(), root.pet_id, root.called_on, root.event_id, normalizeCallNote(note), root.id, new Date(now).toISOString()],
  );
}

/**
 * Record what the vet said. Answered once: if this phone already holds an answer (its own, or
 * one pulled from another phone), nothing is written and the recorded answer stands. An
 * answer may be given after the question expired (the call record's "Add it", mock 4e): the
 * question stops being ASKED at expiry, and the record stays open to an answer.
 */
export async function answerFollowUp(
  callId: string,
  answer: FollowUpAnswer,
  worthIt: WorthIt | null,
  opts: { now?: number; newId?: () => string } = {},
): Promise<'saved' | 'already_answered'> {
  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? uuid;
  const root = await rootCall(callId);
  const { calls, ledger } = await readCallRows(root.pet_id);
  const record = callRecordsOf(calls).find((c) => c.id === callId);
  if (!record || record.withdrawn) throw new Error('vet call: this call was taken back');
  const state = followUpStateOf(record, ledger, now);
  if (state.kind === 'answered') return 'already_answered';
  if (state.kind === 'withdrawn') throw new Error('vet call: this call was taken back');
  const owed = ledger.find((r) => r.vet_call_id === callId && r.status === 'owed');
  const window = owed
    ? { dueAt: owed.due_at, expiresAt: owed.expires_at }
    : followUpWindow(new Date(root.created_at).getTime());
  await getDb().runAsync(
    `INSERT INTO vet_call_follow_ups
       (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
     VALUES (?, ?, ?, ?, 'called', 'answered', ?, ?, ?, ?, ?, 0)`,
    [newId(), root.pet_id, root.id, root.event_id, answer, worthIt, window.dueAt, window.expiresAt, new Date(now).toISOString()],
  );
  return 'saved';
}
