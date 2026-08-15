// The Day Summary builder (B-661, notification-foundation PR 4 — see
// docs/nyx-notification-foundation-requirements.md §5).
//
// The 9pm daily summary's read surface answers exactly ONE question — "what
// happened in {pet}'s record today" — and every row is a doorway into that event's
// own detail (event/[id]). No AI, no verdicts, no score (§5.3). Dedicated
// trial/med context strips (§5.1/§5.3) are DEFERRED to a future consumer PR (B-670,
// ruled at mock round 2): v1 renders the trial-diet meal and each dose as ordinary
// doorway rows rather than re-hosting the trial card's viability states or the med
// strip's course state — that would make this a rival Home and render a reading on
// a surface G3 says must only describe-and-door.
//
// This module is the PURE builder, deliberately free of expo-sqlite / supabase /
// react-native imports — the same pure-core + I/O-shell split the trial card
// (`lib/dietTrialCard.ts`) and the med strip (`lib/medStrip.ts`) settled on. The
// judgement (which rows are "today", how a row reads, when a section is empty)
// lives here and is exercised in `daySummary.test.ts` against injected rows with
// no database; the read that assembles the input from the local mirror is the
// hook's job (`hooks/useDaySummary.ts`).
//
// ── RULES IT INHERITS BY NAME (never a re-derivation) ────────────────────────
//   • Day boundary = LOCAL midnight via B-421's one day counter (`localDayIndex` /
//     `localDayIndexOf` in `lib/utils.ts`). This module mints no new day-math.
//   • A row's DISPLAY is `describeDayEvent` (`lib/dayEvents.ts`) — the same mapper
//     the Calendar v3 day drill-in uses, so a food/dose/symptom reads identically
//     on both surfaces and every voice/safety rule that mapper enforces (a refusal
//     surfaced plainly, a null intake showing no assumed "given") is inherited
//     rather than re-spelled.
//   • Soft deletes are respected (`deleted_at IS NULL`) — filtered here as the
//     single enforcement point even though the loader also filters, so no caller
//     can forget it.
//
// ── THE ONE SAFETY RULE THIS FILE OWNS: the zero-log state (G2) ──────────────
// The empty state is a designed feature (Principle 5), but its copy is bound by
// the G2 lineage inherited from the diet-trial ruling: absence is framed as
// RECORD STATE, never a wellness verdict. Nothing here may read a silent record as
// reassurance — no "all quiet", no "all clear", no "nothing wrong". That is the
// n=1-never-reassures / intake-is-not-preference invariant applied to an empty
// day, and it is asserted by a test over the copy constants below.

import type { TimelineRow } from './db';
import { describeDayEvent, type DayEventDisplay } from './dayEvents';
import { localDayIndex, localDayIndexOf } from './utils';
import { pluralize } from './dashboardCards';
import { EVENT_TYPES, type EventTypeKey } from '../constants/eventTypes';
// ── The recap's C0–C5 read from the SHIPPED predicates, never a re-derivation ──
// (DR-1 §2). The trial's day-math is the single B-421 path (`getDietTrialProgress`);
// running is the staleness-aware `isTrialRunning`; the "{Protein} trial" identity is
// `trialIdentityLabel`; the med course strip's §7 collapse, `dosesTowardTarget` and
// withholding all come pre-applied by the pure `resolveMedStrips`. This module adds
// only PRESENTATION over those facts — it computes no clinical judgement of its own.
//
// These imports are pure resolvers (no I/O executes here): `resolveMedStrips`,
// `isTrialRunning`, `trialIdentityLabel` take no DB, and `getDietTrialProgress` lives
// in `analytics.ts` beside DB helpers but is itself pure and lazily-DB'd — the same
// db-adjacency the pure resolver `dietTrialCard.ts` already carries by importing it.
import { getDietTrialProgress } from './analytics';
import { isTrialRunning, type TrialExposureItem } from './dietTrial';
import { trialIdentityLabel, type TrialCardTrial } from './dietTrialCard';
import { resolveMedStrips, type MedStripInput, type MedStripModel } from './medStrip';

export type PetSpecies = 'dog' | 'cat' | 'other';

// ── The doorway row ──────────────────────────────────────────────────────────

/** One logged event, as a tappable doorway row. Extends the shared
 *  `DayEventDisplay` (the drill-in's read shape) with the event `id` — the
 *  navigation target (`/event/[id]`). `describeDayEvent` omits the id because the
 *  read-only drill-in sheet never navigates per row; the Day Summary makes every
 *  row a door, so it is carried here. */
export interface DaySummaryRow extends DayEventDisplay {
  id: string;
  /** DR-1 §2.4 — the optional fact-only sub-line beneath a spine node. Set to
   *  `'Trial diet'` on a meal that TODAY's trial classifies as the prescribed diet
   *  (`verdict==='permitted' && role==='primary_diet'`, from the shipped
   *  `TrialExposureItem`s — never a re-derivation), else null. POSITIVE marking
   *  only (diet-trial D2): a null sub-line is never a verdict that a meal was
   *  off-diet. Only ever populated on the SINGLE-pet recap (the multi-pet frames
   *  render plain spines — mock §2); a future "Photo attached" fact widens this
   *  same slot (B-762 follow-up — the timeline query carries no attachment flag
   *  yet, so it is out of DR-1's scope). */
  subline: string | null;
}

// ── Per-pet section ──────────────────────────────────────────────────────────

export interface DaySummarySection {
  petId: string;
  petName: string;
  species: PetSpecies;
  /** Today's logged events, EARLIEST-FIRST (a day reads top-to-bottom, matching
   *  the drill-in) — the doorway rows. */
  rows: DaySummaryRow[];
  /** Nothing on the record for this pet today — the designed zero-log state
   *  (Principle 5; G2 — a record fact, never a wellness verdict). Kept as its own
   *  field, not `rows.length === 0` at the call site, so the one place that
   *  decides "empty" is here. */
  isZeroLog: boolean;
}

// ── Input / output ───────────────────────────────────────────────────────────

export interface DaySummaryPetInput {
  pet: { id: string; name: string; species: PetSpecies };
  /** This pet's candidate rows. A SUPERSET of "today" is fine — the builder clips
   *  to the local day itself (the loader over-fetches by design, exactly as
   *  `loadMedStripInput` does). Soft-deleted rows are dropped here regardless. */
  rows: TimelineRow[];
  // ── The single-pet recap's rich inputs (DR-1 §2.5/§2.6), loaded by the hook ──
  // These drive the trial strip (C3), the med course strips (C4), the lead line's
  // trial tier (C0), the forward line (C5) and the "Trial diet" spine sub-lines.
  // The hook only loads them for a SINGLE-pet account — the multi-pet frames render
  // plain per-pet spines with none of these (mock §2), so they stay undefined there
  // and every rich derivation is gated on `petCount === 1`.
  /** The pet's card-eligible trial with its resolved `{Protein}` identity
   *  (`loadDietTrialFacts().trial`); null when the pet has no trial. */
  trial?: TrialCardTrial | null;
  /** The trial's per-feeding classifications (`loadTrialPredicateFacts().facts
   *  .exposures.items`) — the shipped, already-classified source the exposures
   *  screen reads. The builder filters these to TODAY's `primary_diet` feedings for
   *  the strip count and the "Trial diet" sub-lines; it never classifies a feeding
   *  itself. */
  trialItems?: readonly TrialExposureItem[] | null;
  /** The med-strip input (`loadMedStripInput`) for `resolveMedStrips` — carries the
   *  §7 collapse rule, `dosesTowardTarget` and the withholding set. Null when the
   *  pet has no active/recent medication. */
  medInput?: MedStripInput | null;
}

export interface DaySummaryInput {
  /** Pets in RENDER ORDER — the caller applies `orderPetsActiveFirst` (§5.3: one
   *  screen, sectioned per pet, active pet first). The builder preserves this
   *  order and never re-sorts pets: a summary that silently re-ordered its pets
   *  would be unreadable at a glance, the same reason the med strip fixes its
   *  order. */
  pets: DaySummaryPetInput[];
  /** The instant "today" is measured from, injected for testability (B-514). */
  nowMs: number;
  /** IANA zone to bucket the day in. OMIT on-device — the device's own zone IS the
   *  owner's midnight (B-421), which is the production path. It exists so tests can
   *  pin the day boundary explicitly rather than against the runner's clock. */
  timeZone?: string;
}

/** C2 — one count chip. `label` is the whole chip text ("3 meals", "1 vomit"),
 *  DIGIT-anchored and never totalled into a score (Principle 3). `tone` drives the
 *  rose accent: a symptom chip carries the night symptom rose, everything else the
 *  neutral card tone. */
export interface DayCountChip {
  key: string;
  label: string;
  tone: 'symptom' | 'neutral';
}

/** C3 — the recap trial strip: a flat doorway (no bar, no viability/coverage/
 *  adherence language) to the trial card. `title` is the `{Protein} trial` identity;
 *  `fact` is `Day N of M · K trial-diet meals logged today` (K a floor count, never
 *  a ratio). Present only while `isTrialRunning`. */
export interface RecapTrialStrip {
  title: string;
  fact: string;
}

/** C4 — one recap med course strip per active course, a flat doorway to the med
 *  card. `title`/`fact` come straight from the pure `resolveMedStrips` model
 *  (`header`/`line`), so the §7 collapse rule, `dosesTowardTarget` and the four
 *  forbidden words (missed/due/compliance-bar) are inherited, not re-spelled.
 *  `isConcern` renders a withholding fact in the night symptom rose. */
export interface RecapMedStrip {
  key: string;
  title: string;
  fact: string | null;
  isConcern: boolean;
}

export interface DaySummaryModel {
  /** One section per input pet, in input order. */
  sections: DaySummarySection[];
  /** No pet has anything on the record today — the whole-screen zero-log state.
   *  `true` for an account with no pets at all, too (vacuously every section is
   *  empty), which the screen renders as the same designed state rather than a
   *  blank. */
  isEmpty: boolean;
  /** How many pets the summary covers. Drives whether a section carries a pet
   *  heading — a single-pet account needs none (the screen title already names
   *  the day, and there is no second pet to disambiguate from). */
  petCount: number;
  // ── The single-pet rich recap (DR-1 §2) ──────────────────────────────────────
  // The lead line, chips, strips and forward line are the SINGLE-pet experience:
  // they name one pet's day (a lead line cannot summarise two pets), so a multi-pet
  // summary and the zero-log state both leave them null/empty and render per-pet
  // spines instead (mock §2). Every field below is populated only when
  // `petCount === 1 && !isEmpty`.
  /** C0 — the one count-anchored serif lead sentence (symptom → trial → counts
   *  precedence). Null on multi-pet / empty. */
  lead: string | null;
  /** C2 — the per-category count chips. Empty on multi-pet / empty. */
  chips: DayCountChip[];
  /** C3 — the trial strip, or null when no trial is running. */
  trialStrip: RecapTrialStrip | null;
  /** C4 — one strip per active medication course (empty when none). */
  medStrips: RecapMedStrip[];
  /** C5 — the closing forward line, only when a real tomorrow-fact exists. */
  forward: string | null;
}

/**
 * Fold each pet's rows into its section, clipped to the owner's local TODAY.
 * Pure and total: no I/O, no throw. An unparseable `occurred_at` is treated as
 * "not today" (dropped) rather than crashing the summary — `localDayIndexOf`
 * returns null for it and the strict `=== todayIndex` excludes it.
 */
export function buildDaySummary(input: DaySummaryInput): DaySummaryModel {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const single = input.pets.length === 1;

  // The "Trial diet" event-id set is the SINGLE-pet rich experience only (the
  // multi-pet frames render plain spines — mock §2), so it is empty off that path.
  // Computed BEFORE the section so the row sub-lines and the strip's count are the
  // same fact — the strip count is then read back off the marked rows (below), which
  // makes "K trial-diet meals logged today" literally the number of "Trial diet"
  // sub-lines on screen; the two can never disagree.
  const sections = input.pets.map((p) => {
    const dietIds =
      single && p.trial && isTrialRunning(p.trial, input.nowMs, input.timeZone)
        ? todayPrimaryDietEventIds(p.trialItems ?? null, todayIndex, input.timeZone)
        : EMPTY_ID_SET;
    return buildSection(p, todayIndex, input.timeZone, dietIds);
  });

  const isEmpty = sections.every((s) => s.isZeroLog);

  // Default the rich fields off. They populate only for a single non-empty pet.
  let lead: string | null = null;
  let chips: DayCountChip[] = [];
  let trialStrip: RecapTrialStrip | null = null;
  let medStrips: RecapMedStrip[] = [];
  let forward: string | null = null;

  if (single && !isEmpty) {
    const pet = input.pets[0];
    const section = sections[0];
    const trial = resolveRecapTrialFacts(pet, input.nowMs, input.timeZone);
    // Read the trial-diet meal count back off the MARKED rows (not the id-set size),
    // so the strip's count equals what the spine actually shows.
    const trialDietMeals = section.rows.filter((r) => r.subline === TRIAL_DIET_SUBLINE).length;

    chips = buildCountChips(section.rows);
    lead = buildLeadLine(section.rows, pet.pet.name, trial);
    trialStrip = trial ? buildTrialStrip(trial, trialDietMeals) : null;
    // `resolveMedStrips` (pure) applies the §7 collapse rule, `dosesTowardTarget` and
    // the withholding set; the recap only re-homes the models onto flat strips. The
    // med input is LOADED against a wide window (real now), so thread the RENDERED day
    // (this build's `input.nowMs` — the anchor, or today on the empty fallback) and
    // zone into its day-math, overriding the baked load-time clock. Without this the
    // med strip would describe TODAY's dosing ("dose X of Y logged today", "day N of M")
    // on a screen anchored to YESTERDAY (the B-672 fire-day case) — uniquely wrong on a
    // surface whose whole premise is "everything on it is a record fact".
    medStrips = buildRecapMedStrips(
      pet.medInput
        ? resolveMedStrips({ ...pet.medInput, nowMs: input.nowMs, timeZone: input.timeZone })
        : [],
    );
    forward = buildForwardLine(trial);
  }

  return {
    sections,
    isEmpty,
    petCount: sections.length,
    lead,
    chips,
    trialStrip,
    medStrips,
    forward,
  };
}

function buildSection(
  input: DaySummaryPetInput,
  todayIndex: number,
  timeZone: string | undefined,
  todayDietEventIds: ReadonlySet<string>,
): DaySummarySection {
  const rows = input.rows
    // Scope to THIS pet as the single enforcement point. The loader fetches per
    // pet, so today this is redundant — but this is the first pure builder that
    // folds MULTIPLE pets into one model, and a future "one combined query, group
    // client-side by pet" refactor would cross-wire two pets' records invisibly
    // without it. Same defense-in-depth rationale as the soft-delete filter below:
    // no caller can forget it because the builder does not trust the grouping.
    .filter((r) => r.pet_id === input.pet.id)
    // Soft-delete is enforced HERE as the single point (AC: a removed event never
    // shows in the summary), even though the loader's query also filters it.
    .filter((r) => r.deleted_at == null)
    // Clip to the owner's local day. `localDayIndexOf` reads an ISO instant's local
    // calendar day; the `=== todayIndex` is the authority on "today", so the
    // loader's SQL bounds are only a prefetch and can never widen this.
    .filter((r) => localDayIndexOf(r.occurred_at, timeZone) === todayIndex)
    .map<DaySummaryRow>((r) => ({
      ...describeDayEvent(r),
      id: r.id,
      // POSITIVE marking only (D2): a meal today's trial classifies as the prescribed
      // diet gets "Trial diet"; every other row gets no sub-line, which is never a
      // verdict that the row was off-diet. Widen this slot for "Photo attached" later.
      subline: todayDietEventIds.has(r.id) ? TRIAL_DIET_SUBLINE : null,
    }))
    // Earliest-first (getTimeline returns newest-first). timeMs is the same
    // confidence-aware sort key `describeDayEvents` uses.
    .sort((a, b) => a.timeMs - b.timeMs);

  return {
    petId: input.pet.id,
    petName: input.pet.name,
    species: input.pet.species,
    rows,
    isZeroLog: rows.length === 0,
  };
}

// ── The rich single-pet recap models (C0–C5) — all pure ─────────────────────
//
// Every function below is a PRESENTATION over shipped predicates; none classifies
// a feeding, sizes a trial window, or judges the pet. The clinically load-bearing
// work (the feeding classification, the trial day-math, the med collapse rule) is
// done upstream and only READ here.

const TRIAL_DIET_SUBLINE = 'Trial diet';
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

// Small numbers read as words in the serif lead prose ("One vomit…", "three
// meals"), matching the mock; the chips stay in digits. Above the table it falls
// back to digits rather than inventing "thirteen".
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];
function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** "a" · "a and b" · "a, b and c" — no Oxford comma, matching the app's copy. */
function joinNatural(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// Symptom nouns for the lead line + the chips. A small explicit table (the symptom
// set is closed) keeps the plurals honest — "loose stool"/"loose stools", never a
// naive "diarrheas". A refusal already reads "refused" on its own row; these are
// the logged SYMPTOM types only. Ordered by GI-first salience for the chip row.
const SYMPTOM_CHIP_ORDER: readonly EventTypeKey[] = ['vomit', 'diarrhea', 'lethargy', 'itch'];
const SYMPTOM_NOUN: Record<string, { one: string; many: string }> = {
  vomit: { one: 'vomit', many: 'vomits' },
  diarrhea: { one: 'loose stool', many: 'loose stools' },
  lethargy: { one: 'lethargy', many: 'lethargy' },
  itch: { one: 'itch', many: 'itches' },
};
function symptomNoun(eventType: string, count: number): string {
  const entry = SYMPTOM_NOUN[eventType];
  if (entry) return count === 1 ? entry.one : entry.many;
  // Any future symptom type: the plain lowercased label, un-pluralised (safer than
  // a naive +s on an unknown word).
  return (EVENT_TYPES[eventType as EventTypeKey]?.label ?? 'symptom').toLowerCase();
}

/** The event-ids of TODAY's `primary_diet` feedings — the ONE fact behind both the
 *  "Trial diet" sub-lines and the strip's "K trial-diet meals" count. Reads the
 *  shipped classifications; never re-classifies. */
function todayPrimaryDietEventIds(
  items: readonly TrialExposureItem[] | null,
  todayIndex: number,
  timeZone: string | undefined,
): ReadonlySet<string> {
  if (!items || items.length === 0) return EMPTY_ID_SET;
  const ids = new Set<string>();
  for (const it of items) {
    if (localDayIndexOf(it.occurredAt, timeZone) !== todayIndex) continue;
    const c = it.classification;
    // The prescribed diet specifically — a permitted treat/supplement is permitted
    // but is not "the trial diet", so it is neither counted nor sub-lined.
    if (c.verdict === 'permitted' && c.role === 'primary_diet') ids.add(it.eventId);
  }
  return ids;
}

/** The trial facts the recap renders, or null when no trial is RUNNING today
 *  (`isTrialRunning` — the staleness-aware predicate, not the raw `status`). */
interface RecapTrialFacts {
  /** "{Protein} trial" | "Diet trial" — the shipped identity, never re-derived. */
  name: string;
  /** Day N (1-indexed, `getDietTrialProgress` — the single B-421 day-math path). */
  dayCounter: number;
  /** Target M (`target_duration_days`). */
  targetDays: number;
}
function resolveRecapTrialFacts(
  pet: DaySummaryPetInput,
  nowMs: number,
  timeZone: string | undefined,
): RecapTrialFacts | null {
  const trial = pet.trial;
  if (!trial) return null;
  if (!isTrialRunning(trial, nowMs, timeZone)) return null;
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays, status: trial.status },
    nowMs,
    timeZone,
  );
  if (!progress) return null;
  return {
    name: trialIdentityLabel(trial),
    dayCounter: progress.dayCounter,
    targetDays: progress.targetDays,
  };
}

/** The minimal per-event shape `buildCountChips` reads — category + type only. A full
 *  `DaySummaryRow` satisfies it (the recap screen's path), and DR-2's Home lane maps
 *  raw events to it, so Home's count line and the recap's C2 chips are ONE counting
 *  source and can never disagree. */
export type CountableEvent = Pick<DaySummaryRow, 'category' | 'eventType'>;

/** C2 — the count chips, symptoms first (each named + rose-toned), then meals,
 *  doses and any other category. Digit-anchored; never a total. */
export function buildCountChips(rows: readonly CountableEvent[]): DayCountChip[] {
  const symptomCounts = new Map<string, number>();
  const otherCounts = new Map<string, number>();
  let meals = 0;
  let doses = 0;
  for (const r of rows) {
    if (r.category === 'symptom') symptomCounts.set(r.eventType, (symptomCounts.get(r.eventType) ?? 0) + 1);
    else if (r.category === 'meal') meals += 1;
    else if (r.category === 'medication') doses += 1;
    else otherCounts.set(r.eventType, (otherCounts.get(r.eventType) ?? 0) + 1);
  }

  const chips: DayCountChip[] = [];
  const pushSymptom = (type: string, count: number) =>
    chips.push({ key: type, label: `${count} ${symptomNoun(type, count)}`, tone: 'symptom' });
  // Fixed GI-first order, then any unlisted symptom type in encounter order.
  for (const type of SYMPTOM_CHIP_ORDER) {
    const c = symptomCounts.get(type);
    if (c) pushSymptom(type, c);
  }
  for (const [type, c] of symptomCounts) {
    if (!SYMPTOM_CHIP_ORDER.includes(type as EventTypeKey)) pushSymptom(type, c);
  }
  if (meals) chips.push({ key: 'meal', label: `${meals} ${pluralize(meals, 'meal')}`, tone: 'neutral' });
  if (doses) chips.push({ key: 'medication', label: `${doses} ${pluralize(doses, 'dose')}`, tone: 'neutral' });
  for (const [type, c] of otherCounts) {
    const noun = (EVENT_TYPES[type as EventTypeKey]?.label ?? 'event').toLowerCase();
    chips.push({ key: type, label: `${c} ${noun}${c === 1 ? '' : 's'}`, tone: 'neutral' });
  }
  return chips;
}

/** C0 — the lead line, by FIXED precedence: a symptom present → name it; else a
 *  running trial → its day + meal count; else the day's counts. Count-anchored,
 *  never a verdict/arrow/percentage. Null only on an empty day (the screen renders
 *  the zero-log state there, so this is the defensive floor).
 *
 *  Whenever the lead reaches a meal count (the trial or counts tier), a REFUSAL
 *  CLAUSE surfaces refused bowls in the headline (`mealRefusalClause`) — the
 *  intake-is-not-preference invariant applied to the most prominent line, so a
 *  full-refusal day never reads as an ordinary fed day. That clause is PROVISIONAL,
 *  flagged for the clinical gate (see its docstring). */
export function buildLeadLine(
  rows: readonly DaySummaryRow[],
  petName: string,
  trial: RecapTrialFacts | null,
): string | null {
  if (rows.length === 0) return null;

  // 1 — Symptoms lead, factually. Intake-is-not-preference routes a symptom to the
  // top; the read/severity lives in the event's own detail, never here.
  const symptomRows = rows.filter((r) => r.category === 'symptom');
  if (symptomRows.length > 0) {
    if (symptomRows.length === 1) {
      const r = symptomRows[0];
      return capitalizeFirst(
        `${numberWord(1)} ${symptomNoun(r.eventType, 1)} in ${petName}’s record today — ${r.time}.`,
      );
    }
    const counts = new Map<string, number>();
    for (const r of symptomRows) counts.set(r.eventType, (counts.get(r.eventType) ?? 0) + 1);
    const phrases: string[] = [];
    for (const type of SYMPTOM_CHIP_ORDER) {
      const c = counts.get(type);
      if (c) phrases.push(`${numberWord(c)} ${symptomNoun(type, c)}`);
    }
    for (const [type, c] of counts) {
      if (!SYMPTOM_CHIP_ORDER.includes(type as EventTypeKey)) phrases.push(`${numberWord(c)} ${symptomNoun(type, c)}`);
    }
    return capitalizeFirst(`${joinNatural(phrases)} in ${petName}’s record today.`);
  }

  // 2 — A running trial anchors the day on its day-position + meal count.
  if (trial) {
    const mealRows = rows.filter((r) => r.category === 'meal');
    const base = `Day ${trial.dayCounter} of the ${trial.name}`;
    return mealRows.length > 0
      ? `${base} — ${numberWord(mealRows.length)} ${pluralize(mealRows.length, 'meal')} in ${petName}’s record${mealRefusalClause(mealRows)}.`
      : `${base}.`;
  }

  // 3 — Otherwise the day's own counts.
  const mealRows = rows.filter((r) => r.category === 'meal');
  const doses = rows.filter((r) => r.category === 'medication').length;
  const others = rows.filter((r) => r.category === 'other');
  const phrases: string[] = [];
  if (mealRows.length) phrases.push(`${numberWord(mealRows.length)} ${pluralize(mealRows.length, 'meal')}`);
  if (doses) phrases.push(`${numberWord(doses)} ${pluralize(doses, 'dose')}`);
  const otherCounts = new Map<string, number>();
  for (const r of others) otherCounts.set(r.eventType, (otherCounts.get(r.eventType) ?? 0) + 1);
  for (const [type, c] of otherCounts) {
    const noun = (EVENT_TYPES[type as EventTypeKey]?.label ?? 'event').toLowerCase();
    phrases.push(`${numberWord(c)} ${noun}${c === 1 ? '' : 's'}`);
  }
  if (phrases.length === 0) return null;
  return capitalizeFirst(`${joinNatural(phrases)} in ${petName}’s record today${mealRefusalClause(mealRows)}.`);
}

/**
 * The refusal clause the lead appends when meals were refused today — the
 * intake-is-not-preference invariant applied to the HEADLINE.
 *
 * A refused bowl is `intake_rating === 'refused'`, surfaced by describeDayEvent as
 * `detail === 'refused'` (never softened to "picky"). Without this, a full-refusal
 * trial day — the wedge owner's signature bad morning, the anorexic-cat pattern —
 * would headline "three meals in {pet}'s record" with the decline buried in the
 * spine's per-row detail, which reads as an ordinary fed day. The clause names the
 * refusal as a RECORD FACT (a count of a logged intake, never a wellness verdict or
 * a severity read — that flagging is the Signal card's / vet report's job), so the
 * lead surfaces the decline instead of glossing it.
 *
 * PROVISIONAL, flagged for `clinical-guardrails` + Dr. Chen + PM ratification (the
 * mock has no refusal-day frame; a frame + copy sign-off should follow). Errs toward
 * SURFACING the concern — the safe direction for a decline. Returns "" (no clause)
 * on an all-eaten day, so the mock's frame-1 lead is byte-identical.
 */
function mealRefusalClause(mealRows: readonly DaySummaryRow[]): string {
  const refused = mealRows.filter((r) => r.detail === 'refused').length;
  if (refused === 0) return '';
  if (refused === mealRows.length) return ', all refused';
  return `, ${numberWord(refused)} refused`;
}

/** C3 — the trial strip fact. `Day N of M` (or an overrun form matching the Home
 *  strip) · the today trial-diet meal count as a FLOOR ("K trial-diet meals logged
 *  today"), never a ratio/coverage/adherence figure. */
export function buildTrialStrip(trial: RecapTrialFacts, trialDietMeals: number): RecapTrialStrip {
  const overrun = trial.dayCounter - trial.targetDays;
  const dayPart =
    overrun > 0
      ? `Day ${trial.dayCounter} — ${overrun} ${pluralize(overrun, 'day')} past`
      : `Day ${trial.dayCounter} of ${trial.targetDays}`;
  const mealPart = `${trialDietMeals} trial-diet ${pluralize(trialDietMeals, 'meal')} logged today`;
  return { title: trial.name, fact: `${dayPart} · ${mealPart}` };
}

/** C5 — the forward line: only a REAL tomorrow-fact. Tomorrow's within-target trial
 *  day is the one such fact; past target (day N ≥ M) it is absent, never a
 *  manufactured "day M+1". */
export function buildForwardLine(trial: RecapTrialFacts | null): string | null {
  if (!trial) return null;
  if (trial.dayCounter >= trial.targetDays) return null;
  return `Tomorrow is day ${trial.dayCounter + 1} of the trial.`;
}

/** C4 — one flat doorway strip per active med course, mapped from the pure
 *  `resolveMedStrips` models (the §7 collapse rule, `dosesTowardTarget`, the
 *  withholding set and the one-card-per-med order all come pre-applied by the
 *  resolver). The recap drops the confirm button and the day-progress bar — it is
 *  doorways only (R-3) — and reads a withholding fact in the night rose. */
export function buildRecapMedStrips(models: readonly MedStripModel[]): RecapMedStrip[] {
  return models.map((m) => ({
    key: m.key,
    // The model's header IS the course fact ("{name} · day 5 of 14", or the
    // collapsed "{name} · N doses logged today"); the line is the second fact
    // (null when collapsed). No missed/due/compliance-bar can appear — the model
    // forbids them at the source.
    title: m.header,
    fact: m.line,
    isConcern: m.withholding.length > 0 && m.line !== null,
  }));
}

// ── The local-day prefetch bounds (used by the loader hook) ──────────────────

/**
 * The `[after, before)` ISO instants of the owner's LOCAL day containing `nowMs`,
 * for the `getTimeline` prefetch (`occurred_at >= after AND occurred_at < before`).
 *
 * Built from LOCAL calendar components (`setHours(0,0,0,0)` then `+1` day) so it is
 * DST-correct — a local day that is 23h or 25h still advances the date by exactly
 * one — and so it partitions instants the SAME way `localDayIndex` does on-device
 * (both key on the device's local midnight). That alignment is why the builder's
 * `=== todayIndex` clip and this bound never disagree in production. The pure
 * builder re-clips regardless, so this is a read optimisation, never the authority.
 *
 * Device-zone only (no `timeZone` arg): it is called solely from the on-device
 * hook, where the device zone is the owner's midnight. Tests pin it by building the
 * expected instants from local components (the B-514 idiom), never a UTC literal.
 */
export function localDayBoundsIso(nowMs: number): { after: string; before: string } {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { after: start.toISOString(), before: end.toISOString() };
}

// ── The fire-day anchor (B-672) ──────────────────────────────────────────────
//
// The Day Summary is opened from the 9pm notification, which fires FOR a given day.
// This decides which day the screen renders "today" as: the day the notification
// fired for, so a Saturday-evening notification tapped after midnight still opens
// Saturday's record (not an empty Sunday) — the false-empty the summary exists to
// avoid. `firedForMs` is the notification's delivery instant, threaded from the tap
// (lib/notificationRouting `normalizeFireInstant` → the screen's `firedAt` param).
//
// THE CLAMP: the fired-for day is honoured only while it is TODAY or YESTERDAY (its
// B-421 local-day index is `todayIndex` or `todayIndex - 1`). An older instant — a
// stale, un-dismissed notification tapped days later — falls back to `nowMs`, so the
// tap opens today rather than a days-old summary. A future instant (a bad clock or
// payload) falls back too, defensively. With no fired-for instant (the screen opened
// outside a notification tap) the result is `nowMs` — today, exactly as before B-672.
//
// This resolves the DAY only; the EMPTY-fired-day fallback lives in
// `buildAnchoredDaySummary` below, because it needs the day's rows to decide.
export function resolveDaySummaryAnchorMs(input: {
  firedForMs: number | null | undefined;
  nowMs: number;
  /** IANA zone to bucket the day in. OMIT on-device (device zone = owner's midnight,
   *  B-421); tests pin it explicitly rather than against the runner's clock (B-514). */
  timeZone?: string;
}): number {
  const { firedForMs, nowMs, timeZone } = input;
  if (firedForMs == null || !Number.isFinite(firedForMs)) return nowMs;
  const todayIndex = localDayIndex(nowMs, timeZone);
  const firedIndex = localDayIndex(firedForMs, timeZone);
  return firedIndex === todayIndex || firedIndex === todayIndex - 1 ? firedForMs : nowMs;
}

/**
 * Build the summary for the anchored day, applying BOTH the staleness clamp
 * (`resolveDaySummaryAnchorMs`) AND the empty-fired-day fallback (DR-0 R-4 refinement,
 * PM-ruled 2026-08-15).
 *
 * THE FALLBACK: anchoring to the fired-for day is right when that day holds the record
 * an after-midnight tap would otherwise lose (B-672). But when the fired-for day is a
 * PAST day (an age-1 tap) that is itself EMPTY, it has no record to protect — and
 * anchoring to it would hide a symptom the owner logged after midnight behind
 * "Nothing in {pet}'s record today", the very false-empty the anchor exists to
 * prevent, mirrored. So an empty past fired-for day yields to today. A fired-for day
 * WITH rows still wins (B-672 preserved); an empty state now only ever renders for the
 * actual today, so its "today" copy is always honest.
 *
 * Pure. `pets` must carry rows spanning the fired-for day THROUGH today (the loader
 * fetches that window) so the fallback re-clips to today without a second read —
 * `buildDaySummary` clips per `nowMs`, so a superset is fine. Returns the model and
 * `renderedMs`, the instant actually rendered (the date header names this day).
 */
export function buildAnchoredDaySummary(input: {
  pets: DaySummaryPetInput[];
  firedForMs: number | null | undefined;
  nowMs: number;
  timeZone?: string;
}): { model: DaySummaryModel; renderedMs: number } {
  const { pets, firedForMs, nowMs, timeZone } = input;
  const anchorMs = resolveDaySummaryAnchorMs({ firedForMs, nowMs, timeZone });
  const anchored = buildDaySummary({ pets, nowMs: anchorMs, timeZone });
  const anchoredToPastDay = localDayIndex(anchorMs, timeZone) !== localDayIndex(nowMs, timeZone);
  if (anchored.isEmpty && anchoredToPastDay) {
    return { model: buildDaySummary({ pets, nowMs, timeZone }), renderedMs: nowMs };
  }
  return { model: anchored, renderedMs: anchorMs };
}

// ── Zero-log copy (Principle 5 + G2 — owned here, asserted by the test) ──────
//
// nyx-voice + clinical-guardrails both gate these at the copy pass (PR 5); this is
// the build-time, safe default. Direction from §5.3: name what the record is
// MISSING and offer the door. Never a wellness verdict on the absence.

export const DAY_SUMMARY_ZERO_LOG = {
  /** The whole-screen (and single-pet) empty state title. A record fact. */
  title: 'Nothing in the record today',
  /** Forward-looking, offering the door (Principle 5) without asserting anything
   *  about the pet. Ten seconds is the app's own logging promise, not a nudge. */
  body: 'If something happened, it takes about ten seconds to add.',
  /** The zero-log CTA label (mock round 2). This screen has no FAB, so the body's
   *  "…to add" invitation needs a door; the screen wires it to the quick-log. Uses
   *  the app's own verb ("log"), matching TodayZone's empty nudge. An invitation,
   *  never a verdict on the absence (G2) — it opens a door, it does not say a log
   *  was owed. */
  cta: 'Log an event',
} as const;

/** A single pet's zero-log line on a MULTI-pet summary (one pet logged today,
 *  another did not). Same G2 register as the full state — a record fact about
 *  {name}'s day, never an all-clear over the pet. */
export function petZeroLogLine(petName: string): string {
  return `Nothing in ${petName}’s record today.`;
}

/** The whole-screen zero-log TITLE. Names the pet on a single-pet account
 *  (nyx-voice Pattern 1 — the pet's name is what creates the stakes, and the
 *  9pm zero-log day is the wedge owner's commonest empty state) and stays neutral
 *  when there is no single pet to name: an account with no pets, or a multi-pet
 *  account where the whole-screen state cannot pick one. No trailing period — it
 *  is a title, not the inline `petZeroLogLine` sentence. Same G2 register either
 *  way: a record fact, never a wellness verdict. */
export function daySummaryEmptyTitle(petName?: string | null): string {
  return petName ? `Nothing in ${petName}’s record today` : DAY_SUMMARY_ZERO_LOG.title;
}
