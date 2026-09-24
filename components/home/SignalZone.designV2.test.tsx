// SignalZone under Design v2 (D2-3 · CUL-1065): the lead insight card is the title +
// chart + line and a door; every other face is a door; the header carries "Open ›"; the
// folded strip is the shipped strip. And the flag-off half the guard cannot see: with the
// gate off, no lead read is issued and no door exists — over a fixture that would answer.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
const mockUseDesignV2 = jest.fn(() => false);
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockUseDesignV2() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({ getDb: () => ({ getAllSync: () => [{ last: null }] }) }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../lib/signalLead', () => ({ loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a) }));
const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({ useSignal: () => mockUseSignal() }));
jest.mock('../../hooks/useWatchingRows', () => ({ useWatchingRows: () => [] }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
jest.mock('../../lib/signalArrival', () => ({ hasPlayedArrival: async () => true, markArrivalPlayed: async () => {} }));
jest.mock('../../lib/haptics', () => ({ insightArrival: jest.fn() }));
// The door measures its chart before it pushes (D2-6); this suite proves the DOOR, so the
// platform declines at once and nothing is staged — the staging is `SignalLeadCard.test.tsx`'s.
jest.mock('../../lib/measureNode', () => ({ measureNodeInWindow: (_n: unknown, cb: (r: null) => void) => cb(null) }));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { HEADER_ROW_GAP } from '../designV2/signal/SignalOpenLink';
import { SignalZone } from './SignalZone';
import { DOOR_A11Y_HINT } from './InsightCard';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding } from '../../lib/signal';
import { signalWeeks, weekLine } from '../../lib/signalWindows';
import { toLocalDayKey } from '../../lib/utils';

const benignLead: CachedFinding = {
  rank: 0,
  text: 'Nyx vomited 2 times this week, 3 the week before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 3, direction: 'flat', windowDays: 14 },
};
const secondary: CachedFinding = {
  rank: 1,
  text: 'Vomiting has tended to follow chicken.',
  finding: {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType: 'vomit',
    protein: 'chicken',
    matchedPairs: 4,
    symptomEventCount: 4,
    correlationWindowHours: 12,
  },
};
const safetyLead: CachedFinding = {
  rank: 0,
  text: 'Nyx has vomited 14 times across 5 of the last 8 weeks. Worth a vet visit.',
  finding: {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-01T00:00:00Z',
    tier: 'standard',
    windowDays: 56,
  },
};

function state(findings: CachedFinding[]): SignalState {
  return {
    petId: 'pet-1',
    findings,
    coverage: [],
    displayState: 'live',
    signalText: null,
    petName: 'Nyx',
    isLoading: false,
    dayNumber: 30,
    eventCount: 80,
    acknowledging: false,
    generatedAt: null,
    answered: true,
  };
}

function leadModel() {
  const today = toLocalDayKey(new Date());
  const weekly = signalWeeks({ finding: benignLead.finding, today, trial: null, episodeDays: [today], loggedDays: [today] });
  return { title: 'Vomiting, the last 2 weeks', weekly, line: weekLine(weekly), noun: 'vomiting', trial: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSignalLead.mockResolvedValue(leadModel());
});

describe('flag-on', () => {
  beforeEach(() => mockUseDesignV2.mockReturnValue(true));

  it('the lead insight card is the title + chart + line; its face opens the Signal route for THIS pet', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    expect(mockLoadSignalLead).toHaveBeenCalledWith('pet-1', benignLead);
    expect(view.getByTestId('signal-lead-title').props.children).toBe('Vomiting, the last 2 weeks');
    fireEvent.press(view.getByTestId('signal-lead-face'));
    // The door measures first (declined here, see the mock above), then pushes.
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/signal/reflection%3Avomit?pet=pet-1'));
    // The face never folds: no fold control on the lead, and the strip is not drawn.
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
  });

  it('the header carries "Open ›", the same door', async () => {
    mockUseSignal.mockReturnValue(state([benignLead]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-open-link')).toBeTruthy());
    fireEvent.press(view.getByTestId('signal-open-link'));
    expect(router.push).toHaveBeenCalledWith('/signal/reflection%3Avomit?pet=pet-1');
  });

  it('C-5: the header link and the lead face below it never share hit area (pinned off the rendered styles)', async () => {
    mockUseSignal.mockReturnValue(state([benignLead]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    const link = view.getByTestId('signal-open-link');
    const face = view.getByTestId('signal-lead-face');
    const linkDown = (link.props.hitSlop as { bottom: number }).bottom;
    const faceUp = (face.props.hitSlop as { top: number }).top;
    // The header row's gap to the first row, off the flattened style of the row itself.
    const gap = (StyleSheet.flatten(view.getByTestId('signal-open-row').props.style) as { marginBottom: number }).marginBottom;
    expect(gap).toBe(HEADER_ROW_GAP);
    expect(gap).toBeGreaterThanOrEqual(linkDown + faceUp);
  });

  it('a secondary card is the shipped compact card with a door and no control row', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    const faces = view.getAllByTestId('insight-face');
    expect(faces).toHaveLength(1);
    expect(faces[0].props.accessibilityHint).toBe(DOOR_A11Y_HINT);
    fireEvent.press(faces[0]);
    expect(router.push).toHaveBeenCalledWith('/signal/food_symptom_correlation%3Achicken?pet=pet-1');
    expect(view.queryByTestId('insight-evidence-control')).toBeNull();
  });

  it('a safety lead stays the shipped plain card (S1) — no chart, no lead read — with the door', async () => {
    mockUseSignal.mockReturnValue(state([safetyLead, benignLead]));
    const view = render(<SignalZone />);
    expect(view.queryByTestId('signal-lead-card')).toBeNull();
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
    expect(mockLoadSignalLead).not.toHaveBeenCalled();
    const faces = view.getAllByTestId('insight-face');
    expect(faces).toHaveLength(2);
    fireEvent.press(faces[0]);
    expect(router.push).toHaveBeenCalledWith('/signal/symptom_chronicity%3Avomit?pet=pet-1');
  });
});

describe('flag-off (the guard’s async half)', () => {
  it('issues no lead read and draws no door, over a fixture that would answer', async () => {
    mockUseDesignV2.mockReturnValue(false);
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockLoadSignalLead).not.toHaveBeenCalled();
    expect(view.queryByTestId('signal-lead-card')).toBeNull();
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
    expect(view.queryByTestId('signal-open-link')).toBeNull();
    for (const face of view.getAllByTestId('insight-face')) expect(face.props.accessibilityHint).not.toBe(DOOR_A11Y_HINT);
    fireEvent.press(view.getAllByTestId('insight-face')[0]);
    expect(router.push).not.toHaveBeenCalled();
  });
});
