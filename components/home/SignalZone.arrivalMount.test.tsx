// CUL-1223 (BRK-49) — the first-pattern arrival mounts the stack ONCE.
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
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({ getDb: () => ({ getAllSync: () => [{ last: null }] }) }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: async () => null,
  loadSignalRowScreen: async () => ({ kind: 'unanswered' }),
}));
const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({ useSignal: () => mockUseSignal() }));
jest.mock('../../hooks/useGapWarning', () => ({ useGapWarning: () => ({ text: null, answered: true, failed: false, retry: () => {}, reading: false }) }));
jest.mock('../../lib/emergencyDoorRead', () => ({ loadEmergencyRead: async () => ({ status: 'failed' }) }));
jest.mock('../../hooks/useFloorOn', () => ({ useFloorOn: () => false }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
// The moment has never played for this pet: the arrival is live.
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => false, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: jest.fn() }));
jest.mock('../../lib/measureNode', () => ({ measureNodeInWindow: (_n: unknown, cb: (r: null) => void) => cb(null) }));

import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { RAIL_GUTTER } from '../surfaces/home/HomeCard';
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

function state({ displayState: _ignored, ...over }: Partial<SignalState> & { displayState?: string }): SignalState {
  return {
    petId: 'pet-1',
    findings: [],
    coverage: [],
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    hasRecentActivity: true,
    hasSubstantialHistory: false,
    lastLoggedAt: null,
    lookSinceLastLogged: false,
    eventCount: 80,
    acknowledging: false,
    generatedAt: null,
    answered: true,
    ...over,
  };
}

function leadModel() {
  const today = toLocalDayKey(new Date());
  const weekly = signalWeeks({ finding: benignLead.finding, today, trial: null, episodeDays: [today], boutSpans: [], loggedDays: [today] });
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

async function arriveAndFinish() {
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

describe('the first-pattern arrival (CUL-1223, BRK-49)', () => {
  it('the moment plays, and the lead card mounts once across both of its edges', async () => {
    const { view, washDuring } = await arriveAndFinish();
    // Non-vacuity: the moment really played, so there WERE edges to cross.
    expect(washDuring).toBe(true);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    // One mount, one read.
    expect(mockLoadSignalLead).toHaveBeenCalledTimes(1);
    // And the card the owner is left with is the drawn card, not its skeleton.
    expect(view.getByTestId('signal-lead-card')).toBeTruthy();
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
  });

  // CUL-1525: the rails hang in the card's gutter, LEFT of the stage's content box. The stage
  // clips for the moment's 1.2s, so its clip must reach into the gutter or the first live
  // row's rail (a safety row's included) is cut off while the owner watches it arrive.
  it('keeps every rail inside the stage’s clip while the moment plays', async () => {
    mockUseSignal.mockReturnValue(state({ displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    // The quiet line's rail is already in the gutter before the moment.
    const quiet = StyleSheet.flatten(view.getByTestId('signal-quiet-rail').props.style);
    expect(quiet.position).toBe('absolute');
    expect(quiet.left).toBe(-RAIL_GUTTER);
    mockUseSignal.mockReturnValue(state({ displayState: 'live', findings: [benignLead] }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    // Non-vacuity: the moment is playing, so the stage is clipping.
    expect(view.queryByTestId('signal-arrival-wash')).not.toBeNull();
    const stage = StyleSheet.flatten(view.getByTestId('signal-arrival-stage').props.style);
    expect(stage.overflow).toBe('hidden');
    // The clip box starts a gutter's width left of the text edge, and the padding hands the
    // content its edge back: a rail at -RAIL_GUTTER lands at the clip's own x = 0.
    expect(stage.marginLeft).toBe(-RAIL_GUTTER);
    expect(stage.paddingLeft).toBe(RAIL_GUTTER);
    // The outgoing frame is absolute, so the padding does not reach it: it sits on the
    // text edge itself, and its own rail lands at x = 0 too.
    const outgoing = StyleSheet.flatten(view.getByTestId('signal-arrival-outgoing', { includeHiddenElements: true }).props.style);
    expect(outgoing.left).toBe(RAIL_GUTTER);
    // The card itself never clips, so its shadow stays through the moment.
    const wash = StyleSheet.flatten(view.getByTestId('signal-arrival-wash').props.style);
    expect(wash.overflow).toBe('hidden');
  });
});
