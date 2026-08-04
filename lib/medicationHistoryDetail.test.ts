// The med-detail past-course COPY, pinned (B-140 extended, PR 3).
//
// Spec §5 says H1/H2/H4 are "enforced by tests over the derivation AND the copy, not by
// review". `medicationHistory.test.ts` (PR 1) pins the derivation; this pins the copy
// this screen renders from it:
//   H1  an ending is stated only from an owner action — an orphan (or any non-ended)
//       course never says "Ended"/"Marked complete"/"Stopped".
//   H2  counted facts, never a percentage or grade.
//   H4  the count is the derivation's `dosesLogged` field, read verbatim — never a re-count.
// Plus mock §03 fidelity (Frame A / Frame B) and the timezone-honest date formatting
// (formatters force UTC, so the assertions hold under the B-514 non-UTC CI zones).

import {
  buildPastCourseFacts,
  evidenceLinkLabel,
  formatCourseDay,
  formatCourseDateRange,
} from './medicationHistoryDetail';
import type { MedicationCourse, MedicationCourseEnd } from './medicationHistory';

function course(over: Partial<MedicationCourse> = {}): MedicationCourse {
  return {
    key: 'reg-1',
    source: 'regimen',
    regimenId: 'reg-1',
    medicationItemId: 'item-metro',
    drugName: 'Metronidazole',
    isActive: false,
    tally: { given: 26, partial: 0, missed: 0, refused: 0, unrated: 0 },
    dosesLogged: 26,
    firstDoseIso: '2026-03-04T08:00:00Z',
    lastDoseIso: '2026-03-15T08:00:00Z',
    firstDoseDay: '2026-03-04',
    lastDoseDay: '2026-03-15',
    startedAt: '2026-03-03',
    dosesPerDay: 2,
    scheduleNotes: 'with food',
    route: 'oral',
    doseAmount: '250 mg',
    plannedDoses: 28,
    targetDurationDays: 14,
    runDays: 14,
    end: { kind: 'ended', status: 'completed', endedAt: '2026-03-16' } as MedicationCourseEnd,
    ...over,
  };
}

const val = (facts: { label: string; value: string }[], label: string): string | undefined =>
  facts.find((f) => f.label === label)?.value;

// The ending vocabulary H1 forbids on anything that did not end by an owner action.
const ENDING_WORDS = /marked complete|stopped|\bended\b|completed/i;

describe('buildPastCourseFacts — Frame A: an ended regimen (mock §03)', () => {
  it('renders the full counted fact set', () => {
    const { facts, evidenceDoseCount } = buildPastCourseFacts(course());
    expect(facts).toEqual([
      { label: 'Course', value: 'Mar 3 – Mar 16, 2026' },
      { label: 'Length', value: '14 days' },
      { label: 'Doses logged', value: '26 of 28 planned' },
      { label: 'Schedule', value: 'Twice a day, with food' },
      { label: 'Ended', value: 'Marked complete Mar 16' },
    ]);
    expect(evidenceDoseCount).toBe(26);
  });

  it('a stopped course names the stop register', () => {
    const facts = buildPastCourseFacts(
      course({ end: { kind: 'ended', status: 'stopped', endedAt: '2026-03-10' } }),
    ).facts;
    expect(val(facts, 'Ended')).toBe('Stopped Mar 10');
  });

  it('an ending with no recorded date states the register alone, and the Course row falls back to the start', () => {
    const facts = buildPastCourseFacts(
      course({ end: { kind: 'ended', status: 'completed', endedAt: null }, runDays: null }),
    ).facts;
    expect(val(facts, 'Ended')).toBe('Marked complete');
    expect(val(facts, 'Course')).toBe('Started Mar 3, 2026'); // no end date → no range
    expect(val(facts, 'Length')).toBeUndefined(); // runDays null → no length
  });

  it('runDays of 1 is singular', () => {
    const facts = buildPastCourseFacts(course({ runDays: 1 })).facts;
    expect(val(facts, 'Length')).toBe('1 day');
  });
});

describe('buildPastCourseFacts — Frame B: a dose-derived course (mock §03)', () => {
  const orphan = course({
    key: 'item:item-zyrtec', source: 'doses', regimenId: null, medicationItemId: 'item-zyrtec',
    drugName: null, tally: { given: 3, partial: 0, missed: 0, refused: 0, unrated: 0 }, dosesLogged: 3,
    firstDoseDay: '2026-06-02', lastDoseDay: '2026-06-09', startedAt: null, dosesPerDay: null,
    scheduleNotes: null, route: null, doseAmount: null, plannedDoses: null, targetDurationDays: null,
    runDays: null, end: { kind: 'none', lastDoseIso: '2026-06-09T13:00:00Z' },
  });

  it('renders from doses alone — no length, no schedule, no ending', () => {
    const { facts, evidenceDoseCount } = buildPastCourseFacts(orphan);
    expect(facts).toEqual([
      { label: 'Doses logged', value: '3' },
      { label: 'First dose', value: 'Jun 2, 2026' },
      { label: 'Last dose logged', value: 'Jun 9, 2026' },
      { label: 'Course', value: 'No regimen set up' },
    ]);
    expect(evidenceDoseCount).toBe(3);
  });

  it('a single-day course states one date, not first + last', () => {
    const facts = buildPastCourseFacts(
      course({ ...orphan, tally: { given: 1, partial: 0, missed: 0, refused: 0, unrated: 0 },
        dosesLogged: 1, firstDoseDay: '2026-02-11', lastDoseDay: '2026-02-11' }),
    ).facts;
    expect(val(facts, 'Dose logged')).toBe('Feb 11, 2026');
    expect(val(facts, 'First dose')).toBeUndefined();
    expect(val(facts, 'Last dose logged')).toBeUndefined();
  });
});

describe('buildPastCourseFacts — H1: no ending from silence', () => {
  it('a dose-derived course NEVER renders an ending word', () => {
    const facts = buildPastCourseFacts(course({
      source: 'doses', regimenId: null, drugName: null, plannedDoses: null, runDays: null,
      startedAt: null, dosesPerDay: null, scheduleNotes: null,
      end: { kind: 'none', lastDoseIso: '2026-03-15T08:00:00Z' },
    })).facts;
    for (const f of facts) expect(f.value).not.toMatch(ENDING_WORDS);
    expect(val(facts, 'Course')).toBe('No regimen set up');
  });

  it('a regimen course that did not end by an owner action states the last dose, never an ending', () => {
    // A non-active, non-ended status (a future 'paused', an unknown token) → end.kind 'none'.
    const facts = buildPastCourseFacts(course({
      end: { kind: 'none', lastDoseIso: '2026-03-15T08:00:00Z' }, runDays: null,
    })).facts;
    expect(val(facts, 'Ended')).toBeUndefined();
    expect(val(facts, 'Last dose logged')).toBe('Mar 15, 2026');
  });
});

describe('buildPastCourseFacts — H2: counted facts, never a percentage or grade', () => {
  it('no fact value carries a % or a grade, across shapes', () => {
    const shapes = [
      course(),
      course({ plannedDoses: null }),
      course({ source: 'doses', regimenId: null, drugName: null, plannedDoses: null,
        startedAt: null, dosesPerDay: null, scheduleNotes: null, runDays: null,
        end: { kind: 'none', lastDoseIso: '2026-03-15T08:00:00Z' } }),
      course({ dosesLogged: 26, plannedDoses: 28, tally: { given: 24, partial: 2, missed: 0, refused: 2, unrated: 0 } }),
    ];
    for (const c of shapes) {
      for (const f of buildPastCourseFacts(c).facts) {
        expect(f.value).not.toMatch(/%/);
        expect(f.value.toLowerCase()).not.toContain('adherence');
        expect(f.value).not.toMatch(/\bgrade\b|[A-F][+-]?\b(?=\s*$)/);
      }
    }
  });
});

describe('buildPastCourseFacts — H4: the count is the derivation field, read verbatim', () => {
  it('uses course.dosesLogged, never a re-count of the tally', () => {
    // The tally says 99 given; the derivation-supplied dosesLogged says 26. The copy must
    // trust the field (a second count is the diet-trial §5.3 contradiction this forbids).
    const facts = buildPastCourseFacts(
      course({ dosesLogged: 26, plannedDoses: 28, tally: { given: 99, partial: 0, missed: 0, refused: 0, unrated: 0 } }),
    ).facts;
    expect(val(facts, 'Doses logged')).toBe('26 of 28 planned');
  });

  it('an ongoing/ad-hoc count with no planned total shows the bare count', () => {
    const facts = buildPastCourseFacts(course({ dosesLogged: 5, plannedDoses: null })).facts;
    expect(val(facts, 'Doses logged')).toBe('5');
  });
});

describe('buildPastCourseFacts — the evidence-link count', () => {
  it('is null when no dose was delivered (never "All 0 doses")', () => {
    expect(buildPastCourseFacts(course({ dosesLogged: 0 })).evidenceDoseCount).toBeNull();
  });

  it('is the delivered count otherwise', () => {
    expect(buildPastCourseFacts(course({ dosesLogged: 26 })).evidenceDoseCount).toBe(26);
  });
});

describe('the schedule line', () => {
  const sched = (dosesPerDay: number | null, scheduleNotes: string | null) =>
    val(buildPastCourseFacts(course({ dosesPerDay, scheduleNotes })).facts, 'Schedule');

  it('names the common cadences and folds in notes', () => {
    expect(sched(1, null)).toBe('Once a day');
    expect(sched(2, 'with food')).toBe('Twice a day, with food');
    expect(sched(3, null)).toBe('3× a day');
  });

  it('a PRN regimen (no cadence) reads "As needed"', () => {
    expect(sched(null, null)).toBe('As needed');
    expect(sched(null, 'for flare-ups')).toBe('As needed, for flare-ups');
  });
});

describe('date formatting is timezone-honest (forces UTC — B-514)', () => {
  it('formatCourseDay names the literal day with its year', () => {
    expect(formatCourseDay('2026-03-03')).toBe('Mar 3, 2026');
    expect(formatCourseDay('2026-01-01')).toBe('Jan 1, 2026'); // no zone slide to Dec 31
  });

  it('formatCourseDateRange shows the shared year once', () => {
    expect(formatCourseDateRange('2026-03-03', '2026-03-16')).toBe('Mar 3 – Mar 16, 2026');
  });

  it('formatCourseDateRange keeps both years when they differ', () => {
    expect(formatCourseDateRange('2025-12-30', '2026-01-05')).toBe('Dec 30, 2025 – Jan 5, 2026');
  });
});

describe('evidenceLinkLabel', () => {
  it('is singular-aware', () => {
    expect(evidenceLinkLabel(1)).toBe('1 dose in History');
    expect(evidenceLinkLabel(3)).toBe('All 3 doses in History');
    expect(evidenceLinkLabel(26)).toBe('All 26 doses in History');
  });
});
