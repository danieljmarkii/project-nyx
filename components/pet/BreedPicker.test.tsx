import { render, fireEvent } from '@testing-library/react-native';
import { BreedPicker } from './BreedPicker';

// A small, deterministic list — the component is data-agnostic, so the test
// stays decoupled from the real ~290-item dog data.
const BREEDS = ['Abyssinian', 'Bengal', 'Maine Coon', 'Ragdoll', 'Siamese'];

describe('BreedPicker', () => {
  it('renders the breeds plus the always-present "Other" escape hatch', () => {
    const { getByText } = render(
      <BreedPicker breeds={BREEDS} value="" onSelect={() => {}} onSelectOther={() => {}} />,
    );
    BREEDS.forEach((b) => expect(getByText(b)).toBeTruthy());
    expect(getByText('Other / not listed')).toBeTruthy();
  });

  it('filters the list as the owner types, case-insensitively', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <BreedPicker breeds={BREEDS} value="" onSelect={() => {}} onSelectOther={() => {}} />,
    );
    fireEvent.changeText(getByLabelText('Search breeds'), 'ben');
    expect(getByText('Bengal')).toBeTruthy();
    expect(queryByText('Ragdoll')).toBeNull();
    // "Other" stays reachable even while the list is filtered.
    expect(getByText('Other / not listed')).toBeTruthy();
  });

  it('shows a hint and carries the typed query into "Other" when nothing matches', () => {
    const onSelectOther = jest.fn();
    const { getByLabelText, getByText } = render(
      <BreedPicker breeds={BREEDS} value="" onSelect={() => {}} onSelectOther={onSelectOther} />,
    );
    fireEvent.changeText(getByLabelText('Search breeds'), 'zzz');
    expect(getByText(/No breeds match/)).toBeTruthy();
    // "Other" stays reachable, and tapping it hands back the typed term so the
    // owner doesn't have to retype it into the free-text field.
    fireEvent.press(getByText('Other / not listed'));
    expect(onSelectOther).toHaveBeenCalledWith('zzz');
  });

  it('calls onSelect with the tapped breed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <BreedPicker breeds={BREEDS} value="" onSelect={onSelect} onSelectOther={() => {}} />,
    );
    fireEvent.press(getByText('Maine Coon'));
    expect(onSelect).toHaveBeenCalledWith('Maine Coon');
  });

  it('calls onSelectOther with an empty seed when tapped with no search text', () => {
    const onSelectOther = jest.fn();
    const { getByText } = render(
      <BreedPicker breeds={BREEDS} value="" onSelect={() => {}} onSelectOther={onSelectOther} />,
    );
    fireEvent.press(getByText('Other / not listed'));
    expect(onSelectOther).toHaveBeenCalledWith('');
  });

  it('marks the selected breed as selected for a screen reader', () => {
    const { getByRole } = render(
      <BreedPicker breeds={BREEDS} value="Ragdoll" onSelect={() => {}} onSelectOther={() => {}} />,
    );
    expect(getByRole('radio', { name: 'Ragdoll' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('radio', { name: 'Bengal' }).props.accessibilityState.selected).toBe(false);
  });

  it('caps a very long list and shows a visible "there’s more" cue', () => {
    const many = Array.from({ length: 120 }, (_, i) => `Breed ${String(i).padStart(3, '0')}`);
    const { getByText, queryByText } = render(
      <BreedPicker breeds={many} value="" onSelect={() => {}} onSelectOther={() => {}} />,
    );
    // MAX_VISIBLE is 80, so 40 are held back until the owner narrows the search.
    expect(getByText('Keep typing to see 40 more…')).toBeTruthy();
    expect(getByText('Breed 000')).toBeTruthy();
    expect(queryByText('Breed 119')).toBeNull();
  });
});
