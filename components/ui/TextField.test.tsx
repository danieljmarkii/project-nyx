import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TextField } from './TextField';
import { theme } from '../../constants/theme';

// Styles are applied as arrays with an inline override on the field container;
// flatten so we compare the resolved value regardless of the style-array shape.
function flatStyle(node: { props: { style: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
}

function fieldBorderColor(node: { props: { style: unknown } }): string | undefined {
  return flatStyle(node).borderColor as string | undefined;
}

describe('TextField', () => {
  it('renders the label + placeholder and reports edits', () => {
    const onChangeText = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <TextField label="Email" placeholder="you@example.com" value="" onChangeText={onChangeText} />,
    );
    expect(getByText('Email')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'jordan@nyx.app');
    expect(onChangeText).toHaveBeenCalledWith('jordan@nyx.app');
  });

  // a11y: the input carries the label as its accessible name; an explicit
  // accessibilityLabel wins over the visible label when the two must differ.
  it('names the input for a screen reader (label, or an explicit override)', () => {
    const { getByLabelText, rerender } = render(
      <TextField label="Email" value="" onChangeText={() => {}} testID="email" />,
    );
    expect(getByLabelText('Email').props.testID).toBe('email');

    rerender(
      <TextField label="Email" accessibilityLabel="Email address" value="" onChangeText={() => {}} />,
    );
    expect(getByLabelText('Email address')).toBeTruthy();
  });

  // The field's border is the visual state: neutral at rest, the interactive
  // accent on focus (the focus ring).
  it('draws the accent focus ring on focus and drops it on blur', () => {
    const { getByTestId } = render(
      <TextField label="Email" value="" onChangeText={() => {}} testID="email" />,
    );
    const field = getByTestId('email-field');
    expect(fieldBorderColor(field)).toBe(theme.colorBorder);

    fireEvent(getByTestId('email'), 'focus');
    expect(fieldBorderColor(getByTestId('email-field'))).toBe(theme.colorAccent);

    fireEvent(getByTestId('email'), 'blur');
    expect(fieldBorderColor(getByTestId('email-field'))).toBe(theme.colorBorder);
  });

  it('meets the 44pt minimum target height', () => {
    const { getByTestId } = render(
      <TextField label="Email" value="" onChangeText={() => {}} testID="email" />,
    );
    const minHeight = flatStyle(getByTestId('email-field')).minHeight as number;
    expect(minHeight).toBeGreaterThanOrEqual(44);
  });

  describe('error state', () => {
    it('shows the message and turns the border destructive when an error is present', () => {
      const { getByText, getByTestId } = render(
        <TextField
          label="Email"
          value="nope"
          onChangeText={() => {}}
          error="Enter a valid email"
          testID="email"
        />,
      );
      expect(getByText('Enter a valid email')).toBeTruthy();
      expect(fieldBorderColor(getByTestId('email-field'))).toBe(theme.colorDestructive);
    });

    it('renders no error message when there is no error', () => {
      const { queryByTestId } = render(
        <TextField label="Email" value="" onChangeText={() => {}} testID="email" />,
      );
      expect(queryByTestId('email-error')).toBeNull();
    });

    // Error wins the border over focus — the loudest state is not masked by the
    // calmer focus ring.
    it('keeps the destructive border even while focused', () => {
      const { getByTestId } = render(
        <TextField
          label="Email"
          value="nope"
          onChangeText={() => {}}
          error="Enter a valid email"
          testID="email"
        />,
      );
      fireEvent(getByTestId('email'), 'focus');
      expect(fieldBorderColor(getByTestId('email-field'))).toBe(theme.colorDestructive);
    });
  });

  describe('secureTextEntry with show/hide eye', () => {
    it('masks by default and only renders the reveal toggle for secure fields', () => {
      const { getByTestId, queryByTestId } = render(
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />,
      );
      expect(getByTestId('pw').props.secureTextEntry).toBe(true);
      expect(getByTestId('pw-reveal')).toBeTruthy();
    });

    it('does not render the reveal toggle on a plain field', () => {
      const { queryByTestId } = render(
        <TextField label="Email" value="" onChangeText={() => {}} testID="email" />,
      );
      expect(queryByTestId('email-reveal')).toBeNull();
    });

    it('toggles masking and the toggle a11y label when the eye is tapped', () => {
      const { getByTestId, getByLabelText } = render(
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />,
      );
      // Masked → tapping "Show password" reveals it.
      expect(getByLabelText('Show password')).toBeTruthy();
      fireEvent.press(getByTestId('pw-reveal'));
      expect(getByTestId('pw').props.secureTextEntry).toBe(false);
      expect(getByLabelText('Hide password')).toBeTruthy();

      // Tapping again re-masks.
      fireEvent.press(getByTestId('pw-reveal'));
      expect(getByTestId('pw').props.secureTextEntry).toBe(true);
      expect(getByLabelText('Show password')).toBeTruthy();
    });
  });
});
