// The Signal's title (Design v2 — the whole day, D2-3 · CUL-1065; design authority
// `docs/culprit-design-v4-mockups.html` §01 / §03: "Vomiting, day 55 of the rabbit trial").
//
// The title names THE THING and THE WINDOW, and never verdicts. On the card it takes the
// place the count-anchored sentence held (the sentence moves to the screen — the Change
// Contract v1.1's Tier-2 edit is written in D2-8), so it is read more often than any
// other Signal string and carries the least: a symptom word, a window, and on a trial
// the trial's identity and its day. No direction word, no glyph, no percentage, no
// "better" or "worse" — the list below is what `signalTitle.test.ts` greps every title
// against, across every finding type, every symptom word and both trial states.
//
// The safety types keep the shipped strip's NAME (fold spec §4) where that name is a fact
// about the record ("Eating less than usual", "Blood in a vomit photo"); the one strip
// name that carries a direction word — `symptom_worsening`'s "up this week" — is not used
// here, because "up" is on the list. The ask stays in the sentence, where it has always
// lived (S1: plainness is the severity signal, and a title that shouted would be the
// opposite of plain).

import type { SignalFinding } from './signal';
import { stripNameLine, symptomWord } from './signalCopy';
import type { SignalTrialWindow } from './signalWindows';
import { signalWindowDays } from './signalWindows';

/**
 * The words a title may never carry — the Change Contract's residual vetoes (spec §3.5)
 * plus the fold spec's standing list, as whole words. `signalTitle.test.ts` walks every
 * title through this list; a new type or a new word joins BOTH.
 */
export const TITLE_VERDICT_WORDS: readonly string[] = [
  'down',
  'up',
  'better',
  'worse',
  'worsening',
  'improving',
  'improved',
  'fewer',
  'more',
  'quieter',
  'calmer',
  'resolved',
  'cleared',
  'clear',
  'settled',
  'normal',
  'fine',
  'good',
  'bad',
  'rising',
  'falling',
  'spike',
  'done',
  'complete',
];

const VERDICT_RE = new RegExp(`\\b(?:${TITLE_VERDICT_WORDS.join('|')})\\b|[↑↓→←➘➚➔⬆⬇%]`, 'i');

/** True when a string carries a word the title may not — the test's predicate, exported
 *  so the screen's copy tests can hold their own strings to the same list. */
export function hasTitleVerdictWord(text: string): boolean {
  return VERDICT_RE.test(text);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/** "the last 8 weeks" / "the last 10 days" — whole weeks when the lookback divides. */
function windowPhrase(days: number): string {
  if (days % 7 === 0) {
    const w = days / 7;
    return `the last ${w} ${w === 1 ? 'week' : 'weeks'}`;
  }
  return `the last ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "day 55 of the rabbit trial" — the trial's identity lower-cased into the sentence.
 *  Never "done" or "complete" at day N ≥ M: reaching the target renders no completion
 *  language (the medication-duration rule D7, applied to the trial — the mock's §01). */
function trialPhrase(trial: SignalTrialWindow): string {
  return `day ${trial.dayCounter} of the ${lowerFirst(trial.identity)}`;
}

/**
 * The title for one finding, on a day with or without a running trial.
 *
 *   Vomiting, day 55 of the rabbit trial       (a symptom finding, trial running)
 *   Vomiting, the last 8 weeks                  (a symptom finding, no trial)
 *   Vomiting after chicken, the last 8 weeks    (a correlation names its pairing)
 *   Rabbit trial, day 55 of 56                  (the trial card itself)
 *   Eating less than usual · Blood in a vomit photo   (the safety types keep their name)
 */
export function signalTitle(finding: SignalFinding, trial: SignalTrialWindow | null): string {
  switch (finding.type) {
    case 'symptom_chronicity':
    case 'symptom_worsening':
    case 'reflection':
    case 'postprandial_timing':
    case 'empty_stomach_timing':
    case 'timing_story':
    case 'timeofday_clustering':
    case 'stood_down': {
      const thing = capitalize(symptomWord(finding.symptomType));
      return `${thing}, ${trial ? trialPhrase(trial) : windowPhrase(signalWindowDays(finding))}`;
    }
    case 'food_symptom_correlation': {
      // The pairing is the thing: a sequence observed ("after"), never an attribution.
      const thing = `${capitalize(symptomWord(finding.symptomType))} after ${finding.protein}`;
      return `${thing}, ${trial ? trialPhrase(trial) : windowPhrase(signalWindowDays(finding))}`;
    }
    case 'trial_response': {
      // The trial IS the thing. The cache carries its own day count, so the title holds
      // without the local trial read; with it, the identity names the protein.
      const identity = trial ? trial.identity : 'Diet trial';
      const day = trial ? trial.dayCounter : finding.trialDayNumber;
      const target = trial ? trial.targetDays : finding.targetDurationDays;
      return target != null && target > 0 ? `${identity}, day ${day} of ${target}` : `${identity}, day ${day}`;
    }
    case 'intake_decline':
    case 'incident_red_flag':
      // The shipped name, a fact about the record; the ask is the sentence's.
      return stripNameLine(finding) ?? 'Signal';
    default:
      return 'Signal';
  }
}
