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
  return !(d.getHours() === 0 && d.getMinutes() === 0);
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
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return '';
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
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return '';
  const startOfToday = startOfLocalDay(now);
  const days = Math.round((startOfLocalDay(d).getTime() - startOfToday.getTime()) / 86_400_000);
  let stem: string;
  if (days === 0) stem = 'Today';
  else if (days === 1) stem = 'Tomorrow';
  else if (days > 1 && days < 7) stem = WEEKDAYS[d.getDay()];
  else stem = `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return appointmentTimeKnown(scheduledAt) ? `${stem} · ${formatClockTime(d)}` : stem;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
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
  /** 'Riverside Animal Hospital · Dr. Chen · recheck' */
  where: string;
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
    lastVisitLine: last ? lastVisitLine(last) : null,
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
function lastVisitLine(last: VisitListRow): string {
  const head = last.stamp
    ? `Last visit ${last.stamp.month} ${last.stamp.day} — ${last.title}`
    : `Last visit — ${last.title}`;
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
      WHERE pet_id = ?
        AND deleted_at IS NULL
        AND cancelled_at IS NULL
        AND vet_visit_id IS NULL
      ORDER BY scheduled_at ASC`,
    [petId],
  );
  const dayStart = startOfLocalDay(now).toISOString();
  const upcoming = appointments.filter((a) => a.scheduled_at >= dayStart);
  const past = appointments.filter((a) => a.scheduled_at < dayStart);

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

  return {
    visit,
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

/** 'YYYY-MM-DD' for a Date, read in the device's zone (never `toISOString`). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
