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
  CorrelationFinding,
  CoverageDiagnostic,
  EmptyStomachTimingFinding,
  IncidentCategory,
  IncidentFlagKind,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  MedOnBoardContext,
  PhotoComposition,
  PostprandialTimingFinding,
  ReflectionDensity,
  ReflectionFinding,
  SignalFinding,
  SignalSymptomType,
  StapleSource,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimeOfDayClusteringFinding,
  TimingStoryFinding,
  TrialResponseFinding,
} from './signal';
import { localDayIndex, localDayIndexOf, trialDayCounter } from './utils';
import { formatTimingBandLabel } from './timingBandLabels';

// A timing finding — the two types whose evidence renders as a receipt (SR-1, §4).
type TimingFinding = PostprandialTimingFinding | TimeOfDayClusteringFinding;

/** True for the two timing findings — the only types that render a card-face strip
 *  (§4 assignments). Exported so the renderer can narrow without re-importing the
 *  concrete types. */
export function isTimingFinding(finding: SignalFinding): finding is TimingFinding {
  return finding.type === 'postprandial_timing' || finding.type === 'timeofday_clustering';
}

// The two Signals-v2 timing-story types (CUL-12) — the A2 combined card and its lone
// empty-stomach sibling. Distinct from isTimingFinding above: those (⑤/⑥) render the
// shipped SR-1 receipt; these render the dedicated A2 face + expand (three-band compare,
// per-phenotype lanes, L3 composition), gated on `signals_v2`. Kept separate so the
// SR-1 (signal_design_v2) path is untouched.
type TimingStoryLike = TimingStoryFinding | EmptyStomachTimingFinding;

/** True for the A2 timing card and its lone empty-stomach sibling (CUL-12). */
export function isTimingStory(finding: SignalFinding): finding is TimingStoryLike {
  return finding.type === 'timing_story' || finding.type === 'empty_stomach_timing';
}

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

// Owner-facing noun for a per-incident red-flag card, by family (B-340 vomit / B-364 stool). NOT
// SYMPTOM_LABEL: stool reads the NEUTRAL "stool", never "loose stool" — blood is a red flag in a
// FORMED stool too, so the card must not assert a consistency it didn't measure. Mirrors
// INCIDENT_NOUN in the generate-signal phrasing module (the server template must match this).
const INCIDENT_NOUN: Record<IncidentCategory, string> = {
  vomit: 'vomiting',
  stool: 'stool',
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Protein cluster (B-351 slice 6) ───────────────────────────────────────────

/**
 * The finding's protein cluster, tolerant of a CACHED finding written before slice 6
 * shipped (`ai_signals.findings` has a 24h TTL, so those rows are read for up to a day
 * after deploy — and indefinitely if regeneration fails). Falls back to the single
 * label, which is exactly what those rows mean.
 *
 * Every client consumer goes through this rather than reading `finding.proteins`
 * directly, so an old cached row can never render as an empty list.
 */
export function proteinCluster(finding: CorrelationFinding): string[] {
  return finding.proteins && finding.proteins.length > 0 ? finding.proteins : [finding.protein];
}

/** True when the engine could not separate this candidate's proteins (D5). */
export function isJointCandidate(finding: CorrelationFinding): boolean {
  return finding.jointCandidate === true && proteinCluster(finding).length > 1;
}

/** Title-cased cluster member for the linked-pair chips ("chicken" → "Chicken"). */
export function displayProteinName(protein: string): string {
  return protein.charAt(0).toUpperCase() + protein.slice(1);
}

// Per-incident red-flag phrasing (B-340) — "possible" because these are AI reads of a single
// photo, not confirmed findings (matches the detail-screen "AI · unconfirmed" register). Mirror of
// INCIDENT_FLAG_PHRASE in the generate-signal phrasing module; KEEP IN SYNC. Blood-before-foreign
// is the engine's stable flag order, so the two-flag joiner reads deterministically.
const INCIDENT_FLAG_PHRASE: Record<IncidentFlagKind, string> = {
  blood: 'possible blood',
  foreign_material: 'possible foreign material',
};
function incidentFlagPhrase(flags: IncidentFlagKind[]): string {
  // The engine guarantees ≥1 flag (a finding is only emitted when deriveIncidentFlags is non-empty),
  // but this reads from the cache — defend a corrupt/empty array with a safe, still-escalating phrase
  // rather than rendering "undefined" on a safety card (never reassures either way).
  if (flags.length === 0) return 'a possible red flag';
  return flags.length === 2
    ? `${INCIDENT_FLAG_PHRASE.blood} and ${INCIDENT_FLAG_PHRASE.foreign_material}`
    : INCIDENT_FLAG_PHRASE[flags[0]];
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

// Chronicity recency (⑦, B-182) — days-since-last-episode in plain words. Reinforces the
// "still ongoing" honesty of the recency floor (the engine only fires when an episode is
// within ongoingRecencyDays), never a resolution claim. 0→"today", 1→"yesterday", N→"N days ago".
function recencyPhrase(daysSince: number): string {
  if (daysSince <= 0) return 'today';
  if (daysSince === 1) return 'yesterday';
  return `${daysSince} days ago`;
}

// UTC month name for the chronicity "since {month}" onset anchor (⑦) — concrete and
// trust-building, never clinical (§4.1). Mirror of onsetMonth/MONTH_NAMES in phrasing.ts
// (the RN bundle can't import the Deno module); UTC to match the engine's day-bucketing.
// KEEP IN SYNC with phrasing.ts.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function onsetMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'then' : MONTH_NAMES[d.getUTCMonth()];
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

// ── CulpritMark pulse contract (B-284 PR N2 §3) ──────────────────────────────
// "A fresh finding set exists" is defined structurally, not by a timestamp: the
// ranked TYPES change (a finding appears, resolves, or is reordered by rank).
// Two reads that happen to land the exact same ranked set are the SAME signature
// — re-reading unchanged findings on every focus must not re-arm the pulse.
export function signalFindingsSignature(findings: CachedFinding[]): string {
  return [...findings]
    .sort((a, b) => a.rank - b.rank)
    .map((f) => `${f.rank}:${f.finding.type}`)
    .join('|');
}

// The pulse is live only while there IS a live finding set the owner hasn't
// seen yet — building/stale/no_pattern never pulse (there is nothing fresh to
// flag), and an empty live signature ('' — findings.length === 0) never counts
// as "seen" the moment it appears, since seenSignature also starts unset.
export function hasUnseenFinding(
  displayState: DisplayState,
  findings: CachedFinding[],
  seenSignature: string | undefined,
): boolean {
  if (displayState !== 'live' || findings.length === 0) return false;
  return signalFindingsSignature(findings) !== seenSignature;
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

// ── SR-2 empty states — E1 (building) + E2 (no_pattern) restyle ────────────────
// B-721 §6 / §9. These are the flag-on (`signal_design_v2`) copy for the two empty
// states drawn in the round-2.1 mock. Flag-off keeps the shipped intros above
// byte-identical (FR-FLAG-2), so both sets coexist rather than one replacing the
// other. Verbatim-governed: every string below is pinned character-for-character to
// §9 (E1) / the B-284 §9 "Signal — empty" row (E2) by signalCopy.test.ts — a voice
// edit here is a spec change, not a code change. Absence is never wellness: E1 keeps
// the safety-floor line, E2 says "isn't an all-clear" in its own words.

// E1 headline (§9), in two parts so the day-count clause can carry the E1-c accent
// ink as its own visual span while the whole sentence stays the a11y label. The day
// counter is the B-421 local-day count from the first logged event; the event count
// is pluralised (the §9 template writes "{k} events", which renders "1 event" on day
// one — a correct application of the template, not a copy change). `dayNumber` /
// `eventCount` are supplied by useSignal from local SQLite.
export function buildingHeadlineLead(petName: string): string {
  return `We're getting to know ${petName}.`;
}
export function buildingDayCount(dayNumber: number, eventCount: number): string {
  return `Day ${dayNumber} — ${count(eventCount, 'event', 'events')} so far.`;
}
export function buildingHeadline(petName: string, dayNumber: number, eventCount: number): string {
  return `${buildingHeadlineLead(petName)} ${buildingDayCount(dayNumber, eventCount)}`;
}

// The building-state "Day N" counter (§9 / §6). ONE day definition — the B-421
// local-day counter (`lib/utils`), device zone (the owner's own midnight is the
// client's day boundary), day-1-inclusive via `trialDayCounter` (max(1, …)): a pet
// logged for the first time today is on "Day 1", never "Day 0". A missing/malformed
// first-event timestamp falls back to Day 1 rather than guessing (the same
// null-not-a-guessed-day contract as `localDayIndexOf`). `nowMs` is passed in (never
// read here) so this stays pure + timezone-pinnable in tests (B-514).
export function buildingDayNumber(firstEventIso: string | null, nowMs: number): number {
  if (!firstEventIso) return 1;
  const firstIdx = localDayIndexOf(firstEventIso);
  if (firstIdx === null) return 1;
  return trialDayCounter(firstIdx, localDayIndex(nowMs));
}

// E1 sub + the three "watching for" rows + the safety floor (§9). The watching-for
// rows name what the engine is building toward, in the same order as the mock's
// ghosted receipts (timing → food → change). The floor line is the honesty device:
// the weekly-pattern framing must never read as "nothing urgent will surface before
// then" — safety findings don't wait for the week (clinical-guardrails / §6).
export const BUILDING_SUB =
  "Patterns usually start appearing within the first week. Here's what we're watching for:";
export const BUILDING_WATCHING_FOR = [
  'Timing — do symptoms follow meals, and how closely',
  'Food connections — what tends to come before a reaction',
  'Change — this week against last, counted from your logs',
] as const;
export const BUILDING_FLOOR = "If something needs attention sooner, it won't wait for the week.";

// E2 — mature record, nothing established. VERBATIM from the shipped B-284 §9
// "Signal — empty" copy row (`docs/culprit-in-app-brand-requirements.md`). Split
// across two lines per the round-2.1 mock (primary line + dimmed sub) — the words
// are identical to §9 either way. "isn't an all-clear" is the load-bearing clause:
// a heavily-logged record with no finding is never reassured (absence ≠ wellness).
export const NO_PATTERN_HEADLINE =
  'No established patterns yet. Nothing in the last month of logs has cleared our evidence bar.';
export const NO_PATTERN_SUB =
  "That isn't an all-clear — keep logging, and the moment something clears it, it'll be here.";

// ── Signals v2 watching system (B-755 / CUL-14, §4.4 / D5 / G8) ────────────────
// R-5 ("watching, with real counts") ratified as a SYSTEM: the empty state grows a
// per-lane row that states what the lane HAS and what its math REQUIRES, in real
// counts computed client-side from local data through lib/mealTiming (G9). These are
// the strings the mock round-2 §05 frame renders (the Designer copy round, R2-7);
// signalWatching.test.ts pins each one and sweeps them against the G8 register:
// transparency, never solicitation — no imperative ("log more"), no streak/unlock/
// reward language, no promise a card is coming (the count IS the progress; it carries
// no promise). The rows compose INTO B-721's E1/E2 (content, not a frame — §4.4); the
// safety-floor line is BUILDING_FLOOR, verbatim and unconditional wherever the rows
// render — the weekly-cadence framing must never read as "nothing urgent surfaces
// before then" (absence ≠ wellness; clinical-guardrails / §6).

/** The intro above the watching rows (§05 mock, verbatim). Rendered only when ≥1 row
 *  qualifies. It states what is happening and never asks for anything (G8): "what each
 *  pattern still needs" is a fact about the computation, not a request to log more. */
export const WATCHING_SUB = "Here's what we're watching, and what each pattern still needs:";

/** Timing lane — "N of the M timed episodes a pattern needs." A fact about the math:
 *  how many meal-timeable episodes the timing lanes (⑤/L1) require before a pattern can
 *  be read. Never a promise a card is coming (G8) — it names what the computation needs,
 *  not what the pet will turn out to have. `need` is the shared minEligibleEpisodes floor
 *  (§2 L1), passed in so the copy names the same number the gate uses. */
export function watchingTimingRow(have: number, need: number): string {
  return `Timing — ${have} of the ${need} timed episodes a pattern needs.`;
}

/** Change lane — the week-over-week comparison needs two full weeks of span to run.
 *  States the requirement and the current week; never "log more" (G8) — a description
 *  of where the math stands, not a nudge. `weeksNeeded` drives both this copy and the
 *  gate (§4.4) so the stated need can't drift from the enforced one; the mock renders 2. */
export function watchingChangeRow(currentWeek: number, weeksNeeded: number): string {
  return `Change, week to week — needs ${weeksNeeded} full weeks of logging to compare. This is week ${currentWeek}.`;
}

/** Gap lane (escalate-only, G5) — the recent inter-episode gaps for a symptom, stated
 *  plainly ("6 days, then 3, then 2"). A TRUE fact about the record: a descriptive count
 *  in time order, never a verdict (G1), never a cause (G3), never a mechanism. The row
 *  renders only on a SHORTENING run, so no reassuring "settling"/"improving" is ever
 *  reachable (a lengthening or steady sequence renders nothing — absence ≠ wellness). */
export function watchingGapRow(symptomLabel: string, gapSequence: string): string {
  return `Gaps between ${symptomLabel} episodes — ${gapSequence}.`;
}

// "6 days, then 3, then 2" (unit stated once when uniform) or "3 days, then 18 hours,
// then 9 hours" (each unit stated when the run crosses the day/hour boundary — an honest
// big shortening). The client mirror of generate-signal/phrasing.ts's formatGapSequence,
// re-stated here because that file is Deno-only (the watching gap row has no server
// counterpart — the server emits the gap_shortening FINDING only at the ≥4-gap firing
// floor, while this is the ≥3-gap sub-floor watching row). Kept byte-for-byte identical
// so that, once the L4 finding deploys (PR 10), the two never disagree about the same
// gaps. ROUND ONCE (min 1h), then bucket off the rounded value — bucketing off raw hours
// would let a gap in [23.5, 24) read "24 hours" yet bucket as 'hour', rendering flat-or-
// backwards prose (the server's code-review finding, mirrored).
function formatGapUnit(hours: number): { value: number; unit: 'day' | 'hour' } {
  const wholeHours = Math.max(1, Math.round(hours));
  return wholeHours >= 24
    ? { value: Math.round(wholeHours / 24), unit: 'day' }
    : { value: wholeHours, unit: 'hour' };
}

export function formatWatchingGapSequence(hoursSeq: readonly number[]): string {
  const parts = hoursSeq.map(formatGapUnit);
  if (parts.length === 0) return '';
  const uniform = parts.every((p) => p.unit === parts[0].unit);
  if (uniform) {
    const [head, ...rest] = parts;
    const first = `${head.value} ${head.unit}${head.value === 1 ? '' : 's'}`;
    return [first, ...rest.map((p) => String(p.value))].join(', then ');
  }
  return parts.map((p) => `${p.value} ${p.unit}${p.value === 1 ? '' : 's'}`).join(', then ');
}

// The post-log acknowledgment line (B-721 SR-3, §5.3 / §9). Shown ABOVE the still-
// readable findings between a fresh event log and the debounced regeneration settling —
// never a spinner, never blanking the findings. nyx-voice: no exclamation, second-person
// owner / third-person pet, a single ellipsis. Kept as a helper (not an inline literal)
// so it's screened by the same voice/guardrail tests as the rest of the surface.
export function ackUpdatingCopy(petName: string): string {
  return `Noted — updating ${petName}'s picture…`;
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
  // B-070: the lead clause matches the staple's STRUCTURE (engine-resolved stapleSource) so
  // it never claims "every meal" when the staple is treat-borne — a false premise that could
  // misdirect an elimination-diet talk (e.g. Nyx's chicken arrives as treats; her meals are
  // tuna). The "usually as treats rather than meals" texture is descriptive, never an action
  // ("cut the treats" would be a diet-varying ask that sabotages a vet-directed trial).
  const { protein } = diagnostic;
  // stapleSource is engine-resolved (B-070). Default a MISSING value (a row cached before
  // B-070 shipped — see the field doc) to the safe day-based 'mixed' register explicitly,
  // rather than relying on undefined falling through. The Record is exhaustive by
  // construction: a future StapleSource member won't compile until its copy is written.
  const source: StapleSource = diagnostic.stapleSource ?? 'mixed';
  const leadBySource: Record<StapleSource, string> = {
    meals: `${petName} eats ${protein} in most meals`,
    treats: `${petName} has ${protein} most days, usually as treats rather than meals`,
    mixed: `${petName} eats ${protein} most days`,
  };
  return {
    why: `${leadBySource[source]}, so we can't yet tell whether it's linked to the symptoms you're tracking — there's nothing to compare it against.`,
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
  if (finding.type === 'incident_red_flag') {
    // The honest sample weight + provenance (§6): an AI read of the flagged photo(s), never a
    // count that implies a confirmed finding. "AI read" mirrors the detail-screen unconfirmed
    // register; the count is episode-collapsed bouts (B-368), so a re-logged bout reads as one.
    return `From an AI read of ${count(finding.flaggedIncidentCount, 'logged photo', 'logged photos')}`;
  }
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
  if (finding.type === 'symptom_chronicity') {
    // The honest denominator (§4.1): episodes across the ACTIVE weeks over the lookback —
    // never an implied continuity the data can't support ("6 of the last 8 weeks", not
    // "8 weeks"). Phrasing kept identical to the evidence + server template denominator.
    return `${count(finding.episodeCount, 'episode', 'episodes')} across ${finding.activeWeeks} of the last ${Math.round(finding.windowDays / 7)} weeks`;
  }
  if (finding.type === 'postprandial_timing') {
    // The honest denominator: rapid over the episodes we could TIME, never the raw total.
    return `${finding.rapidCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} within ${finding.rapidWindowMinutes} min of eating`;
  }
  if (finding.type === 'timeofday_clustering') {
    // The honest denominator: clustered over the episodes we could place on the clock.
    return `${finding.clusterCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} ${localHourBand(finding.clusterStartLocalHour, finding.clusterWindowHours)}`;
  }
  if (finding.type === 'empty_stomach_timing' || finding.type === 'timing_story') {
    // The A2 timing card's meta sample (CUL-12). TimingStoryBody renders this via
    // timingStorySampleLine directly; this branch keeps sampleLine total over the union.
    return timingStorySampleLine(finding);
  }
  if (finding.type === 'trial_response') {
    // The trial card's meta sample (CUL-13). TrialResponseBody renders this via
    // trialResponseSampleLine directly; this branch keeps sampleLine total over the union.
    return trialResponseSampleLine(finding);
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

// ── `New`-for-worsening (B-721 SR-3, §3.2 / Change Contract v1.1) ──────────────
// A worsening finding whose prior week held zero episodes is NEW, not a trend: the
// count pair "N this week, 0 last week" fakes precision (0 → 4 is not a 2× rise, it's
// a first appearance), so the meta row wears a small `New` chip instead. CLIENT-
// DERIVABLE — the one v1 case of the `New` chip (timing/first-appearance for other
// types is v2, needing generate-signal prior-set memory). A type guard so the sample-
// line swap at the call site is type-safe.
export function isNewWorsening(finding: SignalFinding): finding is SymptomWorseningFinding {
  return finding.type === 'symptom_worsening' && finding.priorCount === 0;
}

// The sample line for a `New` worsening — the current axis count WITHOUT the "0 last
// week" pair the `New` chip replaces (§3.2, S10: the chip and the line must not both
// carry the novelty). priorCount === 0 ⇒ priorDays === 0 ⇒ the trigger is more_episodes
// (a flat-count more_days arm needs priorCount ≥ the episode floor), but we branch on
// the axis defensively so an unexpected shape can never print the "0 last week" this
// exists to drop. NOTE (SR-4): two OTHER surfaces still say "after none" for this finding
// — the SERVER card sentence, and the client `evidenceText` worsening branch below (this
// file). SR-4's template audit retires that phrasing in BOTH together: retiring only the
// expanded evidence now would split it from the still-"after none" card sentence, and
// `evidenceText` is shared flag-off/on so an ungated edit would break FR-FLAG-2. The
// redundancy is dark behind the flag until then; when SR-4 lands, the card a11y label
// must also carry the `New` fact the chip holds (B-727).
export function worseningNewSampleLine(finding: SymptomWorseningFinding): string {
  return finding.trigger === 'more_days'
    ? `${count(finding.currentDays, 'day', 'days')} this week`
    : `${count(finding.currentCount, 'episode', 'episodes')} this week`;
}

// ── Density-withheld reflection sample line (SR-5, §3.3) ───────────────────────
// SR-4 withheld the "down from N last week" clause from the reflection SENTENCE when
// week-over-week logging density fell (`density.comparable === false`). The card-face
// sample line still carried the same week-pair ("2 episodes this week, 5 last week"),
// so the face re-asserted the exact comparison the sentence dropped and the expanded
// state (below) explains it can't trust. The client withholds it here too — the
// current week's count WITHOUT the incomparable prior — so the whole card face agrees.
// CLIENT-DERIVED + FLAG-GATED at the call site (like worseningNewSampleLine): flag-off
// keeps the shipped week-pair, so the shipped surface is byte-identical (FR-FLAG-2).

/** A FALLING reflection whose SR-4 density gate marks the week-over-week comparison
 *  incomparable (§3.3). A type guard so the sample-line swap at the call site is
 *  type-safe. Falls false for a flat reflection, an absent density (old cache), or a
 *  comparable one — every case that keeps the shipped week-pair. */
export function isReflectionDensityWithheld(finding: SignalFinding): finding is ReflectionFinding {
  return (
    finding.type === 'reflection' &&
    finding.direction === 'improving' &&
    finding.density?.comparable === false
  );
}

/** The sample line for a density-withheld falling reflection — this week's count without
 *  the "M last week" the gate withholds. Mirrors the shipped reflection sample line minus
 *  the incomparable prior. */
export function reflectionWithheldSampleLine(finding: ReflectionFinding): string {
  return `${count(finding.currentCount, 'episode', 'episodes')} this week`;
}

// ── Universal banned-vocabulary screen (SR-5, §3.5) ───────────────────────────
// Mirror of phrasing.ts GLYPH_RE / PERCENT_RE + hasBannedSignalVocabulary — the RN
// bundle can't import the Deno module, so the universally-banned Signal vocabulary
// (direction glyphs → S5, percentages → S3) is duplicated here like the banner regexes
// below. KEEP IN SYNC with phrasing.ts. Screens CLIENT-COMPOSED copy that folds in owner
// free-text (the med-on-board line's drug name), so a "%" in a real name like
// "Baytril 2.5%" can never reach a Signal card (B-733).
const SIGNAL_GLYPH_RE = /[↑↓→←➘➚➔⬆⬇]|->|<-|\bslope\b/i;
const SIGNAL_PERCENT_RE = /%|\bpercent(?:ages?|iles?)?\b/i;
export function hasBannedSignalVocabulary(text: string): boolean {
  const t = text ?? '';
  return SIGNAL_GLYPH_RE.test(t) || SIGNAL_PERCENT_RE.test(t);
}

// ── Med-on-board context line (SR-5, §5.4 / §9) ───────────────────────────────
// The slate-toned context line on a correlation or timing card when a medication course
// is active in the finding window (SR-4 attaches `medContext`). Stated as a bare fact —
// never an explanation, never a verdict, no causal adjacency (§5.4).
//
// The drug label is OWNER FREE-TEXT carried VERBATIM from generate-signal — a drug name
// is data, not generated copy, and screening it server-side would corrupt a legitimate
// name like "Baytril 2.5%" (medContext.ts §resolveDrugLabel documents this). So the
// COMPOSED line is screened HERE against the universally-banned Signal vocabulary (§3.5):
// a "%" in a drug name trips the percent screen (B-733). If it trips, the line is DROPPED
// (null) rather than rendered — the med context is non-essential decoration on a BENIGN
// (insight-lane) card, so its silence never reassures and never inverts a safety finding
// (the banner's fail-safe posture). doseCount is pluralised (B-733): the §9 copy hardcodes
// "doses", but a course can hold exactly one administered dose.

/** The finding's med-on-board context, or undefined for the types SR-4 never decorates
 *  (only correlation + the two timing findings carry it). */
export function medContextOf(finding: SignalFinding): MedOnBoardContext | undefined {
  if (
    finding.type === 'food_symptom_correlation' ||
    finding.type === 'postprandial_timing' ||
    finding.type === 'timeofday_clustering' ||
    finding.type === 'empty_stomach_timing' ||
    finding.type === 'timing_story' ||
    finding.type === 'trial_response'
  ) {
    return finding.medContext;
  }
  return undefined;
}

/** The composed §9 med-on-board line, or null when the finding carries no context, the
 *  facts are degenerate (blank label / non-positive count — the server guarantees neither,
 *  but this reads a cache), or the composed sentence trips the guardrail screen (§3.5). */
export function medContextLine(finding: SignalFinding): string | null {
  const ctx = medContextOf(finding);
  const label = ctx?.drugLabel?.trim();
  if (!ctx || !label || !Number.isFinite(ctx.doseCount) || ctx.doseCount < 1) return null;
  const line = `During an active ${label} course — ${count(ctx.doseCount, 'dose logged', 'doses logged')}.`;
  return hasBannedSignalVocabulary(line) ? null : line;
}

// ── Tap-to-expand evidence (§3.2) ─────────────────────────────────────────────
// The honest detail behind the card, revealed on tap — how an owner trusts a card
// enough to act on it. Associational framing on correlations (a pattern in the
// logs, not a proven link). The safety flag points at the vet and never reassures.
export function evidenceText(finding: SignalFinding, petName: string): string {
  if (finding.type === 'incident_red_flag') {
    // Tap-to-expand evidence (B-340): names WHAT the photo showed + the symptom + the pet, is
    // honest about the AI provenance (an automated read of a single photo, unconfirmed), and routes
    // to the vet. ESCALATE-ON-PRESENCE — NEVER reassures (the "not confirmed / not a diagnosis"
    // clause is a provenance disclaimer, immediately followed by the vet ask, never an all-clear),
    // NEVER diagnoses, NEVER assigns a cause. The date lives in the main card sentence, so the
    // tap-through adds the provenance + why-it-matters rather than repeating it.
    const symptom = INCIDENT_NOUN[finding.incidentType]; // 'vomiting' | 'stool' (neutral, never "loose stool")
    const phrase = incidentFlagPhrase(finding.flags);
    const single = finding.flaggedIncidentCount === 1;
    const lead = single
      ? `A photo you logged of ${petName}'s ${symptom} showed ${phrase}`
      : `Photos you logged of ${petName}'s ${symptom} have shown ${phrase}`;
    const readNoun = single ? 'a single photo' : 'those photos';
    return (
      `${lead} — an automated read of ${readNoun}, not a confirmed finding and not a diagnosis. ` +
      `It's still worth a call to your vet, who can look at what you logged and tell you what it means.`
    );
  }
  if (finding.type === 'food_symptom_correlation') {
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const window = Math.round(finding.correlationWindowHours);
    // A JOINT candidate (B-351 slice 6) earns one extra clause, and it is the honest
    // one: WHY the app can't say which protein it is. The card sentence already carries
    // the resolving action, so the tap-through explains the evidence rather than
    // repeating the ask. `finding.protein` already names every member of the cluster.
    // NOT "…it's both of them or either one" (an earlier draft) — that forecloses
    // "neither", which is a stronger claim than an associational finding can support: the
    // pattern could be driven by something not on this list at all.
    //
    // The follow-on differs by the ENGINE's resolved guidance, never by a client decision.
    // On an active diet trial the app must not suggest varying a vet-directed elimination
    // diet, so it routes to the vet instead. Anything other than an explicit 'feed_apart'
    // takes the safe branch, so a row cached before that field existed — or any future path
    // that forgets to set it — can never surface the trial-breaking wording.
    const cantSeparate = isJointCandidate(finding)
      ? ` Those proteins always turn up together in what you've logged, so this pattern can't tell them apart yet.` +
        (finding.jointGuidance === 'feed_apart'
          ? ` Feeding one without the other would start to separate them.`
          : ` Your vet is the right person to weigh that up before you change anything.`)
      : '';
    return (
      `Across ${count(finding.matchedPairs, 'matched day', 'matched days')} of logs, ${petName}'s ${symptom} ` +
      `has tended to follow meals containing ${finding.protein} within about ${window} hours.` +
      cantSeparate +
      ` This is a pattern in your logs, not a proven link — worth mentioning to your vet.`
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
  if (finding.type === 'symptom_chronicity') {
    // Tap-to-expand evidence (⑦, B-182): names DURATION + RECURRENCE + COUNT + still-ongoing
    // recency, routed to the vet on the resolved tier. DESCRIPTIVE only — never a cause, never a
    // mechanism/severity verdict, never a diagnosis, never reassures (§4.7). The honest
    // denominator is the active weeks over the lookback; the recency clause carries the
    // "ongoing/unresolved" honesty (the engine only fired because the last episode is recent).
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const weeks = Math.round(finding.windowDays / 7);
    const vetAsk = finding.tier === 'firm' ? 'booking a vet visit' : 'a word with your vet';
    return (
      `Since ${onsetMonth(finding.firstOnsetIso)}, we've logged ${count(finding.episodeCount, 'episode', 'episodes')} of ` +
      `${symptom} for ${petName} across ${finding.activeWeeks} of the last ${weeks} weeks, the most recent ` +
      `${recencyPhrase(finding.daysSinceLastEpisode)}. A symptom that keeps recurring over weeks is worth ${vetAsk} — ` +
      `a read of your logs, not a diagnosis.`
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
  if (finding.type === 'empty_stomach_timing') {
    // Tap-to-expand evidence (L1, CUL-7/CUL-12): the honest denominator + the actual observed
    // long-gap timing (the median hours). TIMING ONLY — the band, never the syndrome ('empty
    // stomach'/'bilious' — MECHANISM_RE), never a food/cause, never a feeding-schedule
    // suggestion (G3). Never inverted: a below-floor result never reached here.
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    return (
      `Of ${petName}'s ${count(finding.totalEpisodes, 'episode', 'episodes')} of ${symptom} in the last ` +
      `${finding.windowDays} days, ${finding.eligibleCount} could be timed against a recent meal — and ` +
      `${finding.longCount} of those came ${finding.longGapHours} or more hours after eating (typically about ` +
      `${finding.medianHoursSinceFeeding} hours). This is a timing pattern in your logs, not a diagnosis — ` +
      `worth mentioning to your vet.`
    );
  }
  if (finding.type === 'timing_story') {
    // Tap-to-expand evidence (the A2 combined card, CUL-12): both phenotypes count-anchored
    // over the ONE shared eligible denominator. TIMING ONLY, same guardrail class as its parts
    // — no syndrome, no food/cause, no management advice.
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    return (
      `Of ${petName}'s ${count(finding.totalEpisodes, 'episode', 'episodes')} of ${symptom} in the last ` +
      `${finding.windowDays} days, ${finding.eligibleCount} could be timed against a recent meal. ` +
      `${finding.rapid.count} came within ${finding.rapidWindowMinutes} minutes of eating; ${finding.long.count} ` +
      `came ${finding.longGapHours} or more hours after. This is a timing pattern in your logs, not a diagnosis ` +
      `— worth mentioning to your vet.`
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
  if (finding.type === 'trial_response') {
    // The trial card's "why we're showing this" (L2, CUL-13): frames the honest DENOMINATOR (counts
    // from logged days, both stretches) and routes to the vet. COUNT-ANCHORED, NEVER a verdict on the
    // trial (the RTM/confound box + the §3.4 adjacency below carry the "can't say why yet" honesty);
    // NO attribution (G1), NO syndrome (G3). The pooled counts + day-count are in the lead sentence,
    // so this adds the framing rather than repeating them.
    const weeks = baselineWeeksOf(finding);
    return (
      `These are counts from the days you logged — during the trial, and in the ` +
      `${weeks === 1 ? 'week' : `${weeks} weeks`} before it. A change like this is worth reviewing with your ` +
      `vet. It's a read of your logs, never a verdict on the trial.`
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

// ── Reflection density + trial adjacency (SR-5, §3.3 / §3.4 / §9) ──────────────
// The FALLING reflection's expanded-state extras, consuming SR-4's `density` payload and
// the one trial predicate (`isTrialRunning`, lib/dietTrial — resolved by the caller and
// passed as a boolean, never re-derived here). All EXPANDED-ONLY and FALLING-ONLY
// (`direction === 'improving'`): a flat reflection gets neither — its "about the same" is
// not a comparison to withhold (§3.2 — falling only) nor a weakening to caveat (§3.4 —
// weakening only). The card FACE stays sentence-only (S1/S10); nothing here renders
// collapsed.
//
// Two mutually-exclusive density lines, keyed on the SR-4 gate:
//   • comparable      → the DISCLOSURE line (§9 verbatim): the day counts that back the
//     "down from N" the sentence still carries.
//   • NOT comparable  → the WITHHELD line: the server already dropped "down from N" from
//     the sentence (and the client dropped it from the sample line); this says why.

/** The expanded density box title — the round-2.1 mock's "Counted honestly" (the design
 *  authority for this surface; a §9 copy-table addition is flagged for PM). */
export const DENSITY_BOX_TITLE = 'Counted honestly';

/** The trial adjacency line (§3.4 verbatim) — appended to a FALLING reflection's expanded
 *  text while a trial is running. Dr. Chen-sanctioned §9 copy; weakening-only, expand-only. */
export const TRIAL_ADJACENCY =
  "A quieter week partway through a diet trial isn't the trial's verdict — the full run is what makes it readable.";

/**
 * The density-WITHHELD line for a not-comparable falling reflection. B-733 / Dr. Chen
 * reword of the §9 verbatim ("…so we can't tell yet whether there was less to log").
 *
 * WHY IT DEVIATES FROM §9: the gate measures "days-with-any-log", NOT symptom-specific
 * coverage — a week of meals-only logging keeps the day count up while symptom logging
 * lapses (the adversarial-review residual behind B-733). The §9 line's "whether there was
 * less to log" reads as if the gate could adjudicate whether the quiet is real, which
 * over-claims what days-with-any-log can see. This grounds the uncertainty in the actual
 * measure — fewer LOGGED DAYS can look like fewer episodes — and declines the comparison
 * rather than promising a later verdict ("yet"). Never reassures (it withholds the
 * reassuring read); fail-toward-escalation (§3.3). The §9 copy-table edit is a flagged
 * Tier-2 change awaiting PM approval.
 */
export const DENSITY_WITHHELD =
  "You also logged on fewer days this week, so we're not comparing it with last week — fewer logged days can look like fewer episodes on their own.";

/** The disclosure line for a COMPARABLE falling reflection — §9 verbatim: the logged-day
 *  counts that back the comparison the sentence carries. */
export function densityDisclosureLine(density: ReflectionDensity): string {
  return `Counted from days you logged: ${density.currentLoggingDays} this week, ${density.priorLoggingDays} last.`;
}

export interface ReflectionExpanded {
  /** The density line (disclosure when comparable, withheld when not), or null when the
   *  reflection isn't falling or carries no density payload (an old cached row). */
  densityLine: string | null;
  /** The mid-trial adjacency line (§3.4), or null when not falling / no trial running. */
  trialAdjacency: string | null;
}

/** The expanded-state extras for a reflection — the density line + the trial adjacency,
 *  each null when it doesn't apply. Pure; the caller renders them (both null → the caller
 *  draws no box). `trialRunning` is `isTrialRunning` resolved upstream. */
export function reflectionExpandedExtras(
  finding: ReflectionFinding,
  trialRunning: boolean,
): ReflectionExpanded {
  if (finding.direction !== 'improving') {
    return { densityLine: null, trialAdjacency: null };
  }
  const d = finding.density;
  const densityLine = d ? (d.comparable ? densityDisclosureLine(d) : DENSITY_WITHHELD) : null;
  return { densityLine, trialAdjacency: trialRunning ? TRIAL_ADJACENCY : null };
}

// ══════════════════════════════════════════════════════════════════════════════
// Receipts (SR-1, B-721) — pure models for the Signal evidence strips.
// ══════════════════════════════════════════════════════════════════════════════
// The design-uplift receipt system (docs/nyx-signal-home-requirements.md §4). Every
// model below is derived from the finding's EXISTING counts — no new payload, no
// lib/signal.ts change (§4 Engineering): the dot lane draws one dot per TIMEABLE
// episode, split by the named window; the compare prints the two counts the sentence
// subordinates; the phone script restates the facts a vet call needs. The un-timeable
// remainder is always disclosed, never hidden (S2 control-side, S10 earn-its-place).
//
// Only the two timing types render a card-face strip (§4 assignments). Correlation,
// intake-decline, reflection and every safety card face stay sentence-only (S1/S10)
// — plainness on the safety face is itself the severity signal (S1). These helpers
// are pure so the geometry + copy are unit-testable off-device.

// Above this many TIMEABLE episodes, individual dots stop being countable, so the dot
// lane degrades to the Shape C compare — never to bins (§4 / SD-4). A legibility
// constant, not a clinical threshold; the A→C degradation is asserted at cap±1.
export const DOT_LANE_MAX = 12;

/** A single episode mark on the dot lane: horizontal position 0..1 and whether it
 *  falls inside the named window. Positions are spread evenly WITHIN each zone — the
 *  honest facts are the in/out SPLIT and the COUNT, not a per-episode offset the
 *  payload doesn't carry (so the lane never implies a precision it can't back). */
export interface LaneDot {
  pos: number;
  inWindow: boolean;
}
/** The named window as a [start,end] fraction of the lane. Two entries when a clock
 *  band wraps past midnight (e.g. 11pm–3am). */
export interface LaneBand {
  start: number;
  end: number;
}
export interface DotLaneModel {
  dots: LaneDot[];
  bands: LaneBand[];
  /** Evenly-spaced axis words under the lane (§4 "minimal axis words"). The ⑤/⑥ lanes use
   *  three; the A2 combined lane uses four (`ate · 30m · 2h · 6h+`). A 3-tuple is a valid
   *  string[], so relaxing this from a fixed tuple is backward-compatible with dotLaneModel. */
  axis: string[];
}

function clampCount(n: number, max: number): number {
  return Math.max(0, Math.min(Math.round(n), Math.round(max)));
}

// The gaps outside the given bands over [0,1] — the region the out-of-window dots
// live in. Bands are assumed within [0,1]; overlaps are merged by the sweep.
function complementIntervals(bands: LaneBand[]): LaneBand[] {
  const sorted = [...bands].sort((a, b) => a.start - b.start);
  const gaps: LaneBand[] = [];
  let cursor = 0;
  for (const b of sorted) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < 1) gaps.push({ start: cursor, end: 1 });
  return gaps;
}

// Spread n points evenly across the UNION of the given intervals, centred by
// arc-length so the first/last dots don't hug the edges. Degenerate (zero-width)
// intervals stack the points at the start rather than dividing by zero.
function spreadInIntervals(intervals: LaneBand[], n: number): number[] {
  if (n <= 0) return [];
  const widths = intervals.map((i) => Math.max(0, i.end - i.start));
  const total = widths.reduce((a, b) => a + b, 0);
  const anchor = intervals[0]?.start ?? 0.5;
  if (total <= 0) return Array.from({ length: n }, () => anchor);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = ((i + 0.5) / n) * total; // centred arc-length position
    for (let k = 0; k < intervals.length; k++) {
      if (t <= widths[k] || k === intervals.length - 1) {
        out.push(intervals[k].start + Math.min(t, widths[k]));
        break;
      }
      t -= widths[k];
    }
  }
  return out;
}

// Postprandial band: the eating-relative window as a fraction of a nominal 2h lane
// (the axis reads `ate · {window}m · 2h+`). Clamped so a tiny or huge window still
// draws a legible band.
function postprandialBands(windowMinutes: number): LaneBand[] {
  const NOMINAL_MAX_MIN = 120;
  const end = Math.min(0.5, Math.max(0.12, windowMinutes / NOMINAL_MAX_MIN));
  return [{ start: 0, end }];
}

// Time-of-day band: the clock band as a fraction of the 24h lane, split into two
// segments when it wraps past midnight.
function timeOfDayBands(startHour: number, windowHours: number): LaneBand[] {
  const start = ((((startHour % 24) + 24) % 24) / 24);
  const w = Math.max(0, Math.min(24, windowHours)) / 24;
  const end = start + w;
  if (end <= 1) return [{ start, end }];
  return [
    { start, end: 1 },
    { start: 0, end: end - 1 },
  ];
}

/** The dot-lane geometry for a timing finding (§4 Shape A). One dot per timeable
 *  episode: `inCount` inside the named window, the rest (`eligibleCount − inCount`)
 *  outside but present — the exceptions are the honesty. Dots are returned in
 *  left-to-right order so the render is stable. */
export function dotLaneModel(finding: TimingFinding): DotLaneModel {
  const bands =
    finding.type === 'postprandial_timing'
      ? postprandialBands(finding.rapidWindowMinutes)
      : timeOfDayBands(finding.clusterStartLocalHour, finding.clusterWindowHours);
  const inCount = clampCount(
    finding.type === 'postprandial_timing' ? finding.rapidCount : finding.clusterCount,
    finding.eligibleCount,
  );
  const outCount = Math.max(0, clampCount(finding.eligibleCount, finding.eligibleCount) - inCount);
  const inPos = spreadInIntervals(bands, inCount);
  const outPos = spreadInIntervals(complementIntervals(bands), outCount);
  const dots: LaneDot[] = [
    ...inPos.map((pos) => ({ pos, inWindow: true })),
    ...outPos.map((pos) => ({ pos, inWindow: false })),
  ].sort((a, b) => a.pos - b.pos);
  const axis: [string, string, string] =
    finding.type === 'postprandial_timing'
      ? ['ate', `${finding.rapidWindowMinutes}m`, '2h+']
      : ['12am', '12pm', '12am'];
  return { dots, bands, axis };
}

/** True when the timeable-episode count exceeds the legibility cap, so the card-face
 *  strip degrades from the dot lane to the Shape C compare (§4). */
export function timingReceiptDegrades(finding: TimingFinding): boolean {
  return finding.eligibleCount > DOT_LANE_MAX;
}

// ══ Real-time distribution (Option A) — docs/nyx-postprandial-receipt-requirements.md ══
// The postprandial receipt's DEFAULT state plots each timeable episode at its TRUE
// minutes-after-eating, on an expanded-early scale so the clinically-relevant first
// half-hour is legible (D2). Pure + unit-tested; the renderer (PR 2) consumes it only
// when the detector ships `eligibleMinutes[]` (§5). Absent ⇒ the even-spread `dotLaneModel`
// fallback above, byte-identical to today. A confident cluster never renders on unreliable
// timing — the gate (`timingUnreliable`) routes those to the split (§2/§6).

// Expanded-early scale (§3): the first EARLY_MIN minutes take EARLY_FRAC of the lane; the
// rest of the nominal window compresses into the tail.
export const POSTPRANDIAL_EARLY_MIN = 30;
export const POSTPRANDIAL_EARLY_FRAC = 0.6;
export const POSTPRANDIAL_MAX_MIN = 120;

/** Fraction 0..1 along the lane for a minutes-since-feeding value, on the expanded-early
 *  scale. Clamped to [0, POSTPRANDIAL_MAX_MIN] (a late outlier pins to the lane end, never
 *  overflows). Monotonic non-decreasing, so left-to-right order === time order. */
export function postprandialPos(minutes: number): number {
  const m = Math.max(0, Math.min(minutes, POSTPRANDIAL_MAX_MIN));
  if (m <= POSTPRANDIAL_EARLY_MIN) return (m / POSTPRANDIAL_EARLY_MIN) * POSTPRANDIAL_EARLY_FRAC;
  return (
    POSTPRANDIAL_EARLY_FRAC +
    ((m - POSTPRANDIAL_EARLY_MIN) / (POSTPRANDIAL_MAX_MIN - POSTPRANDIAL_EARLY_MIN)) *
      (1 - POSTPRANDIAL_EARLY_FRAC)
  );
}

/** A single plotted episode: its lane fraction, whether it fell in the rapid window, and a
 *  deterministic vertical jitter ROW (0 centred, negative up, positive down) so near-ties
 *  don't overprint. Row → px is the renderer's call; the row keeps the geometry testable. */
export interface DistributionDot {
  pos: number;
  inWindow: boolean;
  jitterRow: number;
}
export interface DistributionAxisTick {
  pos: number;
  label: string;
}
export interface PostprandialDistributionModel {
  /** Left-to-right, ascending time. Length === eligibleCount. */
  dots: DistributionDot[];
  /** The rapid window as [0, bandEnd] fraction; the dashed edge is the boundary. */
  bandEnd: number;
  /** Median rapid timing as a lane fraction, or null when unknown. */
  medianPos: number | null;
  axis: DistributionAxisTick[];
}

// Minimum x-gap (lane fraction) before two dots are treated as colliding — about one 8px dot
// on a ~280px lane. A near-tie bumps to the next jitter row rather than overprinting.
const DIST_COLLISION_GAP = 0.03;

// Deterministic beeswarm rows for ASCENDING positions: greedily place each dot in the lowest
// row whose last dot is ≥ gap away, then map row index 0,1,2,3,4… to signed offsets
// 0,−1,+1,−2,+2… (alternating around the centre line). No RNG — tests can pin it.
function assignJitterRows(sortedPositions: number[]): number[] {
  const lastXByRow: number[] = [];
  return sortedPositions.map((x) => {
    let row = 0;
    while (lastXByRow[row] !== undefined && x - lastXByRow[row] < DIST_COLLISION_GAP) row++;
    lastXByRow[row] = x;
    return row === 0 ? 0 : row % 2 === 1 ? -Math.ceil(row / 2) : Math.ceil(row / 2);
  });
}

// The honest positioned axis — real minute values at their true (non-linear) positions, so
// "30m" sits on the window edge (postprandialPos(30) === EARLY_FRAC), fixing the shipped
// mid-lane mislabel. Coupled to the shipped 30-min rapid bucket; revisit if it goes per-finding.
const POSTPRANDIAL_AXIS: DistributionAxisTick[] = [
  { pos: 0, label: 'ate' },
  { pos: postprandialPos(15), label: '15m' },
  { pos: postprandialPos(30), label: '30m' },
  { pos: postprandialPos(60), label: '1h' },
  { pos: postprandialPos(120), label: '2h' },
];

/** True when the finding carries real per-episode timings (§5 payload shipped) — so the
 *  distribution state is renderable. Absent ⇒ the even-spread `dotLaneModel` fallback. */
export function hasRealTimings(finding: PostprandialTimingFinding): boolean {
  return Array.isArray(finding.eligibleMinutes) && finding.eligibleMinutes.length > 0;
}

/** The gate (§2/§7): render the honest split instead of a confident cluster when the detector
 *  could not stand behind the timing. FAIL-SAFE — real timings present but reliability unknown
 *  (undefined) counts as unreliable; only an explicit `timingReliable === true` clears the gate,
 *  so an un-vetted finding never defaults into the cluster. False when no real timings exist (the
 *  fallback path owns that case). */
export function timingUnreliable(finding: PostprandialTimingFinding): boolean {
  return hasRealTimings(finding) && finding.timingReliable !== true;
}

/** The distribution-state geometry (§3): one dot per timed-eligible episode at its true
 *  minutes-after-eating on the expanded-early scale, split in/out of the rapid window, with
 *  deterministic jitter, the median tick and the honest axis. Reads `eligibleMinutes`. Callers
 *  select this state per the §2 ordering — only when `hasRealTimings` AND not `timingUnreliable`
 *  (→ split) AND not `timingReceiptDegrades` (→ compare). */
export function postprandialDistributionModel(
  finding: PostprandialTimingFinding,
): PostprandialDistributionModel {
  // Drop any non-finite entry defensively (a malformed cache row degrades to fewer dots
  // rather than a NaN position — matching the median guard below); clamp to the lane, then
  // sort so left-to-right === time order.
  const minutes = (finding.eligibleMinutes ?? [])
    .filter((m) => Number.isFinite(m))
    .map((m) => Math.max(0, Math.min(m, POSTPRANDIAL_MAX_MIN)))
    .sort((a, b) => a - b);
  const positions = minutes.map(postprandialPos);
  const rows = assignJitterRows(positions);
  const dots: DistributionDot[] = minutes.map((m, i) => ({
    pos: positions[i],
    inWindow: m <= finding.rapidWindowMinutes,
    jitterRow: rows[i],
  }));
  const medianPos = Number.isFinite(finding.medianMinutesSinceFeeding)
    ? postprandialPos(finding.medianMinutesSinceFeeding)
    : null;
  return {
    dots,
    bandEnd: postprandialPos(finding.rapidWindowMinutes),
    medianPos,
    axis: POSTPRANDIAL_AXIS,
  };
}

// A compact clock range for a compare-row label: 4→8/4 → "4am–8am".
function hourRangeLabel(startHour: number, windowHours: number): string {
  const end = (startHour + windowHours) % 24;
  return `${clockHourLabel(startHour)}–${clockHourLabel(end)}`;
}

/** A stacked-compare row (§4 Shape C): a label, a printed count, and the tone its bar
 *  wears. `concern` = the pattern side (rose, the symptom hue used descriptively, as
 *  the dots are); `muted` = the control side (neutral); `calm` (teal) is reserved for
 *  a genuine before/after improvement compare — unused in SR-1, built for reuse. */
export interface CompareRow {
  label: string;
  count: number;
  tone: 'concern' | 'muted' | 'calm';
  /** OPTIONAL two-sided "N · was M" form (CUL-13 trial rows). When set, the count renders as
   *  "{count} · was {baseline}" and the bar scales against the max of BOTH counts across all rows,
   *  so a reduction reads as a shorter bar. Absent on every timing/⑤/⑥ row → the shipped single-count
   *  render, byte-identical (the flag-off / pre-CUL-13 contract). Never a verdict — G2's two-sided
   *  count is always safe (a zero is "0 · was 7", never an inverted "no empty-stomach vomiting"). */
  baseline?: number;
}

/** The two-sided compare for a timing finding — the pattern side vs the rest of the
 *  timeable episodes. Used both as the card-face receipt when the dot lane degrades,
 *  and as the expanded-state control side (§4). Both counts always printed. */
export function timingCompareRows(finding: TimingFinding): [CompareRow, CompareRow] {
  if (finding.type === 'postprandial_timing') {
    const inn = clampCount(finding.rapidCount, finding.eligibleCount);
    return [
      { label: `Within ${finding.rapidWindowMinutes} min of eating`, count: inn, tone: 'concern' },
      { label: 'Timed, but later', count: Math.max(0, finding.eligibleCount - inn), tone: 'muted' },
    ];
  }
  const inn = clampCount(finding.clusterCount, finding.eligibleCount);
  return [
    {
      label: hourRangeLabel(finding.clusterStartLocalHour, finding.clusterWindowHours),
      count: inn,
      tone: 'concern',
    },
    { label: 'Other times of day', count: Math.max(0, finding.eligibleCount - inn), tone: 'muted' },
  ];
}

/** The honest remainder line for a timing expand: the episodes that couldn't be
 *  placed against the window at all (§4 "N episodes weren't near any logged meal").
 *  Null when every episode was timeable (nothing to disclose). */
export function timingControlDisclosure(finding: TimingFinding): string | null {
  const untimed = Math.max(0, finding.totalEpisodes - finding.eligibleCount);
  if (untimed <= 0) return null;
  return finding.type === 'postprandial_timing'
    ? `${count(untimed, 'episode', 'episodes')} ${untimed === 1 ? "wasn't" : "weren't"} near any logged meal`
    : `${count(untimed, 'episode', 'episodes')} didn't have a clear enough time to place`;
}

/** A full-sentence a11y label for the dot lane (§11 "a11y labels are full sentences").
 *  Mirrors what the sample line already says, phrased as a sentence for a screen
 *  reader that lands on the strip. */
export function dotLaneA11yLabel(finding: TimingFinding): string {
  if (finding.type === 'postprandial_timing') {
    return `${finding.rapidCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} fell within ${finding.rapidWindowMinutes} minutes of eating.`;
  }
  return `${finding.clusterCount} of ${count(finding.eligibleCount, 'timed episode', 'timed episodes')} fell ${localHourBand(finding.clusterStartLocalHour, finding.clusterWindowHours)}.`;
}

/** A full-sentence a11y label for a stacked compare — reads the labelled counts in
 *  order so a screen reader hears the whole comparison, not two loose numbers. A two-sided
 *  row (CUL-13 trial) reads "…, 4, was 8" so the screen reader hears both counts; a single-
 *  count row is unchanged (byte-identical for every timing/⑤/⑥ caller). */
export function stackedCompareA11yLabel(rows: CompareRow[]): string {
  return rows.map((r) => (r.baseline != null ? `${r.label}, ${r.count}, was ${r.baseline}` : `${r.label}, ${r.count}`)).join('; ') + '.';
}

// ══ The A2 combined timing card (Signals v2 / B-755 / CUL-12, D1) ══════════════
// The timing_story card (both phenotypes) and the lone empty_stomach_timing card share
// this face + expand: a THREE-band Shape-C compare (≤30m / in between / 6h+, every count
// printed — S2, never a numerator-only visual), and an expand carrying per-phenotype dot
// lanes, the early-morning clock lane, the honest un-timeable remainder, the §5.4 med
// line, the L3 photographed-content lines, and a plain for-your-vet relay. Every string
// here is TIMING-ONLY: it names the band, never the syndrome ('empty stomach'/'bilious'
// are the vet's inference — the server bars them with MECHANISM_RE, and these hand-
// written strings stay clean by the same rule), never a food/form, never a cause, never a
// management suggestion (G1/G3). A below-floor phenotype is a small count in a band, never
// an inverted "no empty-stomach vomiting" claim (G2 — the counts are two-sided).

/** The A2 card's badge — a plain category tag, sibling to the correlation 'Early pattern'. */
export const TIMING_STORY_BADGE = 'Timing pattern';

// Normalized reads of the fields that sit in different places on the two shapes:
// timing_story nests the long/clock evidence under `.long`; empty_stomach_timing carries
// it at the top level. One accessor set so nothing downstream branches on the type again.
function longCountOf(f: TimingStoryLike): number {
  return f.type === 'timing_story' ? f.long.count : f.longCount;
}
function clockOf(
  f: TimingStoryLike,
): { band?: { startLocalHour: number; windowHours: number }; count?: number } {
  return f.type === 'timing_story'
    ? { band: f.long.clockBand, count: f.long.clockCount }
    : { band: f.clockBand, count: f.clockCount };
}
// ⑤'s config is a fixed 30 min; timing_story carries it, empty_stomach_timing doesn't (its
// meal lane treats the rapid boundary as a schematic axis tick, never a highlighted band).
function rapidBoundaryMinutes(f: TimingStoryLike): number {
  return f.type === 'timing_story' ? f.rapidWindowMinutes : 30;
}

/** The A2 meta sample line: "{eligible} timed of {total} episodes · {window} days" (the
 *  mock's meta row) — the honest denominator up front: how many of all the episodes could
 *  be placed against a meal at all. */
export function timingStorySampleLine(f: TimingStoryLike): string {
  return `${f.eligibleCount} timed of ${count(f.totalEpisodes, 'episode', 'episodes')} · ${f.windowDays} days`;
}

/** The A2 face — the three-band Shape-C compare over the shared eligible denominator, each
 *  count printed (S2). TIME-ORDERED (§4.1): ≤rapid / in between / ≥long, every label anchored
 *  to its boundary so the middle band never has to be inferred (pm-feature-review). The band
 *  that is a PATTERN wears the symptom hue (concern); the rest are muted. On the combined story
 *  BOTH ends are patterns (⑤ + L1 both fired); on a LONE empty-stomach card ⑤ did NOT fire, so
 *  its rapid band rides muted — matching the meal lane's paled rapid dots and the lead, which
 *  names only the long phenotype (a rose rapid band there would assert a pattern the card never
 *  found). Only the long band is ever unconditionally concern. */
export function timingStoryBandRows(f: TimingStoryLike): [CompareRow, CompareRow, CompareRow] {
  const mins = rapidBoundaryMinutes(f);
  const rapidTone: CompareRow['tone'] = f.type === 'timing_story' ? 'concern' : 'muted';
  return [
    { label: formatTimingBandLabel('rapid', mins, f.longGapHours), count: f.bandCounts.rapid, tone: rapidTone },
    { label: formatTimingBandLabel('mid', mins, f.longGapHours), count: f.bandCounts.mid, tone: 'muted' },
    { label: formatTimingBandLabel('long', mins, f.longGapHours), count: f.bandCounts.long, tone: 'concern' },
  ];
}

// The meal-relative lane's three zones as [start,end] fractions. Equal-ish thirds with the
// two phenotype ends as the highlightable bands; the middle is the in-between gap. The
// positions are schematic (the payload carries band COUNTS, not per-episode times), so the
// zones are legibility-sized, not time-proportional — the axis words label them.
const MEAL_LANE_ZONES = {
  rapid: { start: 0, end: 0.3 },
  mid: { start: 0.3, end: 0.7 },
  long: { start: 0.7, end: 1 },
} as const;

/** The A2 meal-relative dot lane (Shape A) — every timed-eligible episode placed in its
 *  band on an `ate · 30m · 2h · 6h+` axis. For the combined story BOTH phenotype bands
 *  (rapid + long) are highlighted; a lone empty-stomach card highlights only the long band
 *  (its rapid dots ride pale — present, but not this card's pattern). Positions are the
 *  honest even-spread WITHIN each zone (the dotLaneModel discipline — the split and the
 *  count are the facts, not a per-episode offset the payload can't back). */
export function timingStoryMealLaneModel(f: TimingStoryLike): DotLaneModel {
  // Unlike dotLaneModel's binary in/out split (where `out` is derived by subtraction), the A2
  // meal lane is a TERNARY split — rapid/mid/long are three independent payload counts — so each
  // is clamped to eligibleCount independently; a well-formed payload has them partition the
  // eligible set (dots.length === eligibleCount), and a malformed one degrades safely (the
  // renderer's DOT_LANE_MAX gate below reads dots.length, so an over-count simply hides the lane).
  const rapidIn = f.type === 'timing_story'; // a lone empty-stomach card's rapid band is not the pattern
  const zones: { zone: LaneBand; n: number; inWindow: boolean }[] = [
    { zone: MEAL_LANE_ZONES.rapid, n: f.bandCounts.rapid, inWindow: rapidIn },
    { zone: MEAL_LANE_ZONES.mid, n: f.bandCounts.mid, inWindow: false },
    { zone: MEAL_LANE_ZONES.long, n: f.bandCounts.long, inWindow: true },
  ];
  const dots: LaneDot[] = zones
    .flatMap(({ zone, n, inWindow }) =>
      spreadInIntervals([zone], clampCount(n, f.eligibleCount)).map((pos) => ({ pos, inWindow })),
    )
    .sort((a, b) => a.pos - b.pos);
  const bands: LaneBand[] = rapidIn
    ? [MEAL_LANE_ZONES.rapid, MEAL_LANE_ZONES.long]
    : [MEAL_LANE_ZONES.long];
  return { dots, bands, axis: ['ate', `${rapidBoundaryMinutes(f)}m`, '2h', `${f.longGapHours}h+`] };
}

/** The A2 early-morning clock lane (Shape A) — the LONG episodes placed by time of day,
 *  the concentration band highlighted (§2 L1: no separate clock card; the 2–8am fact is the
 *  empty-stomach card's evidence). Null when the finding carries no clock band (no valid
 *  timezone was available — never guessed, §4.2). */
export function timingStoryClockLaneModel(f: TimingStoryLike): DotLaneModel | null {
  const { band, count: inBand } = clockOf(f);
  if (!band || inBand == null) return null;
  const total = longCountOf(f);
  const bands = timeOfDayBands(band.startLocalHour, band.windowHours);
  const inCount = clampCount(inBand, total);
  const outCount = Math.max(0, clampCount(total, total) - inCount);
  const dots: LaneDot[] = [
    ...spreadInIntervals(bands, inCount).map((pos) => ({ pos, inWindow: true })),
    ...spreadInIntervals(complementIntervals(bands), outCount).map((pos) => ({ pos, inWindow: false })),
  ].sort((a, b) => a.pos - b.pos);
  return { dots, bands, axis: ['12am', '6am', '12pm', '6pm'] };
}

/** The honest un-timeable remainder (S2) — episodes we couldn't place against a meal at
 *  all. Null when every in-window episode was timeable (nothing to disclose). */
export function timingStoryControlDisclosure(f: TimingStoryLike): string | null {
  const untimed = Math.max(0, f.totalEpisodes - f.eligibleCount);
  if (untimed <= 0) return null;
  return `${count(untimed, 'episode', 'episodes')} ${untimed === 1 ? "wasn't" : "weren't"} near any logged meal — we can't time those.`;
}

/** L3 photographed-content lines (CUL-9 §2 L3) — present-only descriptors, each over its
 *  OWN "reads that answered" denominator. Every line is a plain sighting count; NONE
 *  reassures — a field is present only when its count ≥ 1, so "0 of N" is structurally
 *  impossible (G4, and most of all for hair: frequent hairballs are themselves a disease
 *  marker). No mechanism word, no determination — the descriptor travels, the label never
 *  does (the vet reads it). Empty when the finding carries no photo composition. */
export function photoCompositionLines(f: TimingStoryLike): string[] {
  const pc: PhotoComposition | undefined = f.photoComposition;
  if (!pc) return [];
  const reads = (n: number) => count(n, 'photo we could read', 'photos we could read');
  // Defend the present-only contract at the READ, exactly as medContextLine guards doseCount:
  // the server attaches a field only when count ≥ 1 (photoComposition.ts field()), but this reads
  // a CACHE, and a malformed/stale/regressed row with count 0 must NEVER render "Hair: 0 of N" —
  // the reassurance-on-absence G4 forbids outright (hair most of all: a hairball count of zero is
  // never an all-clear). `denominator ≥ count ≥ 1` also blocks a nonsensical "3 of 2". The guard
  // narrows each field, so no non-null assertions.
  const lines: string[] = [];
  const { retainedFood: rf, hair: hr, bile: bl } = pc;
  // Retained food is the LONG-band marker — food still recognizable long after eating is the
  // notable fact, so the line names the band it belongs to.
  if (rf && rf.count >= 1 && rf.denominator >= rf.count) {
    lines.push(`Recognizable food ${f.longGapHours}h or more after eating: ${rf.count} of ${reads(rf.denominator)}.`);
  }
  if (hr && hr.count >= 1 && hr.denominator >= hr.count) lines.push(`Hair: ${hr.count} of ${reads(hr.denominator)}.`);
  if (bl && bl.count >= 1 && bl.denominator >= bl.count) lines.push(`Bile: ${bl.count} of ${reads(bl.denominator)}.`);
  return lines;
}

/** The for-your-vet relay (§4.1 — descriptors, never labels): one plain sentence the owner can
 *  say to the vet. It LEADS with the fact the face hasn't already shown — the early-morning
 *  clustering — rather than reprinting the band counts a fourth time (pm-feature-review S10). No
 *  mechanism word, no syndrome — the timing itself is the useful detail. With no clock cluster to
 *  add, the relay ask itself is the content (never a re-count). */
export function timingStoryVetLine(f: TimingStoryLike): string {
  const { band, count: inBand } = clockOf(f);
  const photoTail = f.photoComposition ? ' Photos are attached to some of these.' : '';
  if (band && inBand != null) {
    return `The early-morning timing is worth flagging to your vet — ${inBand} of the ${count(longCountOf(f), 'episode', 'episodes')} ${f.longGapHours}h or more after eating fell ${localHourBand(band.startLocalHour, band.windowHours)}.${photoTail}`;
  }
  return `The timing here — how long after eating these come — is the useful detail to mention to your vet.${photoTail}`;
}

// The A2 card's OWN accessibilityLabel folds the three-band compare (the face receipt) via
// stackedCompareA11yLabel(timingStoryBandRows(...)), exactly as the ⑤/⑥ card folds its
// dot-lane sentence — the receipt Views are decorative (swallowed by the outer Pressable, per
// the InsightCard idiom). The expand's lanes carry no separate a11y label for the same reason
// the shipped SR-1 expand receipts don't: they sit inside that same Pressable, so their meaning
// rides the readable expand Text (control/vet/L3), never a swallowed self-label.

// ── The trial-response card (L2 — the wedge; Signals v2 / B-755 / CUL-13, §4.2) ────────────────
// The event-driven Signal trial card's client-composed pieces around the server lead sentence
// (`cached.text` — the pooled count comparison, direction-neutral): the two per-phenotype count
// rows, the day-count badge, the sample line, and the expand (RTM/confound verbatim + the §3.4
// adjacency + the logged-days density disclosure + the diet-structure context in words). Every
// string is guardrail-clean by construction: COUNT-ANCHORED, NEVER VERDICTED (no "working"/
// "improving"/"cleared"), NO attribution (G1), NO syndrome/mechanism (G3), and — being a Signal
// card — NO "%" (B-733). The D2 absence-shaped SENTENCE lead is NOT here (open, Dr. Chen gate); the
// count-row form below is the unconditional one (G2).

/** True for the trial-response finding — its own renderer + expand (CUL-13). */
export function isTrialResponse(finding: SignalFinding): finding is TrialResponseFinding {
  return finding.type === 'trial_response';
}

/** True for EVERY Signals-v2 finding type that renders only behind `signals_v2` — the timing-story
 *  pair (CUL-12) and the trial card (CUL-13). One predicate for the client-render gate, used by both
 *  InsightCard (skip the card when the flag is off) and SignalZone (drop the row so the divider
 *  rhythm + lead indexing stay correct). Flag-off ⇒ the shipped surface is byte-identical (§5 /
 *  FR-FLAG-2 / the G10 unknown-type contract): the server computes these uniformly for everyone, so a
 *  non-eligible cache DOES carry them, and this gate is what keeps them dark. */
export function isSignalsV2Finding(finding: SignalFinding): boolean {
  return isTimingStory(finding) || isTrialResponse(finding);
}

/** The §2 L2 RTM/confound honesty block — VERBATIM from the spec (mock B3). Three things changed at
 *  once, so a calm stretch can't yet attribute (Guilford 2001 / regression-to-the-mean). The one
 *  string; the client renders it above the §3.4 adjacency line in the expand. */
export const TRIAL_RTM_CONFOUND =
  "Three things changed at once when the trial started — the new food, far fewer treats, more and steadier meals. A calmer stretch can't yet say which one mattered, and calm stretches also happen on their own.";

/** The A2 count rows for the trial card — per-phenotype, TIME-ORDERED, each two-sided ("4 · was 8"
 *  via `CompareRow.baseline`; a zero renders "0 · was 7", never an inverted absence claim — G2).
 *  Labels are the SAME mechanism-free band labels the A2 timing card uses (`timingStoryBandRows`), so
 *  the two surfaces name the phenotypes identically and no owner copy ever says "empty stomach"
 *  (MECHANISM_RE). A phenotype PRESENT during the trial (trial count ≥ 1) wears the symptom hue used
 *  descriptively (the timing card's "a pattern wears the hue" rule); a phenotype at zero, and the
 *  in-between band, ride muted — the "· was N" text carries the two-sided fact.
 *
 *  B-766 — THREE bands (rapid ≤30m / mid 30m–6h / long ≥6h), the same partition the sibling A2 card
 *  draws. Before this the card showed only rapid + long, so the two rows summed to LESS than the
 *  pooled lead ("4 in the trial · 20 before" with rows "0 · 7" + "4 · 8" = 15, not 20) — the mid band
 *  and the un-timeable episodes were dropped with no disclosure, and "the numbers don't add up" is how
 *  a reactive owner stops trusting the numbers on the wedge's trust surface. The three bands now
 *  partition the TIMED-eligible episodes; `trialResponseTimedReconciliationLine` discloses the
 *  un-timeable remainder so rows + remainder = the pooled lead. `mid` absent (a cache written before
 *  B-766) ⇒ the pre-B-766 two-row form, byte-identical — never a crash, and the reconciliation line is
 *  null there too. */
export function trialResponseCompareRows(f: TrialResponseFinding): CompareRow[] {
  const rapidRow: CompareRow = {
    label: formatTimingBandLabel('rapid', f.rapidWindowMinutes, f.longGapHours),
    count: f.rapid.trial,
    baseline: f.rapid.baseline,
    tone: f.rapid.trial >= 1 ? 'concern' : 'muted',
  };
  const longRow: CompareRow = {
    label: formatTimingBandLabel('long', f.rapidWindowMinutes, f.longGapHours),
    count: f.long.trial,
    baseline: f.long.baseline,
    tone: f.long.trial >= 1 ? 'concern' : 'muted',
  };
  if (!f.mid) return [rapidRow, longRow]; // old cache — the pre-B-766 two-row face
  return [
    rapidRow,
    {
      label: formatTimingBandLabel('mid', f.rapidWindowMinutes, f.longGapHours),
      count: f.mid.trial,
      baseline: f.mid.baseline,
      tone: 'muted',
    },
    longRow,
  ];
}

/** B-766 — the un-timeable reconciliation line, so the trial card's count rows FOOT with the pooled
 *  lead. The three bands partition the episodes we could time to a meal; the lead counts EVERY
 *  vomiting episode. `pooled − (rapid + mid + long)` per window is the remainder that had no recent
 *  meal to place it against. This line names the timed-of-pooled split for both windows so the reader
 *  reconciles the (smaller) row sum with the (larger) lead — the same honesty the A2 card carries in
 *  its "N timed of M episodes" sample line. Null when there is nothing to reconcile: the pre-B-766
 *  cache (no `mid`, so no partition claim) or every episode was timeable in both windows (the rows
 *  already sum to the lead). Each fraction is WITHIN one window ("15 of 20 before"), never a cross-
 *  window magnitude, so the B-775 unequal-window read does not apply here. Count-anchored, never a
 *  verdict, never a mechanism word (G1/G3). */
export function trialResponseTimedReconciliationLine(f: TrialResponseFinding): string | null {
  if (!f.mid) return null;
  const timedTrial = f.rapid.trial + f.mid.trial + f.long.trial;
  const timedBaseline = f.rapid.baseline + f.mid.baseline + f.long.baseline;
  const untimeableTrial = Math.max(0, f.pooledTrialCount - timedTrial);
  const untimeableBaseline = Math.max(0, f.pooledBaselineCount - timedBaseline);
  if (untimeableTrial === 0 && untimeableBaseline === 0) return null;
  return `Timed to a meal: ${timedTrial} of ${f.pooledTrialCount} in the trial · ${timedBaseline} of ${f.pooledBaselineCount} before.`;
}

/** The day-count badge — "Day N of M" (target set) or "Day N" (unset). `target_duration_days` is the
 *  ONLY authority on trial length (never the elapsed days), matching the strip's own header. */
export function trialResponseDayBadge(f: TrialResponseFinding): string {
  return f.targetDurationDays != null
    ? `Day ${f.trialDayNumber} of ${f.targetDurationDays}`
    : `Day ${f.trialDayNumber}`;
}

/** The meta sample line — the C5 denominator disclosure in one glance ("counted from days you
 *  logged"), so the face never implies a per-calendar-day rate. */
export function trialResponseSampleLine(_f: TrialResponseFinding): string {
  return 'counted from days you logged';
}

/** Whole weeks the baseline window spans (49d → 7), for the "N weeks before" copy. Matches the
 *  server template's `Math.max(1, Math.round(baselineWindowDays / 7))`. */
function baselineWeeksOf(f: TrialResponseFinding): number {
  return Math.max(1, Math.round(f.baselineWindowDays / 7));
}

/** The logged-days density disclosure (§4.2) — the C5 denominators named, plus the honest caveat
 *  when the two stretches were NOT logged with comparable intensity (a MORE card can fire on uneven
 *  logging; the fewer direction is already gated server-side, §3.3). `densityComparable` absent on an
 *  old cache ⇒ treated as comparable (no caveat), matching the server's pre-gate behaviour. */
export function trialResponseDensityLine(f: TrialResponseFinding): string {
  const weeks = baselineWeeksOf(f);
  const base = `Counted from the days you logged — ${count(f.trialLoggedDays, 'day', 'days')} during the trial, ${f.baselineLoggedDays} in the ${weeks === 1 ? 'week' : `${weeks} weeks`} before.`;
  if (f.densityComparable === false) {
    return `${base} One stretch was logged more often than the other, so read the counts as a rough comparison.`;
  }
  return base;
}

// Coarse WORDS for a treat SHARE fraction (§4.2 — a Signal card carries no "%", B-733). Presentation
// buckets, NOT statistical thresholds (so no G6 clinical anchor): they turn a 0..1 share into the
// plain word an owner would use. Boundaries chosen to read naturally across the range; the diet-
// structure line only renders when two shares land in DIFFERENT buckets, so a boundary wobble can
// never flip a "no change" into a spurious "changed".
function treatShareWord(x: number): string {
  if (x <= 0) return 'none';
  if (x < 0.15) return 'a few';
  if (x < 0.4) return 'some';
  if (x < 0.6) return 'about half';
  if (x < 0.85) return 'most';
  return 'nearly all';
}

/** The diet-structure "what else changed" context (§2 L2 — the observable half of the RTM confound),
 *  in WORDS (no "%" on a Signal card, B-733) and NEVER a verdict (the RTM block already says a change
 *  "can't yet say which one mattered"). Two independent clauses: the treat SHARE (coarse words) and
 *  the MEALS-PER-DAY rate ("from about 2 to about 4"), each rendered only when both windows carry the
 *  value AND the values are meaningfully different (so an unchanged structure renders nothing, not a
 *  noisy "stayed the same"). Null when neither clause applies — the expand then shows no structure
 *  line, only the density disclosure. */
export function trialResponseDietStructureLine(f: TrialResponseFinding): string | null {
  const clauses: string[] = [];

  const { trial: treatT, baseline: treatB } = f.treatShare;
  if (treatT != null && treatB != null) {
    const wt = treatShareWord(treatT);
    const wb = treatShareWord(treatB);
    if (wt !== wb) clauses.push(`Treats went from ${wb} of the feedings to ${wt}.`);
  }

  const { trial: mealsT, baseline: mealsB } = f.mealsPerDay;
  if (mealsT != null && mealsB != null) {
    const rt = Math.round(mealsT);
    const rb = Math.round(mealsB);
    if (rt !== rb) clauses.push(`Meals a day went from about ${rb} to about ${rt}.`);
  }

  return clauses.length > 0 ? clauses.join(' ') : null;
}

/** The trial card's OWN accessibilityLabel folds the two count rows via
 *  `stackedCompareA11yLabel(trialResponseCompareRows(...))`, exactly as the ⑤/⑥/A2 cards fold their
 *  receipts (the outer Pressable swallows a self-label on the strip Views). The day badge is carried
 *  in the label too so VoiceOver hears the same day-count a sighted owner reads. */

// ── The safety phone-call script (§4 / §9) ────────────────────────────────────
// "Scripts convert, sirens don't" (session doc §1): the safety tap-through carries the
// facts to say on the phone — symptom, count, span, most recent — derived from the
// finding's structured fields. SR-1 ships this SANS the active-meds line (that rides
// SR-4's payload). Recency ("Most recent") renders ONLY where the payload carries it
// (chronicity, incident_red_flag), never invented. The strings are hand-written and
// guardrail-clean (asserted in the tests): descriptive facts, never a cause, never a
// severity verdict, never reassurance.

export interface PhoneScriptFact {
  label: string;
  value: string;
}

// UTC short date for a recency fact ("August 6") — matches onsetMonth's UTC bucketing
// (the engine days-bucket in UTC), so it stays pinnable in a fixture per B-514.
function shortDateUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The phone-call script facts for a SAFETY finding, or null for any other type (the
 *  script renders only on the safety expand). Each fact is one row (§4 phone script);
 *  the last recency row appears only when the payload carries a "most recent". */
export function phoneScript(finding: SignalFinding, petName: string): PhoneScriptFact[] | null {
  if (finding.type === 'symptom_worsening') {
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    const thisWeek =
      finding.trigger === 'more_days'
        ? `${count(finding.currentDays, 'day', 'days')} with ${symptom}`
        : `${count(finding.currentCount, 'episode', 'episodes')} on ${count(finding.currentDays, 'day', 'days')}`;
    const weekBefore =
      finding.trigger === 'more_days'
        ? count(finding.priorDays, 'day', 'days')
        : count(finding.priorCount, 'episode', 'episodes');
    return [
      { label: 'Sign', value: symptom },
      { label: 'This week', value: thisWeek },
      { label: 'Week before', value: weekBefore },
      { label: 'Watched over', value: `the last ${finding.windowDays} days` },
    ];
  }
  if (finding.type === 'symptom_chronicity') {
    const weeks = Math.round(finding.windowDays / 7);
    return [
      { label: 'Sign', value: SYMPTOM_LABEL[finding.symptomType] },
      { label: 'Ongoing since', value: onsetMonth(finding.firstOnsetIso) },
      {
        label: 'How often',
        value: `${count(finding.episodeCount, 'episode', 'episodes')} across ${finding.activeWeeks} of ${weeks} weeks`,
      },
      { label: 'Most recent', value: recencyPhrase(finding.daysSinceLastEpisode) },
    ];
  }
  if (finding.type === 'incident_red_flag') {
    const noun = INCIDENT_NOUN[finding.incidentType];
    return [
      { label: 'What a photo showed', value: `${incidentFlagPhrase(finding.flags)} in ${petName}'s ${noun}` },
      { label: 'From', value: count(finding.flaggedIncidentCount, 'logged photo', 'logged photos') },
      { label: 'Most recent', value: shortDateUTC(finding.mostRecentFlaggedIso) },
    ];
  }
  if (finding.type === 'intake_decline') {
    if (finding.trigger === 'refused_normal_food') {
      const food = truncateFoodLabel(finding.refusedFoodLabel);
      return [
        { label: 'Concern', value: 'refused a food normally eaten' },
        ...(food ? [{ label: 'Food', value: food }] : []),
        {
          label: 'Compared with',
          value:
            finding.ratedMealsConsidered > 0
              ? count(finding.ratedMealsConsidered, 'recent meal', 'recent meals')
              : 'what you usually log',
        },
      ];
    }
    return [
      { label: 'Concern', value: 'eating less than usual' },
      { label: 'How long', value: `${count(finding.daysBelowBaseline, 'day', 'days')} below the usual` },
      { label: 'Compared with', value: count(finding.ratedMealsConsidered, 'recent meal', 'recent meals') },
    ];
  }
  return null;
}

// ── Cross-pet safety banner (multi-pet §4, mock A3) ───────────────────────────
// A calm banner on the active pet's home when ANOTHER (non-active, non-archived)
// pet has a SAFETY-class finding cached. It can only ever ESCALATE attention — by
// construction it cannot reassure: it renders ONLY on a safety finding, and its
// absence is never an all-clear, because it is a cache read and a stale/missing
// cache renders nothing (§4). Reflections, correlations and the descriptive lanes
// NEVER cross over — only the two safety-lane types below.
//
// This module owns the PURE half: which pet's finding to surface (selection +
// ranking) and the template-only sentence. The cache I/O + freshness regen live
// in lib/signal.ts; the focus-effect + render live in the hook + component.

// The banner-eligible safety types, in cross-pet priority order (lower wins).
// incident_red_flag > intake_decline > symptom_chronicity > symptom_worsening — mirroring the
// engine's per-pet SAFETY_TYPE_ORDER (detection.ts §5), so the cross-pet surface can never imply a
// precedence between two safety lanes that contradicts the pet's own Signal.
// An explicit allow-list, NOT `priorityClass === 'safety'`: a future safety detector must be added
// here deliberately (with its own template + guardrail review) before it can reach this clinical
// escalation surface. incident_red_flag (B-340) is added deliberately here — it is the engine's
// top-ranked safety finding (a directly-photographed blood / foreign-body flag), and B-191's own
// rationale applies with full force: a SECONDARY pet whose only flag is a photographed red flag
// must be able to raise the banner, never stay silent while a lower-priority lane on another pet
// would. chronicity (⑦, B-182/B-191) slots below intake_decline; worsening is last.
const BANNER_SAFETY_PRIORITY: Record<
  'incident_red_flag' | 'intake_decline' | 'symptom_chronicity' | 'symptom_worsening',
  number
> = {
  incident_red_flag: 0,
  intake_decline: 1,
  symptom_chronicity: 2,
  symptom_worsening: 3,
};

export type BannerSafetyFinding =
  | IncidentRedFlagFinding
  | IntakeDeclineFinding
  | SymptomChronicityFinding
  | SymptomWorseningFinding;

function isBannerSafetyFinding(f: SignalFinding): f is BannerSafetyFinding {
  // Type-narrow via the explicit allow-list. All four are priorityClass 'safety' by
  // construction (asserted in the tests); the type union is the contract here.
  return (
    f.type === 'incident_red_flag' ||
    f.type === 'intake_decline' ||
    f.type === 'symptom_chronicity' ||
    f.type === 'symptom_worsening'
  );
}

// A pet's representative banner finding = its highest-priority banner-safety
// finding (incident_red_flag preferred, then intake_decline, then chronicity). Returns null if it
// has none — a pet whose only findings are reflections/correlations/descriptive can't raise a banner.
function petTopSafetyFinding(findings: CachedFinding[]): BannerSafetyFinding | null {
  let best: BannerSafetyFinding | null = null;
  for (const cf of findings) {
    const f = cf.finding;
    if (!isBannerSafetyFinding(f)) continue;
    if (best === null || BANNER_SAFETY_PRIORITY[f.type] < BANNER_SAFETY_PRIORITY[best.type]) {
      best = f;
    }
  }
  return best;
}

export interface BannerPetCandidate<P> {
  pet: P;
  findings: CachedFinding[];
}

export interface SelectedBanner<P> {
  pet: P;
  finding: BannerSafetyFinding;
}

// Pick the ONE cross-pet banner to show (§4: at most one, never stack). Across all
// candidate pets that have a banner-safety finding, choose the highest-priority
// finding (incident_red_flag > intake_decline > symptom_chronicity > symptom_worsening). Ties (two same-class flags) break
// by candidate order: the caller passes pets oldest-first, so the choice is
// deterministic and implies no false clinical precedence between them — the owner
// reaches the other pet via the switcher. Returns null if none qualifies.
//
// The caller MUST pass only non-active, non-archived pets. Excluding the active
// pet keeps its own safety finding in its Signal zone (no self-banner); the pet
// store holds only non-archived pets, so an archived pet can never be a candidate.
export function selectCrossPetSafetyFinding<P extends { id: string }>(
  candidates: BannerPetCandidate<P>[],
): SelectedBanner<P> | null {
  let best: SelectedBanner<P> | null = null;
  for (const c of candidates) {
    const finding = petTopSafetyFinding(c.findings);
    if (!finding) continue;
    // Strict `<` so the FIRST candidate wins a same-priority tie (stable order).
    if (
      best === null ||
      BANNER_SAFETY_PRIORITY[finding.type] < BANNER_SAFETY_PRIORITY[best.finding.type]
    ) {
      best = { pet: c.pet, finding };
    }
  }
  return best;
}

export interface BannerCopy {
  /** Full sentence — the a11y label + the guardrail-validation input. Always starts with the pet name. */
  text: string;
  /** The sentence with the leading pet name removed, so the name can render bold (mock A3). */
  rest: string;
}

// Template-only, derived from the finding's structured fields (§4): one specific,
// calm sentence that ESCALATES attention — never reassures, never implies a cause,
// never alarms. Tighter than the Signal templates (it's a teaser; the tap-through
// lands on the pet's full Signal where the calibrated ask lives). Plain symptom
// word (nyx-voice). The sentence always opens with the pet name so the component
// can bold it; `text === petName + rest` by construction.
export function bannerCopy(finding: BannerSafetyFinding, petName: string): BannerCopy {
  const rest = bannerRest(finding);
  return { text: `${petName}${rest}`, rest };
}

// A long free-text food label (the meal-log stores brand + product in TEXT
// columns) must not blow validateBannerPhrasing's length cap and silently suppress
// a REAL safety finding — so cap the rendered label, keeping the banner visible.
function truncateFoodLabel(label: string | null): string | null {
  const f = label?.trim();
  if (!f) return null;
  const MAX = 40;
  return f.length > MAX ? `${f.slice(0, MAX - 1).trimEnd()}…` : f;
}

// The sentence AFTER the pet name. The name is prepended by bannerCopy, so the
// rest never repeats it — it refers to the pet as "they" where needed (matching
// the Signal evidence copy), so the leading name can render bold once (mock A3).
function bannerRest(finding: BannerSafetyFinding): string {
  if (finding.type === 'incident_red_flag') {
    // Per-incident visual red flag (B-340) — the teaser names WHAT the logged photo showed
    // (blood / foreign material), calmly. "possible …" keeps it an unconfirmed AI read; the
    // tap-through lands on the pet's full Signal where the "worth a call to your vet" ask lives.
    // Never a cause, never a severity verdict, never a reassurance (validateBannerPhrasing screens
    // it as defense-in-depth). Refers to the pet by the leading bold name only (no "you"), like
    // the other banner rests.
    const phrase = incidentFlagPhrase(finding.flags);
    const noun = finding.flaggedIncidentCount === 1 ? 'a logged photo' : 'logged photos';
    return ` has ${noun} showing ${phrase} — worth a look.`;
  }
  if (finding.type === 'intake_decline') {
    if (finding.trigger === 'refused_normal_food') {
      const food = truncateFoodLabel(finding.refusedFoodLabel);
      // Names the refused food (intake, not a timing-only finding — naming it is
      // intended and clinically appropriate, as in the Signal template). With no
      // label, drop the trailing clause so the sentence doesn't read "a meal they
      // usually finish, which they usually finish" (code-review fix).
      return food
        ? ` turned down ${food}, which they usually finish — worth a look.`
        : ` turned down a meal they usually finish — worth a look.`;
    }
    const span =
      finding.daysBelowBaseline <= 1 ? 'today' : `for ${finding.daysBelowBaseline} days`;
    return ` has eaten less than usual ${span} — worth a look.`;
  }
  if (finding.type === 'symptom_chronicity') {
    // ⑦ (B-182/B-191) — DURATION, not a week-over-week delta. Anchor to the onset
    // month (matching the pet's own chronicity Signal copy, "Since {month}, …") so
    // the teaser reads as a recurring, still-unresolved course — the whole point of
    // the lane. "recurring … since {month}" is descriptive: never a cause, never a
    // severity verdict, never a resolution/reassurance claim (validateBannerPhrasing
    // screens it as defense-in-depth). The tap-through lands on the full Signal where
    // the tiered vet ask ("booking a vet visit" / "a word with your vet") lives.
    const symptom = SYMPTOM_LABEL[finding.symptomType];
    return ` has had recurring ${symptom} since ${onsetMonth(finding.firstOnsetIso)} — worth a look.`;
  }
  // symptom_worsening — name the symptom + the axis that actually rose, week over
  // week. Frequency only: "more ... this week than last", never "worse" (a severity
  // verdict) and never a cause.
  const symptom = SYMPTOM_LABEL[finding.symptomType];
  if (finding.trigger === 'more_days') {
    return ` has had ${symptom} on more days this week than last — worth a look.`;
  }
  return ` has had more ${symptom} this week than last — worth a look.`;
}

// ── Banner guardrail screen (validatePhrasing applied client-side, §4) ─────────
// Mirror of the generate-signal guardrail screens (phrasing.ts) — the RN bundle
// can't import the Deno module, so the regexes are duplicated here (same as the
// CachedFinding types and the clock-band helpers). KEEP IN SYNC with phrasing.ts.
// The banner is always safety-class, so reassurance / dismissive / causal are all
// barred, plus a banner-specific alarm screen (§4 / voice note: "never alarm").
const BANNER_REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|nothing serious|probably fine|no concern|don't worry|doing great|doing well|all good|on the mend|mend|mending|thriving|recover(?:s|ed|ing)?|much better|back to normal|right track)\b/i;
const BANNER_DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i;
const BANNER_CAUSAL_RE =
  /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic)|intoleran(?:t|ce)|reacts? to|leads? to|results? in)\b/i;
// Banner-specific: no urgency/panic vocabulary. The banner escalates attention
// calmly; the tiered ask ("book a vet visit soon" etc.) lives in the pet's own Signal.
const BANNER_ALARM_RE =
  /\b(emergency|urgent(?:ly)?|immediately|right away|danger(?:ous)?|critical|severe|asap|rush|alarm(?:ing)?)\b/i;

// validatePhrasing applies to the banner (§4): the template copy is guardrail-clean
// by construction, but this screens it as defense-in-depth. Any drift FAILS SAFE —
// the caller drops the banner (silence), never a bad escalation, never a reassurance.
export function validateBannerPhrasing(text: string): boolean {
  const t = text?.trim() ?? '';
  if (t.length < 8 || t.length > 200) return false;
  if (t.includes('!')) return false; // nyx-voice Pattern 4 — no manufactured alarm
  if (BANNER_REASSURANCE_RE.test(t)) return false;
  if (BANNER_DISMISSIVE_RE.test(t)) return false;
  if (BANNER_CAUSAL_RE.test(t)) return false;
  if (BANNER_ALARM_RE.test(t)) return false;
  return true;
}
