// SymptomCalendar is the stateful seam (paging fetch + drill-in fetch) behind the pure
// FrequencyCalendarCard. Mock the two data reads it drives (getSymptomFrequencyByMonth,
// getTimeline) + router + the safe-area hook (used by the drill-in sheet). The pure month
// helpers (addCalendarMonths / compareCalendarMonth) stay real via requireActual.
jest.mock('../../lib/db', () => ({ getDb: () => ({}), getTimeline: jest.fn() }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/analytics', () => {
  const actual = jest.requireActual('../../lib/analytics');
  return { ...actual, getSymptomFrequencyByMonth: jest.fn() };
});

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SymptomCalendar } from './SymptomCalendar';
import type { DayFrequencyBucket, CalendarMonth } from '../../lib/analytics';
import * as analytics from '../../lib/analytics';
import * as db from '../../lib/db';
import type { TimelineRow } from '../../lib/db';

const A = analytics as jest.Mocked<typeof analytics>;
const DB = db as jest.Mocked<typeof db>;

const JUNE: CalendarMonth = { year: 2026, month: 5 };
const APRIL: CalendarMonth = { year: 2026, month: 3 };

const bucket = (date: string, n: number): DayFrequencyBucket => ({
  date,
  total: n,
  byType: n > 0 ? { vomit: n } : {},
});

// June through Jun 8 (a current-month slice), Jun 8 carrying 2 vomits.
const juneBuckets: DayFrequencyBucket[] = [
  bucket('2026-06-07', 0),
  bucket('2026-06-08', 2),
];

function renderCalendar(over: Partial<React.ComponentProps<typeof SymptomCalendar>> = {}) {
  return render(
    <SymptomCalendar
      petId="p1"
      title="Vomiting"
      symptomType="vomit"
      currentMonth={JUNE}
      earliestMonth={APRIL}
      initialBuckets={juneBuckets}
      {...over}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  A.getSymptomFrequencyByMonth.mockResolvedValue([]);
  DB.getTimeline.mockResolvedValue([]);
});

describe('SymptomCalendar (B-284 N5b container)', () => {
  it('first paint uses the seeded current month — no fetch', () => {
    const { getByText } = renderCalendar();
    expect(getByText('June 2026')).toBeTruthy();
    expect(A.getSymptomFrequencyByMonth).not.toHaveBeenCalled();
  });

  it('paging back fetches the prior calendar month and re-labels (B-309)', async () => {
    A.getSymptomFrequencyByMonth.mockResolvedValueOnce([bucket('2026-05-17', 3)]);
    const { getByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText('Previous month'));
    await waitFor(() => expect(getByText('May 2026')).toBeTruthy());
    expect(A.getSymptomFrequencyByMonth).toHaveBeenCalledWith('p1', { year: 2026, month: 4 });
  });

  it('forward paging is disabled at the current month', () => {
    const onFetch = A.getSymptomFrequencyByMonth;
    const { getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText('Next month')); // at June (current) → no-op
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('tapping a day fetches that UTC day bounded [after, before) and opens the drill-in (B-308)', async () => {
    const dayRows: TimelineRow[] = [
      { event_type: 'vomit', occurred_at: '2026-06-08T06:00:00.000Z' } as unknown as TimelineRow,
    ];
    DB.getTimeline.mockResolvedValueOnce(dayRows);
    const { getByText, getByLabelText } = renderCalendar();
    fireEvent.press(getByLabelText(/Jun 8, vomiting logged 2 times, opens the day/));
    await waitFor(() => expect(getByText(/everything this day/)).toBeTruthy());
    // Bounded to the single UTC day — the same bounds History's single-day filter uses.
    expect(DB.getTimeline).toHaveBeenCalledWith(
      'p1', expect.any(Number), 0, null,
      '2026-06-08T00:00:00.000Z', '2026-06-09T00:00:00.000Z',
    );
    // Subtitle names the day's charted-symptom count (read from the month bucket).
    expect(getByText('Vomiting logged 2 times · everything this day:')).toBeTruthy();
  });

  it('the drill-in "Open in History" deep-links the day', async () => {
    DB.getTimeline.mockResolvedValueOnce([]);
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
});
