// Honest-firing validation for the App Review demo seed (B-271, PR 1).
//
//   deno test supabase/functions/generate-signal/demoStory.detection.test.ts
//
// Proves — OFFLINE, against the REAL shipped engine, before any live account is
// touched — that the "Cooper" story (scripts/demo/demoStory.ts) makes the two
// committed findings fire HONESTLY (docs/nyx-demo-account-requirements.md §3.3 /
// §12.2):
//
//   ① food↔symptom correlation — beef → vomiting, at the Early tier, NEVER
//      Established; and the venison staple WASHES OUT (control-present in every
//      matched pair → riskDifference ≤ 0 by construction — the structural
//      property the `nearest-preceding-meal` bug violated).
//   ② intake_decline (`consecutive_low`) — the two UTC-anchored dip days.
//
// It asserts three things a single "does it fire right now" test would miss, and
// that the 2026-08-10 adversarial pass showed matter (R-3/R-4):
//
//   • ACROSS ALL 24 UTC SEED-HOURS — the test that would have caught R-3, where a
//     locally-anchored dip run at an early UTC hour produced no ② at all.
//   • SURVIVAL at +24h/+48h/+96h — ① is durable (180-day lookback, no now-
//     dependence) while ② DECAYS at the next UTC midnight. That asymmetry is the
//     measured justification for §8's standing re-seed cadence, not folklore.
//   • THE UTC-MIDNIGHT SINGULARITY — ② physically cannot fire at exactly
//     00:00:00 UTC (no elapsed time on today's UTC date for a past meal), so the
//     seed-run-hour rule + the 5-min clamp exist for it. ① fires regardless.
//
// This test imports the story module across the function boundary exactly as
// generate-signal/index.ts already imports lib/dietTrial.ts — a proven graph
// under the CI flags (§12.1). It builds the DetectionInput with the SAME field
// mapping index.ts::mapMealRows / mapSymptomRows use, so what fires here is what
// fires in production.

import { strict as assert } from 'node:assert';
import {
  detectSignals,
  DEFAULT_CONFIG,
  type DetectionInput,
  type MealEvent,
  type SymptomEvent,
  type CorrelationFinding,
  type IntakeDeclineFinding,
} from './detection.ts';
import { buildDemoStory, materializeInstantIso, type DemoStory } from '../../../scripts/demo/demoStory.ts';

const STORY: DemoStory = buildDemoStory({
  userId: '11111111-1111-4111-8111-111111111111',
  petId: '22222222-2222-4222-8222-222222222222',
  timezone: 'America/New_York',
});

/**
 * Build the DetectionInput the engine sees, mirroring index.ts's row mapping.
 * `seedMs` fixes the row instants (when the seed WROTE them); `readMs` is
 * detection's `now` (when generate-signal RUNS). They differ only in the survival
 * test — everywhere else the seed is read at seed time.
 */
function toInput(seedMs: number, readMs: number = seedMs): DetectionInput {
  const symptomEvents: SymptomEvent[] = STORY.events
    .filter((e) => e.kind === 'vomit')
    .map((e) => ({
      id: e.eventId,
      type: 'vomit',
      occurredAt: materializeInstantIso(e.time, seedMs),
      occurredAtConfidence: e.occurredAtConfidence,
      severity: e.severity,
    }));
  const mealEvents: MealEvent[] = STORY.events
    .filter((e) => e.kind === 'meal' && e.meal)
    .map((e) => ({
      id: e.eventId,
      occurredAt: materializeInstantIso(e.time, seedMs),
      isMedicationVehicle: false,
      occurredAtConfidence: e.occurredAtConfidence,
      foodItemId: e.meal!.foodId,
      primaryProtein: e.meal!.primaryProtein,
      proteins: e.meal!.proteins,
      intakeRating: e.meal!.intakeRating,
      foodType: e.meal!.foodType,
      format: null,
      foodLabel: e.meal!.label,
    }));
  return {
    pet: { name: STORY.pet.name, species: 'dog', dietTrialActive: true },
    symptomEvents,
    mealEvents,
    now: new Date(readMs).toISOString(),
  };
}

interface Summary {
  intakeTrigger: string | null;
  correlations: CorrelationFinding[];
  beef: CorrelationFinding | undefined;
  venison: CorrelationFinding | undefined;
  intakeRank: number | null;
  beefRank: number | null;
  findingTypes: string[];
}

function analyze(seedMs: number, readMs: number = seedMs): Summary {
  const ranked = detectSignals(toInput(seedMs, readMs), DEFAULT_CONFIG);
  const findings = ranked.map((r) => r.finding);
  const correlations = findings.filter(
    (f): f is CorrelationFinding => f.type === 'food_symptom_correlation',
  );
  const intake = findings.find(
    (f): f is IntakeDeclineFinding => f.type === 'intake_decline',
  );
  const intakeRankEntry = ranked.find((r) => r.finding.type === 'intake_decline');
  const beefRankEntry = ranked.find(
    (r) =>
      r.finding.type === 'food_symptom_correlation' &&
      (r.finding as CorrelationFinding).proteins.includes('beef'),
  );
  return {
    intakeTrigger: intake?.trigger ?? null,
    correlations,
    beef: correlations.find((c) => c.proteins.includes('beef')),
    venison: correlations.find((c) => c.proteins.includes('venison')),
    intakeRank: intakeRankEntry?.rank ?? null,
    beefRank: beefRankEntry?.rank ?? null,
    findingTypes: findings.map((f) => f.type),
  };
}

// A canonical afternoon seed run (well past the 09:00-UTC seed-run rule, §8).
const CANONICAL = Date.parse('2026-08-11T15:30:00.000Z');
const UTC_MIDNIGHT = Date.parse('2026-08-11T00:00:00.000Z');
const HOUR = 3_600_000;

Deno.test('demo story — both findings fire honestly at a canonical seed run (§3.2/§3.3)', () => {
  const s = analyze(CANONICAL);

  // ② the intake dip.
  assert.equal(s.intakeTrigger, 'consecutive_low', '② must fire as consecutive_low');

  // ① exactly ONE correlation — beef, Early, with the structural washout numbers.
  assert.equal(s.correlations.length, 1, 'exactly one correlation (beef); venison must not appear');
  assert.ok(s.beef, '① beef→vomit correlation must fire');
  assert.equal(s.beef!.tier, 'early', '① must be Early, never Established');
  assert.equal(s.beef!.symptomType, 'vomit');
  assert.equal(s.beef!.matchedPairs, 4, 'four beef exposures → four matched pairs');
  assert.equal(s.beef!.caseExposed, 4, 'beef present in every case window');
  assert.equal(
    s.beef!.controlExposed,
    0,
    'beef absent from every control window → riskDifference 1.0',
  );
  assert.equal(s.beef!.jointCandidate, false);

  // The washout: venison is NEVER implicated (control-present in every pair).
  assert.equal(s.venison, undefined, 'venison staple must wash out (never a correlate)');

  // Safety leads: ② outranks ① (§5 — safety/concern always first).
  assert.ok(s.intakeRank !== null && s.beefRank !== null);
  assert.ok(
    (s.intakeRank as number) < (s.beefRank as number),
    'the safety finding (②) must rank before the insight (①)',
  );

  // Exactly the two committed findings — nothing else spuriously fires.
  assert.deepEqual(
    [...s.findingTypes].sort(),
    ['food_symptom_correlation', 'intake_decline'],
    'only the two intended findings fire',
  );
});

Deno.test('demo story — ①+② fire across all 24 UTC seed-hours (R-3 regression)', () => {
  // Seed AND read at each hour-of-day. :30 keeps today's dip meal safely past the
  // 5-min clamp margin at every hour (incl. the 0-hour at 00:30) — the case an
  // early-UTC-hour run of the OLD locally-anchored dip silently failed (R-3).
  for (let h = 0; h < 24; h++) {
    const now = UTC_MIDNIGHT + h * HOUR + 30 * 60_000;
    const s = analyze(now);
    assert.equal(s.intakeTrigger, 'consecutive_low', `② must fire at ${h}:30 UTC`);
    assert.ok(s.beef, `① must fire at ${h}:30 UTC`);
    assert.equal(s.beef!.tier, 'early', `① must be Early at ${h}:30 UTC`);
    assert.equal(s.beef!.matchedPairs, 4, `① pairs=4 at ${h}:30 UTC`);
    assert.equal(s.venison, undefined, `venison must wash out at ${h}:30 UTC`);
    assert.equal(s.correlations.length, 1, `exactly one correlation at ${h}:30 UTC`);
  }
});

Deno.test('demo story — ② fires for the earliest realistic run (00:06 UTC), just past the clamp margin', () => {
  // The tightest passing case: 1 minute past the 5-min clamp. Proves the R-3
  // early-hour bug is dead without relying on a late-in-the-hour minute.
  const s = analyze(UTC_MIDNIGHT + 6 * 60_000);
  assert.equal(s.intakeTrigger, 'consecutive_low', '② must fire at 00:06 UTC');
  assert.ok(s.beef, '① must fire at 00:06 UTC');
  assert.equal(s.beef!.tier, 'early');
});

Deno.test('demo story — the UTC-midnight singularity: ② cannot fire at 00:00:00, ① still does', () => {
  // At exactly UTC midnight there is no elapsed time on today's UTC date, so no
  // past dip meal can land on it — ② is physically unable to fire. This is the
  // documented edge the seed-run-hour rule (§8) and the 5-min clamp exist for; it
  // is pinned here, not hidden. ① is now-independent and fires regardless.
  const s = analyze(UTC_MIDNIGHT);
  assert.equal(s.intakeTrigger, null, '② is silent exactly at UTC midnight (the singularity)');
  assert.ok(s.beef, '① fires even at the singularity (180-day lookback, no now-dependence)');
  assert.equal(s.beef!.tier, 'early');
});

Deno.test('demo story — survival: ① is durable, ② decays past the next UTC midnight (§8 cadence)', () => {
  // Seed the rows ONCE (fixed instants at CANONICAL), then re-read as `now`
  // advances — exactly what happens live between the seed and a later
  // generate-signal run. This is the measured survival window that justifies the
  // standing re-seed cadence (R-3/§8): ② must be refreshed, ① need not be.
  const atSeed = analyze(CANONICAL, CANONICAL);
  assert.equal(atSeed.intakeTrigger, 'consecutive_low', 'at seed time ② fires');
  assert.ok(atSeed.beef, 'at seed time ① fires');

  for (const dh of [24, 48, 96]) {
    const s = analyze(CANONICAL, CANONICAL + dh * HOUR);
    // ① survives every time-shift, still Early.
    assert.ok(s.beef, `① must still fire at read +${dh}h`);
    assert.equal(s.beef!.tier, 'early', `① still Early at read +${dh}h`);
    assert.equal(s.beef!.matchedPairs, 4, `① pairs=4 at read +${dh}h`);
    // ② has decayed — the dip is no longer in the recent-2-day window.
    assert.equal(
      s.intakeTrigger,
      null,
      `② must have decayed at read +${dh}h (this is WHY the cadence re-seeds)`,
    );
  }
});
