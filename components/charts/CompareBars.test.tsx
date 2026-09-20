// CompareBars against its §05 row (CUL-1064): one bar per window; the counts; the day
// strips; "logged N of M"; NO adjudicating copy — a test greps the component's strings.

import * as fs from 'fs';
import * as path from 'path';
import { configure, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { CompareBars } from './CompareBars';
import { compareWindows } from '../../lib/chartModels';
import { blankComments } from '../../guards/blankComments';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;

const days = (from: string, n: number, skip: number[] = []): string[] =>
  Array.from({ length: n }, (_, i) => i)
    .filter((i) => !skip.includes(i))
    .map((i) => new Date(Date.UTC(2026, 6, 1 + Number(from) + i)).toISOString().slice(0, 10));

const model = compareWindows(
  { label: 'The 10 days before', startDay: '2026-07-01', days: 10, episodeDays: ['2026-07-02', '2026-07-05', '2026-07-09'], loggedDays: days('0', 10, [3, 4]) },
  { label: "The trial's 10 days", startDay: '2026-07-11', days: 10, episodeDays: ['2026-07-12', '2026-07-12', '2026-07-19', '2026-07-20'], loggedDays: days('10', 10) },
);

beforeEach(() => mockedReduced.mockReturnValue(false));

describe('CompareBars — the §05 row', () => {
  it('one bar per window with the count beside it', () => {
    const { getByTestId } = render(<CompareBars model={model} noun="vomiting" />);
    expect(getByTestId('compare-bar-0')).toBeTruthy();
    expect(getByTestId('compare-bar-1')).toBeTruthy();
    expect(getByTestId('compare-count-0').props.children).toBe(3);
    expect(getByTestId('compare-count-1').props.children).toBe(4);
  });

  it('a window with zero episodes renders a zero beside an empty track, not nothing', () => {
    const zero = compareWindows(
      { label: 'Before', startDay: '2026-07-01', days: 5, episodeDays: [], loggedDays: [] },
      { label: 'During', startDay: '2026-07-06', days: 5, episodeDays: ['2026-07-07'], loggedDays: [] },
    );
    const { getByTestId, queryByTestId } = render(<CompareBars model={zero} noun="vomiting" />);
    expect(getByTestId('compare-count-0').props.children).toBe(0);
    expect(queryByTestId('compare-bar-0')).toBeNull(); // no fill for zero — the number carries it
    expect(getByTestId('compare-bar-1')).toBeTruthy();
  });

  it('the window\'s day strip under each bar, hollow where nothing was logged', () => {
    const { getAllByTestId } = render(<CompareBars model={model} noun="vomiting" />);
    expect(getAllByTestId(/^compare-tick-0-\d+-/)).toHaveLength(10);
    expect(getAllByTestId(/^compare-tick-0-\d+-unlogged$/)).toHaveLength(2);
    expect(getAllByTestId(/^compare-tick-1-\d+-logged$/)).toHaveLength(10);
  });

  it('"logged N of M days" in words, under the window\'s name', () => {
    const { getByTestId, getByText } = render(<CompareBars model={model} noun="vomiting" />);
    expect(getByTestId('compare-coverage-0').props.children).toBe('logged 8 of 10 days');
    expect(getByTestId('compare-coverage-1').props.children).toBe('logged 10 of 10 days');
    expect(getByText('The 10 days before')).toBeTruthy();
    expect(getByText("The trial's 10 days")).toBeTruthy();
  });

  it('speaks both counts and both coverages in one label', () => {
    const { getByTestId } = render(<CompareBars model={model} noun="vomiting" />);
    expect(getByTestId('compare-bars').props.accessibilityLabel).toBe(
      "Vomiting: 3 in the 10 days before, logged 8 of 10 days; 4 in the trial's 10 days, logged 10 of 10 days.",
    );
  });

  it('carries NO adjudicating word anywhere in its source strings (the round-3 "fairly")', () => {
    const src = blankComments(fs.readFileSync(path.join(__dirname, 'CompareBars.tsx'), 'utf8'));
    const strings = Array.from(src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g), (m) => m[2].toLowerCase());
    const forbidden = ['fair', 'better', 'worse', 'improv', 'only', 'just', 'good', 'bad', 'fine', 'normal', 'healthy', 'roughly', 'about the same'];
    for (const s of strings) {
      for (const w of forbidden) expect(s).not.toContain(w);
    }
    // And the model's own output is mute too (its test covers the model; this is the pair).
    expect(JSON.stringify(model).toLowerCase()).not.toMatch(/fair|better|worse|improv/);
  });

  it('draws in on the FACT, extends from the left edge, and is static under reduced motion', () => {
    const spy = jest.spyOn(Animated, 'parallel');
    const { getByTestId } = render(<CompareBars model={model} noun="vomiting" />);
    expect(spy).not.toHaveBeenCalled();
    const style = StyleSheet.flatten(getByTestId('compare-bar-1').props.style);
    expect(style.transformOrigin).toBe('left');
    render(<CompareBars model={model} noun="vomiting" drawIn />);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    mockedReduced.mockReturnValue(true);
    render(<CompareBars model={model} noun="vomiting" drawIn />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
