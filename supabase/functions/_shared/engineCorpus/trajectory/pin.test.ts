// The committed synthetic pets do not move unnoticed (Engines v3 PR-15, CUL-508; D-1).
// Run with: deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { TRAJECTORY_CORPUS } from './index.ts'
import { scenarioDigest } from './pin.ts'
import { PINS } from './pins.ts'

Deno.test('every scenario is pinned, and nothing is pinned that is not a scenario', () => {
  assertEquals(Object.keys(PINS).sort(), TRAJECTORY_CORPUS.map((s) => s.id).sort())
})

Deno.test('each scenario’s CI pets match their pin (re-pin with pin.ts, and say why in the PR)', async () => {
  const moved: string[] = []
  for (const sc of TRAJECTORY_CORPUS) if ((await scenarioDigest(sc)) !== PINS[sc.id]) moved.push(sc.id)
  assertEquals(moved, [], `these scenarios' rows changed: ${moved.join(', ')}`)
})
