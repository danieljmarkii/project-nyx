// AI Signal — pure owner-facing copy + display-state logic (B-045 Step 3).
//
// The home Signal card body, confidence tag, sample line, and tap-to-expand
// evidence are derived HERE from the structured finding (not from the model). The
// main card sentence (`CachedFinding.text`) is produced server-side by the
// phrasing layer; everything on this surface that the client composes around it
// lives in this module so it is unit-testable and held to one voice.
//
// Voice rules: nyx-voice skill (first-person pet / second-person owner, plain
// language not jargon, specific over generic, no exclamation marks). Clinical
// rule: clinical-guardrails — a safety finding (intake-decline) is surfaced
// clearly and points to the vet; it NEVER reassures and is NEVER softened into
// "picky". These strings are hand-written guardrail-clean (they are not passed
// through the server's validatePhrasing).

import type {
  CachedFinding,
  CoverageDiagnostic,
  SignalFinding,
  SignalSymptomType,
} from './signal';

export type DisplayState = 'building' | 'no_pattern' | 'stale' | 'live';

// Owner-facing symptom words (nyx-voice Pattern 5 — plain language, never the
// stored enum). Mirrors SYMPTOM_LABEL in the generate-signal phrasing module.
const SYMPTOM_LABEL: Record<SignalSymptomType, string> = {
  vomit: 'vomiting',
  diarrhea: 'loose stool',
  itch: 'itching',
  scratch: 'scratching',
  skin_reaction: 'skin irritation',
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Plain 12-hour clock label for a local hour 0..23 (⑥, B-079): 0→'12am', 4→'4am',
// 12→'12pm', 23→'11pm'. Mirror of clockHourLabel in the generate-signal phrasing module —
// keep the two in sync (the client can't import the Deno detection/phrasing code).
function clockHourLabel(hour: number): string {
  const norm = ((Math.round(hour) % 24) + 24) % 24;
  const period = norm < 12 ? 'am' : 'pm';
  const h12 = norm % 12 === 0 ? 12 : norm % 12;
  return `${h12}${period}`;
}

// The cluster band in plain words (⑥): start 4 width 4 → "between 4am and 8am"; a
// wrap-around start 23 width 4 → "between 11pm and 3am". Mirror of localHourBand in phrasing.ts.
function localHourBand(startHour: number, windowHours: number): string {
  const end = (startHour + windowHours) % 24;
  return `between ${clockHourLabel(startHour)} and ${clockHourLabel(end)}`;
}

// ── Display state (§3.3 + B-051) ──────────────────────────────────────────────
// Findings present → live. With no findings, three honest empty states — never an
// all-clear (§9):
//   - stale     — gone quiet 48h+ (log today)
//   - no_pattern — substantial history but nothing cleared a floor. This is the
//     B-051 fix: a heavily-logging owner must NOT be told "keep logging, patterns
//     in a few days" (reads as "not enough data" → the §7.1 "silence churns"
//     trap). It is about the DATA ("no clear pattern yet"), not the pet's health.
//   - building  — genuinely early (still gathering the first days of logs)
export function deriveDisplayState(
  findings: CachedFinding[],
  hasRecentActivity: boolean,
  hasSubstantialHistory: boolean,
): DisplayState {
  if (findings.length > 0) return 'live';
  if (!hasRecentActivity) return 'stale';
  return hasSubstantialHistory ? 'no_pattern' : 'building';
}

// ── Empty-state intros ────────────────────────────────────────────────────────
export function buildingIntro(petName: string): string {
  return `We're getting to know ${petName}. Keep logging and the first patterns start to surface in a few days.`;
}

// Substantial history, nothing cleared a floor (B-051). Honest about detection
// state, forward-looking, and NOT a wellness claim (clinical-guardrails / §9).
export function noPatternIntro(petName: string): string {
  return `No clear patterns in ${petName}'s logs yet — we'll keep looking as you keep logging.`;
}

export function staleIntro(petName: string): string {
  return `Not enough recent data to show a pattern. Log today and we'll keep building ${petName}'s picture.`;
}

// ── Coverage diagnostics (B-053) ──────────────────────────────────────────────
// On the no_pattern surface, replace the generic noPatternIntro with the TOP
// coverage diagnostic's one-line WHY there's no signal yet + at most one safe
// corrective ACTION. Template-only (no LLM, like reflections ③). Hard rules,
// enforced here and asserted in signalCopy.test.ts:
//   - About DATA COVERAGE, never wellness — "no pattern" never reads as "fine"
//     (clinical-guardrails / §9). No reassurance vocabulary, ever.
//   - staple_washout is EXPLANATION ONLY: it carries NO action. It must never ask
//     the owner to vary the diet (that sabotages a vet-directed elimination trial),
//     and it stays associational — never a causal claim about the protein.
//   - Warm, specific, not nagging (nyx-voice): the action is folded into the
//     surface, never a push, and never an exclamation.
export interface CoverageCopy {
  /** One-line reason there's no signal yet. */
  why: string;
  /** A single safe corrective action, or null for explanation-only diagnostics. */
  action: string | null;
}

export function coverageCopy(diagnostic: CoverageDiagnostic, petName: string): CoverageCopy {
  // B-080 (a) meal-type collapse — the LOGGED diet is treats-only on most recent days.
  // The non-negotiable honesty device (Dr. Chen + Trust, §5.1): the copy carries the
  // log-only acknowledgement ("if that's the full picture" / "if {pet} ate more than you
  // logged") — the engine sees only the log and must not imply it knows what was eaten.
  // Never a judgment of the owner, never reassurance, never causal.
  if (diagnostic.type === 'meal_type_collapse') {
    return {
      why: `On ${diagnostic.gapDays} of the last ${diagnostic.windowDays} days, only treats were logged for ${petName} — no meals, so we can't yet see a full diet to weigh against the symptoms you're tracking.`,
      action: `If that's the full picture, it's worth sharing with your vet. If ${petName} ate more than you logged, adding those meals helps us spot patterns.`,
    };
  }
  // B-080 (b) diet churn — several brand-new foods appeared while symptoms are active.
  // A coverage observation: each new food reduces what the engine can conclude. Warm and
  // non-judgmental ("trying new foods is completely understandable"), never causal, never
  // a verdict. The day count is driven by windowDays so the copy stays true if it's tuned.
  if (diagnostic.type === 'diet_churn') {
    return {
      why: `${count(diagnostic.novelFoodCount, 'new food', 'new foods')} first appeared in ${petName}'s logs in the last ${diagnostic.windowDays} days — each new food makes it harder for us to tell what might be linked to the symptoms you're tracking.`,
      action: `Trying new foods is completely understandable. If you're able to keep the diet steady for a stretch, patterns get easier to spot.`,
    };
  }
  if (diagnostic.type === 'rate_meals') {
    // ACTION diagnostic: detector ② is dormant for lack of rated meals. Rating more
    // wakes it. About coverage of appetite data, not a verdict on how the pet is.
    return {
      why: `${petName}'s meals aren't rated often enough yet for us to watch for changes in appetite.`,
      action: `Add a quick rating when you log a meal, and we'll start watching how much ${petName} eats.`,
    };
  }
  // staple_washout — EXPLANATION ONLY, no action. Honest uncertainty ("we can't tell
  // yet"), never reassurance, never a "vary the diet" ask, associational not causal.
  return {
    why: `${petName} eats ${diagnostic.protein} in nearly every meal, so we can't yet tell whether it's linked to the symptoms you're tracking — there's nothing to compare it against.`,
    action: null,
  };
}

// ── Confidence tag (§6) ───────────────────────────────────────────────────────
// Calm + subordinate, and only where confidence genuinely varies. An Early
// correlation wears the provisional tag; an Established one drops the qualifier
// (absence of a tag IS the "this is solid" signal). A deterministic safety flag
// carries no confidence tag — its weight is shown by leading + the priority rail,
// and its honest framing is in the sentence itself. Returns null when no tag.
export function confidenceTag(finding: SignalFinding): string | null {
  if (finding.type === 'food_symptom_correlation' && finding.tier === 'early') {
    return 'Early pattern';
  }
  return null;
}

// ── Sample line (calm sub-line under the sentence) ────────────────────────────
// Shows the evidence weight at a glance — §6: a finding "needs its sample size
// shown". Associational only for correlations; never reassuring for the flag.
export function sampleLine(finding: SignalFinding): string {
  if (finding.type === 'food_symptom_correlation') {
    return `${count(finding.symptomEventCount, 'episode', 'episodes')} across ${count(
      finding.matchedPairs,
      'matched day',
      'matched days',
    )} of logs`;
  }
  if (finding.type === 'reflection') {
    return `${count(finding.currentCount, 'episode', 'episodes')} this week, ${finding.priorCount} last week`;
  }
  if (finding.type === 'symptom_worsening') {
    // Show the axis that actually rose: days for the more_days arm, episodes otherwise.
    if (finding.trigger === 'more_days') {
      return `${count(finding.currentDays, 'day', 'days')} this week, ${finding.priorDays} last week`;
    }
    return `${count(finding.currentCount, 'episode', 'episodes')} this week, ${finding.priorCount} last week`;
  }
  if (finding.type === 'postprandial_timing') {
    // The honest denominator: rapid over the episodes we could TIME, never the raw total.
    return `${finding.rapidCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} within ${finding.rapidWindowMinutes} min of eating`;
  }
  if (finding.type === 'timeofday_clustering') {
    // The honest denominator: clustered over the episodes we could place on the clock.
    return `${finding.clusterCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} ${localHourBand(finding.clusterStartLocalHour, finding.clusterWindowHours)}`;
  }
  if (finding.trigger === 'refused_normal_food') {
    return finding.ratedMealsConsidered > 0
      ? `Compared with ${count(finding.ratedMealsConsidered, 'recent meal', 'recent meals')}`
      : 'Compared with what you usually log';
  }
  return `${count(finding.daysBelowBaseline, 'day', 'days')} below the usual, across ${count(
    finding.ratedMealsConsidered,
    'recent meal',
    'recent meals',
  )}`;
}

// ── Tap-to-expand evidence (§3.2) ─────────────────────────────────────────────
// The honest detail behind the card, revealed on tap — how an owner trusts a card
// enough to act on it. Associational framing on correlations (a pattern in the
// logs, not a proven link). The safety flag points at the vet and never reassures.
export function evidenceText(finding: SignalFinding, petName: string): string {
  if (finding.type === 'food_symptom_correlation') {
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const window = Math.round(finding.correlationWindowHours);
    return (
      `Across ${count(finding.matchedPairs, 'matched day', 'matched days')} of logs, ${petName}'s ${symptom} ` +
      `has tended to follow meals containing ${finding.protein} within about ${window} hours. ` +
      `This is a pattern in your logs, not a proven link — worth mentioning to your vet.`
    );
  }
  if (finding.type === 'reflection') {
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const trend =
      finding.direction === 'improving'
        ? `down from ${count(finding.priorCount, 'episode', 'episodes')} the week before`
        : 'about the same as the week before';
    return (
      `We've logged ${count(finding.currentCount, 'episode', 'episodes')} of ${symptom} for ${petName} this week — ${trend}. ` +
      `This is a count we're tracking with you — not a diagnosis, and not a verdict on how ${petName} is doing. Keep logging and we'll keep watching the trend.`
    );
  }
  if (finding.type === 'symptom_worsening') {
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const priorPhrase =
      finding.priorCount === 0
        ? 'after none the week before'
        : `up from ${count(finding.priorCount, 'episode', 'episodes')} the week before`;
    // Firm tier — symptoms on most days. Phrase the rise on the axis that actually rose
    // (the trigger). For more_days the episode count is flat-or-falling, so compare on
    // days, not episodes (adversarial review — avoids the "4 episodes, up from 6" miscount).
    if (finding.tier === 'firm') {
      if (finding.trigger === 'more_days') {
        return (
          `We've logged ${symptom} for ${petName} on ${count(finding.currentDays, 'day', 'days')} this week, up ` +
          `from ${count(finding.priorDays, 'day', 'days')} the week before. Symptoms on most days is a pattern ` +
          `worth a vet visit soon — a read of your logs, not a diagnosis.`
        );
      }
      return (
        `We've logged ${count(finding.currentCount, 'episode', 'episodes')} of ${symptom} for ${petName} on ` +
        `${count(finding.currentDays, 'day', 'days')} this week, ${priorPhrase}. Symptoms on most days is a pattern ` +
        `worth a vet visit soon — a read of your logs, not a diagnosis.`
      );
    }
    // The more_days-only arm (same episode count, more spread): talk in days, gentlest ask.
    if (finding.trigger === 'more_days') {
      return (
        `We've logged ${symptom} for ${petName} on ${count(finding.currentDays, 'day', 'days')} this week, up from ` +
        `${count(finding.priorDays, 'day', 'days')} the week before. It's a pattern in your logs, not a diagnosis — ` +
        `worth keeping an eye on, and a word with your vet if it carries on.`
      );
    }
    // Standard — an episode-count rise, not dense.
    return (
      `We've logged ${count(finding.currentCount, 'episode', 'episodes')} of ${symptom} for ${petName} this week, ` +
      `${priorPhrase}. It's a pattern in your logs, not a diagnosis — worth a word with your vet, and keeping an ` +
      `eye on whether it carries on.`
    );
  }
  if (finding.type === 'postprandial_timing') {
    // Tap-to-expand evidence (§3.3): show the actual observed timings (the median minutes,
    // since the window is a descriptive bucket, not a clinical threshold) + the honesty
    // context "of N total, M could be timed". Timing ONLY — no food/cause/mechanism (§9.1/
    // §9.2). The food forms live in the payload for the Step-9 vet report, not here.
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    return (
      `Of ${petName}'s ${count(finding.totalEpisodes, 'episode', 'episodes')} of ${symptom} in the last ` +
      `${finding.windowDays} days, ${finding.eligibleCount} could be timed against a recent feeding — and ` +
      `${finding.rapidCount} of those happened within ${finding.rapidWindowMinutes} minutes of eating ` +
      `(typically about ${finding.medianMinutesSinceFeeding} minutes). This is a timing pattern in your ` +
      `logs, not a diagnosis — worth mentioning to your vet.`
    );
  }
  if (finding.type === 'timeofday_clustering') {
    // Tap-to-expand evidence (§4): the honest denominator ("of N total, M had a clear time")
    // + the clock band in plain words. Timing ONLY — no cause/mechanism (§4.5). The IANA zone
    // rides the payload for the Step-9 vet report, not this owner-facing copy.
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const band = localHourBand(finding.clusterStartLocalHour, finding.clusterWindowHours);
    return (
      `Of ${petName}'s ${count(finding.totalEpisodes, 'episode', 'episodes')} of ${symptom} in the last ` +
      `${finding.windowDays} days, ${finding.eligibleCount} had a clear enough time to place in the day — and ` +
      `${finding.clusterCount} of those happened ${band}. This is a timing pattern in your logs, not a ` +
      `diagnosis — worth mentioning to your vet.`
    );
  }
  if (finding.trigger === 'refused_normal_food') {
    const food = finding.refusedFoodLabel ?? 'a food they normally finish';
    return (
      `${petName} just turned down ${food}, which is normally eaten. Eating less can be an early sign ` +
      `something's off, so it's worth keeping an eye on — and a word with your vet if it carries on.`
    );
  }
  return (
    `${petName} has eaten less than usual for ${count(finding.daysBelowBaseline, 'day', 'days')}, ` +
    `compared with ${count(finding.ratedMealsConsidered, 'recent meal', 'recent meals')}. Eating less can be ` +
    `an early sign something's off, so it's worth keeping an eye on — and a word with your vet if it carries on.`
  );
}
