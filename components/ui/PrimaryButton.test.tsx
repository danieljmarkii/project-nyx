import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { theme, colorRoles } from '../../constants/theme';

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

  // CUL-2200 (C1 of CUL-1279's round): the main button is the action, so indigo with a
  // white label, not the near black it was.
  it('paints the primary variant the action fill with its white label', () => {
    const { getByTestId, getByText } = render(
      <PrimaryButton label="Log it" onPress={() => {}} testID="btn" />,
    );
    const btnBg = StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor;
    const labelColor = StyleSheet.flatten(getByText('Log it').props.style).color;
    expect(btnBg).toBe(colorRoles.action.fill);
    expect(btnBg).toBe(theme.colorAction);
    expect(labelColor).toBe(colorRoles.action.labelOnFill);
  });

  // C3: on a night ground indigo sinks, so the night variant fills moonlight with the
  // night as its label.
  it('paints the night variant moonlight with a night label', () => {
    const { getByTestId, getByText } = render(
      <PrimaryButton label="Create account" onPress={() => {}} variant="night" testID="btn" />,
    );
    const btnBg = StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor;
    const labelColor = StyleSheet.flatten(getByText('Create account').props.style).color;
    expect(btnBg).toBe(colorRoles.action.onNight);
    expect(btnBg).toBe(theme.colorMoonlight);
    expect(labelColor).toBe(colorRoles.action.labelOnNightFill);
  });

  it('tints the night spinner with the night label colour', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Create account" onPress={() => {}} variant="night" loading testID="btn" />,
    );
    expect(getByTestId('btn-spinner').props.color).toBe(theme.colorBrandNight);
  });

  // CUL-1900: the filled red commit (DeleteAccountSheet's hand rolled button) is a
  // variant, apart from the quiet 'destructive' label it must not replace.
  it('paints destructiveFilled red with a white label and spinner, and leaves destructive quiet', () => {
    const { getByTestId, getByText, rerender } = render(
      <PrimaryButton label="Delete account" onPress={() => {}} variant="destructiveFilled" testID="btn" />,
    );
    expect(StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor).toBe(theme.colorDestructive);
    expect(StyleSheet.flatten(getByText('Delete account').props.style).color).toBe(theme.colorTextOnDark);

    rerender(<PrimaryButton label="Delete account" onPress={() => {}} variant="destructiveFilled" loading testID="btn" />);
    expect(getByTestId('btn-spinner').props.color).toBe(theme.colorTextOnDark);

    rerender(<PrimaryButton label="Remove" onPress={() => {}} variant="destructive" testID="btn" />);
    expect(StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor).toBe('transparent');
    expect(StyleSheet.flatten(getByText('Remove').props.style).color).toBe(theme.colorDestructive);
  });

  it('greys a disabled destructiveFilled like every other variant', () => {
    const { getByTestId } = render(
      <PrimaryButton label="Delete account" onPress={() => {}} variant="destructiveFilled" disabled testID="btn" />,
    );
    expect(StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor).toBe(theme.colorBorder);
  });

  // CUL-1911 — the plain variant is a quiet row: no fill, no edge, and the 44pt floor by
  // its own box, since it drops the padding the filled variants reach the floor with.
  it('plain: no fill or edge, secondary ink, and the 44pt floor by construction', () => {
    const { getByTestId, getByText } = render(
      <PrimaryButton label="Archive Mochi" variant="plain" onPress={jest.fn()} testID="btn" />,
    );
    const box = StyleSheet.flatten(getByTestId('btn').props.style);
    expect(box.backgroundColor).toBe('transparent');
    expect(box.borderWidth).toBeUndefined();
    expect(box.minHeight).toBe(theme.hitTarget);
    expect(StyleSheet.flatten(getByText('Archive Mochi').props.style).color).toBe(theme.colorTextSecondary);
  });

  it('plain, disabled: the label greys and no grey fill appears', () => {
    const { getByTestId, getByText } = render(
      <PrimaryButton label="Archive Mochi" variant="plain" disabled onPress={jest.fn()} testID="btn" />,
    );
    expect(StyleSheet.flatten(getByTestId('btn').props.style).backgroundColor).toBe('transparent');
    expect(StyleSheet.flatten(getByText('Archive Mochi').props.style).color).toBe(theme.colorTextTertiary);
  });

  // The icon slot (CUL-1910): the glyph takes the label's colour on every variant, and
  // the disabled grey with it, so an icon can never sit a different colour from its label.
  it('tints its icon with the label colour, and greys it with the label when disabled', () => {
    const seen: (string | undefined)[] = [];
    const Glyph = ({ color }: { color?: string }) => {
      seen.push(color);
      return null;
    };
    const { rerender } = render(<PrimaryButton label="Take a photo" onPress={() => {}} icon={Glyph} />);
    expect(seen.pop()).toBe(theme.colorTextOnDark);
    rerender(<PrimaryButton label="Take a photo" onPress={() => {}} icon={Glyph} variant="secondary" />);
    expect(seen.pop()).toBe(theme.colorTextSecondary);
    rerender(<PrimaryButton label="Take a photo" onPress={() => {}} icon={Glyph} disabled />);
    expect(seen.pop()).toBe(theme.colorTextTertiary);
  });

  it('lays the icon and label out in a row only when an icon is passed', () => {
    const Glyph = () => null;
    const { getByTestId, rerender } = render(<PrimaryButton label="Go" onPress={() => {}} testID="btn" />);
    expect(StyleSheet.flatten(getByTestId('btn').props.style).flexDirection).toBeUndefined();
    rerender(<PrimaryButton label="Go" onPress={() => {}} icon={Glyph} testID="btn" />);
    expect(StyleSheet.flatten(getByTestId('btn').props.style).flexDirection).toBe('row');
  });
});
