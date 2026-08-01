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
  // The pet this input was LOADED for. Carried through the resolver onto the confirm
  // payload (below) so the pet id and the drug identity a one-tap writes can never
  // desync: on a pet switch the loader holds the previous pet's input until the new
  // read resolves, and the write must use THAT pet, not whatever pointer is live at
  // tap time — else a tap in the swap window writes the new pet's id against the old
  // pet's drug (a silent cross-pet dose, uncaught locally since the med FKs are
  // server-only). One source of truth for both.
  petId: string;
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
  // The pet the dose is for — the `input.petId` this model was resolved from, so the
  // write is bound to the same pet as the drug identity below (see `MedStripInput.petId`).
  // The confirm carries it rather than the write re-reading the live active pet.
  petId: string;
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
  // The bare drug name (`drugDisplayName`, B-171), exposed so a consumer that needs
  // just the name — the confirm button's screen-reader label — reads it directly
  // instead of parsing it back out of `header`'s presentation copy (whose separator
  // is M5-mutable and which a free-text name could itself contain).
  drugName: string;
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
  //
  // `attributable` is DEFENSIVE — unreachable as `false` given how candidates are
  // built (a regimen candidate always has a regimen; an ad-hoc candidate is only
  // created for a dose with a non-null `medication_item_id`, §4.2b's guard). So
  // every candidate that survives naming is attributable, which means §9's state 9
  // ("nameable but not confirmable") does not arise from the current local-mirror
  // candidacy — a design note carried to M2 (PR body). The guard stays: the safe
  // direction if a future input shape ever produces an unattributable candidate is
  // no button, never a guessed dose.
  const attributable = itemId != null || regimen != null;
  const confirm: MedStripConfirm | null =
    !collapsed && !isWithholding && attributable
      ? {
          petId: input.petId,
          medicationItemId: itemId,
          medicationId: regimen?.id ?? null,
          doseAmount: regimen?.dose_amount ?? lastDose?.dose_amount ?? null,
        }
      : null;

  return {
    model: {
      key: cand.key,
      drugName: name,
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

// ── Copy (M5 — locked behind nyx-voice + clinical-guardrails) ─────────────────
// Every string below avoids the words "missed" and "due" (N1 / AC #4). M5 is the
// copy + safety pass: it sets the final phrasing, adds the time-of-day precision
// the recency lines carry, and fixes the clinical register (the withholding line
// leads with the sharpest signal; the collapsed header says "logged today"). The
// STRUCTURE — which fact renders in which state — was fixed by M1 and is unchanged.

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
    // "logged TODAY" — a collapsed card means today's cadence is met, so the count
    // is a fact about the record for *today*, never a lifetime tally (the M5
    // legibility ruling the M4 review raised; still N4 — a counted fact, never
    // "all caught up"). Without "today" the bare count reads as cumulative.
    base += ` · ${p.dosesToday} ${p.dosesToday === 1 ? 'dose' : 'doses'} logged today`;
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
  // Precedence is deliberate, not incidental. WITHHOLDING WINS OVER THE
  // COURSE-LENGTH ADVISORY: a refused / not-given / in-doubt record is a health
  // signal (N3), the sharper of the two "talk to your vet" prompts on a
  // past-length course — so the strip surfaces the refusal fact and (via the gate)
  // drops the button, never a calmer calendar advisory beside a record the pet is
  // refusing.
  //
  // M5 RULING — past-length + refused composition (clinical-guardrails): the line
  // carries the refusal ALONE, and nothing is lost by it, because the two facts
  // render in DIFFERENT places. The calendar overrun is already in the HEADER
  // ("day 17 — 3 days past"), and the advisory's action ("check your vet's plan")
  // is preserved by the button standing down and the card becoming a tap-through
  // to the Pet tab. So a past-length + refused card shows BOTH facts — overrun in
  // the header, refusal in the line — and the advisory STRING is subsumed, not
  // dropped. The strip has one line; giving it to the health signal is the
  // clinical-guardrails call, ratified here and pinned by a test.
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
//
// M5 register (clinical-guardrails): the clauses lead in clinical priority —
// refused first (the sharpest signal), then a not-given (the STATE "missed", never
// the WORD, N1), then an unconfirmed combo dose. The LEAD clause carries the "of
// the last N doses" frame; any further reasons append as bare counts, so one reason
// reads as a single clean fact and a compound record reads as a short list. When
// there is only ONE recent dose the lead reads "Last dose refused", not the clumsy
// "1 of the last 1 dose refused" — the count frame earns its place only across
// several doses.
function withholdingLine(
  reasons: MedStripWithholding[],
  recentDoses: MedStripDoseRow[],
): string | null {
  const n = recentDoses.length;
  const refused = recentDoses.filter((d) => d.adherence === 'refused').length;
  // "not given", never "missed" (N1) — clinically accurate for an owner-logged
  // `missed` dose.
  const notGiven = recentDoses.filter((d) => d.adherence === 'missed').length;
  const doubt = reasons.includes('dose_in_doubt')
    ? recentDoses.filter((d) =>
        isComboDoseInDoubt({
          isCombo: d.paired_event_id != null,
          vehicleIntake: d.paired_vehicle_intake,
          adherence: d.adherence,
        }),
      ).length
    : 0;

  const parts: { count: number; verb: string }[] = [];
  if (refused > 0) parts.push({ count: refused, verb: 'refused' });
  if (notGiven > 0) parts.push({ count: notGiven, verb: 'not given' });
  if (doubt > 0) parts.push({ count: doubt, verb: 'unconfirmed' });
  if (parts.length === 0) return null;

  const [lead, ...rest] = parts;
  // n === 1 → exactly one recent dose, and a dose carries exactly one adherence, so the
  // three buckets are mutually exclusive per dose (`isComboDoseInDoubt` keys on
  // `adherence == null`, disjoint from 'refused'/'missed'). `rest` is therefore always
  // empty here, and "Last dose refused" reads far better than "1 of the last 1 dose
  // refused".
  const leadLine =
    n === 1
      ? `Last dose ${lead.verb}`
      : `${lead.count} of the last ${n} doses ${lead.verb}`;
  return [leadLine, ...rest.map((p) => `${p.count} ${p.verb}`)].join(' · ');
}

function coverageTodayLine(dosesToday: number, dosesPerDay: number | null): string {
  if (dosesToday <= 0) {
    // N1 / N4 — a statement about the record, never "due", never "you missed a dose".
    const hint = frequencyHint(dosesPerDay);
    return hint ? `No dose logged yet today · ${hint}` : 'No dose logged yet today';
  }
  // A durationed course with NO daily cadence (target set, `doses_per_day` null — a
  // "for 14 days, as needed" regimen) has no honest denominator: "N of N" would
  // FABRICATE one and read as a met target (soft N4). State just the count.
  if (dosesPerDay == null) {
    return `${dosesToday} ${dosesToday === 1 ? 'dose' : 'doses'} logged today`;
  }
  // Partly covered (a fully-covered scheduled course collapses instead).
  return `${dosesToday} of ${formatDoseCount(dosesPerDay)} doses logged today`;
}

function lastDoseLine(
  lastDose: MedStripDoseRow | null,
  todayIndex: number,
  tz: string | undefined,
): string | null {
  // An ongoing med with no dose ever logged — honest, and the button below is the
  // way to log the first (no reassurance, just the record's state).
  if (!lastDose) return 'No doses logged yet';
  return recencyPhrase(lastDose.occurred_at, todayIndex, tz) ?? 'Last dose logged';
}

function adhocRecencyLine(
  recentDoses: MedStripDoseRow[],
  lastDose: MedStripDoseRow | null,
  todayIndex: number,
  tz: string | undefined,
): string | null {
  if (!lastDose) return null;
  const last = recencyPhrase(lastDose.occurred_at, todayIndex, tz);
  if (!last) return null;
  // The most-recent dose leads (what an owner glances for), sharing state 4's
  // "Last dose …" shape; the window count follows only when there is MORE than one,
  // because for a lone dose the "last dose" IS the whole record and a
  // "1 in the last 14 days" tail would just be noise.
  const n = recentDoses.length;
  return n > 1 ? `${last} · ${n} in the last ${MED_STRIP_ADHOC_WINDOW_DAYS} days` : last;
}

// "usually twice a day" — a scheduling HINT, never a schedule the schema does not
// carry (N1). Plain words for the common rates (nyx-voice — "2×/day" is clinical
// shorthand that reads oddly beside "once a day"); the compact "N×/day" is the
// fallback only for 4+. Skips a fractional or missing rate rather than reading
// "usually 0.5×/day".
const FREQUENCY_WORDS: Record<number, string> = {
  1: 'once a day',
  2: 'twice a day',
  3: 'three times a day',
};
function frequencyHint(dosesPerDay: number | null): string | null {
  if (dosesPerDay == null || !Number.isInteger(dosesPerDay) || dosesPerDay < 1) return null;
  return `usually ${FREQUENCY_WORDS[dosesPerDay] ?? `${dosesPerDay}×/day`}`;
}

// A dose target for the coverage line — an integer renders plainly ("2"), a
// fractional rate keeps one decimal rather than a long float.
function formatDoseCount(dosesPerDay: number): string {
  return Number.isInteger(dosesPerDay) ? `${dosesPerDay}` : `${Math.round(dosesPerDay * 10) / 10}`;
}

// "Last dose yesterday, 9:10 PM" — the shared recency phrase for state 4 (ongoing)
// and state 5 (ad-hoc). Day precision via `relativeDay` plus the clock time M1
// deferred to M5; returns null only when the instant is unparseable, so the caller
// can fall back to a day-less phrase.
function recencyPhrase(occurredAt: string, todayIndex: number, tz: string | undefined): string | null {
  const when = relativeDay(occurredAt, todayIndex, tz);
  if (!when) return null;
  const time = clockTime(occurredAt, tz);
  return time ? `Last dose ${when}, ${time}` : `Last dose ${when}`;
}

// "today" / "yesterday" / a short local date ("Jul 29"). `occurred_at` is a real
// INSTANT, so `new Date(...)` is correct here — unlike a DATE column, which is the
// B-441 trap this deliberately does not fall into.
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

// The local clock time ("9:10 PM") M5 adds to the recency lines. tz-aware so the
// tests pin it deterministically (they inject 'UTC') and the app reads the device
// zone (tz undefined). 'numeric' hour → "9:10 PM", matching the app's other time
// surfaces (e.g. `TodayZone`) rather than a leading-zero "09:10".
function clockTime(occurredAt: string, tz: string | undefined): string | null {
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
}
