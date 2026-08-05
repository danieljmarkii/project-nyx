// B-704 PR 4 — the trial-protein picker, rendered (spec §7.2/§7.3, frames C, H).
//
// `lib/trialProteinPicker.test.ts` owns the model, the copy, and the correction
// GATE. This one owns what only a rendered tree can answer: the component's one
// judgement — that a first-set commits on tap (frame C) while a change to an
// existing owner value ARMS the confirm and does not write until it (frame H) —
// and that re-selecting the current value is a no-op close, never a redundant
// write.

import { fireEvent, render } from '@testing-library/react-native';
import { TrialProteinPickerSheet } from './TrialProteinPickerSheet';
import {
  buildTrialProteinPicker,
  TRIAL_PROTEIN_HYDROLYZED,
} from '../../lib/trialProteinPicker';

const RABBIT_FOODS = [{ primaryProtein: 'rabbit' }, { primaryProtein: 'rabbit' }];

const ownerModel = buildTrialProteinPicker({
  petName: 'Miso',
  primaryFoods: RABBIT_FOODS,
  resolved: { protein: 'rabbit', source: 'owner' },
});
const emptyModel = buildTrialProteinPicker({
  petName: 'Miso',
  primaryFoods: [{ primaryProtein: null }],
  resolved: { protein: null, source: null },
});

function renderSheet(over: Partial<React.ComponentProps<typeof TrialProteinPickerSheet>> = {}) {
  const onCommit = jest.fn();
  const onCancel = jest.fn();
  const tree = render(
    <TrialProteinPickerSheet
      model={emptyModel}
      onCommit={onCommit}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { tree, onCommit, onCancel };
}

it('carries the invariant intro — naming never changes what counts as off-diet', () => {
  const { tree } = renderSheet();
  expect(tree.getByText(/never changes what counts as off-diet/)).toBeTruthy();
});

it('first-set: tapping a protein commits on the spot, with no confirm step (frame C)', () => {
  const { tree, onCommit } = renderSheet();
  fireEvent.press(tree.getByTestId('trial-protein-option-chicken'));
  expect(onCommit).toHaveBeenCalledWith('chicken');
  expect(tree.queryByTestId('trial-protein-correction')).toBeNull();
});

it('correction: changing an owner value ARMS the confirm and does not write yet (frame H)', () => {
  const { tree, onCommit } = renderSheet({ model: ownerModel });
  fireEvent.press(tree.getByTestId('trial-protein-option-venison'));
  // Nothing written — the confirm must be seen first.
  expect(onCommit).not.toHaveBeenCalled();
  expect(tree.getByTestId('trial-protein-correction')).toBeTruthy();
  expect(tree.getByText('Change to venison')).toBeTruthy();
  // The whole-trial disclosure is on screen before the commit.
  expect(tree.getByText(/updates the trial’s whole record/)).toBeTruthy();
});

it('correction commits only when the confirm button is tapped', () => {
  const { tree, onCommit } = renderSheet({ model: ownerModel });
  fireEvent.press(tree.getByTestId('trial-protein-option-venison'));
  fireEvent.press(tree.getByTestId('trial-protein-confirm'));
  expect(onCommit).toHaveBeenCalledWith('venison');
});

it('clearing an owner value to "No single protein" confirms, then commits null', () => {
  const { tree, onCommit } = renderSheet({ model: ownerModel });
  fireEvent.press(tree.getByTestId(`trial-protein-option-${TRIAL_PROTEIN_HYDROLYZED}`));
  expect(tree.getByText('Remove the trial protein')).toBeTruthy();
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.press(tree.getByTestId('trial-protein-confirm'));
  expect(onCommit).toHaveBeenCalledWith(null);
});

it('re-selecting the value already stored is a no-op close, never a redundant write', () => {
  const { tree, onCommit, onCancel } = renderSheet({ model: ownerModel });
  fireEvent.press(tree.getByTestId('trial-protein-option-rabbit'));
  expect(onCommit).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalled();
});

it('a first-set over a DERIVED value commits immediately — a derived value is not "an existing value"', () => {
  const derivedModel = buildTrialProteinPicker({
    petName: 'Miso',
    primaryFoods: RABBIT_FOODS,
    resolved: { protein: 'rabbit', source: 'derived' },
  });
  const { tree, onCommit } = renderSheet({ model: derivedModel });
  // Confirming the derived rabbit as owner-stated is a first-set: no confirm.
  fireEvent.press(tree.getByTestId('trial-protein-option-rabbit'));
  expect(onCommit).toHaveBeenCalledWith('rabbit');
  expect(tree.queryByTestId('trial-protein-correction')).toBeNull();
});
