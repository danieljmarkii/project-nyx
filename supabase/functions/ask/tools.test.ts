// Unit tests for the Ask deterministic tool layer (B-228, PR A3).
//
// Run with:  deno test supabase/functions/ask/tools.test.ts
//
// Uses Deno's built-in test runner + node:assert (bundled — no remote imports), so the
// suite runs in a network-restricted CI/dev container, matching generate-signal/
// detection.test.ts. Covers the load-bearing contracts of the pure tool layer:
//   - the bounded window enum resolves day-aligned (B-084) and every result STATES its
//     window (§3.4);
//   - `deleted_at IS NULL` on EVERY read — the more-deleted-than-live fixture (§5.2/B-071);
//   - SCOPED RETRIEVAL (§6.1 / AC-11): recall returns only the asked-about event's note/read,
//     no other event's note leaks; and no bulk tool exists (recentEvents is hard-capped);
//   - floors → NotEnoughData with denominators (§5.2);
//   - the free-fed caveat (§11 #6) and G6 windowed-timestamp honesty;
//   - G5 parity: counts match a History-style raw filter; rate/ranking/weight cores mirror
//     lib/analytics.ts / lib/weight.ts on shared fixtures.

import { strict as assert } from 'node:assert'
import {
  ASK_FLOORS,
  MAX_RECALL,
  coerceWindow,
  countSymptom,
  derivePresentFlags,
  dietTrialStatus,
  engineFindings,
  freeFedStatus,
  intakeSummary,
  isNotEnoughData,
  lastSymptom,
  liveEvents,
  medications,
  photoPresence,
  projectCachedRead,
  recallEvent,
  recentEvents,
  resolveWindow,
  symptomTrend,
  timeOfDay,
  topFoods,
  topProteins,
  weightSummary,
  type AskCachedReadRow,
  type AskEventRow,
  type AskMealRow,
} from './tools.ts'

const MS_PER_DAY = 86_400_000
const NOW = '2026-07-15T12:00:00Z'
const NOW_MS = Date.parse(NOW)

// ── helpers ───────────────────────────────────────────────────────────────────────

function ev(partial: Partial<AskEventRow> & { occurredAt: string }): AskEventRow {
  return {
    id: partial.id ?? `e-${partial.occurredAt}`,
    type: partial.type ?? 'vomit',
    occurredAt: partial.occurredAt,
    occurredAtConfidence: partial.occurredAtConfidence ?? null,
    occurredAtEarliest: partial.occurredAtEarliest ?? null,
    occurredAtLatest: partial.occurredAtLatest ?? null,
    note: partial.note ?? null,
    hasPhoto: partial.hasPhoto ?? false,
    deletedAt: partial.deletedAt ?? null,
  }
}

function meal(partial: Partial<AskMealRow> & { occurredAt: string }): AskMealRow {
  return {
    id: partial.id ?? `m-${partial.occurredAt}`,
    occurredAt: partial.occurredAt,
    occurredAtConfidence: partial.occurredAtConfidence ?? null,
    foodItemId: partial.foodItemId ?? null,
    foodLabel: partial.foodLabel ?? null,
    foodType: partial.foodType ?? 'meal',
    primaryProtein: partial.primaryProtein ?? null,
    intakeRating: partial.intakeRating ?? null,
    note: partial.note ?? null,
    hasPhoto: partial.hasPhoto ?? false,
    deletedAt: partial.deletedAt ?? null,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// Window enum
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('resolveWindow — day-aligned trailing window matches calendarWindow math (B-084)', () => {
  const w = resolveWindow('7d', NOW_MS)
  const todayIndex = Math.floor(NOW_MS / MS_PER_DAY)
  assert.equal(w.windowDays, 7)
  assert.equal(w.startMs, (todayIndex - 6) * MS_PER_DAY) // 07-09 00:00Z
  assert.equal(w.endMs, (todayIndex + 1) * MS_PER_DAY) // 07-16 00:00Z (today fully included)
  assert.equal(w.priorStartMs, (todayIndex - 13) * MS_PER_DAY) // 07-02 00:00Z
  assert.equal(w.priorEndMs, w.startMs)
  assert.equal(w.startMs, Date.parse('2026-07-09T00:00:00Z'))
  assert.equal(w.label, 'the last 7 days')
})

Deno.test('resolveWindow — all has no lower bound and no prior span', () => {
  const w = resolveWindow('all', NOW_MS)
  assert.equal(w.windowDays, null)
  assert.equal(w.startMs, null)
  assert.equal(w.priorStartMs, null)
  assert.equal(w.label, 'all time')
})

Deno.test('resolveWindow — since_trial_start uses the trial start, falls back to 7d when absent', () => {
  const trialStart = Date.parse('2026-07-01T00:00:00Z')
  const w = resolveWindow('since_trial_start', NOW_MS, trialStart)
  assert.equal(w.window, 'since_trial_start')
  assert.equal(w.startMs, Date.parse('2026-07-01T00:00:00Z'))
  assert.equal(w.priorStartMs, null)
  assert.equal(w.label, 'since the diet trial started')
  // No trial in hand → honest fallback to the default window, detectable via `window`.
  const fb = resolveWindow('since_trial_start', NOW_MS, null)
  assert.equal(fb.window, '7d')
  assert.equal(fb.label, 'the last 7 days')
})

Deno.test('coerceWindow — unknown strings resolve to the default 7d, never an arbitrary range', () => {
  assert.equal(coerceWindow('30d'), '30d')
  assert.equal(coerceWindow('all'), 'all')
  assert.equal(coerceWindow('90d'), '7d')
  assert.equal(coerceWindow(undefined), '7d')
  assert.equal(coerceWindow(null), '7d')
  assert.equal(coerceWindow('DROP TABLE events'), '7d')
})

// ════════════════════════════════════════════════════════════════════════════════════
// deleted_at contract (§5.2 / B-071) — the more-deleted-than-live fixture
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('liveEvents — filters soft-deleted rows', () => {
  const rows = [ev({ occurredAt: NOW, deletedAt: null }), ev({ occurredAt: NOW, deletedAt: '2026-07-15T00:00:00Z' })]
  assert.equal(liveEvents(rows).length, 1)
})

Deno.test('countSymptom — more-deleted-than-live: counts ONLY live events', () => {
  // 1 live vomit + 3 soft-deleted vomits in the window — the deleted ones must never count.
  const events: AskEventRow[] = [
    ev({ type: 'vomit', occurredAt: '2026-07-14T09:00:00Z', deletedAt: null }),
    ev({ type: 'vomit', occurredAt: '2026-07-13T09:00:00Z', deletedAt: '2026-07-14T00:00:00Z' }),
    ev({ type: 'vomit', occurredAt: '2026-07-12T09:00:00Z', deletedAt: '2026-07-14T00:00:00Z' }),
    ev({ type: 'vomit', occurredAt: '2026-07-11T09:00:00Z', deletedAt: '2026-07-14T00:00:00Z' }),
  ]
  const r = countSymptom(events, { symptomType: 'vomit', window: '7d', nowMs: NOW_MS })
  assert.equal(r.count, 1)
  assert.equal(r.loggedDays, 1) // only the one live day counts toward coverage too
})

Deno.test('recentEvents — a soft-deleted event never appears in a recall slice', () => {
  const events: AskEventRow[] = [
    ev({ id: 'live', type: 'vomit', occurredAt: '2026-07-14T09:00:00Z', note: 'live note' }),
    ev({ id: 'gone', type: 'vomit', occurredAt: '2026-07-14T10:00:00Z', note: 'deleted note', deletedAt: '2026-07-15T00:00:00Z' }),
  ]
  const r = recentEvents(events, [], { window: '7d', nowMs: NOW_MS })
  assert.equal(r.events.length, 1)
  assert.equal(r.events[0].id, 'live')
  assert.equal(JSON.stringify(r).includes('deleted note'), false)
})

// ════════════════════════════════════════════════════════════════════════════════════
// Scoped retrieval (§6.1 / AC-11) — no other event's note leaks; no bulk tool
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('recallEvent — returns ONLY the asked-about event note (AC-11)', () => {
  const events: AskEventRow[] = [
    ev({ id: 'a', type: 'vomit', occurredAt: '2026-07-09T09:00:00Z', note: 'ATE_GRASS_NOTE' }),
    ev({ id: 'b', type: 'vomit', occurredAt: '2026-07-10T09:00:00Z', note: 'OTHER_NOTE_B' }),
    ev({ id: 'c', type: 'diarrhea', occurredAt: '2026-07-11T09:00:00Z', note: 'OTHER_NOTE_C' }),
  ]
  const r = recallEvent(events, [], { eventId: 'a' })
  assert.equal(r.event?.id, 'a')
  assert.equal(r.event?.note, 'ATE_GRASS_NOTE')
  // The load-bearing scoped-retrieval assertion: no OTHER event's note appears anywhere.
  const serialized = JSON.stringify(r)
  assert.equal(serialized.includes('OTHER_NOTE_B'), false)
  assert.equal(serialized.includes('OTHER_NOTE_C'), false)
})

Deno.test('recallEvent — unknown / soft-deleted id ⇒ event null (never a reassurance)', () => {
  const events: AskEventRow[] = [
    ev({ id: 'gone', occurredAt: NOW, note: 'secret', deletedAt: '2026-07-15T00:00:00Z' }),
  ]
  assert.equal(recallEvent(events, [], { eventId: 'nope' }).event, null)
  assert.equal(recallEvent(events, [], { eventId: 'gone' }).event, null) // soft-deleted
})

Deno.test('recentEvents — hard-capped at MAX_RECALL (no bulk tool, §6.1)', () => {
  const events: AskEventRow[] = []
  for (let i = 0; i < MAX_RECALL + 20; i++) {
    events.push(ev({ id: `e${i}`, type: 'vomit', occurredAt: `2026-07-15T${String(i % 24).padStart(2, '0')}:00:00Z` }))
  }
  const r = recentEvents(events, [], { window: 'all', nowMs: NOW_MS, limit: 9999 })
  assert.equal(r.events.length, MAX_RECALL)
  assert.equal(r.truncated, true)
  assert.equal(r.matched, MAX_RECALL + 20)
})

Deno.test('recentEvents — newest-first ordering', () => {
  const events: AskEventRow[] = [
    ev({ id: 'old', occurredAt: '2026-07-10T09:00:00Z' }),
    ev({ id: 'new', occurredAt: '2026-07-14T09:00:00Z' }),
    ev({ id: 'mid', occurredAt: '2026-07-12T09:00:00Z' }),
  ]
  const r = recentEvents(events, [], { window: '7d', nowMs: NOW_MS })
  assert.deepEqual(r.events.map((e) => e.id), ['new', 'mid', 'old'])
})

// ════════════════════════════════════════════════════════════════════════════════════
// G5 parity — counts match a History-style raw filter (computeSymptomCounts stance)
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('countSymptom / symptomTrend — raw counts match a History-style window filter', () => {
  const events: AskEventRow[] = [
    // current 7d window [07-09 .. 07-15]
    ev({ type: 'vomit', occurredAt: '2026-07-15T08:00:00Z' }),
    ev({ type: 'vomit', occurredAt: '2026-07-15T20:00:00Z' }), // same day, still 2 (raw, not episode-collapsed)
    ev({ type: 'vomit', occurredAt: '2026-07-09T00:00:00Z' }), // inclusive lower edge
    // prior 7d window [07-02 .. 07-08]
    ev({ type: 'vomit', occurredAt: '2026-07-08T23:59:00Z' }),
    ev({ type: 'vomit', occurredAt: '2026-07-05T09:00:00Z' }),
    // out of both windows
    ev({ type: 'vomit', occurredAt: '2026-06-01T09:00:00Z' }),
    // wrong type
    ev({ type: 'diarrhea', occurredAt: '2026-07-14T09:00:00Z' }),
  ]
  const w = resolveWindow('7d', NOW_MS)
  const expectedCurrent = events.filter(
    (e) => e.type === 'vomit' && Date.parse(e.occurredAt) >= (w.startMs as number) && Date.parse(e.occurredAt) < w.endMs,
  ).length
  const c = countSymptom(events, { symptomType: 'vomit', window: '7d', nowMs: NOW_MS })
  assert.equal(c.count, expectedCurrent)
  assert.equal(c.count, 3)

  const t = symptomTrend(events, { symptomType: 'vomit', window: '7d', nowMs: NOW_MS })
  assert.equal(t.current, 3)
  assert.equal(t.prior, 2)
  assert.equal(t.delta, 1)
  assert.equal(t.direction, 'up')
})

Deno.test('symptomTrend — all / since_trial_start have no prior span', () => {
  const events = [ev({ type: 'vomit', occurredAt: '2026-07-14T09:00:00Z' })]
  const t = symptomTrend(events, { symptomType: 'vomit', window: 'all', nowMs: NOW_MS })
  assert.equal(t.prior, null)
  assert.equal(t.delta, null)
  assert.equal(t.direction, null)
})

Deno.test('countSymptom — 0-count is an honest fact with a denominator, never suppressed', () => {
  const events = [ev({ type: 'diarrhea', occurredAt: '2026-07-14T09:00:00Z' })]
  const c = countSymptom(events, { symptomType: 'vomit', window: '7d', nowMs: NOW_MS })
  assert.equal(c.count, 0)
  assert.equal(c.loggedDays, 1) // a day WAS logged — coverage is honest
  assert.equal(c.windowLabel, 'the last 7 days')
})

// ════════════════════════════════════════════════════════════════════════════════════
// Time of day — timezone required, witnessed-only, silent on missing zone (§4.2 / G6)
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('timeOfDay — silent (unavailable) without a timezone', () => {
  const events = [ev({ type: 'vomit', occurredAt: '2026-07-14T10:00:00Z', occurredAtConfidence: 'witnessed' })]
  const r = timeOfDay(events, { symptomType: 'vomit', window: '30d', nowMs: NOW_MS })
  assert.equal(r.available, false)
  assert.equal(r.byBand.length, 0)
})

Deno.test('timeOfDay — buckets witnessed events by local band; excludes non-witnessed', () => {
  const events: AskEventRow[] = [
    // 08:00 UTC = 03:00 America/New_York (overnight)
    ev({ type: 'vomit', occurredAt: '2026-07-14T08:00:00Z', occurredAtConfidence: 'witnessed' }),
    // 20:00 UTC = 15:00 NY (afternoon)
    ev({ type: 'vomit', occurredAt: '2026-07-13T20:00:00Z', occurredAtConfidence: 'witnessed' }),
    // discovered/windowed → excluded (can't be placed on the clock)
    ev({ type: 'vomit', occurredAt: '2026-07-12T20:00:00Z', occurredAtConfidence: 'window' }),
    ev({ type: 'vomit', occurredAt: '2026-07-11T20:00:00Z', occurredAtConfidence: null }),
  ]
  const r = timeOfDay(events, { symptomType: 'vomit', window: '30d', nowMs: NOW_MS, timezone: 'America/New_York' })
  assert.equal(r.available, true)
  assert.equal(r.eligibleCount, 2)
  assert.equal(r.excludedCount, 2)
  const overnight = r.byBand.find((b) => b.key === 'overnight')?.count
  const afternoon = r.byBand.find((b) => b.key === 'afternoon')?.count
  assert.equal(overnight, 1)
  assert.equal(afternoon, 1)
})

// ════════════════════════════════════════════════════════════════════════════════════
// Intake summary — floors, denominators, free-fed caveat (§11 #1/#6)
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('intakeSummary — below the rated-meal floor ⇒ NotEnoughData with the denominator', () => {
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', foodType: 'meal', intakeRating: 'most', foodItemId: 'f1' }),
  ]
  const r = intakeSummary(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  assert.equal(isNotEnoughData(r), true)
  if (isNotEnoughData(r)) {
    assert.equal(r.samples, 2)
    assert.equal(r.needed, ASK_FLOORS.minRatedMealsForIntakeRate)
  }
})

Deno.test('intakeSummary — treats excluded from the denominator (§11 #1)', () => {
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-14T09:00:00Z', foodType: 'meal', intakeRating: 'some', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', foodType: 'meal', intakeRating: 'most', foodItemId: 'f1' }),
    // a finished treat must NOT inflate the meal finished-rate
    meal({ occurredAt: '2026-07-12T09:00:00Z', foodType: 'treat', intakeRating: 'all', foodItemId: 't1' }),
  ]
  const r = intakeSummary(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    assert.equal(r.ratedMeals, 4) // treat excluded
    assert.equal(r.finishedMeals, 3) // all, all, most (some is not finished)
  }
})

Deno.test('intakeSummary — free-fed meals excluded, caveat set (§11 #6)', () => {
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'ff' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-11T08:00:00Z', foodType: 'meal', intakeRating: 'most', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-10T08:00:00Z', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
  ]
  const r = intakeSummary(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set(['ff']) })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    assert.equal(r.ratedMeals, 4) // ff excluded
    assert.equal(r.freeFedExcluded, 1)
    assert.equal(r.intakeNotDirectlyObserved, true)
  }
})

// ════════════════════════════════════════════════════════════════════════════════════
// Rankings — floors, canonicalization, treat handling (ported from analytics.ts)
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('topProteins — below floor ⇒ NotEnoughData; else canonicalized + ranked', () => {
  const few = [meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'chicken', foodType: 'meal' })]
  assert.equal(isNotEnoughData(topProteins(few, { window: '30d', nowMs: NOW_MS })), true)

  const many = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'Chicken', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', primaryProtein: 'chicken', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', primaryProtein: 'Chicken By-Product Meal', foodType: 'meal', intakeRating: 'most', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-11T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f2' }),
    meal({ occurredAt: '2026-07-10T08:00:00Z', primaryProtein: 'chicken', foodType: 'treat', foodItemId: 't1' }),
  ]
  const r = topProteins(many, { window: '30d', nowMs: NOW_MS })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    // chicken/Chicken/"Chicken By-Product Meal"/chicken-treat all pool into one key.
    const chicken = r.proteins.find((p) => p.protein === 'chicken')
    assert.equal(chicken?.count, 4)
    assert.equal(chicken?.isTreat, false) // has non-treat meals → a real meal protein
    // Only 3 non-treat chicken meals → below the per-item finished-rate floor (4) → null
    // (mirrors lib/analytics.ts: a rate off <4 meals is noise, never a confident number).
    assert.equal(chicken?.finishedRate, null)
    assert.equal(chicken?.ratedMeals, 3)
  }
})

Deno.test('topProteins — a treat-only protein is flagged isTreat with null finished-rate (§11 #1)', () => {
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-11T08:00:00Z', primaryProtein: 'duck', foodType: 'treat', foodItemId: 't1' }),
  ]
  const r = topProteins(meals, { window: '30d', nowMs: NOW_MS })
  if (!isNotEnoughData(r)) {
    const duck = r.proteins.find((p) => p.protein === 'duck')
    assert.equal(duck?.isTreat, true)
    assert.equal(duck?.finishedRate, null)
  }
})

Deno.test('topFoods — collapses exact-timestamp same-treat re-logs (B-115)', () => {
  const ts = '2026-07-14T08:00:00Z'
  const meals = [
    meal({ occurredAt: ts, foodType: 'treat', foodItemId: 't1', foodLabel: 'Temptations' }),
    meal({ occurredAt: ts, foodType: 'treat', foodItemId: 't1', foodLabel: 'Temptations' }), // exact dup → collapsed
    meal({ occurredAt: '2026-07-13T08:00:00Z', foodType: 'meal', foodItemId: 'f1', foodLabel: 'Kibble A' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', foodType: 'meal', foodItemId: 'f1', foodLabel: 'Kibble A' }),
    meal({ occurredAt: '2026-07-11T08:00:00Z', foodType: 'meal', foodItemId: 'f2', foodLabel: 'Kibble B' }),
  ]
  const r = topFoods(meals, { window: '30d', nowMs: NOW_MS })
  if (!isNotEnoughData(r)) {
    const temptations = r.foods.find((f) => f.foodItemId === 't1')
    assert.equal(temptations?.count, 1) // the duplicate did not inflate the count
    assert.equal(temptations?.isTreat, true)
    assert.equal(temptations?.finishedRate, null) // treat ceiling nulled at source
  }
})

// ════════════════════════════════════════════════════════════════════════════════════
// Weight — descriptive numbers + neutral direction (ported from weight.ts)
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('weightSummary — single reading is a point, not a trend', () => {
  const r = weightSummary([{ weightKg: 5, occurredAt: '2026-07-14T08:00:00Z', deletedAt: null }], { window: 'all', nowMs: NOW_MS })
  assert.equal(r.readingCount, 1)
  assert.equal(r.deltaLbs, null)
  assert.equal(r.direction, null)
})

Deno.test('weightSummary — delta + direction from oldest to newest, soft-deletes ignored', () => {
  const r = weightSummary(
    [
      { weightKg: 5.0, occurredAt: '2026-07-01T08:00:00Z', deletedAt: null },
      { weightKg: 4.5, occurredAt: '2026-07-14T08:00:00Z', deletedAt: null },
      { weightKg: 99, occurredAt: '2026-07-10T08:00:00Z', deletedAt: '2026-07-11T00:00:00Z' }, // deleted → ignored
    ],
    { window: 'all', nowMs: NOW_MS },
  )
  assert.equal(r.readingCount, 2)
  // 5.0kg=11.0lb, 4.5kg=9.9lb → down 1.1
  assert.equal(r.latestLbs, 9.9)
  assert.equal(r.deltaLbs, -1.1)
  assert.equal(r.direction, 'down')
})

// ════════════════════════════════════════════════════════════════════════════════════
// Diet trial + free-fed + medications
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('dietTrialStatus — day counter is inclusive from the start day; null trial = inactive', () => {
  const r = dietTrialStatus({ startedAt: '2026-07-01', targetDurationDays: 21 }, NOW_MS)
  assert.equal(r.active, true)
  assert.equal(r.dayCounter, 15) // 07-01 is day 1 → 07-15 is day 15
  assert.equal(r.targetDays, 21)
  assert.equal(r.daysRemaining, 6)
  assert.equal(r.complete, false)
  assert.equal(dietTrialStatus(null, NOW_MS).active, false)
})

Deno.test('freeFedStatus — active arrangements set the not-directly-observed caveat', () => {
  const r = freeFedStatus(
    [
      { id: 'a', foodItemId: 'ff', foodLabel: 'Grazing Kibble', primaryProtein: 'Chicken', activeFrom: '2026-07-01T00:00:00Z', activeUntil: null, deletedAt: null },
      { id: 'b', foodItemId: 'old', foodLabel: 'Old Bowl', primaryProtein: 'beef', activeFrom: '2026-05-01T00:00:00Z', activeUntil: '2026-06-01T00:00:00Z', deletedAt: null }, // ended → inactive
      { id: 'c', foodItemId: 'del', foodLabel: 'Deleted', primaryProtein: 'lamb', activeFrom: null, activeUntil: null, deletedAt: '2026-07-01T00:00:00Z' },
    ],
    NOW_MS,
  )
  assert.equal(r.arrangements.length, 1)
  assert.equal(r.arrangements[0].protein, 'chicken') // canonicalized
  assert.equal(r.intakeNotDirectlyObserved, true)
})

Deno.test('medications — active regimen, last-given ignores refused/missed doses', () => {
  const regimens = [
    { id: 'r1', drugLabel: 'Apoquel', startedAt: '2026-07-01T00:00:00Z', endedAt: null, doseAmount: '16mg', deletedAt: null },
  ]
  const doses = [
    { id: 'd1', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null },
    { id: 'd2', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-15T08:00:00Z', adherence: 'refused', deletedAt: null },
    { id: 'd3', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-13T08:00:00Z', adherence: null, deletedAt: null }, // null defaults to given
  ]
  const r = medications(regimens, doses, { window: '30d', nowMs: NOW_MS })
  const apoquel = r.medications.find((m) => m.medicationId === 'r1')
  assert.equal(apoquel?.active, true)
  assert.equal(apoquel?.dosesGiven, 2) // given + null
  assert.equal(apoquel?.dosesMissed, 1) // refused
  assert.equal(apoquel?.lastDoseAt, '2026-07-14T08:00:00Z') // NOT the 07-15 refusal
})

// ════════════════════════════════════════════════════════════════════════════════════
// Cached read projection — override-aware, present-only flags, dismissed hides n=1
// ════════════════════════════════════════════════════════════════════════════════════

function read(partial: Partial<AskCachedReadRow>): AskCachedReadRow {
  return {
    eventId: partial.eventId ?? 'e-1',
    incidentType: partial.incidentType ?? 'vomit',
    status: partial.status ?? 'completed',
    dismissedAt: partial.dismissedAt ?? null,
    editedAt: partial.editedAt ?? null,
    description: partial.description ?? null,
    colour: partial.colour ?? null,
    contents: partial.contents ?? null,
    consistency: partial.consistency ?? null,
    bloodPresent: partial.bloodPresent ?? null,
    bilePresent: partial.bilePresent ?? null,
    foreignMaterialPresent: partial.foreignMaterialPresent ?? null,
    foreignMaterialNote: partial.foreignMaterialNote ?? null,
    stoolConsistency: partial.stoolConsistency ?? null,
    stoolBloodPresent: partial.stoolBloodPresent ?? null,
    stoolMucusPresent: partial.stoolMucusPresent ?? null,
    recommendation: partial.recommendation ?? null,
    readText: partial.readText ?? null,
  }
}

Deno.test('derivePresentFlags — present-only; unsure/no/null are NOT flags (§9)', () => {
  assert.deepEqual(derivePresentFlags(read({ bloodPresent: 'fresh_red' })), ['blood'])
  assert.deepEqual(derivePresentFlags(read({ bloodPresent: 'coffee_ground', foreignMaterialPresent: 'yes' })), ['blood', 'foreign_material'])
  assert.deepEqual(derivePresentFlags(read({ stoolBloodPresent: 'yes' })), ['stool_blood'])
  // absence is never manufactured into a flag
  assert.deepEqual(derivePresentFlags(read({ bloodPresent: 'none_visible', foreignMaterialPresent: 'no' })), [])
  assert.deepEqual(derivePresentFlags(read({ bloodPresent: 'unsure', foreignMaterialPresent: 'unsure' })), [])
})

Deno.test('projectCachedRead — an owner-cleared flag does not resurface (override-aware)', () => {
  // Owner edited the structured field to 'no' — the projection must derive from THAT,
  // never from a stale visual_flags cache (which this layer never even receives).
  const p = projectCachedRead(read({ editedAt: '2026-07-15T00:00:00Z', foreignMaterialPresent: 'no', bloodPresent: 'none_visible' }))
  assert.deepEqual(p.flags, [])
  assert.equal(p.edited, true)
})

Deno.test('projectCachedRead — a dismissed n=1 read hides its interpretive text but keeps structured facts', () => {
  const p = projectCachedRead(read({ dismissedAt: '2026-07-15T00:00:00Z', readText: 'HIDE_ME', recommendation: 'worth_a_call', bloodPresent: 'fresh_red' }))
  assert.equal(p.readText, null)
  assert.equal(p.recommendation, null)
  assert.deepEqual(p.flags, ['blood']) // the structured fact still surfaces (escalation on presence)
})

Deno.test('recallEvent — attaches the matching event cached read only', () => {
  const events = [ev({ id: 'x', type: 'vomit', occurredAt: '2026-07-14T08:00:00Z', hasPhoto: true })]
  const reads = [read({ eventId: 'x', bloodPresent: 'fresh_red' }), read({ eventId: 'y', readText: 'OTHER_READ' })]
  const r = recallEvent(events, reads, { eventId: 'x' })
  assert.equal(r.event?.cachedRead?.incidentType, 'vomit')
  assert.deepEqual(r.event?.cachedRead?.flags, ['blood'])
  assert.equal(JSON.stringify(r).includes('OTHER_READ'), false)
})

// ════════════════════════════════════════════════════════════════════════════════════
// G6 windowed timestamps + photo presence + engine relay
// ════════════════════════════════════════════════════════════════════════════════════

Deno.test('recall — a windowed timestamp is marked approximate (never a false-precise point, G6)', () => {
  const events = [
    ev({
      id: 'w',
      type: 'vomit',
      occurredAt: '2026-07-14T16:00:00Z',
      occurredAtConfidence: 'window',
      occurredAtEarliest: '2026-07-14T12:00:00Z',
      occurredAtLatest: '2026-07-14T16:00:00Z',
    }),
    ev({ id: 'wit', type: 'vomit', occurredAt: '2026-07-13T09:00:00Z', occurredAtConfidence: 'witnessed' }),
  ]
  const windowed = recallEvent(events, [], { eventId: 'w' }).event
  assert.equal(windowed?.when.isApproximate, true)
  assert.equal(windowed?.when.earliest, '2026-07-14T12:00:00Z')

  const witnessed = recallEvent(events, [], { eventId: 'wit' }).event
  assert.equal(witnessed?.when.isApproximate, false)
})

Deno.test('photoPresence — presence + references only (bytes never enter this layer)', () => {
  const events = [
    ev({ id: 'p1', type: 'vomit', occurredAt: '2026-07-14T08:00:00Z', hasPhoto: true }),
    ev({ id: 'p2', type: 'vomit', occurredAt: '2026-07-13T08:00:00Z', hasPhoto: false }),
    ev({ id: 'p3', type: 'vomit', occurredAt: '2026-07-12T08:00:00Z', hasPhoto: true, deletedAt: '2026-07-13T00:00:00Z' }),
  ]
  const r = photoPresence(events, { window: '7d', nowMs: NOW_MS, type: 'vomit' })
  assert.equal(r.count, 1)
  assert.deepEqual(r.eventIds, ['p1'])
})

Deno.test('engineFindings — relay only, safety-first, empty = engine silent (not all-clear)', () => {
  const r = engineFindings([
    { type: 'reflection', priorityClass: 'insight', payload: { a: 1 } },
    { type: 'intake_decline', priorityClass: 'safety', payload: { b: 2 } },
  ])
  assert.equal(r.relayOnly, true)
  assert.equal(r.hasFindings, true)
  assert.equal(r.findings[0].type, 'intake_decline') // safety leads
  assert.equal(r.findings[1].type, 'reflection')

  const empty = engineFindings([])
  assert.equal(empty.hasFindings, false)
  assert.equal(empty.findings.length, 0)
})

Deno.test('lastSymptom — none logged ⇒ null (never a wellness verdict)', () => {
  const events = [ev({ type: 'diarrhea', occurredAt: '2026-07-14T08:00:00Z' })]
  assert.equal(lastSymptom(events, [], { symptomType: 'vomit' }).event, null)
})
