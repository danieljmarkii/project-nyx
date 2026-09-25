// The day's node model: the one pipeline behind the row Home's spine and History v2's day
// cards share (Design v2 D2-4 / CUL-1066 drew it; History v2 HV-6 / CUL-1163 gave it round
// 3's rules, spec §3.6; `lib/dayNodes.ts` is the entry point both surfaces call).
//
// One pure function turns a day's rows into what the row draws: the count line, then the
// nodes, each either a single event or a run of meals. It computes nothing the record
// cannot back and it never draws a picture: a photographed row gets a GLYPH and its read
// as a STATE; the photo itself is one tap away on the record (R4-2 option A: Home is the
// surface a guest sees over the owner's shoulder; T&S).
//
// ── WHAT EACH KIND SAYS (the §3.6 table) ─────────────────────────────────────────
//   • A meal or treat: its word, then the food (rule K: every meal is named where the
//     record names it, and never with a guessed name), its WET / DRY tag, its recorded
//     intake as a chip, and "with Prednisone" when a dose was given in it. The food name
//     drops a trailing word that only repeats the tag (`productNameBesideTag`).
//   • A run (rule B, `lib/spineCompaction.ts`): "4 meals · Royal Canin · Selected Protein
//     PR", then "1 wet · 3 dry". It names its product because every member is one.
//   • A dose: the drug from the dose's item, else its course (`doseDrugLabel`), else just
//     "Medication" (the PM's rulings on CUL-1124 and CUL-1163: an item or course that has
//     not synced reads exactly like none, so the row never claims the record names no
//     medicine). Then how it was given; when it was given IN a meal, the meal by its time
//     ("in the 1:00 PM meal") from the STORED pair (`paired_event_id`), never a minute
//     match (GAP-3), with that meal's intake beside it when it was not finished. Its
//     adherence as the shipped chip, all four states (GAP-2); *Unconfirmed* in place of a
//     chip only when the meal it rode in was refused or picked at and nobody has said
//     whether the dose went down (`isComboDoseInDoubt`, B-156).
//   • A vomit: "5 min after eating" when the lane timed it, the camera glyph, the read.
//   • A weight: its value in pounds, the unit the app speaks everywhere.
//   • Every row: FOUND or ESTIMATED under a time the owner did not witness (B-010).
//
// ── WHERE EACH FACT COMES FROM ───────────────────────────────────────────────────
//   • The words: `describeDayEvent` (the drill-in's mapper) and the naming rules beside it
//     in `lib/dayEvents.ts`, so a food and a drug are named as History and the recap name
//     them.
//   • "N min after eating": `classifyEpisodeSet` in `lib/mealTiming`, over the vomit onsets
//     collapsed with the lane's own gap, against the feedings and free-fed spans the
//     Patterns lane reads. The SAME predicate, never re-derived (G9). COLLAPSE FIRST, THEN
//     WINDOW: the caller hands over the onsets before the day inside the episode gap
//     (`priorOnsets`), so a bout that straddles midnight is one episode here as on the
//     lane (the D2-4 adversarial pass, F2). A row the lane would not time gets nothing,
//     never an imputed number; the long band speaks its band label ("6h or more after
//     eating"), because a bare "24 h after eating" states an intake fact off an absence of
//     logs (F8). Each line carries the id of the meal it measured from (HV-2), never a
//     bowl rated Refused (CUL-1122), and that meal keeps its own row (rule B).
//   • The read: the phone's copy of the verdict (`lib/readCopy.ts`, HV-5), decided by the
//     one predicate every surface shares (`lib/readState.ts`).
//   • The count line: `buildCountChips`, the recap's C2 counter, plus a total that counts
//     the same population (a look is never an event, T-5; C-3).
//
// ── WHAT A READ MAY SAY ───────────────────────────────────────────────────────────
// The row draws the predicate's STATE and speaks no verdict words but the rose's: *Worth a
// call* in rose, a grey *Photo not read* when a read was expected and no check happened
// (it failed, was never sent, hit the cap, the phone holds no copy, or it finished unable
// to say: the PM's 2026-09-25 ruling), the breathing tick while one is produced, and
// NOTHING for a calm read, because "nothing was found" is not a thing one photo can say
// (clinical-guardrails, Pattern 1; §3.6 rule 7). The calm state is kept on the node, not
// dropped, so the arrival (HV-10) knows the read it waited on ended quiet.
//
// Hide is NOT an input: Hide hides the read's WORDS on the record (H-4a) and the copy has
// no column for it, so no surface can stand the rose down with it.

import { buildCountChips, type DayCountChip } from './daySummary';
import {
  describeDayEvent,
  eventTintCategory,
  productKeyOf,
  rowFoodLabelOf,
  unfinishedIntakePhrase,
  type EventTintCategory,
} from './dayEvents';
import type { TimelineRow } from './db';
import { asDoseAdherence, doseDrugLabel } from './doseDisplay';
import { FORMAT_LABEL, foodFormatTag, mealRowLabel } from './food';
import { INCIDENT_REC_LABEL, type IncidentRecommendation } from './incidentReadState';
import { isComboDoseInDoubt, vehicleLabel } from './medications';
import { readVerdictOf, type ReadCopyRow } from './readState';
import { intakeChipTone, type RowChipTone } from './rowChips';
import {
  DEFAULT_MEAL_TIMING_CONFIG,
  classifyEpisodeSet,
  collapseEpisodes,
  type FeedingInput,
  type FreeFedSpan,
  type MealTimingConfig,
  type OnsetConfidence,
  type TimingBand,
} from './mealTiming';
import { compactSpine, type CompactableNode } from './spineCompaction';
import { TIMING_SYMPTOM_TYPE, timingBandLabel } from './patternsTiming';
import { localDayIndex } from './utils';
import { kgToLbs } from './weightUnits';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';

// ── Inputs ─────────────────────────────────────────────────────────────────────

/** The fields the model reads off a row. A `NyxEvent` from the Home store satisfies it
 *  (every joined column is optional there); a `TimelineRow` does too. A surface that
 *  hands over a row without a field the rules read gets the conservative answer for it
 *  (no pairing, no intake, no note), so every field below must be SELECTed by the read
 *  that feeds the row (Home: `TODAY_EVENTS_SQL`; History v2: HV-4's page read). */
export type SpineEventInput = Pick<TimelineRow, 'id' | 'pet_id' | 'event_type' | 'occurred_at'> &
  Partial<
    Pick<
      TimelineRow,
      | 'occurred_at_confidence'
      | 'occurred_at_earliest'
      | 'occurred_at_latest'
      | 'notes'
      | 'food_brand'
      | 'food_product_name'
      | 'food_type'
      | 'food_format'
      | 'intake_rating'
      | 'weight_kg'
      | 'drug_generic_name'
      | 'drug_brand_name'
      | 'regimen_drug_name'
      | 'adherence'
      | 'how_given'
      | 'paired_event_id'
      | 'paired_vehicle_intake'
      | 'paired_dose_count'
      | 'paired_dose_drug_name'
    >
  >;

/** What Home observes of an event's read: its row in the phone's copy (`lib/readCopy.ts`),
 *  read and never written from here. Four columns, and no field a surface could hide
 *  the rose with or print the read's words from (§5.3). */
export type SpineAnalysisRow = ReadCopyRow;

export interface SpineInput {
  /** The day's rows for ONE pet, any order (the model sorts). Looks may be present; they
   *  are neither counted nor drawn here (the header is today's look; T-5). */
  rows: readonly SpineEventInput[];
  /** Event ids that carry at least one attachment (`lib/spineReads.ts`). */
  photographed: ReadonlySet<string>;
  /** The phone's copy of the reads, by event id (`readAnalysisRows`). Absent ⇒ the phone
   *  holds no read for that event. */
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
  /** Event ids whose read is being PRODUCED right now (`analysisChainOutstanding`), the
   *  C-30 fact, handed in rather than read here so the model stays pure. */
  working: ReadonlySet<string>;
  /** The feedings the lane would time against: the pet's meals inside the lookback,
   *  yesterday's included (a 6 AM vomit is timed against last night's bowl). */
  feedings: readonly FeedingInput[];
  freeFedSpans: readonly FreeFedSpan[];
  /** Vomit onsets BEFORE the day, inside the lane's episode gap, so the collapse runs over
   *  the unbounded list before the day windows it (`lib/mealTiming.ts`: "COLLAPSE ON THE
   *  FULL LIST, THEN WINDOW"). Empty when the record has none. */
  priorOnsets?: readonly { ms: number; confidence?: OnsetConfidence | null }[];
  config?: MealTimingConfig;
  /** Meal ids a timing line on ANOTHER day measures from (`DayTimings.timedElsewhere`):
   *  each keeps its own row here too. */
  timedElsewhere?: ReadonlySet<string>;
}

// ── Outputs ─────────────────────────────────────────────────────────────────────

/** The read, as the row may draw it: `readVerdictOf`'s state (§5.4). */
export type NodeRead =
  /** No read is expected, or photo reading is off: the row says nothing about it. */
  | { state: 'none' }
  /** A finished calm read. The row draws NOTHING for it (§3.6 rule 7: n=1 never
   *  reassures); the state is kept so an arrival knows the read it waited on ended quiet. */
  | { state: 'calm' }
  /** The server was asked (C-30), or the row itself is still `pending`: the tick. */
  | { state: 'pending' }
  /** A read was expected and no check happened: failed, never sent, capped, no copy on
   *  this phone, or finished unable to say. The grey *Photo not read* (H-4b). */
  | { state: 'unread' }
  /** The rose: *Worth a call*, whatever the row's status (CUL-812), an unknown verdict
   *  included. */
  | { state: 'worth_a_call'; label: string };

/** Whether a read is EXPECTED for the event: its type, and whether this device holds its
 *  photo. Without it a missing read cannot be told from no photo, so it reads as `none`
 *  rather than `unread`; every caller that knows the event passes it. */
export interface NodeReadExpectation {
  eventType: string;
  hasPhoto: boolean;
}

/** A dose row's facts beyond its name (§3.6's dose row). */
export interface SpineDose {
  /** The shipped chip's value, or null when unrated or a value this build does not know. */
  adherence: DoseAdherence | null;
  /** The meal it rode in was refused or picked at and the dose is unrated: *Unconfirmed*
   *  replaces the chip (B-156; GAP-2: never on any other unrated dose). */
  inDoubt: boolean;
  /** How it was given: "in the 1:00 PM meal" when its meal is on this day, else the
   *  recorded vehicle ("in food", "directly", …), else null (nothing is guessed). */
  vehicle: string | null;
  /** The meal it rode in, when that meal was NOT finished: "picked at", in the meal chip's
   *  tone. A record fact beside the dose; it never changes the stored adherence. */
  vehicleIntake: { phrase: string; tone: RowChipTone } | null;
}

export interface SpineEventNode {
  kind: 'event';
  id: string;
  category: EventTintCategory;
  eventType: string;
  /** The row's first word: "Meal" / "Treat", a symptom's label, a dose's drug (else
   *  "Medication"), "Weight". */
  title: string;
  /** The muted words after the title: a meal's food, a dose's vehicle, a weight's value.
   *  A vomit's timing is `timing`, not here, so the renderer can place the photo glyph
   *  between them. */
  detail: string | null;
  /** The meal's food label alone (brand · product), null off a meal or when unnamed. */
  food: string | null;
  formatTag: string | null;
  /** A meal's recorded intake rating, as the record holds it (the chip); null when
   *  unrated and off a meal. */
  intake: string | null;
  /** A dose's facts; null off a dose. */
  dose: SpineDose | null;
  /** A meal that carried a dose: "with Prednisone", "with a dose", "with 2 doses". */
  carries: string | null;
  time: string;
  /** FOUND or ESTIMATED under the time, for a time the owner did not witness. */
  timeTag: 'found' | 'estimated' | null;
  timeMs: number;
  photo: boolean;
  /** "3 min after eating", or null when the lane cannot time it. Vomit only. */
  timing: string | null;
  read: NodeRead;
}

export interface SpineCompactNode {
  kind: 'compact';
  /** Stable across renders: the first member's id, prefixed. */
  id: string;
  ids: string[];
  count: number;
  /** "3 meals" / "2 treats". */
  title: string;
  /** The product every member is (rule K): "Royal Canin · Selected Protein PR". */
  detail: string;
  /** The members' formats, counted: "1 wet · 3 dry", "all dry"; null when no member
   *  carries a format tag (a run is all tagged or all untagged, `productKeyOf`). */
  formats: string | null;
  /** "12:41 – 5:07 PM": the members' own compact times, the shared meridiem written once. */
  timeRange: string;
  timeMs: number;
  rows: SpineEventNode[];
}

export type SpineNode = SpineEventNode | SpineCompactNode;

export interface SpineModel {
  /** Countable rows today (looks excluded, T-5). The count line's leading number. */
  total: number;
  /** The recap's C2 chips, symptoms first: the same counter, the same order. */
  counts: DayCountChip[];
  nodes: SpineNode[];
  /** The meal each of the day's timing lines measures from, by the vomit that carries the
   *  line: the anchors this very call used. A surface that draws one card per day (History)
   *  hands a card the meals a line on ANOTHER card names (`timedElsewhere`), and reads them
   *  here rather than running the lane a second time. */
  anchors: ReadonlyMap<string, string>;
}

// ── The read ─────────────────────────────────────────────────────────────────────

/**
 * Fold the phone's copy and the working fact into what the row may draw, through the one
 * read predicate. `expect` is optional so a caller that knows nothing of the event still
 * compiles; a caller that knows the event passes it, so a missing read can be `unread`.
 */
export function nodeReadOf(
  row: SpineAnalysisRow | undefined,
  working: boolean,
  expect?: NodeReadExpectation,
): NodeRead {
  const { state } = readVerdictOf({
    eventType: expect?.eventType ?? null,
    hasPhoto: expect?.hasPhoto ?? false,
    copy: row,
    inFlight: working,
    // The owner's photo-reading choice arrives with CUL-552 (HV-18).
    readingOff: false,
  });
  switch (state) {
    case 'worth_a_call':
      return { state: 'worth_a_call', label: INCIDENT_REC_LABEL.worth_a_call };
    case 'calm':
      return { state: 'calm' };
    case 'pending':
      return { state: 'pending' };
    case 'unread':
      return { state: 'unread' };
    case 'off':
    case 'none':
      return { state: 'none' };
  }
}

// ── Timing ──────────────────────────────────────────────────────────────────────

/** "3 min after eating" · "2 h after eating" · "2 h 20 min after eating", for the rapid
 *  and mid bands. The LONG band takes the lane's own band label rather than a number:
 *  "12 h after eating" off a breakfast-only logger is a claim about an unlogged dinner.
 *  Minutes are rounded; an hour figure drops a remainder under five minutes. */
export function timingLine(minutes: number, band: TimingBand, config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG): string {
  if (band === 'long') return timingBandLabel(band, config);
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min after eating`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r >= 5 ? `${h} h ${r} min after eating` : `${h} h after eating`;
}

/** A vomit row's timing line: the words, and the meal they are measured from. The meal id is
 *  what keeps that meal visible as its own row rather than folded into a run (HV-2 /
 *  CUL-1159 returns it; rule B reads it). */
export interface SpineTimingLine {
  /** "3 min after eating" · "2 h 20 min after eating" · "6h or more after eating". */
  text: string;
  /** The anchor feeding's EVENT id: the meal or treat the lane measured from, which is never
   *  one the owner rated Refused (CUL-1122). Every line has one: no anchor, no line. */
  mealId: string;
}

/** Feedings in time order, a same-instant pair on its id. The lane resolves two eaten bowls
 *  at one instant to the FIRST in input order (B-788), and SQLite hands rows over in no
 *  promised order, so without this the meal a line names, and therefore which meal keeps
 *  its own row, could change between two reads of the same record (HV-2's handoff). */
function feedingsInStableOrder(feedings: readonly FeedingInput[]): FeedingInput[] {
  return [...feedings].sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The onsets in one order before the lane collapses them, for the same reason as the bowls
 *  above: `collapseEpisodes` sorts on the instant alone, so of two vomits logged at one
 *  instant the one that ARRIVED first opened the episode, and the store's order is not
 *  SQLite's. The line jumped between the two rows, and where one was found rather than
 *  seen, the timed meal (and so a run) came and went (the HV-6 adversarial pass, B3). Ties
 *  go to the row id (rule H); the onsets before the day carry none and tie on their
 *  confidence's spelling. Which confidence SHOULD open a same-instant episode is the
 *  lane's question, not this order's (CUL-1230). */
function onsetsInStableOrder<T extends { id: string | null; ms: number; confidence: OnsetConfidence | null }>(
  onsets: readonly T[],
): T[] {
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...onsets].sort(
    (a, b) => a.ms - b.ms || text(a.id ?? '', b.id ?? '') || text(a.confidence ?? '', b.confidence ?? ''),
  );
}

/**
 * The lane's timings for the day's vomit rows, keyed by the row that opened each
 * episode. Runs the lane's exact sequence (collapse at the episode gap, then the
 * eligibility ladder), so a row the lane would not put on the lane gets no line here,
 * and a row that gets one also learns which meal it was timed from.
 */
export function timingsByRow(
  rows: readonly SpineEventInput[],
  priorOnsets: readonly { ms: number; confidence?: OnsetConfidence | null }[],
  feedings: readonly FeedingInput[],
  freeFedSpans: readonly FreeFedSpan[],
  config: MealTimingConfig,
): Map<string, SpineTimingLine> {
  const todays = rows
    .filter((r) => r.event_type === TIMING_SYMPTOM_TYPE)
    .map((r) => ({
      id: r.id as string | null,
      ms: Date.parse(r.occurred_at),
      confidence: (r.occurred_at_confidence as OnsetConfidence | null | undefined) ?? null,
    }))
    .filter((r) => Number.isFinite(r.ms));
  // The onsets before the day carry no id: an episode THEY open is the lane's, and a
  // row of today's absorbed into it gets no line.
  const prior = priorOnsets
    .filter((o) => Number.isFinite(o.ms))
    .map((o) => ({ id: null as string | null, ms: o.ms, confidence: o.confidence ?? null }));
  const episodes = collapseEpisodes(onsetsInStableOrder([...prior, ...todays]), config.episodeGapHours);
  const dist = classifyEpisodeSet(
    episodes.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    feedingsInStableOrder(feedings),
    freeFedSpans,
    config,
  );
  const out = new Map<string, SpineTimingLine>();
  for (const eligible of dist.eligible) {
    // Keyed back through the episode that carries this onset: the row the collapse
    // kept, never a later row of the same bout.
    const opener = episodes.find((e) => e.ms === eligible.onsetMs);
    if (opener?.id) {
      out.set(opener.id, {
        text: timingLine(eligible.minutesSinceFeeding, eligible.band, config),
        mealId: eligible.feedingId,
      });
    }
  }
  return out;
}

// ── Rows → nodes ─────────────────────────────────────────────────────────────────

/** What one row's node reads off the rest of its day. */
interface DayContext {
  byId: ReadonlyMap<string, SpineEventInput>;
  /** The doses given in each meal on this day, by the meal's event id: each dose's name,
   *  null when this phone has none for it. From the doses' STORED pair. */
  dosesIn: ReadonlyMap<string, (string | null)[]>;
  timing: ReadonlyMap<string, SpineTimingLine>;
}

function dayContext(rows: readonly SpineEventInput[], timing: ReadonlyMap<string, SpineTimingLine>): DayContext {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const dosesIn = new Map<string, (string | null)[]>();
  for (const r of rows) {
    if (r.event_type !== 'medication' || !r.paired_event_id) continue;
    const names = dosesIn.get(r.paired_event_id) ?? [];
    names.push(doseNameOf(r));
    dosesIn.set(r.paired_event_id, names);
  }
  return { byId, dosesIn, timing };
}

/** The drug a dose row names: the item, else the course; null when this phone has
 *  neither (the row then says "Medication" and never that none is named). */
function doseNameOf(row: SpineEventInput): string | null {
  return doseDrugLabel({
    genericName: row.drug_generic_name,
    brandName: row.drug_brand_name,
    regimenDrugName: row.regimen_drug_name,
  });
}

/** "with Prednisone" · "with a dose" · "with Prednisone and Cerenia" · "with 2 doses of
 *  Prednisone" (two doses of one drug in one bowl is a fact worth seeing, never folded into
 *  one name) · "with 3 doses". The doses on this day, by their stored pair; a meal whose
 *  dose sits on another day (a dose logged at 12:01 AM in last night's bowl) falls back to
 *  the timeline read's own reverse link, which names only a single dose's item (CUL-1184
 *  tracks that join). */
function carriesLine(meal: SpineEventInput, ctx: DayContext): string | null {
  const names = ctx.dosesIn.get(meal.id);
  if (names === undefined) {
    const count = meal.paired_dose_count ?? 0;
    if (count === 0) return null;
    return count === 1 ? `with ${meal.paired_dose_drug_name?.trim() || 'a dose'}` : `with ${count} doses`;
  }
  if (names.length === 1) return `with ${names[0] ?? 'a dose'}`;
  const distinct = new Set(names);
  if (!distinct.has(null) && distinct.size === 1) return `with ${names.length} doses of ${names[0]}`;
  if (names.length === 2 && !distinct.has(null)) return `with ${names[0]} and ${names[1]}`;
  return `with ${names.length} doses`;
}

/** How a dose was given, as its row says it (GAP-2: every recorded vehicle has words, NULL
 *  has none). The shipped read labels, lowercased into the row's sentence; "Other" reads
 *  "another way", since "Prednisone · other" is not a sentence. */
function vehicleWords(howGiven: string | null | undefined): string | null {
  const label = vehicleLabel(howGiven);
  if (label === null) return null;
  return howGiven === 'other' ? 'another way' : label.toLowerCase();
}

/** A clock time inside a sentence: "in the 1:00 PM meal", as spec §3.6 draws it. The time
 *  column keeps the app's two-digit hour (`formatTime`), which lines up in a column and
 *  reads wrong in prose (the HV-6 PM pass: "in the 01:00 PM meal"). */
function clockInProse(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function doseOf(row: SpineEventInput, ctx: DayContext): SpineDose {
  const adherence = asDoseAdherence(row.adherence);
  const meal = row.paired_event_id ? ctx.byId.get(row.paired_event_id) : undefined;
  // The vehicle's intake: the meal on this day when it is here (its current rating), else
  // the timeline read's live join of it (`paired_vehicle_intake`).
  const vehicleRating = meal ? meal.intake_rating ?? null : row.paired_vehicle_intake ?? null;
  const vehicle = meal
    ? `in the ${clockInProse(meal.occurred_at)} ${mealRowLabel(meal.food_type).toLowerCase()}`
    : vehicleWords(row.how_given);
  const phrase = row.paired_event_id ? unfinishedIntakePhrase(vehicleRating) : null;
  return {
    adherence,
    inDoubt: isComboDoseInDoubt({ isCombo: !!row.paired_event_id, vehicleIntake: vehicleRating, adherence }),
    vehicle,
    vehicleIntake: phrase !== null && vehicleRating !== null ? { phrase, tone: intakeChipTone(vehicleRating) } : null,
  };
}

/**
 * Can this row's record hold a per-incident read the row should draw? Every row but a meal,
 * a dose and a look. The ONE gate: Home's read of the copy (`TodayCard`) and the node below
 * both ask it, so the rows a surface reads a verdict for are the rows the pipeline draws one
 * on. Not the rose tint (CUL-1197): a photographed `stool_normal` is not a symptom by
 * colour, but its read can be worth a call (blood, a foreign body, a vomit the same day),
 * and a row re-typed after its read landed keeps the rose the predicate stands. Whether a
 * read is EXPECTED is the predicate's own question (`hasPerIncidentRead`, `lib/readState.ts`).
 */
export function mayCarryRead(eventType: string): boolean {
  const category = eventTintCategory(eventType);
  return category !== 'meal' && category !== 'medication' && category !== 'look';
}

function timeTagOf(confidence: string | null | undefined): SpineEventNode['timeTag'] {
  if (confidence === 'window') return 'found';
  if (confidence === 'estimated') return 'estimated';
  return null;
}

function eventNode(row: SpineEventInput, input: SpineInput, ctx: DayContext): SpineEventNode {
  // `describeDayEvent` reads only the fields `SpineEventInput` carries; the cast is the
  // type's, not the data's (every other TimelineRow column is unread there).
  const described = describeDayEvent(row as unknown as TimelineRow);
  const category = described.category;
  const photo = input.photographed.has(row.id);
  let title = described.title;
  let detail: string | null = null;
  let food: string | null = null;
  let formatTag: string | null = null;
  let intake: string | null = null;
  let dose: SpineDose | null = null;
  let carries: string | null = null;
  if (category === 'meal') {
    // The TYPE leads and the food follows ("Meal · Royal Canin · Selected Protein PR"), so
    // an opened run's members and a lone meal read the same way.
    title = mealRowLabel(row.food_type);
    formatTag = foodFormatTag(row.food_format, title);
    food = rowFoodLabelOf({ brand: row.food_brand, product: row.food_product_name, format: row.food_format, rowLabel: title });
    detail = food;
    intake = row.intake_rating ?? null;
    carries = carriesLine(row, ctx);
  } else if (category === 'medication') {
    title = doseNameOf(row) ?? 'Medication';
    dose = doseOf(row, ctx);
    detail = dose.vehicle;
  } else if (row.event_type === 'weight_check' && row.weight_kg != null) {
    detail = `${kgToLbs(row.weight_kg)} lbs`;
  }
  // The read attaches to any row whose record can hold one (`mayCarryRead`, CUL-1197); a
  // meal or a dose never carries a read, whatever the map holds.
  const read: NodeRead = mayCarryRead(row.event_type)
    ? nodeReadOf(input.analysis.get(row.id), input.working.has(row.id), { eventType: row.event_type, hasPhoto: photo })
    : { state: 'none' };
  return {
    kind: 'event',
    id: row.id,
    category,
    eventType: row.event_type,
    title,
    detail,
    food,
    formatTag,
    intake,
    dose,
    carries,
    time: described.time,
    timeTag: timeTagOf(row.occurred_at_confidence),
    timeMs: described.timeMs,
    photo,
    timing: ctx.timing.get(row.id)?.text ?? null,
    read,
  };
}

/** The facts rule B reads, derived from the node and its row (`lib/spineCompaction.ts`). */
function runFactsOf(node: SpineEventNode, row: SpineEventInput, ctx: DayContext, timed: ReadonlySet<string>) {
  const isMeal = node.category === 'meal';
  return {
    id: node.id,
    category: node.category,
    timeMs: node.timeMs,
    day: localDayIndex(node.timeMs),
    hasPhoto: node.photo,
    mealKind: isMeal ? (node.title === 'Treat' ? 'Treat' : 'Meal') : null,
    product: isMeal
      ? productKeyOf({ brand: row.food_brand, product: row.food_product_name, format: row.food_format, rowLabel: node.title })
      : null,
    intake: node.intake,
    noted: !!row.notes?.trim(),
    vehicle: ctx.dosesIn.has(node.id) || (row.paired_dose_count ?? 0) > 0,
    timed: timed.has(node.id),
    approximate: node.timeTag !== null,
    node,
  } satisfies CompactableNode & { node: SpineEventNode };
}

const MERIDIEM = /\s(AM|PM)$/;

/** "12:41 – 5:07 PM": the shared meridiem written once, on the later time. Two exact
 *  times only; an approximate member keeps its own marker ("~12:41 – 5:07 PM"). A range
 *  with equal ends is one time (BRK-12: a same-minute pair never prints "8:00 – 8:00 PM"). */
export function timeRangeLabel(first: string, last: string): string {
  if (first === last) return first;
  const a = MERIDIEM.exec(first);
  const b = MERIDIEM.exec(last);
  if (a && b && a[1] === b[1]) return `${first.slice(0, a.index)} – ${last}`;
  return `${first} – ${last}`;
}

/** The order a run's format counts read in: wet before dry (the spec's "1 wet · 3 dry"),
 *  then every other format in the one label map's order. */
const FORMAT_WORD_ORDER: readonly string[] = [
  'wet',
  'dry',
  ...Object.values(FORMAT_LABEL)
    .map((w) => w.toLowerCase())
    .filter((w) => w !== 'wet' && w !== 'dry'),
];

/** The formats that are NOUNS, by their lowercased label, and their plurals. Every other
 *  label reads as an adjective beside a count ("3 dry", "2 freeze-dried") or as a mass noun
 *  ("2 jerky"), and so never inflects. */
const FORMAT_NOUN_PLURAL: Readonly<Record<string, string>> = { topper: 'toppers', treat: 'treats' };

/** "1 wet · 3 dry" · "all dry" · null (no member carries a tag). The members' own tags,
 *  counted, so the line speaks for exactly what an opened run shows. */
export function runFormatsLine(tags: readonly (string | null)[]): string | null {
  const words = tags.map((t) => (t === null ? null : t.toLowerCase()));
  if (words.some((w) => w === null)) return null;
  const counts = new Map<string, number>();
  for (const w of words as string[]) counts.set(w, (counts.get(w) ?? 0) + 1);
  // An adjective never inflects ("3 dry"); a noun does ("2 toppers", "all treats"), since
  // "2 topper" is not English (the HV-6 PM pass). A run has two members at least, so "all"
  // is always many.
  const word = (w: string, many: boolean) => (many ? FORMAT_NOUN_PLURAL[w] ?? w : w);
  if (counts.size === 1) return `all ${word([...counts.keys()][0], true)}`;
  const rank = (w: string) => {
    const i = FORMAT_WORD_ORDER.indexOf(w);
    return i === -1 ? FORMAT_WORD_ORDER.length : i;
  };
  return [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : 1))
    .map(([w, n]) => `${n} ${word(w, n > 1)}`)
    .join(' · ');
}

function compactNode(rows: SpineEventNode[]): SpineCompactNode {
  const first = rows[0];
  const last = rows[rows.length - 1];
  // One kind and one product per run (`compactSpine`), so the first member names the line.
  const noun = first.title === 'Treat' ? 'treats' : 'meals';
  return {
    kind: 'compact',
    id: `compact:${first.id}`,
    ids: rows.map((r) => r.id),
    count: rows.length,
    title: `${rows.length} ${noun}`,
    // Never null: an unnamed meal never joins a run (`productKeyOf`).
    detail: first.food ?? '',
    formats: runFormatsLine(rows.map((r) => r.formatTag)),
    timeRange: timeRangeLabel(first.time, last.time),
    timeMs: first.timeMs,
    rows,
  };
}

/** The day, as the row draws it. Pure and total. */
export function buildSpine(input: SpineInput): SpineModel {
  const config = input.config ?? DEFAULT_MEAL_TIMING_CONFIG;
  // A look is the header's, not the spine's (T-5; the recap spine keeps its bead). A row
  // whose instant cannot be parsed is dropped rather than drawn at the epoch; the month
  // door drops it too, so the populations agree on the same bad row (F6).
  const rows = input.rows.filter(
    (r) => eventTintCategory(r.event_type) !== 'look' && Number.isFinite(Date.parse(r.occurred_at)),
  );
  const timing = timingsByRow(rows, input.priorOnsets ?? [], input.feedings, input.freeFedSpans, config);
  const ctx = dayContext(rows, timing);
  const timed = new Set([...[...timing.values()].map((t) => t.mealId), ...(input.timedElsewhere ?? [])]);
  const nodes = rows.map((r) => eventNode(r, input, ctx));
  const groups = compactSpine(nodes.map((n) => runFactsOf(n, ctx.byId.get(n.id) as SpineEventInput, ctx, timed)));
  const lines: SpineNode[] = groups.map((g) =>
    g.kind === 'compact' ? compactNode(g.nodes.map((x) => x.node)) : g.node.node,
  );
  const countable = nodes.map((n) => ({ category: n.category, eventType: n.eventType }));
  const anchors = new Map([...timing].map(([vomitId, line]) => [vomitId, line.mealId] as const));
  return { total: countable.length, counts: buildCountChips(countable), nodes: lines, anchors };
}

/** The count line: "10 logged · 2 vomits · 1 cough · 7 meals". The recap's chips, led by
 *  the total of the same population. Nothing on a quiet day. */
export function countLine(model: Pick<SpineModel, 'total' | 'counts'>): string | null {
  if (model.total === 0) return null;
  return [`${model.total} logged`, ...model.counts.map((c) => c.label)].join(' · ');
}

export type { IncidentRecommendation };
