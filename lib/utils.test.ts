import { deriveOccurredAt, describeOccurredAt, formatTime } from './utils';

const at = (iso: string) => new Date(iso);

describe('deriveOccurredAt', () => {
  it('returns the point for witnessed events', () => {
    const point = at('2026-05-18T07:42:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'witnessed', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });

  it('returns the point for estimated events (found, rough single time)', () => {
    const point = at('2026-05-18T04:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'estimated', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });

  it('returns the latest edge for a bounded window (no invented midpoint)', () => {
    // 2pm–4pm bedroom case -> "by 4pm", not a synthesized 3pm
    const earliest = at('2026-05-18T14:00:00.000Z');
    const latest = at('2026-05-18T16:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest, latest }).toISOString(),
    ).toBe(latest.toISOString());
  });

  it('returns latest for an open-ended "sometime before now" window', () => {
    const latest = at('2026-05-18T07:42:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest: null, latest }).toISOString(),
    ).toBe(latest.toISOString());
  });

  it('returns earliest when only the lower edge is known', () => {
    const earliest = at('2026-05-18T09:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest, latest: null }).toISOString(),
    ).toBe(earliest.toISOString());
  });

  it('falls back to the point for a degenerate window with no edges', () => {
    const point = at('2026-05-18T12:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });
});

describe('describeOccurredAt', () => {
  // Times are formatted with the local timezone, so assert against formatTime
  // rather than hardcoding a clock value the CI box might render differently.
  const t = (iso: string) => formatTime(at(iso));

  it('renders witnessed events as the exact point with no tag', () => {
    const iso = '2026-05-18T14:14:00.000Z';
    const d = describeOccurredAt({ confidence: 'witnessed', occurredAt: iso });
    expect(d.primary).toBe(t(iso));
    expect(d.compact).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });

  it('prefixes estimated events with ~ and tags them, not exact', () => {
    const iso = '2026-05-18T04:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'estimated', occurredAt: iso });
    expect(d.primary).toBe(`~${t(iso)}`);
    expect(d.tag).toBe('estimated');
    expect(d.isExact).toBe(false);
  });

  it('renders a bounded window as a range', () => {
    const e = '2026-05-18T13:00:00.000Z';
    const l = '2026-05-18T15:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: l, earliest: e, latest: l });
    expect(d.primary).toBe(`between ${t(e)} and ${t(l)}`);
    expect(d.compact).toBe(`${t(e)}–${t(l)}`);
    expect(d.tag).toBe('approximate');
    expect(d.isExact).toBe(false);
  });

  it('renders an open-ended "found by" window with only the latest edge', () => {
    const l = '2026-05-18T15:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: l, earliest: null, latest: l });
    expect(d.primary).toBe(`found by ${t(l)}`);
    expect(d.compact).toBe(`by ${t(l)}`);
    expect(d.tag).toBe('approximate');
  });

  it('falls back to the exact point for legacy/unclassified (null) rows', () => {
    const iso = '2026-05-18T09:30:00.000Z';
    const d = describeOccurredAt({ confidence: null, occurredAt: iso });
    expect(d.primary).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });

  it('falls back to the exact point for a degenerate edgeless window', () => {
    const iso = '2026-05-18T12:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: iso, earliest: null, latest: null });
    expect(d.primary).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });
});
