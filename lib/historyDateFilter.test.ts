import {
  dateAfterForPreset,
  dayScopeBounds,
  dayScopeFromParams,
  effectiveRange,
  historyDayHref,
  historyDayLabel,
  inRange,
  sqlPrefilter,
  DAY_KEY_RE,
  PREFILTER_SLACK_MS,
  coerceDatePreset,
  type DayScope,
} from './historyDateFilter';
import { toLocalDayKey } from './utils';

// A fixed "now" so the preset math is deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-14T15:00:00.000Z');

const local = (key: string): DayScope => ({ key, basis: 'local' });
const utc = (key: string): DayScope => ({ key, basis: 'utc' });

/** The local day key `n` days after `key` — built from local components (B-514). */
function shiftKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toLocalDayKey(new Date(y, m - 1, d + n));
}

/** The same instant as a hydrated row spells it (PostgREST's `+00:00`, no millis). */
const hydrated = (isoZ: string): string => isoZ.replace(/\.000Z$/, '+00:00');

describe('dateAfterForPreset', () => {
  it('null preset → no cutoff (All time)', () => {
    expect(dateAfterForPreset(null, NOW)).toBeNull();
  });

  it('today → start of the LOCAL calendar day', () => {
    const after = dateAfterForPreset('today', NOW);
    const d = new Date(after!);
    // Local midnight of NOW's local day.
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('rolling presets are N×24h before now', () => {
    expect(dateAfterForPreset('7d', NOW)).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
    expect(dateAfterForPreset('30d', NOW)).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
  });
});

describe('dayScopeFromParams — a day link is read by SENDER, never by flag (H-7, CUL-1073)', () => {
  it('the month door\'s ?day= is a LOCAL day', () => {
    expect(dayScopeFromParams({ day: '2026-09-16' })).toEqual(local('2026-09-16'));
  });

  it('the widget\'s ?date= (src=widget) is a LOCAL day: the frozen sender always meant one', () => {
    expect(dayScopeFromParams({ date: '2026-09-16', src: 'widget' })).toEqual(local('2026-09-16'));
  });

  it('a bare ?date= keeps its UTC meaning: the flag-off calendar counts a UTC day until D2-8', () => {
    expect(dayScopeFromParams({ date: '2026-09-16' })).toEqual(utc('2026-09-16'));
    // A marker that is not the widget's is not the widget.
    expect(dayScopeFromParams({ date: '2026-09-16', src: 'calendar' })).toEqual(utc('2026-09-16'));
  });

  it('?day= wins over ?date= (no sender sends both; the newer parameter has one meaning)', () => {
    expect(dayScopeFromParams({ day: '2026-09-16', date: '2026-09-10' })).toEqual(local('2026-09-16'));
  });

  it('asks for no day when there is none, when it is the today PRESET, or when the key is not a day', () => {
    expect(dayScopeFromParams({})).toBeNull();
    expect(dayScopeFromParams({ date: 'today' })).toBeNull(); // the preset: the caller reads it
    expect(dayScopeFromParams({ date: '' })).toBeNull();
    expect(dayScopeFromParams({ day: 'garbage' })).toBeNull();
    // An impossible date never rolls over onto a day the link did not name (Feb 30 → Mar 2).
    expect(dayScopeFromParams({ day: '2026-02-30' })).toBeNull();
    expect(dayScopeFromParams({ date: '2026-02-30' })).toBeNull();
    expect(dayScopeFromParams({ date: '2026-13-01', src: 'widget' })).toBeNull();
  });

  it('the month door\'s href is read back as the same local day (the sender and the reader agree)', () => {
    const href = historyDayHref('2026-09-16', 1_789_000_000_000);
    expect(href).toEqual({ pathname: '/(tabs)/history', params: { day: '2026-09-16', ts: '1789000000000' } });
    expect(dayScopeFromParams(href.params)).toEqual(local('2026-09-16'));
  });
});

describe('dayScopeBounds', () => {
  it('a UTC day is the UTC calendar day, start and end', () => {
    expect(dayScopeBounds(utc('2026-06-24'))).toEqual({
      after: '2026-06-24T00:00:00.000Z',
      before: '2026-06-25T00:00:00.000Z',
    });
  });

  it('a local day runs from local midnight to the next: every day of a year, in whatever zone runs this', () => {
    // A property over 365 days rather than one fixture, so the suite's own zone decides
    // what gets exercised: the non-UTC CI job runs Pacific/Chatham, whose spring-forward
    // (Sep 27, 2026) makes a 23-hour day, and Kiritimati / Honolulu put UTC midnight in the
    // middle of the owner's afternoon.
    let key = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      const b = dayScopeBounds(local(key))!;
      const after = Date.parse(b.after);
      const before = Date.parse(b.before);
      expect(toLocalDayKey(new Date(after))).toBe(key);
      expect(toLocalDayKey(new Date(after - 1))).toBe(shiftKey(key, -1));
      expect(toLocalDayKey(new Date(before - 1))).toBe(key);
      expect(toLocalDayKey(new Date(before))).toBe(shiftKey(key, 1));
      key = shiftKey(key, 1);
    }
  });

  it('refuses a key that is not a real day, on either clock', () => {
    for (const key of ['garbage', '2026-6-4', '2026-02-30', '2026-00-10', '2026-12-32']) {
      expect(dayScopeBounds(local(key))).toBeNull();
      expect(dayScopeBounds(utc(key))).toBeNull();
    }
  });
});

describe('effectiveRange (B-308)', () => {
  it('a preset scope has an "after" cutoff and no upper bound', () => {
    expect(effectiveRange('30d', null, NOW)).toEqual({
      after: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
      before: null,
    });
    expect(effectiveRange(null, null, NOW)).toEqual({ after: null, before: null });
  });

  it('a single-day filter is a BOUNDED day on its sender\'s clock — start AND end', () => {
    expect(effectiveRange(null, utc('2026-06-24'), NOW)).toEqual({
      after: '2026-06-24T00:00:00.000Z',
      before: '2026-06-25T00:00:00.000Z',
    });
    expect(effectiveRange(null, local('2026-06-24'), NOW)).toEqual({
      after: new Date(2026, 5, 24).toISOString(),
      before: new Date(2026, 5, 25).toISOString(),
    });
  });

  it('the day filter takes precedence over a preset (mutually exclusive)', () => {
    expect(effectiveRange('30d', utc('2026-06-24'), NOW)).toEqual({
      after: '2026-06-24T00:00:00.000Z',
      before: '2026-06-25T00:00:00.000Z',
    });
  });

  it('a malformed day key falls back to the preset (never a broken bound)', () => {
    expect(effectiveRange('today', utc('garbage'), NOW)).toEqual({
      after: dateAfterForPreset('today', NOW),
      before: null,
    });
    expect(effectiveRange('today', local('2026-02-30'), NOW)).toEqual({
      after: dateAfterForPreset('today', NOW),
      before: null,
    });
  });
});

describe('bounds are parsed, never compared as text (C-40)', () => {
  const DAY = '2026-09-16';
  const range = effectiveRange(null, local(DAY), NOW);
  const startZ = range.after!;
  const endZ = range.before!;

  it('a synced row at exactly local midnight belongs to its own day — where a text compare drops it', () => {
    const row = hydrated(startZ);
    // One instant, two spellings that disagree as text: the guard is measuring something.
    expect(Date.parse(row)).toBe(Date.parse(startZ));
    expect(row).not.toBe(startZ);
    expect(row >= startZ).toBe(false); // the text bound would drop it from its day...
    expect(inRange(row, range)).toBe(true);
    // ...and the parse keeps it out of the day before.
    expect(inRange(row, effectiveRange(null, local(shiftKey(DAY, -1)), NOW))).toBe(false);
  });

  it('a synced row at the NEXT local midnight is the next day\'s — where a text compare keeps it', () => {
    const row = hydrated(endZ);
    expect(Date.parse(row)).toBe(Date.parse(endZ));
    expect(row < endZ).toBe(true); // the text bound would pull it into this day
    expect(inRange(row, range)).toBe(false);
    expect(inRange(row, effectiveRange(null, local(shiftKey(DAY, 1)), NOW))).toBe(true);
  });

  it('the SQL prefilter admits every in-day row in either spelling, so the parse can place it', () => {
    const pre = sqlPrefilter(range);
    const lastMs = Date.parse(endZ) - 1000;
    const inDay = [startZ, hydrated(startZ), new Date(lastMs).toISOString(), hydrated(new Date(lastMs).toISOString())];
    for (const iso of inDay) {
      expect(inRange(iso, range)).toBe(true);
      // The SQL compares TEXT: these are the comparisons `getTimeline` makes.
      expect(iso >= pre.after!).toBe(true);
      expect(iso < pre.before!).toBe(true);
    }
  });

  it('the prefilter reaches exactly one slack past each bound, and leaves an open end open', () => {
    const pre = sqlPrefilter(range);
    expect(Date.parse(startZ) - Date.parse(pre.after!)).toBe(PREFILTER_SLACK_MS);
    expect(Date.parse(pre.before!) - Date.parse(endZ)).toBe(PREFILTER_SLACK_MS);
    expect(sqlPrefilter({ after: startZ, before: null })).toEqual({
      after: new Date(Date.parse(startZ) - PREFILTER_SLACK_MS).toISOString(),
      before: null,
    });
    expect(sqlPrefilter({ after: null, before: null })).toEqual({ after: null, before: null });
  });

  it('an instant that does not parse is out of every bounded range and in All time', () => {
    expect(inRange('not a time', range)).toBe(false);
    expect(inRange('not a time', { after: startZ, before: null })).toBe(false);
    expect(inRange('not a time', { after: null, before: null })).toBe(true);
  });
});

describe('historyDayLabel', () => {
  it('prints the key\'s own date, whichever clock counted it', () => {
    expect(historyDayLabel('2026-09-16')).toBe('Sep 16');
    expect(historyDayLabel('2026-01-01')).toBe('Jan 1');
    expect(historyDayLabel('2025-12-31')).toBe('Dec 31');
  });
});

describe('DAY_KEY_RE', () => {
  it('matches a padded YYYY-MM-DD only', () => {
    expect(DAY_KEY_RE.test('2026-06-24')).toBe(true);
    expect(DAY_KEY_RE.test('2026-6-4')).toBe(false); // unpadded
    expect(DAY_KEY_RE.test('today')).toBe(false);
  });
});

describe('coerceDatePreset (B-378 — the ?window= deep-link)', () => {
  it('accepts History\'s own preset vocabulary', () => {
    expect(coerceDatePreset('today')).toBe('today');
    expect(coerceDatePreset('7d')).toBe('7d');
    expect(coerceDatePreset('30d')).toBe('30d');
  });

  it('degrades anything else — absent, unknown, or a foreign window — to all time (null)', () => {
    expect(coerceDatePreset(undefined)).toBeNull();
    expect(coerceDatePreset('')).toBeNull();
    expect(coerceDatePreset('14d')).toBeNull();  // not a History preset — Ask keeps this window on Patterns rather than linking here
    expect(coerceDatePreset('all')).toBeNull();
    expect(coerceDatePreset('garbage')).toBeNull();
  });
});
