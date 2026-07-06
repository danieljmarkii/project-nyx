import { render, fireEvent } from '@testing-library/react-native';
import { PrimaryButton } from './PrimaryButton';

describe('PrimaryButton', () => {
  it('renders its label and fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton label="Continue" onPress={onPress} />);
    fireEvent.press(getByText('Continue'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PrimaryButton label="Continue" onPress={onPress} disabled testID="btn" />,
    );
    fireEvent.press(getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByTestId('btn').props.accessibilityState).toMatchObject({ disabled: true });
  });

  // Loading swaps the label for a spinner and blocks the press, so an async
  // submit can't be double-fired while it's in flight.
  it('shows a spinner, hides the label, and blocks presses while loading', () => {
    const onPress = jest.fn();
    const { getByTestId, queryByText } = render(
      <PrimaryButton label="Create account" onPress={onPress} loading testID="btn" />,
    );
    expect(getByTestId('btn-spinner')).toBeTruthy();
    expect(queryByText('Create account')).toBeNull();

    fireEvent.press(getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  // The button stays named for a screen reader even while the label text is
  // replaced by the spinner, and reports the busy state.
  it('exposes a button role and a busy accessibility state while loading', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Create account" onPress={() => {}} loading testID="btn" />,
    );
    const btn = getByTestId('btn');
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.accessibilityLabel).toBe('Create account');
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});
