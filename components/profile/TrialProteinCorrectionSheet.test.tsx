// B-704 PR 4 — the mid-trial correction confirm, rendered (TP-3, mock frame H).
//
// The pure copy/label live in `trialProteinPicker.test.ts`; this owns what only a
// rendered tree answers: the §8 whole-trial note and the destination-named button
// are both on screen, and a slow write can't earn a second tap.

import { fireEvent, render } from '@testing-library/react-native';
import { TrialProteinCorrectionSheet } from './TrialProteinCorrectionSheet';
import { TRIAL_PROTEIN_CORRECTION_NOTE } from '../../lib/trialProteinPicker';

function renderSheet(over: Partial<React.ComponentProps<typeof TrialProteinCorrectionSheet>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const tree = render(
    <TrialProteinCorrectionSheet
      note={TRIAL_PROTEIN_CORRECTION_NOTE}
      confirmLabel="Change to venison"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { tree, onConfirm, onCancel };
}

it('shows the whole-trial note and the destination-named commit button', () => {
  const { tree } = renderSheet();
  expect(tree.getByText(TRIAL_PROTEIN_CORRECTION_NOTE)).toBeTruthy();
  expect(tree.getByText('Change to venison')).toBeTruthy();
});

it('confirm and cancel fire their handlers', () => {
  const { tree, onConfirm, onCancel } = renderSheet();
  fireEvent.press(tree.getByTestId('trial-protein-confirm'));
  expect(onConfirm).toHaveBeenCalled();
  fireEvent.press(tree.getByTestId('trial-protein-correction-cancel'));
  expect(onCancel).toHaveBeenCalled();
});

it('a slow write blocks the cancel and shows the error in place', () => {
  const { tree, onCancel } = renderSheet({ saving: true, error: 'That didn’t save. Try again in a moment.' });
  fireEvent.press(tree.getByTestId('trial-protein-correction-cancel'));
  expect(onCancel).not.toHaveBeenCalled(); // disabled while saving
  expect(tree.getByTestId('trial-protein-error')).toBeTruthy();
});
