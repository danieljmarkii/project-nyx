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
} from '../../lib/signalCopy';

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
