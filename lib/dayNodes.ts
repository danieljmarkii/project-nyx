// The one pipeline from a day's events to the nodes the day's row draws (History v2 ·
// the record you can read, HV-1 / CUL-1158; spec §5.5, R-3 "import what the app
// already computes").
//
// Home's spine (`TodayCard`, behind `design_v2`) and History v2's day cards (behind
// `history_v2`) both call THIS, so a meal, a run, a timing line and a read are the same
// node on both surfaces. The contract is "node in, row out", fixed here so the step-2
// lanes can run in parallel (spec §8): HV-6 changes what the pipeline RETURNS (the run
// rule, the dose row, the read's states), never its signature; HV-7 renders whatever it
// returns through `<DayNodeRow node>` (`components/dayRow/`).
//
// ── WHY THIS DELEGATES TO `buildSpine` RATHER THAN RE-COMPOSING IT ────────────────
// The composition — `nodeReadOf` for the read, `timingsByRow` for the timing line,
// `compactSpine` for the runs — already lives in ONE function, `buildSpine`
// (`lib/spineNode.ts`), and HV-1 moves TodayCard's call to it here verbatim rather than
// copying its body. Two reasons, both structural:
//   • `timingsByRow` is module-private to `lib/spineNode.ts`, and that file is edited in
//     parallel by HV-2 (the timing line names its meal) and HV-5 (the read goes through
//     `readStateOf`). A copy of the composition here would miss both edits; a call
//     inherits them with no shared line.
//   • One composition cannot drift from itself. The refactor-safety suite beside this
//     file pins that `buildDay` IS `buildSpine` over the same facts, for the fixture day
//     and for a sweep of random days — so if HV-6 moves the body here, that suite is
//     what says the move changed nothing.
//
// Pure: no I/O, no clock, no React. The caller reads the facts (the photo set, the
// observed reads, the feedings — `lib/spineReads.ts`) and hands them over; a read that
// has not answered is handed over EMPTY, never guessed (TodayCard's pet guard).

import type { FeedingInput, FreeFedSpan, MealTimingConfig, OnsetConfidence } from './mealTiming';
import {
  buildSpine,
  type SpineAnalysisRow,
  type SpineCompactNode,
  type SpineEventInput,
  type SpineEventNode,
  type SpineModel,
  type SpineNode,
} from './spineNode';

/** One node on a day's thread: a single event, or a run of meals. */
export type DayNode = SpineNode;
/** A single event's node. */
export type DayEventNode = SpineEventNode;
/** A run of meals that share a line. */
export type DayRunNode = SpineCompactNode;
/** The fields the pipeline reads off an event row (a `NyxEvent` or a `TimelineRow`). */
export type DayEvent = SpineEventInput;
/** The day as Home draws it: the count line's figures and the nodes. */
export type DayModel = SpineModel;

/** What the day's reads hand the pipeline. */
export interface DayReads {
  /** Event ids that carry at least one attachment — the photo glyph's fact. */
  photographed: ReadonlySet<string>;
  /** The observed per-incident reads, by event id. Absent ⇒ no read is known. */
  analysis: ReadonlyMap<string, SpineAnalysisRow>;
  /** Event ids whose read is being produced right now (C-30). */
  working: ReadonlySet<string>;
}

/** What the timing lane measures a vomit against. */
export interface DayTimings {
  /** The pet's meals inside the lane's lookback, the previous evening's included. */
  feedings: readonly FeedingInput[];
  freeFedSpans: readonly FreeFedSpan[];
  /** Vomit onsets BEFORE the day, inside the lane's episode gap (`lib/mealTiming.ts`:
   *  "collapse on the full list, then window"). */
  priorOnsets?: readonly { ms: number; confidence?: OnsetConfidence | null }[];
  config?: MealTimingConfig;
}

export interface DayNodeFacts {
  reads: DayReads;
  timings: DayTimings;
}

/**
 * The day as Home draws it — the count line's figures (`total`, `counts`) and the nodes,
 * from one call so the count and the rows cannot come from two populations (C-3).
 * `TodayCard` calls this; a surface that draws only rows calls `buildDayNodes`.
 */
export function buildDay(events: readonly DayEvent[], { reads, timings }: DayNodeFacts): DayModel {
  return buildSpine({
    rows: events,
    photographed: reads.photographed,
    analysis: reads.analysis,
    working: reads.working,
    feedings: timings.feedings,
    freeFedSpans: timings.freeFedSpans,
    priorOnsets: timings.priorOnsets,
    config: timings.config,
  });
}

/** A day's events in, its nodes out — the rows History v2 and Home draw (spec §5.5). */
export function buildDayNodes(events: readonly DayEvent[], facts: DayNodeFacts): DayNode[] {
  return buildDay(events, facts).nodes;
}
