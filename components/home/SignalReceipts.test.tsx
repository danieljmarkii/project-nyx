// SignalReceipts (SR-1, B-721) — the receipt components' own local logic.
//
// The geometry (dot positions, band split, degradation) is tested against the pure
// models in lib/signalCopy.test.ts, and the per-type wiring in InsightCard.test.tsx.
// What only lives HERE is the Shape C bar proportion (count / max) and its zero guard —
// so that's what this file pins directly.

import { render } from '@testing-library/react-native';
import { StackedCompare } from './SignalReceipts';
import type { CompareRow } from '../../lib/signalCopy';

// The rendered width of the row whose count is `count`, as its "NN%" string.
function fillWidths(rows: CompareRow[]): (string | number | undefined)[] {
  const json = render(<StackedCompare rows={rows} accessibilityLabel="test" />).toJSON();
  const widths: (string | number | undefined)[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { props?: { style?: unknown }; children?: unknown[] };
    const style = Array.isArray(n.props?.style)
      ? Object.assign({}, ...n.props!.style.filter(Boolean))
      : (n.props?.style as Record<string, unknown> | undefined);
    // The proportional fill is the only View that carries a positioned bar with a width.
    if (style && style.position === 'absolute' && 'width' in style) widths.push(style.width as string);
    n.children?.forEach(walk);
  };
  (Array.isArray(json) ? json : [json]).forEach(walk);
  return widths;
}

describe('StackedCompare (Shape C)', () => {
  const rows: CompareRow[] = [
    { label: 'Within 30 min of eating', count: 4, tone: 'concern' },
    { label: 'Timed, but later', count: 8, tone: 'muted' },
  ];

  it('prints both counts and both labels — nothing to decode (§4)', () => {
    const { getByText } = render(<StackedCompare rows={rows} accessibilityLabel="test" />);
    expect(getByText('4')).toBeTruthy();
    expect(getByText('8')).toBeTruthy();
    expect(getByText('Within 30 min of eating')).toBeTruthy();
    expect(getByText('Timed, but later')).toBeTruthy();
  });

  it('bars are a proportion of the larger count (the max fills the track)', () => {
    // 4 vs 8 → 50% and 100%.
    expect(fillWidths(rows)).toEqual(['50%', '100%']);
  });

  it('does not divide by zero when every count is zero', () => {
    const zero: CompareRow[] = [
      { label: 'a', count: 0, tone: 'concern' },
      { label: 'b', count: 0, tone: 'muted' },
    ];
    const { getAllByText } = render(<StackedCompare rows={zero} accessibilityLabel="t" />);
    expect(getAllByText('0')).toHaveLength(2);
    expect(fillWidths(zero)).toEqual(['0%', '0%']); // 0/1, never 0/0
  });
});
