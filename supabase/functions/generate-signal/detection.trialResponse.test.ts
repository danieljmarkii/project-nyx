// Detector L2 — trial-response lane (Signals v2 / B-755 / CUL-8). The wedge: a trial-era-vs-baseline
// count comparison over LOGGED-DAYS denominators, emitted ONLY when the pooled contrast "changed
// materially" (the §8.5 trigger). Self-contained fixtures + the REQUIRED property sweep (adversarial
// gate): a stationary null trial (identical underlying rate both windows) fires ≪ α.
//
// Dates span ~100 days (a 49-day baseline before the trial), which the shared May-only `at()` helper
// in detection.test.ts cannot express, so this file carries its own multi-month builders. Every input
// passes `timezone: 'UTC'` and a 'YYYY-MM-DD' trial start (the DATE-column form, zone-independent per
// localDayIndexOf), so the day-count and window math are UTC-deterministic regardless of the CI
// runner's zone (B-514 — a UTC literal is fine BECAUSE the read is pinned to UTC on both sides).

import { strict as assert } from 'node:assert'
import {
  detectTrialResponse,
  detectSignals,
  rankFindings,
  DEFAULT_CONFIG,
  type DetectionInput,
  type DietTrialInput,
  type MealEvent,
  type SymptomEvent,
  type SymptomType,
  type OccurredAtConfidence,
  type PetContext,
} from './detection.ts'

// ── Fixture helpers ───────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const HOUR = 3_600_000
// A clean UTC instant well inside the day, so hour-offsets never cross a day boundary.
const NOW_MS = Date.parse('2026-06-15T12:00:00.000Z')
const NOW_ISO = new Date(NOW_MS).toISOString()

let idSeq = 0
const nextId = () => `tr-${++idSeq}`

/** ISO instant for `d` days before NOW at UTC `hour` (kept away from midnight to avoid day-edge slop). */
const dayAt = (d: number, hour = 9): string =>
  new Date(NOW_MS - d * MS_PER_DAY - (12 - hour) * HOUR).toISOString()

/** 'YYYY-MM-DD' for the trial DATE start `d` days before NOW (zone-independent, like the DB column). */
const dateStr = (d: number): string => {
  const x = new Date(NOW_MS - d * MS_PER_DAY)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(
    x.getUTCDate(),
  ).padStart(2, '0')}`
}

const vomit = (d: number, hour = 9, witnessed = false): SymptomEvent => ({
  id: nextId(),
  type: 'vomit',
  occurredAt: dayAt(d, hour),
  ...(witnessed ? { occurredAtConfidence: 'witnessed' as OccurredAtConfidence } : {}),
})

const mealOn = (d: number, hour = 8, over: Partial<MealEvent> = {}): MealEvent => ({
  id: nextId(),
  occurredAt: dayAt(d, hour),
  foodItemId: null,
  primaryProtein: 'x',
  intakeRating: null,
  foodType: 'meal',
  foodLabel: null,
  ...over,
})
const treatOn = (d: number, hour = 12): MealEvent => mealOn(d, hour, { foodType: 'treat' })

/** Daily meals for every day-offset in [olderD, newerD] inclusive (olderD ≥ newerD). */
const mealsAcross = (olderD: number, newerD: number, hour = 8): MealEvent[] => {
  const out: MealEvent[] = []
  for (let d = olderD; d >= newerD; d--) out.push(mealOn(d, hour))
  return out
}

/** n vomits at evenly-spaced distinct day-offsets within [olderD, newerD] (olderD ≥ newerD). */
const spreadVomits = (n: number, olderD: number, newerD: number, hour = 9): SymptomEvent[] => {
  const out: SymptomEvent[] = []
  if (n <= 0) return out
  const span = olderD - newerD
  for (let i = 0; i < n; i++) {
    const d = Math.round(olderD - (span * i) / Math.max(1, n - 1))
    out.push(vomit(d, hour))
  }
  return out
}

const catTrial: PetContext = { name: 'Nyx', species: 'cat', dietTrialActive: true }

/** A default input: a 28-day-old running trial (day 29), target 84. Override anything, incl. dietTrial. */
const trialInput = (
  over: Partial<DetectionInput> & { dietTrial?: DietTrialInput | undefined } = {},
): DetectionInput => ({
  pet: catTrial,
  symptomEvents: [],
  mealEvents: [],
  dietTrial: { startedAt: dateStr(28), targetDurationDays: 84 },
  timezone: 'UTC',
  now: NOW_ISO,
  ...over,
})

/** Seeded PRNG (mulberry32) — deterministic property sweep, no Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── The gate: silence for any pet not on a running trial ─────────────────────

Deno.test('detectTrialResponse — no active trial ⇒ silent (byte-identical to pre-CUL-8)', () => {
  // A strong fewer-signal, but no dietTrial in the input.
  const f = detectTrialResponse(
    trialInput({
      dietTrial: undefined,
      mealEvents: mealsAcross(77, 0),
      symptomEvents: spreadVomits(14, 74, 30),
    }),
  )
  assert.equal(f.length, 0)
})

Deno.test('detectTrialResponse — a trial past its effective end is NOT running ⇒ silent (isTrialRunning gate)', () => {
  // started 200 days ago, target 30 ⇒ effective end = start + 30 - 1 + 56 = start + 85 < today(=200).
  const f = detectTrialResponse(
    trialInput({
      dietTrial: { startedAt: dateStr(200), targetDurationDays: 30 },
      mealEvents: mealsAcross(77, 0),
      symptomEvents: spreadVomits(14, 74, 30),
    }),
  )
  assert.equal(f.length, 0)
})

Deno.test('detectTrialResponse — a terminal-status trial ⇒ silent (isTrialRunning gate, the one predicate)', () => {
  const f = detectTrialResponse(
    trialInput({
      dietTrial: { startedAt: dateStr(28), targetDurationDays: 84, status: 'completed' },
      mealEvents: mealsAcross(77, 0),
      symptomEvents: spreadVomits(14, 74, 30),
    }),
  )
  assert.equal(f.length, 0)
})

// ── The wedge: a fewer-during-trial change fires with count-anchored facts ────

Deno.test('detectTrialResponse — fires on a material fewer-during-trial change; counts are exact + verdict-free', () => {
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0), // daily logging both windows ⇒ density comparable
      symptomEvents: [...spreadVomits(12, 74, 30), vomit(10)], // baseline 12, trial 1
    }),
  )
  assert.equal(f.length, 1, 'a material fewer change fires the card')
  const t = f[0]
  assert.equal(t.type, 'trial_response')
  assert.equal(t.priorityClass, 'insight')
  assert.equal(t.pooledTrialCount, 1)
  assert.equal(t.pooledBaselineCount, 12)
  assert.equal(t.comparisonDirection, 'fewer_during_trial')
  assert.equal(t.densityComparable, true)
  assert.equal(t.trialDayNumber, 29, 'day 1 = start day; started 28 days ago ⇒ day 29')
  assert.equal(t.targetDurationDays, 84)
  assert.equal(t.associationalOnly, true)
  assert.ok(t.trialLoggedDays >= 7 && t.baselineLoggedDays >= 7, 'both windows clear the logged-days floor')
})

Deno.test('detectTrialResponse — fires on a material MORE-during-trial change (worsening escalates)', () => {
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      symptomEvents: [...spreadVomits(10, 24, 1), vomit(60)], // trial 10, baseline 1
    }),
  )
  assert.equal(f.length, 1)
  assert.equal(f[0].comparisonDirection, 'more_during_trial')
  assert.equal(f[0].pooledTrialCount, 10)
  assert.equal(f[0].pooledBaselineCount, 1)
})

Deno.test('detectTrialResponse — a STATIONARY trial (same rate both windows) does NOT fire (the C-test noise floor)', () => {
  // 6 in the ~29-day trial vs 10 in the 49-day baseline ≈ the same per-day rate — nothing changed.
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      symptomEvents: [...spreadVomits(10, 74, 30), ...spreadVomits(6, 25, 1)],
    }),
  )
  assert.equal(f.length, 0, 'a flat rate must not manufacture a card')
})

// ── Fail-toward-escalation: density gates the fewer direction, never the more ─

Deno.test('detectTrialResponse — density withholds a fewer card when the trial was logged less INTENSELY (fail toward escalation)', () => {
  // A long trial (day 61) so the trial exposure is large enough to clear the C-test even when the
  // trial's logging FRACTION is low. Baseline: daily meals (fraction 1.0), 24 vomits. Trial: 1 vomit.
  const baselineMeals = mealsAcross(109, 61)
  const baselineVomits = spreadVomits(24, 107, 62)
  const dense = detectTrialResponse(
    trialInput({
      dietTrial: { startedAt: dateStr(60), targetDurationDays: 120 },
      mealEvents: [...baselineMeals, ...mealsAcross(60, 0)], // trial logged every day ⇒ fraction ~1.0
      symptomEvents: [...baselineVomits, vomit(10)],
    }),
  )
  assert.equal(dense.length, 1, 'with comparable intensity the fewer card fires')
  assert.equal(dense[0].comparisonDirection, 'fewer_during_trial')
  assert.equal(dense[0].densityComparable, true)

  // Same trial + same vomits, but the TRIAL is logged on only ~21 of its 61 days (fraction ~0.33 vs
  // the baseline's 1.0). The C-test still gates (24-vs-1 over ample exposure), but the fewer claim is
  // WITHHELD — a quieter-looking trial that was under-logged must not read as improvement.
  const sparseTrialMeals: MealEvent[] = []
  for (let d = 60; d >= 0; d -= 3) sparseTrialMeals.push(mealOn(d, 8)) // ~21 of 61 days
  const sparse = detectTrialResponse(
    trialInput({
      dietTrial: { startedAt: dateStr(60), targetDurationDays: 120 },
      mealEvents: [...baselineMeals, ...sparseTrialMeals],
      symptomEvents: [...baselineVomits, vomit(9)], // vomit on a logged (d=9 → nearest meal) day
    }),
  )
  assert.equal(sparse.length, 0, 'an under-logged trial withholds the fewer card (density gate)')
})

Deno.test('detectTrialResponse — a MORE-during-trial change fires even when the trial was logged less intensely (never gated)', () => {
  // Sparse trial logging (~21 of 61 days), but MORE vomits despite fewer logged days — the escalation
  // direction is never density-gated (a worsening under sparser logging is a stronger signal, not a weaker one).
  const sparseTrialMeals: MealEvent[] = []
  for (let d = 60; d >= 0; d -= 3) sparseTrialMeals.push(mealOn(d, 8))
  const f = detectTrialResponse(
    trialInput({
      dietTrial: { startedAt: dateStr(60), targetDurationDays: 120 },
      mealEvents: [...mealsAcross(109, 61), ...sparseTrialMeals],
      symptomEvents: [...spreadVomits(14, 57, 3), vomit(100)], // trial 14, baseline 1
    }),
  )
  assert.equal(f.length, 1)
  assert.equal(f[0].comparisonDirection, 'more_during_trial')
  assert.equal(f[0].densityComparable, false, 'the trial was logged less intensely, but more is never gated')
})

// ── The garbage-baseline / too-new-trial floors ──────────────────────────────

Deno.test('detectTrialResponse — a baseline with < 7 logged days cannot mint a contrast (garbage-baseline floor)', () => {
  // Trial logged daily; baseline has only 3 logged days (3 vomits, no meals) — a 3-vomit spike on the
  // one week the app existed pre-trial must never out-rate a fully-logged trial.
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(27, 0), // trial only
      symptomEvents: [...spreadVomits(3, 70, 60), vomit(5)],
    }),
  )
  assert.equal(f.length, 0)
})

Deno.test('detectTrialResponse — a trial with < 7 logged days is too new to compare', () => {
  // Baseline logged daily; the trial has only 3 logged days.
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 29), // baseline only
      symptomEvents: [...spreadVomits(12, 74, 30), vomit(5), vomit(3), vomit(1)],
    }),
  )
  assert.equal(f.length, 0)
})

// ── Per-phenotype vomit-timing count rows (via lib/mealTiming) ────────────────

Deno.test('detectTrialResponse — per-phenotype (rapid/long) counts split correctly by window', () => {
  // Daily meals at 08:00. A witnessed vomit at 08:20 is rapid (20 min after eating); at 15:00 it is
  // long (7 h after the 08:00 meal, no meal between). Baseline: 8 rapid + 8 long. Trial: 1 rapid.
  const rapidDays = [70, 68, 66, 64, 62, 60, 58, 56]
  const longDays = [52, 50, 48, 46, 44, 42, 40, 38]
  // place rapid at 08:00+20m and long at 15:00 explicitly (vomit() takes whole hours only).
  const rapid = (d: number): SymptomEvent => ({
    id: nextId(),
    type: 'vomit',
    occurredAt: new Date(NOW_MS - d * MS_PER_DAY - (12 - 8) * HOUR + 20 * 60_000).toISOString(),
    occurredAtConfidence: 'witnessed',
  })
  const long = (d: number): SymptomEvent => ({
    id: nextId(),
    type: 'vomit',
    occurredAt: new Date(NOW_MS - d * MS_PER_DAY - (12 - 15) * HOUR).toISOString(),
    occurredAtConfidence: 'witnessed',
  })
  const symptomEvents = [
    ...rapidDays.map(rapid),
    ...longDays.map(long),
    rapid(5), // one trial rapid vomit
  ]
  const f = detectTrialResponse(trialInput({ mealEvents: mealsAcross(77, 0), symptomEvents }))
  assert.equal(f.length, 1, 'baseline 16 vs trial 1 fires fewer')
  const t = f[0]
  assert.equal(t.rapid.baseline, 8)
  assert.equal(t.long.baseline, 8)
  assert.equal(t.rapid.trial, 1)
  assert.equal(t.long.trial, 0)
  assert.equal(t.pooledBaselineCount, 16)
  assert.equal(t.pooledTrialCount, 1)
  assert.equal(t.rapidWindowMinutes, 30)
  assert.equal(t.longGapHours, 6)
})

// ── Diet-structure context rows (treat share, meals/day) ─────────────────────

Deno.test('detectTrialResponse — diet-structure deltas (treat share, meals/day) computed per window', () => {
  // Trial: meals on days 1..14 (14) + treats on days 1,2 (2). Baseline: meals days 30..43 (14) +
  // treats days 30..37 (8). Vomits placed on meal days so logged-days = 14 each.
  const trialMeals = mealsAcross(14, 1)
  const trialTreats = [treatOn(1), treatOn(2)]
  const baselineMeals = mealsAcross(43, 30)
  const baselineTreats = [30, 31, 32, 33, 34, 35, 36, 37].map((d) => treatOn(d))
  const symptomEvents = [...spreadVomits(14, 43, 30), vomit(5)] // baseline 14, trial 1
  const f = detectTrialResponse(
    trialInput({
      mealEvents: [...trialMeals, ...trialTreats, ...baselineMeals, ...baselineTreats],
      symptomEvents,
    }),
  )
  assert.equal(f.length, 1)
  const t = f[0]
  const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6
  assert.ok(near(t.treatShare.trial, 2 / 16), `trial treat share ${t.treatShare.trial} ≈ 0.125`)
  assert.ok(near(t.treatShare.baseline, 8 / 22), `baseline treat share ${t.treatShare.baseline} ≈ 0.364`)
  assert.ok(near(t.mealsPerDay.trial, 14 / t.trialLoggedDays), 'trial meals/day = meals ÷ logged days')
  assert.ok(near(t.mealsPerDay.baseline, 14 / t.baselineLoggedDays), 'baseline meals/day = meals ÷ logged days')
})

// ── Ranking + pipeline integration ───────────────────────────────────────────

Deno.test('detectTrialResponse — ranks band 1 (context-lead) for the trial pet, above a band-2 timing card', () => {
  const ranked = detectSignals(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      symptomEvents: [...spreadVomits(12, 74, 30), vomit(10)],
    }),
  )
  const trialIdx = ranked.findIndex((r) => r.finding.type === 'trial_response')
  assert.ok(trialIdx >= 0, 'the trial_response finding is in the ranked set')
  // It leads the insight stack (band 1); nothing non-safety ranks above it.
  const above = ranked.slice(0, trialIdx)
  assert.ok(
    above.every((r) => r.finding.priorityClass === 'safety'),
    'only safety findings may rank above the trial-response wedge',
  )
})

// ── §PROPERTY SWEEP (the REQUIRED adversarial calibration gate) ───────────────

Deno.test('detectTrialResponse — §PROPERTY SWEEP: a stationary null trial fires ≪ α on random rates + start days', () => {
  // The null: the SAME per-day vomit probability in the baseline and the trial era, with full daily
  // logging in both (so density is comparable and never masks the C-test). The card must fire only at
  // the exact test's own false-positive rate — bounded by α (0.05), conservative for discrete counts.
  const rng = mulberry32(0xc0ffee)
  const TRIALS = 4000
  let fires = 0
  for (let i = 0; i < TRIALS; i++) {
    const startD = 21 + Math.floor(rng() * 25) // trial started 21..45 days ago
    const lambda = 0.08 + rng() * 0.25 // per-day vomit probability, IDENTICAL in both windows
    const symptomEvents: SymptomEvent[] = []
    const mealEvents: MealEvent[] = []
    for (let d = startD + 49; d >= 0; d--) {
      mealEvents.push(mealOn(d, 8)) // daily logging, both windows
      if (rng() < lambda) symptomEvents.push(vomit(d, 9))
    }
    const f = detectTrialResponse(
      trialInput({
        dietTrial: { startedAt: dateStr(startD), targetDurationDays: 200 },
        symptomEvents,
        mealEvents,
      }),
    )
    if (f.length > 0) fires++
  }
  const rate = fires / TRIALS
  assert.ok(rate < 0.08, `stationary null fire rate ${(rate * 100).toFixed(2)}% must be < 8% (α-bounded)`)
})

Deno.test('detectTrialResponse — §RECALL: a genuine drop and a genuine rise both fire (the test is not merely conservative)', () => {
  const drop = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      symptomEvents: [...spreadVomits(16, 74, 30), vomit(10)],
    }),
  )
  assert.equal(drop.length, 1, 'a genuine reduction fires')
  assert.equal(drop[0].comparisonDirection, 'fewer_during_trial')

  const rise = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      symptomEvents: [...spreadVomits(16, 26, 1), vomit(60)],
    }),
  )
  assert.equal(rise.length, 1, 'a genuine increase fires')
  assert.equal(rise[0].comparisonDirection, 'more_during_trial')
})

// Pooled counts EVERY tracked symptom type (indication-blind — a diet trial can be GI or derm).
Deno.test('detectTrialResponse — pooled burden counts every tracked symptom type, not just vomit', () => {
  const itch = (d: number): SymptomEvent => ({ id: nextId(), type: 'itch' as SymptomType, occurredAt: dayAt(d, 14) })
  const f = detectTrialResponse(
    trialInput({
      mealEvents: mealsAcross(77, 0),
      // baseline: 8 itch + 6 vomit = 14; trial: 1 itch. A derm trial's itch burden is in the pooled compare.
      symptomEvents: [
        ...[70, 66, 62, 58, 54, 50, 46, 42].map(itch),
        ...spreadVomits(6, 72, 40),
        itch(8),
      ],
    }),
  )
  assert.equal(f.length, 1)
  assert.equal(f[0].pooledBaselineCount, 14, 'itch + vomit episodes both counted in the baseline burden')
  assert.equal(f[0].pooledTrialCount, 1)
})
