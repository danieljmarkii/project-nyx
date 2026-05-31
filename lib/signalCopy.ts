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

import type { CachedFinding, SignalFinding, SignalSymptomType } from './signal';

export type DisplayState = 'building' | 'stale' | 'live';

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

// ── Display state (§3.3) ──────────────────────────────────────────────────────
// Findings present → live. Otherwise distinguish building (still gathering, with
// recent activity) from stale (gone quiet 48h+). Empty findings are NEVER an
// all-clear (§9) — both states are honest "still building" copy.
export function deriveDisplayState(
  findings: CachedFinding[],
  hasRecentActivity: boolean,
): DisplayState {
  if (findings.length > 0) return 'live';
  return hasRecentActivity ? 'building' : 'stale';
}

// ── Building / stale intros ───────────────────────────────────────────────────
export function buildingIntro(petName: string): string {
  return `We're getting to know ${petName}. Keep logging and the first patterns start to surface in a few days.`;
}

export function staleIntro(petName: string): string {
  return `Not enough recent data to show a pattern. Log today and we'll keep building ${petName}'s picture.`;
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
