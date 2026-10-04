// GAP-13 (CUL-1566; PMD-21 ruled (a), PM 2026-10-04): a safety finding that arrives on a
// focused Home is SPOKEN once, queued, with the pet's name and the finding's own sentence,
// and with no haptic. Every case below drives the shipped zone through `useSignal`'s
// settled sets, inside the same RowSpeech provider Home mounts it in.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => false }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllSync: () => [{ last: null }] }),
}));

const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({
  useSignal: () => mockUseSignal(),
}));
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: () => [],
  useWatchingRowsRead: () => ({ rows: [], answered: true }),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
let mockAppActive = true;
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => mockAppActive }));
jest.mock('../../lib/signalArrival', () => ({
  hasPlayedArrival: async () => false,
  markArrivalPlayed: async () => {},
}));
const mockInsightArrival = jest.fn();
jest.mock('../../lib/haptics', () => ({ insightArrival: () => mockInsightArrival() }));

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SignalZone } from './SignalZone';
import { RowSpeechContext, type RowSpeech } from '../dayRow/rowSpeech';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, SignalFinding } from '../../lib/signal';
import { arrivalAnnouncementCopy } from '../../lib/signalCopy';
import { safetyArrivalSpoken } from '../../lib/signalSafetySpeech';

const intake: CachedFinding = {
  rank: 0,
  text: 'Nyx has eaten less than usual for two days — worth keeping an eye on, and a word with your vet if it carries on.',
  finding: {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  },
};

const benign: CachedFinding = {
  rank: 1,
  text: 'She tends to eat within an hour of waking.',
  finding: {
    type: 'timing_story',
    priorityClass: 'insight',
    symptomType: 'vomit',
    bandCounts: { rapid: 7, mid: 6, long: 7 },
    eligibleCount: 20,
    totalEpisodes: 26,
    rapidWindowMinutes: 30,
    longGapHours: 6,
    windowDays: 60,
    rapid: { count: 7, medianMinutesSinceFeeding: 12, lastTwoEligible: true, feedingFormsInEvidence: [] },
    long: { count: 7, medianGapHours: 9, feedingFormsInEvidence: [] },
  } as unknown as SignalFinding,
};

const quieted: CachedFinding = {
  rank: 0,
  text: 'Vomiting has come back again and again over 60 days — worth a word with your vet.',
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    careState: { state: 'with_vet' },
  } as unknown as SignalFinding,
};

function signalState(over: Partial<SignalState> = {}): SignalState {
  return {
    petId: 'pet-1',
    findings: [],
    coverage: [],
    displayState: 'building',
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    dayNumber: 3,
    eventCount: 11,
    acknowledging: false,
    generatedAt: null,
    answered: true,
    ...over,
  };
}

let focused = true;
const speech: RowSpeech = { petName: 'Active pet', mayAnnounce: () => focused };

function zone(provider = true) {
  return provider ? (
    <RowSpeechContext.Provider value={speech}>
      <SignalZone />
    </RowSpeechContext.Provider>
  ) : (
    <SignalZone />
  );
}

let queued: jest.SpyInstance;
let plain: jest.SpyInstance;

/** Every utterance that carried a safety sentence, on either announce path. */
function safetySpoken(): string[] {
  const all = [...queued.mock.calls.map((c) => c[0] as string), ...plain.mock.calls.map((c) => c[0] as string)];
  return all.filter((m) => m !== arrivalAnnouncementCopy('Nyx'));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Mount on a settled set, then land a second settled set: the shape of a regen arriving. */
async function landOn(first: Partial<SignalState>, next: Partial<SignalState>, provider = true) {
  mockUseSignal.mockReturnValue(signalState(first));
  const view = render(zone(provider));
  await settle();
  mockUseSignal.mockReturnValue(signalState(next));
  await act(async () => {
    view.rerender(zone(provider));
  });
  await settle();
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  focused = true;
  mockAppActive = true;
  queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
  plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  queued.mockRestore();
  plain.mockRestore();
});

describe('SignalZone — a safety arrival is spoken on a focused Home (GAP-13)', () => {
  it('speaks the finding once, queued, with the pet and its own sentence', async () => {
    await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
    expect(queued).toHaveBeenCalledTimes(1);
    expect(queued).toHaveBeenCalledWith(safetyArrivalSpoken('Nyx', [intake]), { queue: true });
    expect(safetySpoken()).toEqual([intake.text]);
  });

  it('adds no haptic: the arrival tap stays off the safety path', async () => {
    jest.useFakeTimers();
    try {
      await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(mockInsightArrival).not.toHaveBeenCalled();
      expect(safetySpoken()).toHaveLength(1);
      // Positive control: the same mock does fire for a benign first arrival, so the
      // silence above is the gate, not an unwired mock.
      await landOn({ petId: 'pet-9', displayState: 'building' }, { petId: 'pet-9', displayState: 'live', findings: [benign] });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(mockInsightArrival).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('speaks a safety finding that joins a live set, not only a first one', async () => {
    await landOn({ displayState: 'live', findings: [benign] }, { displayState: 'live', findings: [intake, benign] });
    expect(safetySpoken()).toEqual([intake.text]);
  });

  it('says it on Android too: there is no live region to cover it', async () => {
    const prev = Platform.OS;
    Platform.OS = 'android';
    try {
      await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
      expect(plain).toHaveBeenCalledWith(intake.text);
      expect(queued).not.toHaveBeenCalled();
    } finally {
      Platform.OS = prev;
    }
  });

  it('never speaks a benign arrival through this path', async () => {
    await landOn({ displayState: 'live', findings: [] }, { displayState: 'live', findings: [benign] });
    expect(safetySpoken()).toEqual([]);
  });

  it('never speaks a concern whose ask the vet-knows state has quieted', async () => {
    await landOn({ displayState: 'building' }, { displayState: 'live', findings: [quieted] });
    expect(safetySpoken()).toEqual([]);
  });

  it('never speaks while another screen covers Home; says it once when Home is back in front', async () => {
    focused = false;
    const view = await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
    expect(safetySpoken()).toEqual([]);
    focused = true;
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toEqual([intake.text]);
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toEqual([intake.text]);
  });

  it('a set that lands in the background is said on return to the foreground, once', async () => {
    mockAppActive = false;
    const view = await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
    expect(safetySpoken()).toEqual([]);
    mockAppActive = true;
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toEqual([intake.text]);
  });

  it('a concern that clears and fires again is a new arrival (the cat that stops eating twice)', async () => {
    const view = await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [benign] }));
    await act(async () => {
      view.rerender(zone());
    });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [intake, benign] }));
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toEqual([intake.text, intake.text]);
  });

  it('a spoken concern quieted by the vet-knows state and raised again is spoken again', async () => {
    const raised = (state: string): CachedFinding => ({
      ...quieted,
      finding: { ...(quieted.finding as object), careState: { state } } as unknown as SignalFinding,
    });
    const view = await landOn({ displayState: 'building' }, { displayState: 'live', findings: [raised('raised')] });
    expect(safetySpoken()).toEqual([`Nyx: ${quieted.text}`]);
    for (const state of ['with_vet', 'raised_again']) {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [raised(state)] }));
      await act(async () => {
        view.rerender(zone());
      });
    }
    expect(safetySpoken()).toEqual([`Nyx: ${quieted.text}`, `Nyx: ${quieted.text}`]);
  });

  it('never speaks twice: a re-render, a re-rank and a re-read of the same set stay quiet', async () => {
    const view = await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] });
    expect(safetySpoken()).toHaveLength(1);
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [benign, { ...intake, rank: 2 }], petName: 'Nyx' }),
    );
    await act(async () => {
      view.rerender(zone());
    });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [{ ...intake }] }));
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toHaveLength(1);
  });

  it('says nothing for a concern already in the record when Home opened', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [intake] }));
    render(zone());
    await settle();
    expect(safetySpoken()).toEqual([]);
  });

  it('says nothing before the read answers: an unread set is not a baseline', async () => {
    // The first frame (answered false, empty) must not become the baseline, or the concern
    // the read then returns would be spoken as if it had just arrived.
    await landOn({ answered: false, isLoading: true }, { displayState: 'live', findings: [intake] });
    expect(safetySpoken()).toEqual([]);
  });

  it('says nothing on a pet switch: the other pet’s standing concern is not an arrival', async () => {
    const view = await landOn({ petId: 'pet-1', displayState: 'live', findings: [] }, { petId: 'pet-2', petName: 'Mochi', answered: false, isLoading: true });
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-2', petName: 'Mochi', displayState: 'live', findings: [{ ...intake, text: 'Mochi has eaten less than usual for two days.' }] }),
    );
    await act(async () => {
      view.rerender(zone());
    });
    expect(safetySpoken()).toEqual([]);
  });

  it('says nothing with no provider: the zone never decides on its own that Home is in front', async () => {
    await landOn({ displayState: 'building' }, { displayState: 'live', findings: [intake] }, false);
    expect(safetySpoken()).toEqual([]);
  });
});
