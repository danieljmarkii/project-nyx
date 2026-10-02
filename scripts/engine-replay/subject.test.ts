// CUL-1276 — the replay refuses an export that names no pet, or not the same one twice.
// CUL-1314 — and a pet that is not an evaluation subject (PMD-12). That export.sql itself
// matches only the listed pets is exportPin.test.ts.
import { EVALUATION_SUBJECTS } from './evaluationSubjects'
import { emptyReplayProblem, subjectProblem } from './subject'

// Fixture ids come from the shipped list (C-34), so the happy path is a pet the replay
// may really read, and the refusals below are about the rule under test and nothing else.
const LISTED = EVALUATION_SUBJECTS[0].petId
const OTHER_LISTED = EVALUATION_SUBJECTS[1].petId
// Shaped like a real pet id (a uuid), so the refusal is about the list, not the format.
const UNLISTED = '00000000-0000-4000-8000-000000000001'

const PET = { name: 'Nyx', species: 'cat' }
const good = {
  record: { subjects: 1, pet_id: LISTED, pet: PET, tz: 'America/Chicago' },
  meals: { subjects: 1, pet_id: LISTED },
}

describe('subjectProblem', () => {
  it('accepts an export that matched one pet in both queries', () => {
    expect(subjectProblem(good.record, good.meals)).toBeNull()
  })

  it('refuses the all-null row a wrong id or owner email returns', () => {
    // What export.sql actually sends back for a typo: one row, every field null, and
    // (since CUL-1276) a count of zero.
    const record = { subjects: 0, pet_id: null, pet: null, tz: null }
    const meals = { subjects: 0, pet_id: null }
    expect(subjectProblem(record, meals)).toMatch(/matched 0 pets and the meals query 0, not 1 each/)
  })

  it('refuses when only one of the two queries was mistyped', () => {
    expect(subjectProblem(good.record, { subjects: 0, pet_id: null })).toMatch(/meals query 0/)
    expect(subjectProblem({ ...good.record, subjects: 0 }, good.meals)).toMatch(/record query matched 0/)
  })

  it('refuses an export from before the count existed', () => {
    expect(subjectProblem({ pet: PET, tz: 'UTC' }, {})).toMatch(/no subject count/)
  })

  it('refuses a record and meals export for two different pets', () => {
    expect(subjectProblem(good.record, { subjects: 1, pet_id: OTHER_LISTED })).toMatch(/different pets/)
  })

  it('refuses a matched pet with no pet row or no time zone', () => {
    expect(subjectProblem({ ...good.record, pet: null }, good.meals)).toMatch(/no pet/)
    expect(subjectProblem({ ...good.record, tz: null }, good.meals)).toMatch(/no time zone/)
    expect(subjectProblem({ ...good.record, tz: '' }, good.meals)).toMatch(/no time zone/)
  })
})

describe('subjectProblem: whose pet (CUL-1314, PMD-12)', () => {
  it('refuses a single, consistent export of a pet that is not on the list', () => {
    // The export GAP-25 is about: one pet, the same in both queries, a time zone, every
    // earlier check passes. Only the owner is wrong.
    const record = { ...good.record, pet_id: UNLISTED }
    const meals = { ...good.meals, pet_id: UNLISTED }
    const problem = subjectProblem(record, meals)
    expect(problem).toMatch(new RegExp(`^pet ${UNLISTED} is not an evaluation subject`))
    expect(problem).toMatch(/PMD-12/)
    expect(problem).toMatch(/evaluationSubjects\.ts/)
  })

  it('accepts every pet on the list', () => {
    expect(EVALUATION_SUBJECTS.length).toBeGreaterThan(0)
    for (const { petId } of EVALUATION_SUBJECTS) {
      expect(subjectProblem({ ...good.record, pet_id: petId }, { ...good.meals, pet_id: petId })).toBeNull()
    }
  })

  it('names the list, as well as the pair, when a CTE matched nothing', () => {
    // An unlisted pet comes back from export.sql as `subjects: 0`, so the zero-match message
    // has to mention the list as well as the pair.
    expect(subjectProblem({ ...good.record, subjects: 0 }, { ...good.meals, subjects: 0 }))
      .toMatch(/owner email pair in both CTEs, and that the pet is in evaluationSubjects\.ts/)
  })
})

describe('emptyReplayProblem', () => {
  it('refuses a replay over nothing and passes one over something', () => {
    expect(emptyReplayProblem('live vomit reads', 0)).toMatch(/^0 live vomit reads replayed/)
    expect(emptyReplayProblem('live vomit reads', 45)).toBeNull()
  })
})
