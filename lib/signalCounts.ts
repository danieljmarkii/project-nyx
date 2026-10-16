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
import { formatCalendarDate, formatTime, localDayIndexOf, toLocalDayKey } from './utils';

/** The finding types whose title and sentence the screen composes from its own counts. */
export type CountedFinding = SymptomChronicityFinding | SymptomWorseningFinding | ReflectionFinding;

export function isCountedFinding(finding: SignalFinding): finding is CountedFinding {
  return finding.type === 'symptom_chronicity' || finding.type === 'symptom_worsening' || finding.type === 'reflection';
}

/** One named window: its episodes and the distinct local days they fell on. */
export interface WindowCount {
  episodes: number;
  days: number;
  /** Days in the window holding a row of a bout but no bout's onset: a bout that ran past
   *  midnight into them (Q12, CUL-1957). `days` counts onsets, so these are what it leaves out
   *  and the sentence discloses. Every day inside a bout's span holds a row: the re-log chain
   *  (3 hours) cannot step over a whole day. */
  carriedDays: number;
  /** How many bouts those days are from, so the words say "a bout" or "bouts". */
  carriedBouts: number;
  /** A bout that began before the window had a row inside it (the bar's own `carriedIn`): an
   *  episode `episodes` does not count. */
  carriedIn: boolean;
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
  /** Bars among those with NO episode that a bout from an earlier one ran into (Q12): weeks
   *  with vomiting `activeWeeks` leaves out, disclosed beside it. */
  carriedWeeks: number;
  /** Episodes in those bars. */
  lookbackEpisodes: number;
  /** Local days from the newest episode in the lookback to today (0 = today); null when none. */
  daysSinceLast: number | null;
  /** Local days from the newest episode's LAST row to today, where that row fell on a later day
   *  than its onset; null otherwise. So "the most recent" never names only a day before a bout
   *  that ran on (CUL-1957). */
  lastRanTo: number | null;
}

/** A bout's first and last local day: `SignalScreenEpisode`'s `dayKey` and `endDayKey`. */
export interface CountedBout {
  dayKey: string;
  endDayKey: string;
}

function indexOf(key: string): number {
  const i = /^\d{4}-\d{2}-\d{2}$/.test(key) ? localDayIndexOf(key) : null;
  if (i == null) throw new Error(`signalCounts: not a YYYY-MM-DD day key: ${key}`);
  return i;
}

/**
 * Every number the composed title and sentence state, read off the drawn bars. `bouts` is the
 * SAME list the bars were built from (one entry per episode, its onset the bar's key); it is
 * read here only for what a bar does not carry — the distinct days, the newest day and the days
 * a bout ran on into — and only inside the bars' own bounds, so nothing counted here can fall
 * outside what is drawn.
 */
export function signalCountsOf(
  finding: CountedFinding,
  weekly: WeeklyBucketsModel,
  bouts: readonly CountedBout[],
  today: string,
): SignalCounts {
  const n = weekly.weeks.length;
  const todayIdx = indexOf(today);
  // Each bout's onset and its last day, the last clamped to today: a row dated after today is
  // never a bout going on (the bars' own bound).
  const spans = bouts.map((b) => {
    const start = indexOf(b.dayKey);
    return { start, end: Math.max(start, Math.min(indexOf(b.endDayKey), todayIdx)) };
  });
  const onsetDays = new Set(spans.map((s) => s.start));
  const windowOf = (w: number): WindowCount => {
    const b = weekly.weeks[w];
    const from = indexOf(b.startKey);
    const to = Math.min(indexOf(b.endKey), todayIdx);
    const days = new Set<number>();
    const carried = new Set<number>();
    let carriedBouts = 0;
    for (const s of spans) {
      if (s.start >= from && s.start <= to) days.add(s.start);
      const before = carried.size;
      for (let i = Math.max(from, s.start + 1); i <= Math.min(to, s.end); i++) if (!onsetDays.has(i)) carried.add(i);
      if (carried.size > before) carriedBouts += 1;
    }
    return { episodes: b.count, days: days.size, carriedDays: carried.size, carriedBouts, carriedIn: b.carriedIn };
  };
  // `ceil`, the bars' own rule (`signalWeekCount`): a lookback that is not whole weeks still
  // counts every bar its days fall in, so the sentence never leaves the oldest bar out. The
  // engine pins chronicity at 56 and the pair at 7, where the two agree.
  const lookbackWeeks = Math.max(1, Math.min(n, Math.ceil(finding.windowDays / 7)));
  const lookback = weekly.weeks.slice(n - lookbackWeeks);
  const from = indexOf(lookback[0].startKey);
  // The newest bout in the lookback, by onset. Bouts never overlap in time, so the newest onset
  // is also the latest last row; two bouts on one day take the later end.
  let newest: { start: number; end: number } | null = null;
  for (const s of spans) {
    if (s.start < from || s.start > todayIdx) continue;
    if (newest == null || s.start > newest.start || (s.start === newest.start && s.end > newest.end)) newest = s;
  }
  return {
    recent: windowOf(n - 1),
    prior: n >= 2 ? windowOf(n - 2) : null,
    lookbackWeeks,
    activeWeeks: lookback.filter((b) => b.count > 0).length,
    carriedWeeks: lookback.filter((b) => b.count === 0 && b.carriedIn).length,
    lookbackEpisodes: lookback.reduce((a, b) => a + b.count, 0),
    daysSinceLast: newest == null ? null : todayIdx - newest.start,
    lastRanTo: newest == null || newest.end <= newest.start ? null : todayIdx - newest.end,
  };
}

/**
 * Whether the screen may state the chart's numbers in place of the engine's (the escalate-only
 * gate; the adversarial pass on CUL-1568). A recount can come out LOWER than the engine's count:
 * an episode aged out of the rolling window since the engine ran, the engine's instant window
 * reaching a few hours further back than the local bar, or a phone whose record has not
 * finished arriving (a new install, a second household device — a read that has not answered
 * is not an empty record, C-12). Stated, any of those leads a firing safety card with a zero
 * ("on 0 of the last 7 days … worth booking a vet visit") or prints a calmer pair than the one
 * that fired. So a recount speaks only where every number it states is at least the engine's
 * for the same claim — new logs may raise it, nothing may lower it (n=1 never reassures; an
 * escalation is never quieted by a recount). Otherwise the engine's sentence stands, dated.
 *
 * `maskTouched` is true when a masking span (a drug that can hide the sign, a recent visit;
 * CUL-1440) touches any window the composed sentence would name: the engine's sentence is
 * then the one `findingMaskVerdict` has already judged, and a local zero or fall beside the
 * drug's caption is never minted here.
 */
export function countsMayCompose(
  finding: CountedFinding,
  c: SignalCounts,
  context: {
    maskTouched: boolean;
    /** Local days since the engine counted (today − the cache row's day), 0 when unknown —
     *  the most a "most recent" may have aged honestly since then. */
    elapsedDays: number;
  },
): boolean {
  if (context.maskTouched) return false;
  // CUL-989: over an incomplete read the engine states every count as a floor ("at least N")
  // and drops its week-over-week clause; a floor finding keeps the engine's words. The worsening
  // and chronicity mirrors carry the field (CUL-1575); the reflection mirror does not, so the
  // payload is read for the marker directly.
  if ((finding as { countIsFloor?: unknown }).countIsFloor === true) return false;
  switch (finding.type) {
    case 'symptom_chronicity': {
      // The newest episode may be no staler than the engine's newest, aged by the days since it
      // counted: a phone holding older backfill but not another device's latest log would
      // otherwise print "the most recent 20 days ago" under a course that is still going.
      const freshEnough =
        c.daysSinceLast != null && c.daysSinceLast <= finding.daysSinceLastEpisode + Math.max(0, Math.floor(context.elapsedDays));
      return c.activeWeeks >= finding.activeWeeks && c.lookbackEpisodes >= finding.episodeCount && c.lookbackEpisodes > 0 && freshEnough;
    }
    case 'symptom_worsening':
      return c.recent.episodes >= finding.currentCount && c.recent.days >= finding.currentDays && c.recent.episodes > 0;
    case 'reflection':
      // A rise is not a reflection's to state: the engine routes a rise to a worsening, with an
      // ask; drawn in the insight register it would read a tripled count as a calm note.
      return c.recent.episodes >= finding.currentCount && (c.prior == null || c.recent.episodes <= c.prior.episodes);
  }
}

/** The first day any window the composed sentence names begins on: the lookback for
 *  chronicity, the earlier of the two blocks for the pair. The caller asks masking from here
 *  to today. */
export function composedWindowStart(finding: CountedFinding, weekly: WeeklyBucketsModel): string {
  const n = weekly.weeks.length;
  if (finding.type === 'symptom_chronicity') {
    const weeks = Math.max(1, Math.min(n, Math.ceil(finding.windowDays / 7)));
    return weekly.weeks[n - weeks].startKey;
  }
  return weekly.weeks[Math.max(0, n - 2)].startKey;
}

/**
 * The finding the safety phone script reads when the sentence is composed (CUL-1568): the same
 * numbers, so the script an owner reads aloud never contradicts the sentence above it. The
 * chronicity halves (`compare`) are the engine's instant windows, a second population on one
 * screen, so a composed script carries none (CUL-1570 kept it out by ruling: the bars beneath
 * draw every week the sentence counts). `withholdPrior` is true when the sentence left the earlier window out (a fall
 * under a safety card, a zero, a withheld pair): the script then drops its "Week before" row too.
 */
export function countedScriptFinding(finding: CountedFinding, c: SignalCounts): CountedFinding {
  switch (finding.type) {
    case 'symptom_chronicity':
      return {
        ...finding,
        episodeCount: c.lookbackEpisodes,
        activeWeeks: c.activeWeeks,
        windowDays: c.lookbackWeeks * 7,
        // The script's "Most recent" is the newest day holding a row (CUL-1956, the adversarial
        // pass): read aloud to a vet, a bout that began yesterday and is still logged today is
        // "today", never yesterday. The sentence says both ends; the script has one slot.
        daysSinceLastEpisode: c.lastRanTo ?? c.daysSinceLast ?? finding.daysSinceLastEpisode,
        compare: undefined,
      };
    case 'symptom_worsening':
      return {
        ...finding,
        currentCount: c.recent.episodes,
        // Every day in the last 7 holding a row, the days a bout ran on into included: the script
        // has no room for the sentence's disclosure, so it reads the louder total, the sentence's
        // "on N … ; a bout ran on into K more" summed (CUL-1956, the adversarial pass). The
        // earlier window stays onsets: a lower earlier count only steepens the rise.
        currentDays: c.recent.days + c.recent.carriedDays,
        priorCount: c.prior?.episodes ?? 0,
        priorDays: c.prior?.days ?? 0,
        windowDays: 7,
      };
    case 'reflection':
      return finding;
  }
}

/** True when the composed sentence states the earlier window (the script follows it). */
export function countedPriorStated(finding: CountedFinding, c: SignalCounts, withheld: boolean): boolean {
  if (finding.type === 'symptom_chronicity') return false;
  const safety = finding.priorityClass === 'safety';
  if (finding.type === 'symptom_worsening' && worseningPriorAxis(finding) === 'days') {
    return priorMayPrint(c.recent.days, c.prior?.days ?? null, finding.priorDays, safety, withheld);
  }
  return priorMayPrint(c.recent.episodes, c.prior?.episodes ?? null, finding.priorCount, safety, withheld);
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
 * ", the most recent yesterday" — or, where that bout ran past midnight, the day its last row
 * fell on too (CUL-1957): a bout that began yesterday and is still being logged today is never
 * dated only yesterday. "Ran into", never "continues": the bout may have ended (Q12, R2).
 */
function mostRecentClause(c: SignalCounts): string {
  if (c.daysSinceLast == null) return '';
  const began = recencyPhrase(c.daysSinceLast);
  if (c.lastRanTo == null) return `, the most recent ${began}`;
  const ran = c.lastRanTo <= 1 ? recencyPhrase(c.lastRanTo) : c.daysSinceLast - c.lastRanTo === 1 ? 'the next day' : `${recencyPhrase(c.lastRanTo)}`;
  return `, the most recent began ${began} and ran into ${ran}`;
}

/** "A bout that began earlier also ran into another of those weeks." — the weeks with vomiting
 *  that "N of the last 8 weeks" leaves out (CUL-1957). Empty when there are none. */
function carriedWeeksPhrase(c: SignalCounts): string | null {
  if (c.carriedWeeks <= 0) return null;
  return c.carriedWeeks === 1
    ? 'a bout that began earlier also ran into another of those weeks'
    : `bouts that began earlier also ran into ${c.carriedWeeks} more of those weeks`;
}

/** The recent window's carry, on the axis the sentence states (CUL-1957, Q12): on DAYS, the days
 *  a bout ran on into ("a bout ran on into 1 more day"); on EPISODES, a bout from before the
 *  window that ran into it. Null when the stated count leaves nothing out. */
function recentCarryPhrase(w: WindowCount, axis: 'days' | 'episodes'): string | null {
  if (axis === 'days' && w.carriedDays > 0) {
    return `${w.carriedBouts > 1 ? 'bouts' : 'a bout'} ran on into ${count(w.carriedDays, 'more day', 'more days')}`;
  }
  if (w.carriedIn) return 'a bout from earlier ran into them';
  return null;
}

/**
 * The earlier window may be stated beside the recent one only when it is not a fall the
 * reader may not see: never under a safety finding (GC-3: a worsening is never drawn as a
 * fall), and under an insight only when the shipped withhold rules let the pair print. A
 * zero earlier week is never paired either — 0 → N is the New chip's fact, not a trend
 * (B-727). And never above the ENGINE's earlier count for the same axis (the second
 * adversarial pass): a prior that grew since the engine counted — a days-old cache whose
 * week is now the local "7 before", backfill, a second device's sync — would flatten a
 * worsening ("4, and 4 before" under a 4-vs-1 card) or steepen a reflection's fall. Every
 * stated number is at least as alarming as the engine's, or it is not stated.
 */
function priorMayPrint(recent: number, prior: number | null, enginePrior: number, safety: boolean, withheld: boolean): prior is number {
  if (prior == null || prior === 0 || withheld || prior > enginePrior) return false;
  // Under a safety card the pair is stated only while it still RISES (the third pass): a flat
  // "5, and 5 before" under a worsening reads calmer than the engine's "up from".
  return safety ? prior < recent : true;
}

/**
 * The axis a worsening's earlier window is stated on: the axis that ROSE, as the engine's own
 * sentence and the phone script choose it (`templateWorsening`, `phoneScriptFacts`) — by the
 * TRIGGER, never the tier. A firm card that fired on more episodes over flat days compares
 * episodes; stating its flat days ("on 5, and on 5 before") would read calmer than the card
 * and contradict the script beside it (the third adversarial pass).
 */
function worseningPriorAxis(finding: SymptomWorseningFinding): 'days' | 'episodes' {
  // The engine pairs `standard` with `more_episodes` only (`resolveWorseningTier`); a standard
  // sentence leads with episodes, so its pair stays on episodes whatever a payload says.
  return finding.tier !== 'standard' && finding.trigger === 'more_days' ? 'days' : 'episodes';
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
      const weeks = carriedWeeksPhrase(c);
      return (
        `We've logged ${symptom} for ${petName} in ${c.activeWeeks} of the last ${c.lookbackWeeks} weeks — ` +
        `${count(c.lookbackEpisodes, 'episode', 'episodes')} in those weeks${mostRecentClause(c)}. ` +
        (weeks ? `${capitalize(weeks)}. ` : '') +
        `A symptom that keeps recurring over weeks is ${ask}.${adjacencyClause(finding)} This is a read of your logs, not a diagnosis.`
      );
    }
    case 'symptom_worsening': {
      const ask = worseningAsk(finding.tier);
      if (finding.tier === 'firm' || finding.tier === 'soft') {
        // The lead is the day density (the tier's axis); the earlier window is stated on the
        // axis that rose (the trigger's).
        const pd = c.prior?.days ?? null;
        const pe = c.prior?.episodes ?? null;
        const prior =
          worseningPriorAxis(finding) === 'days'
            ? priorMayPrint(c.recent.days, pd, finding.priorDays, safety, withheld)
              ? `, and on ${pd} of the 7 before`
              : ''
            : priorMayPrint(c.recent.episodes, pe, finding.priorCount, safety, withheld)
              ? `, and ${count(pe as number, 'episode', 'episodes')} in the 7 before`
              : '';
        const carry = recentCarryPhrase(c.recent, 'days');
        return (
          `${petName} has had ${symptom} on ${c.recent.days} of the last 7 days ` +
          `(${count(c.recent.episodes, 'episode', 'episodes')}${carry ? `; ${carry}` : ''})${prior} — ${ask}.`
        );
      }
      const p = c.prior?.episodes ?? null;
      const prior = priorMayPrint(c.recent.episodes, p, finding.priorCount, safety, withheld) ? `, and ${p} in the 7 before` : '';
      const carry = recentCarryPhrase(c.recent, 'episodes');
      return `${petName} has had ${count(c.recent.episodes, 'episode', 'episodes')} of ${symptom} in the last 7 days${carry ? ` (${carry})` : ''}${prior} — ${ask}.`;
    }
    case 'reflection': {
      const p = c.prior?.episodes ?? null;
      const prior = priorMayPrint(c.recent.episodes, p, finding.priorCount, safety, withheld) ? `, and ${p} in the 7 before` : '';
      const carry = recentCarryPhrase(c.recent, 'episodes');
      return (
        `We've logged ${count(c.recent.episodes, 'episode', 'episodes')} of ${symptom} for ${petName} in the last 7 days${carry ? ` (${carry})` : ''}${prior}. ` +
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

/**
 * Under the engine's sentence on a counted type (the gate said no): when that sentence was
 * counted, and that the bars beneath count the record as it is now — the two may differ, and
 * the reader is told which is which rather than left to reconcile them (C-37).
 */
export function engineCountedAtLine(generatedAtMs: number | null, nowMs: number): string {
  const tail = 'The bars below count what is logged now.';
  if (generatedAtMs == null || !Number.isFinite(generatedAtMs)) return `This was counted when it was raised. ${tail}`;
  const d = new Date(generatedAtMs);
  const day = toLocalDayKey(d);
  const when = day === toLocalDayKey(new Date(nowMs)) ? `today at ${formatTime(d)}` : `${formatCalendarDate(day) ?? day} at ${formatTime(d)}`;
  return `This was counted when it was raised, ${when}. ${tail}`;
}

/**
 * Home's row count line for a composed finding (CUL-1569): the screen's numbers, in the
 * sentence's own fragments, so the door and the screen it opens state one count. Every number
 * here is one `countedSentence` states from the same `SignalCounts`, and the earlier window
 * appears only where the sentence stated it (`priorStated`, the screen's own verdict), so a row
 * can never print a fall, a zero or a pair its screen held back. Null when the headline
 * (`countedTitle`) already carries every number the row has.
 */
export function countedHomeCount(finding: CountedFinding, c: SignalCounts, priorStated: boolean): string | null {
  switch (finding.type) {
    case 'symptom_chronicity': {
      const weeks = carriedWeeksPhrase(c);
      return `${count(c.lookbackEpisodes, 'episode', 'episodes')} in those weeks${weeks ? `; ${weeks}` : ''}`;
    }
    case 'symptom_worsening': {
      if (finding.tier === 'firm' || finding.tier === 'soft') {
        const carry = recentCarryPhrase(c.recent, 'days');
        const episodes = `${count(c.recent.episodes, 'episode', 'episodes')}${carry ? `; ${carry}` : ''}`;
        if (!priorStated || c.prior == null) return episodes;
        return worseningPriorAxis(finding) === 'days'
          ? `${episodes}, and on ${c.prior.days} of the 7 before`
          : `${episodes}, and ${count(c.prior.episodes, 'episode', 'episodes')} in the 7 before`;
      }
      // The headline carries the recent count; the row adds what the sentence says beside it,
      // the carry in the card's week-line words (PR-23), since the row has no "them" to point at.
      const carry = c.recent.carriedIn ? 'A bout from earlier ran into the last 7 days' : null;
      const prior = priorStated && c.prior != null ? `${c.prior.episodes} in the 7 before` : null;
      return carry && prior ? `${carry} · ${prior}` : (carry ?? prior);
    }
    case 'reflection': {
      const carry = recentCarryPhrase(c.recent, 'episodes');
      const recent = `${c.recent.episodes} in the last 7 days${carry ? ` (${carry})` : ''}`;
      return priorStated && c.prior != null ? `${recent}, ${c.prior.episodes} in the 7 before` : recent;
    }
  }
}

/** The reflection row's drawn pair over the same counts, in the sentence's order and words;
 *  null where the sentence did not state the earlier window (S2: never a lone bar). */
export function countedHomePair(c: SignalCounts, priorStated: boolean): { recent: number; prior: number } | null {
  return priorStated && c.prior != null ? { recent: c.recent.episodes, prior: c.prior.episodes } : null;
}
