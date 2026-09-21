// The Signal card on Home under Design v2 (D2-3 · CUL-1065): a title, a chart and one
// line; the face is a door, never a fold; a safety finding keeps the shipped plain card
// (S1) with the same door; the read is this component's, so its absence is the flag-off
// guard's async half (asserted from the zone's suite).

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: () => true }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../../lib/signalLead', () => ({ loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a) }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SignalLeadCard } from './SignalLeadCard';
import { DOOR_A11Y_HINT } from '../../home/InsightCard';
import type { CachedFinding, IntakeDeclineFinding, SymptomChronicityFinding } from '../../../lib/signal';
import { signalWeeks, weekLine } from '../../../lib/signalWindows';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from '../../../lib/utils';

const shift = (key: string, d: number) => dayKeyFromIndex((localDayIndexOf(key) as number) + d);

const chronicity: SymptomChronicityFinding = {
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
};
// A benign lead: the same record, the insight class (a reflection).
const reflection: CachedFinding = {
  rank: 0,
  text: 'Nyx vomited 2 times this week, 5 the week before.',
  finding: { type: 'reflection', priorityClass: 'insight', symptomType: 'vomit', currentCount: 2, priorCount: 5, direction: 'improving', windowDays: 14 },
};
const safety: CachedFinding = { rank: 0, text: 'Nyx has vomited 14 times across 5 of the last 8 weeks. Worth a vet visit.', finding: chronicity };
const intake: IntakeDeclineFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
};

function leadModel() {
  const today = toLocalDayKey(new Date());
  const weekly = signalWeeks({ finding: reflection.finding, today, trial: null, episodeDays: [today, shift(today, -8)], loggedDays: [today] });
  return { title: 'Vomiting, the last 2 weeks', weekly, line: weekLine(weekly), noun: 'vomiting', trial: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSignalLead.mockResolvedValue(leadModel());
});

describe('SignalLeadCard — a benign lead', () => {
  it('is a skeleton while the read is in flight, then the title, the bars and the line', async () => {
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" petName="Nyx" onOpen={onOpen} />);
    expect(view.getByTestId('signal-lead-skeleton')).toBeTruthy();
    expect(view.queryByTestId('signal-lead-card')).toBeNull();
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    expect(view.getByTestId('signal-lead-title').props.children).toBe('Vomiting, the last 2 weeks');
    expect(view.getByTestId('weekly-bars')).toBeTruthy();
    expect(view.getByTestId('signal-lead-line').props.children).toBe(weekLine(leadModel().weekly));
    // The read is for the ZONE's pet (C-9), with the cached finding.
    expect(mockLoadSignalLead).toHaveBeenCalledWith('pet-1', reflection);
  });

  it('the face is ONE door: it opens, never folds, never expands; the label is the title and the line', async () => {
    const onOpen = jest.fn();
    const onTouch = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" petName="Nyx" onOpen={onOpen} onTouch={onTouch} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    const face = view.getByTestId('signal-lead-face');
    expect(face.props.accessibilityHint).toBe(DOOR_A11Y_HINT);
    expect(face.props.accessibilityLabel).toBe(`Vomiting, the last 2 weeks. ${weekLine(leadModel().weekly)}.`);
    fireEvent.press(face);
    expect(onOpen).toHaveBeenCalledWith(reflection.finding);
    expect(onTouch).toHaveBeenCalledWith(reflection.finding);
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    expect(view.queryByTestId('insight-evidence-control')).toBeNull();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
  });

  it('a read that fails falls back to the shipped card, with the same door', async () => {
    mockLoadSignalLead.mockRejectedValue(new Error('sqlite'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" petName="Nyx" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('insight-face')).toBeTruthy());
    expect(view.queryByTestId('weekly-bars')).toBeNull();
    fireEvent.press(view.getByTestId('insight-face'));
    expect(onOpen).toHaveBeenCalledWith(reflection.finding);
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    warn.mockRestore();
  });
});

describe('SignalLeadCard — a safety lead keeps the shipped plain card (S1)', () => {
  it.each([safety, { rank: 0, text: 'Nyx has eaten less than usual for 3 days. Call your vet today.', finding: intake }])(
    'renders no chart, no read, the shipped face as the door',
    async (cached) => {
      const onOpen = jest.fn();
      const view = render(<SignalLeadCard cached={cached} petId="pet-1" petName="Nyx" onOpen={onOpen} />);
      expect(view.getByTestId('insight-face')).toBeTruthy();
      expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
      expect(view.queryByTestId('weekly-bars')).toBeNull();
      expect(mockLoadSignalLead).not.toHaveBeenCalled();
      expect(view.getByTestId('insight-face').props.accessibilityHint).toBe(DOOR_A11Y_HINT);
      await act(async () => {
        fireEvent.press(view.getByTestId('insight-face'));
      });
      expect(onOpen).toHaveBeenCalledWith(cached.finding);
      // No control row on a door — the fold control moved to the screen and the strip.
      expect(view.queryByTestId('insight-fold-control')).toBeNull();
      expect(view.queryByTestId('insight-evidence-control')).toBeNull();
    },
  );
});
