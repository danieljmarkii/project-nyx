// Unit tests for the generate-report I/O shell's PURE pieces (Step 9, Phase 2 PR 5).
//
// Run with:  deno test supabase/functions/generate-report/index.test.ts
//
// The shell's load-bearing logic is the DB-row → ReportInput mapping (renaming +
// join/enum/numeric normalisation) and the event-pull lookback math. The clinical
// honesty invariants live in report.ts (covered by report.test.ts); here we prove
// (a) each mapper translates the raw select shape faithfully, including the two
// Supabase embed shapes (object vs single-element array) and the parent-event
// soft-delete drop, and (b) mapped rows flow cleanly through assembleReport →
// renderReport into HTML. node:assert + Deno.test, no remote imports (CI-safe).

import { strict as assert } from 'node:assert'
import {
  mapPet,
  mapEventRows,
  mapAiAnalysisRows,
  mapWeightRows,
  mapDoseRows,
  mapMedicationRows,
  mapDietTrialRows,
  mapVetVisitRows,
  mapFeedingArrangementRows,
  mapConditionRows,
  computeLookbackIso,
  generateReportForPet,
} from './index.ts'
import { assembleReport, resolveScope, type ReportInput } from './report.ts'
import { renderReport } from './render.ts'

const NOW = '2026-07-02T12:00:00Z'
const NOW_MS = Date.parse(NOW)
const MS_PER_DAY = 86_400_000

// ── mapPet ──────────────────────────────────────────────────────────────────

Deno.test('mapPet: coerces NUMERIC weight string, passes enums, forces neuter null', () => {
  const pet = mapPet({
    id: 'p1',
    name: 'Nyx',
    species: 'cat',
    breed: 'Domestic Shorthair',
    sex: 'female',
    date_of_birth: '2020-01-15',
    weight_kg: '4.20', // PostgREST returns NUMERIC as string
  })
  assert.equal(pet.weightKg, 4.2)
  assert.equal(pet.species, 'cat')
  assert.equal(pet.sex, 'female')
  assert.equal(pet.neuterStatus, null) // not stored on pets (§7.1)
  assert.equal(pet.dateOfBirth, '2020-01-15')
})

Deno.test('mapPet: null weight stays null (never fabricated)', () => {
  const pet = mapPet({
    id: 'p1', name: 'X', species: 'dog', breed: null, sex: 'unknown', date_of_birth: null, weight_kg: null,
  })
  assert.equal(pet.weightKg, null)
  assert.equal(pet.breed, null)
})

// ── mapEventRows ────────────────────────────────────────────────────────────

Deno.test('mapEventRows: meal detail attached ONLY for meal events, food join normalised', () => {
  const rows = mapEventRows([
    {
      id: 'e1', event_type: 'vomit', occurred_at: NOW,
      occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
      severity: 3, notes: 'foamy', created_at: NOW, meals: null,
    },
    {
      id: 'e2', event_type: 'meal', occurred_at: NOW,
      occurred_at_confidence: null, occurred_at_earliest: null, occurred_at_latest: null,
      severity: null, notes: null, created_at: NOW,
      // embed returned as a single-element array (the ambiguous Supabase shape)
      meals: [{
        food_item_id: 'f1', intake_rating: 'all', quantity: 'full',
        food_items: { food_type: 'meal', format: 'kibble', primary_protein: 'duck', brand: 'RC', product_name: 'Weight' },
      }],
    },
  ])
  assert.equal(rows[0].meal, null)
  assert.equal(rows[0].severity, 3)
  assert.equal(rows[0].occurredAtConfidence, 'witnessed')
  assert.equal(rows[0].loggedAt, NOW)
  assert.ok(rows[1].meal)
  assert.equal(rows[1].meal!.primaryProtein, 'duck')
  assert.equal(rows[1].meal!.foodType, 'meal')
  assert.equal(rows[1].meal!.format, 'kibble')
  assert.equal(rows[1].meal!.brand, 'RC')
  assert.equal(rows[1].meal!.intakeRating, 'all')
})

Deno.test('mapEventRows: meal with no food_items join maps to null protein/label, not a crash', () => {
  const rows = mapEventRows([{
    id: 'e1', event_type: 'meal', occurred_at: NOW,
    occurred_at_confidence: null, occurred_at_earliest: null, occurred_at_latest: null,
    severity: null, notes: null, created_at: NOW,
    meals: { food_item_id: null, intake_rating: null, quantity: 'unknown', food_items: null },
  }])
  assert.ok(rows[0].meal)
  assert.equal(rows[0].meal!.primaryProtein, null)
  assert.equal(rows[0].meal!.brand, null)
  assert.equal(rows[0].meal!.intakeRating, null)
})

Deno.test('mapEventRows: B-010 window fields carried through', () => {
  const rows = mapEventRows([{
    id: 'e1', event_type: 'vomit', occurred_at: '2026-07-02T07:44:00Z',
    occurred_at_confidence: 'window',
    occurred_at_earliest: '2026-07-02T04:00:00Z', occurred_at_latest: '2026-07-02T07:44:00Z',
    severity: null, notes: null, created_at: NOW, meals: null,
  }])
  assert.equal(rows[0].occurredAtEarliest, '2026-07-02T04:00:00Z')
  assert.equal(rows[0].occurredAtLatest, '2026-07-02T07:44:00Z')
})

// ── mapAiAnalysisRows ───────────────────────────────────────────────────────

Deno.test('mapAiAnalysisRows: fields renamed, editedAt drives owner-reviewed', () => {
  const rows = mapAiAnalysisRows([{
    event_id: 'e1', status: 'completed', colour: 'yellow', contents: ['bile'], consistency: 'foamy',
    blood_present: 'none_visible', bile_present: 'yes', foreign_material_present: 'no',
    foreign_material_note: null, edited_at: '2026-07-01T00:00:00Z',
  }])
  assert.equal(rows[0].bloodPresent, 'none_visible')
  assert.equal(rows[0].bilePresent, 'yes')
  assert.deepEqual(rows[0].contents, ['bile'])
  assert.equal(rows[0].editedAt, '2026-07-01T00:00:00Z')
})

// ── mapWeightRows (parent-event join + soft-delete drop) ─────────────────────

Deno.test('mapWeightRows: reads timing from parent, drops soft-deleted parent + null weight', () => {
  const rows = mapWeightRows([
    { event_id: 'w1', weight_kg: '4.10', events: { occurred_at: '2026-06-01T12:00:00Z', deleted_at: null } },
    // soft-deleted parent → excluded (soft-delete lives on the event)
    { event_id: 'w2', weight_kg: '4.30', events: { occurred_at: '2026-06-15T12:00:00Z', deleted_at: '2026-06-16T00:00:00Z' } },
    // embed as array shape
    { event_id: 'w3', weight_kg: 5, events: [{ occurred_at: '2026-06-20T12:00:00Z', deleted_at: null }] },
    // parent join missing → dropped (can't place it in time)
    { event_id: 'w4', weight_kg: '4.0', events: null },
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.eventId), ['w1', 'w3'])
  assert.equal(rows[0].weightKg, 4.1)
  assert.equal(rows[0].occurredAt, '2026-06-01T12:00:00Z')
  assert.equal(rows[1].weightKg, 5)
})

Deno.test('mapWeightRows: lookbackMs drops readings whose parent event predates the floor', () => {
  const floor = Date.parse('2026-04-04T00:00:00Z')
  const rows = mapWeightRows(
    [
      { event_id: 'old', weight_kg: '4.0', events: { occurred_at: '2026-01-01T12:00:00Z', deleted_at: null } },
      { event_id: 'new', weight_kg: '4.2', events: { occurred_at: '2026-06-01T12:00:00Z', deleted_at: null } },
    ],
    floor,
  )
  assert.deepEqual(rows.map((r) => r.eventId), ['new'])
})

// ── mapDoseRows ─────────────────────────────────────────────────────────────

Deno.test('mapDoseRows: timing from parent, soft-deleted dropped, paired link carried', () => {
  const rows = mapDoseRows([
    {
      event_id: 'd1', medication_id: 'reg1', medication_item_id: 'item1', adherence: 'given',
      dose_amount: '5 mg', paired_event_id: 'meal1',
      events: { occurred_at: '2026-06-10T08:00:00Z', deleted_at: null },
    },
    {
      event_id: 'd2', medication_id: null, medication_item_id: null, adherence: 'refused',
      dose_amount: null, paired_event_id: null,
      events: { occurred_at: '2026-06-11T08:00:00Z', deleted_at: '2026-06-12T00:00:00Z' },
    },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].eventId, 'd1')
  assert.equal(rows[0].occurredAt, '2026-06-10T08:00:00Z')
  assert.equal(rows[0].medicationId, 'reg1')
  assert.equal(rows[0].adherence, 'given')
  assert.equal(rows[0].pairedEventId, 'meal1')
})

Deno.test('mapDoseRows: lookbackMs bounds a chronic regimen to the pull window', () => {
  const floor = Date.parse('2026-04-04T00:00:00Z')
  const rows = mapDoseRows(
    [
      { event_id: 'old', medication_id: 'r', medication_item_id: null, adherence: 'given', dose_amount: null, paired_event_id: null,
        events: { occurred_at: '2025-01-01T08:00:00Z', deleted_at: null } },
      { event_id: 'new', medication_id: 'r', medication_item_id: null, adherence: 'given', dose_amount: null, paired_event_id: null,
        events: { occurred_at: '2026-06-01T08:00:00Z', deleted_at: null } },
    ],
    floor,
  )
  assert.deepEqual(rows.map((r) => r.eventId), ['new'])
})

// ── mapMedicationRows ───────────────────────────────────────────────────────

Deno.test('mapMedicationRows: item join supplies strength/is_prescription, doses_per_day coerced', () => {
  const rows = mapMedicationRows([{
    id: 'reg1', medication_item_id: 'item1', drug_name: 'Metronidazole', dose_amount: '250 mg',
    route: 'oral', doses_per_day: '2.00', schedule_notes: '8am & 8pm', indication: 'GI',
    prescribed_by: 'Dr Chen', started_at: '2026-06-01', target_duration_days: 14,
    status: 'active', ended_at: null,
    medication_items: { is_prescription: true, strength: '250 mg' },
  }])
  assert.equal(rows[0].dosesPerDay, 2)
  assert.equal(rows[0].isPrescription, true)
  assert.equal(rows[0].strength, '250 mg')
  assert.equal(rows[0].drugName, 'Metronidazole')
})

Deno.test('mapMedicationRows: null item join → null strength/is_prescription, PRN null dosesPerDay', () => {
  const rows = mapMedicationRows([{
    id: 'reg1', medication_item_id: null, drug_name: 'Probiotic', dose_amount: null,
    route: null, doses_per_day: null, schedule_notes: null, indication: null,
    prescribed_by: null, started_at: '2026-06-01', target_duration_days: null,
    status: 'active', ended_at: null, medication_items: null,
  }])
  assert.equal(rows[0].dosesPerDay, null)
  assert.equal(rows[0].isPrescription, null)
  assert.equal(rows[0].strength, null)
})

// ── mapDietTrialRows / mapFeedingArrangementRows (food label) ────────────────

Deno.test('mapDietTrialRows: builds "Brand Product" label from food join', () => {
  const rows = mapDietTrialRows([{
    id: 't1', food_item_id: 'f1', started_at: '2026-05-01', target_duration_days: 56,
    status: 'active', completed_at: null, vet_name: 'Dr Chen',
    food_items: { food_type: 'meal', format: 'kibble', primary_protein: 'duck', brand: 'Royal Canin', product_name: 'Hydrolyzed' },
  }])
  assert.equal(rows[0].foodLabel, 'Royal Canin Hydrolyzed')
  assert.equal(rows[0].primaryProtein, 'duck')
})

Deno.test('mapFeedingArrangementRows: label + protein from join, method + shared carried', () => {
  const rows = mapFeedingArrangementRows([{
    id: 'a1', food_item_id: 'f1', method: 'free_choice', active_from: '2026-04-01',
    active_until: null, is_shared: false,
    food_items: { primary_protein: 'duck', brand: 'RC', product_name: 'Weight' },
  }])
  assert.equal(rows[0].method, 'free_choice')
  assert.equal(rows[0].isShared, false)
  assert.equal(rows[0].foodLabel, 'RC Weight')
  assert.equal(rows[0].activeUntil, null)
})

Deno.test('mapVetVisitRows / mapConditionRows: straight field renames', () => {
  const v = mapVetVisitRows([{ visited_at: '2026-05-01', clinic_name: 'Vets', vet_name: 'Chen', reason: 'GI' }])
  assert.equal(v[0].visitedAt, '2026-05-01')
  assert.equal(v[0].clinicName, 'Vets')
  const c = mapConditionRows([{ condition_name: 'IBD', status: 'active', diagnosed_at: '2025-01-01' }])
  assert.equal(c[0].conditionName, 'IBD')
  assert.equal(c[0].diagnosedAt, '2025-01-01')
})

// ── computeLookbackIso ──────────────────────────────────────────────────────

Deno.test('computeLookbackIso: recent window → base 180d floor governs', () => {
  const scope = resolveScope({
    now: NOW, timezone: null, pet: mapPet({ id: 'p', name: 'x', species: 'dog', breed: null, sex: 'unknown', date_of_birth: null, weight_kg: null }),
    ownerName: null, events: [], aiAnalyses: [], weightChecks: [], doses: [], medications: [],
    dietTrials: [], vetVisits: [], feedingArrangements: [], conditions: [],
  })
  // no trial/visit → 90-day fallback window; base floor (now-180d) is earlier than
  // (windowStart - 90d) = now-180d ... they tie, so the floor is now-180d.
  const iso = computeLookbackIso(scope, NOW_MS)
  assert.equal(iso, new Date(NOW_MS - 180 * MS_PER_DAY).toISOString())
})

Deno.test('computeLookbackIso: an old since-visit window is still fully covered (+90d buffer before it)', () => {
  // Visit 300 days ago → window starts then; the pull must reach 90d before that,
  // which is earlier than the 180d base floor.
  const visit = new Date(NOW_MS - 300 * MS_PER_DAY).toISOString().slice(0, 10)
  const scope = resolveScope({
    now: NOW, timezone: null, pet: mapPet({ id: 'p', name: 'x', species: 'dog', breed: null, sex: 'unknown', date_of_birth: null, weight_kg: null }),
    ownerName: null, events: [], aiAnalyses: [], weightChecks: [], doses: [], medications: [],
    dietTrials: [], vetVisits: [{ visitedAt: visit, clinicName: null, vetName: null, reason: null }],
    feedingArrangements: [], conditions: [],
  })
  const iso = computeLookbackIso(scope, NOW_MS)
  const windowStartMs = Date.parse(`${scope.startDate}T00:00:00.000Z`)
  assert.equal(iso, new Date(windowStartMs - 90 * MS_PER_DAY).toISOString())
  assert.ok(Date.parse(iso) < NOW_MS - 180 * MS_PER_DAY, 'floor must precede the 180d base for an old window')
})

// ── Integration: raw rows → mappers → assembleReport → renderReport → HTML ────

Deno.test('integration: mapped rows assemble + render to HTML naming the pet', () => {
  const petRow = { id: 'p1', name: 'Nyx', species: 'cat', breed: 'DSH', sex: 'female' as const, date_of_birth: '2020-01-01', weight_kg: '4.2' }
  const events = mapEventRows([
    { id: 'e1', event_type: 'vomit', occurred_at: new Date(NOW_MS - 3 * MS_PER_DAY).toISOString(),
      occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
      severity: null, notes: null, created_at: NOW, meals: null },
    { id: 'e2', event_type: 'vomit', occurred_at: new Date(NOW_MS - 10 * MS_PER_DAY).toISOString(),
      occurred_at_confidence: 'witnessed', occurred_at_earliest: null, occurred_at_latest: null,
      severity: null, notes: null, created_at: NOW, meals: null },
  ])
  const input: ReportInput = {
    now: NOW, timezone: 'America/New_York', pet: mapPet(petRow), ownerName: 'Jordan',
    events,
    aiAnalyses: mapAiAnalysisRows([{ event_id: 'e1', status: 'completed', colour: 'yellow', contents: ['bile'],
      consistency: 'foamy', blood_present: 'none_visible', bile_present: 'yes', foreign_material_present: 'no',
      foreign_material_note: null, edited_at: null }]),
    weightChecks: [], doses: [], medications: [], dietTrials: [], vetVisits: [],
    feedingArrangements: [], conditions: [],
  }
  const snap = assembleReport(input)
  const html = renderReport(snap)
  assert.ok(html.length > 500, 'renders a substantial document')
  assert.ok(html.includes('Nyx'), 'names the pet')
  assert.ok(html.includes('Jordan'), 'names the owner for PIMS filing')
  assert.equal(snap.scope.basis, 'fallback_90d') // no trial, no visit → §6 rung 3
  assert.equal(snap.signalment.neuterStatus, 'not_recorded') // §7.1
})

// ── generateReportForPet: ownership guard via injected fake client ────────────

// Minimal fake matching the subset of the supabase-js chainable query builder the
// shell uses: .from().select().eq().maybeSingle()/.is().gte(). Each table resolves
// to a canned { data } (or { data: null } for an unowned pet).
function fakeClient(tables: Record<string, unknown>) {
  const builder = (table: string) => {
    const result = tables[table] as { single?: unknown; list?: unknown; error?: { message: string } } | undefined
    const err = result?.error ?? null
    const chain: Record<string, unknown> = {}
    const ret = () => chain
    chain.select = ret
    chain.eq = ret
    chain.is = ret
    chain.gte = ret
    chain.maybeSingle = () => Promise.resolve({ data: result?.single ?? null, error: err })
    chain.then = (onF: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: result?.list ?? [], error: err }).then(onF)
    return chain
  }
  return { from: builder } as unknown as Parameters<typeof generateReportForPet>[0]
}

Deno.test('generateReportForPet: unowned/absent pet → 404, never leaks a report', async () => {
  const client = fakeClient({ pets: { single: null } }) // RLS returns no pet
  const res = await generateReportForPet(client, 'somebody-elses-pet', NOW_MS, null)
  assert.equal(res.status, 404)
  assert.equal(res.body.html, undefined)
})

Deno.test('generateReportForPet: a query ERROR throws (never a silent false-clean report)', async () => {
  // A backend fault on the pet load must surface, and must NOT masquerade as a 404.
  const petErr = fakeClient({ pets: { error: { message: 'connection reset' } } })
  await assert.rejects(() => generateReportForPet(petErr, 'p1', NOW_MS, null), /pets read failed/)

  // A fault on a downstream pull (events) must throw too — a swallowed error would
  // render the pet as having zero events (a false-clean clinical artifact).
  const eventsErr = fakeClient({
    pets: { single: { id: 'p1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
    user_profiles: { single: { display_name: 'Jordan', timezone: 'UTC' } },
    vet_visits: { list: [] },
    diet_trials: { list: [] },
    events: { error: { message: 'statement timeout' } },
  })
  await assert.rejects(() => generateReportForPet(eventsErr, 'p1', NOW_MS, null), /events read failed/)
})

Deno.test('generateReportForPet: owned pet → 200 with html + scope metadata', async () => {
  const client = fakeClient({
    pets: { single: { id: 'p1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
    user_profiles: { single: { display_name: 'Jordan', timezone: 'America/New_York' } },
    vet_visits: { list: [] },
    diet_trials: { list: [] },
    events: { list: [] },
    event_ai_analysis: { list: [] },
    weight_checks: { list: [] },
    medication_administrations: { list: [] },
    medications: { list: [] },
    feeding_arrangements: { list: [] },
    conditions: { list: [] },
  })
  const res = await generateReportForPet(client, 'p1', NOW_MS, null)
  assert.equal(res.status, 200)
  assert.equal(res.body.pet_name, 'Nyx')
  assert.equal(res.body.scope_basis, 'fallback_90d')
  assert.ok(typeof res.body.html === 'string' && (res.body.html as string).includes('Nyx'))
})

Deno.test('generateReportForPet: no display name → owner falls back to the caller email (§7.1, PM 2026-07-03)', async () => {
  const tables = {
    pets: { single: { id: 'p1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
    user_profiles: { single: { display_name: null, timezone: 'America/New_York' } },
    vet_visits: { list: [] },
    diet_trials: { list: [] },
    events: { list: [] },
    event_ai_analysis: { list: [] },
    weight_checks: { list: [] },
    medication_administrations: { list: [] },
    medications: { list: [] },
    feeding_arrangements: { list: [] },
    conditions: { list: [] },
  }
  const client = fakeClient(tables) as unknown as {
    auth?: { getUser: (jwt: string) => Promise<{ data: { user: { email: string } | null }; error: null }> }
  }
  client.auth = {
    getUser: (jwt: string) => {
      assert.equal(jwt, 'jwt-token', 'the verified caller JWT is passed through')
      return Promise.resolve({ data: { user: { email: 'owner@example.com' } }, error: null })
    },
  }
  const res = await generateReportForPet(
    client as Parameters<typeof generateReportForPet>[0],
    'p1',
    NOW_MS,
    null,
    'jwt-token',
  )
  assert.equal(res.status, 200)
  assert.ok((res.body.html as string).includes('owner@example.com'), 'the email files the report')

  // A set display name WINS over the email (no fallback when the name exists) — and a
  // getUser failure must never sink the report.
  const named = fakeClient({
    ...tables,
    user_profiles: { single: { display_name: 'Daniel Mark', timezone: 'America/New_York' } },
  }) as unknown as { auth?: unknown }
  named.auth = {
    getUser: () => Promise.reject(new Error('must not be called when a name exists')),
  }
  const res2 = await generateReportForPet(
    named as Parameters<typeof generateReportForPet>[0],
    'p1',
    NOW_MS,
    null,
    'jwt-token',
  )
  assert.equal(res2.status, 200)
  assert.ok((res2.body.html as string).includes('Daniel Mark'))
  assert.ok(!(res2.body.html as string).includes('owner@example.com'))

  // getUser errors → "not recorded", never a 500.
  const failing = fakeClient(tables) as unknown as { auth?: unknown }
  failing.auth = { getUser: () => Promise.reject(new Error('gotrue down')) }
  const res3 = await generateReportForPet(
    failing as Parameters<typeof generateReportForPet>[0],
    'p1',
    NOW_MS,
    null,
    'jwt-token',
  )
  assert.equal(res3.status, 200)
  assert.ok((res3.body.html as string).includes('Owner: not recorded'))
})
