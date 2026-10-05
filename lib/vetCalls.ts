import { getDb } from './db';
import { syncPendingVetCalls } from './sync';
import { toLocalDayKey, uuid } from './utils';
import {
  BOUT_LOOKBACK_MS,
  CALL_NOTE_MAX,
  boutAnchorFor,
  callRecordsOf,
  followUpStateOf,
  followUpWindow,
  incidentFamilyOf,
  type FollowUpAnswer,
  type VetCallRow,
  type WorthIt,
} from './vetCallState';
import { callTierReadsBetween, readCall, readCallRows, readIncidentCallState, type LocalEvent } from './vetCallReads';

export { readCall, readCallsForPet, readIncidentCallState, type CallView, type IncidentCallState } from './vetCallReads';

// The call record and its follow-up, on the phone (Engines v3 PR-36, CUL-1419;
// docs/nyx-care-state-requirements.md §6). The rules live in `lib/vetCallState.ts`, pure;
// this module is the storage around them, in the PR-35 shape (`lib/careAnswers.ts`): every
// write lands LOCAL-FIRST and the push follows, and every correction is a NEW row, because
// 082 grants no UPDATE.
//
// WHO SEES WHAT. The note is the owner's own words, shown back to her on the call record and
// nowhere else: no Edge Function selects it (guards/careRecord.test.ts), and nothing here
// hands it to one. The call and its answer reach no report and no share (§3.4, AC 9).

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
  // The forward walk needs the reads before the bout too: where a bout starts depends on
  // them (adversarial P2), so it reads the lookback, not just the 24 hours. Live reads only
  // (CUL-1604's deleted-anchor call, recommended): a removed call-now duplicate never sets
  // this call's rank. The walk runs once, here, and its answer is stored as the cover.
  const reads = await callTierReadsBetween(ev.pet_id, family, t - BOUT_LOOKBACK_MS, t);
  const tapped = reads.find((r) => r.eventId === eventId);
  if (!tapped) throw new Error('vet call: this read does not ask for a call');
  const anchor = boutAnchorFor(tapped, reads);

  const callId = newId();
  const ledgerId = newId();
  const createdAt = new Date(now).toISOString();
  const { dueAt, expiresAt } = followUpWindow(now);
  const db = getDb();
  // ONE transaction: a call with no owed row would cover the read (no second "I've called")
  // and never ask its question (code review). Both land or neither does.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO vet_calls
         (id, pet_id, called_on, event_id, note, supersedes, withdrawn,
          covers_rank, covers_from, made_here, created_at, synced)
       VALUES (?, ?, ?, ?, NULL, NULL, 0, ?, ?, 1, ?, 0)`,
      // The COVER, as shown now (§6.1, §6.3; 084): from the bout's first read, at the rank
      // of the read the owner TAPPED, which is what she was shown when she said she called.
      // Never the anchor's rank: a call made from a call-today screen must not silence a
      // call-now read she was never shown (adversarial pass 6, B; the safe reading of §6.3,
      // whose worst case is an extra offer on that louder read). Stored, pushed and never
      // recomputed, so a later raise, re-read or late read never moves it.
      [
        callId, ev.pet_id, toLocalDayKey(new Date(now)), anchor.eventId,
        tapped.rank, anchor.occurredAt, createdAt,
      ],
    );
    await db.runAsync(
      `INSERT INTO vet_call_follow_ups
         (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
       VALUES (?, ?, ?, ?, 'called', 'owed', NULL, NULL, ?, ?, ?, 0)`,
      [ledgerId, ev.pet_id, callId, anchor.eventId, dueAt, expiresAt, createdAt],
    );
  });
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
  // An answered call stays: its answer is final, and an Undo would only hide it here.
  const answered = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM vet_call_follow_ups WHERE vet_call_id = ? AND status = 'answered' LIMIT 1`,
    [callId],
  );
  if (answered) throw new Error('vet call: an answered call cannot be taken back');
  const owed = await db.getFirstAsync<{ due_at: string; expires_at: string }>(
    `SELECT due_at, expires_at FROM vet_call_follow_ups WHERE vet_call_id = ? AND status = 'owed' LIMIT 1`,
    [callId],
  );
  const createdAt = new Date(now).toISOString();
  const window = owed
    ? { dueAt: owed.due_at, expiresAt: owed.expires_at }
    : followUpWindow(new Date(root.created_at).getTime());
  // ONE transaction (code review): half an Undo would leave the call live or its question owed.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO vet_calls (id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at, synced)
       VALUES (?, ?, ?, ?, NULL, ?, 1, ?, 0)`,
      [newId(), root.pet_id, root.called_on, root.event_id, root.id, createdAt],
    );
    await db.runAsync(
      `INSERT INTO vet_call_follow_ups
         (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
       VALUES (?, ?, ?, ?, 'called', 'withdrawn', NULL, NULL, ?, ?, ?, 0)`,
      [newId(), root.pet_id, root.id, root.event_id, window.dueAt, window.expiresAt, createdAt],
    );
  });
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
  if (!record) throw new Error('vet call: no such call on this phone');
  const state = followUpStateOf(record, ledger, now);
  if (state.kind === 'answered') return 'already_answered';
  if (record.withdrawn) throw new Error('vet call: this call was taken back');
  // ONE ANSWER ANSWERS THE ESCALATION: every live call in it (two phones can each have
  // called), so neither phone asks again (adversarial pass 4, C). An escalation already
  // answered through a related call (pass 6, R) is not answered twice.
  const view = await readCall(callId, now);
  if (view?.followUp.kind === 'answered') return 'already_answered';
  const members = view?.memberIds.length ? view.memberIds : [callId];
  const createdAt = new Date(now).toISOString();
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const id of members) {
      const member = callRecordsOf(calls).find((c) => c.id === id);
      if (!member || followUpStateOf(member, ledger, now).kind === 'answered') continue;
      const owed = ledger.find((r) => r.vet_call_id === id && r.status === 'owed');
      const window = owed
        ? { dueAt: owed.due_at, expiresAt: owed.expires_at }
        : followUpWindow(new Date(calls.find((c) => c.id === id)?.created_at ?? root.created_at).getTime());
      await db.runAsync(
        `INSERT INTO vet_call_follow_ups
           (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
         VALUES (?, ?, ?, ?, 'called', 'answered', ?, ?, ?, ?, ?, 0)`,
        [newId(), root.pet_id, id, member.eventId, answer, worthIt, window.dueAt, window.expiresAt, createdAt],
      );
    }
  });
  return 'saved';
}
