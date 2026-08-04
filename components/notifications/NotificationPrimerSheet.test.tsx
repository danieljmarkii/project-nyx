import { render, fireEvent } from '@testing-library/react-native';
import { NotificationPrimerSheet } from './NotificationPrimerSheet';

// Pins the primer's two copy branches and its button contract (B-661 PR 3). The
// NEUTRAL (petName == null) branch is the whole point of D3 — one notification per
// account across all pets — and was otherwise exercised nowhere (the settings
// screen test always mounts a single named pet).

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const noop = () => {};

describe('NotificationPrimerSheet copy', () => {
  it('names the single pet (the warmth path)', () => {
    const { getByText } = render(
      <NotificationPrimerSheet visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    expect(getByText(/A recap of Biscuit.s day, every evening/)).toBeTruthy();
    expect(getByText(/Biscuit.s day is ready to read/)).toBeTruthy();
  });

  it('stays neutral and account-wide when petName is null (D3 multi-pet)', () => {
    const { getByText, queryByText } = render(
      <NotificationPrimerSheet visible petName={null} onConfirm={noop} onDismiss={noop} />,
    );
    expect(getByText('A recap of the day, every evening')).toBeTruthy();
    expect(getByText(/for all your pets/)).toBeTruthy();
    // No pet name leaks onto the lock-screen-adjacent copy.
    expect(queryByText(/Biscuit/)).toBeNull();
  });

  it('is strictly retrospective — never implies a medication reminder (G4)', () => {
    const { getByText } = render(
      <NotificationPrimerSheet visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    // "you logged" — a look BACK at the record, not a forward reminder.
    expect(getByText(/doses you logged/)).toBeTruthy();
  });
});

describe('NotificationPrimerSheet buttons', () => {
  it('Turn on fires onConfirm; Not now fires onDismiss', () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <NotificationPrimerSheet visible petName="Biscuit" onConfirm={onConfirm} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByRole('button', { name: 'Turn on' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('blocks Not now while the OS request is in flight (no dismiss mid-prompt)', () => {
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <NotificationPrimerSheet visible petName="Biscuit" requesting onConfirm={noop} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByRole('button', { name: 'Not now' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
