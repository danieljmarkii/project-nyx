// The count line, form by form (CUL-1164 / HV-7; spec §3.2, AC 3's rendering half, AC 6, AC 7).
// The words are `countLineOf`'s (HV-4, table-tested there); this file proves each form is
// drawn as returned, with nothing added and nothing dropped.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

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
      line2: '1 day unlogged · 3 logged twice in the same minute',
      doors: [{ key: 'outside-trial-diet', label: 'Outside the trial diet ›' }],
    };
    render(<CountLine line={line} filter={ALL} />);
    expect(text('history-count-line-1')).toBe('Since the last vet visit, Jul 26 · record from Aug 3 · 33 logged');
    expect(screen.getByText('33 logged')).toBeTruthy();
    expect(screen.getByText('1 day unlogged · 3 logged twice in the same minute')).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-door-outside-trial-diet'));
    expect(router.push).toHaveBeenCalledWith('/trial-exposures');
    // The door is its own 44pt box (C-5) and speaks its words without the chevron.
    expect(screen.getByTestId('history-door-outside-trial-diet').props.accessibilityLabel).toBe('Outside the trial diet');
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
        line={{ kind: 'search', line1: { lead: 'Rows that mention ', strong: '“rabbit”', tail: ' · All time' }, line2: 'Search finds; it never counts.' }}
        filter={ALL}
      />,
    );
    expect(text('history-count-line')).toBe('Rows that mention “rabbit” · All timeSearch finds; it never counts.');
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
