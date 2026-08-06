// B-616 PR 2 — the mid-trial add's confirm sheet, rendered (§2.3 / FR-11).
//
// `lib/trialFoodsScreen.test.ts` owns the copy and the day arithmetic. This one
// owns what only a rendered tree can answer:
//   • the three FR-11 facts are all actually ON SCREEN — a model that carries a
//     line the view forgot to draw is the exact way "an add never rewrites
//     history" would become a promise the owner never reads;
//   • there is no third action and no destructive path: `Not now` closes, and
//     that is the whole of declining;
//   • a slow write cannot earn a second tap, which on this sheet would mean two
//     `diet_trial_foods` rows for one food.

// `lib/trialFoodsScreen` reaches `lib/analytics` for the ONE day-math source,
// which pulls `lib/feedingArrangements` → `lib/sync` → `lib/supabase` and its
// fail-fast env check. Stub the edge of the graph, as the other trial tests do.
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { fireEvent, render } from '@testing-library/react-native';
import { AddTrialFoodSheet } from './AddTrialFoodSheet';
import { buildAddTrialFoodSheet } from '../../lib/trialFoodsScreen';

const TRIAL = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 28,
  endedAt: null,
};

const MODEL = buildAddTrialFoodSheet(
  'Biscuit',
  'Home-prepared plain sweet potato',
  TRIAL,
  new Date(2026, 6, 12, 12).getTime(),
);

function renderSheet(over: Partial<React.ComponentProps<typeof AddTrialFoodSheet>> = {}) {
  return render(
    <AddTrialFoodSheet
      model={MODEL}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...over}
    />,
  );
}

it('draws all three facts and both actions', () => {
  const tree = renderSheet();
  tree.getByText('Add to Biscuit’s trial list?');
  tree.getByText('Food');
  tree.getByText('Home-prepared plain sweet potato');
  tree.getByText('Joins the list');
  tree.getByText('Today, 12 July · day 12');
  // THE LOAD-BEARING PAIR. Without this line on screen the sheet reads as an
  // amnesty, and the write path's whole safety property (`allowed_from` = today)
  // is invisible to the person it protects.
  tree.getByText('Earlier feedings');
  tree.getByText('Keep the reading they already have');
  // B-628 — the vet-framing caption is actually on screen, from this entry point
  // and food detail alike (both render this model).
  tree.getByText(MODEL.caption);
  tree.getByTestId('add-trial-food-caption');
  tree.getByText('Add to the list');
  tree.getByText('Not now');
});

// Principle 1 and Dr. Chen's mock note: the vet made this call, the dated record
// is the safety mechanism, and a third option would be the app having an opinion
// about it.
it('offers exactly two ways out, neither of them destructive', () => {
  const tree = renderSheet();
  expect(tree.getByTestId('add-trial-food-sheet')).toBeTruthy();
  expect(tree.getByTestId('add-trial-food-confirm')).toBeTruthy();
  expect(tree.getByTestId('add-trial-food-cancel')).toBeTruthy();
  const joined = tree.toJSON() ? JSON.stringify(tree.toJSON()) : '';
  expect(joined).not.toMatch(/remove|delete|cancel the trial|are you sure/i);
});

it('confirms and declines through the caller, never on its own', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const tree = renderSheet({ onConfirm, onCancel });
  fireEvent.press(tree.getByTestId('add-trial-food-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.press(tree.getByTestId('add-trial-food-cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

// A sheet that closed over a failed insert would leave the owner believing a food
// is permitted while the record — and the vet report built from it — says it is
// not. So the failure is on screen, the sheet stays, and the button stays live.
it('says so when the write did not land, and keeps the way to retry', () => {
  const onConfirm = jest.fn();
  const tree = renderSheet({ onConfirm, error: 'That didn’t save. Try again in a moment.' });
  tree.getByText('That didn’t save. Try again in a moment.');
  tree.getByText('Earlier feedings');
  fireEvent.press(tree.getByTestId('add-trial-food-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

// One food, one row. `addTrialFood` deliberately does not check for a duplicate
// (the caller filters), so a double-tap on a slow write is the one way this
// screen could put two rows in the set a vet is shown.
it('blocks a second tap while the write is in flight', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const tree = renderSheet({ onConfirm, onCancel, saving: true });
  fireEvent.press(tree.getByTestId('add-trial-food-confirm'));
  fireEvent.press(tree.getByTestId('add-trial-food-cancel'));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});
