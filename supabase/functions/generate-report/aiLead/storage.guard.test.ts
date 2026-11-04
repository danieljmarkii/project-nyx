// Where the AI lead may live, and who may reach the pipeline (CUL-2305; CUL-2331 promise 1; spec
// §9.2). Discovered from the repository, never from a list:
//   · the lead's three columns are written by one file, run.ts, through one `.update(` on
//     vet_reports, so a lead lives on the draft row and nowhere else;
//   · nothing under aiLead/ holds a lead past the request (no KV, no cache API, no Storage, no
//     module-level collection), so no hash-keyed cache outlives the report or the reaper;
//   · the pipeline is reachable only through run.ts, and run.ts only from index.ts's ai_lead
//     branch, so the render and Send paths never import it and can never wait on it.
// The database half (the row cascades with its pet and account) is guards/aiLeadStorage.test.ts.
import assert from 'node:assert/strict'
import { blankComments, sourceFiles } from '../../_shared/sourceScan.testutil.ts'

const ROOT = new URL('../../', import.meta.url) // supabase/functions/

async function scan(): Promise<Array<{ rel: string; src: string }>> {
  const out: Array<{ rel: string; src: string }> = []
  for await (const url of sourceFiles(ROOT)) {
    const rel = url.pathname.slice(ROOT.pathname.length)
    if (rel.endsWith('.test.ts') || rel.endsWith('.testutil.ts')) continue
    out.push({ rel, src: blankComments(await Deno.readTextFile(url)) })
  }
  return out
}

Deno.test('the lead columns are written in one place: run.ts, one update on vet_reports', async () => {
  const files = await scan()
  const naming = files.filter((f) => /ai_lead_(?:text|verdict|model)/.test(f.src)).map((f) => f.rel)
  assert.deepEqual(naming, ['generate-report/aiLead/run.ts'])
  const run = files.find((f) => f.rel === 'generate-report/aiLead/run.ts')!.src
  assert.equal(run.split('.update(').length - 1, 1)
  assert.match(run, /\.from\('vet_reports'\)\s*\.update\(\{ ai_lead_text: text, ai_lead_verdict: verdict, ai_lead_model: model \}\)/)
  // The write names the row by id, pet, maker and status (C-27), never by id alone.
  const write = run.slice(run.indexOf('.update('))
  assert.match(write.slice(0, 300), /\.eq\('id', key\.reportId\)\.eq\('pet_id', key\.petId\)\.eq\('generated_by', key\.uid\)\.eq\('status', 'draft'\)/)
})

Deno.test('the keep settles the lead in its own one write, with only what run.ts built (CUL-2436)', async () => {
  // The settle used to be a second UPDATE before the keep's, and a lead written between the two
  // froze onto a copy that never printed it. Now run.ts builds the columns (`KeepLead`) and the
  // keep's single UPDATE carries them: savedCopy.ts spreads `lead.set` into that update, pins each
  // `lead.unchanged` column in its WHERE, and names no lead column itself (the test above).
  const files = await scan()
  const saved = files.find((f) => f.rel === 'generate-report/savedCopy.ts')!.src
  const mark = saved.slice(saved.indexOf('markKept: async'), saved.indexOf('restamp: async'))
  assert.equal(mark.split('.update(').length - 1, 1, 'the keep is one UPDATE')
  assert.match(mark, /\.update\(\{ \.\.\.lead\.set, status: 'kept', shared_via: via, shared_at: atIso, content_sha256: sha \}\)/)
  assert.match(mark, /for \(const \[column, value\] of Object\.entries\(lead\.unchanged\)\) q = q\.eq\(column, value\)/)
  assert.ok(mark.indexOf('lead.unchanged') < mark.indexOf(".select('id')"), 'the pins are in the WHERE of that same statement')
  // run.ts's settle reads and never writes: the one lead `.update(` stays writeDraft's.
  const run = files.find((f) => f.rel === 'generate-report/aiLead/run.ts')!.src
  const settle = run.slice(run.indexOf('export async function settleLeadForKeep'), run.indexOf('const UUID ='))
  assert.ok(!/writeDraft|\.update\(/.test(settle), 'the settle is not a write')
  // And the keep's caller hands it run.ts's settle, nothing else.
  const index = files.find((f) => f.rel === 'generate-report/index.ts')!.src
  assert.match(index, /keepCopy\(savedCopyIO\(adminClient, \{ petId, uid: user\.id \}\), req, \(html\) => settleLeadForKeep\(leadIO, html\)\)/)
})

Deno.test('nothing under aiLead/ keeps a lead past the request', async () => {
  for (const f of (await scan()).filter((x) => x.rel.startsWith('generate-report/aiLead/'))) {
    for (const banned of [/Deno\.openKv/, /\bcaches\./, /\.storage\s*\.from\(/, /globalThis/, /localStorage/, /\.upsert\(/, /\.insert\(/]) {
      assert.ok(!banned.test(f.src), `${f.rel} uses ${banned}`)
    }
    const topLevel = f.src.split('\n').filter((l) => /^(?:export )?(?:const|let|var) \w+(?:: [^=]+)? = new (?:Map|WeakMap)\b/.test(l))
    assert.deepEqual(topLevel, [], `${f.rel} holds a module-level collection`)
    assert.ok(!/^(?:export )?let /m.test(f.src), `${f.rel} holds module-level mutable state`)
  }
})

Deno.test('the pipeline is reachable only through run.ts, and run.ts only from index.ts', async () => {
  const files = await scan()
  const importers = (target: RegExp) => files.filter((f) => f.rel.startsWith('generate-report/') && target.test(f.src)).map((f) => f.rel).sort()
  assert.deepEqual(importers(/from '\.\/leadPipeline\.ts'/), ['generate-report/aiLead/run.ts'])
  // A VALUE import of run.ts is index.ts's alone. savedCopy.ts may import only the TYPE of what the
  // keep writes (`KeepLead`, CUL-2436), which carries no code and so reaches no pipeline.
  assert.deepEqual(importers(/^import (?!type )[^\n]*from '\.\/aiLead\/run\.ts'/m), ['generate-report/index.ts'])
  assert.deepEqual(importers(/from '\.\/aiLead\/run\.ts'/), ['generate-report/index.ts', 'generate-report/savedCopy.ts'])
  const saved = files.find((f) => f.rel === 'generate-report/savedCopy.ts')!.src
  assert.deepEqual(saved.match(/^import .*from '\.\/aiLead\/run\.ts'.*$/gm), ["import type { KeepLead } from './aiLead/run.ts'"])
  assert.deepEqual(importers(/from '\.\/model\.ts'/), ['generate-report/aiLead/leadPipeline.ts', 'generate-report/aiLead/run.ts'])
  // The renderer may know the lead's shape, never its pipeline.
  const render = files.find((f) => f.rel === 'generate-report/renderPrintV2.ts')!.src
  assert.match(render, /import type \{ LeadSentence \} from '\.\/aiLead\/verify\.ts'/)
  assert.ok(!/aiLead\/(?:leadPipeline|run|model)\.ts/.test(render))
})

Deno.test('the report path never runs the lead: only the ai_lead branch calls it', async () => {
  const index = (await scan()).find((f) => f.rel === 'generate-report/index.ts')!.src
  assert.equal(index.split('runAiLeadForDraft(').length - 1, 1)
  assert.equal(index.split('aiLeadForPet(').length - 1, 2, 'one definition, one call')
  const call = index.indexOf('await aiLeadForPet(')
  assert.ok(index.lastIndexOf('if (aiLead !== null) {', call) > index.lastIndexOf('const handler = async', call))
  assert.ok(call < index.indexOf('await generateReportForPet('), 'the lead branch returns before the report is built')
})
