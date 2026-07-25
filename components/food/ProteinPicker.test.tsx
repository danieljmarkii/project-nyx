import { render, fireEvent } from '@testing-library/react-native';
import { ProteinPicker } from './ProteinPicker';

describe('ProteinPicker', () => {
  it('renders every common protein plus an Other escape', () => {
    const { getByText } = render(<ProteinPicker value={null} onChange={() => {}} />);
    ['Chicken', 'Turkey', 'Beef', 'Salmon', 'Whitefish', 'Venison', 'Other'].forEach(
      (label) => expect(getByText(label)).toBeTruthy(),
    );
  });

  // Controlled + side-effect-free: mounting with an existing value must never
  // emit onChange. This is what lets the host screens treat "onChange fired" as
  // "owner touched it" and so avoid null-clobbering an AI-hydrated protein.
  it('does not call onChange on mount', () => {
    const onChange = jest.fn();
    render(<ProteinPicker value="chicken" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('highlights the chip that matches the stored value, case-insensitively', () => {
    // Stored "Chicken" (AI casing) must show the Chicken chip selected WITHOUT
    // the picker rewriting the value — the never-clobber guarantee.
    const onChange = jest.fn();
    const { getByRole } = render(<ProteinPicker value="Chicken" onChange={onChange} />);
    expect(getByRole('radio', { name: 'Chicken' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('radio', { name: 'Beef' }).props.accessibilityState.selected).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits the canonical lowercase value when a chip is tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(<ProteinPicker value={null} onChange={onChange} />);
    fireEvent.press(getByText('Salmon'));
    expect(onChange).toHaveBeenCalledWith('salmon');
  });

  it('clears to null when the active chip is re-tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(<ProteinPicker value="chicken" onChange={onChange} />);
    fireEvent.press(getByText('Chicken'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // A stored value outside the common set is a custom protein — Other is active
  // and its field shows the value, ready to correct.
  it('routes an off-set value to the Other field', () => {
    const { getByRole, getByPlaceholderText } = render(
      <ProteinPicker value="kangaroo" onChange={() => {}} />,
    );
    expect(getByRole('radio', { name: 'Other' }).props.accessibilityState.selected).toBe(true);
    expect(getByPlaceholderText('Name the protein').props.value).toBe('kangaroo');
  });

  it('reveals the typed escape when Other is tapped and stores what is typed', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    // Opening Other with no prior custom value emits null (a real "unset").
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'bison');
    // Stored raw — canonicalized on read, exactly like an AI label.
    expect(onChange).toHaveBeenLastCalledWith('bison');
  });

  it('treats a whitespace-only Other value as unset', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), '   ');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  // Reseed regression guard (code-review fix): when the value prop transitions
  // from a custom protein to a COMMON one while the component stays mounted (a
  // re-run extraction landing a common read on the detail screen), the stale
  // "Other" field must disappear — leaving it mounted would let an edit to it
  // silently null the just-landed AI value, the exact clobber this PR prevents.
  it('drops the Other field when a reseed lands a common protein', () => {
    const { rerender, getByRole, queryByPlaceholderText } = render(
      <ProteinPicker value="kangaroo" onChange={() => {}} />,
    );
    expect(queryByPlaceholderText('Name the protein')).not.toBeNull();
    rerender(<ProteinPicker value="chicken" onChange={() => {}} />);
    expect(queryByPlaceholderText('Name the protein')).toBeNull();
    expect(getByRole('radio', { name: 'Chicken' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('radio', { name: 'Other' }).props.accessibilityState.selected).toBe(false);
  });

  it('drops the Other field when a reseed clears the value to null', () => {
    const { rerender, getByRole, queryByPlaceholderText } = render(
      <ProteinPicker value="kangaroo" onChange={() => {}} />,
    );
    expect(queryByPlaceholderText('Name the protein')).not.toBeNull();
    rerender(<ProteinPicker value={null} onChange={() => {}} />);
    expect(queryByPlaceholderText('Name the protein')).toBeNull();
    expect(getByRole('radio', { name: 'Other' }).props.accessibilityState.selected).toBe(false);
  });

  // A junk/placeholder stored value ("null") canonicalizes to null → nothing is
  // selected and the Other field stays closed (not treated as a custom protein).
  it('shows nothing selected for a junk placeholder value', () => {
    const { getByRole, queryByPlaceholderText } = render(
      <ProteinPicker value="null" onChange={() => {}} />,
    );
    expect(getByRole('radio', { name: 'Chicken' }).props.accessibilityState.selected).toBe(false);
    expect(getByRole('radio', { name: 'Other' }).props.accessibilityState.selected).toBe(false);
    expect(queryByPlaceholderText('Name the protein')).toBeNull();
  });

  // ── D9: the typed escape normalizes on COMMIT (B-351 PR 3 / B-412) ──────────
  // An owner typing "Buffalo" used to store `buffalo` while an AI read of the
  // same label stored `bison` — one animal, two keys, exposure split across both
  // and each under the effective-n floor. The fix must be legible, not silent.

  it('does NOT normalize per keystroke — only on commit', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    // Mid-word rewriting would thrash the field while someone is still typing.
    expect(onChange).toHaveBeenLastCalledWith('buffalo');
  });

  it('normalizes an aliased value on blur and says so', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText, rerender } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Buffalo');
    // Controlled component: the host echoes the raw value back before blur.
    rerender(<ProteinPicker value="Buffalo" onChange={onChange} />);
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onChange).toHaveBeenLastCalledWith('bison');
    rerender(<ProteinPicker value="bison" onChange={onChange} />);
    expect(getByText("Saved as Bison — that's the label name for buffalo.")).toBeTruthy();
  });

  it('selects the matching chip when the rewrite lands a common protein, and still explains it', () => {
    // "chicken liver" folds to a COMMON protein, so the Other field closes — the
    // note has to render outside it or the most confusing rewrite goes unexplained.
    const onChange = jest.fn();
    const { getByText, getByRole, getByPlaceholderText, queryByPlaceholderText, rerender } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'chicken liver');
    rerender(<ProteinPicker value="chicken liver" onChange={onChange} />);
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onChange).toHaveBeenLastCalledWith('chicken');
    rerender(<ProteinPicker value="chicken" onChange={onChange} />);
    expect(getByRole('radio', { name: 'Chicken' }).props.accessibilityState.selected).toBe(true);
    expect(queryByPlaceholderText('Name the protein')).toBeNull();
    expect(getByText("Saved as Chicken — that's the protein in chicken liver.")).toBeTruthy();
  });

  it('stays silent when only casing changed — nothing to explain', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText, queryByText, rerender } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'Kangaroo');
    rerender(<ProteinPicker value="Kangaroo" onChange={onChange} />);
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onChange).toHaveBeenLastCalledWith('kangaroo');
    rerender(<ProteinPicker value="kangaroo" onChange={onChange} />);
    expect(queryByText(/^Saved as/)).toBeNull();
  });

  it('keeps text the normalizer cannot use, rather than wiping the field', () => {
    // "fresh" is a bare descriptor and names no animal. Silently emptying a field
    // someone just filled is the wrong direction; D9's scope is aliased/stripped
    // terms, not junk rejection.
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText, rerender } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'fresh');
    rerender(<ProteinPicker value="fresh" onChange={onChange} />);
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    expect(onChange).toHaveBeenLastCalledWith('fresh');
    expect(getByPlaceholderText('Name the protein').props.value).toBe('fresh');
  });

  it('clears the note once the explained value leaves the field', () => {
    const onChange = jest.fn();
    const { getByText, getByPlaceholderText, queryByText, rerender } = render(
      <ProteinPicker value={null} onChange={onChange} />,
    );
    fireEvent.press(getByText('Other'));
    fireEvent.changeText(getByPlaceholderText('Name the protein'), 'buffalo');
    rerender(<ProteinPicker value="buffalo" onChange={onChange} />);
    fireEvent(getByPlaceholderText('Name the protein'), 'blur');
    rerender(<ProteinPicker value="bison" onChange={onChange} />);
    expect(queryByText(/^Saved as/)).not.toBeNull();
    fireEvent.press(getByText('Duck'));
    rerender(<ProteinPicker value="duck" onChange={onChange} />);
    expect(queryByText(/^Saved as/)).toBeNull();
  });
});
