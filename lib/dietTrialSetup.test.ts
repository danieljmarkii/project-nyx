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
// The real withTransactionAsync wraps the callback in BEGIN/COMMIT; running it
// inline keeps the assertions about WHAT is written while still proving the writes
// go through the transactional path (asserted directly below).
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
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

import {
  addTrialFood, buildTrialRows, canStartTrial, defaultDurationDays, describeActiveTrial,
  durationHelperLine, endActiveTrial, foodLabel, formatTrialEndDate,
  extendTrial, getActiveTrialForPet, permittedRoleForFood, secondTrialIntro, startDietTrial,
  stopReasonOptions, trialEndDayKey, trialSetupLines, TRIAL_RECORD_DISCLOSURE,
  type StartTrialInput,
} from './dietTrialSetup';
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
    ...overrides,
  };
}

beforeEach(() => {
  mockIdSeq = 0;
  mockRunAsync.mockClear();
  mockWithTransactionAsync.mockClear();
  mockGetFirstAsync.mockClear().mockResolvedValue(null);
  mockSyncTrials.mockClear();
  mockSyncTrialFoods.mockClear();
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

  it('kicks a flush so the ending row lands before any next trial starts', async () => {
    await endActiveTrial({ trialId: 't-1', reason: 'completed' });
    await flush();
    // syncPendingDietTrials pushes ENDING trials in its first pass, so freeing
    // the server's UNIQUE active index early is what keeps a subsequent start
    // from earning a terminal 23505.
    expect(mockSyncTrials).toHaveBeenCalled();
  });
});

describe('extendTrial — `Keep going`', () => {
  it('writes the new target and re-arms the push', async () => {
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('target_duration_days = ?');
    expect(params[0]).toBe(84);
    expect(sql).toContain('synced = 0');
    expect(sql).toContain('sync_error = NULL');
  });

  it('extends the SAME row — never a second trial', async () => {
    // One continuous window. A second row would split one clinical episode into
    // two, neither of which is the span the vet asked about, and §7 would render
    // the back half of an 84-day elimination as a 28-day trial.
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).toContain('UPDATE diet_trials');
    expect(sql.toUpperCase()).not.toContain('INSERT');
    expect(sql).toContain('WHERE id = ?');
  });

  it('never touches status, started_at or the allowed set', async () => {
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    const [sql] = mockRunAsync.mock.calls[0] as [string];
    expect(sql).not.toContain('status =');
    expect(sql).not.toContain('started_at =');
    expect(sql).not.toContain('ended_at =');
  });

  it('refuses a nonsense target rather than writing it', async () => {
    for (const bad of [0, -5, Number.NaN]) {
      await expect(extendTrial({ trialId: 't-1', targetDurationDays: bad })).rejects.toThrow();
    }
    expect(mockRunAsync).not.toHaveBeenCalled();
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

  it('endActiveTrial notifies', async () => {
    const before = tick();
    await endActiveTrial({ trialId: 't-1', reason: 'completed' });
    expect(tick()).toBe(before + 1);
  });

  it('extendTrial notifies', async () => {
    const before = tick();
    await extendTrial({ trialId: 't-1', targetDurationDays: 84 });
    expect(tick()).toBe(before + 1);
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
