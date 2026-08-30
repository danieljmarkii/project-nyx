// ADVERSARIAL SCRATCH — B-613 falsification pass. Not for merge.
import { strict as assert } from 'node:assert'
import { assembleReport, resolveScope, TRIAL_ANCHOR_GRACE_DAYS, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'
import { computeLookbackIso } from './index.ts'
import { selectReportTrial } from './trial.ts'

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&middot;/g, '·').replace(/&times;/g, '×').replace(/&rarr;/g, '→').replace(/&dagger;/g, '†')
    .replace(/&ge;/g, '≥').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}
const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'
function at(date: string, time = '14:00:00'): string { return `${date}T${time}Z` }
let seq = 0
function id(p: string): string { seq += 1; return `${p}-${String(seq).padStart(4, '0')}` }
function meal(o: { date: string; brand: string | null; product: string | null; foodItemId?: string | null; foodType?: 'meal'|'treat'|'other'|null; proteins?: string[] | null; time?: string }): ReportEventInput {
  return { id: id('meal'), type: 'meal', occurredAt: at(o.date, o.time ?? '13:00:00'), occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(o.date, o.time ?? '13:00:00'),
    meal: { foodItemId: o.foodItemId === undefined ? 'f-unknown' : o.foodItemId, intakeRating: null, quantity: null,
      foodType: o.foodType ?? 'meal', format: null, primaryProtein: (o.proteins ?? [])[0] ?? null, proteins: o.proteins ?? null,
      ingredientsNotes: null, extractionConfidence: null, brand: o.brand, productName: o.product } }
}
function symptom(date: string, type = 'itch', time = '19:00:00'): ReportEventInput {
  return { id: id(type), type, occurredAt: at(date, time), occurredAtConfidence: 'witnessed', occurredAtEarliest: null,
    occurredAtLatest: null, severity: null, notes: null, loggedAt: at(date, time), meal: null }
}
function days(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86_400_000) out.push(new Date(ms).toISOString().slice(0, 10))
  return out
}
const TRIAL_FOOD = { foodItemId: 'f-hp', foodLabel: 'Royal Canin Hydrolyzed HP', role: 'primary_diet',
  allowedFrom: '2026-06-01', allowedUntil: null, primaryProtein: 'soy', brand: 'Royal Canin', productName: 'Hydrolyzed HP',
  proteins: ['soy'], ingredientsNotes: 'Hydrolysed soy protein, rice, animal fats' }
function baseInput(over: Partial<ReportInput> = {}): ReportInput {
  return { now: NOW, timezone: TZ, pet: { id: 'pet-1', name: 'Cooper', species: 'dog', breed: 'Labrador', sex: 'male',
      dateOfBirth: '2020-01-01', weightKg: 31 }, ownerName: 'Jordan', events: [], aiAnalyses: [], weightChecks: [], doses: [],
    medications: [], medicationItems: [], dietTrials: [], vetVisits: [], feedingArrangements: [], conditions: [], ...over }
}
function trial(over: Record<string, unknown> = {}): any {
  return { id: 'trial-1', foodItemId: 'f-hp', startedAt: '2026-04-21', targetDurationDays: 84, status: 'active',
    completedAt: null, endedAt: null, indication: 'gi' as const, vetName: 'Dr. Chen', foodLabel: 'Royal Canin Hydrolyzed HP',
    primaryProtein: 'soy', proteins: ['soy'], allowedFoods: [TRIAL_FOOD], ...over }
}
function truncatedTrialInput(): ReportInput {
  const events = [...days('2026-04-21', '2026-06-01'), ...days('2026-06-22', '2026-07-02')].map((d) =>
    meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  for (const d of ['2026-04-22', '2026-04-27', '2026-05-06', '2026-05-13', '2026-05-24']) events.push(symptom(d, 'vomit'))
  events.push(symptom('2026-06-29', 'vomit'))
  return baseInput({ events, dietTrials: [trial()],
    vetVisits: [
      { visitedAt: '2026-04-21', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'start elimination diet' },
      { visitedAt: '2026-06-02', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'six-week recheck' } ] })
}

// ─────────────────────────────────────────────────────────────────────────────
// CE-1 — outsideDays === 1 : the pronoun/preposition branch
Deno.test('CE-1 — one cropped day', () => {
  const input = truncatedTrialInput()
  // Move the trial start to one day before the window opens (window = since_visit 2026-06-02)
  input.dietTrials[0].startedAt = '2026-06-01'
  input.events.push(symptom('2026-06-01', 'vomit'))
  const snap = assembleReport(input)
  console.log('CE-1 outside:', JSON.stringify(snap.trial?.trialDaysOutsideRange), 'crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  const text = plain(renderReport(snap))
  const m = text.match(/This report shows [^.]*\./)
  console.log('CE-1 SENTENCE:', m?.[0])
})

// CE-2 — count === 1
Deno.test('CE-2 — a single cropped symptom event', () => {
  const input = truncatedTrialInput()
  input.events = input.events.filter((e) => e.type !== 'vomit' || e.occurredAt >= '2026-05-24')
  const snap = assembleReport(input)
  console.log('CE-2 crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  const text = plain(renderReport(snap))
  console.log('CE-2 SENTENCE:', text.match(/This report shows [^.]*\./)?.[0])
})

// CE-3 — both ends cropped, on a CUSTOM window, so the page-1 guard fires too
Deno.test('CE-3 — before>0 AND after>0, custom window, both guards on one page', () => {
  const input = truncatedTrialInput()
  input.requestedWindow = { startDate: '2026-05-10', endDate: '2026-06-10' }
  input.events.push(symptom('2026-06-20', 'diarrhea'))
  const snap = assembleReport(input)
  console.log('CE-3 basis:', snap.scope.basis, 'custom:', snap.scope.isCustomOverride)
  console.log('CE-3 outside:', JSON.stringify(snap.trial?.trialDaysOutsideRange), 'elapsed:', snap.trial?.trialDaysElapsed)
  console.log('CE-3 crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  console.log('CE-3 p1:', snap.scope.outOfWindowSymptomCount, snap.scope.outOfWindowBefore, snap.scope.outOfWindowAfter, snap.scope.outOfWindowMostRecentType, snap.scope.outOfWindowMostRecent)
  const text = plain(renderReport(snap))
  console.log('CE-3 P1:', text.match(/Custom range[^.]*\./)?.[0] ?? text.match(/[^.]*fall outside this window[^.]*/)?.[0])
  console.log('CE-3 TRIAL:', text.match(/This report shows [^.]*\./)?.[0])
})

// CE-4 — the two registers on ONE page: page-1 states a TOTAL over the same bounded pull
// that the trial clause calls a FLOOR.
Deno.test('CE-4 — same number, two registers', () => {
  const input = truncatedTrialInput()
  input.requestedWindow = { startDate: '2026-06-02', endDate: '2026-07-02' }
  input.eventsSinceIso = '2026-05-01T00:00:00Z' // pull fell short of the 2026-04-21 trial start
  const snap = assembleReport(input)
  console.log('CE-4 p1 count:', snap.scope.outOfWindowSymptomCount, 'crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  const text = plain(renderReport(snap))
  console.log('CE-4 P1:', text.match(/[^.]*fall outside this window[^.]*/)?.[0])
  console.log('CE-4 TRIAL:', text.match(/This report shows [^.]*\./)?.[0])
})

// CE-5 — the identity, on every branch we can reach
Deno.test('CE-5 — elapsed identity across branches', () => {
  const variants: Array<[string, ReportInput]> = []
  { const i = truncatedTrialInput(); variants.push(['stale-active', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].endedAt = '2026-06-10'; i.dietTrials[0].status = 'completed'; variants.push(['ended-in-window', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].targetDurationDays = 14; variants.push(['overrun (B-422 tail clip)', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].startedAt = '2024-05-01'; variants.push(['stale 2-year active', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].startedAt = '2026-07-02'; variants.push(['starts today', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].startedAt = '2026-08-01'; variants.push(['starts in the FUTURE', i]) }
  { const i = truncatedTrialInput(); i.dietTrials[0].startedAt = '2026-06-10'; i.dietTrials[0].endedAt = '2026-06-05'; i.dietTrials[0].status='completed'; variants.push(['ends BEFORE it starts', i]) }
  for (const [name, i] of variants) {
    const t = assembleReport(i).trial
    if (!t) { console.log(`CE-5 ${name}: NO BLOCK`); continue }
    const ok = t.elapsedEndDayIndex - t.elapsedStartDayIndex + 1 === t.trialDaysElapsed
    console.log(`CE-5 ${name}: elapsed=${t.trialDaysElapsed} span=[${t.elapsedStartDayIndex},${t.elapsedEndDayIndex}] identity=${ok} outside=${JSON.stringify(t.trialDaysOutsideRange)} crop=${JSON.stringify(assembleReport(i).scope.trialCropSymptoms)}`)
  }
})

// CE-6 — the widened pull: does anything OTHER than the two guards move?
Deno.test('CE-6 — widening the pull backwards', () => {
  const narrow = truncatedTrialInput()
  const wide = truncatedTrialInput()
  // 300 days of extra history the widened pull would now fetch (trial start 2026-04-21,
  // window start 2026-06-02 → old floor 2026-03-04; new floor reaches the trial start).
  for (const d of ['2025-09-01', '2025-11-15', '2026-01-02', '2026-02-20', '2026-03-01']) {
    wide.events.push(symptom(d, 'vomit'))
    wide.events.push(meal({ date: d, brand: 'Old', product: 'Kibble', foodItemId: 'f-old', proteins: ['chicken'] }))
  }
  const a = assembleReport(narrow), b = assembleReport(wide)
  const diffs: string[] = []
  const walk = (x: unknown, y: unknown, path: string) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) {
      for (const k of new Set([...Object.keys(x as object), ...Object.keys(y as object)])) {
        walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}.${k}`)
      }
      return
    }
    diffs.push(`${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`)
  }
  walk(a, b, 'snap')
  console.log('CE-6 DIFFS:\n' + diffs.join('\n'))
})

// CE-7 — computeLookbackIso itself
Deno.test('CE-7 — computeLookbackIso arithmetic', () => {
  const nowMs = Date.parse(NOW)
  const scope = { startDate: '2026-06-02', endDate: '2026-07-02' } as never
  console.log('no trial       :', computeLookbackIso(scope, nowMs, null))
  console.log('trial in window:', computeLookbackIso(scope, nowMs, '2026-06-15'))
  console.log('trial 42d back :', computeLookbackIso(scope, nowMs, '2026-04-21'))
  console.log('trial 2y back  :', computeLookbackIso(scope, nowMs, '2024-05-01'))
  console.log('trial bad iso  :', computeLookbackIso(scope, nowMs, 'not-a-date'))
  console.log('trial FUTURE   :', computeLookbackIso(scope, nowMs, '2026-08-01'))
})

// CE-8 — timezone seams
Deno.test('CE-8 — tz: pull floor lands mid-first-day', () => {
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Honolulu', 'America/New_York', 'UTC']) {
    const i = truncatedTrialInput()
    i.timezone = tz
    i.eventsSinceIso = '2026-04-21T00:00:00Z' // exactly the trial start's UTC midnight
    const s = assembleReport(i)
    console.log(`CE-8 ${tz}: crop=${JSON.stringify(s.scope.trialCropSymptoms)} outside=${JSON.stringify(s.trial?.trialDaysOutsideRange)} elapsed=${s.trial?.trialDaysElapsed}`)
  }
})

// CE-9 — year stamping across a year boundary
Deno.test('CE-9 — a cropped event in a different year', () => {
  const events = [...days('2025-11-20', '2026-01-05'), ...days('2026-01-20', '2026-02-05')].map((d) =>
    meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  events.push(symptom('2025-12-02', 'vomit'))
  events.push(symptom('2025-12-20', 'diarrhea'))
  const input = baseInput({
    now: '2026-02-05T12:00:00Z',
    events,
    dietTrials: [trial({ startedAt: '2025-11-20', targetDurationDays: 120 })],
    vetVisits: [{ visitedAt: '2026-01-06', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'recheck' }],
  })
  const snap = assembleReport(input)
  console.log('CE-9 basis:', snap.scope.basis, snap.scope.startDate, snap.scope.endDate)
  console.log('CE-9 crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  const text = plain(renderReport(snap))
  console.log('CE-9 TRIAL:', text.match(/This report shows [^.]*\./)?.[0])
  console.log('CE-9 ROW:', text.match(/Record[^|]{0,600}/)?.[0]?.slice(0, 600))
})
