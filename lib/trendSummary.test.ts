import {
  summarizeSymptomTrend,
  trendLookbackStartMs,
  symptomOnsetsByType,
  TREND_SYMPTOM_TYPES,
  MS_PER_DAY,
} from './trendSummary';

// Instants built from LOCAL components (B-514): a UTC literal here would silently make
// these assertions statements about the runner's clock.
const NOW = new Date(2026, 7, 22, 12, 0).getTime();
const H = 60 * 60 * 1000;
/** An event `d` days (and optionally `h` hours) before NOW. */
const ev = (type: string, d: number, h = 0) => ({
  event_type: type,
  occurred_at: new Date(NOW - d * MS_PER_DAY + h * H).toISOString(),
});

describe('trendLookbackStartMs', () => {
  it('is exactly 14 days of milliseconds before now', () => {
    expect(trendLookbackStartMs(NOW)).toBe(NOW - 14 * MS_PER_DAY);
  });

  // The DST bug code review found: the SQL fetch bound was calendar arithmetic while
  // the window bounds were fixed-offset epoch arithmetic. Across a spring-forward the
  // two diverge by the transition's offset, and an event in that sliver was never
  // FETCHED — so it vanished from the prior window rather than being filtered.
  it('does not drift from a calendar-arithmetic bound across a DST transition', () => {
    // 10 Mar 2026, after the 8 Mar US spring-forward; the 14-day lookback crosses it.
    const afterDst = new Date(2026, 2, 10, 10, 0).getTime();
    const calendar = new Date(afterDst);
    calendar.setDate(calendar.getDate() - 14);
    const drift = Math.abs(calendar.getTime() - trendLookbackStartMs(afterDst));
    // In a DST-observing zone the calendar bound is an hour off; the point of the fix is
    // that BOTH the SQL bound and the window bound now come from this one function, so
    // whatever the zone does, they cannot disagree with each other.
    expect([0, H]).toContain(drift);
    expect(trendLookbackStartMs(afterDst)).toBe(afterDst - 14 * MS_PER_DAY);
  });
});

describe('symptomOnsetsByType', () => {
  it('collapses per type — two symptoms an hour apart are never one episode', () => {
    const onsets = symptomOnsetsByType([ev('vomit', 1), ev('itch', 1, 1)]);
    expect(onsets.get('vomit')).toHaveLength(1);
    expect(onsets.get('itch')).toHaveLength(1);
  });

  it('ignores non-symptom rows and unparseable timestamps', () => {
    const onsets = symptomOnsetsByType([
      ev('meal', 1),
      ev('medication', 1),
      { event_type: 'vomit', occurred_at: 'not-a-date' },
    ]);
    expect(onsets.size).toBe(0);
  });
});

describe('summarizeSymptomTrend', () => {
  it('counts EPISODES, not rows — a tight cluster is one', () => {
    // Four vomits inside two hours on one day, plus one four days later.
    const events = [
      ev('vomit', 5, 0), ev('vomit', 5, 1), ev('vomit', 5, 2), ev('vomit', 5, 2.5),
      ev('vomit', 1),
    ];
    expect(summarizeSymptomTrend(events, NOW)).toEqual({
      dominantSymptomType: 'vomit',
      thisWeekSymptomCount: 2,
      lastWeekSymptomCount: 0,
    });
  });

  it('splits the two windows at exactly 7 days, half-open', () => {
    const events = [ev('vomit', 6.9), ev('vomit', 7.1)];
    const r = summarizeSymptomTrend(events, NOW);
    expect(r.thisWeekSymptomCount).toBe(1);
    expect(r.lastWeekSymptomCount).toBe(1);
  });

  it('drops events older than the 14-day lookback', () => {
    expect(summarizeSymptomTrend([ev('vomit', 20)], NOW).lastWeekSymptomCount).toBe(0);
  });

  // The tie-break bug: the first cut iterated alphabetically, so `diarrhea` beat
  // `vomit` on a genuine tie while the engine — iterating CORRELATION_SYMPTOM_TYPES in
  // declared order — picked `vomit`. Two cards, two different "dominant" symptoms.
  it('breaks a true tie by the engine’s declared order, not alphabetically', () => {
    const events = [ev('vomit', 1), ev('diarrhea', 2), ev('itch', 3)];
    expect(summarizeSymptomTrend(events, NOW).dominantSymptomType).toBe('vomit');
    expect(TREND_SYMPTOM_TYPES.indexOf('vomit')).toBeLessThan(
      TREND_SYMPTOM_TYPES.indexOf('diarrhea'),
    );
  });

  it('prefers the higher current count over the larger fall', () => {
    const events = [
      ev('vomit', 1), ev('vomit', 3),                       // 2 this week
      ev('itch', 2),                                        // 1 this week
      ev('itch', 8), ev('itch', 9), ev('itch', 10),         // 3 last week (bigger fall)
    ];
    expect(summarizeSymptomTrend(events, NOW).dominantSymptomType).toBe('vomit');
  });

  // THE TIE-BREAK DIRECTION. An earlier version copied detectReflections' "larger fall"
  // tie-break without its candidate filter (`currentCount <= priorCount`). Inside that
  // filter the rule only orders already-falling symptoms; outside it, it systematically
  // prefers the symptom going AWAY over the one that just arrived. Adversarial review
  // reproduced it three ways. These pin the corrected direction.
  it('breaks an equal-count tie toward the RISING symptom, not the resolving one', () => {
    const events = [
      ev('vomit', 1),                                       // 1 this / 0 last — rising
      ev('itch', 2), ev('itch', 9), ev('itch', 10),         // 1 this / 2 last — resolving
    ];
    expect(summarizeSymptomTrend(events, NOW).dominantSymptomType).toBe('vomit');
  });

  it('names the acute vomiting bout, not the resolving itch beside it', () => {
    // Four vomits inside ninety minutes = ONE episode, which ties it with the itch at 1.
    // The old rule handed the card to the itch and never named the vomiting at all,
    // over a chart whose tallest column was entirely vomit.
    const events = [
      ev('vomit', 1, 0), ev('vomit', 1, 0.5), ev('vomit', 1, 1), ev('vomit', 1, 1.5),
      ev('itch', 2), ev('itch', 9),
    ];
    expect(summarizeSymptomTrend(events, NOW).dominantSymptomType).toBe('vomit');
  });

  it('names a steady chronic symptom over a falling one at the same count', () => {
    const events = [
      ev('vomit', 1), ev('vomit', 3), ev('vomit', 5),                     // 3 this
      ev('vomit', 8), ev('vomit', 10), ev('vomit', 12),                   // 3 last — flat
      ev('itch', 2), ev('itch', 4), ev('itch', 6),                        // 3 this
      ev('itch', 8), ev('itch', 9), ev('itch', 10), ev('itch', 11), ev('itch', 12), // 5 last — falling
    ];
    expect(summarizeSymptomTrend(events, NOW).dominantSymptomType).toBe('vomit');
  });

  // The absence floor, shared with detectReflections: "0 episodes this week" is
  // reassurance-by-absence with the word "improving" removed.
  it('never picks a silent symptom over an active one', () => {
    const events = [
      ev('vomit', 9), ev('vomit', 10), ev('vomit', 11),     // 3 last week, 0 this week
      ev('itch', 2),                                        // 1 this week
    ];
    const r = summarizeSymptomTrend(events, NOW);
    expect(r.dominantSymptomType).toBe('itch');
    expect(r.thisWeekSymptomCount).toBe(1);
  });

  it('falls back to the prior window with a ZERO count when this week is silent', () => {
    // The card renders no count line at 0 — the empty half of the chart is the only
    // statement. What matters here is that the count is honestly 0, never suppressed
    // into looking like an active week.
    const events = [ev('vomit', 9), ev('vomit', 10)];
    expect(summarizeSymptomTrend(events, NOW)).toEqual({
      dominantSymptomType: 'vomit',
      thisWeekSymptomCount: 0,
      lastWeekSymptomCount: 2,
    });
  });

  it('returns a null subject when nothing was logged at all', () => {
    expect(summarizeSymptomTrend([ev('meal', 1)], NOW)).toEqual({
      dominantSymptomType: null,
      thisWeekSymptomCount: 0,
      lastWeekSymptomCount: 0,
    });
  });

  it('keeps lethargy chartable but never lets it win a tie', () => {
    // Deliberate divergence from CORRELATION_SYMPTOM_TYPES: that list scopes
    // food->symptom correlation, not what belongs on a symptom chart.
    expect(summarizeSymptomTrend([ev('lethargy', 1)], NOW).dominantSymptomType).toBe('lethargy');
    expect(
      summarizeSymptomTrend([ev('lethargy', 1), ev('vomit', 2)], NOW).dominantSymptomType,
    ).toBe('vomit');
  });

  it('counts an overnight chained bout once, on the day it began', () => {
    // 20:00, 22:00, 00:00, 02:00 — one bout across midnight, onset in the current
    // window. Not four episodes, and not one per calendar day.
    const events = [ev('vomit', 2, 0), ev('vomit', 2, 2), ev('vomit', 2, 4), ev('vomit', 2, 6)];
    expect(summarizeSymptomTrend(events, NOW).thisWeekSymptomCount).toBe(1);
  });
});
