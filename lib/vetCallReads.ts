import { getDb } from './db';
import { readCopies } from './readCopy';
import { isWorthACall } from './readState';
import { tierDisplayOf } from './incidentTierWords';
import { TIER_RANK, type TierRank } from './incidentTier';
import {
  BOUT_MS,
  callCovers,
  callRecordsOf,
  followUpStateOf,
  incidentFamilyOf,
  type CallRecord,
  type CallTierRead,
  type FollowUpRow,
  type FollowUpState,
  type VetCallRow,
} from './vetCallState';

// The call record's READS (Engines v3 PR-36, CUL-1419). Split from the writers in
// `lib/vetCalls.ts` so a surface that only shows a call (Home's follow-up line, History, Vet
// visits) imports no write path: Home's closure is scanned for writes by EFFECT
// (guards/homeWrites.test.ts), and a SELECT-only module is what lets the line sit there.
// Local only: no network, no wait.

/** The rank of the read on this event, or null when it does not ask for a call. Decided
 *  by the one verdict reader (`isWorthACall`, the rose) and the tier-word map, so a read the
 *  record shows in the rose is exactly a read that offers "I've called". */
function callTierRankOf(copy: Parameters<typeof isWorthACall>[0]): TierRank | null {
  if (!isWorthACall(copy)) return null;
  return tierDisplayOf(copy ?? null) === 'call_now' ? TIER_RANK.call_now : TIER_RANK.call_today;
}

export interface LocalEvent {
  id: string;
  pet_id: string;
  event_type: string;
  occurred_at: string;
}

/** The pet's call-tier reads of one family whose events fall in [fromMs, toMs]. */
export async function callTierReadsBetween(
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

export async function readCallRows(petId: string): Promise<{ calls: VetCallRow[]; ledger: FollowUpRow[] }> {
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


/** Every call, on every pet, whose question is still waiting to be due: what the follow-up
 *  notification may be scheduled for (lib/followUpNotifications.ts). */
export async function readWaitingFollowUps(
  now: number = Date.now(),
): Promise<{ callId: string; petId: string; dueAt: string }[]> {
  const pets = await getDb().getAllAsync<{ pet_id: string }>(`SELECT DISTINCT pet_id FROM vet_calls`, []);
  const out: { callId: string; petId: string; dueAt: string }[] = [];
  for (const { pet_id } of pets) {
    for (const v of await readCallsForPet(pet_id, now)) {
      if (v.followUp.kind === 'waiting') out.push({ callId: v.call.id, petId: pet_id, dueAt: v.followUp.dueAt });
    }
  }
  return out;
}

/** The pet's oldest call whose question is due now, for Home's one line (§6.3), or null. */
export async function readDueFollowUp(petId: string, now: number = Date.now()): Promise<CallView | null> {
  const due = (await readCallsForPet(petId, now)).filter((v) => v.followUp.kind === 'due');
  return due.length === 0 ? null : due[due.length - 1];
}
