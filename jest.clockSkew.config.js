// The jest suite with the wall clock moved forward (CUL-832): the time-axis sibling of
// CI's non-UTC timezone leg. Run it as
//   CLOCK_SKEW_DAYS=180 npx jest --config jest.clockSkew.config.js
// jest merges a preset's setupFiles with these, so jest-expo's own setup still runs.
const base = require('./jest.config');

module.exports = {
  ...base,
  setupFiles: ['<rootDir>/jest.clockSkew.js'],
};
