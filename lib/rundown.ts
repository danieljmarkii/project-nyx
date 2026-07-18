// The vet-visit rundown (Ask / B-228 PR A6, spec §3.3 + mock §7).
//
// A one-tap, DETERMINISTIC assembly of the answers a clinician asks for at the
// start of a visit — symptom counts with denominators, a timing recount, the
// appetite picture, the weight range, current meds, and what's changed since the
// last logged visit. There is NO model call: it is the same engine that writes
// the vet report, so it works CAPPED and OFFLINE, and every tile taps through to
// its source (the screen maps the semantic tap target to a route).
//
// The register is the vet report's: counts with denominators, NO adjectives, NO
// verdicts. Two invariants govern the copy here:
//   • n=1 never reassures (G2) — a 0/low count is "none logged", never "she's
//     well". Absence of a symptom is never framed as wellness.
//   • Intake ≠ preference (G7) — appetite is a raw finished-rate over its
//     denominator, never softened to "picky"/"usual".
//
// G5 (one source of truth): the headline symptom counts and the appetite rate
// reuse the SAME canonical aggregates the Patterns dashboard and the vet report
// use (`getSymptomCounts` / `getIntakeRate` / `computeWeightTrend`), so the
// rundown can never disagree with the Timeline about a health fact. The pieces
// with no client aggregate today — the time-of-day recount, the logged-days
// denominator, the weight min/max, the active-meds + last-dose read, and the
// since-visit deltas — are computed here as pure functions (unit-tested) over
// the identical `events`/`meals`/`medications` reads, never as a re-derivation of
// a number that already has a canonical home.

import { getDb } from './db';
import {
  getSymptomCounts,
  getIntakeRate,
  calendarWindow,
  WINDOW_DAYS,
  isNotEnoughData,
  type IntakeRate,
} from './analytics';
import { getWeightHistory, computeWeightTrend } from './weight';
import { symptomLabel } from './metricDetail';
import { toLocalDayKey } from './utils';

// ── Tap targets ─────────────────────────────────────────────────────────────
// Semantic (route-agnostic) so the pure layer stays testable; the screen maps
// each to an expo-router destination. Every tile that has a source carries one.
export type RundownTap =
  | { kind: 'symptom'; symptomType: string } // → /insights/[metric]
  | { kind: 'patterns' } //                     → /insights
  | { kind: 'weight' } //                       → /(tabs)/profile (weight card)
  | { kind: 'medication'; medicationId: string } // → /medication/[id]
  | { kind: 'meds' } //                         → /(tabs)/profile (no single med)
  | { kind: 'foods' } //                        → /(tabs)/foods
  | { kind: 'history' } //                      → /(tabs)/history
  | { kind: 'log-visit' }; //                   → /vet-visit (none logged yet)

export type RundownTileKey =
  | 'symptoms'
  | 'timing'
  | 'appetite'
  | 'weight'
  | 'meds'
  | 'since_visit';

export interface RundownTile {
  key: RundownTileKey;
  label: string;
  value: string;
  /** Secondary line — the denominator / window / caveat. */
  detail?: string;
  tap: RundownTap | null;
  /** A designed empty state (Principle 5), not a data row — the screen styles it quieter. */
  empty?: boolean;
}

export interface Rundown {
  petName: string;
  generatedAtMs: number;
  tiles: RundownTile[];
}

// The window every count is scoped to — stated on-screen and in the export so a
// clinician reading a saved copy knows "30 days ending WHEN" (P6 record hygiene).
export const RUNDOWN_WINDOW_DAYS = 30;

// Weigh-in horizon for the weight-range tile. Deliberately wider than the app's
// 12-reading chart window (insights / WeightTrendCard): the range a vet asks for
// is longer-horizon than the 30-day symptom window — a diet trial or a chronic
// case is weighed monthly, so 12 readings could miss the relevant trajectory.
// A high row cap ≈ "all recent weigh-ins" without an arbitrary time bound.
export const RUNDOWN_WEIGHIN_LIMIT = 60;

/** "As of Jul 18, 2026 · last 30 days" — the artifact's own date stamp. */
export function rundownDateLine(generatedAtMs: number): string {
  const when = new Date(generatedAtMs).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `As of ${when} · last ${RUNDOWN_WINDOW_DAYS} days`;
}

// ── Time-of-day recount ─────────────────────────────────────────────────────
// Three 8-hour clock bands. Overnight (12am–8am) is broken out on its own
// because empty-stomach / nocturnal vomiting is a real clinical signal the vet
// looks for; the split is descriptive, never a verdict.
export interface TimeBand {
  key: 'overnight' | 'daytime' | 'evening';
  label: string;
  startHour: number; // inclusive
  endHour: number; // exclusive (24 = midnight)
}

export const TIME_BANDS: readonly TimeBand[] = [
  { key: 'overnight', label: '12am–8am', startHour: 0, endHour: 8 },
  { key: 'daytime', label: '8am–4pm', startHour: 8, endHour: 16 },
  { key: 'evening', label: '4pm–12am', startHour: 16, endHour: 24 },
] as const;

export interface TimingCluster {
  band: TimeBand;
  count: number; // events in the modal band
  total: number; // events considered
}

// Below this, there is no meaningful time-of-day picture to report.
export const TIMING_MIN_EVENTS = 3;
// The modal band must hold at least half the events before we assert a cluster —
// otherwise the events are spread across the day and no timing tile is shown (the
// raw count still conveys the number). Ties resolve to the earliest band, which
// keeps a 12am–8am pattern legible rather than hidden behind a later band.
export const TIMING_MIN_SHARE = 0.5;

/**
 * The dominant clock band and its share, from a list of LOCAL hours-of-day
 * (0–23). Returns null when there are too few events, or when no single band
 * holds a majority (events are spread — we assert nothing). Pure: the caller
 * derives local hours from each event's `occurred_at` in the device timezone.
 */
export function computeTimingCluster(localHours: number[]): TimingCluster | null {
  const valid = localHours.filter((h) => Number.isInteger(h) && h >= 0 && h < 24);
  const total = valid.length;
  if (total < TIMING_MIN_EVENTS) return null;

  const counts = TIME_BANDS.map(
    (band) => valid.filter((h) => h >= band.startHour && h < band.endHour).length,
  );
  let bestIdx = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[bestIdx]) bestIdx = i; // strict >: ties keep the earlier band
  }
  const count = counts[bestIdx];
  if (count / total < TIMING_MIN_SHARE) return null;
  return { band: TIME_BANDS[bestIdx], count, total };
}

// ── Weight range ────────────────────────────────────────────────────────────
export interface WeightRange {
  minLbs: number;
  maxLbs: number;
  count: number;
}

/** Min/max over a weigh-in series (already in display lbs, rounded 0.1). null with no readings. */
export function computeWeightRange(seriesLbs: number[]): WeightRange | null {
  const valid = seriesLbs.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return { minLbs: Math.min(...valid), maxLbs: Math.max(...valid), count: valid.length };
}

// ── Logged-days denominator ─────────────────────────────────────────────────
/** Distinct LOCAL calendar days present in a set of ISO timestamps (coverage denominator). */
export function distinctLocalDays(isoTimestamps: string[]): number {
  const days = new Set<string>();
  for (const iso of isoTimestamps) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) days.add(toLocalDayKey(new Date(ms)));
  }
  return days.size;
}

// ── Copy formatters (pure, tested) ──────────────────────────────────────────

/** "7 in 30 days · 3 this week" — the raw count, never a trend verdict. */
export function symptomTileValue(count30: number, count7: number): string {
  const week = count7 === 0 ? 'none this week' : `${count7} this week`;
  return `${count30} in 30 days · ${week}`;
}

/** "5 of 7 between 12am–8am" — a factual recount of where they fell, no "clustered". */
export function timingTileValue(cluster: TimingCluster): string {
  return `${cluster.count} of ${cluster.total} between ${cluster.band.label}`;
}

/** "9.3–9.7 lbs" or "9.5 lbs" (single reading). */
export function weightTileValue(range: WeightRange): string {
  if (range.minLbs === range.maxLbs) return `${range.minLbs} lbs`;
  return `${range.minLbs}–${range.maxLbs} lbs`;
}

/** "6 weigh-ins" / "1 weigh-in". */
export function weighInCountLabel(count: number): string {
  return `${count} weigh-in${count === 1 ? '' : 's'}`;
}

/**
 * The appetite tile from the canonical intake rate. Below the ranking floor it
 * says so honestly rather than guessing (data-gap, never reassurance). Never
 * "usual"/"good"/"picky" — a raw finished-of-rated fraction the vet reads.
 */
export function appetiteTileValue(intake: IntakeRate | { status: 'not_enough_data' }): string {
  if ('status' in intake) return 'Too few meals logged to read appetite';
  return `${intake.finishedMeals} of ${intake.ratedMeals} meals finished`;
}

/** "As needed" for a PRN regimen (doses_per_day NULL), else the schedule. Mirrors profile.tsx. */
export function frequencyLabel(dosesPerDay: number | null): string {
  if (dosesPerDay == null) return 'As needed';
  switch (dosesPerDay) {
    case 1:
      return 'Once a day';
    case 2:
      return 'Twice a day';
    case 3:
      return '3× a day';
    case 4:
      return '4× a day';
    default:
      return `${dosesPerDay}× a day`;
  }
}

/** "last Jul 10" from an ISO dose timestamp, or "no dose logged yet" (never "none needed"). */
export function lastDoseLabel(lastDoseIso: string | null): string {
  if (!lastDoseIso) return 'no dose logged yet';
  const ms = Date.parse(lastDoseIso);
  if (!Number.isFinite(ms)) return 'no dose logged yet';
  return `last ${new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export interface SinceVisitChanges {
  newFoods: number;
  newMeds: number;
}

/** "2 new foods · 1 new med" / "No new foods or meds logged" — a factual delta. */
export function sinceVisitValue(changes: SinceVisitChanges): string {
  const parts: string[] = [];
  if (changes.newFoods > 0) {
    parts.push(`${changes.newFoods} new food${changes.newFoods === 1 ? '' : 's'}`);
  }
  if (changes.newMeds > 0) {
    parts.push(`${changes.newMeds} new med${changes.newMeds === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No new foods or meds logged';
}

/**
 * Where a since-visit tile taps through: the surface that actually shows the
 * change — foods when a food was introduced, meds (profile) for a med-only
 * change, else the timeline. A med-only change must never land in the food
 * library (tap-through fidelity).
 */
export function sinceVisitTap(changes: SinceVisitChanges): RundownTap {
  if (changes.newFoods > 0) return { kind: 'foods' };
  if (changes.newMeds > 0) return { kind: 'meds' };
  return { kind: 'history' };
}

/** "Since Jul 2" from a YYYY-MM-DD (or ISO) visit date. */
export function visitDateLabel(visitedAt: string): string {
  const ms = Date.parse(visitedAt);
  if (!Number.isFinite(ms)) return 'Since your last visit';
  return `Since ${new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

/**
 * A plain-text rendering of the rundown for the "Save for the visit" share — a
 * portable, offline artifact the owner can print, message to themselves, or hand
 * to the vet, needing no persistence (§10). Same register as the tiles: label,
 * value, denominator; no adjectives, no verdicts.
 */
export function rundownToPlainText(rundown: Rundown): string {
  const lines = [`${rundown.petName} — visit rundown`, rundownDateLine(rundown.generatedAtMs), ''];
  for (const tile of rundown.tiles) {
    lines.push(tile.detail ? `${tile.label}: ${tile.value} (${tile.detail})` : `${tile.label}: ${tile.value}`);
  }
  lines.push('', "From Culprit — your pet's logged record.");
  return lines.join('\n');
}

// ── Local reads (thin; the pure logic above does the work) ──────────────────

interface ActiveRegimen {
  id: string;
  drugName: string;
  dosesPerDay: number | null;
  lastDoseIso: string | null;
}

/** Active regimens for a pet, most-recently-started first, each with its last logged dose. */
async function readActiveRegimens(petId: string): Promise<ActiveRegimen[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: string;
    drug_name: string;
    doses_per_day: number | null;
    last_dose: string | null;
  }>(
    // Last dose is the newest non-deleted administration event linked to this
    // regimen (the meds→administrations→events soft-delete chain), mirroring the
    // occurred_at ordering `recentMedicationsQuery` uses.
    `SELECT m.id AS id, m.drug_name AS drug_name, m.doses_per_day AS doses_per_day,
            (SELECT MAX(e.occurred_at)
               FROM medication_administrations ma
               JOIN events e ON e.id = ma.event_id
              WHERE ma.medication_id = m.id AND e.deleted_at IS NULL) AS last_dose
       FROM medications m
      WHERE m.pet_id = ? AND m.status = 'active'
      ORDER BY m.started_at DESC`,
    [petId],
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    drugName: r.drug_name,
    dosesPerDay: r.doses_per_day,
    lastDoseIso: r.last_dose,
  }));
}

/** The most recent logged vet visit's date (YYYY-MM-DD), or null if none logged. */
async function readLastVisitDate(petId: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ visited_at: string | null }>(
    `SELECT MAX(visited_at) AS visited_at FROM vet_visits WHERE pet_id = ?`,
    [petId],
  );
  return row?.visited_at ?? null;
}

/**
 * Changes since a visit date: foods whose FIRST-EVER logged feed is on/after the
 * date (genuinely introduced since), and regimens started on/after it. ISO-8601
 * timestamps compare lexicographically, so a date-only bound works against the
 * datetime `occurred_at`/`started_at` columns.
 */
async function readSinceVisitChanges(petId: string, visitedAt: string): Promise<SinceVisitChanges> {
  const db = getDb();
  const foodRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT m.food_item_id
         FROM meals m
         JOIN events e ON e.id = m.event_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL AND m.food_item_id IS NOT NULL
        GROUP BY m.food_item_id
       HAVING MIN(e.occurred_at) >= ?
     )`,
    [petId, visitedAt],
  );
  const medRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM medications WHERE pet_id = ? AND started_at >= ?`,
    [petId, visitedAt],
  );
  return { newFoods: foodRow?.n ?? 0, newMeds: medRow?.n ?? 0 };
}

/** LOCAL hours-of-day of a symptom type's events in a window (for the timing recount). */
async function readSymptomLocalHours(
  petId: string,
  symptomType: string,
  startMs: number,
  endMs: number,
): Promise<number[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events
      WHERE pet_id = ? AND deleted_at IS NULL AND event_type = ?
        AND occurred_at >= ? AND occurred_at < ?`,
    [petId, symptomType, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return (rows ?? [])
    .map((r) => Date.parse(r.occurred_at))
    .filter((ms) => Number.isFinite(ms))
    .map((ms) => new Date(ms).getHours());
}

/**
 * ISO timestamps of non-deleted MEAL events in a window — the appetite-coverage
 * denominator (days a feeding was actually logged). Scoped to meals, not all
 * events, so the "meals logged on N of 30 days" line under Appetite means
 * meal-days, never total logging density (which would read as false meal
 * coverage). Treats are excluded (`food_type != 'treat'`) to match the intake
 * rate's own treat exclusion (§11 #1) — a treat-only day isn't a meal-day. A
 * meal with no library link (`food_type` NULL) still counts (it's a logged feed).
 */
async function readMealTimestamps(petId: string, startMs: number, endMs: number): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string }>(
    `SELECT e.occurred_at AS occurred_at
       FROM meals m
       JOIN events e ON e.id = m.event_id
       LEFT JOIN food_items_cache f ON f.id = m.food_item_id
      WHERE e.pet_id = ? AND e.deleted_at IS NULL
        AND (f.food_type IS NULL OR f.food_type != 'treat')
        AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [petId, new Date(startMs).toISOString(), new Date(endMs).toISOString()],
  );
  return (rows ?? []).map((r) => r.occurred_at);
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Assemble the rundown for a pet. Client-only, deterministic, offline-safe: it
 * reuses the canonical count/rate/weight aggregates and reads the local mirror
 * for the pieces that have no client aggregate. Errors are the caller's to
 * handle (no silent failures) — a broken read should surface, not fabricate a
 * reassuring empty rundown.
 */
export async function buildRundown(
  petId: string,
  petName: string,
  nowMs: number = Date.now(),
): Promise<Rundown> {
  const monthRange = calendarWindow('month', nowMs);
  const windowDays = WINDOW_DAYS.month;

  const [monthCounts, weekCounts, intake, weightReadings, mealTimestamps, regimens, lastVisit] =
    await Promise.all([
      getSymptomCounts(petId, 'month', nowMs),
      getSymptomCounts(petId, 'week', nowMs),
      getIntakeRate(petId, 'month', nowMs),
      getWeightHistory(petId, RUNDOWN_WEIGHIN_LIMIT),
      readMealTimestamps(petId, monthRange.currentStartMs, monthRange.currentEndMs),
      readActiveRegimens(petId),
      readLastVisitDate(petId),
    ]);

  const tiles: RundownTile[] = [];

  // 1 — Symptom counts (one tile per symptom present, ranked; canonical numbers).
  const present = monthCounts.filter((c) => c.current > 0);
  if (present.length === 0) {
    tiles.push({
      key: 'symptoms',
      label: 'Symptoms',
      // Absence is a coverage fact, never wellness (G2): "none logged", not "she's well".
      value: 'None logged in 30 days',
      tap: { kind: 'history' },
      empty: true,
    });
  } else {
    for (const c of present) {
      const week = weekCounts.find((w) => w.symptomType === c.symptomType)?.current ?? 0;
      tiles.push({
        key: 'symptoms',
        label: symptomLabel(c.symptomType),
        value: symptomTileValue(c.current, week),
        tap: { kind: 'symptom', symptomType: c.symptomType },
      });
    }

    // 2 — Timing recount for the dominant symptom (already the first `present` row).
    const dominant = present[0];
    const hours = await readSymptomLocalHours(
      petId,
      dominant.symptomType,
      monthRange.currentStartMs,
      monthRange.currentEndMs,
    );
    const cluster = computeTimingCluster(hours);
    if (cluster) {
      tiles.push({
        key: 'timing',
        label: 'Timing',
        value: timingTileValue(cluster),
        detail: symptomLabel(dominant.symptomType),
        tap: { kind: 'symptom', symptomType: dominant.symptomType },
      });
    }
  }

  // 3 — Appetite (canonical intake rate) + the MEAL-day coverage denominator.
  // The window is UTC-day-aligned but days are bucketed local, so a boundary event
  // can nudge the distinct-local-day count one past the window; clamp so the
  // coverage reads "≤ N of N", never "31 of 30".
  const mealDaysLogged = Math.min(distinctLocalDays(mealTimestamps), windowDays);
  const appetiteDetailParts = [`meals logged on ${mealDaysLogged} of ${windowDays} days`];
  if (!isNotEnoughData(intake) && intake.intakeNotDirectlyObserved) {
    appetiteDetailParts.push('some meals free-fed (intake not directly seen)');
  }
  tiles.push({
    key: 'appetite',
    label: 'Appetite',
    value: appetiteTileValue(intake),
    detail: appetiteDetailParts.join(' · '),
    tap: { kind: 'patterns' },
    empty: isNotEnoughData(intake),
  });

  // 4 — Weight range over weigh-ins (lbs, the app-wide display unit).
  const range = computeWeightRange(computeWeightTrend(weightReadings).seriesLbs);
  if (range) {
    tiles.push({
      key: 'weight',
      label: 'Weight',
      value: weightTileValue(range),
      detail: weighInCountLabel(range.count),
      tap: { kind: 'weight' },
    });
  } else {
    tiles.push({
      key: 'weight',
      label: 'Weight',
      value: 'No weigh-ins logged',
      tap: { kind: 'weight' },
      empty: true,
    });
  }

  // 5 — Current meds (one tile per active regimen; PRN vs schedule + last dose).
  if (regimens.length === 0) {
    tiles.push({
      key: 'meds',
      label: 'Current meds',
      value: 'None active',
      tap: { kind: 'meds' },
      empty: true,
    });
  } else {
    for (const reg of regimens) {
      tiles.push({
        key: 'meds',
        label: reg.drugName,
        value: `${frequencyLabel(reg.dosesPerDay)} · ${lastDoseLabel(reg.lastDoseIso)}`,
        tap: { kind: 'medication', medicationId: reg.id },
      });
    }
  }

  // 6 — Since the last logged visit (or an honest "none logged" forward state).
  if (!lastVisit) {
    tiles.push({
      key: 'since_visit',
      label: 'Since last visit',
      value: 'No prior visit logged',
      tap: { kind: 'log-visit' },
      empty: true,
    });
  } else {
    const changes = await readSinceVisitChanges(petId, lastVisit);
    const hasChanges = changes.newFoods > 0 || changes.newMeds > 0;
    tiles.push({
      key: 'since_visit',
      label: 'Since last visit',
      value: sinceVisitValue(changes),
      detail: visitDateLabel(lastVisit),
      tap: sinceVisitTap(changes),
      empty: !hasChanges,
    });
  }

  return { petName, generatedAtMs: nowMs, tiles };
}
