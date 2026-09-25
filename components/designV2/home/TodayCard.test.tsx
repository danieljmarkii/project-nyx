// Today's card (D2-4 / CUL-1066): the three states below "has rows" (C-12), the
// ten-event day as eight lines with the day's count line (since History v2 HV-6 /
// CUL-1163 the two meals the lane timed keep their own rows), the quiet day's designed
// empty state, and the phone's copy of the read asked for every row that can carry one
// (CUL-1197) — observed, never triggered — with the `working` fact (C-30) drawing the
// waiting tick. The feedings are handed over in `readFeedingsSince`'s shape: an event id
// and an intake rating on every one (C-35: without the id the lane cannot name its meal,
// and a fixture that drops it tests a day production never builds).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./LookHeader', () => {
  const { View } = require('react-native');
  return { LookHeader: () => <View testID="look-header-stub" /> };
});
const mockReadPhotographed = jest.fn();
const mockReadFeedings = jest.fn();
const mockReadSpans = jest.fn();
const mockReadAnalysis = jest.fn();
const mockReadOnsets = jest.fn();
jest.mock('../../../lib/spineReads', () => ({
  readPhotographedIds: (...a: unknown[]) => mockReadPhotographed(...a),
  readFeedingsSince: (...a: unknown[]) => mockReadFeedings(...a),
  readFreeFedSpans: (...a: unknown[]) => mockReadSpans(...a),
  readAnalysisRows: (...a: unknown[]) => mockReadAnalysis(...a),
  readVomitOnsetsSince: (...a: unknown[]) => mockReadOnsets(...a),
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
    SEP_17.filter((r) => r.event_type === 'meal').map((r) => ({
      id: r.id,
      ms: Date.parse(r.occurred_at),
      confidence: 'witnessed',
      intakeRating: null,
      form: 'Royal Canin · Selected Protein PR',
      foodType: 'meal',
    })),
  );
  mockReadSpans.mockResolvedValue([]);
  mockReadOnsets.mockResolvedValue([]);
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

  it('renders eight lines and the day’s own count line; each meal a line was timed from is its own row', async () => {
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-photo-v1', { includeHiddenElements: true })).toBeTruthy());
    await waitFor(() => expect(t.getByText(/3 min after eating/)).toBeTruthy());
    const line = t.getByTestId('today-count-line');
    const text = (line.props.children as unknown[]).flat(Infinity).map((c) => (typeof c === 'object' && c && 'props' in (c as object) ? (c as { props: { children: unknown } }).props.children : c)).join('');
    expect(text).toBe('10 logged · 2 vomits · 1 cough · 7 meals');
    for (const id of ['m1', 'm2', 'v1', 'compact:m3', 'm5', 'c1', 'v2', 'compact:m6']) {
      expect(t.getByTestId(`spine-node-${id}`)).toBeTruthy();
    }
    // m2 (10:55) is the meal v1's line names; m5 (17:07) is v2's. Neither is folded.
    expect(t.queryByTestId('spine-node-compact:m1')).toBeNull();
    expect(t.getByText(/4 min after eating/)).toBeTruthy();
  });

  it('issues the copy read for every row that can carry a read, and never a trigger', async () => {
    render(<TodayCard />);
    await waitFor(() => expect(mockReadAnalysis).toHaveBeenCalled());
    const ids = mockReadAnalysis.mock.calls.map((c) => [...(c[0] as string[])].sort());
    expect(ids[ids.length - 1]).toEqual(['c1', 'v1', 'v2']);
    const analysis = require('../../../lib/analysis');
    expect(analysis.triggerVomitAnalysis).not.toHaveBeenCalled();
    expect(analysis.triggerStoolAnalysis).not.toHaveBeenCalled();
  });

  it('a day of meals alone reads no copy at all', async () => {
    useEventStore.setState({ todayEvents: SEP_17.filter((r) => r.event_type === 'meal') as never });
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-node-compact:m1')).toBeTruthy());
    await act(async () => {});
    expect(mockReadAnalysis).not.toHaveBeenCalled();
  });

  it('a landed escalation renders even when the local attachment read failed (F5)', async () => {
    mockReadPhotographed.mockRejectedValue(new Error('locked'));
    mockReadAnalysis.mockResolvedValue(
      new Map([['v2', { event_id: 'v2', status: 'completed', recommendation: 'worth_a_call', read_text: 'x', dismissed_at: null }]]),
    );
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Worth a call'));
  });

  it('reads the vomit onsets back by the lane\u2019s episode gap so a midnight bout collapses as the lane collapses it (F2)', async () => {
    render(<TodayCard />);
    await waitFor(() => expect(mockReadOnsets).toHaveBeenCalled());
    const since = Date.parse(mockReadOnsets.mock.calls[0][1] as string);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    expect(dayStart.getTime() - since).toBe(3 * 3_600_000);
  });

  it('a calm read draws nothing on its node; a photographed one with no read on the phone says "Photo not read"', async () => {
    mockReadAnalysis.mockResolvedValue(
      new Map([['v1', { event_id: 'v1', status: 'completed', recommendation: 'monitor', updated_at: '2026-09-25T00:00:00Z' }]]),
    );
    const t = render(<TodayCard />);
    // v2 has no read on the phone: the grey mark, never nothing and never calm.
    await waitFor(() => expect(t.getByTestId('spine-unread-v2')).toBeTruthy());
    await waitFor(() => expect(t.queryByTestId('spine-unread-v1')).toBeNull());
    for (const id of ['spine-read-v1', 'spine-verdict-v1']) expect(t.queryByTestId(id)).toBeNull();
    expect(t.queryByText(/keep an eye out/i)).toBeNull();
  });

  it('CUL-1197: a photographed normal stool is asked about and its "Worth a call" drawn, whatever its tint', async () => {
    useEventStore.setState({ todayEvents: [row('s1', 'stool_normal', 9, 0)] as never });
    mockReadPhotographed.mockResolvedValue(new Set(['s1']));
    mockReadAnalysis.mockImplementation(async (ids: string[]) =>
      new Map(
        ids.includes('s1')
          ? [['s1', { event_id: 's1', status: 'completed', recommendation: 'worth_a_call', updated_at: '2026-09-25T00:00:00Z' }]]
          : [],
      ),
    );
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-verdict-s1').props.children).toBe('Worth a call'));
  });

  it('a chain outstanding for a node is the working fact: the tick waits, then the settle re-reads and the read lands (C-30)', async () => {
    mockOutstanding.mockImplementation((id: string) => id === 'v2');
    const t = render(<TodayCard />);
    await waitFor(() => expect(t.getByTestId('spine-read-rail-v2')).toBeTruthy());
    expect(t.getByText('Reading the photo…')).toBeTruthy();
    // Only the node whose chain is outstanding waits. v1, photographed with no read on
    // the phone, is UNREAD: the grey "Photo not read", never the tick.
    expect(t.getAllByText('Reading the photo…')).toHaveLength(1);
    await waitFor(() => expect(t.getByTestId('spine-unread-v1')).toBeTruthy());
    mockReadAnalysis.mockResolvedValue(
      new Map([['v2', { event_id: 'v2', status: 'completed', recommendation: 'worth_a_call', updated_at: '2026-09-25T00:00:00Z' }]]),
    );
    await act(async () => {
      settleChain?.();
    });
    await waitFor(() => expect(t.getByTestId('spine-verdict-v2').props.children).toBe('Worth a call'));
    // The settle re-read the rows (the read landed from the record, not from the settle
    // itself), and the tick that waited is the rail that landed — same node.
    expect(mockReadAnalysis.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(t.getByTestId('spine-read-rail-v2')).toBeTruthy();
  });
});
