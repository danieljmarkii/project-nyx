import {
  redactDetail,
  trimRing,
  buildBreadcrumb,
  logAuth,
  readAuthLog,
  clearAuthLog,
  flushAuthLog,
  type Breadcrumb,
} from './authDebug';

// A stand-in breadcrumb for the pure-helper tests.
const crumb = (seq: number): Breadcrumb => ({
  seq,
  t: '2026-07-10T00:00:00.000Z',
  ms: 0,
  launch: 'test',
  event: 'e',
});

describe('redactDetail', () => {
  it('returns undefined for undefined', () => {
    expect(redactDetail(undefined)).toBeUndefined();
  });

  it('keeps numbers, booleans, null, and short strings verbatim', () => {
    expect(redactDetail({ n: 42, b: true, z: null, s: 'ok' })).toEqual({
      n: 42,
      b: true,
      z: null,
      s: 'ok',
    });
  });

  it('replaces any long string with its length only — never a token verbatim', () => {
    const token = 'a'.repeat(1200);
    expect(redactDetail({ jwt: token })).toEqual({ jwt: '<1200 chars>' });
  });

  it('keeps a 64-char string but redacts a 65-char one (boundary)', () => {
    expect(redactDetail({ s: 'a'.repeat(64) })).toEqual({ s: 'a'.repeat(64) });
    expect(redactDetail({ s: 'a'.repeat(65) })).toEqual({ s: '<65 chars>' });
  });
});

describe('trimRing', () => {
  it('returns the array unchanged when under the cap', () => {
    const arr = [crumb(0), crumb(1)];
    expect(trimRing(arr, 5)).toBe(arr);
  });

  it('keeps only the most recent `max` entries', () => {
    const arr = [crumb(0), crumb(1), crumb(2), crumb(3)];
    const out = trimRing(arr, 2);
    expect(out.map((c) => c.seq)).toEqual([2, 3]);
  });
});

describe('buildBreadcrumb', () => {
  it('assembles fields and derives an ISO time from the injected clock', () => {
    const b = buildBreadcrumb(7, 'sec.get', { chars: 3200 }, 'abc123', 1783650000000);
    expect(b.seq).toBe(7);
    expect(b.event).toBe('sec.get');
    expect(b.launch).toBe('abc123');
    expect(b.ms).toBe(1783650000000);
    expect(b.t).toBe(new Date(1783650000000).toISOString());
    expect(b.detail).toEqual({ chars: 3200 });
  });

  it('redacts the detail it stores', () => {
    const b = buildBreadcrumb(0, 'e', { secret: 'x'.repeat(100) }, 'l', 0);
    expect(b.detail).toEqual({ secret: '<100 chars>' });
  });
});

describe('logAuth ring buffer (AsyncStorage-backed)', () => {
  beforeEach(async () => {
    await clearAuthLog();
  });

  it('persists breadcrumbs in call order with increasing seq', async () => {
    logAuth('launch', { build: '32' });
    logAuth('sec.get', { path: 'ok', chars: 3200 });
    logAuth('coldstart.getSession', { hasSession: true });
    await flushAuthLog();

    const log = await readAuthLog();
    expect(log.map((b) => b.event)).toEqual(['launch', 'sec.get', 'coldstart.getSession']);
    // seq is monotonic across the run
    expect(log[1].seq).toBeGreaterThan(log[0].seq);
    expect(log[2].seq).toBeGreaterThan(log[1].seq);
    // and the token-shaped premise is captured without any token value
    expect(log[1].detail).toEqual({ path: 'ok', chars: 3200 });
  });

  it('never stores a long string value even if one is passed by mistake', async () => {
    logAuth('oops', { accidentalToken: 'y'.repeat(2000) });
    await flushAuthLog();
    const log = await readAuthLog();
    expect(log[0].detail).toEqual({ accidentalToken: '<2000 chars>' });
  });

  it('caps the persisted ring at 200 entries, keeping the most recent', async () => {
    for (let i = 0; i < 205; i++) logAuth('tick', { i });
    await flushAuthLog();

    const log = await readAuthLog();
    expect(log).toHaveLength(200);
    // The oldest 5 were dropped; the last entry is the most recent tick.
    expect(log[log.length - 1].detail).toEqual({ i: 204 });
    expect(log[0].detail).toEqual({ i: 5 });
  });

  it('clearAuthLog empties the trail', async () => {
    logAuth('x');
    await flushAuthLog();
    expect((await readAuthLog()).length).toBeGreaterThan(0);
    await clearAuthLog();
    expect(await readAuthLog()).toEqual([]);
  });
});
