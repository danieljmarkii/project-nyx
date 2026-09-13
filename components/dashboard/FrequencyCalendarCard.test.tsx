jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { FrequencyCalendarCard, buildHeatRows, pagingBoundLine } from './FrequencyCalendarCard';
import { symptomFrequencyDefinition } from '../../lib/dashboardCards';
import type { DayFrequencyBucket } from '../../lib/analytics';

const bucket = (date: string, total: number): DayFrequencyBucket => ({
  date,
  total,
  byType: total > 0 ? { vomit: total } : {},
});

describe('FrequencyCalendarCard', () => {
  it('shows count-pips, the summary line, and numbers every day (B-284 N5 / B-226)', () => {
    const buckets = [
      bucket('2026-06-07', 0),
      bucket('2026-06-08', 2),
      bucket('2026-06-09', 0),
      bucket('2026-06-10', 1),
      bucket('2026-06-11', 0),
      bucket('2026-06-12', 0),
      bucket('2026-06-13', 0),
    ];
    const { getByText, getAllByTestId, getByLabelText } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={buckets} symptomType="vomit" />,
    );
    expect(getByText('Vomiting')).toBeTruthy();
    // Summary line — specific, in-voice ("times", never "episodes"), names the worst day.
    expect(getByText(/Vomiting on 2 days/)).toBeTruthy();
    expect(getByText(/most on Jun 8 \(×2\)/)).toBeTruthy();
    expect(getByText(/· 3 times/)).toBeTruthy();
    // Every day carries its numeral now (a real calendar) — incl. non-symptom days.
    expect(getByText('7')).toBeTruthy();
    expect(getByText('8')).toBeTruthy();
    expect(getByText('10')).toBeTruthy();
    // Pips: 2 on the 8th + 1 on the 10th = 3 rose pips total (each ≤3 → dots, not ×N).
    expect(getAllByTestId('symptom-pip')).toHaveLength(3);
    // VoiceOver reads the count on each day, and never reassures on a clean day.
    expect(getByLabelText('Jun 8, vomiting logged 2 times')).toBeTruthy();
    expect(getByLabelText('Jun 7, no vomiting logged')).toBeTruthy();
    // Weekday header orients the columns ('W' is the one unambiguous letter).
    expect(getByText('W')).toBeTruthy();
    // The old opacity-ramp legend is gone.
    expect(() => getByText('Fewer')).toThrow();
  });

  it('collapses a heavy day (≥4) to a ×N numeral instead of pips', () => {
    const buckets = [bucket('2026-06-08', 5), bucket('2026-06-09', 0)];
    const { getByText, queryAllByTestId } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={buckets} symptomType="vomit" />,
    );
    expect(getByText('×5')).toBeTruthy(); // the pip-more numeral on the cell
    expect(queryAllByTestId('symptom-pip')).toHaveLength(0); // no dots on a ×N day
  });

  it('shows a warm "none logged" empty state, never an all-clear', () => {
    const buckets = [bucket('2026-06-12', 0), bucket('2026-06-13', 0)];
    const { getByText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={buckets}
        symptomType="vomit"
        emptyMessage="No vomiting logged this month."
      />,
    );
    expect(getByText('No vomiting logged this month.')).toBeTruthy();
  });

  it('reveals the metric definition on tapping the info affordance (B-100)', () => {
    const buckets = [bucket('2026-06-12', 0), bucket('2026-06-13', 0)];
    const def = symptomFrequencyDefinition('vomiting', 'Nyx'); // canonical helper output
    const { getByTestId, queryByText } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={buckets} symptomType="vomit" definition={def} />,
    );
    expect(queryByText(def)).toBeNull();
    fireEvent.press(getByTestId('metric-info-button'));
    expect(queryByText(def)).not.toBeNull();
  });
});

// ── Paging + day drill-in (B-284 N5b / B-226 #1, #2) ──────────────────────────────

describe('FrequencyCalendarCard — month paging + drill-in', () => {
  const monthBuckets = [bucket('2026-06-07', 0), bucket('2026-06-08', 2), bucket('2026-06-09', 0)];

  it('shows the month label and both nav buttons, honouring canGoPrev/canGoNext', () => {
    const { getByText, getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        canGoPrev
        canGoNext={false}
        onPrevMonth={jest.fn()}
        onNextMonth={jest.fn()}
      />,
    );
    expect(getByText('June 2026')).toBeTruthy();
    // Next is at the current month → disabled; prev is enabled. The disabled one
    // carries its reason in the label (CUL-327): `disabled` makes VoiceOver say
    // "dimmed", and a bare "Next month" leaves that unexplained (C-7).
    expect(getByLabelText('Previous month').props.accessibilityState).toMatchObject({ disabled: false });
    expect(
      getByLabelText('Next month — already at the current month').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('a disabled nav arrow does not fire its callback', () => {
    const onNext = jest.fn();
    const { getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        canGoNext={false}
        onNextMonth={onNext}
      />,
    );
    fireEvent.press(getByLabelText('Next month — already at the current month'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('tapping a day cell fires onDayPress with its UTC day key; the cell reads as a button', () => {
    const onDayPress = jest.fn();
    const { getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        onDayPress={onDayPress}
      />,
    );
    // A selectable cell's VoiceOver label advertises the drill-in affordance.
    const cell = getByLabelText(/Jun 8, vomiting logged 2 times, opens the day/);
    fireEvent.press(cell);
    expect(onDayPress).toHaveBeenCalledWith('2026-06-08');
  });

  it('the selected day is announced as selected', () => {
    const { getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        onDayPress={jest.fn()}
        selectedDay="2026-06-08"
      />,
    );
    expect(getByLabelText(/Jun 8,.*selected/)).toBeTruthy();
  });

  it('an empty month still renders the grid (paging) with an honest, non-reassuring summary', () => {
    const empty = [bucket('2026-06-01', 0), bucket('2026-06-02', 0)];
    const { getByText, getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={empty}
        symptomType="vomit"
        monthLabel="June 2026"
        onDayPress={jest.fn()}
      />,
    );
    // Summary is the honest empty read (never an all-clear), and the grid is still tappable.
    expect(getByText('No vomiting logged in June.')).toBeTruthy();
    expect(getByLabelText(/Jun 1, no vomiting logged, opens the day/)).toBeTruthy();
  });

  it('while LOADING a month, the summary says "Loading…", never a false "No … logged"', () => {
    // An uncached month is [] while its fetch is in flight — the summary must not assert
    // a symptom-free month it hasn't observed (§11 #2).
    const { getByText, queryByText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={[]}
        symptomType="vomit"
        monthLabel="May 2026"
        loading
        onDayPress={jest.fn()}
      />,
    );
    expect(getByText('Loading May…')).toBeTruthy();
    expect(queryByText(/No vomiting logged/)).toBeNull();
  });

  it('on a FAILED month, shows an error + retry, never a false "No … logged"', () => {
    const onRetry = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={[]}
        symptomType="vomit"
        monthLabel="May 2026"
        error
        onRetry={onRetry}
        onDayPress={jest.fn()}
      />,
    );
    expect(getByText("Couldn't load May.")).toBeTruthy();
    expect(queryByText(/No vomiting logged/)).toBeNull();
    fireEvent.press(getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });
});

// ── B-310: the noun / unit / selector props (a "Calendar"-titled, multi-lens card) ───

// CUL-327 — the paging bound, said in words.
//
// The unit under test is `pagingBoundLine` (pure, so every combination is cheap)
// PLUS one rendered assertion per direction, because the defect is that the bound
// is invisible on screen — a pure test alone would pass over a helper nobody
// renders. Proven by mutation: dropping the <ThemedText> reds the rendered pair,
// and inverting either branch of the helper reds the pure table.
describe('pagingBoundLine — the bound in words (CUL-327)', () => {
  it('names the forward bound at the current month', () => {
    expect(pagingBoundLine(true, false)).toBe('Current month');
  });

  it('names the backward bound at the oldest logged month', () => {
    expect(pagingBoundLine(false, true)).toBe('Oldest month with logs');
  });

  // A pet whose first log is this month. Two stacked fragments would read as a
  // contradiction, so it is one sentence rather than both lines.
  it('names both bounds in one line when neither direction can page', () => {
    expect(pagingBoundLine(false, false)).toBe('Current month, and the oldest with logs');
  });

  // The line has to EARN its place: one that shows on every month stops carrying
  // information, and this is the common case.
  it('says nothing when paging is unbounded in both directions', () => {
    expect(pagingBoundLine(true, true)).toBeNull();
  });
});

describe('FrequencyCalendarCard — the bound is on screen (CUL-327)', () => {
  const monthBuckets = [bucket('2026-06-07', 0), bucket('2026-06-08', 2)];

  const renderAt = (canGoPrev: boolean, canGoNext: boolean) =>
    render(
      <FrequencyCalendarCard
        title="Vomiting"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrevMonth={jest.fn()}
        onNextMonth={jest.fn()}
      />,
    );

  it('renders the bound line beneath the nav row at the forward bound', () => {
    const { getByTestId } = renderAt(true, false);
    expect(getByTestId('calendar-paging-bound').props.children).toBe('Current month');
  });

  it('renders the bound line at the backward bound', () => {
    const { getByTestId } = renderAt(false, true);
    expect(getByTestId('calendar-paging-bound').props.children).toBe('Oldest month with logs');
  });

  it('renders no bound line mid-range', () => {
    const { queryByTestId } = renderAt(true, true);
    expect(queryByTestId('calendar-paging-bound')).toBeNull();
  });

  // Paging off (the non-paging dashboard card) has no bounds to name.
  it('renders no bound line when the card is not in paging mode', () => {
    const { queryByTestId } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={monthBuckets} symptomType="vomit" />,
    );
    expect(queryByTestId('calendar-paging-bound')).toBeNull();
  });
});

describe('FrequencyCalendarCard — noun / unit / selector (B-310)', () => {
  const monthBuckets = [bucket('2026-06-07', 0), bucket('2026-06-08', 2)];

  it('noun omitted → summary + a11y fall back to the header title (legacy single-symptom copy)', () => {
    const { getByText, getByLabelText } = render(
      <FrequencyCalendarCard title="Vomiting" buckets={monthBuckets} symptomType="vomit" monthLabel="June 2026" />,
    );
    expect(getByText(/Vomiting on 1 day/)).toBeTruthy();
    expect(getByText(/· 2 times/)).toBeTruthy(); // unit defaults to "time"
    expect(getByLabelText(/Jun 8, vomiting logged 2 times/)).toBeTruthy();
  });

  it('noun + unit override the copy while the HEADER stays the title (the "Calendar" rebrand)', () => {
    const { getByText, getByLabelText } = render(
      <FrequencyCalendarCard
        title="Calendar"
        noun="Unfinished meals"
        unit="meal"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
      />,
    );
    // Header is the generic tool name; the noun carries the lens identity in the copy.
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText('Unfinished meals on 1 day · most on Jun 8 (×2) · 2 meals')).toBeTruthy();
    expect(getByLabelText(/Jun 8, unfinished meals logged 2 times/)).toBeTruthy();
    // An empty month reads the noun, never the title, and never an all-clear.
    const { getByText: getByText2 } = render(
      <FrequencyCalendarCard
        title="Calendar"
        noun="Unfinished meals"
        unit="meal"
        buckets={[bucket('2026-06-07', 0)]}
        symptomType="vomit"
        monthLabel="June 2026"
      />,
    );
    expect(getByText2('No unfinished meals logged in June.')).toBeTruthy();
  });

  it('renders the selector node under the header when provided', () => {
    const { getByText } = render(
      <FrequencyCalendarCard
        title="Calendar"
        buckets={monthBuckets}
        symptomType="vomit"
        monthLabel="June 2026"
        selector={<Text>LENS-CHIPS</Text>}
      />,
    );
    expect(getByText('LENS-CHIPS')).toBeTruthy();
  });
});

describe('buildHeatRows — weekday-aligned grid arithmetic + summary aggregates', () => {
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

  it('summarises max, days-with-events, total, and the worst day from the chosen type', () => {
    const { max, daysWithEvents, total, worstDate } = buildHeatRows(buckets, 'vomit');
    expect(max).toBe(2);
    expect(daysWithEvents).toBe(2);
    expect(total).toBe(3); // 2 + 1
    expect(worstDate).toBe('2026-05-18'); // START + 2 days (the i===2 bucket, the busiest)
  });
});
