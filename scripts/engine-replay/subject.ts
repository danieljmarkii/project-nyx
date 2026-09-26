// What the engine replay checks before it trusts an export (CUL-1276).
//
// export.sql names its subject once, in a CTE, and builds ONE json_build_object over it.
// So a mistyped pet id or owner email never returns zero rows: it returns one row whose
// every field is null. The loader turned each null into [], and the incident replay then
// printed "0 live vomit reads · … · shipped-rule mismatches: 0", a clean fidelity pass
// over nothing. EN-0's acceptance runs on that line. Each query now also returns how many
// pets its CTE matched and which one, and nothing is replayed unless both queries matched
// the same single pet.
//
// Plain TypeScript with no `Deno` global, so the app's jest run covers it. The
// `.deno.ts` replays themselves are only type-checked in CI, never run.

export interface RecordSubject {
  subjects?: unknown
  pet_id?: unknown
  pet?: unknown
  tz?: unknown
}

export interface MealsSubject {
  subjects?: unknown
  pet_id?: unknown
}

/** Why the export cannot be replayed, or null when it names exactly one pet. */
export function subjectProblem(record: RecordSubject, meals: MealsSubject): string | null {
  if (record.subjects === undefined || meals.subjects === undefined) {
    return 'the export carries no subject count. Re-run both queries from the current export.sql'
  }
  if (record.subjects !== 1 || meals.subjects !== 1) {
    return `the record query matched ${String(record.subjects)} pets and the meals query ${String(meals.subjects)}, ` +
      'not 1 each. Check the pet id and owner email pair in both CTEs'
  }
  if (record.pet_id !== meals.pet_id) {
    return 'the record and meals exports are for different pets. Run both queries with the same pair'
  }
  if (record.pet == null) return 'the record export has no pet'
  if (typeof record.tz !== 'string' || record.tz === '') {
    return "the record export has no time zone (the owner's user_profiles.timezone is empty)"
  }
  return null
}

/** A replay that replayed nothing must not print a pass. */
export function emptyReplayProblem(what: string, count: number): string | null {
  return count === 0 ? `0 ${what} replayed, so a clean count here proves nothing` : null
}
