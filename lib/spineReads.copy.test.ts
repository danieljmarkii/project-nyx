// The two readers of the phone's copy of the reads, on the production DDL (History v2 HV-6;
// CUL-1198 item 1, Home's half). `readAnalysisRows` answers a failed look with an empty map,
// which a surface cannot tell from "no read on this phone"; `readAnalysisCopy` answers it
// with `null`, so Home keeps the last answer it had instead of drawing every photo as unread
// and dropping a rose it already showed. The `spineReads.feedings.test.ts` harness, reused.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): Record<string, unknown>[];
    run(...a: unknown[]): unknown;
  };
}

let mockDb: Db;
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params),
  }),
}));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { BASE_SCHEMA_SQL } from './localSchema';
import { readAnalysisCopy, readAnalysisRows } from './spineReads';

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:') as Db;
  mockDb.exec(BASE_SCHEMA_SQL);
  mockDb
    .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES (?, ?, ?, ?)`)
    .run('v1', 'completed', 'worth_a_call', '2026-09-25T10:00:00.000Z');
});

describe('the copy, read two ways', () => {
  it('both hand over the copy the phone holds, keyed by event, and nothing for a row it lacks', async () => {
    for (const read of [readAnalysisRows, readAnalysisCopy]) {
      const got = await read(['v1', 'v2']);
      expect(got?.get('v1')).toMatchObject({ status: 'completed', recommendation: 'worth_a_call' });
      expect(got?.has('v2')).toBe(false);
    }
  });

  it('a failed look: `readAnalysisRows` says "nothing", `readAnalysisCopy` says it could not look', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // The table gone is a local read that fails, as a locked or corrupt store does.
    mockDb.exec('DROP TABLE event_ai_verdicts');
    expect(await readAnalysisRows(['v1'])).toEqual(new Map());
    expect(await readAnalysisCopy(['v1'])).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('nothing to ask about is an empty answer from both, never a failure', async () => {
    expect(await readAnalysisRows([])).toEqual(new Map());
    expect(await readAnalysisCopy([])).toEqual(new Map());
  });
});
