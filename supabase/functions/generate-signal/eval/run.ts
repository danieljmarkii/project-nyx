// Runs PR-15's corpus through an observer and scores it (Engines v3 PR-16, EN-1, CUL-1131).
//
// Deterministic by construction: the corpus draws every number from streams named by (seed,
// scenario, pet, component, day) (trajectory/rng.ts), the pipeline reads no clock, and the
// scorecard carries no timestamp. The same seeds give the same file, byte for byte
// (scorecard.test.ts proves it on two scenarios). The observer is made fresh per simulation
// because it carries the previous evening's cache row.

import { TRAJECTORY_CORPUS, simulate } from '../../_shared/engineCorpus/trajectory/index.ts'
import type { Observer, ScenarioSpec } from '../../_shared/engineCorpus/trajectory/index.ts'
import { buildScorecard, HORIZONS, scoreScenario, type ScenarioRun, type ScenarioScore, type Scorecard } from './scorecard.ts'

export interface RunOptions {
  /** A fresh observer per simulation. */
  observer: () => Observer
  /** The arm's name for the file (e.g. 'flag_off'). */
  arm: string
  /** Seeds per scenario: the scenario's committed `ciSeeds` (CI), or a range for the offline check. */
  seeds: (scenario: ScenarioSpec) => readonly number[]
  /** A label for the seeds, written into the file. */
  seedsLabel: string
  scenarios?: readonly ScenarioSpec[]
  /** Called after each scenario, for progress on long runs. */
  onScenario?: (score: ScenarioScore) => void
}

export function runCorpus(opts: RunOptions): { scores: ScenarioScore[]; scorecard: Scorecard } {
  const scenarios = opts.scenarios ?? TRAJECTORY_CORPUS
  const scores: ScenarioScore[] = []
  for (const scenario of scenarios) {
    const runs: ScenarioRun[] = opts.seeds(scenario).map((seed) => ({ scenario, seed, result: simulate(scenario, seed, opts.observer()) }))
    const score = scoreScenario(runs)
    scores.push(score)
    opts.onScenario?.(score)
  }
  const scorecard = buildScorecard(scores, { arm: opts.arm, seeds: opts.seedsLabel, horizons: HORIZONS, scenarios: scenarios.length })
  return { scores, scorecard }
}
