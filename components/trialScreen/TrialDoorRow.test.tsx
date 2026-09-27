// The Pet tab's door row as drawn (TS-6 · CUL-1302; rulings (a), (a′)). The model is
// `lib/trialDoorRow.test.ts`'s business; this pins what the drawing does with it.
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TrialDoorRow } from './TrialDoorRow';
import type { TrialDoorRowModel } from '../../lib/trialDoorRow';

type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root'];

const RUNNING: TrialDoorRowModel = {
  eyebrow: 'Diet trial',
  title: 'Rabbit trial · day 23 of 56',
  alert: null,
  progressFraction: 23 / 56,
  subline: 'Royal Canin Rabbit · ends Aug 27',
  accessibilityLabel: 'Rabbit trial · day 23 of 56. Royal Canin Rabbit · ends Aug 27. Open the diet trial.',
};
const REFUSING: TrialDoorRowModel = {
  ...RUNNING,
  alert: '4 feedings of the 5 trial-diet feedings you’ve rated were left unfinished, across 2 days.',
  progressFraction: null,
  subline: 'Royal Canin Rabbit',
};

describe('TrialDoorRow', () => {
  it('one 44pt button carrying the model’s sentence, with no buttons inside it', () => {
    const onPress = jest.fn();
    const view = render(<TrialDoorRow model={RUNNING} onPress={onPress} />);
    const row = view.getByTestId('trial-door-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(RUNNING.accessibilityLabel);
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.UNSAFE_root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'button' && typeof n.type === 'string')).toHaveLength(1);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a running trial: the bar and the sub-line, no warning', () => {
    const view = render(<TrialDoorRow model={RUNNING} onPress={jest.fn()} />);
    expect(view.getByTestId('trial-door-row-track')).toBeTruthy();
    expect(view.getByText('Royal Canin Rabbit · ends Aug 27')).toBeTruthy();
    expect(view.queryByTestId('trial-door-row-alert')).toBeNull();
  });

  it('a safety face: the screen’s first sentence on the rail, and no bar', () => {
    const view = render(<TrialDoorRow model={REFUSING} onPress={jest.fn()} />);
    const alert = view.getByTestId('trial-door-row-alert');
    expect(StyleSheet.flatten(alert.props.style).borderLeftWidth).toBeGreaterThan(0);
    expect(view.getByText(REFUSING.alert!)).toBeTruthy();
    expect(view.queryByTestId('trial-door-row-track')).toBeNull();
  });
});
