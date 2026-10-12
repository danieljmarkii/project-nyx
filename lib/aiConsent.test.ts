import * as fs from 'fs';
import * as path from 'path';
import {
  AI_CONSENT_COPY_VERSION,
  AI_CONSENT_DOCUMENT,
  AI_CONSENT_SCOPE,
  AI_CONSENT_SOURCES,
  fetchAiConsent,
  hasEverGrantedAiConsent,
  writeAiConsent,
} from './aiConsent';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = supabase.from as jest.Mock;
const USER_ID = 'user-1';

// A fake PostgREST that logs every call in order, per table, so a test can assert
// WHICH write went first and what each one carried.
type Result = { data?: unknown; error: { code?: string; message: string } | null };
interface Fake {
  log: string[];
  legalInsert: jest.Mock;
  upsert: jest.Mock;
  selects: string[];
}

function fakeDb(opts: {
  legal?: Result;
  upsert?: Result;
  read?: Result;
  history?: Result;
} = {}): Fake {
  const log: string[] = [];
  const selects: string[] = [];
  const legalInsert = jest.fn(async () => {
    log.push('legal_acceptances.insert');
    return opts.legal ?? { error: null };
  });
  const upsert = jest.fn(() => {
    log.push('ai_consent.upsert');
    return {
      select: (cols: string) => {
        selects.push(cols);
        return {
          single: async () => opts.upsert ?? {
            data: { granted: true, copy_version: AI_CONSENT_COPY_VERSION, source: 'backstop', decided_at: '2026-10-14T09:00:00+00:00' },
            error: null,
          },
        };
      },
    };
  });
  mockedFrom.mockImplementation((table: string) => {
    if (table === 'legal_acceptances') return { insert: legalInsert };
    if (table === 'ai_consent') {
      return {
        upsert,
        select: (cols: string) => {
          selects.push(cols);
          const chain = {
            eq: () => chain,
            maybeSingle: async () => opts.read ?? { data: null, error: null },
          };
          return chain;
        },
      };
    }
    if (table === 'ai_consent_events') {
      return {
        select: (cols: string) => {
          selects.push(cols);
          const chain = {
            eq: () => chain,
            limit: async () => opts.history ?? { data: [], error: null },
          };
          return chain;
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { log, legalInsert, upsert, selects };
}

beforeEach(() => {
  mockedFrom.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe('writeAiConsent: the 10-11 binding rules', () => {
  it('writes the legal record BEFORE the state row on a yes', async () => {
    const db = fakeDb();
    const result = await writeAiConsent({ userId: USER_ID, granted: true, source: 'backstop' });
    expect(result.status).toBe('saved');
    expect(db.log).toEqual(['legal_acceptances.insert', 'ai_consent.upsert']);
    expect(db.legalInsert).toHaveBeenCalledWith({
      user_id: USER_ID,
      document: AI_CONSENT_DOCUMENT,
      version: AI_CONSENT_COPY_VERSION,
    });
  });

  it('never writes the yes when its legal record failed, so the gate keeps reading no', async () => {
    const db = fakeDb({ legal: { error: { code: '08006', message: 'connection failure' } } });
    const result = await writeAiConsent({ userId: USER_ID, granted: true, source: 'settings' });
    expect(result.status).toBe('error');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('treats an existing record for this copy version (23505) as recorded and saves the yes', async () => {
    const db = fakeDb({ legal: { error: { code: '23505', message: 'duplicate key' } } });
    const result = await writeAiConsent({ userId: USER_ID, granted: true, source: 'settings' });
    expect(result.status).toBe('saved');
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it('a no writes the state row only: a decline is not a legal acceptance', async () => {
    const db = fakeDb({
      upsert: {
        data: { granted: false, copy_version: AI_CONSENT_COPY_VERSION, source: 'backstop', decided_at: '2026-10-14T09:00:00+00:00' },
        error: null,
      },
    });
    const result = await writeAiConsent({ userId: USER_ID, granted: false, source: 'backstop' });
    expect(result).toEqual({
      status: 'saved',
      row: { granted: false, copyVersion: AI_CONSENT_COPY_VERSION, source: 'backstop', decidedAt: '2026-10-14T09:00:00+00:00' },
    });
    expect(db.legalInsert).not.toHaveBeenCalled();
  });

  it('upserts on the (user, scope) key with the answer columns only: never decided_at', async () => {
    const db = fakeDb();
    await writeAiConsent({ userId: USER_ID, granted: true, source: 'backstop' });
    expect(db.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        scope: AI_CONSENT_SCOPE,
        granted: true,
        copy_version: AI_CONSENT_COPY_VERSION,
        source: 'backstop',
      },
      { onConflict: 'user_id,scope' },
    );
  });

  it('reports a failed state write as an error, never as saved', async () => {
    fakeDb({ upsert: { data: null, error: { code: '42501', message: 'permission denied' } } });
    const result = await writeAiConsent({ userId: USER_ID, granted: false, source: 'settings' });
    expect(result.status).toBe('error');
  });
});

describe('reads name their columns', () => {
  it('reads the state and the history by named columns, never *', async () => {
    const db = fakeDb();
    await fetchAiConsent(USER_ID);
    await hasEverGrantedAiConsent(USER_ID);
    await writeAiConsent({ userId: USER_ID, granted: true, source: 'backstop' });
    expect(db.selects.length).toBe(3);
    for (const cols of db.selects) {
      expect(cols).not.toContain('*');
      // The history's SELECT grant leaves out `id` (migration 100 §5).
      expect(cols.split(',').map((c) => c.trim())).not.toContain('id');
    }
  });

  it('an absent row is "never asked", and a failed read is its own state', async () => {
    fakeDb({ read: { data: null, error: null } });
    await expect(fetchAiConsent(USER_ID)).resolves.toEqual({ status: 'ok', row: null });
    fakeDb({ read: { data: null, error: { message: 'offline' } } });
    await expect(fetchAiConsent(USER_ID)).resolves.toEqual({ status: 'error' });
  });

  it('hasEverGranted is true only when the history holds a yes, and false on a failed read', async () => {
    fakeDb({ history: { data: [{ granted: true, decided_at: 'x' }], error: null } });
    await expect(hasEverGrantedAiConsent(USER_ID)).resolves.toBe(true);
    fakeDb({ history: { data: [], error: null } });
    await expect(hasEverGrantedAiConsent(USER_ID)).resolves.toBe(false);
    fakeDb({ history: { data: null, error: { message: 'offline' } } });
    await expect(hasEverGrantedAiConsent(USER_ID)).resolves.toBe(false);
  });
});

describe('the closed sets match the table', () => {
  // Derived from the migration, never restated: a source the CHECK does not admit
  // fails every write with 23514, and a yes that fails is a door that never opens.
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '100_ai_consent.sql'),
    'utf8',
  );

  it('every source the client can write is one the table admits', () => {
    const m = sql.match(/source\s+TEXT NOT NULL CHECK \(source IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const admitted = (m as RegExpMatchArray)[1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(admitted.length).toBeGreaterThan(0);
    for (const s of AI_CONSENT_SOURCES) expect(admitted).toContain(s);
  });

  it('the scope is the one the table admits', () => {
    expect(sql).toContain(`scope        TEXT NOT NULL CHECK (scope IN ('${AI_CONSENT_SCOPE}'))`);
  });

  it('the copy version fits the column cap', () => {
    expect(AI_CONSENT_COPY_VERSION.trim().length).toBeGreaterThan(0);
    expect(AI_CONSENT_COPY_VERSION.length).toBeLessThanOrEqual(64);
  });
});
