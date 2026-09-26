// The Signal's title (Design v2 — the whole day, D2-3 · CUL-1065; the claim rule is D2 on
// CUL-1270, design authority `docs/culprit-design-v2-device-mockups.html` §02).
//
// The title NAMES THE FINDING'S CLAIM, and never verdicts. D2-3 first built it as "the thing
// and the window" ("Vomiting, the last 8 weeks"); on device the PM met two vomiting findings
// whose screens differed only in that window ("the last 8 weeks", "the last 60 days") and
// read them as one screen twice. So the title now says what THIS finding asserts —
// "Vomiting in 5 of the last 8 weeks", "Vomiting soon after meals" — and the same string is
// the Signal row's headline on Home (`lib/signalHomeLine.ts`), so a tap lands on a screen
// with the name the owner tapped.
//
// A title that carries a count takes it from the fields the server's sentence is composed
// from, in the sentence's own form (`generate-signal/phrasing.ts`), so the title can never
// state a number the sentence under it does not: `signalHomeLine.test.ts` renders the
// server template and checks every number. No direction word, no glyph, no percentage, no
// "better" or "worse" — the list below is what `signalTitle.test.ts` greps every title
// against, across every finding type, every symptom word and both trial states.
//
// A frequency comparison (`reflection`) keeps a count-free claim, "Vomiting, week over
// week": its lead card prints the weekly bars' own line under the title, and a rolling-week
// count in the title over a calendar-week line would put two "this week" numbers one line
// apart (CUL-1217 BRK-3). The ask stays out of the title (S1: a title that shouted would be
// the opposite of plain); it is the Home row's second line and the sentence's.

import type { SignalFinding } from './signal';
import { incidentFlagPhrase, localHourBand, stripNameLine, symptomWord } from './signalCopy';
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

function symptomThing(symptomType: Parameters<typeof symptomWord>[0]): string {
  return capitalize(symptomWord(symptomType));
}

/**
 * The title for one finding: its claim.
 *
 *   Vomiting in 5 of the last 8 weeks            (recurrence — the chronicity finding)
 *   Vomiting on 5 of the last 14 days            (a dense worsening; the sentence's own days)
 *   Vomiting soon after meals                    (postprandial timing)
 *   Vomiting after chicken                       (a correlation names its pairing, a sequence)
 *   Vomiting, week over week                     (the frequency comparison — no count, see above)
 *   Rabbit trial, day 55 of 56                   (the trial card itself)
 *   Possible blood in a vomit photo              (the photo read, in the sentence's words)
 *
 * `trial` is read only by the trial card: every other claim is the same claim on a trial
 * day, and the trial's own day lives on the trial strip.
 */
export function signalTitle(finding: SignalFinding, trial: SignalTrialWindow | null): string {
  switch (finding.type) {
    case 'symptom_chronicity':
      // templateChronicity: "across {activeWeeks} of the last {round(windowDays / 7)} weeks".
      return `${symptomThing(finding.symptomType)} in ${finding.activeWeeks} of the last ${Math.round(finding.windowDays / 7)} weeks`;
    case 'symptom_worsening': {
      // templateWorsening's three tiers, each on the axis its sentence leads with.
      const thing = symptomThing(finding.symptomType);
      if (finding.tier === 'firm') return `${thing} on ${finding.currentDays} of the last ${finding.windowDays} days`;
      if (finding.tier === 'soft') return `${thing} on ${finding.currentDays} separate days this week`;
      return `${thing}, ${finding.currentCount} ${finding.currentCount === 1 ? 'episode' : 'episodes'} this week`;
    }
    case 'reflection':
      return `${symptomThing(finding.symptomType)}, week over week`;
    case 'postprandial_timing':
      return `${symptomThing(finding.symptomType)} soon after meals`;
    case 'empty_stomach_timing':
      return `${symptomThing(finding.symptomType)} long after meals`;
    case 'timing_story':
      return `${symptomThing(finding.symptomType)} soon or long after meals`;
    case 'timeofday_clustering':
      return `${symptomThing(finding.symptomType)} ${localHourBand(finding.clusterStartLocalHour, finding.clusterWindowHours)}`;
    case 'food_symptom_correlation':
      // The pairing is the claim: a sequence observed ("after"), never an attribution. A
      // joint candidate names every member (the label already does). The early tier says it
      // is early IN the title, which every surface naming the finding prints (adversarial pass).
      return `${symptomThing(finding.symptomType)} after ${finding.protein}${finding.tier === 'early' ? ', an early pattern' : ''}`;
    case 'stood_down':
      // Not a card and never a door: it keeps D2-3's thing-and-window form.
      return `${symptomThing(finding.symptomType)}, ${trial ? trialPhrase(trial) : windowPhrase(signalWindowDays(finding))}`;
    case 'trial_response': {
      // The trial IS the thing. The cache carries its own day count, so the title holds
      // without the local trial read; with it, the identity names the protein.
      const identity = trial ? trial.identity : 'Diet trial';
      const day = trial ? trial.dayCounter : finding.trialDayNumber;
      const target = trial ? trial.targetDays : finding.targetDurationDays;
      return target != null && target > 0 ? `${identity}, day ${day} of ${target}` : `${identity}, day ${day}`;
    }
    case 'incident_red_flag':
      // templateIncidentRedFlag's own phrase ("possible blood", "possible foreign material")
      // — "possible" keeps it an unconfirmed read — and its family noun, never a consistency
      // the photo did not measure.
      return `${capitalize(incidentFlagPhrase(finding.flags))} in ${finding.flaggedIncidentCount === 1 ? `a ${finding.incidentType} photo` : `${finding.incidentType} photos`}`;
    case 'intake_decline':
      // The shipped name, a fact about the record.
      return stripNameLine(finding) ?? 'Signal';
    default:
      return 'Signal';
  }
}
