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
  intakeTrend,
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
    proteins: partial.proteins ?? null,
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

// ── since_trial_start is bucketed by the OWNER'S midnight, per zone (B-539) ──────────
//
// The fifth diet-trial day-math path — and the one B-421's guard first missed. Unlike the
// fixed trailing windows (UTC-aligned for calendarWindow parity), this window's day count IS
// the trial's "Day N", so it must track the card. A raw-UTC floor disagreed with the card by
// ±1 for a device off UTC AND put the retrieval lower bound on UTC midnight of the start DATE,
// dropping the first hours of trial day 1 east of UTC. Verified in three+ zones per the
// timezone-honesty rule (B-514): every instant is explicit, so these are clock-independent.

Deno.test('resolveWindow — since_trial_start windowDays EQUALS the card Day N, per zone (B-539 G5)', () => {
  const trialStartMs = Date.parse('2026-06-10T00:00:00Z') // the DATE at UTC midnight (index.ts)
  const trial = { startedAt: '2026-06-10', targetDurationDays: 14 }
  // 14 Jun 08:00 in Sydney is still 13 Jun in UTC and in LA — the local day differs by zone,
  // so windowDays must too. The invariant: windowDays === dietTrialStatus.dayCounter, ALWAYS.
  const now = Date.parse('2026-06-13T21:00:00.000Z')
  for (const tz of ['Pacific/Auckland', 'Asia/Kolkata', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']) {
    const w = resolveWindow('since_trial_start', now, trialStartMs, tz)
    const card = dietTrialStatus(trial, now, tz)
    assert.equal(w.windowDays, card.dayCounter, `windowDays must equal the card Day N in ${tz}`)
  }
  // And pin the concrete split so a bug that breaks BOTH sides identically can't hide behind
  // the parity check: Auckland (UTC+12, no June DST) is already on 14 Jun → Day 5; LA (UTC-7)
  // is still on 13 Jun → Day 4.
  assert.equal(resolveWindow('since_trial_start', now, trialStartMs, 'Pacific/Auckland').windowDays, 5)
  assert.equal(resolveWindow('since_trial_start', now, trialStartMs, 'America/Los_Angeles').windowDays, 4)
})

Deno.test('resolveWindow — since_trial_start bounds are the owner\'s LOCAL midnights, not UTC (B-539)', () => {
  const trialStartMs = Date.parse('2026-06-10T00:00:00Z')
  const now = Date.parse('2026-06-14T02:00:00Z') // 14 Jun 14:00 in Auckland
  // Auckland is UTC+12 in June (no DST): local midnight of 10 Jun = 09 Jun 12:00Z.
  const w = resolveWindow('since_trial_start', now, trialStartMs, 'Pacific/Auckland')
  assert.equal(w.startMs, Date.parse('2026-06-09T12:00:00Z'))
  // The raw-UTC lower bound was 10 Jun 00:00Z — so an event at 00:30 local on trial day 1
  // (09 Jun 12:30Z) used to be DROPPED. It is now inside the window.
  assert.ok((w.startMs as number) <= Date.parse('2026-06-09T12:30:00.000Z'))
  // endMs = local midnight AFTER today: today local is 14 Jun → 15 Jun 00:00 Auckland = 14 Jun 12:00Z.
  assert.equal(w.endMs, Date.parse('2026-06-14T12:00:00Z'))

  // West of UTC the same math pulls the bound the other way: LA (UTC-7 in June) local midnight
  // of 10 Jun is 10 Jun 07:00Z — so the raw-UTC bound (10 Jun 00:00Z) used to reach 7h into the
  // PRE-trial day. Now the window opens at the owner's actual day-1 midnight.
  const la = resolveWindow('since_trial_start', now, trialStartMs, 'America/Los_Angeles')
  assert.equal(la.startMs, Date.parse('2026-06-10T07:00:00Z'))
})

Deno.test('resolveWindow — since_trial_start survives a DST transition inside the trial (B-539)', () => {
  // LA springs forward on 8 Mar 2026. A trial started 6 Mar (PST, UTC-8) read on 9 Mar (PDT,
  // UTC-7) is Day 4 — a ms-span divide floors the 71 local hours to Day 3. windowDays tracks
  // the zoned counter, and the start bound stays on 6 Mar's PST midnight (6 Mar 08:00Z).
  const trialStartMs = Date.parse('2026-03-06T00:00:00Z')
  const trial = { startedAt: '2026-03-06', targetDurationDays: 14 }
  const now = Date.parse('2026-03-09T19:00:00.000Z') // 9 Mar 12:00 PDT
  const w = resolveWindow('since_trial_start', now, trialStartMs, 'America/Los_Angeles')
  assert.equal(w.windowDays, 4)
  assert.equal(w.windowDays, dietTrialStatus(trial, now, 'America/Los_Angeles').dayCounter)
  assert.equal(w.startMs, Date.parse('2026-03-06T08:00:00Z')) // PST midnight, not PDT
  // endMs is the PDT day boundary after today (10 Mar 00:00 PDT = 10 Mar 07:00Z).
  assert.equal(w.endMs, Date.parse('2026-03-10T07:00:00Z'))
})

Deno.test('resolveWindow — since_trial_start bounds are correct when local midnight is SKIPPED (B-539, adversarial 2026-08-02)', () => {
  // America/Havana springs forward AT midnight on 8 Mar 2026 (00:00 EST → 01:00 CDT), so local
  // 00:00–00:59 does not exist and the day BEGINS at 05:00Z. The first cut of zonedDayStartMs put
  // the bound an hour early (04:00Z, still 7 Mar local), which dropped a today-in-trial symptom
  // from the window for ≤1h. The day now opens at the transition, on day i, never an hour before.
  const tz = 'America/Havana'

  // START bound — a trial that started ON the skip day opens at the transition (05:00Z), not an
  // hour before it (which would reach into 7 Mar, the pre-trial day).
  const w = resolveWindow('since_trial_start', Date.parse('2026-03-10T17:00:00Z'), Date.parse('2026-03-08T00:00:00Z'), tz)
  assert.equal(w.startMs, Date.parse('2026-03-08T05:00:00Z')) // 01:00 CDT — day 8 begins here

  // END bound — when TOMORROW is the skip day, today's late-evening events must stay in-window.
  const now2 = Date.parse('2026-03-08T03:00:00Z') // 7 Mar 22:00 EST → today = 7 Mar local
  const w2 = resolveWindow('since_trial_start', now2, Date.parse('2026-03-01T00:00:00Z'), tz)
  assert.equal(w2.endMs, Date.parse('2026-03-08T05:00:00Z')) // start of 8 Mar (the transition)
  // A vomit logged at 7 Mar 23:30 EST (04:30Z) — a real today, in-trial event — is INCLUDED.
  assert.ok(Date.parse('2026-03-08T04:30:00Z') < (w2.endMs as number))
})

Deno.test('resolveWindow — a null/absent zone keeps the shipped UTC bounds (B-539 fallback)', () => {
  // The degrade is UNCHANGED from before B-539: with no zone the window is UTC-day-aligned,
  // byte-identical to the raw `startIndex * MS_PER_DAY` it replaced. B-443 is what keeps a real
  // zone in hand so this path is the last resort, not the norm.
  const trialStartMs = Date.parse('2026-06-10T00:00:00Z')
  const now = Date.parse('2026-06-14T02:00:00Z')
  const w = resolveWindow('since_trial_start', now, trialStartMs, null)
  assert.equal(w.startMs, Date.parse('2026-06-10T00:00:00Z'))
  assert.equal(w.endMs, Date.parse('2026-06-15T00:00:00Z'))
  assert.equal(w.windowDays, 5) // 10→14 Jun inclusive in UTC
})

Deno.test('coerceWindow — unknown strings resolve to the default 7d, never an arbitrary range', () => {
  assert.equal(coerceWindow('30d'), '30d')
  assert.equal(coerceWindow('all'), 'all')
  assert.equal(coerceWindow('90d'), '7d')
  assert.equal(coerceWindow(undefined), '7d')
  assert.equal(coerceWindow(null), '7d')
  assert.equal(coerceWindow('DROP TABLE events'), '7d')
})

Deno.test('resolveWindow — an off-enum string coerces to 7d, never a NaN unbounded span (adversarial A3)', () => {
  // The break the adversarial pass found: '90d' → FIXED_WINDOW_DAYS miss → startMs=NaN →
  // inSpan reads it as an unbounded all-time window. resolveWindow must coerce FIRST.
  const w = resolveWindow('90d' as unknown as '7d', NOW_MS)
  assert.equal(w.window, '7d')
  assert.equal(Number.isFinite(w.startMs as number), true)
  assert.equal(w.label, 'the last 7 days')
  // And a windowed tool must therefore bound to 7d, not silently widen to all-time.
  const events = [
    ev({ type: 'vomit', occurredAt: '2026-07-14T09:00:00Z' }), // in 7d
    ev({ type: 'vomit', occurredAt: '2024-01-01T09:00:00Z' }), // 2+ years ago — must be excluded
  ]
  const c = countSymptom(events, { symptomType: 'vomit', window: '90d' as unknown as '7d', nowMs: NOW_MS })
  assert.equal(c.count, 1)
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
// intakeTrend (B-382) — a falling finished-rate is VISIBLE, honestly floored, never minted
// ════════════════════════════════════════════════════════════════════════════════════

/** N rated meals per day across [fromDaysAgo … toDaysAgo] (inclusive), one per day. */
function ratedMealOnEachDay(fromDaysAgo: number, toDaysAgo: number, rating: string, idPrefix: string): AskMealRow[] {
  const out: AskMealRow[] = []
  for (let d = fromDaysAgo; d <= toDaysAgo; d++) {
    out.push(
      meal({
        id: `${idPrefix}-${d}`,
        occurredAt: new Date(NOW_MS - d * MS_PER_DAY).toISOString(),
        foodType: 'meal',
        intakeRating: rating,
        foodItemId: 'f1',
      }),
    )
  }
  return out
}

Deno.test('intakeTrend — a falling finished-rate is visible: down direction, both denominators (B-382)', () => {
  // Prior window (7–13 days ago): 7 meals, all finished. Current window (0–6 days ago):
  // 7 meals, only 2 finished. The A7 counterexample-(c) cat — before this tool, no Ask
  // tool could surface this decline at all.
  const meals = [
    ...ratedMealOnEachDay(7, 13, 'all', 'prior'),
    ...ratedMealOnEachDay(2, 6, 'refused', 'cur-low'),
    ...ratedMealOnEachDay(0, 1, 'all', 'cur-ok'),
  ]
  const r = intakeTrend(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    assert.equal(r.current.ratedMeals, 7)
    assert.equal(r.current.finishedMeals, 2)
    assert.equal(r.prior?.ratedMeals, 7)
    assert.equal(r.prior?.finishedMeals, 7)
    assert.equal(r.direction, 'down') // the concern direction — a FALLING finished-rate
    assert.ok((r.delta as number) < 0)
    assert.equal(r.windowLabel, 'the last 7 days')
  }
})

Deno.test('intakeTrend — current window below the rated-meal floor ⇒ NotEnoughData, never a rate', () => {
  const meals = [...ratedMealOnEachDay(7, 13, 'all', 'prior'), ...ratedMealOnEachDay(0, 2, 'refused', 'cur')]
  const r = intakeTrend(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  assert.equal(isNotEnoughData(r), true)
  if (isNotEnoughData(r)) {
    assert.equal(r.samples, 3)
    assert.equal(r.needed, ASK_FLOORS.minRatedMealsForIntakeRate)
  }
})

Deno.test('intakeTrend — a below-floor PRIOR window yields no comparison, with the honest prior count', () => {
  // A comparison off 2 prior meals would be a fabricated trend; the tool says "only 2
  // rated meals the window before" instead (prior null, priorRatedMeals honest).
  const meals = [...ratedMealOnEachDay(0, 6, 'all', 'cur'), ...ratedMealOnEachDay(8, 9, 'all', 'prior')]
  const r = intakeTrend(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  if (!isNotEnoughData(r)) {
    assert.equal(r.prior, null)
    assert.equal(r.priorRatedMeals, 2)
    assert.equal(r.delta, null)
    assert.equal(r.direction, null) // never a guessed comparison
  }
})

Deno.test('intakeTrend — windows with no prior span (all / since_trial_start) have no trend', () => {
  const meals = ratedMealOnEachDay(0, 6, 'all', 'cur')
  const r = intakeTrend(meals, { window: 'all', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  if (!isNotEnoughData(r)) {
    assert.equal(r.prior, null)
    assert.equal(r.priorRatedMeals, null)
    assert.equal(r.direction, null)
  }
})

Deno.test('intakeTrend — treats and free-fed meals excluded in BOTH windows; caveat set (§11 #1/#6)', () => {
  const meals = [
    // Current: 5 finished + 2 refused proper meals → 5/7.
    ...ratedMealOnEachDay(0, 4, 'all', 'cur'),
    ...ratedMealOnEachDay(5, 6, 'refused', 'cur-r'),
    // Prior: 7 finished proper meals → 7/7.
    ...ratedMealOnEachDay(7, 13, 'all', 'prior'),
    // A refused treat in the current window must not deepen the decline (treats out, §11 #1)…
    meal({ occurredAt: new Date(NOW_MS - 1 * MS_PER_DAY).toISOString(), foodType: 'treat', intakeRating: 'refused', foodItemId: 't1' }),
    // …and a free-fed bowl's rating is excluded from the PRIOR denominator too (§11 #6).
    meal({ occurredAt: new Date(NOW_MS - 9 * MS_PER_DAY).toISOString(), foodType: 'meal', intakeRating: 'refused', foodItemId: 'ff' }),
  ]
  const r = intakeTrend(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set(['ff']) })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    assert.equal(r.current.ratedMeals, 7) // treat excluded
    assert.equal(r.current.finishedMeals, 5)
    assert.equal(r.prior?.ratedMeals, 7) // free-fed excluded
    assert.equal(r.prior?.finishedMeals, 7)
    assert.equal(r.freeFedExcluded, 1)
    assert.equal(r.intakeNotDirectlyObserved, true)
    assert.equal(r.direction, 'down') // 5/7 vs 7/7 — a real fall
  }
})

Deno.test('intakeTrend — current-window numbers EQUAL intakeSummary for the same fixture (G5)', () => {
  // One denominator definition across the two intake tools — they can never disagree
  // about the same window's rate.
  const meals = [...ratedMealOnEachDay(0, 6, 'all', 'cur'), ...ratedMealOnEachDay(8, 14, 'some', 'prior')]
  const trend = intakeTrend(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  const summary = intakeSummary(meals, { window: '7d', nowMs: NOW_MS, freeFedFoodIds: new Set() })
  assert.equal(isNotEnoughData(trend), false)
  assert.equal(isNotEnoughData(summary), false)
  if (!isNotEnoughData(trend) && !isNotEnoughData(summary)) {
    assert.equal(trend.current.ratedMeals, summary.ratedMeals)
    assert.equal(trend.current.finishedMeals, summary.finishedMeals)
    assert.equal(trend.current.rate, summary.rate)
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

Deno.test('topProteins — a hidden SECONDARY protein counts as real exposure (B-351 slice 6 / B-467)', () => {
  // The textbook elimination-trial contaminant: a "duck" formula that also lists chicken.
  // Pre-B-467 this ranking read primary_protein alone, so the chicken exposure vanished
  // from every Ask answer ("has she had any chicken?" → no) while the Signal engine and
  // the Patterns card both counted it. Now all three read the same set.
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-11T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', foodItemId: 'f2' }),
  ]
  const r = topProteins(meals, { window: '30d', nowMs: NOW_MS })
  assert.equal(isNotEnoughData(r), false)
  if (!isNotEnoughData(r)) {
    const chicken = r.proteins.find((p) => p.protein === 'chicken')
    const duck = r.proteins.find((p) => p.protein === 'duck')
    assert.equal(chicken?.count, 3) // the hidden secondary IS the exposure
    assert.equal(duck?.count, 3)
    // Shares no longer sum to 1: 4 identified feedings, duck 3/4 + chicken 3/4 + beef 1/4.
    assert.equal(chicken?.shareOfDiet, 3 / 4)
    assert.equal(duck?.shareOfDiet, 3 / 4)
    // An absent set still degrades to the primary (beef is counted, pre-B-467-identically).
    assert.equal(r.proteins.find((p) => p.protein === 'beef')?.count, 1)
  }
})

Deno.test('topProteins — the floor counts identified FEEDINGS, not protein instances (B-467)', () => {
  // 3 meals each carrying 2 proteins = 6 protein instances but only 3 identified feedings —
  // still below the 4-feeding ranking floor. A multi-protein food must not let 3 meals
  // masquerade as a rankable sample.
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'meal', foodItemId: 'f1' }),
  ]
  const r = topProteins(meals, { window: '30d', nowMs: NOW_MS })
  assert.equal(isNotEnoughData(r), true)
  if (isNotEnoughData(r)) assert.equal(r.samples, 3)
})

Deno.test('topProteins — a secondary carried ONLY by treats is treat-flagged; via a meal it is not (§11 #1)', () => {
  const meals = [
    meal({ occurredAt: '2026-07-14T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-13T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    meal({ occurredAt: '2026-07-12T08:00:00Z', primaryProtein: 'beef', foodType: 'meal', intakeRating: 'all', foodItemId: 'f1' }),
    // Chicken reaches the pet ONLY inside a treat's set → treat-sourced, no rate to fake.
    meal({ occurredAt: '2026-07-11T08:00:00Z', primaryProtein: 'duck', proteins: ['duck', 'chicken'], foodType: 'treat', foodItemId: 't1' }),
  ]
  const r = topProteins(meals, { window: '30d', nowMs: NOW_MS })
  if (!isNotEnoughData(r)) {
    const chicken = r.proteins.find((p) => p.protein === 'chicken')
    assert.equal(chicken?.isTreat, true)
    assert.equal(chicken?.finishedRate, null)
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

Deno.test('dietTrialStatus — a non-active or unparseable trial is inactive (B-539 status guard)', () => {
  // diet_trials has NO soft-delete column (migration 001); the active-ness gate is `status`.
  // An ended/abandoned trial must not read as an active Day N even if it reaches this core —
  // the upstream query filters to active, but the core enforces the same predicate itself so
  // a caller that forgets the filter can't surface a stale trial as running (§5.2 / B-071).
  for (const status of ['completed', 'abandoned']) {
    assert.equal(dietTrialStatus({ startedAt: '2026-07-01', targetDurationDays: 21, status }, NOW_MS).active, false)
  }
  // An unparseable start date is inactive rather than a guessed day.
  assert.equal(dietTrialStatus({ startedAt: 'not-a-date', targetDurationDays: 21 }, NOW_MS).active, false)
  // A null/absent status (legacy row or fixture) is not asserted either way and still reports
  // the active Day N — matching the report's own normaliseStatus tolerance.
  assert.equal(dietTrialStatus({ startedAt: '2026-07-01', targetDurationDays: 21 }, NOW_MS).active, true)
  assert.equal(dietTrialStatus({ startedAt: '2026-07-01', targetDurationDays: 21, status: 'active' }, NOW_MS).active, true)
})

// ── B-421: the day boundary is the OWNER'S midnight, not UTC ───────────────────────
//
// The mirror of lib/analytics.test.ts "getDietTrialProgress — timezone honesty". Ask
// must never quote a different Day N than the trial card the owner is looking at (G5),
// so the two suites assert the SAME numbers against the SAME instants — the client
// reading the device zone, this one reading `user_profiles.timezone`. If these two
// blocks ever disagree, the port has drifted.

const MINUS_7 = 'Etc/GMT+7' // POSIX sign inversion — this IS UTC−7
const PLUS_11 = 'Etc/GMT-11' // …and this IS UTC+11

Deno.test('dietTrialStatus — one local day, one Day N, on both sides of the date line', () => {
  const trial = { startedAt: '2026-06-10', targetDurationDays: 14 }
  // Four instants that are all "14 Jun, local" for their owner. Day 1 is 10 Jun.
  const cases: Array<[string, string]> = [
    [MINUS_7, '2026-06-14T07:30:00.000Z'], // 00:30 local
    [MINUS_7, '2026-06-15T06:30:00.000Z'], // 23:30 local — UTC has already rolled over
    [PLUS_11, '2026-06-13T13:30:00.000Z'], // 00:30 local — UTC has not yet
    [PLUS_11, '2026-06-14T12:30:00.000Z'], // 23:30 local
  ]
  for (const [tz, iso] of cases) {
    const r = dietTrialStatus(trial, Date.parse(iso), tz)
    assert.equal(r.dayCounter, 5, `${tz} @ ${iso}`)
    assert.equal(r.daysRemaining, 9)
  }
})

Deno.test('dietTrialStatus — a trial that started "yesterday" local reads Day 2 in both zones', () => {
  const trial = { startedAt: '2026-06-13', targetDurationDays: 14 }
  assert.equal(dietTrialStatus(trial, Date.parse('2026-06-15T06:30:00.000Z'), MINUS_7).dayCounter, 2)
  assert.equal(dietTrialStatus(trial, Date.parse('2026-06-13T13:30:00.000Z'), PLUS_11).dayCounter, 2)
})

Deno.test('dietTrialStatus — a trial that started today reads Day 1, never Day 0 or 2', () => {
  const trial = { startedAt: '2026-06-14', targetDurationDays: 14 }
  assert.equal(dietTrialStatus(trial, Date.parse('2026-06-15T06:30:00.000Z'), MINUS_7).dayCounter, 1)
  assert.equal(dietTrialStatus(trial, Date.parse('2026-06-13T13:30:00.000Z'), PLUS_11).dayCounter, 1)
})

Deno.test('dietTrialStatus — a DST transition inside the trial does not eat a day', () => {
  // 6 Mar → 9 Mar 2026 in America/Los_Angeles is 71 local hours (spring-forward on
  // the 8th). A millisecond-span divide floors to 2 and reads Day 3; the truth is 4.
  const r = dietTrialStatus(
    { startedAt: '2026-03-06', targetDurationDays: 14 },
    Date.parse('2026-03-09T19:00:00.000Z'),
    'America/Los_Angeles',
  )
  assert.equal(r.dayCounter, 4)
})

Deno.test('dietTrialStatus — an absent or invalid timezone degrades to UTC, never to silence', () => {
  // Unlike time_of_day, which stays silent without a zone: a day counter is a plain
  // fact the owner is owed, and UTC is the behaviour this shipped with. Still active.
  const trial = { startedAt: '2026-07-01', targetDurationDays: 21 }
  for (const tz of [undefined, null, 'Not/AZone']) {
    const r = dietTrialStatus(trial, NOW_MS, tz)
    assert.equal(r.active, true)
    assert.equal(r.dayCounter, 15)
  }
})

// ── B-443: the fallback the caller now steps around ───────────────────────────────
//
// dietTrialStatus buckets by whatever zone it is HANDED; these cases pin how it degrades
// when that zone is wrong, which is why B-443 changed the CALLER, not this function. The
// client card buckets by the DEVICE zone; the server used to bucket by the stored
// `user_profiles.timezone`, which is `NOT NULL DEFAULT 'America/New_York'` (migration 001) —
// so a never-stamped Sydney owner's Ask answer disagreed with their card by a day, silently,
// and no fallback was even reached (a real IANA default can't express "unknown"). The fix is
// upstream (ask/index.ts): the client passes its device zone on the request, and
// `resolveIanaZone(requestZone, storedZone)` prefers it — so Ask now buckets by the SAME zone
// the card does BY CONSTRUCTION (resolveIanaZone's own preference is pinned in lib/utils.test.ts).
// The stale-default / null cases below are the LAST-RESORT degrade the caller now avoids, not
// an open bug: given a correct zone (what the caller now supplies), both sides agree.

Deno.test('dietTrialStatus — given the DEVICE zone (what the caller now supplies) it matches the card', () => {
  const trial = { startedAt: '2026-06-10', targetDurationDays: 14 }
  const at8amSydney = Date.parse('2026-06-13T21:00:00.000Z') // 14 Jun 08:00 in UTC+10
  // The card buckets by the device (Sydney) zone; the caller now hands Ask that same zone.
  assert.equal(dietTrialStatus(trial, at8amSydney, 'Australia/Sydney').dayCounter, 5)
})

Deno.test('dietTrialStatus — the stored NY default / null is the degrade B-443 steps around', () => {
  const trial = { startedAt: '2026-06-10', targetDurationDays: 14 }
  const at8amSydney = Date.parse('2026-06-13T21:00:00.000Z')
  // If the caller ever fell through to the stored NY default or a null zone, the counter would
  // read Day 4 where the Sydney card reads Day 5. resolveIanaZone is what keeps that from being
  // the zone dietTrialStatus is handed — it prefers the request's device zone (Sydney) over both.
  assert.equal(dietTrialStatus(trial, at8amSydney, 'America/New_York').dayCounter, 4)
  assert.equal(dietTrialStatus(trial, at8amSydney, null).dayCounter, 4)
})

Deno.test('dietTrialStatus — a date-only start is never re-read as UTC midnight', () => {
  // The DATE column has no time. Parsing '2026-06-10' as an instant lands it on
  // 9 Jun local for anyone behind UTC, inflating every counter built on it by one.
  // Indexed as a calendar day, the start day is the same in both zones.
  const trial = { startedAt: '2026-06-10', targetDurationDays: 14 }
  const noon = Date.parse('2026-06-10T19:00:00.000Z') // 12:00 in UTC−7, still 10 Jun
  assert.equal(dietTrialStatus(trial, noon, MINUS_7).dayCounter, 1)
})

Deno.test('resolveWindow — 14d / 30d state their windows', () => {
  assert.equal(resolveWindow('14d', NOW_MS).label, 'the last 14 days')
  assert.equal(resolveWindow('30d', NOW_MS).label, 'the last 30 days')
})

Deno.test('freeFedStatus — active = active_until IS NULL (DB semantics, not an interval check)', () => {
  const r = freeFedStatus([
    { id: 'a', foodItemId: 'ff', foodLabel: 'Grazing Kibble', primaryProtein: 'Chicken', activeFrom: '2026-07-01', activeUntil: null, deletedAt: null },
    { id: 'b', foodItemId: 'old', foodLabel: 'Old Bowl', primaryProtein: 'beef', activeFrom: '2026-05-01', activeUntil: '2026-06-01', deletedAt: null }, // ended → inactive
    { id: 'c', foodItemId: 'del', foodLabel: 'Deleted', primaryProtein: 'lamb', activeFrom: null, activeUntil: null, deletedAt: '2026-07-01T00:00:00Z' },
  ])
  assert.equal(r.arrangements.length, 1)
  assert.equal(r.arrangements[0].protein, 'chicken') // canonicalized
  assert.equal(r.intakeNotDirectlyObserved, true)
})

Deno.test('freeFedStatus — an ended-TODAY arrangement (DATE active_until) reads inactive, no UTC drift', () => {
  // The code-review bug: a now ∈ [from, until] check against a DATE-only active_until would
  // read this as still-active for hours in a +UTC zone. Keying on active_until != null is
  // timezone-independent: an ended arrangement (any non-null active_until) is inactive.
  const r = freeFedStatus([
    { id: 'a', foodItemId: 'ff', foodLabel: 'Bowl', primaryProtein: 'chicken', activeFrom: '2026-07-10', activeUntil: '2026-07-15', deletedAt: null },
  ])
  assert.equal(r.arrangements.length, 0)
  assert.equal(r.intakeNotDirectlyObserved, false)
})

Deno.test('medications — active regimen, last-given ignores refused/missed doses', () => {
  const regimens = [
    { id: 'r1', drugLabel: 'Apoquel', status: 'active', startedAt: '2026-07-01', endedAt: null, doseAmount: '16mg', deletedAt: null },
  ]
  const doses = [
    { id: 'd1', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null },
    { id: 'd2', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-15T08:00:00Z', adherence: 'refused', deletedAt: null },
    { id: 'd3', medicationId: 'r1', drugLabel: 'Apoquel', occurredAt: '2026-07-13T08:00:00Z', adherence: null, deletedAt: null }, // null = unrated, NOT given
  ]
  const r = medications(regimens, doses, { window: '30d', nowMs: NOW_MS })
  const apoquel = r.medications.find((m) => m.medicationId === 'r1')
  assert.equal(apoquel?.active, true)
  assert.equal(apoquel?.dosesGiven, 1) // 'given' ONLY — a null/unrated dose never reads as given (never-reassure)
  assert.equal(apoquel?.dosesMissed, 1) // refused
  assert.equal(apoquel?.dosesUnconfirmed, 1) // the null dose is REPORTED, not silently dropped (B-395)
  assert.equal(apoquel?.lastDoseAt, '2026-07-14T08:00:00Z') // NOT the 07-15 refusal, NOT the 07-13 unrated
})

Deno.test('medications — a partial or unconfirmed(null) dose never reads as "given" (never-reassure)', () => {
  // Adversarial-reviewer 2026-07-19: once attribution folds an unlinked dose into a NAMED
  // regimen, a partial/null dose counted as given became a false administration report.
  const regimens = [
    { id: 'r1', medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', status: 'active', startedAt: '2026-07-01', endedAt: null, doseAmount: null, deletedAt: null },
  ]
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', occurredAt: '2026-07-14T08:00:00Z', adherence: 'partial', deletedAt: null },
    { id: 'd2', medicationId: null, medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', occurredAt: '2026-07-15T08:00:00Z', adherence: null, deletedAt: null }, // B-156 G1 unconfirmed
  ]
  const r = medications(regimens, doses, { window: '30d', nowMs: NOW_MS })
  const cet = r.medications.find((m) => m.medicationId === 'r1')
  assert.equal(cet?.dosesGiven, 0) // neither partial nor unconfirmed is a clean given
  assert.equal(cet?.lastDoseAt, null) // an unconfirmed dose is never named "last given"
  // B-395: …but neither dose vanishes any more — each lands in its own honest bucket, so
  // the planner can say "1 not fully taken, 1 unconfirmed" instead of reporting nothing.
  assert.equal(cet?.dosesPartial, 1)
  assert.equal(cet?.dosesUnconfirmed, 1)
  assert.equal(cet?.dosesMissed, 0)
})

Deno.test('medications — every dose lands in exactly ONE bucket; off-enum adherence is unconfirmed (B-395)', () => {
  // Four-bucket parity with the client tally (lib/medications.ts bucketAdherence): given /
  // partial / missed+refused / unrated-or-unknown. An unrecognised adherence string is a
  // dose the record can't vouch for — it buckets as unconfirmed, never as given.
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-10T08:00:00Z', adherence: 'given', deletedAt: null },
    { id: 'd2', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-11T08:00:00Z', adherence: 'partial', deletedAt: null },
    { id: 'd3', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-12T08:00:00Z', adherence: 'missed', deletedAt: null },
    { id: 'd4', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-13T08:00:00Z', adherence: 'refused', deletedAt: null },
    { id: 'd5', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-14T08:00:00Z', adherence: null, deletedAt: null },
    { id: 'd6', medicationId: null, medicationItemId: 'item-x', drugLabel: 'Motozol', occurredAt: '2026-07-15T08:00:00Z', adherence: 'sort-of', deletedAt: null }, // off-enum
  ]
  const r = medications([], doses, { window: '30d', nowMs: NOW_MS })
  const m = r.medications.find((x) => x.drugLabel === 'Motozol')
  assert.equal(m?.dosesGiven, 1)
  assert.equal(m?.dosesPartial, 1)
  assert.equal(m?.dosesMissed, 2) // missed + refused
  assert.equal(m?.dosesUnconfirmed, 2) // null + the off-enum string
  // Reconciliation: the buckets partition the logged doses — nothing dropped, nothing double-counted.
  assert.equal((m!.dosesGiven + m!.dosesPartial + m!.dosesMissed + m!.dosesUnconfirmed), doses.length)
  assert.equal(m?.lastDoseAt, '2026-07-10T08:00:00Z') // still the last GIVEN, not the off-enum 07-15
})

Deno.test('medications — active keys on status, not a [started,ended] interval (no UTC drift)', () => {
  // Ended-TODAY regimen (DATE ended_at == today): an interval check against UTC-midnight
  // ended_at would read it active for hours in a +UTC zone. status==='ended' is authoritative.
  const regimens = [
    { id: 'ended', drugLabel: 'Metronidazole', status: 'ended', startedAt: '2026-07-01', endedAt: '2026-07-15', doseAmount: null, deletedAt: null },
    { id: 'nostatus', drugLabel: 'Legacy', status: null, startedAt: '2026-07-01', endedAt: null, doseAmount: null, deletedAt: null }, // fallback: endedAt null → active
    { id: 'gone', drugLabel: 'Deleted', status: 'active', startedAt: '2026-07-01', endedAt: null, doseAmount: null, deletedAt: '2026-07-10T00:00:00Z' },
  ]
  const r = medications(regimens, [], { window: '30d', nowMs: NOW_MS })
  assert.equal(r.medications.find((m) => m.medicationId === 'ended')?.active, false)
  assert.equal(r.medications.find((m) => m.medicationId === 'nostatus')?.active, true)
  // soft-deleted regimen never surfaces at all
  assert.equal(r.medications.some((m) => m.medicationId === 'gone'), false)
})

Deno.test('medications — a regimen-unlinked dose linked to a library item reports NAMED, not "a medication"', () => {
  // The motozol bug: a one-tap dose is medicationId-null (B-135) but item-linked; before the
  // fix index.ts left drugLabel null and the tool collapsed it into an anonymous "a medication".
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: 'item-motozol', drugLabel: 'Motozol', occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null },
    { id: 'd2', medicationId: null, medicationItemId: 'item-motozol', drugLabel: 'Motozol', occurredAt: '2026-07-15T09:00:00Z', adherence: 'given', deletedAt: null },
  ]
  const r = medications([], doses, { window: '30d', nowMs: NOW_MS })
  const motozol = r.medications.find((m) => m.drugLabel === 'Motozol')
  assert.equal(motozol?.medicationId, null) // ad-hoc: no regimen
  assert.equal(motozol?.dosesGiven, 2)
  assert.equal(motozol?.lastDoseAt, '2026-07-15T09:00:00Z')
  // and it is NOT hidden inside the anonymous bucket
  assert.equal(r.medications.some((m) => m.drugLabel === 'a medication'), false)
})

Deno.test('medications — two different ad-hoc drugs stay SEPARATE (no collapse)', () => {
  // Before the fix both had drugLabel null → both merged into one "a medication" pile.
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: 'item-motozol', drugLabel: 'Motozol', occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null },
    { id: 'd2', medicationId: null, medicationItemId: 'item-pred', drugLabel: 'Prednisone', occurredAt: '2026-07-14T09:00:00Z', adherence: 'given', deletedAt: null },
  ]
  const r = medications([], doses, { window: '30d', nowMs: NOW_MS })
  assert.equal(r.medications.find((m) => m.drugLabel === 'Motozol')?.dosesGiven, 1)
  assert.equal(r.medications.find((m) => m.drugLabel === 'Prednisone')?.dosesGiven, 1)
})

Deno.test('medications — an item-linked ad-hoc dose FOLDS into the same-drug regimen (G5 parity, no duplicate)', () => {
  // The client's attributeDosesToRegimens matches an unlinked dose to its regimen by
  // medication_item_id + lifespan; Ask must agree, or its regimen dose count would differ from
  // the "Current medications" card and a phantom duplicate entry would appear.
  const regimens = [
    { id: 'r1', medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', status: 'active', startedAt: '2026-07-01', endedAt: null, doseAmount: null, deletedAt: null },
  ]
  const doses = [
    { id: 'd1', medicationId: 'r1', medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', occurredAt: '2026-07-13T08:00:00Z', adherence: 'given', deletedAt: null }, // explicit link
    { id: 'd2', medicationId: null, medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null }, // unlinked, same drug
  ]
  const r = medications(regimens, doses, { window: '30d', nowMs: NOW_MS })
  const cet = r.medications.filter((m) => m.drugLabel === 'Cetirizine HCl')
  assert.equal(cet.length, 1) // ONE entry, not a regimen + a duplicate ad-hoc
  assert.equal(cet[0].medicationId, 'r1')
  assert.equal(cet[0].dosesGiven, 2) // BOTH doses counted toward the regimen
})

Deno.test('medications — an unlinked dose does NOT fold into a same-drug regimen that started AFTER it', () => {
  // Lifespan guard (attributeDosesToRegimens window): a dose before the regimen began is ad-hoc.
  const regimens = [
    { id: 'r1', medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', status: 'active', startedAt: '2026-07-10', endedAt: null, doseAmount: null, deletedAt: null },
  ]
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: 'item-cet', drugLabel: 'Cetirizine HCl', occurredAt: '2026-07-05T08:00:00Z', adherence: 'given', deletedAt: null },
  ]
  const r = medications(regimens, doses, { window: '30d', nowMs: NOW_MS })
  assert.equal(r.medications.find((m) => m.medicationId === 'r1')?.dosesGiven, 0) // regimen sees nothing
  const adhoc = r.medications.find((m) => m.medicationId === null && m.drugLabel === 'Cetirizine HCl')
  assert.equal(adhoc?.dosesGiven, 1) // dose surfaces as ad-hoc instead
})

Deno.test('medications — a genuinely nameless ad-hoc dose still falls back to "a medication"', () => {
  const doses = [
    { id: 'd1', medicationId: null, medicationItemId: null, drugLabel: null, occurredAt: '2026-07-14T08:00:00Z', adherence: 'given', deletedAt: null },
  ]
  const r = medications([], doses, { window: '30d', nowMs: NOW_MS })
  assert.equal(r.medications.find((m) => m.drugLabel === 'a medication')?.dosesGiven, 1)
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
