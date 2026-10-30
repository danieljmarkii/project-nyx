// The capture path's Signal (CUL-2150): the `ai_signals` rows Home reads, computed by the
// shipped engine over exactly the rows the capture serves.
//
//   deno run --cached-only --allow-read --allow-env --allow-write scripts/web-capture/signals.deno.ts <out.json>
//
// Home reads its Signal from the `ai_signals` cache and asks `generate-signal` for a fresh one
// when the cache is missing; the capture answers neither by default, so Home showed the
// building state instead of each fixture pet's lead. This runs `runSignalPipeline` (the pure
// function generate-signal's shell calls) per pet over `buildFixtureTables`' rows, the same
// rows `fixtureRest.ts` hands the app, at the same frozen instant and under the same
// `app_config` flags, and writes the row the shell would insert: template phrasing (the
// shell's no-model fallback), a 24h expiry from that instant. Never production: no client, no
// network, no account. capture.mjs refuses a file computed at a different instant.
//
// The care record and the care-context facts are empty, as on a fresh fixture account (the
// fixture's detection test makes the same call: EN-10's lines decorate a finding and never
// move one). Weights are fed through the production mapper while engines_v3_en8 is on.
// With CAPTURE_FLAGS unset every Engines v3 key is off (the app is served no app_config
// either, so both sides agree); the fixture's detection test holds each pet's lead under
// every key, so the lead is the same, but a key's decorations are absent unless set.
import { mapWeightCheckRows, runSignalPipeline, assembleSignal, templateTexts, templateSummary, type MealEventRow, type SignalRows, type SymptomRow, type WeightCheckRow } from '../../supabase/functions/generate-signal/pipeline.ts'
import { CORRELATION_SYMPTOM_TYPES } from '../../supabase/functions/generate-signal/detection.ts'
import { EMPTY_CARE_RECORD } from '../../supabase/functions/generate-signal/careState.ts'
import { isEngineKeyOn, resolveEngineFlags, type EngineFlags } from '../../supabase/functions/_shared/engineFlags.ts'
import { signalStampValues } from '../../supabase/functions/_shared/engineStamps.ts'
import { WEIGHT_RULES } from '../../lib/weightStory.ts'
import { buildFixtureTables, captureFlagRows, CAPTURE_DEFAULT_NOW, FIXTURE_USER_ID } from './fixtureRest.ts'
import { buildFixtureStory } from '../fixture/fixtureStory.ts'

type Row = Record<string, unknown>

const out = Deno.args[0]
if (!out) throw new Error('usage: signals.deno.ts <out.json>')

const nowIso = new Date(Date.parse(Deno.env.get('CAPTURE_NOW') ?? CAPTURE_DEFAULT_NOW)).toISOString()
const nowMs = Date.parse(nowIso)
const tables = buildFixtureTables(nowMs)
// The flags the app reads are the flags the engine runs under, resolved the shell's way.
const flagRows = captureFlagRows(Deno.env.get('CAPTURE_FLAGS'))
const engineFlags: EngineFlags = resolveEngineFlags({ data: flagRows, error: null }, FIXTURE_USER_ID)

const SYMPTOMS: ReadonlySet<string> = new Set(CORRELATION_SYMPTOM_TYPES)
// generate-signal/index.ts's LOOKBACK_DAYS (not exported: index.ts is the shell and serves on
// import). Same question, the window every event pull reads, so the same value.
const LOOKBACK_DAYS = 180
const lookbackMs = nowMs - LOOKBACK_DAYS * 86_400_000
const inWindow = (e: Row) => Date.parse(e.occurred_at as string) >= lookbackMs
const live = (r: Row) => r.deleted_at == null
const foods = new Map(tables.food_items.map((f) => [f.id as string, f]))
const eventsById = new Map(tables.events.map((e) => [e.id as string, e]))
const timezone = (tables.user_profiles[0]?.timezone as string | undefined) ?? null

function rowsFor(pet: Row): SignalRows {
  const events = tables.events.filter((e) => e.pet_id === pet.id && live(e) && inWindow(e))
  const symptoms: SymptomRow[] = events
    .filter((e) => SYMPTOMS.has(e.event_type as string))
    .map((e) => ({
      id: e.id as string,
      event_type: e.event_type as string,
      occurred_at: e.occurred_at as string,
      occurred_at_confidence: (e.occurred_at_confidence as string | null) ?? null,
      severity: (e.severity as number | null) ?? null,
    }))
  const meals: MealEventRow[] = []
  for (const m of tables.meals.filter((m) => m.pet_id === pet.id)) {
    const e = eventsById.get(m.event_id as string)
    if (!e || !live(e) || !inWindow(e) || e.event_type !== 'meal') continue
    const f = foods.get(m.food_item_id as string)
    meals.push({
      id: e.id as string,
      occurred_at: e.occurred_at as string,
      occurred_at_confidence: (e.occurred_at_confidence as string | null) ?? null,
      meals: {
        food_item_id: (m.food_item_id as string | null) ?? null,
        intake_rating: (m.intake_rating as never) ?? null,
        component_count: (m.component_count as number | null) ?? null,
        food_items: f
          ? {
            primary_protein: (f.primary_protein as string | null) ?? null,
            proteins: (f.proteins as string[] | null) ?? null,
            food_type: (f.food_type as string | null) ?? null,
            format: (f.format as string | null) ?? null,
            brand: f.brand as string,
            product_name: f.product_name as string,
          }
          : null,
      },
      meal_components: [],
    })
  }
  const activeTrials = tables.diet_trials
    .filter((t) => t.pet_id === pet.id && t.status === 'active' && live(t))
    .map((t) => ({
      started_at: t.started_at as string,
      target_duration_days: t.target_duration_days as number,
      indication: (t.indication as string | null) ?? null,
      target_protein: (t.target_protein as string | null) ?? null,
    }))
  return {
    pet: { name: pet.name as string, species: pet.species as string },
    symptoms,
    meals,
    activeTrials,
    arrangements: [],
    timezone,
    regimens: [],
    doseEvents: [],
    incidentAnalyses: [],
  }
}

// The weight lane's input as index.ts's readWeightFacts builds it: the window's weigh-ins
// with migration 081's defaults for a seeded row, no birthday. Null while en8 is off.
function weightFactsFor(pet: Row) {
  if (!isEngineKeyOn(engineFlags, 'engines_v3_en8')) return null
  const since = nowMs - (WEIGHT_RULES.windowDays + 1) * 86_400_000
  const rows: WeightCheckRow[] = tables.weight_checks
    .filter((w) => w.pet_id === pet.id && live(w))
    .flatMap((w) => {
      const e = eventsById.get(w.event_id as string)
      if (!e || !live(e) || Date.parse(e.occurred_at as string) < since) return []
      return [{ id: w.id as string, weight_kg: w.weight_kg as number, source: 'home_scale', source_basis: 'legacy', events: { occurred_at: e.occurred_at as string } }]
    })
  return { readings: mapWeightCheckRows(rows), dateOfBirth: null }
}

const signals: Row[] = tables.pets.map((pet) => {
  const result = runSignalPipeline({
    rows: rowsFor(pet),
    incompletePulls: [],
    prior: null,
    priorReadFailed: false,
    nowMs,
    engineFlags,
    careRecord: EMPTY_CARE_RECORD,
    careContextFacts: null,
    weightFacts: weightFactsFor(pet),
  })
  const summary = result.summaryPacket ? templateSummary(result.summaryPacket) : null
  const payload = assembleSignal(result, templateTexts(result), summary)
  if (payload.standDownError !== null) throw new Error(`stand-down resolution failed for ${pet.name}: ${payload.standDownError}`)
  return {
    // Deterministic, so a capture stays a pure function of the code and the story.
    id: `capture-signal-${pet.id}`,
    pet_id: pet.id,
    signal_text: payload.signalText,
    is_building: payload.isBuilding,
    findings: payload.findings,
    coverage: payload.coverage,
    summary,
    generated_at: nowIso,
    expires_at: new Date(nowMs + 24 * 3_600_000).toISOString(),
    ...signalStampValues(engineFlags, 'web-capture'),
  }
})

// Each pet DECLARES its lead (scripts/fixture/fixtureStory.ts). A capture of a Home whose lead
// moved would be judged against the wrong card, so a mismatch fails the run rather than
// photographing it.
const declared = new Map(buildFixtureStory({ userId: FIXTURE_USER_ID, timezone: timezone ?? 'UTC' }).pets.map((p) => [p.id, p]))
const drift: string[] = []
for (const s of signals) {
  const pet = declared.get(s.pet_id as string)
  const findings = s.findings as Array<{ finding: { type: string; priorityClass?: string } }>
  const lead = findings[0]?.finding
  const got = lead ? `${lead.type}/${lead.priorityClass ?? '-'}` : 'none'
  const decl = pet?.declaredLead
  const want = !decl || decl.kind === 'none' ? 'none' : `${decl.type}/${decl.kind === 'safety' ? 'safety' : 'insight'}`
  console.log(`${pet?.name ?? s.pet_id}: ${got}${got === want ? '' : ` (declared ${want})`}`)
  if (got !== want) drift.push(`${pet?.name}: got ${got}, declared ${want}`)
}
if (drift.length > 0) throw new Error(`the engine's leads differ from the fixture's declared leads: ${drift.join('; ')}`)

await Deno.writeTextFile(out, JSON.stringify({ nowIso, flagRows, flags: engineFlags.on, ai_signals: signals }, null, 2))
