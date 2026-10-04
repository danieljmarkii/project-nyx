// The one count an owner carries to a recheck (CUL-1217 · GC-4, ruled (a) on CUL-1225,
// 2026-09-27; mechanism (i), PM 2026-10-04 — the phone counts).
//
// THE RULE. Named episodes over the engine's windows, on local days, with an as-of time; the
// Signal screen composes its title and its sentence from the charts it draws. So every number
// this module states is read off the bars' own model (`signalWeeks`, seven-day blocks ending
// today) and the episode days behind it, never off the cached finding's payload: "5 of the
// last 8 weeks" is the count of non-empty bars among the last eight, "6 episodes in the last 7
// days" is the last bar. The sentence and its chart agree by construction, and the property
// test in `signalCounts.test.ts` says so over engine-shaped records in every zone CI runs.
//
// WHAT THE ENGINE STILL OWNS. Whether a finding exists, its rank, its class and its tier (the
// ask). A local count can therefore sit under a card that fired on yesterday's numbers — a
// worsening that has since levelled off reads "4 in the last 7 days" over a rising tier. That
// is honest: the card stays (an escalation is never quieted by a recount) and a count is never
// a verdict. What a recount may NOT do is print a fall under a worsening (GC-3): on a safety
// finding the earlier window is stated only when it holds no more than the recent one, and on
// an insight it follows the shipped withhold rules (`weekLineWithheld`, CUL-1216).
//
// WHICH TYPES. The frequency claims whose window the bars draw: chronicity (the lookback in
// weeks), worsening (the rolling week pair) and reflection (the same pair, benign). Every other
// type keeps the engine's sentence: timing and correlation count populations no bar draws, the
// trial's numbers are the strip's (`lib/trialResponseCounts.ts`), and burden counts ROWS by
// design (`count`: re-logs within 60 s collapsed, not 3-hour episodes), so a recount in
// episodes would deflate a safety card; its unit is a PM question, not a build call.
//
// UNIT. An episode is the engine's re-log collapse (`collapseEpisodes`, 3 hours), keyed by the
// local day its first entry fell on — the screen's loader does that once (`readSignalEpisodes`).
// The unit line in *Why* says so in words, because "episode" is the one count on the screen
// that is not one entry.

import type { WeeklyBucketsModel } from './chartModels';
import { DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';
import type { SignalFinding, SymptomChronicityFinding, SymptomWorseningFinding, ReflectionFinding } from './signal';
import { symptomWord } from './signalCopy';
import { formatTime, localDayIndexOf } from './utils';

/** The finding types whose title and sentence the screen composes from its own counts. */
export type CountedFinding = SymptomChronicityFinding | SymptomWorseningFinding | ReflectionFinding;

export function isCountedFinding(finding: SignalFinding): finding is CountedFinding {
  return finding.type === 'symptom_chronicity' || finding.type === 'symptom_worsening' || finding.type === 'reflection';
}

/** One named window: its episodes and the distinct local days they fell on. */
export interface WindowCount {
  episodes: number;
  days: number;
}

export interface SignalCounts {
  /** The last bar: the last 7 days, today included. */
  recent: WindowCount;
  /** The bar before it: the 7 days before those. Null when the chart draws one bar. */
  prior: WindowCount | null;
  /** How many bars the lookback is (`round(windowDays / 7)`, at least 1, at most drawn). */
  lookbackWeeks: number;
  /** Bars among those with at least one episode. */
  activeWeeks: number;
  /** Episodes in those bars. */
  lookbackEpisodes: number;
  /** Local days from the newest episode in the lookback to today (0 = today); null when none. */
  daysSinceLast: number | null;
}

function indexOf(key: string): number {
  const i = /^\d{4}-\d{2}-\d{2}$/.test(key) ? localDayIndexOf(key) : null;
  if (i == null) throw new Error(`signalCounts: not a YYYY-MM-DD day key: ${key}`);
  return i;
}

/**
 * Every number the composed title and sentence state, read off the drawn bars. `episodeDays`
 * is the SAME list the bars were built from (one key per episode); it is read here only for
 * what a bar does not carry — the distinct days and the newest day — and only inside the
 * bars' own bounds, so nothing counted here can fall outside what is drawn.
 */
export function signalCountsOf(
  finding: CountedFinding,
  weekly: WeeklyBucketsModel,
  episodeDays: readonly string[],
  today: string,
): SignalCounts {
  const n = weekly.weeks.length;
  const todayIdx = indexOf(today);
  const daysIn = (startKey: string, endKey: string): number => {
    const from = indexOf(startKey);
    const to = Math.min(indexOf(endKey), todayIdx);
    const set = new Set<number>();
    for (const k of episodeDays) {
      const i = indexOf(k);
      if (i >= from && i <= to) set.add(i);
    }
    return set.size;
  };
  const windowOf = (w: number): WindowCount => {
    const b = weekly.weeks[w];
    return { episodes: b.count, days: daysIn(b.startKey, b.endKey) };
  };
  const lookbackWeeks = Math.max(1, Math.min(n, Math.round(finding.windowDays / 7)));
  const lookback = weekly.weeks.slice(n - lookbackWeeks);
  const from = indexOf(lookback[0].startKey);
  let newest: number | null = null;
  for (const k of episodeDays) {
    const i = indexOf(k);
    if (i >= from && i <= todayIdx && (newest == null || i > newest)) newest = i;
  }
  return {
    recent: windowOf(n - 1),
    prior: n >= 2 ? windowOf(n - 2) : null,
    lookbackWeeks,
    activeWeeks: lookback.filter((b) => b.count > 0).length,
    lookbackEpisodes: lookback.reduce((a, b) => a + b.count, 0),
    daysSinceLast: newest == null ? null : todayIdx - newest,
  };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function recencyPhrase(daysSince: number): string {
  if (daysSince <= 0) return 'today';
  if (daysSince === 1) return 'yesterday';
  return `${daysSince} days ago`;
}

/**
 * The earlier window may be stated beside the recent one only when it is not a fall the
 * reader may not see: never under a safety finding (GC-3: a worsening is never drawn as a
 * fall), and under an insight only when the shipped withhold rules let the pair print. A
 * zero earlier week is never paired either — 0 → N is the New chip's fact, not a trend
 * (B-727).
 */
function priorMayPrint(recent: number, prior: number | null, safety: boolean, withheld: boolean): prior is number {
  if (prior == null || prior === 0 || withheld) return false;
  return safety ? prior <= recent : true;
}

/** The screen's title for a counted finding, in the chart's own numbers. */
export function countedTitle(finding: CountedFinding, c: SignalCounts): string {
  const thing = capitalize(symptomWord(finding.symptomType));
  switch (finding.type) {
    case 'symptom_chronicity':
      return `${thing} in ${c.activeWeeks} of the last ${c.lookbackWeeks} weeks`;
    case 'symptom_worsening':
      // The tier picks the axis its sentence leads with, as the engine's title does.
      if (finding.tier === 'firm' || finding.tier === 'soft') return `${thing} on ${c.recent.days} of the last 7 days`;
      return `${thing}, ${count(c.recent.episodes, 'episode', 'episodes')} in the last 7 days`;
    case 'reflection':
      // Count-free on purpose (CUL-1217 BRK-3): the pair lives in the sentence beneath.
      return `${thing}, week over week`;
  }
}

function worseningAsk(tier: SymptomWorseningFinding['tier']): string {
  if (tier === 'firm') return 'worth booking a vet visit soon';
  if (tier === 'soft') return 'worth keeping an eye on, and a word with your vet if it carries on';
  return 'worth a word with your vet';
}

// The §9 adjacency clause, the engine's own words (templateChronicity, CUL-676 / CUL-778): it
// names the other sign as logged, carries its premise, and never nets either count down.
function adjacencyClause(finding: SymptomChronicityFinding): string {
  if (!finding.coughVomitAdjacent) return '';
  const bridge =
    finding.symptomType === 'cough'
      ? 'Vomiting is logged too'
      : finding.symptomType === 'vomit'
        ? 'Coughing is logged too'
        : 'Coughing and vomiting are both logged';
  return ` ${bridge} — a cough can look like retching or end in vomiting. Mention both.`;
}

/**
 * The screen's sentence for a counted finding, composed from the chart's numbers. `withheld`
 * is the shipped falling-pair verdict for the last two bars (`weekLineWithheld`); a safety
 * finding never prints a fall whatever it says. The ask is the engine's tier, in the engine's
 * words: a recount never changes what the owner is asked to do.
 */
export function countedSentence(
  finding: CountedFinding,
  c: SignalCounts,
  petName: string,
  withheld: boolean,
): string {
  const symptom = symptomWord(finding.symptomType);
  const safety = finding.priorityClass === 'safety';
  switch (finding.type) {
    case 'symptom_chronicity': {
      const ask = finding.tier === 'firm' ? 'worth booking a vet visit' : 'worth a word with your vet';
      const recent = c.daysSinceLast == null ? '' : `, the most recent ${recencyPhrase(c.daysSinceLast)}`;
      return (
        `We've logged ${symptom} for ${petName} in ${c.activeWeeks} of the last ${c.lookbackWeeks} weeks — ` +
        `${count(c.lookbackEpisodes, 'episode', 'episodes')} in those weeks${recent}. ` +
        `A symptom that keeps recurring over weeks is ${ask}.${adjacencyClause(finding)} This is a read of your logs, not a diagnosis.`
      );
    }
    case 'symptom_worsening': {
      const ask = worseningAsk(finding.tier);
      if (finding.tier === 'firm' || finding.tier === 'soft') {
        const pd = c.prior?.days ?? null;
        const prior = priorMayPrint(c.recent.days, pd, safety, withheld) ? `, and on ${pd} of the 7 before` : '';
        return (
          `${petName} has had ${symptom} on ${c.recent.days} of the last 7 days ` +
          `(${count(c.recent.episodes, 'episode', 'episodes')})${prior} — ${ask}.`
        );
      }
      const p = c.prior?.episodes ?? null;
      const prior = priorMayPrint(c.recent.episodes, p, safety, withheld) ? `, and ${p} in the 7 before` : '';
      return `${petName} has had ${count(c.recent.episodes, 'episode', 'episodes')} of ${symptom} in the last 7 days${prior} — ${ask}.`;
    }
    case 'reflection': {
      const p = c.prior?.episodes ?? null;
      const prior = priorMayPrint(c.recent.episodes, p, safety, withheld) ? `, and ${p} in the 7 before` : '';
      return (
        `We've logged ${count(c.recent.episodes, 'episode', 'episodes')} of ${symptom} for ${petName} in the last 7 days${prior}. ` +
        `This is a count we're tracking with you — not a diagnosis, and not a verdict on how ${petName} is doing.`
      );
    }
  }
}

/** What one bar and one episode are — *Why*'s first line on a counted screen. */
export function countedUnitLine(): string {
  const h = DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours;
  return `Each bar is 7 days, the last one ending today. Entries of the same sign logged within ${h} hours of each other count as one episode.`;
}

/** "Counted at 9:14 AM." — the moment the screen read the record its numbers come from. */
export function countedAtLine(countedAtMs: number): string {
  return `Counted at ${formatTime(new Date(countedAtMs))}.`;
}
