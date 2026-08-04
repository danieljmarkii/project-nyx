// B-140 PR 1 — the shared course derivation (lib/medicationHistory.deriveMedicationCourses).
//
// These assertions ARE the H1/H4 contract (spec §5), pinned over the derivation rather
// than left to review:
//   • H1 — an ending renders ONLY from an owner action (status ∈ {completed, stopped}).
//     No status silence, and no dose-derived course, ever produces end.kind === 'ended'.
//   • H4 — every headline count equals `dosesTowardTarget` for the same course; the
//     regimen path equals `attributeDosesToRegimens`, the orphan path `tallyDoses`. There
//     is no second count.
// Plus the PR-1 adversarial counterexamples (a zero-dose regimen; doses spanning a
// deleted regimen; a dose after an explicit end; two regimens for one drug; DST/zone
// straddles) and the B-514 timezone-honest idiom (day labels asserted only under an
// explicit `timeZone`; the DATE-based length asserted zone-stable).

import {
  deriveMedicationCourses,
  type MedicationHistoryRegimen,
  type MedicationCourse,
} from './medicationHistory';
import {
  attributeDosesToRegimens,
  dosesTowardTarget,
  tallyDoses,
  type AttributableDose,
} from './medications';

// ── Fixtures ────────────────────────────────────────────────────────────────────────

function reg(over: Partial<MedicationHistoryRegimen> = {}): MedicationHistoryRegimen {
  return {
    id: 'reg-1',
    medication_item_id: 'item-metro',
    drug_name: 'Metronidazole',
    dose_amount: '250 mg',
    route: 'oral',
    doses_per_day: 2,
    schedule_notes: 'with food',
    started_at: '2026-03-03',
    target_duration_days: 14,
    target_duration_doses: null,
    status: 'active',
    ended_at: null,
    ...over,
  };
}

function dose(over: Partial<AttributableDose> = {}): AttributableDose {
  return {
    medication_id: null,
    medication_item_id: 'item-metro',
    adherence: 'given',
    deleted_at: null,
    occurred_at: '2026-03-05T08:00:00Z',
    ...over,
  };
}

// N given doses of a drug, one per DAY starting at `startIso`, as ad-hoc (unlinked)
// rows — the one-tap item+window path (B-135). Used where a test asserts a day range.
function givenDoses(count: number, medicationItemId: string, startIso: string): AttributableDose[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) =>
    dose({
      medication_item_id: medicationItemId,
      occurred_at: new Date(startMs + i * 86_400_000).toISOString(),
    }),
  );
}

// N given doses logged AGAINST a regimen (medication_id set — the B-153 "Log a dose"
// path). Spaced 12h apart so a real BID course fits inside its own window, and — because
// the explicit link is authoritative — the attribution never re-checks started_at/
// ended_at. This is how doses realistically attach to a known course; the item+window
// path (givenDoses) and its inclusive-start / end-date boundary are exercised separately
// (here and in medications.test.ts), and that boundary is an inherited property of
// attributeDoses, deliberately unchanged by this PR.
function linkedDoses(count: number, regimenId: string, medicationItemId: string, startIso: string): AttributableDose[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) =>
    dose({
      medication_id: regimenId,
      medication_item_id: medicationItemId,
      occurred_at: new Date(startMs + i * 12 * 3_600_000).toISOString(),
    }),
  );
}

function byKey(courses: MedicationCourse[], key: string): MedicationCourse {
  const c = courses.find((x) => x.key === key);
  if (!c) throw new Error(`no course with key ${key}`);
  return c;
}

// ── Regimen courses — enrichment ─────────────────────────────────────────────────────

describe('deriveMedicationCourses — regimen enrichment', () => {
  it('an ended, days-denominated regimen renders the full fact set', () => {
    const courses = deriveMedicationCourses({
      regimens: [reg({ status: 'completed', ended_at: '2026-03-16' })],
      doses: linkedDoses(26, 'reg-1', 'item-metro', '2026-03-03T08:00:00Z'),
      timeZone: 'UTC',
    });
    expect(courses).toHaveLength(1);
    const c = courses[0];
    expect(c.source).toBe('regimen');
    expect(c.drugName).toBe('Metronidazole');
    expect(c.isActive).toBe(false);
    expect(c.startedAt).toBe('2026-03-03');
    expect(c.dosesPerDay).toBe(2);
    expect(c.scheduleNotes).toBe('with food');
    expect(c.dosesLogged).toBe(26);
    expect(c.plannedDoses).toBe(28); // 2 × 14 (days-denominated)
    expect(c.runDays).toBe(14); // Mar 3 → Mar 16 inclusive
    expect(c.end).toEqual({ kind: 'ended', status: 'completed', endedAt: '2026-03-16' });
  });

  it('a dose-denominated regimen takes plannedDoses straight from target_duration_doses', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg({ id: 'moto', medication_item_id: 'mi-moto', drug_name: 'Motozol',
        doses_per_day: 2, target_duration_days: null, target_duration_doses: 28 })],
      doses: givenDoses(26, 'mi-moto', '2026-07-22T08:00:00Z'),
      timeZone: 'UTC',
    });
    expect(c.plannedDoses).toBe(28); // the dispensed total, not 2 × elapsed
    expect(c.dosesLogged).toBe(26);
  });

  it('an ongoing regimen (no target) has plannedDoses null and runDays null', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg({ target_duration_days: null, target_duration_doses: null })],
      doses: givenDoses(3, 'item-metro', '2026-03-05T08:00:00Z'),
    });
    expect(c.plannedDoses).toBeNull();
    expect(c.runDays).toBeNull(); // ongoing → no honest length
  });

  it('a PRN regimen (no cadence, no dose target) has plannedDoses null', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg({ doses_per_day: null, target_duration_days: null, target_duration_doses: null })],
      doses: givenDoses(2, 'item-metro', '2026-03-05T08:00:00Z'),
    });
    expect(c.plannedDoses).toBeNull();
  });

  it('reads first/last dose from the regimen’s attributed doses (exact instants)', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg()],
      doses: [
        dose({ occurred_at: '2026-03-05T08:00:00Z' }),
        dose({ occurred_at: '2026-03-11T20:00:00Z' }),
        dose({ occurred_at: '2026-03-07T12:00:00Z' }),
      ],
      timeZone: 'UTC',
    });
    expect(c.firstDoseIso).toBe('2026-03-05T08:00:00Z');
    expect(c.lastDoseIso).toBe('2026-03-11T20:00:00Z');
  });
});

// ── H1 — no ending from silence ──────────────────────────────────────────────────────

describe('deriveMedicationCourses — H1: an ending renders only from an owner action', () => {
  it('an active regimen is never "ended"; it carries a last-dose date instead', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg({ status: 'active' })],
      doses: [dose({ occurred_at: '2026-03-09T08:00:00Z' })],
    });
    expect(c.end.kind).toBe('none');
    if (c.end.kind === 'none') expect(c.end.lastDoseIso).toBe('2026-03-09T08:00:00Z');
  });

  it('completed and stopped are the ONLY statuses that produce an ending', () => {
    for (const status of ['completed', 'stopped']) {
      const [c] = deriveMedicationCourses({ regimens: [reg({ status, ended_at: '2026-03-16' })], doses: [] });
      expect(c.end.kind).toBe('ended');
      if (c.end.kind === 'ended') expect(c.end.status).toBe(status);
    }
    // Anything else — active, a future 'paused', an unknown token — is never an ending.
    for (const status of ['active', 'paused', 'weird-future-value', '']) {
      const [c] = deriveMedicationCourses({ regimens: [reg({ status, ended_at: '2026-03-16' })], doses: [] });
      expect(c.end.kind).toBe('none'); // even with ended_at set, a non-owner-action status never "ends"
    }
  });

  it('a dose-derived course is NEVER ended, however old its last dose', () => {
    const courses = deriveMedicationCourses({
      regimens: [],
      doses: givenDoses(5, 'item-zyrtec', '2024-01-01T08:00:00Z'), // long ago
    });
    expect(courses).toHaveLength(1);
    expect(courses[0].source).toBe('doses');
    expect(courses[0].end.kind).toBe('none'); // no regimen, no status → no ending, by construction
  });

  it('an ended regimen with a null ended_at still ends (owner asserted it), with no date', () => {
    const [c] = deriveMedicationCourses({ regimens: [reg({ status: 'stopped', ended_at: null })], doses: [] });
    expect(c.end).toEqual({ kind: 'ended', status: 'stopped', endedAt: null });
    expect(c.runDays).toBeNull(); // no end date → no computable span
  });
});

// ── H4 — one count predicate, no rival ───────────────────────────────────────────────

describe('deriveMedicationCourses — H4: every count is dosesTowardTarget, never a second definition', () => {
  it('a regimen count equals attributeDosesToRegimens + dosesTowardTarget for the same inputs', () => {
    const regimens = [reg()];
    const doses = [
      dose({ adherence: 'given' }),
      dose({ adherence: 'partial' }),
      dose({ adherence: 'refused' }),
      dose({ adherence: 'missed' }),
      dose({ adherence: null }),
    ];
    const [c] = deriveMedicationCourses({ regimens, doses });
    const independent = dosesTowardTarget(attributeDosesToRegimens(regimens, doses).get('reg-1')!);
    expect(c.dosesLogged).toBe(independent);
    expect(c.dosesLogged).toBe(2); // given(1) + partial(1); refused/missed/unrated never count
    expect(c.dosesLogged).toBe(dosesTowardTarget(c.tally)); // the field is exactly the predicate over the exposed tally
  });

  it('an orphan count equals tallyDoses + dosesTowardTarget for its group', () => {
    const group = [
      dose({ medication_id: null, medication_item_id: 'item-otc', adherence: 'given' }),
      dose({ medication_id: null, medication_item_id: 'item-otc', adherence: 'partial' }),
      dose({ medication_id: null, medication_item_id: 'item-otc', adherence: 'refused' }),
    ];
    const [c] = deriveMedicationCourses({ regimens: [], doses: group });
    expect(c.dosesLogged).toBe(dosesTowardTarget(tallyDoses(group)));
    expect(c.dosesLogged).toBe(2); // given + partial
  });

  it('every course, regimen or orphan, satisfies dosesLogged === dosesTowardTarget(tally) and ≤ logged rows', () => {
    const courses = deriveMedicationCourses({
      regimens: [reg(), reg({ id: 'r2', medication_item_id: 'item-b', drug_name: 'DrugB' })],
      doses: [
        ...givenDoses(4, 'item-metro', '2026-03-04T08:00:00Z'),
        dose({ medication_item_id: 'item-b', adherence: 'partial', occurred_at: '2026-03-06T08:00:00Z' }),
        dose({ medication_item_id: 'item-otc', occurred_at: '2026-03-06T08:00:00Z' }), // orphan
        dose({ medication_item_id: 'item-otc', adherence: 'missed', occurred_at: '2026-03-07T08:00:00Z' }),
      ],
    });
    for (const c of courses) {
      const loggedRows = c.tally.given + c.tally.partial + c.tally.missed + c.tally.refused + c.tally.unrated;
      expect(c.dosesLogged).toBe(dosesTowardTarget(c.tally));
      expect(c.dosesLogged).toBeLessThanOrEqual(loggedRows);
    }
  });
});

// ── Dose-derived (orphan) courses ────────────────────────────────────────────────────

describe('deriveMedicationCourses — dose-derived courses', () => {
  it('ad-hoc doses with an item and no regimen become one course per drug', () => {
    const courses = deriveMedicationCourses({
      regimens: [],
      doses: [
        ...givenDoses(3, 'item-zyrtec', '2026-06-02T13:00:00Z'),
        ...givenDoses(1, 'item-cerenia', '2026-02-11T13:00:00Z'),
      ],
      timeZone: 'UTC',
    });
    expect(courses.map((c) => c.key).sort()).toEqual(['item:item-cerenia', 'item:item-zyrtec']);
    const zyrtec = byKey(courses, 'item:item-zyrtec');
    expect(zyrtec.source).toBe('doses');
    expect(zyrtec.drugName).toBeNull(); // the surface resolves the name from the item id
    expect(zyrtec.medicationItemId).toBe('item-zyrtec');
    expect(zyrtec.startedAt).toBeNull();
    expect(zyrtec.plannedDoses).toBeNull();
    expect(zyrtec.runDays).toBeNull();
    expect(zyrtec.dosesLogged).toBe(3);
    expect(zyrtec.firstDoseDay).toBe('2026-06-02');
    expect(zyrtec.lastDoseDay).toBe('2026-06-04'); // 3 daily doses from Jun 2
  });

  it('doses with no item id fold into a single "unspecified" course', () => {
    const courses = deriveMedicationCourses({
      regimens: [],
      doses: [
        dose({ medication_id: null, medication_item_id: null, occurred_at: '2026-05-01T10:00:00Z' }),
        dose({ medication_id: null, medication_item_id: null, occurred_at: '2026-05-02T10:00:00Z' }),
      ],
    });
    expect(courses).toHaveLength(1);
    expect(courses[0].key).toBe('item:unspecified');
    expect(courses[0].medicationItemId).toBeNull();
    expect(courses[0].dosesLogged).toBe(2);
  });

  it('a one-tap unlinked dose that item+window matches a regimen is NOT also an orphan (no double count)', () => {
    // The whole reason orphans come from the attribution leftovers, not a separate filter.
    const courses = deriveMedicationCourses({
      regimens: [reg({ started_at: '2026-03-01', status: 'active' })],
      doses: [dose({ medication_id: null, medication_item_id: 'item-metro', occurred_at: '2026-03-05T08:00:00Z' })],
    });
    expect(courses).toHaveLength(1); // the regimen only — no phantom orphan of the same drug
    expect(courses[0].source).toBe('regimen');
    expect(courses[0].dosesLogged).toBe(1);
  });
});

// ── Ordering ─────────────────────────────────────────────────────────────────────────

describe('deriveMedicationCourses — ordering (active first, then last-dose recency)', () => {
  it('puts active courses first, then most-recent last dose first, deterministically', () => {
    // Spec §3 orders by RECENCY (not the round-1 mock's illustrative order): the ad-hoc
    // Zyrtec (last dose Jun) precedes the older ended Metronidazole (Mar), below the
    // active course.
    const courses = deriveMedicationCourses({
      regimens: [
        reg({ id: 'moto', medication_item_id: 'mi-moto', drug_name: 'Motozol', status: 'active',
          started_at: '2026-07-22', target_duration_days: null, target_duration_doses: 28 }),
        reg({ id: 'metro', medication_item_id: 'mi-metro', drug_name: 'Metronidazole',
          status: 'completed', started_at: '2026-03-03', ended_at: '2026-03-16', target_duration_days: 14 }),
      ],
      doses: [
        ...givenDoses(3, 'mi-moto', '2026-07-28T08:00:00Z'),   // active, most recent
        ...givenDoses(3, 'mi-metro', '2026-03-04T08:00:00Z'),  // ended in Mar
        ...givenDoses(3, 'mi-zyrtec', '2026-06-02T13:00:00Z'), // ad-hoc, last dose Jun
        ...givenDoses(1, 'mi-cerenia', '2026-02-11T13:00:00Z'),// ad-hoc, oldest
      ],
      timeZone: 'UTC',
    });
    expect(courses.map((c) => c.key)).toEqual([
      'moto',              // active first
      'item:mi-zyrtec',    // last dose Jun 4
      'metro',             // last dose Mar 6
      'item:mi-cerenia',   // last dose Feb 11
    ]);
  });

  it('is stable for courses with no logged dose (they sort last, by name then key)', () => {
    const courses = deriveMedicationCourses({
      regimens: [
        reg({ id: 'b', drug_name: 'Bravecto', status: 'completed', ended_at: '2026-03-16' }),
        reg({ id: 'a', drug_name: 'Amoxicillin', status: 'completed', ended_at: '2026-03-16' }),
      ],
      doses: [],
    });
    // Both have no doses (sortMs -Infinity) → tiebreak on drugName: Amoxicillin before Bravecto.
    expect(courses.map((c) => c.drugName)).toEqual(['Amoxicillin', 'Bravecto']);
  });
});

// ── Adversarial counterexamples (PR-1 mandated) ──────────────────────────────────────

describe('deriveMedicationCourses — adversarial counterexamples', () => {
  it('a regimen with ZERO logged doses renders (does not crash, does not vanish)', () => {
    const [c] = deriveMedicationCourses({
      regimens: [reg({ status: 'completed', ended_at: '2026-03-16' })],
      doses: [],
    });
    expect(c.source).toBe('regimen');
    expect(c.dosesLogged).toBe(0);
    expect(c.firstDoseIso).toBeNull();
    expect(c.lastDoseIso).toBeNull();
    expect(c.firstDoseDay).toBeNull();
    expect(c.runDays).toBe(14); // length is the owner-recorded span, independent of doses
    expect(c.end.kind).toBe('ended'); // the owner ended it — the empty dose record does not un-end it
  });

  it('doses spanning a DELETED regimen (row absent) surface as an orphan, never dropped', () => {
    // The regimen the dose was logged against is gone from the set; the dose still counts
    // somewhere so the vet-facing surfaces do not lose a logged administration.
    const courses = deriveMedicationCourses({
      regimens: [reg({ id: 'active-one', medication_item_id: 'item-metro', status: 'active' })],
      doses: [dose({ medication_id: 'deleted-regimen', medication_item_id: 'item-metro', occurred_at: '2026-03-09T08:00:00Z' })],
    });
    const regimenCourse = byKey(courses, 'active-one');
    expect(regimenCourse.dosesLogged).toBe(0); // NOT reassigned to the active regimen
    const orphan = byKey(courses, 'item:item-metro');
    expect(orphan.source).toBe('doses');
    expect(orphan.dosesLogged).toBe(1); // surfaced here instead
  });

  it('a dose after an explicit end: an EXPLICIT link still counts; an unlinked one falls to orphan', () => {
    const ended = reg({ id: 'r', status: 'completed', started_at: '2026-03-03', ended_at: '2026-03-16' });
    // Linked dose after the end — the link is authoritative (B-153), it stays on the course.
    const linked = deriveMedicationCourses({
      regimens: [ended],
      doses: [dose({ medication_id: 'r', occurred_at: '2026-03-20T08:00:00Z' })],
    });
    expect(byKey(linked, 'r').dosesLogged).toBe(1);
    // Unlinked dose after the end — item+window rejects it (past ended_at), so it becomes
    // an orphan rather than silently extending a closed course.
    const unlinked = deriveMedicationCourses({
      regimens: [ended],
      doses: [dose({ medication_id: null, medication_item_id: 'item-metro', occurred_at: '2026-03-20T08:00:00Z' })],
    });
    expect(byKey(unlinked, 'r').dosesLogged).toBe(0);
    expect(byKey(unlinked, 'item:item-metro').dosesLogged).toBe(1);
  });

  it('two regimens for the same drug: a dose attributes to the in-window one, both courses render', () => {
    const older = reg({ id: 'old', medication_item_id: 'item-x', drug_name: 'X',
      status: 'completed', started_at: '2026-01-01', ended_at: '2026-01-31' });
    const newer = reg({ id: 'new', medication_item_id: 'item-x', drug_name: 'X',
      status: 'active', started_at: '2026-03-01', ended_at: null });
    const courses = deriveMedicationCourses({
      regimens: [older, newer],
      doses: [dose({ medication_item_id: 'item-x', occurred_at: '2026-03-10T08:00:00Z' })],
    });
    expect(courses).toHaveLength(2);
    expect(byKey(courses, 'new').dosesLogged).toBe(1);
    expect(byKey(courses, 'old').dosesLogged).toBe(0); // no double count, no misattribution
  });

  it('a soft-deleted dose is invisible to the course (count follows the record)', () => {
    const courses = deriveMedicationCourses({
      regimens: [reg()],
      doses: [
        dose({ occurred_at: '2026-03-05T08:00:00Z' }),
        dose({ occurred_at: '2026-03-06T08:00:00Z', deleted_at: '2026-03-06T09:00:00Z' }),
      ],
      timeZone: 'UTC',
    });
    expect(courses[0].dosesLogged).toBe(1);
    expect(courses[0].lastDoseDay).toBe('2026-03-05'); // the deleted Mar-6 dose is not the last dose
  });
});

// ── B-514 — timezone-honest fixtures ─────────────────────────────────────────────────

describe('deriveMedicationCourses — day math is timezone-honest (B-514)', () => {
  // A dose at 02:00 UTC straddles the local-day boundary: it is the 9th in UTC but still
  // the 8th anywhere west of UTC-2. The day label MUST follow the caller's zone, so it is
  // asserted only under an explicit `timeZone` (never against the runner clock).
  const straddle = [dose({ medication_id: null, medication_item_id: 'item-otc', occurred_at: '2026-06-09T02:00:00Z' })];

  it('buckets a near-midnight dose into the day of the CALLER’s zone', () => {
    const utc = deriveMedicationCourses({ regimens: [], doses: straddle, timeZone: 'UTC' })[0];
    expect(utc.lastDoseDay).toBe('2026-06-09');

    const la = deriveMedicationCourses({ regimens: [], doses: straddle, timeZone: 'America/Los_Angeles' })[0];
    expect(la.lastDoseDay).toBe('2026-06-08'); // 02:00 UTC = 19:00 the prior day at UTC-7

    const nz = deriveMedicationCourses({ regimens: [], doses: straddle, timeZone: 'Pacific/Auckland' })[0];
    expect(nz.lastDoseDay).toBe('2026-06-09'); // 02:00 UTC = 14:00 same day at UTC+12
  });

  it('the exact instant is zone-independent even as the day label flips', () => {
    for (const timeZone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
      const c = deriveMedicationCourses({ regimens: [], doses: straddle, timeZone })[0];
      expect(c.lastDoseIso).toBe('2026-06-09T02:00:00Z'); // recency/ordering never drift by zone
    }
  });

  it('a DATE-based regimen length is identical across zones (never a naive instant diff)', () => {
    // started_at / ended_at are DATE columns, indexed verbatim; runDays must not move with
    // the zone the way `new Date(dateStr)` subtraction would (the B-441 trap).
    const spans = ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Pacific/Kiritimati'].map(
      (timeZone) =>
        deriveMedicationCourses({
          regimens: [reg({ status: 'completed', started_at: '2026-03-03', ended_at: '2026-03-16' })],
          doses: [],
          timeZone,
        })[0].runDays,
    );
    expect(spans).toEqual([14, 14, 14, 14]);
  });

  it('omitting timeZone falls back to the device zone without throwing (no day asserted here)', () => {
    // Under the non-UTC CI job this runs at UTC+14 / +12:45 / −10; asserting only the
    // structure keeps the test honest regardless of the runner clock (B-514).
    const [c] = deriveMedicationCourses({ regimens: [], doses: straddle });
    expect(c.dosesLogged).toBe(1);
    expect(typeof c.lastDoseDay).toBe('string'); // a real day key, whatever the device zone
  });
});

// ── The mock's real-account scenario (integration) ───────────────────────────────────

describe('deriveMedicationCourses — the mock scenario end to end', () => {
  it('derives the four courses (active dose-course, ended regimen, two ad-hoc) correctly', () => {
    const courses = deriveMedicationCourses({
      regimens: [
        reg({ id: 'moto', medication_item_id: 'mi-moto', drug_name: 'Motozol', dose_amount: '15 mg',
          doses_per_day: 2, schedule_notes: null, started_at: '2026-07-22',
          target_duration_days: null, target_duration_doses: 28, status: 'active', ended_at: null }),
        reg({ id: 'metro', medication_item_id: 'mi-metro', drug_name: 'Metronidazole',
          doses_per_day: 2, schedule_notes: 'with food', started_at: '2026-03-03',
          target_duration_days: 14, target_duration_doses: null, status: 'completed', ended_at: '2026-03-16' }),
      ],
      doses: [
        ...linkedDoses(26, 'moto', 'mi-moto', '2026-07-22T08:00:00Z'),
        ...linkedDoses(26, 'metro', 'mi-metro', '2026-03-03T08:00:00Z'),
        ...givenDoses(3, 'mi-zyrtec', '2026-06-02T13:00:00Z'),
        ...givenDoses(1, 'mi-cerenia', '2026-02-11T13:00:00Z'),
      ],
      timeZone: 'UTC',
    });

    const moto = byKey(courses, 'moto');
    expect(moto.isActive).toBe(true);
    expect(moto.plannedDoses).toBe(28);
    expect(moto.dosesLogged).toBe(26);
    expect(moto.end.kind).toBe('none');

    const metro = byKey(courses, 'metro');
    expect(metro.end).toEqual({ kind: 'ended', status: 'completed', endedAt: '2026-03-16' });
    expect(metro.plannedDoses).toBe(28);
    expect(metro.dosesLogged).toBe(26);
    expect(metro.runDays).toBe(14);

    const zyrtec = byKey(courses, 'item:mi-zyrtec');
    expect(zyrtec.source).toBe('doses');
    expect(zyrtec.end.kind).toBe('none');
    expect(zyrtec.firstDoseDay).toBe('2026-06-02');
    expect(zyrtec.lastDoseDay).toBe('2026-06-04');

    const cerenia = byKey(courses, 'item:mi-cerenia');
    expect(cerenia.dosesLogged).toBe(1);
    expect(cerenia.firstDoseDay).toBe('2026-02-11');
    expect(cerenia.lastDoseDay).toBe('2026-02-11'); // single dose → first === last

    // Active first, then recency.
    expect(courses.map((c) => c.key)).toEqual(['moto', 'item:mi-zyrtec', 'metro', 'item:mi-cerenia']);
  });
});
