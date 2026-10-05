import { getDb } from './db';
import { readCopies } from './readCopy';
import { isWorthACall } from './readState';
import { tierDisplayOf } from './incidentTierWords';
import { TIER_RANK, type TierRank } from './incidentTier';
import { dayStampFromDate, type VisitListRow } from './vetVisits';
import {
  callAboutOf,
  type CallAbout,
  FOLLOW_UP_ADD_IT,
  FOLLOW_UP_NOT_RECORDED,
  FOLLOW_UP_TITLE,
  answeredLine,
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
export function callTierRankOf(copy: Parameters<typeof isWorthACall>[0]): TierRank | null {
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
  /** The bout walk reads soft-deleted reads too, so it agrees with coverage about where a
   *  bout starts when its first read was removed (pass 2, item 6). */
  includeDeleted = false,
): Promise<CallTierRead[]> {
  // The family's types in SQL; the instant bound in JS, parsed (C-40).
  const events = await getDb().getAllAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events
      WHERE pet_id = ? AND (deleted_at IS NULL OR ?)
        AND event_type IN ('vomit', 'stool_normal', 'diarrhea')`,
    [petId, includeDeleted ? 1 : 0],
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
      `SELECT id, pet_id, called_on, event_id, note, supersedes, withdrawn, rank_at_call, created_at
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

/** One call, as the screens show it: one ESCALATION, which is an anchor read and the rank
 *  the call was made at. */
export interface CallView {
  call: CallRecord;
  followUp: FollowUpState;
  /** The event the call is about (the bout's first read), for its type and its day. */
  eventType: string | null;
  /** The escalation the call covers: its anchor's family and time, and the call's EFFECTIVE
   *  rank (below). Null family when the anchor event is not on this phone. */
  family: CallTierRead['family'] | null;
  anchorAt: string | null;
  rank: TierRank;
}

/**
 * Every live call for the pet, newest first, ONE per escalation.
 *
 * THE EFFECTIVE RANK. A call made on this phone carries the rank it was made at
 * (`rank_at_call`, §6.3 "as shown"): a later raise of its anchor never widens it (P1). A call
 * pulled from another phone carries none (082 has no such column, CUL-1602), and reads as its
 * anchor's CURRENT rank: the best the phone knows, and the reading that never asks again
 * about an escalation already called and answered (adversarial pass 2, item 2). Stated limit:
 * on the SECOND phone only, a call made at call today whose anchor was later raised reads as
 * call now. The read's ask is untouched either way.
 *
 * ONE PER ESCALATION. An escalation is (anchor, rank): two phones calling one escalation are
 * one view, and an answer to either answers it (P4, AC 10). A louder call on the same anchor
 * (made after a raise) is a DIFFERENT escalation with its own question (pass 2, item 1).
 *
 * An undone call is not listed, UNLESS its question was answered: an answer is final across
 * phones, so an Undo racing an answer on another phone never takes it off the record (P5).
 */
export async function readCallsForPet(petId: string, now: number = Date.now()): Promise<CallView[]> {
  const { calls, ledger } = await readCallRows(petId);
  const records = callRecordsOf(calls)
    .map((call) => ({ call, state: followUpStateOf(call, ledger, now) }))
    .filter(({ call, state }) => !call.withdrawn || state.kind === 'answered');
  if (records.length === 0) return [];
  const anchorIds = [...new Set(records.map((r) => r.call.eventId))];
  // Anchors read whether or not they were soft-deleted since: a removed duplicate still
  // bounds the bout it started (P3).
  const anchors = await getDb().getAllAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events WHERE id IN (${anchorIds.map(() => '?').join(', ')})`,
    anchorIds,
  );
  const anchorOf = new Map(anchors.map((a) => [a.id, a]));
  const copies = await readCopies(anchorIds);
  const effective = (c: CallRecord): TierRank =>
    c.rankAtCall ?? callTierRankOf(copies.get(c.eventId) ?? null) ?? TIER_RANK.call_today;

  const byEscalation = new Map<string, (typeof records[number] & { rank: TierRank })[]>();
  for (const r of records) {
    const rank = effective(r.call);
    const key = `${r.call.eventId}|${rank}`;
    const group = byEscalation.get(key);
    if (group) group.push({ ...r, rank });
    else byEscalation.set(key, [{ ...r, rank }]);
  }
  const views: CallView[] = [];
  for (const group of byEscalation.values()) {
    group.sort((a, b) => (a.call.calledOn < b.call.calledOn ? -1 : a.call.calledOn > b.call.calledOn ? 1 : a.call.id < b.call.id ? -1 : 1));
    const answered = group.find((g) => g.state.kind === 'answered');
    const shown = answered ?? group[0];
    const anchor = anchorOf.get(shown.call.eventId);
    views.push({
      call: shown.call,
      followUp: shown.state,
      eventType: anchor?.event_type ?? null,
      family: incidentFamilyOf(anchor?.event_type),
      anchorAt: anchor?.occurred_at ?? null,
      rank: shown.rank,
    });
  }
  return views.sort((a, b) => (a.call.calledOn < b.call.calledOn ? 1 : a.call.calledOn > b.call.calledOn ? -1 : 0));
}

/** Does this escalation's call cover the read? (The pure rule, `callCovers`.) */
export function viewCovers(view: CallView, read: CallTierRead): boolean {
  if (view.family === null || view.anchorAt === null) return false;
  return callCovers({ eventId: view.call.eventId, family: view.family, occurredAt: view.anchorAt, rank: view.rank }, read);
}

/** One call by id, or the escalation view it belongs to (a duplicate from another phone opens
 *  the one view, P4), or null. */
export async function readCall(callId: string, now: number = Date.now()): Promise<CallView | null> {
  const row = await getDb().getFirstAsync<{ pet_id: string; event_id: string }>(
    `SELECT pet_id, event_id FROM vet_calls WHERE id = ?`,
    [callId],
  );
  if (!row) return null;
  const all = await readCallsForPet(row.pet_id, now);
  return all.find((v) => v.call.id === callId) ?? all.find((v) => v.call.eventId === row.event_id) ?? null;
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
  const reads = await callTierReadsBetween(ev.pet_id, family, t, t);
  const self = reads.find((r) => r.eventId === eventId);
  if (!self) return { callTier: false, covering: null };
  // EVERY escalation is tested, never one stand-in per anchor (pass 2, item 1). The loudest
  // covering one is shown.
  const covering = (await readCallsForPet(ev.pet_id, now))
    .filter((v) => viewCovers(v, self))
    .sort((a, b) => b.rank - a.rank)[0] ?? null;
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

/**
 * One call as a Vet visits row (mock 2c, 4d), in VisitRow's shape so the list draws calls and
 * visits alike: the day, what it was about, and where its question stands. A row, never a
 * count: the list is the record of what the owner did, beside the visits she made.
 */
export function callListRowOf(view: CallView, pronoun: string): VisitListRow {
  const about = callAboutOf(view.eventType);
  const f = view.followUp;
  const where =
    f.kind === 'answered'
      ? answeredLine(f.answer, pronoun)
      : f.kind === 'due'
        ? FOLLOW_UP_TITLE
        : f.kind === 'expired'
          ? `${FOLLOW_UP_NOT_RECORDED} ${FOLLOW_UP_ADD_IT}`
          : view.call.note
            ? 'Your note is on it.'
            : '';
  return {
    id: view.call.id,
    petId: view.call.petId,
    visitedAt: view.call.calledOn,
    stamp: dayStampFromDate(view.call.calledOn),
    title: about ? `Called the vet about the ${about}` : 'Called the vet',
    where,
    tags: [],
  };
}

/** A call as History's date-only item needs it (§6.4: "its own row type in History on the
 *  call's day"). Undone calls are not listed. */
export interface HistoryCallRow {
  id: string;
  calledOn: string;
  /** Null when the event is not on this phone yet: the row then names no sign. */
  about: CallAbout | null;
}

export async function readCallsForHistory(petId: string): Promise<HistoryCallRow[]> {
  return (await readCallsForPet(petId)).map((v) => ({
    id: v.call.id,
    calledOn: v.call.calledOn,
    about: callAboutOf(v.eventType),
  }));
}

export { callAboutOf, type CallAbout } from './vetCallState';
