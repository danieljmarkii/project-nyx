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
  covers,
  BOUT_MS,
  callRecordsOf,
  followUpStateOf,
  incidentFamilyOf,
  type CallCover,
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
): Promise<CallTierRead[]> {
  // The family's types in SQL; the instant bound in JS, parsed (C-40).
  const events = await getDb().getAllAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events
      WHERE pet_id = ? AND deleted_at IS NULL
        AND event_type IN ('vomit', 'stool_normal', 'diarrhea')`,
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
      `SELECT id, pet_id, called_on, event_id, note, supersedes, withdrawn, covers_rank, covers_from, made_here, created_at
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

/** One call, as the screens show it, with any calls from other phones that stored the
 *  identical cover (084): one question between them. */
export interface CallView {
  call: CallRecord;
  followUp: FollowUpState;
  /** The event the call is about (the bout's first read), for its type and its day. */
  eventType: string | null;
  /** The anchor's family, or null when the anchor event is not on this phone yet: such a
   *  call is listed and covers nothing until its event arrives. */
  family: CallTierRead['family'] | null;
  /** The stored cover, once per member (identical across members), or none when the call
   *  carries no usable cover. */
  covers: CallCover[];
  /** The call's rank as stored, or null on a call whose root carries no cover. */
  rank: TierRank | null;
  /** How many live calls share this question (two phones can each call one bout). */
  calls: number;
  /** Every live call sharing it, so one answer answers them all (adversarial pass 4, C). */
  memberIds: string[];
  /** Whether the call shown was made on THIS phone. Undo is offered only on this phone's
   *  own lone call: never another caregiver's (pass 4, D). */
  ownCall: boolean;
}

/**
 * Every live call for the pet, newest first, ONE per escalation.
 *
 * ONE QUESTION PER CALL, shared only by calls whose stored covers are identical (below).
 * Read off what was stored at the tap, never off the reads' current tiers, so the grouping
 * is the same on every phone holding the same rows and never moves.
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
  // Anchors read whether or not they were soft-deleted since: the cover is stored, and the
  // anchor is read only for the family and the noun the screens name.
  const anchors = await getDb().getAllAsync<LocalEvent>(
    `SELECT id, pet_id, event_type, occurred_at FROM events WHERE id IN (${anchorIds.map(() => '?').join(', ')})`,
    anchorIds,
  );
  const anchorOf = new Map(anchors.map((a) => [a.id, a]));
  const placed = records.map((r) => {
    const family = incidentFamilyOf(anchorOf.get(r.call.eventId)?.event_type);
    const cover: CallCover | null =
      family !== null && r.call.cover !== null ? { family, ...r.call.cover } : null;
    return { ...r, family, cover };
  });
  // STATED LIMIT (C-38): 084 stores the cover's rank and start, not its family; the family is
  // read off the anchor event's type. Nothing in the app re-types an event, and the one
  // re-type in the repo (scripts/w1-other-row-swap) moves `other` rows to cough or sneeze, so
  // a stored cover's family never moves today. A cross-family edit would need the family
  // stored on the call (pass 8, 4).

  // ONE QUESTION PER CALL (PM ruling A, 2026-10-05, CUL-1604). Calls share a question only
  // when their stored covers are IDENTICAL: the same family, the same rank and the same
  // start instant (parsed, C-40). Two phones that walked one bout alike write identical
  // covers; two that anchored it differently each ask, an extra question, the spec's
  // accepted failure. Seven adversarial passes broke every rule that merged NEAR covers (a
  // late earlier call un-answered a question, a later bout joined an answered one), because
  // a near-merge depends on which other rows exist. Identity depends only on the pair, so no
  // row arriving later can split a group or join one. A call with no usable cover (its
  // anchor not here, or a malformed root) stands alone and covers nothing.
  const groupList: (typeof placed)[] = [];
  const byCover = new Map<string, typeof placed>();
  for (const p of placed) {
    if (p.cover === null) {
      groupList.push([p]);
      continue;
    }
    const key = `${p.cover.family}:${p.cover.rank}:${new Date(p.cover.from).getTime()}`;
    const g = byCover.get(key);
    if (g) g.push(p);
    else {
      const members = [p];
      byCover.set(key, members);
      groupList.push(members);
    }
  }

  // WHICH MEMBER SPEAKS FOR THE GROUP (adversarial pass 8). Decided over every member's rows,
  // never by the first member in list order: a member whose owed row has not landed yet reads
  // `none` and must not hide the owed question another member holds (pass 8, 1), and the
  // answer shown is the one the server recorded first across the group, so a later answer
  // from another phone never replaces it (pass 8, 2). Ties fall to the call id, so every
  // phone holding the same rows shows the same member.
  const ms = (iso: string): number => new Date(iso).getTime();
  const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const STATE_ORDER: Record<FollowUpState['kind'], number> = {
    answered: 0, due: 1, waiting: 2, expired: 3, withdrawn: 4, none: 5,
  };
  const views: CallView[] = [];
  for (const members of groupList) {
    const ids = new Set(members.map((m) => m.call.id));
    const firstAnswer = ledger
      .filter((r) => r.vet_call_id !== null && ids.has(r.vet_call_id) && r.status === 'answered' && r.answer !== null)
      .sort((a, b) => ms(a.created_at) - ms(b.created_at) || byId(a.id, b.id))[0];
    const answeredMember = firstAnswer
      ? members.find((m) => m.call.id === firstAnswer.vet_call_id && m.state.kind === 'answered')
      : undefined;
    const shown =
      answeredMember ??
      [...members].sort((a, b) =>
        STATE_ORDER[a.state.kind] - STATE_ORDER[b.state.kind] ||
        (a.call.calledOn < b.call.calledOn ? -1 : a.call.calledOn > b.call.calledOn ? 1 : 0) ||
        byId(a.call.id, b.call.id))[0];
    members.sort((a, b) => byId(a.call.id, b.call.id));
    views.push({
      call: shown.call,
      followUp: shown.state,
      eventType: anchorOf.get(shown.call.eventId)?.event_type ?? null,
      family: shown.family,
      covers: members.map((m) => m.cover).filter((c): c is CallCover => c !== null),
      rank: shown.cover?.rank ?? null,
      calls: members.length,
      memberIds: members.map((m) => m.call.id),
      ownCall: shown.call.madeHere,
    });
  }
  // A total order (pass 8, 3): newest day first, then louder, then the later cover, then id,
  // so the list, Home's one line and the incident screen never depend on row order.
  return views.sort(viewOrder);
}

function viewOrder(a: CallView, b: CallView): number {
  if (a.call.calledOn !== b.call.calledOn) return a.call.calledOn < b.call.calledOn ? 1 : -1;
  return loudestFirst(a, b);
}

/** Louder first, then the later cover, then the id: a total order on calls. */
function loudestFirst(a: CallView, b: CallView): number {
  const rank = (b.rank ?? 0) - (a.rank ?? 0);
  if (rank !== 0) return rank;
  const from = (v: CallView): number => (v.covers[0] ? new Date(v.covers[0].from).getTime() : 0);
  const f = from(b) - from(a);
  if (f !== 0) return f;
  return a.call.id < b.call.id ? -1 : a.call.id > b.call.id ? 1 : 0;
}

/** Does this escalation's call cover the read? Only its stored covers decide (`covers`). */
export function viewCovers(view: CallView, read: CallTierRead): boolean {
  return view.covers.some((c) => covers(c, read));
}

/** One call by id, or the escalation view it belongs to (a duplicate from another phone opens
 *  the one view, P4), or null. */
export async function readCall(callId: string, now: number = Date.now()): Promise<CallView | null> {
  const row = await getDb().getFirstAsync<{ pet_id: string }>(
    `SELECT pet_id FROM vet_calls WHERE id = ?`,
    [callId],
  );
  if (!row) return null;
  const all = await readCallsForPet(row.pet_id, now);
  return all.find((v) => v.memberIds.includes(callId)) ?? null;
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
  // Only the stored covers decide (084). A read timed before a cover's start (back-timed, or
  // its verdict landed after the call) is not covered and offers its own "I've called": a
  // possible extra question, never a hidden ask. EVERY escalation is tested (pass 2, item 1);
  // the loudest covering one is shown.
  const covering = (await readCallsForPet(ev.pet_id, now))
    .filter((v) => viewCovers(v, self))
    // The loudest covering call; among equals, the cover nearest the read (the later start),
    // then the id: the same pick on every phone holding the same rows (pass 8, 3).
    .sort(loudestFirst)[0] ?? null;
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
