// The reads behind Home's spine (Design v2 — the whole day, D2-4 / CUL-1066).
//
// Four reads, each bounded to what the spine needs today, kept apart from the pure
// model (`lib/spineNode.ts`, `lib/monthCoverage.ts`) so the model is testable without a
// database and the reads are visible as reads. Three are local SQLite; one — the
// per-incident read — is the server's `event_ai_analysis`, which has no local mirror
// (the sections read it the same way). That one is OBSERVE-ONLY: nothing in this file
// invokes an analyze-* function, and `guards/homeWrites.test.ts` would red a mutation
// here (it walks Home's closure by effect).

import { getDb } from './db';
import { supabase } from './supabase';
import { readFreeFedSpans, foodLabelOf, type FeedingRow } from './patternsTiming';
import type { FreeFedSpan, OnsetConfidence } from './mealTiming';
import type { SpineAnalysisRow } from './spineNode';

/** Which of these events carry at least one attachment — the photo GLYPH's fact. */
export async function readPhotographedIds(eventIds: readonly string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const marks = eventIds.map(() => '?').join(', ');
  const rows = await getDb().getAllAsync<{ event_id: string }>(
    `SELECT DISTINCT event_id FROM event_attachments WHERE event_id IN (${marks})`,
    [...eventIds],
  );
  return new Set(rows.map((r) => r.event_id));
}

/**
 * The feedings the lane would time today's vomits against: this pet's meals from
 * `sinceIso` on — the caller passes today's start minus the lookback, so last night's
 * bowl is in scope for a 6 AM episode. The SAME SQL shape `readFeedingRows` runs (the
 * Patterns lane), bounded; the mapping is its mapping.
 */
export async function readFeedingsSince(petId: string, sinceIso: string): Promise<FeedingRow[]> {
  const rows = await getDb().getAllAsync<{
    occurred_at: string;
    occurred_at_confidence: string | null;
    food_type: string | null;
    brand: string | null;
    product_name: string | null;
  }>(
    `SELECT e.occurred_at, e.occurred_at_confidence, f.food_type, f.brand, f.product_name
     FROM meals m
     JOIN events e ON e.id = m.event_id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
    [petId, sinceIso],
  );
  return rows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      confidence: (r.occurred_at_confidence as OnsetConfidence | null) ?? null,
      form: foodLabelOf(r.brand, r.product_name) ?? r.food_type ?? null,
      foodType: r.food_type,
    }))
    .filter((r) => Number.isFinite(r.ms));
}

export { readFreeFedSpans };
export type { FreeFedSpan };

/** The observed reads for these events, by event id. RLS scopes the rows to the owner.
 *  A failed read returns an empty map — the node then says nothing about the read, which
 *  is the honest degrade (never a verdict the record did not hand over). */
export async function readAnalysisRows(
  eventIds: readonly string[],
): Promise<Map<string, SpineAnalysisRow>> {
  const out = new Map<string, SpineAnalysisRow>();
  if (eventIds.length === 0) return out;
  const { data, error } = await supabase
    .from('event_ai_analysis')
    .select('event_id, status, recommendation, read_text, dismissed_at')
    .in('event_id', [...eventIds]);
  if (error) {
    console.warn('[spine] analysis read failed:', error.message);
    return out;
  }
  for (const row of (data ?? []) as SpineAnalysisRow[]) out.set(row.event_id, row);
  return out;
}

/** Every non-deleted row's instant for this pet since `sinceIso` — the month door's
 *  population. The caller derives the day keys (`monthCoverage`) in the owner's zone. */
export async function readMonthOccurredAts(petId: string, sinceIso: string): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events WHERE pet_id = ? AND deleted_at IS NULL AND occurred_at >= ?`,
    [petId, sinceIso],
  );
  return rows.map((r) => r.occurred_at);
}
