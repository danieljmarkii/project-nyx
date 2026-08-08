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
  IncidentCategory,
  IncidentFlagKind,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  SignalFinding,
  SignalSymptomType,
  StapleSource,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimeOfDayClusteringFinding,
} from './signal';

// A timing finding — the two types whose evidence renders as a receipt (SR-1, §4).
type TimingFinding = PostprandialTimingFinding | TimeOfDayClusteringFinding;

/** True for the two timing findings — the only types that render a card-face strip
 *  (§4 assignments). Exported so the renderer can narrow without re-importing the
 *  concrete types. */
export function isTimingFinding(finding: SignalFinding): finding is TimingFinding {
  return finding.type === 'postprandial_timing' || finding.type === 'timeofday_clustering';
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
  /** Exactly three evenly-spaced axis words under the lane (§4 "minimal axis words"). */
  axis: [string, string, string];
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
 *  order so a screen reader hears the whole comparison, not two loose numbers. */
export function stackedCompareA11yLabel(rows: CompareRow[]): string {
  return rows.map((r) => `${r.label}, ${r.count}`).join('; ') + '.';
}

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
