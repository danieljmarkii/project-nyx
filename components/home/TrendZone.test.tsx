// TrendZone — the surface §12 named as having no test file at all, and one of the
// two places the app rendered a "% compliance" nobody had listed (§1.1: v0.9 of
// the spec counted six readers of `diet_trials` and missed this one).
//
// The two PR 4 criteria asserted here:
//   • `TrendZone` renders no `%`
//   • `TrendZone` renders the symptom chart DURING a trial — the compliance
//     branch is gone, so a trial can no longer displace the pet's symptoms
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockUseTrend = jest.fn();
jest.mock('../../hooks/useTrend', () => ({
  useTrend: () => mockUseTrend(),
}));

const mockUsePetStore = jest.fn(() => ({ activePet: { id: 'p1', name: 'Biscuit' } }));
jest.mock('../../store/petStore', () => ({
  usePetStore: () => mockUsePetStore(),
}));

import { render } from '@testing-library/react-native';
import { TrendZone } from './TrendZone';
import type { TrendData } from '../../hooks/useTrend';

/** 14 UTC day keys ending today, matching `buildBuckets`' key space. */
function buckets(fill: (i: number) => { symptomCount: number; mealCount: number }) {
  return Array.from({ length: 14 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - idx));
    return { date: d.toISOString().split('T')[0], ...fill(idx) };
  });
}

function trendData(over: Partial<TrendData> = {}): TrendData {
  return {
    mode: 'symptom',
    buckets: buckets((i) => ({ symptomCount: i % 3 === 0 ? 2 : 0, mealCount: 2 })),
    trialStartDayKey: null,
    hasEnoughData: true,
    dominantSymptomType: 'itch',
    thisWeekSymptomCount: 2,
    lastWeekSymptomCount: 6,
    thisWeekMealDays: 7,
    lastWeekMealDays: 7,
    ...over,
  };
}

beforeEach(() => {
  mockUseTrend.mockReset();
  mockUsePetStore.mockReturnValue({ activePet: { id: 'p1', name: 'Biscuit' } });
});

describe('TrendZone during a diet trial', () => {
  it('renders the symptom chart, not a compliance bar', () => {
    const data = trendData({ trialStartDayKey: buckets(() => ({ symptomCount: 0, mealCount: 0 }))[3].date });
    mockUseTrend.mockReturnValue({ data, isLoading: false });

    const tree = render(<TrendZone />);
    // The symptom chart's header — the compliance branch had none of this.
    expect(tree.getByText('Itch/Scratch')).toBeTruthy();
    expect(tree.getByText('2 this week')).toBeTruthy();
  });

  it('marks the day the trial diet started instead of taking the chart over', () => {
    const b = buckets(() => ({ symptomCount: 1, mealCount: 1 }));
    mockUseTrend.mockReturnValue({
      data: trendData({ buckets: b, trialStartDayKey: b[3].date }),
      isLoading: false,
    });

    const tree = render(<TrendZone />);
    expect(tree.getByTestId('trial-start-marker')).toBeTruthy();
    // The marker is a thin rule, so it is named in words too.
    expect(tree.getByText(/^Trial diet started /)).toBeTruthy();
  });

  it('renders no marker when no trial is running', () => {
    mockUseTrend.mockReturnValue({ data: trendData(), isLoading: false });
    const tree = render(<TrendZone />);
    expect(tree.queryByTestId('trial-start-marker')).toBeNull();
    expect(tree.queryByText(/Trial diet started/)).toBeNull();
  });
});

describe('TrendZone renders no percentage, in any mode', () => {
  const MODES: Array<[string, TrendData]> = [
    ['symptom', trendData()],
    ['symptom, during a trial', trendData({ trialStartDayKey: null })],
    ['feeding', trendData({ mode: 'feeding' })],
    ['empty', trendData({ hasEnoughData: false })],
  ];

  it.each(MODES)('%s', (_name, data) => {
    mockUseTrend.mockReturnValue({ data, isLoading: false });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/%/)).toBeNull();
    expect(tree.queryByText(/compliance/i)).toBeNull();
    // The exact deleted string, pinned so it cannot come back by another route.
    expect(tree.queryByText(/food compliance/i)).toBeNull();
    expect(tree.queryByText(/days logged/i)).toBeNull();
  });

  it('renders no percentage while loading', () => {
    mockUseTrend.mockReturnValue({ data: null, isLoading: true });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/%/)).toBeNull();
  });
});
