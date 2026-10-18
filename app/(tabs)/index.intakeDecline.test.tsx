// CUL-1975 / CUL-1972 — Home's falling-vomit withhold reads the device's OWN eating check,
// for every pet. Before, a pet with no trial could only be withheld by a Signal that already
// held an `intake_decline`: `trialInput` is the loader's base input for such a pet (no decline
// fields), so `isAnimalNotEating` read false over a cat the phone could see had stopped eating.
// The zone and the strip are prop-capturing stubs; the trial facts and the decline read are
// controlled. The no-trial fixture is the loader's real base input, never `null` (C-35).

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => {} }),
}));

const marker = (name: string) => {
  const { View } = require('react-native');
  const React = require('react');
  return () => React.createElement(View, { testID: `zone-${name}` });
};
const mockZoneProps: { current: Record<string, unknown> | null } = { current: null };
// Engines v3 PR-36: the follow-up line is dark behind EN-14 and has its own suite.
jest.mock('../../components/home/FollowUpLine', () => ({ FollowUpLine: () => null }));
jest.mock('../../components/home/SignalZone', () => ({
  SignalZone: (props: Record<string, unknown>) => {
    mockZoneProps.current = props;
    return null;
  },
}));
jest.mock('../../components/home/HomeHeader', () => ({ HomeHeader: marker('header') }));
jest.mock('../../components/home/PullToRefreshSky', () => ({ PullToRefreshSky: marker('sky') }));
jest.mock('../../components/home/CrossPetSafetyBanner', () => ({ CrossPetSafetyBanner: marker('cross') }));
jest.mock('../../components/vetvisits/AppointmentStrip', () => ({ AppointmentStrip: marker('appointment') }));
const mockStripProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('../../components/home/TrialStrip', () => ({
  TrialStrip: (props: Record<string, unknown>) => {
    mockStripProps.current = props;
    return null;
  },
}));
// The device's eating check: a list (answered) or null (did not answer), per case.
const mockDecline: { current: () => Promise<unknown> } = { current: async () => [] };
jest.mock('../../lib/dietTrialFacts', () => ({
  readIntakeDecline: jest.fn(() => mockDecline.current()),
  // The rule, never stubbed (C-34): only the read is.
  vomitLineMayReassure: jest.requireActual('../../lib/dietTrialFacts').vomitLineMayReassure,
}));
jest.mock('../../components/home/LookExits', () => ({ LookExits: marker('look-exits'), exitVisibility: () => ({}), lookRectInPage: () => null }));
jest.mock('../../components/designV2/home/TodayCard', () => ({ TodayCard: marker('today-v2') }));
jest.mock('../../components/designV2/home/CoverageDoor', () => ({ CoverageDoor: marker('coverage-door') }));
jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({ todayEvents: [], loadTodayEvents: jest.fn() }),
}));
// The trial facts as `useDietTrial` answers them — mutable per case.
const mockDietTrial: { current: { input: unknown; inputIsForPet: boolean; loadedPetId: string | null } } = {
  current: { input: null, inputIsForPet: false, loadedPetId: null },
};
jest.mock('../../hooks/useDietTrial', () => ({ useDietTrial: () => mockDietTrial.current }));
jest.mock('../../lib/sync', () => ({ syncNow: jest.fn() }));
jest.mock('../../lib/signal', () => ({ regenerateSignal: jest.fn() }));
jest.mock('../../store/syncStore', () => {
  const state = { hydrationTick: 0, bumpHydrationTick: jest.fn() };
  return {
    useSyncStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi', species: 'cat' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from './index';

const NOW = Date.now();
// `loadDietTrialFacts`'s base input for a pet with no trial, field for field.
const NO_TRIAL = {
  trial: null,
  nowMs: NOW,
  petName: 'Mochi',
  species: 'cat',
  petObjectPronoun: 'her',
  otherPetNames: [],
};
const LOW = { trigger: 'consecutive_low', refusedFoodLabel: null, headline: 'Mochi has eaten less than usual today.' };

beforeEach(() => {
  mockZoneProps.current = null;
  mockStripProps.current = null;
  mockDietTrial.current = { input: NO_TRIAL, inputIsForPet: true, loadedPetId: 'p1' };
});

const withhold = () => mockZoneProps.current?.withholdFallingVomit;

describe('Home withholds the falling vomit pair on the device’s own eating check (CUL-1975)', () => {
  it('control: a no-trial pet whose check answered with no decline shows the pair', async () => {
    mockDecline.current = async () => [];
    render(<HomeScreen />);
    await waitFor(() => expect(withhold()).toBe(false));
  });

  it('a no-trial pet whose phone sees a decline withholds it', async () => {
    mockDecline.current = async () => [LOW];
    render(<HomeScreen />);
    // Settle on the answered read, then hold: it never flips to showing the pair.
    const { readIntakeDecline } = jest.requireMock('../../lib/dietTrialFacts');
    await waitFor(() => expect(readIntakeDecline).toHaveBeenCalled());
    await waitFor(() => expect(withhold()).toBe(true));
    expect(readIntakeDecline.mock.calls.at(-1)[0]).toMatchObject({ id: 'p1', species: 'cat' });
  });

  it('a no-trial pet whose check did not answer withholds it (CUL-1972: unknown is not eating)', async () => {
    mockDecline.current = async () => null;
    render(<HomeScreen />);
    const { readIntakeDecline } = jest.requireMock('../../lib/dietTrialFacts');
    await waitFor(() => expect(readIntakeDecline).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(withhold()).toBe(true);
  });

  it('a read that rejects outright withholds it too', async () => {
    mockDecline.current = () => Promise.reject(new Error('sqlite closed'));
    render(<HomeScreen />);
    const { readIntakeDecline } = jest.requireMock('../../lib/dietTrialFacts');
    await waitFor(() => expect(readIntakeDecline).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(withhold()).toBe(true);
  });

  it('before the check answers, the pair is withheld (fail closed on the first frame)', () => {
    mockDecline.current = () => new Promise(() => undefined);
    render(<HomeScreen />);
    expect(withhold()).toBe(true);
  });
});

describe('the trial register is three-state on an unanswered check (CUL-1972, ruling 2a)', () => {
  // `notEatingFact`, never `isAnimalNotEating`: a trial input whose eating check threw is
  // null, so Noticed's withheld predicate fails closed while the door (`=== true`) stays shut.
  // Mutation-proven: `isAnimalNotEating` here reds the first case.
  it('a trial input whose check did not answer hands the zone null', () => {
    mockDietTrial.current = { input: { ...NO_TRIAL, intakeDeclineUnknown: true }, inputIsForPet: true, loadedPetId: 'p1' };
    render(<HomeScreen />);
    expect(mockZoneProps.current?.trialNotEating).toBeNull();
  });

  it('control: an answered check is false', () => {
    render(<HomeScreen />);
    expect(mockZoneProps.current?.trialNotEating).toBe(false);
  });
});

describe('the trial strip’s vomit line takes the same check (CUL-1975)', () => {
  const TRIAL_INPUT = {
    ...NO_TRIAL,
    trial: {
      id: 't1',
      status: 'active',
      startedAt: new Date(NOW - 20 * 86_400_000).toISOString().slice(0, 10),
      endedAt: null,
      targetDurationDays: 56,
      foodLabel: 'Hydrolyzed',
    },
    trialResponse: {
      trialDayNumber: 21,
      trialCount: 1,
      trialLastEpisodeDayIndex: null,
      baselineCount: 9,
      trialLoggedDays: 20,
      baselineLoggedDays: 40,
      baselineWindowDays: 49,
      densityComparable: true,
    },
  };

  // Non-vacuity floor: the same fixture DRAWS the line when the check answered empty.
  it('control: the strip’s vomit line shows when the check answered with no decline', async () => {
    mockDietTrial.current = { input: TRIAL_INPUT, inputIsForPet: true, loadedPetId: 'p1' };
    mockDecline.current = async () => [];
    render(<HomeScreen />);
    await waitFor(() =>
      expect((mockStripProps.current?.model as { trialResponseLine: string | null } | null)?.trialResponseLine).toEqual(
        expect.any(String),
      ),
    );
  });

  it('drops the strip’s vomit line when the check did not answer', async () => {
    mockDietTrial.current = { input: TRIAL_INPUT, inputIsForPet: true, loadedPetId: 'p1' };
    mockDecline.current = async () => null;
    render(<HomeScreen />);
    await new Promise((r) => setTimeout(r, 0));
    const model = mockStripProps.current?.model as { trialResponseLine: string | null } | null;
    expect(model).not.toBeNull();
    expect(model?.trialResponseLine).toBeNull();
  });

  // The adversarial pass, #7: nothing louder leads Home on a merely unanswered check, so a
  // RISE keeps its line (the strip's own rule: a rise always shows).
  it('keeps a RISING vomit line when the check did not answer', async () => {
    mockDietTrial.current = {
      input: { ...TRIAL_INPUT, trialResponse: { ...TRIAL_INPUT.trialResponse, trialCount: 9, baselineCount: 1 } },
      inputIsForPet: true,
      loadedPetId: 'p1',
    };
    mockDecline.current = async () => null;
    render(<HomeScreen />);
    await new Promise((r) => setTimeout(r, 0));
    const model = mockStripProps.current?.model as { trialResponseLine: string | null } | null;
    expect(model?.trialResponseLine).toEqual(expect.stringMatching(/^Vomiting: 9 in the trial/));
  });
});
