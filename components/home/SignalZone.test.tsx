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

import { render } from '@testing-library/react-native';
import { SignalZone } from './SignalZone';
import type { SignalState } from '../../hooks/useSignal';
import type { CoverageDiagnostic } from '../../lib/signal';
import {
  buildingIntro,
  noPatternIntro,
  buildingHeadline,
  BUILDING_SUB,
  BUILDING_WATCHING_FOR,
  BUILDING_FLOOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
} from '../../lib/signalCopy';

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
});

describe('SignalZone — flag ON (E1/E2 restyle, FR-FLAG-1 no mix)', () => {
  beforeEach(() => mockUseAllowlistFlag.mockReturnValue(true));

  it('gates on exactly the signal_design_v2 flag', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'building' }));
    render(<SignalZone />);
    expect(mockUseAllowlistFlag).toHaveBeenCalledWith('signal_design_v2');
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

  it('E2 with no coverage diagnostic: the §9 copy stands alone', () => {
    mockUseSignal.mockReturnValue(signalState({ displayState: 'no_pattern', coverage: [] }));
    const { getByText } = render(<SignalZone />);
    expect(getByText(NO_PATTERN_HEADLINE)).toBeTruthy();
    expect(getByText(NO_PATTERN_SUB)).toBeTruthy();
  });
});
