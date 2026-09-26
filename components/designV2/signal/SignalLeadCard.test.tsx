// The Signal card on Home under Design v2 (D2-3 · CUL-1065): a title, a chart and one
// line; the face is a door, never a fold; a safety finding keeps the shipped plain card
// (S1) with the same door; the read is this component's, so its absence is the flag-off
// guard's async half (asserted from the zone's suite).

const mockReduced = jest.fn(() => false);
jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced() }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: () => true }));
const mockLoadSignalLead = jest.fn();
jest.mock('../../../lib/signalLead', () => ({
  loadSignalLead: (...a: unknown[]) => mockLoadSignalLead(...a),
  loadSignalRowTrial: async () => null,
}));
// The measurement is the platform's; the suite plays it (D2-6). Default: a real rect.
let mockRect: { x: number; y: number; width: number; height: number } | null = { x: 67, y: 300, width: 278, height: 130 };
jest.mock('../../../lib/measureNode', () => ({
  measureNodeInWindow: (_node: unknown, cb: (r: unknown) => void) => cb(mockRect),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { theme } from '../../../constants/theme';
import { LEAD_CHART_INSETS, SignalLeadCard, leadChartWidth } from './SignalLeadCard';
import { RAIL_WIDTH } from '../../home/InsightCard';
import { DOOR_A11Y_HINT } from './SignalRow';
import { Card } from '../../ui/Card';
import { abortFlight, getFlightState, landFlight, reverseFlight, setHeroReady, settleOutbound } from '../../motion/flightMotion';
import * as fs from 'fs';
import * as path from 'path';
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
  mockReduced.mockReturnValue(false);
  mockRect = { x: 67, y: 300, width: 278, height: 130 };
  abortFlight();
  mockLoadSignalLead.mockResolvedValue(leadModel());
});
afterEach(() => abortFlight());

describe('SignalLeadCard — a benign lead', () => {
  it('is a skeleton while the read is in flight, then the title, the bars and the line', async () => {
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
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
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    const face = view.getByTestId('signal-lead-face');
    expect(face.props.accessibilityHint).toBe(DOOR_A11Y_HINT);
    expect(face.props.accessibilityLabel).toBe(`Vomiting, the last 2 weeks. ${weekLine(leadModel().weekly)}.`);
    fireEvent.press(face);
    // The door measures first (D2-6) — the platform's answer, or the grace, then the open.
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(reflection.finding));
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    expect(view.queryByTestId('insight-evidence-control')).toBeNull();
    expect(view.queryByTestId('insight-folded-strip')).toBeNull();
  });

  it('a read that fails falls back to the Signal row (CUL-1270), with the same door', async () => {
    mockLoadSignalLead.mockRejectedValue(new Error('sqlite'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-row')).toBeTruthy());
    expect(view.queryByTestId('weekly-bars')).toBeNull();
    fireEvent.press(view.getByTestId('signal-row'));
    expect(onOpen).toHaveBeenCalledWith(reflection.finding);
    expect(view.queryByTestId('insight-fold-control')).toBeNull();
    warn.mockRestore();
  });
});

describe('SignalLeadCard — a safety lead is the plain Signal row (S1)', () => {
  it.each([safety, { rank: 0, text: 'Nyx has eaten less than usual for 3 days. Call your vet today.', finding: intake }])(
    'renders no chart, no read, the row as the door',
    async (cached) => {
      const onOpen = jest.fn();
      const view = render(<SignalLeadCard cached={cached} petId="pet-1" onOpen={onOpen} />);
      expect(view.getByTestId('signal-row')).toBeTruthy();
      expect(view.getByTestId('signal-row-ask')).toBeTruthy();
      expect(view.queryByTestId('signal-lead-skeleton')).toBeNull();
      expect(view.queryByTestId('weekly-bars')).toBeNull();
      expect(mockLoadSignalLead).not.toHaveBeenCalled();
      expect(view.getByTestId('signal-row').props.accessibilityHint).toBe(DOOR_A11Y_HINT);
      await act(async () => {
        fireEvent.press(view.getByTestId('signal-row'));
      });
      expect(onOpen).toHaveBeenCalledWith(cached.finding);
      // No control row on a door — the fold control moved to the screen and the strip.
      expect(view.queryByTestId('insight-fold-control')).toBeNull();
      expect(view.queryByTestId('insight-evidence-control')).toBeNull();
    },
  );
});

describe('the flight’s door (D2-6 · CUL-1069)', () => {
  it('a press measures the chart, stages the flight with the chart’s own element and the title, then opens', async () => {
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    expect(getFlightState().phase).toBe('idle');
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    const s = getFlightState();
    expect(s.phase).toBe('staged');
    expect(s.flight).toMatchObject({ identity: 'reflection:vomit', title: 'Vomiting, the last 2 weeks', source: mockRect });
    expect(s.flight?.element.props).toMatchObject({ noun: 'vomiting', identity: 'reflection:vomit' });
    expect(onOpen).toHaveBeenCalledWith(reflection.finding);
    // While the flight is live for this finding the chart is hidden — the clone IS the chart.
    expect(StyleSheet.flatten(view.getByTestId('signal-lead-chart').props.style)).toMatchObject({ opacity: 0 });
  });

  it('the chart shows again once the flight is released, and hides again on the way back', async () => {
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    act(() => {
      landFlight('reflection:vomit', { x: 16, y: 180, width: 361, height: 168 });
      settleOutbound();
      setHeroReady('reflection:vomit', true);
    });
    expect(getFlightState().phase).toBe('idle');
    expect(StyleSheet.flatten(view.getByTestId('signal-lead-chart').props.style)?.opacity).toBeUndefined();
    act(() => {
      reverseFlight('reflection:vomit');
    });
    expect(StyleSheet.flatten(view.getByTestId('signal-lead-chart').props.style)).toMatchObject({ opacity: 0 });
  });

  it('on the way back the card re-measures and retargets the clone to where the chart is NOW; zeros are declined', async () => {
    jest.useFakeTimers();
    try {
      const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={jest.fn()} />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(view.getByTestId('signal-lead-face')).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByTestId('signal-lead-face'));
      });
      act(() => landFlight('reflection:vomit', { x: 16, y: 180, width: 361, height: 168 }));
      mockRect = { x: 67, y: 340, width: 278, height: 130 };
      act(() => {
        reverseFlight('reflection:vomit');
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(getFlightState().flight?.source.y).toBe(340);
      mockRect = { x: 0, y: 0, width: 0, height: 0 };
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      expect(getFlightState().flight?.source.y).toBe(340);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a measurement the platform declines → the plain door, nothing staged', async () => {
    mockRect = null;
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(getFlightState().phase).toBe('idle');
    mockRect = { x: 0, y: 0, width: 0, height: 0 };
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(getFlightState().phase).toBe('idle');
  });

  it('reduced motion → the plain door: nothing is measured or staged', async () => {
    mockReduced.mockReturnValue(true);
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    expect(onOpen).toHaveBeenCalledWith(reflection.finding);
    expect(getFlightState().phase).toBe('idle');
  });

  it('a chartless lead (a finding that counts no symptom) opens plainly', async () => {
    mockLoadSignalLead.mockResolvedValue({ title: 'Rabbit trial, day 5 of 56', weekly: null, line: null, noun: null, trial: null });
    const onOpen = jest.fn();
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={onOpen} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-face')).toBeTruthy());
    expect(view.queryByTestId('signal-lead-chart')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('signal-lead-face'));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(getFlightState().phase).toBe('idle');
  });

  it('`leadChartWidth` is pinned term by term against the rendered styles — the page, the Card, the rail, the row’s gap', async () => {
    // The page's padding: Home's scroll container (`app/(tabs)/index.tsx`), read at source.
    const home = fs.readFileSync(path.join(__dirname, '../../../app/(tabs)/index.tsx'), 'utf8');
    expect(home).toMatch(/scroll:\s*\{\s*padding:\s*theme\.space3\b/);
    expect(LEAD_CHART_INSETS.pagePadding).toBe(theme.space3);
    // The zone's Card: its rendered padding.
    const card = render(<Card testID="c">{null}</Card>);
    expect(StyleSheet.flatten(card.getByTestId('c').props.style).padding).toBe(LEAD_CHART_INSETS.cardPadding);
    // The rail and the row's gap, off the card's own rendered row.
    const view = render(<SignalLeadCard cached={reflection} petId="pet-1" onOpen={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('signal-lead-card')).toBeTruthy());
    const row = StyleSheet.flatten(view.getByTestId('signal-lead-card').props.style);
    expect(row.gap).toBe(LEAD_CHART_INSETS.rowGap);
    expect(LEAD_CHART_INSETS.rail).toBe(RAIL_WIDTH);
    expect(leadChartWidth(393)).toBe(393 - 2 * theme.space3 - 2 * theme.space3 - RAIL_WIDTH - theme.space2);
  });
});
