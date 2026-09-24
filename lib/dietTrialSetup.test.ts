// B-417 PR 3 — the start-a-trial write path and the decisions it encodes.
//
// What is worth pinning here, in rough order of what would hurt if it broke:
//   • the legacy `food_item_id` gets the FIRST primary food and the allowed set
//     gets ALL of them — the multi-select ruling's whole payload contract;
//   • the end date is INCLUSIVE (start + target − 1). An off-by-one here is an
//     off-by-one on the milestone that decides whether an owner stops a diet;
//   • the duration lookup resolves every cell, and both unruled gaps resolve
//     toward the LONGER window (the safe direction — a short default reads as
//     permission to stop);
//   • `allowed_from` opens on the TRIAL's start day, not today, so a back-dated
//     trial does not render its own prescribed diet as un-permitted;
//   • ending a trial writes `ended_at` on BOTH outcomes and clears `sync_error`.
//
// jest hoists jest.mock() above the imports, so anything a factory closes over
// must be `mock`-prefixed.

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
// CUL-902/CUL-945: `startDietTrial` now asks whether the visit link it was handed
// belongs to this pet BEFORE the transaction opens, through `visitIsForPet` — one
// SELECT on `vet_visits`. Backed by a table this mock answers from, so the tests
// below drive the REAL check rather than a stub of it (C-34).
const mockVisits: { id: string; pet_id: string; deleted_at: string | null }[] = [];
const mockGetAllAsync = jest.fn(async (_sql: string, params: unknown[] = []) => {
  const [visitId, petId] = params as string[];
  return mockVisits.filter(
    (v) => v.id === visitId && v.pet_id === petId && v.deleted_at === null,
  );
});
// The real withTransactionAsync wraps the callback in BEGIN/COMMIT; running it
// inline keeps the assertions about WHAT is written while still proving the writes
// go through the transactional path (asserted directly below).
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
    withTransactionAsync: mockWithTransactionAsync,
  }),
}));

const mockSyncTrials = jest.fn().mockResolvedValue(undefined);
const mockSyncTrialFoods = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingDietTrials: () => mockSyncTrials(),
  syncPendingDietTrialFoods: () => mockSyncTrialFoods(),
}));

let mockIdSeq = 0;
jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return { ...actual, uuid: () => `id-${++mockIdSeq}` };
});

// DR-3: startDietTrial fires the trial value moment (re-surfaces the Daily Recap
// offer once, ever). Mocked so the wiring is assertable without touching AsyncStorage.
const mockSurfaceOffer = jest.fn().mockResolvedValue(undefined);
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: (m: string) => mockSurfaceOffer(m),
}));

import {
  addTrialFood, buildTrialRows, canStartTrial, defaultDurationDays, describeActiveTrial,
  durationHelperLine, endActiveTrial, foodLabel, formatTrialEndDate,
  extendTrial, changeTrialWindow, TrialWindowRefused, getActiveTrialForPet,
  permittedRoleForFood, secondTrialIntro,
  setTrialTargetProtein, startDietTrial,
  stopReasonOptions, trialEndDayKey, trialSetupLines, TRIAL_RECORD_DISCLOSURE,
  type StartTrialInput,
} from './dietTrialSetup';
import { VetVisitLinkRefused } from './vetVisitLink';
import { nextTargetDays, extensionDays } from './dietTrialCompletion';
import { useSyncStore } from '../store/syncStore';
import { toLocalDayKey } from './utils';

const flush = () => new Promise((r) => setTimeout(r, 0));

const DRY = { id: 'food-dry', brand: 'Zignature', product_name: 'Kangaroo Formula', food_type: 'meal' };
const WET = { id: 'food-wet', brand: 'Zignature', product_name: 'Kangaroo Canned', food_type: 'meal' };
const JERKY = { id: 'food-jerky', brand: 'Real Meat', product_name: 'Kangaroo Jerky', food_type: 'treat' };

function input(overrides: Partial<StartTrialInput> = {}): StartTrialInput {
  return {
    petId: 'pet-1',
    primaryFoods: [DRY, WET],
    permittedFoods: [],
    indication: 'skin',
    targetDurationDays: 56,
    startedAt: '2026-07-03',
    vetName: null,
    targetProtein: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockIdSeq = 0;
  mockRunAsync.mockClear();
  mockWithTransactionAsync.mockClear();
  mockGetFirstAsync.mockClear().mockResolvedValue(null);
  mockGetAllAsync.mockClear();
  mockSyncTrials.mockClear();
  mockSyncTrialFoods.mockClear();
  // 'visit-7' is pet-1's; the other two are the shapes migration 067 refuses with a
  // TERMINAL 23514 (CUL-945) — another pet's visit, and a soft-deleted one.
  mockVisits.length = 0;
  mockVisits.push(
    { id: 'visit-7', pet_id: 'pet-1', deleted_at: null },
    { id: 'visit-other', pet_id: 'pet-2', deleted_at: null },
    { id: 'visit-gone', pet_id: 'pet-1', deleted_at: '2026-09-01T00:00:00.000Z' },
  );
});

// ── The duration table (P-1, provisional pending Dr. Chen) ──────────────────

describe('defaultDurationDays', () => {
  it('returns the four ruled cells', () => {
    expect(defaultDurationDays('dog', 'skin')).toBe(56);
    expect(defaultDurationDays('dog', 'gi')).toBe(28);
    expect(defaultDurationDays('cat', 'skin')).toBe(56);
    // The one NEW number: cats reach only ~50% remission at 4 weeks.
    expect(defaultDurationDays('cat', 'gi')).toBe(42);
  });

  it('resolves the unruled gaps toward the LONGER window', () => {
    // No cell exists for 'other' — take the skin (longer) value rather than the
    // GI one, because a short default produces a milestone that reads as
    // permission to stop a diet the vet wanted continued.
    expect(defaultDurationDays('dog', 'other')).toBe(56);
    // Unknown species → the longer of the two species' cells for that indication.
    expect(defaultDurationDays(null, 'gi')).toBe(42);
    expect(defaultDurationDays('ferret', 'gi')).toBe(42);
  });
});

// ── End date: INCLUSIVE of day 1 ────────────────────────────────────────────

describe('trialEndDayKey', () => {
  it('is inclusive — 56 days from 3 July ends 27 August, not 28', () => {
    // Both of the mock's worked examples encode the inclusive form, and
    // getDietTrialProgress counts day 1 as the start day.
    expect(trialEndDayKey('2026-07-03', 56)).toBe('2026-08-27');
    expect(trialEndDayKey('2026-07-25', 56)).toBe('2026-09-18');
  });

  it('handles a one-day trial and rejects nonsense', () => {
    expect(trialEndDayKey('2026-07-03', 1)).toBe('2026-07-03');
    expect(trialEndDayKey('2026-07-03', 0)).toBeNull();
    expect(trialEndDayKey('not-a-date', 56)).toBeNull();
  });

  it('crosses a year boundary', () => {
    expect(trialEndDayKey('2026-12-01', 56)).toBe('2027-01-25');
  });
});

describe('formatTrialEndDate', () => {
  // Day/month ORDER is the device locale's business (the repo formats every
  // owner-facing date with `toLocaleDateString([])`); what this pins is the two
  // things that are ours: the parts present, and the year rule.
  it('omits the year in-year and includes it across the boundary', () => {
    const now = new Date(2026, 6, 25);
    const inYear = formatTrialEndDate('2026-08-27', now)!;
    expect(inYear).toContain('27');
    expect(inYear).toContain('August');
    expect(inYear).not.toContain('2026');

    // A 12-week trial started in November ends in a year a bare "25 January"
    // leaves genuinely ambiguous.
    expect(formatTrialEndDate('2027-01-25', now)).toContain('2027');
  });
});

describe('durationHelperLine', () => {
  it('names the default and its resulting end DATE, not just a day count', () => {
    const now = new Date(2026, 6, 25);
    const line = durationHelperLine('skin', 56, toLocalDayKey(now), '2026-09-18', now);
    expect(line).toContain('8 weeks');
    expect(line).toContain('Starting today');
    expect(line).toContain('September');
    expect(line).toContain('18');
  });

  it('stays true after a back-date — never "starting today" on a June trial', () => {
    const now = new Date(2026, 6, 25);
    const line = durationHelperLine('skin', 56, '2026-06-01', '2026-07-26', now);
    expect(line).not.toContain('Starting today');
    expect(line).toContain('June');
  });
});

// ── The payload ─────────────────────────────────────────────────────────────

describe('buildTrialRows', () => {
  it('writes N primary_diet rows and puts the FIRST food on the legacy column', () => {
    const rows = buildTrialRows(input(), '2026-07-03T09:00:00.000Z');

    // §4.1 — `diet_trials.food_item_id` is display-only legacy for the seven
    // shipped readers; every computation reads diet_trial_foods.
    expect(rows.trial.food_item_id).toBe('food-dry');
    expect(rows.trial.food_label).toBe('Zignature Kangaroo Formula');

    const primaries = rows.foods.filter((f) => f.role === 'primary_diet');
    expect(primaries.map((f) => f.food_item_id)).toEqual(['food-dry', 'food-wet']);
    expect(primaries.every((f) => f.diet_trial_id === rows.trial.id)).toBe(true);
    expect(primaries.every((f) => f.pet_id === 'pet-1')).toBe(true);
  });

  it('denormalizes a NOT NULL food_label onto every allowed-set row', () => {
    // The row FKs ON DELETE CASCADE, so a label that had to be re-derived from
    // the food would die with it.
    const rows = buildTrialRows(input({ permittedFoods: [JERKY] }), 'now');
    expect(rows.foods.every((f) => f.food_label.length > 0)).toBe(true);
    expect(rows.foods.find((f) => f.food_item_id === 'food-jerky')?.food_label)
      .toBe('Real Meat Kangaroo Jerky');
  });

  it('infers a permitted extra’s role from the library’s own food_type', () => {
    const rows = buildTrialRows(input({ permittedFoods: [JERKY, { ...WET, id: 'food-x' }] }), 'now');
    const byId = Object.fromEntries(rows.foods.map((f) => [f.food_item_id, f.role]));
    expect(byId['food-jerky']).toBe('permitted_treat');
    expect(byId['food-x']).toBe('permitted_other');
    // Never asked for, never guessed at: 'supplement' is not capturable in v1.
    expect(rows.foods.some((f) => f.role === 'supplement')).toBe(false);
  });

  it('opens membership on the TRIAL’s start day, not today', () => {
    // A back-dated trial must not render its own prescribed diet as un-permitted
    // for the days before the owner got around to telling us.
    const rows = buildTrialRows(input({ startedAt: '2026-06-01' }), 'now');
    expect(rows.foods.every((f) => f.allowed_from === '2026-06-01')).toBe(true);
  });

  it('leaves transition_started_at null — the v1 decision, not an omission', () => {
    expect(buildTrialRows(input(), 'now').trial.transition_started_at).toBeNull();
  });

  it('always starts elimination/active and trims an empty vet name to null', () => {
    const rows = buildTrialRows(input({ vetName: '   ' }), 'now');
    expect(rows.trial.phase).toBe('elimination');
    expect(rows.trial.status).toBe('active');
    expect(rows.trial.vet_name).toBeNull();
  });

  // ── B-704 §5 — the target protein columns ──────────────────────────────────
  it('writes a null protein and null set_at when nothing was chosen (derived/none/unset)', () => {
    const rows = buildTrialRows(input({ targetProtein: null }), '2026-07-03T09:00:00.000Z');
    expect(rows.trial.target_protein).toBeNull();
    // set_at is dated ONLY alongside a non-null protein, so the report can trust it.
    expect(rows.trial.target_protein_set_at).toBeNull();
  });

  it('writes the owner-chosen protein and dates set_at to `now`', () => {
    const rows = buildTrialRows(input({ targetProtein: 'rabbit' }), '2026-07-03T09:00:00.000Z');
    expect(rows.trial.target_protein).toBe('rabbit');
    expect(rows.trial.target_protein_set_at).toBe('2026-07-03T09:00:00.000Z');
  });

  it('canonicalizes the stored protein at the write boundary (TG-4) — a raw label never lands', () => {
    // Defense in depth: the picker only offers canonical keys, but the column is
    // canonical whatever the caller passes.
    const rows = buildTrialRows(input({ targetProtein: 'Chicken By-Product Meal' }), 'now');
    expect(rows.trial.target_protein).toBe('chicken');
    expect(rows.trial.target_protein_set_at).toBe('now');
  });

  it('a junk protein canonicalizes to null and is not dated (TG-2)', () => {
    const rows = buildTrialRows(input({ targetProtein: '   ' }), 'now');
    expect(rows.trial.target_protein).toBeNull();
    expect(rows.trial.target_protein_set_at).toBeNull();
  });
});

describe('canStartTrial', () => {
  it('needs a trial food and an indication, and nothing else', () => {
    expect(canStartTrial({ primaryFoods: [DRY], indication: 'skin' })).toBe(true);
    expect(canStartTrial({ primaryFoods: [], indication: 'skin' })).toBe(false);
    expect(canStartTrial({ primaryFoods: [DRY], indication: null })).toBe(false);
  });
});

// ── Local writes ────────────────────────────────────────────────────────────

describe('startDietTrial', () => {
  it('writes the trial then its allowed set, all unsynced with no error', async () => {
    await startDietTrial(input({ permittedFoods: [JERKY] }));

    // 1 trial + 2 primaries + 1 permitted.
    expect(mockRunAsync).toHaveBeenCalledTimes(4);
    const [trialSql] = mockRunAsync.mock.calls[0];
    expect(trialSql).toContain('INSERT INTO diet_trials');
    // The mirror's contract for every local mutation.
    expect(trialSql).toContain('0, NULL');
    for (let i = 1; i < 4; i++) {
      expect(mockRunAsync.mock.calls[i][0]).toContain('INSERT INTO diet_trial_foods');
    }
  });

  it('writes the parent and its allowed set in ONE transaction', async () => {
    // A throw partway through would otherwise leave an ACTIVE trial with a partial
    // primary_diet set: a real trial that blocks starting another, whose protein
    // count no longer describes anything, so the standing note goes quiet on it.
    await startDietTrial(input({ permittedFoods: [JERKY] }));
    expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('binds one parameter per placeholder on both statements', async () => {
    // The B-057 placeholder/param-drift guard: a silent off-by-one here writes a
    // date into an enum column and the row is rejected server-side forever.
    await startDietTrial(input());
    for (const [sql, params] of mockRunAsync.mock.calls) {
      const placeholders = (sql as string).match(/\?/g)?.length ?? 0;
      expect((params as unknown[]).length).toBe(placeholders);
    }
  });

  it('kicks the parent flush before the child flush', async () => {
    await startDietTrial(input());
    await flush();
    expect(mockSyncTrials).toHaveBeenCalled();
    expect(mockSyncTrialFoods).toHaveBeenCalled();
    expect(mockSyncTrials.mock.invocationCallOrder[0])
      .toBeLessThan(mockSyncTrialFoods.mock.invocationCallOrder[0]);
  });

  it('still writes locally when the flush fails — offline is the target case', async () => {
    mockSyncTrials.mockRejectedValueOnce(new Error('offline'));
    await expect(startDietTrial(input())).resolves.toEqual(expect.any(String));
    await flush();
    expect(mockRunAsync).toHaveBeenCalledTimes(3);
  });
});

describe('endActiveTrial', () => {
  it('writes ended_at AND completed_at when the trial ran its course', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'completed' });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE diet_trials');
    expect(params[0]).toBe('completed');
    expect(params[1]).toEqual(expect.any(String)); // ended_at
    expect(params[2]).toBe(params[1]);             // completed_at
    expect(params[3]).toBeNull();                  // no stopped_reason
  });

  it('abandons with a reason and STILL writes ended_at', async () => {
    // ended_at on both outcomes is not optional: a null end date makes
    // report.ts read the trial as ongoing and renders "Day 104 of 28".
    await endActiveTrial({ trialId: 't-1', reason: 'refused' });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('abandoned');
    expect(params[1]).toEqual(expect.any(String)); // ended_at
    expect(params[2]).toBeNull();                  // completed_at
    expect(params[3]).toBe('refused');
  });

  it('re-arms a quarantined push rather than leaving the row parked', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'vet_advised' });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).toContain('synced = 0');
    expect(sql).toContain('sync_error = NULL');
  });

  it('never DELETEs — a trial ends by status', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'other' });
    expect((mockRunAsync.mock.calls[0][0] as string).toUpperCase()).not.toContain('DELETE');
  });

  // ── PR 6: the owner's read, and the one place it may not go ────────────────

  it('records the owner-reported outcome on a completed trial', async () => {
    await endActiveTrial({
      trialId: 't-1', reason: 'completed', outcome: 'improved',
      outcomeNotes: '  The scratching stopped in week three.  ',
    });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('completed');
    expect(params[4]).toBe('improved');
    expect(params[5]).toBe('The scratching stopped in week three.');
  });

  it('stores an empty note as NULL, not as an empty string', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'completed', outcome: 'unsure', outcomeNotes: '   ' });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBeNull();
  });

  it('CANNOT attach an outcome to a trial that ended early (§4.3)', async () => {
    // The refusal rule made unbypassable rather than remembered: "a refusal
    // stopped_reason routes to the intake-decline HEALTH lane and is never
    // rendered as a compliance outcome". The stopped-early sheet asks what got in
    // the way, never how it went — so today nothing passes these arguments. The
    // guard exists because the next surface to call this will not have read §4.3,
    // and a vet reading "stopped — wouldn't eat it · owner reported: improved"
    // would be reading a compliance verdict on a diet that was never eaten.
    await endActiveTrial({
      trialId: 't-1', reason: 'refused',
      outcome: 'improved', outcomeNotes: 'seemed better anyway',
    });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('abandoned');
    expect(params[3]).toBe('refused');
    expect(params[4]).toBeNull(); // outcome
    expect(params[5]).toBeNull(); // outcome_notes
  });

  it('writes the day the caller SHOWED, when it passes one (CUL-951)', async () => {
    // The after-visit confirm names the day before the owner confirms; computing it
    // again here could land on the other side of midnight from the one on screen.
    await endActiveTrial({ trialId: 't-1', reason: 'vet_advised', endedOn: '2026-09-22' });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('2026-09-22'); // ended_at
    expect(params[2]).toBeNull();         // completed_at — an early end, unchanged
  });

  it('writes the same shown day into completed_at on a completed trial', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'completed', endedOn: '2026-09-22' });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('2026-09-22');
    expect(params[2]).toBe('2026-09-22');
  });

  it('refuses a malformed day rather than writing it into a DATE the report reads', async () => {
    await expect(endActiveTrial({ trialId: 't-1', reason: 'completed', endedOn: 'Sep 22' }))
      .rejects.toThrow(/YYYY-MM-DD/);
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('kicks a flush so the ending row lands before any next trial starts', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'completed' });
    await flush();
    // syncPendingDietTrials pushes ENDING trials in its first pass, so freeing
    // the server's UNIQUE active index early is what keeps a subsequent start
    // from earning a terminal 23505.
    expect(mockSyncTrials).toHaveBeenCalled();
  });
});

// ── CUL-1039 — the mid-trial window change, and the clamp both doors share ────
//
// A local day key N days back, so `dayCounter` is N + 1 (day 1 is the start day).
// ANCHORED TO `Date.now()`, never to a literal date: the floor these tests probe is
// judged against a real-clock day counter, and a fixture pinned to an absolute date
// fails on a calendar boundary rather than on a change (C-29).
const dayKeyDaysAgo = (n: number): string =>
  toLocalDayKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

/** A running trial the write path can read: day `dayCounter` of `target`. */
function trialRow(overrides: Partial<{
  started_at: string; target_duration_days: number; status: string; ended_at: string | null;
}> = {}) {
  return {
    started_at: dayKeyDaysAgo(52), // day 53
    target_duration_days: 56,
    status: 'active',
    ended_at: null,
    ...overrides,
  };
}

describe('changeTrialWindow — the mid-trial write path (CUL-1039)', () => {
  const NOW = new Date('2026-09-19T10:00:00.000Z');

  beforeEach(() => {
    mockGetFirstAsync.mockResolvedValue(trialRow());
  });

  it('writes the total, the stamp, the vet flag and the ORIGINAL, and re-arms the push', async () => {
    await changeTrialWindow({
      trialId: 't-1', targetDurationDays: 84, vetDirected: true, now: NOW,
    });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('target_duration_days = ?');
    expect(sql).toContain('target_duration_set_at = ?');
    expect(sql).toContain('target_duration_vet_directed = ?');
    // COALESCE, not a bare assignment: migration 068's backfill cannot reach a
    // trial created after the apply, so `initial` may be NULL on a first change and
    // must capture the OLD target — and on a SECOND change must not move.
    expect(sql).toContain(
      'target_duration_days_initial = COALESCE(target_duration_days_initial, target_duration_days)',
    );
    expect(params).toEqual([84, NOW.toISOString(), 1, NOW.toISOString(), 't-1']);
    expect(sql).toContain('synced = 0');
    expect(sql).toContain('sync_attempts = 0');
    expect(sql).toContain('sync_error = NULL');
    // C-23: markSynced matches on `updated_at`, so a re-queueing write that left it
    // still would strand an owner edit made inside the network gap at synced = 1.
    expect(sql).toContain('updated_at = ?');
    expect(mockSyncTrials).toHaveBeenCalled();
  });

  it('changes the SAME row — never a second trial (TE-1)', async () => {
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).toContain('UPDATE diet_trials');
    expect(sql.toUpperCase()).not.toContain('INSERT');
    expect(sql).toContain('WHERE id = ?');
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
  });

  it('never touches status, started_at, ended_at or the allowed set', async () => {
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).not.toContain('status =');
    expect(sql).not.toContain('started_at =');
    expect(sql).not.toContain('ended_at =');
    expect(mockSyncTrialFoods).not.toHaveBeenCalled();
  });

  it('coerces the vet flag to 1 / 0 / NULL, and silence is NOT false', async () => {
    // Three states on the way down, because §5.1 needs NULL and false to mean the
    // same thing DOWNSTREAM without the write path inventing either. `toBeNull`
    // rather than a falsy check — that is the whole distinction.
    for (const [given, stored] of [[true, 1], [false, 0]] as const) {
      mockRunAsync.mockClear();
      await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, vetDirected: given });
      expect((mockRunAsync.mock.calls[0] as [string, unknown[]])[1][2]).toBe(stored);
    }
    mockRunAsync.mockClear();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    expect((mockRunAsync.mock.calls[0] as [string, unknown[]])[1][2]).toBeNull();
  });

  it('re-stamps the vet flag on every change, so a stale `true` cannot outlive it', async () => {
    // The three columns describe the LAST move, the scope `set_at` has. Leaving a
    // previous `true` behind an untagged change would have the report attribute to
    // a vet a window the vet never named — the one assertion §5.1 forbids outright.
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, vetDirected: null });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('target_duration_vet_directed = ?');
    expect(params[2]).toBeNull();
  });

  describe('forward-only (TE-3 / D3a), refused in the predicate', () => {
    const refusal = async (target: number, row = trialRow()): Promise<TrialWindowRefused> => {
      mockGetFirstAsync.mockResolvedValue(row);
      try {
        await changeTrialWindow({ trialId: 't-1', targetDurationDays: target });
      } catch (e) {
        return e as TrialWindowRefused;
      }
      throw new Error(`changeTrialWindow accepted ${target} — it must not`);
    };

    it('refuses a SHORTER window — §5.2 is closed by construction, not by a render rule', async () => {
      // The executed case: 56 → 28 on day 28, then "This trial is done", and
      // render.ts:3948 prints "Ran its course — the full window was completed" over
      // a trial abandoned at four weeks.
      const e = await refusal(28, trialRow({ started_at: dayKeyDaysAgo(27) }));
      expect(e).toBeInstanceOf(TrialWindowRefused);
      expect(e.reason).toBe('not_forward');
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('refuses the NO-OP re-save, which would otherwise stamp a move that never happened', async () => {
      // `target_duration_set_at IS NOT NULL` is the predicate every reader switches
      // on, so a stamp with no change is a false clinical claim, not a spare write.
      const e = await refusal(56);
      expect(e.reason).toBe('not_forward');
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('in overrun the DAY counter is the binding half, above the target', async () => {
      // Day 61 of 56. 58 clears the target floor and is still backwards from where
      // the owner actually is — `nextTargetDays`' own criterion, enforced here.
      const overrun = trialRow({ started_at: dayKeyDaysAgo(60) });
      const e = await refusal(58, overrun);
      expect(e.reason).toBe('not_forward');
      expect(e.floorDays).toBe(61);
      expect(e.dayCounter).toBe(61);
      expect(e.currentTargetDays).toBe(56);

      mockRunAsync.mockClear();
      mockGetFirstAsync.mockResolvedValue(overrun);
      await changeTrialWindow({ trialId: 't-1', targetDurationDays: 62 });
      expect(mockRunAsync).toHaveBeenCalledTimes(1);
    });

    it('hands the caller structured fields to render from, never a message to display', async () => {
      // `guards/ownerFacingCopy.test.ts` forbids a display sink reading a string off
      // an error, so the sheet phrases "Nyx is already on day 53" from these.
      const e = await refusal(50);
      expect(e.dayCounter).toBe(53);
      expect(e.currentTargetDays).toBe(56);
      expect(e.floorDays).toBe(56);
      expect(e.requestedDays).toBe(50);
    });

    it('refuses a trial it cannot find, and one that has ended', async () => {
      mockGetFirstAsync.mockResolvedValue(null);
      await expect(changeTrialWindow({ trialId: 'gone', targetDurationDays: 84 }))
        .rejects.toMatchObject({ reason: 'not_found' });

      const ended = await refusal(84, trialRow({ status: 'completed', ended_at: dayKeyDaysAgo(1) }));
      expect(ended.reason).toBe('not_running');
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('refuses NaN rather than writing it', async () => {
      const e = await refusal(Number.NaN);
      expect(e.reason).toBe('not_forward');
      expect(mockRunAsync).not.toHaveBeenCalled();
    });
  });

  it('throws when the by-id UPDATE matches nothing, rather than resolving silently', async () => {
    // C-39: a local UPDATE … WHERE id = ? that matches nothing resolves
    // { changes: 0 } and says nothing. The SELECT above makes it near-impossible,
    // which is exactly why it is worth asserting rather than assuming.
    mockRunAsync.mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 });
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 }))
      .rejects.toMatchObject({ reason: 'not_found' });
  });

  it('bumps the hydration tick so the Home strip re-reads, not just the writer (B-534)', async () => {
    const before = useSyncStore.getState().hydrationTick;
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84 });
    expect(useSyncStore.getState().hydrationTick).toBe(before + 1);
  });
});

describe('extendTrial delegates to changeTrialWindow — one clamp, two doors (CUL-1039)', () => {
  beforeEach(() => {
    mockGetFirstAsync.mockResolvedValue(trialRow());
  });

  it('records provenance on the MILESTONE path too, with the vet flag silent', async () => {
    // §5.1's own worked sentence — "extended from 56 days on 19 Sep (day 56)" —
    // describes the milestone tap, and TE-4 is unconditional. A milestone extension
    // that recorded nothing would leave the only door that exists today writing the
    // byte-identical row TE-4 exists to stop. The flag is null BY CONSTRUCTION: the
    // milestone is a named default with no box to check, and silence is the honest
    // record of that.
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('target_duration_set_at = ?');
    expect(sql).toContain(
      'target_duration_days_initial = COALESCE(target_duration_days_initial, target_duration_days)',
    );
    expect(params[0]).toBe(84);
    expect(params[2]).toBeNull();
  });

  it('inherits the forward-only refusal, which nextTargetDays can never trip', async () => {
    // THE CLAIM BEHIND THE DELEGATION. §5.6 already swept "strictly above the
    // current DAY"; the half this PR adds is "strictly above the current TARGET",
    // and both must hold or the milestone would start refusing its own arithmetic.
    //
    // DRIVEN THROUGH THE REAL WRITE PATH, not re-derived. The first version of this
    // test asserted `next <= Math.max(currentTargetDays, dayCounter)` — which is the
    // production floor restated, i.e. a tautology with fixtures, under a comment
    // claiming it was not one (C-34, caught by the adversarial pass). The floor has
    // to be exercised by something that does not know it, so this calls
    // `extendTrial` and counts refusals.
    const refused: string[] = [];
    for (const target of [1, 7, 14, 28, 42, 56, 84, 112]) {
      for (const elapsed of [0, 1, 6, 13, 27, 41, 55, 60, 83, 139]) {
        for (const indication of ['gi', 'skin', null] as const) {
          mockGetFirstAsync.mockResolvedValue(
            trialRow({ started_at: dayKeyDaysAgo(elapsed), target_duration_days: target }),
          );
          try {
            await extendTrial({
              trialId: 't-1',
              targetDurationDays: nextTargetDays({
                currentTargetDays: target,
                dayCounter: elapsed + 1,
                extraDays: extensionDays(indication),
              }),
            });
          } catch (e) {
            refused.push(`${target}/${elapsed + 1}/${indication}: ${(e as TrialWindowRefused).reason}`);
          }
        }
      }
    }
    expect(refused).toEqual([]);
  });

  it('still refuses a nonsense target rather than writing it', async () => {
    for (const bad of [0, -5, Number.NaN]) {
      await expect(extendTrial({ trialId: 't-1', targetDurationDays: bad })).rejects.toThrow();
    }
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});

describe('setTrialTargetProtein — B-704 the write path', () => {
  const NOW = new Date('2026-08-05T10:00:00.000Z');

  it('writes a canonical key with a set_at stamp, and re-arms the push', async () => {
    await setTrialTargetProtein({ trialId: 't-1', protein: 'rabbit', now: NOW });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE diet_trials');
    expect(sql).toContain('target_protein = ?');
    expect(sql).toContain('target_protein_set_at = ?');
    // TG-4: a canonical key lands, with the paired non-null stamp.
    expect(params[0]).toBe('rabbit');
    expect(params[1]).toBe('2026-08-05T10:00:00.000Z');
    expect(params[3]).toBe('t-1');
    // The mirror's re-arm contract, same as every other trial write.
    expect(sql).toContain('synced = 0');
    expect(sql).toContain('sync_attempts = 0');
    expect(sql).toContain('sync_error = NULL');
  });

  it('canonicalizes a raw label rather than storing it verbatim (TG-4)', async () => {
    await setTrialTargetProtein({ trialId: 't-1', protein: 'Rabbit', now: NOW });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    // A raw label never lands in the column — Class-A canonicalization on write.
    expect(params[0]).toBe('rabbit');
  });

  it('writes NULL protein AND NULL set_at when cleared (the paired-null contract, §5)', async () => {
    await setTrialTargetProtein({ trialId: 't-1', protein: null, now: NOW });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    // set_at is null whenever protein is null — never a stamp over a null value.
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
  });

  it('collapses an unusable value (junk/empty) to the null branch, never a junk key', async () => {
    // `canonicalizeProtein` returns null for the PROTEIN_JUNK set, so a cleared or
    // unusable value naturally lands as null + null — the picker never sends these,
    // but the write path holds the contract regardless.
    await setTrialTargetProtein({ trialId: 't-1', protein: 'unknown', now: NOW });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
  });

  it('NEVER touches status, started_at, or the allowed set (TG-1: it only names)', async () => {
    await setTrialTargetProtein({ trialId: 't-1', protein: 'rabbit', now: NOW });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).not.toContain('status =');
    expect(sql).not.toContain('started_at =');
    expect(sql).not.toContain('ended_at =');
    expect(sql.toUpperCase()).not.toContain('INSERT');
    expect(sql).toContain('WHERE id = ?');
  });

  it('bumps the hydration tick so BOTH the card and the Home strip re-read', async () => {
    const before = useSyncStore.getState().hydrationTick;
    await setTrialTargetProtein({ trialId: 't-1', protein: 'rabbit', now: NOW });
    expect(useSyncStore.getState().hydrationTick).toBe(before + 1);
  });
});

describe('getActiveTrialForPet', () => {
  it('reads the local mirror and prefers the row the server accepted', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({
      id: 't-1', started_at: '2026-07-03', target_duration_days: 56, food_label: 'Zignature Kangaroo Formula',
    });
    const trial = await getActiveTrialForPet('pet-1');
    expect(trial).toEqual({
      id: 't-1', startedAt: '2026-07-03', targetDurationDays: 56,
      foodLabel: 'Zignature Kangaroo Formula',
    });
    const [sql, params] = mockGetFirstAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM diet_trials');
    // The split-brain rule: the row the server has wins the display.
    expect(sql).toContain('ORDER BY t.synced DESC');
    expect(params).toEqual(['pet-1']);
  });

  it('returns null when the pet has no active trial', async () => {
    expect(await getActiveTrialForPet('pet-1')).toBeNull();
  });
});

// ── B-534 — the two freshness contracts ─────────────────────────────────────

describe('every trial write bumps the hydration tick (B-534)', () => {
  // The Pet-tab card and the Home strip are two independent `useDietTrial`
  // instances; only the writing screen gets a host `reload()`. The tick is how
  // the OTHER surface learns the trial changed, so it is part of the write's
  // contract — a future write path that skips it re-opens the stale-strip bug.
  const tick = () => useSyncStore.getState().hydrationTick;

  it('startDietTrial notifies', async () => {
    const before = tick();
    await startDietTrial(input());
    expect(tick()).toBe(before + 1);
  });

  // DR-3 (§4): starting a trial re-surfaces the Daily Recap offer for its value
  // moment. The once-ever / lift-quiet logic is tested in dailyRecapOffer.test.ts;
  // this pins that the write path actually fires it (the notifyTrialChanged rationale
  // — a future caller won't know to).
  it('startDietTrial re-surfaces the Daily Recap offer (trial value moment)', async () => {
    await startDietTrial(input());
    expect(mockSurfaceOffer).toHaveBeenCalledWith('trial');
  });

  it('endActiveTrial notifies', async () => {
    const before = tick();
    await endActiveTrial({ trialId: 't-1', reason: 'completed' });
    expect(tick()).toBe(before + 1);
  });

  it('extendTrial notifies', async () => {
    // Since CUL-1039 it reads the row before it writes, so the row has to exist —
    // the refusal below is the SAME suite's other half and needs no row at all.
    mockGetFirstAsync.mockResolvedValue(trialRow());
    const before = tick();
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    expect(tick()).toBe(before + 1);
  });

  it('changeTrialWindow notifies', async () => {
    mockGetFirstAsync.mockResolvedValue(trialRow());
    const before = tick();
    await changeTrialWindow({ trialId: 't-1', targetDurationDays: 84, vetDirected: true });
    expect(tick()).toBe(before + 1);
  });

  it('a refused window change does NOT notify — nothing changed', async () => {
    mockGetFirstAsync.mockResolvedValue(trialRow());
    const before = tick();
    await expect(changeTrialWindow({ trialId: 't-1', targetDurationDays: 56 })).rejects.toThrow();
    expect(tick()).toBe(before);
  });

  it('a refused extension does NOT notify — nothing changed', async () => {
    const before = tick();
    await expect(extendTrial({ trialId: 't-1', targetDurationDays: 0 })).rejects.toThrow();
    expect(tick()).toBe(before);
  });
});

// B-534's report gate is `flushBeforeReport` in lib/pdf.ts, tested there — a
// trial-scoped count briefly lived here and was removed by the adversarial pass
// (the scoping was the defect; see the note in dietTrialSetup.ts).

// ── Screen D — the ordered second-trial gate ────────────────────────────────

describe('stopReasonOptions', () => {
  const running = { id: 't', startedAt: '2026-07-03', targetDurationDays: 56, foodLabel: 'X' };
  const nowMidTrial = new Date(2026, 6, 25).getTime(); // day 23 of 56

  it('withholds "it ran its course" mid-trial', () => {
    expect(describeActiveTrial(running, nowMidTrial)).toEqual({ dayLine: 'Day 23 of 56', complete: false });
    const values = stopReasonOptions('Biscuit', false).map((o) => o.value);
    // Offering it would write `completed` over an abandoned trial and destroy the
    // stopped_reason a vet prescribes differently from.
    expect(values).not.toContain('completed');
    // PR 6 widened this to §4.3's six, and the widening is the point: two lists
    // would be two vocabularies in one TEXT column a clinician reads verbatim.
    // All three tokens PR 3 shipped are still in it, so nothing already stored is
    // orphaned.
    expect(values).toEqual([
      'refused', 'cost', 'too_hard', 'vet_advised', 'symptoms_resolved', 'other',
    ]);
  });

  it('offers it once the trial has reached its target', () => {
    const done = describeActiveTrial(running, new Date(2026, 7, 27).getTime());
    expect(done.complete).toBe(true);
    expect(stopReasonOptions('Biscuit', true).map((o) => o.value)[0]).toBe('completed');
  });

  it('keeps `refused` a stable token — PR 6/7 route it to the intake lane', () => {
    const refused = stopReasonOptions('Biscuit', false).find((o) => o.value === 'refused');
    expect(refused?.label).toBe('Biscuit wouldn’t eat it');
  });
});

describe('secondTrialIntro', () => {
  it('names the running trial and why it blocks the new one', () => {
    const line = secondTrialIntro(
      'Biscuit',
      { id: 't', startedAt: '2026-07-03', targetDurationDays: 56, foodLabel: 'Zignature Kangaroo Formula' },
      new Date(2026, 6, 25).getTime(),
    );
    expect(line).toContain('Zignature Kangaroo Formula');
    expect(line).toContain('day 23 of 56');
    expect(line).toContain('one trial at a time');
  });
});

// ── LOCKED copy ─────────────────────────────────────────────────────────────

describe('locked copy', () => {
  it('the C6 disclosure names the itemisation, the dates and the audience', () => {
    expect(TRIAL_RECORD_DISCLOSURE).toBe(
      'While the trial runs, Culprit records which feedings matched the trial diet and ' +
      'which didn’t, with dates. That’s the part your vet needs.',
    );
  });

  it('the two setup lines are addressed to the pet by name', () => {
    const [everyone, oral] = trialSetupLines('Biscuit');
    expect(everyone).toContain('Everyone who feeds Biscuit');
    expect(oral).toContain('flavoured chewables');
  });

  it('renders no negative claim about the world (R1 is two-sided)', () => {
    // G2 is a RULE, not a threshold: the negative claim is deleted from the
    // product at every coverage on every surface. Nothing this PR ships may
    // assert an absence.
    const strings = [
      TRIAL_RECORD_DISCLOSURE,
      ...trialSetupLines('Biscuit'),
      durationHelperLine('skin', 56, '2026-07-25', '2026-09-18'),
    ].join(' ').toLowerCase();
    expect(strings).not.toContain('no off-diet');
    expect(strings).not.toContain('clean');
    expect(strings).not.toContain('compliance');
  });
});

describe('foodLabel / permittedRoleForFood', () => {
  it('joins brand and product, and treats are treats', () => {
    expect(foodLabel({ brand: 'Zignature', product_name: 'Kangaroo Formula' }))
      .toBe('Zignature Kangaroo Formula');
    expect(permittedRoleForFood('treat')).toBe('permitted_treat');
    expect(permittedRoleForFood(null)).toBe('permitted_other');
  });
});

// ── The mid-trial add (B-616 PR 1, FR-12 / D5) ──────────────────────────────

describe('addTrialFood', () => {
  const AT = new Date('2026-07-31T09:15:00Z');

  it('opens membership TODAY, not at the trial start — an add never rewrites history', async () => {
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT });

    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO diet_trial_foods');
    // `allowed_from` is the 7th bind. Today — so the twelve feedings of this food
    // before today keep the reading they already have, and the exposure count
    // does not silently fall.
    expect(params[6]).toBe(toLocalDayKey(AT));
  });

  it('AC4 — the row byte-matches the one buildTrialRows writes for the same food', async () => {
    // The start modal and the add sheet write the same row for the same vet.
    const rows = buildTrialRows(
      input({ permittedFoods: [JERKY], startedAt: toLocalDayKey(AT) }),
      AT.toISOString(),
    );
    const built = rows.foods.find((f) => f.food_item_id === JERKY.id);

    await addTrialFood({ trialId: rows.trial.id, petId: 'pet-1', food: JERKY, now: AT });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];

    // Everything but the row's own id, which is a fresh uuid either way.
    expect(params.slice(1)).toEqual([
      built!.diet_trial_id, built!.pet_id, built!.food_item_id, built!.role,
      built!.food_label, built!.allowed_from, built!.created_at, built!.updated_at,
    ]);
  });

  it('infers the role from the food and can never write a diet-defining row', async () => {
    // §5.5 D-A: a mid-trial add is a vet-sanctioned EXTRA. Letting this path
    // write `primary_diet` would widen the sanctioned protein comparator from a
    // screen whose whole copy is "your vet said this is OK".
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT });
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: DRY, now: AT });
    const roles = mockRunAsync.mock.calls.map(([, p]) => (p as unknown[])[4]);
    expect(roles).toEqual(['permitted_treat', 'permitted_other']);
    expect(roles).not.toContain('primary_diet');
  });

  it('writes unsynced with no error, and binds one parameter per placeholder', async () => {
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    // The mirror's contract for every local mutation — a row inserted at
    // synced = 1 never reaches the server at all.
    expect(sql).toContain('0, NULL');
    expect((params as unknown[]).length).toBe((sql.match(/\?/g) ?? []).length);
  });

  it('denormalizes the label at write time — the row outlives the food', async () => {
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT });
    const [, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBe('Real Meat Kangaroo Jerky');
  });

  it('bumps the hydration tick so the surfaces rendering the list re-read', async () => {
    const before = useSyncStore.getState().hydrationTick;
    await addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT });
    expect(useSyncStore.getState().hydrationTick).toBeGreaterThan(before);
  });

  it('still writes locally when the flush fails — offline is the target case', async () => {
    mockSyncTrialFoods.mockRejectedValueOnce(new Error('offline'));
    await expect(
      addTrialFood({ trialId: 't-1', petId: 'pet-1', food: JERKY, now: AT }),
    ).resolves.toEqual(expect.any(String));
    await flush();
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    expect(mockSyncTrialFoods).toHaveBeenCalled();
  });
});

// ── CUL-901 (VV-3) — the visit link ─────────────────────────────────────────
//
// Provenance, and nothing else: it records WHERE a trial came from and never moves
// one of its numbers (CUL-746 — one population, one owner; TG-5 — a link never moves
// a date). What is worth pinning is that it rides the trial's OWN insert.

describe('startDietTrial — the vet-visit link', () => {
  it('writes vet_visit_id in the trial’s own INSERT, inside the transaction', async () => {
    await startDietTrial(input({ vetVisitId: 'visit-7' }));

    // The parent insert is the first statement inside the transaction.
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/^\s*INSERT INTO diet_trials/);
    expect(sql).toMatch(/vet_visit_id/);
    expect(params).toContain('visit-7');

    // NEVER a follow-up UPDATE. VV-4 links a trial it starts from the after-visit
    // screen, and a second write is one a crash between the two can drop — leaving a
    // trial whose provenance silently differs from what the owner was just shown.
    const updates = mockRunAsync.mock.calls.filter(([q]: [string]) =>
      /\bUPDATE\s+diet_trials\s+SET\b/i.test(q),
    );
    expect(updates).toEqual([]);
  });

  // CUL-945 — the link is refused ON THE DEVICE when it is not this pet's.
  //
  // The blast radius is why this is not a nicety: `23514` is TERMINAL, so the first
  // push quarantines the WHOLE TRIAL — the parent AND the allowed-food set that
  // decides what counts as off-diet — while the client goes on scoring meals against
  // a trial the server never recorded. Refused before the transaction opens, so
  // nothing partial can land.
  it('refuses another pet’s visit, and opens no transaction at all', async () => {
    await expect(
      startDietTrial(input({ vetVisitId: 'visit-other' })),
    ).rejects.toBeInstanceOf(VetVisitLinkRefused);
    expect(mockWithTransactionAsync).not.toHaveBeenCalled();
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('refuses a soft-deleted visit, which the server would refuse too', async () => {
    await expect(
      startDietTrial(input({ vetVisitId: 'visit-gone' })),
    ).rejects.toBeInstanceOf(VetVisitLinkRefused);
    expect(mockWithTransactionAsync).not.toHaveBeenCalled();
  });

  it('asks nothing when no link is passed — the Pet-tab path pays no read', async () => {
    await startDietTrial(input());
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });

  it('stores NULL on the Pet-tab path, where no visit exists', async () => {
    expect(buildTrialRows(input(), '2026-07-03T10:00:00.000Z').trial.vet_visit_id).toBeNull();
  });

  it('normalises an explicit null the same way as an absent field', async () => {
    // Two callers, one row shape: VV-4 may pass the link through as `null` rather
    // than omitting the key.
    expect(
      buildTrialRows(input({ vetVisitId: null }), '2026-07-03T10:00:00.000Z').trial.vet_visit_id,
    ).toBeNull();
  });

  it('placeholder count still matches the column list', async () => {
    // The failure mode a string assertion misses: adding a column and forgetting its
    // `?` silently shifts every parameter after it, so `created_at` lands in
    // `updated_at` and the LWW comparison starts reading the wrong clock.
    await startDietTrial(input({ vetVisitId: 'visit-7' }));
    const [sql, params] = mockRunAsync.mock.calls[0];
    const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').length;
    const placeholders = (sql.slice(sql.indexOf('VALUES')).match(/\?/g) ?? []).length;
    // Two columns are written as literals (`synced`, `sync_error`), so the bound
    // parameters are the rest.
    expect(placeholders).toBe(columns - 2);
    expect(params).toHaveLength(placeholders);
  });
});
