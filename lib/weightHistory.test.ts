// CUL-223 — the weight-history screen's view model.
//
// The rule under test that is easy to get wrong is the YEAR BAND. The cards format a
// date with lib/weight's formatWeightDate, which stamps a year only when the date is
// outside the current one. That is safe on a card, which shows ONE date. It is not safe
// in a list: applied per row it renders "Nov 23, 2025" directly above a bare "Jun 12",
// and a bare date following a year-stamped one inherits that year (CUL-69 rule 2), so
// the NEWER reading reads as the older. The band decides once, for every row.
//
// Timezone-honest fixtures (B-514): the year is read from LOCAL components, so every
// instant here is built from local components rather than a UTC literal — 2026-01-01T…Z
// is 2025 in the Americas and the assertion would silently become a statement about the
// runner's clock. The `now` argument is explicit for the same reason.

// kgToLbs (the one shared rounding rule) lives in lib/weight, which imports the
// supabase client for its write path — so the client is stubbed here rather than
// minting a second conversion in this module, which is the thing that makes two
// surfaces print different numbers for one reading.
jest.mock('./supabase', () => ({ supabase: {} }));

import {
  buildWeightHistoryRows,
  weightReadingsSubtitle,
  weightRowAccessibilityLabel,
  noWeightReadingsLine,
} from './weightHistory';
import type { WeightReadingRow } from './weight';

const NOW = new Date(2026, 5, 20, 12, 0); // 20 Jun 2026, local

function reading(
  eventId: string,
  weightKg: number,
  at: Date,
  extra: Partial<WeightReadingRow> = {},
): WeightReadingRow {
  return {
    eventId,
    weightKg,
    occurredAt: at.toISOString(),
    confidence: 'witnessed',
    earliest: null,
    latest: null,
    ...extra,
  };
}

describe('buildWeightHistoryRows — the year band', () => {
  it('omits the year when every reading is in the current year', () => {
    const rows = buildWeightHistoryRows(
      [
        reading('a', 5.6, new Date(2026, 5, 12, 15, 14)),
        reading('b', 5.7, new Date(2026, 2, 3, 9, 0)),
      ],
      NOW,
    );
    expect(rows.every((r) => !/20\d\d/.test(r.when))).toBe(true);
  });

  it('stamps the year on EVERY row when any reading falls outside it', () => {
    // The defect this exists for: per-row stamping renders "Nov 23, 2025" above a bare
    // "Jun 12", and the bare one inherits the stamped year — the June 2026 reading
    // reads as June 2025, i.e. as OLDER than the row above it.
    const rows = buildWeightHistoryRows(
      [
        reading('a', 5.6, new Date(2026, 5, 12, 15, 14)),
        reading('b', 5.9, new Date(2025, 10, 23, 8, 2)),
      ],
      NOW,
    );
    expect(rows.every((r) => /20\d\d/.test(r.when))).toBe(true);
    expect(rows[0].when).toContain('2026');
    expect(rows[1].when).toContain('2025');
  });

  it('stamps the year even when the OUT-OF-BAND reading is not the first row', () => {
    // Ordering must not decide the band — a scan that only looked at readings[0] would
    // pass the test above and fail here.
    const rows = buildWeightHistoryRows(
      [
        reading('a', 5.6, new Date(2026, 5, 12, 15, 14)),
        reading('b', 5.7, new Date(2026, 1, 2, 9, 0)),
        reading('c', 5.9, new Date(2024, 10, 23, 8, 2)),
      ],
      NOW,
    );
    expect(rows.every((r) => /20\d\d/.test(r.when))).toBe(true);
  });
});

describe('buildWeightHistoryRows — the row', () => {
  it('renders the value through the shared 0.1 lb rounding rule', () => {
    const [row] = buildWeightHistoryRows([reading('a', 5.6, new Date(2026, 5, 12, 15, 14))], NOW);
    // 5.6 kg → 12.3 lbs via kgToLbs, the same rule the card, the History row and the
    // edit pre-fill use. A second rounding rule here is how two surfaces disagree.
    expect(row.value).toBe('12.3 lbs');
  });

  it('carries the parent event id as the tap target', () => {
    const [row] = buildWeightHistoryRows([reading('evt-1', 5.6, new Date(2026, 5, 12, 15, 14))], NOW);
    expect(row.eventId).toBe('evt-1');
  });

  it('preserves the order it was given (the query returns newest-first)', () => {
    const rows = buildWeightHistoryRows(
      [
        reading('newest', 5.6, new Date(2026, 5, 12)),
        reading('oldest', 5.9, new Date(2026, 0, 4)),
      ],
      NOW,
    );
    expect(rows.map((r) => r.eventId)).toEqual(['newest', 'oldest']);
  });

  it('renders a windowed row through the shared honest-time path, not a false exact time', () => {
    // A weight check is witnessed by construction, so this is a legacy/hand-edited
    // shape. It still must not print a precision the row does not hold.
    const [row] = buildWeightHistoryRows(
      [
        reading('a', 5.6, new Date(2026, 5, 12, 15, 14), {
          confidence: 'window',
          earliest: null,
          latest: new Date(2026, 5, 12, 17, 30).toISOString(),
        }),
      ],
      NOW,
    );
    expect(row.when).toContain('found by');
  });

  it('states NO verdict — no delta, arrow, or comparison between neighbouring rows', () => {
    // The guardrail, pinned: a weight trend never reassures, and a list is where a
    // per-row comparison would read as a verdict on one weigh-in. Rows carry a value
    // and a date; the row shape has nowhere to put anything else.
    const rows = buildWeightHistoryRows(
      [
        reading('a', 5.6, new Date(2026, 5, 12)),
        reading('b', 6.4, new Date(2026, 4, 12)),
      ],
      NOW,
    );
    expect(Object.keys(rows[0]).sort()).toEqual(['eventId', 'value', 'when']);
    const text = rows.map((r) => `${r.value} ${r.when}`).join(' ');
    expect(text).not.toMatch(/up|down|↑|↓|steady|stable|improv|gain|loss/i);
  });
});

describe('copy', () => {
  it('singularises one reading', () => {
    expect(weightReadingsSubtitle(1)).toBe('1 reading');
    expect(weightReadingsSubtitle(7)).toBe('7 readings');
  });

  it('rejoins the row into one announcement and says where the tap goes', () => {
    const label = weightRowAccessibilityLabel({ eventId: 'a', value: '12.3 lbs', when: 'Jun 12 · 3:14 PM' });
    expect(label).toBe('12.3 lbs, Jun 12 · 3:14 PM. Open this reading.');
  });

  it('invites a first reading without saying anything is fine', () => {
    const line = noWeightReadingsLine('Nyx');
    expect(line).toContain('Nyx');
    expect(line).not.toMatch(/!|healthy|fine|good|normal|no concerns/i);
  });
});
