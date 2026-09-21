// Today's card (D2-4 / CUL-1066): the three states below "has rows" (C-12), the
// ten-event day as six nodes with the day's count line, the quiet day's designed empty
// state, and the analysis read issued for photographed symptoms only — observed, never
// triggered — with the `working` fact (C-30) drawing the waiting tick.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./LookHeader', () => {
  const { View } = require('react-native');
  return { LookHeader: () => <View testID="look-header-stub" /> };
});
const mockReadPhotographed = jest.fn();
const mockReadFeedings = jest.fn();
const mockReadSpans = jest.fn();
const mockReadAnalysis = jest.fn();
jest.mock('../../../lib/spineReads', () => ({
  readPhotographedIds: (...a: unknown[]) => mockReadPhotographed(...a),
  readFeedingsSince: (...a: unknown[]) => mockReadFeedings(...a),
  readFreeFedSpans: (...a: unknown[]) => mockReadSpans(...a),
  readAnalysisRows: (...a: unknown[]) => mockReadAnalysis(...a),
}));
const mockOutstanding = jest.fn((_id: string) => false);
let settleChain: (() => void) | null = null;
jest.mock('../../../lib/analysis', () => ({
  analysisChainOutstanding: (id: string) => mockOutstanding(id),
  awaitAnalysisChain: () => new Promise<boolean>((r) => { settleChain = () => r(true); }),
  triggerVomitAnalysis: jest.fn(),
  triggerStoolAnalysis: jest.fn(),
  watchAnalysisRow: jest.fn(() => () => {}),
}));
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const mockLoad = jest.fn();
jest.mock('../../../hooks/useEvents', () => ({
  useEvents: () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    todayEvents: require('../../../store/eventStore').useEventStore((s: any) => s.todayEvents),
    loadTodayEvents: () => mockLoad(),
  }),
}));
jest.mock('../../../store/petStore', () => ({
  usePetStore: (sel: (s: any) => unknown) => sel({ activePet: { id: 'p1', name: 'Nyx', species: 'cat' } }),
}));
jest.mock('../../../store/syncStore', () => ({
  useSyncStore: (sel: (s: { hydrationTick: number }) => unknown) => sel({ hydrationTick: 0 }),
}));

import { act, render, waitFor } from '@testing-library/react-native';
import { useEventStore } from '../../../store/eventStore';
import { TODAY_EMPTY_LINE, TODAY_EMPTY_LOOK_LINE, TODAY_FAILED_LINE, TodayCard } from './TodayCard';

const at = (h: number, m: number): string => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const row = (id: string, event_type: string, h: number, m: number, extra: Record<string, unknown> = {}) => ({
  id, pet_id: 'p1', event_type, occurred_at: at(h, m), occurred_at_confidence: 'witnessed', ...extra,
});
const PR = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' };
const SEP_17 = [
  row('m7', 'meal', 22, 39, PR), row('m6', 'meal', 17, 39, PR), row('v2', 'vomit', 17, 11), row('c1', 'cough', 17, 9),
  row('m5', 'meal', 17, 7, PR), row('m4', 'meal', 15, 2, PR), row('m3', 'meal', 12, 41, PR), row('v1', 'vomit', 10, 58),
  row('m2', 'meal', 10, 55, PR), row('m1', 'meal', 5, 47, PR),
];

beforeEach(() => {
  jest.clearAllMocks();
  settleChain = null;
  mockOutstanding.mockReturnValue(false);
  mockReadPhotographed.mockResolvedValue(new Set(['v1', 'v2']));
  mockReadFeedings.mockResolvedValue(
    SEP_17.filter((r) => r.event_type === 'meal').map((r) => ({ ms: Date.parse(r.occurred_at), confidence: 'witnessed', form: null, foodType: 'meal' })),
  );
  mockReadSpans.mockResolvedValue([]);
  mockReadAnalysis.mockResolvedValue(new Map());
  useEventStore.setState({ todayEvents: [], todayRead: null });
});

describe('the three states below "has rows" (C-12)', () => {
  it('a read that has not answered is a skeleton, never an empty record', () => {
    const t = render(<TodayCard />);
    expect(t.queryByTestId('today-empty')).toBeNull();
    expect(t.queryByTestId('home-spine')).toBeNull();
  });

  it('a read for ANOTHER pet is still a skeleton for this one', () => {
    useEventStore.setState({ todayRead: { petId: 'p2', state: 'ready' } });
    const t = render(<TodayCard />);
    expect(t.queryByTestId('today-empty')).toBeNull();
  });

  it('a failed read says so and offers a retry that re-runs the loader', () => {
    useEventStore.setState({ todayRead: { petId: 'p1', state: 'failed' } });
    const t = render(<TodayCard />);
    expect(t.getByText(TODAY_FAILED_LINE)).toBeTruthy();
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(t.getByText('Try again'));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('the quiet day: the designed empty state, with the look’s sentence for a cat', () => {
    useEventStore.setState({ todayRead: { petId: 'p1', state: 'ready' } });
    const t = render(<TodayCard />);
    const empty = t.getByTestId('today-empty');
    expect(empty).toBeTruthy();
    expect(t.getByText(TODAY_EMPTY_LINE, { exact: false })).toBeTruthy();
    expect(t.getByText(TODAY_EMPTY_LOOK_LINE, { exact: false })).toBeTruthy();
    expect(t.queryByTestId('today-count-line')).toBeNull();
    // No exclamation, no verdict about the pet (nyx-voice).
    expect(TODAY_EMPTY_LINE + TODAY_EMPTY_LOOK_LINE).not.toMatch(/!/);
  });

  it('a day holding only a look is still the quiet day', () => {
    useEventStore.setState({
      todayRead: { petId: 'p1', state: 'ready' },
      todayEvents: [row('lk', 'check_in', 9, 0, { look_outcome: 'observed', look_words: 'subdued' }) as never],
    });
    const t = render(<TodayCard />);
    expect(t.getByTestId('today-empty')).toBeTruthy();
  });
});

describe('the ten-event day', () => {
  beforeEach(() => {
    useEventStore.setState({ todayRead: { petId: 'p1', state: 'ready' }, todayEvents: SEP_17 as never });
  });

  it('renders six nodes and the day’s own count line', async () => {
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-photo-v1', { includeHiddenElements: true })).toBeTruthy());
    const line = t.getByTestId('today-count-line');
    const text = (line.props.children as unknown[]).flat(Infinity).map((c) => (typeof c === 'object' && c && 'props' in (c as object) ? (c as { props: { children: unknown } }).props.children : c)).join('');
    expect(text).toBe('10 logged · 2 vomits · 1 cough · 7 meals');
    expect(t.getByTestId('spine-node-compact:m1')).toBeTruthy();
    expect(t.getByTestId('spine-node-v1')).toBeTruthy();
    expect(t.getByTestId('spine-node-compact:m3')).toBeTruthy();
    expect(t.getByTestId('spine-node-c1')).toBeTruthy();
    expect(t.getByTestId('spine-node-v2')).toBeTruthy();
    expect(t.getByTestId('spine-node-compact:m6')).toBeTruthy();
    expect(t.getByText(/3 min after eating/)).toBeTruthy();
    expect(t.getByText(/4 min after eating/)).toBeTruthy();
  });

  it('issues the analysis read for the PHOTOGRAPHED symptoms only, and never a trigger', async () => {
    render(<TodayCard />);
    await waitFor(() => expect(mockReadAnalysis).toHaveBeenCalled());
    const ids = mockReadAnalysis.mock.calls.map((c) => [...(c[0] as string[])].sort());
    expect(ids[ids.length - 1]).toEqual(['v1', 'v2']);
    const analysis = require('../../../lib/analysis');
    expect(analysis.triggerVomitAnalysis).not.toHaveBeenCalled();
    expect(analysis.triggerStoolAnalysis).not.toHaveBeenCalled();
  });

  it('a day with no photographed symptom issues NO server read at all', async () => {
    mockReadPhotographed.mockResolvedValue(new Set());
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-node-v1')).toBeTruthy());
    await act(async () => {});
    expect(mockReadAnalysis).not.toHaveBeenCalled();
  });

  it('a landed read renders on its node in the shipped words', async () => {
    mockReadAnalysis.mockResolvedValue(
      new Map([['v1', { event_id: 'v1', status: 'completed', recommendation: 'monitor', read_text: 'x', dismissed_at: null }]]),
    );
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-verdict-v1').props.children).toBe('Keep an eye out'));
    expect(t.queryByTestId('spine-verdict-v2')).toBeNull();
  });

  it('a chain outstanding for a node is the working fact: the tick waits, then the settle re-reads and the read lands (C-30)', async () => {
    mockOutstanding.mockImplementation((id: string) => id === 'v2');
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-read-rail-v2')).toBeTruthy());
    expect(t.getByText('Reading the photo…')).toBeTruthy();
    expect(t.queryByTestId('spine-read-rail-v1')).toBeNull();
    mockReadAnalysis.mockResolvedValue(
      new Map([['v2', { event_id: 'v2', status: 'completed', recommendation: 'monitor', read_text: 'Second one today.', dismissed_at: null }]]),
    );
    await act(async () => {
      settleChain?.();
    });
    await waitFor(() => expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Keep an eye out'));
    // The settle re-read the rows (the read landed from the record, not from the settle
    // itself), and the tick that waited is the rail that landed — same node.
    expect(mockReadAnalysis.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(t.getByTestId('spine-read-rail-v2')).toBeTruthy();
  });
});
