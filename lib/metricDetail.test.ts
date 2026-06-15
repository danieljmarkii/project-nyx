// metricDetail → ./dashboardCards → ./analytics → ./db (expo-sqlite). Nothing here
// touches the DB — stub it so the native module chain isn't loaded under jest (the
// dashboardCards.test.ts / dashboardScreen.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  symptomLabel,
  buildSymptomDetailWindow,
  buildSymptomDetailWindows,
  type SymptomWindowInput,
} from './metricDetail';
import type { AnalyticsWindow } from './analytics';

// The metric detail-screen assembler + the clinical "vs your baseline" copy (B-093).
// The load-bearing surface: a symptom is ADVERSE, so the read must escalate softly on a
// rise but NEVER reassure on a fall or an absence (§11 #2/#3). These tests pin both the
// exact copy for the canonical cases AND a brute-force sweep proving the never-reassure
// invariant holds for every (current, prior) shape across all three windows.

// Positive reassurance vocabulary that must NEVER appear on an adverse symptom's read,
// regardless of direction. NOTE: "all-clear" is deliberately NOT here — the read USES it,
// but only in the negated "isn't the same as an all-clear" disclaimer (the safe form).
const REASSURING = [
  'better',
  'recovered',
  'recovering',
  'improv', // improving / improved
  'healthy',
  'back to normal',
  'all good',
  'all better',
  'no concern',
  'nothing to worry',
  'no worries',
  'doing well',
  'in the clear',
  'looking good',
  "she's fine",
  "he's fine",
];

function assertNoReassurance(text: string) {
  const lower = text.toLowerCase();
  for (const token of REASSURING) {
    expect(lower).not.toContain(token);
  }
  // nyx-voice Pattern 4: no exclamation marks anywhere.
  expect(text).not.toContain('!');
}

const win = (current: number, prior: number, series: number[] = []): SymptomWindowInput => ({
  current,
  prior,
  series,
});

describe('symptomLabel', () => {
  it('maps known quick-log types to their warm labels', () => {
    expect(symptomLabel('vomit')).toBe('Vomit');
    expect(symptomLabel('diarrhea')).toBe('Loose stool');
    expect(symptomLabel('lethargy')).toBe('Lethargy');
  });

  it('title-cases schema symptom types not in the quick-log map (never a raw token)', () => {
    expect(symptomLabel('scratch')).toBe('Scratch');
    expect(symptomLabel('skin_reaction')).toBe('Skin reaction');
  });
});

describe('buildSymptomDetailWindow — the "vs your baseline" read', () => {
  it('rising + established → soft attention-routing, never a firm directive', () => {
    const d = buildSymptomDetailWindow('month', win(9, 4, [1, 2, 3]), 'vomit', 'Nyx');
    expect(d.value).toBe('9');
    expect(d.established).toBe(true);
    expect(d.delta).toBe(5);
    expect(d.deltaLabel).toBe('5 more than last month');
    expect(d.baselineRead).toBe('A busier month than usual for Nyx — worth keeping an eye on.');
    expect(d.series).toEqual([1, 2, 3]); // passthrough — the sparkline shape
    assertNoReassurance(d.baselineRead);
  });

  it('falling + established → calm, with an EXPLICIT non-all-clear disclaimer', () => {
    const d = buildSymptomDetailWindow('month', win(2, 8), 'vomit', 'Nyx');
    expect(d.value).toBe('2');
    expect(d.established).toBe(true);
    expect(d.delta).toBe(-6);
    expect(d.deltaLabel).toBe('6 fewer than last month');
    expect(d.baselineRead).toBe(
      "Fewer than a usual month for Nyx — a quieter spell isn't the same as an all-clear, so keep logging.",
    );
    assertNoReassurance(d.baselineRead);
  });

  it('dropped to ZERO from a positive prior → POPULATED "0" in context, never a warm "none logged" all-clear', () => {
    const d = buildSymptomDetailWindow('week', win(0, 5, [0, 0, 0]), 'vomit', 'Nyx');
    expect(d.value).toBe('0');
    expect(d.state).toBeUndefined(); // NOT the empty state — the drop is shown in context
    expect(d.established).toBe(true);
    expect(d.delta).toBe(-5);
    expect(d.deltaLabel).toBe('None this week, down from 5');
    expect(d.baselineRead).toBe(
      "A quieter week for Nyx — a gap isn't the same as an all-clear, so keep logging.",
    );
    assertNoReassurance(d.baselineRead);
  });

  it('genuinely zero in BOTH windows → the warm empty state (safe: no prior burden)', () => {
    const d = buildSymptomDetailWindow('week', win(0, 0), 'vomit', 'Nyx');
    expect(d.value).toBe('0');
    expect(d.state).toEqual({ kind: 'empty' });
    expect(d.emptyMessage).toBe('No vomit logged this week.');
    expect(d.baselineRead).toBe('');
    expect(d.delta).toBeUndefined();
    expect(d.series).toEqual([]);
  });

  it('single observation (max<2) → factual, no verdict either way, delta SUPPRESSED', () => {
    const up = buildSymptomDetailWindow('week', win(1, 0), 'vomit', 'Nyx');
    expect(up.value).toBe('1');
    expect(up.established).toBe(false);
    expect(up.delta).toBeUndefined(); // a delta invites the trend reading we disclaim
    expect(up.baselineRead).toBe(
      'Just one logged this week for Nyx — not enough yet to read as a trend.',
    );
    // n=1 must NOT alarm: none of the rising verdict language leaks in.
    expect(up.baselineRead).not.toContain('busier');
    expect(up.baselineRead).not.toContain('keeping an eye on');

    const flat = buildSymptomDetailWindow('week', win(1, 1), 'vomit', 'Nyx');
    expect(flat.baselineRead).toBe(
      'Just one logged this week for Nyx — not enough yet to read as a trend.',
    );
    expect(flat.delta).toBeUndefined();
  });

  it('steady + established → neutral "about the same"', () => {
    const d = buildSymptomDetailWindow('month', win(3, 3), 'vomit', 'Nyx');
    expect(d.delta).toBe(0);
    expect(d.established).toBe(true);
    expect(d.baselineRead).toBe('About the same as a usual month for Nyx.');
  });

  it('falls back to the second-person "your pet" when no name is given (nyx-voice Pattern 1)', () => {
    const d = buildSymptomDetailWindow('week', win(1, 0), 'vomit', undefined);
    expect(d.baselineRead).toBe(
      'Just one logged this week for your pet — not enough yet to read as a trend.',
    );
  });

  it('3-month window uses its own phrasing', () => {
    const d = buildSymptomDetailWindow('3month', win(0, 0), 'lethargy', 'Nyx');
    expect(d.emptyMessage).toBe('No lethargy logged in the last 3 months.');
  });
});

describe('buildSymptomDetailWindows', () => {
  it('assembles all three windows from per-window inputs', () => {
    const out = buildSymptomDetailWindows({
      symptomType: 'vomit',
      petName: 'Nyx',
      windows: {
        week: win(2, 1, [1, 1]),
        month: win(9, 4),
        '3month': win(20, 18),
      },
    });
    expect(Object.keys(out).sort()).toEqual(['3month', 'month', 'week']);
    expect(out.week.value).toBe('2');
    expect(out.month.baselineRead).toContain('busier');
    expect(out['3month'].value).toBe('20');
  });
});

describe('never-reassure invariant — brute-force sweep over every shape', () => {
  const WINDOWS: AnalyticsWindow[] = ['week', 'month', '3month'];

  it('no output ever reassures, and EVERY decrease carries the non-all-clear disclaimer', () => {
    for (const window of WINDOWS) {
      for (let current = 0; current <= 6; current++) {
        for (let prior = 0; prior <= 6; prior++) {
          const d = buildSymptomDetailWindow(window, win(current, prior), 'vomit', 'Nyx');
          const copy = `${d.baselineRead} ${d.emptyMessage ?? ''}`;
          // (a) no positive reassurance vocabulary, no "!", in any state.
          assertNoReassurance(copy);
          // (b) every DECREASE (including a drop to zero) explicitly disclaims an all-clear
          //     — the load-bearing §11 #3 guard, asserted across the whole shape space.
          if (current < prior) {
            expect(d.baselineRead.toLowerCase()).toContain("isn't the same as an all-clear");
          }
          // (c) a non-established reading (single observation) never carries a verdict
          //     template — n=1 earns no rise/fall read in either direction.
          if (current >= 1 && Math.max(current, prior) < 2) {
            expect(d.baselineRead).toContain('not enough yet to read as a trend');
            expect(d.delta).toBeUndefined();
          }
        }
      }
    }
  });
});
