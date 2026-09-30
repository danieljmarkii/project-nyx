// The engine scorecard's two proofs that need Home's real ask (Engines v3 PR-16, EN-1, CUL-1131).
// These run in the app's `npm test`, so they block: they test the INSTRUMENT, never the engine's
// numbers (the numbers are reported by scorecard.run.ts and never gate).
//
//   1. Every ask `signalHomeAsk` can return has a register in the observer's table, so no card's
//      ask is ever filed under 'none' (the table throws on a string it lacks, and this walks them).
//   2. A mutation that loosens a floor visibly moves its row (the issue's acceptance): the
//      chronicity floor's minimum episode count, lowered, raises the null pets' chronicity row.

import { signalHomeAsk, signalHomeLine } from '../../lib/signalHomeLine';
import type { SignalFinding } from '../../lib/signal';
import { DEFAULT_CONFIG } from '../../supabase/functions/generate-signal/detection';
import { scenarioById } from '../../supabase/functions/_shared/engineCorpus/trajectory/index';
import { ASK_REGISTER, makeSignalObserver, registerOfAsk } from '../../supabase/functions/generate-signal/eval/observer';
import { runCorpus } from '../../supabase/functions/generate-signal/eval/run';

const TYPES = [
  'food_symptom_correlation', 'intake_decline', 'reflection', 'symptom_worsening', 'symptom_burden',
  'symptom_chronicity', 'postprandial_timing', 'timeofday_clustering', 'incident_red_flag',
  'empty_stomach_timing', 'timing_story', 'trial_response', 'gap_shortening', 'stood_down',
];
const TIERS = [undefined, 'early', 'established', 'firm', 'standard', 'soft', 'today', 'soon'];

test("every ask Home can show has a register, and the table holds no ask Home never shows", () => {
  const asks = new Set<string>();
  for (const type of TYPES) {
    for (const tier of TIERS) {
      const ask = signalHomeAsk({ type, tier, priorityClass: 'safety' } as unknown as SignalFinding);
      if (ask !== null) asks.add(ask);
    }
  }
  expect(asks.size).toBeGreaterThanOrEqual(4);
  for (const ask of asks) expect(() => registerOfAsk(ask)).not.toThrow();
  expect(new Set(Object.keys(ASK_REGISTER))).toEqual(asks);
});

test('a loosened floor visibly moves its row: chronicity at 2 episodes instead of 6', () => {
  const sc = scenarioById('null-staple-3pm-bursty');
  const run = () =>
    runCorpus({
      observer: () => makeSignalObserver({ askOf: (f) => signalHomeLine(f as unknown as SignalFinding)?.ask ?? null }),
      arm: 'flag_off',
      seeds: (s) => s.ciSeeds.slice(0, 1),
      seedsLabel: 'first',
      scenarios: [sc],
    }).scorecard.rows;
  const row = `${sc.id}/laneEveningsPerPetMonth/chronic`;
  const shipped = run();
  const floor = DEFAULT_CONFIG.chronicity.minEpisodes;
  DEFAULT_CONFIG.chronicity.minEpisodes = 2;
  let loosened: Record<string, number | null>;
  try {
    loosened = run();
  } finally {
    DEFAULT_CONFIG.chronicity.minEpisodes = floor;
  }
  expect(shipped[row]).not.toBeNull();
  expect(loosened[row] as number).toBeGreaterThan(shipped[row] as number);
  // And the floor is restored: a third run reproduces the first.
  expect(run()).toEqual(shipped);
});
