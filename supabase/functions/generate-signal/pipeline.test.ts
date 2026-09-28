// The Signal pipeline stays pure (Engines v3 PR-11b, CUL-1267).
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/pipeline.test.ts
//
// ./pipeline.ts is what the EN-1 harness and the guard corpus run the Signal through, with no
// database and no network. That only holds while the file does no I/O and reads no clock:
// a `Date.now()` inside it would make two runs over the same rows disagree, and a remote
// import would make the harness need the network. So the source is scanned, and its whole
// local import closure is walked for a remote specifier. Behaviour lives in
// _shared/engineCorpus/signalPipeline.test.ts.
//
// Proven by mutation when written (C-18): planting each forbidden shape in pipeline.ts reds
// the first test; importing a URL from a module pipeline.ts reaches reds the second.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { blankComments } from '../_shared/sourceScan.testutil.ts'

const PIPELINE = new URL('./pipeline.ts', import.meta.url)

// Each shape and why it is out. A clock read with an argument (`new Date(nowMs)`) is a
// conversion, not a read, and stays allowed.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['a clock read (Date.now)', /\bDate\.now\s*\(/],
  ['a clock read (new Date with no argument)', /\bnew\s+Date\s*\(\s*\)/],
  ['a random draw', /\bMath\.random\s*\(/],
  ['the Deno runtime (env, files, network)', /\bDeno\./],
  ['a network call', /\bfetch\w*\s*\(/],
  ['a database client', /\bcreateClient\b|\bSupabaseClient\b|\.rpc\s*\(/],
  ['logging (the shell logs; the pipeline returns)', /\bconsole\./],
  ['an await (the pipeline is synchronous)', /\bawait\b|\basync\b/],
  ['a dynamic import', /\bimport\s*\(/],
]

Deno.test('pipeline.ts reads no clock, env, network or database, and does not log', async () => {
  const src = blankComments(await Deno.readTextFile(PIPELINE))
  const hits: string[] = []
  src.split('\n').forEach((line, i) => {
    for (const [what, re] of FORBIDDEN) if (re.test(line)) hits.push(`line ${i + 1}: ${what}`)
  })
  assertEquals(hits, [])
})

// Every static specifier in a file (`from '…'`, `import '…'`, `export … from '…'`).
function specifiers(src: string): string[] {
  return [...src.matchAll(/(?:\bfrom|^\s*import)\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
}

// Blind spot, stated: CI grants reads under supabase/functions only (ci.yml `--allow-read`),
// so the walk stops at the repo's `lib/` and lists what it did not open. Those modules are
// shared with the React Native app, whose bundler cannot resolve a URL import, so a remote
// import there breaks the app's own build (and `tsc`) before it could reach this closure.
Deno.test('nothing pipeline.ts imports, however deep, is fetched from the network', async () => {
  const functionsRoot = new URL('../', import.meta.url)
  const repoRoot = new URL('../../../', import.meta.url)
  const seen = new Set<string>()
  const unscanned = new Set<string>()
  const remote: string[] = []
  const queue: URL[] = [PIPELINE]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file.href)) continue
    if (!file.href.startsWith(functionsRoot.href)) {
      unscanned.add(file.href.replace(repoRoot.href, ''))
      continue
    }
    seen.add(file.href)
    const src = blankComments(await Deno.readTextFile(file))
    for (const spec of specifiers(src)) {
      if (/^[a-z]+:/i.test(spec)) {
        remote.push(`${file.href.replace(repoRoot.href, '')} imports ${spec}`)
        continue
      }
      if (spec.startsWith('.')) queue.push(new URL(spec, file))
    }
  }
  // Non-vacuity: the walk reached the engine and the flag module, and found the shared
  // trial predicate at the boundary.
  const reached = [...seen].map((h) => h.replace(repoRoot.href, ''))
  for (const must of ['supabase/functions/generate-signal/detection.ts', 'supabase/functions/_shared/engineFlags.ts']) {
    assertStrictEquals(reached.includes(must), true, `the walk never reached ${must}`)
  }
  assertStrictEquals(unscanned.has('lib/dietTrial.ts'), true, 'the walk never reached lib/dietTrial.ts')
  for (const outside of unscanned) assertStrictEquals(outside.startsWith('lib/'), true, `${outside} is outside lib/`)
  assertEquals(remote, [])
})
