// The AI lead is kept with its report and deleted with it (CUL-2305; CUL-2331 promise 1; spec
// §11.2). The code half (one writer, onto the draft row, no other store) is
// supabase/functions/generate-report/aiLead/storage.guard.test.ts. This is the database half,
// read from the migrations in order, never from a list:
//   · the lead's columns exist on vet_reports and on no other table, so a lead has one home;
//   · that home's row cascades from its pet and from its maker's auth.users row, which is how
//     account deletion and a pet's deletion remove it (delete-account fires the auth cascade; the
//     draft reaper deletes the row), and no later migration replaces either FK;
//   · the bake-off exhibits the Deno suites read are byte-identical to docs/, so the regression
//     suites test the exhibits the PM's bake-off judged, not drifted copies.
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const sql = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '')

describe('the AI lead has one home, and it leaves with the report', () => {
  it('only vet_reports gains a lead column, and only migration 113 adds one', () => {
    const adders = files.filter((f) => /ADD COLUMN\s+ai_lead_\w+/i.test(sql(f)))
    expect(adders).toEqual(['113_vet_report_saved_copies.sql'])
    const s113 = sql('113_vet_report_saved_copies.sql')
    const alter = s113.slice(s113.lastIndexOf('ALTER TABLE', s113.search(/ADD COLUMN\s+ai_lead_text/i)), s113.search(/ADD COLUMN\s+ai_lead_text/i))
    expect(alter).toMatch(/ALTER TABLE public\.vet_reports/)
    for (const c of ['ai_lead_text', 'ai_lead_verdict', 'ai_lead_model']) expect(s113).toMatch(new RegExp(`ADD COLUMN\\s+${c}\\b`))
    // No other table, view or function takes a copy of the lead.
    for (const f of files) {
      for (const m of sql(f).matchAll(/CREATE (?:TABLE|MATERIALIZED VIEW|VIEW)[^;]*?ai_lead/gis)) throw new Error(`${f}: ${m[0].slice(0, 80)}`)
    }
  })

  it('vet_reports cascades from its pet and its maker, and no later migration replaces either key', () => {
    const create = sql('001_schema.sql').match(/CREATE TABLE vet_reports \(([\s\S]*?)\);/)
    expect(create).not.toBeNull()
    const body = (create as RegExpMatchArray)[1]
    expect(body).toMatch(/pet_id\s+UUID NOT NULL REFERENCES pets\(id\) ON DELETE CASCADE/)
    expect(body).toMatch(/generated_by\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
    for (const f of files.filter((x) => x > '001')) {
      const s = sql(f)
      const touches = /ALTER TABLE\s+(?:public\.)?vet_reports[\s\S]*?(?:DROP CONSTRAINT\s+\w*(?:pet_id|generated_by)\w*_fkey|ALTER COLUMN\s+(?:pet_id|generated_by)\s+DROP NOT NULL)/i.test(s)
      expect(`${f}: ${touches}`).toBe(`${f}: false`)
    }
  })
})

describe('the regression suites read the bake-off exhibits as judged', () => {
  const SRC = join(ROOT, 'docs', 'vet-report-v3-discovery', 'bakeoff')
  const DST = join(ROOT, 'supabase', 'functions', 'generate-report', 'aiLead', 'exhibits')
  const pairs: Array<[string, string]> = [
    ...['facts-cooper.json', 'facts-mira.json', 'facts-nyx.json'].map((f): [string, string] => [f, f]),
    ...readdirSync(join(SRC, 'examples')).map((f): [string, string] => [`examples/${f}`, `examples/${f}`]),
    ...readdirSync(join(SRC, 'out')).filter((f) => !f.endsWith('-result.json')).map((f): [string, string] => [`out/${f}`, `out/${f}`]),
    ['checker-results.json', 'checker/checker-results.json'],
    ['blind-key.json', 'checker/blind-key.json'],
  ]

  it('covers every exhibit, and each copy is byte-identical to docs/', () => {
    expect(pairs.length).toBeGreaterThan(40)
    for (const [from, to] of pairs) expect(`${to}: ${readFileSync(join(DST, to)).equals(readFileSync(join(SRC, from)))}`).toBe(`${to}: true`)
  })
})
