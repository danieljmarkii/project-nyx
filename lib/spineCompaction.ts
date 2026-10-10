// The run rule for the day's row: which meals share one line (Design v2 D2-4 / CUL-1066
// drew the first rule; History v2 HV-6 / CUL-1163 replaced it with round 3's rule B, and
// it is the ONE predicate Home's spine and History v2's day cards share, spec §3.6).
//
// ── THE RULE, IN ONE SENTENCE (rule B) ────────────────────────────────────────
// Meals logged back to back share one line only when they are ONE PRODUCT (wet and dry of
// one line may mix; a second product may not), of one kind (a treat never joins a meal),
// on one local day, and EATEN NORMALLY with nothing else to say: every member is rated
// Most or All or not rated at all, and none is photographed, noted, a dose's vehicle, the
// meal a timing line measures from, eaten within 30 minutes before any vomit, or logged at
// a found or estimated time. Anything else
// is its own row, and is also what a run may never cross: a symptom, a dose, a weight, any
// row between them in time.
//
// ── WHY EACH BREAK EXISTS ─────────────────────────────────────────────────────
//   • A recorded rating below Most (Some, Picked at, Refused) is its own row: intake is
//     not preference, and a refusal folded into "3 meals" is the refusal hidden until
//     someone opens the line (CUL-1121: Saturday 8 AM All, noon Refused, 5 PM All read as
//     three ordinary meals on Home). The break keys on a RECORDED rating, never on a
//     missing one, so whatever CUL-1118 rules about rating capture cannot change what a
//     run means. A rating this build does not know is not "eaten normally" either.
//   • A photo, a note, a dose given in the meal, the meal a vomit's timing line measures
//     from, and a found or estimated time (its FOUND / ESTIMATED tag sits under the time,
//     and a run's time column holds only the range) are facts the run's one line cannot
//     show, so each keeps its row (the timing anchor especially: "Vomit · 5 min after
//     eating" must sit under the meal it names, never under a folded "4 meals").
//   • A meal eaten within 30 minutes before ANY vomit is its own row (CUL-1737, PM-ruled
//     2026-10-10, CUL-1715 D5): the timing anchor covers only a witnessed episode opener
//     with a feeding before it, so a meal minutes before a FOUND vomit, before the second
//     vomit of a bout, or in a free-fed span folded into "3 meals" right above the vomit,
//     the meal a vet would ask about hidden until someone opens the line. Every vomit
//     counts, seen or found, timed or not; runs only break more on bad days, which are the
//     days a vet reads. Vomit only: widening it to another type is a new clinical call.
//   • One product, because a run speaks for its members in one name (rule K); an unnamed
//     meal therefore never joins one. One kind, because an unwitnessed treat is the
//     canonical trial contaminant (the D2-4 adversarial pass, F3). One local day, because
//     a day card is the unit History draws.
//
// The rule is stated over CHRONOLOGICAL order, not input order: the store hands rows
// newest-first and the day reads top to bottom, so the first thing `compactSpine` does is
// sort, and "back to back" means adjacent IN TIME. Ties sort on the row id (rule H), so a
// same-minute pair never swaps between renders and the run a tie falls into is stable.
//
// PURE. No react-native, no theme, no clock: the caller derives every fact this reads
// (`lib/spineNode.ts`: the photo from the attachment set, the product key, the timing
// anchor from the lane, the day from the device zone) and hands it over. Tested by a
// property sweep in `spineCompaction.test.ts`, because the invariants ("a refusal is never
// inside a run", "never crosses", "maximal", "order-preserving") are the kind an example
// list lets slip.

import type { EventTintCategory } from './dayEvents';
import { DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';

/** The recorded ratings a run may hold. Everything else a meal can carry as a rating
 *  breaks it, including a value this build does not know; null (unrated) does not. */
const EATEN_NORMALLY: ReadonlySet<string> = new Set(['most', 'all']);

/**
 * How long before a vomit a meal keeps its own row, inclusive (0 ≤ vomit − meal ≤ 30 min).
 * MIRRORED from the timing lane's rapid band (`DEFAULT_MEAL_TIMING_CONFIG.rapidWindowMinutes`,
 * `lib/mealTiming.ts`, inclusive at 30) because it answers the SAME question, "did this pet
 * vomit soon after eating?" (C-34: same value, same question → mirror and name the source).
 * Signed off by Dr. Chen and the Data Scientist on CUL-1737. Read from the default, never a
 * caller's custom config: a run's membership is not a tuning knob.
 */
export const BEFORE_VOMIT_WINDOW_MINUTES = DEFAULT_MEAL_TIMING_CONFIG.rapidWindowMinutes;

/** A vomit's time on the record, as an inclusive span: one instant for a seen or estimated
 *  vomit, the owner's window for a found one (`vomitSpanOf`, `lib/spineNode.ts`). */
export interface VomitSpan {
  fromMs: number;
  toMs: number;
}

/**
 * Was a meal at `mealMs` eaten within the window before one of these vomits? It falls in
 * [fromMs − window, toMs], both ends inclusive: for a point vomit the 30 minutes before it,
 * for a found vomit from 30 minutes before its earliest bound to its latest. A meal AFTER a
 * point vomit never qualifies. The caller derives this into `CompactableNode.beforeVomit`.
 */
export function eatenBeforeVomit(mealMs: number, vomits: readonly VomitSpan[]): boolean {
  const window = BEFORE_VOMIT_WINDOW_MINUTES * 60_000;
  return vomits.some((v) => v.fromMs - window <= mealMs && mealMs <= v.toMs);
}

/** The facts the rule reads. A `NyxEvent` does not carry most of them; the caller
 *  derives them before calling (`lib/spineNode.ts`). */
export interface CompactableNode {
  id: string;
  category: EventTintCategory;
  /** The row's chronological key, `describeDayEvent`'s `timeMs`. */
  timeMs: number;
  /** The row's LOCAL day (an index, the device's zone), so a run never crosses midnight. */
  day: number;
  hasPhoto: boolean;
  /** `mealRowLabel`'s word for a meal row ('Meal' | 'Treat'); null off a meal. */
  mealKind: 'Meal' | 'Treat' | null;
  /** `productKeyOf` (`lib/dayEvents.ts`): which product the meal is of; null when it names
   *  no food. */
  product: string | null;
  /** The owner's recorded intake rating as the record holds it; null when unrated. */
  intake: string | null;
  /** The meal carries a note. The words are never read here, only that one exists. */
  noted: boolean;
  /** A dose was given in this meal (a dose's `paired_event_id` names it). */
  vehicle: boolean;
  /** A vomit's timing line measures from this meal (`timingsByRow`'s `mealId`). */
  timed: boolean;
  /** A vomit follows this meal within the window (`eatenBeforeVomit`), any vomit, on this
   *  day or, on History, the next (CUL-1737). */
  beforeVomit: boolean;
  /** The time is found or estimated, not witnessed (B-010's confidence). */
  approximate: boolean;
}

/** One line on the day: a single node, or a run of meals that share a line. A run always
 *  holds ≥ 2 nodes; one meal is just a meal. */
export type CompactGroup<T extends CompactableNode> =
  | { kind: 'single'; node: T }
  | { kind: 'compact'; nodes: T[] };

/** May this node be part of a run at all? A named meal eaten normally with nothing else to
 *  say. Named so the sweep reads the SAME predicate as the rule (C-34: a test that
 *  restates the rule is a tautology with fixtures; this one reads it). */
export function isCompactable(node: CompactableNode): boolean {
  return (
    node.category === 'meal' &&
    node.mealKind !== null &&
    node.product !== null &&
    !node.hasPhoto &&
    !node.noted &&
    !node.vehicle &&
    !node.timed &&
    !node.beforeVomit &&
    !node.approximate &&
    (node.intake === null || EATEN_NORMALLY.has(node.intake))
  );
}

/** May these two nodes share a run? Both may be in one, and they are one product, one
 *  kind, one day. */
export function sameRun(a: CompactableNode, b: CompactableNode): boolean {
  return (
    isCompactable(a) &&
    isCompactable(b) &&
    a.mealKind === b.mealKind &&
    a.product === b.product &&
    a.day === b.day
  );
}

/** Chronological order; a tie sorts on the id (rule H: the sort key is (occurred_at, id)),
 *  so the order never depends on the order the store or the page read handed the rows
 *  over, and a re-render cannot swap a same-minute pair. */
export function sortChronological<T extends CompactableNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => a.timeMs - b.timeMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Does a row drawn beside the nodes, but not one of them, fall between two run members in
 * time? `breaks` are those rows' instants (History's daily looks, CUL-1719). A surface
 * threads such a row before the first node LATER than it, so one at `t` sits after `a` and
 * before `b` exactly when `a.timeMs <= t < b.timeMs`: that half-open span is the break, and
 * a row the surface would draw outside the run's span leaves the run whole.
 */
function crossesBreak(a: CompactableNode, b: CompactableNode, breaks: readonly number[]): boolean {
  return breaks.some((t) => a.timeMs <= t && t < b.timeMs);
}

/**
 * Fold a day's nodes into lines. Sorted first; then a maximal stretch of nodes that each
 * `sameRun` the one before, of length ≥ 2, becomes one `compact` group, and every other
 * node (including a lone compactable meal) is a `single`.
 *
 * `breaks` (optional): instants of rows the surface draws among the nodes without handing
 * them over as nodes (History's looks, CUL-1719). A run never crosses one, the same as it
 * never crosses a symptom; absent or empty, the fold is exactly what it was (Home passes
 * none: its look is the header, not a row on the spine).
 *
 * Total: never throws, never drops a node (flattening the result in order is the sorted
 * input, pinned by the sweep).
 */
export function compactSpine<T extends CompactableNode>(
  nodes: readonly T[],
  breaks: readonly number[] = [],
): CompactGroup<T>[] {
  const sorted = sortChronological(nodes);
  const out: CompactGroup<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: 'compact', nodes: run });
    else for (const node of run) out.push({ kind: 'single', node });
    run = [];
  };
  for (const node of sorted) {
    if (isCompactable(node)) {
      // Another product, kind or day, or a drawn row between the two in time, closes the
      // run and opens the next.
      if (run.length > 0 && (!sameRun(run[run.length - 1], node) || crossesBreak(run[run.length - 1], node, breaks))) {
        flush();
      }
      run.push(node);
      continue;
    }
    flush();
    out.push({ kind: 'single', node });
  }
  flush();
  return out;
}
