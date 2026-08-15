import { render, fireEvent } from '@testing-library/react-native';
import { NotificationPrimer } from './NotificationPrimer';

// Pins the full-screen primer's copy (daily-recap DR-4, spec §5) and its button
// contract. Copy is read from the category's registry descriptor, so these also
// guard that the descriptor wiring stays intact. The NEUTRAL (petName == null)
// branch is the whole point of D3 — one notification per account across all pets —
// and is otherwise exercised nowhere (the settings-screen test always mounts a
// single named pet).

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const noop = () => {};

describe('NotificationPrimer copy', () => {
  it('renders the c2 headline and the one body paragraph (the whole pitch)', () => {
    const { getByText } = render(
      <NotificationPrimer visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    // The ruled headline (R-7).
    expect(getByText('The day, read back to you.')).toBeTruthy();
    // The cadence line AND the surviving one-shot-consent honesty line (B-666)
    // live in the same single body paragraph.
    expect(getByText(/the day.s record is ready to read/)).toBeTruthy();
    expect(getByText(/Your phone will ask once — change it any time/)).toBeTruthy();
    // The hero micro-label.
    expect(getByText('Evening summary')).toBeTruthy();
  });

  it('warms the hero lead with the single pet’s name', () => {
    const { getByText } = render(
      <NotificationPrimer visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    expect(getByText('Biscuit’s day, gathered up.')).toBeTruthy();
  });

  it('stays neutral and account-wide when petName is null (D3 multi-pet)', () => {
    const { getByText, queryByText } = render(
      <NotificationPrimer visible petName={null} onConfirm={noop} onDismiss={noop} />,
    );
    expect(getByText('The day, gathered up.')).toBeTruthy();
    // No pet name leaks onto the hero.
    expect(queryByText(/Biscuit/)).toBeNull();
  });

  it('kills the notification-preview chip and the fine-print note (PM)', () => {
    const { queryByText } = render(
      <NotificationPrimer visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    // The B-661 PR 3 sheet's separate "Next, your phone will ask…" note is gone —
    // its honesty folded into the body sentence above.
    expect(queryByText(/Next, your phone will ask/)).toBeNull();
  });

  it('is strictly retrospective — a look back, never a reminder (G4)', () => {
    const { getByText, queryByText } = render(
      <NotificationPrimer visible petName="Biscuit" onConfirm={noop} onDismiss={noop} />,
    );
    // The hero shows COMPLETED events (a logged dose, meals eaten) — the record,
    // not a schedule of things to do.
    expect(getByText(/Apoquel/)).toBeTruthy();
    expect(getByText(/Breakfast/)).toBeTruthy();
    // No forward-reminder vocabulary anywhere on the surface.
    expect(queryByText(/remind|don.t forget|time to|it.s due/i)).toBeNull();
    // No manufactured enthusiasm (nyx-voice Pattern 4).
    expect(queryByText(/!/)).toBeNull();
  });
});

describe('NotificationPrimer buttons', () => {
  it('Turn on fires onConfirm; Not now fires onDismiss', () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <NotificationPrimer visible petName="Biscuit" onConfirm={onConfirm} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByRole('button', { name: 'Turn on' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('blocks Not now while the OS request is in flight (no dismiss mid-prompt)', () => {
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <NotificationPrimer
        visible
        petName="Biscuit"
        requesting
        onConfirm={noop}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByRole('button', { name: 'Not now' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
