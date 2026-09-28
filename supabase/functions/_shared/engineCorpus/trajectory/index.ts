// The trajectory corpus: the committed synthetic pets (Engines v3 PR-15, CUL-508).
//
// `TRAJECTORY_CORPUS` is every scenario; `simulate(scenario, seed, observer)` makes a pet from
// one. PR-16's CI job runs each scenario's `ciSeeds`; its offline go-live check runs ≥1,000
// seeds per scenario, flag off against flag on over the same seeds (the streams in rng.ts make
// that a paired comparison). Never tuned on the dogfood record or the demo pets.

import { INJECTED_SCENARIOS } from './scenarios.injected.ts'
import { NULL_SCENARIOS } from './scenarios.null.ts'
import { OWNER_SCENARIOS } from './scenarios.owner.ts'
import { WEIGHT_SCENARIOS } from './scenarios.weight.ts'
import type { CoverageTag, RateSpec, ScenarioSpec } from './spec.ts'
import type { Sign } from './types.ts'

export { NULL_OBSERVER, simulate } from './simulate.ts'
export type * from './spec.ts'
export type * from './types.ts'

export const TRAJECTORY_CORPUS: ScenarioSpec[] = [...NULL_SCENARIOS, ...INJECTED_SCENARIOS, ...WEIGHT_SCENARIOS, ...OWNER_SCENARIOS]

/**
 * The PR-15 row's list, as an assertion (corpus.test.ts): every tag must be carried by a
 * scenario, and each tag's scenario must show it in its generated rows, not only in its label.
 */
export const REQUIRED_COVERAGE: readonly CoverageTag[] = [
  'staple_feeder',
  'rotating_feeder',
  'grazer',
  'vomit_1_per_month',
  'vomit_3_per_month',
  'overdispersed',
  'wandering_rate',
  'logging_attrition',
  'found_piles',
  'two_cat_home',
  'dog',
  'species_other',
  'dietary_indiscretion',
  'trial_at_peak',
  'event_dependent_feeding',
  'enteropathy_onset',
  'protein_reaction',
  'postprandial',
  'early_morning',
  'rate_doubling',
  'red_flag',
  'weight_loss',
  'trial_responder',
  'trial_non_responder',
  'cough_and_vomit',
  'kennel_cough_gag',
  'sparse_weigh_ins',
  'clinic_only_weights',
  'legacy_weight_no_source',
  'answers_vet_knows',
  'visit_carries_concern',
  'visit_without_concern',
  'recheck_date',
  'symptom_only_lapse',
  'doubling_behind_lapse',
]

export function scenarioById(id: string): ScenarioSpec {
  const s = TRAJECTORY_CORPUS.find((x) => x.id === id)
  if (!s) throw new Error(`no scenario ${id}`)
  return s
}

/**
 * A sweep variant: the same scenario with one sign's background rate replaced, for the grid
 * the evidence pack asks for (report across rates, never at one assumed rate). The id names
 * the variant so its seeds never collide with the committed scenario's.
 */
export function withRate(scenario: ScenarioSpec, sign: Sign, rate: RateSpec): ScenarioSpec {
  const tag = `${rate.perMonth}pm${rate.weeklyDispersion ? `-k${rate.weeklyDispersion}` : ''}${rate.wander ? `-w${rate.wander.sd}` : ''}`
  return {
    ...scenario,
    id: `${scenario.id}~${sign}-${tag}`,
    pets: scenario.pets.map((p) => ({ ...p, signs: p.signs.map((s) => (s.sign === sign ? { ...s, rate } : s)) })),
  }
}
