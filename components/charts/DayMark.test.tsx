// DayMark against its §05 row (CUL-1064): the date is always rendered text; the count is a
// separate node; a layer off is not "clear" (the hairline stays); a day ahead is not a
// control; colour is never the only carrier.

import { configure, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DayMark } from './DayMark';
import { theme } from '../../constants/theme';

// The charts' internals are hidden from assistive tech behind ONE spoken label (the
// shipped lane's pattern), so the queries below opt into hidden elements to reach them.
configure({ defaultIncludeHiddenElements: true });

const base = { dayKey: '2026-09-19', dayOfMonth: 19, noun: 'vomiting' };
const flat = (style: unknown): Record<string, unknown> => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('DayMark — the §05 row', () => {
  it('the date is always rendered text, on every coverage', () => {
    for (const coverage of ['logged', 'left_some', 'unlogged', 'ahead'] as const) {
      const { getByTestId } = render(<DayMark {...base} count={0} coverage={coverage} />);
      expect(getByTestId('daymark-date').props.children).toBe(19);
    }
    const { getByTestId } = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(getByTestId('daymark-date').props.children).toBe(19);
  });

  it('the count sits in the corner as its own node, separate from the date', () => {
    const { getByTestId } = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(getByTestId('daymark-count').props.children).toBe(2);
    expect(getByTestId('daymark-count')).not.toBe(getByTestId('daymark-date'));
  });

  it('a zero day carries no count node — the date is the mark', () => {
    const { queryByTestId } = render(<DayMark {...base} count={0} coverage="logged" />);
    expect(queryByTestId('daymark-count')).toBeNull();
  });

  it('a layer OFF is not "clear": the rose and the count go, the hairline and the date stay', () => {
    const { queryByTestId, getByTestId } = render(<DayMark {...base} count={2} coverage="logged" symptomLayer={false} />);
    expect(queryByTestId('daymark-count')).toBeNull();
    expect(getByTestId('daymark-hairline-logged')).toBeTruthy();
    expect(getByTestId('daymark-date').props.children).toBe(19);
    expect(flat(getByTestId('daymark').props.style).backgroundColor).not.toBe(theme.colorEventSymptom);
    // And the spoken day says "logged", never "no vomiting" — the layer is off, not the fact.
    expect(getByTestId('daymark').props.accessibilityLabel).toContain('logged');
    expect(getByTestId('daymark').props.accessibilityLabel).not.toContain('no vomiting');
  });

  it('the coverage hairline: logged, paler for a meal left unfinished, none on an unlogged day', () => {
    expect(render(<DayMark {...base} count={0} coverage="logged" />).getByTestId('daymark-hairline-logged')).toBeTruthy();
    expect(render(<DayMark {...base} count={0} coverage="left_some" />).getByTestId('daymark-hairline-left_some')).toBeTruthy();
    expect(render(<DayMark {...base} count={0} coverage="unlogged" />).queryByTestId(/daymark-hairline/)).toBeNull();
    expect(render(<DayMark {...base} count={0} coverage="ahead" />).queryByTestId(/daymark-hairline/)).toBeNull();
  });

  it('a day ahead is a plain view: no press, no `disabled` claim (C-7)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<DayMark {...base} count={0} coverage="ahead" onPress={onPress} />);
    const node = getByTestId('daymark');
    expect(node.props.accessibilityRole).toBeUndefined();
    expect(node.props.accessibilityState?.disabled).toBeUndefined();
    expect(node.props.disabled).toBeUndefined();
    // Assert the HOST, never press: `fireEvent.press` reaches the composite's `onPress`
    // prop by walking the tree and would pass over a plain View (C-6). A responder host
    // carries `onClick` / `onResponderGrant`; this one carries neither.
    expect(node.props.onClick).toBeUndefined();
    expect(node.props.onResponderGrant).toBeUndefined();
    expect(node.props.onPress).toBeUndefined();
    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityLabel).toContain('ahead');
  });

  it('a logged day with a handler is a button that opens the day', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<DayMark {...base} count={1} coverage="logged" onPress={onPress} />);
    const node = getByTestId('daymark');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toContain('opens the day');
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the layers: a medication dot; a photo dot, rose when read as worth a call — and SAID', () => {
    const { getByTestId } = render(<DayMark {...base} count={1} coverage="logged" medication photo="worth_a_call" />);
    expect(getByTestId('daymark-layer-medication')).toBeTruthy();
    const dot = getByTestId('daymark-layer-photo-worth_a_call');
    expect(flat(dot.props.style).backgroundColor).toBe(theme.colorEventSymptomInk);
    const label = getByTestId('daymark').props.accessibilityLabel as string;
    expect(label).toContain('medication');
    expect(label).toContain('read as worth a call');
    const seen = render(<DayMark {...base} count={0} coverage="logged" photo="seen" />);
    expect(flat(seen.getByTestId('daymark-layer-photo-seen').props.style).backgroundColor).not.toBe(theme.colorEventSymptomInk);
    expect(seen.getByTestId('daymark').props.accessibilityLabel).toContain('photographed');
  });

  it('speaks the count, never an all-clear', () => {
    const two = render(<DayMark {...base} count={2} coverage="logged" />);
    expect(two.getByTestId('daymark').props.accessibilityLabel).toContain('vomiting logged 2 times');
    const one = render(<DayMark {...base} count={1} coverage="logged" />);
    expect(one.getByTestId('daymark').props.accessibilityLabel).toContain('vomiting logged 1 time');
    const none = render(<DayMark {...base} count={0} coverage="logged" />);
    const label = none.getByTestId('daymark').props.accessibilityLabel as string;
    expect(label).toContain('logged, no vomiting');
    expect(label).not.toMatch(/clear|fine|good/i);
    const un = render(<DayMark {...base} count={0} coverage="unlogged" />);
    expect(un.getByTestId('daymark').props.accessibilityLabel).toContain('nothing logged');
  });
});
