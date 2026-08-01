// The Home medication strip resolver (B-614 PR M1).
//
// The medication analog of `lib/dietTrialCard.resolveTrialStrip`: a PURE function
// that folds the pet's active regimens + recent doses into one compact card PER MED
// (D3), for Home. It computes ONLY facts — the confirmability gate, the withholding
// set, the collapse predicate, the day-progress fraction, and indicative copy — and
// is deliberately free of expo-sqlite / supabase imports so it runs in plain jest,
// the same pure-split rationale as `lib/medications.ts` and `lib/dietTrialCard.ts`.
//
// The data fetch that assembles `MedStripInput` from the local mirror is M2's job;
// the component that renders `MedStripModel[]` is M2; the confirm write is M3; the
// final copy + clinical register is M5. This module owns the SHAPE and the RULES.
//
// ── THE FOUR THINGS THE APP MUST NEVER SAY (§3) ──────────────────────────────────
//   N1  never "missed", never "due" — coverage is stated as counted facts, never a
//       schedule the schema does not carry (there are no structured dose times).
//   N2  the only bar is DAY progress (`daysElapsed / target_duration_days`); a med
//       with no duration draws no bar — there is no honest dose-derived fraction.
//   N3  a refused / missed / in-doubt dose on record is a health signal, not a
//       scheduling gap: it suppresses the coverage line and stands the button down.
//   N4  never reassure on absence — "No dose logged yet today" is about the RECORD,
//       never the pet; the card never renders "all caught up".
// AC #4 pins N1 with a test over THIS module's output, not review — see
// `medStrip.test.ts`.
//
// Reuses the shipped predicates rather than re-deriving them (the diet-trial §5.3
// "one predicate" lesson, applied preemptively): `isComboDoseInDoubt` for the
// in-doubt state, `drugDisplayName` (B-171) for the header, `regimenDaysElapsed`
// (B-441) for the day math.
import {
  drugDisplayName,
  isComboDoseInDoubt,
  regimenDaysElapsed,
} from './medications';
import { localDayIndex, localDayIndexOf } from './utils';

// ── D4 — the ad-hoc window ────────────────────────────────────────────────────
//
// An ad-hoc med has no `status` and nothing ever ends it, so recency is the only
// available lifecycle signal (§4.2). 14 days matches the commonest short course (a
// 7–14 day antibiotic given ad-hoc without a regimen row) while letting a genuinely
// one-off dose age off Home. A NAMED CONSTANT, not a literal, because it is a
// product judgment that will be revisited once B-394's capture path lands and
// regimens become common (A-2). It also serves as the "recent window" the
// withholding set (§6) scans — one window, one constant.
export const MED_STRIP_ADHOC_WINDOW_DAYS = 14;

// ── §6 — the withholding set (N3's mechanism) ────────────────────────────────
//
// One exported list, mirroring `withholdingReasons` in `lib/dietTrialCard.ts`: one
// list, in one place, that both the card and any future consumer read, so a seventh
// reason cannot be added to one surface and forgotten on the other. A reason may be
// ADDED to this list, never subtracted by a downstream guard.
export type MedStripWithholding =
  | 'refused_dose'        // a 'refused' dose in the recent window
  | 'missed_dose'         // a 'missed' dose in the recent window
  | 'dose_in_doubt'       // an unconfirmed combo dose (B-156 PR B3)
  | 'intake_decline';     // the pet-level intake-decline flag is live

// ── Input contract (M2 assembles this from the local mirror; nothing new) ─────

// An active regimen (`medications`, `status = 'active'`). The caller filters to
// active — this module trusts that, exactly as `resolveTrialStrip` trusts the
// trial's status rather than re-checking it.
export interface MedStripRegimenRow {
  id: string;
  medication_item_id: string | null;
  drug_name: string;
  dose_amount: string | null;
  doses_per_day: number | null;      // NULL = PRN/as-needed → no compliance target
  started_at: string;                // Postgres DATE 'YYYY-MM-DD' (indexed verbatim)
  target_duration_days: number | null; // NULL = ongoing (no fixed course length)
}

// A dose (`medication_administrations` + its parent `events`). Soft-delete is read
// through the parent (`deleted_at`) — every count here filters it (AC #10). The
// `paired_*` fields are the live join `lib/db.ts` already exposes on a dose event,
// carried here only so the in-doubt state is derivable without a second read.
export interface MedStripDoseRow {
  medication_id: string | null;       // NULL = ad-hoc (unlinked)
  medication_item_id: string | null;
  adherence: string | null;           // 'given' | 'partial' | 'missed' | 'refused' | null
  dose_amount: string | null;
  paired_event_id: string | null;     // combo → this dose was given inside a meal/treat
  paired_vehicle_intake: string | null; // THAT meal's intake_rating (for in-doubt)
  occurred_at: string;                // parent events.occurred_at (ISO instant)
  deleted_at: string | null;          // parent events.deleted_at (soft-delete)
}

// A `medication_items_cache` row, keyed by id in `MedStripInput.items`. Names the
// drug via `drugDisplayName` (B-171). `is_critical` is deliberately absent — the
// strip WITHHOLDS, it does not escalate (A-1 is the standing B-117 open question and
// belongs to the Signal safety band, not this context card), so M1 reads no
// criticality. Add it here when A-1 is ruled, never before.
export interface MedStripItem {
  generic_name: string | null;
  brand_name: string | null;
}

export interface MedStripInput {
  regimens: MedStripRegimenRow[];             // active regimens only (caller-filtered)
  doses: MedStripDoseRow[];                   // the pet's recent doses (≥ the window)
  items: Record<string, MedStripItem>;        // medication_items_cache by id
  nowMs: number;                              // the instant, injected for testability
  timeZone?: string;                          // omit in the app — device zone IS midnight
  intakeDeclineActive?: boolean;              // the pet-level intake-decline flag (§6)
}

// ── Output model (M2 renders this; M3 writes from `confirm`) ──────────────────

// The row `insertMedicationDose` would write on a confirm tap (§5). Present only
// when the button renders (`MedStripModel.confirm !== null`).
export interface MedStripConfirm {
  // One of these two is non-null — the confirmability gate (§5.2 case 1). Both feed
  // `insertMedicationDose` directly.
  medicationItemId: string | null;
  medicationId: string | null;
  // Honest-null (D5): the regimen's `dose_amount`, else the last dose's, else null.
  // A drug's per-unit strength is NOT the dose, so the button is never made eligible
  // by fabricating an amount — the confirmation is of IDENTITY and OCCURRENCE.
  doseAmount: string | null;
}

export interface MedStripModel {
  // Dedup + React key: the `medication_item_id`, else `regimen:<id>` for a free-text
  // regimen with no library item.
  key: string;
  // Indicative copy — locks at M5 (`nyx-voice` + `clinical-guardrails`).
  header: string;
  // Day progress in [0, 1], or null when there is no honest denominator (ongoing /
  // ad-hoc / unparseable start). NEVER dose-derived (N2).
  progressFraction: number | null;
  // The single fact line, or null (collapsed, or an intake-decline-only withhold
  // where the Signal card above owns the fact). Indicative — locks at M5.
  line: string | null;
  // §7 — the med's cadence is covered today, so it renders as one line, no button.
  collapsed: boolean;
  // §6 — the withholding reasons in play; empty = none. Membership is what consumers
  // test; array order is not significant.
  withholding: MedStripWithholding[];
  // The confirm payload, or null when the button stands down (not confirmable §5.2 /
  // collapsed §7 / withholding §6). The button renders iff this is non-null.
  confirm: MedStripConfirm | null;
}

// ── §7 — the collapse predicate (exported: it is an M1 deliverable) ───────────
//
// A med whose cadence is already covered today collapses to one line with no button.
// PRN / ad-hoc (`dosesPerDay` NULL) NEVER collapses — the app cannot know a PRN med
// is "done", and PRN means repeat dosing is expected, so it always keeps its button
// (the §5.3 note). A non-positive `dosesPerDay` is malformed and treated as PRN.
export function isMedCadenceCoveredToday(input: {
  dosesPerDay: number | null;
  dosesLoggedToday: number;
}): boolean {
  const { dosesPerDay, dosesLoggedToday } = input;
  if (dosesPerDay == null || dosesPerDay <= 0) return false;
  return dosesLoggedToday >= dosesPerDay;
}

// ── §6 — the withholding set (exported: it is an M1 deliverable) ──────────────
//
// Presence-based, NOT a threshold: any refused / missed / in-doubt dose in the
// recent window withholds. The COUNT is disclosed by the copy (§9 state 8) but never
// gates whether the card speaks — that is what keeps M1 out of the DoD's
// adversarial-mandatory bucket (§10). If a future round makes this an "N of the last
// M" decision about WHETHER to speak, that PR becomes adversarial-mandatory.
export function medStripWithholdingReasons(input: {
  recentDoses: Pick<
    MedStripDoseRow,
    'adherence' | 'paired_event_id' | 'paired_vehicle_intake'
  >[];
  intakeDeclineActive: boolean;
}): MedStripWithholding[] {
  const reasons: MedStripWithholding[] = [];
  if (input.recentDoses.some((d) => d.adherence === 'refused')) reasons.push('refused_dose');
  if (input.recentDoses.some((d) => d.adherence === 'missed')) reasons.push('missed_dose');
  // The in-doubt state is derived by the SHIPPED predicate — never re-implemented
  // here (one predicate, `isComboDoseInDoubt`, shared with the History row + the
  // completion card). A combo dose whose vehicle went unfinished and that has no
  // explicit adherence yet is unconfirmed, and withholds for the same reason it
  // resurfaces there.
  if (
    input.recentDoses.some((d) =>
      isComboDoseInDoubt({
        isCombo: d.paired_event_id != null,
        vehicleIntake: d.paired_vehicle_intake,
        adherence: d.adherence,
      }),
    )
  ) {
    reasons.push('dose_in_doubt');
  }
  if (input.intakeDeclineActive) reasons.push('intake_decline');
  return reasons;
}

// ── The resolver ──────────────────────────────────────────────────────────────

// A candidate is a distinct medication that renders a card — an active regimen, a
// recently-dosed ad-hoc med, or (deduped) both. `regimen` is null for an
// ad-hoc-only candidate; `itemId` is null only for a free-text regimen.
interface MedCandidate {
  key: string;
  regimen: MedStripRegimenRow | null;
  itemId: string | null;
}

/**
 * Fold the pet's active regimens + recent doses into one card per med (D3),
 * ordered per D8 (expanded before collapsed, then oldest course first, then by
 * name). Returns an EMPTY array when there is nothing to show — Home puts no hole
 * on the screen for a pet with no meds (AC #3), the same way `resolveTrialStrip`
 * returns null rather than rendering an empty trial card.
 */
export function resolveMedStrips(input: MedStripInput): MedStripModel[] {
  const tz = input.timeZone;
  const todayIndex = localDayIndex(input.nowMs, tz);
  // AC #10 — a soft-deleted dose never counts toward anything. Filtered ONCE, at the
  // top, so no downstream loop can forget it.
  const liveDoses = input.doses.filter((d) => d.deleted_at == null);

  const candidates = buildCandidates(input.regimens, liveDoses, todayIndex, tz);

  const built: { model: MedStripModel; sortStart: string; sortName: string }[] = [];
  for (const cand of candidates) {
    const b = buildModel(cand, liveDoses, input, todayIndex, tz);
    if (b) built.push(b);
  }

  // D8 — a stable, non-clinical order. Expanded cards first (a collapsed card is
  // quiet, so it sinks), then the oldest course first, then by name. No relevance or
  // severity sort — those would re-introduce the favouring D3 rejected, and a Home
  // surface that silently re-orders itself is unreadable at a glance. Ad-hoc cards
  // (no start date) sort after regimens within their collapse group.
  built.sort((a, b) => {
    if (a.model.collapsed !== b.model.collapsed) return a.model.collapsed ? 1 : -1;
    if (a.sortStart !== b.sortStart) return a.sortStart < b.sortStart ? -1 : 1;
    return a.sortName.localeCompare(b.sortName);
  });

  return built.map((b) => b.model);
}

// Group regimens + recent ad-hoc doses into deduped candidates. Regimens are placed
// FIRST so an ad-hoc dose for the same drug merges into the regimen's key (the
// regimen supplies the header; all its doses count toward coverage). Two active
// regimens for one drug keep the most-recently-started, matching
// `ACTIVE_REGIMEN_FOR_DRUG_QUERY`'s `ORDER BY started_at DESC LIMIT 1` rather than
// inventing a second resolution.
function buildCandidates(
  regimens: MedStripRegimenRow[],
  liveDoses: MedStripDoseRow[],
  todayIndex: number,
  tz: string | undefined,
): MedCandidate[] {
  const byKey = new Map<string, MedCandidate>();

  for (const reg of regimens) {
    const key = reg.medication_item_id ?? `regimen:${reg.id}`;
    const existing = byKey.get(key);
    // Only another regimen can already hold this key (ad-hoc is added later); keep
    // the most-recently-started.
    if (!existing) {
      byKey.set(key, { key, regimen: reg, itemId: reg.medication_item_id });
    } else if (existing.regimen && reg.started_at > existing.regimen.started_at) {
      byKey.set(key, { key, regimen: reg, itemId: reg.medication_item_id });
    }
  }

  for (const d of liveDoses) {
    if (d.medication_id != null) continue;       // linked, not an ad-hoc candidacy signal
    if (d.medication_item_id == null) continue;  // no drug identity → can't name or dedup
    // §4.2(b) — ad-hoc candidacy needs a dose within the window. An older-only
    // ad-hoc med ages off Home.
    if (!isWithinWindow(d.occurred_at, todayIndex, tz)) continue;
    const key = d.medication_item_id;
    if (!byKey.has(key)) byKey.set(key, { key, regimen: null, itemId: key });
  }

  return [...byKey.values()];
}

function buildModel(
  cand: MedCandidate,
  liveDoses: MedStripDoseRow[],
  input: MedStripInput,
  todayIndex: number,
  tz: string | undefined,
): { model: MedStripModel; sortStart: string; sortName: string } | null {
  const { regimen, itemId } = cand;

  // Name it, or do not render at all (§5.2 case 2 — the widget no-garbage rule: the
  // surface only shows what it can name). Brand-preferred via the drug's cached item,
  // falling back to a free-text regimen's typed `drug_name`.
  const item = itemId != null ? input.items[itemId] : undefined;
  const name =
    (item ? drugDisplayName(item.generic_name, item.brand_name) : null) ??
    (regimen ? regimen.drug_name.trim() || null : null);
  if (!name) return null;

  // Every non-deleted dose belonging to this candidate — matched by drug identity OR
  // an explicit regimen link (the free-text path). `liveDoses` is already
  // soft-delete-filtered.
  const candidateDoses = liveDoses.filter((d) => doseBelongs(d, cand));
  const recentDoses = candidateDoses.filter((d) => isWithinWindow(d.occurred_at, todayIndex, tz));
  const dosesToday = candidateDoses.filter(
    (d) => localDayIndexOf(d.occurred_at, tz) === todayIndex,
  ).length;
  const lastDose = mostRecentDose(candidateDoses);

  const dosesPerDay = regimen?.doses_per_day ?? null;
  const targetDays = regimen?.target_duration_days ?? null;
  const daysElapsed = regimen ? regimenDaysElapsed(regimen.started_at, input.nowMs, tz) : null;

  const withholding = medStripWithholdingReasons({
    recentDoses,
    intakeDeclineActive: input.intakeDeclineActive === true,
  });
  const isWithholding = withholding.length > 0;

  // A course at or past its target length shows the "check your vet's plan" advisory
  // (§9 states 6/7) — a low-frequency, safety-adjacent line — so it does NOT collapse
  // even when today is covered. Hiding that advisory to save a row is the wrong
  // trade; the collapse rule exists for the daily steady state, not this one.
  const courseReached = targetDays != null && daysElapsed != null && daysElapsed >= targetDays;
  const coveredToday = isMedCadenceCoveredToday({ dosesPerDay, dosesLoggedToday: dosesToday });
  const collapsed = coveredToday && !isWithholding && !courseReached;

  // N2 — day progress only, and only for a fixed course whose day count is known. A
  // course at/over length reads full (clamped). Null while collapsed — a collapsed
  // card is one line with no bar (§9 state 3), so `progressFraction !== null` is a
  // clean "render a bar" signal for M2, with no second rule to remember.
  const progressFraction =
    !collapsed && targetDays != null && targetDays > 0 && daysElapsed != null
      ? Math.max(0, Math.min(1, daysElapsed / targetDays))
      : null;

  const header = buildHeader({
    name,
    daysElapsed,
    targetDays,
    hasRegimen: regimen != null,
    collapsed,
    dosesToday,
  });

  const line = buildLine({
    isWithholding,
    withholding,
    recentDoses,
    collapsed,
    courseReached,
    daysElapsed,
    targetDays,
    dosesPerDay,
    dosesToday,
    hasRegimen: regimen != null,
    lastDose,
    todayIndex,
    tz,
  });

  // ── The confirmability gate (§5) ─────────────────────────────────────────────
  // The button renders iff the app can DESCRIBE the row it would write, AND nothing
  // has stood it down. Attributable identity is the gate's core (§5.2 case 1); a
  // collapsed card (§7) and a withholding record (§6) both remove it.
  const attributable = itemId != null || regimen != null;
  const confirm: MedStripConfirm | null =
    !collapsed && !isWithholding && attributable
      ? {
          medicationItemId: itemId,
          medicationId: regimen?.id ?? null,
          doseAmount: regimen?.dose_amount ?? lastDose?.dose_amount ?? null,
        }
      : null;

  return {
    model: {
      key: cand.key,
      header,
      progressFraction,
      line,
      collapsed,
      withholding,
      confirm,
    },
    // D8 sort keys. Ad-hoc (no start) sorts after every dated course.
    sortStart: regimen?.started_at ?? '9999-99-99',
    sortName: name,
  };
}

// A dose belongs to a candidate when its drug matches the candidate's item, OR it is
// explicitly linked to the candidate's regimen (the only path a free-text regimen's
// doses take, since they carry a NULL item id — B-154). Assumes link integrity, the
// same assumption `attributeDosesToRegimens` makes.
function doseBelongs(d: MedStripDoseRow, cand: MedCandidate): boolean {
  if (cand.itemId != null && d.medication_item_id === cand.itemId) return true;
  if (cand.regimen != null && d.medication_id === cand.regimen.id) return true;
  return false;
}

// A dose is "recent" when it falls within the last MED_STRIP_ADHOC_WINDOW_DAYS local
// days (inclusive). A future-dated dose (negative diff) is also counted — it is a
// real logged dose, and treating it as recent is harmless.
function isWithinWindow(occurredAt: string, todayIndex: number, tz: string | undefined): boolean {
  const idx = localDayIndexOf(occurredAt, tz);
  if (idx == null) return false;
  return todayIndex - idx <= MED_STRIP_ADHOC_WINDOW_DAYS;
}

function mostRecentDose(doses: MedStripDoseRow[]): MedStripDoseRow | null {
  let best: MedStripDoseRow | null = null;
  for (const d of doses) {
    // ISO timestamps compare correctly lexicographically.
    if (!best || d.occurred_at > best.occurred_at) best = d;
  }
  return best;
}

// ── Copy (indicative; locks at M5) ────────────────────────────────────────────
// Every string below avoids the words "missed" and "due" (N1 / AC #4). M5 refines
// the phrasing, the time-of-day precision, and the clinical register; the STRUCTURE
// — which fact renders in which state — is what M1 fixes.

const COURSE_CHECK_LINE = 'Worth checking your vet’s plan';
const COURSE_REACHED_LINE = 'Course length reached — worth checking your vet’s plan';

function buildHeader(p: {
  name: string;
  daysElapsed: number | null;
  targetDays: number | null;
  hasRegimen: boolean;
  collapsed: boolean;
  dosesToday: number;
}): string {
  let base: string;
  if (p.targetDays != null && p.daysElapsed != null) {
    const overrun = p.daysElapsed - p.targetDays;
    base =
      overrun > 0
        ? `${p.name} · day ${p.daysElapsed} — ${overrun} ${overrun === 1 ? 'day' : 'days'} past`
        : `${p.name} · day ${p.daysElapsed} of ${p.targetDays}`;
  } else if (p.hasRegimen && p.targetDays == null) {
    base = `${p.name} · ongoing`; // an ongoing regimen with no fixed course length
  } else {
    base = p.name; // ad-hoc, or a fixed course whose start date did not parse
  }
  if (p.collapsed) {
    base += ` · ${p.dosesToday} ${p.dosesToday === 1 ? 'dose' : 'doses'} logged`;
  }
  return base;
}

function buildLine(p: {
  isWithholding: boolean;
  withholding: MedStripWithholding[];
  recentDoses: MedStripDoseRow[];
  collapsed: boolean;
  courseReached: boolean;
  daysElapsed: number | null;
  targetDays: number | null;
  dosesPerDay: number | null;
  dosesToday: number;
  hasRegimen: boolean;
  lastDose: MedStripDoseRow | null;
  todayIndex: number;
  tz: string | undefined;
}): string | null {
  if (p.isWithholding) return withholdingLine(p.withholding, p.recentDoses);
  if (p.collapsed) return null; // the count lives in the collapsed header
  if (p.courseReached) {
    return p.targetDays != null && p.daysElapsed === p.targetDays
      ? COURSE_REACHED_LINE
      : COURSE_CHECK_LINE;
  }
  // A fixed course still within its window → coverage-today framing (states 1/2).
  if (p.targetDays != null) return coverageTodayLine(p.dosesToday, p.dosesPerDay);
  // Ongoing regimen → last-dose recency (state 4).
  if (p.hasRegimen) return lastDoseLine(p.lastDose, p.todayIndex, p.tz);
  // Ad-hoc → recent count + last dose (state 5).
  return adhocRecencyLine(p.recentDoses, p.lastDose, p.todayIndex, p.tz);
}

// The withholding FACT (N3) — counts, never a verdict. Med-specific facts
// (refused / not-given / unconfirmed) render even alongside a pet-level intake
// decline, because they are this med's news; an intake-decline-ONLY withhold returns
// null and defers to the Signal card above (which owns the pet-level fact), mirroring
// `resolveTrialStrip`'s intake-decline → null line.
function withholdingLine(
  reasons: MedStripWithholding[],
  recentDoses: MedStripDoseRow[],
): string | null {
  const n = recentDoses.length;
  const parts: string[] = [];
  const refused = recentDoses.filter((d) => d.adherence === 'refused').length;
  if (refused > 0) parts.push(`${refused} of the last ${n} ${n === 1 ? 'dose' : 'doses'} refused`);
  // "not given", never "missed" (N1). Clinically accurate for an owner-logged
  // `missed` dose; M5 owns the final register.
  const notGiven = recentDoses.filter((d) => d.adherence === 'missed').length;
  if (notGiven > 0) parts.push(`${notGiven} not given`);
  if (reasons.includes('dose_in_doubt')) {
    const doubt = recentDoses.filter((d) =>
      isComboDoseInDoubt({
        isCombo: d.paired_event_id != null,
        vehicleIntake: d.paired_vehicle_intake,
        adherence: d.adherence,
      }),
    ).length;
    if (doubt > 0) parts.push(`${doubt} unconfirmed`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function coverageTodayLine(dosesToday: number, dosesPerDay: number | null): string {
  if (dosesToday <= 0) {
    // N1 / N4 — a statement about the record, never "due", never "you missed a dose".
    const hint = frequencyHint(dosesPerDay);
    return hint ? `No dose logged yet today · ${hint}` : 'No dose logged yet today';
  }
  // Partly covered (a fully-covered fixed course collapses instead). `dosesPerDay` is
  // set here (coverage-today framing only runs for a scheduled course).
  const target = dosesPerDay != null ? formatDoseCount(dosesPerDay) : `${dosesToday}`;
  return `${dosesToday} of ${target} doses logged today`;
}

function lastDoseLine(
  lastDose: MedStripDoseRow | null,
  todayIndex: number,
  tz: string | undefined,
): string | null {
  if (!lastDose) return 'No doses logged yet';
  const when = relativeDay(lastDose.occurred_at, todayIndex, tz);
  return when ? `Last dose ${when}` : 'Last dose logged';
}

function adhocRecencyLine(
  recentDoses: MedStripDoseRow[],
  lastDose: MedStripDoseRow | null,
  todayIndex: number,
  tz: string | undefined,
): string | null {
  const n = recentDoses.length;
  const count =
    n > 0
      ? `${n} ${n === 1 ? 'dose' : 'doses'} in the last ${MED_STRIP_ADHOC_WINDOW_DAYS} days`
      : null;
  const when = lastDose ? relativeDay(lastDose.occurred_at, todayIndex, tz) : null;
  const last = when ? `last ${when}` : null;
  const parts = [count, last].filter((x): x is string => x != null);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

// "usually 2×/day" — a scheduling HINT, never a schedule the schema does not carry
// (N1). Skips a fractional or missing rate rather than reading "usually 0.5×/day".
function frequencyHint(dosesPerDay: number | null): string | null {
  if (dosesPerDay == null || !Number.isInteger(dosesPerDay) || dosesPerDay < 1) return null;
  return dosesPerDay === 1 ? 'usually once a day' : `usually ${dosesPerDay}×/day`;
}

// A dose target for the coverage line — an integer renders plainly ("2"), a
// fractional rate keeps one decimal rather than a long float.
function formatDoseCount(dosesPerDay: number): string {
  return Number.isInteger(dosesPerDay) ? `${dosesPerDay}` : `${Math.round(dosesPerDay * 10) / 10}`;
}

// "today" / "yesterday" / a short local date ("Jul 29"). Time-of-day precision
// (", 9:10pm") is M5 polish. `occurred_at` is a real INSTANT, so `new Date(...)` is
// correct here — unlike a DATE column, which is the B-441 trap this deliberately does
// not fall into.
function relativeDay(occurredAt: string, todayIndex: number, tz: string | undefined): string | null {
  const idx = localDayIndexOf(occurredAt, tz);
  if (idx == null) return null;
  const diff = todayIndex - idx;
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
}
