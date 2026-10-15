// SignalZone — the Signal/Home surface after the GA of the design uplift + the Signals-v2
// lanes (CUL-547 + CUL-548), and the quiet line (CUL-1838). The quiet line's three states
// and the gap warning, the SR-3 register (receded chrome + acknowledgment line), and the v2
// story/trial cards all render UNCONDITIONALLY. What stays gated is the B-789
// safety suppression (a reassuring trial_response card over a not-eating record), which is
// a safety gate, not a beta gate.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
// The Signal rows' loader reaches `lib/supabase`; the client is never constructed here.
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllSync: () => [{ last: null }] }),
}));
// The vet door's read (round 7's foot): answered and quiet unless a test says otherwise.
const mockLoadEmergencyRead = jest.fn();
jest.mock('../../lib/emergencyDoorRead', () => ({
  loadEmergencyRead: (...a: unknown[]) => mockLoadEmergencyRead(...a),
}));
jest.mock('../../hooks/useFloorOn', () => ({ useFloorOn: () => false }));

// The lead card's and the rows' own reads; the argument the lead card is handed says which
// finding took the lead canvas. The lead read never answers here, so the card holds its
// skeleton (its drawn face is `SignalZone.designV2.test.tsx`'s).
const mockLoadSignalLead = jest.fn((..._a: unknown[]) => new Promise<never>(() => {}));
jest.mock('../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: () => new Promise<never>(() => {}),
  loadSignalRowScreen: () => new Promise<never>(() => {}),
}));

const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({
  useSignal: () => mockUseSignal(),
}));

// The gap warning's hook does a local SQLite read on focus; here we drive its output
// directly. Default: no warning, answered.
const mockUseGapWarning = jest.fn();
jest.mock('../../hooks/useGapWarning', () => ({
  useGapWarning: (enabled: boolean) => mockUseGapWarning(enabled),
}));

// CUL-601 (§4) — the arrival moment's collaborators. Motion + foreground are pinned so
// the sweep's presence is a decision of the code under test rather than of the runner's
// accessibility state; the marker store and the haptic are the two observable outputs.
const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

const mockHasPlayedArrival = jest.fn(async (_petId: string) => false);
const mockMarkArrivalPlayed = jest.fn(async (_petId: string) => {});
jest.mock('../../lib/signalArrival', () => ({
  hasPlayedArrival: (petId: string) => mockHasPlayedArrival(petId),
  markArrivalPlayed: (petId: string) => mockMarkArrivalPlayed(petId),
}));

const mockInsightArrival = jest.fn();
jest.mock('../../lib/haptics', () => ({ insightArrival: () => mockInsightArrival() }));

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { SignalZone } from './SignalZone';
import { theme } from '../../constants/theme';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, CoverageDiagnostic, TrialResponseFinding } from '../../lib/signal';
import {
  ackUpdatingCopy,
  arrivalAnnouncementCopy,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  QUIET_TOO_EARLY_HEADER,
  QUIET_GONE_QUIET_SUB,
  quietTooEarlySub,
  watchingGapRow,
} from '../../lib/signalCopy';
import { SIGNAL_DOOR_CALL_TODAY, SIGNAL_DOOR_LABEL } from '../../lib/lookEmergency';
import { usePetStore } from '../../store/petStore';
import { router } from 'expo-router';
import { RowSpeechContext } from '../dayRow/rowSpeech';
import type { TrialCardTrial } from '../../lib/dietTrialCard';

// A minimal live finding so the register (live state) renders a stack.
const liveFinding: CachedFinding = {
  rank: 0,
  text: 'A live finding sentence.',
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

/** The hook's state. `displayState` is a shorthand for the local facts that route to it
 *  (the zone derives the state itself, CUL-1838); `live` needs findings, as before. */
function signalState(
  over: Partial<SignalState> & { displayState?: 'building' | 'stale' | 'no_pattern' | 'live' } = {},
): SignalState {
  const { displayState = 'building', ...rest } = over;
  const facts =
    displayState === 'stale'
      ? { hasRecentActivity: false, hasSubstantialHistory: false }
      : displayState === 'no_pattern'
        ? { hasRecentActivity: true, hasSubstantialHistory: true }
        : { hasRecentActivity: true, hasSubstantialHistory: false };
  return {
    petId: 'pet-1',
    findings: [],
    coverage: [],
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    eventCount: 11,
    lastLoggedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    lookSinceLastLogged: false,
    acknowledging: false,
    generatedAt: null,
    answered: true,
    ...facts,
    ...rest,
  };
}

/** The row headlines on Home, in rank order. A row's face is its headline, never the
 *  finding's sentence (that lives on the finding's own screen). */
function headlines(view: ReturnType<typeof render>): unknown[] {
  return view.queryAllByTestId('signal-row-headline').map((h) => h.props.children);
}
/** The finding the lead card was handed (the lead canvas), or undefined. */
function leadCardFinding(): unknown {
  return mockLoadSignalLead.mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no gap warning, answered.
  mockUseGapWarning.mockReturnValue({ text: null, answered: true });
  mockLoadEmergencyRead.mockResolvedValue({
    status: 'ready',
    facts: { refusedRecently: false, vomitCount24h: 0, lethargyRecently: false },
  });
  usePetStore.setState({
    pets: [{ id: 'pet-1', name: 'Nyx', species: 'cat' }],
    activePet: { id: 'pet-1', name: 'Nyx', species: 'cat' },
  } as never);
  mockUseReducedMotion.mockReturnValue(false);
  mockHasPlayedArrival.mockResolvedValue(false);
  mockMarkArrivalPlayed.mockResolvedValue(undefined);
});

// ── The quiet line (CUL-1838; round 7 of the Signal mock) ─────────────────────────────
const GAP = watchingGapRow('vomiting', '12 days, then 7, then 3');
const RETIRED = [
  /getting to know/i,
  /Day \d+ —/,
  /events? so far/,
  /This is week/,
  /watching for/i,
  /won't wait for the week/,
  /keep logging/i,
  /Not enough recent data/,
];
function expectNoRetiredCopy(view: ReturnType<typeof render>) {
  for (const re of RETIRED) expect(view.queryByText(re)).toBeNull();
  expect(view.queryByText('Last week')).toBeNull(); // the ghost compare
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SignalZone — the quiet line (CUL-1838)', () => {
  it('0 events: "Too early to tell", the subtitle, and only the vet door (nothing logged, no report)', async () => {
    mockUseSignal.mockReturnValue(
      signalState({ eventCount: 0, hasRecentActivity: false, hasSubstantialHistory: false, lastLoggedAt: null }),
    );
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
    expect(view.getByText(quietTooEarlySub('Nyx'))).toBeTruthy();
    expect(view.getByTestId('signal-zone-vet-door')).toBeTruthy();
    expect(view.queryByTestId('signal-zone-report')).toBeNull();
    // Zero events is never stale, even with no recent activity.
    expect(view.queryByText(/Nothing logged since/)).toBeNull();
    expectNoRetiredCopy(view);
  });

  it('looks only (CUL-1484): a record of daily looks reads too early, never "week 1" and never gone quiet', async () => {
    mockUseSignal.mockReturnValue(
      signalState({ eventCount: 0, hasRecentActivity: false, lastLoggedAt: null, lookSinceLastLogged: false }),
    );
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
    expect(view.queryByText(/week 1|This is week/i)).toBeNull();
    expectNoRetiredCopy(view);
  });

  it('a few days in: still too early, and "Vet report ›" opens the record\'s pet\'s report', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', eventCount: 3 }));
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
    fireEvent.press(view.getByTestId('signal-zone-report'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/report', params: { pet: 'pet-1' } });
  });

  it('gone quiet: dated, never calm, with both doors', async () => {
    const tue = new Date(2026, 9, 13, 9, 0); // a Tuesday
    jest.useFakeTimers({ now: new Date(2026, 9, 15, 12, 0), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'stale', lastLoggedAt: tue.toISOString() }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.getByText('Nothing logged since Tue')).toBeTruthy();
      expect(view.getByText(QUIET_GONE_QUIET_SUB)).toBeTruthy();
      expect(view.getByTestId('signal-zone-vet-door')).toBeTruthy();
      expect(view.getByTestId('signal-zone-report')).toBeTruthy();
      expectNoRetiredCopy(view);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a look logged after it went quiet: the header names meals and symptoms', async () => {
    const tue = new Date(2026, 9, 13, 9, 0);
    jest.useFakeTimers({ now: new Date(2026, 9, 15, 12, 0), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'stale', lastLoggedAt: tue.toISOString(), lookSinceLastLogged: true }),
      );
      const view = render(<SignalZone />);
      await settle();
      expect(view.getByText('No meals or symptoms since Tue')).toBeTruthy();
      expect(view.queryByText(/Nothing logged since/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('nothing found: "No pattern right now" / "That isn\'t an all-clear." — no coverage nag, no Patterns door, no disclaimer', async () => {
    mockUseSignal.mockReturnValue(
      signalState({
        displayState: 'no_pattern',
        coverage: [{ type: 'rate_meals', actionability: 'action', ratedMeals: 1, ratedMealsNeeded: 4 }],
      }),
    );
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(NO_PATTERN_HEADLINE)).toBeTruthy();
    expect(view.getByText(NO_PATTERN_SUB)).toBeTruthy();
    expect(view.queryByText(/aren't rated often enough/)).toBeNull();
    expect(view.queryByTestId('signal-zone-patterns')).toBeNull();
    expect(view.queryByTestId('signal-zone-disclaimer')).toBeNull();
    expectNoRetiredCopy(view);
  });

  it('the live foot is unchanged: the disclaimer and the Patterns door, no vet door', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    const view = render(<SignalZone />);
    expect(view.getByTestId('signal-zone-patterns')).toBeTruthy();
    expect(view.getByTestId('signal-zone-disclaimer')).toBeTruthy();
    expect(view.queryByTestId('signal-zone-vet-door')).toBeNull();
  });

  describe('the vet door (Dr. Chen, ruled 2026-10-15)', () => {
    it('at rest it is labelled for the sheet', async () => {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.getByText(SIGNAL_DOOR_LABEL)).toBeTruthy();
    });

    it('once the record meets a call sign it says the imperative, from the sheet\'s own resolver', async () => {
      mockLoadEmergencyRead.mockResolvedValue({
        status: 'ready',
        // A cat not eating for a day: a call-today sign the record can settle.
        facts: { refusedRecently: true, vomitCount24h: 0, lethargyRecently: false },
      });
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      const view = render(<SignalZone />);
      expect(await view.findByText(SIGNAL_DOOR_CALL_TODAY)).toBeTruthy();
    });

    it('reads the trial\'s refusal register Home hands it, for the zone\'s own pet', async () => {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      render(<SignalZone trialNotEating />);
      await settle();
      expect(mockLoadEmergencyRead).toHaveBeenCalledWith({ id: 'pet-1', species: 'cat' }, true);
    });

    it('an unanswered read keeps the resting label (a door never shouts on unknown facts, T-20)', async () => {
      mockLoadEmergencyRead.mockResolvedValue({ status: 'failed' });
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.getByText(SIGNAL_DOOR_LABEL)).toBeTruthy();
    });

    it('opens the shipped sheet for the zone\'s pet', async () => {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      const view = render(<SignalZone />);
      await settle();
      fireEvent.press(view.getByTestId('signal-zone-vet-door'));
      expect(view.getByText('For Nyx')).toBeTruthy();
    });

    it('a species the sheet has no signs for gets no vet door, and the report still shows', async () => {
      usePetStore.setState({
        pets: [{ id: 'pet-1', name: 'Nyx', species: 'rabbit' }],
        activePet: { id: 'pet-1', name: 'Nyx', species: 'rabbit' },
      } as never);
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.queryByTestId('signal-zone-vet-door')).toBeNull();
      expect(view.getByTestId('signal-zone-report')).toBeTruthy();
    });
  });
});

// ── The gap warning (CUL-1468, CUL-1941) ───────────────────────────────────────────
describe('SignalZone — the gap warning takes the card', () => {
  for (const displayState of ['building', 'stale', 'no_pattern'] as const) {
    it(`in ${displayState}: the warning replaces the quiet line, with both doors`, async () => {
      mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
      mockUseSignal.mockReturnValue(signalState({ displayState }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.getByText(GAP)).toBeTruthy();
      expect(view.queryByTestId('signal-quiet-line')).toBeNull();
      expect(view.getByTestId('signal-zone-vet-door')).toBeTruthy();
      expect(view.getByTestId('signal-zone-report')).toBeTruthy();
    });
  }

  it('the read is on in stale (CUL-1468) and in live; off only while the skeleton shows', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale' }));
    const view = render(<SignalZone />);
    expect(mockUseGapWarning.mock.calls.at(-1)?.[0]).toBe(true);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    view.rerender(<SignalZone />);
    expect(mockUseGapWarning.mock.calls.at(-1)?.[0]).toBe(true);
  });

  it('in live it sits under the stack — Home has no row for the server gap finding', () => {
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    const view = render(<SignalZone />);
    expect(view.getByText(GAP)).toBeTruthy();
    expect(view.getByTestId('signal-zone-patterns')).toBeTruthy();
  });

  it('CUL-1941: a lone server gap_shortening no longer blanks the card — the warning takes it', async () => {
    const serverGap = {
      rank: 0,
      text: 'Gaps between vomiting episodes are getting shorter — 12 days, then 7, then 4, then 3.',
      finding: { type: 'gap_shortening', priorityClass: 'insight', symptomType: 'vomit' },
    } as unknown as CachedFinding;
    // Control, and the shape that used to blank: the client read has not reproduced it.
    mockUseGapWarning.mockReturnValue({ text: null, answered: true });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale', findings: [serverGap] }));
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(serverGap.text)).toBeTruthy();
    expect(view.queryByTestId('signal-zone-patterns')).toBeNull(); // not the live foot over an empty stack
  });

  it('no warning: the quiet line stands (the warning is escalate-only, never invented)', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale' }));
    const view = render(<SignalZone />);
    await settle();
    expect(view.queryByTestId('signal-gap-warning')).toBeNull();
    expect(view.getByTestId('signal-quiet-line')).toBeTruthy();
  });
});

// ── CUL-1943: an unanswered or failed gap read is never "no warning" ─────────────────
describe('SignalZone — a gap read that did not answer never draws the quiet line (CUL-1943)', () => {
  const FAILED = /Couldn't check the gaps between Nyx's vomiting episodes/;

  for (const displayState of ['building', 'stale', 'no_pattern'] as const) {
    it(`in ${displayState}: a thrown read says so, with Try again, and no quiet line`, async () => {
      const retry = jest.fn();
      mockUseGapWarning.mockReturnValue({ text: null, answered: true, failed: true, retry });
      mockUseSignal.mockReturnValue(signalState({ displayState }));
      const view = render(<SignalZone />);
      await settle();
      expect(view.queryByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeNull();
      expect(view.getByTestId('signal-gap-read-failed')).toBeTruthy();
      expect(view.getByText(FAILED)).toBeTruthy();
      fireEvent.press(view.getByTestId('signal-gap-retry'));
      expect(retry).toHaveBeenCalledTimes(1);
      // The vet door stays: a check that did not run takes no door away.
      expect(view.getByTestId('signal-zone-vet-door')).toBeTruthy();
    });

    it(`in ${displayState}: an unanswered read holds the skeleton, then says the check did not run`, async () => {
      jest.useFakeTimers();
      try {
        mockUseGapWarning.mockReturnValue({ text: null, answered: false, failed: false, retry: jest.fn() });
        mockUseSignal.mockReturnValue(signalState({ displayState }));
        const view = render(<SignalZone />);
        expect(view.queryByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeNull();
        expect(view.getByTestId('signal-loading-skeleton')).toBeTruthy();
        act(() => {
          jest.advanceTimersByTime(1500);
        });
        expect(view.queryByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeNull();
        expect(view.queryByTestId('signal-loading-skeleton')).toBeNull();
        expect(view.getByTestId('signal-gap-read-failed')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });
  }

  it('the answer, once in, replaces the held frame (control: the quiet line is reachable)', async () => {
    mockUseGapWarning.mockReturnValue({ text: null, answered: false, failed: false, retry: jest.fn() });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale' }));
    const view = render(<SignalZone />);
    expect(view.queryByTestId('signal-quiet-line')).toBeNull();
    mockUseGapWarning.mockReturnValue({ text: null, answered: true, failed: false, retry: jest.fn() });
    view.rerender(<SignalZone />);
    await settle();
    expect(view.getByTestId('signal-quiet-line')).toBeTruthy();
    expect(view.queryByTestId('signal-gap-read-failed')).toBeNull();
  });

  it('a failed read that still holds a sentence draws the warning, not the failure line', async () => {
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true, failed: true, retry: jest.fn() });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale' }));
    const view = render(<SignalZone />);
    await settle();
    expect(view.getByText(GAP)).toBeTruthy();
    expect(view.queryByTestId('signal-gap-read-failed')).toBeNull();
  });

  it('in live: a failed read draws the failure row under the stack', () => {
    mockUseGapWarning.mockReturnValue({ text: null, answered: true, failed: true, retry: jest.fn() });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    const view = render(<SignalZone />);
    expect(view.getByTestId('signal-gap-read-failed')).toBeTruthy();
    expect(view.getByTestId('signal-zone-patterns')).toBeTruthy();
  });
});

// ── CUL-1937: a warning is never celebrated ─────────────────────────────────────────
describe('SignalZone — the first gap warning plays no celebration (CUL-1937)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  const benign: CachedFinding = {
    rank: 0,
    text: 'Vomiting most often follows meals within two hours.',
    finding: {
      type: 'postprandial_timing',
      priorityClass: 'insight',
      symptomType: 'vomit',
      rapidCount: 5,
      eligibleCount: 7,
      totalEpisodes: 9,
      rapidWindowMinutes: 120,
      windowDays: 60,
    } as never,
  };
  const serverGap = {
    rank: 1,
    text: 'Gaps between vomiting episodes are getting shorter — 12 days, then 7, then 4, then 3.',
    finding: { type: 'gap_shortening', priorityClass: 'insight', symptomType: 'vomit' },
  } as unknown as CachedFinding;

  it('a pet whose first finding is gap_shortening: no wash, no tap, no announcement, and the marker is spent', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [serverGap] }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalledWith(arrivalAnnouncementCopy('Nyx'));
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
    expect(view.getByText(serverGap.text)).toBeTruthy();
    announce.mockRestore();
  });

  it('a gap finding beside a titled insight withholds the moment too, and spends it', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [benign, serverGap] }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
  });

  it('control: the same insight alone still arrives (the gate was what held it)', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [benign] }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    expect(view.queryByTestId('signal-arrival-wash')).toBeTruthy();
  });

  it('the client warning arriving on the quiet line: the Signal holds the quiet words over the lead, then lands the sentence', async () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    expect(view.getByTestId('signal-quiet-line')).toBeTruthy();
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    // The lead: the quiet words still drawn (fading, hidden from VoiceOver), the sentence not yet in.
    expect(view.getByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText(GAP)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(view.getByText(GAP)).toBeTruthy();
    expect(view.queryByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
  });

  it('a cold mount that already has a warning draws it still', async () => {
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale' }));
    const view = render(<SignalZone />);
    await flush();
    expect(view.getByText(GAP)).toBeTruthy();
    expect(view.queryByTestId('signal-quiet-line')).toBeNull();
  });
});

// Adversarial pass, PR-21: a safety finding this build cannot title must never fall to a
// quiet line that asserts "No pattern right now" over it.
describe('SignalZone — an untitled SAFETY finding holds live', () => {
  const weightLoss = {
    rank: 0,
    text: 'Nyx has lost weight between two weigh-ins.',
    finding: { type: 'weight_loss', priorityClass: 'safety' },
  } as unknown as CachedFinding;

  it('never reads "No pattern right now" or "Too early to tell" over it', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', findings: [weightLoss] }));
    const view = render(<SignalZone />);
    expect(view.queryByText(NO_PATTERN_HEADLINE)).toBeNull();
    expect(view.queryByText(QUIET_TOO_EARLY_HEADER)).toBeNull();
    expect(view.queryByTestId('signal-quiet-line')).toBeNull();
  });

  it('keeps the vet door, and its imperative, on a card that draws nothing (adversarial pass 2)', async () => {
    mockLoadEmergencyRead.mockResolvedValue({
      status: 'ready',
      facts: { refusedRecently: true, vomitCount24h: 0, lethargyRecently: false },
    });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale', findings: [weightLoss] }));
    const view = render(<SignalZone />);
    expect(await view.findByText(SIGNAL_DOOR_CALL_TODAY)).toBeTruthy();
    expect(view.queryByTestId('signal-zone-patterns')).toBeNull();
  });

  it('control: an untitled INSIGHT alone does fall to the quiet line (CUL-1941)', () => {
    const untitledInsight = { ...weightLoss, finding: { type: 'gap_shortening', priorityClass: 'insight' } } as unknown as CachedFinding;
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', findings: [untitledInsight] }));
    const view = render(<SignalZone />);
    expect(view.getByText(untitledInsight.text)).toBeTruthy(); // the server's own gap sentence takes the card
  });
});

describe('SignalZone — the warning arrives once, and is said', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('F2: a warning already drawn under a live stack does not re-arrive when the stack empties', async () => {
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    const view = render(<SignalZone />);
    await act(async () => {});
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    // No lead: the sentence is drawn at once, no quiet line fading over it.
    expect(view.getByText(GAP)).toBeTruthy();
    expect(view.queryByTestId('signal-quiet-line', { includeHiddenElements: true })).toBeNull();
  });

  it('a warning that arrives while Home is in front is spoken once, queued', async () => {
    // `announceQueued` uses the queued iOS call where it exists, else the plain one.
    const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const queued =
      typeof AccessibilityInfo.announceForAccessibilityWithOptions === 'function'
        ? jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
        : null;
    const announce = { mock: { get calls() { return [...plain.mock.calls, ...(queued?.mock.calls ?? [])] as unknown[][]; } } };
    const speech = { petName: 'Nyx', mayAnnounce: () => true };
    const zone = () => (
      <RowSpeechContext.Provider value={speech}>
        <SignalZone />
      </RowSpeechContext.Provider>
    );
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const view = render(zone());
    await act(async () => {});
    expect(announce.mock.calls.filter(([m]) => m === GAP)).toHaveLength(0);
    mockUseGapWarning.mockReturnValue({ text: GAP, answered: true });
    await act(async () => {
      view.rerender(zone());
    });
    expect(announce.mock.calls.filter(([m]) => m === GAP)).toHaveLength(1);
    await act(async () => {
      view.rerender(zone());
    });
    expect(announce.mock.calls.filter(([m]) => m === GAP)).toHaveLength(1);
    plain.mockRestore();
    queued?.mockRestore();
  });
});

describe('SignalZone — B-734 first-load window (content-shaped skeleton, never a quiet line)', () => {
  it('loading renders the content-shaped skeleton and no quiet line, no foot', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale', isLoading: true, findings: [], eventCount: 0 }));
    const view = render(<SignalZone />);
    expect(view.getByTestId('signal-loading-skeleton')).toBeTruthy();
    expect(view.queryByTestId('signal-quiet-line')).toBeNull();
    expect(view.queryByTestId('signal-zone-foot')).toBeNull();
  });

  it('the gap read is off while the skeleton shows', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'stale', isLoading: true, findings: [], eventCount: 0 }));
    render(<SignalZone />);
    expect(mockUseGapWarning.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it('the skeleton is TIME-BOXED — a hung read falls through to the derived state and re-enables the gap read (adversarial ④)', () => {
    jest.useFakeTimers();
    try {
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building', isLoading: true, findings: [], eventCount: 0 }));
      const view = render(<SignalZone />);
      expect(view.getByTestId('signal-loading-skeleton')).toBeTruthy();
      expect(mockUseGapWarning.mock.calls.at(-1)?.[0]).toBe(false);
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      expect(view.queryByTestId('signal-loading-skeleton')).toBeNull();
      expect(mockUseGapWarning.mock.calls.at(-1)?.[0]).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('once the read lands (isLoading false), the quiet line renders — no lingering skeleton', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', isLoading: false }));
    const view = render(<SignalZone />);
    expect(view.queryByTestId('signal-loading-skeleton')).toBeNull();
    expect(view.getByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
  });
});

describe('SignalZone — SR-3 acknowledgment line (§5.3)', () => {
  it('shows the "Noted — updating …" line when a regen is in flight in the live register', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    const on = render(<SignalZone />);
    expect(on.getByText(ackUpdatingCopy('Nyx'))).toBeTruthy();
    // The findings stay readable throughout (never blanked / replaced by a spinner).
    expect(headlines(on)).toEqual(['Eating less than usual']);
  });

  it('does not render the ack line when nothing is in flight (not acknowledging)', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: false }),
    );
    expect(render(<SignalZone />).queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
  });

  it('is scoped to the live register — on a log the quiet line holds still (round 7)', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', acknowledging: true }));
    const view = render(<SignalZone />);
    expect(view.queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
    // The quiet line renders intact (never blanked by the ack machinery).
    expect(view.getByText(QUIET_TOO_EARLY_HEADER)).toBeTruthy();
  });

  it('announces the ack to VoiceOver on iOS when it appears (accessibilityLiveRegion is Android-only)', () => {
    const prevOS = Platform.OS;
    Platform.OS = 'ios';
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    render(<SignalZone />);
    expect(announce).toHaveBeenCalledWith(ackUpdatingCopy('Nyx'));
    announce.mockRestore();
    Platform.OS = prevOS;
  });
});

describe('SignalZone — SR-3 receded chrome (§5.2)', () => {
  it('drops the section label a tier in the live register', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText('Signal')).toHaveStyle({ color: theme.colorTextTertiary });
  });

  it('keeps the label prominent in the empty states (only the live register recedes it)', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    expect(render(<SignalZone />).getByText('Signal')).toHaveStyle({ color: theme.colorTextSecondary });
  });
});

// ── CUL-12/13 (Signals v2) — the v2 cards render in the LiveStack (no client gate) ──
// The client no longer gates the timing-story / trial cards (CUL-548): they render
// whenever the payload carries them. What SignalZone still owns is the B-789 safety
// suppression of the reassuring trial_response card over a not-eating record.
describe('SignalZone — v2 cards in the LiveStack', () => {
  const storyFinding: CachedFinding = {
    rank: 1,
    text: 'Her vomiting keeps two kinds of time.',
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
      long: {
        count: 7,
        medianHoursSinceFeeding: 9,
        lastTwoEligible: false,
        feedingFormsInEvidence: [],
        clockBand: { startLocalHour: 2, windowHours: 6 },
        clockCount: 6,
      },
    },
  };

  it('renders the A2 story card in the stack alongside the other findings', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding, storyFinding] }),
    );
    const view = render(<SignalZone />);
    // Safety leads; the story card is a row below it.
    expect(headlines(view)).toEqual(['Eating less than usual', 'Vomiting soon or long after meals']);
    // S1: the safety row stays words, with its ask on Home (the lane-drawing positive
    // control is the device case in `SignalZone.designV2.test.tsx`).
    const safetyRow = within(view.getAllByTestId('signal-row')[0]);
    expect(safetyRow.queryAllByTestId(/^signal-row-thumb/)).toHaveLength(0);
    expect(safetyRow.getByTestId('signal-row-ask')).toBeTruthy();
  });

  const trialFinding: CachedFinding = {
    rank: 1,
    text: 'A trial sentence about vomiting counts.',
    finding: {
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber: 20,
      targetDurationDays: 56,
      trialLoggedDays: 18,
      baselineLoggedDays: 40,
      baselineWindowDays: 49,
      pooledTrialCount: 4,
      pooledBaselineCount: 20,
      rapid: { trial: 4, baseline: 8 },
      long: { trial: 0, baseline: 7 },
      rapidWindowMinutes: 30,
      longGapHours: 6,
      treatShare: { trial: 0.1, baseline: 0.8 },
      mealsPerDay: { trial: 4, baseline: 2 },
      comparisonDirection: 'fewer_during_trial',
      densityComparable: true,
      trialWindowDays: 20,
    },
  };

  // The co-finding beside the trial card is a FLAT week, not the file's default `liveFinding`:
  // that one is an intake decline, and since CUL-1216 an intake decline in the Signal is a
  // not-eating register on its own, which withholds the falling trial card (its own case below).
  const coFinding: CachedFinding = {
    rank: 0,
    text: 'A live finding sentence.',
    finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 2, direction: 'flat', windowDays: 14 },
  };

  it('renders the trial card in the stack alongside the other findings', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [coFinding, trialFinding] }));
    const view = render(<SignalZone />);
    expect(headlines(view)).toEqual(['Diet trial, day 20 of 56']);
    expect(leadCardFinding()).toBe(coFinding);
  });

  // ── B-789 (§5.2) — the not-eating suppression of the reassuring trial_response card ──
  // Home passes `withholdFallingVomit` (computed from the same `trialInput` the strip
  // withholds its vomit line on, `isAnimalNotEating`) so a reassuring "0 vomiting · was 20"
  // never renders over a day-1 diet-refusal cat the relative-decline lane can't see. This is
  // SUPPRESSION, not reorder: the card must not render at all, even below a safety card.
  describe('B-789 suppression on a not-eating record', () => {
    it('drops the trial card when withholdFallingVomit is set; keeps the other findings', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [coFinding, trialFinding] }),
      );
      const view = render(<SignalZone withholdFallingVomit />);
      // The trial row is gone…
      expect(headlines(view)).toEqual([]);
      expect(view.queryByText('Diet trial, day 20 of 56')).toBeNull();
      // …but the co-finding still renders, and still leads — no stray gap where the card was.
      expect(leadCardFinding()).toBe(coFinding);
    });

    it('renders the trial card when withholdFallingVomit is false (the eating trial)', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [coFinding, trialFinding] }),
      );
      const view = render(<SignalZone withholdFallingVomit={false} />);
      expect(headlines(view)).toEqual(['Diet trial, day 20 of 56']);
      expect(leadCardFinding()).toBe(coFinding);
    });

    // CUL-1216 (BRK-6): the Signal's own intake decline withholds on its own — a pet with no
    // trial has no other register — and so does a falling vomit reflection.
    it('an intake decline in the Signal drops the falling trial card and a falling vomit week, prop or no prop', () => {
      const fallingWeek: CachedFinding = {
        rank: 2,
        text: 'Nyx vomited once this week, down from 4 the week before.',
        finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 1, priorCount: 4, direction: 'improving', windowDays: 14 },
      };
      mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding, trialFinding, fallingWeek] }));
      const view = render(<SignalZone withholdFallingVomit={false} />);
      // Only the intake decline is left: no trial row, no falling week (row or lead card).
      expect(headlines(view)).toEqual(['Eating less than usual']);
      expect(view.getAllByTestId('signal-row')).toHaveLength(1);
      expect(mockLoadSignalLead).not.toHaveBeenCalled();
    });

    it('defaults to not suppressing — a non-Home caller (no prop) renders the card', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [coFinding, trialFinding] }),
      );
      expect(headlines(render(<SignalZone />))).toEqual(['Diet trial, day 20 of 56']);
    });

    // Direction-aware (adversarial-reviewer): only the REASSURING `fewer_during_trial` card is the
    // §5.2 hazard. A `more_during_trial` card is a vomiting ESCALATION during the trial — on a
    // not-eating cat that is a concern to KEEP, not a reassurance to hide. It must survive the
    // suppression (dropping it would lose the only card carrying the rise in the ④/⑦ dead zone).
    it('keeps a more_during_trial ESCALATION card even when withholdFallingVomit is set', () => {
      const moreFinding: TrialResponseFinding = {
        ...(trialFinding.finding as TrialResponseFinding),
        comparisonDirection: 'more_during_trial',
        pooledTrialCount: 8,
        pooledBaselineCount: 2,
      };
      const moreTrialFinding: CachedFinding = { ...trialFinding, finding: moreFinding };
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [coFinding, moreTrialFinding] }),
      );
      const view = render(<SignalZone withholdFallingVomit />);
      expect(headlines(view)).toEqual(['Diet trial, day 20 of 56']);
      expect(leadCardFinding()).toBe(coFinding);
    });
  });
});

// ── CUL-601 (§4, DP-3) — the first-insight arrival moment ────────────────────────
//
// Four ACs, and every one of them is about the moment NOT happening: it plays once per
// pet ever, never over a safety finding, never on a mere load, and never as movement
// when the owner has asked the OS for less of it. The moment itself is 1.2s of opacity;
// the rules are the feature.
describe('SignalZone — the arrival moment', () => {
  // A non-safety lead. The file's default `liveFinding` is deliberately an
  // intake_decline (priorityClass 'safety'), which is the bypass case below — so a
  // benign finding has to be built for the cases where the sweep is SUPPOSED to run.
  const benignFinding: CachedFinding = {
    rank: 0,
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
      long: {
        count: 7,
        medianHoursSinceFeeding: 9,
        lastTwoEligible: false,
        feedingFormsInEvidence: [],
        clockBand: { startLocalHour: 2, windowHours: 6 },
        clockCount: 6,
      },
    },
  };

  // A reassuring trial_response the B-789 gate drops on a not-eating record. Insight-
  // class, so the safety gate does not see it — which is the whole point of the case.
  const trialResponseFinding: CachedFinding = {
    rank: 1,
    text: 'A trial sentence about vomiting counts.',
    finding: {
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber: 20,
      targetDurationDays: 56,
      trialLoggedDays: 18,
      baselineLoggedDays: 40,
      baselineWindowDays: 49,
      pooledTrialCount: 4,
      pooledBaselineCount: 20,
      rapid: { trial: 4, baseline: 8 },
      long: { trial: 0, baseline: 7 },
      rapidWindowMinutes: 30,
      longGapHours: 6,
      treatShare: { trial: 0.1, baseline: 0.8 },
      mealsPerDay: { trial: 4, baseline: 2 },
      comparisonDirection: 'fewer_during_trial',
      densityComparable: true,
      trialWindowDays: 20,
    },
  };

  const HAPTIC_AT_MS = 900;
  const WHOLE_MOMENT_MS = 1400;

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    // Inside act(): draining the queue lands the animation's completion callback, which
    // sets state on a still-mounted zone.
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  /** Settle the marker read (a real promise) while fake timers are installed. */
  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /**
   * Mount in a settled BUILDING state, then transition to live — the arrival's actual
   * trigger. Returns the render result so a test can inspect the card mid-moment.
   */
  async function arrive(
    findings: CachedFinding[],
    petId = 'pet-1',
    suppress = false,
    petName = 'Nyx',
  ) {
    mockUseSignal.mockReturnValue(signalState({ petId, petName, displayState: 'building' }));
    const view = render(<SignalZone withholdFallingVomit={suppress} />);
    await flush();
    mockUseSignal.mockReturnValue(signalState({ petId, petName, displayState: 'live', findings }));
    await act(async () => {
      view.rerender(<SignalZone withholdFallingVomit={suppress} />);
    });
    await flush();
    return view;
  }

  it('plays on a building → live transition with a real finding', async () => {
    const view = await arrive([benignFinding]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(mockInsightArrival).toHaveBeenCalledTimes(1);
  });

  it('spends the marker — once per pet, EVER', async () => {
    await arrive([benignFinding]);
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
    expect(mockMarkArrivalPlayed).toHaveBeenCalledTimes(1);
  });

  it('does not play again for a pet whose marker is already set', async () => {
    // The next launch, the next insight, the next year: the marker is the whole
    // "once, ever" promise, and a spent one means silence.
    mockHasPlayedArrival.mockResolvedValue(true);
    const view = await arrive([benignFinding]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    // And it is not re-marked — nothing was spent, because nothing played.
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
  });

  it('a second transition in the same session does not replay it', async () => {
    // The marker read answers from storage, which the first play has not yet changed in
    // this mock — so this is really asserting the in-memory latch, i.e. that the zone
    // does not lean on a round-trip it has no reason to trust mid-session.
    const view = await arrive([benignFinding]);
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).toHaveBeenCalledTimes(1);

    mockUseSignal.mockReturnValue(signalState({ petId: 'pet-1', displayState: 'building' }));
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).toHaveBeenCalledTimes(1);
    expect(mockMarkArrivalPlayed).toHaveBeenCalledTimes(1);
  });

  // ── The safety bypass (§4 / S1) ────────────────────────────────────────────────
  it('NEVER sweeps for a safety finding — the card appears plainly, and the marker is spent anyway', async () => {
    // `liveFinding` is an intake_decline: priorityClass 'safety'. Plainness is the
    // severity signal, so the concern arrives with no wash and no tap — and the pet has
    // still spent its moment, because the alternative is saving the celebration for the
    // one owner whose record opened badly.
    const view = await arrive([liveFinding]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
  });

  it('a safety-led first arrival plays NO haptic — the D7 exemption’s whole justification', async () => {
    // This is the test the `haptics-guard-ok` comment in SignalZone.tsx points at. The
    // import of a haptic verb into a safety surface is only defensible while this holds.
    await arrive([liveFinding, benignFinding]);
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
  });

  it('withholds the sweep when a safety finding sits BELOW the lead, not only at rank 0', async () => {
    // §4 says "leads the safety band"; the gate is any safety-class finding in the set.
    // Ranking is decided server-side, and a sweep over a card that carries a concern
    // anywhere is still decoration over concern. This reading can only withhold.
    const benignLead: CachedFinding = { ...benignFinding, rank: 0 };
    const safetyBelow: CachedFinding = { ...liveFinding, rank: 1 };
    const view = await arrive([benignLead, safetyBelow]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
  });

  // ── Reduced motion (§4) ────────────────────────────────────────────────────────
  it('reduced motion: no sweep, but the tap still fires — touch is not motion', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const view = await arrive([benignFinding]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(mockInsightArrival).toHaveBeenCalledTimes(1);
    // The moment is still spent: the owner got the arrival, in the register they asked for.
    expect(mockMarkArrivalPlayed).toHaveBeenCalledWith('pet-1');
  });

  it('reduced motion: the card still renders its live content (the static frame is the card)', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const view = await arrive([benignFinding]);
    expect(headlines(view)).toEqual(['Vomiting soon or long after meals']);
  });

  // ── What is NOT an arrival ─────────────────────────────────────────────────────
  it('a cold mount that is ALREADY live is not an arrival — nothing arrived', async () => {
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', displayState: 'live', findings: [benignFinding] }),
    );
    const view = render(<SignalZone />);
    await flush();
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
  });

  it('a slow first read is not an arrival — latency must never mint the moment', async () => {
    // isLoading true holds the state UNSETTLED even as the zone renders a building
    // frame (the B-734 skeleton can time out into one). Without that, an offline or
    // slow cold read would fire the app's one sanctioned animation on network weather.
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', displayState: 'building', isLoading: true }),
    );
    const view = render(<SignalZone />);
    await flush();
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
  });

  it('a pet SWITCH is not a transition — pet A building then pet B live plays nothing', async () => {
    // The multi-pet leak this pairing exists to stop: leaving one pet mid-build and
    // landing on another whose insight is already cached is two pets' states, not an
    // arrival — and it would spend pet B's once-ever moment on a screen change.
    mockUseSignal.mockReturnValue(signalState({ petId: 'pet-A', displayState: 'building' }));
    const view = render(<SignalZone />);
    await flush();
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-B', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
  });

  it('a pet switch MID-ARRIVAL clears the wash — no frozen band parked on the next card', async () => {
    // Halting the animation is not enough on its own: leaving the moment "playing"
    // keeps the band mounted at whatever value the sweep had reached, and the owner
    // lands on the next pet's card to find a stripe of light stuck across it.
    const view = await arrive([benignFinding], 'pet-1');
    expect(view.queryByTestId('signal-arrival-wash')).toBeTruthy();

    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-2', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
  });

  it('does NOT celebrate a live state whose only card is suppressed — the not-eating cat', async () => {
    // The CUL-527 residual, and the sharpest case in this feature. A `fewer_during_trial`
    // trial_response is dropped by the B-789 safety suppression, but `displayState` is
    // derived upstream over the FULL set — so the state reads 'live' with an EMPTY stack.
    // Counting `findings.length` would sweep a blank card with a gold wash and a
    // tap, and burn the marker doing it, for the one owner whose cat is refusing food.
    // The finding is insight-class, so the safety gate does not catch this; counting what
    // RENDERS is what catches it.
    const suppressedSole: CachedFinding = {
      ...trialResponseFinding,
      rank: 0,
    };
    const view = await arrive([suppressedSole], 'pet-1', true);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    // And the marker is NOT spent — this pet's real first insight still gets its moment.
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
  });

  // CUL-1360: the arrival counts what RENDERS, and the trial anchor is part of that. The
  // sole card is a falling trial pair the engine counted over rabbit (its day 20, counted
  // just after midnight today, so rabbit started nineteen days ago); Home's trial facts say
  // chicken, started today. The stack drops it, so the arrival has nothing to celebrate.
  describe('a sole card counted over a trial since replaced', () => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const counted = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 30).toISOString();
    const chicken = {
      petId: 'pet-1',
      nowMs: Date.now(),
      trial: {
        id: 'trial-chicken',
        status: 'active',
        startedAt: todayKey,
        endedAt: null,
        targetDurationDays: 56,
        foodLabel: null,
        trialProtein: { protein: 'chicken', source: 'owner' },
      } as TrialCardTrial,
    };
    async function arriveAnchored(signalTrial: typeof chicken | null) {
      const sole: CachedFinding = { ...trialResponseFinding, rank: 0 };
      mockUseSignal.mockReturnValue(signalState({ petId: 'pet-1', displayState: 'building' }));
      const view = render(<SignalZone signalTrial={signalTrial} />);
      await flush();
      mockUseSignal.mockReturnValue(
        signalState({ petId: 'pet-1', displayState: 'live', findings: [sole], generatedAt: counted }),
      );
      await act(async () => {
        view.rerender(<SignalZone signalTrial={signalTrial} />);
      });
      await flush();
      return view;
    }

    it('control: with no anchor the same sole card arrives (it was available to leak)', async () => {
      const view = await arriveAnchored(null);
      expect(view.queryByTestId('signal-arrival-wash')).toBeTruthy();
    });

    it('with the anchor there is no arrival and the marker is not spent', async () => {
      const view = await arriveAnchored(chicken);
      expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
      act(() => {
        jest.advanceTimersByTime(WHOLE_MOMENT_MS);
      });
      expect(mockInsightArrival).not.toHaveBeenCalled();
      expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
    });
  });

  it('still celebrates when the suppressed card is not the only one', async () => {
    // The gate must count what renders, not simply bail whenever suppression is on.
    const view = await arrive([benignFinding, trialResponseFinding], 'pet-1', true);
    expect(view.queryByTestId('signal-arrival-wash')).toBeTruthy();
  });

  it('an empty live set is not an arrival — there is nothing to celebrate', async () => {
    const view = await arrive([]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
  });

  // ── CUL-636 — the moment's screen-reader line ─────────────────────────────────
  //
  // The moment shipped as ~1.2s of motion plus one soft tap and ZERO strings, so an
  // owner on VoiceOver got a congratulatory buzz with nothing explaining it. Every case
  // below is really one claim: the sentence goes exactly where the tap goes, and nowhere
  // else — so it inherits the safety bypass and every other gate for free.
  function spyAnnounce() {
    return jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  }

  it('speaks the arrival at the tap — the buzz finally has its sentence', async () => {
    const announce = spyAnnounce();
    await arrive([benignFinding]);
    // NOT at 0ms. Pairing the utterance with the tap is what makes the moment one beat
    // instead of two, and it is what lets `halt()` cancel both — see the pet-switch case
    // below, which is the half a 0ms announcement would have to re-earn with its own guard.
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(announce).toHaveBeenCalledTimes(1);
    // Derived from the copy module, never a literal here — the same rule that keeps a
    // completion card from being handed a display string it could over-claim with.
    expect(announce).toHaveBeenCalledWith(arrivalAnnouncementCopy('Nyx'));
    announce.mockRestore();
  });

  it('announces on ANDROID too — the arrival has no live region to cover it', async () => {
    // The two announce sites above (AckLine, TextField) gate to iOS *because* each pairs
    // with an `accessibilityLiveRegion` node that already speaks on Android. This one has
    // no such node, so copying their platform check would ship the identical defect to
    // TalkBack. This test exists so that "fix" fails instead of passing quietly.
    const prevOS = Platform.OS;
    Platform.OS = 'android';
    const announce = spyAnnounce();
    // try/finally, not a trailing restore: a bare one is skipped when the expect throws,
    // and the leaked platform then reds an unrelated test further down. Found by mutating
    // the iOS gate back in — the mutation pass earning its keep on the guard, not the source.
    try {
      await arrive([benignFinding]);
      act(() => {
        jest.advanceTimersByTime(HAPTIC_AT_MS);
      });
      expect(announce).toHaveBeenCalledWith(arrivalAnnouncementCopy('Nyx'));
    } finally {
      announce.mockRestore();
      Platform.OS = prevOS;
    }
  });

  it('names the pet whose moment it is — not a hardcoded one', async () => {
    // Every other fixture in this block is called 'Nyx', which made the whole suite blind
    // to the CUL-574 class: hardcoding `arrivalAnnouncementCopy('Nyx')` in the source
    // passed all 53 tests. A guard whose fixtures make two different behaviours identical
    // is not a guard, so this case is the one that gives the others their meaning.
    const announce = spyAnnounce();
    await arrive([benignFinding], 'pet-2', false, 'Mochi');
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(announce).toHaveBeenCalledWith(arrivalAnnouncementCopy('Mochi'));
    announce.mockRestore();
  });

  it('pins the name at the point the pet was verified, so a mid-moment rename cannot move it', async () => {
    // Pinned deliberately, and the reason is a proof rather than a preference: `arrivedFor`
    // is read immediately after the `activePet.current !== petId` guard, so it provably
    // belongs to the pet whose marker was just spent. Reading `name.current` fresh inside
    // the timer instead would re-open a window that guard closes — the refs are written
    // during render while the halt runs in an effect, so a fire landing between the two
    // would speak the NEW pet's name over the old pet's moment. That is the wrong-pet
    // class; a stale name after a rename is cosmetic and the card corrects it. Trading a
    // proof for a cosmetic gain is the wrong direction, so this pins the trade.
    const announce = spyAnnounce();
    const view = await arrive([benignFinding], 'pet-1', false, 'Nyx');
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', petName: 'Renamed', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(announce).toHaveBeenCalledWith(arrivalAnnouncementCopy('Nyx'));
    announce.mockRestore();
  });

  it('says NOTHING on the safety path — silence is the severity signal on every channel', async () => {
    // The bypass is not a visual rule that a11y is exempt from. §4 draws nothing for a
    // safety-led first finding deliberately, and an announcement would be a celebration
    // of a concern arriving through the one channel that cannot see it was withheld.
    // Whether that owner should get a line at all is CUL-638, a PM copy round. The concern
    // ITSELF is spoken on a focused Home since PMD-21 (CUL-1566), through Home's focus check;
    // this zone is mounted with no provider, so the celebration's silence is what is pinned
    // here (`SignalZone.safetySpeech.test.tsx` holds the spoken half).
    const announce = spyAnnounce();
    await arrive([liveFinding]);
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('says nothing when nothing arrived — a cold mount that is already live', async () => {
    const announce = spyAnnounce();
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-1', displayState: 'live', findings: [benignFinding] }),
    );
    render(<SignalZone />);
    await flush();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('still speaks under reduced motion — speech is not motion, any more than touch is', async () => {
    const announce = spyAnnounce();
    mockUseReducedMotion.mockReturnValue(true);
    await arrive([benignFinding]);
    act(() => {
      jest.advanceTimersByTime(HAPTIC_AT_MS);
    });
    expect(announce).toHaveBeenCalledWith(arrivalAnnouncementCopy('Nyx'));
    announce.mockRestore();
  });

  it('a pet switch MID-ARRIVAL cancels the sentence with the tap', async () => {
    // `halt()` clears the one timer both ride, so the moment goes quiet on both channels
    // together. Without that, the announcement would land AFTER the switch — naming a pet
    // whose card is no longer on screen, which is the wrong-pet class arriving by audio.
    const announce = spyAnnounce();
    const view = await arrive([benignFinding], 'pet-1');
    mockUseSignal.mockReturnValue(
      signalState({ petId: 'pet-2', displayState: 'live', findings: [benignFinding] }),
    );
    await act(async () => {
      view.rerender(<SignalZone />);
    });
    await flush();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('an unreadable marker fails toward silence, never toward a loop', async () => {
    // A device whose AsyncStorage is broken answers "never played" forever. Treating
    // that as unplayed would replay the sweep on every transition — looping chrome,
    // which §3 bans outright. One missed moment is the cheaper failure.
    mockHasPlayedArrival.mockRejectedValue(new Error('storage unavailable'));
    const view = await arrive([benignFinding]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
  });

  it('CUL-786: a stood-down line is NOT a finding — a marker-only transition plays nothing and spends nothing', async () => {
    // The break this pins: a first-ever SAFETY card withholds the moment without spending
    // it (the safety bypass above marks the pet, but an unreadable/unset marker plus a
    // safety-led set can leave it unspent). When that card later stands down, the set
    // holds ONE insight-class entry and no safety finding — exactly the shape that would
    // otherwise play the once-ever celebration over a sentence about absence.
    const view = await arrive([stoodDownEntry()]);
    expect(view.queryByTestId('signal-arrival-wash')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(WHOLE_MOMENT_MS);
    });
    expect(mockInsightArrival).not.toHaveBeenCalled();
    expect(mockMarkArrivalPlayed).not.toHaveBeenCalled();
    // …and the line itself still rendered — nothing was hidden to achieve the silence.
    expect(view.getByText(STOOD_DOWN_TEXT)).toBeTruthy();
  });
});

// ── CUL-786 — the labeled stand-down (Signal fold v1.1-a) ─────────────────────────
//
// One calm line in the chronicity card's former slot, rendered from the server's text: no
// rail, no control, no canvas, and gone after seven days even if the cache never
// regenerates. Every rule here is about what the line is NOT — it is a sentence about
// absence, and the surface must not dress it as a finding.
const STOOD_DOWN_TEXT =
  "No vomiting logged for Nyx in 14 days — this card has stood down. That isn't an all-clear. If you haven't been, the visit is still worth booking.";

function stoodDownEntry(over: Partial<CachedFinding> = {}, mintedDaysAgo = 2): CachedFinding {
  return {
    rank: 0,
    text: STOOD_DOWN_TEXT,
    finding: {
      type: 'stood_down',
      priorityClass: 'insight',
      symptomType: 'vomit',
      recencyDays: 14,
      tier: 'firm',
      lastEpisodeIso: new Date(Date.now() - (14 + mintedDaysAgo) * 86_400_000).toISOString(),
      stoodDownAt: new Date(Date.now() - mintedDaysAgo * 86_400_000).toISOString(),
      formerRank: 0,
    },
    ...over,
  };
}

describe('SignalZone — the labeled stand-down line (CUL-786)', () => {
  const benignBelow: CachedFinding = {
    rank: 1,
    text: 'A benign card sentence below the line.',
    finding: {
      type: 'postprandial_timing',
      priorityClass: 'insight',
      symptomType: 'vomit',
      rapidCount: 4,
      eligibleCount: 12,
      totalEpisodes: 20,
      rapidWindowMinutes: 30,
      medianMinutesSinceFeeding: 14,
      windowDays: 60,
      lastTwoEligibleRapid: false,
      feedingFormsInEvidence: [],
      eligibleMinutes: [10, 12, 14, 20, 45, 60, 90, 120, 150, 180, 200, 240],
      timingReliable: true,
    },
  };

  it('renders the server line in its former slot, above the card that used to sit below it', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [benignBelow, stoodDownEntry()] }),
    );
    const view = render(<SignalZone />);
    const { getByText, getByLabelText, toJSON } = view;
    expect(getByText(STOOD_DOWN_TEXT)).toBeTruthy();
    expect(headlines(view)).toEqual(['Vomiting soon after meals']);
    // Order = rank: the line (rank 0) precedes the benign card (rank 1) in the tree.
    const serialized = JSON.stringify(toJSON());
    expect(serialized.indexOf(STOOD_DOWN_TEXT)).toBeGreaterThanOrEqual(0);
    expect(serialized.indexOf(STOOD_DOWN_TEXT)).toBeLessThan(serialized.indexOf('Vomiting soon after meals'));
    // Announced as one plain sentence — not a button, nothing to expand.
    const line = getByLabelText(STOOD_DOWN_TEXT);
    expect(line.props.accessibilityRole).toBe('text');
    expect(line.props.accessibilityState).toBeUndefined();
  });

  it('wears no rail — the row is a plain View with no rail sibling', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [stoodDownEntry()] }));
    const { getByLabelText } = render(<SignalZone />);
    const line = getByLabelText(STOOD_DOWN_TEXT);
    // A card's rail is a `View` sibling of the content with the rail width; the line's row has
    // exactly one child (its ThemedText) and no rail.
    expect(line.children).toHaveLength(1);
    const flat = Array.isArray(line.props.style) ? Object.assign({}, ...line.props.style) : line.props.style;
    expect(flat.paddingLeft).toBe(3 + theme.space2);
  });

  it('renders alone when the stood-down card was the only finding — the live register, one line', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [stoodDownEntry()] }));
    const { getByText, queryByText } = render(<SignalZone />);
    expect(getByText(STOOD_DOWN_TEXT)).toBeTruthy();
    expect(queryByText(NO_PATTERN_HEADLINE)).toBeNull();
  });

  it('expires seven days after it was minted, even when the cache never regenerated', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [stoodDownEntry({}, 7), benignBelow] }),
    );
    const view = render(<SignalZone />);
    expect(view.queryByText(STOOD_DOWN_TEXT)).toBeNull();
    expect(headlines(view)).toEqual(['Vomiting soon after meals']);
  });

  it('the day before expiry, it is still there', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [stoodDownEntry({}, 6)] }),
    );
    expect(render(<SignalZone />).getByText(STOOD_DOWN_TEXT)).toBeTruthy();
  });

  it('the lead canvas goes to the first CARD — the line never wears it, and never withholds it', () => {
    // The engine splices a marker below every safety finding, so the only card a line can
    // precede is a benign one that would have led the moment the concern went. Binding the
    // canvas to the array index demoted that card to compact for a week (adversarial pass,
    // 2026-09-03).
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [stoodDownEntry(), benignBelow] }),
    );
    const { getByText, getByLabelText, getByTestId } = render(<SignalZone />);
    // The benign card is a row (a timing lead takes the row face, CUL-1218) in the LEAD
    // register: its headline wears the display face.
    const headline = getByTestId('signal-row-headline');
    expect(headline.props.children).toBe('Vomiting soon after meals');
    const flat = StyleSheet.flatten(headline.props.style) as { fontFamily?: string; fontSize?: number };
    expect(flat.fontFamily).toBe(theme.fontDisplay);
    // …and the line itself is plain secondary type, never the display face.
    const line = getByText(STOOD_DOWN_TEXT);
    const lineFlat = StyleSheet.flatten(line.props.style) as { fontFamily?: string; fontSize?: number };
    expect(lineFlat.fontSize).toBe(theme.textSM);
    expect(lineFlat.fontFamily).not.toBe(theme.fontDisplay);
    expect(getByLabelText(STOOD_DOWN_TEXT)).toBeTruthy();
  });
});
