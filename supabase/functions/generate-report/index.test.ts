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
  mapMedicationItemRows,
  mapDietTrialRows,
  mapVetVisitRows,
  mapFeedingArrangementRows,
  mapConditionRows,
  mapAttachmentRows,
  mapHouseholdRows,
  detectPhotoMediaType,
  bytesToBase64,
  embedIncidentPhotos,
  computeLookbackIso,
  generateReportForPet,
  fetchAll,
  reachedLookbackIso,
  PULL_PAGE,
  PULL_MAX_PAGES,
} from './index.ts'
import {
  assembleReport,
  resolveScope,
  type IncidentPhoto,
  type ReportInput,
  type ScopeResolutionInput,
} from './report.ts'
import { renderReport } from './render.ts'
import type { ReportAudience } from './noticed.ts'

/** CUL-875 — `generateReportForPet` takes the audience as a REQUIRED 5th argument, with
 *  no default: a privacy decision a caller can omit is a privacy decision taken silently
 *  (the rls-privacy-reviewer proved an omitted argument printed the owner's note). Every
 *  test here exercises the authenticated owner path. */
const OWNER_AUDIENCE: ReportAudience = { kind: 'owner', includeLookNotes: true }

const NOW = '2026-07-02T12:00:00Z'
const NOW_MS = Date.parse(NOW)
const MS_PER_DAY = 86_400_000

// ── mapPet ──────────────────────────────────────────────────────────────────

Deno.test('mapPet: coerces NUMERIC weight string, passes enums, forces neuter null', () => {
  const pet = mapPet({
    id: 'p1',
    user_id: 'u1',
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
  // A legacy row without the precision column reads as 'exact' (all pre-028 DOBs
  // came from the calendar picker) — never accidentally hedged (B-251 PR 9).
  assert.equal(pet.dateOfBirthPrecision, 'exact')
})

Deno.test('mapPet: date_of_birth_precision "approximate" passes through (B-251 honesty)', () => {
  const pet = mapPet({
    id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: null, sex: 'female',
    date_of_birth: '2024-07-06', date_of_birth_precision: 'approximate', weight_kg: null,
  })
  assert.equal(pet.dateOfBirthPrecision, 'approximate')
})

Deno.test('mapPet: null weight stays null (never fabricated)', () => {
  const pet = mapPet({
    id: 'p1', user_id: 'u1', name: 'X', species: 'dog', breed: null, sex: 'unknown', date_of_birth: null, weight_kg: null,
  })
  assert.equal(pet.weightKg, null)
  assert.equal(pet.breed, null)
  assert.equal(pet.dateOfBirthPrecision, 'exact') // null precision → exact default
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
        food_items: { food_type: 'meal', format: 'kibble', primary_protein: 'duck', proteins: ['duck', 'chicken'], ingredients_notes: 'Duck, duck meal, chicken by-product meal, rice.', ai_extraction_confidence: { proteins: 0.9 }, brand: 'RC', product_name: 'Weight' },
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
    foreign_material_note: null,
    stool_consistency: null, stool_colour: null, stool_blood_present: null,
    stool_blood_type: null, stool_mucus_present: null,
    edited_at: '2026-07-01T00:00:00Z',
  }])
  assert.equal(rows[0].bloodPresent, 'none_visible')
  assert.equal(rows[0].bilePresent, 'yes')
  assert.deepEqual(rows[0].contents, ['bile'])
  assert.equal(rows[0].editedAt, '2026-07-01T00:00:00Z')
})

Deno.test('mapAiAnalysisRows: stool AI-read columns map through', () => {
  const rows = mapAiAnalysisRows([{
    event_id: 's1', status: 'completed', colour: null, contents: null, consistency: null,
    blood_present: null, bile_present: null, foreign_material_present: null, foreign_material_note: null,
    stool_consistency: 'type_6_mushy', stool_colour: 'brown', stool_blood_present: 'yes',
    stool_blood_type: 'dark_tarry', stool_mucus_present: 'no', edited_at: null,
  }])
  assert.equal(rows[0].stoolConsistency, 'type_6_mushy')
  assert.equal(rows[0].stoolColour, 'brown')
  assert.equal(rows[0].stoolBloodPresent, 'yes')
  assert.equal(rows[0].stoolBloodType, 'dark_tarry')
  assert.equal(rows[0].stoolMucusPresent, 'no')
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
    target_duration_doses: null, status: 'active', ended_at: null,
    medication_items: { is_prescription: true, strength: '250 mg' },
  }])
  assert.equal(rows[0].dosesPerDay, 2)
  assert.equal(rows[0].isPrescription, true)
  assert.equal(rows[0].strength, '250 mg')
  assert.equal(rows[0].drugName, 'Metronidazole')
  assert.equal(rows[0].targetDurationDays, 14)
  assert.equal(rows[0].targetDurationDoses, null) // days- XOR dose-denominated (migration 049 CHECK)
})

Deno.test('mapMedicationRows: a dose-denominated regimen carries target_duration_doses (B-618, §4.4)', () => {
  const rows = mapMedicationRows([{
    id: 'reg-doses', medication_item_id: 'item1', drug_name: 'Motozol', dose_amount: '50 mg',
    route: 'oral', doses_per_day: '2', schedule_notes: null, indication: null,
    prescribed_by: null, started_at: '2026-07-22', target_duration_days: null,
    target_duration_doses: 28, status: 'active', ended_at: null,
    medication_items: { is_prescription: true, strength: '50 mg' },
  }])
  assert.equal(rows[0].targetDurationDoses, 28)
  assert.equal(rows[0].targetDurationDays, null)
})

Deno.test('mapMedicationRows: null item join → null strength/is_prescription, PRN null dosesPerDay', () => {
  const rows = mapMedicationRows([{
    id: 'reg1', medication_item_id: null, drug_name: 'Probiotic', dose_amount: null,
    route: null, doses_per_day: null, schedule_notes: null, indication: null,
    prescribed_by: null, started_at: '2026-06-01', target_duration_days: null,
    target_duration_doses: null, status: 'active', ended_at: null, medication_items: null,
  }])
  assert.equal(rows[0].dosesPerDay, null)
  assert.equal(rows[0].isPrescription, null)
  assert.equal(rows[0].strength, null)
})

// ── mapMedicationItemRows (§3.8 orphan-dose name resolution) ──────────────────

Deno.test('mapMedicationItemRows: renames catalog columns, preserving nulls', () => {
  const rows = mapMedicationItemRows([
    { id: 'mi1', generic_name: 'Cetirizine HCl', brand_name: 'Zyrtec', strength: '5 mg', default_route: 'oral', is_prescription: false, form: 'tablet' },
    { id: 'mi2', generic_name: null, brand_name: null, strength: null, default_route: null, is_prescription: null, form: null },
  ])
  assert.equal(rows[0].genericName, 'Cetirizine HCl')
  assert.equal(rows[0].brandName, 'Zyrtec')
  assert.equal(rows[0].route, 'oral')
  assert.equal(rows[0].isPrescription, false)
  assert.equal(rows[1].genericName, null)
  assert.equal(rows[1].isPrescription, null)
})

// ── mapDietTrialRows / mapFeedingArrangementRows (food label) ────────────────

Deno.test('mapDietTrialRows: builds "Brand Product" label from food join', () => {
  const rows = mapDietTrialRows([{
    id: 't1', food_item_id: 'f1', started_at: '2026-05-01', target_duration_days: 56,
    status: 'active', completed_at: null, ended_at: null, indication: 'skin',
    outcome: null, outcome_notes: null, stopped_reason: null, food_label: 'Royal Canin Hydrolyzed',
    vet_name: 'Dr Chen',
    target_protein: 'duck', target_protein_set_at: '2026-05-03T10:00:00Z',
    // CUL-1041 migration 068 — a window that MOVED, so the mapper is asserted rather
    // than merely satisfied.
    target_duration_days_initial: 28, target_duration_set_at: '2026-06-25T14:00:00Z',
    target_duration_vet_directed: true,
    food_items: { food_type: 'meal', format: 'kibble', primary_protein: 'duck', proteins: ['duck'], ingredients_notes: null, ai_extraction_confidence: null, brand: 'Royal Canin', product_name: 'Hydrolyzed' },
    diet_trial_foods: [{
      food_item_id: 'f1', food_label: 'Royal Canin Hydrolyzed', role: 'primary_diet',
      allowed_from: '2026-05-01', allowed_until: null,
      food_items: { primary_protein: 'duck', proteins: ['duck', 'chicken'], ingredients_notes: 'Duck, chicken fat', ai_extraction_confidence: null, brand: 'Royal Canin', product_name: 'Hydrolyzed', format: 'wet_canned' },
    }],
  }])
  assert.equal(rows[0].foodLabel, 'Royal Canin Hydrolyzed')
  assert.equal(rows[0].primaryProtein, 'duck')
  assert.equal(rows[0].indication, 'skin')
  // B-455's reader half: `ended_at` reaches the pure layer at all.
  assert.equal(rows[0].endedAt, null)
  // CUL-1041 — all three window-provenance columns reach the pure layer.
  assert.equal(rows[0].targetDurationDaysInitial, 28)
  assert.equal(rows[0].targetDurationSetAt, '2026-06-25T14:00:00Z')
  assert.equal(rows[0].targetDurationVetDirected, true)
  // The allowed set (§3.2) — rung 1 has nothing to permit against without it.
  assert.equal(rows[0].allowedFoods?.length, 1)
  assert.equal(rows[0].allowedFoods?.[0].role, 'primary_diet')
  assert.deepEqual(rows[0].allowedFoods?.[0].proteins, ['duck', 'chicken'])
  assert.equal(rows[0].allowedFoods?.[0].brand, 'Royal Canin')
  // B-704 — the owner's stored trial protein + set-at reach the pure layer (§7.4).
  assert.equal(rows[0].targetProtein, 'duck')
  assert.equal(rows[0].targetProteinSetAt, '2026-05-03T10:00:00Z')
})

Deno.test('mapDietTrialRows: an ABANDONED trial carries ended_at, and food_label survives an archived food (B-455)', () => {
  // `completed_at` is NULL on an abandoned trial — the whole of B-455. And
  // `food_item_id` is ON DELETE SET NULL, so the join is empty once the owner
  // archives the trial food; §3.1's denormalized `food_label` is what stops the
  // trial losing its identity on the vet report at the same moment.
  const rows = mapDietTrialRows([{
    id: 't2', food_item_id: null, started_at: '2026-05-01', target_duration_days: 28,
    status: 'abandoned', completed_at: null, ended_at: '2026-05-19', indication: 'gi',
    outcome: null, outcome_notes: null, stopped_reason: 'refused',
    food_label: 'Purina HA', vet_name: null,
    target_protein: null, target_protein_set_at: null,
    // CUL-1041 — the ordinary row: the window has never moved.
    target_duration_days_initial: 28, target_duration_set_at: null,
    target_duration_vet_directed: null,
    food_items: null, diet_trial_foods: null,
  }])
  assert.equal(rows[0].endedAt, '2026-05-19')
  assert.equal(rows[0].completedAt, null)
  assert.equal(rows[0].foodLabel, 'Purina HA')
  assert.equal(rows[0].stoppedReason, 'refused')
  assert.deepEqual(rows[0].allowedFoods, [])
  // B-704 — a trial with no stored protein maps null (derivation still runs downstream).
  assert.equal(rows[0].targetProtein, null)
  assert.equal(rows[0].targetProteinSetAt, null)
  // CUL-1041 — a backfilled row whose window has never moved. `initial` alone is NOT
  // the "did it move?" predicate: it is populated here and the answer is still no.
  assert.equal(rows[0].targetDurationDaysInitial, 28)
  assert.equal(rows[0].targetDurationSetAt, null)
  assert.equal(rows[0].targetDurationVetDirected, null)
})

Deno.test('mapFeedingArrangementRows: label + protein from join, method + shared carried', () => {
  const rows = mapFeedingArrangementRows([{
    id: 'a1', food_item_id: 'f1', method: 'free_choice', active_from: '2026-04-01',
    active_until: null, is_shared: false,
    food_items: { primary_protein: 'duck', proteins: ['duck'], ingredients_notes: null, ai_extraction_confidence: null, brand: 'RC', product_name: 'Weight', format: 'dry_kibble' },
  }])
  assert.equal(rows[0].method, 'free_choice')
  assert.equal(rows[0].isShared, false)
  // B-568 — the standing arrangement names its FORM. A bowl of the dry and a bowl of
  // the wet of one product are different standing exposures; before this they were
  // one indistinguishable "RC Weight" line on the report.
  assert.equal(rows[0].foodLabel, 'RC Weight (Dry)')
  assert.equal(rows[0].activeUntil, null)
})

Deno.test('mapVetVisitRows / mapConditionRows: straight field renames', () => {
  const v = mapVetVisitRows([{ id: 'vv1', visited_at: '2026-05-01', clinic_name: 'Vets', vet_name: 'Chen', reason: 'GI' }])
  assert.equal(v[0].visitedAt, '2026-05-01')
  assert.equal(v[0].clinicName, 'Vets')
  const c = mapConditionRows([{ id: 'c1', condition_name: 'IBD', status: 'active', diagnosed_at: '2025-01-01' }])
  assert.equal(c[0].conditionName, 'IBD')
  assert.equal(c[0].diagnosedAt, '2025-01-01')
})

// ── computeLookbackIso ──────────────────────────────────────────────────────

Deno.test('computeLookbackIso: recent window → base 180d floor governs', () => {
  // CUL-875 — `resolveScope` takes `ScopeResolutionInput` (the five fields the cascade
  // reads), not a whole stub report. The stub only existed because the parameter was
  // typed as `ReportInput`.
  const scope = resolveScope({ now: NOW, timezone: null, requestedWindow: null, dietTrials: [], vetVisits: [] })
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
    now: NOW, timezone: null, requestedWindow: null, dietTrials: [],
    vetVisits: [{ visitedAt: visit, clinicName: null, vetName: null, reason: null }],
  })
  const iso = computeLookbackIso(scope, NOW_MS)
  const windowStartMs = Date.parse(`${scope.startDate}T00:00:00.000Z`)
  assert.equal(iso, new Date(windowStartMs - 90 * MS_PER_DAY).toISOString())
  assert.ok(Date.parse(iso) < NOW_MS - 180 * MS_PER_DAY, 'floor must precede the 180d base for an old window')
})

// ── B-613 — the trial term on the pull floor ────────────────────────────────
//
// The trial-crop disclosure counts symptoms in the trial days a window crops, and that
// count is only a TOTAL if the pull actually reached them. `since_visit` can crop more
// than the existing 90d pre-window buffer off a long trial's head, so the floor gains a
// third term — bounded, and never one that raises the floor.

const emptyScopeInput = (over: Partial<ScopeResolutionInput> = {}): ScopeResolutionInput => ({
  now: NOW, timezone: null, requestedWindow: null, dietTrials: [], vetVisits: [],
  ...over,
})

Deno.test('B-613 computeLookbackIso: a trial starting before the window stretches the pull to its start', () => {
  // A visit 20 days ago over a trial started 200 days ago: the window opens at the visit,
  // the existing terms floor at now-180d, and the trial's own head still sits 20 days
  // further back — exactly the span the block now discloses and could not have counted.
  const visit = new Date(NOW_MS - 20 * MS_PER_DAY).toISOString().slice(0, 10)
  const trialStart = new Date(NOW_MS - 200 * MS_PER_DAY).toISOString()
  const scope = resolveScope(emptyScopeInput({
    vetVisits: [{ visitedAt: visit, clinicName: null, vetName: null, reason: null }],
  }))
  const without = computeLookbackIso(scope, NOW_MS)
  const withTrial = computeLookbackIso(scope, NOW_MS, trialStart)
  assert.equal(without, new Date(NOW_MS - 180 * MS_PER_DAY).toISOString())
  assert.equal(withTrial, trialStart, 'the pull now reaches the trial start exactly')
  assert.ok(Date.parse(withTrial) < Date.parse(without))
})

Deno.test('B-613 computeLookbackIso: the trial term never RAISES the floor', () => {
  // The first report of any trial: the trial starts inside the window, so the term is
  // inert and the pull is byte-identical to what shipped before B-613. This is the
  // property that makes the new argument safe to add to every call.
  const scope = resolveScope(emptyScopeInput())
  const inside = new Date(NOW_MS - 5 * MS_PER_DAY).toISOString()
  assert.equal(computeLookbackIso(scope, NOW_MS, inside), computeLookbackIso(scope, NOW_MS))
  assert.equal(computeLookbackIso(scope, NOW_MS, null), computeLookbackIso(scope, NOW_MS))
  // An unparseable start is a missing one, never a NaN date.
  assert.equal(computeLookbackIso(scope, NOW_MS, 'not-a-date'), computeLookbackIso(scope, NOW_MS))
})

Deno.test('B-613 computeLookbackIso: the stretch is CAPPED at 400d before the window start', () => {
  // Nothing auto-completes a trial (B-422), so a stale-active row from years ago is the
  // steady state — and uncapped, one forgotten trial would turn a fortnight-long
  // `since_visit` report into a multi-year event pull. Past the cap the count does not
  // become wrong, it becomes a floor and says so.
  const visit = new Date(NOW_MS - 14 * MS_PER_DAY).toISOString().slice(0, 10)
  const scope = resolveScope(emptyScopeInput({
    vetVisits: [{ visitedAt: visit, clinicName: null, vetName: null, reason: null }],
  }))
  const ancient = new Date(NOW_MS - 900 * MS_PER_DAY).toISOString()
  const iso = computeLookbackIso(scope, NOW_MS, ancient)
  const windowStartMs = Date.parse(`${scope.startDate}T00:00:00.000Z`)
  assert.equal(iso, new Date(windowStartMs - 400 * MS_PER_DAY).toISOString())
  assert.ok(Date.parse(iso) > Date.parse(ancient), 'capped short of the trial start')
})

// ── Integration: raw rows → mappers → assembleReport → renderReport → HTML ────

Deno.test('integration: mapped rows assemble + render to HTML naming the pet', () => {
  const petRow = { id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: 'DSH', sex: 'female' as const, date_of_birth: '2020-01-01', weight_kg: '4.2' }
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
      foreign_material_note: null, stool_consistency: null, stool_colour: null, stool_blood_present: null,
      stool_blood_type: null, stool_mucus_present: null, edited_at: null }]),
    weightChecks: [], doses: [], medications: [], dietTrials: [], vetVisits: [],
    feedingArrangements: [], conditions: [],
    audience: { kind: 'owner', includeLookNotes: true },
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
// shell uses: .from().select().eq().maybeSingle()/.is().gte()/.order().limit()/.range().
// Each table resolves to a canned { data } (or { data: null } for an unowned pet).
//
// EVERY CHAINABLE METHOD THE SHELL CALLS HAS TO BE HERE, and that is not a formality:
// `.order()` / `.limit()` arrived with the CUL-875 look pull, and until they were added
// three tests failed with `.order is not a function` — including the one asserting that
// an events-read error surfaces as "events read failed", which passed its own assertion
// through a DIFFERENT throw. A fake that is missing a method fails loudly here, which is
// the good case; the bad case is a fake that swallows one and lets a test claim to have
// exercised a query shape it never built.
//
// ── CUL-975: THE FAKE NOW MODELS THE SERVER, NOT JUST THE BUILDER ────────────
//
// A fake that resolves less than the real API makes the caller's use of the dropped half
// unassertable (C-39), and the half that was dropped here is the whole of this issue: the
// old fake ignored `.range()` and returned the entire canned list to any query, so a pull
// with no paging looked identical to a pull with paging, and the `max-rows` cap that
// truncated a real vet report could not be expressed at all. So this one:
//
//   • SLICES on `.range(from, to)`, so a reader that does not advance is visibly short;
//   • CAPS each page at `serverMaxRows` — PostgREST's `max-rows`, the setting the Edge
//     Function cannot observe. THE CAP IS THE DEFECT. With it set below a page size, a
//     reader that trusts a short page to mean "the end" stops on page one;
//   • returns `count` ONLY when the query asked for it with `{ count: 'exact' }`, so a
//     pull that forgets the option is measured as what it is — a pull that cannot know
//     whether it read everything — rather than silently inheriting the fake's generosity.
//
// `serverMaxRows` defaults to 1000, the PostgREST default and the value that was live
// when the report on the PM's own cat lost every event after Sep 7.
interface FakeTable {
  single?: unknown
  list?: unknown[]
  error?: { message: string }
}

function fakeClient(tables: Record<string, FakeTable | undefined>, serverMaxRows = 1000) {
  const builder = (table: string) => {
    const result = tables[table]
    const err = result?.error ?? null
    const list = (result?.list ?? []) as unknown[]
    const chain: Record<string, unknown> = {}
    let wantsCount = false
    let from = 0
    // Absent `.range()` is the UNBOUNDED query — which is what the server caps, and what
    // every pull in this function used to be. Modelling it as "the whole list" would erase
    // the defect from the harness.
    let to = serverMaxRows - 1

    const ret = () => chain
    chain.select = (_cols?: unknown, opts?: { count?: string }) => {
      if (opts?.count === 'exact') wantsCount = true
      return chain
    }
    // CUL-979 — `.eq()` FILTERS, on rows that carry the column. The household pull's
    // `is_active = true` is the only thing between an archived pet and the signalment
    // line, and a fake whose `.eq` is a no-op cannot see that filter deleted (C-39: a mock
    // narrower than its API makes the missing half untestable). A row WITHOUT the column
    // passes — every pre-existing canned row here carries no `pet_id` — and that is a
    // STATED blind spot, not a feature: a fixture that wants a filter proven puts the
    // column on its rows.
    const eqs: [string, unknown][] = []
    chain.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return chain
    }
    chain.is = ret
    chain.gte = ret
    chain.in = ret
    chain.order = ret
    chain.limit = (n: number) => {
      to = Math.min(to, n - 1)
      return chain
    }
    chain.range = (f: number, t: number) => {
      from = f
      to = t
      return chain
    }
    chain.maybeSingle = () => Promise.resolve({ data: result?.single ?? null, error: err })
    chain.then = (onF: (v: { data: unknown; error: unknown; count: number | null }) => unknown) => {
      // The server never returns more than `max-rows` in one response, whatever was asked
      // for. This one line is the entire CUL-975 defect, and it is why a fixed-stride
      // reader is unsound and an advance-by-what-you-received reader is not.
      const end = Math.min(to + 1, from + serverMaxRows)
      const matching = list.filter((r) =>
        eqs.every(([col, val]) => {
          const cell = (r as Record<string, unknown>)[col]
          return cell === undefined || cell === val
        })
      )
      return Promise.resolve({
        data: err ? null : matching.slice(from, end),
        error: err,
        count: wantsCount ? matching.length : null,
      }).then(onF)
    }
    return chain
  }
  return { from: builder } as unknown as Parameters<typeof generateReportForPet>[0]
}

Deno.test('generateReportForPet: unowned/absent pet → 404, never leaks a report', async () => {
  const client = fakeClient({ pets: { single: null } }) // RLS returns no pet
  const res = await generateReportForPet(client, 'somebody-elses-pet', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 404)
  assert.equal(res.body.html, undefined)
})

Deno.test('generateReportForPet: a query ERROR throws (never a silent false-clean report)', async () => {
  // A backend fault on the pet load must surface, and must NOT masquerade as a 404.
  const petErr = fakeClient({ pets: { error: { message: 'connection reset' } } })
  await assert.rejects(() => generateReportForPet(petErr, 'p1', NOW_MS, null, OWNER_AUDIENCE), /pets read failed/)

  // A fault on a downstream pull (events) must throw too — a swallowed error would
  // render the pet as having zero events (a false-clean clinical artifact).
  const eventsErr = fakeClient({
    pets: { single: { id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
    user_profiles: { single: { display_name: 'Jordan', timezone: 'UTC' } },
    vet_visits: { list: [] },
    diet_trials: { list: [] },
    events: { error: { message: 'statement timeout' } },
  })
  await assert.rejects(() => generateReportForPet(eventsErr, 'p1', NOW_MS, null, OWNER_AUDIENCE), /events read failed/)
})

Deno.test('generateReportForPet: owned pet → 200 with html + scope metadata', async () => {
  const client = fakeClient({
    pets: { single: { id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
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
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.equal(res.body.pet_name, 'Nyx')
  assert.equal(res.body.scope_basis, 'fallback_90d')
  assert.ok(typeof res.body.html === 'string' && (res.body.html as string).includes('Nyx'))
})

Deno.test('generateReportForPet: no display name → owner falls back to the caller email (§7.1, PM 2026-07-03)', async () => {
  const tables = {
    pets: { single: { id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
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
    OWNER_AUDIENCE,
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
    OWNER_AUDIENCE,
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
    OWNER_AUDIENCE,
    'jwt-token',
  )
  assert.equal(res3.status, 200)
  assert.ok((res3.body.html as string).includes('Owner: not recorded'))
})

// ── PR 7 — incident-photo mappers + fetch/strip/embed ───────────────────────────

Deno.test('mapAttachmentRows: renames fields, defaults null mime + missing sort_order to 0', () => {
  const out = mapAttachmentRows([
    { id: 'a1', event_id: 'e1', storage_path: 'pet/e1.jpg', mime_type: 'image/jpeg', sort_order: 2 },
    { id: 'a2', event_id: 'e2', storage_path: 'pet/e2.jpg', mime_type: null, sort_order: null },
  ])
  assert.deepEqual(out, [
    { eventId: 'e1', storagePath: 'pet/e1.jpg', mimeType: 'image/jpeg', sortOrder: 2 },
    { eventId: 'e2', storagePath: 'pet/e2.jpg', mimeType: null, sortOrder: 0 },
  ])
})

Deno.test('detectPhotoMediaType: sniffs jpeg/png/gif/webp from magic bytes, defaults jpeg', () => {
  assert.equal(detectPhotoMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
  assert.equal(detectPhotoMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png')
  assert.equal(detectPhotoMediaType(new Uint8Array([0x47, 0x49, 0x46, 0x38])), 'image/gif')
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  assert.equal(detectPhotoMediaType(webp), 'image/webp')
  assert.equal(detectPhotoMediaType(new Uint8Array([0, 1, 2, 3])), 'image/jpeg')
})

Deno.test('bytesToBase64: round-trips (chunked encode is correct for a large buffer)', () => {
  const big = new Uint8Array(70_000).map((_, i) => i % 256)
  const b64 = bytesToBase64(big)
  const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  assert.equal(back.length, big.length)
  assert.deepEqual(Array.from(back.slice(0, 300)), Array.from(big.slice(0, 300)))
})

// A fake service-role client that records every Storage download call + its options.
function fakeAdmin(behavior: (path: string, opts: unknown) => { data: Blob | null; error: { message: string } | null }) {
  const calls: Array<{ path: string; opts: unknown }> = []
  const client = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, 'nyx-event-attachments', 'photos are read ONLY from the incident-attachments bucket')
        return {
          download(path: string, opts: unknown) {
            calls.push({ path, opts })
            return Promise.resolve(behavior(path, opts))
          },
        }
      },
    },
  }
  return { client: client as unknown as Parameters<typeof embedIncidentPhotos>[0], calls }
}

function jpegBlob(size = 1024): Blob {
  const bytes = new Uint8Array(size)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  return new Blob([bytes], { type: 'image/jpeg' })
}

function mkPhoto(over: Partial<IncidentPhoto> & { eventId: string }): IncidentPhoto {
  return {
    eventId: over.eventId,
    storagePath: over.storagePath ?? `pet/${over.eventId}.jpg`,
    type: over.type ?? 'vomit',
    occurredAt: over.occurredAt ?? '2026-06-20T14:00:00Z',
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    notes: null,
    safety: over.safety ?? null,
    phenotype: null,
    dataUri: null,
  }
}

Deno.test('embedIncidentPhotos: ALWAYS fetches through the EXIF-stripping transform, never the raw original', async () => {
  const { client, calls } = fakeAdmin(() => ({ data: jpegBlob(), error: null }))
  const photos = [mkPhoto({ eventId: 'v1' })]
  const stats = await embedIncidentPhotos(client, photos)
  assert.equal(stats.embedded, 1)
  assert.ok(photos[0].dataUri?.startsWith('data:image/jpeg;base64,'), 'embedded as a data URI')
  // The load-bearing privacy control: EVERY download carries a transform (imgproxy re-encode strips
  // EXIF/GPS + downscales). A raw download (no transform option) would leak GPS — must never happen.
  assert.equal(calls.length, 1)
  const opts = calls[0].opts as { transform?: { width: number; height: number; quality: number; resize: string } }
  assert.ok(opts?.transform, 'the download is transform-only')
  assert.ok(opts.transform.width > 0 && opts.transform.height > 0, 'downscaled')
  assert.ok(opts.transform.quality > 0 && opts.transform.quality <= 100, 'quality set')
})

Deno.test('embedIncidentPhotos: a transform failure yields a null dataUri (placeholder), NEVER a raw fallback', async () => {
  const { client, calls } = fakeAdmin(() => ({ data: null, error: { message: 'transform add-on unavailable' } }))
  const photos = [mkPhoto({ eventId: 'v1' })]
  const stats = await embedIncidentPhotos(client, photos)
  assert.equal(stats.embedded, 0)
  assert.equal(stats.omitted, 1)
  assert.equal(photos[0].dataUri, null, 'never embeds the un-stripped original as a fallback')
  // It attempted the transform once and did NOT retry with a raw (no-transform) download.
  assert.equal(calls.length, 1)
  assert.ok((calls[0].opts as { transform?: unknown }).transform, 'the single attempt was transform-only')
})

Deno.test('embedIncidentPhotos: an oversize transformed blob is skipped, not embedded', async () => {
  const { client } = fakeAdmin(() => ({ data: jpegBlob(4_000_000), error: null })) // > MAX_EMBED_IMAGE_BYTES
  const photos = [mkPhoto({ eventId: 'v1' })]
  const stats = await embedIncidentPhotos(client, photos)
  assert.equal(stats.embedded, 0)
  assert.equal(photos[0].dataUri, null)
})

Deno.test('embedIncidentPhotos: safety-flagged photos are attempted FIRST so the cap never drops them', async () => {
  const seen: string[] = []
  const { client } = fakeAdmin((path) => {
    seen.push(path)
    return { data: jpegBlob(), error: null }
  })
  // A plain photo first in manifest order, then a blood-flagged one — the flagged one must be fetched first.
  const photos = [
    mkPhoto({ eventId: 'plain', storagePath: 'pet/plain.jpg' }),
    mkPhoto({ eventId: 'blood', storagePath: 'pet/blood.jpg', safety: 'blood' }),
  ]
  await embedIncidentPhotos(client, photos)
  assert.equal(seen[0], 'pet/blood.jpg', 'the safety-flagged photo is embedded before the plain one')
})

Deno.test('embedIncidentPhotos: empty manifest is a no-op (no Storage calls)', async () => {
  const { client, calls } = fakeAdmin(() => ({ data: jpegBlob(), error: null }))
  const stats = await embedIncidentPhotos(client, [])
  assert.deepEqual(stats, { total: 0, embedded: 0, omitted: 0 })
  assert.equal(calls.length, 0)
})


// ── CUL-975: the paginating reader ───────────────────────────────────────────
//
// THE DEFECT, in one paragraph, because every fixture below is shaped by it. Every pull
// in this function was bare — no `.order()`, no `.limit()`, no `.range()` — so PostgREST
// capped it at the project's `max-rows` (then 1000) and, with no ORDER BY, Postgres
// returned physical order, which on an append-only table is insertion order. The cap kept
// the OLDEST 1,000 rows and dropped the NEWEST. On the PM's own cat, the vet report
// generated the day before a real appointment held 1,000 of 1,057 events and contained
// nothing after Sep 7: a cough that happened the previous day printed as ten days old.
//
// `server` below IS that cap. A reader that only works when it is generous is a reader
// that only works on a record small enough not to matter.

/** A canned table of `n` rows, keyed `r0…r{n-1}` — the shape `fetchAll` de-dupes on. */
function numberedRows(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))
}

/** A server that caps every response at `maxRows`, counts the requests it served, and
 *  answers `count: 'exact'` only when asked. The one-table half of `fakeClient`, so a
 *  `fetchAll` test drives the same model the end-to-end tests do. */
function pagingServer(rows: { id: string }[], maxRows: number, opts: { withCount?: boolean } = {}) {
  const ranges: [number, number][] = []
  const page = (from: number, to: number) => {
    ranges.push([from, to])
    const end = Math.min(to + 1, from + maxRows)
    return Promise.resolve({
      data: rows.slice(from, end),
      error: null,
      count: opts.withCount === false ? null : rows.length,
    })
  }
  return { page, ranges }
}

Deno.test('fetchAll: reads PAST the server cap — the 1,057-row record that broke the report', async () => {
  const rows = numberedRows(1057)
  const server = pagingServer(rows, 1000)
  const pull = await fetchAll<{ id: string }>('events', (r) => r.id, server.page)

  assert.equal(pull.rows.length, 1057, 'every row, not the cap')
  assert.equal(pull.complete, true)
  // THE ROWS THAT WENT MISSING IN PRODUCTION. Asserting the length alone would pass on a
  // reader that returned the wrong 1,057 rows; these are the newest, which is the half the
  // cap actually ate and the half a clinician acts on.
  assert.ok(pull.rows.some((r) => r.id === 'r1056'), 'the newest row is present')
  assert.ok(pull.rows.some((r) => r.id === 'r1000'), 'the first row past the old cap is present')
})

Deno.test('fetchAll: a server cap BELOW the page size is survived, not mistaken for the end', async () => {
  // The hazard the looks pull's comment names and cannot check: this function cannot
  // observe `max-rows`. A fixed-stride reader asks for 0–499, is handed 200, advances to
  // 500 and skips rows 200–499 forever; a reader that stops on a short page stops here on
  // page one. Advancing by what was RECEIVED is what makes both impossible.
  const rows = numberedRows(650)
  const server = pagingServer(rows, 200)
  const pull = await fetchAll<{ id: string }>('events', (r) => r.id, server.page)

  assert.equal(pull.rows.length, 650)
  assert.equal(pull.complete, true)
  assert.deepEqual(
    pull.rows.map((r) => r.id).slice(195, 205),
    ['r195', 'r196', 'r197', 'r198', 'r199', 'r200', 'r201', 'r202', 'r203', 'r204'],
    'no hole at the seam a fixed stride would have opened',
  )
  // The stride followed the server, not the constant — offset 199 rather than 200 because
  // every page after the first overlaps the previous one by a row (the continuity check).
  assert.deepEqual(server.ranges[1][0], 199)
})

Deno.test('fetchAll: the page boundary, at exactly PULL_PAGE and at PULL_PAGE + 1', async () => {
  // Off-by-one at the boundary is the classic pagination failure and both edges need
  // pinning: at exactly one page the loop must not stop believing there is more, and at
  // one row over it must not stop believing there is not.
  for (const n of [PULL_PAGE - 1, PULL_PAGE, PULL_PAGE + 1, PULL_PAGE * 2, PULL_PAGE * 2 + 1]) {
    const pull = await fetchAll<{ id: string }>('events', (r) => r.id, pagingServer(numberedRows(n), 1000).page)
    assert.equal(pull.rows.length, n, `n=${n}`)
    assert.equal(pull.complete, true, `n=${n}`)
  }
})

Deno.test('fetchAll: an empty table is COMPLETE, not unknown', async () => {
  const pull = await fetchAll<{ id: string }>('conditions', (r) => r.id, pagingServer([], 1000).page)
  assert.deepEqual(pull.rows, [])
  assert.equal(pull.complete, true)
})

Deno.test('fetchAll: NO count ⇒ incomplete — absent means unknown means the direction that cannot mislead', async () => {
  // A full read, with every row in hand, still reports itself incomplete when the server
  // did not answer "how many are there?". This is the `lookRowsComplete` rule: completeness
  // is EARNED. Inferring it from a short page is exactly what a lowered cap defeats.
  const server = pagingServer(numberedRows(30), 1000, { withCount: false })
  const pull = await fetchAll<{ id: string }>('events', (r) => r.id, server.page)
  assert.equal(pull.rows.length, 30, 'it read everything')
  assert.equal(pull.complete, false, 'and still refuses to claim it')
})

Deno.test('fetchAll: the page CEILING reports incomplete, never a clean read', async () => {
  // A record past PULL_MAX_PAGES x the server's page. The rows it holds are real; the
  // claim that they are all of them is not, and that distinction is the whole issue.
  const rows = numberedRows(PULL_MAX_PAGES * 10 + 5)
  const pull = await fetchAll<{ id: string }>('events', (r) => r.id, pagingServer(rows, 10).page)
  assert.equal(pull.complete, false)
  // It holds real rows and stopped short of the set. The exact count is not pinned: every
  // page after the first re-reads one row, so the number encodes the overlap's arithmetic
  // rather than the property under test. The floor keeps the assertion non-vacuous.
  assert.ok(pull.rows.length > PULL_MAX_PAGES * 5, 'it really read, rather than bailing early')
  assert.ok(pull.rows.length < rows.length, 'and it did not reach the end')
})

// ── The moving table ─────────────────────────────────────────────────────────
//
// THE FIRST VERSION OF THIS BLOCK WAS ONE TEST AND IT MEASURED NOTHING. It built 120 rows
// against a 500-row page, so `fetchAll` issued exactly ONE page call and the shift branch
// it was written to exercise was dead code — the de-dupe assertion passed whether or not
// `keyOf` did anything. Found by `code-reviewer`, and it is the C-35 failure in its purest
// form: the fixture could not produce the situation the test was named after. Anything
// below that claims something about paging uses MORE THAN `PULL_PAGE` rows, and the
// assertion on page count is what keeps it honest.

/** Drives the real reader against a list that MUTATES between page requests. `mutate` is
 *  applied once, just before the second page is served — the seam where offset paging is
 *  vulnerable. Returns what the pull got, plus which originals it failed to return. */
async function pullAcrossAMutation(
  originals: { id: string }[],
  mutate: (list: { id: string }[]) => { id: string }[],
) {
  let list = [...originals]
  let pages = 0
  const pull = await fetchAll<{ id: string }>('events', (r) => r.id, (from, to) => {
    pages++
    if (pages === 2) list = mutate(list)
    return Promise.resolve({ data: list.slice(from, to + 1), error: null, count: originals.length })
  })
  const got = new Set(pull.rows.map((r) => r.id))
  return { pull, pages, missingOriginals: originals.map((o) => o.id).filter((id) => !got.has(id)) }
}

/** 505 rows against a 500-row page: two real page calls, with the seam in the middle. */
const MOVING = numberedRows(505)

Deno.test('fetchAll: an INSERT mid-pull loses NO row that existed when the count was taken', async () => {
  // The three shapes an insert can take in a newest-first list. A head insert is the one
  // that shifts everything and re-serves a row the previous page already returned; the
  // de-dupe drops the duplicate while the stride still advances by the full batch, so the
  // window keeps descending and every original below it is reached.
  //
  // The new row is NOT in the result, and that is correct rather than tolerated: it did not
  // exist when the count was taken, and this document is a snapshot as of the request (the
  // client flushes its queues before calling). What would be a defect is an ORIGINAL going
  // missing, which is what `missingOriginals` is here to catch.
  const head = await pullAcrossAMutation(MOVING, (l) => [{ id: 'inserted' }, ...l])
  assert.equal(head.pages, 2, 'the fixture really spans a page seam')
  assert.deepEqual(head.missingOriginals, [])
  assert.equal(head.pull.complete, true)
  assert.equal(head.pull.rows.length, 505)

  // A BACKDATED insert lands mid-list instead, and two of them can land inside the final
  // partial window — the shape most likely to push an original past the last slot.
  const mid = await pullAcrossAMutation(MOVING, (l) => [...l.slice(0, 300), { id: 'back' }, ...l.slice(300)])
  assert.deepEqual(mid.missingOriginals, [])

  const twoLate = await pullAcrossAMutation(MOVING, (l) => [
    ...l.slice(0, 501),
    { id: 'b1' },
    { id: 'b2' },
    ...l.slice(501),
  ])
  assert.deepEqual(twoLate.missingOriginals, [], 'nothing falls off the end of the last window')
})

Deno.test('fetchAll: a DELETE mid-pull is DETECTED — the overlap sees the shift a count cannot', async () => {
  // A delete above the cursor shifts the list UP, so the offset the loop has already passed
  // now holds a row it never requested. The one-row overlap sees that directly: the
  // overlapped row is unseen.
  //
  // WHY A COUNT IS NOT ENOUGH, and this is the hole an `adversarial-reviewer` harness found
  // in the first version of this reader. Pair the delete with an insert below the seam and
  // the count is restored by a DIFFERENT row, so `rows.length >= total` certified a pull
  // that was missing a live in-window event, with no disclosure anywhere — CUL-975's own
  // failure class at a smaller scale. Measured on the shipped reader: 1,057 rows, one
  // soft-delete at rank 200, one backdated insert at rank 800, `complete: true`, `o00500`
  // gone. Both shapes are below, and the compensated one is the one that matters.
  const del = await pullAcrossAMutation(MOVING, (l) => l.filter((r) => r.id !== 'r200'))
  assert.ok(del.pages >= 2, 'the fixture really spans a page seam')
  assert.equal(del.pull.complete, false, 'the shortfall is declared, never swallowed')
  // And the overlap does not merely FLAG the shift, it recovers the row the shift exposed.
  assert.deepEqual(del.missingOriginals, [])

  // The compensated race: a delete ABOVE the cursor and an insert BELOW it, so the count
  // comes out whole while a row was skipped. Pre-overlap this returned complete:true with a
  // live row missing.
  //
  // BOTH SIDES OF THE CURSOR ARE LOAD-BEARING and the first draft of this fixture got it
  // wrong — it put the insert at index 480, above the seam at 500, where it simply undid
  // the delete's shift before the seam was reached. Nothing was skipped and `complete: true`
  // was the correct answer, so the test failed for the right reason. The insert has to land
  // past the cursor (index 502 of a 504-row post-delete list) for the shift to survive to
  // the seam, which is exactly the geometry of the measured 1,057-row repro: delete at rank
  // 200, insert at rank 800, cursor at 500.
  const compensated = await pullAcrossAMutation(MOVING, (l) => {
    const afterDelete = l.filter((r) => r.id !== 'r200')
    return [...afterDelete.slice(0, 502), { id: 'backdated' }, ...afterDelete.slice(502)]
  })
  assert.equal(compensated.pull.rows.length >= MOVING.length, true, 'the count was made whole')
  assert.equal(compensated.pull.complete, false, 'and it is STILL not certified')
  assert.deepEqual(compensated.missingOriginals, [])
})

Deno.test('fetchAll: no duplicate survives a re-served seam', async () => {
  // The de-dupe itself, on a fixture that can actually produce a duplicate — which the
  // 120-row version could not.
  const { pull } = await pullAcrossAMutation(MOVING, (l) => [{ id: 'inserted' }, ...l])
  assert.equal(new Set(pull.rows.map((r) => r.id)).size, pull.rows.length)
})

Deno.test('fetchAll: a query error still THROWS, named by table (no silent false-clean report)', async () => {
  await assert.rejects(
    () =>
      fetchAll<{ id: string }>('events', (r) => r.id, () =>
        Promise.resolve({ data: null, error: { message: 'statement timeout' }, count: null })),
    /events read failed: statement timeout/,
  )
})

// ── CUL-975: end to end, on the record's real shape ──────────────────────────

const HOUR_MS = 3_600_000

/** One `events` row, in the raw select's shape. */
function eventRow(id: string, type: string, atMs: number) {
  const at = new Date(atMs).toISOString()
  return {
    id,
    event_type: type,
    occurred_at: at,
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: type === 'meal' ? null : 2,
    notes: null,
    created_at: at,
    meals: null,
  }
}

/**
 * THE RECORD CUL-975 WAS MEASURED ON, in the composition it actually has: 1,057 live
 * events in the lookback, overwhelmingly meals, with the symptom signal in the last days.
 * Returned in INSERTION order (oldest first), which on this append-only table is physical
 * order — the order a bare pull comes back in, and therefore the order the cap truncated.
 *
 * TWO THINGS ABOUT THIS FIXTURE ARE LOAD-BEARING (C-35: a shape production never creates
 * is green over nothing). The first draft was 1,057 coughs an hour apart; entries within
 * three hours CHAIN INTO ONE BOUT, so the whole record assembled into a single episode and
 * no count on the page moved whether the reader paged or not. The real record logs ~7
 * events a day across types, so the meals are four hours apart and the vomits — the rows
 * the cap ate in production — are four hours apart too, which is outside the bout window
 * and counts as 57 separate entries.
 */
function realRecordShapeRows(): ReturnType<typeof eventRow>[] {
  const meals = Array.from({ length: 1000 }, (_, i) =>
    eventRow(`m${i}`, 'meal', NOW_MS - 180 * 24 * HOUR_MS + i * 4 * HOUR_MS),
  )
  // The newest 57 — the exact count that went missing from the PM's report — over the
  // last 9.5 days, so every one of them is inside the 90-day window the report scopes to.
  const vomits = Array.from({ length: 57 }, (_, i) =>
    eventRow(`v${i}`, 'vomit', NOW_MS - 57 * 4 * HOUR_MS + i * 4 * HOUR_MS),
  )
  return [...meals, ...vomits]
}

/** `n` recent symptom events, FOUR hours apart — outside the three-hour bout window, so
 *  they count as n entries rather than assembling into one episode. Newest last. */
function symptomRows(n: number, endMs: number, type = 'vomit') {
  return Array.from({ length: n }, (_, i) => eventRow(`ev${i}`, type, endMs - (n - 1 - i) * 4 * HOUR_MS))
}

const PET_TABLES = {
  pets: { single: { id: 'p1', user_id: 'u1', name: 'Nyx', species: 'cat', breed: null, sex: 'female', date_of_birth: '2020-01-01', weight_kg: '4.2' } },
  user_profiles: { single: { display_name: 'Jordan', timezone: 'UTC' } },
  vet_visits: { list: [] },
  diet_trials: { list: [] },
  event_ai_analysis: { list: [] },
  weight_checks: { list: [] },
  medication_administrations: { list: [] },
  medications: { list: [] },
  feeding_arrangements: { list: [] },
  conditions: { list: [] },
}

Deno.test('generateReportForPet: 1,057 events under a 1,000-row cap — the NEWEST ones reach the report', async () => {
  // THE ACCEPTANCE TEST, and it is the production incident with the numbers kept. 1,057
  // live events, a server capping at 1,000, and the 57 newest being vomits from the last
  // nine days — the ones a vet is about to act on.
  //
  // PRE-FIX THIS FAILS, and on the right thing: the bare pull took the oldest 1,000 rows,
  // which here are ALL MEALS, so the report printed a pet with no vomiting at all while the
  // record held 57 episodes ending the day it was generated. (Verified red by restoring the
  // bare pull, per C-18: a guard that has only ever been green has not been tested.)
  const client = fakeClient({ ...PET_TABLES, events: { list: realRecordShapeRows() } }, 1000)
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)

  assert.equal(res.status, 200)
  const html = res.body.html as string
  // Page 1's headline, counting the rows the cap used to eat. Asserting the string the
  // clinician reads rather than a bare "57 appears somewhere" — the number has to be
  // attached to the sign for the assertion to mean what it says.
  assert.ok(
    html.includes('vomiting (<span class="num">57</span> logged)'),
    'page 1 counts all 57 vomits, not the zero a truncated pull produced',
  )
})

Deno.test('generateReportForPet: (a′) REFUSES when the shortfall could have cut the window', async () => {
  // A server capping at one row per response, so 500 recent events exhaust the page
  // ceiling: the pull is incomplete AND its oldest row is inside the window, so every
  // page-1 count would be a query artifact. There is no sentence that repairs that, so the
  // report does not render. PM ruling (a′), 2026-09-15.
  const rows = symptomRows(500, NOW_MS)
  const client = fakeClient({ ...PET_TABLES, events: { list: rows } }, 1)
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)

  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'record_incomplete')
  assert.equal(res.body.html, undefined, 'a short record is never rendered')
})

Deno.test('generateReportForPet: (a′) DISCLOSES when the window is covered but another pull fell short', async () => {
  // The other arm, and the one the PM's ruling bought: a pull that came up short somewhere
  // that cannot have touched the window still produces a report — with a page-1 line
  // naming what was partial. `medications` is uncapped by date, so its shortfall is the
  // survivable kind; the events pull here is complete.
  const meds = Array.from({ length: PULL_MAX_PAGES * 2 + 3 }, (_, i) => ({
    id: `m${i}`,
    medication_item_id: null,
    drug_name: 'Prednisolone',
    dose_amount: null,
    route: null,
    doses_per_day: null,
    schedule_notes: null,
    indication: null,
    prescribed_by: null,
    started_at: '2026-06-01T00:00:00Z',
    target_duration_days: null,
    target_duration_doses: null,
    status: 'active',
    ended_at: null,
    medication_items: null,
  }))
  const client = fakeClient(
    { ...PET_TABLES, events: { list: symptomRows(5, NOW_MS) }, medications: { list: meds } },
    2,
  )
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)

  assert.equal(res.status, 200, 'the report still renders')
  const html = res.body.html as string
  assert.ok(html.includes('Partial record.'), 'and says so on page 1')
  assert.ok(html.includes('medication courses'), 'naming WHICH part of the record is partial')
  assert.ok(!html.includes('logged events'), 'and not naming a pull that was complete')
})

Deno.test('generateReportForPet: a COMPLETE record carries no disclosure at all', async () => {
  // Present-only, like every other disclosure on this page. "The full record was read" is
  // a clean bill of health nobody asked for, and it is the one sentence a reader would
  // trust without being able to check it.
  const client = fakeClient({ ...PET_TABLES, events: { list: symptomRows(12, NOW_MS) } }, 1000)
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.ok(!(res.body.html as string).includes('Partial record.'))
})

Deno.test('reachedLookbackIso: an INCOMPLETE pull reports the floor it REACHED, not the one it asked for', () => {
  const asked = '2026-01-01T00:00:00.000Z'
  const oldest = Date.parse('2026-04-01T00:00:00.000Z')

  // Complete ⇒ the pull reached its own floor, so the asked-for floor is the truth.
  assert.equal(reachedLookbackIso(asked, true, oldest), asked)

  // Incomplete ⇒ it only reached its oldest row, and saying otherwise is what lets a
  // trial-crop count print as a total over days nothing was read from.
  assert.equal(reachedLookbackIso(asked, false, oldest), '2026-04-01T00:00:00.000Z')

  // No rows at all ⇒ nothing to narrow to. (This case is refused upstream when it matters.)
  assert.equal(reachedLookbackIso(asked, false, Infinity), asked)

  // And it NEVER widens: a row that somehow predates the query's own bound cannot push the
  // claimed reach further back than the query went.
  assert.equal(reachedLookbackIso(asked, false, Date.parse('2025-06-01T00:00:00.000Z')), asked)
})

// ── R-16 (CUL-998 / CUL-861) — the response carries the pre-send fact ────────

/** A trial row as the pull returns it, with the allowed set embedded. */
function trialRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1', food_item_id: null, started_at: '2026-06-22', target_duration_days: 56,
    status: 'active', completed_at: null, ended_at: null, indication: 'gi',
    outcome: null, outcome_notes: null, stopped_reason: null, food_label: 'Purina HA',
    vet_name: null, target_protein: null, target_protein_set_at: null,
    food_items: null, diet_trial_foods: [],
    ...over,
  }
}

Deno.test('generateReportForPet: a running trial with NO allowed list → trial_allowed_list_missing true', async () => {
  const client = fakeClient({ ...PET_TABLES, diet_trials: { list: [trialRow()] }, events: { list: [] } })
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.equal(res.body.scope_basis, 'diet_trial', 'the fixture anchors the report on the trial')
  assert.equal(res.body.trial_allowed_list_missing, true)
})

Deno.test('generateReportForPet: a running trial WITH a primary_diet row → false', async () => {
  const row = trialRow({
    food_item_id: 'f1',
    diet_trial_foods: [{
      food_item_id: 'f1', food_label: 'Purina HA', role: 'primary_diet',
      allowed_from: '2026-06-22', allowed_until: null,
      food_items: { primary_protein: 'soy', proteins: ['soy'], ingredients_notes: null, ai_extraction_confidence: null, brand: 'Purina', product_name: 'HA', format: 'kibble' },
    }],
  })
  const client = fakeClient({ ...PET_TABLES, diet_trials: { list: [row] }, events: { list: [] } })
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.equal(res.body.trial_allowed_list_missing, false)
})

Deno.test('generateReportForPet: an ended-in-grace trial with no list → false (the report keeps its caveat; the owner has no door)', async () => {
  const row = trialRow({ status: 'completed', completed_at: '2026-06-27', ended_at: '2026-06-27' })
  const client = fakeClient({ ...PET_TABLES, diet_trials: { list: [row] }, events: { list: [] } })
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.equal(res.body.scope_basis, 'diet_trial', 'still the report\'s subject inside the grace')
  assert.equal(res.body.trial_allowed_list_missing, false)
})

Deno.test('generateReportForPet: no trial at all → false, and the field is always present', async () => {
  const client = fakeClient({ ...PET_TABLES, events: { list: [] } })
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE)
  assert.equal(res.status, 200)
  assert.equal(res.body.trial_allowed_list_missing, false)
})

// ── CUL-979 (R-5) — the household pull: the first read outside the subject pet's row ──
//
// Two facts, kept apart on purpose (the issue's own framing). (1) "This account holds
// another live animal" is structural and certain; it is what these tests cover. (2) "This
// feeding came from the other animal's bowl" is per-exposure and is NOT built here.

const SUBJECT = { id: 'p1', user_id: 'u1' }

Deno.test('mapHouseholdRows: drops the subject, counts the rest by species, carries NOTHING else', () => {
  const h = mapHouseholdRows(
    [
      { id: 'p1', species: 'cat', user_id: 'u1' },
      { id: 'p2', species: 'cat', user_id: 'u1' },
      { id: 'p3', species: 'dog', user_id: 'u1' },
    ],
    SUBJECT,
    true,
  )
  assert.deepEqual(h, { others: [{ species: 'cat', count: 1 }, { species: 'dog', count: 1 }], complete: true })
  // The shape has no field an id, an owner or a name could travel in — checked as a
  // property of the OUTPUT, not of this fixture: every key of every entry is one of two.
  for (const o of h.others) assert.deepEqual(Object.keys(o).sort(), ['count', 'species'])
})

Deno.test('mapHouseholdRows: a subject-only list is an EMPTY household, and an unknown species is not invented', () => {
  assert.deepEqual(mapHouseholdRows([{ id: 'p1', species: 'cat', user_id: 'u1' }], SUBJECT, true), {
    others: [],
    complete: true,
  })
  // A species the enum does not know reads as `other` — never as the subject's own species,
  // which would print "another cat" about an animal the record cannot place.
  assert.deepEqual(
    mapHouseholdRows(
      [{ id: 'p1', species: 'cat', user_id: 'u1' }, { id: 'p9', species: 'ferret', user_id: 'u1' }],
      SUBJECT,
      false,
    ),
    { others: [{ species: 'other', count: 1 }], complete: false },
  )
})

Deno.test('mapHouseholdRows: a row of ANOTHER owner is not this household, whatever policy let it through', () => {
  // Today `pets_owner` never returns such a row. The `rls-privacy-reviewer` measured the
  // two futures in which it would — a widened policy for shared care, or a bypassed one —
  // and both printed another household's animals onto this pet's signalment. The owner
  // predicate is defence in depth: the household is the SUBJECT'S OWNER'S live pets, and a
  // co-carer's own animals are not it.
  assert.deepEqual(
    mapHouseholdRows(
      [
        { id: 'p1', species: 'cat', user_id: 'u1' },
        { id: 'p2', species: 'cat', user_id: 'u1' },
        { id: 'b1', species: 'dog', user_id: 'u2' },
        { id: 'b2', species: 'cat', user_id: 'u2' },
      ],
      SUBJECT,
      true,
    ),
    { others: [{ species: 'cat', count: 1 }], complete: true },
  )
})

/** A UUID, so "the other pet's id never reaches the page" is a real substring test and not
 *  a two-character coincidence. */
const OTHER_PET_ID = '7d2f7a0e-2c58-4a1b-9c33-0f6e2b5c1a44'
const OTHER_PET_NAME = 'Schrodingers Cat'

function householdTables(others: { id: string; species: string; is_active: boolean; name: string; user_id?: string }[]) {
  return {
    ...PET_TABLES,
    pets: {
      single: PET_TABLES.pets.single,
      // NEWEST FIRST, as the real pull orders: the housemate's profile was created after
      // the subject's, so it leads. That order is also what lets the capped-server case
      // below read the housemate and stop short — the shape "at least" exists for.
      list: [
        ...others.map((o) => ({ user_id: 'u1', ...o })),
        { id: 'p1', species: 'cat', is_active: true, name: 'Nyx', user_id: 'u1' },
      ],
    },
  }
}

/** A service-role client that FAILS on any use. The household read is the first query in
 *  this function to reach outside the subject pet's row, and the issue's rule is that it
 *  stays on the user-scoped, RLS-gated client — so the admin client is handed in as a
 *  tripwire rather than left null, and a data query on it is a test failure. */
const ADMIN_TRIPWIRE = {
  from: () => {
    throw new Error('the service-role client issued a DATA query')
  },
  storage: {
    from: () => {
      throw new Error('the service-role client touched Storage with no photos to fetch')
    },
  },
} as unknown as Parameters<typeof generateReportForPet>[6]

Deno.test('generateReportForPet: a second live pet reaches the report as a COUNT and a SPECIES — never its name or id', async () => {
  const client = fakeClient(householdTables([{ id: OTHER_PET_ID, species: 'cat', is_active: true, name: OTHER_PET_NAME }]))
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE, null, ADMIN_TRIPWIRE)
  assert.equal(res.status, 200)
  const html = res.body.html as string
  assert.ok(/lives with <span class="num">1<\/span> other cat/.test(html), 'the household line rendered')
  // THE PRIVACY ASSERTION, through the real reader and the real renderer (C-34): the other
  // animal's name and id were on the canned rows the pull read, and neither is anywhere in
  // what the function returns.
  const returned = JSON.stringify(res.body)
  assert.ok(!returned.includes(OTHER_PET_NAME), 'the other pet is never named')
  assert.ok(!returned.includes('Schrodinger'), 'nor partially named')
  assert.ok(!returned.includes(OTHER_PET_ID), 'the other pet is never identified')
})

Deno.test('generateReportForPet: an ARCHIVED second pet does not count toward the household', async () => {
  const client = fakeClient(householdTables([{ id: OTHER_PET_ID, species: 'cat', is_active: false, name: OTHER_PET_NAME }]))
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE, null, ADMIN_TRIPWIRE)
  assert.equal(res.status, 200)
  const html = res.body.html as string
  assert.ok(!/lives with/.test(html), 'an archived pet is not a housemate')
  assert.ok(!JSON.stringify(res.body).includes(OTHER_PET_NAME))
})

Deno.test('generateReportForPet: a ONE-pet account renders no household line at all', async () => {
  const client = fakeClient(householdTables([]))
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE, null, ADMIN_TRIPWIRE)
  assert.equal(res.status, 200)
  assert.ok(!/lives with/.test(res.body.html as string))
  // And the pull was COMPLETE, so no partial-record disclosure names the household either.
  assert.ok(!/Partial record/.test(res.body.html as string))
})

Deno.test('generateReportForPet: a household pull that falls short is DISCLOSED, and the count says "at least"', async () => {
  // The server caps at one row, so the pull reads the subject and stops short of the
  // second animal's row — the shortfall must be visible, never a silent one-pet report.
  const tables = householdTables([{ id: OTHER_PET_ID, species: 'cat', is_active: true, name: OTHER_PET_NAME }])
  const client = fakeClient(tables, 1)
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE, null, ADMIN_TRIPWIRE)
  // The events pull is empty here, so the window cannot have been cut and the (a′) arm
  // renders with a disclosure rather than refusing.
  assert.equal(res.status, 200)
  const html = res.body.html as string
  assert.ok(/Partial record\.[^.]*household/.test(html.replace(/<[^>]*>/g, '')), 'page 1 names the household as a short read')
  // AND THE LINE ITSELF SAYS SO. The disclosure comes from `incompletePulls`; the phrasing
  // comes from `Household.complete` — two wirings, and hardcoding the second to `true`
  // survived every test in this directory until this line existed (`rls-privacy-reviewer`,
  // C-34). Without it the signalment would speak a floor as a total while page 1 said the
  // household was short-read: two sentences disagreeing on one document.
  assert.ok(/lives with at least <span class="num">1<\/span> other cat/.test(html), 'the count is spoken as a floor')
})

Deno.test('generateReportForPet: a live pet of ANOTHER owner never reaches this pet\'s household', async () => {
  // The policy future the privacy review measured: `pets` RLS widened (shared care) or
  // bypassed, so the pull returns a row the caller does not own. RLS is the scope today;
  // this is the code-level bound behind it, driven through the real reader and renderer.
  const client = fakeClient(
    householdTables([{ id: OTHER_PET_ID, species: 'cat', is_active: true, name: OTHER_PET_NAME, user_id: 'u2' }]),
  )
  const res = await generateReportForPet(client, 'p1', NOW_MS, null, OWNER_AUDIENCE, null, ADMIN_TRIPWIRE)
  assert.equal(res.status, 200)
  assert.ok(!/lives with/.test(res.body.html as string), 'another owner\'s animal is not a housemate')
  assert.ok(!JSON.stringify(res.body).includes(OTHER_PET_NAME))
})

