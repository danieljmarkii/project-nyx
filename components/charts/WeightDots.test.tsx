// WeightDots against its §05 row (CUL-1064): x by date, not index; the band centred on the
// first reading and stepped to hold the readings (CUL-1716); no fill in the tree; n = 1 →
// the number, n = 2 → the pair.

import * as fs from 'fs';
import * as path from 'path';
import { configure, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { EDGE_LABEL_WIDTH, LABEL_ROOM, WeightDots, lastValueAbove } from './WeightDots';
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
  fireEvent(api.getByTestId('weight-plot'), 'layout', { nativeEvent: { layout: { width, height: 96 + LABEL_ROOM * 2 } } });
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

  it('the band is centred on the first reading and labelled with its width; past ±30 % a reading clips', () => {
    const a = weightBand([r(10, '2026-07-03T08:00:00Z'), r(10.2, '2026-08-03T08:00:00Z')]);
    const b = weightBand([r(10, '2026-07-03T08:00:00Z'), r(6, '2026-08-03T08:00:00Z')]);
    const ua = measured(<WeightDots model={a} unit="lbs" formatDate={fmt} />);
    const ub = measured(<WeightDots model={b} unit="lbs" formatDate={fmt} />);
    expect(ua.getByTestId('weight-edge-hi').props.children).toBe('+10%');
    expect(ua.getByTestId('weight-edge-lo').props.children).toBe('−10%');
    expect(ub.getByTestId('weight-edge-hi').props.children).toBe('+30%');
    expect(ub.getByTestId('weight-edge-lo').props.children).toBe('−30%');
    // The first dot sits at the same height in both: the centre line is the first reading.
    expect(flat(ua.getByTestId('weight-dot-0').props.style).top).toBeCloseTo(flat(ub.getByTestId('weight-dot-0').props.style).top, 6);
    // The 6 (40 % down) is past the cap: drawn at the band's edge, HOLLOW, and SAID.
    expect(flat(ub.getByTestId('weight-dot-1-clipped').props.style).top).toBeCloseTo(LABEL_ROOM + 96 - 4, 6);
    expect(flat(ub.getByTestId('weight-dot-1-clipped').props.style).backgroundColor).toBe(theme.colorSurface);
    expect(ub.getByTestId('weight-dots').props.accessibilityLabel).toContain('1 reading outside the band');
  });

  it('CUL-1716: a 15 % loss steps the band to ±20 %, draws the reading in place, and keeps the ±10 % lines', () => {
    // The PM's device record.
    const m = weightBand([r(9.7, '2026-06-15T08:00:00Z'), r(8.2, '2026-09-16T08:00:00Z')]);
    const { getByTestId, queryByTestId } = measured(<WeightDots model={m} unit="lbs" formatDate={fmt} />);
    expect(getByTestId('weight-edge-hi').props.children).toBe('+20%');
    expect(getByTestId('weight-edge-lo').props.children).toBe('−20%');
    expect(getByTestId('weight-guide-hi-label').props.children).toBe('+10%');
    expect(getByTestId('weight-guide-lo-label').props.children).toBe('−10%');
    // A solid dot, not the hollow "past the band" one, BELOW the −10 % line.
    expect(queryByTestId('weight-dot-1-clipped')).toBeNull();
    const dot = flat(getByTestId('weight-dot-1').props.style);
    expect(dot.top + dot.height / 2).toBeGreaterThan(flat(getByTestId('weight-guide-lo').props.style).top);
    // A 2 % change draws no guides: the band never widened.
    const small = measured(<WeightDots model={weightBand([r(10, '2026-07-03T08:00:00Z'), r(9.8, '2026-08-03T08:00:00Z')])} unit="lbs" formatDate={fmt} />);
    expect(small.queryByTestId('weight-guide-hi')).toBeNull();
  });

  it('CUL-1716: the reference line is dotted and hairline, never a solid line that reads as the weight', () => {
    const m = weightBand([r(9.7, '2026-06-15T08:00:00Z'), r(8.2, '2026-09-16T08:00:00Z')]);
    const { getByTestId } = measured(<WeightDots model={m} unit="lbs" formatDate={fmt} />);
    const ref = flat(getByTestId('weight-ref-line').props.style) as unknown as Record<string, unknown>;
    expect(ref.borderStyle).toBe('dotted');
    expect(ref.borderTopWidth).toBe(StyleSheet.hairlineWidth);
  });

  it('CUL-1716: the last value ends at its dot, clear of the band labels, at every band width', () => {
    const width = 340;
    for (const last of [9.9, 9.0, 8.2, 7.0, 4.0, 11.5]) {
      const m = weightBand([r(9.7, '2026-06-15T08:00:00Z'), r(last, '2026-09-16T08:00:00Z')]);
      const { getByTestId } = measured(<WeightDots model={m} unit="lbs" formatDate={fmt} />, width);
      const box = flat(getByTestId('weight-last-value-box').props.style);
      const labelRight = width - box.right;
      const edgeLeft = flat(getByTestId('weight-edge-lo').props.style).left;
      expect(labelRight).toBeLessThan(edgeLeft);
      expect(labelRight).toBeLessThanOrEqual(width - EDGE_LABEL_WIDTH + 2);
      // And never above the plot's own top or into the dates below it.
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.top + 18).toBeLessThanOrEqual(96 + LABEL_ROOM * 2);
    }
  });

  it('CUL-1716: the last value goes above a low dot, below a high one, and flips off a neighbouring dot', () => {
    const px = (x: number) => x * 300;
    const py = (y: number) => LABEL_ROOM + (1 - y) * 96;
    const pt = (x: number, y: number) => ({ x, y, value: 1, occurredAt: '', ms: 0, clipped: false, pastFloor: false });
    const bottom = 96 + LABEL_ROOM * 2;
    expect(lastValueAbove([pt(0, 0.5), pt(1, 0.2)], '8.2 lbs', px, py, bottom)).toBe(true);
    expect(lastValueAbove([pt(0, 0.5), pt(1, 0.8)], '11.2 lbs', px, py, bottom)).toBe(false);
    // The neighbour sits just above-left of a low last dot, under where the label would go.
    expect(lastValueAbove([pt(0, 0.5), pt(0.92, 0.32), pt(1, 0.25)], '8.2 lbs', px, py, bottom)).toBe(false);
    // ...but never flipped into the dates: a bottom-edge dot keeps its label above.
    expect(lastValueAbove([pt(0, 0.5), pt(0.92, 0.1), pt(1, 0)], '8.2 lbs', px, py, bottom)).toBe(true);
  });

  it('B9: a clipped reading in the middle of the series prints its own value, so a 45 % loss never draws like a 30 % one', () => {
    const m = weightBand([r(4.6, '2026-06-01T08:00:00Z'), r(4.3, '2026-07-01T08:00:00Z'), r(2.9, '2026-08-01T08:00:00Z'), r(2.5, '2026-09-01T08:00:00Z')]);
    const { getByTestId, queryByTestId } = measured(<WeightDots model={m} unit="kg" formatDate={fmt} />);
    expect(getByTestId('weight-dot-2-clipped')).toBeTruthy();
    expect(getByTestId('weight-dot-3-clipped')).toBeTruthy();
    expect(getByTestId('weight-clipped-value-2').props.children).toBe('2.9');
    // The last reading already prints its value with the unit; no second label for it.
    expect(queryByTestId('weight-clipped-value-3')).toBeNull();
    expect(getByTestId('weight-last-value').props.children).toBe('2.5 kg');
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
