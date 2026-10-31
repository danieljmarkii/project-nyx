// The reads `generateReportForPet` makes, as the stand-in client serves them (CUL-2308).
//
// Each entry is one query in supabase/functions/generate-report/index.ts (plus the
// engine-flag read in _shared/engineFlagsRead.ts): the table, the select string EXACTLY as
// the loader sends it, the order it asks for, and the filters export.sql has already
// applied in SQL because the rows it returns do not carry the filtered column.
//
// WHY THE SELECT STRINGS ARE WRITTEN OUT HERE, and why that is not a second copy of the
// loader's logic (C-34). They are not used to build anything. The stand-in REFUSES any query
// whose (table, select) pair is not listed, so the day index.ts changes a column list the
// harness stops instead of handing the shipped code rows shaped for the old one. A drift
// cannot render quietly: it reds `e2e.deno.ts` in CI, and a live run exits non-zero.
// export.sql is written against these same strings; changing one means changing both, and
// export.sql's change is pinned (exportPin.test.ts) behind a privacy review.
//
// Pure TS, no I/O: jest covers it, and run.deno.ts imports it under Deno.

/** A filter export.sql applied in SQL, so the stand-in accepts it without seeing the column. */
export interface PreApplied {
  op: 'eq' | 'is'
  column: string
  /** `'$pet'` means the subject pet's id from the dump's meta read. */
  value: string | boolean | null
}

export interface ReadSpec {
  /** File stem in the dump directory and the `read` column export.sql returns. */
  name: string
  table: string
  select: string
  /** The `.order()` calls, in sequence. export.sql's ORDER BY matches; the stand-in refuses a different sequence. */
  order: string[]
  preApplied: PreApplied[]
  /** `.maybeSingle()`: the dump holds zero or one row. */
  single: boolean
  /** Read only when the loader reaches it (medication_items, only when doses exist). */
  conditional?: boolean
}

const FOOD = 'primary_protein, proteins, ingredients_notes, ai_extraction_confidence'
const COMPONENTS =
  'id, position, food_item_id, food_label, share, share_source, amount_value, amount_unit, updated_at, deleted_at'
const NEWEST = ['created_at', 'id']
// The dose's parent-event FK hint, by name. Spelled through a constant because this file holds
// select STRINGS, not queries: guards/medAdminEmbedHint.test.ts cross-checks a text count of
// hinted embeds against the `.select(` calls it parses, and a string here is neither. The hint
// itself is still enforced where the query runs (generate-report/index.ts), and a copy here that
// lost it would no longer match that query, so the stand-in would refuse it.
const DOSE_EVENT_FK = 'medication_administrations_event_id_fkey'
const PET: PreApplied = { op: 'eq', column: 'pet_id', value: '$pet' }

export const READS: readonly ReadSpec[] = [
  {
    name: 'pet',
    table: 'pets',
    select: 'id, user_id, name, species, breed, sex, date_of_birth, date_of_birth_precision, weight_kg',
    order: [],
    preApplied: [],
    single: true,
  },
  {
    // RLS scopes this to the caller in production; export.sql scopes it to the subject's owner.
    name: 'user_profiles',
    table: 'user_profiles',
    select: 'display_name, timezone',
    order: [],
    preApplied: [],
    single: true,
  },
  {
    name: 'vet_visits',
    table: 'vet_visits',
    select: 'id, visited_at, clinic_name, vet_name, reason',
    order: ['visited_at', 'id'],
    preApplied: [PET, { op: 'is', column: 'deleted_at', value: null }],
    single: false,
  },
  {
    name: 'diet_trials',
    table: 'diet_trials',
    select:
      'id, food_item_id, started_at, target_duration_days, status, completed_at, ended_at, ' +
      'indication, outcome, outcome_notes, stopped_reason, food_label, vet_name, ' +
      'target_protein, target_protein_set_at, ' +
      'target_duration_days_initial, target_duration_set_at, target_duration_vet_directed, ' +
      `food_items(food_type, format, ${FOOD}, brand, product_name), ` +
      'diet_trial_foods(food_item_id, food_label, role, allowed_from, allowed_until, ' +
      `food_items(${FOOD}, brand, product_name, format))`,
    order: ['started_at', 'id'],
    preApplied: [PET, { op: 'is', column: 'diet_trial_foods.deleted_at', value: null }],
    single: false,
  },
  {
    // The household. RLS scopes it to the caller in production; export.sql to the subject's owner.
    name: 'household',
    table: 'pets',
    select: 'id, species, user_id',
    order: NEWEST,
    preApplied: [{ op: 'eq', column: 'is_active', value: true }],
    single: false,
  },
  {
    name: 'app_config',
    table: 'app_config',
    select: 'key, value',
    order: [],
    preApplied: [],
    single: false,
  },
  {
    name: 'events',
    table: 'events',
    select:
      'id, event_type, occurred_at, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, ' +
      'severity, notes, created_at, ' +
      `meals(food_item_id, intake_rating, quantity, component_count, food_items(food_type, format, ${FOOD}, brand, product_name)), ` +
      `meal_components(${COMPONENTS}, food_items(food_type, format, ${FOOD}, brand, product_name))`,
    order: ['occurred_at', 'id'],
    preApplied: [PET, { op: 'is', column: 'deleted_at', value: null }],
    single: false,
  },
  {
    name: 'event_ai_analysis',
    table: 'event_ai_analysis',
    select:
      'event_id, status, colour, contents, consistency, blood_present, bile_present, ' +
      'foreign_material_present, foreign_material_note, ' +
      'stool_consistency, stool_colour, stool_blood_present, stool_blood_type, stool_mucus_present, ' +
      'edited_at',
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    name: 'weight_checks',
    table: 'weight_checks',
    select: 'event_id, weight_kg, source, source_basis, events(occurred_at, deleted_at)',
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    name: 'medication_administrations',
    table: 'medication_administrations',
    select:
      'event_id, medication_id, medication_item_id, adherence, dose_amount, paired_event_id, ' +
      `events!${DOSE_EVENT_FK}(occurred_at, deleted_at)`,
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    name: 'medications',
    table: 'medications',
    select:
      'id, medication_item_id, drug_name, dose_amount, route, doses_per_day, schedule_notes, ' +
      'indication, prescribed_by, started_at, target_duration_days, target_duration_doses, ' +
      'status, ended_at, medication_items(is_prescription, strength)',
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    name: 'feeding_arrangements',
    table: 'feeding_arrangements',
    select: `id, food_item_id, method, created_at, ended_at, active_from, active_until, is_shared, food_items(${FOOD}, brand, product_name, format)`,
    order: NEWEST,
    preApplied: [PET, { op: 'is', column: 'deleted_at', value: null }],
    single: false,
  },
  {
    name: 'conditions',
    table: 'conditions',
    select: 'id, condition_name, status, diagnosed_at',
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    // Metadata only. export.sql withholds the real `storage_path` (the run never reads Storage).
    name: 'event_attachments',
    table: 'event_attachments',
    select: 'id, event_id, storage_path, mime_type, sort_order',
    order: NEWEST,
    preApplied: [PET],
    single: false,
  },
  {
    // export.sql returns `notes` as null: neither audience the harness renders prints a look's note.
    name: 'looks',
    table: 'looks',
    select: 'event_id, local_day, outcome, words, notes, vocab_version, created_at, events(occurred_at, deleted_at)',
    order: ['local_day', 'created_at'],
    preApplied: [PET],
    single: false,
  },
  {
    name: 'capture_changes',
    table: 'capture_changes',
    select: 'change_key, first_seen_at, created_at',
    order: [],
    preApplied: [PET],
    single: true,
  },
  {
    // The items behind the pet's own doses. export.sql reads only ids its dose rows name.
    name: 'medication_items',
    table: 'medication_items',
    select: 'id, generic_name, brand_name, strength, default_route, is_prescription, form',
    order: NEWEST,
    preApplied: [],
    single: false,
    conditional: true,
  },
]

/** The dump's own facts, read once in the same statement as every other read. */
export const META_READ = 'meta'

export function readFor(table: string, select: string): ReadSpec | null {
  return READS.find((r) => r.table === table && r.select === select) ?? null
}
