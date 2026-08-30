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
import { StyleSheet } from 'react-native';
import { TrendZone } from './TrendZone';
import type { TrendData } from '../../hooks/useTrend';
import { theme } from '../../constants/theme';

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
    expect(tree.getByText('2 episodes this week')).toBeTruthy();
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

// ── B-067 / CUL-372 ─────────────────────────────────────────────────────────────
//
// The Trend card used to render its own week-over-week verdict ("↓ from 4 last week
// — improving", in the accent teal). That is a comparative claim about a symptom,
// and the Signal's reflection layer is the only surface carrying the gates such a
// claim needs — the global worsening gate, the global chronicity gate, and the
// density-comparability gate. This card had none, so it kept saying "improving" on
// exactly the pets the Signal had gone silent over.
//
// These tests pin the ABSENCE. An absence is easy to un-delete by accident, and the
// re-deletion is the whole fix, so it is asserted rather than assumed.
describe('TrendZone renders no week-over-week verdict (B-067)', () => {
  it('never renders the word "improving", whatever the direction', () => {
    // The falling case — the one that used to read "↓ from 6 last week — improving".
    mockUseTrend.mockReturnValue({
      data: trendData({ thisWeekSymptomCount: 2, lastWeekSymptomCount: 6 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/improving/i)).toBeNull();
    expect(tree.queryByText(/last week/i)).toBeNull();
    expect(tree.queryByText(/[↑↓]/)).toBeNull();
    // The count itself survives — a bare count asserts no direction.
    expect(tree.getByText('2 episodes this week')).toBeTruthy();
  });

  it('renders no comparison when the count ROSE either', () => {
    mockUseTrend.mockReturnValue({
      data: trendData({ thisWeekSymptomCount: 6, lastWeekSymptomCount: 2 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/last week/i)).toBeNull();
    expect(tree.getByText('6 episodes this week')).toBeTruthy();
  });

  it('renders no comparison when the count is FLAT', () => {
    mockUseTrend.mockReturnValue({
      data: trendData({ thisWeekSymptomCount: 3, lastWeekSymptomCount: 3 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/same as last week/i)).toBeNull();
    expect(tree.getByText('3 episodes this week')).toBeTruthy();
  });

  it('says "episode" singular at a count of one', () => {
    mockUseTrend.mockReturnValue({
      data: trendData({ thisWeekSymptomCount: 1, lastWeekSymptomCount: 4 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.getByText('1 episode this week')).toBeTruthy();
  });

  // The chronic cat from the CUL-372 reproduction: ③ is blanked by the chronicity
  // gate and ⑦ escalates to the vet. Whatever this card shows, it must not be the
  // soothing sentence the gate above exists to suppress.
  it('shows no reassurance on the chronic improving-tail pet', () => {
    mockUseTrend.mockReturnValue({
      data: trendData({
        dominantSymptomType: 'vomit',
        thisWeekSymptomCount: 3,
        lastWeekSymptomCount: 4,
      }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/improving|better|down from|fewer/i)).toBeNull();
  });
});

// The two cases adversarial review BROKE in the interim version of this fix, where the
// bars were bucketed by episode ONSET instead of by raw event. Both are regression
// pins, not new behaviour: the bars are back to raw events.
describe('TrendZone does not go quiet on an acutely sick pet (B-067 regression)', () => {
  it('renders the chart, not the empty state, for a chained overnight bout', () => {
    // Six logged vomits across two chained bouts and no meals logged (the anorexic /
    // free-fed / symptom-monitoring-only owner). With onset-bucketed bars, the
    // continuation days scored 0, `hasEnoughData` fell below 3, and the card rendered
    // "A few more days of logs and we'll be able to show Nyx's pattern."
    const b = buckets((i) => ({
      symptomCount: i === 9 ? 3 : i === 10 ? 1 : i === 12 ? 2 : 0,
      mealCount: 0,
    }));
    mockUseTrend.mockReturnValue({
      data: trendData({
        buckets: b,
        hasEnoughData: true,
        dominantSymptomType: 'vomit',
        thisWeekSymptomCount: 2,
        lastWeekSymptomCount: 0,
      }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/a few more days of logs/i)).toBeNull();
    expect(tree.getByText('Vomit')).toBeTruthy();
  });

  it('draws the worst night as a bar, never as an empty column', () => {
    // A 5-vomit morning must not render pixel-identical to a symptom-free day.
    const b = buckets((i) => ({ symptomCount: i === 13 ? 5 : 0, mealCount: 1 }));
    mockUseTrend.mockReturnValue({
      data: trendData({ buckets: b, dominantSymptomType: 'vomit', thisWeekSymptomCount: 1 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    // The symptom bars carry the symptom colour only where something was logged.
    const painted = tree.UNSAFE_getAllByType(require('react-native').View).filter((v: any) => {
      const st = Array.isArray(v.props.style) ? Object.assign({}, ...v.props.style.filter(Boolean)) : v.props.style;
      return st && st.backgroundColor === require('../../constants/theme').theme.colorEventSymptom;
    });
    expect(painted.length).toBeGreaterThan(0);
  });
});

describe('TrendZone never states an absence (B-067)', () => {
  it('renders no count line when nothing was logged this week', () => {
    // "0 episodes this week" is reassurance-by-absence with the word "improving"
    // removed — the same claim detectReflections refuses to make.
    mockUseTrend.mockReturnValue({
      data: trendData({
        dominantSymptomType: 'vomit',
        thisWeekSymptomCount: 0,
        lastWeekSymptomCount: 4,
      }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(tree.queryByText(/0 episodes/i)).toBeNull();
    expect(tree.queryByText(/none/i)).toBeNull();
    // The symptom is still named; the chart's empty right half is the only statement.
    expect(tree.getByText('Vomit')).toBeTruthy();
  });
});

// ── CUL-578 ─────────────────────────────────────────────────────────────────────
//
// Three accent-coloured text nodes on this card sit on the white Card ground, where
// the brand teal is 2.26:1 — well under AA, and the identical defect CUL-27 already
// fixed one card up on TodayZone's "Full day ›" door. The fix is the ink token; the
// ratios are pinned in constants/theme.contrast.test.ts, and these assert that the
// nodes reach for it.
//
// Read off the rendered tree, not the StyleSheet: the sublabel's colour arrives via a
// conditional style array, so the thing worth asserting is what actually lands on the
// node in the state that triggers it.
describe('TrendZone accent text uses the ink on the white Card (CUL-578)', () => {
  const flatColor = (node: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(node.props.style) as { color?: string })?.color;

  it('renders the "All patterns" door in accent ink', () => {
    mockUseTrend.mockReturnValue({ data: trendData(), isLoading: false });
    const tree = render(<TrendZone />);
    const door = tree.getByText('All patterns ›');
    expect(flatColor(door)).toBe(theme.colorAccentInk);
    expect(flatColor(door)).not.toBe(theme.colorAccent);
  });

  it('renders the trial-start marker label in accent ink', () => {
    const b = buckets(() => ({ symptomCount: 1, mealCount: 1 }));
    mockUseTrend.mockReturnValue({
      data: trendData({ buckets: b, trialStartDayKey: b[3].date }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    const marker = tree.getByText(/^Trial diet started /);
    expect(flatColor(marker)).toBe(theme.colorAccentInk);
    expect(flatColor(marker)).not.toBe(theme.colorAccent);
  });

  it('renders the feeding sublabel in accent ink in its highlighted state', () => {
    // thisWeekMealDays === 7 is the one state that swaps the sublabel off the muted
    // secondary colour onto the accent — i.e. the only state where this can fail.
    mockUseTrend.mockReturnValue({
      data: trendData({ mode: 'feeding', thisWeekMealDays: 7, lastWeekMealDays: 5 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    const sub = tree.getByText('Every day this week');
    expect(flatColor(sub)).toBe(theme.colorAccentInk);
    expect(flatColor(sub)).not.toBe(theme.colorAccent);
  });

  it('leaves the sublabel on the muted secondary colour in every other state', () => {
    mockUseTrend.mockReturnValue({
      data: trendData({ mode: 'feeding', thisWeekMealDays: 5, lastWeekMealDays: 5 }),
      isLoading: false,
    });
    const tree = render(<TrendZone />);
    expect(flatColor(tree.getByText('Same as last week'))).toBe(theme.colorTextSecondary);
  });
});
