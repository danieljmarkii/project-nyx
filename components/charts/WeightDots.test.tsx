// WeightDots against its §05 row (CUL-1064): x by date, not index; the band fixed on the
// first reading; no fill in the tree; n = 1 → the number, n = 2 → the pair.

import * as fs from 'fs';
import * as path from 'path';
import { configure, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { WeightDots } from './WeightDots';
import { weightBand } from '../../lib/chartModels';
import { blankComments } from '../../guards/blankComments';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;

const r = (value: number, iso: string) => ({ value, occurredAt: iso });
const fmt = (iso: string) => iso.slice(5, 10);
const flat = (style: unknown): Record<string, number> => StyleSheet.flatten(style as never) as Record<string, number>;

function measured(ui: React.ReactElement, width = 340) {
  const api = render(ui);
  fireEvent(api.getByTestId('weight-plot'), 'layout', { nativeEvent: { layout: { width, height: 56 } } });
  return api;
}

beforeEach(() => mockedReduced.mockReturnValue(false));

describe('WeightDots — the §05 row', () => {
  it('x is by DATE, not index: uneven dates give unequal spacing', () => {
    const model = weightBand([r(10, '2026-07-03T08:00:00Z'), r(10, '2026-07-04T08:00:00Z'), r(10, '2026-09-12T08:00:00Z')]);
    const { getByTestId } = measured(<WeightDots model={model} unit="lbs" formatDate={fmt} />);
    const xs = [0, 1, 2].map((i) => flat(getByTestId(`weight-dot-${i}`).props.style).left);
    expect(xs[1] - xs[0]).toBeLessThan(xs[2] - xs[1]);
    expect(xs[1] - xs[0]).toBeGreaterThan(0);
  });

  it('the band is fixed on the first reading: its edges are labelled, and a later reading does not move it', () => {
    const a = weightBand([r(10, '2026-07-03T08:00:00Z'), r(10.2, '2026-08-03T08:00:00Z')]);
    const b = weightBand([r(10, '2026-07-03T08:00:00Z'), r(7, '2026-08-03T08:00:00Z')]);
    const ua = measured(<WeightDots model={a} unit="lbs" formatDate={fmt} />);
    const ub = measured(<WeightDots model={b} unit="lbs" formatDate={fmt} />);
    expect(ua.getByTestId('weight-edge-hi').props.children).toBe('+10%');
    expect(ua.getByTestId('weight-edge-lo').props.children).toBe('−10%');
    // The first dot sits at the same height in both: the band did not stretch to fit the 7.
    expect(flat(ua.getByTestId('weight-dot-0').props.style).top).toBeCloseTo(flat(ub.getByTestId('weight-dot-0').props.style).top, 6);
    // The 7 is drawn at the band's edge, HOLLOW, and SAID.
    expect(flat(ub.getByTestId('weight-dot-1-clipped').props.style).top).toBeCloseTo(56 - 4, 6);
    expect(flat(ub.getByTestId('weight-dot-1-clipped').props.style).backgroundColor).toBe(theme.colorSurface);
    expect(ub.getByTestId('weight-dots').props.accessibilityLabel).toContain('1 reading outside the band');
  });

  it('B9: a clipped reading in the middle of the series prints its own value, so a 35 % loss never draws like a 10 % one', () => {
    const m = weightBand([r(4.6, '2026-06-01T08:00:00Z'), r(4.3, '2026-07-01T08:00:00Z'), r(4.0, '2026-08-01T08:00:00Z'), r(3.7, '2026-09-01T08:00:00Z')]);
    const { getByTestId, queryByTestId } = measured(<WeightDots model={m} unit="kg" formatDate={fmt} />);
    expect(getByTestId('weight-dot-2-clipped')).toBeTruthy();
    expect(getByTestId('weight-dot-3-clipped')).toBeTruthy();
    expect(getByTestId('weight-clipped-value-2').props.children).toBe('4.0');
    // The last reading already prints its value with the unit; no second label for it.
    expect(queryByTestId('weight-clipped-value-3')).toBeNull();
    expect(getByTestId('weight-last-value').props.children).toBe('3.7 kg');
    expect(getByTestId('weight-dots').props.accessibilityLabel).toContain('2 readings outside the band');
  });

  it('no fill anywhere: no area node in the tree, and no path primitive in the source', () => {
    const model = weightBand([r(10, '2026-07-03T08:00:00Z'), r(9.8, '2026-08-03T08:00:00Z'), r(9.6, '2026-09-03T08:00:00Z')]);
    const { queryByTestId } = measured(<WeightDots model={model} unit="lbs" formatDate={fmt} />);
    expect(queryByTestId('weight-fill')).toBeNull();
    expect(queryByTestId('weight-area')).toBeNull();
    const src = blankComments(fs.readFileSync(path.join(__dirname, 'WeightDots.tsx'), 'utf8'));
    expect(src).not.toMatch(/\b(Path|Polygon|Polyline|Svg|LinearGradient)\b/);
    expect(src).not.toMatch(/react-native-svg|gifted-charts/);
  });

  it('n = 1 → the number and its date, no band and no dots', () => {
    const one = weightBand([r(10.1, '2026-09-12T08:00:00Z')]);
    const { getByTestId, queryByTestId } = render(<WeightDots model={one} unit="lbs" formatDate={fmt} />);
    expect(getByTestId('weight-number-value').props.children).toBe('10.1 lbs');
    expect(getByTestId('weight-number-date').props.children).toBe('09-12');
    expect(queryByTestId('weight-dots')).toBeNull();
    expect(queryByTestId('weight-dot-0')).toBeNull();
    expect(getByTestId('weight-number').props.accessibilityLabel).toBe('Weight, one reading: 10.1 lbs on 09-12.');
  });

  it('n = 2 → the pair on the band, first and last values and dates printed; the delta is NOT spoken here', () => {
    const two = weightBand([r(10.1, '2026-08-26T08:00:00Z'), r(9.9, '2026-09-12T08:00:00Z')]);
    const { getByTestId, queryByText } = measured(<WeightDots model={two} unit="lbs" formatDate={fmt} />);
    expect(getByTestId('weight-dot-0')).toBeTruthy();
    expect(getByTestId('weight-dot-1')).toBeTruthy();
    expect(getByTestId('weight-first-value').props.children).toBe('10.1');
    expect(getByTestId('weight-last-value').props.children).toBe('9.9 lbs');
    expect(getByTestId('weight-first-date').props.children).toBe('08-26');
    expect(getByTestId('weight-last-date').props.children).toBe('09-12');
    expect(queryByText(/down|up|since/i)).toBeNull();
  });

  it('n = 0 → nothing (the caller owns the empty state)', () => {
    const { toJSON } = render(<WeightDots model={weightBand([])} unit="lbs" formatDate={fmt} />);
    expect(toJSON()).toBeNull();
  });

  it('the dots are the neutral grey, never the accent (a weight mark never reassures)', () => {
    const model = weightBand([r(10, '2026-07-03T08:00:00Z'), r(9.8, '2026-08-03T08:00:00Z')]);
    const { getByTestId } = measured(<WeightDots model={model} unit="lbs" formatDate={fmt} />);
    for (let i = 0; i < 2; i++) {
      const bg = flat(getByTestId(`weight-dot-${i}`).props.style).backgroundColor as unknown as string;
      expect(bg).not.toBe(theme.colorAccent);
      expect(bg).not.toBe(theme.colorEventSymptom);
    }
  });

  it('draws in on the FACT and is static under reduced motion', () => {
    const model = weightBand([r(10, '2026-07-03T08:00:00Z'), r(9.8, '2026-08-03T08:00:00Z')]);
    const spy = jest.spyOn(Animated, 'parallel');
    render(<WeightDots model={model} unit="lbs" formatDate={fmt} />);
    expect(spy).not.toHaveBeenCalled();
    render(<WeightDots model={model} unit="lbs" formatDate={fmt} drawIn />);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    mockedReduced.mockReturnValue(true);
    render(<WeightDots model={model} unit="lbs" formatDate={fmt} drawIn />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
