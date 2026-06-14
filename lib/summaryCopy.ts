// AI summary — PURE display logic + the cached shape (B-023 PR 4).
//
// The pure half of the dashboard summary, kept free of the supabase import (mirrors
// signalCopy.ts vs signal.ts) so it is unit-testable offline and so a component importing
// only copy/types (AiSummaryCard) never drags the supabase client into its render path.
// The I/O (the cache read) lives in lib/summary.ts.

// ── Client mirror of the cached summary shape ────────────────────────────────
// The jsonb column ai_signals.summary is the contract; this mirrors the server's
// CachedSummary (supabase/functions/generate-signal/summary.ts). Mirrored, not imported, so
// the RN bundle never pulls in the Deno module — same discipline as lib/signal.ts.
export type SummaryEvidenceKind = 'symptom' | 'intake';

export interface CachedSummary {
  /** 2–4 warm, plain-language sentences. Every number traces to a deterministic clause. */
  text: string;
  /** Phrasing provenance (observability only — never rendered to the owner). */
  source: 'model' | 'template';
  /** Dashboard areas the summary draws from — drives the grounding affordance. */
  evidence: SummaryEvidenceKind[];
  /** A safety finding leads the summary (styling cue; never used to soften copy). */
  hasSafety: boolean;
  /** No finding drove it — purely descriptive. */
  quiet: boolean;
}

export interface SummaryCacheRow {
  summary: CachedSummary | null;
  expiresAt: string;
}

// No cached row, or the row is past its 24h TTL → a fresh regen is due. Mirrors
// isSignalCacheStale (the summary shares the ai_signals row + its expires_at).
export function isSummaryCacheStale(row: SummaryCacheRow | null, nowMs = Date.now()): boolean {
  if (!row) return true;
  const exp = Date.parse(row.expiresAt);
  if (Number.isNaN(exp)) return true;
  return exp <= nowMs;
}

export type SummaryDisplayState = 'ready' | 'building';

/** 'ready' once there is a cached summary with text; otherwise 'building' (cold start, a
 *  pet without enough to summarise, or pre-deploy). Pure — unit-tested. */
export function deriveSummaryState(summary: CachedSummary | null): SummaryDisplayState {
  return summary && summary.text.trim().length > 0 ? 'ready' : 'building';
}

/**
 * The dashboard summary's "still gathering" copy (§10 calibration voice). Warm, specific,
 * forward-looking — and NEVER an all-clear (the summary's whole job is honesty about what is
 * and isn't known, so its empty state must not reassure either). nyx-voice: no "!", first
 * person, addresses the owner. Pure — unit-tested for the never-reassure invariant.
 */
export function summaryBuildingCopy(petName: string): string {
  const who = petName.trim().length > 0 ? petName : 'your pet';
  return `I'm still gathering ${who}'s patterns into a summary. Keep logging and it'll show up here.`;
}

/** Plain-language grounding line naming the areas the summary draws from (§7 "show the
 *  work"). Pure — unit-tested. */
export function summaryGroundingLabel(evidence: SummaryEvidenceKind[]): string {
  const parts: string[] = [];
  if (evidence.includes('symptom')) parts.push('symptom');
  if (evidence.includes('intake')) parts.push('meal');
  if (parts.length === 0) return 'Based on the cards below';
  const joined = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts[0];
  return `Based on the ${joined} cards below`;
}
