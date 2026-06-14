// AI summary — client cache read (B-023 PR 4).
//
// The "Patterns" dashboard's AI summary is CACHE-ONLY on open, exactly like the home
// Signal (lib/signal.ts): it reads the CachedSummary object the generate-signal Edge
// Function wrote to ai_signals.summary (migration 018). The dashboard NEVER makes a live
// LLM call on open (requirements §7 hard rule). Regeneration rides the Signal's own cadence
// — the same generate-signal run computes findings, coverage AND the summary — so the hook
// kicks the shared regenerateSignal() when the cached row is past its 24h TTL.
//
// This file is the I/O half (the supabase read); the pure display logic + cached shape live
// in lib/summaryCopy.ts (mirrors signal.ts vs signalCopy.ts). The read is deliberately
// fail-soft: pre-migration the `summary` column may not exist, so a read error degrades to
// "no summary yet" (the building state) rather than throwing onto the dashboard render path.

import { supabase } from './supabase';
import type { CachedSummary, SummaryCacheRow } from './summaryCopy';

// ── Cache read (RLS-scoped to the owner via the caller's session) ─────────────
// The Edge Function does delete-then-insert per pet, so there is at most one row; we still
// order by freshness and take one defensively (mirrors readSignalCache).
export async function readSummaryCache(petId: string): Promise<SummaryCacheRow | null> {
  try {
    const { data, error } = await supabase
      .from('ai_signals')
      .select('summary, expires_at')
      .eq('pet_id', petId)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const raw = (data.summary ?? null) as CachedSummary | null;
    return {
      // Treat a malformed / empty cached object as "no summary" so the card falls back to
      // its building state rather than rendering a blank.
      summary: raw && typeof raw.text === 'string' && raw.text.trim().length > 0 ? raw : null,
      expiresAt: data.expires_at as string,
    };
  } catch (e) {
    // Pre-migration the `summary` column may not exist (PostgREST errors the whole query),
    // or we may be offline. Degrade to "no summary yet", never throw onto the render path.
    console.warn('[summary] cache read failed:', e);
    return null;
  }
}
