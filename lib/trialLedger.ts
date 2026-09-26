// The day ledger (TS-2, CUL-1298; `docs/nyx-trial-screen-requirements.md` §3.5,
// §5.1, S5, §0.3): the trial's week-by-week record, and this week's lane on Home.
//
// A PROJECTION, NOT A PREDICATE (S2). Every cell reads a fact `computeTrialFacts`
// already holds: `coveredDayIndices` paints *meals logged*, `range` bounds what
// is counted, `exposures.items` places the off-diet mark. Nothing here decides
// what a meal, a day or an exposure is. A cell that cannot be read off a fact is
// not drawn — which is why the ledger is ABSENT, rather than approximated, on the
// records where the facts do not reach a drawn day (the extension weeks, below).
//
// TWO INPUTS, ONE RECORD. The gates (not eating, free-fed, the milestone) live on
// the card's input (`loadDietTrialFacts`); the day sets live on `TrialFacts`
// (`loadTrialPredicateFacts`), because the card input flattens them away. They
// are two reads, so the builder refuses to draw unless both report the same
// coverage: the ledger's row counts must sum to the caption printed under it, and
// a grid built off a newer read than its caption would contradict itself (S3).
//
// THE PARITY INVARIANT (C-3), property-tested in `trialLedger.test.ts` over the
// real loaders: Σ row.count.covered === coverage.daysLogged and
// Σ row.count.elapsed === coverage.daysElapsed, on every record the builder draws.

import type { TrialFacts } from './dietTrial';
import { trialTargetEndDayIndex } from './dietTrial';
import {
  formatTrialDate,
  isAnimalNotEating,
  planTrialCard,
  withholdingReasons,
  type TrialCardInput,
} from './dietTrialCard';
import { dayKeyFromIndex, localDayIndex, localDayIndexOf } from './utils';

/** The five fills (§3.5). The off-diet mark is NOT a fill: it overlays any of them. */
export type TrialLedgerFill =
  /** In the coverage range and carrying a logged non-treat feeding. */
  | 'meals_logged'
  /** In the coverage range, elapsed, nothing logged. Hollow and unshamed (S5). */
  | 'none_logged'
  /** Today, in range, not yet covered. Counted in the row's denominator, exactly
   *  as the coverage sentence counts it. */
  | 'today_open'
  /** Before the first logged meal (§10 S3's untracked head). Never counted and
   *  never *none logged*: those days are not a gap in the owner's record. */
  | 'not_tracked'
  /** Not yet reached — or never reached, on a trial that ended before it. */
  | 'not_reached';

export interface TrialLedgerDay {
  /** Absolute local-day index, the same basis as `TrialFacts.range`. */
  dayIndex: number;
  /** Trial day, 1-based (day 1 IS the start day). */
  trialDay: number;
  fill: TrialLedgerFill;
  /** An off-diet feeding is logged on this day. A BOOLEAN, never a count: the
   *  exposure count is a floor (§5.2) and only the receipt states it. */
  offDiet: boolean;
}

export interface TrialLedgerRowCount {
  /** Days in this row carrying a logged meal. */
  covered: number;
  /** Days in this row inside the coverage range (today included). */
  elapsed: number;
  /** This row holds today. */
  soFar: boolean;
}

export interface TrialLedgerRow {
  /** 1-based trial week (T-6: trial weeks, never Sunday weeks). */
  week: number;
  /** `Wk 3` */
  label: string;
  /** The row's first date, `Sep 18`. */
  firstDate: string;
  /** Up to seven days; the last row is shorter when the window is not a whole
   *  number of weeks. */
  days: TrialLedgerDay[];
  /** Null when no day of the row is in the coverage range (a week not reached, or
   *  a week wholly before the first log). A row never shows `0 of 0`. */
  count: TrialLedgerRowCount | null;
  /** `7 of 7`, `1 of 2 so far`, or null with `count`. */
  countLabel: string | null;
}

export interface TrialLedger {
  rows: TrialLedgerRow[];
  /** `Sep 4 · day 1` */
  startLabel: string;
  /** `Oct 29 · day 56, the end you set` */
  endLabel: string;
  /** The row the end line draws under: the row holding the target's last day. On a
   *  trial ended after its target (PM ruling on CUL-1298), later rows follow it. */
  endAfterRowIndex: number;
  /** The row holding today, or null (an overrun or ended trial, the day it ended included). */
  currentRowIndex: number | null;
  /** In display order. `not tracked` only when a drawn day carries it. */
  legend: TrialLedgerLegendKey[];
  /** One sentence for the whole grid (§6: the ledger is ONE accessible element). */
  accessibilityLabel: string;
}

export type TrialLedgerLegendKey = 'meals_logged' | 'none_logged' | 'off_diet' | 'not_tracked';

/** The legend's words (§3.5). Never *ate*, *eaten*, *clean* or *missed*. */
export const TRIAL_LEDGER_LEGEND_TEXT: Record<TrialLedgerLegendKey, string> = {
  meals_logged: 'meals logged',
  none_logged: 'none logged',
  off_diet: 'an off-diet feeding logged',
  not_tracked: 'not tracked',
};

export interface BuildTrialLedgerArgs {
  /** The card's input, as `loadDietTrialFacts` returns it — the gates. */
  input: TrialCardInput;
  /** The same trial's facts, as `loadTrialPredicateFacts` returns them — the days. */
  facts: TrialFacts | null;
  /** Omitted in production: the device's zone is the owner's midnight (B-421),
   *  the same clock the facts were computed on. */
  timeZone?: string;
}

/**
 * The ledger for one trial, or null where §3.5 / §0.3 say it is absent.
 *
 * ABSENT, IN THE ORDER CHECKED:
 *  • no trial, no facts, no range, or an unreadable start date or target;
 *  • the pet may not be eating (`isAnimalNotEating`, on the RAW withholding
 *    reasons, so a refusal the card's register has stood down still hides it:
 *    a refused bowl counts as a logged day, and a filled mark would paint it
 *    like a good one, §12 finding 3). The facts' own refusal fields are read too
 *    — a gate may be added here, never dropped;
 *  • the trial is free-fed now or overlapped a free-choice bowl (a bowl logs no
 *    meals, so every day would draw hollow) — asked of the card input's `freeFed`
 *    / `freeFedOverlap` AND of the facts' `intakeNotDirectlyObserved(Now)`, the
 *    fields the loader derives them from, so either read saying so is enough;
 *  • the milestone (a filled grid beside the stop decision, §12 finding 6), read
 *    off the card's own state switch rather than restated;
 *  • an un-ended trial whose coverage window and the window the owner set now
 *    disagree. Extended past its DESIGNED window (PM ruling on CUL-1298,
 *    2026-09-26; the drawn version is CUL-1317): coverage stays on the designed
 *    window (CUL-1038, TE-6), so the days since it closed have no fact to paint
 *    from. SHORTENED below it (latent: `changeTrialWindow` refuses a non-forward
 *    move, so only a synced or hand-edited row gets here): coverage runs past the
 *    end line, and drawing it would put counted rows under "the end you set",
 *    which §0.3 forbids. Same ruling, the mirror case, found by the adversarial
 *    pass;
 *  • the two reads disagree about coverage.
 */
export function buildTrialLedger(args: BuildTrialLedgerArgs): TrialLedger | null {
  const { input, facts, timeZone } = args;
  const trial = input.trial;
  if (!trial || !facts || !facts.range || !facts.coverage) return null;

  // ── The gates ──────────────────────────────────────────────────────────────
  if (isAnimalNotEating(input)) return null;
  if (facts.trialDietRefusal || facts.rangeRefusal) return null;
  if (input.freeFed || input.freeFedOverlap) return null;
  if (facts.intakeNotDirectlyObserved || facts.intakeNotDirectlyObservedNow) return null;
  if (planTrialCard(input).state === 'milestone') return null;

  // S3: the grid and the caption come from two reads, and must be one record.
  const cardCoverage = input.coverage;
  if (
    !cardCoverage ||
    cardCoverage.daysLogged !== facts.coverage.daysLogged ||
    cardCoverage.daysElapsed !== facts.coverage.daysElapsed
  ) {
    return null;
  }

  const startIndex = localDayIndexOf(trial.startedAt, timeZone);
  const targetEnd = trialTargetEndDayIndex(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    timeZone,
  );
  if (startIndex === null || targetEnd === null) return null;

  const range = facts.range;
  // An ended trial's coverage closes on the day it ended; every other trial's
  // closes on today or on its designed end. STATUS ALONE, the same discriminator
  // the loader uses to decide whether the facts see an end at all: the card input
  // carries the raw `ended_at`, so a stray one on an active row (a sync artefact)
  // would otherwise make the ledger think "ended" while the facts think "running",
  // and skip the shortened-window gate below.
  const ended = trial.status !== 'active';
  // The extension weeks: un-ended, past the designed window, and the window the
  // owner set now ends later than the one coverage is measured over.
  if (range.closedByOverrun && range.endDayIndex < targetEnd) return null;
  // The mirror: un-ended, and coverage reaches past the window the owner set.
  if (!ended && range.endDayIndex > targetEnd) return null;

  const todayIndex = localDayIndex(args.input.nowMs, timeZone);
  const todayKey = dayKeyFromIndex(todayIndex);

  // ── The days ───────────────────────────────────────────────────────────────
  //
  // Rows run to the later of the target's last day and the coverage range's
  // (PM ruling on CUL-1298: a trial ended after its target keeps its counted days
  // on the grid, or the rows would sum short of the caption). Only an ENDED trial
  // can reach past the target here: on an un-ended one the gate above has
  // already returned, and on an overrun the two coincide (the tail clip, §R-5).
  const lastIndex = Math.max(targetEnd, range.endDayIndex);
  const covered = new Set(facts.coveredDayIndices);
  const offDietDays = new Set<number>();
  // No marks while the allowed set is unusable: every feeding would read off-diet
  // (§3.5; the strip zeroes the same count). Either read saying so is enough.
  if (!facts.allowedSetUnavailable && !input.allowedSetUnavailable) {
    for (const item of facts.exposures.items) {
      const d = localDayIndexOf(item.occurredAt, timeZone);
      if (d !== null) offDietDays.add(d);
    }
  }

  const fillOf = (d: number): TrialLedgerFill => {
    if (d > range.endDayIndex) return 'not_reached';
    if (d < range.startDayIndex) return 'not_tracked';
    if (covered.has(d)) return 'meals_logged';
    // "Today, open" says the day can still be logged: never on a trial that ended.
    return d === todayIndex && !ended ? 'today_open' : 'none_logged';
  };

  const rows: TrialLedgerRow[] = [];
  for (let rowStart = startIndex, week = 1; rowStart <= lastIndex; rowStart += 7, week++) {
    const days: TrialLedgerDay[] = [];
    let coveredCount = 0;
    let elapsed = 0;
    let soFar = false;
    for (let d = rowStart; d < rowStart + 7 && d <= lastIndex; d++) {
      const fill = fillOf(d);
      if (d >= range.startDayIndex && d <= range.endDayIndex) {
        elapsed += 1;
        if (fill === 'meals_logged') coveredCount += 1;
        // "So far" is a claim that the week is still being written: never on an
        // ended trial, even on the day it ended.
        if (d === todayIndex && !ended) soFar = true;
      }
      days.push({ dayIndex: d, trialDay: d - startIndex + 1, fill, offDiet: offDietDays.has(d) });
    }
    const count = elapsed > 0 ? { covered: coveredCount, elapsed, soFar } : null;
    rows.push({
      week,
      label: `Wk ${week}`,
      firstDate: formatTrialDate(rowStart, todayKey),
      days,
      count,
      countLabel: count ? `${count.covered} of ${count.elapsed}${count.soFar ? ' so far' : ''}` : null,
    });
  }

  const rowOf = (d: number) => Math.floor((d - startIndex) / 7);
  // Today's row only while the trial runs and today is a COUNTED day. On an
  // overrun today is past the counted range; on an ended trial there is no "this
  // week" at all — including the day it ended, when today is still inside the
  // range (the adversarial pass's case: a trial completed today drew a lane).
  const currentRowIndex =
    !ended && todayIndex >= range.startDayIndex && todayIndex <= range.endDayIndex
      ? rowOf(todayIndex)
      : null;

  const drawn = rows.flatMap((r) => r.days);
  const legend: TrialLedgerLegendKey[] = ['meals_logged', 'none_logged', 'off_diet'];
  if (drawn.some((d) => d.fill === 'not_tracked')) legend.push('not_tracked');

  const targetDays = targetEnd - startIndex + 1;
  return {
    rows,
    startLabel: `${formatTrialDate(startIndex, todayKey)} · day 1`,
    endLabel: `${formatTrialDate(targetEnd, todayKey)} · day ${targetDays}, the end you set`,
    endAfterRowIndex: rowOf(targetEnd),
    currentRowIndex,
    legend,
    accessibilityLabel: ledgerSentence(input.petName, rows, todayKey),
  };
}

/** This week's lane (§5.1): the ledger's current row, the SAME object, so the lane
 *  and the ledger cannot disagree. Null when today is not on the ledger.
 *
 *  §5.1'S GATES ARE WIDER THAN THE LEDGER'S, and the one this module can see is
 *  enforced here rather than left to the host: ANY withholding reason means Home's
 *  strip is holding back its own coverage ratio, and the lane is that ratio drawn
 *  (an untracked head drew `Week 5 · 2 of 2 so far` beside a strip that withheld
 *  its ratio — found by the adversarial pass). The remaining two gates are the
 *  host's (TS-5), because only the host can see them: facts fresh for the strip's
 *  pet, and no live safety-class Signal card above the strip. So a non-null lane
 *  here is necessary and not sufficient. */
export interface TrialLane {
  row: TrialLedgerRow;
  /** `Week 4 · 1 of 2 so far` */
  label: string;
  accessibilityLabel: string;
}

export function thisWeekLane(ledger: TrialLedger | null, input: TrialCardInput): TrialLane | null {
  if (!ledger || ledger.currentRowIndex === null) return null;
  if (withholdingReasons(input).length > 0) return null;
  const row = ledger.rows[ledger.currentRowIndex];
  if (!row || !row.count) return null;
  const { covered, elapsed, soFar } = row.count;
  const tail = soFar ? ' so far' : '';
  return {
    row,
    label: `Week ${row.week} · ${covered} of ${elapsed}${tail}`,
    accessibilityLabel: `This trial week, week ${row.week}: meals logged on ${covered} of ${elapsed} ${
      elapsed === 1 ? 'day' : 'days'
    }${tail}`,
  };
}

// ── The sentence ─────────────────────────────────────────────────────────────
//
// Round 2's wording, with one change: an off-diet day is named by its DATE and
// never counted ("with an off-diet feeding logged on Sep 19", where the mock read
// "one off-diet feeding"). The dots never speak a count (§12, held), and a screen
// reader is not a way around that.

function ledgerSentence(petName: string, rows: TrialLedgerRow[], todayKey: string): string {
  const parts: string[] = [];
  // Trailing weeks that are wholly not reached collapse into one clause.
  let lastSpoken = rows.length - 1;
  while (lastSpoken >= 0 && rows[lastSpoken].days.every((d) => d.fill === 'not_reached')) {
    lastSpoken -= 1;
  }
  for (let i = 0; i <= lastSpoken; i++) {
    const row = rows[i];
    const bits: string[] = [];
    const untracked = row.days.filter((d) => d.fill === 'not_tracked').length;
    if (untracked > 0) bits.push(`not tracked for ${untracked} ${untracked === 1 ? 'day' : 'days'}`);
    if (row.count) {
      const { covered, elapsed, soFar } = row.count;
      bits.push(
        `meals logged ${covered} of ${elapsed} ${elapsed === 1 ? 'day' : 'days'}${soFar ? ' so far' : ''}`,
      );
    }
    const offDates = row.days.filter((d) => d.offDiet).map((d) => formatTrialDate(d.dayIndex, todayKey));
    let clause = `week ${row.week}, ${bits.join(', ') || 'not reached'}`;
    if (offDates.length > 0) clause += ` with an off-diet feeding logged on ${joinAnd(offDates)}`;
    parts.push(clause);
  }
  let sentence = `${petName}'s trial by week: ${parts.join('; ')}.`;
  const firstUnreached = lastSpoken + 2;
  const lastWeek = rows.length;
  if (firstUnreached === lastWeek) sentence += ` Week ${lastWeek} not reached.`;
  else if (firstUnreached < lastWeek) sentence += ` Weeks ${firstUnreached} to ${lastWeek} not reached.`;
  return sentence;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
