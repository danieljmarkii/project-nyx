// SignalZone — the Signal/Home surface after the GA of the design uplift + the Signals-v2
// lanes (CUL-547 + CUL-548). The uplift E1/E2 empty states, the SR-3 register (receded
// chrome + acknowledgment line), the CUL-14 watching system, and the v2 story/trial cards
// all render UNCONDITIONALLY now — the beta flags are gone. What stays gated is the B-789
// safety suppression (a reassuring trial_response card over a not-eating record), which is
// a safety gate, not a beta gate.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
// CUL-785: the last-episode date read (useLastEpisodeDates) — an empty record here.
jest.mock('../../lib/db', () => ({
  getDb: () => ({ getAllSync: () => [{ last: null }] }),
}));

const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({
  useSignal: () => mockUseSignal(),
}));

// The watching-rows hook does a local SQLite read on focus; here we drive its output
// directly. Default [] so the watching block is inert unless a test opts into rows.
const mockUseWatchingRows = jest.fn();
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: (enabled: boolean, dayNumber: number) => mockUseWatchingRows(enabled, dayNumber),
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

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { SignalZone } from './SignalZone';
import { theme } from '../../constants/theme';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, CoverageDiagnostic, TrialResponseFinding } from '../../lib/signal';
import {
  ackUpdatingCopy,
  arrivalAnnouncementCopy,
  buildingHeadline,
  BUILDING_SUB,
  BUILDING_SUB_SPARSE,
  BUILDING_WATCHING_FOR,
  BUILDING_FLOOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  WATCHING_SUB,
  watchingTimingRow,
  watchingChangeRow,
  watchingGapRow,
} from '../../lib/signalCopy';
import type { WatchingRow } from '../../lib/signalWatching';

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
    expiresAt: null,
    answered: true,
    ...over,
  };
}

// The top B-053 coverage diagnostic E2 restyles (an action-carrying one so the
// action arm renders too).
const rateMeals: CoverageDiagnostic = {
  type: 'rate_meals',
  actionability: 'action',
  ratedMeals: 1,
  ratedMealsNeeded: 4,
};

const EM_DASH = '—';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no watching rows, so the watching block never renders unless a test opts in.
  mockUseWatchingRows.mockReturnValue([]);
  mockUseReducedMotion.mockReturnValue(false);
  mockHasPlayedArrival.mockResolvedValue(false);
  mockMarkArrivalPlayed.mockResolvedValue(undefined);
});

// ── SR-2 empty states (E1 building / E2 no_pattern) — now the only empty surface ──
describe('SignalZone — SR-2 empty states', () => {
  it('E1 building: headline + watching-for rows + safety floor', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'building', dayNumber: 3, eventCount: 11 }),
    );
    const { getByText, getByLabelText, getAllByText } = render(<SignalZone />);

    expect(getByLabelText(buildingHeadline('Nyx', 3, 11))).toBeTruthy();
    expect(getByText(BUILDING_SUB)).toBeTruthy();
    for (const row of BUILDING_WATCHING_FOR) expect(getByText(row)).toBeTruthy();
    expect(getByText(BUILDING_FLOOR)).toBeTruthy();

    // The ghost compare shows its two labeled rows with DASHES for counts — never a
    // fabricated number (§6). Two standalone em-dash nodes, one per row.
    expect(getByText('Last week')).toBeTruthy();
    expect(getByText('This week')).toBeTruthy();
    expect(getAllByText(EM_DASH)).toHaveLength(2);
  });

  it('E2 no_pattern: verbatim §9 copy + the top coverage diagnostic', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'no_pattern', coverage: [rateMeals] }),
    );
    const { getByText } = render(<SignalZone />);

    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy();
    expect(getByText(NO_PATTERN_SUB)).toBeTruthy();
    // The B-053 diagnostic renders (restyled) — its why line names the pet.
    expect(getByText(/Nyx's meals aren't rated often enough/)).toBeTruthy();
  });

  it('E1 building: holds the day-count clause back on the pre-read frame (eventCount 0)', () => {
    // The isLoading→building override can render E1 before the local read lands; a real
    // building pet always has ≥1 recent event, so eventCount 0 is the pre-read sentinel —
    // it must NOT flash a fabricated "Day 1 — 0 events so far" (§6 no fabricated numbers).
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'building', dayNumber: 1, eventCount: 0 }),
    );
    const { getByText, queryByText } = render(<SignalZone />);
    expect(getByText("We're getting to know Nyx.")).toBeTruthy(); // the warm lead still renders
    expect(queryByText(/Day \d+ —/)).toBeNull(); // no day-count clause
    expect(queryByText(/0 events/)).toBeNull(); // never a zero count
  });

  it('E2 with no coverage diagnostic: the §9 copy stands alone', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [] }));
    const { getByText } = render(<SignalZone />);
    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy();
    expect(getByText(NO_PATTERN_SUB)).toBeTruthy();
  });
});

// ── CUL-14 — the watching system (per-lane rows with real counts, §4.4 / D5) ──────
describe('SignalZone — CUL-14 watching system', () => {
  // The three mock §05 rows for Nyx-at-12-days (representative). buildWatchingRows +
  // every count/gap predicate is unit-tested in lib/signalWatching.test.ts; here the hook
  // is mocked so the wiring + composition are what's exercised.
  const timingRow: WatchingRow = { key: 'timing', text: watchingTimingRow(4, 6) };
  const changeRow: WatchingRow = { key: 'change', text: watchingChangeRow(2, 2) };
  const gapRow: WatchingRow = { key: 'gap', text: watchingGapRow('vomiting', '6 days, then 3, then 2') };
  const allRows = [timingRow, changeRow, gapRow];

  it('E1 building: the real-count rows replace the ghost watching-for list; the headline + floor stay', () => {
    mockUseWatchingRows.mockReturnValue(allRows);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', dayNumber: 12, eventCount: 31 }));
    const { getByText, getByLabelText, queryByText, getAllByText } = render(<SignalZone />);

    expect(getByLabelText(buildingHeadline('Nyx', 12, 31))).toBeTruthy(); // headline stays
    expect(queryByText(BUILDING_SUB)).toBeNull(); // ghost sub replaced
    for (const row of BUILDING_WATCHING_FOR) expect(queryByText(row)).toBeNull(); // ghost list replaced
    expect(getByText(WATCHING_SUB)).toBeTruthy();
    for (const r of allRows) expect(getByText(r.text)).toBeTruthy();
    expect(getAllByText(BUILDING_FLOOR)).toHaveLength(1); // no duplicate floor
  });

  it('the gap row is escalate-only — it renders only when the hook supplies it', () => {
    mockUseWatchingRows.mockReturnValue([timingRow, changeRow]); // no gap row
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    expect(render(<SignalZone />).queryByText(/Gaps between/)).toBeNull();
  });

  it('E2 no_pattern: the watching rows compose in additively beside the §9 copy + coverage', () => {
    mockUseWatchingRows.mockReturnValue([gapRow]); // mature record: only the gap lane escalates
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [rateMeals] }));
    const { getByText } = render(<SignalZone />);
    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy(); // E2 copy intact
    expect(getByText(/Nyx's meals aren't rated often enough/)).toBeTruthy(); // coverage intact
    expect(getByText(gapRow.text)).toBeTruthy(); // gap row added under them
    expect(getByText(BUILDING_FLOOR)).toBeTruthy();
  });

  it('no qualifying row (hook returns []): the frame renders its normal ghost content, no empty block', () => {
    mockUseWatchingRows.mockReturnValue([]);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText } = render(<SignalZone />);
    expect(queryByText(WATCHING_SUB)).toBeNull(); // no sub with no rows
    for (const row of BUILDING_WATCHING_FOR) expect(getByText(row)).toBeTruthy(); // ghost list intact
  });

  it('gates the hook on an empty state — enabled is false in the live register (no watching read)', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    render(<SignalZone />);
    expect(mockUseWatchingRows.mock.calls.at(-1)?.[0]).toBe(false);
  });

  // ── B-769 (CUL-29, PM-ruled D3a/D4): the gap row's own register ─────────────────
  describe('the gap row leaves the "still needs" umbrella (D3a)', () => {
    it('a lone gap row renders WITHOUT the WATCHING_SUB umbrella (an escalation is not an unmet need)', () => {
      mockUseWatchingRows.mockReturnValue([gapRow]);
      mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [rateMeals] }));
      const { getByText, queryByText } = render(<SignalZone />);
      expect(getByText(gapRow.text)).toBeTruthy();
      expect(queryByText(WATCHING_SUB)).toBeNull(); // the umbrella never renders for gap alone
      expect(getByText(BUILDING_FLOOR)).toBeTruthy(); // the safety floor still travels
    });

    it('the gap row renders ABOVE the coverage nag on no_pattern (Principle 3 — the escalation leads)', () => {
      mockUseWatchingRows.mockReturnValue(allRows);
      mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [rateMeals] }));
      const tree = JSON.stringify(render(<SignalZone />).toJSON());
      const gapAt = tree.indexOf('are getting shorter');
      const coverageAt = tree.indexOf("meals aren't rated often enough");
      const needsAt = tree.indexOf(WATCHING_SUB);
      expect(gapAt).toBeGreaterThan(-1);
      expect(coverageAt).toBeGreaterThan(-1);
      expect(needsAt).toBeGreaterThan(-1);
      expect(gapAt).toBeLessThan(coverageAt); // escalation above the data-quality nag
      expect(coverageAt).toBeLessThan(needsAt); // needs rows keep their place below
    });

    it('the gap row leads the watching area in the E1 frame too', () => {
      mockUseWatchingRows.mockReturnValue(allRows);
      mockUseSignal.mockReturnValue(signalState({ displayState: 'building', dayNumber: 12, eventCount: 31 }));
      const tree = JSON.stringify(render(<SignalZone />).toJSON());
      expect(tree.indexOf('are getting shorter')).toBeLessThan(tree.indexOf(WATCHING_SUB));
    });
  });
});

// ── B-734 (CUL-72) the load window, B-735 (CUL-430) the sparse sub ────────────────
describe('SignalZone — B-734 first-load window (content-shaped skeleton, never the heavy E1)', () => {
  it('loading renders the content-shaped skeleton, none of the E1 copy', () => {
    // The pet-switch reset state: findings cleared, localCtx at the sentinel, read in flight.
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'stale', isLoading: true, findings: [], dayNumber: 1, eventCount: 0 }),
    );
    const { getByTestId, queryByText } = render(<SignalZone />);
    expect(getByTestId('signal-loading-skeleton')).toBeTruthy();
    expect(queryByText(/getting to know/)).toBeNull(); // no E1 headline flash
    expect(queryByText(BUILDING_SUB)).toBeNull();
    expect(queryByText(BUILDING_FLOOR)).toBeNull();
  });

  it('the watching hook is disabled while loading (no read keyed on the sentinel day count)', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'stale', isLoading: true, findings: [], dayNumber: 1, eventCount: 0 }),
    );
    render(<SignalZone />);
    expect(mockUseWatchingRows.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it('the skeleton is TIME-BOXED — a hung read falls through to the derived state and re-enables the watching read (adversarial ④)', () => {
    jest.useFakeTimers();
    try {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'building', isLoading: true, findings: [], dayNumber: 1, eventCount: 0 }),
      );
      const view = render(<SignalZone />);
      expect(view.getByTestId('signal-loading-skeleton')).toBeTruthy();
      expect(mockUseWatchingRows.mock.calls.at(-1)?.[0]).toBe(false); // suppressed only while the skeleton shows
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      // Past the box: the honestly-derived state renders and the escalate-only watching
      // read is live again — a hung network read can never silence the gap row for good.
      expect(view.queryByTestId('signal-loading-skeleton')).toBeNull();
      expect(mockUseWatchingRows.mock.calls.at(-1)?.[0]).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('once the read lands (isLoading false), the real state renders — no lingering skeleton', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'building', isLoading: false, dayNumber: 3, eventCount: 11 }),
    );
    const { queryByTestId, getByLabelText } = render(<SignalZone />);
    expect(queryByTestId('signal-loading-skeleton')).toBeNull();
    expect(getByLabelText(buildingHeadline('Nyx', 3, 11))).toBeTruthy();
  });
});

describe('SignalZone — B-735 sparse-logger E1 sub (D5a)', () => {
  it('day ≤ 7 keeps the first-week sub; day > 7 swaps to the events-not-days framing', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', dayNumber: 3, eventCount: 11 }));
    const early = render(<SignalZone />);
    expect(early.getByText(BUILDING_SUB)).toBeTruthy();
    expect(early.queryByText(BUILDING_SUB_SPARSE)).toBeNull();

    // Sam's grazing cat: day 24, 6 events — "Day 24" must never sit above "within the
    // first week" (the B-735 dissonance).
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', dayNumber: 24, eventCount: 6 }));
    const sparse = render(<SignalZone />);
    expect(sparse.getByLabelText(buildingHeadline('Nyx', 24, 6))).toBeTruthy();
    expect(sparse.getByText(BUILDING_SUB_SPARSE)).toBeTruthy();
    expect(sparse.queryByText(BUILDING_SUB)).toBeNull();
  });
});

// ── SR-3 (B-721) — the register: acknowledgment line + receded chrome ─────────────
describe('SignalZone — SR-3 acknowledgment line (§5.3)', () => {
  it('shows the "Noted — updating …" line when a regen is in flight in the live register', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    const on = render(<SignalZone />);
    expect(on.getByText(ackUpdatingCopy('Nyx'))).toBeTruthy();
    // The findings stay readable throughout (never blanked / replaced by a spinner).
    expect(on.getByText('A live finding sentence.')).toBeTruthy();
  });

  it('does not render the ack line when nothing is in flight (not acknowledging)', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: false }),
    );
    expect(render(<SignalZone />).queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
  });

  it('is scoped to the live register — no ack over the E1 building state (E1 owns that reassurance)', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building', acknowledging: true }));
    const view = render(<SignalZone />);
    expect(view.queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
    // E1 renders intact (the empty state is never blanked by the ack machinery).
    expect(view.getByText(BUILDING_SUB)).toBeTruthy();
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

  it('recedes the footer doorway to the tertiary tier (AA-safe recede)', () => {
    // The mock dims the footer to a lighter teal, but that fails AA on white (~1.6:1) —
    // so the doorway recedes to the same grey tier as the label (≥4.5:1).
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText(/See all of Nyx's patterns/)).toHaveStyle({
      color: theme.colorTextTertiary,
    });
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
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('A live finding sentence.')).toBeTruthy();
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

  it('renders the trial card in the stack alongside the other findings', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }));
    const view = render(<SignalZone />);
    expect(view.queryByText('Day 20 of 56')).toBeTruthy();
    expect(view.queryByText('A live finding sentence.')).toBeTruthy();
  });

  // ── B-789 (§5.2) — the not-eating suppression of the reassuring trial_response card ──
  // Home passes `suppressTrialResponse` (computed from the same `trialInput` the strip
  // withholds its vomit line on, `isAnimalNotEating`) so a reassuring "0 vomiting · was 20"
  // never renders over a day-1 diet-refusal cat the relative-decline lane can't see. This is
  // SUPPRESSION, not reorder: the card must not render at all, even below a safety card.
  describe('B-789 suppression on a not-eating record', () => {
    it('drops the trial card when suppressTrialResponse is set; keeps the other findings', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }),
      );
      const view = render(<SignalZone suppressTrialResponse />);
      // The trial card is gone (its "Day 20 of 56" face is not rendered)…
      expect(view.queryByText('Day 20 of 56')).toBeNull();
      // …but the co-finding still renders — no stray gap where the card was.
      expect(view.queryByText('A live finding sentence.')).toBeTruthy();
    });

    it('renders the trial card when suppressTrialResponse is false (the eating trial)', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }),
      );
      const view = render(<SignalZone suppressTrialResponse={false} />);
      expect(view.queryByText('Day 20 of 56')).toBeTruthy();
      expect(view.queryByText('A live finding sentence.')).toBeTruthy();
    });

    it('defaults to not suppressing — a non-Home caller (no prop) renders the card', () => {
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }),
      );
      expect(render(<SignalZone />).queryByText('Day 20 of 56')).toBeTruthy();
    });

    // Direction-aware (adversarial-reviewer): only the REASSURING `fewer_during_trial` card is the
    // §5.2 hazard. A `more_during_trial` card is a vomiting ESCALATION during the trial — on a
    // not-eating cat that is a concern to KEEP, not a reassurance to hide. It must survive the
    // suppression (dropping it would lose the only card carrying the rise in the ④/⑦ dead zone).
    it('keeps a more_during_trial ESCALATION card even when suppressTrialResponse is set', () => {
      const moreFinding: TrialResponseFinding = {
        ...(trialFinding.finding as TrialResponseFinding),
        comparisonDirection: 'more_during_trial',
        pooledTrialCount: 8,
        pooledBaselineCount: 2,
      };
      const moreTrialFinding: CachedFinding = { ...trialFinding, finding: moreFinding };
      mockUseSignal.mockReturnValue(
        signalState({ displayState: 'live', findings: [liveFinding, moreTrialFinding] }),
      );
      const view = render(<SignalZone suppressTrialResponse />);
      expect(view.queryByText('Day 20 of 56')).toBeTruthy();
      expect(view.queryByText('A live finding sentence.')).toBeTruthy();
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
    const view = render(<SignalZone suppressTrialResponse={suppress} />);
    await flush();
    mockUseSignal.mockReturnValue(signalState({ petId, petName, displayState: 'live', findings }));
    await act(async () => {
      view.rerender(<SignalZone suppressTrialResponse={suppress} />);
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
    expect(view.queryByText('Timing pattern')).toBeTruthy();
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
    // Counting `findings.length` would sweep a blank card with a gold wash and a success
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
    // Whether that owner should get a line at all is CUL-638, a PM copy round.
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
    const { getByText, getByLabelText, toJSON } = render(<SignalZone />);
    expect(getByText(STOOD_DOWN_TEXT)).toBeTruthy();
    expect(getByText(benignBelow.text)).toBeTruthy();
    // Order = rank: the line (rank 0) precedes the benign card (rank 1) in the tree.
    const serialized = JSON.stringify(toJSON());
    expect(serialized.indexOf(STOOD_DOWN_TEXT)).toBeLessThan(serialized.indexOf(benignBelow.text));
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
    const { queryByText, getByText } = render(<SignalZone />);
    expect(queryByText(STOOD_DOWN_TEXT)).toBeNull();
    expect(getByText(benignBelow.text)).toBeTruthy();
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
    // 2026-09-03). Distinct from a fold (DF-7): a folded card still holds its rank as a strip.
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [stoodDownEntry(), benignBelow] }),
    );
    const { getByText, getByLabelText } = render(<SignalZone />);
    const sentence = getByText(benignBelow.text);
    const flat = StyleSheet.flatten(sentence.props.style) as { fontFamily?: string; fontSize?: number };
    expect(flat.fontFamily).toBe(theme.fontDisplay);
    expect(flat.fontSize).toBe(theme.textSignal);
    // …and the line itself is plain secondary type, never the display face.
    const line = getByText(STOOD_DOWN_TEXT);
    const lineFlat = StyleSheet.flatten(line.props.style) as { fontFamily?: string; fontSize?: number };
    expect(lineFlat.fontSize).toBe(theme.textSM);
    expect(lineFlat.fontFamily).not.toBe(theme.fontDisplay);
    expect(getByLabelText(STOOD_DOWN_TEXT)).toBeTruthy();
  });
});
