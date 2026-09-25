// The reads behind Home's spine (Design v2 — the whole day, D2-4 / CUL-1066).
//
// Four reads, each bounded to what the spine needs today, kept apart from the pure
// model (`lib/spineNode.ts`, `lib/monthCoverage.ts`) so the model is testable without a
// database and the reads are visible as reads. All four are local SQLite. The
// per-incident read used to be the one server fetch, so offline the spine drew no
// verdict at all; since HV-5 (CUL-1162) it is the phone's copy of the verdict
// (`lib/readCopy.ts`), decided by the one predicate every surface shares
// (`lib/readState.ts`). It is OBSERVE-ONLY: nothing in this file invokes an analyze-*
// function or writes the copy, and `guards/homeWrites.test.ts` would red a mutation
// here (it walks Home's closure by effect).

import { getDb } from './db';
import { readCopies } from './readCopy';
import {
  readFreeFedSpans,
  toFeedingRow,
  FEEDING_COLUMNS,
  type FeedingRow,
  type FeedingSqlRow,
} from './patternsTiming';
import { TIMING_SYMPTOM_TYPE } from './patternsTiming';
import type { FreeFedSpan, OnsetConfidence } from './mealTiming';
import type { MonthRow } from './monthCoverage';
import type { SpineAnalysisRow } from './spineNode';

// ── C-40: two ISO spellings of one instant do not compare as TEXT ─────────────
// A local write stores `…T04:00:00.000Z`; a hydrated row stores PostgREST's
// `…T04:00:00+00:00`; `'+'` sorts before `'.'`, so a lexical `>=` in SQL drops the
// hydrated row at the exact bound second. Every bounded read here therefore takes the
// SQL bound a whole day EARLY (a generous lexical pre-filter, never the decision) and
// decides the bound in JS on parsed instants.
const BOUND_SLACK_MS = 24 * 3_600_000;

function sqlBoundFor(sinceIso: string): { sqlSince: string; sinceMs: number } {
  const sinceMs = Date.parse(sinceIso);
  return { sqlSince: new Date(sinceMs - BOUND_SLACK_MS).toISOString(), sinceMs };
}

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
 * Patterns lane), bounded; the mapping is its mapping, the event id and the intake
 * rating included (a Refused bowl is never the meal a line is timed from — CUL-1122).
 */
export async function readFeedingsSince(petId: string, sinceIso: string): Promise<FeedingRow[]> {
  const { sqlSince, sinceMs } = sqlBoundFor(sinceIso);
  const rows = await getDb().getAllAsync<FeedingSqlRow>(
    `SELECT ${FEEDING_COLUMNS}
     FROM meals m
     JOIN events e ON e.id = m.event_id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
    [petId, sqlSince],
  );
  return rows.map(toFeedingRow).filter((r) => Number.isFinite(r.ms) && r.ms >= sinceMs);
}

/** The pet's vomit onsets from `sinceIso` on — the caller passes the day's start minus
 *  the lane's episode gap, so the collapse can run over the unbounded list before the
 *  day windows it (`lib/mealTiming.ts`; the adversarial pass, F2). */
export async function readVomitOnsetsSince(
  petId: string,
  sinceIso: string,
): Promise<{ ms: number; confidence: OnsetConfidence | null }[]> {
  const { sqlSince, sinceMs } = sqlBoundFor(sinceIso);
  const rows = await getDb().getAllAsync<{ occurred_at: string; occurred_at_confidence: string | null }>(
    `SELECT occurred_at, occurred_at_confidence FROM events
     WHERE pet_id = ? AND event_type = ? AND deleted_at IS NULL AND occurred_at >= ?`,
    [petId, TIMING_SYMPTOM_TYPE, sqlSince],
  );
  return rows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      confidence: (r.occurred_at_confidence as OnsetConfidence | null) ?? null,
    }))
    .filter((r) => Number.isFinite(r.ms) && r.ms >= sinceMs);
}

export { readFreeFedSpans };
export type { FreeFedSpan };

/** The phone's copy of these events' reads, by event id (HV-5 / CUL-1162). Local only,
 *  so offline the spine still draws "Worth a call". A failed local read returns an empty
 *  map: the node then shows a photographed incident as unread, never as calm (never a
 *  verdict the record did not hand over). The call signature is unchanged, because Home's
 *  pipeline calls it as it always has (HV-1's `lib/dayNodes.ts`). */
export async function readAnalysisRows(
  eventIds: readonly string[],
): Promise<Map<string, SpineAnalysisRow>> {
  if (eventIds.length === 0) return new Map();
  try {
    return await readCopies(eventIds);
  } catch (e) {
    console.warn('[spine] read copy failed:', e);
    return new Map();
  }
}

/** The same copy for a surface that keeps its last answer: `null` when the local read
 *  FAILED, so "no read on this phone" and "could not look" stay two answers (CUL-1198 item
 *  1, Home's half, History v2 HV-6). Home hands a photo to its pipeline only once this
 *  answered for the row, so a failed look never draws a photo nobody read, and never
 *  replaces a rose the card already had. */
export async function readAnalysisCopy(
  eventIds: readonly string[],
): Promise<Map<string, SpineAnalysisRow> | null> {
  if (eventIds.length === 0) return new Map();
  try {
    return await readCopies(eventIds);
  } catch (e) {
    console.warn('[spine] read copy failed:', e);
    return null;
  }
}

/** Every non-deleted row's instant AND type for this pet since `sinceIso` — the month
 *  door's population. The type rides along so `monthCoverage` can refuse a look (floor
 *  5) where a test can see it; the caller derives the day keys in the owner's zone. */
export async function readMonthRows(petId: string, sinceIso: string): Promise<MonthRow[]> {
  const { sqlSince, sinceMs } = sqlBoundFor(sinceIso);
  const rows = await getDb().getAllAsync<{ occurred_at: string; event_type: string }>(
    `SELECT occurred_at, event_type FROM events WHERE pet_id = ? AND deleted_at IS NULL AND occurred_at >= ?`,
    [petId, sqlSince],
  );
  return rows
    .filter((r) => {
      const ms = Date.parse(r.occurred_at);
      return Number.isFinite(ms) && ms >= sinceMs;
    })
    .map((r) => ({ occurredAt: r.occurred_at, eventType: r.event_type }));
}
