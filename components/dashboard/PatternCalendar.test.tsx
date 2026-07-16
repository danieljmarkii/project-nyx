// PatternCalendar is the stateful seam (paging fetch + drill-in fetch + lens selector) behind
// the pure FrequencyCalendarCard. Mock the data reads it drives (getSymptomFrequencyByMonth,
// getIntakeDeclineByMonth, getTimeline) + router + the safe-area hook (the drill-in sheet). The
// pure month helpers (addCalendarMonths / compareCalendarMonth) stay real via requireActual.
jest.mock('../../lib/db', () => ({ getDb: () => ({}), getTimeline: jest.fn() }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/analytics', () => {
  const actual = jest.requireActual('../../lib/analytics');
  return { ...actual, getSymptomFrequencyByMonth: jest.fn(), getIntakeDeclineByMonth: jest.fn() };
});

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { PatternCalendar, type CalendarView } from './PatternCalendar';
import type { DayFrequencyBucket, CalendarMonth } from '../../lib/analytics';
import * as analytics from '../../lib/analytics';
import * as db from '../../lib/db';
import type { TimelineRow } from '../../lib/db';

const A = analytics as jest.Mocked<typeof analytics>;
const DB = db as jest.Mocked<typeof db>;

const JUNE: CalendarMonth = { year: 2026, month: 5 };
const APRIL: CalendarMonth = { year: 2026, month: 3 };

/** A day bucket carrying an explicit per-type breakdown (multi-symptom lenses read byType). */
const b = (date: string, byType: Record<string, number>): DayFrequencyBucket => ({
  date,
  total: Object.values(byType).reduce((a, n) => a + n, 0),
  byType,
});
/** An intake-decline bucket — the lens reads the day TOTAL (unfinished-meal count). */
const intakeB = (date: string, count: number): DayFrequencyBucket => ({
  date,
  total: count,
  byType: count > 0 ? { intake_decline: count } : {},
});

const view = (over: Partial<CalendarView> & Pick<CalendarView, 'key' | 'kind'>): CalendarView => ({
  chipLabel: 'Vomiting',
  noun: 'Vomiting',
  unit: 'time',
  definition: '',
  drillLabel: 'Vomiting',
  ...over,
});

const VOMIT = view({ key: 'symptom:vomit', kind: 'symptom', symptomType: 'vomit' });
const DIARRHEA = view({
  key: 'symptom:diarrhea', kind: 'symptom', symptomType: 'diarrhea',
  chipLabel: 'Loose stool', noun: 'Loose stool', drillLabel: 'Loose stool',
});
const MEALS = view({
  key: 'intake', kind: 'intake',
  chipLabel: 'Meals', noun: 'Unfinished meals', unit: 'meal', drillLabel: 'Unfinished meals',
});

// Seeded current-month buckets: Jun 8 → 2 vomit + 1 loose stool; Jun 9 → 3 loose stool.
const seededSymptom: DayFrequencyBucket[] = [
  b('2026-06-07', {}),
  b('2026-06-08', { vomit: 2, diarrhea: 1 }),
  b('2026-06-09', { diarrhea: 3 }),
];
// Seeded intake-decline buckets: Jun 8 → 2 unfinished meals.
const seededIntake: DayFrequencyBucket[] = [intakeB('2026-06-07', 0), intakeB('2026-06-08', 2)];

function renderCalendar(over: Partial<React.ComponentProps<typeof PatternCalendar>> = {}) {
  return render(
    <PatternCalendar
      petId="p1"
      title="Calendar"
      views={[VOMIT]}
      currentMonth={JUNE}
      earliestMonth={APRIL}
      initialSymptomBuckets={seededSymptom}
      initialIntakeBuckets={[]}
      {...over}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  A.getIntakeDeclineByMonth.mockResolvedValue([]);
  DB.getTimeline.mockResolvedValue([]);
});

describe('PatternCalendar — paging + drill-in (B-284 N5b container)', () => {
  it('first paint uses the seeded current month — no fetch', () => {
    const { getByText } = renderCalendar();
    expect(getByText('June 2026')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy(); // the B-310 header rebrand
    expect(A.getSymptomFrequencyByMonth).not.toHaveBeenCalled();
  });

  it('paging back fetches the prior calendar month and re-labels (B-309)', async () => {
    A.getSymptomFrequencyByMonth.mockResolvedValueOnce([b('2026-05-17', { vomit: 3 })]);
    const { getByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText('Previous month'));
    await waitFor(() => expect(getByText('May 2026')).toBeTruthy());
    expect(A.getSymptomFrequencyByMonth).toHaveBeenCalledWith('p1', { year: 2026, month: 4 });
    // A symptom-only card never queries the intake series.
    expect(A.getIntakeDeclineByMonth).not.toHaveBeenCalled();
  });

  it('forward paging is disabled at the current month', () => {
    const { getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText('Next month')); // at June (current) → no-op
    expect(A.getSymptomFrequencyByMonth).not.toHaveBeenCalled();
  });

  it('tapping a day fetches that UTC day bounded [after, before) and opens the drill-in (B-308)', async () => {
    const dayRows: TimelineRow[] = [
      { event_type: 'vomit', occurred_at: '2026-06-08T06:00:00.000Z' } as unknown as TimelineRow,
    ];
    DB.getTimeline.mockResolvedValueOnce(dayRows);
    const { getByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText(/Jun 8, vomiting logged 2 times, opens the day/));
    await waitFor(() => expect(getByText(/everything this day/)).toBeTruthy());
    expect(DB.getTimeline).toHaveBeenCalledWith(
      'p1', expect.any(Number), 0, null,
      '2026-06-08T00:00:00.000Z', '2026-06-09T00:00:00.000Z',
    );
    // Subtitle names the day's charted-lens count (read from the month bucket).
    expect(getByText('Vomiting logged 2 times · everything this day:')).toBeTruthy();
  });

  it('the drill-in "Open in History" deep-links the day', async () => {
    DB.getTimeline.mockResolvedValueOnce([
      { event_type: 'vomit', occurred_at: '2026-06-08T06:00:00.000Z' } as unknown as TimelineRow,
    ]);
    const { getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText(/Jun 8, vomiting logged 2 times, opens the day/));
    await waitFor(() => expect(getByLabelText('Open Jun 8 in History')).toBeTruthy());
    fireEvent.press(getByLabelText('Open Jun 8 in History'));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(tabs)/history',
        params: expect.objectContaining({ date: '2026-06-08' }),
      }),
    );
  });

  it('a FAILED month fetch shows an error + retry, never a false "No vomiting logged"', async () => {
    A.getSymptomFrequencyByMonth.mockRejectedValueOnce(new Error('offline'));
    const { getByText, queryByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText('Previous month'));
    await waitFor(() => expect(getByText(/Couldn't load May/)).toBeTruthy());
    expect(queryByText(/No vomiting logged in May/)).toBeNull();
    A.getSymptomFrequencyByMonth.mockResolvedValueOnce([b('2026-05-17', { vomit: 3 })]);
    fireEvent.press(getByLabelText('Try again'));
    await waitFor(() => expect(getByText(/Vomiting on 1 day/)).toBeTruthy());
  });

  it('a FAILED day fetch shows an error, never a false "Nothing logged this day"', async () => {
    DB.getTimeline.mockRejectedValueOnce(new Error('offline'));
    const { getByText, queryByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText(/Jun 8, vomiting logged 2 times, opens the day/));
    await waitFor(() => expect(getByText(/Couldn't load this day/)).toBeTruthy());
    expect(queryByText('Nothing logged this day.')).toBeNull();
  });

  it('reconciles the current month when the parent passes fresh buckets (no stale grid)', () => {
    const { getByText, rerender } = renderCalendar();
    expect(getByText('Vomiting on 1 day · most on Jun 8 (×2) · 2 times')).toBeTruthy();
    rerender(
      <PatternCalendar
        petId="p1"
        title="Calendar"
        views={[VOMIT]}
        currentMonth={JUNE}
        earliestMonth={APRIL}
        initialSymptomBuckets={[b('2026-06-08', { vomit: 2 }), b('2026-06-09', { vomit: 3 })]}
        initialIntakeBuckets={[]}
      />,
    );
    expect(getByText('Vomiting on 2 days · most on Jun 9 (×3) · 5 times')).toBeTruthy();
  });
});

// ── B-310: the lens selector (multi-symptom + intake) ─────────────────────────────

describe('PatternCalendar — lens selector (B-310)', () => {
  const multi = { views: [VOMIT, DIARRHEA, MEALS], initialIntakeBuckets: seededIntake };

  it('a single-lens card shows no selector chips (a lone chip is noise)', () => {
    const { queryByText } = renderCalendar();
    // The header is "Calendar"; there is no second lens, so no chip row.
    expect(queryByText('Loose stool')).toBeNull();
    expect(queryByText('Meals')).toBeNull();
  });

  it('renders a chip per lens; the default lens is the first view (dominant symptom)', () => {
    const { getByText } = renderCalendar(multi);
    expect(getByText('Vomiting')).toBeTruthy(); // chip
    expect(getByText('Loose stool')).toBeTruthy();
    expect(getByText('Meals')).toBeTruthy();
    // Default lens = views[0] (vomit): its summary leads.
    expect(getByText('Vomiting on 1 day · most on Jun 8 (×2) · 2 times')).toBeTruthy();
  });

  it('switching to a second symptom re-reads the SAME month buckets — no refetch, summary updates', () => {
    const { getByText } = renderCalendar(multi);
    fireEvent.press(getByText('Loose stool'));
    // Loose stool spans Jun 8 (×1) + Jun 9 (×3) from the already-seeded byType — no fetch.
    expect(getByText('Loose stool on 2 days · most on Jun 9 (×3) · 4 times')).toBeTruthy();
    expect(A.getSymptomFrequencyByMonth).not.toHaveBeenCalled();
    expect(A.getIntakeDeclineByMonth).not.toHaveBeenCalled();
  });

  it('the "Meals" lens charts unfinished-meal days and never reads a clean day as an all-clear', () => {
    const { getByText, getByLabelText } = renderCalendar(multi);
    fireEvent.press(getByText('Meals'));
    // Intake decline: Jun 8 had 2 unfinished meals.
    expect(getByText('Unfinished meals on 1 day · most on Jun 8 (×2) · 2 meals')).toBeTruthy();
    // A clean day reads "no unfinished meals logged" — a logging fact, not "ate well" (§11 #2).
    expect(getByLabelText(/Jun 7, no unfinished meals logged/)).toBeTruthy();
    expect(A.getIntakeDeclineByMonth).not.toHaveBeenCalled(); // seeded → no refetch
  });

  it('the intake drill-in subtitle names the unfinished-meal count, not a symptom', async () => {
    DB.getTimeline.mockResolvedValueOnce([
      {
        event_type: 'meal', occurred_at: '2026-06-08T06:00:00.000Z', intake_rating: 'refused',
      } as unknown as TimelineRow,
    ]);
    const { getByText, getByLabelText } = renderCalendar(multi);
    fireEvent.press(getByText('Meals'));
    fireEvent.press(getByLabelText(/Jun 8, unfinished meals logged 2 times, opens the day/));
    await waitFor(() =>
      expect(getByText('Unfinished meals logged 2 times · everything this day:')).toBeTruthy(),
    );
  });

  it('paging with an intake lens present fetches BOTH series so any lens is instant', async () => {
    A.getSymptomFrequencyByMonth.mockResolvedValueOnce([b('2026-05-17', { vomit: 1 })]);
    A.getIntakeDeclineByMonth.mockResolvedValueOnce([intakeB('2026-05-20', 1)]);
    const { getByLabelText, getByText } = renderCalendar(multi);
    fireEvent.press(getByLabelText('Previous month'));
    await waitFor(() => expect(getByText('May 2026')).toBeTruthy());
    expect(A.getSymptomFrequencyByMonth).toHaveBeenCalledWith('p1', { year: 2026, month: 4 });
    expect(A.getIntakeDeclineByMonth).toHaveBeenCalledWith('p1', { year: 2026, month: 4 });
  });

  it('an intake-ONLY card (no active symptom) defaults to the Meals lens', () => {
    const { getByText } = renderCalendar({
      views: [MEALS],
      initialSymptomBuckets: [],
      initialIntakeBuckets: seededIntake,
    });
    expect(getByText('Unfinished meals on 1 day · most on Jun 8 (×2) · 2 meals')).toBeTruthy();
  });
});
