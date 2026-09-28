// ONE WRITER of every Engines v3 stamp (Engines v3 PR-11a, CUL-1267).
// Run with: deno test --allow-read=supabase/functions supabase/functions/_shared/
//
// engineStamps.ts is the only file under supabase/functions that may WRITE a stamp column
// migration 075 added, or touch signal_shown_log at all. A second writer is a second
// derivation, and the day two derivations disagree the stamps stop telling reads apart
// (what EN-2 measures, what the rollback clause and PR-12's staleness test decide on).
//
// What counts as a write, after comments are blanked (strings kept, so a table name in a
// `.from('…')` is seen): a stamp column as an object key (`engine_flags: …`), a property
// assignment (`x.engine_flags = …`, `x['engine_flags'] = …`), and any mention of
// signal_shown_log. A READ is not a write: `priorRow.engine_flags` and a select list
// naming the column pass.
//
// BLIND SPOTS, stated so they never read as coverage: a column name built at runtime
// (`'engine' + '_flags'`); a spread of an object built somewhere the scan does not read;
// anything outside supabase/functions (the phone: its writes to event_ai_analysis stamps
// are refused by 075's freeze trigger; its writes to ai_signals are CUL-1378).
//
// Proven by mutation when written: planting `engine_flags: []` in generate-signal/index.ts,
// or `.from('signal_shown_log')` in analyze-vomit/index.ts, reds the live scan.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { blankComments, sourceFiles } from './sourceScan.testutil.ts'

const STAMP_COLUMNS = ['photo_set_key', 'model_id', 'prompt_hash', 'rule_version', 'engine_flags', 'engine_fingerprint']
const THE_WRITER = '_shared/engineStamps.ts'

function stampWrites(raw: string): string[] {
  const src = blankComments(raw)
  const lineOf = (i: number) => src.slice(0, i).split('\n').length
  const out: string[] = []
  const cols = STAMP_COLUMNS.join('|')
  const patterns: [RegExp, string][] = [
    [new RegExp(String.raw`(?<![\w.$])['"]?(${cols})['"]?\s*:(?!:)`, 'g'), 'object key'],
    [new RegExp(String.raw`\.\s*(${cols})\s*=(?!=)`, 'g'), 'property assignment'],
    [new RegExp(String.raw`\[\s*['"\`](${cols})['"\`]\s*\]\s*=(?!=)`, 'g'), 'computed assignment'],
    [/signal_shown_log/g, 'the shown log'],
  ]
  for (const [re, kind] of patterns) {
    for (const m of src.matchAll(re)) out.push(`line ${lineOf(m.index!)}: ${kind} (${m[0].trim()})`)
  }
  return out
}

Deno.test('one writer: no file but engineStamps.ts writes an Engines v3 stamp or touches the shown log', async () => {
  const root = new URL('../', import.meta.url)
  const violations: string[] = []
  let scanned = 0
  for await (const file of sourceFiles(root)) {
    const rel = file.pathname.slice(root.pathname.length)
    scanned++
    if (rel === THE_WRITER) continue
    for (const v of stampWrites(await Deno.readTextFile(file))) violations.push(`${rel} ${v}`)
  }
  assertEquals(violations, [])
  // Non-vacuity: the scan read the tree, not an empty directory.
  assertStrictEquals(scanned > 20, true, `only ${scanned} files scanned`)
})

Deno.test('one writer: the scan finds every stamp column and the log in the writer itself (the detector matches the real shape)', async () => {
  const src = await Deno.readTextFile(new URL('./engineStamps.ts', import.meta.url))
  const found = stampWrites(src).join('\n')
  for (const col of STAMP_COLUMNS) assertStrictEquals(found.includes(col), true, `the detector never saw ${col}`)
  assertStrictEquals(found.includes('signal_shown_log'), true)
})

Deno.test('one writer: the detector sees a write, and passes a read (the guard, proven)', () => {
  const writes = [
    "await c.from('ai_signals').insert({ pet_id: p, engine_flags: [] })",
    'const v = { ...values, "model_id": m }',
    'row.rule_version = "f1.x"',
    "row['prompt_hash'] = h",
    'const stamps = { photo_set_key: k }',
    "await admin.from('signal_shown_log').insert(rows)",
    'const t = `signal_shown_log`',
    'x = { engine_fingerprint:fp }',
  ]
  for (const w of writes) assertStrictEquals(stampWrites(w).length > 0, true, w)
  const reads = [
    "const { data } = await c.from('ai_signals').select('findings, generated_at, engine_flags')",
    'const ok = standDownMintAllowed(priorRow.engine_flags, flags)',
    'if (row.model_id === m) {}',
    '// engine_flags: a comment is not a write',
    '/* signal_shown_log in a block comment */',
    'const t = x ? y : z',
  ]
  for (const r of reads) assertEquals(stampWrites(r), [], r)
})
