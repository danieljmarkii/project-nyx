// The one pipeline from a day's events to the nodes the day's row draws (History v2 ·
// the record you can read, HV-1 / CUL-1158; spec §5.5, R-3 "import what the app
// already computes").
//
// Home's spine (`TodayCard`) and History v2's day cards both call THIS, so a meal, a run, a timing line and a read are the same
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

import type { VomitSpan } from './spineCompaction';
import type { FeedingInput, FreeFedSpan, MealTimingConfig, OnsetConfidence } from './mealTiming';
import {
  buildSpine,
  vomitSpanOf,
  type SpineAnalysisRow,
  type SpineCompactNode,
  type SpineEventInput,
  type SpineEventNode,
  type SpineModel,
  type SpineNode,
} from './spineNode';

/** A vomit's span as rule B's before-vomit break reads it (CUL-1737), the way a surface
 *  that draws one card per day builds `DayTimings.vomitsElsewhere`. Re-exported here so
 *  that surface keeps to the pipeline's one door (`guards/dayRowOneWay.test.ts`). */
export { vomitSpanOf };
export type { VomitSpan };

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
  /** Meal ids a timing line on ANOTHER day measures from (a 2 AM vomit timed from last
   *  night's 10 PM bowl). Rule B keeps the meal a line names as its own row (HV-6); a day's
   *  own lines are computed here, but a line on the next day is not, so a surface that
   *  draws one card per day (History) hands the next day's anchors in. Home draws today
   *  alone and leaves it out. Optional, so the call shape HV-7 renders from is unchanged. */
  timedElsewhere?: ReadonlySet<string>;
  /** Instants (ms) of the looks a surface draws AMONG the nodes (History under All types,
   *  CUL-1244). The pipeline leaves looks out of its rows (T-5), so without these a run of
   *  meals would fold straight over a 9:00 AM look between its 6:20 and 10:45 members, and
   *  the look would thread in after the whole run (CUL-1719). Rule B's own sentence: a run
   *  never crosses a row between its members in time. Home leaves it out: its look is the
   *  header, not a row. Optional, so the call shape is unchanged. */
  runBreaks?: readonly number[];
  /** The vomits on OTHER days, as spans (`vomitSpanOf`). A meal eaten within 30 minutes
   *  before any vomit keeps its own row (CUL-1737); a day's own vomits are read here, but a
   *  12:10 AM vomit on the next card is not, so a surface that draws one card per day
   *  (History) hands the other days' vomits in, the way `timedElsewhere` enters. Home draws
   *  today alone and leaves it out. Optional, so the call shape is unchanged. */
  vomitsElsewhere?: readonly VomitSpan[];
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
    timedElsewhere: timings.timedElsewhere,
    runBreaks: timings.runBreaks,
    vomitsElsewhere: timings.vomitsElsewhere,
  });
}

/** A day's events in, its nodes out — the rows History v2 and Home draw (spec §5.5). */
export function buildDayNodes(events: readonly DayEvent[], facts: DayNodeFacts): DayNode[] {
  return buildDay(events, facts).nodes;
}
