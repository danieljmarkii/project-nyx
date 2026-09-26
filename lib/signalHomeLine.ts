// The Signal row on Home (Design v2, CUL-1270 · D1 = B; design authority
// `docs/culprit-design-v2-device-mockups.html` §01).
//
// Every Signal card on Home is a headline, the ask, and a door to the finding's own screen.
// The reading — the sentence, the receipts, "not a diagnosis" — moved to the screen; the
// zone states the disclaimer once, at its foot. This module composes the row's words.
//
// ONE SOURCE PER NUMBER. Every line here is composed from the finding's structured fields —
// the SAME fields the server's sentence is composed from (`generate-signal/phrasing.ts`) —
// and never by cutting or splitting `cached.text`. A truncated sentence is a different
// sentence (the ask is the first thing a length cap drops, C-28), and a split one ties Home
// to whatever the model phrased. Composed from the fields, the row and the screen count from
// one source: `signalHomeLine.test.ts` renders the server template for every finding it
// builds and asserts that every number on the row appears in it, and that the ask is the
// sentence's own words.
//
// THE ASK STAYS ON HOME, IN WORDS (clinical-guardrails; S1). A safety row always carries
// its ask — the server's own vet phrase, verbatim, never the strip's compressed verb — and
// the folded row keeps it too. Benign rows carry none (the PM's ruling on CUL-1270, build
// call ii): an ask on a benign row would be the escalation S1 reserves for the safety lane,
// and the timing card's "worth mentioning to your vet" lives on its screen.
//
// The headline IS `signalTitle` — the screen's title — so the owner lands on the screen
// they tapped, by name.

import type { SignalFinding } from './signal';
import { onsetMonth, stripDayUTC } from './signalCopy';
import { signalTitle } from './signalTitle';
import type { SignalTrialWindow } from './signalWindows';

export interface SignalHomeLine {
  /** A small line above the headline — the photo read's date. Null on every other type. */
  eyebrow: string | null;
  /** The finding's claim — `signalTitle`, the same string the screen's title prints. */
  headline: string;
  /** The count that backs the claim, in the sentence's own numbers. Null when the headline
   *  already carries every number the finding states. */
  count: string | null;
  /** The ask, lower-case and verbatim from the sentence ("worth a call to your vet"). Safety
   *  rows only; null on every benign row. The renderer capitalises it when it stands alone. */
  ask: string | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The phrasing module's `numWord` — intake's sentence spells small day counts out. */
function numWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][n] ?? String(n);
}

/**
 * The ask, verbatim from each template's own vet clause. The server strings, for the
 * reviewer (and the parity test proves each is a substring of the rendered sentence):
 *   chronicity   firm "worth booking a vet visit" · else "worth a word with your vet"
 *   worsening    firm "worth booking a vet visit soon" · soft "worth keeping an eye on, and a
 *                word with your vet if it carries on" · standard "worth a word with your vet"
 *   intake       "worth keeping an eye on, and a word with your vet if it carries on" (both)
 * The conditional asks keep their lead-in: cut to "a word with your vet if it carries on"
 * they read as a fragment with no verb (pm-feature-review).
 *   red flag     "worth a call to your vet"
 */
export function signalHomeAsk(finding: SignalFinding): string | null {
  switch (finding.type) {
    case 'symptom_chronicity':
      return finding.tier === 'firm' ? 'worth booking a vet visit' : 'worth a word with your vet';
    case 'symptom_worsening':
      return finding.tier === 'firm'
        ? 'worth booking a vet visit soon'
        : finding.tier === 'soft'
          ? 'worth keeping an eye on, and a word with your vet if it carries on'
          : 'worth a word with your vet';
    case 'intake_decline':
      return 'worth keeping an eye on, and a word with your vet if it carries on';
    case 'incident_red_flag':
      return 'worth a call to your vet';
    default:
      return null;
  }
}

function countLine(finding: SignalFinding): string | null {
  switch (finding.type) {
    case 'symptom_chronicity':
      // "— 14 episodes since August" (the onset month is UTC, the engine's day-bucketing).
      return `${plural(finding.episodeCount, 'episode', 'episodes')} since ${onsetMonth(finding.firstOnsetIso)}`;
    case 'symptom_worsening':
      // The other half of the time-ordered pair, on the axis the headline counted (S5: both
      // counts, never a direction word). The headline holds this week's number.
      if (finding.tier === 'firm' && finding.trigger === 'more_days') {
        return `${plural(finding.priorDays, 'day', 'days')} the week before`;
      }
      if (finding.tier === 'firm') {
        // The headline counted "the last 7 days", so the prior is "the week before" — never
        // "last week", which an owner reads as the same seven days (pm-feature-review).
        const prior = finding.priorCount === 0 ? 'none the week before' : `${finding.priorCount} the week before`;
        return `${plural(finding.currentCount, 'episode', 'episodes')}, ${prior}`;
      }
      if (finding.tier === 'soft') return `${plural(finding.priorDays, 'day', 'days')} last week`;
      return finding.priorCount === 0 ? 'None last week' : `${finding.priorCount} last week`;
    case 'reflection': {
      // The density gate (SR-4): a falling week logged more thinly withholds the prior count,
      // exactly as the sentence does — never a reassuring fall minted from a quieter log.
      // A flat week says what its sentence says ("about the same as last week") rather than
      // printing a prior count the screen's sentence never states.
      if (finding.direction === 'flat') return `${finding.currentCount} this week, about the same as last week`;
      const withheld = finding.density?.comparable === false;
      return withheld ? `${finding.currentCount} this week` : `${finding.currentCount} this week, ${finding.priorCount} last week`;
    }
    case 'postprandial_timing':
      return `${finding.rapidCount} of ${finding.eligibleCount} timed episodes within ${finding.rapidWindowMinutes} min of eating`;
    case 'empty_stomach_timing':
      return `${finding.longCount} of ${finding.eligibleCount} timed episodes, at least ${finding.longGapHours} hours after eating`;
    case 'timeofday_clustering':
      return `${finding.clusterCount} of ${finding.eligibleCount} timed episodes`;
    case 'timing_story':
      // The one count line the sentence does not carry: the story's sentence names the shape
      // and deliberately leaves the band counts to the receipt (S10), so the row states the
      // receipt's own counts — the same fields the screen's face draws.
      return `${finding.bandCounts.rapid} soon after eating, ${finding.bandCounts.mid} in between, ${finding.bandCounts.long} long after, of ${finding.eligibleCount} timed`;
    case 'food_symptom_correlation':
      // "Seen after", a sequence observed, on the row as in the title: the sentence's own
      // hedge ("has tended to follow") is on the screen, and a bare count under "after
      // chicken" would read as the cause (pm-feature-review; the council's swap-the-treats
      // risk). "Matched days" is the engine's word, not the owner's.
      return finding.tier === 'established'
        ? `Seen after meals with ${finding.protein} on ${finding.matchedPairs} days of logs`
        : `Within about ${Math.round(finding.correlationWindowHours)} hours of ${finding.protein}, an early pattern`;
    case 'trial_response': {
      // The sentence's B-775 guard, kept: the baseline is a fixed 49 days and the trial era
      // grows, so on a young trial a falling pair over-states the fall — always in the
      // reassuring direction. The same 1.5× presentation threshold, the same words. And the
      // noun: the lane counts vomiting only, so the row says so.
      const longer = finding.baselineWindowDays >= finding.trialDayNumber * 1.5 ? ', a longer stretch' : '';
      return `${plural(finding.pooledTrialCount, 'episode', 'episodes')} of vomiting in the trial, ${finding.pooledBaselineCount} in the ${finding.baselineWindowDays} days before${longer}`;
    }
    case 'intake_decline':
      // The sentence's own time anchor ("just turned down …"), with the food it names — said
      // without "down", a word the row's verdict screen reads as a direction.
      if (finding.trigger === 'refused_normal_food') return finding.refusedFoodLabel ? `${finding.refusedFoodLabel}, just now` : 'Just now';
      return finding.daysBelowBaseline <= 1 ? 'Today' : `The last ${numWord(finding.daysBelowBaseline)} days`;
    case 'incident_red_flag':
      // The headline and the eyebrow carry it: the phrase, the family and the date.
      return null;
    default:
      return null;
  }
}

function eyebrow(finding: SignalFinding): string | null {
  if (finding.type !== 'incident_red_flag') return null;
  // The photo record's own day, UTC like the sentence ("on September 22") and the phone
  // script — never a local day that could disagree with the screen by one.
  const day = stripDayUTC(finding.mostRecentFlaggedIso);
  if (!day) return finding.flaggedIncidentCount === 1 ? 'Photo read' : 'Photo reads';
  return finding.flaggedIncidentCount === 1 ? `Photo read · ${day.short}` : `Photo reads · latest ${day.short}`;
}

/**
 * The row's words for one finding. Null for a finding that is not a row (the stand-down
 * marker keeps its own line), so a caller can never draw a blank door.
 */
export function signalHomeLine(finding: SignalFinding, trial: SignalTrialWindow | null = null): SignalHomeLine | null {
  if (finding.type === 'stood_down') return null;
  const headline = signalTitle(finding, trial);
  if (headline === 'Signal') return null;
  return {
    eyebrow: eyebrow(finding),
    headline,
    count: countLine(finding),
    ask: finding.priorityClass === 'safety' ? signalHomeAsk(finding) : null,
  };
}

/** "Worth a call to your vet" — the ask standing on its own line. */
export function askStandalone(ask: string): string {
  return ask.length === 0 ? ask : ask[0].toUpperCase() + ask.slice(1);
}

/**
 * The row's spoken label — one sentence per line, the eyebrow's middle dot said as a
 * comma (VoiceOver reads "·" as nothing), and the ask always in it. A folded row speaks
 * its headline, its date when it keeps one, and its ask: the ask is never behind a tap,
 * for a sighted owner or not.
 */
export function signalHomeLabel(line: SignalHomeLine, folded: boolean, foldedDateSpoken: string | null = null): string {
  const parts: string[] = [];
  if (line.eyebrow) parts.push(line.eyebrow.replace(' · ', ', '));
  parts.push(line.headline);
  if (!folded && line.count) parts.push(line.count);
  if (folded && foldedDateSpoken) parts.push(`Last episode ${foldedDateSpoken}`);
  if (line.ask) parts.push(askStandalone(line.ask));
  return `${parts.join('. ')}.`;
}
