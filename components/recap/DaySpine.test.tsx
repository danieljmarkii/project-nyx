// DaySpine (DR-1 §2.4) — the timeline-as-list. Assertions: every node is a doorway
// that routes on press, the fact-only sub-line renders, the B-568 wet/dry format tag
// renders (and is suppressed when the mapper returns null), and the screen-reader label
// reads in visual order (title · detail · format-tag … sub-line … time).
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

  it('renders the wet/dry format tag as a sibling of the title (B-568 parity)', () => {
    // Two rows of the SAME prescription line stocked in both formats — the case the tag
    // exists for. Without it both rows read "Hill's z/d · all eaten" and are identical.
    const { getByText } = render(
      <DaySpine
        rows={[
          row({ id: 'a', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'WET' }),
          row({ id: 'b', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'DRY' }),
        ]}
        onPressRow={jest.fn()}
      />,
    );
    expect(getByText('WET')).toBeTruthy();
    expect(getByText('DRY')).toBeTruthy();
  });

  it('renders no format tag when the mapper suppresses it (null)', () => {
    // A suppressed tag (unspecified format, or a treat-format treat that would merely
    // echo its own label) is null on the row — the spine renders nothing, never an
    // empty tracked-caps element.
    const { queryByText } = render(
      <DaySpine rows={[row({ id: 'a', category: 'meal', title: 'Treat', formatTag: null })]} onPressRow={jest.fn()} />,
    );
    expect(queryByText('TREAT')).toBeNull();
  });

  it('reads the format tag into the screen-reader label in visual order', () => {
    const { getByLabelText } = render(
      <DaySpine
        rows={[row({ id: 'a', category: 'meal', title: "Hill's z/d", detail: 'all eaten', formatTag: 'DRY', time: '7:42 AM', subline: 'Trial diet' })]}
        onPressRow={jest.fn()}
      />,
    );
    // title, detail, tag (lowercased so it speaks as a word), sub-line, time.
    expect(getByLabelText("Hill's z/d, all eaten, dry, Trial diet, 7:42 AM. Opens details")).toBeTruthy();
  });
});
