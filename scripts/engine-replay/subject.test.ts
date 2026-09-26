// CUL-1276 — the replay refuses an export that names no pet, or not the same one twice.
import { emptyReplayProblem, subjectProblem } from './subject'

const PET = { name: 'Nyx', species: 'cat' }
const good = {
  record: { subjects: 1, pet_id: 'p1', pet: PET, tz: 'America/Chicago' },
  meals: { subjects: 1, pet_id: 'p1' },
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
    expect(subjectProblem(good.record, { subjects: 1, pet_id: 'p2' })).toMatch(/different pets/)
  })

  it('refuses a matched pet with no pet row or no time zone', () => {
    expect(subjectProblem({ ...good.record, pet: null }, good.meals)).toMatch(/no pet/)
    expect(subjectProblem({ ...good.record, tz: null }, good.meals)).toMatch(/no time zone/)
    expect(subjectProblem({ ...good.record, tz: '' }, good.meals)).toMatch(/no time zone/)
  })
})

describe('emptyReplayProblem', () => {
  it('refuses a replay over nothing and passes one over something', () => {
    expect(emptyReplayProblem('live vomit reads', 0)).toMatch(/^0 live vomit reads replayed/)
    expect(emptyReplayProblem('live vomit reads', 45)).toBeNull()
  })
})
