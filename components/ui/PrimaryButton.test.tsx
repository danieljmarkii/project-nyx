import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { theme } from '../../constants/theme';

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

  // disabled + loading is plausible on a submit button (`disabled={!valid || submitting}
  // loading={submitting}`). The spinner must not stay white on the greyed fill, or it
  // vanishes — it takes the disabled label tint instead.
  it('tints the spinner for contrast on the greyed fill when disabled + loading', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Create account" onPress={() => {}} disabled loading testID="btn" />,
    );
    expect(getByTestId('btn-spinner').props.color).toBe(theme.colorTextTertiary);
  });

  it('uses the variant spinner tint while loading but not disabled', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Create account" onPress={() => {}} loading testID="btn" />,
    );
    expect(getByTestId('btn-spinner').props.color).toBe(theme.colorTextOnDark);
  });

  // The accent variant (B-251 PR 5 Landing hero) fills teal with a near-black
  // label — white would fail contrast on the bright accent.
  it('paints the accent variant teal with a near-black label', () => {
    const { getByTestId, getByText } = render(
      <PrimaryButton label="Create account" onPress={() => {}} variant="accent" testID="btn" />,
    );
    const btnBg = StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor;
    const labelColor = StyleSheet.flatten(getByText('Create account').props.style).color;
    expect(btnBg).toBe(theme.colorAccent);
    expect(labelColor).toBe(theme.colorNeutralDark);
  });

  it('tints the accent spinner near-black to read on the teal fill', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Create account" onPress={() => {}} variant="accent" loading testID="btn" />,
    );
    expect(getByTestId('btn-spinner').props.color).toBe(theme.colorNeutralDark);
  });
});
