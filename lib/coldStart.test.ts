// CUL-1214 — the cold-start wait's three rules, driven through the real module.
const mockWatermarks = new Map<string, string>();

jest.mock('./db', () => ({
  getWatermark: jest.fn(async (table: string) => mockWatermarks.get(table) ?? null),
  setWatermark: jest.fn(async (table: string, value: string) => {
    mockWatermarks.set(table, value);
  }),
}));

import {
  COLD_START_CEILING_MS,
  COLD_START_HYDRATED_KEY,
  hasHydratedRecord,
  holdColdStartWait,
  markRecordHydrated,
  shouldShowColdStartWait,
} from './coldStart';

beforeEach(() => mockWatermarks.clear());

describe('hydration is decided from the watermark, not a row count', () => {
  it('a device that never read the record has not hydrated', async () => {
    expect(await hasHydratedRecord('u1')).toBe(false);
  });

  it('a zero-event account that has been read once counts as hydrated (the counterexample)', async () => {
    // Both record tables answered empty: no per-table watermark is ever written, so the
    // marker is the only trace of the read, and the local store is still empty.
    await markRecordHydrated('u1');
    expect(mockWatermarks.has(COLD_START_HYDRATED_KEY)).toBe(true);
    const hydrated = await hasHydratedRecord('u1');
    expect(hydrated).toBe(true);
    expect(shouldShowColdStartWait({ hydrated, localEmpty: true, online: true })).toBe(false);
  });

  it("another account's marker never vouches for this one (a wipe that failed)", async () => {
    await markRecordHydrated('someone-else');
    expect(await hasHydratedRecord('u1')).toBe(false);
  });

  it.each(['events', 'vet_visits'])('a %s watermark alone (an upgraded device) counts as hydrated', async (table) => {
    mockWatermarks.set(table, '2026-10-01T00:00:00.000Z');
    expect(await hasHydratedRecord('u1')).toBe(true);
  });

  it('a watermark on another table does not', async () => {
    mockWatermarks.set('feeding_arrangements', '2026-10-01T00:00:00.000Z');
    expect(await hasHydratedRecord('u1')).toBe(false);
  });
});

describe('shouldShowColdStartWait', () => {
  it('waits only for an online, never-read, empty device', () => {
    expect(shouldShowColdStartWait({ hydrated: false, localEmpty: true, online: true })).toBe(true);
  });

  it('never waits offline, even on a true cold start', () => {
    expect(shouldShowColdStartWait({ hydrated: false, localEmpty: true, online: false })).toBe(false);
  });

  it('never waits over a populated store', () => {
    expect(shouldShowColdStartWait({ hydrated: false, localEmpty: false, online: true })).toBe(false);
  });
});

describe('holdColdStartWait — the ceiling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lets go at the ceiling while the work is still running, then once more on settle', async () => {
    const release = jest.fn();
    let finish!: () => void;
    const work = () => new Promise<void>((resolve) => (finish = resolve));
    const held = holdColdStartWait(work, release);

    jest.advanceTimersByTime(COLD_START_CEILING_MS - 1);
    expect(release).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledTimes(1);

    finish();
    await held;
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('lets go when the work settles first, and the ceiling never fires after', async () => {
    const release = jest.fn();
    await holdColdStartWait(async () => undefined, release);
    expect(release).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(COLD_START_CEILING_MS * 2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('lets go when the work throws, and the error still reaches the caller', async () => {
    const release = jest.fn();
    await expect(
      holdColdStartWait(async () => {
        throw new Error('offline');
      }, release),
    ).rejects.toThrow('offline');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
