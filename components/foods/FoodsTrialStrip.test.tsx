import { render, fireEvent } from '@testing-library/react-native';
import { FoodsTrialStrip } from './FoodsTrialStrip';

// B-616 PR 3 / FR-1. The strip's WORDS are decided by
// lib/trialLibraryChrome.buildFoodsTrialStrip and pinned there; what this layer
// owns is the null branch — which carries FR-4 (the chrome disappears cleanly
// when the trial ends) and R2 (a read that could not answer renders nothing).
describe('FoodsTrialStrip', () => {
  // A representative model — the line NAMES the foods (B-627), which is what the
  // builder now produces.
  const MODEL = {
    header: 'Diet trial — day 12 of 28',
    line: 'Royal Canin Hydrolyzed Protein HP, and 2 more',
  };

  it('renders both lines', () => {
    const { getByText } = render(<FoodsTrialStrip model={MODEL} onPress={() => {}} />);
    expect(getByText('Diet trial — day 12 of 28')).toBeTruthy();
    expect(getByText('Royal Canin Hydrolyzed Protein HP, and 2 more')).toBeTruthy();
  });

  // FR-4 / R2 as one branch. The builder collapses "no trial", "not hydrated"
  // and "nothing permitted today" into a null model precisely so this surface
  // cannot render a fourth, stale state of its own.
  it('renders nothing at all with no model', () => {
    const { queryByTestId, toJSON } = render(<FoodsTrialStrip model={null} onPress={() => {}} />);
    expect(queryByTestId('foods-trial-strip')).toBeNull();
    expect(toJSON()).toBeNull();
  });

  it('opens the allowed-set screen on tap', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<FoodsTrialStrip model={MODEL} onPress={onPress} />);
    fireEvent.press(getByTestId('foods-trial-strip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces both facts and what the tap does', () => {
    const { getByLabelText } = render(<FoodsTrialStrip model={MODEL} onPress={() => {}} />);
    expect(
      getByLabelText('Diet trial — day 12 of 28. Royal Canin Hydrolyzed Protein HP, and 2 more. See the trial list.'),
    ).toBeTruthy();
  });
});
