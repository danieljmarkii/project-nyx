// CUL-1329 — ending a trial against a REAL engine.
//
// `lib/dietTrialSetup.test.ts` drives `endActiveTrial` through a recording mock and
// pins the statement's shape: the predicate is in the SQL, `{ changes: 0 }` becomes a
// refusal. It cannot show that the predicate MEANS what it says — that a row another
// device already ended is left byte-for-byte alone, and that a refused call leaves no
// trace in the sync columns for the push to carry. That is the whole defect: a stale
// card wrote its own `ended_at` / `outcome` / `stopped_reason` over the first ending,
// and last-write-wins took it to the server.
//
// node:sqlite, the production DDL, the production function (the `dietTrialWindow.test.ts`
// harness). The adapter returns `{ changes }` as expo-sqlite does — a mock narrower than
// the API would hide the branch under test (C-39).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

const mockDb = { current: null as InstanceType<typeof DatabaseSync> | null };

jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = mockDb.current!.prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockDb.current!.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));

const mockSyncTrials = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingDietTrials: () => mockSyncTrials(),
  syncPendingDietTrialFoods: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { endActiveTrial, TrialEndRefused, trialEndRefusedNotice } from './dietTrialSetup';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';

type Row = Record<string, unknown>;

/** The row as it stands on the stale device once the OTHER device's ending has
 *  hydrated: completed on Sep 20 with the owner's read, pushed and acknowledged. */
const ENDED_ELSEWHERE = {
  status: 'completed',
  ended_at: '2026-09-20',
  completed_at: '2026-09-20',
  stopped_reason: null,
  outcome: 'improved',
  outcome_notes: 'Scratching stopped in week three.',
  updated_at: '2026-09-20T18:00:00.000Z',
  synced: 1,
  sync_attempts: 0,
  sync_error: null,
};

function seed(overrides: Record<string, unknown> = {}): void {
  const row = {
    id: 't-1',
    pet_id: 'pet-1',
    started_at: '2026-07-26',
    target_duration_days: 56,
    status: 'active',
    updated_at: '2026-07-26T09:00:00.000Z',
    synced: 1,
    ...overrides,
  };
  const cols = Object.keys(row);
  mockDb.current!
    .prepare(`INSERT INTO diet_trials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...(Object.values(row) as never[]));
}

const read = (id = 't-1'): Row =>
  mockDb.current!.prepare('SELECT * FROM diet_trials WHERE id = ?').get(id) as Row;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSyncTrials.mockClear();
  mockDb.current = new DatabaseSync(':memory:');
  mockDb.current.exec(DIET_TRIAL_SCHEMA_SQL);
});
afterEach(() => {
  mockDb.current?.close();
  mockDb.current = null;
});

describe('endActiveTrial against real SQLite (CUL-1329)', () => {
  it('ends a running trial, as before', async () => {
    seed();
    await endActiveTrial({ trialId: 't-1', reason: 'vet_advised', endedOn: '2026-09-22' });
    const t = read();
    expect(t.status).toBe('abandoned');
    expect(t.ended_at).toBe('2026-09-22');
    expect(t.stopped_reason).toBe('vet_advised');
    expect(t.synced).toBe(0);
  });

  it.each([
    ['*Stopped early*', { reason: 'refused' }],
    ['*This trial is done*', { reason: 'completed', outcome: 'no_change' as const, outcomeNotes: 'x' }],
  ])('refuses %s over a trial another device already ended, and leaves every column as it was', async (_label, args) => {
    seed(ENDED_ELSEWHERE);
    const before = read();

    const e = await endActiveTrial({ trialId: 't-1', endedOn: '2026-09-27', ...args })
      .catch((err: unknown) => err);

    expect(e).toBeInstanceOf(TrialEndRefused);
    expect(e).toMatchObject({ reason: 'not_running', status: 'completed', endedOn: '2026-09-20', storedReason: null });
    // Byte-for-byte: the first ending's date, outcome and reason survive, and the sync
    // columns do not move — `updated_at` unbumped and `synced` still 1 means nothing is
    // queued for the push to carry over the other device's ending.
    expect(read()).toEqual(before);
    await flush();
    expect(mockSyncTrials).not.toHaveBeenCalled();
  });

  it('refuses a second ending on the SAME device — the double-tap / other-host case', async () => {
    seed();
    await endActiveTrial({ trialId: 't-1', reason: 'completed', endedOn: '2026-09-22', outcome: 'improved' });
    const first = read();
    await expect(endActiveTrial({ trialId: 't-1', reason: 'refused', endedOn: '2026-09-23' }))
      .rejects.toMatchObject({ reason: 'not_running', endedOn: '2026-09-22' });
    expect(read()).toEqual(first);
  });

  it('refuses a trial id that is not there, rather than resolving over nothing', async () => {
    seed();
    await expect(endActiveTrial({ trialId: 't-missing', reason: 'completed' }))
      .rejects.toMatchObject({ reason: 'not_found' });
    expect(read().status).toBe('active');
  });

  it('still ends the sync-artefact row (active, but carrying an ended_at) — it holds the one-active slot', async () => {
    // Deliberately NOT `changeTrialWindow`'s second half. This row is what the start
    // modal's pre-flight finds and offers to end; refusing it would leave the owner
    // unable to end it and unable to start another trial.
    seed({ ended_at: '2026-09-18' });
    await endActiveTrial({ trialId: 't-1', reason: 'other', endedOn: '2026-09-22' });
    expect(read().status).toBe('abandoned');
  });

  // CUL-2012 — the refusal carries the FIRST ending's reason, read off the row, so a
  // host can tell an owner their reason is not the one on the record.
  it('a refusal carries the stored stopped_reason of an abandoned trial', async () => {
    seed({ ...ENDED_ELSEWHERE, status: 'abandoned', completed_at: null, stopped_reason: 'vet_advised', outcome: null, outcome_notes: null });
    const before = read();
    await expect(endActiveTrial({ trialId: 't-1', reason: 'refused', endedOn: '2026-09-27' }))
      .rejects.toMatchObject({ reason: 'not_running', status: 'abandoned', endedOn: '2026-09-20', storedReason: 'vet_advised' });
    expect(read()).toEqual(before);
  });
});

// CUL-2035 — a reason match hides a different verdict, so the refusal carries the
// FIRST ending's outcome and note too.
describe('a refusal over a completed trial carries its verdict (CUL-2035)', () => {
  it('reads the stored outcome and note off the row', async () => {
    seed(ENDED_ELSEWHERE);
    await expect(endActiveTrial({ trialId: 't-1', reason: 'completed', outcome: 'worse', endedOn: '2026-09-27' }))
      .rejects.toMatchObject({ storedOutcome: 'improved', storedOutcomeNotes: 'Scratching stopped in week three.' });
  });

  it('phone A ended with no outcome, phone B refused with worse plus a note: said once, in the outcome variant', async () => {
    // Phone A: the after-visit *Ended* path, completed at the target with no verdict.
    seed();
    await endActiveTrial({ trialId: 't-1', reason: 'completed', endedOn: '2026-10-14' });
    const first = read();
    // Phone B: the sheet was open; the owner picked worse and wrote a note.
    const e = await endActiveTrial({
      trialId: 't-1', reason: 'completed', outcome: 'worse',
      outcomeNotes: 'vomiting came back in week 6', endedOn: '2026-10-15',
    }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(TrialEndRefused);
    expect(read()).toEqual(first);
    expect(trialEndRefusedNotice({
      refusal: e as TrialEndRefused, ownerReason: 'completed', ownerOutcome: 'worse',
      ownerOutcomeNotes: 'vomiting came back in week 6', petName: 'Mochi', now: new Date(2026, 9, 19, 12),
    })).toEqual({
      title: 'Already ended',
      body: 'Mochi’s trial was already ended on another phone, on Oct 14. That ending stays on the record, so what you said about how it went wasn’t saved. You can tell your vet yourself.',
    });
  });
});

// CUL-2012 — the notice a host says when its ending lost to one already on the record.
describe('trialEndRefusedNotice', () => {
  const NOW = new Date(2026, 9, 19, 12);
  const refusal = (over: Partial<ConstructorParameters<typeof TrialEndRefused>[0]> = {}) =>
    new TrialEndRefused({ reason: 'not_running', status: 'abandoned', endedOn: '2026-10-14', storedReason: 'vet_advised', ...over });

  it('a refusal the record does not hold is said, naming the pet and the first ending’s day', () => {
    expect(trialEndRefusedNotice({ refusal: refusal(), ownerReason: 'refused', petName: 'Mochi', now: NOW })).toEqual({
      title: 'Already ended',
      body: 'Mochi’s trial was already ended on another phone, on Oct 14. That ending stays on the record, so the reason you gave wasn’t saved. You can tell your vet yourself.',
    });
  });

  it.each([
    ['the same stopped-early reason', refusal({ storedReason: 'refused' }), 'refused'],
    ['completed over completed', refusal({ status: 'completed', storedReason: null }), 'completed'],
  ])('%s says nothing', (_l, r, ownerReason) => {
    expect(trialEndRefusedNotice({ refusal: r, ownerReason, petName: 'Mochi', now: NOW })).toBeNull();
  });

  it.each([
    ['a stop over a completed trial', refusal({ status: 'completed', storedReason: null }), 'refused'],
    ['completed over a stopped one', refusal(), 'completed'],
    ['an unreadable stored reason (errs loud)', refusal({ storedReason: null }), 'refused'],
    // `stopped_reason` has no CHECK; the report keys on exactly `=== 'refused'`, so a
    // stored variant does NOT reach the refusal lines and must not be read as a match.
    ['a stored casing variant the report would not read as a refusal', refusal({ storedReason: 'Refused' }), 'refused'],
    ['a stored padded variant', refusal({ storedReason: 'refused ' }), 'refused'],
    ['an unrecognised stored status (errs loud)', refusal({ status: 'active', storedReason: 'refused' }), 'refused'],
  ])('%s is said', (_l, r, ownerReason) => {
    expect(trialEndRefusedNotice({ refusal: r, ownerReason, petName: 'Mochi', now: NOW })?.title).toBe('Already ended');
  });

  describe('completed over completed weighs the verdict and the note (CUL-2035)', () => {
    const done = (storedOutcome: string | null, storedOutcomeNotes: string | null = null) =>
      refusal({ status: 'completed', storedReason: null, storedOutcome, storedOutcomeNotes });
    const OUTCOME_BODY = /so what you said about how it went wasn’t saved\./;

    it.each([
      ['no verdict and no note from the owner, whatever is stored', done('improved', 'x'), undefined, undefined],
      ['the same verdict, no note', done('worse'), 'worse' as const, null],
      ['the same verdict and note', done('worse', 'week 6'), 'worse' as const, 'week 6'],
      ['the same note, trimmed the way the write trims it', done('worse', 'week 6'), 'worse' as const, '  week 6 \n'],
      ['a blank note is no note', done('worse', 'week 6'), null, '   '],
    ])('%s says nothing', (_l, r, ownerOutcome, ownerOutcomeNotes) => {
      expect(trialEndRefusedNotice({ refusal: r, ownerReason: 'completed', ownerOutcome, ownerOutcomeNotes, petName: 'Mochi', now: NOW })).toBeNull();
    });

    it.each([
      ['a verdict over none', done(null), 'worse' as const, null],
      ['a different verdict', done('improved'), 'worse' as const, null],
      ['a note over none', done('worse'), 'worse' as const, 'week 6'],
      ['a different note', done('worse', 'week 5'), 'worse' as const, 'week 6'],
      ['a note with no verdict, over a record holding neither', done(null), null, 'week 6'],
      ['a stored verdict spelling the app never writes (errs loud)', done('Worse'), 'worse' as const, null],
    ])('%s is said, in the outcome variant', (_l, r, ownerOutcome, ownerOutcomeNotes) => {
      const n = trialEndRefusedNotice({ refusal: r, ownerReason: 'completed', ownerOutcome, ownerOutcomeNotes, petName: 'Mochi', now: NOW });
      expect(n?.title).toBe('Already ended');
      expect(n?.body).toMatch(OUTCOME_BODY);
      expect(n?.body).not.toContain('!');
    });

    it('a reason the record does not hold keeps the reason variant, verdict or not', () => {
      const n = trialEndRefusedNotice({ refusal: refusal(), ownerReason: 'completed', ownerOutcome: 'worse', petName: 'Mochi', now: NOW });
      expect(n?.body).toMatch(/so the reason you gave wasn’t saved\./);
    });
  });

  it('not_found is not this case: no ending won, so nothing is said here', () => {
    expect(trialEndRefusedNotice({ refusal: new TrialEndRefused({ reason: 'not_found' }), ownerReason: 'refused', petName: 'Mochi', now: NOW })).toBeNull();
  });

  it('no stored day drops the date; a missing or fallback name reads "Your pet’s"', () => {
    for (const petName of [null, '  ', 'your pet']) {
      expect(trialEndRefusedNotice({ refusal: refusal({ endedOn: null }), ownerReason: 'refused', petName, now: NOW })?.body)
        .toBe('Your pet’s trial was already ended on another phone. That ending stays on the record, so the reason you gave wasn’t saved. You can tell your vet yourself.');
    }
  });

  it('carries no exclamation mark in any variant', () => {
    const b = trialEndRefusedNotice({ refusal: refusal(), ownerReason: 'refused', petName: 'Mochi', now: NOW });
    expect(`${b?.title}${b?.body}`).not.toContain('!');
  });
});
