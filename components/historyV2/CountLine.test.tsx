// The count line, form by form (CUL-1164 / HV-7; spec §3.2, AC 3's rendering half, AC 6, AC 7).
// The words are `countLineOf`'s (HV-4, table-tested there); this file proves each form is
// drawn as returned, with nothing added and nothing dropped.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CountLine } from './CountLine';
import type { CountLine as CountLineModel } from '../../lib/historyDays';

interface RenderedNode {
  children: (RenderedNode | string)[];
}
function textOf(node: RenderedNode | string): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}
const text = (id: string) => textOf(screen.getByTestId(id) as unknown as RenderedNode);

const ALL = { kind: 'all' } as const;

describe('CountLine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('count: line 1 with its strong part, line 2 as returned, and the door', () => {
    const line: CountLineModel = {
      kind: 'count',
      line1: { lead: 'Since the last vet visit, Jul 26 · record from Aug 3 · ', strong: '33 logged', tail: '' },
      line2: '1 day with nothing logged · 3 possible repeats within a minute',
      doors: [{ key: 'outside-trial-diet', label: 'Outside the trial diet ›' }],
    };
    render(<CountLine line={line} filter={ALL} />);
    expect(text('history-count-line-1')).toBe('Since the last vet visit, Jul 26 · record from Aug 3 · 33 logged');
    expect(screen.getByText('33 logged')).toBeTruthy();
    expect(screen.getByText('1 day with nothing logged · 3 possible repeats within a minute')).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-door-outside-trial-diet'));
    expect(router.push).toHaveBeenCalledWith('/trial-exposures');
    // The door is its own 44pt box (C-5) and speaks its words without the chevron.
    expect(screen.getByTestId('history-door-outside-trial-diet').props.accessibilityLabel).toBe('Outside the trial diet');
  });

  it('two doors under a symptom filter (CUL-1264): one wrapping row of 44pt boxes, neither reaching into the other (C-5)', () => {
    const line: CountLineModel = {
      kind: 'count',
      line1: { lead: 'Since the trial started, Jul 26 · ', strong: '13 vomits on 11 days', tail: '' },
      line2: null,
      doors: [
        { key: 'trial-compare', label: 'The trial so far ›' },
        { key: 'outside-trial-diet', label: 'Outside the trial diet ›' },
      ],
    };
    render(<CountLine line={line} filter={{ kind: 'type', type: 'vomit' }} />);
    for (const id of ['history-door-trial-compare', 'history-door-outside-trial-diet']) {
      const door = screen.getByTestId(id);
      const style = StyleSheet.flatten(door.props.style) as { minHeight?: number };
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      // Boxes at the floor take no slop, so neither door reaches into the other.
      expect(door.props.hitSlop).toBeUndefined();
    }
    // One row, as round 5 draws it: the rendered gap between the two boxes is at least the
    // two facing slops (none), and visible (C-5: read off the rendered row, not a token).
    const rowStyle = StyleSheet.flatten(screen.getByTestId('history-count-doors').props.style) as { flexDirection?: string; flexWrap?: string; columnGap?: number };
    expect(rowStyle.flexDirection).toBe('row');
    expect(rowStyle.flexWrap).toBe('wrap');
    expect(rowStyle.columnGap ?? 0).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('history-door-trial-compare'));
    expect(router.push).toHaveBeenLastCalledWith('/insights/trial');
    fireEvent.press(screen.getByTestId('history-door-outside-trial-diet'));
    expect(router.push).toHaveBeenLastCalledWith('/trial-exposures');
  });

  it('count with nothing to disclose: no second line, no door', () => {
    render(
      <CountLine
        line={{ kind: 'count', line1: { lead: 'Last 7 days · ', strong: '52 logged', tail: '' }, line2: null, doors: [] }}
        filter={ALL}
      />,
    );
    expect(text('history-count-line')).toBe('Last 7 days · 52 logged');
  });

  it('noticed: exactly the one link (H-9)', () => {
    render(
      <CountLine
        line={{ kind: 'noticed', door: { key: 'noticed-patterns', label: 'What you noticed is on Patterns ›' } }}
        filter={{ kind: 'noticed' }}
      />,
    );
    expect(text('history-count-line')).toBe('What you noticed is on Patterns ›');
    expect(screen.queryByTestId('history-count-line-1')).toBeNull();
  });

  it('search: the word, the window, and that it never counts (R-2)', () => {
    render(
      <CountLine
        line={{ kind: 'search', line1: { lead: 'Searching for ', strong: '“rabbit”', tail: ' · All time' }, line2: 'No count here, because search reads names, not ingredients.' }}
        filter={ALL}
      />,
    );
    expect(text('history-count-line')).toBe('Searching for “rabbit” · All timeNo count here, because search reads names, not ingredients.');
  });

  it('none draws nothing; pending draws the silhouette, never a number (C-12)', () => {
    const none = render(<CountLine line={{ kind: 'none' }} filter={ALL} />);
    expect(none.toJSON()).toBeNull();
    none.unmount();
    render(<CountLine line={{ kind: 'pending' }} filter={ALL} />);
    expect(screen.getByTestId('history-count-line-pending', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('history-count-line')).toBeNull();
  });
});
