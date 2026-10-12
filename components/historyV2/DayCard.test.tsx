// The day card (CUL-1164 / HV-7; spec §3.1, §3.5, rule C, rule L, H-2).
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { DayCardBody, DayCardHeader, TODAY_NOTHING_YET } from './DayCard';
import { RAIL_W, SPINE_THREAD } from '../recap/DaySpine';
import { emptyDayFacts, type DateOnlyItem, type DayFacts } from '../../lib/historyDays';
import type { HistoryRow } from '../../lib/historyQueries';
import { historyNodesByDay } from '../../lib/historyScreen';

interface RenderedNode {
  children: (RenderedNode | string)[];
}
function textOf(node: RenderedNode | string): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}
const text = (id: string) => textOf(screen.getByTestId(id) as unknown as RenderedNode);

const TODAY = '2026-09-21';
const facts = (over: Partial<DayFacts>): DayFacts => ({ ...emptyDayFacts('2026-09-17'), ...over });

function row(id: string, event_type: string, hour: number, extra: Partial<HistoryRow> = {}): HistoryRow {
  const at = new Date(2026, 8, 17, hour, 0, 0, 0).toISOString();
  return {
    id, pet_id: 'p1', event_type, occurred_at: at, occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null, occurred_at_latest: null, severity: null, notes: null, source: 'manual',
    deleted_at: null, created_at: at, updated_at: at, medication_id: null, has_photo: false, course_key: null,
    look_local_day: null, ...extra,
  } as HistoryRow;
}

/** The whole day's nodes, as the list builds them for every loaded day. */
const nodesOf = (rows: HistoryRow[], day = '2026-09-17') =>
  historyNodesByDay({
    days: new Map([[day, rows]]),
    reads: { analysis: new Map(), answered: new Set(), working: new Set() },
    timing: { feedings: [], freeFedSpans: [], onsets: [] },
  }).get(day) ?? [];

const bodyProps = {
  openRuns: new Set<string>(),
  onToggleRun: () => {},
  onOpenVisit: jest.fn(),
  landed: false,
};

describe('DayCardHeader', () => {
  it('All types: the date, the total with its number weighted, each symptom in the rose ink, unfinished meals in grey', () => {
    render(
      <DayCardHeader
        day="2026-09-17"
        today={TODAY}
        facts={facts({ total: 10, byType: { vomit: 2, meal: 7, cough: 1 }, mealsNotFinished: 1 })}
        filter={{ kind: 'all' }}
        search={false}
        landed={false}
      />,
    );
    expect(text('history-day-header-2026-09-17')).toBe('Thu, Sep 1710 logged · 2 vomits · 1 cough · 1 meal not finished');
    expect(StyleSheet.flatten(screen.getByText('2 vomits').props.style).color).toBe(theme.colorEventSymptomInk);
    expect(StyleSheet.flatten(screen.getByText('1 meal not finished').props.style).color).toBe(theme.colorTextSecondary);
    // ThemedText turns the weight into its Geist face (CUL-364).
    expect(StyleSheet.flatten(screen.getByText('10').props.style).fontFamily).toBe(theme.fontBodySemibold);
  });

  it('a filter: its count first, then the day\'s total in the quieter ink', () => {
    render(
      <DayCardHeader
        day="2026-09-17"
        today={TODAY}
        facts={facts({ total: 10, byType: { vomit: 2 } })}
        filter={{ kind: 'type', type: 'vomit' }}
        search={false}
        landed={false}
      />,
    );
    expect(text('history-day-counts-2026-09-17')).toBe('2 vomits · 10 in all');
    expect(StyleSheet.flatten(screen.getByText('10 in all').props.style).color).toBe(theme.colorTextTertiary);
  });

  it('the day\'s total keeps the quieter ink wherever it falls: after every kind under All symptoms', () => {
    render(
      <DayCardHeader
        day="2026-09-17"
        today={TODAY}
        facts={facts({ total: 10, byType: { vomit: 2, cough: 1 } })}
        filter={{ kind: 'symptoms' }}
        search={false}
        landed={false}
      />,
    );
    expect(text('history-day-counts-2026-09-17')).toBe('2 vomits · 1 cough · 10 in all');
    expect(StyleSheet.flatten(screen.getByText('10 in all').props.style).color).toBe(theme.colorTextTertiary);
    expect(StyleSheet.flatten(screen.getByText('1 cough').props.style).color).toBe(theme.colorEventSymptomInk);
  });

  it('a search: the date only (R-2); today carries its tag', () => {
    render(
      <DayCardHeader day={TODAY} today={TODAY} facts={facts({ day: TODAY, total: 3 })} filter={{ kind: 'all' }} search landed={false} />,
    );
    expect(text(`history-day-header-${TODAY}`)).toBe('Mon, Sep 21  Today');
    expect(screen.queryByTestId(`history-day-counts-${TODAY}`)).toBeNull();
  });

  it('landed: the 2pt teal-ink outline and the date in the same ink (§3.1)', () => {
    render(
      <DayCardHeader day="2026-09-17" today={TODAY} facts={facts({ total: 1 })} filter={{ kind: 'all' }} search={false} landed />,
    );
    const card = StyleSheet.flatten(screen.getByTestId('history-day-header-2026-09-17').props.style);
    expect(card.borderColor).toBe(theme.colorAccentInk);
    expect(card.borderWidth).toBe(2);
    expect(StyleSheet.flatten(screen.getByText('Thu, Sep 17').props.style).color).toBe(theme.colorAccentInk);
  });
});

describe('DayCardBody', () => {
  const visit: DateOnlyItem = { kind: 'visit', day: '2026-09-17', id: 'visit-1', reason: 'Recheck', where: 'Riverside Clinic' };
  const start: DateOnlyItem = { kind: 'course-start', day: '2026-09-17', courseKey: 'reg', name: 'Prednisone' };

  it('date-only items at the top of the day, the visit a door to the visit; then the rows', () => {
    const rows = [row('m1', 'meal', 9, { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' } as Partial<HistoryRow>)];
    render(
      <DayCardBody {...bodyProps} day="2026-09-17" items={[visit, start]} nodes={nodesOf(rows)} shownRows={rows} noticed={false} />,
    );
    const body = screen.getByTestId('history-day-body-2026-09-17');
    const order = (body as unknown as { findAll: (p: (n: { props: { testID?: string } }) => boolean) => { props: { testID: string } }[] })
      .findAll((n) => typeof n.props.testID === 'string' && /^(history-item|spine-node)-/.test(n.props.testID))
      .map((n) => n.props.testID);
    expect(order.filter((id, i) => order.indexOf(id) === i)).toEqual([
      'history-item-visit-visit-1',
      'history-item-course-start-2026-09-17',
      'spine-node-m1',
    ]);
    fireEvent.press(screen.getByTestId('history-item-visit-visit-1'));
    expect(bodyProps.onOpenVisit).toHaveBeenCalledWith('visit-1');
    expect(screen.getByText('Prednisone started')).toBeTruthy();
  });

  it('CUL-1718: a date-only item’s thread runs through its bottom padding to the next row', () => {
    const rows = [row('m1', 'meal', 9)];
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[start]} nodes={nodesOf(rows)} shownRows={rows} noticed={false} />);
    type Node = { props: { style?: unknown }; children: unknown[]; findAll: (p: (n: Node) => boolean) => Node[] };
    const item = screen.getByTestId('history-item-course-start-2026-09-17') as unknown as Node;
    const flat = (n: Node): ViewStyle => StyleSheet.flatten(n.props.style as StyleProp<ViewStyle>) ?? {};
    const [rail] = item.findAll((n) => typeof n.props.style !== 'undefined' && flat(n).width === RAIL_W);
    expect(flat(rail).alignSelf).toBe('stretch');
    const itemRow = item.findAll((n) => n.children.includes(rail as never))[0];
    const pad = flat(itemRow).paddingBottom;
    expect(pad).toBe(SPINE_THREAD.rowGapPad);
    // The item is first and not last: one segment, the bottom one, carried through the pad.
    const segments = rail.findAll((n) => flat(n).position === 'absolute');
    const bottoms = segments.filter((n) => flat(n).bottom !== undefined).map((n) => flat(n).bottom);
    expect(new Set(bottoms)).toEqual(new Set([-(pad as number)]));
  });

  it('CUL-1751: a look’s row fills its 44pt door, so the thread runs through it to the next row', () => {
    const rows = [row('m1', 'meal', 8), row('v1', 'vomit', 20)];
    const look = row('lk', 'check_in', 12, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
    render(
      <DayCardBody {...bodyProps} day="2026-09-17" items={[]} nodes={nodesOf(rows)} shownRows={rows} looks={[look]} noticed={false} />,
    );
    type Node = { props: { style?: unknown }; children: unknown[]; findAll: (p: (n: Node) => boolean) => Node[] };
    const door = screen.getByTestId('history-look-lk') as unknown as Node;
    const flat = (n: Node): ViewStyle => StyleSheet.flatten(n.props.style as StyleProp<ViewStyle>) ?? {};
    // The door is taller than a look's text plus its pad; the row must grow to the door's foot.
    expect(flat(door).minHeight).toBeGreaterThanOrEqual(44);
    const [rail] = door.findAll((n) => typeof n.props.style !== 'undefined' && flat(n).width === RAIL_W);
    expect(flat(rail).alignSelf).toBe('stretch');
    const itemRow = door.findAll((n) => n.children.includes(rail as never))[0];
    expect(flat(itemRow).flexGrow).toBe(1);
    // Between two rows, both segments, the bottom one carried through the pad.
    const pad = flat(itemRow).paddingBottom;
    expect(pad).toBe(SPINE_THREAD.rowGapPad);
    const segments = rail.findAll((n) => flat(n).position === 'absolute');
    const bottoms = segments.filter((n) => flat(n).bottom !== undefined).map((n) => flat(n).bottom);
    expect(new Set(bottoms)).toEqual(new Set([-(pad as number)]));
    // Not first: the top segment is drawn too (findAll returns composite and host alike, so count tops).
    expect(new Set(segments.map((n) => flat(n).top)).size).toBe(2);
  });

  it('a filter hides rows, never builds them another way: only the shown row is drawn', () => {
    const rows = [row('m1', 'meal', 8), row('v1', 'vomit', 9), row('m2', 'meal', 10)];
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[]} nodes={nodesOf(rows)} shownRows={[rows[1]]} noticed={false} />);
    expect(screen.getByTestId('spine-node-v1')).toBeTruthy();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
  });

  it('under Noticed: each look on the hollow bead, at its time, opening its record', () => {
    const look = row('lk', 'check_in', 21, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[]} nodes={[]} shownRows={[look]} noticed />);
    const line = screen.getByTestId('history-look-lk');
    // The whole line is a door at the row's 44pt floor (C-5).
    expect(StyleSheet.flatten(line.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(line.props.accessibilityLabel).toMatch(/Opens details$/);
    fireEvent.press(line);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'lk' } });
  });

  it('All types (CUL-1244): a look sits among the rows by its time, on the hollow bead, and builds no node', () => {
    const rows = [row('m1', 'meal', 8), row('v1', 'vomit', 20)];
    const look = row('lk', 'check_in', 12, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
    render(
      <DayCardBody {...bodyProps} day="2026-09-17" items={[]} nodes={nodesOf(rows)} shownRows={rows} looks={[look]} noticed={false} />,
    );
    const body = screen.getByTestId('history-day-body-2026-09-17');
    const order = (body as unknown as { findAll: (p: (n: { props: { testID?: string } }) => boolean) => { props: { testID: string } }[] })
      .findAll((n) => typeof n.props.testID === 'string' && /^(spine-node|history-look)-/.test(n.props.testID))
      .map((n) => n.props.testID);
    expect(order.filter((id, i) => order.indexOf(id) === i)).toEqual(['spine-node-m1', 'history-look-lk', 'spine-node-v1']);
    expect(screen.queryByTestId('spine-node-lk')).toBeNull();
  });

  it('All types (CUL-1244): a look-only day draws its look, and its header is the date alone', () => {
    const look = row('lk', 'check_in', 21, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[]} nodes={[]} shownRows={[]} looks={[look]} noticed={false} />);
    expect(screen.getByTestId('history-look-lk')).toBeTruthy();
    render(
      <DayCardHeader day="2026-09-17" today={TODAY} facts={facts({ looked: true })} filter={{ kind: 'all' }} search={false} landed={false} />,
    );
    expect(text('history-day-header-2026-09-17')).toBe('Thu, Sep 17');
    expect(screen.queryByText(/nothing logged/)).toBeNull();
  });

  it('today with nothing yet: the one line', () => {
    render(
      <DayCardBody {...bodyProps} day={TODAY} items={[]} nodes={[]} shownRows={[]} noticed={false} emptyLine={TODAY_NOTHING_YET} />,
    );
    expect(screen.getByText('Nothing logged yet today.')).toBeTruthy();
  });
});

// CUL-1719: a look drawn among the rows breaks a run of meals it falls inside. The pipeline
// leaves looks out of its rows and the card threads each look in by its time, so a run
// folded over a 9:00 AM look printed it after the run's 10:45 AM meal.
describe('DayCardBody — a look inside a run’s span (CUL-1719)', () => {
  const PR = { food_type: 'meal', food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR' } as Partial<HistoryRow>;
  const at = (id: string, event_type: string, h: number, m: number, extra: Partial<HistoryRow> = {}): HistoryRow => {
    const iso = new Date(2026, 8, 17, h, m, 0, 0).toISOString();
    return { ...row(id, event_type, h, extra), occurred_at: iso, created_at: iso, updated_at: iso };
  };
  const lookAt = (h: number, m: number) =>
    at('lk', 'check_in', h, m, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
  const MEALS = [at('m1', 'meal', 6, 20, PR), at('m2', 'meal', 10, 45, PR)];

  /** The day as the list builds it: its nodes over the whole day, the looks it draws as breaks. */
  const drawn = (looks: HistoryRow[]) => {
    const day = '2026-09-17';
    const nodes =
      historyNodesByDay({
        days: new Map([[day, MEALS]]),
        reads: { analysis: new Map(), answered: new Set(), working: new Set() },
        timing: { feedings: [], freeFedSpans: [], onsets: [] },
        looks: new Map([[day, looks]]),
      }).get(day) ?? [];
    render(<DayCardBody {...bodyProps} day={day} items={[]} nodes={nodes} shownRows={MEALS} looks={looks} noticed={false} />);
    const body = screen.getByTestId('history-day-body-2026-09-17');
    const ids = (body as unknown as { findAll: (p: (n: { props: { testID?: string } }) => boolean) => { props: { testID: string } }[] })
      .findAll((n) => typeof n.props.testID === 'string' && /^(spine-node|history-look)-/.test(n.props.testID))
      .map((n) => n.props.testID);
    return ids.filter((id, i) => ids.indexOf(id) === i);
  };

  it('the convening’s day plus a 9:00 AM look: the 6:20 AM meal, the look, then the 10:45 AM meal, and no run', () => {
    expect(drawn([lookAt(9, 0)])).toEqual(['spine-node-m1', 'history-look-lk', 'spine-node-m2']);
  });

  it('the same day with no look is unchanged: one run', () => {
    expect(drawn([])).toEqual(['spine-node-compact:m1']);
  });

  it('a look before or after the run’s span leaves the run whole', () => {
    expect(drawn([lookAt(5, 30)])).toEqual(['history-look-lk', 'spine-node-compact:m1']);
    expect(drawn([lookAt(14, 0)])).toEqual(['spine-node-compact:m1', 'history-look-lk']);
  });
});
