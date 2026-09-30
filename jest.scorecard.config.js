// Jest config for the engine scorecard (Engines v3 PR-16, EN-1, CUL-1131).
//
// Its own config, and its own CI workflow (.github/workflows/engine-scorecard.yml), because the
// scorecard REPORTS and never blocks: the app's `npm test` never runs it (the default testMatch
// only takes `*.test.ts`, and this file is `.run.ts`). It runs under jest rather than Deno for one
// reason: the vet ask a card carries is read from `signalHomeAsk` (lib/signalHomeLine.ts), whose
// import closure reaches expo modules Deno cannot load, and jest-expo can.
//
//   npm run scorecard                          # CI seeds, flag off: print the diff against the committed file
//   SCORECARD_WRITE=1 npm run scorecard        # regenerate supabase/functions/generate-signal/eval/scorecard.json
//   SCORECARD_SEEDS=1000 SCORECARD_OUT=<file> npm run scorecard   # the offline go-live size (ADEMP.md §5)
const base = require('./jest.config.js');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/worktrees/'],
  testMatch: ['<rootDir>/scripts/engine-scorecard/scorecard.run.ts'],
  // The run is one long test (about two minutes at CI seeds; hours at the go-live size).
  testTimeout: 24 * 60 * 60 * 1000,
};
