// B-704 PR 3 — the shared protein picker sheet (mock frame C).
//
// The picker is a closed set of canonical keys with two first-class escape hatches;
// it reports the owner's tap and stores/closes nothing. These tests pin the group
// structure, the derived-first ordering with provenance, and that each tap emits the
// right choice — the contract PR 4 relies on to mount the same component.

import { fireEvent, render } from '@testing-library/react-native';
import { TrialProteinPicker } from './TrialProteinPicker';
import type { DerivedProteinFood } from '../../lib/trialProteinPicker';

const RABBIT_FOODS: DerivedProteinFood[] = [
  { foodLabel: 'Royal Canin Selected Protein PR', primaryProtein: 'rabbit' },
  { foodLabel: 'Instinct LID Rabbit', primaryProtein: 'rabbit' },
];

function renderPicker(over: Partial<React.ComponentProps<typeof TrialProteinPicker>> = {}) {
  const props = {
    visible: true,
    petName: 'Miso',
    choice: { kind: 'derived' } as const,
    derivedKey: 'rabbit',
    derivedFoods: RABBIT_FOODS,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  return { props, ...render(<TrialProteinPicker {...props} />) };
}

describe('TrialProteinPicker — structure (mock frame C)', () => {
  it('shows the loophole-guard intro in owner language', () => {
    const s = renderPicker();
    expect(s.getByText(/it never changes what counts as off-diet/)).toBeTruthy();
  });

  it('leads with the derived group, naming the pet and the provenance', () => {
    const s = renderPicker();
    expect(s.getByText("From Miso's trial diet")).toBeTruthy();
    expect(s.getByText('Rabbit')).toBeTruthy();
    expect(s.getByText('Listed on both trial foods')).toBeTruthy();
  });

  it('offers the common proteins but NOT the derived one (no repeat)', () => {
    const s = renderPicker();
    expect(s.getByText('Other proteins')).toBeTruthy();
    expect(s.getByText('Chicken')).toBeTruthy();
    // 'Rabbit' appears once (in the derived group), never repeated below.
    expect(s.getAllByText('Rabbit')).toHaveLength(1);
  });

  it('offers both escape hatches as first-class options', () => {
    const s = renderPicker();
    expect(s.getByText('Neither of these?')).toBeTruthy();
    expect(s.getByText('No single protein')).toBeTruthy();
    expect(s.getByText('Not sure — leave it unset')).toBeTruthy();
  });

  it('renders the empty derived group away when nothing derives, but still shows the escapes', () => {
    const s = renderPicker({ derivedKey: null, derivedFoods: [{ foodLabel: 'z/d', primaryProtein: null }] });
    expect(s.queryByText("From Miso's trial diet")).toBeNull();
    expect(s.getByText('No single protein')).toBeTruthy();
    expect(s.getByText('Chicken')).toBeTruthy();
  });
});

describe('TrialProteinPicker — selection emits the right choice', () => {
  it('tapping the derived option emits an OWNER protein pick (an active confirmation)', () => {
    const s = renderPicker();
    fireEvent.press(s.getByText('Rabbit'));
    expect(s.props.onSelect).toHaveBeenCalledWith({ kind: 'protein', key: 'rabbit' });
  });

  it('tapping a common protein emits that protein', () => {
    const s = renderPicker();
    fireEvent.press(s.getByText('Duck'));
    expect(s.props.onSelect).toHaveBeenCalledWith({ kind: 'protein', key: 'duck' });
  });

  it('tapping "No single protein" emits the hydrolyzed choice', () => {
    const s = renderPicker();
    fireEvent.press(s.getByText('No single protein'));
    expect(s.props.onSelect).toHaveBeenCalledWith({ kind: 'hydrolyzed' });
  });

  it('tapping "Not sure — leave it unset" emits the unset choice', () => {
    const s = renderPicker();
    fireEvent.press(s.getByText('Not sure — leave it unset'));
    expect(s.props.onSelect).toHaveBeenCalledWith({ kind: 'unset' });
  });

  it('"Back" closes without emitting a choice', () => {
    const s = renderPicker();
    fireEvent.press(s.getByText('Back'));
    expect(s.props.onClose).toHaveBeenCalledTimes(1);
    expect(s.props.onSelect).not.toHaveBeenCalled();
  });
});

describe('TrialProteinPicker — the derived value shows pre-selected (frame C)', () => {
  it('marks the derived option checked when the choice is still derived', () => {
    const s = renderPicker({ choice: { kind: 'derived' }, derivedKey: 'rabbit' });
    const rabbit = s.getByRole('radio', { name: /Rabbit\. Listed on both trial foods/ });
    expect(rabbit.props.accessibilityState.checked).toBe(true);
  });

  it('marks the owner-picked protein checked, not the derived one', () => {
    const s = renderPicker({ choice: { kind: 'protein', key: 'duck' }, derivedKey: 'rabbit' });
    expect(s.getByRole('radio', { name: 'Duck' }).props.accessibilityState.checked).toBe(true);
    expect(s.getByRole('radio', { name: /Rabbit/ }).props.accessibilityState.checked).toBe(false);
  });

  it('marks hydrolyzed checked when chosen', () => {
    const s = renderPicker({ choice: { kind: 'hydrolyzed' } });
    expect(s.getByRole('radio', { name: /No single protein/ }).props.accessibilityState.checked).toBe(true);
  });
});
