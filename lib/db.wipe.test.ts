// The sign-out wipe's FILE half reaches the transient directory (CUL-1045).
//
// clearLocalData's row half is pinned by hydration.test.ts (every table in the real
// schema is wiped). Its file half had no pin: the rls-privacy-reviewer deleted the
// clearTransientFiles() call and every suite stayed green, while that call is the only
// thing that removes the shared vet report, the staged vet-document copies and
// expo-print's temp from a device that changes hands. This runs the REAL clearLocalData
// with the database stubbed and asserts the call.

const mockClearTransientFiles = jest.fn();
jest.mock('./transientFiles', () => ({
  clearTransientFiles: () => mockClearTransientFiles(),
}));
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    runAsync: async () => ({ changes: 0 }),
    execAsync: async () => undefined,
  }),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    get exists() { return false; }
    delete() {}
  },
}));

import { clearLocalData } from './db';

it('every wipe clears the transient files: the shared report, staged documents, print temps', async () => {
  await clearLocalData();
  expect(mockClearTransientFiles).toHaveBeenCalledTimes(1);
});
