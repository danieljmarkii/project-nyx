import { getDb } from './db';
import { uuid } from './utils';

// The vet-visit companion's read/write model (CUL-900, VV-2; spec §4.1 A1/E1/E2/E3/D3).
//
// Everything the companion's screens compute lives HERE rather than in
// components/vetvisits/, and that is not a style preference: the AC 0 harness
// (guards/vetVisitsFlagOff.test.tsx) stubs every export of that namespace into a
// null-rendering component to prove flag-off equivalence, so a helper placed there
// would be silently wrapped into a component. The namespace is UI by convention;
// this file is the model.
//
// Two tables, and the split is load-bearing (G3, migration 066): `vet_appointments`
// holds a booking that has NOT happened, `vet_visits` holds one that DID. Three
// shipped readers key off the second meaning without saying so — the rundown's bare
// MAX(visited_at), the Vet Files link picker, and the report's window rung 1 — so a
// booking is unwritable into the table those readers trust.

// ── Row shapes (the local mirrors) ──────────────────────────────────────────────

/** A visit that happened. `visited_at` is a calendar DATE, 'YYYY-MM-DD'. */
export interface LocalVetVisit {
  id: string;
  pet_id: string;
  visited_at: string;
  clinic_name: string | null;
  vet_name: string | null;
  reason: string | null;
  notes: string | null;
  next_visit_at: string | null;
  deleted_at: string | null;
}

/** A booking. `scheduled_at` is an INSTANT (ISO/UTC), not a calendar date. */
export interface LocalVetAppointment {
  id: string;
  pet_id: string;
  scheduled_at: string;
  clinic_name: string | null;
  vet_name: string | null;
  reason: string | null;
  vet_visit_id: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
}

// ── "Time optional" (§8 VV-2 decide-on-the-fly; VV-1 left the mechanism here) ────
//
// `scheduled_at` is TIMESTAMPTZ NOT NULL, and migration 066's header hands this
// file the job: "Time-optional in the UI is a client concern (VV-2 stores a chosen
// hour or a sensible default); the column can always answer."
//
// The booking sheet requires a DATE and offers a time (mock E3: "Optional"), so
// "no time given" needs a representation the readers can tell apart from a real
// one, without a schema change in a UI PR.
//
// LOCAL MIDNIGHT is that representation:
//   • the stored instant's local calendar date is always the date the owner
//     picked, in the owner's own zone — the thing every surface renders;
//   • the one value it cannot represent is a genuine 12:00 am booking, which is
//     not a thing a clinic offers. Local NOON was the alternative (more robust if
//     the owner crosses zones before the visit), and it was rejected because its
//     collision — a real noon appointment silently losing its printed time — is
//     plausible where midnight's is not.
//
// KNOWN LIMIT — the sentinel is read in the READING device's zone, not the one it
// was composed in. `appointmentTimeKnown` re-parses the instant and asks for its
// LOCAL hours, so compose and read agree only while the device's zone does. Change
// the zone between booking and viewing (travel, or a manual change) and a
// no-time booking can render a fabricated clock time, an early-morning one can
// read as no-time, and a large enough offset can shift the DISPLAYED day by one.
//
// This is a different failure from DST, which `Date`'s own offset math handles for
// a fixed zone. It is also structurally invisible to the CI timezone matrix, which
// runs the whole suite at one fixed `TZ` per job — compose and read always agree
// inside a run — so `lib/vetVisits.test.ts` drives the mismatch explicitly rather
// than leaving it to a job that cannot see it.
//
// Accepted for v1, not overlooked: the fix is the `scheduled_time_known` column,
// which is a migration and therefore its own PR, and the blast radius is a
// misprinted time on a booking rather than anything the record computes from.
// Filed as a follow-up on the issue.
export function appointmentTimeKnown(scheduledAt: string): boolean {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return false;
  // "Is this the first instant of its own local day", not "does it read 00:00".
  //
  // The two agree on every ordinary day and diverge on one: where a DST
  // transition lands ON local midnight, that wall-clock time DOES NOT EXIST, so
  // `new Date(y, m, d, 0, 0, 0, 0)` normalises forward to 01:00 and an
  // hours-based test reports a fabricated "1:00 am" on a booking where the owner
  // gave no time at all. Measured: Santiago, Havana, Cairo and Beirut, one day
  // each per year, and the CI matrix (UTC+14 / +12:45 / −10) cannot see any of
  // them. Asking `startOfLocalDay` instead makes the sentinel survive the skip,
  // because both sides normalise the same way.
  return d.getTime() !== startOfLocalDay(d).getTime();
}

/**
 * Compose the stored instant from the two pickers. `time` null ⇒ local midnight of
 * `day`, per the sentinel above.
 *
 * Both arguments are Dates from the platform picker, which produces them in the
 * device's zone — so the result is built from LOCAL components and never from a
 * UTC literal (C-29: a fixture for a local-day question is never a UTC literal,
 * and neither is production code).
 */
export function composeScheduledAt(day: Date, time: Date | null): string {
  const out = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  if (time) {
    out.setHours(time.getHours(), time.getMinutes(), 0, 0);
    // A real booking that lands exactly on local midnight would read back as
    // "no time". One minute is the smallest honest nudge, and it keeps the
    // sentinel a sentinel; a clinic does not book midnight, so this branch
    // exists to keep the invariant total rather than to serve a real owner.
    if (out.getHours() === 0 && out.getMinutes() === 0) out.setMinutes(1);
  }
  return out.toISOString();
}

// ── Dates as the owner reads them ───────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayStamp {
  /** '16' — the numeral in the date block. */
  day: string;
  /** 'Sep' — the month under it. */
  month: string;
}

/**
 * A calendar date ('YYYY-MM-DD') as its two display parts.
 *
 * Hand-parsed, the `formatVetDocumentDate` precedent: `new Date('2026-07-26')` is
 * parsed as UTC midnight by spec, so west of Greenwich every visit would render a
 * day early. `visited_at` has no time and no zone; reading its three numbers as
 * local is the only reading that cannot drift.
 */
export function dayStampFromDate(dateOnly: string): DayStamp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly ?? '');
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { day: String(Number(m[3])), month: MONTHS[monthIdx] };
}

/** The same two parts for an INSTANT, resolved in the device's zone. */
export function dayStampFromInstant(iso: string): DayStamp | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()] };
}

/** 'Jul 30' this year, 'Dec 19, 2025' otherwise — the sibling surfaces' two forms. */
export function formatVisitDate(dateOnly: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly ?? '');
  if (!m) return '';
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return '';
  const stem = `${MONTHS[monthIdx]} ${Number(m[3])}`;
  return Number(m[1]) === now.getFullYear() ? stem : `${stem}, ${Number(m[1])}`;
}

/** 'Tuesday, Sep 16' — the visit screen's eyebrow (mock D3). */
export function formatVisitWeekday(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly ?? '');
  if (!m) return '';
  // Guarded like its two siblings, which both refuse an out-of-range month while
  // this one silently rolled over — '2026-13-01' became "Friday, Jan 1" (of 2027,
  // with the year hidden) and '2026-02-30' put this screen's eyebrow on Mar 2
  // while the list row's stamp said 30 Feb, for the same record. Two of three
  // refusing and the third fabricating is the worst of the three arrangements.
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return '';
  const d = new Date(Number(m[1]), monthIdx, day);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== monthIdx) return '';
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatClockTime(d: Date): string {
  const h24 = d.getHours();
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/**
 * The appointment's headline: 'Tuesday' inside the coming week, 'Tue, Oct 28'
 * beyond it, with '· 3:00 pm' only when a time was actually given.
 *
 * A weekday name alone is only unambiguous for about a week — past that "Tuesday"
 * could be any of several, so the date takes over.
 */
export function formatAppointmentWhen(scheduledAt: string, now: Date = new Date()): string {
  const stem = formatAppointmentDay(scheduledAt, now);
  if (!stem) return '';
  return appointmentTimeKnown(scheduledAt)
    ? `${stem} · ${formatClockTime(new Date(scheduledAt))}`
    : stem;
}

/**
 * The DAY half alone — 'Today', 'Tomorrow', 'Tuesday', 'Tue, Oct 28'.
 *
 * Exported because a sentence needs it without the clock time: the Home strip's
 * after-the-day ask reads *"Did Tuesday's visit happen?"*, and built from the full
 * `when` it came out as *"Did Tuesday · 3:00 pm's visit happen?"*. One composer for
 * both, rather than a caller splitting the joined string back apart on its
 * separator.
 */
export function formatAppointmentDay(scheduledAt: string, now: Date = new Date()): string {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return '';
  const days = localDayDelta(d, now);
  let stem: string;
  if (days === 0) stem = 'Today';
  else if (days === 1) stem = 'Tomorrow';
  else if (days > 1 && days < 7) stem = WEEKDAYS[d.getDay()];
  // Past a week a weekday name is ambiguous, and past a year so is a bare date:
  // the most common veterinary interval is the annual recheck, which `next_visit_at`
  // seeds directly, and "Wed, Sep 15" renders identically twelve months apart.
  // `formatVisitDate` in this same file already stamps the year when it is not
  // this one (C-19: a year-less date is safe only inside a bounded range); this
  // branch is outside any bound, so it does the same.
  else {
    const stamp = `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    stem = d.getFullYear() === now.getFullYear() ? stamp : `${stamp}, ${d.getFullYear()}`;
  }
  return stem;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Whole LOCAL calendar days from `now`'s day to `when`'s day. Negative in the past.
 *
 * ONE definition, shared by the label above and by the Home strip's window
 * (`resolveStripPhase`), and the sharing is the point rather than the tidiness: the
 * strip renders "Vet visit on Tuesday" from the first and decides whether to render
 * at all from the second. Two copies of this arithmetic could disagree on a DST
 * boundary and put "Today" on a strip that had already left, or drop a strip whose
 * own label still said tomorrow.
 *
 * `Math.round` over two local midnights, not a raw division: a DST transition inside
 * the span makes the difference 23 or 25 hours, and rounding absorbs the hour. Both
 * ends are normalised the same way, so the skip cancels.
 */
function localDayDelta(when: Date, now: Date): number {
  return Math.round(
    (startOfLocalDay(when).getTime() - startOfLocalDay(now).getTime()) / 86_400_000,
  );
}

/** 'Riverside Animal Hospital · Dr. Chen · recheck' — whatever of the three exists. */
export function formatWhereLine(
  parts: { clinicName?: string | null; vetName?: string | null; reason?: string | null },
): string {
  return [parts.clinicName, parts.vetName, parts.reason]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)
    .join(' · ');
}

// ── The plan a past visit left behind (mock E1) ─────────────────────────────────

/**
 * Four kinds, not three, because two questions are asked of these tags and only
 * one of them is about colour:
 *   • the LIST renders all four as pills — "what this visit left behind";
 *   • the CARD's sentence renders only the three that are a PLAN. A document is
 *     something the visit produced, not something the vet prescribed.
 * `recheck` and `document` share the neutral pill styling; they are separate
 * members so the card can select on meaning rather than on a label string.
 */
export type PlanTagKind = 'med' | 'diet' | 'recheck' | 'document';

/** The kinds that belong after the word "Plan:". */
const PLAN_KINDS: ReadonlySet<PlanTagKind> = new Set<PlanTagKind>(['med', 'diet', 'recheck']);

export interface PlanTag {
  label: string;
  kind: PlanTagKind;
}

/**
 * Per-visit link counts, read from the records themselves.
 *
 * The tags are DERIVED, never typed (§4.1): every one of them is a row that exists
 * somewhere else and names this visit. A visit is a provenance anchor, never a
 * source of numbers (CUL-746) — so these say *what came out of the visit*, and the
 * numbers on each of those things stay the thing's own.
 */
export interface VisitLinks {
  medicationNames: string[];
  trialCount: number;
  documentCount: number;
  hasNextVisit: boolean;
}

export function derivePlanTags(links: VisitLinks): PlanTag[] {
  const tags: PlanTag[] = [];
  if (links.trialCount > 0) {
    tags.push({ label: links.trialCount === 1 ? 'Trial started' : `${links.trialCount} trials started`, kind: 'diet' });
  }
  for (const name of links.medicationNames) tags.push({ label: name, kind: 'med' });
  if (links.hasNextVisit) tags.push({ label: 'Recheck set', kind: 'recheck' });
  if (links.documentCount > 0) {
    tags.push({
      label: links.documentCount === 1 ? '1 document' : `${links.documentCount} documents`,
      kind: 'document',
    });
  }
  return tags;
}

// ── The list's view model ───────────────────────────────────────────────────────

export interface VisitListRow {
  id: string;
  petId: string;
  /** The raw 'YYYY-MM-DD', for any consumer that needs a date rather than a block. */
  visitedAt: string;
  stamp: DayStamp | null;
  /** The reason, or an honest stand-in — a visit with no reason typed is ordinary. */
  title: string;
  /** Clinic · vet. Empty when neither was recorded. */
  where: string;
  tags: PlanTag[];
}

export interface AppointmentView {
  id: string;
  petId: string;
  stamp: DayStamp | null;
  /** 'Tuesday · 3:00 pm' */
  when: string;
  /** 'Tuesday' — the day half alone, for a sentence that cannot carry the clock. */
  day: string;
  /** 'Riverside Animal Hospital · Dr. Chen · recheck' */
  where: string;
  /**
   * The appointment's day is TODAY — the day its two in-visit doors mean anything
   * (CUL-902).
   *
   * "At the vet" is a room the owner is not in yet, and "How did it go?" is a
   * question about a thing that has not happened. Offering either on a recheck booked
   * six weeks out is a mis-tap that CONSUMES the booking: the save marks the
   * appointment attended, so it leaves Home and *Next* and there is no way back
   * before VV-6's delete (CUL-939). `next` is unbounded into the future, so the doors
   * are gated on this rather than on the list they sit in.
   *
   * Distinct from VV-5's strip window (`resolveStripPhase`), which spans five days
   * either side: that one decides whether Home CARRIES the appointment, this one
   * whether the visit's own doors are live. *Get ready* is the door a future
   * appointment wants, and it is VV-5's.
   */
  isToday: boolean;
}

export interface VetVisitsHome {
  /**
   * The soonest booking that has not been logged or cancelled, on or after today.
   * "What is next" — the card's question.
   */
  next: AppointmentView | null;
  /**
   * Bookings whose DAY HAS PASSED with no visit logged against them, newest first.
   * "What is on file" — the list's question, which is a different one.
   *
   * These exist because the owner made them, and until VV-5's Home ask resolves
   * them (mock A2b) nothing else will. Hiding them was the first draft's answer and
   * it was wrong in a way the database could not see: every VV-2 surface dropped
   * the row the morning after, so the owner's only recovery was to re-type the
   * visit — minting a SECOND row while the original stayed in the record forever,
   * since no cancel control exists yet. A record surface does not hide a row the
   * owner put there.
   *
   * The card deliberately does not render these: leading the Pet tab with a stale
   * booking would answer "what is next" with something that is not.
   */
  awaiting: AppointmentView[];
  visits: VisitListRow[];
}

/** The zero value, so five call sites do not each restate the shape. */
export const EMPTY_VET_VISITS_HOME: VetVisitsHome = { next: null, awaiting: [], visits: [] };

export function buildVisitListRow(
  visit: LocalVetVisit,
  links: VisitLinks,
  now: Date = new Date(),
): VisitListRow {
  return {
    id: visit.id,
    petId: visit.pet_id,
    visitedAt: visit.visited_at,
    stamp: dayStampFromDate(visit.visited_at),
    // Never "Untitled": a visit with no reason typed is a perfectly ordinary
    // record, and the date is the one thing it always has.
    title: visit.reason?.trim() || `Visit on ${formatVisitDate(visit.visited_at, now)}`,
    where: formatWhereLine({ clinicName: visit.clinic_name, vetName: visit.vet_name }),
    tags: derivePlanTags(links),
  };
}

export function buildAppointmentView(
  appointment: LocalVetAppointment,
  now: Date = new Date(),
): AppointmentView {
  return {
    id: appointment.id,
    petId: appointment.pet_id,
    stamp: dayStampFromInstant(appointment.scheduled_at),
    when: formatAppointmentWhen(appointment.scheduled_at, now),
    day: formatAppointmentDay(appointment.scheduled_at, now),
    // Compared as LOCAL day keys. The stored value is an instant, so the day is the
    // reading device's calendar day — the same rule `readVetVisitsHome`'s day split
    // uses, and never a text compare of two ISO spellings (C-40).
    isToday: localDateKey(new Date(appointment.scheduled_at)) === localDateKey(now),
    where: formatWhereLine({
      clinicName: appointment.clinic_name,
      vetName: appointment.vet_name,
      reason: appointment.reason,
    }),
  };
}

// ── The Pet-tab card (mock A1) ──────────────────────────────────────────────────

export interface VetVisitsCardModel {
  /** '2 visits' — absent when there are none, where the count would be noise. */
  countLabel: string | null;
  next: AppointmentView | null;
  /** 'Last visit Jul 30 — GI follow-up. Plan: hydrolyzed trial, Cerenia.' */
  lastVisitLine: string | null;
  /** True when the card renders E2's two doors in place of the appointment. */
  isEmpty: boolean;
}

export function buildVetVisitsCardModel(home: VetVisitsHome, now: Date = new Date()): VetVisitsCardModel {
  const last = home.visits[0] ?? null;
  return {
    countLabel: home.visits.length
      ? `${home.visits.length} ${home.visits.length === 1 ? 'visit' : 'visits'}`
      : null,
    next: home.next,
    lastVisitLine: last ? lastVisitLine(last, now) : null,
    // Zero of BOTH: a booking with no history is not an empty card — it is the
    // card doing its job on day one.
    //
    // `awaiting` is deliberately NOT counted. The card answers "what is next and
    // what happened last", and a booking whose day has passed is neither; leading
    // the Pet tab with it would answer the first question with something that is
    // not next. The LIST is where that row is shown (see `VetVisitsHome.awaiting`),
    // and its own emptiness test does count it.
    isEmpty: home.visits.length === 0 && home.next === null,
  };
}

/**
 * 'Last visit Jul 30 — GI follow-up. Plan: trial started, Cerenia.'
 *
 * The plan half is omitted rather than filled with "no plan recorded": a visit that
 * left nothing behind in the record is the common case (every visit logged before
 * this track existed), and a card that announces an absence on every one of them
 * would be a permanent complaint about the record's own history.
 *
 * Two things the first draft got wrong, both from lowercasing the whole list:
 *
 *   • A DRUG NAME IS A PROPER NOUN. "Plan: trial started, cerenia" is not how the
 *     owner or the vet writes it, and the design authority (mock A1) reads
 *     "Cerenia". Only the derived phrases — which this file wrote — are lowered
 *     into the sentence; a name that came from the record keeps its own casing.
 *   • A DOCUMENT IS NOT A PLAN. "2 documents" belongs on the list row, where the
 *     pills say what the visit left behind, and not after the word "Plan:", where
 *     it claims the vet prescribed some paperwork.
 */
function lastVisitLine(last: VisitListRow, now: Date): string {
  // Built from `formatVisitDate`, not from `stamp`: the stamp is the two-part
  // date BLOCK (a numeral over a month, where the row it sits in supplies the
  // context), and reusing it in a sentence dropped the year — so a 2024 visit
  // read "Last visit Jul 30", indistinguishable from this year's.
  const dated = formatVisitDate(last.visitedAt, now);
  const head = dated ? `Last visit ${dated} — ${last.title}` : `Last visit — ${last.title}`;
  const plan = last.tags
    .filter((t) => PLAN_KINDS.has(t.kind))
    .map((t) => (t.kind === 'med' ? t.label : t.label.toLowerCase()));
  if (plan.length === 0) return `${head}.`;
  return `${head}. Plan: ${plan.join(', ')}.`;
}

// ── Reads ───────────────────────────────────────────────────────────────────────

const VISIT_COLUMNS =
  'id, pet_id, visited_at, clinic_name, vet_name, reason, notes, next_visit_at, deleted_at';
const APPOINTMENT_COLUMNS =
  'id, pet_id, scheduled_at, clinic_name, vet_name, reason, vet_visit_id, cancelled_at, deleted_at';

/**
 * What makes a booking LIVE: not deleted, not cancelled, and not already logged.
 *
 * Named once because two reads ask it — the Pet tab's (`readVetVisitsHome`, which
 * needs every row) and Home's (`readHomeAppointment`, which needs at most one). They
 * are two PROJECTIONS of one population, never two definitions of it: a booking that
 * disappeared from Home because the visit was logged must be gone from the Pet tab's
 * *Next* for exactly the same reason, and AC 3's "disappears when the visit is logged
 * or the appointment is cancelled" is this clause and nothing else.
 */
const LIVE_APPOINTMENT_SQL =
  'deleted_at IS NULL AND cancelled_at IS NULL AND vet_visit_id IS NULL';

/**
 * Everything the card and the list need, for ONE pet.
 *
 * `deleted_at IS NULL` on both tables — VV-1 shipped the column ahead of its
 * control, and a reader written without the filter is the thing that makes the
 * control unshippable later.
 */
export async function readVetVisitsHome(petId: string, now: Date = new Date()): Promise<VetVisitsHome> {
  const db = getDb();

  const visits = await db.getAllAsync<LocalVetVisit>(
    `SELECT ${VISIT_COLUMNS} FROM vet_visits
      WHERE pet_id = ? AND deleted_at IS NULL
      ORDER BY visited_at DESC, created_at DESC`,
    [petId],
  );

  // Every live booking in ONE read, split in memory rather than by two queries —
  // so "next" and "awaiting" cannot drift apart on their shared conditions (live =
  // not deleted, not cancelled, not already logged).
  //
  // The day bound is the start of the LOCAL day, not `now`: an appointment at 9am
  // today is still today's appointment at 5pm.
  const appointments = await db.getAllAsync<LocalVetAppointment>(
    `SELECT ${APPOINTMENT_COLUMNS} FROM vet_appointments
      WHERE pet_id = ? AND ${LIVE_APPOINTMENT_SQL}
      ORDER BY scheduled_at ASC`,
    [petId],
  );
  // Compared as INSTANTS, never as ISO text. A local write produces
  // `…T04:00:00.000Z` and the server round-trip produces PostgREST's
  // `…T04:00:00+00:00` — the same instant in two spellings, and `'+'` (0x2B)
  // sorts before `'.'` (0x2E), so a lexical `>=` drops the hydrated row at the
  // exact-equality second. That second is LOCAL MIDNIGHT, which is the no-time
  // sentinel — so the row it dropped was "a booking for today with no time
  // given", the default this sheet's own placeholder steers every owner toward,
  // on the one day the card matters most. After a sync it moved from *Next* to
  // *Waiting on you* and the Pet-tab card reverted to its zero state, all while
  // the row's own label still read "Today".
  //
  // The B-055 class, which this repo has written down three times —
  // `lib/db.ts:1222`, `lib/widgetSnapshot.ts:191`, `lib/widgetSnapshotV2.ts:110`
  // — each mitigating by parsing rather than by comparing text. This did neither
  // until the adversarial pass drove it.
  const dayStart = startOfLocalDay(now).getTime();
  const instantOf = (a: LocalVetAppointment) => new Date(a.scheduled_at).getTime();
  const upcoming = appointments.filter((a) => instantOf(a) >= dayStart);
  const past = appointments.filter((a) => instantOf(a) < dayStart);

  const links = await readVisitLinks(visits);

  return {
    next: upcoming[0] ? buildAppointmentView(upcoming[0], now) : null,
    // Newest first: the one that just passed is the one the owner is thinking about.
    awaiting: past.reverse().map((a) => buildAppointmentView(a, now)),
    visits: visits.map((v) => buildVisitListRow(v, links.get(v.id) ?? emptyLinks(v.next_visit_at), now)),
  };
}

function emptyLinks(nextVisitAt: string | null): VisitLinks {
  return { medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: !!nextVisitAt };
}

/**
 * The link counts behind the plan tags, one query per linked table.
 *
 * Reads the CHILD rows: a course, a trial or a document that names this visit. The
 * visit itself contributes no number — which is the whole of AC 10.
 */
export async function readVisitLinks(
  visits: ReadonlyArray<Pick<LocalVetVisit, 'id' | 'next_visit_at'>>,
): Promise<Map<string, VisitLinks>> {
  const out = new Map<string, VisitLinks>();
  if (visits.length === 0) return out;
  const db = getDb();
  const visitIds = visits.map((v) => v.id);
  const placeholders = visitIds.map(() => '?').join(', ');

  // `next_visit_at` comes from the row the CALLER already read. The first draft
  // re-queried vet_visits for it — a fourth round trip for a column that was
  // already in hand.
  for (const v of visits) out.set(v.id, emptyLinks(v.next_visit_at));

  const meds = await db.getAllAsync<{ vet_visit_id: string; drug_name: string }>(
    `SELECT vet_visit_id, drug_name FROM medications
      WHERE vet_visit_id IN (${placeholders})
      ORDER BY created_at ASC`,
    visitIds,
  );
  for (const m of meds) out.get(m.vet_visit_id)?.medicationNames.push(m.drug_name);

  const trials = await db.getAllAsync<{ vet_visit_id: string; n: number }>(
    `SELECT vet_visit_id, COUNT(*) AS n FROM diet_trials
      WHERE vet_visit_id IN (${placeholders})
      GROUP BY vet_visit_id`,
    visitIds,
  );
  for (const t of trials) {
    const entry = out.get(t.vet_visit_id);
    if (entry) entry.trialCount = t.n;
  }

  const docs = await db.getAllAsync<{ vet_visit_id: string; n: number }>(
    `SELECT vet_visit_id, COUNT(DISTINCT document_group_id) AS n FROM vet_documents
      WHERE vet_visit_id IN (${placeholders}) AND deleted_at IS NULL
      GROUP BY vet_visit_id`,
    visitIds,
  );
  for (const d of docs) {
    const entry = out.get(d.vet_visit_id);
    if (entry) entry.documentCount = d.n;
  }

  return out;
}

export interface VetVisitDetail {
  visit: LocalVetVisit;
  links: VisitLinks;
  /** The questions prepared for this visit, read back through the appointment that
   *  names it (CUL-902). Empty for a visit logged with no appointment behind it. */
  questions: AppointmentQuestion[];
  medications: Array<{ id: string; drugName: string; doseAmount: string | null; status: string }>;
  trials: Array<{ id: string; label: string; status: string }>;
  documents: Array<{ groupId: string; title: string | null; kind: string; documentDate: string | null }>;
}

/** One visit as written (mock D3). Returns null for a missing or deleted row. */
export async function readVetVisitDetail(visitId: string): Promise<VetVisitDetail | null> {
  const db = getDb();
  const rows = await db.getAllAsync<LocalVetVisit>(
    `SELECT ${VISIT_COLUMNS} FROM vet_visits WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [visitId],
  );
  const visit = rows[0];
  if (!visit) return null;

  const medications = await db.getAllAsync<{
    id: string; drug_name: string; dose_amount: string | null; status: string;
  }>(
    `SELECT id, drug_name, dose_amount, status FROM medications
      WHERE vet_visit_id = ? ORDER BY created_at ASC`,
    [visitId],
  );
  const trials = await db.getAllAsync<{
    id: string; food_label: string | null; status: string;
  }>(
    `SELECT id, food_label, status FROM diet_trials
      WHERE vet_visit_id = ? ORDER BY created_at ASC`,
    [visitId],
  );
  // MIN(page_index) is not decoration: SQLite may take each BARE column in a
  // GROUP BY from an arbitrary member row, so an aggregate is what makes the
  // selection deterministic — the convention `lib/vetDocumentLibrary.ts` already
  // documents for the same table. Harmless today (title/kind/document_date are
  // only ever written group-wide) but that is an invariant elsewhere in the code,
  // not a property of this query.
  const documents = await db.getAllAsync<{
    document_group_id: string; title: string | null; kind: string; document_date: string | null;
  }>(
    `SELECT document_group_id, title, kind, document_date, MIN(page_index) AS page_index
       FROM vet_documents
      WHERE vet_visit_id = ? AND deleted_at IS NULL
      GROUP BY document_group_id
      ORDER BY created_at DESC`,
    [visitId],
  );

  // The prepared questions live on the APPOINTMENT, not on the visit — there is no
  // column for them here, and a copy would be a second store for one fact (§5.1's
  // rule for the photo, applied to the ticks). One extra indexed read rather than a
  // duplicated column.
  const appointment = await db.getAllAsync<{ questions: string | null }>(
    `SELECT questions FROM vet_appointments
      WHERE vet_visit_id = ? AND deleted_at IS NULL LIMIT 1`,
    [visitId],
  );

  return {
    visit,
    questions: parseAppointmentQuestions(appointment[0]?.questions ?? null),
    links: {
      medicationNames: medications.map((m) => m.drug_name),
      trialCount: trials.length,
      documentCount: documents.length,
      hasNextVisit: !!visit.next_visit_at,
    },
    medications: medications.map((m) => ({
      id: m.id, drugName: m.drug_name, doseAmount: m.dose_amount, status: m.status,
    })),
    trials: trials.map((t) => ({
      id: t.id, label: t.food_label?.trim() || 'Diet trial', status: t.status,
    })),
    documents: documents.map((d) => ({
      groupId: d.document_group_id, title: d.title, kind: d.kind, documentDate: d.document_date,
    })),
  };
}

export interface VisitPrefill {
  clinicName: string | null;
  vetName: string | null;
  /** The last visit's `next_visit_at`, when it named one — E3's seeded date. */
  suggestedDate: string | null;
}

/**
 * Clinic and vet from the pet's most recent visit, plus the date that visit said
 * to come back on. Booking asks for one thing (a date) because of this read.
 */
export async function readVisitPrefill(petId: string): Promise<VisitPrefill> {
  const db = getDb();
  const rows = await db.getAllAsync<LocalVetVisit>(
    `SELECT ${VISIT_COLUMNS} FROM vet_visits
      WHERE pet_id = ? AND deleted_at IS NULL
      ORDER BY visited_at DESC, created_at DESC LIMIT 1`,
    [petId],
  );
  const last = rows[0];
  if (!last) return { clinicName: null, vetName: null, suggestedDate: null };
  return {
    clinicName: last.clinic_name?.trim() || null,
    vetName: last.vet_name?.trim() || null,
    suggestedDate: last.next_visit_at,
  };
}

// ── Writes (local-first; the queue pushes) ──────────────────────────────────────

export interface BookAppointmentInput {
  petId: string;
  /** The composed instant — see `composeScheduledAt`. */
  scheduledAt: string;
  clinicName?: string | null;
  vetName?: string | null;
  reason?: string | null;
  now?: Date;
  newId?: () => string;
}

/**
 * Book an appointment. Local INSERT with `synced = 0`; the queue pushes it.
 *
 * `petId` is the CALLER'S, and every call site passes the record's pet rather than
 * the store's active one (CUL-574 / AC 11): `app/vet-visit.tsx:117` reads
 * `activePet` at save time, which is the bug this whole track must not inherit.
 */
export async function bookVetAppointment(input: BookAppointmentInput): Promise<string> {
  const { newId = uuid, now = new Date() } = input;
  const id = newId();
  const nowIso = now.toISOString();
  await getDb().runAsync(
    `INSERT INTO vet_appointments
       (id, pet_id, scheduled_at, clinic_name, vet_name, reason, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.petId,
      input.scheduledAt,
      trimOrNull(input.clinicName),
      trimOrNull(input.vetName),
      trimOrNull(input.reason),
      nowIso,
      nowIso,
    ],
  );
  return id;
}

export interface LogVisitInput {
  petId: string;
  /** 'YYYY-MM-DD', the local calendar day of the visit. */
  visitedAt: string;
  clinicName?: string | null;
  vetName?: string | null;
  reason?: string | null;
  notes?: string | null;
  now?: Date;
  newId?: () => string;
}

/**
 * Log a visit that already happened — E2's second door and E3's *Already happened*
 * arm. The same local-first path the appointment takes.
 *
 * This is clinically load-bearing in one specific way the owner is told about: the
 * vet report's window rung 1 is the most recent visit STRICTLY BEFORE today, so a
 * visit logged today moves the window from tomorrow, never from today (§4.1 D2,
 * AC 9). No copy in this track may say "from today".
 */
export async function logVetVisit(input: LogVisitInput): Promise<string> {
  const { newId = uuid, now = new Date() } = input;
  const id = newId();
  const nowIso = now.toISOString();
  await getDb().runAsync(
    `INSERT INTO vet_visits
       (id, pet_id, visited_at, clinic_name, vet_name, reason, notes, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.petId,
      input.visitedAt,
      trimOrNull(input.clinicName),
      trimOrNull(input.vetName),
      trimOrNull(input.reason),
      trimOrNull(input.notes),
      nowIso,
      nowIso,
    ],
  );
  return id;
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length > 0 ? t : null;
}

/**
 * A visit that HAPPENED cannot be in the future, so a seeded date never is.
 *
 * THE SEED IS THE HOLE, not the picker. `AfterVisitBody` and `VisitEditBody` both
 * carry `maximumDate={new Date()}`, and `maximumDate` constrains a PICK — a date
 * already in state when the screen opens is not re-validated by anything, so an
 * owner who books a six-week recheck, taps *How did it go?* under *Next* and just
 * saves writes `visited_at` 42 days out without ever opening the picker. The report
 * then skips the row (rung 1 ignores today/future-dated visits) for 42 days while
 * the rundown's UNBOUNDED `MAX(visited_at)` adopts it and renders an absence over a
 * window that cannot contain anything — a false all-clear on the surface an owner
 * reads in the exam room.
 *
 * `BookVisitSheet` already writes this lesson down for its own mode transition;
 * VV-4 re-opened it one line above its own bound, and the adversarial pass drove it.
 * Clamped to the START of today rather than to `now`, so the returned value is a
 * calendar day rather than a wall-clock instant the caller has to trim.
 */
export function clampVisitDate(candidate: Date, now: Date = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return localDateKey(candidate) > localDateKey(now) ? today : candidate;
}

/** 'YYYY-MM-DD' for a Date, read in the device's zone (never `toISOString`). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── The Home strip (CUL-903 VV-5; spec §4.1 A2 / A2b, mock A2 / A2b) ────────────

/**
 * How long before an appointment Home carries it — five days before, through the
 * day of (six calendar days on screen).
 *
 * The PM ruled "fine anywhere between 3 and 7" (R-window), so this is one tunable
 * constant rather than a number spread across a predicate and a label.
 *
 * It bounds the AFTER-the-day ask too, and deliberately the same number: the
 * Designer's condition on this strip is that it asks once and leaves, "never
 * furniture for a month". A booking whose day passed more than five days ago stops
 * asking on Home and lives only in the visits list's *Waiting on you* bucket (VV-2),
 * which is a surface the owner goes to rather than one that comes to them. The cost
 * is stated: an owner who does not open the app for a week is never asked about that
 * booking on Home. The row is not lost — it is on the list, which is what that bucket
 * was built for.
 */
export const APPOINTMENT_WINDOW_DAYS = 5;

/** `upcoming` — the visit is ahead or today. `after` — its day has passed (mock A2b). */
export type StripPhase = 'upcoming' | 'after';

/**
 * Which face the strip wears for this booking, or null when Home should not carry
 * it at all. Pure and exported so the window is testable without a database.
 */
export function resolveStripPhase(scheduledAt: string, now: Date = new Date()): StripPhase | null {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  const delta = localDayDelta(d, now);
  if (delta > APPOINTMENT_WINDOW_DAYS) return null;
  if (delta >= 0) return 'upcoming';
  return delta >= -APPOINTMENT_WINDOW_DAYS ? 'after' : null;
}

export interface HomeAppointment {
  id: string;
  petId: string;
  phase: StripPhase;
  view: AppointmentView;
}

/**
 * The one booking Home should carry for this pet, or null.
 *
 * An UPCOMING booking always wins over a passed one. An owner with both is being
 * asked "what is next" by a surface that has room for one answer, and a visit they
 * are about to have outranks one they may not have had — the passed row keeps its
 * place on the list either way.
 *
 * Instants are compared through `resolveStripPhase`, which PARSES both sides. Never
 * a lexical comparison of the two ISO spellings: a local write produces
 * `…T04:00:00.000Z` and PostgREST hands the same instant back as `…T04:00:00+00:00`,
 * and the second sorts before the first at the exact-equality second — which here is
 * local midnight, the no-time sentinel (C-40, and the bug VV-2's adversarial pass
 * found in `readVetVisitsHome`).
 */
export async function readHomeAppointment(
  petId: string,
  now: Date = new Date(),
): Promise<HomeAppointment | null> {
  const rows = await getDb().getAllAsync<LocalVetAppointment>(
    `SELECT ${APPOINTMENT_COLUMNS} FROM vet_appointments
      WHERE pet_id = ? AND ${LIVE_APPOINTMENT_SQL}
      ORDER BY scheduled_at ASC`,
    [petId],
  );

  const dated = rows
    .map((a) => ({ a, phase: resolveStripPhase(a.scheduled_at, now) }))
    .filter((r): r is { a: LocalVetAppointment; phase: StripPhase } => r.phase !== null);

  // Ascending by `scheduled_at`, so the first `upcoming` is the soonest and the last
  // `after` is the most recently passed — the one the owner is actually thinking about.
  const upcoming = dated.find((r) => r.phase === 'upcoming');
  const chosen = upcoming ?? [...dated].reverse().find((r) => r.phase === 'after');
  if (!chosen) return null;

  return {
    id: chosen.a.id,
    petId: chosen.a.pet_id,
    phase: chosen.phase,
    view: buildAppointmentView(chosen.a, now),
  };
}

/**
 * An appointment plus its questions.
 *
 * `questions` is off `LocalVetAppointment` deliberately: the card and the list never
 * read it (`APPOINTMENT_COLUMNS` does not select it), and a column on the shared row
 * type that half the reads do not populate is a field every caller has to remember is
 * sometimes a lie. Get ready is the one surface that edits it, so it gets the wider
 * shape.
 */
export interface AppointmentDetail extends LocalVetAppointment {
  /** The raw JSON TEXT — parse with `parseAppointmentQuestions`. */
  questions: string | null;
  /**
   * The C1 in-room draft (CUL-902), off `LocalVetAppointment` for the reason above:
   * the card and the list never read it, and a column the narrow reads leave
   * undefined is a field every caller has to remember is sometimes a lie. "At the
   * vet" and "How did it go?" are the surfaces that edit it, and they read this shape.
   */
  notes_draft: string | null;
}

/** One appointment by id, for Get ready. Null for a missing, deleted or cancelled row. */
export async function readAppointmentById(appointmentId: string): Promise<AppointmentDetail | null> {
  const rows = await getDb().getAllAsync<AppointmentDetail>(
    `SELECT ${APPOINTMENT_COLUMNS}, questions, notes_draft FROM vet_appointments
      WHERE id = ? AND deleted_at IS NULL AND cancelled_at IS NULL LIMIT 1`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

// ── The owner's questions (spec §4.1 B1 "Your questions") ───────────────────────

/**
 * One prepared question. The shape migration 066 documents on the JSONB column:
 * `[{id, text, source, source_ref, asked_at}]`.
 *
 * `source` is `'owner'` on everything v1 writes — the record-derived rows live in
 * "Worth raising" and are DERIVED AT RENDER from their own sources, never copied in
 * here. Copying one would make this column a second, staler home for a claim the
 * record already owns (CUL-746: one population, one owner). The member exists so
 * VV-4's ticks and a future v2 can tell them apart without a migration.
 *
 * `asked_at` is VV-4's — the tick in the exam room. Carried through this module
 * untouched so an edit here can never erase one.
 */
export interface AppointmentQuestion {
  id: string;
  text: string;
  source: 'owner' | 'record';
  source_ref?: string | null;
  asked_at?: string | null;
}

/**
 * The per-question and per-list bounds, enforced AT ENTRY.
 *
 * `lib/sync.ts`'s `parseQuestionsForPush` already refuses a list too large for
 * migration 066's `length(questions::text) <= 65536` CHECK — because a CHECK
 * violation is a terminal `23514` that quarantines the whole appointment, losing the
 * scheduled time and the in-room draft along with the questions. Its own header says
 * what is missing: *"When the editor ships it should bound the list at ENTRY too,
 * where the owner can see it happen — a silent drop here is a backstop, never the
 * UX."* This is that bound, and the editor landed here rather than in VV-2.
 *
 * Both numbers come from the column's own documentation ("≤ a dozen strings") and
 * from the control: the sheet is one line. Twelve questions of 280 characters is
 * ~4 KB against a 60,000-character push bound, so the backstop stays unreachable
 * from this door by a wide margin rather than by a hair.
 */
export const QUESTION_MAX_LENGTH = 280;
export const QUESTION_LIST_MAX = 12;

/**
 * 'Asked 3 of 4' for the visit as written (CUL-902, mock D3) — null below one
 * question, where the ratio is noise.
 *
 * Never "Asked 0 of 0": a score for something the owner never set out to do.
 */
export function askedSummary(questions: ReadonlyArray<AppointmentQuestion>): string | null {
  if (questions.length === 0) return null;
  const asked = questions.filter((q) => !!q.asked_at).length;
  return `Asked ${asked} of ${questions.length}`;
}

/** The stored TEXT as a list. Anything not this module's shape is dropped, row by row. */
export function parseAppointmentQuestions(raw: string | null | undefined): AppointmentQuestion[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: AppointmentQuestion[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const q = entry as Record<string, unknown>;
    if (typeof q.id !== 'string' || typeof q.text !== 'string') continue;
    if (q.text.trim().length === 0) continue;
    out.push({
      id: q.id,
      text: q.text,
      source: q.source === 'record' ? 'record' : 'owner',
      source_ref: typeof q.source_ref === 'string' ? q.source_ref : null,
      // Preserved rather than defaulted: VV-4 writes it, and this module must not be
      // able to un-tick a question the owner ticked in the room.
      asked_at: typeof q.asked_at === 'string' ? q.asked_at : null,
    });
  }
  return out;
}

/**
 * Write the list. Local-first with `synced = 0`; the queue pushes it.
 *
 * THROWS when the UPDATE matched no row. A local `UPDATE … WHERE id = ?` that matches
 * nothing resolves `{ changes: 0 }` silently, and this surface is an editor over rows
 * read from the same store — so a row deleted on another device between the read and
 * the save would otherwise report a save that never happened (C-39, and the four
 * by-id updates in `lib/db.ts` all throw for the same reason).
 */
export async function saveAppointmentQuestions(
  appointmentId: string,
  questions: AppointmentQuestion[],
  now: Date = new Date(),
): Promise<void> {
  const res = await getDb().runAsync(
    // `sync_attempts = 0, sync_error = NULL` is the B-398 write-path contract, and on
    // THIS table it is the recovery path rather than hygiene: migration 066 puts two
    // CHECKs on `questions`, and a CHECK violation is a terminal `23514` that
    // quarantines the row — taking the scheduled time and the in-room draft with it.
    // An owner-visible edit clearing the quarantine is the only way back in.
    `UPDATE vet_appointments SET questions = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ? AND deleted_at IS NULL`,
    [JSON.stringify(questions), now.toISOString(), appointmentId],
  );
  if (res.changes === 0) {
    throw new Error(`vet_appointments ${appointmentId}: questions update matched no row`);
  }
}

/**
 * Cancel the appointment — the strip's *It didn't* (mock A2b) and the visits list's
 * own control.
 *
 * `COALESCE` so a second cancel is a no-op rather than a re-stamp: the timestamp
 * answers "when did the owner say this did not happen", and answering it twice with
 * the later of two taps would be the wrong answer. It also keeps `changes` at 1 on
 * the repeat, so a zero here means one thing only — the row is gone.
 */
export async function cancelVetAppointment(
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  const nowIso = now.toISOString();
  const res = await getDb().runAsync(
    // Clears the quarantine too (B-398). A cancel is the LAST edit an owner makes to
    // an appointment, so if this one did not clear it, a row quarantined by an earlier
    // bad push would stay quarantined forever — cancelled on this device and still
    // upcoming on every other one.
    `UPDATE vet_appointments SET cancelled_at = COALESCE(cancelled_at, ?), updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ? AND deleted_at IS NULL`,
    [nowIso, nowIso, appointmentId],
  );
  if (res.changes === 0) {
    throw new Error(`vet_appointments ${appointmentId}: cancel matched no row`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// VV-4 — the visit itself (CUL-902; spec §4.1 C1/D1/D2/D3)
//
// Everything below serves three screens: "At the vet" (the in-room draft and the
// ticks), "How did it go?" (the record-aware plan rows) and the visit's own Edit.
// It lives HERE for the reason the file header already gives — `guards/visitReaders`
// makes this the one file the companion may read the visit tables through, so
// app/vet-visits/ and components/vetvisits/ name no table at all.
// ════════════════════════════════════════════════════════════════════════════════

/** The appointment a visit was logged from, if there was one — the visit's route to
 *  its prepared questions (see `VisitQuestion`). Null for a visit logged cold. */
export async function readAppointmentForVisit(visitId: string): Promise<AppointmentDetail | null> {
  const rows = await getDb().getAllAsync<AppointmentDetail>(
    `SELECT ${APPOINTMENT_COLUMNS}, questions, notes_draft FROM vet_appointments
      WHERE vet_visit_id = ? AND deleted_at IS NULL LIMIT 1`,
    [visitId],
  );
  return rows[0] ?? null;
}

/**
 * Save the in-room draft (AC 6).
 *
 * A plain local write at `synced = 0`, debounced by the CALLER rather than here: the
 * debounce is a property of the keystroke stream, and a module that owned a timer
 * would make the write untestable without one. The queue pushes it like any other
 * row, so a phone call, a force-quit or a dead battery costs at most the last
 * keystrokes — which is the whole of "saved as you type".
 *
 * `updated_at` MOVES on every save (`syncQueue.test.ts` scans for this), and the
 * quarantine pair is cleared in the same statement so a row a server refusal parked
 * re-arms when the owner types into it (the `updateRegimen` shape).
 */
export async function saveNotesDraft(appointmentId: string, draft: string): Promise<void> {
  const now = new Date().toISOString();
  const res = await getDb().runAsync(
    `UPDATE vet_appointments
        SET notes_draft = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [draft.length > 0 ? draft : null, now, appointmentId],
  );
  // A local UPDATE that matched nothing resolves `{ changes: 0 }` with no error
  // (C-39) — and on THIS path the silence would be the worst kind: the owner is
  // watching "Saved as you type" under a field that is saving nowhere.
  if (res.changes === 0) {
    throw new Error(`saveNotesDraft: no appointment row matched id ${appointmentId}`);
  }
}

/**
 * Tick or un-tick a prepared question, returning the list as it now stands.
 *
 * Read-modify-write on the JSON column, THROUGH VV-5's reader and writer rather than
 * a second pair of its own. That is the whole convergence: `parseAppointmentQuestions`
 * already preserves `asked_at` "so an edit here can never erase one", and
 * `saveAppointmentQuestions` already carries the bound, the zero-row throw and the
 * quarantine-clearing write. A second parse and a second UPDATE over one column would
 * be exactly the "second, staler home" that module's header refuses.
 *
 * Un-ticking is supported and is not symmetry for its own sake: the tick is a
 * fingertip target in a room where the owner is holding an animal, and a mis-tap that
 * cannot be undone would leave the record asserting a question was asked.
 */
export async function setQuestionAsked(
  appointmentId: string,
  questionId: string,
  asked: boolean,
  now: Date = new Date(),
): Promise<AppointmentQuestion[]> {
  const appointment = await readAppointmentById(appointmentId);
  if (!appointment) {
    throw new Error(`setQuestionAsked: no appointment row matched id ${appointmentId}`);
  }
  const next = parseAppointmentQuestions(appointment.questions).map((q) =>
    q.id === questionId ? { ...q, asked_at: asked ? now.toISOString() : null } : q,
  );
  await saveAppointmentQuestions(appointmentId, next, now);
  return next;
}

// ── The plan rows read the record before they ask (§4.1 D1, CUL-825) ────────────

/**
 * An active course, as the plan row needs it.
 *
 * NO DOSE COUNT AND NO ADHERENCE. A row says what the record HOLDS — the drug, the
 * dose as prescribed, the day it started — and never a number it computed over the
 * course's children; those belong to the course's own surfaces (CUL-746: one
 * population, one owner).
 *
 * The rest of the columns are here for one reason: *Changed* opens the course's own
 * edit rather than a mini-form (§8's ruled default — a second course would split the
 * dose count), and that editor seeds from the whole row. Reading them here is what
 * keeps that a LOCAL read, so the door opens in a clinic car park.
 */
export interface ActiveCourse {
  id: string;
  petId: string;
  medicationItemId: string | null;
  drugName: string;
  doseAmount: string | null;
  route: string | null;
  dosesPerDay: number | null;
  scheduleNotes: string | null;
  indication: string | null;
  prescribedBy: string | null;
  /** 'YYYY-MM-DD'. Rendered as "since {date}", never as a duration (C-19). */
  startedAt: string;
  targetDurationDays: number | null;
  targetDurationDoses: number | null;
  /** The visit this course already names, if any — what makes *Keep* idempotent. */
  vetVisitId: string | null;
}

/**
 * The pet's active courses, from the LOCAL mirror.
 *
 * Local, not PostgREST, and that is the point of VV-3: this screen's whole job
 * happens in a clinic car park. The Pet tab reads the same courses remotely
 * (`profile.tsx`) and is why CUL-938 exists; nothing here inherits that.
 */
export async function readActiveCourses(petId: string): Promise<ActiveCourse[]> {
  const rows = await getDb().getAllAsync<{
    id: string; pet_id: string; medication_item_id: string | null; drug_name: string;
    dose_amount: string | null; route: string | null; doses_per_day: number | null;
    schedule_notes: string | null; indication: string | null; prescribed_by: string | null;
    started_at: string; target_duration_days: number | null; target_duration_doses: number | null;
    vet_visit_id: string | null;
  }>(
    `SELECT id, pet_id, medication_item_id, drug_name, dose_amount, route, doses_per_day,
            schedule_notes, indication, prescribed_by, started_at,
            target_duration_days, target_duration_doses, vet_visit_id
       FROM medications
      WHERE pet_id = ? AND status = 'active'
      ORDER BY started_at DESC, created_at DESC`,
    [petId],
  );
  return rows.map((r) => ({
    id: r.id,
    petId: r.pet_id,
    medicationItemId: r.medication_item_id,
    drugName: r.drug_name,
    doseAmount: r.dose_amount,
    route: r.route,
    // SQLite hands NUMERIC back as a number, but a hydrated row round-trips through
    // PostgREST, which serialises it as a string ("1.00") — the coercion
    // `app/(tabs)/profile.tsx` does at its own data boundary, for the same reason:
    // the frequency chip switches on this value.
    dosesPerDay: r.doses_per_day == null ? null : Number(r.doses_per_day),
    scheduleNotes: r.schedule_notes,
    indication: r.indication,
    prescribedBy: r.prescribed_by,
    startedAt: r.started_at,
    targetDurationDays: r.target_duration_days == null ? null : Number(r.target_duration_days),
    targetDurationDoses: r.target_duration_doses == null ? null : Number(r.target_duration_doses),
    vetVisitId: r.vet_visit_id,
  }));
}

// ── The CUL-945 guard: a link is refused on the device, not 25 cycles later ─────

/**
 * Does this visit belong to this pet, on this device?
 *
 * WHY THIS EXISTS AT ALL. Migration 067's `enforce_vet_visit_link_same_pet` raises
 * `23514` for a link across pets or accounts, and `23514` is TERMINAL
 * (`lib/syncQueue.ts`), so the FIRST push quarantines. What is lost is not the link
 * but the WHOLE PRESCRIPTION — drug, dose, schedule, indication — never recorded
 * server-side while it goes on rendering locally on Home, the widget and the
 * rundown. `updateRegimen` cannot clear the column (by design: provenance is set
 * once), so an owner edit re-arms the row and it re-quarantines. Permanently.
 * That is CUL-945, and it is latent only because no caller passed a link until now.
 *
 * So the device answers first. `false` for a visit that is missing, soft-deleted, or
 * another pet's — a missing visit is refused rather than waved through, because the
 * server will refuse it too and the owner is standing here now.
 *
 * KNOWN LIMIT, stated rather than implied: a device that has not yet hydrated a
 * visit another device logged will answer `false` for a link that would in fact be
 * legal. That is the safe direction — it costs a provenance link the owner can set
 * later from the record, where the bricked state costs the prescription.
 */
// The same-pet CHECK and its refusal live in `lib/vetVisitLink.ts`, not here, and
// the reason is measured rather than stylistic: their two callers (`startRegimen`,
// `startDietTrial`) sit inside Home's transitive import closure, so importing this
// model from them pulled every write below into the set `guards/homeWrites.test.ts`
// scans. Re-exported so the companion's own screens still reach them through one
// module — see that file's header.
export { visitIsForPet, VetVisitLinkRefused } from './vetVisitLink';

/**
 * The way OUT of the bricked state (CUL-945's third clause).
 *
 * Clears `vet_visit_id` on this pet's courses and trials that are BOTH quarantined
 * on the same-pet refusal AND carrying a link this device cannot resolve for the
 * pet — then re-arms them, so the next push carries the record without the link.
 *
 * BOTH CONDITIONS, and the first is what makes this safe. "The link does not resolve
 * locally" is true of a perfectly good link on a device that has not hydrated the
 * visit yet, and clearing it there would destroy real provenance. A row the SERVER
 * has already refused ABOUT THIS COLUMN is a different thing: the refusal is the
 * evidence that the link is wrong, and dropping it is strictly a recovery.
 *
 * THE MATCH IS THE TRIGGER'S OWN SENTENCE, NOT THE BARE SQLSTATE, and the adversarial
 * pass is why. `23514` is `check_violation` — not a link code. `medications` carries
 * two other named CHECKs from migration 049, and `lib/medications.ts` says outright
 * that the local mirror does NOT enforce the server's mutual-exclusion one — so a
 * locally-representable row produces a non-link `23514`. Paired with the second arm
 * (true for any visit this device has not hydrated: the household's second phone),
 * matching on the code alone destroys a VALID link, re-arms the row, and it
 * re-quarantines on the real constraint with its provenance gone for good
 * (`updateRegimen` cannot set the column back).
 *
 * So the predicate reads the message migrations 066/067 raise — "vet_visit_id %% must
 * reference a vet visit for the same pet (%%)" — which `formatSyncError` parks after
 * the code ("code first so the column is greppable by failure class"). C-31 keeps that
 * message stable and safe to match: it names only `NEW.*` values, never a field read
 * off another row.
 *
 * Returns how many rows it repaired, so a caller can say so or stay quiet.
 */
export async function repairRefusedVisitLinks(petId: string): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  let repaired = 0;
  for (const table of ['medications', 'diet_trials'] as const) {
    const res = await db.runAsync(
      `UPDATE ${table}
          SET vet_visit_id = NULL,
              updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
        WHERE pet_id = ?
          AND vet_visit_id IS NOT NULL
          AND sync_error LIKE '23514:%'
          AND sync_error LIKE '%vet_visit_id%must reference a vet visit for the same pet%'
          AND NOT EXISTS (
                SELECT 1 FROM vet_visits v
                 WHERE v.id = ${table}.vet_visit_id
                   AND v.pet_id = ${table}.pet_id
                   AND v.deleted_at IS NULL
              )`,
      [now, petId],
    );
    repaired += res.changes;
  }
  return repaired;
}

// ── Writing the visit (§4.1 D1) ─────────────────────────────────────────────────

export interface VisitFromAppointmentInput {
  /** The appointment ROW — `pet_id` is taken from here and never from the store's
   *  active pet (AC 11). Passing the row rather than an id is the point: a caller
   *  cannot supply a pet and an appointment that disagree. */
  appointment: Pick<AppointmentDetail, 'id' | 'pet_id' | 'clinic_name' | 'vet_name' | 'reason' | 'notes_draft'>;
  /** 'YYYY-MM-DD', the local calendar day of the visit (never `toISOString()` — the
   *  CUL-946 bug on the screen this replaces). */
  visitedAt: string;
  clinicName?: string | null;
  vetName?: string | null;
  reason?: string | null;
  /** The notes as they stand. Defaults to the appointment's draft, which is what
   *  "the draft moves into vet_visits.notes" means. */
  notes?: string | null;
  now?: Date;
  newId?: () => string;
}

/**
 * Create the visit this appointment became, and mark the appointment attended.
 *
 * ONE TRANSACTION, for the reason `startDietTrial` wraps its own: the visit row and
 * the attendance link are a single fact. A throw between them leaves a visit nothing
 * points at and an appointment still sitting on Home asking whether the visit
 * happened — with the owner's notes now in a row they have no door to.
 *
 * The draft is MOVED, not copied: `notes_draft` is nulled in the same transaction so
 * the record holds one copy of what the owner typed.
 */
export async function logVisitFromAppointment(input: VisitFromAppointmentInput): Promise<string> {
  const { newId = uuid, now = new Date() } = input;
  const db = getDb();
  const id = newId();
  const nowIso = now.toISOString();
  const appt = input.appointment;
  const notes = input.notes !== undefined ? input.notes : appt.notes_draft;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO vet_visits
         (id, pet_id, visited_at, clinic_name, vet_name, reason, notes, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        // FROM THE APPOINTMENT. The shipped screen reads `activePet` at save time
        // (`app/vet-visit.tsx:117`) and AC 11 is the test that catches it.
        appt.pet_id,
        input.visitedAt,
        trimOrNull(input.clinicName !== undefined ? input.clinicName : appt.clinic_name),
        trimOrNull(input.vetName !== undefined ? input.vetName : appt.vet_name),
        trimOrNull(input.reason !== undefined ? input.reason : appt.reason),
        trimOrNull(notes),
        nowIso,
        nowIso,
      ],
    );
    const res = await db.runAsync(
      `UPDATE vet_appointments
          SET vet_visit_id = ?, notes_draft = NULL,
              updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
        WHERE id = ?`,
      [id, nowIso, appt.id],
    );
    if (res.changes === 0) {
      // Inside the transaction, so the visit INSERT above rolls back with it. An
      // appointment that vanished under the screen (deleted on another device) must
      // not leave a half-attended pair behind.
      throw new Error(`logVisitFromAppointment: no appointment row matched id ${appt.id}`);
    }
  });

  return id;
}

/** The fields the after-visit screen and Edit both write. Every one is optional; an
 *  omitted key leaves the column alone, because these three callers each own a
 *  different subset of the row. */
export interface VisitDetailsPatch {
  visitedAt?: string;
  clinicName?: string | null;
  vetName?: string | null;
  reason?: string | null;
  notes?: string | null;
  /** 'YYYY-MM-DD' — the date the vet said to come back on, or null to clear it. */
  nextVisitAt?: string | null;
}

/**
 * Update a visit's own fields (D1's Save over a lazily-created row, and D3's Edit).
 *
 * Column-by-column rather than a fixed UPDATE list: `notes` and `next_visit_at` have
 * three distinct meanings here — unchanged, cleared, and set — and a fixed statement
 * can only express two of them. The C-10 rule restated: a field preserves on
 * omission when the caller is not describing it.
 */
export async function updateVisitDetails(visitId: string, patch: VisitDetailsPatch): Promise<void> {
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (patch.visitedAt !== undefined) { sets.push('visited_at = ?'); args.push(patch.visitedAt); }
  if (patch.clinicName !== undefined) { sets.push('clinic_name = ?'); args.push(trimOrNull(patch.clinicName)); }
  if (patch.vetName !== undefined) { sets.push('vet_name = ?'); args.push(trimOrNull(patch.vetName)); }
  if (patch.reason !== undefined) { sets.push('reason = ?'); args.push(trimOrNull(patch.reason)); }
  if (patch.notes !== undefined) { sets.push('notes = ?'); args.push(trimOrNull(patch.notes)); }
  if (patch.nextVisitAt !== undefined) { sets.push('next_visit_at = ?'); args.push(patch.nextVisitAt); }
  // Nothing to write is not an error and must not become a bare `SET updated_at`:
  // moving the version of a row nothing changed re-queues it for no reason and,
  // under LWW, lets it win over a real edit from another device.
  if (sets.length === 0) return;

  const now = new Date().toISOString();
  const res = await getDb().runAsync(
    `UPDATE vet_visits
        SET ${sets.join(', ')}, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ? AND deleted_at IS NULL`,
    [...args, now, visitId],
  );
  if (res.changes === 0) {
    throw new Error(`updateVisitDetails: no visit row matched id ${visitId}`);
  }
}

// ── The three link writers (provenance only — a link never moves a number) ──────

/**
 * *Keep* on a plan row: this course carries on, and — if the record does not already
 * say where it came from — it came from this visit.
 *
 * `started_at` NEVER MOVES, and neither does anything else the course computes from
 * (§4.1 D1, TG-5). The one column written is the link — which is why *Keep* leaves
 * `COUNT(*) WHERE status = 'active'` exactly where it was (AC 7).
 *
 * FIRST PROVENANCE WINS: `WHERE … AND vet_visit_id IS NULL`, so a course prescribed
 * at March's visit and confirmed again in September keeps saying March. The first
 * draft wrote the column unconditionally, and the adversarial pass drove what that
 * costs: tapping *Keep* RELOCATED the link, so March's visit silently stopped listing
 * Cerenia in its plan and September's started. `readVisitLinks`' own header says the
 * visit contributes no number of its own — and the number it renders had just moved
 * between two visits.
 *
 * The diff's argument for *Stopped* was already the argument for this: `vet_visit_id`
 * is where a course CAME FROM, and a course kept here started somewhere else. Returns
 * whether it wrote, so the caller's line can say which of the two happened rather
 * than assert one (CUL-825).
 *
 * Guarded by `visitIsForPet` at the call site rather than here, because the caller
 * holds the pet the screen is about.
 */
export async function linkCourseToVisit(medicationId: string, visitId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await getDb().runAsync(
    `UPDATE medications
        SET vet_visit_id = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ? AND vet_visit_id IS NULL`,
    [visitId, now, medicationId],
  );
  // No zero-row throw: zero rows is the ORDINARY outcome for an already-linked course,
  // and is indistinguishable here from a missing one. The caller is the after-visit
  // screen, which read the course from the local mirror a moment ago.
  return res.changes > 0;
}

/** The same for a running trial, and first-wins for the same reason. */
export async function linkTrialToVisit(trialId: string, visitId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await getDb().runAsync(
    `UPDATE diet_trials
        SET vet_visit_id = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ? AND vet_visit_id IS NULL`,
    [visitId, now, trialId],
  );
  return res.changes > 0;
}

// A document captured in the room is filed under the visit through Vet Files' own
// `linkVetDocumentVisit` (`lib/vetDocumentLibrary.ts`) — the ONE function that
// implements D7's report-window protection rule, regression-tested against a real
// database. A second writer of the same column here would be a second place for
// that rule to be got wrong.

// ── What the save did to the rest of the app (the D2 moment, §4.1 D2 / AC 8–9) ──

/**
 * Where this visit's day sits relative to today.
 *
 * THREE STATES, NOT A BOOLEAN, and the boolean it replaces is the bug the
 * adversarial pass found. `isBeforeToday: false` conflated *dated today* — which
 * becomes the report's anchor TOMORROW, so "starts from this visit" is true — with
 * *dated after today*, which the report's rung 1 skips (`report.ts`: "ignore
 * today/future-dated visits") for as long as the date is in the future. Driven
 * against the real `resolveScope`, a visit dated six weeks out made the moment
 * promise a window the report returned `fallback_90d` for, for 47 days.
 *
 * The seeds that could produce one are clamped (`app/vet-visits/after.tsx`,
 * `app/vet-visits/edit.tsx`), so the after-visit screen can no longer write a future
 * visit. This type is the second half of that fix rather than a belt on it: a future
 * row can still arrive by sync from a device that wrote one, and the copy must be
 * unable to make the claim when it does.
 */
export type VisitDayRelation = 'before_today' | 'today' | 'after_today';

/** The two record facts the saved moment's consequence lines are derived from. */
export interface VisitConsequence {
  /** No other live visit for this pet is dated on or after this one. */
  isLatest: boolean;
  /** Where the visit's day sits relative to today — see `VisitDayRelation`. */
  dayRelation: VisitDayRelation;
}

/**
 * Ask the record what this visit changed. Both surfaces the moment speaks about —
 * the vet report's window and Home's "since last visit" — are anchored on the pet's
 * LATEST visit, and neither is anchored on "the one just saved".
 *
 * That distinction is the whole reason this is a read rather than a constant. A
 * visit logged late (the owner catching up on a visit from March, with April's
 * already on record) changes neither surface, and a moment that told them it had
 * would be describing an app they are not using.
 *
 * The two conditions differ, and they differ for a reason worth keeping straight:
 * the rundown's anchor is an UNBOUNDED `MAX(visited_at)`, so a visit logged today is
 * the anchor today; the report's rung 1 is STRICTLY BEFORE today
 * (`generate-report/report.ts` — "ignore today/future-dated visits"), so the same
 * visit becomes the report's anchor tomorrow. The moment says both, separately.
 */
export async function readVisitConsequence(
  visit: Pick<LocalVetVisit, 'id' | 'pet_id' | 'visited_at'>,
  now: Date = new Date(),
): Promise<VisitConsequence> {
  const rows = await getDb().getAllAsync<{ later: number }>(
    `SELECT COUNT(*) AS later FROM vet_visits
      WHERE pet_id = ? AND id != ? AND deleted_at IS NULL AND visited_at >= ?`,
    [visit.pet_id, visit.id, visit.visited_at],
  );
  // Compared as DAY KEYS, both 'YYYY-MM-DD' and both fixed-width, which is the one
  // shape where a string comparison is the right tool (C-40 is about INSTANTS in two
  // spellings; a DATE column has one). `localDateKey` reads the device's own
  // calendar, never `toISOString()`.
  const todayKey = localDateKey(now);
  return {
    isLatest: (rows[0]?.later ?? 0) === 0,
    dayRelation:
      visit.visited_at < todayKey ? 'before_today'
      : visit.visited_at === todayKey ? 'today'
      : 'after_today',
  };
}

/** The visit a running trial already names, if any — what makes *Keep* idempotent. */
export async function readTrialVisitLink(trialId: string): Promise<string | null> {
  const rows = await getDb().getAllAsync<{ vet_visit_id: string | null }>(
    `SELECT vet_visit_id FROM diet_trials WHERE id = ? LIMIT 1`,
    [trialId],
  );
  return rows[0]?.vet_visit_id ?? null;
}
