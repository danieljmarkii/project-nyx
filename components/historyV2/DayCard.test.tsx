// The day card (CUL-1164 / HV-7; spec §3.1, §3.5, rule C, rule L, H-2).
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { DayCardBody, DayCardHeader, TODAY_NOTHING_YET } from './DayCard';
import { emptyDayFacts, type DateOnlyItem, type DayFacts } from '../../lib/historyDays';
import type { HistoryRow } from '../../lib/historyQueries';

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

const bodyProps = {
  analysis: new Map(),
  working: new Set<string>(),
  timing: { feedings: [], freeFedSpans: [], onsets: [] },
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
    expect(text('history-day-counts-2026-09-17')).toBe('2 vomits · 10 logged');
    expect(StyleSheet.flatten(screen.getByText('10 logged').props.style).color).toBe(theme.colorTextTertiary);
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
      <DayCardBody {...bodyProps} day="2026-09-17" items={[visit, start]} wholeDay={rows} shownRows={rows} noticed={false} />,
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

  it('a filter hides rows, never builds them another way: only the shown row is drawn', () => {
    const rows = [row('m1', 'meal', 8), row('v1', 'vomit', 9), row('m2', 'meal', 10)];
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[]} wholeDay={rows} shownRows={[rows[1]]} noticed={false} />);
    expect(screen.getByTestId('spine-node-v1')).toBeTruthy();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
  });

  it('under Noticed: each look on the hollow bead, opening its record', () => {
    const look = row('lk', 'check_in', 21, { look_outcome: 'observed', look_words: null, look_note: null } as Partial<HistoryRow>);
    render(<DayCardBody {...bodyProps} day="2026-09-17" items={[]} wholeDay={[]} shownRows={[look]} noticed />);
    fireEvent.press(screen.getByTestId('history-look-lk'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'lk' } });
  });

  it('today with nothing yet: the one line', () => {
    render(
      <DayCardBody {...bodyProps} day={TODAY} items={[]} wholeDay={[]} shownRows={[]} noticed={false} emptyLine={TODAY_NOTHING_YET} />,
    );
    expect(screen.getByText('Nothing logged yet today.')).toBeTruthy();
  });
});
