// SignalZone under Design v2 (D2-3 · CUL-1065; CUL-1270 · D1 = B): the lead insight card is
// the title + chart + line and a door; every other card — a safety lead, every lower card,
// every folded card — is a row (headline, ask, chevron) and a door to ITS OWN screen; the
// header's "Open ›" is gone; "not a diagnosis" is said once, at the zone's foot. And the
// flag-off half the guard cannot see: with the gate off, no lead read is issued and no door
// exists — over a fixture that would answer.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));
const mockUseDesignV2 = jest.fn(() => false);
jest.mock('../../hooks/useDesignV2', () => ({ useDesignV2: () => mockUseDesignV2() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/db', () => ({ getDb: () => ({ getAllSync: () => [{ last: null }] }) }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: async () => null,
}));
// The fold is the reader's device-local memory; a test states it rather than seeding a store.
const mockFolded = new Set<string>();
jest.mock('../../hooks/useSignalFold', () => {
  const { foldIdentity } = jest.requireActual('../../lib/signalFold');
  return {
    useSignalFold: () => ({
      stateOf: (f: never) => (mockFolded.has(foldIdentity(f)) ? 'folded' : 'open'),
      backBecauseOf: (f: never) => (mockFolded.has(`back:${foldIdentity(f)}`) ? 'new_episode' : null),
      fold: jest.fn(),
      unfold: jest.fn(),
      touch: jest.fn(),
    }),
  };
});
const mockUseSignal = jest.fn();
jest.mock('../../hooks/useSignal', () => ({ useSignal: () => mockUseSignal() }));
jest.mock('../../hooks/useWatchingRows', () => ({
  useWatchingRows: () => [],
  useWatchingRowsRead: () => ({ rows: [], answered: true }),
}));
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
import { FOOT_LINK_HITSLOP, FOOT_MARGIN_TOP } from '../designV2/signal/SignalZoneFoot';
import { SignalZone } from './SignalZone';
import { DOOR_A11Y_HINT } from '../designV2/signal/SignalRow';
import type { SignalState } from '../../hooks/useSignal';
import type { CachedFinding } from '../../lib/signal';
import type { TrialCardTrial } from '../../lib/dietTrialCard';
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
  return { title: 'Vomiting, week over week', weekly, line: weekLine(weekly), lineWithheld: null, noun: 'vomiting', trial: null };
}

const redFlag: CachedFinding = {
  rank: 0,
  text: "A photo you logged of Nyx's vomiting showed possible foreign material, on September 22 — worth a call to your vet. This is a read of your logs, not a diagnosis.",
  finding: {
    type: 'incident_red_flag',
    priorityClass: 'safety',
    incidentType: 'vomit',
    flags: ['foreign_material'],
    mostRecentFlaggedIso: '2026-09-22T15:00:00Z',
    flaggedIncidentCount: 1,
    windowDays: 14,
  },
};
const timing: CachedFinding = {
  rank: 3,
  text: '9 of the 10 vomiting episodes we could time for Nyx happened within 30 minutes of eating — a timing pattern worth mentioning to your vet.',
  finding: {
    type: 'postprandial_timing',
    priorityClass: 'insight',
    symptomType: 'vomit',
    rapidCount: 9,
    eligibleCount: 10,
    totalEpisodes: 12,
    rapidWindowMinutes: 30,
    lastTwoEligibleRapid: false,
    medianMinutesSinceFeeding: 12,
    feedingFormsInEvidence: [],
    windowDays: 60,
  },
};
const chronicityRow: CachedFinding = { ...safetyLead, rank: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mockFolded.clear();
  mockLoadSignalLead.mockResolvedValue(leadModel());
});

describe('flag-on', () => {
  beforeEach(() => mockUseDesignV2.mockReturnValue(true));

  it('the lead insight card is the title + chart + line; its face opens the Signal route for THIS pet', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    expect(mockLoadSignalLead).toHaveBeenCalledWith('pet-1', benignLead, false, null);
    expect(view.getByTestId('signal-lead-title').props.children).toBe('Vomiting, week over week');
    fireEvent.press(view.getByTestId('signal-lead-face'));
    // The door measures first (declined here, see the mock above), then pushes.
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/signal/reflection%3Avomit?pet=pet-1'));
    // The face never folds: no fold control on the lead, and the strip is not drawn.
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
  });

  // CUL-1216 (BRK-6): the lead card's week line reads the zone's not-eating register — Home's
  // fail-closed prop, and the Signal's own intake_decline — the same one the stack drops on.
  it('the lead card is handed the not-eating register: Home’s prop, or an intake decline in the Signal', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone withholdFallingVomit />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    expect(mockLoadSignalLead).toHaveBeenLastCalledWith('pet-1', benignLead, true, null);
    view.unmount();

    mockLoadSignalLead.mockClear();
    const decline: CachedFinding = {
      rank: 5,
      text: 'Nyx has eaten less than usual for 3 days.',
      finding: { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 },
    };
    mockUseSignal.mockReturnValue(state([benignLead, decline]));
    const second = render(<SignalZone withholdFallingVomit={false} />);
    await waitFor(() => expect(second.getByTestId('signal-lead-card')).toBeTruthy());
    expect(mockLoadSignalLead).toHaveBeenLastCalledWith('pet-1', benignLead, true, null);
  });

  // CUL-1360: the cache counted rabbit (day 20, just after midnight today) and Home's trial
  // facts now say chicken, started today. The stack drops the older trial's falling pair,
  // for THIS pet only, and hands every card the row's `generated_at` for its title.
  describe('a trial finding counted over a trial since replaced', () => {
    const today = toLocalDayKey(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const counted = new Date(y, m - 1, d, 0, 30).toISOString();
    const rabbitPair = (dir: 'fewer_during_trial' | 'more_during_trial'): CachedFinding => ({
      rank: 1,
      text: "We've logged 2 episodes of vomiting for Nyx in the trial's 20 days, compared with 11 in the 49 days before it — worth reviewing with your vet.",
      finding: {
        type: 'trial_response',
        priorityClass: 'insight',
        trialDayNumber: 20,
        targetDurationDays: 56,
        trialLoggedDays: 20,
        baselineLoggedDays: 45,
        baselineWindowDays: 49,
        pooledTrialCount: 2,
        pooledBaselineCount: 11,
        rapid: { trial: 1, baseline: 4 },
        long: { trial: 0, baseline: 1 },
        rapidWindowMinutes: 30,
        longGapHours: 6,
        treatShare: { trial: null, baseline: null },
        mealsPerDay: { trial: null, baseline: null },
        comparisonDirection: dir,
        trialWindowDays: 20,
      },
    });
    const chicken: TrialCardTrial = {
      id: 'trial-chicken',
      status: 'active',
      startedAt: today,
      endedAt: null,
      targetDurationDays: 56,
      foodLabel: null,
      trialProtein: { protein: 'chicken', source: 'owner' },
    } as TrialCardTrial;
    const trialFor = (petId: string) => ({ petId, trial: chicken, nowMs: Date.now() });
    const withStamp = (findings: CachedFinding[]) => ({ ...state(findings), generatedAt: counted });

    it('drops the falling pair; keeps it with no anchor, or an anchor for another pet', async () => {
      mockUseSignal.mockReturnValue(withStamp([benignLead, rabbitPair('fewer_during_trial')]));
      const view = render(<SignalZone signalTrial={trialFor('pet-1')} />);
      await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
      expect(view.queryAllByTestId('signal-row')).toHaveLength(0);
      view.unmount();

      for (const signalTrial of [null, trialFor('pet-2')]) {
        const other = render(<SignalZone signalTrial={signalTrial} />);
        await waitFor(() => expect(other.getByTestId('signal-lead-card')).toBeTruthy());
        expect(other.getAllByTestId('signal-row')).toHaveLength(1);
        other.unmount();
      }
    });

    it('keeps the rising pair, titled by its own day, and hands the lead card the stamp', async () => {
      mockUseSignal.mockReturnValue(withStamp([benignLead, rabbitPair('more_during_trial')]));
      const view = render(<SignalZone signalTrial={trialFor('pet-1')} />);
      await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
      expect(view.getByTestId('signal-row-headline').props.children).toBe('Diet trial, day 20 of 56');
      expect(mockLoadSignalLead).toHaveBeenCalledWith('pet-1', benignLead, false, counted);
    });
  });

  it('the header’s "Open ›" is gone: every card is its own door', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    expect(view.queryByText('Open')).toBeNull();
    expect(view.queryByLabelText("Open Nyx's signal")).toBeNull();
    expect(view.getByText('Signal')).toBeTruthy();
  });

  it('a lower card is a row door to ITS OWN screen, never the lead’s', async () => {
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    const rows = view.getAllByTestId('signal-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].props.accessibilityHint).toBe(DOOR_A11Y_HINT);
    fireEvent.press(rows[0]);
    expect(router.push).toHaveBeenCalledWith('/signal/food_symptom_correlation%3Achicken?pet=pet-1');
    // No shipped face, no control row, no per-card sentence on Home.
    expect(view.queryByTestId('insight-face')).toBeNull();
    expect(view.queryByTestId('insight-evidence-control')).toBeNull();
    expect(view.queryByText(secondary.text)).toBeNull();
  });

  it('the device case: a photo read leads, then the recurrence, then the timing — each opens its own screen', async () => {
    mockUseSignal.mockReturnValue(state([redFlag, chronicityRow, timing]));
    const view = render(<SignalZone />);
    expect(view.queryByTestId('signal-lead-card')).toBeNull();
    expect(mockLoadSignalLead).not.toHaveBeenCalled();
    const rows = view.getAllByTestId('signal-row');
    expect(rows).toHaveLength(3);
    const headlines = view.getAllByTestId('signal-row-headline').map((h) => h.props.children);
    expect(headlines).toEqual(['Possible foreign material in a vomit photo', 'Vomiting in 5 of the last 8 weeks', 'Vomiting soon after meals']);
    // Every safety ask stays on Home, in words.
    expect(view.getByText('Worth a call to your vet')).toBeTruthy();
    expect(view.getByText('worth a word with your vet')).toBeTruthy();
    // S1: the timing row draws its lane; the safety rows draw nothing.
    expect(view.getAllByTestId('signal-row-thumb-lane')).toHaveLength(1);
    const hrefs: string[] = [];
    for (const row of rows) {
      fireEvent.press(row);
      hrefs.push((router.push as jest.Mock).mock.calls.at(-1)[0]);
    }
    expect(hrefs).toEqual([
      '/signal/incident_red_flag%3Avomit?pet=pet-1',
      '/signal/symptom_chronicity%3Avomit?pet=pet-1',
      '/signal/postprandial_timing%3Avomit?pet=pet-1',
    ]);
  });

  it('"not a diagnosis" is said once, at the foot, beside "All patterns ›" — never per card', async () => {
    mockUseSignal.mockReturnValue(state([redFlag, chronicityRow, timing]));
    const view = render(<SignalZone />);
    expect(view.getAllByText(/not a diagnosis/)).toHaveLength(1);
    expect(view.getByTestId('signal-zone-disclaimer').props.children).toBe("A read of Nyx's logs, not a diagnosis.");
    expect(view.queryByText(/See all of Nyx's patterns/)).toBeNull();
    fireEvent.press(view.getByTestId('signal-zone-patterns'));
    expect(router.push).toHaveBeenCalledWith('/insights');
  });

  it('C-5: the foot link never reaches up into the last row (pinned off the rendered styles)', async () => {
    mockUseSignal.mockReturnValue(state([redFlag, timing]));
    const view = render(<SignalZone />);
    const rows = view.getAllByTestId('signal-row');
    const lastRow = rows[rows.length - 1];
    // The rows carry no slop: their own box is the whole target.
    expect(lastRow.props.hitSlop).toBeUndefined();
    const link = view.getByTestId('signal-zone-patterns');
    expect(link.props.hitSlop).toEqual(FOOT_LINK_HITSLOP);
    const gap = (StyleSheet.flatten(view.getByTestId('signal-zone-foot').props.style) as { marginTop: number }).marginTop;
    expect(gap).toBe(FOOT_MARGIN_TOP);
    expect(gap).toBeGreaterThanOrEqual((link.props.hitSlop as { top: number }).top + 0);
  });

  it('there is no fold under Design v2 (CUL-1285): a stored fold is ignored and the card renders in full', async () => {
    mockFolded.add('symptom_chronicity:vomit');
    mockFolded.add('back:postprandial_timing:vomit');
    mockUseSignal.mockReturnValue(state([redFlag, chronicityRow, timing]));
    const view = render(<SignalZone />);
    const rows = view.getAllByTestId('signal-row');
    expect(rows).toHaveLength(3);
    // The folded chronicity card is its full row: headline, count, ask.
    expect(rows[1].props.accessibilityLabel).toBe('Vomiting in 5 of the last 8 weeks. 14 episodes since August. Worth a word with your vet.');
    expect(view.getByText(/14 episodes since August/)).toBeTruthy();
    // No shipped strip, no "Back because" line (the fold's re-open reason is the fold's).
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
    expect(view.queryByText(/Back because/)).toBeNull();
    expect(rows[2].props.accessibilityLabel).not.toMatch(/Back because/);
  });

  it('a stored fold on the benign lead does not demote it: it keeps the lead card', async () => {
    mockFolded.add('reflection:vomit');
    mockUseSignal.mockReturnValue(state([benignLead, secondary]));
    const view = render(<SignalZone />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
  });

  it('flag-off, the shipped fold still works: a stored fold draws the shipped strip', () => {
    mockUseDesignV2.mockReturnValue(false);
    mockFolded.add('symptom_chronicity:vomit');
    mockUseSignal.mockReturnValue(state([redFlag, chronicityRow, timing]));
    const view = render(<SignalZone />);
    expect(view.getByTestId('insight-folded-strip')).toBeTruthy();
    mockUseDesignV2.mockReturnValue(true);
  });

  it('a safety lead is a row (S1) — no chart, no lead read — with its own door', async () => {
    mockUseSignal.mockReturnValue(state([safetyLead, benignLead]));
    const view = render(<SignalZone />);
    expect(view.queryByTestId('signal-lead-card')).toBeNull();
    expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
    expect(mockLoadSignalLead).not.toHaveBeenCalled();
    const rows = view.getAllByTestId('signal-row');
    expect(rows).toHaveLength(2);
    fireEvent.press(rows[0]);
    expect(router.push).toHaveBeenCalledWith('/signal/symptom_chronicity%3Avomit?pet=pet-1');
    expect(view.queryByTestId('signal-row-thumb-lane')).toBeNull();
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
    expect(view.queryByTestId('signal-row')).toBeNull();
    expect(view.queryByTestId('signal-zone-foot')).toBeNull();
    expect(view.getByText("See all of Nyx's patterns →")).toBeTruthy();
    for (const face of view.getAllByTestId('insight-face')) expect(face.props.accessibilityHint).not.toBe(DOOR_A11Y_HINT);
    fireEvent.press(view.getAllByTestId('insight-face')[0]);
    expect(router.push).not.toHaveBeenCalled();
  });
});
