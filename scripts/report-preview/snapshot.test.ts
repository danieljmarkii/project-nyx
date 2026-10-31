// CUL-2308 — the loader refuses every export it cannot vouch for.
import { mkdtempSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { FIXTURE_OWNER, FIXTURE_PET, fixtureExport, fixtureRows } from './fixture'
import { EVALUATION_SUBJECTS } from '../engine-replay/evaluationSubjects'
import { assertOutsideRepo, type ExportRow, exportRowsFrom, loadExport, md5, verifyExport } from './snapshot'

const SUBJECTS = [FIXTURE_PET]
const REPO = join(__dirname, '..', '..')

function withRow(read: string, edit: (r: ExportRow) => ExportRow): ExportRow[] {
  return fixtureExport().map((r) => (r.read === read ? edit({ ...r }) : r))
}
const reseal = (r: ExportRow): ExportRow => ({ ...r, md5: md5(r.body) })

describe('verifyExport', () => {
  it('accepts the fixture and returns every read', () => {
    const dump = verifyExport(fixtureExport(), SUBJECTS)
    expect(dump.meta.pet_id).toBe(FIXTURE_PET)
    expect(dump.rows.events.length).toBe(62)
  })

  it('refuses a body changed after SQL took its md5 (a transcription slip)', () => {
    const rows = withRow('events', (r) => ({ ...r, body: r.body.replace('Invented', 'Inventd') }))
    expect(() => verifyExport(rows, SUBJECTS)).toThrow(/events: md5 on disk/)
  })

  it('refuses a body cut short, even when its md5 is recomputed, by its SQL row count', () => {
    const rows = withRow('events', (r) => reseal({ ...r, body: JSON.stringify(JSON.parse(r.body).slice(1)) }))
    expect(() => verifyExport(rows, SUBJECTS)).toThrow(/events: 61 rows on disk, 62 counted in SQL/)
  })

  it('refuses a pet that is not an evaluation subject (PMD-12)', () => {
    expect(() => verifyExport(fixtureExport(), EVALUATION_SUBJECTS.map((s) => s.petId))).toThrow(/not an evaluation subject/)
  })

  it('refuses a CTE that matched no pet, so a typo never renders as an empty record', () => {
    const rows = withRow('meta', (r) => reseal({ ...r, body: r.body.replace('"subjects":1', '"subjects":0') }))
    expect(() => verifyExport(rows, SUBJECTS)).toThrow(/matched 0 pets/)
  })

  it('refuses a missing, a duplicated and an unknown read', () => {
    const all = fixtureExport()
    expect(() => verifyExport(all.filter((r) => r.read !== 'looks'), SUBJECTS)).toThrow(/"looks" is missing/)
    expect(() => verifyExport([...all, all[3]], SUBJECTS)).toThrow(/appears twice/)
    const extra = { read: 'storage_objects', n: 0, md5: md5('[]'), body: '[]' }
    expect(() => verifyExport([...all, extra], SUBJECTS)).toThrow(/unknown read "storage_objects"/)
  })

  it('refuses a household or pet row owned by anyone but the subject’s owner', () => {
    const other = fixtureRows()
    other.household = [...other.household, { id: 'x', species: 'dog', user_id: 'someone-else' }]
    expect(() => verifyExport(fixtureExport(other), SUBJECTS)).toThrow(/household: a pet owned by someone else/)
    const stolen = fixtureRows()
    stolen.pet = [{ ...(stolen.pet[0] as object), user_id: 'someone-else' }]
    expect(() => verifyExport(fixtureExport(stolen), SUBJECTS)).toThrow(/pet: the row is not the subject/)
    expect(FIXTURE_OWNER).not.toBe('someone-else')
  })

  it('names every problem, not only the first', () => {
    const rows = withRow('events', (r) => ({ ...r, md5: '0' })).filter((r) => r.read !== 'looks')
    expect(() => verifyExport(rows, SUBJECTS)).toThrow(/events: md5[\s\S]*"looks" is missing/)
  })
})

describe('exportRowsFrom and loadExport', () => {
  it('reads a plain array, the MCP’s { result } file, and the fenced text inside it, from disk', () => {
    const rows = fixtureExport()
    const fenced = `Below is the result.\n<untrusted-data-1>\n${JSON.stringify(rows)}\n</untrusted-data-1>\n`
    const dir = mkdtempSync(join(tmpdir(), 'report-preview-'))
    for (const [name, text] of [
      ['plain.json', JSON.stringify(rows)],
      ['wrapped.json', JSON.stringify({ result: fenced })],
      ['fenced.txt', fenced],
    ]) {
      writeFileSync(join(dir, name), text)
      expect(loadExport(join(dir, name), SUBJECTS).meta.pet_id).toBe(FIXTURE_PET)
    }
    expect(() => exportRowsFrom('nothing here')).toThrow(/no export.sql rows/)
  })
})

describe('assertOutsideRepo', () => {
  it('refuses the repository and anything inside it', () => {
    expect(() => assertOutsideRepo(REPO, REPO)).toThrow(/inside the repository/)
    expect(() => assertOutsideRepo(join(REPO, 'scripts', 'out'), REPO)).toThrow(/inside the repository/)
    expect(() => assertOutsideRepo(join(REPO, 'scripts', '..', 'docs'), REPO)).toThrow(/inside the repository/)
  })
  it('refuses a path that reaches the repository through a symlink (rls-privacy-reviewer, CUL-2308)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-preview-link-'))
    symlinkSync(join(REPO, 'scripts'), join(dir, 'link'))
    expect(() => assertOutsideRepo(join(dir, 'link', 'zz'), REPO)).toThrow(/inside the repository/)
    expect(() => assertOutsideRepo(join(dir, 'link'), REPO)).toThrow(/inside the repository/)
  })
  it('refuses a case variant of the repository path', () => {
    expect(() => assertOutsideRepo(join(REPO.toUpperCase(), 'out'), REPO)).toThrow(/inside the repository/)
  })
  it('allows a scratch directory outside it', () => {
    expect(() => assertOutsideRepo(join(tmpdir(), 'report-preview'), REPO)).not.toThrow()
    expect(() => assertOutsideRepo(join(REPO, '..', 'elsewhere'), REPO)).not.toThrow()
  })
})
