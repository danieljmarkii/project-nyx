// SignalZone — B-721 SR-2: the E1 (building) + E2 (no_pattern) empty-state restyle,
// dark behind `signal_design_v2`. These tests pin the two flag invariants the spec
// makes ACs (§11 / FR-FLAG):
//   • FR-FLAG-2 — flag-OFF renders the shipped states byte-identical (snapshot-pinned).
//   • FR-FLAG-1 — flag-ON renders the new E1/E2 and NONE of the shipped copy (no mix).
// `live` and `stale` are out of SR-2's scope and untouched here (SR-1 owns `live`), so
// they render identically in both worlds and aren't exercised.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({
  useSignal: () => mockUseSignal(),
}));

const mockUseAllowlistFlag = jest.fn();
jest.mock('../../hooks/useAppConfig', () => ({
  useAllowlistFlag: (key: string) => mockUseAllowlistFlag(key),
}));

// FR-FLAG-4 — the render gate is `eligible && optedIn` (the B-712 two-gate rule), so the
// beta opt-in is mocked too. It defaults ON in beforeEach so the flag-ON tests exercise
// the uplift; the two-gate test flips it off to prove eligibility alone never enables it.
const mockUseBetaOptIn = jest.fn();
jest.mock('../../lib/betaFeatures', () => ({
  useBetaOptIn: (key: string) => mockUseBetaOptIn(key),
}));

// CUL-14 — the watching-rows hook is mocked (it does a local SQLite read on focus; here we
// drive its output directly). Default [] so every pre-existing test renders as before and
// the watching block is inert unless a test opts into rows AND signals_v2.
const mockUseWatchingRows = jest.fn();
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: (enabled: boolean, dayNumber: number) => mockUseWatchingRows(enabled, dayNumber),
}));

import { render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SignalZone } from './SignalZone';
import { theme } from '../../constants/theme';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding, CoverageDiagnostic } from '../../lib/signal';
import {
  ackUpdatingCopy,
  buildingIntro,
  noPatternIntro,
  buildingHeadline,
  BUILDING_SUB,
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
    hasUnseenSignal: false,
    dayNumber: 3,
    eventCount: 11,
    acknowledging: false,
    markSeen: jest.fn(),
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
  mockUseAllowlistFlag.mockReturnValue(false);
  // Default opted-in, so the flag-ON describe's `eligible && optedIn` resolves on the
  // allowlist alone (as it did before FR-FLAG-4). The two-gate test overrides this.
  mockUseBetaOptIn.mockReturnValue(true);
  // CUL-14 default: no watching rows, so the watching block never renders unless a test
  // opts in. Keeps every pre-existing E1/E2 assertion (and its snapshot) unchanged.
  mockUseWatchingRows.mockReturnValue([]);
});

describe('SignalZone — flag OFF (shipped surface byte-identical, FR-FLAG-2)', () => {
  it('building renders the shipped ghost previews, not the new E1', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText, queryByLabelText, toJSON } = render(<SignalZone />);

    expect(getByText(buildingIntro('Nyx'))).toBeTruthy();
    expect(getByText('What the signal looks like:')).toBeTruthy();
    // No part of the new E1 surface leaks when the flag is off.
    expect(queryByLabelText(buildingHeadline('Nyx', 3, 11))).toBeNull();
    expect(queryByText(BUILDING_FLOOR)).toBeNull();
    expect(toJSON()).toMatchSnapshot();
  });

  it('no_pattern renders the shipped intro, not the new E2', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern' }));
    const { getByText, queryByText, toJSON } = render(<SignalZone />);

    expect(getByText(noPatternIntro('Nyx'))).toBeTruthy();
    expect(queryByText(NO_PATTERN_HEADLINE)).toBeNull();
    expect(queryByText(NO_PATTERN_SUB)).toBeNull();
    expect(toJSON()).toMatchSnapshot();
  });

  it('the live register renders the shipped chrome byte-identical — no ack, full-accent footer, prominent label (FR-FLAG-2, SR-3)', () => {
    // Even mid-regen (acknowledging true), flag-off shows none of SR-3's register: no ack
    // line, the footer at full accent, the label at its shipped secondary tone.
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    const { getByText, queryByText, toJSON } = render(<SignalZone />);
    expect(queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
    expect(getByText('Signal')).toHaveStyle({ color: theme.colorTextSecondary });
    expect(getByText(/See all of Nyx's patterns/)).toHaveStyle({ color: theme.colorAccent });
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('SignalZone — flag ON (E1/E2 restyle, FR-FLAG-1 no mix)', () => {
  beforeEach(() => mockUseAllowlistFlag.mockReturnValue(true));

  it('gates on exactly the signal_design_v2 flag', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    render(<SignalZone />);
    expect(mockUseAllowlistFlag).toHaveBeenCalledWith('signal_design_v2');
  });

  it('also requires the beta opt-in — eligible but opted-OUT renders the shipped surface (FR-FLAG-4 two-gate)', () => {
    // Eligible (allowlist true from beforeEach) but the owner hasn't opted in on the
    // beta shelf → the redesign stays off; Home shows the shipped building surface.
    mockUseBetaOptIn.mockReturnValue(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText } = render(<SignalZone />);
    expect(mockUseBetaOptIn).toHaveBeenCalledWith('signal_design_v2');
    expect(getByText(buildingIntro('Nyx'))).toBeTruthy(); // shipped E1, not the restyle
    expect(queryByText(BUILDING_FLOOR)).toBeNull(); // no leak of the new E1
  });

  it('E1 building: headline + watching-for rows + safety floor, none of the shipped copy', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'building', dayNumber: 3, eventCount: 11 }),
    );
    const { getByText, getByLabelText, getAllByText, queryByText } = render(<SignalZone />);

    expect(getByLabelText(buildingHeadline('Nyx', 3, 11))).toBeTruthy();
    expect(getByText(BUILDING_SUB)).toBeTruthy();
    for (const row of BUILDING_WATCHING_FOR) expect(getByText(row)).toBeTruthy();
    expect(getByText(BUILDING_FLOOR)).toBeTruthy();

    // The ghost compare shows its two labeled rows with DASHES for counts — never a
    // fabricated number (§6). Two standalone em-dash nodes, one per row.
    expect(getByText('Last week')).toBeTruthy();
    expect(getByText('This week')).toBeTruthy();
    expect(getAllByText(EM_DASH)).toHaveLength(2);

    // The shipped building surface is gone (no mix).
    expect(queryByText(buildingIntro('Nyx'))).toBeNull();
    expect(queryByText('What the signal looks like:')).toBeNull();
  });

  it('E2 no_pattern: verbatim §9 copy + the top coverage diagnostic, not the shipped intro', () => {
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'no_pattern', coverage: [rateMeals] }),
    );
    const { getByText, queryByText } = render(<SignalZone />);

    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy();
    expect(getByText(NO_PATTERN_SUB)).toBeTruthy();
    // The B-053 diagnostic still renders (restyled) — its why line names the pet.
    expect(getByText(/Nyx's meals aren't rated often enough/)).toBeTruthy();
    expect(queryByText(noPatternIntro('Nyx'))).toBeNull();
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
describe('SignalZone — CUL-14 watching system (signals_v2)', () => {
  // The three mock §05 rows for Nyx-at-12-days (representative). buildWatchingRows +
  // every count/gap predicate is unit-tested in lib/signalWatching.test.ts; here the hook
  // is mocked so the wiring + composition + flag gates are what's exercised.
  const timingRow: WatchingRow = { key: 'timing', text: watchingTimingRow(4, 6) };
  const changeRow: WatchingRow = { key: 'change', text: watchingChangeRow(2, 2) };
  const gapRow: WatchingRow = { key: 'gap', text: watchingGapRow('vomiting', '6 days, then 3, then 2') };
  const allRows = [timingRow, changeRow, gapRow];

  // signals_v2 eligible (+ opted-in by default); the design_v2 frame is chosen per-test.
  function enableSignalsV2(designV2: boolean) {
    mockUseAllowlistFlag.mockImplementation(
      (key: string) => key === 'signals_v2' || (designV2 && key === 'signal_design_v2'),
    );
  }

  it('flag OFF (signals_v2 off): the block never renders, even if the hook returns rows (FR-FLAG-2 defense-in-depth)', () => {
    // allowlist false for everything (default) → signalsV2 false. Even with the hook
    // returning rows, the component-level `signalsV2 &&` gate suppresses the block.
    mockUseWatchingRows.mockReturnValue(allRows);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { queryByText } = render(<SignalZone />);
    expect(queryByText(WATCHING_SUB)).toBeNull();
    expect(queryByText(timingRow.text)).toBeNull();
    expect(queryByText('What the signal looks like:')).toBeTruthy(); // shipped surface intact
  });

  it('E1 (shipped frame): the real-count rows replace the ghost previews; the lead + floor stay', () => {
    enableSignalsV2(false); // signals_v2 on, signal_design_v2 OFF → shipped frame
    mockUseWatchingRows.mockReturnValue([timingRow, changeRow]);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText } = render(<SignalZone />);

    expect(getByText(buildingIntro('Nyx'))).toBeTruthy(); // the shipped lead stays
    expect(queryByText('What the signal looks like:')).toBeNull(); // ghost previews replaced
    expect(getByText(WATCHING_SUB)).toBeTruthy();
    expect(getByText(timingRow.text)).toBeTruthy();
    expect(getByText(changeRow.text)).toBeTruthy();
    expect(getByText(BUILDING_FLOOR)).toBeTruthy(); // the verbatim safety floor travels with the block
  });

  it('E1 (design_v2 frame): the rows replace the ghost watching-for list; the floor renders exactly once', () => {
    enableSignalsV2(true); // both flags on → B-721 E1 frame
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
    enableSignalsV2(false);
    mockUseWatchingRows.mockReturnValue([timingRow, changeRow]); // no gap row
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    expect(render(<SignalZone />).queryByText(/Gaps between/)).toBeNull();
  });

  it('E2 no_pattern: the watching rows compose in additively beside the §9 copy + coverage', () => {
    enableSignalsV2(true);
    mockUseWatchingRows.mockReturnValue([gapRow]); // mature record: only the gap lane escalates
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [rateMeals] }));
    const { getByText } = render(<SignalZone />);
    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy(); // E2 copy intact
    expect(getByText(/Nyx's meals aren't rated often enough/)).toBeTruthy(); // coverage intact
    expect(getByText(gapRow.text)).toBeTruthy(); // gap row added under them
    expect(getByText(BUILDING_FLOOR)).toBeTruthy();
  });

  it('flags are independent: signals_v2 ON while signal_design_v2 OFF renders rows in the SHIPPED frame', () => {
    enableSignalsV2(false);
    mockUseWatchingRows.mockReturnValue([timingRow]);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText } = render(<SignalZone />);
    expect(getByText(buildingIntro('Nyx'))).toBeTruthy(); // shipped chrome
    expect(getByText(timingRow.text)).toBeTruthy();
    expect(queryByText(BUILDING_SUB)).toBeNull(); // no B-721 E1 restyle copy leaks
  });

  it('no qualifying row (hook returns []): the frame renders its normal content, no empty block', () => {
    enableSignalsV2(false);
    mockUseWatchingRows.mockReturnValue([]);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    const { getByText, queryByText } = render(<SignalZone />);
    expect(queryByText(WATCHING_SUB)).toBeNull(); // no sub with no rows
    expect(getByText('What the signal looks like:')).toBeTruthy(); // shipped previews intact
  });

  it('gates the hook on an empty state — enabled is false in the live register (no watching read)', () => {
    enableSignalsV2(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    render(<SignalZone />);
    expect(mockUseWatchingRows.mock.calls.at(-1)?.[0]).toBe(false);
  });
});

// ── SR-3 (B-721) — the register: acknowledgment line + receded chrome ─────────────
describe('SignalZone — SR-3 acknowledgment line (§5.3)', () => {
  it('shows the "Noted — updating …" line only when the flag is on AND a regen is in flight', () => {
    // Flag ON + acknowledging → the line renders above the still-readable findings.
    mockUseAllowlistFlag.mockReturnValue(true);
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    const on = render(<SignalZone />);
    expect(on.getByText(ackUpdatingCopy('Nyx'))).toBeTruthy();
    // The findings stay readable throughout (never blanked / replaced by a spinner).
    expect(on.getByText('A live finding sentence.')).toBeTruthy();
  });

  it('never renders the ack line when the flag is off, even mid-regen (FR-FLAG-2)', () => {
    mockUseAllowlistFlag.mockReturnValue(false);
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: true }),
    );
    expect(render(<SignalZone />).queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
  });

  it('does not render the ack line when nothing is in flight (flag on, not acknowledging)', () => {
    mockUseAllowlistFlag.mockReturnValue(true);
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding], acknowledging: false }),
    );
    expect(render(<SignalZone />).queryByText(ackUpdatingCopy('Nyx'))).toBeNull();
  });

  it('is scoped to the live register — no ack over the E1 building state (E1 owns that reassurance)', () => {
    mockUseAllowlistFlag.mockReturnValue(true);
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
    mockUseAllowlistFlag.mockReturnValue(true);
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
  it('drops the section label a tier in the live register, flag on', () => {
    mockUseAllowlistFlag.mockReturnValue(true);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText('Signal')).toHaveStyle({ color: theme.colorTextTertiary });
  });

  it('keeps the label prominent flag-off (byte-identical) and in the empty states', () => {
    // Flag off, live: the shipped secondary tone.
    mockUseAllowlistFlag.mockReturnValue(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText('Signal')).toHaveStyle({ color: theme.colorTextSecondary });
    // Flag on, building (E1): the label stays prominent (only the live register recedes it).
    mockUseAllowlistFlag.mockReturnValue(true);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    expect(render(<SignalZone />).getByText('Signal')).toHaveStyle({ color: theme.colorTextSecondary });
  });

  it('recedes the footer doorway to the tertiary tier flag-on, keeps full accent flag-off (AA-safe recede)', () => {
    // The mock dims the footer to a lighter teal, but that fails AA on white (~1.6:1) —
    // so the doorway recedes to the same grey tier as the label (≥4.5:1), never below the
    // shipped accent footer. Flag-off is unchanged.
    mockUseAllowlistFlag.mockReturnValue(true);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText(/See all of Nyx's patterns/)).toHaveStyle({
      color: theme.colorTextTertiary,
    });
    mockUseAllowlistFlag.mockReturnValue(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding] }));
    expect(render(<SignalZone />).getByText(/See all of Nyx's patterns/)).toHaveStyle({
      color: theme.colorAccent,
    });
  });
});

// ── CUL-12 (Signals v2) — the LiveStack signals_v2 filter ─────────────────────
// SignalZone owns two net-new pieces of logic this PR adds: the `signals_v2` two-gate
// resolution and the LiveStack filter that drops timing-story findings when the flag is
// off (the server computes them uniformly, so a non-eligible cache DOES carry them — §5).
// These pin that the filter keeps the divider/lead rhythm correct, and DOCUMENT the known
// edge the PR comment names (an only-story cache reads 'live' with an empty stack until
// PR 10's flag-off QA closes it) so a future redeploy can't ship it silently.
describe('SignalZone — CUL-12 signals_v2 LiveStack filter', () => {
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

  it('drops story findings from the stack when signals_v2 is OFF, keeps the other findings', () => {
    mockUseAllowlistFlag.mockReturnValue(false); // signals_v2 (and signal_design_v2) off
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding, storyFinding] }),
    );
    const view = render(<SignalZone />);
    // The A2 face (its "Timing pattern" badge) is not rendered…
    expect(view.queryByText('Timing pattern')).toBeNull();
    // …but the non-story finding still renders — no stray gap in its place.
    expect(view.queryByText('A live finding sentence.')).toBeTruthy();
  });

  it('renders the A2 story card in the stack when signals_v2 is ON', () => {
    mockUseAllowlistFlag.mockImplementation((key: string) => key === 'signals_v2');
    mockUseSignal.mockReturnValue(
      signalState({ displayState: 'live', findings: [liveFinding, storyFinding] }),
    );
    const view = render(<SignalZone />);
    expect(view.queryByText('Timing pattern')).toBeTruthy();
    expect(view.queryByText('A live finding sentence.')).toBeTruthy();
  });

  it('KNOWN EDGE (until PR 10): an only-story cache with the flag off reads live but renders no cards', () => {
    // Documented, not desired: displayState is derived upstream (useSignal) from the FULL set,
    // so a live state with an empty visible stack is possible. Pinned so PR 10's flag-off QA
    // closes it deliberately rather than a redeploy shipping the blank card silently.
    mockUseAllowlistFlag.mockReturnValue(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [storyFinding] }));
    const view = render(<SignalZone />);
    expect(view.queryByText('Timing pattern')).toBeNull();
    // The zone frame is still present (the footer doorway renders in every state).
    expect(view.queryByText(/See all of Nyx's patterns/)).toBeTruthy();
  });

  // CUL-13 — the trial card rides the SAME `signals_v2` gate via the shared isSignalsV2Finding filter.
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

  it('drops the trial card flag-off, keeps the other findings; renders it flag-on', () => {
    mockUseAllowlistFlag.mockReturnValue(false);
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }));
    const off = render(<SignalZone />);
    expect(off.queryByText('Day 20 of 56')).toBeNull();
    expect(off.queryByText('A live finding sentence.')).toBeTruthy();

    mockUseAllowlistFlag.mockImplementation((key: string) => key === 'signals_v2');
    mockUseSignal.mockReturnValue(signalState({ displayState: 'live', findings: [liveFinding, trialFinding] }));
    const on = render(<SignalZone />);
    expect(on.queryByText('Day 20 of 56')).toBeTruthy();
    expect(on.queryByText('A live finding sentence.')).toBeTruthy();
  });
});
