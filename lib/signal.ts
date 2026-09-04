// AI Signal — client cache read + async regeneration (B-045 Step 3).
//
// The home Signal surface is CACHE-ONLY: it reads the ordered findings set that
// the generate-signal Edge Function wrote to ai_signals (migration 015). The home
// NEVER makes a live LLM call on open (spec §2 hard rule). Regeneration is async
// and happens off the render path:
//   - daily-expiry — the hook kicks a regen when the cached row is past expires_at
//   - debounced-after-log — a new event/meal schedules a single regen (below)
// In both cases the screen shows the last cached set (or the building/stale state)
// meanwhile; the regen updates the cache and the next cache read picks it up.
//
// This file is the I/O half (supabase reads + the regen invoke + the debounce
// timer). The pure, owner-facing copy + display-state logic lives in ./signalCopy
// so it can be unit-tested offline.

import { supabase } from './supabase';
import { useSyncStore } from '../store/syncStore';
import { syncPendingEvents, syncPendingMeals } from './sync';

// ── Client mirror of the cached finding shape ────────────────────────────────
// The jsonb column ai_signals.findings is the contract. These types mirror the
// fields the home renders from supabase/functions/generate-signal/{detection,
// phrasing}.ts (RankedFinding → CachedFinding). Mirrored, not imported, so the RN
// bundle never pulls in the Deno detection module. Source of truth for the full
// shape: detection.ts; keep these in sync if a rendered field is added there.

export type InsightType =
  | 'food_symptom_correlation'
  | 'intake_decline'
  | 'reflection'
  | 'symptom_worsening'
  | 'symptom_chronicity'
  | 'postprandial_timing'
  | 'timeofday_clustering'
  | 'incident_red_flag'
  // Signals v2 (B-755) — the decomposed timing lanes. `empty_stomach_timing` is L1's lone
  // card (CUL-7); `timing_story` is the merged ⑤+L1 A2 card (CUL-12); `trial_response` is the
  // event-driven trial card (L2, CUL-8/CUL-13). GA'd (CUL-548): the client renders these
  // whenever the payload carries them; the server's B-777 eligibility gate governs whether an
  // account's payload carries one (until GA-3). The G10 unknown-type contract still protects a
  // future lane merged ahead of its renderer.
  | 'empty_stomach_timing'
  | 'timing_story'
  | 'trial_response'
  // CUL-786 — the labeled stand-down marker. Not a detector output: minted by the engine's
  // shell when a chronicity course goes quiet on its recency floor. See StoodDownMarker.
  | 'stood_down';
export type PriorityClass = 'safety' | 'insight';
export type EvidenceTier = 'early' | 'established';
// W1 (CUL-676 PR-3a): cough + sneeze join the CLIENT mirror before the engine learns them
// (HR-2 release-order asymmetry) — the union carries every W1 leaf so a later engine config
// flip needs no client cut. A payload can still outrun an installed build's union (a future
// wave's type on an old build), which is why every label read goes through symptomWord().
export type SignalSymptomType =
  | 'vomit' | 'diarrhea' | 'itch' | 'scratch' | 'skin_reaction' | 'cough' | 'sneeze';
// The visible red-flag kinds a per-incident photo read can surface (B-340). Mirror of
// IncidentFlagKind in detection.ts; blood before foreign_material is the engine's stable order.
export type IncidentFlagKind = 'blood' | 'foreign_material';
// Mirror of detection.ts IncidentCategory — the coarse family a per-incident red flag belongs to.
// Stool ('stool_normal' + 'diarrhea' server-side) collapses to 'stool' with a NEUTRAL noun, so a
// blood flag on a formed stool never reads as "loose stool". Picks the owner-facing noun only.
export type IncidentCategory = 'vomit' | 'stool';
export type IntakeDeclineTrigger = 'consecutive_low' | 'refused_normal_food';
export type ReflectionDirection = 'flat' | 'improving';
export type WorseningTrigger = 'more_episodes' | 'more_days';
export type WorseningTier = 'firm' | 'standard' | 'soft';
// Chronicity urgency register (⑦, B-182) — duration-anchored, resolved in the engine
// (firm = ≥6-week span OR firm-inherited from a suppressed same-symptom ④). No 'soft':
// a symptom recurring for ≥3 weeks always points at the vet (§4.6).
export type ChronicityTier = 'standard' | 'firm';

// ── SR-4 additive payload facts (B-721) ───────────────────────────────────────
// The two decoration facts generate-signal attaches POST-detection (SR-4, #615) and
// the client consumes in SR-5. Both are OPTIONAL on the mirror for the same reason the
// slice-6 protein cluster is: `ai_signals.findings` is a cache with a 24h TTL, so after
// SR-4 deploys the client still reads rows written by the PREVIOUS deployment, which
// carry neither field. Every consumer must render byte-identically when they're absent
// (which is also the flag-off contract, FR-FLAG-2). Source of truth: detection.ts
// MedOnBoardContext / ReflectionDensity — keep in sync.

// Medication-on-board context (§5.4) — a nameable drug with ≥1 administered dose in the
// finding's context window. Attached to correlation + timing findings only; the client
// composes the §9 line ("During an active {drug} course — {n} doses logged.") around it.
export interface MedOnBoardContext {
  /** Owner-facing drug name (regimen drug_name preferred, else library brand/generic). Non-empty, VERBATIM owner text. */
  drugLabel: string;
  /** Administered on-board doses of this drug in the context window (missed/refused excluded). ≥1. */
  doseCount: number;
}

// Reflection logging-density comparison (§3.3) — the week-over-week "days-with-any-log"
// counts + whether they are comparable enough to trust a FALLING reflection's
// comparison. When `comparable` is false the server already withheld the "down from N"
// clause from the sentence (templateReflection); the client discloses WHY in the expand.
// Attached to reflection findings only.
export interface ReflectionDensity {
  /** Whether the two weeks' logging density is comparable enough to trust a falling comparison (§3.3). */
  comparable: boolean;
  /** Distinct UTC days carrying ANY logged event in the CURRENT window ("{a} this week"). */
  currentLoggingDays: number;
  /** Distinct UTC days carrying ANY logged event in the PRIOR window ("{b} last"). */
  priorLoggingDays: number;
}

// v1.1-b (CUL-787, fold spec §0 DF-9(b)) — the counted 4-week halves of the chronicity
// finding's own lookback, so the change an easing course shows can be said INSIDE the
// safety card's expand + phone script. The reflection lane is muted while any symptom is
// chronic (the engine's §4.4 valve), and this is the register that replaces F2's second
// calm card — never a card of its own, nothing on the face or in the sentence (§3.5).
// Both halves always carried (S2); `comparable` reuses the §3.3 density rule and only
// chooses which disclosure line sits beside a FALLING pair — a rising pair is never gated.
// Mirror of detection.ts ChronicityCompare — keep in sync. Attached to chronicity only.
export interface ChronicityCompare {
  /** Days per half (the lookback / 2 — 28) — the "{n} weeks" each half is labelled with. */
  halfDays: number;
  /** Collapsed episodes in the recent half [now − halfDays, now). */
  recentCount: number;
  /** Collapsed episodes in the prior half [now − 2·halfDays, now − halfDays). */
  priorCount: number;
  /** Distinct UTC days carrying any logged event in the recent half. */
  recentLoggingDays: number;
  /** Distinct UTC days carrying any logged event in the prior half. */
  priorLoggingDays: number;
  /** Whether the two halves were logged with comparable density (§3.3 — the SR-4 rule). */
  comparable: boolean;
}

export interface CorrelationFinding {
  type: 'food_symptom_correlation';
  priorityClass: 'insight';
  tier: EvidenceTier;
  symptomType: SignalSymptomType;
  /**
   * Owner-facing LABEL, never a key: one protein (`chicken`) or a whole collinearity
   * cluster named together (`chicken and duck`). See detection.ts CorrelationFinding
   * for why the joint case is carried in this field rather than a representative — the
   * short version is that a reader which knows nothing about clusters must still name
   * every implicated protein, so it can never exonerate one by omission.
   */
  protein: string;
  /**
   * The candidate's protein cluster — canonical keys, ascending (B-351 slice 6).
   *
   * OPTIONAL ON PURPOSE. `ai_signals.findings` is a cache with a 24h TTL, so after this
   * ships the client will read rows written by the PREVIOUS deployment of
   * generate-signal, which had no such field. Every consumer must therefore fall back
   * to `[protein]` rather than assume the array — see `proteinCluster`.
   */
  proteins?: string[];
  /** `proteins.length > 1` — statistically inseparable in this pet's logged diet. */
  jointCandidate?: boolean;
  /** Which resolving action the engine authorised for a joint candidate. Mirrors
   *  detection.ts; absent on a pre-slice-6 cached row (which is never joint anyway). */
  jointGuidance?: 'feed_apart' | 'ask_vet' | null;
  matchedPairs: number;
  symptomEventCount: number;
  correlationWindowHours: number;
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
}

// Per-incident visual red flag (B-340) — the SAFETY-class lane that elevates a blood /
// foreign-material flag from a photo the owner logged of a symptom onto the Home Signal, where
// "safety insights always lead" (Principle 3). Derived server-side from the owner-editable
// structured fields (override-aware by construction), so an owner clearing the field clears the
// card. ESCALATE-ON-PRESENCE, NEVER REASSURE (clinical-guardrails): it fires on the PRESENCE of a
// visible flag and routes to the vet; its absence is silence, never an all-clear. The main card
// sentence is the server template (templateIncidentRedFlag); the client composes the sample line +
// tap-to-expand evidence around it (lib/signalCopy.ts). Ranks at the TOP of the safety band.
// Mirror of detection.ts IncidentRedFlagFinding (rendered fields). incidentType is the coarse
// family ('vomit' B-340 / 'stool' B-364) — the same InsightType + renderer serve both; the
// category only picks the noun. The server emits at most one finding per family (a bloody vomit AND
// a bloody stool render as two cards — distinct nouns, keyed by `${type}-${rank}`, neither dropped).
export interface IncidentRedFlagFinding {
  type: 'incident_red_flag';
  priorityClass: 'safety';
  incidentType: IncidentCategory;
  flags: IncidentFlagKind[];
  mostRecentFlaggedIso: string;
  flaggedIncidentCount: number;
  windowDays: number;
}

export interface IntakeDeclineFinding {
  type: 'intake_decline';
  priorityClass: 'safety';
  trigger: IntakeDeclineTrigger;
  species: 'dog' | 'cat' | 'other';
  daysBelowBaseline: number;
  refusedFoodLabel: string | null;
  ratedMealsConsidered: number;
}

// Reflection (③, B-051) — descriptive symptom-count trend, no causal/wellness
// claim. Renders only for a flat or improving (falling) trend; ranks below safety
// and below correlations. Mirror of detection.ts ReflectionFinding (rendered fields).
export interface ReflectionFinding {
  type: 'reflection';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  currentCount: number;
  priorCount: number;
  direction: ReflectionDirection;
  windowDays: number;
  /** SR-4 (§3.3) — week-over-week logging density; absent otherwise (old cache / unparseable now). */
  density?: ReflectionDensity;
}

// Symptom-frequency worsening (④) — the SAFETY-class counterpart to reflection: a
// rising symptom trend (more episodes, or the same count spread across more days)
// that detector ③'s worsening gate suppresses. Descriptive frequency, never causal,
// never reassuring; leads the surface (below intake-decline). Mirror of detection.ts
// SymptomWorseningFinding (rendered fields). `tier` drives the copy urgency register.
export interface SymptomWorseningFinding {
  type: 'symptom_worsening';
  priorityClass: 'safety';
  symptomType: SignalSymptomType;
  currentCount: number;
  priorCount: number;
  currentDays: number;
  priorDays: number;
  trigger: WorseningTrigger;
  tier: WorseningTier;
  windowDays: number;
}

// Symptom chronicity / persistence (⑦, B-182) — the SAFETY-class lane that fires on
// DURATION + sustained burden + still-ongoing, orthogonal to ④'s week-over-week delta.
// It states the sentence the engine never said: "this has been going on for weeks and is
// not resolving." Descriptive duration/recurrence, never causal, never a severity verdict,
// never reassures; leads the surface (below intake-decline, above ④ — §5). Mirror of
// detection.ts SymptomChronicityFinding (rendered fields). `tier` drives the copy urgency
// register. The server-only `associationalOnly: true` marker is intentionally omitted (it is
// a phrasing-layer guardrail flag, not a rendered field — matching the ⑤/⑥ mirrors).
export interface SymptomChronicityFinding {
  type: 'symptom_chronicity';
  priorityClass: 'safety';
  symptomType: SignalSymptomType;
  episodeCount: number;
  spanDays: number;
  activeWeeks: number;
  symptomDays: number;
  daysSinceLastEpisode: number;
  firstOnsetIso: string;
  tier: ChronicityTier;
  windowDays: number;
  /** §9 cough↔vomit adjacency (CUL-676) — set by the engine's composition layer on the
   *  LEADING chronicity finding when this pet has both a chronic cough and a chronic
   *  vomiting course. Optional because every cached finding written before that engine
   *  version lacks it, and because most findings will never carry it. */
  coughVomitAdjacent?: true;
  /** v1.1-b (CUL-787) — the counted 4-week halves of this finding's lookback (expand + phone
   *  script only). Optional because every finding cached before that engine version lacks it,
   *  and an old cache renders exactly the pre-v1.1-b card. */
  compare?: ChronicityCompare;
}

// The labeled stand-down (CUL-786 — Signal fold v1.1-a; spec §0 DF-9(a)). NOT a finding: a
// marker the engine's shell mints when a chronicity course stopped firing on its recency floor
// (14 days; 28 for cough) with logging held across the gap, so the card can SAY it stood down
// instead of vanishing — "reassurance-by-absence wearing an honesty costume" (Dr. Chen). It
// rides the `findings` array so it occupies the card's former slot, but it is 'insight' class
// (never leads, never a rail, never the cross-pet banner) and every consumer other than the
// one-line renderer skips it via `isStoodDown`. The server composes `text` (Dr. Chen's line,
// template-only); the client renders that text and nothing else. Mirror of standDown.ts
// StoodDownMarker (rendered fields). Expires on the client STOOD_DOWN_TTL_DAYS after
// `stoodDownAt` even if the cache never regenerates — the one place a clock is read here,
// because the spec's bound is "seven days pass".
export interface StoodDownMarker {
  type: 'stood_down';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  /** The recency floor that fired, in days — the "in 14 days" of the line. */
  recencyDays: number;
  /** The tier the card LAST carried — decides which conditional ask survived. */
  tier: ChronicityTier;
  /** ISO-8601 UTC of the most recent logged episode. */
  lastEpisodeIso: string;
  /** ISO-8601 UTC of the regen that minted the marker. */
  stoodDownAt: string;
  /** The rank the chronicity card held before it stood down. */
  formerRank: number;
}

// The marker's helpers (`isStoodDown`, `stoodDownExpired`, STOOD_DOWN_TTL_DAYS) live in
// lib/signalCopy.ts: this module imports the live supabase client, and the Signal surface's
// component tests render against the pure copy module.

// Rapid post-prandial timing (⑤, B-078) — a descriptive count of timed vomiting
// episodes that happened within `rapidWindowMinutes` of eating, over an explicit
// eligible denominator. ASSOCIATIONAL/anamnesis only: the owner surface names TIMING,
// never a food/cause/mechanism (§9.1/§9.2). An 'insight' (cap-subject), ranked below
// safety and below correlations. Mirror of detection.ts PostprandialTimingFinding
// (rendered fields). `feedingFormsInEvidence` is carried for the Step-9 vet report; the
// owner copy does not render it (§9.1).
export interface PostprandialTimingFinding {
  type: 'postprandial_timing';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  rapidCount: number;
  eligibleCount: number;
  totalEpisodes: number;
  rapidWindowMinutes: number;
  lastTwoEligibleRapid: boolean;
  medianMinutesSinceFeeding: number;
  feedingFormsInEvidence: string[];
  windowDays: number;
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
  /** Real-time distribution (Option A — docs/nyx-postprandial-receipt-requirements.md §5).
   *  Every timed-eligible episode's minutes-since-nearest-feeding (in- and out-of-window), so the
   *  client can plot the true distribution instead of an even-spread. Length === eligibleCount.
   *  Additive-optional (the medContext pattern above): absent on a row cached before the payload
   *  shipped ⇒ the even-spread `dotLaneModel` fallback renders, byte-identical to today. */
  eligibleMinutes?: number[];
  /** The detector's judgment that "minutes since feeding" is meaningful for this pet/window (§7).
   *  false/undefined ⇒ the gated split (fail-safe: only an explicit `true` clears the gate). Ships
   *  together with `eligibleMinutes`; its exact predicate is validation-gated (§7). */
  timingReliable?: boolean;
}

// Time-of-day clustering (⑥, B-079) — a descriptive count of witnessed vomiting episodes
// that fall in one band of the pet's LOCAL day, over an explicit witnessed denominator.
// ASSOCIATIONAL/anamnesis only: names a clock band, never a cause or mechanism (§4.5). An
// 'insight' (cap-subject), ranked below safety and below correlations, and MUTUALLY
// EXCLUSIVE with ⑤ (⑤ wins — §4.4). Mirror of detection.ts TimeOfDayClusteringFinding
// (rendered fields). `timezone` is carried so the Step-9 vet report can render the clock
// band in the pet's local time; owner copy renders the local band words, not the raw zone.
// TRUST & SAFETY (B-085): the raw IANA zone is coarse-location-adjacent — it is engine
// input only and must NOT be rendered verbatim into the vet report or any share surface.
// When Step 9 resumes, derive the band words from it and drop the zone string; never print
// 'America/New_York'. The server-only `associationalOnly: true` marker
// is intentionally omitted — like the ⑤ and correlation mirrors, it is a phrasing-layer
// guardrail flag, not a rendered field, so the client mirror carries only what it renders.
export interface TimeOfDayClusteringFinding {
  type: 'timeofday_clustering';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  clusterStartLocalHour: number;
  clusterWindowHours: number;
  clusterCount: number;
  eligibleCount: number;
  totalEpisodes: number;
  timezone: string;
  windowDays: number;
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
}

// ── L3 photo-record composition (Signals v2 / B-755 / CUL-9 §2 L3) ────────────
// Additive photographed-content EVIDENCE decorated onto a vomit timing finding
// POST-detection (never a finding type, never a fire gate). PRESENT-ONLY by
// construction: a field is attached ONLY when its `count` ≥ 1, so a zero is
// SILENCE, never "0 of N" — hair especially never reassures (G4). Each field's
// `denominator` is "reads that answered this question" (yes|no), never the raw
// episode count. Mirror of detection.ts PhotoComposition / PhotoCompositionField
// (rendered fields); OPTIONAL on the finding for the cache-tolerance reason the
// medContext block above documents (an old cached row carries neither).
export interface PhotoCompositionField {
  /** Photographed-and-analyzed episodes whose completed read AFFIRMS the marker (`yes`). ≥1 when present. */
  count: number;
  /** Reads that returned a definite yes OR no on this marker. Always ≥ count, ≥1 when the field is present. */
  denominator: number;
}
export interface PhotoComposition {
  /** Recognizable/partially-digested food in the LONG band (empty_stomach_timing / timing_story only). */
  retainedFood?: PhotoCompositionField;
  /** Hair in the completed vomit reads. NEVER reassures (G4) — present-only, regex-screened in copy. */
  hair?: PhotoCompositionField;
  /** Bile in the completed vomit reads (the authoritative bile field, migration 013). */
  bile?: PhotoCompositionField;
}

// Empty-stomach timing (L1, Signals v2 / B-755 / CUL-7 — the ⑤ mirror). The LONE
// empty-stomach card: of the vomiting episodes we could time, how many happened
// ≥ `longGapHours` (6h — §0 D10) after the last feeding. ASSOCIATIONAL/anamnesis
// ONLY, exactly like ⑤: owner copy names the TIMING BAND, never the syndrome
// ('empty stomach'/'bilious' are the vet's inference — MECHANISM_RE), never a
// food/form, never a feeding-schedule suggestion (G3). A below-floor result is
// SILENCE, never inverted. Mirror of detection.ts EmptyStomachTimingFinding
// (rendered fields); the server-only `associationalOnly` / `longEpisodeOnsets`
// markers are omitted (the ⑤/⑥ mirror convention — carry only what renders).
// Renders whenever the payload carries it (GA'd, CUL-548); no confidence tag (it
// shows its sample size). Ranks with the timing lane.
export interface EmptyStomachTimingFinding {
  type: 'empty_stomach_timing';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  /** Eligible episodes ≥ longGapHours after the last feeding (the numerator). */
  longCount: number;
  /** The honest denominator: timed-eligible episodes (the SAME set ⑤ counts). */
  eligibleCount: number;
  /** The three-band split over the eligible denominator (rapid ≤30m / mid / long ≥6h) — the A2 face. */
  bandCounts: { rapid: number; mid: number; long: number };
  /** All in-window vomit episodes (any confidence) — "of N total, M could be timed". */
  totalEpisodes: number;
  /** The empty-stomach band boundary in HOURS (6; feline gastric-emptying anchor, §0 D10). */
  longGapHours: number;
  /** The two most-recent eligible episodes are both long — powers recency salience. */
  lastTwoEligibleLong: boolean;
  /** Median HOURS-since-feeding across the long episodes — the actual observed timing (evidence). */
  medianHoursSinceFeeding: number;
  /** Forms of the feedings before the long episodes — vet-report parity ONLY, never the claim (§9.1). */
  feedingFormsInEvidence: string[];
  /** Clock concentration of the LONG episodes (evidence — the 2–8am fact renders in the expand). Absent
   *  when no valid timezone was available; NEVER a fire gate. Paired with clockCount or both absent. */
  clockBand?: { startLocalHour: number; windowHours: number };
  /** Count of long episodes in `clockBand` (of `longCount`). */
  clockCount?: number;
  /** The analysis window in days (bounds the denominator to the pet's current era). */
  windowDays: number;
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
  /** L3 (CUL-9 §2 L3) — photographed-content evidence; absent otherwise (old cache / no photos). */
  photoComposition?: PhotoComposition;
}

// The combined timing card (A2 — Signals v2 / B-755 / CUL-7 / CUL-12, D1). A
// COMPOSITION-ONLY finding: emitted server-side when BOTH ⑤ (postprandial) AND L1
// (empty-stomach) fire for the SAME symptom, so one card face carries both
// phenotypes rather than two cards saying overlapping things. A lone ⑤ stays
// `postprandial_timing`; a lone L1 stays `empty_stomach_timing`. Same guardrail
// class as its parts: timing only, no syndrome name, no food-naming, no advice.
// Mirror of detection.ts TimingStoryFinding (rendered fields). Renders whenever the
// payload carries it (GA'd, CUL-548).
export interface TimingStoryFinding {
  type: 'timing_story';
  priorityClass: 'insight';
  symptomType: SignalSymptomType;
  /** The three-band split over the shared eligible denominator (the A2 Shape-C compare face). */
  bandCounts: { rapid: number; mid: number; long: number };
  /** The honest shared denominator: timed-eligible episodes (⑤ and L1 measure the identical set). */
  eligibleCount: number;
  /** All in-window vomit episodes (any confidence) — "of N total, M could be timed". */
  totalEpisodes: number;
  /** The rapid bucket boundary in minutes (30; from ⑤'s config). */
  rapidWindowMinutes: number;
  /** The empty-stomach band boundary in hours (6; from L1's config). */
  longGapHours: number;
  /** The analysis window in days (⑤ and L1 share it). */
  windowDays: number;
  /** ⑤'s phenotype evidence — always present in a timing_story (the merge only fires when ⑤ did). */
  rapid: {
    count: number;
    medianMinutesSinceFeeding: number;
    lastTwoEligible: boolean;
    feedingFormsInEvidence: string[];
  };
  /** L1's phenotype evidence — always present in a timing_story (the merge only fires when L1 did). */
  long: {
    count: number;
    medianHoursSinceFeeding: number;
    lastTwoEligible: boolean;
    feedingFormsInEvidence: string[];
    clockBand?: { startLocalHour: number; windowHours: number };
    clockCount?: number;
  };
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
  /** L3 (CUL-9 §2 L3) — photographed-content evidence; absent otherwise (old cache / no photos). */
  photoComposition?: PhotoComposition;
}

// The event-driven trial card (L2 — the wedge; Signals v2 / B-755 / CUL-8 / CUL-13, D3). Surfaces
// on Home ONLY when the pooled trial-era-vs-baseline vomit contrast "changed materially"
// (detectTrialResponse's emission IS the trigger); the standing Pet-tab strip line shows the
// trial-so-far counts regardless, from local data (lib/trialResponseCounts). The card is
// COUNT-ANCHORED / TIME-ORDERED / NEVER VERDICTED (Guilford 2001 — diet response ≠ proof; RTM): the
// server lead sentence (cached.text) states the two pooled counts in time order and routes to the
// vet; the client renders per-phenotype count rows (rapid ≤30m / long ≥6h, each two-sided
// "N · was M" — G2), a day-count badge, and an expand carrying the three-things-changed-at-once
// confound honesty verbatim + the §3.4 adjacency line + the logged-days density disclosure. NO
// attribution (G1), NO syndrome name / management advice (G3). The D2 absence-shaped SENTENCE lead
// is NOT here — it ships only on Dr. Chen's sign-off (open); the count-row form is unconditional.
// Mirror of detection.ts TrialResponseFinding (rendered fields); renders whenever the payload
// carries it (GA'd, CUL-548).
export interface TrialResponseFinding {
  type: 'trial_response';
  priorityClass: 'insight';
  /** Day N of the trial (1-based) — the badge "Day N" / "Day N of M". */
  trialDayNumber: number;
  /** The trial's prescribed length M ("day N of M"); null when unset ⇒ "day N", no "of M". */
  targetDurationDays: number | null;
  /** Distinct logged days in the trial era — the C5 denominator, disclosed in the expand. */
  trialLoggedDays: number;
  /** Distinct logged days in the baseline window — the C5 denominator, disclosed in the expand. */
  baselineLoggedDays: number;
  /** The baseline window's span in days (49) — the "N weeks before" the density line names. */
  baselineWindowDays: number;
  /** Pooled VOMIT-episode burden in the trial era (the lead sentence already carries it). */
  pooledTrialCount: number;
  /** Pooled VOMIT-episode burden in the baseline window. */
  pooledBaselineCount: number;
  /** Per-phenotype VOMIT-TIMING counts, trial vs baseline — the A2 count rows ("4 · was 8").
   *  `rapid` = ≤rapidWindowMinutes after eating; `mid` = the 30 min–longGapHours middle band;
   *  `long` = ≥longGapHours after eating. B-766: rapid + mid + long PARTITION the timed-eligible
   *  episodes (the ones we could place against a meal), so `pooled − (rapid + mid + long)` per window
   *  is the un-timeable remainder — the fields that let the card FOOT with the pooled lead. `mid` is
   *  absent on a finding cached before B-766 (old cache) — treat undefined as 0 (the pre-B-766 face,
   *  never a crash). */
  rapid: { trial: number; baseline: number };
  mid?: { trial: number; baseline: number };
  long: { trial: number; baseline: number };
  /** The rapid band boundary in minutes (30) — the rapid row label. */
  rapidWindowMinutes: number;
  /** The empty-stomach band boundary in hours (6) — the long row label. */
  longGapHours: number;
  /** Diet-structure deltas (§2 L2 context — the observable half of the RTM confound). `treatShare`
   *  = treat feedings ÷ classifiable feedings (0..1), null when nothing classifiable; `mealsPerDay`
   *  = meal feedings ÷ logged days, null when the window has no logged days. Rendered in WORDS in
   *  the expand (no "%" on a Signal card — B-733 SIGNAL_PERCENT_RE), never a verdict. */
  treatShare: { trial: number | null; baseline: number | null };
  mealsPerDay: { trial: number | null; baseline: number | null };
  /** The pooled direction the finding fired on. The copy is direction-NEUTRAL (the reader sees which
   *  count is higher); carried for the client's own context, never rendered as "more"/"fewer". */
  comparisonDirection: 'more_during_trial' | 'fewer_during_trial';
  /** Whether the two windows were logged with comparable INTENSITY (§3.3). Gates the fewer direction
   *  server-side; the client discloses "we logged less often this stretch" when false. Absent on a
   *  finding cached before the symmetric-gate fix (old cache) — treat undefined as comparable. */
  densityComparable?: boolean;
  /** The trial-era span in days — evidence parity with the report. */
  trialWindowDays: number;
  /** SR-4 (§5.4) — medication on board in the context window; absent otherwise (old cache / no course). */
  medContext?: MedOnBoardContext;
}

export type SignalFinding =
  | CorrelationFinding
  | IncidentRedFlagFinding
  | IntakeDeclineFinding
  | ReflectionFinding
  | SymptomWorseningFinding
  | SymptomChronicityFinding
  | PostprandialTimingFinding
  | TimeOfDayClusteringFinding
  | EmptyStomachTimingFinding
  | TimingStoryFinding
  | TrialResponseFinding
  | StoodDownMarker;

export interface CachedFinding {
  rank: number;
  text: string;
  finding: SignalFinding;
}

// ── Coverage diagnostics (B-053) ──────────────────────────────────────────────
// The "why is there no signal yet?" reasons for the no_pattern surface. Mirror of
// detection.ts CoverageDiagnostic (rendered fields). Cached in the SEPARATE
// ai_signals.coverage column (migration 017), never in `findings` — they describe
// the ABSENCE of a signal and its cause, not a detected pattern, and must never be
// picked up by code iterating the live findings stack. Ranked ACTION before
// EXPLANATION; the surface shows the top one. Per §9 these are about DATA COVERAGE,
// never wellness — "no pattern" is never an all-clear. (The string-literal union
// aliases CoverageDiagnosticType / CoverageActionability live in detection.ts; the
// client needs only the concrete shapes, so they are not re-exported here unused.)

export interface RateMealsDiagnostic {
  type: 'rate_meals';
  actionability: 'action';
  ratedMeals: number;
  ratedMealsNeeded: number;
}

// Where the dominant staple shows up — drives the honest copy register (B-070). Mirror of
// detection.ts StapleSource; the copy must never claim "every meal" when it is treat-borne.
export type StapleSource = 'meals' | 'treats' | 'mixed';

export interface StapleWashoutDiagnostic {
  type: 'staple_washout';
  actionability: 'explanation';
  protein: string;
  // Retained for parity with the cached shape + future copy (e.g. citing the count);
  // coverageCopy() does not render it today.
  symptomEpisodes: number;
  // B-070: resolved in the engine so coverageCopy() picks a register matching the staple's
  // structure (a treat-borne staple is NOT "every meal" — a false premise could misdirect).
  // OPTIONAL on the CLIENT (unlike the engine, which always writes it): a staple_washout row
  // cached BEFORE B-070 shipped has no such field. The 24h TTL bounds that window, and
  // coverageCopy() defaults a missing value to the safe day-based 'mixed' register.
  stapleSource?: StapleSource;
}

// B-080 diet-structure observations (descriptive lane Phase 3), rendered in the
// coverage lane per the §9.3 PM decision. Mirror of detection.ts; coverageCopy()
// renders gapDays/windowDays (collapse) and novelFoodCount (churn). The remaining
// fields ride for parity with the cached shape + the Step-9 vet report.
export interface MealTypeCollapseDiagnostic {
  type: 'meal_type_collapse';
  actionability: 'explanation';
  gapDays: number;
  loggedDays: number;
  treatsPerDayMedian: number;
  windowDays: number;
}

export interface DietChurnDiagnostic {
  type: 'diet_churn';
  actionability: 'explanation';
  novelFoodCount: number;
  symptomEpisodesInWindow: number;
  windowDays: number;
}

export type CoverageDiagnostic =
  | RateMealsDiagnostic
  | StapleWashoutDiagnostic
  | MealTypeCollapseDiagnostic
  | DietChurnDiagnostic;

export interface SignalCacheRow {
  signalText: string | null;
  isBuilding: boolean;
  findings: CachedFinding[];
  coverage: CoverageDiagnostic[];
  /** When the engine counted (the row's `generated_at`) — the anchor for the chronicity
   *  strip's fallback last-episode date (CUL-785). Null on a row written before the column
   *  was selected here (never in practice: the column has always had a default). */
  generatedAt: string | null;
  expiresAt: string;
}

// ── Cache read (RLS-scoped to the owner via the caller's session) ─────────────
// The Edge Function does delete-then-insert per pet, so there is at most one row;
// we still order by freshness and take one defensively.
export async function readSignalCache(petId: string): Promise<SignalCacheRow | null> {
  const { data, error } = await supabase
    .from('ai_signals')
    .select('signal_text, is_building, findings, coverage, generated_at, expires_at')
    .eq('pet_id', petId)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    signalText: (data.signal_text as string) ?? null,
    isBuilding: (data.is_building as boolean) ?? true,
    findings: Array.isArray(data.findings) ? (data.findings as CachedFinding[]) : [],
    coverage: Array.isArray(data.coverage) ? (data.coverage as CoverageDiagnostic[]) : [],
    generatedAt: (data.generated_at as string | null) ?? null,
    expiresAt: data.expires_at as string,
  };
}

// No cached row, or the row is past its 24h TTL → a fresh regen is due.
export function isSignalCacheStale(row: SignalCacheRow | null, nowMs = Date.now()): boolean {
  if (!row) return true;
  const exp = Date.parse(row.expiresAt);
  if (Number.isNaN(exp)) return true;
  return exp <= nowMs;
}

// ── Regeneration ──────────────────────────────────────────────────────────────
// generate-signal recomputes detection over the pet's data IN SUPABASE (not local
// SQLite), then phrases + writes the cache. So we flush the offline queue first,
// or the function computes on stale server data and the new event is invisible to
// it. Mirrors lib/analysis.ts:triggerVomitAnalysis. Fire-and-forget friendly:
// returns the error rather than throwing.
export function regenerateSignal(petId: string): Promise<{ error: string | null }> {
  return serializeRegen(petId, () => runRegen(petId));
}

// ── One regen at a time, per pet (CUL-642) ────────────────────────────────────
// The debounce collapses rapid triggers, but `clearTimeout` can only cancel a
// timer that has not FIRED yet. Once it has, a fresh trigger schedules a SECOND,
// independent regen beside the first — and `generate-signal` writes the cache with
// a plain delete-then-insert and no version guard, so whichever invocation reaches
// the server last wins. On the delete path that is the whole defect back again:
// a removal at t=5.001s (or any History Remove, which is untethered from the card's
// dwell entirely) leaves a regen already in flight over a record that still holds
// the removed event, and if that one settles last it re-caches the stale finding
// with a fresh 24h TTL. The re-arm alone closes only the sub-case where the
// reversal beats its own log's timer, which is the example the issue happens to
// name — not the general case. (code-reviewer, CUL-642; reproduced with a slow
// first invoke and a fast second.)
//
// So the LAST regen to settle is made the FRESHEST one, by refusing to run two at
// once for a pet. Same shape as `serializeQueuePush` (lib/sync.ts, CUL-622) and the
// same four rules, which are load-bearing there for reasons that hold here too:
//
//   · the trailing slot is checked BEFORE the in-flight slot — the active run's
//     `.finally` clears its slot several microtask jobs before the trailing run
//     starts, and a caller landing in that window would otherwise start a third
//     run beside the pending trailing one;
//   · a caller arriving mid-run joins the TRAILING run, never the active one — the
//     active run may already have pushed and invoked, so it cannot be promised to
//     reflect a change made after it started;
//   · the trailing run calls `startRegen`, never `serializeRegen` — recursing
//     defeats the ceiling, because past it the slot is still held;
//   · the wait is BOUNDED. Past the ceiling a trailing run goes anyway, so a hung
//     invoke degrades to exactly the concurrent behaviour this had before, never to
//     a new failure mode where a removal's regen never runs at all.
const REGEN_WAIT_CEILING_MS = 15_000;

const regenInFlight = new Map<string, Promise<{ error: string | null }>>();
const regenTrailing = new Map<string, Promise<{ error: string | null }>>();

function settledOrCeiling(active: Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    const ceiling = setTimeout(resolve, REGEN_WAIT_CEILING_MS);
    active.catch(() => {}).then(() => {
      clearTimeout(ceiling);
      resolve();
    });
  });
}

function serializeRegen(
  petId: string,
  run: () => Promise<{ error: string | null }>,
): Promise<{ error: string | null }> {
  const waiting = regenTrailing.get(petId);
  if (waiting) return waiting;

  const active = regenInFlight.get(petId);
  if (!active) return startRegen(petId, run);

  const trailing = settledOrCeiling(active).then(() => {
    regenTrailing.delete(petId);
    return startRegen(petId, run);
  });
  regenTrailing.set(petId, trailing);
  return trailing;
}

function startRegen(
  petId: string,
  run: () => Promise<{ error: string | null }>,
): Promise<{ error: string | null }> {
  // Identity-checked, not a bare delete: past the ceiling a newer run owns the slot
  // while this one is still outstanding, and clearing it then would let a third
  // caller start beside the run that is genuinely active.
  const started = run().finally(() => {
    if (regenInFlight.get(petId) === started) regenInFlight.delete(petId);
  });
  regenInFlight.set(petId, started);
  return started;
}

async function runRegen(petId: string): Promise<{ error: string | null }> {
  try {
    await syncPendingEvents().catch(() => {});
    await syncPendingMeals().catch(() => {});
    const { error } = await supabase.functions.invoke('generate-signal', {
      body: { petId },
    });
    if (!error) {
      // A successful regen wrote a fresh cache. Bump the signal tick so the Home
      // Signal (useSignal) and the cross-pet safety banner (useCrossPetSafetyBanner)
      // re-read it without waiting for a screen re-focus — closes the B-150 window
      // where a non-active pet's RESOLVED finding lingered on the banner.
      useSyncStore.getState().bumpSignalTick();
    }
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── All-active-pets freshness + cross-pet read (multi-pet §4) ─────────────────
// The home Signal regen must cover EVERY active pet, not just the one whose home
// is open, so the cross-pet safety banner has a fresh cache to read. The active
// pet is covered by useSignal; this covers the rest. For each pet: read its cached
// signal (the banner needs the findings) and, if the cache is stale/missing, kick
// an OFF-PATH daily-expiry regen — exactly like the active pet's path, never a live
// call on the render. The banner uses whatever is cached NOW; a stale/missing cache
// for another pet renders nothing (acceptable v1 degradation, §4) and the kicked
// regen makes the next visit fresh. The after-log debounce stays per-logged-pet
// (triggerSignalRegenDebounced, below) — unchanged. Never throws.
export async function readSignalsAndRefresh(
  petIds: string[],
): Promise<Map<string, CachedFinding[]>> {
  const byPet = new Map<string, CachedFinding[]>();
  for (const petId of petIds) {
    try {
      const row = await readSignalCache(petId);
      if (isSignalCacheStale(row)) {
        regenerateSignal(petId).catch(() => {});
      }
      byPet.set(petId, row?.findings ?? []);
    } catch {
      // Unreadable cache (offline / never generated) → no findings → no banner for
      // this pet. Silence, never an all-clear.
      byPet.set(petId, []);
    }
  }
  return byPet;
}

// ── Debounced-after-log regen ─────────────────────────────────────────────────
// Called from the log flow after an event/meal is saved (spec §2 freshness rule).
// A debounce collapses rapid logs (a meal + the symptom that followed, logged in
// one sitting) into a single regen, so we don't fan out phrasing calls or race
// several generate-signal invocations. Per-pet timer; fire-and-forget.
const REGEN_DEBOUNCE_MS = 5000;

// B-721 SR-3 (§5.3) — the acknowledgment line's ceiling PAST the debounced regen:
// fail-quiet if the regen hangs, so "Noted — updating …" never strands. Renewed on each
// log (below), so a sustained burst can't clip it before the final regen lands.
// Comfortably over a live regen; a legitimately slower one just lands without the line.
const ACK_REGEN_BUDGET_MS = 10000;

const regenTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ackCeilingTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Monotonic per-pet generation so an EARLIER regen still in flight can't clear the ack
// that belongs to a NEWER log. The race it closes: a debounce fires and immediately
// deletes its timer, then a new log arrives before that regen's network call has resolved
// — clearTimeout can't cancel an in-flight call, so two regens run concurrently and the
// first to SETTLE would otherwise clear the flag while the latest is still pending.
const regenGeneration = new Map<string, number>();

/**
 * Drop every pending regen and its acknowledgment state (CUL-642, rls-privacy-reviewer).
 *
 * Called from `wipeLocalSession`, because these maps are ACCOUNT STATE resting in JS
 * memory — the same FR-9 parity rule that already puts the App Group, the moment
 * store and the trial-context cache in that teardown. A pending timer holds the
 * signing-out account's pet UUID, and `supabase.functions` resolves its Authorization
 * header at REQUEST time, not at arming time: so a timer armed by account A and left
 * to fire after account B signs in on a shared device invokes `generate-signal` with
 * A's pet id under B's identity. B's RLS refuses the pet (404 before any event read,
 * so no health data crosses), but `record_ai_usage` is SECURITY DEFINER and takes its
 * scope id straight from the body — leaving A's pet UUID persisted under B's row,
 * readable by B and includable in a B-039 export. Reproduced end to end.
 *
 * WHAT THIS CANNOT DO, stated rather than implied: an invocation already on the wire
 * cannot be recalled. That one carries the OUTGOING account's own token, so it stays
 * within its own account — it can cause a recompute of a record this device has just
 * wiped, which is untidy rather than a leak. Clearing `regenGeneration` also makes any
 * such straggler's `.finally` a no-op (its generation is gone, so the guard returns
 * early), which is why the ack state cannot be re-raised after this runs.
 */
export function cancelPendingSignalRegens(): void {
  for (const t of regenTimers.values()) clearTimeout(t);
  regenTimers.clear();
  for (const t of ackCeilingTimers.values()) clearTimeout(t);
  ackCeilingTimers.clear();
  regenGeneration.clear();
  // The serializer's slots go too: holding a signed-out account's in-flight promise
  // would make the next account's first regen for that pet id wait behind it.
  regenInFlight.clear();
  regenTrailing.clear();
  useSyncStore.setState({ signalAcknowledging: {} });
}

export function triggerSignalRegenDebounced(petId: string, delayMs = REGEN_DEBOUNCE_MS): void {
  const existing = regenTimers.get(petId);
  if (existing) clearTimeout(existing);
  const existingCeiling = ackCeilingTimers.get(petId);
  if (existingCeiling) clearTimeout(existingCeiling); // renew the ceiling on each log

  // B-721 SR-3 (§5.3) — raise the acknowledgment flag the moment a fresh log schedules a
  // regen, so the Home Signal can show the quiet "Noted — updating …" line. The LATEST
  // log's regen clears it (the generation guard in .finally below — success OR failure,
  // fail-quiet, never an error surface). The setter no-ops when already up, so a burst is
  // idempotent at the store.
  const generation = (regenGeneration.get(petId) ?? 0) + 1;
  regenGeneration.set(petId, generation);
  useSyncStore.getState().setSignalAcknowledging(petId, true);

  ackCeilingTimers.set(
    petId,
    setTimeout(() => {
      ackCeilingTimers.delete(petId);
      useSyncStore.getState().setSignalAcknowledging(petId, false);
    }, delayMs + ACK_REGEN_BUDGET_MS),
  );

  regenTimers.set(
    petId,
    setTimeout(() => {
      regenTimers.delete(petId);
      // regenerateSignal never rejects (it catches internally), but keep the .catch so a
      // future contract change can't strand the ack line up.
      regenerateSignal(petId)
        .catch(() => {})
        .finally(() => {
          // Only the latest log's regen clears the ack — a superseded earlier call that
          // happens to settle first leaves the line up for the newer one still in flight.
          if (regenGeneration.get(petId) !== generation) return;
          const ceiling = ackCeilingTimers.get(petId);
          if (ceiling) {
            clearTimeout(ceiling);
            ackCeilingTimers.delete(petId);
          }
          useSyncStore.getState().setSignalAcknowledging(petId, false);
        });
    }, delayMs),
  );
}
