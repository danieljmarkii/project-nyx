// SignalZone — the Signal/Home surface after the GA of the design uplift + the Signals-v2
// lanes (CUL-547 + CUL-548). The uplift E1/E2 empty states, the SR-3 register (receded
// chrome + acknowledgment line), the CUL-14 watching system, and the v2 story/trial cards
// all render UNCONDITIONALLY now — the beta flags are gone. What stays gated is the B-789
// safety suppression (a reassuring trial_response card over a not-eating record), which is
// a safety gate, not a beta gate.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

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

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SignalZone } from './SignalZone';
import { theme } from '../../constants/theme';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, CoverageDiagnostic, TrialResponseFinding } from '../../lib/signal';
import {
  ackUpdatingCopy,
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
    findings: [],
    coverage: [],
    displayState: 'building',
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    dayNumber: 3,
    eventCount: 11,
    acknowledging: false,
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
