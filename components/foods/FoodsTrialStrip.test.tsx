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
    header: 'Diet trial · day 12 of 28',
    subject: 'Diet trial',
    dayClause: 'day 12 of 28',
    line: 'Royal Canin Hydrolyzed Protein HP, and 2 more',
  };

  it('renders both lines', () => {
    const { getByText } = render(<FoodsTrialStrip model={MODEL} onPress={() => {}} />);
    expect(getByText('Diet trial ·', { exact: false })).toBeTruthy();
    expect(getByText('day 12 of 28')).toBeTruthy();
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

  // C-8 / CUL-1181: past the window the overrun clause is its own fragment and
  // never shrinks, so a long multi-pet subject truncates before it does.
  it('keeps the overrun clause whole while the subject yields', () => {
    const late = {
      header: 'Pumpernickel’s kangaroo trial · day 35 — 7 days past',
      subject: 'Pumpernickel’s kangaroo trial',
      dayClause: 'day 35 — 7 days past',
      line: 'Zignature Kangaroo Formula',
    };
    const { getByText } = render(<FoodsTrialStrip model={late} onPress={() => {}} />);
    const clause = getByText('day 35 — 7 days past');
    const subject = getByText('Pumpernickel’s kangaroo trial · ');
    const flat = (n: { props: { style?: unknown } }) =>
      Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean));
    expect(flat(clause)).toMatchObject({ flexShrink: 0 });
    expect(flat(subject)).toMatchObject({ flexShrink: 1 });
  });

  it('renders the subject alone when there is no day to count', () => {
    const { getByText, queryByText } = render(
      <FoodsTrialStrip model={{ ...MODEL, header: 'Diet trial', dayClause: null }} onPress={() => {}} />,
    );
    expect(getByText('Diet trial')).toBeTruthy();
    expect(queryByText(/·/)).toBeNull();
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
      getByLabelText('Diet trial · day 12 of 28. Royal Canin Hydrolyzed Protein HP, and 2 more. See the trial list.'),
    ).toBeTruthy();
  });
});
