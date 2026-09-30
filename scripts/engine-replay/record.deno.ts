// The as-of record loader shared by the engine replays (CUL-1117).
//
// WHY THIS EXISTS. The Signal cache is one row per pet, deleted and rewritten on every
// run, so nothing in production remembers what Home said last Tuesday. The replay
// reconstructs it: the record as it stood at an instant T, fed to the shipped engine.
// "As it stood" is the whole job, so the visibility rule is written once (in
// supabase/functions/generate-signal/eval/asOf.ts since EN-1, which the scorecard shares):
//
//   a row is visible at T iff created_at <= T, and (deleted_at IS NULL or deleted_at > T),
//   and occurred_at <= T.
//
// A photo read is visible iff its analysis existed at T. If the owner edited it AFTER T,
// the model's original values (ai_raw_payload) stand in for blood / foreign material,
// because that is what the engine saw that evening.
//
// What it cannot reconstruct, stated so a blind spot does not read as coverage (C-38):
//   · meal intake ratings are read as they are NOW (a rating added later looks as if it
//     was there all along);
//   · the diet trial is read at its CURRENT target length. The window-provenance columns
//     are deliberately not exported (guards/dietTrialProvenance.test.ts: those columns are
//     for the vet report and nothing else), so a moved window replays as if it had always
//     been where it is today;
//   · medication doses are loaded, but the live engine has read zero of them since
//     2026-06-23 (CUL-1099), so the Signal replay leaves them out unless asked.
//
// It refuses an export that does not name exactly one pet (subject.ts, CUL-1276): a
// mistyped id or owner email comes back as one row of nulls, which used to load as an
// empty record and replay as a clean pass. And it refuses a pet that is not in
// evaluationSubjects.ts (CUL-1314, PMD-12): the export skips RLS, so one pet is not yet
// a pet a session may read. That refusal reads the export's own `pet_id` label, after the
// rows have reached the session; the query's CTE is what keeps them in the database.
//
// DATA NEVER ENTERS THE REPO. export.sql is run through the Supabase MCP by a session;
// the result lands in the session's scratchpad and is read from there.

import { subjectProblem } from './subject.ts'
import { flagsAsOf as flagsAsOfShared, localToUtc, visibleAt } from '../../supabase/functions/generate-signal/eval/asOf.ts'

export type Iso = string

export interface RecordEvent {
  id: string
  ty: string
  at: Iso
  cf: string | null
  ea: Iso | null
  la: Iso | null
  cr: Iso
  del: Iso | null
  sev: number | null
}

export interface RecordAnalysis {
  event_id: string
  incident_type: string
  status: string
  blood_present: string | null
  stool_blood_present: string | null
  foreign_material_present: string | null
  contents: string[] | null
  bile_present: string | null
  created_at: Iso
  updated_at?: Iso | null
  edited_at: Iso | null
  recommendation: string | null
  contextual_flags: string[] | null
  visual_flags: string[] | null
  rb: string | null // ai_raw_payload->>'blood_present'
  rf: string | null // ai_raw_payload->>'foreign_material_present'
}

export interface RecordMeal {
  id: string
  at: Iso
  cf: string | null
  cr: Iso
  del: Iso | null
  foodItemId: string | null
  rating: string | null
}

export interface RecordFood {
  id: string
  primaryProtein: string | null
  proteins: string[] | null
  foodType: string | null
  format: string | null
  brand: string
  productName: string
}

export interface PetRecord {
  tz: string
  pet: { name: string; species: string }
  events: RecordEvent[]
  meals: RecordMeal[]
  foods: Map<string, RecordFood>
  trials: { started_at: string; target_duration_days: number | null; status: string; created_at: Iso }[]
  arrangements: {
    id: string
    food_item_id: string | null
    is_shared: boolean
    active_from: string | null
    active_until: string | null
    method: string
    deleted_at: Iso | null
    created_at: Iso
    primary_protein: string | null
    proteins: string[] | null
  }[]
  medications: { id: string; drug_name: string; medication_item_id: string | null; started_at: string | null; ended_at: string | null; route: string | null; created_at: Iso }[]
  administrations: { event_id: string; medication_id: string | null; medication_item_id: string | null; adherence: string | null; paired_event_id: string | null }[]
  analyses: RecordAnalysis[]
}

// The MCP writes an oversized result to a file as a JSON wrapper whose `result` string
// carries the rows between untrusted-data fences. Accept that, or a plain JSON file.
function unwrap(path: string): Record<string, unknown> {
  const raw = Deno.readTextFileSync(path)
  let text = raw
  try {
    const outer = JSON.parse(raw)
    if (outer && typeof outer === 'object' && typeof (outer as { result?: unknown }).result === 'string') {
      text = (outer as { result: string }).result
    } else if (Array.isArray(outer)) {
      return (outer[0] as { dump: Record<string, unknown> }).dump
    } else if (outer && typeof outer === 'object' && 'dump' in outer) {
      return (outer as { dump: Record<string, unknown> }).dump
    } else {
      return outer as Record<string, unknown>
    }
  } catch {
    // not JSON at the top level; fall through to the fenced form
  }
  const match = text.match(/(\[\{"dump".*\}\])\s*<\/untrusted/s)
  if (!match) throw new Error(`no {dump} payload found in ${path}`)
  return (JSON.parse(match[1]) as { dump: Record<string, unknown> }[])[0].dump
}

// Positional rows from export.sql Query 2 (kept positional to fit the MCP's size cap).
type MealRow = [string, Iso, string | null, Iso, Iso | null, string | null, string | null, Iso]
type FoodRow = [string, string | null, string[] | null, string | null, string | null, string | null, string | null]

interface RecordDump {
  subjects?: number
  pet_id?: string | null
  tz: string
  pet: PetRecord['pet']
  events: RecordEvent[] | null
  trials: PetRecord['trials'] | null
  arr: PetRecord['arrangements'] | null
  meds: PetRecord['medications'] | null
  admins: PetRecord['administrations'] | null
  ana: RecordAnalysis[] | null
}
interface MealsDump { subjects?: number; pet_id?: string | null; meals: MealRow[] | null; foods: FoodRow[] | null }

export function loadRecord(recordPath: string, mealsPath: string): PetRecord {
  const r = unwrap(recordPath) as unknown as RecordDump
  const m = unwrap(mealsPath) as unknown as MealsDump
  const problem = subjectProblem(r, m)
  if (problem) throw new Error(`refusing to replay ${recordPath} + ${mealsPath}: ${problem}`)
  const foods = new Map<string, RecordFood>()
  for (const f of m.foods ?? []) {
    foods.set(f[0], { id: f[0], primaryProtein: f[1], proteins: f[2], foodType: f[3], format: f[4], brand: f[5] ?? '', productName: f[6] ?? '' })
  }
  return {
    tz: r.tz,
    pet: r.pet,
    events: r.events ?? [],
    meals: (m.meals ?? []).map((x) => ({ id: x[0], at: x[1], cf: x[2], cr: x[3], del: x[4], foodItemId: x[5], rating: x[6] })),
    foods,
    trials: r.trials ?? [],
    arrangements: r.arr ?? [],
    medications: r.meds ?? [],
    administrations: r.admins ?? [],
    analyses: r.ana ?? [],
  }
}

// The as-of rules live in generate-signal/eval/asOf.ts since EN-1 (CUL-1131), so the scorecard
// over synthetic pets and this replay read a record through one rule. Re-exported unchanged.
export { localToUtc, visibleAt }

/** Blood / foreign material as the engine saw them at T (pre-edit values before an edit). */
export function flagsAsOf(a: RecordAnalysis, T: number): { blood: string | null; foreign: string | null } {
  return flagsAsOfShared(a, T)
}

export function argValue(name: string, fallback?: string): string {
  const i = Deno.args.indexOf(`--${name}`)
  if (i >= 0 && Deno.args[i + 1]) return Deno.args[i + 1]
  if (fallback !== undefined) return fallback
  throw new Error(`missing --${name}`)
}
