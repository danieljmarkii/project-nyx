// DaySpine (DR-1 §2.4) — the timeline-as-list. Assertions: every node is a doorway
// that routes on press, the fact-only sub-line renders, and the screen-reader label
// reads in visual order (title · detail … sub-line … time).
import { fireEvent, render } from '@testing-library/react-native';
import { DaySpine } from './DaySpine';
import type { DaySummaryRow } from '../../lib/daySummary';

function row(over: Partial<DaySummaryRow> & { id: string; category: DaySummaryRow['category'] }): DaySummaryRow {
  return {
    eventType: over.category === 'symptom' ? 'vomit' : 'meal',
    title: 'Event',
    detail: null,
    formatTag: null,
    time: '9:00 AM',
    timeMs: 0,
    subline: null,
    ...over,
  } as DaySummaryRow;
}

describe('DaySpine', () => {
  it('routes to the tapped row’s event', () => {
    const onPressRow = jest.fn();
    const rows = [
      row({ id: 'a', category: 'meal', title: 'Whitefish', detail: 'all eaten', time: '7:42 AM' }),
      row({ id: 'b', category: 'symptom', title: 'Vomit', time: '9:15 AM' }),
    ];
    const { getAllByRole } = render(<DaySpine rows={rows} onPressRow={onPressRow} />);
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.press(buttons[1]);
    expect(onPressRow).toHaveBeenCalledWith('b');
  });

  it('renders the fact-only sub-line when present', () => {
    const { getByText } = render(
      <DaySpine rows={[row({ id: 'a', category: 'meal', title: 'Whitefish', subline: 'Trial diet' })]} onPressRow={jest.fn()} />,
    );
    expect(getByText('Trial diet')).toBeTruthy();
  });

  it('reads a screen-reader label in visual order', () => {
    const { getByLabelText } = render(
      <DaySpine
        rows={[row({ id: 'a', category: 'meal', title: 'Whitefish', detail: 'all eaten', time: '7:42 AM', subline: 'Trial diet' })]}
        onPressRow={jest.fn()}
      />,
    );
    expect(getByLabelText('Whitefish, all eaten, Trial diet, 7:42 AM. Opens details')).toBeTruthy();
  });
});
