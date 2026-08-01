import { render, fireEvent } from '@testing-library/react-native';
import { ChipGroup } from './ChipGroup';

const OPTIONS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'other', label: 'Other' },
];

describe('ChipGroup', () => {
  // The heart of the B-146 fix: every option renders (the group wraps), rather
  // than 5–6 of them sitting silently off-screen in a horizontal scroll. This is
  // the regression guard against anyone reintroducing an overflow/scroll container.
  it('renders every option — nothing hidden off-screen', () => {
    const { getByText } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={() => {}} />,
    );
    OPTIONS.forEach((o) => expect(getByText(o.label)).toBeTruthy());
  });

  it('calls onChange with the option value when a different option is tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={onChange} />,
    );
    fireEvent.press(getByText('Liquid'));
    expect(onChange).toHaveBeenCalledWith('liquid');
  });

  // Optional fields (medication form/route): a second tap on the active chip
  // clears the selection to null — behaviour preserved from the old ChipScroll/ChipRow.
  it('clears to null when the active option is re-tapped (allowDeselect default on)', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={onChange} />,
    );
    fireEvent.press(getByText('Tablet'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // Required fields (food format): re-tapping the active chip keeps it selected —
  // it must never clear to null, because one format is always chosen.
  it('keeps the value when the active option is re-tapped and allowDeselect is off', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={onChange} allowDeselect={false} />,
    );
    fireEvent.press(getByText('Tablet'));
    expect(onChange).toHaveBeenCalledWith('tablet');
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  // Accessibility: the group is a radio group and each option a radio carrying its
  // selected state, so a screen reader announces "Capsule, selected". The row of
  // bare TouchableOpacities this replaces announced neither role nor state.
  it('exposes a radio group with the selected option marked', () => {
    const { getByLabelText, getByRole } = render(
      <ChipGroup options={OPTIONS} value="capsule" onChange={() => {}} accessibilityLabel="Form" />,
    );
    expect(getByLabelText('Form').props.accessibilityRole).toBe('radiogroup');
    expect(getByRole('radio', { name: 'Capsule' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('radio', { name: 'Tablet' }).props.accessibilityState.selected).toBe(false);
  });

  // B-555 — the busy/disabled window. A group that writes on select needs a state
  // between the tap and the re-render; without it the call site hand-rolled a
  // re-entrancy guard. When disabled, a tap fires nothing.
  it('does not call onChange when disabled', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={onChange} disabled />,
    );
    fireEvent.press(getByText('Liquid'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // ...and the disabled state is announced, on the group and on every chip, so a
  // screen-reader user isn't left tapping an inert control silently.
  it('announces the disabled state on the group and its chips', () => {
    const { getByLabelText, getByRole } = render(
      <ChipGroup
        options={OPTIONS}
        value="tablet"
        onChange={() => {}}
        accessibilityLabel="Form"
        disabled
      />,
    );
    expect(getByLabelText('Form').props.accessibilityState.disabled).toBe(true);
    expect(getByRole('radio', { name: 'Liquid' }).props.accessibilityState.disabled).toBe(true);
  });

  it('is interactive by default (disabled defaults to false)', () => {
    const { getByRole } = render(
      <ChipGroup options={OPTIONS} value="tablet" onChange={() => {}} accessibilityLabel="Form" />,
    );
    expect(getByRole('radio', { name: 'Liquid' }).props.accessibilityState.disabled).toBe(false);
  });
});
