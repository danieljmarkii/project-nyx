// DayLane (DR-2 §3) — the Home recap band's compact lane. Assertions: the fixed 6a→12a
// axis renders, and each event paints exactly one dot in its SHARED category tint
// (NODE_TINT_DAY) at its fractional position — the light-ground cousin of the spine's
// node, drawn from the same constants so the two cannot drift.
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DayLane } from './DayLane';
import { NODE_TINT_DAY } from './nodeTints';
import type { LaneDot } from '../../lib/todayLane';

function styleOf(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style) as { backgroundColor?: string; left?: string };
}

// The lane is a11y-hidden (decorative — the count line beside it is the accessible
// summary), so queries opt into hidden elements to assert what is painted, the same way
// PullToRefreshSky's test reaches its hidden band.
const HIDDEN = { includeHiddenElements: true } as const;

describe('DayLane', () => {
  it('renders the fixed 6a·noon·6p·12a axis', () => {
    const { getByText } = render(<DayLane dots={[]} />);
    expect(getByText('6a', HIDDEN)).toBeTruthy();
    expect(getByText('noon', HIDDEN)).toBeTruthy();
    expect(getByText('6p', HIDDEN)).toBeTruthy();
    expect(getByText('12a', HIDDEN)).toBeTruthy();
  });

  it('renders no dots on a zero-log day (empty lane, axis only)', () => {
    const { queryAllByTestId } = render(<DayLane dots={[]} />);
    expect(queryAllByTestId('lane-dot', HIDDEN)).toHaveLength(0);
  });

  it('paints one dot per event, in its NODE_TINT_DAY category hue, at its position', () => {
    const dots: LaneDot[] = [
      { key: 'a', category: 'meal', position: 0.1 },
      { key: 'b', category: 'symptom', position: 0.5 },
      { key: 'c', category: 'medication', position: 1 },
    ];
    const { getAllByTestId } = render(<DayLane dots={dots} />);
    const painted = getAllByTestId('lane-dot', HIDDEN);
    expect(painted).toHaveLength(3);
    expect(styleOf(painted[0]).backgroundColor).toBe(NODE_TINT_DAY.meal);
    expect(styleOf(painted[1]).backgroundColor).toBe(NODE_TINT_DAY.symptom);
    expect(styleOf(painted[2]).backgroundColor).toBe(NODE_TINT_DAY.medication);
    expect(styleOf(painted[0]).left).toBe('10%');
    expect(styleOf(painted[1]).left).toBe('50%');
    expect(styleOf(painted[2]).left).toBe('100%');
  });
});
