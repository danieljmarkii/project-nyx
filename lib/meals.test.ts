// B-059 regression guard. The bug this helper exists to kill was a *missing*
// side-effect (the AI-Signal regen) on two of the three meal entry points. So
// the test that matters most asserts insertMeal fires ALL of the side-effects —
// the durable writes, the sync push, and triggerSignalRegenDebounced — for a
// single call. If a future edit drops one, this fails.
//
// jest hoists jest.mock() above the imports, so any variable a factory closes
// over must be `mock`-prefixed (jest's escape hatch for the no-out-of-scope rule).

const mockRunAsync = jest.fn().mockResolvedValue(undefined);
// withTransactionAsync runs its callback immediately (the real one wraps it in
// BEGIN/COMMIT); the tests assert both that the callback's writes land and WHICH
// writes are inside it (B-126).
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => { await cb(); });
const mockUpdateMealIntake = jest.fn().mockResolvedValue(undefined);
const mockGetEventPetId = jest.fn().mockResolvedValue('pet-1');
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: mockRunAsync, withTransactionAsync: mockWithTransactionAsync }),
  updateMealIntake: (...a: unknown[]) => mockUpdateMealIntake(...a),
  getEventPetId: (...a: unknown[]) => mockGetEventPetId(...a),
}));

const mockSyncPendingEvents = jest.fn().mockResolvedValue(undefined);
const mockSyncPendingMeals = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingEvents: (...a: unknown[]) => mockSyncPendingEvents(...a),
  syncPendingMeals: (...a: unknown[]) => mockSyncPendingMeals(...a),
}));

const mockTriggerSignalRegenDebounced = jest.fn();
jest.mock('./signal', () => ({
  triggerSignalRegenDebounced: (...a: unknown[]) => mockTriggerSignalRegenDebounced(...a),
}));

let mockIdCounter = 0;
jest.mock('./utils', () => ({
  uuid: () => `id-${++mockIdCounter}`,
}));

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from '../guards/blankComments';
import { insertMeal, rateMealIntake } from './meals';
import { useSyncStore } from '../store/syncStore';

// Lets the fire-and-forget syncPendingEvents().then(syncPendingMeals) chain
// settle so we can assert the second call landed. A bare Promise.resolve() is
// insufficient: the .then(syncPendingMeals) callback is itself a microtask
// queued after syncPendingEvents()'s promise resolves, so we need a macrotask
// (setTimeout 0) to drain past it.
const flush = () => new Promise((r) => setTimeout(r, 0));

const PARAMS = {
  petId: 'pet-1',
  foodId: 'food-1',
  occurredAt: new Date('2026-06-07T08:00:00.000Z'),
  occurredAtSource: 'now' as const,
};

beforeEach(() => {
  // mockReset (not mockClear) so a `…Once` queued by one test cannot leak into
  // the next; the base resolved value is re-established right after.
  mockRunAsync.mockReset();
  mockRunAsync.mockResolvedValue(undefined);
  mockWithTransactionAsync.mockClear();
  mockSyncPendingEvents.mockClear();
  mockSyncPendingMeals.mockClear();
  mockTriggerSignalRegenDebounced.mockClear();
  mockUpdateMealIntake.mockReset();
  mockUpdateMealIntake.mockResolvedValue(undefined);
  mockGetEventPetId.mockReset();
  mockGetEventPetId.mockResolvedValue('pet-1');
  mockIdCounter = 0;
});

describe('insertMeal', () => {
  it('fires every side-effect: event+meal+cache write, sync push, signal regen', async () => {
    await insertMeal(PARAMS);
    await flush();

    const sql = mockRunAsync.mock.calls.map((c) => c[0] as string);
    expect(sql.some((s) => /INSERT INTO events/.test(s))).toBe(true);
    expect(sql.some((s) => /INSERT INTO meals/.test(s))).toBe(true);
    expect(sql.some((s) => /UPDATE food_items_cache SET last_used_at/.test(s))).toBe(true);

    // The §2-freshness side-effect that drifted in B-059 — the whole point.
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-1');

    // Push order: events before meals (meals FK → events.id).
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingMeals).toHaveBeenCalledTimes(1);
  });

  it('writes the event as a witnessed meal with the given occurrence time + source', async () => {
    await insertMeal(PARAMS);

    const eventCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO events/.test(c[0] as string))!;
    const sql = eventCall[0] as string;
    const args = eventCall[1] as unknown[];
    // Meals are always witnessed (no found-path window).
    expect(sql).toMatch(/'witnessed'/);
    // Placeholders === params — guards against the B-057 INSERT-drift class.
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
    expect(args).toEqual(['id-1', 'pet-1', '2026-06-07T08:00:00.000Z', 'now', expect.any(String), expect.any(String)]);
  });

  it('returns the ids + timestamps the caller needs for prependEvent/toast', async () => {
    const res = await insertMeal(PARAMS);
    expect(res.eventId).toBe('id-1');
    expect(res.mealId).toBe('id-2');
    expect(res.occurredAtIso).toBe('2026-06-07T08:00:00.000Z');
    expect(typeof res.now).toBe('string');
  });

  // B-126. A meal is an event + its 1:1 child; a half-write would sync an
  // orphaned event_type='meal' row with no food, quantity or intake rating — a
  // meal the record asserts happened but can say nothing about. These two tests
  // pin the atomicity: what is inside the transaction, and that a failure is not
  // swallowed into a fire-and-forget push of a meal that does not exist.
  it('writes the event + meal rows inside ONE transaction, cache touch outside', async () => {
    const inTxn: string[] = [];
    mockWithTransactionAsync.mockImplementationOnce(async (cb: () => Promise<void>) => {
      const before = mockRunAsync.mock.calls.length;
      await cb();
      inTxn.push(...mockRunAsync.mock.calls.slice(before).map((c) => c[0] as string));
    });

    await insertMeal(PARAMS);

    expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    expect(inTxn.some((s) => /INSERT INTO events/.test(s))).toBe(true);
    expect(inTxn.some((s) => /INSERT INTO meals/.test(s))).toBe(true);
    // The local-only recency stamp stays OUT: rolling back a correctly-written
    // meal because a cosmetic picker-ordering touch failed trades a real loss
    // for a cosmetic one.
    expect(inTxn.some((s) => /food_items_cache/.test(s))).toBe(false);
  });

  it('survives a failed recency touch: the committed meal still pushes and regens', async () => {
    // Event + meal INSERTs succeed (the transaction commits), then the cosmetic
    // cache touch throws. The meal exists durably, so the follow-through must
    // still run — and the caller must not see a failure for a meal that landed.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRunAsync
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cache table missing'));

    const res = await insertMeal(PARAMS);
    await flush();

    expect(res.mealId).toBe('id-2');
    expect(mockSyncPendingEvents).toHaveBeenCalledTimes(1);
    expect(mockSyncPendingMeals).toHaveBeenCalledTimes(1);
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-1');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('propagates a failed child INSERT and pushes nothing (rolled-back meal)', async () => {
    // Event INSERT succeeds, meal INSERT throws — the exact half-write shape.
    mockRunAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));

    await expect(insertMeal(PARAMS)).rejects.toThrow('disk full');
    await flush();

    // The real withTransactionAsync rolls the event back on the throw; what this
    // helper must not do is fire the sync push or the Signal regen for a meal
    // that no longer exists locally.
    expect(mockSyncPendingEvents).not.toHaveBeenCalled();
    expect(mockSyncPendingMeals).not.toHaveBeenCalled();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  it('meal INSERT placeholder count matches its param count (B-057 drift guard)', async () => {
    await insertMeal(PARAMS);
    const mealCall = mockRunAsync.mock.calls.find((c) => /INSERT INTO meals/.test(c[0] as string))!;
    const sql = mealCall[0] as string;
    const args = mealCall[1] as unknown[];
    expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
  });

  // ── intake_rating on the INSERT (CUL-870) ─────────────────────────────────
  //
  // The count guard above cannot see this: two adjacent params swapped keeps the count
  // identical, and every consumer of `intake_rating` is clinical (`intake_decline`,
  // `feline_reduced_intake`, the report, the trial's refusal register). So the VALUE is
  // asserted at its own column position, in both directions.
  const mealInsert = () => {
    const call = mockRunAsync.mock.calls.find((c) => /INSERT INTO meals/.test(c[0] as string))!;
    const sql = call[0] as string;
    const columns = (sql.match(/\(([^)]*)\)\s*VALUES/i)![1] as string)
      .split(',')
      .map((c) => c.trim());
    const args = call[1] as unknown[];
    // `quantity` is the one literal in the VALUES list, so a column's arg index is its
    // position minus the literals before it — derived rather than hardcoded, so this
    // survives a column being added.
    const values = (sql.match(/VALUES\s*\(([^)]*)\)/i)![1] as string).split(',').map((v) => v.trim());
    const at = (column: string) => {
      const col = columns.indexOf(column);
      const placeholdersBefore = values.slice(0, col).filter((v) => v === '?').length;
      expect(values[col]).toBe('?');
      return args[placeholdersBefore];
    };
    return { at };
  };

  it('writes the intake rating the caller passed, at the intake_rating column', async () => {
    await insertMeal({ ...PARAMS, intakeRating: 'refused' });
    const { at } = mealInsert();
    expect(at('intake_rating')).toBe('refused');
    // The neighbours, so a swap cannot pass by putting 'refused' somewhere plausible.
    expect(at('pet_id')).toBe(PARAMS.petId);
    expect(at('food_item_id')).toBe(PARAMS.foodId);
  });

  it('defaults to NULL, so the three pre-door callers are unchanged', async () => {
    // The picker, the FAB and photo capture all omit it and ask afterwards on the
    // completion card. An accidental default of anything else would pre-stamp an intake
    // claim on every meal in the app — the exact thing B-014 forbids.
    await insertMeal(PARAMS);
    expect(mealInsert().at('intake_rating')).toBeNull();
  });
});

// ── A rating given after the fact (CUL-1087) ────────────────────────────────────
//
// Owners often log the bowl first and rate it later, on the completion card, the
// meal's own screen or the edit screen. All three wrote `intake_rating` and none
// refreshed the Signal, so a rating that turned a cat's breakfast into a decline
// stayed off Home until something else happened to rebuild it.
describe('rateMealIntake', () => {
  it('writes the rating, pushes it, and refreshes the Signal for the RECORD\'s pet', async () => {
    mockGetEventPetId.mockResolvedValue('pet-9');
    await rateMealIntake('evt-1', 'picked');
    await flush();

    expect(mockUpdateMealIntake).toHaveBeenCalledWith('evt-1', 'picked');
    expect(mockSyncPendingMeals).toHaveBeenCalledTimes(1);
    // The meal's own pet, read off the row: a rating can be given from a screen
    // showing a pet who is not the active one (C-9).
    expect(mockGetEventPetId).toHaveBeenCalledWith('evt-1');
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-9');
  });

  it('refreshes on a CLEARED rating too, since that also changes what the engine reads', async () => {
    await rateMealIntake('evt-1', null);
    await flush();
    expect(mockUpdateMealIntake).toHaveBeenCalledWith('evt-1', null);
    expect(mockTriggerSignalRegenDebounced).toHaveBeenCalledWith('pet-1');
  });

  it('a failed write throws to the caller and refreshes nothing', async () => {
    mockUpdateMealIntake.mockRejectedValueOnce(new Error('No meal row for event evt-1'));
    await expect(rateMealIntake('evt-1', 'some')).rejects.toThrow('No meal row');
    await flush();
    expect(mockSyncPendingMeals).not.toHaveBeenCalled();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  it('a saved rating stays saved when the pet lookup fails: no throw, no refresh', async () => {
    // The write has landed by then, so a throw here would make every caller revert a
    // chip that is in fact on the record and say "Could not save".
    mockGetEventPetId.mockRejectedValueOnce(new Error('disk gone'));
    await expect(rateMealIntake('evt-1', 'most')).resolves.toBeUndefined();
    await flush();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  it('refreshes no pet when the row names none', async () => {
    mockGetEventPetId.mockResolvedValue(null);
    await rateMealIntake('evt-1', 'all');
    await flush();
    expect(mockTriggerSignalRegenDebounced).not.toHaveBeenCalled();
  });

  // CUL-1122 / CUL-1159: the rating decides what counts as eating, so a Refused given AFTER the
  // vomit must reach Home's timing line, which re-reads its feedings on `hydrationTick` only.
  it('a saved rating counts as a hydration, so Home re-reads the feedings it times vomits from', async () => {
    const before = useSyncStore.getState().hydrationTick;
    await rateMealIntake('evt-1', 'refused');
    expect(useSyncStore.getState().hydrationTick).toBe(before + 1);
    await rateMealIntake('evt-1', null); // clearing a rating changes what anchors too
    expect(useSyncStore.getState().hydrationTick).toBe(before + 2);
  });

  it('a failed write bumps nothing: no screen re-reads for a rating that was not saved', async () => {
    const before = useSyncStore.getState().hydrationTick;
    mockUpdateMealIntake.mockRejectedValueOnce(new Error('No meal row for event evt-1'));
    await expect(rateMealIntake('evt-1', 'refused')).rejects.toThrow('No meal row');
    expect(useSyncStore.getState().hydrationTick).toBe(before);
  });
});

describe('one write path for a rating (CUL-1087)', () => {
  // The drift B-059 closed for inserts, closed for ratings: a screen that writes
  // `updateMealIntake` itself skips the refresh, which is how all three did. Comments
  // are blanked first (C-18), so a sentence about the helper is not a use of it.
  const ROOT = path.resolve(__dirname, '..');
  const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'store', 'widgets', 'constants'];
  // The definition, and the one helper allowed to call it.
  const ALLOWED = new Set(['lib/db.ts', 'lib/meals.ts']);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
    }
    return out;
  }

  const namers = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
    .filter((abs) => /\bupdateMealIntake\b/.test(blankComments(fs.readFileSync(abs, 'utf8'))))
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'));

  it('finds the helper\'s own call, so an empty scan cannot pass', () => {
    expect(namers).toContain('lib/meals.ts');
    expect(namers).toContain('lib/db.ts');
  });

  it('no other file names updateMealIntake: it goes through rateMealIntake', () => {
    // Named, not just called: an import is a reach, and an alias would hide a call.
    expect(namers.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
