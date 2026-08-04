import { dateAfterForPreset, effectiveRange, DAY_KEY_RE, coerceDatePreset } from './historyDateFilter';

// A fixed "now" so the preset math is deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-14T15:00:00.000Z');

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

describe('effectiveRange (B-308)', () => {
  it('a preset scope has an "after" cutoff and no upper bound', () => {
    expect(effectiveRange('30d', null, NOW)).toEqual({
      after: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
      before: null,
    });
    expect(effectiveRange(null, null, NOW)).toEqual({ after: null, before: null });
  });

  it('a single-day filter is a BOUNDED UTC day — start AND end (the thing a preset cannot express)', () => {
    expect(effectiveRange(null, '2026-06-24', NOW)).toEqual({
      after: '2026-06-24T00:00:00.000Z',
      before: '2026-06-25T00:00:00.000Z',
    });
  });

  it('the day filter takes precedence over a preset (mutually exclusive)', () => {
    expect(effectiveRange('30d', '2026-06-24', NOW)).toEqual({
      after: '2026-06-24T00:00:00.000Z',
      before: '2026-06-25T00:00:00.000Z',
    });
  });

  it('a malformed day key falls back to the preset (never a broken bound)', () => {
    expect(effectiveRange('today', 'garbage', NOW)).toEqual({
      after: dateAfterForPreset('today', NOW),
      before: null,
    });
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
    expect(coerceDatePreset('14d')).toBeNull();  // not a History preset; the Ask side widens it first
    expect(coerceDatePreset('all')).toBeNull();
    expect(coerceDatePreset('garbage')).toBeNull();
  });
});
