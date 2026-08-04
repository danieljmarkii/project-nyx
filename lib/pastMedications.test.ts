// B-140 PR 2 — the profile "Past medications" section's row copy.
//
// These assertions ARE the H1/H2 contract (spec §5), pinned over the pure copy rather
// than left to review — the same stance `medicationHistory.test.ts` takes over the
// derivation:
//   • H1 — an ending renders ONLY from an owner action. The pill is "Ended" solely for
//     a completed/stopped course; active/paused/dose-derived courses (however old) say
//     "No end recorded" and the fact line carries the last-dose date. No date, and no
//     silence, ever produces "Ended"/"Completed".
//   • H2 — the fact line is a COUNT, never a percentage or a grade. No "%", no "of N"
//     denominator, no evaluative word.
// Plus name resolution (regimen self-names / orphan resolves from the catalog / honest
// fallback), the timezone-honest lexical date formatter, and the past-only filter.

import {
  pastCourseName,
  pastCourseMeta,
  pastCoursePill,
  courseDateRange,
  buildPastCourseRow,
  buildPastCourseRows,
  FALLBACK_DRUG_NAME,
  type MedicationItemName,
} from './pastMedications';
import type { MedicationCourse, MedicationCourseEnd } from './medicationHistory';

// ── Fixtures ────────────────────────────────────────────────────────────────────────

// A MedicationCourse with sane defaults; override per case. The copy functions read only
// a subset of the fields, so the defaults describe a plausible ended regimen and each
// test narrows what it asserts.
function course(over: Partial<MedicationCourse> = {}): MedicationCourse {
  const end: MedicationCourseEnd = over.end ?? { kind: 'ended', status: 'completed', endedAt: '2026-03-16' };
  return {
    key: 'reg-1',
    source: 'regimen',
    regimenId: 'reg-1',
    medicationItemId: 'item-metro',
    drugName: 'Metronidazole',
    isActive: false,
    tally: { given: 26, partial: 0, missed: 0, refused: 0, unrated: 0 },
    dosesLogged: 26,
    firstDoseIso: '2026-03-03T08:00:00Z',
    lastDoseIso: '2026-03-16T20:00:00Z',
    firstDoseDay: '2026-03-03',
    lastDoseDay: '2026-03-16',
    startedAt: '2026-03-03',
    dosesPerDay: 2,
    scheduleNotes: 'with food',
    route: 'oral',
    doseAmount: '250 mg',
    plannedDoses: 28,
    targetDurationDays: 14,
    runDays: 14,
    ...over,
    end,
  };
}

// A dose-derived (orphan) course — no regimen, so it can NEVER be "ended" (H1 by
// construction). Names itself from a catalog item id.
function orphan(over: Partial<MedicationCourse> = {}): MedicationCourse {
  return course({
    key: 'item:item-zyrtec',
    source: 'doses',
    regimenId: null,
    medicationItemId: 'item-zyrtec',
    drugName: null,
    tally: { given: 3, partial: 0, missed: 0, refused: 0, unrated: 0 },
    dosesLogged: 3,
    firstDoseIso: '2026-06-02T13:00:00Z',
    lastDoseIso: '2026-06-04T13:00:00Z',
    firstDoseDay: '2026-06-02',
    lastDoseDay: '2026-06-04',
    startedAt: null,
    dosesPerDay: null,
    scheduleNotes: null,
    route: null,
    doseAmount: null,
    plannedDoses: null,
    targetDurationDays: null,
    runDays: null,
    end: { kind: 'none', lastDoseIso: '2026-06-04T13:00:00Z' },
    ...over,
  });
}

const NAMES = new Map<string, MedicationItemName>([
  ['item-zyrtec', { generic_name: 'cetirizine', brand_name: 'Zyrtec' }],
  ['item-cerenia', { generic_name: 'maropitant', brand_name: 'Cerenia' }],
  ['item-generic-only', { generic_name: 'gabapentin', brand_name: null }],
]);

// ── H1 — an ending renders ONLY from an owner action ─────────────────────────────────

describe('past-medications copy — H1: no ending from silence', () => {
  it('a completed/stopped course shows the "Ended" pill and the end date', () => {
    for (const status of ['completed', 'stopped'] as const) {
      const c = course({ end: { kind: 'ended', status, endedAt: '2026-03-16' } });
      const pill = pastCoursePill(c);
      expect(pill.label).toBe('Ended');
      expect(pill.tone).toBe('ended');
      // the meta carries the owner-recorded window, ending on the end date
      expect(pastCourseMeta(c)).toContain('Mar 16, 2026');
    }
  });

  it('an active/paused/unknown-status course NEVER says "Ended" — it says "No end recorded"', () => {
    for (const status of ['active', 'paused', 'weird-future-value'] as const) {
      // Even with an ended_at set, a non-owner-action status is `end.kind === 'none'`
      // (the derivation guarantees this); the copy must render the open register.
      const c = course({ isActive: status === 'active', end: { kind: 'none', lastDoseIso: '2026-03-09T08:00:00Z' } });
      const pill = pastCoursePill(c);
      expect(pill.label).toBe('No end recorded');
      expect(pill.tone).toBe('open');
      expect(pill.label).not.toContain('Ended');
    }
  });

  it('a dose-derived course, however old its last dose, says "No end recorded" and carries the last-dose date', () => {
    const c = orphan({
      firstDoseDay: '2024-01-01', lastDoseDay: '2024-01-05',
      firstDoseIso: '2024-01-01T08:00:00Z', lastDoseIso: '2024-01-05T08:00:00Z',
      end: { kind: 'none', lastDoseIso: '2024-01-05T08:00:00Z' },
    });
    expect(pastCoursePill(c).label).toBe('No end recorded');
    // the record's last-dose date stands in for the (absent) ending — never "Ended"
    expect(pastCourseMeta(c)).toContain('Jan 5, 2024');
    expect(pastCourseMeta(c)).not.toMatch(/ended|completed|stopped|finished/i);
  });

  it('the pill and meta of an open course contain no ending word at all', () => {
    const c = orphan();
    const row = buildPastCourseRow(c, NAMES);
    expect(`${row.pill.label} ${row.meta}`).not.toMatch(/ended|complete|stopped|finished/i);
    expect(row.faint).toBe(true); // the open register renders quieter
  });

  it('an ended course renders at full strength (not faint)', () => {
    expect(buildPastCourseRow(course(), NAMES).faint).toBe(false);
  });
});

// ── H2 — a count, never a percentage or a grade ──────────────────────────────────────

describe('past-medications copy — H2: counted facts, never a rate or a grade', () => {
  it('the ended fact line states a dose count, not a percentage or a denominator', () => {
    const meta = pastCourseMeta(course()); // 26 logged, 28 planned
    expect(meta).toContain('26 doses logged');
    expect(meta).not.toContain('%');
    expect(meta).not.toContain('of 28'); // the "of N planned" denominator is the detail screen's (PR 3)
    expect(meta).not.toContain('28');
  });

  it('no register ever emits "%", a grade, or an evaluative word', () => {
    const metas = [
      pastCourseMeta(course()),
      pastCourseMeta(orphan()),
      pastCourseMeta(course({ dosesLogged: 0, tally: { given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 } })),
    ];
    for (const meta of metas) {
      expect(meta).not.toContain('%');
      expect(meta).not.toMatch(/adherence|compliance|great|good|poor|on track|★/i);
    }
  });

  it('an ended course with zero logged doses is honest ("No doses logged"), never blank or reassuring', () => {
    const c = course({ dosesLogged: 0, tally: { given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 } });
    const meta = pastCourseMeta(c);
    expect(meta).toContain('No doses logged');
    expect(meta).toContain('14 days'); // the length is the owner-recorded span, independent of doses
    expect(meta).toContain('Mar 3 – Mar 16, 2026');
  });
});

// ── The two fact-line registers, end to end ──────────────────────────────────────────

describe('past-medications copy — the fact line', () => {
  it('ended: "start – end, year · N days · N doses logged"', () => {
    expect(pastCourseMeta(course())).toBe('Mar 3 – Mar 16, 2026 · 14 days · 26 doses logged');
  });

  it('ended with a null end date still ends (owner asserted it), falling back to the start date', () => {
    const c = course({ end: { kind: 'ended', status: 'stopped', endedAt: null }, runDays: null });
    expect(pastCoursePill(c).label).toBe('Ended');
    expect(pastCourseMeta(c)).toBe('Started Mar 3, 2026 · 26 doses logged');
  });

  it('no end, multi-day span: "N doses · start – end, year"', () => {
    // orphan(): 3 doses, Jun 2 → Jun 4. The span's end IS the last-dose date (H1's
    // stand-in for the absent ending); no redundant "last dose logged" tail.
    expect(pastCourseMeta(orphan())).toBe('3 doses · Jun 2 – Jun 4, 2026');
  });

  it('no end, single dose: "1 dose · date"', () => {
    const c = orphan({
      tally: { given: 1, partial: 0, missed: 0, refused: 0, unrated: 0 }, dosesLogged: 1,
      firstDoseDay: '2026-02-11', lastDoseDay: '2026-02-11',
      firstDoseIso: '2026-02-11T13:00:00Z', lastDoseIso: '2026-02-11T13:00:00Z',
      end: { kind: 'none', lastDoseIso: '2026-02-11T13:00:00Z' },
    });
    expect(pastCourseMeta(c)).toBe('1 dose · Feb 11, 2026');
  });
});

// ── Name resolution ──────────────────────────────────────────────────────────────────

describe('past-medications copy — name resolution', () => {
  it('a regimen course names itself from drug_name', () => {
    expect(pastCourseName(course({ drugName: 'Metronidazole' }), NAMES)).toBe('Metronidazole');
  });

  it('a dose-derived course resolves brand-first from the catalog (B-171 app voice)', () => {
    expect(pastCourseName(orphan({ medicationItemId: 'item-zyrtec' }), NAMES)).toBe('Zyrtec');
    expect(pastCourseName(orphan({ medicationItemId: 'item-generic-only' }), NAMES)).toBe('gabapentin');
  });

  it('an unresolvable item id or the unspecified orphan falls back to a neutral name, never a guess', () => {
    expect(pastCourseName(orphan({ medicationItemId: 'item-not-cached' }), NAMES)).toBe(FALLBACK_DRUG_NAME);
    expect(pastCourseName(orphan({ medicationItemId: null }), NAMES)).toBe(FALLBACK_DRUG_NAME);
  });
});

// ── Date formatter (timezone-honest, lexical) ────────────────────────────────────────

describe('courseDateRange — lexical, clock-free, honest about the year', () => {
  it('single date carries the year', () => {
    expect(courseDateRange('2026-02-11', '2026-02-11')).toBe('Feb 11, 2026');
    expect(courseDateRange('2026-02-11', null)).toBe('Feb 11, 2026');
    expect(courseDateRange(null, '2026-02-11')).toBe('Feb 11, 2026');
  });

  it('same-year range states the year once, on the end', () => {
    expect(courseDateRange('2026-03-03', '2026-03-16')).toBe('Mar 3 – Mar 16, 2026');
  });

  it('cross-year range states both years', () => {
    expect(courseDateRange('2025-12-28', '2026-01-05')).toBe('Dec 28, 2025 – Jan 5, 2026');
  });

  it('omits the range when nothing parses (never a guessed date)', () => {
    expect(courseDateRange(null, null)).toBeNull();
    expect(courseDateRange('not-a-date', null)).toBeNull();
    expect(courseDateRange('2026-13-40', null)).toBeNull(); // out-of-range month/day
  });
});

// ── The section-level builder (past-only filter, order preserved) ────────────────────

describe('buildPastCourseRows — past courses only, order preserved', () => {
  it('drops active courses (they live on the Current medications card — no duplication)', () => {
    const rows = buildPastCourseRows(
      [
        course({ key: 'active-moto', isActive: true, drugName: 'Motozol', end: { kind: 'none', lastDoseIso: '2026-07-28T08:00:00Z' } }),
        course({ key: 'ended-metro', isActive: false, drugName: 'Metronidazole' }),
        orphan({ key: 'item:item-zyrtec' }),
      ],
      NAMES,
    );
    expect(rows.map((r) => r.key)).toEqual(['ended-metro', 'item:item-zyrtec']);
  });

  it('preserves the derivation ordering it is handed', () => {
    const rows = buildPastCourseRows(
      [orphan({ key: 'b' }), course({ key: 'a', isActive: false })],
      NAMES,
    );
    expect(rows.map((r) => r.key)).toEqual(['b', 'a']); // not re-sorted
  });

  it('carries the navigation target only for catalog-backed courses', () => {
    const rows = buildPastCourseRows(
      [
        course({ key: 'free-text', medicationItemId: null, isActive: false }), // free-text regimen
        orphan({ key: 'item:item-zyrtec', medicationItemId: 'item-zyrtec' }),
      ],
      NAMES,
    );
    expect(rows.find((r) => r.key === 'free-text')!.medicationItemId).toBeNull();
    expect(rows.find((r) => r.key === 'item:item-zyrtec')!.medicationItemId).toBe('item-zyrtec');
  });
});
