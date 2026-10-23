import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { DoorRow } from './DoorRow';

describe('DoorRow (CUL-1911)', () => {
  it('is one button, one stop, on the 44pt floor, and draws the one door mark', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <DoorRow title="Food sensitivity" detail="Diagnosed Mar 2026" accessibilityLabel="Food sensitivity, diagnosed Mar 2026, active. Edit" onPress={onPress} testID="row" />,
    );
    const row = getByLabelText('Food sensitivity, diagnosed Mar 2026, active. Edit');
    expect(row.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(getByTestId('row').props.style).minHeight).toBe(theme.hitTarget);
    expect(getByTestId('door-mark', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
