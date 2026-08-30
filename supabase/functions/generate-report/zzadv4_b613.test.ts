import { assembleReport, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'
function plain(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g, ' ')
}
const NOW = '2026-07-02T12:00:00Z'; const TZ = 'America/New_York'
function at(d: string, t = '14:00:00'): string { return `${d}T${t}Z` }
let seq = 0; function id(p: string): string { seq += 1; return `${p}-${seq}` }
function meal(o: any): ReportEventInput { return { id: id('meal'), type: 'meal', occurredAt: at(o.date, o.time ?? '13:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(o.date, o.time ?? '13:00:00'), meal: { foodItemId: o.foodItemId ?? 'f-unknown', intakeRating: o.intakeRating ?? null, quantity: null, foodType: o.foodType ?? 'meal', format: null, primaryProtein: (o.proteins ?? [])[0] ?? null, proteins: o.proteins ?? null, ingredientsNotes: null, extractionConfidence: null, brand: o.brand, productName: o.product } } }
function symptom(date: string, type = 'itch'): ReportEventInput { return { id: id(type), type, occurredAt: at(date, '19:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(date, '19:00:00'), meal: null } }
function days(from: string, to: string): string[] { const out: string[] = []; const end = Date.parse(`${to}T00:00:00Z`); for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86400000) out.push(new Date(ms).toISOString().slice(0, 10)); return out }
const TRIAL_FOOD: any = { foodItemId: 'f-hp', foodLabel: 'RC HP', role: 'primary_diet', allowedFrom: '2026-04-21', allowedUntil: null, primaryProtein: 'soy', brand: 'Royal Canin', productName: 'Hydrolyzed HP', proteins: ['soy'], ingredientsNotes: 'soy' }
function input(): ReportInput {
  const events = [...days('2026-04-21', '2026-06-01'), ...days('2026-06-22', '2026-07-02')].map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  for (const d of ['2026-04-22','2026-04-27','2026-05-06','2026-05-13','2026-05-24']) events.push(symptom(d, 'vomit'))
  events.push(symptom('2026-06-29', 'vomit'))
  return { now: NOW, timezone: TZ, pet: { id: 'p', name: 'Nyx', species: 'cat', breed: 'DSH', sex: 'female', dateOfBirth: '2018-01-01', weightKg: 4.1 }, ownerName: 'Sam',
    events, aiAnalyses: [], weightChecks: [], doses: [], medications: [], medicationItems: [],
    dietTrials: [{ id: 't', foodItemId: 'f-hp', startedAt: '2026-04-21', targetDurationDays: 84, status: 'active', completedAt: null, endedAt: null, indication: 'gi', vetName: 'Dr. Chen', foodLabel: 'RC HP', primaryProtein: 'soy', proteins: ['soy'], allowedFoods: [TRIAL_FOOD] } as any],
    vetVisits: [{ visitedAt: '2026-04-21', clinicName: 'R', vetName: 'C', reason: 'start' }, { visitedAt: '2026-06-02', clinicName: 'R', vetName: 'C', reason: 'recheck' }],
    feedingArrangements: [], conditions: [] }
}
Deno.test('R4 — the legend entry, verbatim', () => {
  const i = input(); (i as any).eventsSinceIso = '2026-01-03T12:00:00Z'
  const t = plain(renderReport(assembleReport(i)))
  const k = t.indexOf('Range Scoped to')
  console.log('LEGEND:', k < 0 ? '(not found) ' + t.slice(t.indexOf('legend'), t.indexOf('legend') + 200) : t.slice(k, k + 900))
})
Deno.test('R4b — the legend when there is NO crop', () => {
  const i = input(); i.requestedWindow = { startDate: '2026-04-21', endDate: '2026-07-02' }
  const t = plain(renderReport(assembleReport(i)))
  const k = t.indexOf('Range Scoped to')
  console.log('LEGEND-nocrop:', t.slice(k, k + 500))
})
