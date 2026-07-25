import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProteinSetPicker } from './ProteinSetPicker';
import type { PickerProteins } from '../../lib/protein';

// A stateful host, because the two lines only make sense together: an auto-demote
// is a main change AND a tail change in one emission, and testing it against a
// static prop pair would let a half-applied update pass.
function Host({
  initial,
  onEmit,
}: {
  initial: PickerProteins;
  onEmit?: (next: PickerProteins) => void;
}) {
  const [set, setSet] = useState<PickerProteins>(initial);
  return (
    <ProteinSetPicker
      main={set.main}
      alsoContains={set.alsoContains}
      onChange={(next) => {
        onEmit?.(next);
        setSet(next);
      }}
    />
  );
}

const isChecked = (el: { props: { accessibilityState?: { checked?: boolean } } }) =>
  el.props.accessibilityState?.checked === true;

describe('ProteinSetPicker (B-351 D8 two-line picker)', () => {
  it('renders both lines', () => {
    const { getByText } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} />,
    );
    expect(getByText('Main protein')).toBeTruthy();
    expect(getByText('Also contains')).toBeTruthy();
  });

  it('does not emit on mount', () => {
    const onEmit = jest.fn();
    render(<Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />);
    // The never-null-clobber property both host screens depend on: "onChange
    // fired" must mean "the owner touched it".
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('shows the main on line 1 and the secondaries checked on line 2', () => {
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} />,
    );
    expect(getByRole('radio', { name: 'Duck' }).props.accessibilityState.selected).toBe(true);
    expect(isChecked(getByRole('checkbox', { name: 'Chicken' }))).toBe(true);
    expect(isChecked(getByRole('checkbox', { name: 'Salmon' }))).toBe(false);
  });

  it('NEVER IN BOTH — the current main is not offered as a secondary', () => {
    const { queryByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} />,
    );
    expect(queryByRole('checkbox', { name: 'Duck' })).toBeNull();
    expect(queryByRole('checkbox', { name: 'Chicken' })).not.toBeNull();
  });

  it('AUTO-DEMOTE — picking a new main moves the old one into Also contains', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['salmon'] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Chicken' }));
    // Duck keeps its exposure, at the FRONT of the tail (it was most prominent).
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'chicken', alsoContains: ['duck', 'salmon'] });
    expect(isChecked(getByRole('checkbox', { name: 'Duck' }))).toBe(true);
  });

  it('promoting a secondary to main takes it out of the tail', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Chicken' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'chicken', alsoContains: ['duck'] });
  });

  it('CLEARING the main demotes it too — no captured exposure is ever lost', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['chicken'] }} onEmit={onEmit} />,
    );
    // A second tap on the active main chip clears it (protein stays optional).
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: null, alsoContains: ['duck', 'chicken'] });
    expect(isChecked(getByRole('checkbox', { name: 'Duck' }))).toBe(true);
  });

  it('demotes a raw legacy main as its canonical key, not verbatim', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'Chicken By-Product Meal', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('radio', { name: 'Duck' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['chicken'] });
  });

  it('toggles a secondary on and off', () => {
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Salmon' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['salmon'] });
    fireEvent.press(getByRole('checkbox', { name: 'Salmon' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: [] });
  });

  it('offers a captured custom protein as a removable chip', () => {
    // A custom key must be visible on the line or it would be unremovable —
    // and invisible captured exposure is the failure mode this spec exists for.
    const onEmit = jest.fn();
    const { getByRole } = render(
      <Host initial={{ main: 'duck', alsoContains: ['kangaroo'] }} onEmit={onEmit} />,
    );
    expect(isChecked(getByRole('checkbox', { name: 'Kangaroo' }))).toBe(true);
    fireEvent.press(getByRole('checkbox', { name: 'Kangaroo' }));
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: [] });
  });

  // ── D9 on the secondaries' typed escape ─────────────────────────────────────

  it('adds a typed secondary on commit, normalized, with the rewrite disclosed', () => {
    const onEmit = jest.fn();
    const { getByRole, getByText, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Buffalo');
    expect(onEmit).not.toHaveBeenCalled(); // never per keystroke
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['bison'] });
    expect(getByText("Saved as Bison — that's the label name for buffalo.")).toBeTruthy();
    expect(isChecked(getByRole('checkbox', { name: 'Bison' }))).toBe(true);
  });

  it('clears the note when the value it explains is removed', () => {
    const { getByRole, queryByText, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(queryByText(/^Saved as/)).not.toBeNull();
    fireEvent.press(getByRole('checkbox', { name: 'Bison' }));
    expect(queryByText(/^Saved as/)).toBeNull();
  });

  it('does not add a typed value that is already the main', () => {
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Duck');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('keeps a value the normalizer cannot use in the field rather than dropping it', () => {
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'meal');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).not.toHaveBeenCalled();
    expect(getByPlaceholderText('Name the protein').props.value).toBe('meal');
  });

  it('captures an unrecognised protein verbatim rather than dropping the exposure', () => {
    // Job 1 (§2) is capture. An exotic species the alias table has never heard of
    // must still land as a key — vaguer beats absent.
    const onEmit = jest.fn();
    const { getByRole, getByPlaceholderText } = render(
      <Host initial={{ main: 'duck', alsoContains: [] }} onEmit={onEmit} />,
    );
    fireEvent.press(getByRole('checkbox', { name: 'Other' }));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Emu');
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onEmit).toHaveBeenLastCalledWith({ main: 'duck', alsoContains: ['emu'] });
  });
});
