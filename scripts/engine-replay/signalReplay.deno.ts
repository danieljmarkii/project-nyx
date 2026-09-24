// Replays the SHIPPED generate-signal detection over a pet's record, one evening at a
// time, and prints what Home would have shown each evening (CUL-1117).
//
//   deno run --allow-read --allow-write scripts/engine-replay/signalReplay.deno.ts \
//     --record <scratch>/record.json --meals <scratch>/meals.json \
//     --from 2026-05-20 --to 2026-09-24 [--hour 21] [--doses] [--out <scratch>/ledger.json]
//
// It mirrors generate-signal/index.ts steps 1 to 4 (load, map, detect, curate, phrase by
// template) with the record filtered through record.deno.ts's as-of rule. It imports the
// engine, never restates it: a replay that re-derives a detector checks nothing (C-34).
// Faithfulness is asserted, not assumed: on 2026-09-24 the replay of the evening of 9/23
// matched the live `ai_signals` row card for card and text for text. Re-check that on any
// record before trusting a ledger built from it.
//
// Never tune a floor on this output. It is one pet; the rules (and the 2026-08 brief's
// §9) forbid calibrating to the dogfood record or the demo pets. It answers "what did the
// owner see, and how often", which is an evaluation question, not a fitting one.
import {
  CORRELATION_SYMPTOM_TYPES,
  DEFAULT_CONFIG,
  detectSignals,
  doseToMedicationWindow,
  type DetectionInput,
  type IncidentAnalysisInput,
  type IntakeRating,
  type MealEvent,
  type MedicationWindow,
  type SymptomEvent,
} from '../../supabase/functions/generate-signal/detection.ts'
import { curateFindings, templateForFinding } from '../../supabase/functions/generate-signal/phrasing.ts'
import { isTrialRunning } from '../../lib/dietTrial.ts'
import { argValue, flagsAsOf, loadRecord, localToUtc, visibleAt, type PetRecord } from './record.deno.ts'

const DAY = 86_400_000
const LOOKBACK_DAYS = 180 // generate-signal/index.ts LOOKBACK_DAYS

function inputAt(rec: PetRecord, T: number, withDoses: boolean): DetectionInput {
  const symptomTypes = new Set<string>(CORRELATION_SYMPTOM_TYPES as readonly string[])
  const symptomEvents: SymptomEvent[] = rec.events
    .filter((e) => symptomTypes.has(e.ty) && visibleAt(e, T, LOOKBACK_DAYS))
    .map((e) => ({ id: e.id, type: e.ty as SymptomEvent['type'], occurredAt: e.at, occurredAtConfidence: (e.cf ?? null) as SymptomEvent['occurredAtConfidence'], severity: e.sev }))

  const doseEvents = rec.events.filter((e) => e.ty === 'medication' && visibleAt(e, T, LOOKBACK_DAYS))
  const adminByEvent = new Map(rec.administrations.map((a) => [a.event_id, a]))
  const paired = new Set<string>()
  if (withDoses) for (const e of doseEvents) { const p = adminByEvent.get(e.id)?.paired_event_id; if (p) paired.add(p) }

  const mealEvents: MealEvent[] = rec.meals
    .filter((m) => visibleAt({ cr: m.cr, del: m.del, at: m.at }, T, LOOKBACK_DAYS))
    .map((m) => {
      const f = m.foodItemId ? rec.foods.get(m.foodItemId) : undefined
      return {
        id: m.id, occurredAt: m.at, isMedicationVehicle: paired.has(m.id),
        occurredAtConfidence: (m.cf ?? null) as MealEvent['occurredAtConfidence'], foodItemId: m.foodItemId,
        primaryProtein: f?.primaryProtein ?? null, proteins: f?.proteins ?? null,
        intakeRating: (m.rating ?? null) as IntakeRating | null,
        foodType: (f?.foodType ?? null) as MealEvent['foodType'], format: (f?.format ?? null) as MealEvent['format'],
        foodLabel: f ? `${f.brand} ${f.productName}`.trim() : null,
      }
    })
  const intakeById = new Map(mealEvents.map((m) => [m.id, m.intakeRating]))

  const feedingArrangements = rec.arrangements
    .filter((a) => a.method === 'free_choice' && Date.parse(a.created_at) <= T && (a.deleted_at == null || Date.parse(a.deleted_at) > T))
    .map((a) => ({ id: a.id, primaryProtein: a.primary_protein, proteins: a.proteins, activeFrom: a.active_from, activeUntil: a.active_until, attributionConfidence: (a.is_shared ? 'low' : 'high') as 'low' | 'high' }))

  // Regimen spans with the whole ended_at day inclusive (index.ts regimenEndIso).
  const medicationWindows: MedicationWindow[] = rec.medications
    .filter((r) => Date.parse(r.created_at) <= T)
    .map((r) => ({ medicationItemId: r.medication_item_id, activeFrom: r.started_at, activeUntil: r.ended_at == null ? null : new Date(Date.parse(r.ended_at) + DAY).toISOString() }))
  if (withDoses) for (const e of doseEvents) {
    const a = adminByEvent.get(e.id)
    if (!a) continue
    const w = doseToMedicationWindow({ medicationItemId: a.medication_item_id, occurredAt: e.at, adherence: a.adherence, pairedVehicleIntake: a.paired_event_id ? (intakeById.get(a.paired_event_id) ?? null) : null })
    if (w) medicationWindows.push(w)
  }

  const eventById = new Map(rec.events.map((e) => [e.id, e]))
  const incidentAnalyses: IncidentAnalysisInput[] = []
  for (const a of rec.analyses) {
    const ev = eventById.get(a.event_id)
    if (!ev || !visibleAt(ev, T, LOOKBACK_DAYS) || Date.parse(a.created_at) > T) continue
    const f = flagsAsOf(a, T)
    incidentAnalyses.push({ eventId: a.event_id, incidentType: a.incident_type, occurredAt: ev.at, bloodPresent: f.blood, stoolBloodPresent: a.stool_blood_present, foreignMaterialPresent: f.foreign })
  }

  const trial = rec.trials.find((t) => t.status === 'active' && Date.parse(t.created_at) <= T)
  const dietTrial = trial ? { startedAt: trial.started_at, targetDurationDays: trial.target_duration_days } : undefined
  const dietTrialActive = trial ? isTrialRunning({ startedAt: trial.started_at, targetDurationDays: trial.target_duration_days }, T, rec.tz) : false

  return {
    pet: { name: rec.pet.name, species: rec.pet.species as DetectionInput['pet']['species'], dietTrialActive },
    symptomEvents, mealEvents, feedingArrangements, medicationWindows, incidentAnalyses, dietTrial,
    timezone: rec.tz, now: new Date(T).toISOString(),
  }
}

// Which register of vet ask a card carries. Read off the rendered text on purpose: the
// question is what the owner read, and the template is the thing they read.
function askRegister(text: string): string {
  if (/worth a call/i.test(text)) return 'call'
  if (/booking a vet visit/i.test(text)) return 'book_visit'
  if (/word with your vet/i.test(text)) return 'word_with_vet'
  if (/vet/i.test(text)) return 'mention_to_vet'
  return 'none'
}

if (import.meta.main) {
  const rec = loadRecord(argValue('record'), argValue('meals'))
  const hour = Number(argValue('hour', '21'))
  const withDoses = Deno.args.includes('--doses')
  const from = argValue('from'), to = argValue('to')
  const ledger: { day: string; cards: { type: string; symptom: string | null; tier: string | null; priorityClass: string; ask: string; text: string }[] }[] = []
  for (let d = Date.parse(`${from}T12:00:00Z`); d <= Date.parse(`${to}T12:00:00Z`); d += DAY) {
    const day = new Date(d).toISOString().slice(0, 10)
    const T = localToUtc(day, hour, rec.tz)
    const curated = curateFindings(detectSignals(inputAt(rec, T, withDoses), DEFAULT_CONFIG))
    ledger.push({
      day,
      cards: curated.map((r) => {
        const f = r.finding as unknown as Record<string, unknown>
        const text = templateForFinding(r.finding, rec.pet.name)
        return {
          type: String(f.type),
          symptom: (f.symptomType ?? f.incidentType ?? null) as string | null,
          tier: (f.tier ?? null) as string | null,
          priorityClass: String(f.priorityClass),
          ask: askRegister(text),
          text,
        }
      }),
    })
  }
  const out = argValue('out', '')
  if (out) Deno.writeTextFileSync(out, JSON.stringify(ledger, null, 1))

  const n = ledger.length
  const withSafety = ledger.filter((l) => l.cards.some((c) => c.priorityClass === 'safety')).length
  const byAsk = new Map<string, number>()
  for (const l of ledger) for (const ask of new Set(l.cards.map((c) => c.ask))) byAsk.set(ask, (byAsk.get(ask) ?? 0) + 1)
  console.log(`${n} evenings (${from} to ${to}, ${hour}:00 ${rec.tz})`)
  console.log(`evenings with >= 1 safety card: ${withSafety}`)
  for (const [ask, count] of [...byAsk.entries()].sort()) console.log(`evenings carrying ask "${ask}": ${count}`)
  let prev = ''
  console.log('\ncard-set changes:')
  for (const l of ledger) {
    const key = l.cards.map((c) => `${c.type}:${c.symptom ?? '-'}:${c.tier ?? '-'}`).join(' | ')
    if (key !== prev) console.log(`${l.day}  ${key || '(no cards)'}`)
    prev = key
  }
}
