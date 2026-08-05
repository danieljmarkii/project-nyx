// B-544 — the sole `diet_trials` WRITE PATH has a test file.
//
// `StartTrialModal` is the only surface that creates a trial, and it is where the
// two decisions most likely to corrupt the record live: the D-screen gate (one
// active trial per pet — a DATABASE constraint the modal turns into an ordered
// choice) and the end-and-continue ORDERING. The ordering is the one worth pinning
// hardest: ending is destructive and this app has no un-end path, so the modal
// commits NOTHING when the owner agrees to end the old trial — the end fires only
// on the same action that creates the new one, and if the end throws, the new
// trial is never created and nothing partial lands.
//
// The db + sync layers are stubbed and the three write functions are replaced with
// spies; everything above the "Local writes" divider in `dietTrialSetup` (the pure
// copy, the duration table, the day-math) stays real, so the flow renders the same
// strings and computes the same day counter the device does.

jest.mock('../../lib/db', () => ({ getDb: jest.fn() }));
jest.mock('../../lib/sync', () => ({
  syncPendingDietTrials: jest.fn().mockResolvedValue(undefined),
  syncPendingDietTrialFoods: jest.fn().mockResolvedValue(undefined),
}));

// Keep every pure export real (copy, INDICATION_OPTIONS, canStartTrial, the day
// math, the reason set); replace only the functions that touch the db/queue.
jest.mock('../../lib/dietTrialSetup', () => ({
  ...jest.requireActual('../../lib/dietTrialSetup'),
  getActiveTrialForPet: jest.fn(),
  endActiveTrial: jest.fn(),
  startDietTrial: jest.fn(),
  getFoodPrimaryProteins: jest.fn(),
}));

// Heavy children stand in for pressables: the picker just yields a food, the date
// picker just yields a back-dated date, the spinner and icons render nothing.
jest.mock('../log/FoodPicker', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    FoodPicker: ({ onPickFood, onAddNew }: any) =>
      React.createElement(React.Fragment, null,
        React.createElement(
          TouchableOpacity,
          {
            testID: 'pick-food',
            onPress: () =>
              onPickFood({
                id: 'food-1',
                brand: 'Zignature',
                product_name: 'Kangaroo Formula',
                food_type: 'food',
              }),
          },
          React.createElement(Text, null, 'Pick a food'),
        ),
        // A SECOND food, so the two-food day-0 mismatch (mock frame D) is reachable
        // at the modal level: food-1 derives the target, food-2 can disagree.
        React.createElement(
          TouchableOpacity,
          {
            testID: 'pick-food-2',
            onPress: () =>
              onPickFood({
                id: 'food-2',
                brand: 'Blue Buffalo',
                product_name: 'Sensitive Stomach',
                food_type: 'food',
              }),
          },
          React.createElement(Text, null, 'Pick a second food'),
        ),
        React.createElement(
          TouchableOpacity,
          { testID: 'add-new-food', onPress: onAddNew },
          React.createElement(Text, null, 'Add new'),
        ),
      ),
  };
});
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: 'set-date', onPress: () => onChange({}, new Date(2026, 0, 10)) },
        React.createElement(Text, null, 'set date'),
      ),
  };
});
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
jest.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  ChevronUp: () => null,
}));

import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StartTrialModal } from './StartTrialModal';
import {
  getActiveTrialForPet,
  endActiveTrial,
  startDietTrial,
  getFoodPrimaryProteins,
  stopReasonOptions,
} from '../../lib/dietTrialSetup';
import { toLocalDayKey } from '../../lib/utils';

const mockedGetActive = getActiveTrialForPet as jest.Mock;
const mockedEnd = endActiveTrial as jest.Mock;
const mockedStart = startDietTrial as jest.Mock;
const mockedProteins = getFoodPrimaryProteins as jest.Mock;

function renderModal(over: Partial<React.ComponentProps<typeof StartTrialModal>> = {}) {
  const props = {
    visible: true,
    petId: 'pet-1',
    petName: 'Pixel',
    species: 'dog',
    onClose: jest.fn(),
    onStarted: jest.fn(),
    onAddFood: jest.fn(),
    onLogFirstMeal: jest.fn(),
    ...over,
  };
  return { props, ...render(<StartTrialModal {...props} />) };
}

const RUNNING_TRIAL = {
  id: 'trial-old',
  // Started today so `describeActiveTrial` reports "not complete" and the sheet
  // offers the stopped-early reasons (deterministic, zone-independent).
  startedAt: toLocalDayKey(new Date()),
  targetDurationDays: 56,
  foodLabel: 'Old Diet',
};

// Drive the form to a startable state: pick a trial food, choose an indication.
// `canStartTrial` is the real predicate, so both are genuinely required.
async function fillForm(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByText('Choose the trial diet'));
  fireEvent.press(await screen.findByTestId('pick-food'));
  fireEvent.press(screen.getByText('Back'));
  fireEvent.press(screen.getByText('Skin'));
  // Picking a food kicks the async protein lookup; await its settle so the state
  // update lands inside act (the row is on-screen by then), exactly as the
  // active-trial effect is awaited on mount.
  await screen.findByText('Start trial');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActive.mockResolvedValue(null);
  mockedEnd.mockResolvedValue(undefined);
  mockedStart.mockResolvedValue('trial-new');
  // Default: the cache holds no protein for the picked foods, so the row renders
  // its empty state. Tests that need a derived value or a mismatch override this.
  mockedProteins.mockResolvedValue({});
});

describe('StartTrialModal — the D-screen gate', () => {
  it('shows the blocked screen when a trial is already running', async () => {
    mockedGetActive.mockResolvedValue(RUNNING_TRIAL);
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Pixel already has a trial running')).toBeTruthy());
  });

  it('shows the form when no trial is running', async () => {
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
  });

  it('falls back to the form when the active-trial check throws — never blocks the owner', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetActive.mockRejectedValue(new Error('offline'));
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('StartTrialModal — starting a fresh trial', () => {
  it('creates the trial and never touches the end path', async () => {
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());

    await fillForm(screen);
    fireEvent.press(screen.getByText('Start trial'));

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedEnd).not.toHaveBeenCalled();
    expect(screen.props.onStarted).toHaveBeenCalledTimes(1);

    // Real day math: a trial started today is day 1 (the inclusive convention).
    expect(screen.getByText('Pixel is on day 1')).toBeTruthy();

    // The write carries the default-path values: one primary food, the chosen
    // indication, the species duration default, and today as the start day.
    expect(mockedStart).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: 'pet-1',
        indication: 'skin',
        targetDurationDays: 56, // defaultDurationDays('dog', 'skin')
        startedAt: toLocalDayKey(new Date()),
        vetName: null,
      }),
    );
    expect(mockedStart.mock.calls[0][0].primaryFoods).toHaveLength(1);
  });
});

describe('StartTrialModal — end-and-continue ordering', () => {
  async function reachFormAfterAgreeingToEnd(screen: ReturnType<typeof render>) {
    await waitFor(() => expect(screen.getByText('Pixel already has a trial running')).toBeTruthy());
    // Choose the first stopped-early reason (computed from the real reason set so
    // the label is never hardcoded), then agree to end.
    const reasons = stopReasonOptions('Pixel', false);
    fireEvent.press(screen.getByText(reasons[0].label));
    fireEvent.press(screen.getByText('End this one and start the new one'));
  }

  it('commits NOTHING when the owner agrees to end — the end waits for Start', async () => {
    mockedGetActive.mockResolvedValue(RUNNING_TRIAL);
    const screen = renderModal();
    await reachFormAfterAgreeingToEnd(screen);

    // Now on the form; the old trial is still running — no write has happened.
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    expect(mockedEnd).not.toHaveBeenCalled();
    expect(mockedStart).not.toHaveBeenCalled();
  });

  it('ends the old trial BEFORE creating the new one', async () => {
    mockedGetActive.mockResolvedValue(RUNNING_TRIAL);
    const screen = renderModal();
    await reachFormAfterAgreeingToEnd(screen);

    await fillForm(screen);
    fireEvent.press(screen.getByText('Start trial'));

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedEnd).toHaveBeenCalledTimes(1);
    expect(mockedEnd).toHaveBeenCalledWith({ trialId: 'trial-old', reason: 'refused' });
    // The ordering invariant: end resolves before start is even invoked.
    expect(mockedEnd.mock.invocationCallOrder[0]).toBeLessThan(
      mockedStart.mock.invocationCallOrder[0],
    );
  });

  it('never creates the new trial if ending the old one fails — nothing partial lands', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedGetActive.mockResolvedValue(RUNNING_TRIAL);
    mockedEnd.mockRejectedValue(new Error('end failed'));

    const screen = renderModal();
    await reachFormAfterAgreeingToEnd(screen);
    await fillForm(screen);
    fireEvent.press(screen.getByText('Start trial'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockedEnd).toHaveBeenCalledTimes(1);
    expect(mockedStart).not.toHaveBeenCalled();
    expect(screen.props.onStarted).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('cancelling after agreeing to end leaves the running trial untouched', async () => {
    mockedGetActive.mockResolvedValue(RUNNING_TRIAL);
    const screen = renderModal();
    await reachFormAfterAgreeingToEnd(screen);

    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    fireEvent.press(screen.getByText('Cancel'));

    expect(screen.props.onClose).toHaveBeenCalledTimes(1);
    expect(mockedEnd).not.toHaveBeenCalled();
    expect(mockedStart).not.toHaveBeenCalled();
  });
});

// ── B-704 §7.1 — the Trial protein row ────────────────────────────────────────
describe('StartTrialModal — the Trial protein row', () => {
  async function pickPrimary(screen: ReturnType<typeof render>) {
    fireEvent.press(screen.getByText('Choose the trial diet'));
    fireEvent.press(await screen.findByTestId('pick-food'));
    fireEvent.press(screen.getByText('Back'));
    // Await the async protein lookup's settle so its state update lands inside act.
    await screen.findByText('Trial protein');
  }

  it('renders the always-present empty-but-optional row when nothing derives (E1)', async () => {
    mockedProteins.mockResolvedValue({}); // no cached protein for food-1
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickPrimary(screen);
    expect(await screen.findByText('Trial protein')).toBeTruthy();
    // A set-prompt, never a bare "Not set" alone — the row invites, it does not verdict.
    expect(screen.getByText("Tap to name this trial's protein")).toBeTruthy();
  });

  it('a hydrolyzed diet (source-less primary) shows the empty optional row, never a process word (mock frame E)', async () => {
    // Regression (adversarial round 1): a source-less process word must read as
    // "nothing derived" — the food list is the trial. The row must NOT prefill
    // "Hydrolyzed protein".
    mockedProteins.mockResolvedValue({ 'food-1': 'hydrolyzed protein' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickPrimary(screen);
    expect(screen.getByText("Tap to name this trial's protein")).toBeTruthy();
    expect(screen.queryByText('Hydrolyzed protein')).toBeNull();
  });

  it('pre-fills the derived protein as a confirmation (a glance, not a decision)', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickPrimary(screen);
    expect(await screen.findByText('Rabbit')).toBeTruthy();
    expect(screen.getByText('From the foods you picked — tap to change')).toBeTruthy();
  });

  it('the untouched golden path stores NULL — derivation stands, the read re-derives', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await fillForm(screen);
    await screen.findByText('Rabbit'); // the derived prefill has resolved
    fireEvent.press(screen.getByText('Start trial'));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedStart.mock.calls[0][0].targetProtein).toBeNull();
  });

  it('an explicit pick is stored as the owner-confirmed canonical protein', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await fillForm(screen);
    await screen.findByText('Rabbit');
    fireEvent.press(screen.getByTestId('trial-protein-row'));
    fireEvent.press(await screen.findByText('Duck')); // a common protein
    expect(await screen.findByText('Duck')).toBeTruthy(); // row updated
    fireEvent.press(screen.getByText('Start trial'));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedStart.mock.calls[0][0].targetProtein).toBe('duck');
  });

  it('choosing "No single protein" stores null (§5) and never blocks Start', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await fillForm(screen);
    await screen.findByText('Rabbit');
    fireEvent.press(screen.getByTestId('trial-protein-row'));
    fireEvent.press(await screen.findByText('No single protein'));
    fireEvent.press(screen.getByText('Start trial'));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedStart.mock.calls[0][0].targetProtein).toBeNull();
  });
});

// ── B-704 §6 — the day-0 mismatch heads-up ────────────────────────────────────
describe('StartTrialModal — the day-0 mismatch heads-up', () => {
  async function pickTwoFoods(screen: ReturnType<typeof render>) {
    fireEvent.press(screen.getByText('Choose the trial diet'));
    fireEvent.press(await screen.findByTestId('pick-food')); // food-1 (rabbit target)
    fireEvent.press(screen.getByTestId('pick-food-2'));      // food-2 (chicken)
    fireEvent.press(screen.getByText('Back'));
    // Await the async protein lookup's settle so its state update lands inside act.
    await screen.findByText('Trial protein');
  }

  it('flags a picked food whose main protein disagrees with the target, without blocking Start (§6, frame D)', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit', 'food-2': 'chicken' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickTwoFoods(screen);
    fireEvent.press(screen.getByText('Skin')); // make it startable

    expect(
      await screen.findByText('Blue Buffalo Sensitive Stomach lists chicken as its main protein.'),
    ).toBeTruthy();
    expect(
      screen.getByText("If Pixel's trial is rabbit-only, worth checking that bag with your vet."),
    ).toBeTruthy();

    // Never blocking — Start still creates the trial.
    fireEvent.press(screen.getByText('Start trial'));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
  });

  it('stays silent when the derived target is a source-less process word (adversarial round 1 regression)', async () => {
    // food-1 primary 'hydrolyzed protein' (source-less) → nothing nameable derives,
    // so food-2 (chicken) draws NO amber. The old target guard fired here with a
    // nonsense "…if the trial is hydrolyzed protein-only…" line and zero owner action.
    mockedProteins.mockResolvedValue({ 'food-1': 'hydrolyzed protein', 'food-2': 'chicken' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickTwoFoods(screen);
    fireEvent.press(screen.getByText('Skin'));
    expect(screen.queryByText(/lists chicken as its main protein/)).toBeNull();
    // And Start still works.
    fireEvent.press(screen.getByText('Start trial'));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
  });

  it('goes silent when the owner declares "No single protein" (TG-2: no target, nothing compared)', async () => {
    mockedProteins.mockResolvedValue({ 'food-1': 'rabbit', 'food-2': 'chicken' });
    const screen = renderModal();
    await waitFor(() => expect(screen.getByText('Choose the trial diet')).toBeTruthy());
    await pickTwoFoods(screen);
    expect(
      await screen.findByText('Blue Buffalo Sensitive Stomach lists chicken as its main protein.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('trial-protein-row'));
    fireEvent.press(await screen.findByText('No single protein'));
    await waitFor(() =>
      expect(
        screen.queryByText('Blue Buffalo Sensitive Stomach lists chicken as its main protein.'),
      ).toBeNull(),
    );
  });
});
