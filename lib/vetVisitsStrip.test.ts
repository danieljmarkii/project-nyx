import {
  APPOINTMENT_WINDOW_DAYS,
  cancelVetAppointment,
  parseAppointmentQuestions,
  readHomeAppointment,
  resolveStripPhase,
  saveAppointmentQuestions,
} from './vetVisits';

// The Home strip's window, its row choice, and the two writes (CUL-903 VV-5;
// spec §4.1 A2 / A2b, §7 AC 3).
//
// Its own file because it needs `getDb` stubbed — `lib/vetVisits.test.ts` is the
// pure-function suite and deliberately touches no database, and the C-34 lesson
// VV-2 wrote here is that a window test which re-derives the rule instead of driving
// the shipped reader is a tautology with fixtures.

const rows: { appointments: Record<string, unknown>[] } = { appointments: [] };
const runCalls: { sql: string; args: unknown[] }[] = [];
const readCalls: string[] = [];
// A CONST holder rather than a `let`: jest's factory-hoisting check rejects an
// out-of-scope `let` outright, and the alternative (a `mock`-prefixed name) would
// read as a mock when it is the shape the real API returns.
const run = { result: { changes: 1 } };

jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string) => {
      readCalls.push(sql);
      return /FROM vet_appointments/.test(sql) ? rows.appointments : [];
    },
    // Resolves what `expo-sqlite` resolves. A mock that answered `undefined` would
    // make the zero-row check below UNASSERTABLE, which is exactly the harness gap
    // C-39 names — and it was written one PR before this one.
    runAsync: async (sql: string, args: unknown[]) => {
      runCalls.push({ sql, args });
      return run.result;
    },
  }),
}));

/** A booking at local NOON on the day `daysFromNow` days from `now`. */
function at(daysFromNow: number, now: Date): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function appointmentRow(id: string, scheduledAt: string) {
  return {
    id,
    pet_id: 'pet-a',
    scheduled_at: scheduledAt,
    clinic_name: 'Riverside Animal Hospital',
    vet_name: null,
    reason: 'recheck',
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
  };
}

beforeEach(() => {
  rows.appointments = [];
  runCalls.length = 0;
  readCalls.length = 0;
  run.result = { changes: 1 };
});

describe('the window — five days before, through the day of', () => {
  // Anchored to the clock, not to a literal date (C-29 on the time axis): a fixture
  // pinned to an absolute day and judged against a rolling window fails on a calendar
  // boundary rather than on a change.
  const now = new Date();

  it.each([
    [0, 'upcoming'],
    [1, 'upcoming'],
    [APPOINTMENT_WINDOW_DAYS, 'upcoming'],
  ])('a booking %i days out is on Home', (days, phase) => {
    expect(resolveStripPhase(at(days as number, now), now)).toBe(phase);
  });

  it('is NOT on Home one day beyond the window', () => {
    expect(resolveStripPhase(at(APPOINTMENT_WINDOW_DAYS + 1, now), now)).toBeNull();
  });

  it('asks after the day passes, and stops asking past the same bound', () => {
    expect(resolveStripPhase(at(-1, now), now)).toBe('after');
    expect(resolveStripPhase(at(-APPOINTMENT_WINDOW_DAYS, now), now)).toBe('after');
    // "Never furniture for a month" — past the bound the row lives only in the
    // visits list's *Waiting on you* bucket, which the owner goes to.
    expect(resolveStripPhase(at(-APPOINTMENT_WINDOW_DAYS - 1, now), now)).toBeNull();
  });

  it('refuses a malformed instant rather than rendering a strip about nothing', () => {
    expect(resolveStripPhase('not-an-instant', now)).toBeNull();
  });

  it('counts LOCAL DAYS, not elapsed hours — the late-night / early-morning pair', () => {
    // The normalisation this window rests on, and the case that actually reaches an
    // owner. Read at 23:30 on a booking at 00:30 six days later: the raw span is
    // barely over five days, so anything dividing milliseconds — floor OR round —
    // says five and puts a strip on Home for a visit a day outside the window. Both
    // ends go through `startOfLocalDay`, so the answer is six.
    const now = new Date();
    now.setHours(23, 30, 0, 0);
    const sixDaysOut = new Date(now.getTime());
    sixDaysOut.setDate(sixDaysOut.getDate() + 6);
    sixDaysOut.setHours(0, 30, 0, 0);

    // The premise, asserted so this cannot pass for a reason unrelated to the fix.
    const rawDays = (sixDaysOut.getTime() - now.getTime()) / 86_400_000;
    expect(Math.round(rawDays)).toBe(5);
    expect(Math.floor(rawDays)).toBe(5);

    expect(resolveStripPhase(sixDaysOut.toISOString(), now)).toBeNull();

    // …and the mirror: five local days from the same late-night `now` IS in the
    // window, even though the raw span is barely over four.
    const fiveDaysOut = new Date(now.getTime());
    fiveDaysOut.setDate(fiveDaysOut.getDate() + 5);
    fiveDaysOut.setHours(0, 30, 0, 0);
    expect(Math.round((fiveDaysOut.getTime() - now.getTime()) / 86_400_000)).toBe(4);
    expect(resolveStripPhase(fiveDaysOut.toISOString(), now)).toBe('upcoming');
  });

  // A STATED BLIND SPOT, not an untested one (C-36: an undocumented limitation reads
  // as coverage). `localDayDelta` rounds two local midnights specifically so a 23- or
  // 25-hour day inside the span cannot shift a phase — and that property cannot be
  // driven here. Jest resolves the timezone once per worker, so assigning
  // `process.env.TZ` mid-run does not move `Date` (measured: a fixture built for
  // America/New_York's spring-forward came back 144 hours, i.e. still UTC), and the
  // CI matrix (UTC+14 / +12:45 / −10) contains no DST zone at all. The test written
  // for it here was green in UTC for a reason that had nothing to do with DST, so it
  // was removed rather than kept as decoration. Covering it properly needs a DST zone
  // in the matrix — filed as a follow-up.
});

describe('readHomeAppointment — which row Home carries', () => {
  const now = new Date();

  it('prefers an UPCOMING booking over one whose day has passed', () => {
    // Home has room for one answer, and a visit the owner is about to have outranks
    // one they may not have had. The passed row keeps its place on the list.
    rows.appointments = [appointmentRow('past', at(-2, now)), appointmentRow('soon', at(2, now))];
    return readHomeAppointment('pet-a', now).then((got) => {
      expect(got?.id).toBe('soon');
      expect(got?.phase).toBe('upcoming');
    });
  });

  it('asks about the MOST RECENTLY passed booking when there is no upcoming one', () => {
    rows.appointments = [appointmentRow('older', at(-4, now)), appointmentRow('newer', at(-1, now))];
    return readHomeAppointment('pet-a', now).then((got) => {
      expect(got?.id).toBe('newer');
      expect(got?.phase).toBe('after');
    });
  });

  it('carries nothing when every booking is outside the window', () => {
    rows.appointments = [appointmentRow('far', at(30, now))];
    return readHomeAppointment('pet-a', now).then((got) => expect(got).toBeNull());
  });

  it('scopes the read to the LIVE rows — not deleted, not cancelled, not logged', async () => {
    // AC 3's "disappears when the visit is logged or the appointment is cancelled" IS
    // this WHERE clause, so the clause is what gets asserted. The first cut of this
    // test ended in `expect(true).toBe(true)` after a comment explaining why the
    // clause was safe — a sentence about a guard is not the guard (C-32).
    await readHomeAppointment('pet-a', now);
    const sql = readCalls.find((q) => /FROM vet_appointments/.test(q));
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/cancelled_at IS NULL/);
    expect(sql).toMatch(/vet_visit_id IS NULL/);
  });
});

describe('the two ISO spellings of one instant (C-40)', () => {
  // A local write produces `…T04:00:00.000Z`; PostgREST hands the same instant back
  // as `…T04:00:00+00:00`; `'+'` (0x2B) sorts before `'.'` (0x2E). Drives the REAL
  // reader against both spellings — checking the parse in isolation is true of the
  // bug too (C-34, the trap VV-2 fell into on this exact class).
  const now = new Date();

  function bothSpellings(iso: string): [string, string] {
    const local = new Date(iso).toISOString(); // …T04:00:00.000Z
    const server = local.replace(/\.\d{3}Z$/, '+00:00'); // …T04:00:00+00:00
    return [local, server];
  }

  it('the two spellings differ as TEXT — otherwise this test measures nothing', () => {
    const [local, server] = bothSpellings(at(0, now));
    expect(local).not.toBe(server);
    expect(new Date(local).getTime()).toBe(new Date(server).getTime());
  });

  it('places a booking identically whichever spelling the row holds', async () => {
    for (const spelling of bothSpellings(at(0, now))) {
      rows.appointments = [appointmentRow('today', spelling)];
      const got = await readHomeAppointment('pet-a', now);
      expect(got?.phase).toBe('upcoming');
    }
  });

  it('places a LOCAL-MIDNIGHT booking identically — the no-time sentinel, the exact-equality second', async () => {
    // This is the second that actually bit: local midnight is the "no time given"
    // sentinel the booking sheet's own placeholder steers every owner toward, so the
    // one row the lexical compare could drop was the app's own default, on the day
    // the strip matters most.
    const midnight = new Date(now.getTime());
    midnight.setHours(0, 0, 0, 0);
    for (const spelling of bothSpellings(midnight.toISOString())) {
      rows.appointments = [appointmentRow('today', spelling)];
      const got = await readHomeAppointment('pet-a', now);
      expect(got?.phase).toBe('upcoming');
    }
  });
});

describe('the writes throw on a zero-row match (C-39)', () => {
  it('cancel: a row deleted on another device is said, never swallowed', async () => {
    run.result = { changes: 0 };
    await expect(cancelVetAppointment('gone')).rejects.toThrow(/matched no row/);
  });

  it('questions: the same, because this surface edits rows it read from the same store', async () => {
    run.result = { changes: 0 };
    await expect(saveAppointmentQuestions('gone', [])).rejects.toThrow(/matched no row/);
  });

  it('cancel clears the quarantine, so a bad earlier push is recoverable', async () => {
    // B-398. Without it a row quarantined by an earlier push would stay quarantined
    // forever: cancelled on this device and still upcoming on every other one.
    await cancelVetAppointment('a1');
    expect(runCalls[0].sql).toMatch(/sync_error = NULL/);
    expect(runCalls[0].sql).toMatch(/sync_attempts = 0/);
  });

  it('cancel is idempotent — a second tap does not re-stamp the first answer', async () => {
    await cancelVetAppointment('a1');
    // `COALESCE` keeps the FIRST `cancelled_at`: the column answers "when did the
    // owner say this did not happen", and the later of two taps is the wrong answer.
    expect(runCalls[0].sql).toMatch(/COALESCE\(cancelled_at, \?\)/);
  });
});

describe('parseAppointmentQuestions', () => {
  it('drops anything that is not this module’s shape, row by row', () => {
    const raw = JSON.stringify([
      { id: 'q1', text: 'Should I worry about the weight?', source: 'owner' },
      { id: 'q2' }, // no text
      { text: 'no id' },
      { id: 'q3', text: '   ' }, // blank
      'a bare string',
    ]);
    expect(parseAppointmentQuestions(raw).map((q) => q.id)).toEqual(['q1']);
  });

  it('PRESERVES asked_at — this module must not be able to un-tick a question', () => {
    // VV-4 writes the tick in the exam room. An edit here (adding or removing a
    // different question) round-trips the whole list, so a defaulted `asked_at` would
    // silently erase what the owner ticked while standing in front of the vet.
    const asked = '2026-09-16T15:04:00.000Z';
    const raw = JSON.stringify([{ id: 'q1', text: 'Ask about the limp', source: 'owner', asked_at: asked }]);
    expect(parseAppointmentQuestions(raw)[0].asked_at).toBe(asked);
  });

  it('answers empty for absent, blank or unparseable text', () => {
    expect(parseAppointmentQuestions(null)).toEqual([]);
    expect(parseAppointmentQuestions('')).toEqual([]);
    expect(parseAppointmentQuestions('{ not json')).toEqual([]);
    expect(parseAppointmentQuestions('{"not":"an array"}')).toEqual([]);
  });
});
