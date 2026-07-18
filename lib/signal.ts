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
  | 'incident_red_flag';
export type PriorityClass = 'safety' | 'insight';
export type EvidenceTier = 'early' | 'established';
export type SignalSymptomType = 'vomit' | 'diarrhea' | 'itch' | 'scratch' | 'skin_reaction';
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

export interface CorrelationFinding {
  type: 'food_symptom_correlation';
  priorityClass: 'insight';
  tier: EvidenceTier;
  symptomType: SignalSymptomType;
  protein: string;
  matchedPairs: number;
  symptomEventCount: number;
  correlationWindowHours: number;
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
}

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
}

export type SignalFinding =
  | CorrelationFinding
  | IncidentRedFlagFinding
  | IntakeDeclineFinding
  | ReflectionFinding
  | SymptomWorseningFinding
  | SymptomChronicityFinding
  | PostprandialTimingFinding
  | TimeOfDayClusteringFinding;

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
  expiresAt: string;
}

// ── Cache read (RLS-scoped to the owner via the caller's session) ─────────────
// The Edge Function does delete-then-insert per pet, so there is at most one row;
// we still order by freshness and take one defensively.
export async function readSignalCache(petId: string): Promise<SignalCacheRow | null> {
  const { data, error } = await supabase
    .from('ai_signals')
    .select('signal_text, is_building, findings, coverage, expires_at')
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
export async function regenerateSignal(petId: string): Promise<{ error: string | null }> {
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
const regenTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function triggerSignalRegenDebounced(petId: string, delayMs = REGEN_DEBOUNCE_MS): void {
  const existing = regenTimers.get(petId);
  if (existing) clearTimeout(existing);
  regenTimers.set(
    petId,
    setTimeout(() => {
      regenTimers.delete(petId);
      regenerateSignal(petId).catch(() => {});
    }, delayMs),
  );
}
