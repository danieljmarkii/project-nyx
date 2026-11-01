// Uses Deno's built-in test runner + node:assert (bundled — no remote imports), matching the
// neighbouring generate-report tests. Parity with the python bake-off verifier: every exhibit's
// report must equal what docs/vet-report-v3-discovery/bakeoff/verify.py printed for it
// (exhibits/expected.json; regenerate per exhibits/README.md).
import assert from 'node:assert/strict'
import { type FactTable, type Summary, verifyBakeoff } from './verifyCore.ts'

const EXHIBITS = new URL('./exhibits/', import.meta.url)

async function readJson(rel: string): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(new URL(rel, EXHIBITS)))
}

// Same pairing rule the generator uses: a pet's summaries run against that pet's fact table.
function factsFor(summaryPath: string): string {
  if (summaryPath === 'examples/prompt-example-output.json') return 'examples/prompt-example-facts.json'
  const m = /^(?:out|examples)\/(?:[A-Z]\d?-)?(cooper|mira|nyx)-/.exec(summaryPath)
  if (!m) throw new Error(`no fact table for exhibit ${summaryPath}`)
  return `facts-${m[1]}.json`
}

const expected = (await readJson('expected.json')) as Record<string, unknown>

async function countJson(dir: URL): Promise<number> {
  let n = 0
  for await (const e of Deno.readDir(dir)) {
    if (e.isDirectory) n += await countJson(new URL(`${e.name}/`, dir))
    else if (e.name.endsWith('.json') && e.name !== 'expected.json') n++
  }
  return n
}

Deno.test('verifyCore: the exhibit folder is populated (an empty folder cannot pass)', async () => {
  assert.ok((await countJson(EXHIBITS)) > 40, 'expected more than 40 exhibit JSON files')
  assert.ok(Object.keys(expected).length >= 39, 'expected at least 39 (facts, summary) pairs')
})

for (const [summaryPath, report] of Object.entries(expected)) {
  Deno.test(`verifyCore parity: ${summaryPath}`, async () => {
    const table = (await readJson(factsFor(summaryPath))) as FactTable
    const summary = (await readJson(summaryPath)) as Summary
    assert.deepStrictEqual(verifyBakeoff(table, summary), report)
  })
}
