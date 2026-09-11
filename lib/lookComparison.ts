// The two-half compare — a word's day count against the four weeks before it
// (CUL-874 / N-5).
//
// docs/nyx-daily-look-requirements.md §6.4–§6.7, §6.10; the Change Contract v1.1 (S5).
//
// ── WHAT IT IS ───────────────────────────────────────────────────────────────
// *Off · first Sep 2 · 4 weeks before: 0 of 22 · 3 of 24 days.* Two four-week halves,
// each with ITS OWN answered-day denominator, time-ordered, direction-neutral: no arrow,
// no verdict word, no percentage, no slope. The reader is handed two fractions and does
// the comparison herself, which is the only form that survives a denominator that moves.
//
// ── WHY EVERY GATE BELOW EXISTS ──────────────────────────────────────────────
// Under R1 looking is VOLUNTARY and the wedge is a worried owner, so the denominator is
// self-selected and the sample is chosen by the same mood the numerator measures. Every
// rule here is a named counterexample from the spec's adversarial passes:
//
//   • THE SPREAD RULE (§6.5, gap 9). Eight answered days can be eight days she was
//     already worried, and under R9 five looks in two days are two answered days — so a
//     burst can never reach a floor on its own. Counting PLACEMENT as well as count is
//     what stops a count-anchored sentence laundering a selected sample.
//   • THE DENSITY RULE (§6.6). A falling count is withheld when she also answered on
//     fewer days: less seen and less looked-for are the same number from the outside, and
//     the reassuring reading is the wrong one to hand her for free.
//   • THE RTM GUARD (§6.7), DIRECTION-SCOPED. Owners start looking at a bad stretch, so a
//     FALLING pair whose earlier half is the first month of looks is regression to the
//     mean wearing a finding's clothes. A RISING pair is never subject to it — a first
//     month of nothing followed by a month of *subdued* is exactly the onset R1 exists to
//     catch, and withholding it would be the one direction this feature cannot afford.
//   • THE VOCABULARY VERSION (§6.10). Rows compare only within one `vocab_version`. A
//     straddle is not a smaller signal, it is a different question, so it is withheld
//     with the date rather than quietly averaged across the change.
//
// ── AND ONE THING THIS MODULE NEVER DOES ─────────────────────────────────────
// It never withholds a COUNT. Only the PAIR waits for a floor: below every gate the
// current window's own count still renders with its own denominator, because a rising
// symptom-class count is never withheld (§6.6, first clause). That rule is enforced by
// the caller owning the count and this module owning only the comparison — a shape, not
// a promise, so a future edit here cannot reach the count at all.
//
// Activity positives are refused STRUCTURALLY rather than by convention (§6.6, gap 10):
// `compareWord` asks the vocabulary for the word's kind and returns `notApplicable` for a
// positive, so a caller that forgets the rule still cannot render a positives pair — the
// caregiver-placebo render the third pass named.

import { lookWordKind, type LookSpecies } from '../constants/lookWords';
import { localDayIndex, localDayIndexOf, formatCalendarDate, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './lookDayCounts';

/** Each half is four weeks of local days. The current half is the same 28-day window the
 *  coverage footer speaks for (`LOOK_COVERAGE_WINDOW_DAYS`), stated here independently
 *  because the two answer different questions: that one is a coverage span, this one is a
 *  comparison unit, and a future change to either must not silently move the other
 *  (C-34 — a mirrored constant must answer the same question). They are equal today. */
export const LOOK_COMPARE_HALF_DAYS = 28;

/** The weeks each half is divided into, for the spread rule. */
export const LOOK_COMPARE_WEEKS_PER_HALF = 4;

/** §6.5 — answered days a half must hold before its side of a pair may be spoken. */
export const LOOK_COMPARE_MIN_ANSWERED_DAYS = 8;

/** §6.5 — and over how many of the half's four weeks those days must be spread. A week
 *  counts as occupied when it holds at least one answered day. */
export const LOOK_COMPARE_MIN_WEEKS = 3;

/** One half of the compare, counted. */
export interface LookCompareHalf {
  /** Days in this half on which the word was marked. */
  days: number;
  /** Answered days in this half — the denominator, never the half's 28. */
  answered: number;
  /** Answered days per week, OLDEST FIRST (§6.4's "answered 6 · 5 · 7 · 6 by week").
   *  Carried for the detail screen (v1.x) and for the spread rule's own test; the card
   *  renders the pair without it. */
  weekly: number[];
  /** The half's first and last local-day keys — so a surface can name the span it is
   *  speaking for rather than assuming today's. */
  firstDay: string;
  lastDay: string;
}

/** Why a pair is not rendered. Each carries its own sentence (§6.5–§6.10) — a withheld
 *  comparison says what it needs or why it cannot be made; it is never silent and never
 *  an all-clear. */
export type LookCompareWithholding =
  /** Below §6.5's floor on one or both halves. The card's own calibration line carries
   *  this one, so it has no sentence of its own — the reason is the record's thinness and
   *  saying it once per row would be six greys under three ink rows. */
  | { reason: 'notEnoughData'; text: null }
  | { reason: 'densityFell'; text: string }
  | { reason: 'firstMonth'; text: string }
  | { reason: 'vocabularyChanged'; text: string }
  /** An activity positive, refused structurally (§6.6, gap 10). Never rendered, never
   *  explained — there is nothing to say about a comparison that must not exist. */
  | { reason: 'notApplicable'; text: null };

export type LookComparison =
  | { kind: 'pair'; word: string; current: LookCompareHalf; earlier: LookCompareHalf }
  | ({ kind: 'withheld'; word: string } & LookCompareWithholding);

export interface LookCompareInput {
  nowMs: number;
  /** Explicit IANA zone for the day arithmetic; production passes nothing — the DEVICE
   *  zone is the owner's midnight (T-19, C-29). */
  timeZone?: string;
  /** The pet's species, for the word's kind. `null` (an Other pet) has no vocabulary and
   *  therefore no card, so it never reaches here; `lookWordKind` falls back across both
   *  lists, which is right for a shared key. */
  species: LookSpecies | null;
}

interface HalfBounds {
  firstIndex: number;
  lastIndex: number;
}

/** The two halves' day-index bounds. The current half ENDS TODAY and the earlier half
 *  ends the day before it starts — contiguous, never overlapping, so no day is counted on
 *  both sides of its own comparison. */
export function compareHalves(nowMs: number, timeZone?: string): { current: HalfBounds; earlier: HalfBounds } {
  const todayIndex = localDayIndex(nowMs, timeZone);
  const currentFirst = todayIndex - (LOOK_COMPARE_HALF_DAYS - 1);
  return {
    current: { firstIndex: currentFirst, lastIndex: todayIndex },
    earlier: { firstIndex: currentFirst - LOOK_COMPARE_HALF_DAYS, lastIndex: currentFirst - 1 },
  };
}

/** Count one half: the word's days, the answered days, and where in the four weeks they
 *  fell. The word's days are a SET of local days (§6.2 — a word in two looks the same day
 *  counts once), which is why this walks rows into sets rather than incrementing. */
function countHalf(record: readonly LookDayRow[], bounds: HalfBounds, word: string): LookCompareHalf {
  const answered = new Set<string>();
  const marked = new Set<string>();
  const weekly = new Array<number>(LOOK_COMPARE_WEEKS_PER_HALF).fill(0);
  const answeredIndexes = new Set<number>();
  for (const row of record) {
    const index = localDayIndexOf(row.localDay);
    if (index === null || index < bounds.firstIndex || index > bounds.lastIndex) continue;
    answered.add(row.localDay);
    answeredIndexes.add(index);
    if (row.words.includes(word)) marked.add(row.localDay);
  }
  // Weeks OLDEST FIRST: week 0 is the half's first seven days. Derived from the index
  // rather than from the iteration order, which is newest-day-first at the reader.
  for (const index of answeredIndexes) {
    const week = Math.floor((index - bounds.firstIndex) / 7);
    if (week >= 0 && week < LOOK_COMPARE_WEEKS_PER_HALF) weekly[week] += 1;
  }
  return {
    days: marked.size,
    answered: answered.size,
    weekly,
    firstDay: dayKeyFromIndex(bounds.firstIndex),
    lastDay: dayKeyFromIndex(bounds.lastIndex),
  };
}

/** §6.5 — does this half carry enough, spread widely enough, to be one side of a pair? */
export function halfClearsFloor(half: LookCompareHalf): boolean {
  const occupiedWeeks = half.weekly.filter((n) => n > 0).length;
  return half.answered >= LOOK_COMPARE_MIN_ANSWERED_DAYS && occupiedWeeks >= LOOK_COMPARE_MIN_WEEKS;
}

/**
 * The vocabulary versions present across both halves, and the first day the newest one
 * appears — §6.10's straddle test and the date its sentence needs.
 *
 * Both halves together, not each separately: two halves each internally consistent but on
 * DIFFERENT versions are exactly as incomparable as one half that straddles, and the
 * first cut tested only the second of those.
 */
function versionStraddle(
  record: readonly LookDayRow[],
  current: HalfBounds,
  earlier: HalfBounds,
): { straddles: boolean; changedOn: string | null } {
  const versions = new Set<number>();
  let newest = -Infinity;
  let firstDayOfNewest: string | null = null;
  for (const row of record) {
    const index = localDayIndexOf(row.localDay);
    if (index === null) continue;
    const inSpan =
      (index >= current.firstIndex && index <= current.lastIndex) ||
      (index >= earlier.firstIndex && index <= earlier.lastIndex);
    if (!inSpan) continue;
    versions.add(row.vocabVersion);
    if (row.vocabVersion > newest) {
      newest = row.vocabVersion;
      firstDayOfNewest = row.localDay;
    } else if (row.vocabVersion === newest && firstDayOfNewest !== null && row.localDay < firstDayOfNewest) {
      firstDayOfNewest = row.localDay;
    }
  }
  return { straddles: versions.size > 1, changedOn: versions.size > 1 ? firstDayOfNewest : null };
}

/** The earliest answered day in the WHOLE record — the RTM guard's anchor. `null` on an
 *  empty record, which cannot reach a pair anyway. */
function earliestAnsweredIndex(record: readonly LookDayRow[]): number | null {
  let earliest: number | null = null;
  for (const row of record) {
    const index = localDayIndexOf(row.localDay);
    if (index === null) continue;
    if (earliest === null || index < earliest) earliest = index;
  }
  return earliest;
}

/**
 * One word's two-half comparison, or the reason there isn't one.
 *
 * `record` is every LIVE look row for the pet (`loadLookDays` has already dropped the
 * soft-deleted ones through the parent). Rows outside the two halves are ignored here
 * rather than at the read — a window may INDEX, only the total may be SPOKEN, and the
 * totals this speaks are its own (C-3).
 */
export function compareWord(
  word: string,
  record: readonly LookDayRow[],
  input: LookCompareInput,
): LookComparison {
  // Structural refusal FIRST, before any counting: a positives pair must be unreachable,
  // not merely unrendered (§6.6, gap 10). An unnameable key (a vocabulary this build does
  // not know) is refused the same way — it cannot be classified, so it cannot be compared.
  if (lookWordKind(word, input.species) !== 'concern') {
    return { kind: 'withheld', word, reason: 'notApplicable', text: null };
  }

  const { current: currentBounds, earlier: earlierBounds } = compareHalves(input.nowMs, input.timeZone);
  const current = countHalf(record, currentBounds, word);
  const earlier = countHalf(record, earlierBounds, word);

  // ── The floors, first: you cannot compare what is not there ────────────────
  if (!halfClearsFloor(current) || !halfClearsFloor(earlier)) {
    return { kind: 'withheld', word, reason: 'notEnoughData', text: null };
  }

  // ── Then the vocabulary: with data on both sides, a straddle is the one gate
  //    that makes a WELL-POWERED comparison meaningless rather than merely thin.
  const straddle = versionStraddle(record, currentBounds, earlierBounds);
  if (straddle.straddles) {
    const changed = formatCalendarDate(straddle.changedOn);
    return {
      kind: 'withheld',
      word,
      reason: 'vocabularyChanged',
      text: changed
        ? `The words changed on ${changed}, so the two months can’t be compared yet.`
        : 'The words changed, so the two months can’t be compared yet.',
    };
  }

  // ── The two withholding gates, and what "falling" has to mean ─────────────
  //
  // THE GATE'S QUESTION IS NOT "did it fall", IT IS "can this READ AS IMPROVEMENT". The
  // first cut classified direction by the RATE, on the good-sounding ground that the two
  // denominators are self-selected samples and 3-of-24 is not 3-of-12. That is the right
  // way to describe a trend and the WRONG predicate for a gate, because the person the
  // gate protects is reading two NUMERATORS. The adversarial pass broke it both ways:
  //
  //   • *6 of 24* then *3 of 8* — she stopped answering except when worried. The rate
  //     ROSE (25% → 37.5%), so nothing fired and the pair published bare: the reader sees
  //     six become three, reads improvement, and the caption written for exactly this
  //     ("you also answered on fewer days this month") could not fire, because it was
  //     gated on a direction its own sentence is not about.
  //   • *4 of 10* then *5 of 28* — a true first month. The count ROSE, the rate fell, and
  //     the RTM guard withheld it. §6.7 says a rising pair is never subject to that rule.
  //
  // So the predicate is the COUNT, which is also the noun §6.6's first clause uses ("a
  // rising symptom-class word count is never withheld"). A count that rose, or held, can
  // not be read as improvement and is never withheld; a count that fell is, when the
  // record cannot support the fall. The RATE still decides nothing here and describes
  // everything: both halves print their own denominator, and the reader does the
  // comparison the two fractions actually support.
  const falling = current.days < earlier.days;
  if (falling) {
    const earliest = earliestAnsweredIndex(record);
    if (earliest !== null && earliest >= earlierBounds.firstIndex) {
      return {
        kind: 'withheld',
        word,
        reason: 'firstMonth',
        text: 'Comparisons start from the second month of looks.',
      };
    }
    if (current.answered < earlier.answered) {
      return {
        kind: 'withheld',
        word,
        reason: 'densityFell',
        text: 'You also answered on fewer days this month, so we can’t tell yet whether there was less to see.',
      };
    }
  }

  return { kind: 'pair', word, current, earlier };
}

/**
 * The pair's clause, as the card renders it: *4 weeks before: 0 of 22*.
 *
 * ONLY the earlier half, because the current half's numbers are the row's own count and
 * printing them twice on one line is how a reader comes to think the two are different
 * facts. Time-ordered by position (the row's count sits to the right of this clause), no
 * arrow, no delta, no verdict word — the Change Contract's shape (S5).
 */
export function comparisonClause(comparison: LookComparison): string | null {
  if (comparison.kind !== 'pair') return comparison.text;
  return `4 weeks before: ${comparison.earlier.days} of ${comparison.earlier.answered}`;
}
