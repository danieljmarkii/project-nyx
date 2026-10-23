import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colorRoles, theme } from '../../constants/theme';
import { TextLink } from './TextLink';

describe('TextLink (CUL-1911)', () => {
  it('is a button in the action colour, on the 44pt floor, with no slop', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<TextLink label="Log a weigh-in" onPress={onPress} testID="l" />);
    const box = getByTestId('l');
    expect(box.props.accessibilityRole).toBe('button');
    expect(box.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(box.props.style).minHeight).toBe(theme.hitTarget);
    expect(StyleSheet.flatten(getByText('Log a weigh-in').props.style).color).toBe(colorRoles.action.onLight);
    fireEvent.press(box);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('names what it acts on when the words alone do not', () => {
    const { getByLabelText } = render(
      <TextLink label="Edit" accessibilityLabel="Edit Food sensitivity" onPress={jest.fn()} />,
    );
    expect(getByLabelText('Edit Food sensitivity')).toBeTruthy();
  });

  it('a quiet tone takes the secondary ink', () => {
    const { getByText } = render(<TextLink label="Clear date" tone="quiet" onPress={jest.fn()} />);
    expect(StyleSheet.flatten(getByText('Clear date').props.style).color).toBe(theme.colorTextSecondary);
  });
});
