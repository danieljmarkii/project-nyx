jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render } from '@testing-library/react-native';
import { FrequencyCalendarCard, buildHeatRows } from './FrequencyCalendarCard';
import type { DayFrequencyBucket } from '../../lib/analytics';

const bucket = (date: string, total: number): DayFrequencyBucket => ({
  date,
  total,
  byType: total > 0 ? { vomit: total } : {},
});

describe('FrequencyCalendarCard', () => {
  it('numbers each symptom day + shows the weekday header and shade legend (B-097)', () => {
    const buckets = [
      bucket('2026-06-07', 0),
      bucket('2026-06-08', 2),
      bucket('2026-06-09', 0),
      bucket('2026-06-10', 1),
      bucket('2026-06-11', 0),
      bucket('2026-06-12', 0),
      bucket('2026-06-13', 0),
    ];
    const { getByText } = render(<FrequencyCalendarCard title="Vomiting" buckets={buckets} />);
    expect(getByText('Vomiting')).toBeTruthy();
    expect(getByText(/Logged on 2 days/)).toBeTruthy();
    // Each symptom day carries its date numeral — the owner can answer "which day?".
    expect(getByText('8')).toBeTruthy();
    expect(getByText('10')).toBeTruthy();
    // Weekday header (unique letters) + the shade legend decode the grid.
    expect(getByText('W')).toBeTruthy();
    expect(getByText('Fewer')).toBeTruthy();
    expect(getByText('More')).toBeTruthy();
  });

  it('shows a warm "none logged" empty state, never an all-clear', () => {
    const buckets = [bucket('2026-06-12', 0), bucket('2026-06-13', 0)];
    const { getByText } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={buckets} emptyMessage="No vomiting logged this month." />,
    );
    expect(getByText('No vomiting logged this month.')).toBeTruthy();
  });
});

describe('buildHeatRows — weekday-aligned grid arithmetic', () => {
  const START = '2026-05-16';
  const buckets: DayFrequencyBucket[] = Array.from({ length: 30 }, (_, i): DayFrequencyBucket => {
    const date = new Date(Date.UTC(2026, 4, 16) + i * 86_400_000).toISOString().slice(0, 10);
    const total = i === 2 ? 2 : i === 10 ? 1 : 0;
    return { date, total, byType: total > 0 ? { vomit: total } : {} };
  });

  it("pads the first row to the start day's real UTC weekday, every row 7 wide, no day lost", () => {
    const { rows } = buildHeatRows(buckets);
    const expectedLead = new Date(`${START}T00:00:00Z`).getUTCDay();
    const flat = rows.flat();
    rows.forEach((r) => expect(r.length).toBe(7)); // rectangular
    expect(flat.length % 7).toBe(0);
    expect(flat.findIndex((c) => !c.blank)).toBe(expectedLead); // leading blanks == weekday
    expect(flat.filter((c) => !c.blank).length).toBe(30); // exactly one cell per real day
  });

  it('summarises max and days-with-events from the chosen symptom type', () => {
    const { max, daysWithEvents } = buildHeatRows(buckets, 'vomit');
    expect(max).toBe(2);
    expect(daysWithEvents).toBe(2);
  });
});
