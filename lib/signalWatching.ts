// The Signal's gap warning (Signals v2 B-755 / CUL-14's gap lane; the quiet line, CUL-1838).
// Spec: docs/nyx-signals-v2-requirements.md §4.4 and §2 L4, G6 (every constant carries its
// anchor), G9 (one predicate, server-faithful); CUL-1838's build note for the logged-time clock.
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
//
// "Gaps between vomiting episodes are getting shorter — 12 days, then 7, then 3." An
// escalate-only fact about the record, read from local SQLite at render time because it
// lives BELOW the server's firing floor: L4 (`detectGapShortening`, detection.ts) emits a
// `gap_shortening` finding only on a 4-gap run, while this row speaks at the 3-gap
// watching floor its config reserves for "PR 7's client row". Every other gate is
// server-faithful (G9): the 180-day era, the strict decrease (G5), the ratio gate, the 2×
// recency guard — except that the guard's clock is LOGGED time (CUL-1838, below).
//
// Home has no title for the server's `gap_shortening` finding (CUL-1218), so the zone
// draws this row for it too: a lone server finding no longer reads as a drawable `live`
// set (CUL-1941), and alongside other findings the row sits under the stack.

import { getDb } from './db';
import { collapseEpisodes, DEFAULT_MEAL_TIMING_CONFIG, type OnsetConfidence } from './mealTiming';
import { median, readVomitOnsets } from './patternsTiming';
import { watchingGapRowFromHours } from './signalCopy';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// ── CUL-1838: the gap lane is the watching system's one survivor ─────────────────
// The timing ("N of the 6 episodes a pattern needs") and change ("This is week N") rows
// retired with the quiet line: they were progress toward a Signal, which round 7 of the
// Signal mock stopped promising. The gap row stays because it is not progress, it is an
// escalate-only fact about the record, and it now takes the whole card in every quiet
// state, "stale" included (CUL-1468). Everything below is the gap lane.

// ── Floors (mirrored from the engine, each with its anchor — G6) ──────────────

/** The gap lane's WATCHING floor — `minGaps` in detection.ts (3 gaps / 4 collapsed
 *  episodes, the g-chart's lowest informative point). The config comment names this
 *  "PR 7's client row" explicitly: a 3-gap record is WATCHED here, never fired on by the
 *  server finding (which needs the higher `runLength` run). Every other gate below is
 *  server-faithful (G9) except the recency guard's clock (logged time, CUL-1838). NEVER
 *  Nyx's record (G6). */
export const WATCHING_GAP_MIN_GAPS = 3;

/** "Meaningfully shorter than typical" gate, mirrored from L4's `gapShorteningRatio`
 *  (0.5): the latest (shortest) gap must be ≤ this × the record's MEDIAN gap. Without it,
 *  ANY strictly-decreasing run fires — including a trivial `[50h, 49h, 48h]`, which rounds
 *  to a flat-looking "2 days, then 2, then 2" (the adversarial-review 5a finding). The
 *  median is over ALL in-window gaps. Server-faithful (detection.ts). */
export const WATCHING_GAP_SHORTENING_RATIO = 0.5;

/** The gap lane's era, mirrored from the engine's 180-day symptom lookback, so client +
 *  server agree on "the current era" (adversarial-review finding 7). Window-then-collapse. */
export const WATCHING_GAP_WINDOW_DAYS = 180;

/** Staleness / reversal guard, mirrored from L4's `recencyGraceFactor` (2×): the open
 *  interval since the last onset must be ≤ this × the latest (shortest) gap, else the run
 *  has not CONTINUED. ESCALATE-SAFE by construction — it only ever suppresses the row. Its
 *  clock is LOGGED time (below), not the wall clock (CUL-1838). */
export const WATCHING_GAP_RECENCY_GRACE_FACTOR = 2;

/** A stretch this long with nothing logged but daily looks is NOT LOGGING, and none of it
 *  counts toward the recency guard (PM ruling, 2026-10-14, on CUL-1838: "a gap in logging is
 *  not a gap in vomiting"). The same 48h, and the same question, as the Signal's gone-quiet
 *  state (`hooks/useSignal.ts` imports this): both ask "has the owner stopped logging?". */
export const QUIET_STRETCH_MS = 48 * MS_PER_HOUR;

/** The gap lane's symptom in v1 — vomiting, the server's `SYMPTOM_LABEL.vomit`, so the
 *  row reads identically to the eventual finding. */
export const WATCHING_GAP_SYMPTOM_LABEL = 'vomiting';

interface OnsetRow {
  ms: number;
  confidence: OnsetConfidence | null;
}

/**
 * PURE: the LOGGED hours between `fromMs` and `nowMs` — the recency guard's clock.
 *
 * The span is cut at every log (`loggedMs`: every non-deleted event that is not a daily
 * look, the anchor's own vomit included), and any piece of `QUIET_STRETCH_MS` or longer is
 * left out whole: the owner was not logging, so the record cannot say the vomiting stopped.
 * That includes the trailing piece, from the last log to now — so a warning stays up
 * until the next log however long the record sits quiet. A daily look never cuts a piece
 * (it is not in `loggedMs`), so it neither adds logged time nor moves the anchor.
 */
export function loggedHoursSince(fromMs: number, nowMs: number, loggedMs: readonly number[]): number {
  if (!(nowMs > fromMs)) return 0;
  const cuts = loggedMs.filter((ms) => Number.isFinite(ms) && ms > fromMs && ms < nowMs).sort((a, b) => a - b);
  const points = [fromMs, ...cuts, nowMs];
  let logged = 0;
  for (let i = 1; i < points.length; i++) {
    const piece = points[i] - points[i - 1];
    if (piece < QUIET_STRETCH_MS) logged += piece;
  }
  return logged / MS_PER_HOUR;
}

/**
 * PURE: the escalate-only gap watching detector — the server's `detectGapShortening` at
 * the WATCHING floor (`minGaps` 3 gaps instead of the finding's `runLength` 4). Returns the
 * recent shortening run (hours) or null.
 *
 *   (1) SHORTENING — the last `minGaps` gaps STRICTLY decreasing (G5, escalate-only).
 *   (2) MEANINGFULLY SHORTER — the latest gap ≤ `ratio` × the median of ALL in-window gaps.
 *   (3) STILL CURRENT — the LOGGED time since the last onset ≤ `graceFactor` × the latest
 *       gap. CUL-1838 changed the clock from the wall to `loggedHoursSince`: before, a
 *       record that went quiet aged the run out as if the vomiting had stopped (CUL-1468's
 *       cat, vomits 12, 7 and 3 days apart and nothing logged for days).
 */
export function detectWatchingGapShortening(
  vomitOnsets: readonly OnsetRow[],
  nowMs: number,
  loggedMs: readonly number[],
): number[] | null {
  const cutoff = nowMs - WATCHING_GAP_WINDOW_DAYS * MS_PER_DAY;
  const windowed = vomitOnsets.filter((e) => Number.isFinite(e.ms) && e.ms >= cutoff && e.ms <= nowMs);
  const episodes = collapseEpisodes(windowed, DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours);
  if (episodes.length < WATCHING_GAP_MIN_GAPS + 1) return null;

  const onsets = episodes.map((e) => e.ms);
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push((onsets[i] - onsets[i - 1]) / MS_PER_HOUR);

  // (1) Strictly decreasing.
  const recent = gaps.slice(-WATCHING_GAP_MIN_GAPS);
  for (let i = 1; i < recent.length; i++) {
    if (!(recent[i] < recent[i - 1])) return null;
  }

  // (2) Meaningfully shorter than typical.
  const latestGap = recent[recent.length - 1];
  const medianGap = median(gaps);
  if (medianGap === null || !(medianGap > 0)) return null;
  if (!(latestGap <= WATCHING_GAP_SHORTENING_RATIO * medianGap)) return null;

  // (3) Still current, on logged time. The anchor is the last vomit ONSET (a collapsed
  // episode's first event) — never a look, never another log.
  const lastOnset = onsets[onsets.length - 1];
  if (loggedHoursSince(lastOnset, nowMs, loggedMs) > WATCHING_GAP_RECENCY_GRACE_FACTOR * latestGap) return null;

  return recent;
}

/** The look's event type — the one row that is never coverage (`hooks/useSignal.ts` and
 *  `lib/monthReads.ts` read it the same way). */
const LOOK_EVENT_TYPE = 'check_in';

/**
 * Every non-look log's instant since `sinceMs`, for `loggedHoursSince`. The SQL bound is a
 * coarse prefilter a day wide of the real one, so the two ISO spellings of one instant can
 * never drop a boundary row (C-40); the exact bound is applied after parsing.
 */
export async function readLoggedMs(petId: string, sinceMs: number): Promise<number[]> {
  const coarse = new Date(sinceMs - MS_PER_DAY).toISOString();
  const rows = await getDb().getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events
     WHERE pet_id = ? AND deleted_at IS NULL AND event_type != ? AND occurred_at >= ?`,
    [petId, LOOK_EVENT_TYPE, coarse],
  );
  return rows.map((r) => Date.parse(r.occurred_at)).filter((ms) => Number.isFinite(ms) && ms >= sinceMs);
}

/**
 * The gap warning's sentence for a pet, from local data, or null when the lane has
 * nothing to escalate. Throws on a read failure: the caller decides what an unanswered
 * read means (C-12), and for an escalate-only row that is never "no warning" said as fact.
 *
 * `nowMs` is passed in (never read here) so the windows stay pure and timezone-pinnable.
 */
export async function getGapWarning(petId: string, nowMs: number): Promise<string | null> {
  const vomitOnsets = await readVomitOnsets(petId);
  const eraStart = nowMs - WATCHING_GAP_WINDOW_DAYS * MS_PER_DAY;
  const loggedMs = await readLoggedMs(petId, eraStart);
  const run = detectWatchingGapShortening(vomitOnsets, nowMs, loggedMs);
  return run ? watchingGapRowFromHours(WATCHING_GAP_SYMPTOM_LABEL, run) : null;
}
