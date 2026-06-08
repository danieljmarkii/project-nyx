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
import { syncPendingEvents, syncPendingMeals } from './sync';

// ── Client mirror of the cached finding shape ────────────────────────────────
// The jsonb column ai_signals.findings is the contract. These types mirror the
// fields the home renders from supabase/functions/generate-signal/{detection,
// phrasing}.ts (RankedFinding → CachedFinding). Mirrored, not imported, so the RN
// bundle never pulls in the Deno detection module. Source of truth for the full
// shape: detection.ts; keep these in sync if a rendered field is added there.

export type InsightType = 'food_symptom_correlation' | 'intake_decline' | 'reflection';
export type PriorityClass = 'safety' | 'insight';
export type EvidenceTier = 'early' | 'established';
export type SignalSymptomType = 'vomit' | 'diarrhea' | 'itch' | 'scratch' | 'skin_reaction';
export type IntakeDeclineTrigger = 'consecutive_low' | 'refused_normal_food';
export type ReflectionDirection = 'flat' | 'improving';

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

export type SignalFinding = CorrelationFinding | IntakeDeclineFinding | ReflectionFinding;

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
// never wellness — "no pattern" is never an all-clear.
export type CoverageDiagnosticType = 'rate_meals' | 'staple_washout';
export type CoverageActionability = 'action' | 'explanation';

export interface RateMealsDiagnostic {
  type: 'rate_meals';
  actionability: 'action';
  ratedMeals: number;
  ratedMealsNeeded: number;
}

export interface StapleWashoutDiagnostic {
  type: 'staple_washout';
  actionability: 'explanation';
  protein: string;
  symptomEpisodes: number;
}

export type CoverageDiagnostic = RateMealsDiagnostic | StapleWashoutDiagnostic;

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
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
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
