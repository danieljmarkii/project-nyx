import { deriveOccurredAt } from './utils';

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
