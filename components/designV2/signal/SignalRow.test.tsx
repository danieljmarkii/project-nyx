// The Signal row on Home (CUL-1270 · D1 = B). What it must never do is the spine of this
// file: a safety row never draws a chart (S1), and a safety row never loses its ask — open
// or folded, sighted or not (clinical-guardrails). Then the door: every row opens its OWN
// finding, folded or not, and never folds or unfolds from the face.

const mockLoadSignalRowTrial = jest.fn(async (..._a: unknown[]) => null as unknown);
jest.mock('../../../lib/signalLead', () => ({ loadSignalRowTrial: (...a: unknown[]) => mockLoadSignalRowTrial(...a) }));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../../constants/theme';
import type { CachedFinding, SignalFinding } from '../../../lib/signal';
import { DOOR_A11Y_HINT } from '../../home/InsightCard';
import { ROW_MIN_HEIGHT, SignalRow, weekPairOf } from './SignalRow';

const cached = (finding: SignalFinding, rank = 1): CachedFinding => ({ rank, text: 'The server’s whole sentence. This is a read of your logs, not a diagnosis.', finding });

const SAFETY: SignalFinding[] = [
  {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType: 'vomit',
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-03T12:00:00Z',
    tier: 'firm',
    windowDays: 56,
  },
  { type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'cough', currentCount: 7, priorCount: 2, currentDays: 5, priorDays: 2, trigger: 'more_days', tier: 'firm', windowDays: 7 },
  { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 },
  { type: 'intake_decline', priorityClass: 'safety', trigger: 'refused_normal_food', species: 'cat', daysBelowBaseline: 0, refusedFoodLabel: 'Kibble', ratedMealsConsidered: 9 },
  { type: 'incident_red_flag', priorityClass: 'safety', incidentType: 'vomit', flags: ['foreign_material'], mostRecentFlaggedIso: '2026-09-22T15:00:00Z', flaggedIncidentCount: 1, windowDays: 14 },
];

const timing: SignalFinding = {
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
};
const reflection: SignalFinding = { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 3, priorCount: 5, direction: 'improving', windowDays: 14 };
const correlation: SignalFinding = {
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'established',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 6,
  symptomEventCount: 8,
  correlationWindowHours: 12,
};

const CHART_IDS = ['signal-row-thumb-lane', 'signal-row-thumb-pair', 'weekly-bars'];

beforeEach(() => jest.clearAllMocks());

describe('S1 — a safety row is words: the headline and the ask, never a chart', () => {
  it.each(SAFETY.map((f) => [f.type, f] as const))('%s: no chart, the ask printed, the server sentence never on Home', (_t, f) => {
    const view = render(<SignalRow cached={cached(f)} petId="pet-1" onOpen={jest.fn()} />);
    for (const id of CHART_IDS) expect(view.queryByTestId(id)).toBeNull();
    expect(view.getByTestId('signal-row-ask')).toBeTruthy();
    expect(view.queryByText(/not a diagnosis/)).toBeNull();
  });

  it.each(SAFETY.map((f) => [f.type, f] as const))('%s folded: still no chart, and the ask is still printed and spoken', (_t, f) => {
    const view = render(<SignalRow cached={cached(f)} petId="pet-1" onOpen={jest.fn()} folded />);
    for (const id of CHART_IDS) expect(view.queryByTestId(id)).toBeNull();
    const ask = view.getByTestId('signal-row-ask');
    const printed = String(ask.props.children);
    expect(printed.length).toBeGreaterThan(0);
    expect(view.getByTestId('signal-row').props.accessibilityLabel.toLowerCase()).toContain(printed.toLowerCase());
  });

  it('the ask is the symptom INK, never the bright rose on white (C-1)', () => {
    const view = render(<SignalRow cached={cached(SAFETY[4])} petId="pet-1" onOpen={jest.fn()} />);
    expect(StyleSheet.flatten(view.getByTestId('signal-row-ask').props.style).color).toBe(theme.colorEventSymptomInk);
    expect(view.getByTestId('signal-row-ask').props.children).toBe('Worth a call to your vet');
    expect(view.getByTestId('signal-row-eyebrow').props.children).toBe('Photo read · Sep 22');
  });
});

// The last episode is a LOCAL day (the record's, read by the device), so the instant is
// built from local components — never a UTC literal (B-514; the non-UTC CI job).
const SEP_24_LOCAL = new Date(2026, 8, 24, 12, 0).toISOString();

describe('a folded safety row keeps its date (fold spec §3.4)', () => {
  it('a standing concern: its last episode from the record, printed and spoken, with the ask', () => {
    const view = render(<SignalRow cached={cached(SAFETY[0])} petId="pet-1" onOpen={jest.fn()} folded lastEpisodeIso={SEP_24_LOCAL} />);
    expect(view.getByTestId('signal-row-sub').props.children[0]).toBe('Last episode Sep 24');
    expect(view.getByTestId('signal-row').props.accessibilityLabel).toBe(
      'Vomiting in 5 of the last 8 weeks. Last episode September 24. Worth booking a vet visit.',
    );
  });

  it('the photo read keeps its dated eyebrow folded; an unread record prints no date rather than a guess', () => {
    const red = render(<SignalRow cached={cached(SAFETY[4])} petId="pet-1" onOpen={jest.fn()} folded />);
    expect(red.getByTestId('signal-row-eyebrow').props.children).toBe('Photo read · Sep 22');
    const noDate = render(<SignalRow cached={cached(SAFETY[0])} petId="pet-1" onOpen={jest.fn()} folded lastEpisodeIso={null} />);
    expect(noDate.queryByTestId('signal-row-sub')).toBeNull();
    expect(noDate.getByTestId('signal-row-ask')).toBeTruthy();
  });

  it('an insight row keeps no date folded, and an open row prints its count, not the date', () => {
    const open = render(<SignalRow cached={cached(SAFETY[0])} petId="pet-1" onOpen={jest.fn()} lastEpisodeIso={SEP_24_LOCAL} />);
    expect(open.queryByText(/Last episode/)).toBeNull();
    const insight = render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={jest.fn()} folded lastEpisodeIso={SEP_24_LOCAL} />);
    expect(insight.queryByText(/Last episode/)).toBeNull();
  });
});

describe('the thumbnail — insight rows, drawn from the finding', () => {
  it('a timing finding draws its lane', () => {
    const view = render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={jest.fn()} />);
    expect(view.getByTestId('signal-row-thumb-lane')).toBeTruthy();
    expect(view.queryByTestId('signal-row-ask')).toBeNull();
  });

  it('the frequency comparison draws two bars, last week then this week, scaled to each other', () => {
    const view = render(<SignalRow cached={cached(reflection)} petId="pet-1" onOpen={jest.fn()} />);
    const prior = StyleSheet.flatten(view.getByTestId('signal-row-bar-prior').props.style).height as number;
    const current = StyleSheet.flatten(view.getByTestId('signal-row-bar-current').props.style).height as number;
    expect(prior).toBeGreaterThan(current);
    expect(view.getByTestId('signal-row-sub').props.children).toBe('3 this week, 5 last week');
  });

  it('S2: a withheld prior draws no pair — never a lone numerator bar', () => {
    const withheld = { ...reflection, density: { comparable: false, currentLoggingDays: 2, priorLoggingDays: 6 } } as SignalFinding;
    expect(weekPairOf(withheld as never)).toBeNull();
    const view = render(<SignalRow cached={cached(withheld)} petId="pet-1" onOpen={jest.fn()} />);
    expect(view.queryByTestId('signal-row-thumb-pair')).toBeNull();
  });

  it('every other type is words only; a folded insight row drops its picture', () => {
    expect(render(<SignalRow cached={cached(correlation)} petId="pet-1" onOpen={jest.fn()} />).queryByTestId('signal-row-thumb-pair')).toBeNull();
    const folded = render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={jest.fn()} folded />);
    expect(folded.queryByTestId('signal-row-thumb-lane')).toBeNull();
    expect(folded.queryByTestId('signal-row-sub')).toBeNull();
  });
});

describe('the door', () => {
  it('opens its own finding, open or folded; the touch clears a Back-because line', () => {
    for (const folded of [false, true]) {
      const onOpen = jest.fn();
      const onTouch = jest.fn();
      const view = render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={onOpen} onTouch={onTouch} folded={folded} />);
      fireEvent.press(view.getByTestId('signal-row'));
      expect(onOpen).toHaveBeenCalledWith(timing);
      expect(onTouch).toHaveBeenCalledWith(timing);
    }
  });

  it('is one button: role, the door hint, a label that says every line', () => {
    const view = render(<SignalRow cached={cached(SAFETY[0])} petId="pet-1" onOpen={jest.fn()} />);
    const row = view.getByTestId('signal-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe(DOOR_A11Y_HINT);
    expect(row.props.accessibilityLabel).toBe('Vomiting in 5 of the last 8 weeks. 14 episodes since August. Worth booking a vet visit.');
  });

  it('C-5: the row’s own box is the target — no slop to share with its neighbours, and a 44pt floor', () => {
    const view = render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={jest.fn()} />);
    const row = view.getByTestId('signal-row');
    expect(row.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(row.props.style).minHeight).toBe(ROW_MIN_HEIGHT);
    expect(ROW_MIN_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('a record-reopened card says why first, in the label too', () => {
    const view = render(<SignalRow cached={cached(SAFETY[0])} petId="pet-1" onOpen={jest.fn()} backBecause="new_episode" />);
    expect(view.getByTestId('signal-row').props.accessibilityLabel).toMatch(/^Back because/);
  });
});

describe('the trial card names the local trial, as its screen does', () => {
  const trialCard: SignalFinding = {
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: 20,
    targetDurationDays: 56,
    trialLoggedDays: 20,
    baselineLoggedDays: 40,
    baselineWindowDays: 49,
    pooledTrialCount: 4,
    pooledBaselineCount: 20,
    rapid: { trial: 2, baseline: 9 },
    long: { trial: 0, baseline: 3 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: 'fewer_during_trial',
    trialWindowDays: 20,
  };

  it('reads the trial for the ROW’s pet and re-titles; before it answers, the cache’s own day', async () => {
    mockLoadSignalRowTrial.mockResolvedValue({ startDay: '2026-09-01', identity: 'Rabbit trial', dayCounter: 21, targetDays: 56, foodLabel: null });
    const view = render(<SignalRow cached={cached(trialCard)} petId="pet-9" onOpen={jest.fn()} />);
    expect(view.getByTestId('signal-row-headline').props.children).toBe('Diet trial, day 20 of 56');
    await waitFor(() => expect(view.getByTestId('signal-row-headline').props.children).toBe('Rabbit trial, day 21 of 56'));
    expect(mockLoadSignalRowTrial).toHaveBeenCalledWith('pet-9');
  });

  it('no other row reads the trial', () => {
    render(<SignalRow cached={cached(timing)} petId="pet-1" onOpen={jest.fn()} />);
    expect(mockLoadSignalRowTrial).not.toHaveBeenCalled();
  });
});
