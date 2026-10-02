// The burden card's chance-rate report runs, over every null scenario, and is not vacuous
// (Engines v3 PR-14d, CUL-1410). Run with:
//   deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/
//
// REPORTED, NEVER GATING: no assertion here is a pass line on the rate. PR-16's scorecard owns
// pass lines and E-4's number is not ruled. The thousand-seed numbers are in the PR and the
// session record, from `deno run --allow-read …/burdenChance.ts 1000`; this runs the scenarios'
// own CI seeds so the measurement cannot silently rot (a renamed field, a detector that stops
// reading its input) between those runs.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { BURDEN_VARIANTS, formatReport, measureScenario } from './burdenChance.ts'
import { NULL_SCENARIOS } from './scenarios.null.ts'
import { scenarioById } from './index.ts'

Deno.test('the burden chance report covers every null scenario and prints a row for each', () => {
  const rows = NULL_SCENARIOS.map((s) => measureScenario(s, s.ciSeeds))
  assertEquals(rows.map((r) => r.scenario), NULL_SCENARIOS.map((s) => s.id))
  for (const r of rows) {
    assert(r.pets >= 1 && r.petEvenings >= 150 * r.pets, `${r.scenario}: the horizon was walked`)
    for (let i = 0; i < BURDEN_VARIANTS.length; i++) assert(r.petsWithCard[i] <= r.pets)
  }
  const report = formatReport(rows, NULL_SCENARIOS[0].ciSeeds.length)
  for (const s of NULL_SCENARIOS) assert(report.includes(`| ${s.id} |`), s.id)
  console.log(report)
})

Deno.test('non-vacuity: the measurement sees the card where the truth puts one (a tenfold enteropathy onset)', () => {
  // Ten vomits a month from day 90: about 2.3 a week, with weeks of 4 and runs of 3 by chance of
  // a real rise. If this reads zero, the harness is not reading the rows the card reads.
  const sc = scenarioById('inj-enteropathy-onset')
  const row = measureScenario(sc, sc.ciSeeds)
  assert(row.petsWithCard[0] >= 1, 'the shipped card never showed on an enteropathy pet')
  // And every variant's arms nest: the shipped card fires whenever either arm alone does.
  assert(row.petsWithCard[0] >= row.petsWithCard[1] && row.petsWithCard[0] >= row.petsWithCard[2])
  // The run-of-2 alternative can only fire more.
  assert(row.petsWithCard[3] >= row.petsWithCard[0])
})
