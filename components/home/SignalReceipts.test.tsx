// SignalReceipts (SR-1, B-721) — the receipt components' own local logic.
//
// The geometry (dot positions, band split, degradation) is tested against the pure
// models in lib/signalCopy.test.ts, and the per-type wiring in InsightCard.test.tsx.
// What only lives HERE is the Shape C bar proportion (count / max) + its zero guard,
// and the DotLane render mapping (one dot/band View per model entry, and the single
// dashed edge — never two — across a midnight-wrapping band).

import { render } from '@testing-library/react-native';
import { DotLane, StackedCompare } from './SignalReceipts';
import { dotLaneModel, type CompareRow } from '../../lib/signalCopy';
import type { TimeOfDayClusteringFinding } from '../../lib/signal';

// Flatten a rendered tree to the resolved style object of every node (style arrays merged).
function nodeStyles(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const el = n as { props?: { style?: unknown }; children?: unknown[] };
    const style = Array.isArray(el.props?.style)
      ? Object.assign({}, ...el.props!.style.filter(Boolean))
      : (el.props?.style as Record<string, unknown> | undefined);
    if (style) out.push(style);
    el.children?.forEach(walk);
  };
  const json = render(node as Parameters<typeof render>[0]).toJSON();
  (Array.isArray(json) ? json : [json]).forEach(walk);
  return out;
}

describe('StackedCompare (Shape C)', () => {
  const rows: CompareRow[] = [
    { label: 'Within 30 min of eating', count: 4, tone: 'concern' },
    { label: 'Timed, but later', count: 8, tone: 'muted' },
  ];

  it('prints both counts and both labels — nothing to decode (§4)', () => {
    const { getByText } = render(<StackedCompare rows={rows} />);
    expect(getByText('4')).toBeTruthy();
    expect(getByText('8')).toBeTruthy();
    expect(getByText('Within 30 min of eating')).toBeTruthy();
    expect(getByText('Timed, but later')).toBeTruthy();
  });

  it('bars are a proportion of the larger count (the max fills the track)', () => {
    // 4 vs 8 → 50% and 100%.
    const widths = nodeStyles(<StackedCompare rows={rows} />)
      .filter((s) => s.position === 'absolute' && 'width' in s)
      .map((s) => s.width);
    expect(widths).toEqual(['50%', '100%']);
  });

  it('does not divide by zero when every count is zero', () => {
    const zero: CompareRow[] = [
      { label: 'a', count: 0, tone: 'concern' },
      { label: 'b', count: 0, tone: 'muted' },
    ];
    const { getAllByText } = render(<StackedCompare rows={zero} />);
    expect(getAllByText('0')).toHaveLength(2);
    const widths = nodeStyles(<StackedCompare rows={zero} />)
      .filter((s) => s.position === 'absolute' && 'width' in s)
      .map((s) => s.width);
    expect(widths).toEqual(['0%', '0%']); // 0/1, never 0/0
  });
});

describe('DotLane (Shape A)', () => {
  const timeofday = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
    type: 'timeofday_clustering',
    priorityClass: 'insight',
    symptomType: 'vomit',
    clusterStartLocalHour: 4,
    clusterWindowHours: 4,
    clusterCount: 5,
    eligibleCount: 8,
    totalEpisodes: 8,
    timezone: 'UTC',
    windowDays: 60,
    ...over,
  });

  // A band segment is any node with the tinted band fill; a DASHED edge adds the accent border.
  const bandStyles = (node: Parameters<typeof render>[0]) =>
    nodeStyles(node).filter((s) => s.backgroundColor === '#E0FBF7'); // theme.colorAccentLight
  const dashedBands = (node: Parameters<typeof render>[0]) =>
    bandStyles(node).filter((s) => s.borderStyle === 'dashed');

  it('renders one dot View per timeable episode', () => {
    const model = dotLaneModel(timeofday({ clusterCount: 5, eligibleCount: 8 }));
    // Dots carry the rose/idle fills; count both.
    const dots = nodeStyles(<DotLane model={model} />).filter(
      (s) => s.backgroundColor === '#F43F5E' || s.backgroundColor === '#A3A3A3',
    );
    expect(dots).toHaveLength(8);
  });

  it('a single (non-wrapping) band draws exactly one dashed edge', () => {
    const model = dotLaneModel(timeofday({ clusterStartLocalHour: 4, clusterWindowHours: 4 }));
    expect(bandStyles(<DotLane model={model} />)).toHaveLength(1);
    expect(dashedBands(<DotLane model={model} />)).toHaveLength(1);
  });

  it('a midnight-wrapping band draws TWO segments but only ONE dashed edge (the true end)', () => {
    // 23:00 + 4h → 03:00 wraps: [23/24, 1] (ends at the lane border) + [0, 3/24] (true end).
    const model = dotLaneModel(timeofday({ clusterStartLocalHour: 23, clusterWindowHours: 4 }));
    expect(bandStyles(<DotLane model={model} />)).toHaveLength(2); // both segments render
    expect(dashedBands(<DotLane model={model} />)).toHaveLength(1); // never two dashed edges (§4)
  });
});
