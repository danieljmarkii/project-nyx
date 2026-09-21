// The month instrument (CUL-1067) against its acceptance criteria — what only the
// COMPONENT can get wrong. The counts live in `lib/monthModel.test.ts`; here: the bars
// draw over the rows, every day mark keeps its date with the count in its corner, a layer
// toggles without changing coverage, the legend carries left-some, the arrows page and
// re-draw, the day opens in place and closes, one at a time, and a read that has not
// answered is a skeleton, never an empty month.

jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock('../../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));
jest.mock('../../../lib/monthReads', () => ({
  readMonthFacts: jest.fn(),
  readDayRows: jest.fn(),
}));
// lib/weight and lib/dayEvents reach lib/supabase (a fail-fast env check under jest) through
// lib/sync; stubbed the way every sibling component suite stubs them.
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../lib/sync', () => ({
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
  syncPendingFeedingArrangements: jest.fn(),
}));
jest.mock('../../../lib/db', () => ({ getDb: () => ({}), getTimeline: jest.fn() }));

import { act, configure, fireEvent, render, waitFor } from '@testing-library/react-native';
import { LayoutAnimation, StyleSheet } from 'react-native';
import { MonthInstrument } from './MonthInstrument';
import { monthReadRange } from '../../../lib/monthModel';
import type { MonthFacts } from '../../../lib/monthReads';
import { theme } from '../../../constants/theme';
import { dayKeyFromIndex, localDayIndexOf } from '../../../lib/utils';

configure({ defaultIncludeHiddenElements: true });

const flat = (style: unknown): Record<string, unknown> => StyleSheet.flatten(style as never) as Record<string, unknown>;
const range = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let i = localDayIndexOf(from) as number; i <= (localDayIndexOf(to) as number); i++) out.push(dayKeyFromIndex(i));
  return out;
};

// The mock's month: September 2026, today Thursday the 17th.
const TODAY = '2026-09-17';

function facts(over: Partial<MonthFacts> = {}): MonthFacts {
  return {
    episodeDays: ['2026-09-02', '2026-09-02', '2026-09-05', '2026-09-11', '2026-09-11', '2026-09-16'],
    loggedDays: range('2026-07-01', TODAY).filter((k) => k !== '2026-09-08' && k !== '2026-09-09'),
    leftSomeDays: ['2026-09-04'],
    dosedDays: ['2026-09-03'],
    photoDays: [{ day: '2026-09-02', verdict: 'worth_a_call' }],
    recordStart: '2026-05-10',
    ...over,
  };
}

const row = (id: string, type: string, iso: string) =>
  ({
    id, pet_id: 'p1', event_type: type, occurred_at: iso, occurred_at_confidence: null, occurred_at_earliest: null,
    occurred_at_latest: null, severity: null, notes: null, source: 'app', deleted_at: null, created_at: iso, updated_at: iso,
    food_item_id: null, quantity: null, food_brand: null, food_product_name: null, food_type: null, food_format: null,
    intake_rating: null, weight_kg: null, medication_item_id: null, adherence: null, how_given: null,
  }) as never;

type ReadFacts = (petId: string, range: { fromKey: string; toKey: string }) => Promise<MonthFacts>;
type ReadDay = (petId: string, dayKey: string) => Promise<never[]>;
function mount(readFacts: ReadFacts = jest.fn(async () => facts()), readDay: ReadDay = jest.fn(async () => [])) {
  const api = render(<MonthInstrument petId="p1" today={TODAY} readFacts={readFacts} readDay={readDay} trialMark={{ day: '2026-07-25', label: 'trial · Jul 25' }} />);
  return { ...api, readFacts, readDay };
}

beforeEach(() => {
  jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('MonthInstrument', () => {
  it('a read that has not answered is a skeleton, never an empty month (C-12); then the month', async () => {
    let answer: (f: MonthFacts) => void = () => undefined;
    const readFacts = jest.fn(() => new Promise<MonthFacts>((res) => { answer = res; }));
    const { getByTestId, queryByTestId, getAllByTestId } = mount(readFacts);
    expect(getByTestId('month-skeleton')).toBeTruthy();
    expect(queryByTestId('month-grid')).toBeNull();
    await act(async () => answer(facts()));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-label').props.children).toBe('September 2026');
    // Thirty day marks and the pads that align them to Sunday.
    expect(getAllByTestId('daymark')).toHaveLength(30);
    expect(getAllByTestId('month-pad')).toHaveLength(2 + 3);
    // One read, over the nine weeks' first Sunday through the month's last day.
    expect(readFacts).toHaveBeenCalledTimes(1);
    expect(readFacts).toHaveBeenCalledWith('p1', { fromKey: '2026-07-19', toKey: '2026-09-30' });
  });

  it('a failed read is an error with a retry, never a computed "nothing logged"', async () => {
    const readFacts: jest.Mock<Promise<MonthFacts>, []> = jest.fn(async () => {
      throw new Error('boom');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getByTestId, queryByText, getByLabelText } = mount(readFacts);
    await waitFor(() => expect(getByTestId('month-error')).toBeTruthy());
    expect(queryByText(/no vomiting logged/i)).toBeNull();
    readFacts.mockImplementation(async () => facts());
    fireEvent.press(getByLabelText('Try again'));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
  });

  it('the bars sit over the rows: nine Sunday-start weeks, and the line reads the same model (AC 1, 2, 5)', async () => {
    const { getByTestId, getAllByTestId } = mount();
    await waitFor(() => expect(getByTestId('weekly-bars')).toBeTruthy());
    expect(getAllByTestId(/^weekly-week-\d$/)).toHaveLength(9);
    expect(getByTestId('weekly-date-0').props.children).toBe('Jul 19');
    expect(getByTestId('weekly-date-8').props.children).toBe('Sep 13');
    expect(getByTestId('weekly-partial-label').props.children).toBe('5 days so far');
    // Every bar carries its count and seven ticks.
    for (let i = 0; i < 9; i++) {
      expect(getByTestId(`weekly-count-${i}`)).toBeTruthy();
      expect(getAllByTestId(new RegExp(`^weekly-tick-${i}-\\d-`))).toHaveLength(7);
    }
    expect(getByTestId('weekly-count-6').props.children).toBe(3);
    expect(getByTestId('weekly-count-8').props.children).toBe(1);
    expect(getByTestId('month-line').props.children).toBe('Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged');
    expect(getByTestId('weekly-mark-label').props.children).toBe('trial · Jul 25');
  });

  it('a day mark keeps its date; the count is in the corner; a layer off does not change coverage (AC 3)', async () => {
    const { getByTestId, getAllByTestId, getByText, queryByTestId } = mount();
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    const marks = getAllByTestId('daymark');
    const sep2 = marks[1];
    expect(sep2.props.accessibilityLabel).toContain('September 2');
    // The rose square, the date on it, the count in its corner as its own node.
    expect(flat(sep2.props.style).backgroundColor).toBe(theme.colorEventSymptom);
    const dates = getAllByTestId('daymark-date').map((n) => n.props.children);
    expect(dates).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const counts = getAllByTestId('daymark-count').map((n) => n.props.children);
    expect(counts).toEqual([2, 1, 2, 1]);
    // Vomiting off: the rose, the counts, the BARS and the sentence's count go; the
    // hairlines, the dates and the coverage stay.
    fireEvent.press(getByText('Vomiting'));
    expect(queryByTestId('weekly-bars')).toBeNull();
    expect(getByTestId('month-line').props.children).toBe('Through Sep 17 · 2 days unlogged');
    fireEvent.press(getByText('Vomiting'));
    expect(getByTestId('weekly-bars')).toBeTruthy();
    expect(getByTestId('month-line').props.children).toBe('Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged');
    fireEvent.press(getByText('Vomiting'));
    expect(getAllByTestId('daymark-date')).toHaveLength(30);
    expect(() => getAllByTestId('daymark-count')).toThrow();
    expect(flat(getAllByTestId('daymark')[1].props.style).backgroundColor).not.toBe(theme.colorEventSymptom);
    expect(getAllByTestId('daymark-hairline-logged').length).toBeGreaterThan(10);
    // Meals off: the left-some day draws the plain hairline — still logged, never grey.
    expect(getByTestId('daymark-hairline-left_some')).toBeTruthy();
    fireEvent.press(getByText('Meals'));
    expect(() => getByTestId('daymark-hairline-left_some')).toThrow();
    expect(getAllByTestId('daymark')[3].props.accessibilityLabel).toContain('logged');
    expect(getAllByTestId('daymark')[3].props.accessibilityLabel).not.toContain('nothing logged');
    // The two unlogged days stay grey whatever the layers say.
    expect(getAllByTestId('daymark')[7].props.accessibilityLabel).toContain('nothing logged');
    // Medication and Photos are off by default and draw on demand.
    expect(() => getByTestId('daymark-layer-medication')).toThrow();
    fireEvent.press(getByText('Medication'));
    expect(getByTestId('daymark-layer-medication')).toBeTruthy();
    fireEvent.press(getByText('Photos'));
    expect(getByTestId('daymark-layer-photo-worth_a_call')).toBeTruthy();
  });

  it('the chips are checkboxes, wrapping, each announcing its checked state', async () => {
    const { getByTestId, getByText, getAllByRole } = mount();
    await waitFor(() => expect(getByTestId('month-layers')).toBeTruthy());
    const wrap = flat(getByTestId('month-layers').props.style);
    expect(wrap.flexWrap).toBe('wrap');
    const chips = getAllByRole('checkbox');
    expect(chips).toHaveLength(4);
    expect(chips.map((c) => c.props.accessibilityState.checked)).toEqual([true, true, false, false]);
    fireEvent.press(getByText('Photos'));
    expect(getAllByRole('checkbox').map((c) => c.props.accessibilityState.checked)).toEqual([true, true, false, true]);
  });

  it('the legend includes left-some and names its scope; a layer\'s key appears with the layer, with its count', async () => {
    const { getByTestId, getByText, queryByTestId } = mount();
    await waitFor(() => expect(getByTestId('month-legend')).toBeTruthy());
    expect(getByText('vomit day, count in the corner')).toBeTruthy();
    expect(getByText('logged')).toBeTruthy();
    expect(getByText('left some')).toBeTruthy();
    expect(getByText('nothing logged (no meal or symptom)')).toBeTruthy();
    // Off by default: no unexplained dot, no key for it.
    expect(queryByTestId('month-legend-medication')).toBeNull();
    expect(queryByTestId('month-legend-photo')).toBeNull();
    fireEvent.press(getByText('Medication'));
    expect(getByText('medication given · 1 day')).toBeTruthy();
    fireEvent.press(getByText('Photos'));
    expect(getByText('photographed · 1 day')).toBeTruthy();
    expect(getByText('photo read as worth a call · 1 day')).toBeTruthy();
  });

  it('adjacent day marks never share hit area: the rendered gap clears both slops (C-5)', async () => {
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId('month-row-0')).toBeTruthy());
    const rowStyle = flat(getByTestId('month-row-0').children[0] ? (getByTestId('month-row-0').children[0] as { props: { style: unknown } }).props.style : null);
    expect(rowStyle.gap).toBeGreaterThanOrEqual(2 + 2);
  });

  it('the arrows page through months, the chart re-draws for the shown month, next is disabled at the current one (AC 4)', async () => {
    const readFacts = jest.fn(async () => facts());
    const { getByTestId } = mount(readFacts);
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-next').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('month-next').props.accessibilityLabel).toContain('already at the current month');
    expect(getByTestId('month-prev').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('August 2026'));
    // August's own nine weeks end with its last row (Aug 30), and a fresh read was issued.
    expect(readFacts).toHaveBeenLastCalledWith('p1', { fromKey: '2026-07-05', toKey: '2026-08-31' });
    expect(getByTestId('weekly-date-8').props.children).toBe('Aug 30');
    expect(getByTestId('month-next').props.accessibilityState.disabled).toBe(false);
    // Back to September: cached, no second read.
    fireEvent.press(getByTestId('month-next'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('September 2026'));
    expect(readFacts).toHaveBeenCalledTimes(2);
    // Paging stops at the record's first month.
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('August 2026'));
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('July 2026'));
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('June 2026'));
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('May 2026'));
    expect(getByTestId('month-prev').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('month-prev').props.accessibilityLabel).toContain('first month with a record');
  });

  it('a refresh of the current month landing while another month pages in never strands that month (per-key staleness)', async () => {
    // The code-reviewer's repro: page to August (its read pending), a refresh forces the
    // current month to re-read, then August resolves. With one global staleness counter
    // August's result AND its loading flag were both discarded — a skeleton forever.
    const pending = new Map<string, (f: MonthFacts) => void>();
    const readFacts = jest.fn(
      (_pet: string, range: { fromKey: string; toKey: string }) =>
        new Promise<MonthFacts>((res) => {
          pending.set(range.toKey, res);
        }),
    );
    const { getByTestId, rerender } = render(
      <MonthInstrument petId="p1" today={TODAY} readFacts={readFacts} readDay={jest.fn(async () => [])} refreshTick={0} />,
    );
    await act(async () => pending.get('2026-09-30')!(facts()));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    fireEvent.press(getByTestId('month-prev'));
    await waitFor(() => expect(getByTestId('month-skeleton')).toBeTruthy());
    // The refresh lands mid-page: the current month re-reads.
    rerender(<MonthInstrument petId="p1" today={TODAY} readFacts={readFacts} readDay={jest.fn(async () => [])} refreshTick={1} />);
    await waitFor(() => expect(readFacts).toHaveBeenCalledTimes(3));
    // August resolves AFTER the refresh was issued: it must still land.
    await act(async () => pending.get('2026-08-31')!(facts({ episodeDays: ['2026-08-03'] })));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-label').props.children).toBe('August 2026');
    expect(getByTestId('month-line').props.children).toMatch(/^Vomiting 1 time on 1 day · through Aug 31/);
    // And the refreshed September lands too, without touching August's slot.
    await act(async () => pending.get('2026-09-30')!(facts()));
    fireEvent.press(getByTestId('month-next'));
    await waitFor(() => expect(getByTestId('month-label').props.children).toBe('September 2026'));
    expect(getByTestId('month-grid')).toBeTruthy();
  });

  it('the day opens in place under its row, one at a time, and closes (AC 4; C-14: no Modal)', async () => {
    const readDay = jest.fn(async (_pet: string, day: string): Promise<never[]> =>
      day === '2026-09-02' ? [row('a', 'vomit', '2026-09-02T07:00:00Z'), row('b', 'meal', '2026-09-02T08:00:00Z')] : [],
    );
    const { getByTestId, getAllByTestId, queryAllByTestId, getByText, queryByTestId, toJSON } = mount(undefined, readDay);
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    const marks = getAllByTestId('daymark');
    fireEvent.press(marks[1]); // Sep 2, in row 0
    await waitFor(() => expect(getByTestId('day-slot')).toBeTruthy());
    // Under ITS row: the slot is a child of row 0, and there is exactly one.
    expect(queryAllByTestId('day-slot')).toHaveLength(1);
    expect(getByTestId('month-row-0').findAllByProps({ testID: 'day-slot' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(toJSON())).not.toContain('"Modal"');
    await waitFor(() => expect(getByTestId('day-detail')).toBeTruthy());
    await waitFor(() => expect(getByText('Wednesday, September 2')).toBeTruthy());
    expect(readDay).toHaveBeenCalledWith('p1', '2026-09-02');
    await waitFor(() => expect(getByText('Vomit logged 2 times · everything this day:')).toBeTruthy());
    // A second day opens and the first closes: still exactly one slot, now under row 1.
    fireEvent.press(marks[10]); // Sep 11, in row 1
    await waitFor(() => expect(getByText('Friday, September 11')).toBeTruthy());
    // The first day's slot leaves as its rail trails; once it has, exactly one slot is
    // left, under row 1.
    // (The close runs the fold's beats on real timers — about half a second — so the
    // wait is wider than RTL's one-second default; the choreography itself is pinned in
    // components/motion/openInPlaceMotion.test.ts under fake timers.)
    await waitFor(() => expect(queryAllByTestId('day-slot')).toHaveLength(1), { timeout: 4000 });
    expect(getByTestId('month-row-1').findAllByProps({ testID: 'day-slot' }).length).toBeGreaterThan(0);
    expect(getByTestId('month-row-0').findAllByProps({ testID: 'day-slot' })).toHaveLength(0);
    // Tapping the open day again closes it.
    fireEvent.press(marks[10]);
    await waitFor(() => expect(queryByTestId('day-detail')).toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(queryAllByTestId('day-slot')).toHaveLength(0), { timeout: 4000 });
  }, 20_000);

  it('a day ahead is not a control; a day before the record is a plain dim square', async () => {
    const { getByTestId, getAllByTestId, getAllByLabelText } = mount(jest.fn(async () => facts({ recordStart: '2026-09-10', loggedDays: range('2026-09-10', TODAY), episodeDays: ['2026-09-11'] })));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getAllByTestId('month-before-record')).toHaveLength(9);
    expect(getAllByLabelText(/^\w+, September \d+, before the record began$/).length).toBe(9);
    const ahead = getAllByTestId('daymark').filter((n) => String(n.props.accessibilityLabel).includes('ahead'));
    expect(ahead).toHaveLength(13);
    for (const n of ahead) expect(n.props.accessibilityRole).toBeUndefined();
  });

  it('a pet with no record: every day says "nothing logged yet", the line invites the first entry', async () => {
    const { getByTestId, getAllByLabelText } = mount(jest.fn(async () => facts({ recordStart: null, episodeDays: [], loggedDays: [], leftSomeDays: [], dosedDays: [], photoDays: [] })));
    await waitFor(() => expect(getByTestId('month-grid')).toBeTruthy());
    expect(getByTestId('month-line').props.children).toBe('Nothing logged yet · the month fills in from the first entry');
    expect(getAllByLabelText(/^\w+, September \d+, nothing logged yet$/)).toHaveLength(17);
    // Nowhere to page back to.
    expect(getByTestId('month-prev').props.accessibilityState.disabled).toBe(true);
  });

  it('monthReadRange: the nine weeks\' first Sunday through the month\'s last day, and never after the month', () => {
    expect(monthReadRange({ year: 2026, month: 8 }, TODAY)).toEqual({ fromKey: '2026-07-19', toKey: '2026-09-30' });
    expect(monthReadRange({ year: 2026, month: 7 }, TODAY)).toEqual({ fromKey: '2026-07-05', toKey: '2026-08-31' });
  });
});
