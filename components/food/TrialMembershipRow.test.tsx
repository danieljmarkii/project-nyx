import { render, fireEvent } from '@testing-library/react-native';
import { TrialMembershipRow } from './TrialMembershipRow';

// B-616 PR 3 / FR-13–FR-14. The three states, and the one that is the PR's
// review bar: a food that is not on the list gets an OFFER, never a verdict, and
// a screen with no running trial gets nothing at all.
describe('TrialMembershipRow', () => {
  const ADD = 'Add to Biscuit’s trial list';

  it('states membership as a dated fact, with no action beside it', () => {
    const { getByText, queryByTestId } = render(
      <TrialMembershipRow line="On Biscuit’s trial list · since Jul 31" addLabel={ADD} onAdd={null} />,
    );
    expect(getByText('On Biscuit’s trial list · since Jul 31')).toBeTruthy();
    // Removal is out of v1 (D8) — a food on the list has nothing to tap here.
    expect(queryByTestId('food-trial-add')).toBeNull();
  });

  it('offers the add for a food that is not on the list', () => {
    const onAdd = jest.fn();
    const { getByTestId, getByText } = render(
      <TrialMembershipRow line={null} addLabel={ADD} onAdd={onAdd} />,
    );
    expect(getByText(ADD)).toBeTruthy();
    fireEvent.press(getByTestId('food-trial-add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // FR-13, verbatim: for a food not on the list the row is ABSENT. This is the
  // state with no trial running (or an unhydrated read) — and the whole block
  // goes, rather than rendering an empty "Trial" label with nothing under it,
  // which would itself be a statement about a trial that does not exist.
  it('renders nothing when there is no trial to speak about', () => {
    const { toJSON, queryByTestId } = render(
      <TrialMembershipRow line={null} addLabel={ADD} onAdd={null} />,
    );
    expect(toJSON()).toBeNull();
    expect(queryByTestId('food-trial-membership')).toBeNull();
  });

  // R1 at this layer: there is no prop, and no branch, that can produce a
  // negative. The component's only two outputs are the fact and the offer.
  it('never renders a "not on the list" line', () => {
    const { queryByText } = render(
      <TrialMembershipRow line={null} addLabel={ADD} onAdd={() => {}} />,
    );
    expect(queryByText(/not on/i)).toBeNull();
    expect(queryByText(/off.diet/i)).toBeNull();
  });
});
