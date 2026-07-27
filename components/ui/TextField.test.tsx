import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TextField } from './TextField';
import { theme } from '../../constants/theme';
import { useAppActive } from '../../hooks/useAppActive';

// Foreground state is what re-masks a revealed password, so drive it explicitly
// rather than through a real AppState event.
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

const mockedAppActive = useAppActive as jest.Mock;

beforeEach(() => {
  mockedAppActive.mockReturnValue(true);
});

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

    // The toggle is the whole point of B-428, so its target is asserted on the
    // button's own resolved box — not on hitSlop arithmetic that a later trim
    // could quietly drop below the floor.
    it('gives the reveal toggle its own >=44pt target', () => {
      const { getByTestId } = render(
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />,
      );
      const box = flatStyle(getByTestId('pw-reveal'));
      expect(box.width as number).toBeGreaterThanOrEqual(44);
      expect(box.height as number).toBeGreaterThanOrEqual(44);
    });

    // Reveal is a glance, not a mode. Leaving the app must not leave plaintext on
    // screen for the owner's return trip (or for the app-switcher snapshot).
    it('re-masks when the app leaves the foreground', () => {
      const { getByTestId, getByLabelText, rerender } = render(
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />,
      );
      fireEvent.press(getByTestId('pw-reveal'));
      expect(getByTestId('pw').props.secureTextEntry).toBe(false);

      mockedAppActive.mockReturnValue(false);
      rerender(
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />,
      );
      expect(getByTestId('pw').props.secureTextEntry).toBe(true);
      expect(getByLabelText('Show password')).toBeTruthy();
    });

    // Coming back to the field must not silently re-reveal what backgrounding hid.
    it('stays masked after the app returns to the foreground', () => {
      // A fresh element each time on purpose: React bails out of re-rendering a
      // referentially identical one, which would hide the mocked state change.
      const field = () => (
        <TextField label="Password" value="hunter2" onChangeText={() => {}} secureTextEntry testID="pw" />
      );
      const { getByTestId, rerender } = render(field());
      fireEvent.press(getByTestId('pw-reveal'));

      mockedAppActive.mockReturnValue(false);
      rerender(field());
      mockedAppActive.mockReturnValue(true);
      rerender(field());

      expect(getByTestId('pw').props.secureTextEntry).toBe(true);
    });

    // The realistic signup case: a password field showing a validation error.
    // The reveal toggle and the error state must coexist — masked, with the
    // destructive border and message both present.
    it('shows the reveal toggle and the error together on a secure field', () => {
      const { getByText, getByTestId } = render(
        <TextField
          label="Password"
          value="short"
          onChangeText={() => {}}
          secureTextEntry
          error="Use at least 8 characters"
          testID="pw"
        />,
      );
      expect(getByTestId('pw').props.secureTextEntry).toBe(true);
      expect(getByTestId('pw-reveal')).toBeTruthy();
      expect(getByText('Use at least 8 characters')).toBeTruthy();
      expect(fieldBorderColor(getByTestId('pw-field'))).toBe(theme.colorDestructive);
    });
  });
});
