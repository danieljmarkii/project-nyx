// ADVERSARIAL SCRATCH ROUND 3 — B-613 (post round-16 layer). Not for merge.
import { strict as assert } from 'node:assert'
import { assembleReport, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&middot;/g, '·').replace(/&times;/g, '×').replace(/&rarr;/g, '→').replace(/&dagger;/g, '†')
    .replace(/&ge;/g, '≥').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}
const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'
function at(d: string, t = '14:00:00'): string { return `${d}T${t}Z` }
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
  return { now: NOW, timezone: TZ, pet: { id: 'pet-1', name: 'Nyx', species: 'cat', breed: 'DSH', sex: 'female',
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
const REACH = '2026-01-03T12:00:00Z' // a pull that reaches well before the trial start

// ── R3-A — the density sentence's predicate vs the coverage line's ───────────
Deno.test('R3-A — a TREAT-only day counts as a logged meal day in the crop', () => {
  const i = truncatedTrialInput()
  i.eventsSinceIso = REACH
  // Strip the cropped head's real meals; leave ONE treat a day. computeTrialFacts'
  // coverage numerator excludes treats by rule (a single treat must not erase an
  // untracked day). The new crop-density numerator does not.
  i.events = i.events.filter((e) => !(e.type === 'meal' && e.occurredAt < '2026-06-02'))
  for (const d of days('2026-04-21', '2026-06-01')) {
    i.events.push(meal({ date: d, brand: 'Temptations', product: 'Chicken', foodItemId: 'f-treat', foodType: 'treat', proteins: ['chicken'], time: '10:00:00' }))
  }
  const s = assembleReport(i)
  console.log('R3-A crop:', JSON.stringify(s.scope.trialCropSymptoms))
  const t = plain(renderReport(s))
  console.log('R3-A ROW:', t.match(/RecordThis report shows[^|]{0,420}/)?.[0])
})

// ── R3-B — cropDays === before + after, swept over shapes and zones ──────────
Deno.test('R3-B — cropDays agrees with the day count the sentence prints', () => {
  const shapes: Array<[string, (i: ReportInput) => void]> = [
    ['since_visit head crop', () => {}],
    ['custom both ends', (i) => { i.requestedWindow = { startDate: '2026-05-10', endDate: '2026-06-10' } }],
    ['custom tail only', (i) => { i.requestedWindow = { startDate: '2026-04-21', endDate: '2026-05-20' } }],
    ['custom future end', (i) => { i.requestedWindow = { startDate: '2026-05-01', endDate: '2026-09-30' } }],
    ['ended trial mid-window', (i) => { i.dietTrials[0].endedAt = '2026-06-10'; i.dietTrials[0].status = 'completed' }],
    ['ended trial, window before end', (i) => { i.dietTrials[0].endedAt = '2026-06-10'; i.dietTrials[0].status = 'completed'; i.requestedWindow = { startDate: '2026-04-21', endDate: '2026-05-05' } }],
    ['overrun (target 14d)', (i) => { i.dietTrials[0].targetDurationDays = 14 }],
    ['stale 2-year active', (i) => { i.dietTrials[0].startedAt = '2024-05-01' }],
  ]
  let bad = 0
  for (const tz of ['America/New_York', 'Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Honolulu', 'UTC']) {
    for (const [name, mut] of shapes) {
      const i = truncatedTrialInput(); i.timezone = tz; i.eventsSinceIso = '2024-01-01T00:00:00Z'; mut(i)
      const s = assembleReport(i); const t = s.trial; const c = s.scope.trialCropSymptoms
      if (!t || !c) continue
      const outsideDays = t.trialDaysOutsideRange.before + t.trialDaysOutsideRange.after
      const D=86400000
      const dn=(iso:string)=>Math.round(Date.parse(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.parse(iso)))+'T00:00:00Z')/D)
      let cropDays=0
      for(let d=t.elapsedStartDayIndex; d<=t.elapsedEndDayIndex; d++) if(d<s.scope.startDayNum||d>s.scope.endDayNum) cropDays++
      if (cropDays !== outsideDays) { bad++; console.log(`R3-B MISMATCH ${tz} / ${name}: cropDaysFromSpan=${cropDays} outsideDaysPrinted=${outsideDays}`) }
      const set=new Set(['vomit','diarrhea','itch','scratch','skin_reaction','cough','sneeze','lethargy'])
      const hand=i.events.filter((e)=>set.has(e.type)).filter((e)=>{const d=dn(e.occurredAt); return d>=t.elapsedStartDayIndex&&d<=t.elapsedEndDayIndex&&(d<s.scope.startDayNum||d>s.scope.endDayNum)}).length
      if (hand !== c.count) { bad++; console.log(`R3-B COUNT MISMATCH ${tz}/${name}: hand=${hand} got=${c.count}`) }
    }
  }
  console.log('R3-B mismatches:', bad)
})

// ── R3-C — the legend, and what it promises ─────────────────────────────────
Deno.test('R3-C — the legend entry', () => {
  const i = truncatedTrialInput(); i.eventsSinceIso = REACH
  // The B-494 patient inside the cropped days: every prescribed bowl refused, plus
  // an off-diet chicken meal daily. NONE of it is a REPORT_SYMPTOM_SET event.
  for (const d of days('2026-04-21', '2026-06-01')) {
    i.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused', time: '08:00:00' }))
    i.events.push(meal({ date: d, brand: 'Purina', product: 'Chicken Feast', foodItemId: 'f-chicken', proteins: ['chicken'], time: '20:00:00' }))
  }
  const s = assembleReport(i)
  const t = plain(renderReport(s))
  console.log('R3-C crop:', JSON.stringify(s.scope.trialCropSymptoms))
  console.log('R3-C TRIALROW:', t.match(/RecordThis report shows[^|]{0,460}/)?.[0])
  const li = t.indexOf('Range Scoped to')
  console.log('R3-C LEGEND:', t.slice(li, li + 780))
})

// ── R3-D — cropped days that hold ONLY non-report symptom types ─────────────
Deno.test('R3-D — a symptom leaf outside REPORT_SYMPTOM_TYPES', () => {
  const i = truncatedTrialInput(); i.eventsSinceIso = REACH
  i.events = i.events.filter((e) => e.type !== 'vomit')
  for (const d of ['2026-04-25', '2026-05-02', '2026-05-19', '2026-05-30']) {
    i.events.push(symptom(d, 'stool_normal'))
    i.events.push(symptom(d, 'other'))
  }
  const s = assembleReport(i)
  console.log('R3-D crop:', JSON.stringify(s.scope.trialCropSymptoms))
  const t = plain(renderReport(s))
  console.log('R3-D ROW:', t.match(/RecordThis report shows[^|]{0,300}/)?.[0])
})

// ── R3-E — the density sentence over a crop the record never covered ────────
Deno.test('R3-E — density over pre-adoption cropped days', () => {
  const i = truncatedTrialInput(); i.eventsSinceIso = REACH
  // A trial the vet dated back six weeks; the owner only started logging at the recheck.
  i.events = i.events.filter((e) => e.occurredAt >= '2026-06-02')
  i.events.push(symptom('2026-05-30', 'vomit'))
  const s = assembleReport(i)
  console.log('R3-E crop:', JSON.stringify(s.scope.trialCropSymptoms))
  const t = plain(renderReport(s))
  console.log('R3-E ROW:', t.match(/RecordThis report shows[^|]{0,340}/)?.[0])
})

// ── R3-F — every REPORT symptom type at once: the parenthetical's length ────
Deno.test('R3-F — eight signs in the crop', () => {
  const i = truncatedTrialInput(); i.eventsSinceIso = REACH
  for (const ty of ['vomit','diarrhea','itch','scratch','skin_reaction','cough','sneeze','lethargy']) {
    i.events.push(symptom('2026-05-15', ty))
  }
  const s = assembleReport(i)
  const t = plain(renderReport(s))
  console.log('R3-F crop:', JSON.stringify(s.scope.trialCropSymptoms))
  console.log('R3-F ROW:', t.match(/RecordThis report shows[^|]{0,480}/)?.[0])
})

// ── R3-G — determinism of byType ordering on a tie ─────────────────────────
Deno.test('R3-G — tie ordering is stable regardless of input order', () => {
  const mk = (order: string[]) => {
    const i = truncatedTrialInput(); i.eventsSinceIso = REACH
    i.events = i.events.filter((e) => e.type !== 'vomit')
    for (const ty of order) i.events.push(symptom('2026-05-15', ty))
    return JSON.stringify(assembleReport(i).scope.trialCropSymptoms)
  }
  console.log('R3-G a:', mk(['itch','vomit','diarrhea']))
  console.log('R3-G b:', mk(['diarrhea','itch','vomit']))
})

// ── R3-H — the two-register clash, with the density sentence added ─────────
Deno.test('R3-H — page 1 total vs trial floor, one artifact', () => {
  const i = truncatedTrialInput()
  i.requestedWindow = { startDate: '2026-06-02', endDate: '2026-07-02' }
  i.eventsSinceIso = '2026-05-01T00:00:00Z'
  const s = assembleReport(i)
  const t = plain(renderReport(s))
  console.log('R3-H P1   :', t.match(/[^.]*fall outside this window[^.]*/)?.[0])
  console.log('R3-H TRIAL:', t.match(/This report shows [^|]{0,300}/)?.[0])
})
