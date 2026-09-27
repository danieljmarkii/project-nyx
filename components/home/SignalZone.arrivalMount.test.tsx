// CUL-1223 (BRK-49) — the first-pattern arrival under Design v2 mounts the stack ONCE.
//
// The shipped zone swapped `<ArrivalStage>` for a bare `<LiveStack>` at both edges of the
// moment, and each row from `View` to `Animated.View`: a change of component in one slot is
// a remount, so the lead card mounted three times, each at its skeleton, re-issued its read
// each time and ended on a skeleton after "{pet}'s first pattern is ready" had been spoken
// (and a remount resets VoiceOver's focus). The measure is the lead card's READ: it is
// issued on mount, so its call count counts mounts — and the card that is on screen when
// the moment ends is the drawn card, never its skeleton.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
const mockUseDesignV2 = jest.fn(() => true);
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockUseDesignV2() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({ getDb: () => ({ getAllSync: () => [{ last: null }] }) }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: async () => null,
}));
jest.mock('../../hooks/useSignalFold', () => ({
  useSignalFold: () => ({ stateOf: () => 'open', backBecauseOf: () => null, fold: jest.fn(), unfold: jest.fn(), touch: jest.fn() }),
}));
const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({ useSignal: () => mockUseSignal() }));
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: () => [],
  useWatchingRowsRead: () => ({ rows: [], answered: true }),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
// The moment has never played for this pet: the arrival is live.
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => false, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: jest.fn() }));
jest.mock('../../lib/measureNode', () => ({ measureNodeInWindow: (_n: unknown, cb: (r: null) => void) => cb(null) }));

import { act, render } from '@testing-library/react-native';
import { SignalZone } from './SignalZone';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding } from '../../lib/signal';
import { signalWeeks, weekLine } from '../../lib/signalWindows';
import { toLocalDayKey } from '../../lib/utils';

const benignLead: CachedFinding = {
  rank: 0,
  text: 'Nyx vomited 2 times this week, 3 the week before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 3, direction: 'flat', windowDays: 14 },
};

function state(over: Partial<SignalState>): SignalState {
  return {
    petId: 'pet-1',
    findings: [],
    coverage: [],
    displayState: 'building',
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    dayNumber: 30,
    eventCount: 80,
    acknowledging: false,
    generatedAt: null,
    answered: true,
    ...over,
  };
}

function leadModel() {
  const today = toLocalDayKey(new Date());
  const weekly = signalWeeks({ finding: benignLead.finding, today, trial: null, episodeDays: [today], loggedDays: [today] });
  return { title: 'Vomiting, week over week', weekly, line: weekLine(weekly), lineWithheld: null, noun: 'vomiting', trial: null };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLoadSignalLead.mockResolvedValue(leadModel());
});
afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

async function arriveAndFinish(designV2: boolean) {
  mockUseDesignV2.mockReturnValue(designV2);
  mockUseSignal.mockReturnValue(state({ displayState: 'building' }));
  const view = render(<SignalZone />);
  await flush();
  mockUseSignal.mockReturnValue(state({ displayState: 'live', findings: [benignLead] }));
  await act(async () => {
    view.rerender(<SignalZone />);
  });
  await flush();
  const washDuring = view.queryByTestId('signal-arrival-wash') != null;
  // Past the whole 1.2s moment, and every read resolved.
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await flush();
  return { view, washDuring };
}

describe('the first-pattern arrival under Design v2 (CUL-1223, BRK-49)', () => {
  it('the moment plays, and the lead card mounts once across both of its edges', async () => {
    const { view, washDuring } = await arriveAndFinish(true);
    // Non-vacuity: the moment really played, so there WERE edges to cross.
    expect(washDuring).toBe(true);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    // One mount, one read.
    expect(mockLoadSignalLead).toHaveBeenCalledTimes(1);
    // And the card the owner is left with is the drawn card, not its skeleton.
    expect(view.getByTestId('signal-lead-card')).toBeTruthy();
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
  });
});
