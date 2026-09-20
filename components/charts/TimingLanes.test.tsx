// TimingLanes against its §05 row (CUL-1064): positions equal the shipped panel's for the
// same minutes; the three bucket counts; "N timed of M"; the untimed line cannot be
// omitted (the prop does not exist — pinned at the type level and at render).

import { configure, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { TimingLanes } from './TimingLanes';
import { laneDots, timingLanesAxis } from '../../lib/chartModels';
import { patternsTimingPos } from '../../lib/patternsTiming';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;

const axis = timingLanesAxis();
const before = laneDots({ label: 'Before the trial', timedMinutes: [8, 14, 19, 22, 26, 29, 45, 70, 95, 130, 180, 240, 420], total: 19 });
const during = laneDots({ label: 'In the trial', timedMinutes: [3, 5, 9, 12, 16, 21, 24], total: 21 });
const DOT_R = 3.5;

const flat = (style: unknown): Record<string, number> => StyleSheet.flatten(style as never) as Record<string, number>;

beforeEach(() => mockedReduced.mockReturnValue(false));

describe('TimingLanes — the §05 row', () => {
  it('a dot per timed episode, at the shipped panel\'s position for the same minutes', () => {
    const { getByTestId, getAllByTestId, queryAllByTestId } = render(<TimingLanes lanes={[before, during]} axis={axis} />);
    expect(queryAllByTestId(/^timing-dot-/)).toHaveLength(0); // unmeasured: nothing placed yet
    fireEvent(getByTestId('timing-lane-track-0'), 'layout', { nativeEvent: { layout: { width: 300, height: 60 } } });
    expect(getAllByTestId(/^timing-dot-0-/)).toHaveLength(13);
    expect(getAllByTestId(/^timing-dot-1-/)).toHaveLength(7);
    // Dot 7 of the before lane is the 70-minute episode (sorted ascending).
    const dot = flat(getByTestId('timing-dot-0-7').props.style);
    expect(dot.left).toBeCloseTo(patternsTimingPos(70) * 300 - DOT_R, 6);
    // And the same minute lands in the same place on the other lane.
    const other = laneDots({ label: 'x', timedMinutes: [70], total: 1 });
    const { getByTestId: get2 } = render(<TimingLanes lanes={[other]} axis={axis} />);
    fireEvent(get2('timing-lane-track-0'), 'layout', { nativeEvent: { layout: { width: 300, height: 60 } } });
    expect(flat(get2('timing-dot-0-0').props.style).left).toBeCloseTo(dot.left, 6);
  });

  it('the three bucket counts in a row under each lane', () => {
    const { getByTestId } = render(<TimingLanes lanes={[before, during]} axis={axis} />);
    expect(getByTestId('timing-bucket-0-0').props.children).toBe(6);
    expect(getByTestId('timing-bucket-0-1').props.children).toBe(6);
    expect(getByTestId('timing-bucket-0-2').props.children).toBe(1);
    expect(getByTestId('timing-bucket-1-0').props.children).toBe(7);
    expect(getByTestId('timing-bucket-1-1').props.children).toBe(0);
    expect(getByTestId('timing-bucket-1-2').props.children).toBe(0);
  });

  it('"N timed of M" at the right of each lane', () => {
    const { getByTestId } = render(<TimingLanes lanes={[before, during]} axis={axis} />);
    expect(getByTestId('timing-timed-0').props.children).toBe('13 timed of 19');
    expect(getByTestId('timing-timed-1').props.children).toBe('7 timed of 21');
  });

  it('Dr. Chen: seven of seven under 30 minutes with fourteen untimed — the untimed line is there, beside the lane', () => {
    const { getByTestId } = render(<TimingLanes lanes={[before, during]} axis={axis} />);
    expect(getByTestId('timing-untimed-line').props.children).toBe(
      "6 + 14 episodes couldn't be timed against a meal — they aren't on the lanes.",
    );
    const label = getByTestId('timing-lanes').props.accessibilityLabel as string;
    expect(label).toContain('In the trial: 7 timed of 21.');
    expect(label).toContain("6 + 14 episodes couldn't be timed");
  });

  it('the untimed line renders at zero too — nothing to disclose is itself disclosed', () => {
    const all = laneDots({ label: 'All timed', timedMinutes: [10, 20], total: 2 });
    const { getByTestId } = render(<TimingLanes lanes={[all]} axis={axis} />);
    expect(getByTestId('timing-untimed-line').props.children).toBe('Every episode could be timed against a meal.');
  });

  it('the untimed line CANNOT be omitted: no prop exists to hide or replace it', () => {
    // @ts-expect-error — there is deliberately no such prop (the §05 "uncounted disclosed" cell).
    render(<TimingLanes lanes={[before]} axis={axis} hideUntimed />);
    // @ts-expect-error — nor one to hand the component a line of the caller's own.
    render(<TimingLanes lanes={[before]} axis={axis} untimedLine="" />);
    // @ts-expect-error — nor one to render only the lanes.
    render(<TimingLanes lanes={[before]} axis={axis} lanesOnly />);
    const { getByTestId } = render(<TimingLanes lanes={[before]} axis={axis} />);
    expect(getByTestId('timing-untimed-line')).toBeTruthy();
  });

  it('the axis reads the shipped words, once, under the last lane', () => {
    const { getAllByText, getByText } = render(<TimingLanes lanes={[before, during]} axis={axis} />);
    for (const w of ['ate', '30m', '1h', '2h', '4h', '8h+']) expect(getAllByText(w)).toHaveLength(1);
    expect(getByText('The counts under each lane: under 30 min · 30 min to 6 h · over 6 h.')).toBeTruthy();
  });

  it('draws in on the FACT and is static under reduced motion', () => {
    const spy = jest.spyOn(Animated, 'parallel');
    render(<TimingLanes lanes={[before, during]} axis={axis} />);
    expect(spy).not.toHaveBeenCalled();
    render(<TimingLanes lanes={[before, during]} axis={axis} drawIn />);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    mockedReduced.mockReturnValue(true);
    render(<TimingLanes lanes={[before, during]} axis={axis} drawIn />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
