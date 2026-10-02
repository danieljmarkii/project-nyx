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
const mockExec = jest.fn(async (_sql: string) => undefined);
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    runAsync: async () => ({ changes: 0 }),
    execAsync: (sql: string) => mockExec(sql),
  }),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    get exists() { return false; }
    delete() {}
  },
}));

import { clearLocalData } from './db';
import { LOCAL_WIPE_TABLES } from './hydration';

beforeEach(() => {
  mockClearTransientFiles.mockReset();
  mockExec.mockClear();
});

it('every wipe clears the transient files: the shared report, staged documents, print temps', async () => {
  await clearLocalData();
  expect(mockClearTransientFiles).toHaveBeenCalledTimes(1);
});

// The file step runs BEFORE the row deletes, so an escape from it would leave the whole
// local record on a device that changes hands (fail open; rls-privacy-reviewer).
it('a file step that throws never skips the row wipe: every table is still cleared', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockClearTransientFiles.mockImplementation(() => {
    throw new Error('cache directory unreachable');
  });
  await expect(clearLocalData()).resolves.toBeUndefined();
  const deleted = mockExec.mock.calls.map(([sql]) => sql);
  expect(LOCAL_WIPE_TABLES.length).toBeGreaterThan(10);
  for (const table of LOCAL_WIPE_TABLES) expect(deleted).toContain(`DELETE FROM ${table}`);
});
