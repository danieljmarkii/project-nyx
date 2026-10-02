// The pin's digest (Engines v3 PR-15, CUL-508; D-1): what "the committed synthetic pets" are.
//
// The corpus is committed as generator code, hand-set scenarios and CI seeds, not as JSON. So
// the pets are pinned by digest instead: a SHA-256 over each scenario's CI-seed simulations
// under the null observer, record and truth ledger both. Any change to a generator, a
// scenario or a helper that moves a single row changes a digest and reds pin.test.ts; the
// reviewer then sees which scenarios moved and re-pins deliberately (the exportPin.test.ts
// pattern). A pin moving is not a failure of the change; an unexplained one is.
//
// To re-pin: deno run --allow-read supabase/functions/_shared/engineCorpus/trajectory/pin.ts
// prints the table pins.ts holds; paste it, and say in the PR which scenarios moved and why.

import { TRAJECTORY_CORPUS } from './index.ts'
import { NULL_OBSERVER, simulate } from './simulate.ts'
import type { ScenarioSpec } from './spec.ts'

export async function scenarioDigest(scenario: ScenarioSpec): Promise<string> {
  const body = JSON.stringify(scenario.ciSeeds.map((seed) => simulate(scenario, seed, NULL_OBSERVER)))
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

if (import.meta.main) {
  console.log('export const PINS: Record<string, string> = {')
  for (const sc of TRAJECTORY_CORPUS) console.log(`  '${sc.id}': '${await scenarioDigest(sc)}',`)
  console.log('}')
}
