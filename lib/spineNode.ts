// The spine's node model — Home on a real day (Design v2 — the whole day, D2-4 /
// CUL-1066; the round-4 page §01 and §02, R4-2 ruled option A).
//
// One pure function turns the day's rows into what the spine draws: the count line,
// then the nodes, each either a single event or a compact run of meals. It computes
// nothing the record cannot back and it never draws a picture — a photographed row gets
// a GLYPH and, when its read has landed, the verdict IN WORDS; the photo itself is one
// tap away on the record (R4-2 option A: Home is the surface a guest sees over the
// owner's shoulder; T&S).
//
// ── WHERE EACH FACT COMES FROM ─────────────────────────────────────────────────
//   • The row's words — `describeDayEvent` (the drill-in's mapper), so a meal, a dose
//     and a look are named exactly as History, the day sheet and the recap name them.
//   • "N min after eating" — `classifyEpisodeSet` in `lib/mealTiming`, over the vomit
//     onsets collapsed with the lane's own gap, against the same feedings and free-fed
//     spans the Patterns lane reads. The SAME predicate, never re-derived (the issue's
//     own line; G9). COLLAPSE FIRST, THEN WINDOW (`lib/mealTiming.ts`'s own capitals):
//     the caller hands over the onsets that precede the day inside the episode gap
//     (`priorOnsets`), so a bout that straddles midnight is one episode on Home as it is
//     on the lane, and its 00:30 row gets NOTHING rather than a number the lane never
//     computed (the adversarial pass, F2). A row the lane would not time — discovered,
//     free-fed, no preceding feeding, or absorbed into an earlier episode — gets
//     nothing, never an imputed number. The rapid and mid bands speak the minutes; the
//     long band speaks the lane's own band label ("6h or more after eating"), because a
//     bare "24 h after eating" states an intake fact off an absence of logs (F8) —
//     whether Home should say "since her last logged meal" is Dr. Chen's, on the issue.
//     Each line also carries the id of the meal it was measured from (`timingsByRow`,
//     HV-2), which is never a bowl the owner rated Refused (CUL-1122): a refusal is not
//     eating, so a vomit five minutes after one is timed from the meal she last ate.
//   • The read — an `event_ai_analysis` row observed for the event (never triggered
//     from Home), or the `working` fact that a chain is outstanding (C-30). The verdict's
//     words are `INCIDENT_REC_LABEL`, the record's own map.
//   • The count line — `buildCountChips`, the recap's C2 counter, plus a total that
//     counts the same population (looks are never events — T-5; C-3).
//   • The lines — `compactSpine`.
//
// ── WHAT A READ MAY SAY ───────────────────────────────────────────────────────
// A landed recommendation renders in its shipped words, in the rose ink for
// `worth_a_call` and the secondary ink for `monitor`. An escalation SURVIVES a failed
// or capped row (`escalationSurvivesFailure`): if the row carries `worth_a_call` it
// renders, whatever its status. A row with no recommendation — failed, capped, read
// disabled — renders NO verdict line: the photo glyph stays and the node says nothing
// about the read, because "nothing was found" is not a thing one photo can say
// (clinical-guardrails, Pattern 1). A read the owner hid on the record (`dismissed_at`)
// is hidden here too — Home never resurfaces what the record folded away. A
// recommendation outside the shipped enum fails toward the rose (the same allowlist
// shape `IncidentReadCard` uses): a fourth verdict the server gains before this build
// does is not calm until someone says it is.

import { buildCountChips, type DayCountChip } from './daySummary';
import { describeDayEvent, eventTintCategory, foodLabelOf, type EventTintCategory } from './dayEvents';
import type { TimelineRow } from './db';
import { mealRowLabel } from './food';
import {
  INCIDENT_REC_LABEL,
  escalationSurvivesFailure,
  type IncidentRecommendation,
} from './incidentReadState';
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
import { compactSpine, type CompactGroup } from './spineCompaction';
import { TIMING_SYMPTOM_TYPE, timingBandLabel } from './patternsTiming';

// ── Inputs ─────────────────────────────────────────────────────────────────────

/** The fields the model reads off a row. A `NyxEvent` from the Home store satisfies it
 *  (every joined column is optional there); a `TimelineRow` does too. */
export type SpineEventInput = Pick<TimelineRow, 'id' | 'pet_id' | 'event_type' | 'occurred_at'> &
  Partial<
    Pick<
      TimelineRow,
      | 'occurred_at_confidence'
      | 'occurred_at_earliest'
      | 'occurred_at_latest'
      | 'food_brand'
      | 'food_product_name'
      | 'food_type'
      | 'food_format'
      | 'intake_rating'
      | 'drug_generic_name'
      | 'drug_brand_name'
      | 'adherence'
    >
  >;

/** What Home observes of an `event_ai_analysis` row. Read, never written, from here. */
export interface SpineAnalysisRow {
  event_id: string;
  status: string;
  recommendation: string | null;
  read_text: string | null;
  dismissed_at: string | null;
}

export interface SpineInput {
  /** Today's rows for ONE pet, any order (the model sorts). Looks may be present — they
   *  are neither counted nor drawn here (the header is today's look; T-5). */
  rows: readonly SpineEventInput[];
  /** Event ids that carry at least one attachment (`lib/spineReads.ts`). */
  photographed: ReadonlySet<string>;
  /** The observed analysis rows, by event id. Absent ⇒ no read is known. */
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
  /** Event ids whose read is being PRODUCED right now (`analysisChainOutstanding`) —
   *  the C-30 fact, handed in rather than read here so the model stays pure. */
  working: ReadonlySet<string>;
  /** The feedings the lane would time against — the pet's meals inside the lookback,
   *  yesterday's included (a 6 AM vomit is timed against last night's bowl). */
  feedings: readonly FeedingInput[];
  freeFedSpans: readonly FreeFedSpan[];
  /** Vomit onsets BEFORE the day, inside the lane's episode gap — so the collapse runs
   *  over the unbounded list before the day windows it (`lib/mealTiming.ts`: "COLLAPSE
   *  ON THE FULL LIST, THEN WINDOW"). Empty when the record has none. */
  priorOnsets?: readonly { ms: number; confidence?: OnsetConfidence | null }[];
  config?: MealTimingConfig;
}

// ── Outputs ─────────────────────────────────────────────────────────────────────

export type NodeReadTone = 'attn' | 'quiet' | 'muted';

/** The read, as the node may state it. */
export type NodeRead =
  /** No read is known and none is being produced — the node says nothing about it. */
  | { state: 'none' }
  /** The server was asked (C-30), or the row itself is still `pending`. */
  | { state: 'pending' }
  /** A recommendation the record holds, in its shipped words. */
  | {
      state: 'landed';
      verdict: string;
      label: string;
      tone: NodeReadTone;
      readText: string | null;
    };

export interface SpineEventNode {
  kind: 'event';
  id: string;
  category: EventTintCategory;
  eventType: string;
  /** The type word for a meal / dose / symptom ("Meal", "Vomit", "Cerenia"). */
  title: string;
  /** The muted qualifier after the title, or null: a meal's food and intake, a dose's
   *  adherence. A symptom's timing is `timing`, not here, so the renderer can place the
   *  photo glyph between them. */
  detail: string | null;
  /** The meal's food label alone (brand · product), null off a meal or when unnamed —
   *  carried separately because `detail` composes it with the intake phrase and the
   *  label itself holds the separator, so it cannot be parsed back out. */
  food: string | null;
  formatTag: string | null;
  time: string;
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
  /** The food, when every member names the same one; null when they differ. */
  detail: string | null;
  /** "12:41 – 5:07 PM" — the members' own compact times, the shared meridiem written once. */
  timeRange: string;
  timeMs: number;
  rows: SpineEventNode[];
}

export type SpineNode = SpineEventNode | SpineCompactNode;

export interface SpineModel {
  /** Countable rows today (looks excluded — T-5). The count line's leading number. */
  total: number;
  /** The recap's C2 chips, symptoms first — the same counter, the same order. */
  counts: DayCountChip[];
  nodes: SpineNode[];
}

// ── The verdict's tone ─────────────────────────────────────────────────────────

/** The two verdicts that may render CALM — an allowlist, not an equality test, for the
 *  reason `IncidentReadCard` gives: an unknown value fails toward the rose. */
const CALM_TONE: Readonly<Record<string, NodeReadTone>> = {
  monitor: 'quiet',
  not_enough_to_say: 'muted',
};

function toneOf(verdict: string): NodeReadTone {
  return CALM_TONE[verdict] ?? 'attn';
}

function labelOf(verdict: string): string {
  return (INCIDENT_REC_LABEL as Record<string, string>)[verdict] ?? INCIDENT_REC_LABEL.worth_a_call;
}

/** Fold the observed row and the working fact into what the node may say. */
export function nodeReadOf(
  row: SpineAnalysisRow | undefined,
  working: boolean,
): NodeRead {
  if (row === undefined) return working ? { state: 'pending' } : { state: 'none' };
  if (row.dismissed_at) return { state: 'none' };
  if (row.recommendation) {
    // An escalation survives a failed / capped row; a calm verdict on a completed or
    // uncertain row renders as itself. Either way the words are the record's.
    if (
      row.status === 'completed' ||
      row.status === 'uncertain' ||
      escalationSurvivesFailure({ recommendation: row.recommendation })
    ) {
      return {
        state: 'landed',
        verdict: row.recommendation,
        label: labelOf(row.recommendation),
        tone: toneOf(row.recommendation),
        readText: row.read_text,
      };
    }
  }
  if (row.status === 'pending' || working) return { state: 'pending' };
  return { state: 'none' };
}

// ── Timing ──────────────────────────────────────────────────────────────────────

/** "3 min after eating" · "2 h after eating" · "2 h 20 min after eating" — for the rapid
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
 *  what lets a surface keep that meal visible as its own row rather than folding it into a run
 *  (HV-2 / CUL-1159 returns it; HV-6 draws the row rule from it). */
export interface SpineTimingLine {
  /** "3 min after eating" · "2 h 20 min after eating" · "6h or more after eating". */
  text: string;
  /** The anchor feeding's EVENT id: the meal or treat the lane measured from, which is never
   *  one the owner rated Refused (CUL-1122). Every line has one: no anchor, no line. */
  mealId: string;
}

/**
 * The lane's timings for the day's vomit rows, keyed by the row that opened each
 * episode. Runs the lane's exact sequence — collapse at the episode gap, then the
 * eligibility ladder — so a row the lane would not put on the lane gets no line here,
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
  const episodes = collapseEpisodes([...prior, ...todays], config.episodeGapHours);
  const dist = classifyEpisodeSet(
    episodes.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    feedings,
    freeFedSpans,
    config,
  );
  const out = new Map<string, SpineTimingLine>();
  for (const eligible of dist.eligible) {
    // Keyed back through the episode that carries this onset — the row the collapse
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

function eventNode(
  row: SpineEventInput,
  input: SpineInput,
  timing: ReadonlyMap<string, SpineTimingLine>,
): SpineEventNode {
  // `describeDayEvent` reads only the fields `SpineEventInput` carries; the cast is
  // the type's, not the data's (every other TimelineRow column is unread there).
  const described = describeDayEvent(row as unknown as TimelineRow);
  const category = described.category;
  let title = described.title;
  let detail = described.detail;
  let food: string | null = null;
  if (category === 'meal') {
    // On the spine the TYPE leads and the food follows ("Meal · Selected Protein PR ·
    // all eaten"), so a compact line's expanded rows and a lone meal read the same way.
    food = foodLabelOf(row as unknown as TimelineRow);
    title = mealRowLabel(row.food_type);
    detail = [food, described.detail].filter((s): s is string => !!s).join(' · ') || null;
  }
  const photo = input.photographed.has(row.id);
  // The read attaches to a SYMPTOM whenever the record holds one for it — or the server
  // is producing one — not only when the local attachment fact is in: an
  // `event_ai_analysis` row exists only for a photographed incident, so the photo fact
  // is redundant as a gate and merely fragile as one (a failed or lagging attachment
  // read must never hide a `worth_a_call`; the adversarial pass, F5). A meal never
  // carries a read, whatever the map holds.
  const read: NodeRead =
    category === 'symptom' && (photo || input.analysis.has(row.id) || input.working.has(row.id))
      ? nodeReadOf(input.analysis.get(row.id), input.working.has(row.id))
      : { state: 'none' };
  return {
    kind: 'event',
    id: row.id,
    category,
    eventType: row.event_type,
    title,
    detail,
    food,
    formatTag: described.formatTag,
    time: described.time,
    timeMs: described.timeMs,
    photo,
    timing: timing.get(row.id)?.text ?? null,
    read,
  };
}

const MERIDIEM = /\s(AM|PM)$/;

/** "12:41 – 5:07 PM": the shared meridiem written once, on the later time. Two exact
 *  times only — an approximate member keeps its own marker ("~12:41 – 5:07 PM"). */
export function timeRangeLabel(first: string, last: string): string {
  const a = MERIDIEM.exec(first);
  const b = MERIDIEM.exec(last);
  if (a && b && a[1] === b[1]) return `${first.slice(0, a.index)} – ${last}`;
  return `${first} – ${last}`;
}

function compactNode(rows: SpineEventNode[]): SpineCompactNode {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const foods = rows.map((r) => r.food);
  const sameFood = foods.every((f) => f !== null && f === foods[0]);
  // One kind per run (`compactSpine`), so the first member names the line.
  const noun = rows[0].title === 'Treat' ? 'treats' : 'meals';
  return {
    kind: 'compact',
    id: `compact:${first.id}`,
    ids: rows.map((r) => r.id),
    count: rows.length,
    title: `${rows.length} ${noun}`,
    detail: sameFood ? foods[0] : null,
    timeRange: timeRangeLabel(first.time, last.time),
    timeMs: first.timeMs,
    rows,
  };
}

/** The day, as the spine draws it. Pure and total. */
export function buildSpine(input: SpineInput): SpineModel {
  const config = input.config ?? DEFAULT_MEAL_TIMING_CONFIG;
  // A look is the header's, not the spine's (T-5; the recap spine keeps its bead). A row
  // whose instant cannot be parsed is dropped rather than drawn at the epoch — the month
  // door drops it too, so the populations agree on the same bad row (F6).
  const rows = input.rows.filter(
    (r) => eventTintCategory(r.event_type) !== 'look' && Number.isFinite(Date.parse(r.occurred_at)),
  );
  const timing = timingsByRow(rows, input.priorOnsets ?? [], input.feedings, input.freeFedSpans, config);
  const nodes = rows.map((r) => eventNode(r, input, timing));
  const groups: CompactGroup<SpineEventNode & { hasPhoto: boolean; mealKind: 'Meal' | 'Treat' | null }>[] =
    compactSpine(
      nodes.map((n) => ({
        ...n,
        hasPhoto: n.photo,
        mealKind: n.category === 'meal' ? (n.title === 'Treat' ? 'Treat' : 'Meal') : null,
      })),
    );
  const lines: SpineNode[] = groups.map((g) =>
    g.kind === 'compact'
      ? compactNode(g.nodes.map(strip))
      : strip(g.node),
  );
  const countable = nodes.map((n) => ({ category: n.category, eventType: n.eventType }));
  return { total: countable.length, counts: buildCountChips(countable), nodes: lines };
}

function strip(n: SpineEventNode & { hasPhoto: boolean; mealKind: 'Meal' | 'Treat' | null }): SpineEventNode {
  const { hasPhoto: _hasPhoto, mealKind: _mealKind, ...node } = n;
  return node;
}

/** The count line: "10 logged · 2 vomits · 1 cough · 7 meals". The recap's chips, led by
 *  the total of the same population. Nothing on a quiet day. */
export function countLine(model: Pick<SpineModel, 'total' | 'counts'>): string | null {
  if (model.total === 0) return null;
  return [`${model.total} logged`, ...model.counts.map((c) => c.label)].join(' · ');
}

export type { IncidentRecommendation };
