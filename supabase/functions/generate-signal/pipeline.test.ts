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
// Blind spots, stated (C-38): the scan reads pipeline.ts alone, by pattern. It does not see
// `performance.now`, `crypto.*`, timers or a `globalThis` lookup, nor a clock read inside a
// module the pipeline imports (the closure walk below checks only for remote specifiers).
// The behavioural net for those is signalPipeline.test.ts (e): two runs over one input agree.
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

// A key the pipeline gates on must be one the stand-down gate compares (SIGNAL_ENGINE_KEYS),
// or a flip of it mints "no vomiting logged" when the ENGINE changed, not the pet
// (adversarial review, PR-11b). The one exception is a DECORATING key (SIGNAL_DECORATING_KEYS,
// PR-22): it adds a field to findings already made and changes none of them, which the corpus
// guard proves per key, so it cannot make a finding vanish. So the pipeline reads flags only
// through isEngineKeyOn with a literal key, and every such key is registered in one of the two.
// Scoped to pipeline.ts: detection and the other modules take no flags today, and a new flag
// parameter there must arrive through here.
Deno.test('every Engines key the pipeline gates on is a registered Signal key', async () => {
  const { SIGNAL_ENGINE_KEYS, SIGNAL_DECORATING_KEYS } = await import('../_shared/engineFlags.ts')
  const registered: readonly string[] = [...SIGNAL_ENGINE_KEYS, ...SIGNAL_DECORATING_KEYS]
  const src = blankComments(await Deno.readTextFile(PIPELINE))
  const gated = [...src.matchAll(/\bisEngineKeyOn\s*\(\s*[^,]+,\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2])
  const unregistered = gated.filter((k) => !registered.includes(k))
  assertEquals(unregistered, [], 'gate on a key only after adding it to SIGNAL_ENGINE_KEYS (or, for a decorating key, SIGNAL_DECORATING_KEYS)')
  // Non-vacuity: the scan finds the gate that exists today.
  assertStrictEquals(gated.includes('engines_v3_en10'), true, 'the scan no longer finds EN-10\'s gate')
  // Any other read of the flags (engineFlags.on, a non-literal key) escapes the check above.
  const lines = src.split('\n')
  const stray = lines
    .map((line, i) => [line, i + 1] as const)
    .filter(([line]) => /\.on\b/.test(line) || /\bisEngineKeyOn\s*\(\s*[^,]+,\s*[^'"\s]/.test(line))
    .map(([, n]) => `line ${n}`)
  assertEquals(stray, [], 'read the Engines flags only through isEngineKeyOn with a literal key')
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

// EN-11 (PR-32, adversarial pass D4): the summary hears a sign rising below the card floor from
// the run's own config, so a finished-meal rate never fills the space a withheld card left.
Deno.test('the summary is told when a sign rises below the EN-11 card floor, over the run\'s config', async () => {
  const src = blankComments(await Deno.readTextFile(PIPELINE))
  assertStrictEquals(/risingBelowCardFloor:\s*risingBelowCardFloor\(input,\s*config\)/.test(src), true, 'the summary no longer hears the withheld rise')
})
