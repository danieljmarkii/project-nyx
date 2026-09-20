// WeeklyBars against its §05 row (CUL-1064): a mark per week; a count on every bar; seven
// coverage ticks per week; hollow ticks and "N days so far"; the mark dated; weeks start
// on Sunday (the model's, asserted there); the draw in wired to the FACT and the hooks.

import { configure, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { WeeklyBars } from './WeeklyBars';
import { weeklyBuckets } from '../../lib/chartModels';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
const mockedReduced = useReducedMotion as jest.Mock;
const mockedActive = useAppActive as jest.Mock;

// 2026-09-20 is a Sunday; today is that Tuesday.
const model = weeklyBuckets({
  episodeDays: ['2026-09-06', '2026-09-06', '2026-09-08', '2026-09-21'],
  loggedDays: ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-20', '2026-09-22'],
  weeksEnding: '2026-09-22',
  today: '2026-09-22',
  weeks: 3,
  mark: { day: '2026-09-12', label: 'trial · Sep 12' },
});

beforeEach(() => {
  mockedReduced.mockReturnValue(false);
  mockedActive.mockReturnValue(true);
});

describe('WeeklyBars — the §05 row', () => {
  it('a mark per week and a count on every bar, the zero included', () => {
    const { getByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    expect(model.weeks.map((w) => w.count)).toEqual([3, 0, 1]);
    for (let i = 0; i < 3; i++) {
      expect(getByTestId(`weekly-week-${i}`)).toBeTruthy();
      expect(getByTestId(`weekly-bar-${i}`)).toBeTruthy();
      expect(getByTestId(`weekly-count-${i}`).props.children).toBe(model.weeks[i].count);
    }
    expect(getByTestId('weekly-count-1').props.children).toBe(0);
  });

  it('seven coverage ticks under each week — filled, hollow, or absent for a day ahead', () => {
    const { getAllByTestId, queryAllByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    for (let i = 0; i < 3; i++) {
      expect(getAllByTestId(new RegExp(`^weekly-tick-${i}-\\d-`))).toHaveLength(7);
    }
    // Week 0 (Sep 6–12): three logged days, four hollow.
    expect(getAllByTestId(/^weekly-tick-0-\d-logged$/)).toHaveLength(3);
    expect(getAllByTestId(/^weekly-tick-0-\d-unlogged$/)).toHaveLength(4);
    // Week 1 (Sep 13–19): nothing logged — seven hollow ticks, none filled.
    expect(queryAllByTestId(/^weekly-tick-1-\d-logged$/)).toHaveLength(0);
    expect(getAllByTestId(/^weekly-tick-1-\d-unlogged$/)).toHaveLength(7);
    // Week 2 (Sep 20–26), today Tuesday: two logged, one hollow, four ahead.
    expect(getAllByTestId(/^weekly-tick-2-\d-logged$/)).toHaveLength(2);
    expect(getAllByTestId(/^weekly-tick-2-\d-unlogged$/)).toHaveLength(1);
    expect(getAllByTestId(/^weekly-tick-2-\d-ahead$/)).toHaveLength(4);
  });

  it('Data Scientist: a week with two episodes and three unlogged days reads THIN — the ticks say so', () => {
    const thin = weeklyBuckets({
      episodeDays: ['2026-09-07', '2026-09-08'],
      loggedDays: ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-11'],
      weeksEnding: '2026-09-12',
      today: '2026-09-30',
      weeks: 1,
    });
    const { getAllByTestId, getByTestId } = render(<WeeklyBars model={thin} noun="vomiting" />);
    expect(getByTestId('weekly-count-0').props.children).toBe(2);
    expect(getAllByTestId(/^weekly-tick-0-\d-unlogged$/)).toHaveLength(3);
    expect(getByTestId('weekly-bars').props.accessibilityLabel).toContain('4 of 7');
  });

  it('the partial week says "N days so far" and draws the paler bar', () => {
    const { getByTestId, getByText } = render(<WeeklyBars model={model} noun="vomiting" />);
    expect(getByText('3 days so far')).toBeTruthy();
    expect(getByTestId('weekly-partial-label')).toBeTruthy();
  });

  it('the mark is dated in words, and its line lands at the fractional slot once measured', () => {
    const { getByText, getByTestId, queryByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    expect(getByText('trial · Sep 12')).toBeTruthy();
    expect(queryByTestId('weekly-mark-line')).toBeNull(); // unmeasured: no line, the words still there
    fireEvent(getByTestId('weekly-plot'), 'layout', { nativeEvent: { layout: { width: 300, height: 64 } } });
    const line = getByTestId('weekly-mark-line');
    // Sep 12 is the Saturday of week 0 → slot 6/7 of a 100pt slot.
    const left = StyleSheet.flatten(line.props.style).left;
    expect(left).toBeCloseTo((6 / 7) * 100, 6);
  });

  it('the first and last weeks are dated', () => {
    const { getByTestId, queryByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    expect(getByTestId('weekly-date-0').props.children).toBe('Sep 6');
    expect(getByTestId('weekly-date-2').props.children).toBe('Sep 20');
    expect(queryByTestId('weekly-date-1')).toBeNull();
  });

  it('speaks the counts, the coverage and the disclosure in one label', () => {
    const { getByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    const label = getByTestId('weekly-bars').props.accessibilityLabel as string;
    expect(label).toContain('Counts by week: 3, 0, 1. 4 in all.');
    expect(label).toContain('Days logged per week: 3 of 7, 0 of 7, 2 of 3.');
    expect(label).toContain('3 days so far');
    expect(label).toContain('Trial · Sep 12');
    expect(label).toContain('weeks starting Sunday');
    expect(label).not.toContain('!');
  });

  it('draws in on the FACT, and not without it', () => {
    const spy = jest.spyOn(Animated, 'parallel');
    render(<WeeklyBars model={model} noun="vomiting" />);
    expect(spy).not.toHaveBeenCalled();
    render(<WeeklyBars model={model} noun="vomiting" drawIn identity="sep" />);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders the static frame under reduced motion, and settles on blur', () => {
    const spy = jest.spyOn(Animated, 'parallel');
    mockedReduced.mockReturnValue(true);
    const { getByTestId } = render(<WeeklyBars model={model} noun="vomiting" drawIn />);
    expect(spy).not.toHaveBeenCalled();
    expect(getByTestId('weekly-bar-0')).toBeTruthy();
    mockedReduced.mockReturnValue(false);
    mockedActive.mockReturnValue(false);
    expect(() => render(<WeeklyBars model={model} noun="vomiting" drawIn />)).not.toThrow();
    spy.mockRestore();
  });

  it('every bar rises about its baseline (the static origin is the bottom)', () => {
    const { getByTestId } = render(<WeeklyBars model={model} noun="vomiting" />);
    const style = StyleSheet.flatten(getByTestId('weekly-bar-0').props.style);
    expect(style.transformOrigin).toBe('bottom');
  });
});
