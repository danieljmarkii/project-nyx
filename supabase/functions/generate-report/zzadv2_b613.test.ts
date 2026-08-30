// ADVERSARIAL SCRATCH ROUND 2 — B-613. Not for merge.
import { strict as assert } from 'node:assert'
import { assembleReport, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'
import { computeLookbackIso } from './index.ts'

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
function meal(o: { date: string; brand: string | null; product: string | null; foodItemId?: string | null; foodType?: 'meal'|'treat'|'other'|null; proteins?: string[] | null; time?: string; intakeRating?: 'all'|'most'|'some'|'refused'|null }): ReportEventInput {
  return { id: id('meal'), type: 'meal', occurredAt: at(o.date, o.time ?? '13:00:00'), occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(o.date, o.time ?? '13:00:00'),
    meal: { foodItemId: o.foodItemId === undefined ? 'f-unknown' : o.foodItemId, intakeRating: o.intakeRating ?? null, quantity: null,
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
  allowedFrom: '2026-04-21', allowedUntil: null, primaryProtein: 'soy', brand: 'Royal Canin', productName: 'Hydrolyzed HP',
  proteins: ['soy'], ingredientsNotes: 'Hydrolysed soy protein, rice, animal fats' }
function baseInput(over: Partial<ReportInput> = {}): ReportInput {
  return { now: NOW, timezone: TZ, pet: { id: 'pet-1', name: 'Cooper', species: 'cat', breed: 'DSH', sex: 'female',
      dateOfBirth: '2018-01-01', weightKg: 4.1 }, ownerName: 'Sam', events: [], aiAnalyses: [], weightChecks: [], doses: [],
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

// CE-10 — the pull widening actually moving page-1's count on a CUSTOM window
Deno.test('CE-10 — page-1 count is now a function of whether a trial exists', () => {
  const mk = (withTrial: boolean): ReportInput => {
    const i = truncatedTrialInput()
    i.dietTrials[0].startedAt = '2025-06-01' // >180d before now → the trial term WINS the min
    i.requestedWindow = { startDate: '2026-06-02', endDate: '2026-07-02' }
    // symptoms in the 2025-06-01 .. 2026-01-03 band that ONLY the widened pull reaches
    for (const d of ['2025-07-04', '2025-08-15', '2025-10-01', '2025-12-25']) i.events.push(symptom(d, 'vomit'))
    if (!withTrial) i.dietTrials = []
    return i
  }
  const nowMs = Date.parse(NOW)
  const scope = { startDate: '2026-06-02', endDate: '2026-07-02' } as never
  const narrowFloor = computeLookbackIso(scope, nowMs, null)
  const wideFloor = computeLookbackIso(scope, nowMs, '2025-06-01')
  console.log('CE-10 floors:', narrowFloor, '->', wideFloor)
  // simulate: the narrow pull would have dropped the 2025 rows
  const withT = mk(true)
  const withoutT = mk(false)
  withoutT.events = withoutT.events.filter((e) => e.occurredAt >= narrowFloor)
  withT.eventsSinceIso = wideFloor
  withoutT.eventsSinceIso = narrowFloor
  const a = assembleReport(withoutT), b = assembleReport(withT)
  console.log('CE-10 no-trial  p1:', a.scope.outOfWindowSymptomCount, a.scope.outOfWindowBefore, a.scope.outOfWindowMostRecent)
  console.log('CE-10 with-trial p1:', b.scope.outOfWindowSymptomCount, b.scope.outOfWindowBefore, b.scope.outOfWindowMostRecent)
  console.log('CE-10 with-trial crop:', JSON.stringify(b.scope.trialCropSymptoms))
  const t = plain(renderReport(b))
  console.log('CE-10 P1:', t.match(/[^.]*fall outside this window[^.]*/)?.[0])
  console.log('CE-10 TRIAL:', t.match(/This report shows [^.]*\./)?.[0])
})

// CE-11 — the LEGEND's unrestricted "what was logged"
Deno.test('CE-11 — the legend claims more than the clause delivers', () => {
  const i = truncatedTrialInput()
  // The canonical B-494 patient, moved into the CROPPED days: every bowl refused,
  // plus off-diet chicken, in the 42 days this window does not look at.
  for (const d of days('2026-04-21', '2026-06-01')) {
    i.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused', time: '08:00:00' }))
    i.events.push(meal({ date: d, brand: 'Purina', product: 'Chicken Feast', foodItemId: 'f-chicken', proteins: ['chicken'], time: '20:00:00' }))
  }
  const snap = assembleReport(i)
  const text = plain(renderReport(snap))
  console.log('CE-11 crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  console.log('CE-11 TRIAL:', text.match(/This report shows [^.]*\./)?.[0])
  console.log('CE-11 LEGEND:', text.match(/Range Scoped to[^]{0,700}?Denominators/)?.[0])
})

// CE-12 — an AFTER-only crop, stated as a TOTAL
Deno.test('CE-12 — tail-only crop claims a total', () => {
  const i = truncatedTrialInput()
  i.requestedWindow = { startDate: '2026-04-21', endDate: '2026-05-20' } // opens ON the trial start
  const snap = assembleReport(i)
  console.log('CE-12 outside:', JSON.stringify(snap.trial?.trialDaysOutsideRange), 'crop:', JSON.stringify(snap.scope.trialCropSymptoms))
  const text = plain(renderReport(snap))
  console.log('CE-12 TRIAL:', text.match(/This report shows [^.]*\./)?.[0])
  console.log('CE-12 P1:', text.match(/[^.]*fall outside this window[^.]*/)?.[0])
})

// CE-13 — ISO string comparison: fractional seconds and offset forms
Deno.test('CE-13 — mostRecent uses lexicographic > on occurredAt', () => {
  const i = truncatedTrialInput()
  // Same second, one with millis. '2026-05-30T19:00:00.500Z' < '2026-05-30T19:00:00Z' lexically.
  i.events.push({ ...symptom('2026-05-30', 'vomit'), occurredAt: '2026-05-30T19:00:00Z', loggedAt: '2026-05-30T19:00:00Z' })
  i.events.push({ ...symptom('2026-05-30', 'diarrhea'), occurredAt: '2026-05-30T19:00:00.500Z', loggedAt: '2026-05-30T19:00:00.500Z' })
  const snap = assembleReport(i)
  console.log('CE-13 crop:', JSON.stringify(snap.scope.trialCropSymptoms), '(later event is the .500 diarrhea)')
  // And the +00:00 offset form, which sorts BEFORE 'Z'
  const j = truncatedTrialInput()
  j.events.push({ ...symptom('2026-05-30', 'vomit'), occurredAt: '2026-05-30T19:00:00Z', loggedAt: '2026-05-30T19:00:00Z' })
  j.events.push({ ...symptom('2026-05-31', 'diarrhea'), occurredAt: '2026-05-31T19:00:00+00:00', loggedAt: '2026-05-31T19:00:00+00:00' })
  const s2 = assembleReport(j)
  console.log('CE-13b crop:', JSON.stringify(s2.scope.trialCropSymptoms), '(later event is the May 31 +00:00 diarrhea)')
})

// CE-14 — a bogus eventsSinceIso
Deno.test('CE-14 — unparseable eventsSinceIso', () => {
  const i = truncatedTrialInput(); i.eventsSinceIso = 'garbage'
  console.log('CE-14 crop:', JSON.stringify(assembleReport(i).scope.trialCropSymptoms))
  const j = truncatedTrialInput(); j.eventsSinceIso = null
  console.log('CE-14b crop(null):', JSON.stringify(assembleReport(j).scope.trialCropSymptoms))
})

// CE-15 — doses / weights widened by the same lookbackMs
Deno.test('CE-15 — widening also widens doses + weight readings', () => {
  const narrow = truncatedTrialInput()
  const wide = truncatedTrialInput()
  wide.weightChecks = [{ eventId: 'w-old', weightKg: 5.4, occurredAt: '2025-08-01T12:00:00Z' }]
  narrow.weightChecks = []
  for (const i of [narrow, wide]) {
    i.weightChecks.push({ eventId: 'w-new', weightKg: 4.1, occurredAt: '2026-06-20T12:00:00Z' })
  }
  const a = assembleReport(narrow), b = assembleReport(wide)
  console.log('CE-15 narrow weight:', JSON.stringify(a.weight))
  console.log('CE-15 wide   weight:', JSON.stringify(b.weight))
  console.log('CE-15 safetyFlags narrow:', a.safetyFlags.map((f) => f.kind).join(','), '| wide:', b.safetyFlags.map((f) => f.kind).join(','))
})

// CE-16 — can the clause name days that the day-count does not claim?
Deno.test('CE-16 — day-set vs event-set agreement, swept', () => {
  const cases: Array<[string, Partial<ReportInput>, Record<string, unknown>]> = [
    ['window ends in the FUTURE', { requestedWindow: { startDate: '2026-05-01', endDate: '2026-09-30' } }, {}],
    ['window entirely in the past', { requestedWindow: { startDate: '2026-04-25', endDate: '2026-05-05' } }, {}],
    ['ended trial, window past its end', { requestedWindow: { startDate: '2026-04-21', endDate: '2026-07-02' } }, { endedAt: '2026-05-15', status: 'completed' }],
    ['ended trial, window before its end', { requestedWindow: { startDate: '2026-04-21', endDate: '2026-05-05' } }, { endedAt: '2026-05-15', status: 'completed' }],
  ]
  for (const [name, over, tover] of cases) {
    const i = truncatedTrialInput()
    Object.assign(i, over)
    Object.assign(i.dietTrials[0], tover)
    const s = assembleReport(i)
    const t = s.trial
    if (!t) { console.log(`CE-16 ${name}: NO BLOCK`); continue }
    const c = s.scope.trialCropSymptoms
    // recount by hand: symptoms in [elapsedStart, elapsedEnd] outside [startDayNum, endDayNum]
    const D = 86400000
    const dn = (iso: string) => Math.round(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.parse(iso))) + 'T00:00:00Z') / D)
    const set = new Set(['vomit','diarrhea','itch','scratch','skin_reaction','cough','sneeze','lethargy'])
    const cropped = i.events.filter((e) => set.has(e.type)).filter((e) => {
      const d = dn(e.occurredAt)
      return d >= t.elapsedStartDayIndex && d <= t.elapsedEndDayIndex && (d < s.scope.startDayNum || d > s.scope.endDayNum)
    })
    // the DAYS the sentence claims
    const before = t.trialDaysOutsideRange.before, after = t.trialDaysOutsideRange.after
    const claimedDays = new Set<number>()
    for (let d = t.elapsedStartDayIndex; d < t.elapsedStartDayIndex + before; d++) claimedDays.add(d)
    for (let d = t.elapsedEndDayIndex; d > t.elapsedEndDayIndex - after; d--) claimedDays.add(d)
    const outsideClaimed = cropped.filter((e) => !claimedDays.has(dn(e.occurredAt)))
    console.log(`CE-16 ${name}: basis=${s.scope.basis} window=[${s.scope.startDate},${s.scope.endDate}] outside={b:${before},a:${after}} span=[${t.elapsedStartDayIndex},${t.elapsedEndDayIndex}] crop=${JSON.stringify(c)} handRecount=${cropped.length} eventsOnDaysTheSentenceDoesNotClaim=${outsideClaimed.length}`)
  }
})
