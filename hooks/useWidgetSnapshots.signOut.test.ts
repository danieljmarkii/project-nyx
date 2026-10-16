// CUL-1952 — a publish in flight at sign-out never writes the old account's pet.
//
// The hook debounces a publish; the effect cleanup clears a pending timer but not a
// pass already reading SQLite. Before the fence, that pass landed after
// `wipeLocalSession`'s clearWidgetData / clearWidgetTimeline, re-wrote the per-pet
// snapshot files and pushed a signed-in timeline: the previous owner's pet on a
// signed-out Home Screen, with no later publish to heal it.
//
// This suite drives the WHOLE chain with only the device edges faked: the hook, the
// real `publishWidgetSnapshots` over the production SQL on node:sqlite, the real
// `publishWidgetPass`, and the real fence. The App Group container is a recorder of
// file writes; the widget handle is a recorder of timeline pushes. The sign-out is
// `fenceWidgetPublish()`, the call `wipeLocalSession` makes first (its ordering is
// pinned in lib/session.test.ts), fired from inside the read a real sign-out lands in.

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const mockWrites: string[] = [];
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    write(): void {
      mockWrites.push(this.name);
    }
  },
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('../lib/db', () => ({ getDb: jest.fn(), softDeleteEvent: jest.fn() }));
jest.mock('../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));
jest.mock('../lib/appGroup', () => ({
  APP_GROUP_ID: 'group.test',
  getCaptureInboxDirectory: jest.fn(() => null),
  getSnapshotDirectory: jest.fn(() => ({ list: () => [] })),
  clearWidgetData: jest.fn(),
}));
jest.mock('../lib/widgetCapture', () => ({
  logMealIntent: jest.fn(),
  logTreatIntent: jest.fn(),
  topUpBowlIntent: jest.fn(),
}));

const PET = { id: 'pet-1', name: 'Pixel', species: 'cat' as const };
jest.mock('../store/petStore', () => ({
  usePetStore: Object.assign(() => ({ pets: [PET] }), {
    getState: () => ({ pets: [PET] }),
    subscribe: () => () => {},
  }),
}));
jest.mock('../store/eventStore', () => ({
  useEventStore: Object.assign(() => ({}), { subscribe: () => () => {} }),
}));
jest.mock('../store/syncStore', () => ({
  useSyncStore: Object.assign(() => ({}), { subscribe: () => () => {} }),
}));
let mockSession: unknown = { user: { id: 'user-1' } };
jest.mock('../store/authStore', () => ({
  useAuthStore: () => ({ session: mockSession }),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWidgetSnapshots } from './useWidgetSnapshots';
import { fenceWidgetPublish } from '../lib/widgetSnapshot';
import { __setWidgetHandleForTests, type WidgetHandle } from '../lib/widgetBridge';
import type { CulpritWidgetProps } from '../lib/widgetProps';
import { getDb } from '../lib/db';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from '../lib/localSchema';
import { MEDICATION_SCHEMA_SQL } from '../lib/medications';
import { DIET_TRIAL_SCHEMA_SQL } from '../lib/dietTrialMirror';

const { DatabaseSync } = require('node:sqlite');

describe('useWidgetSnapshots — sign-out mid-publish (CUL-1952)', () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let reads = 0;
  /** Fire the sign-out fence from inside the Nth SQLite read of the snapshot pass. */
  let signOutOnRead: number | null = null;
  /** Or from inside the residual-v1 drain's timeline read, before any SQLite read. */
  let signOutDuringDrain = false;
  /** Make the Nth SQLite read reject (the read a sign-out can break mid-wipe). */
  let rejectOnRead: number | null = null;
  let drainReads = 0;
  let pushed: CulpritWidgetProps[] = [];
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  function onRead() {
    reads += 1;
    if (reads === signOutOnRead) fenceWidgetPublish();
    if (reads === rejectOnRead) throw new Error('read failed mid-wipe');
  }

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec(BASE_SCHEMA_SQL);
    raw.exec(MEDICATION_SCHEMA_SQL);
    raw.exec(DIET_TRIAL_SCHEMA_SQL);
    await applyColumnUpgrades(async (sql: string) => {
      try {
        raw.exec(sql);
      } catch {
        /* a column one of the constants above already declares */
      }
    });
    // A meal today, so the snapshot the old account would leak is a real one.
    const iso = new Date().toISOString();
    raw
      .prepare(
        `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, notes,
                             source, created_at, updated_at, deleted_at, synced)
         VALUES ('meal-1', ?, 'meal', ?, 'witnessed', NULL, 'manual', ?, ?, NULL, 1)`,
      )
      .run(PET.id, iso, iso, iso);
    (getDb as jest.Mock).mockReturnValue({
      getAllAsync: async (sql: string, params: unknown[] = []) => {
        onRead();
        return raw.prepare(sql).all(...(params as never[]));
      },
      getFirstAsync: async (sql: string, params: unknown[] = []) => {
        onRead();
        return raw.prepare(sql).get(...(params as never[])) ?? null;
      },
    });

    reads = 0;
    signOutOnRead = null;
    signOutDuringDrain = false;
    rejectOnRead = null;
    mockSession = { user: { id: 'user-1' } };
    drainReads = 0;
    pushed = [];
    mockWrites.length = 0;
    warn.mockClear();
    const handle: WidgetHandle = {
      getTimeline: async () => {
        drainReads += 1;
        if (signOutDuringDrain) fenceWidgetPublish();
        return [];
      },
      updateTimeline: (entries) => entries.forEach((e) => pushed.push(e.props)),
    };
    __setWidgetHandleForTests(handle);
  });

  afterEach(() => {
    __setWidgetHandleForTests(null);
    raw.close();
  });

  afterAll(() => warn.mockRestore());

  /** Let the 1s debounce fire, then wait until the pass has run its reads and settled. */
  async function runOnePass() {
    renderHook(() => useWidgetSnapshots());
    await waitFor(() => expect(reads).toBeGreaterThan(0), { timeout: 3000 });
    // The pass is SQLite reads and synchronous writes: a few ticks settle it.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it('a publish in a live session writes the snapshot files and the signed-in timeline', async () => {
    await runOnePass();

    // Non-vacuity floor: the same fixture DOES write when nobody signs out.
    expect(mockWrites).toEqual(expect.arrayContaining([`${PET.id}.json`]));
    expect(mockWrites.length).toBeGreaterThanOrEqual(2); // the snapshot + the slot index
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.every((p) => p.signedIn)).toBe(true);
  });

  it('a sign-out landing while the snapshot read is pending writes neither files nor timeline', async () => {
    signOutOnRead = 1;
    await runOnePass();

    expect(reads).toBeGreaterThan(0); // the pass was in flight when the fence moved
    expect(mockWrites).toEqual([]);
    expect(pushed).toEqual([]);
    // A fenced pass is the sign-out doing its job, not a failure the log should carry.
    expect(warn).not.toHaveBeenCalledWith('[widgetSnapshots] publish failed:', expect.anything());
  });

  it('a sign-out landing on the LAST read, after every earlier one, still writes nothing', async () => {
    // Count a live pass's reads, then fence on the final one: the window just before
    // the first file write, where a check placed only at the top would miss it.
    await runOnePass();
    const total = reads;
    expect(total).toBeGreaterThan(1);

    reads = 0;
    mockWrites.length = 0;
    pushed = [];
    signOutOnRead = total;
    await runOnePass();

    expect(mockWrites).toEqual([]);
    expect(pushed).toEqual([]);
  });

  // rls-privacy-reviewer, attack 1: `_layout` runs `await wipeLocalSession()` BEFORE
  // `setSession(null)`, so the hook's effect (its timer, its subscriptions) is still
  // live through the wipe. A timer armed by a log a moment before sign-out fires
  // mid-wipe; it must start nothing, the residual drain included.
  it('a debounce timer pending when the wipe fences starts nothing, drain included', async () => {
    renderHook(() => useWidgetSnapshots());
    fenceWidgetPublish(); // the wipe begins with the session still set, timer armed
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300));
    });

    expect(drainReads).toBe(0);
    expect(reads).toBe(0);
    expect(mockWrites).toEqual([]);
    expect(pushed).toEqual([]);
  });

  // rls-privacy-reviewer, attack 2: a read that REJECTS as the fence moves skips the
  // in-loop check through the catch. The slot index it would then write keeps the old
  // pet's name as a tombstone the next account's first publish inherits.
  it('a last read that rejects as the fence moves still writes no slot index', async () => {
    await runOnePass();
    const total = reads;

    reads = 0;
    mockWrites.length = 0;
    pushed = [];
    signOutOnRead = total;
    rejectOnRead = total;
    await runOnePass();

    expect(mockWrites).toEqual([]);
    expect(pushed).toEqual([]);
  });

  // The fence must never outlive the session it fenced: the epoch is captured once per
  // session, so a regression here fails SILENTLY (the widget just stops updating for
  // the next account). Same hook instance, the `_layout` order: wipe, null, sign in.
  it('the next account signing in on the same hook publishes again', async () => {
    const { rerender } = renderHook(() => useWidgetSnapshots());
    fenceWidgetPublish(); // the wipe, session still set
    mockSession = null;
    rerender({});
    mockSession = { user: { id: 'user-2' } };
    rerender({});
    await waitFor(() => expect(pushed.length).toBeGreaterThan(0), { timeout: 3000 });

    expect(mockWrites).toEqual(expect.arrayContaining([`${PET.id}.json`]));
    expect(pushed.every((p) => p.signedIn)).toBe(true);
  });

  it('a sign-out landing during the residual drain, before any read, writes nothing', async () => {
    signOutDuringDrain = true;
    renderHook(() => useWidgetSnapshots());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300));
    });

    expect(mockWrites).toEqual([]);
    expect(pushed).toEqual([]);
  });
});
