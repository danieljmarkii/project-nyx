// Metro config — extends Expo's defaults (B-023 PR 4 on-device QA fix).
//
// WHY THIS EXISTS: expo-router route-scans the whole `app/` directory via `require.context`
// (see node_modules/expo-router/_ctx.*.js), and its matcher includes ANY `.tsx`/`.ts` file —
// it does NOT exclude `*.test.tsx`. So a co-located screen test (e.g. app/insights/index.test.tsx)
// gets bundled into the APP, pulling `@testing-library/react-native` into the device bundle and
// breaking it with "Unable to resolve module console …". Jest runs those tests fine (it doesn't
// use Metro); they just must never enter the app bundle.
//
// blockList makes Metro treat matching files as non-existent, which also filters them out of
// `require.context` enumeration — so this keeps the project's "co-locate tests as
// ComponentName.test.tsx" convention working even for files that live under `app/`.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude every co-located test/spec file from what Metro will bundle/serve.
const TEST_FILES = /.*\.(test|spec)\.[jt]sx?$/;
const existing = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existing)
  ? [...existing, TEST_FILES]
  : existing
    ? [existing, TEST_FILES]
    : [TEST_FILES];

module.exports = config;
