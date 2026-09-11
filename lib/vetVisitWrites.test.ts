// CUL-902 VV-4 — the visit's own writes, driven against a REAL database.
//
// `node:sqlite` over the app's own schema constants rather than a stubbed `getDb`,
// and the reason is C-35: a fixture shaped unlike production is green over a shape
// production never creates. Every assertion below is about what a row HOLDS after a
// write — a zero-row UPDATE, a rolled-back transaction, a column that must not move —
// and a stub that resolves `{ changes: 1 }` to everything cannot see any of it.
//
// Its own file because `lib/vetVisits.test.ts` is deliberately a pure-function suite
// that touches no database, and `lib/vetVisitsHome.test.ts` stubs one read.

const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
}

let mockDb: RawDb;

// The real API's shapes: `runAsync` returns `{ changes }` and `getAllAsync` returns
// rows. A stand-in narrower than the API it stands in for makes the caller's use of
// the dropped half untestable (C-39), which is exactly how the zero-row checks below
// would have been unassertable.
const mockRunAsync = jest.fn(async (sql: string, params: unknown[] = []) =>
  mockDb.prepare(sql).run(...(params as never[])),
);
const mockGetAllAsync = jest.fn(async (sql: string, params: unknown[] = []) =>
  mockDb.prepare(sql).all(...(params as never[])),
);
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => {
  mockDb.exec('BEGIN');
  try {
    await cb();
    mockDb.exec('COMMIT');
  } catch (e) {
    // A REAL rollback, not an inline call: the whole point of the transaction
    // assertion below is that a throw after the INSERT leaves nothing behind.
    mockDb.exec('ROLLBACK');
    throw e;
  }
});

jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    getAllAsync: mockGetAllAsync,
    withTransactionAsync: mockWithTransactionAsync,
  }),
}));

import { BASE_SCHEMA_SQL } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import {
  askedSummary,
  logVisitFromAppointment,
  parseQuestions,
  readActiveCourses,
  readAppointment,
  readVetVisitDetail,
  readVisitConsequence,
  linkCourseToVisit,
  linkTrialToVisit,
  repairRefusedVisitLinks,
  saveNotesDraft,
  serializeQuestions,
  setQuestionAsked,
  updateVisitDetails,
  visitIsForPet,
} from './vetVisits';

const APPT = 'appt-1';
const PET = 'pet-a';

function seedAppointment(over: Record<string, unknown> = {}): void {
  const row = {
    id: APPT,
    pet_id: PET,
    scheduled_at: '2026-09-16T22:00:00.000Z',
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'recheck',
    questions: null,
    notes_draft: null,
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
    ...over,
  };
  mockDb
    .prepare(
      `INSERT INTO vet_appointments
         (id, pet_id, scheduled_at, clinic_name, vet_name, reason, questions, notes_draft,
          vet_visit_id, cancelled_at, deleted_at, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1)`,
    )
    .run(
      row.id, row.pet_id, row.scheduled_at, row.clinic_name, row.vet_name, row.reason,
      row.questions, row.notes_draft, row.vet_visit_id, row.cancelled_at, row.deleted_at,
    );
}

function seedVisit(id: string, over: Record<string, unknown> = {}): void {
  const row = { pet_id: PET, visited_at: '2026-09-16', deleted_at: null, next_visit_at: null, ...over };
  mockDb
    .prepare(
      `INSERT INTO vet_visits (id, pet_id, visited_at, next_visit_at, deleted_at, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z', 1)`,
    )
    .run(id, row.pet_id, row.visited_at, row.next_visit_at, row.deleted_at);
}

const appointmentRow = () =>
  mockDb.prepare('SELECT * FROM vet_appointments WHERE id = ?').all(APPT)[0];
const visitRow = (id: string) =>
  mockDb.prepare('SELECT * FROM vet_visits WHERE id = ?').all(id)[0];

beforeEach(() => {
  mockRunAsync.mockClear();
  mockGetAllAsync.mockClear();
  mockWithTransactionAsync.mockClear();
  mockDb = new DatabaseSync(':memory:') as RawDb;
  // The production DDL, verbatim and in initDb's order — `events` included, which is
  // why this suite does not hand-roll a stub for it the way a medications-only suite
  // has to (a stub `events` would win the `IF NOT EXISTS` and then BASE's own index
  // on it would fail).
  mockDb.exec(BASE_SCHEMA_SQL);
  mockDb.exec(MEDICATION_SCHEMA_SQL);
  mockDb.exec(DIET_TRIAL_SCHEMA_SQL);
});

afterEach(() => mockDb.close());

// ── AC 6 — the draft and the tick survive a kill ────────────────────────────────

describe('the in-room draft (AC 6)', () => {
  it('lands on the appointment row, re-queued', async () => {
    seedAppointment();
    await saveNotesDraft(APPT, 'Likely still the food. Keep the trial the full 8 weeks.');

    const row = appointmentRow();
    // The whole of AC 6: the text is in the DATABASE, not in a component's state, so
    // the relaunch that reads this row reads the sentence.
    expect(row.notes_draft).toBe('Likely still the food. Keep the trial the full 8 weeks.');
    expect(row.synced).toBe(0);
    expect(row.updated_at).not.toBe('2026-09-01T00:00:00.000Z');
  });

  it('clears the column when the field is emptied, rather than storing a blank', async () => {
    seedAppointment({ notes_draft: 'half a sentence' });
    await saveNotesDraft(APPT, '');
    expect(appointmentRow().notes_draft).toBeNull();
  });

  it('re-arms a row a server refusal parked', async () => {
    seedAppointment();
    mockDb.prepare(`UPDATE vet_appointments SET sync_error = '23514', sync_attempts = 3 WHERE id = ?`).run(APPT);
    await saveNotesDraft(APPT, 'typed again');
    const row = appointmentRow();
    expect(row.sync_error).toBeNull();
    expect(row.sync_attempts).toBe(0);
  });

  it('THROWS when nothing matched, rather than saying "saved as you type" over nothing', async () => {
    // The C-39 case: a local `UPDATE … WHERE id = ?` that matches nothing resolves
    // `{ changes: 0 }` with NO error. On this path the silence is the worst kind —
    // the owner is watching a line that says the field is saving.
    await expect(saveNotesDraft('no-such-appointment', 'text')).rejects.toThrow();
  });
});

describe('the question ticks (AC 6)', () => {
  const QUESTIONS = JSON.stringify([
    { id: 'q1', text: 'The overnight pattern', source: 'record', asked_at: null },
    { id: 'q2', text: 'The weight', source: 'owner', asked_at: null },
  ]);

  it('writes asked_at as an instant and survives the round trip', async () => {
    seedAppointment({ questions: QUESTIONS });
    const next = await setQuestionAsked(APPT, 'q1', true, new Date('2026-09-16T15:04:00.000Z'));

    expect(next.find((q) => q.id === 'q1')?.asked_at).toBe('2026-09-16T15:04:00.000Z');
    // Re-read from the ROW, not from the return: the tick survives a relaunch only if
    // it is on disk.
    const stored = parseQuestions(appointmentRow().questions as string);
    expect(stored.find((q) => q.id === 'q1')?.asked_at).toBe('2026-09-16T15:04:00.000Z');
    expect(stored.find((q) => q.id === 'q2')?.asked_at).toBeNull();
  });

  it('un-ticks back to null — a mis-tap in a room must be undoable', async () => {
    seedAppointment({ questions: QUESTIONS });
    await setQuestionAsked(APPT, 'q1', true);
    const next = await setQuestionAsked(APPT, 'q1', false);
    expect(next.find((q) => q.id === 'q1')?.asked_at).toBeNull();
  });

  it('leaves every other question untouched', async () => {
    seedAppointment({ questions: QUESTIONS });
    await setQuestionAsked(APPT, 'q2', true);
    const stored = parseQuestions(appointmentRow().questions as string);
    expect(stored.map((q) => q.text)).toEqual(['The overnight pattern', 'The weight']);
    expect(stored.map((q) => !!q.asked_at)).toEqual([false, true]);
  });

  it('throws for an appointment that is gone', async () => {
    await expect(setQuestionAsked('no-such-appointment', 'q1', true)).rejects.toThrow();
  });
});

describe('parseQuestions — the column is owner-controlled free text', () => {
  it('reads a well-formed array', () => {
    expect(parseQuestions('[{"id":"q1","text":"Ask","source":"owner","asked_at":null}]'))
      .toEqual([{ id: 'q1', text: 'Ask', source: 'owner', source_ref: null, asked_at: null }]);
  });

  it('reads garbage as NO questions rather than throwing', () => {
    // This column round-trips through JSONB and through a sync path that already
    // replaces unparseable text with null. A reader that threw would take the notes
    // field beside it down — the one surface on this screen that must not fail.
    for (const raw of ['not json', '{"not":"an array"}', '[1,2,3]', '[{"no":"id"}]', '', null]) {
      expect(parseQuestions(raw)).toEqual([]);
    }
  });

  it('round-trips through serialize, and stores NULL for an empty list', () => {
    const qs = parseQuestions('[{"id":"q1","text":"Ask","source":"record","asked_at":null}]');
    expect(parseQuestions(serializeQuestions(qs))).toEqual(qs);
    expect(serializeQuestions([])).toBeNull();
  });

  it('summarises as "Asked N of M", and says nothing at zero questions', () => {
    const qs = parseQuestions(
      '[{"id":"a","text":"x","source":"owner","asked_at":"2026-09-16T00:00:00.000Z"},' +
        '{"id":"b","text":"y","source":"owner","asked_at":null}]',
    );
    expect(askedSummary(qs)).toBe('Asked 1 of 2');
    // Never "Asked 0 of 0": a score for something the owner never set out to do.
    expect(askedSummary([])).toBeNull();
  });
});

// ── AC 11 — pet_id comes from the appointment ──────────────────────────────────

describe('logVisitFromAppointment', () => {
  it('takes pet_id from the APPOINTMENT ROW (AC 11)', async () => {
    // The shape of the bug it catches: the shipped `app/vet-visit.tsx` reads
    // `activePet` at save time (`:117`). Here the pet travels INSIDE the appointment
    // the caller passes, so a caller cannot supply a pet and an appointment that
    // disagree — the store is not reachable from this function at all.
    seedAppointment();
    const appt = await readAppointment(APPT);
    const id = await logVisitFromAppointment({
      appointment: appt!,
      visitedAt: '2026-09-16',
      newId: () => 'visit-1',
    });
    expect(visitRow(id).pet_id).toBe(PET);
  });

  it('marks the appointment attended in the SAME transaction', async () => {
    seedAppointment();
    const appt = await readAppointment(APPT);
    const id = await logVisitFromAppointment({ appointment: appt!, visitedAt: '2026-09-16', newId: () => 'visit-1' });

    expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    expect(appointmentRow().vet_visit_id).toBe(id);
    expect(appointmentRow().synced).toBe(0);
  });

  it('MOVES the draft into the visit rather than copying it', async () => {
    seedAppointment({ notes_draft: 'Cerenia only if she vomits twice in a day.' });
    const appt = await readAppointment(APPT);
    const id = await logVisitFromAppointment({ appointment: appt!, visitedAt: '2026-09-16', newId: () => 'visit-1' });

    expect(visitRow(id).notes).toBe('Cerenia only if she vomits twice in a day.');
    // One copy of what the owner typed, in the record. Two would be two things to
    // keep in step.
    expect(appointmentRow().notes_draft).toBeNull();
  });

  it('prefers the caller’s typed fields over the appointment’s', async () => {
    seedAppointment({ notes_draft: 'the in-room draft' });
    const appt = await readAppointment(APPT);
    const id = await logVisitFromAppointment({
      appointment: appt!,
      visitedAt: '2026-09-16',
      clinicName: 'Northside Vet',
      notes: 'edited after the visit',
      newId: () => 'visit-1',
    });
    expect(visitRow(id).clinic_name).toBe('Northside Vet');
    expect(visitRow(id).notes).toBe('edited after the visit');
  });

  it('rolls the VISIT back when the appointment vanished under the screen', async () => {
    // A half-attended pair is the state this must never leave: a visit nothing points
    // at, and an appointment still on Home asking whether the visit happened — with
    // the owner's notes now in a row they have no door to.
    seedAppointment();
    const appt = await readAppointment(APPT);
    mockDb.prepare('DELETE FROM vet_appointments WHERE id = ?').run(APPT);

    await expect(
      logVisitFromAppointment({ appointment: appt!, visitedAt: '2026-09-16', newId: () => 'visit-1' }),
    ).rejects.toThrow();
    expect(mockDb.prepare('SELECT * FROM vet_visits').all()).toEqual([]);
  });

  it('writes the day key it was GIVEN — never one derived from a UTC clock', async () => {
    // CUL-946 is this bug, live on the screen this replaces: `toISOString()` yields
    // the UTC day, so every evening visit in the Americas is saved as tomorrow. This
    // function writes no date it did not receive.
    seedAppointment();
    const appt = await readAppointment(APPT);
    const id = await logVisitFromAppointment({ appointment: appt!, visitedAt: '2026-09-16', newId: () => 'visit-1' });
    expect(visitRow(id).visited_at).toBe('2026-09-16');
  });
});

describe('updateVisitDetails', () => {
  it('writes only the keys it was given', async () => {
    seedVisit('v1', { visited_at: '2026-09-16' });
    mockDb.prepare(`UPDATE vet_visits SET notes = 'kept', clinic_name = 'Riverside' WHERE id = 'v1'`).run();

    await updateVisitDetails('v1', { reason: 'Recheck — GI' });

    expect(visitRow('v1').reason).toBe('Recheck — GI');
    // An omitted key is "not describing this column", never "clear it" (C-10).
    expect(visitRow('v1').notes).toBe('kept');
    expect(visitRow('v1').clinic_name).toBe('Riverside');
  });

  it('CLEARS a column when the key is present and null', async () => {
    seedVisit('v1', { next_visit_at: '2026-10-28' });
    await updateVisitDetails('v1', { nextVisitAt: null });
    expect(visitRow('v1').next_visit_at).toBeNull();
  });

  it('writes NOTHING — not even updated_at — for an empty patch', async () => {
    seedVisit('v1');
    const before = visitRow('v1');
    await updateVisitDetails('v1', {});
    // Moving the version of a row nothing changed re-queues it for no reason and,
    // under LWW, lets a no-op win over another device's real edit.
    expect(visitRow('v1')).toEqual(before);
  });

  it('throws for a missing or soft-deleted visit', async () => {
    seedVisit('gone', { deleted_at: '2026-09-17T00:00:00.000Z' });
    await expect(updateVisitDetails('gone', { notes: 'x' })).rejects.toThrow();
    await expect(updateVisitDetails('never', { notes: 'x' })).rejects.toThrow();
  });
});

// ── AC 9's record side — which visit anchors what ──────────────────────────────

describe('readVisitConsequence', () => {
  // Anchored to a constructed LOCAL date rather than a UTC literal: the CI matrix
  // runs at UTC+14, UTC+12:45 and UTC−10 (C-29).
  const NOW = new Date(2026, 8, 16, 18, 0);

  it('a visit logged TODAY is the latest, and is NOT before today', async () => {
    seedVisit('v1', { visited_at: '2026-09-16' });
    expect(await readVisitConsequence({ id: 'v1', pet_id: PET, visited_at: '2026-09-16' }, NOW))
      .toEqual({ isLatest: true, dayRelation: 'today' });
  });

  it('a visit dated yesterday is the latest AND before today', async () => {
    seedVisit('v1', { visited_at: '2026-09-15' });
    expect(await readVisitConsequence({ id: 'v1', pet_id: PET, visited_at: '2026-09-15' }, NOW))
      .toEqual({ isLatest: true, dayRelation: 'before_today' });
  });

  it('a FUTURE-dated visit reads as after_today, not as "today"', async () => {
    // The state a boolean could not hold. A recheck booked six weeks out, opened from
    // *Next*: the report's rung 1 skips it until the day arrives, so the moment must
    // be able to tell this apart from a visit dated today.
    seedVisit('v1', { visited_at: '2026-10-28' });
    expect(await readVisitConsequence({ id: 'v1', pet_id: PET, visited_at: '2026-10-28' }, NOW))
      .toEqual({ isLatest: true, dayRelation: 'after_today' });
  });

  it('a visit logged LATE, behind one already on file, is not the latest', async () => {
    seedVisit('older', { visited_at: '2026-03-04' });
    seedVisit('newer', { visited_at: '2026-08-01' });
    expect((await readVisitConsequence({ id: 'older', pet_id: PET, visited_at: '2026-03-04' }, NOW)).isLatest)
      .toBe(false);
  });

  it('ignores a SOFT-DELETED later visit — a deleted row anchors nothing', async () => {
    seedVisit('v1', { visited_at: '2026-09-15' });
    seedVisit('deleted', { visited_at: '2026-09-16', deleted_at: '2026-09-16T10:00:00.000Z' });
    expect((await readVisitConsequence({ id: 'v1', pet_id: PET, visited_at: '2026-09-15' }, NOW)).isLatest)
      .toBe(true);
  });

  it('ignores ANOTHER PET’S later visit', async () => {
    seedVisit('mine', { visited_at: '2026-09-15' });
    seedVisit('theirs', { pet_id: 'pet-b', visited_at: '2026-09-16' });
    expect((await readVisitConsequence({ id: 'mine', pet_id: PET, visited_at: '2026-09-15' }, NOW)).isLatest)
      .toBe(true);
  });

  it('a SAME-DAY sibling counts as later, so neither claims the window alone', async () => {
    // Two visits on one day is a real shape (a morning drop-off and an afternoon
    // recheck). The report's rung 1 picks one of them; a moment that told the owner
    // "your report starts from THIS one" would be a coin toss stated as a fact.
    seedVisit('a', { visited_at: '2026-09-15' });
    seedVisit('b', { visited_at: '2026-09-15' });
    expect((await readVisitConsequence({ id: 'a', pet_id: PET, visited_at: '2026-09-15' }, NOW)).isLatest)
      .toBe(false);
  });
});

// ── CUL-945 — the same-pet check and the way out of the bricked state ──────────

describe('visitIsForPet', () => {
  it('is true only for a live visit belonging to this pet', async () => {
    seedVisit('mine');
    seedVisit('theirs', { pet_id: 'pet-b' });
    seedVisit('deleted', { deleted_at: '2026-09-17T00:00:00.000Z' });

    expect(await visitIsForPet('mine', PET)).toBe(true);
    expect(await visitIsForPet('theirs', PET)).toBe(false);
    expect(await visitIsForPet('deleted', PET)).toBe(false);
    expect(await visitIsForPet('never-existed', PET)).toBe(false);
  });
});

describe('repairRefusedVisitLinks', () => {
  function seedCourse(id: string, over: Record<string, unknown> = {}): void {
    const row = { vet_visit_id: null, sync_error: null, pet_id: PET, ...over };
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, started_at, status, vet_visit_id,
                                  created_at, updated_at, synced, sync_attempts, sync_error)
         VALUES (?, ?, 'cerenia', '2026-07-30', 'active', ?, '2026-07-30T00:00:00.000Z',
                 '2026-07-30T00:00:00.000Z', 0, 3, ?)`,
      )
      .run(id, row.pet_id, row.vet_visit_id, row.sync_error);
  }
  const course = (id: string) => mockDb.prepare('SELECT * FROM medications WHERE id = ?').all(id)[0];

  /** The sentence migrations 066/067 raise, as `formatSyncError` parks it: the code,
   *  then the message. Verbatim, because the repair's predicate matches it. */
  const LINK_REFUSAL =
    '23514: vet_visit_id 4f3a… must reference a vet visit for the same pet (9b21…)';

  it('clears a link the SERVER refused ABOUT THIS COLUMN, when it resolves to nothing here', async () => {
    seedCourse('m1', { vet_visit_id: 'gone-visit', sync_error: LINK_REFUSAL });
    expect(await repairRefusedVisitLinks(PET)).toBe(1);

    const row = course('m1');
    expect(row.vet_visit_id).toBeNull();
    // Re-armed, so the next push carries the PRESCRIPTION — which is what was being
    // lost, not the link.
    expect(row.sync_error).toBeNull();
    expect(row.sync_attempts).toBe(0);
    expect(row.synced).toBe(0);
  });

  it('leaves a DANGLING link alone when the server has not refused it', async () => {
    // The false-positive this guard exists to avoid: "the link does not resolve
    // locally" is also true of a perfectly good link on a device that has not
    // hydrated the visit yet, and clearing it there destroys real provenance.
    seedCourse('m1', { vet_visit_id: 'not-hydrated-yet', sync_error: null });
    expect(await repairRefusedVisitLinks(PET)).toBe(0);
    expect(course('m1').vet_visit_id).toBe('not-hydrated-yet');
  });

  it('leaves a refused row whose link IS valid here — the refusal was something else', async () => {
    seedVisit('v1');
    seedCourse('m1', { vet_visit_id: 'v1', sync_error: LINK_REFUSAL });
    expect(await repairRefusedVisitLinks(PET)).toBe(0);
    expect(course('m1').vet_visit_id).toBe('v1');
  });

  it('leaves a row refused with a DIFFERENT terminal code alone', async () => {
    seedCourse('m1', { vet_visit_id: 'gone-visit', sync_error: '23505: duplicate key' });
    expect(await repairRefusedVisitLinks(PET)).toBe(0);
  });

  it('leaves a NON-LINK 23514 alone, even with an unresolvable link on the row', async () => {
    // The adversarial counterexample, and the reason the predicate reads the trigger's
    // SENTENCE rather than the SQLSTATE. `23514` is `check_violation` — not a link
    // code: migration 049 puts two more named CHECKs on `medications`, and the local
    // mirror deliberately does not enforce the mutual-exclusion one, so a row that is
    // perfectly representable here is refused there for a reason that has nothing to
    // do with the visit.
    //
    // The second arm ("this device cannot resolve the link") is true of any visit a
    // household's second phone has not hydrated yet — so on the bare code these two
    // rows would have had a VALID link destroyed, re-armed, re-quarantined on the real
    // constraint, and their provenance lost for good (`updateRegimen` cannot set the
    // column back).
    seedCourse('m1', {
      vet_visit_id: 'not-hydrated-yet',
      sync_error: '23514: new row for relation "medications" violates check constraint '
        + '"medications_one_duration_denomination"',
    });
    expect(await repairRefusedVisitLinks(PET)).toBe(0);
    expect(course('m1').vet_visit_id).toBe('not-hydrated-yet');
  });

  it('never reaches another pet’s rows', async () => {
    seedCourse('theirs', { pet_id: 'pet-b', vet_visit_id: 'gone', sync_error: LINK_REFUSAL });
    expect(await repairRefusedVisitLinks(PET)).toBe(0);
    expect(course('theirs').vet_visit_id).toBe('gone');
  });
});

// ── The plan rows read the record ──────────────────────────────────────────────

describe('readActiveCourses', () => {
  it('returns only this pet’s ACTIVE courses, with the fields the edit door needs', async () => {
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, dose_amount, doses_per_day, started_at,
                                  status, created_at, updated_at, synced)
         VALUES ('m1', ?, 'cerenia', '16 mg', 1, '2026-07-30', 'active', 'c', 'u', 1)`,
      )
      .run(PET);
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, started_at, status, created_at, updated_at, synced)
         VALUES ('m2', ?, 'metronidazole', '2026-06-01', 'completed', 'c', 'u', 1)`,
      )
      .run(PET);
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, started_at, status, created_at, updated_at, synced)
         VALUES ('m3', 'pet-b', 'apoquel', '2026-07-30', 'active', 'c', 'u', 1)`,
      )
      .run();

    const courses = await readActiveCourses(PET);
    expect(courses.map((c) => c.id)).toEqual(['m1']);
    expect(courses[0]).toMatchObject({
      drugName: 'cerenia',
      doseAmount: '16 mg',
      dosesPerDay: 1,
      startedAt: '2026-07-30',
      petId: PET,
    });
  });

  it('coerces doses_per_day to a NUMBER, whichever side the row came from', async () => {
    // SQLite hands NUMERIC back as a number; a hydrated row round-trips through
    // PostgREST, which serialises it as "1.00". The frequency chip switches on this.
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, doses_per_day, started_at, status,
                                  created_at, updated_at, synced)
         VALUES ('m1', ?, 'cerenia', '2.00', '2026-07-30', 'active', 'c', 'u', 1)`,
      )
      .run(PET);
    expect((await readActiveCourses(PET))[0].dosesPerDay).toBe(2);
  });
});

describe('readVetVisitDetail — the questions ride in through the appointment', () => {
  it('reads them from the appointment that names this visit', async () => {
    seedVisit('v1');
    seedAppointment({
      vet_visit_id: 'v1',
      questions: '[{"id":"q1","text":"x","source":"owner","asked_at":"2026-09-16T00:00:00.000Z"}]',
    });
    const detail = await readVetVisitDetail('v1');
    expect(askedSummary(detail!.questions)).toBe('Asked 1 of 1');
  });

  it('is empty for a visit logged with no appointment behind it', async () => {
    seedVisit('v1');
    const detail = await readVetVisitDetail('v1');
    expect(detail!.questions).toEqual([]);
  });
});

// ── The links are PROVENANCE, and provenance is first-wins ─────────────────────

describe('linkCourseToVisit / linkTrialToVisit', () => {
  function seedCourse(id: string, vetVisitId: string | null): void {
    mockDb
      .prepare(
        `INSERT INTO medications (id, pet_id, drug_name, started_at, status, vet_visit_id,
                                  created_at, updated_at, synced)
         VALUES (?, ?, 'cerenia', '2026-03-04', 'active', ?, 'c', 'u', 1)`,
      )
      .run(id, PET, vetVisitId);
  }
  const course = (id: string) => mockDb.prepare('SELECT * FROM medications WHERE id = ?').all(id)[0];

  it('writes the link on a course that has none, and says it did', async () => {
    seedCourse('m1', null);
    expect(await linkCourseToVisit('m1', 'visit-sep')).toBe(true);
    expect(course('m1').vet_visit_id).toBe('visit-sep');
    expect(course('m1').synced).toBe(0);
  });

  it('NEVER relocates a link an earlier visit already holds', async () => {
    // The adversarial counterexample: a course prescribed at March's visit, confirmed
    // again with *Keep* in September. An unconditional write moved the link — so
    // March's visit silently stopped listing Cerenia in its plan and September's
    // started. `vet_visit_id` is where a course CAME FROM, which is exactly the
    // argument the *Stopped* branch already makes for not linking at all.
    seedCourse('m1', 'visit-march');
    expect(await linkCourseToVisit('m1', 'visit-sep')).toBe(false);
    expect(course('m1').vet_visit_id).toBe('visit-march');
    // And it did not re-queue a row it did not change.
    expect(course('m1').synced).toBe(1);
  });

  it('a trial link is first-wins too', async () => {
    mockDb
      .prepare(
        `INSERT INTO diet_trials (id, pet_id, food_item_id, started_at, target_duration_days,
                                  status, vet_visit_id, created_at, updated_at, synced)
         VALUES ('t1', ?, 'f1', '2026-03-04', 56, 'active', 'visit-march', 'c', 'u', 1)`,
      )
      .run(PET);
    expect(await linkTrialToVisit('t1', 'visit-sep')).toBe(false);
    expect(mockDb.prepare('SELECT * FROM diet_trials WHERE id = ?').all('t1')[0].vet_visit_id)
      .toBe('visit-march');
  });
});
