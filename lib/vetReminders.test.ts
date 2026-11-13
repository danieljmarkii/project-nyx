// CUL-2727: the vet visit reminder planner (docs/nyx-vet-reminder-requirements.md §3).
//
// Every fixture is built from LOCAL components, never a UTC literal (C-29): the CI
// matrix runs this suite at UTC+14, UTC+12:45 and UTC−10, and each claim here is about
// the owner's wall clock. The DST sweeps assert in local terms over a whole year, so
// they bite in any zone that has a transition (run locally under TZ=America/Santiago,
// whose spring-forward lands on midnight, and TZ=America/New_York).

import { composeScheduledAt, localDateKey } from './vetVisits';
import {
  aheadInstant,
  appointmentCounts,
  dayOfInstant,
  planVetReminders,
  type ReminderAppointment,
} from './vetReminders';

const PET_A = 'pet-a';
const PET_B = 'pet-b';
const NAMES = new Map([
  [PET_A, 'Nyx'],
  [PET_B, 'Pip'],
]);

/** A booking on a local day, at a local time or none (the shipped composer). */
function at(y: number, m: number, d: number, hh?: number, mm = 0): string {
  return composeScheduledAt(new Date(y, m, d), hh === undefined ? null : new Date(y, m, d, hh, mm));
}

function appt(id: string, scheduledAt: string, over: Partial<ReminderAppointment> = {}): ReminderAppointment {
  return { id, pet_id: PET_A, scheduled_at: scheduledAt, ...over };
}

function hm(d: Date | null): string {
  if (!d) return 'null';
  return `${localDateKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Monday 16 Nov 2026, the spec's worked example.
const Y = 2026;
const NOV = 10;

describe('the two instants (§3.2, R1)', () => {
  it('ahead: 18:00 local, three days before the appointment date', () => {
    expect(hm(aheadInstant(at(Y, NOV, 16, 10, 30)))).toBe('2026-11-13 18:00');
    expect(hm(aheadInstant(at(Y, NOV, 16)))).toBe('2026-11-13 18:00');
    // Across a month boundary.
    expect(hm(aheadInstant(at(Y, 11, 2, 9)))).toBe('2026-11-29 18:00');
  });

  it.each([
    [10, 30, '2026-11-16 08:00'],
    [9, 30, '2026-11-16 07:30'],
    [8, 15, '2026-11-16 06:15'],
    [8, 0, '2026-11-16 06:00'],
    [7, 59, '2026-11-15 19:00'],
    [7, 30, '2026-11-15 19:00'],
    [18, 0, '2026-11-16 08:00'],
  ])('day of, booked %i:%i → %s (the worked examples)', (h, m, want) => {
    expect(hm(dayOfInstant(at(Y, NOV, 16, h, m)))).toBe(want);
  });

  it('day of, no time → 08:00 on the day', () => {
    expect(hm(dayOfInstant(at(Y, NOV, 16)))).toBe('2026-11-16 08:00');
  });

  it('an unreadable instant plans nothing', () => {
    expect(aheadInstant('not a date')).toBeNull();
    expect(dayOfInstant('not a date')).toBeNull();
  });
});

describe('across a whole year, every DST change included', () => {
  // Every day of 2026 at no time, 10:30 and 07:30. Asserted in LOCAL terms, so a
  // transition in the running zone (or a skipped local midnight, the no-time sentinel's
  // DST case) cannot hide: the hour and the day are what the owner reads.
  const days: Date[] = [];
  for (let d = new Date(Y, 0, 1); d.getFullYear() === Y; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(d);
  }

  it('the ahead reminder is always 18:00, three local days before', () => {
    for (const d of days) {
      const a = aheadInstant(composeScheduledAt(d, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 30)));
      const want = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 3);
      expect(a && localDateKey(a)).toBe(localDateKey(want));
      expect(a?.getHours()).toBe(18);
    }
  });

  it('a no-time booking always gets 08:00 on its own day, even where midnight does not exist', () => {
    for (const d of days) {
      const iso = composeScheduledAt(d, null);
      const f = dayOfInstant(iso);
      expect(f && localDateKey(f)).toBe(localDateKey(new Date(iso)));
      expect(f?.getHours()).toBe(8);
    }
  });

  it('a 07:30 booking always moves to 19:00 the evening before', () => {
    for (const d of days) {
      const f = dayOfInstant(composeScheduledAt(d, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 30)));
      expect(f && localDateKey(f)).toBe(localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)));
      expect(f?.getHours()).toBe(19);
    }
  });
});

describe('which appointments count (§3.1)', () => {
  // Cancelled, deleted and logged rows never reach the planner: `readReminderInputs`
  // filters them (lib/vetVisitWrites.test.ts). The planner adds today-or-later.
  const now = new Date(Y, NOV, 10, 12);
  it('today or later', () => {
    expect(appointmentCounts(appt('a', at(Y, NOV, 16, 10, 30)), now)).toBe(true);
    expect(appointmentCounts(appt('b', at(Y, NOV, 9, 10)), now)).toBe(false);
    // Earlier today still counts as today (its day-of may simply have passed).
    expect(appointmentCounts(appt('c', at(Y, NOV, 10, 9)), now)).toBe(true);
    expect(appointmentCounts(appt('d', 'garbage'), now)).toBe(false);
  });
});

describe('planVetReminders', () => {
  function plan(now: Date, appointments: ReminderAppointment[], visitDays: [string, string[]][] = []) {
    return planVetReminders({ now, appointments, petNames: NAMES, visitDaysByPet: new Map(visitDays) });
  }

  it('booked 5+ days out at 10:30: an ahead at 18:00 three days before, a day-of at 08:00 (AC 3)', () => {
    const out = plan(new Date(Y, NOV, 9, 12), [appt('a', at(Y, NOV, 16, 10, 30))]);
    expect(out.map((p) => [p.kind, hm(new Date(p.fireAt)), p.dayKey, p.appointmentId])).toEqual([
      ['ahead', '2026-11-13 18:00', '2026-11-13', 'a'],
      ['day_of', '2026-11-16 08:00', '2026-11-16', 'a'],
    ]);
  });

  it('R2: booked two days out → day-of only; the missed ahead is never fired late (AC 4)', () => {
    const out = plan(new Date(Y, NOV, 14, 9), [appt('a', at(Y, NOV, 16, 10, 30))]);
    expect(out.map((p) => p.kind)).toEqual(['day_of']);
  });

  it('R2: booked the morning of, after its fire time → nothing', () => {
    expect(plan(new Date(Y, NOV, 16, 8, 1), [appt('a', at(Y, NOV, 16, 10, 30))])).toEqual([]);
  });

  it('R2: the boundary instant itself is not the future', () => {
    const out = plan(new Date(Y, NOV, 13, 18, 0), [appt('a', at(Y, NOV, 16, 10, 30))]);
    expect(out.map((p) => p.kind)).toEqual(['day_of']);
  });

  it('a past appointment plans nothing', () => {
    expect(plan(new Date(Y, NOV, 17, 9), [appt('a', at(Y, NOV, 16, 10, 30))])).toEqual([]);
  });

  it('an appointment whose pet has no current name is not planned', () => {
    expect(plan(new Date(Y, NOV, 9, 12), [appt('a', at(Y, NOV, 16, 10, 30), { pet_id: 'gone' })])).toEqual([]);
  });

  it('two pets booked the same day collapse to one ahead and one day-of, with no appointment id (AC 6)', () => {
    const out = plan(new Date(Y, NOV, 9, 12), [
      appt('a', at(Y, NOV, 16, 10, 30)),
      appt('b', at(Y, NOV, 16, 9, 30), { pet_id: PET_B }),
    ]);
    expect(out).toHaveLength(2);
    for (const p of out) expect(p.appointmentId).toBeNull();
    const dayOf = out.find((p) => p.kind === 'day_of');
    // The earliest instant of the group: Pip's 09:30 → 07:30.
    expect(hm(new Date(dayOf!.fireAt))).toBe('2026-11-16 07:30');
    expect(dayOf!.title).toBe('Pip and Nyx see the vet today');
    expect(dayOf!.body).toBe('Tap to get ready for both.');
    expect(out.find((p) => p.kind === 'ahead')!.title).toBe('Pip and Nyx see the vet Monday'); // same instant: the earlier appointment leads
  });

  it('collapse is by FIRE day: an evening-before slot and a same-day slot share one notification', () => {
    // Nyx on the 16th at 07:30 fires the 15th at 19:00; Pip on the 15th at 10:00 fires the
    // 15th at 08:00. One day_of on the 15th, honest about the two different days.
    const out = plan(new Date(Y, NOV, 9, 12), [
      appt('a', at(Y, NOV, 16, 7, 30)),
      appt('b', at(Y, NOV, 15, 10), { pet_id: PET_B }),
    ]).filter((p) => p.kind === 'day_of');
    expect(out).toHaveLength(1);
    expect(out[0].dayKey).toBe('2026-11-15');
    expect(hm(new Date(out[0].fireAt))).toBe('2026-11-15 08:00');
    expect(out[0].title).toBe('Pip and Nyx have vet visits coming up');
  });

  it('distinct days stay distinct notifications', () => {
    const out = plan(new Date(Y, NOV, 1, 12), [appt('a', at(Y, NOV, 16, 10)), appt('b', at(Y, NOV, 20, 10))]);
    expect(out.map((p) => `${p.kind}.${p.dayKey}`)).toEqual([
      'ahead.2026-11-13',
      'day_of.2026-11-16',
      'ahead.2026-11-17',
      'day_of.2026-11-20',
    ]);
  });
});

describe('the words (R4; provisional strings, final at PR-04)', () => {
  const now = new Date(Y, NOV, 9, 12);
  const visitDays: [string, string[]][] = [[PET_A, ['2026-09-16', '2026-11-16', '2026-06-01']]];

  it('ahead names the pet, the day and the time', () => {
    const [ahead] = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30))],
      petNames: NAMES,
      visitDaysByPet: new Map(visitDays),
    });
    expect(ahead.title).toBe('Nyx sees the vet Monday');
    expect(ahead.body).toBe(
      "Monday, Nov 16 at 10:30 am. A few minutes in Get ready now, while there's time to weigh in or call ahead.",
    );
  });

  it('day of: the report window starts at the last visit STRICTLY before the fire day (rung 1)', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30))],
      petNames: NAMES,
      visitDaysByPet: new Map(visitDays),
    });
    const dayOf = out.find((p) => p.kind === 'day_of')!;
    expect(dayOf.title).toBe('Nyx sees the vet today at 10:30 am');
    // 2026-11-16 is the fire day itself, so it anchors nothing (the shared bound).
    expect(dayOf.body).toBe('Make a report of Sep 16 to today to take along.');
  });

  it('day of, evening before, says tomorrow; no earlier visit drops the window', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 7, 30))],
      petNames: NAMES,
      visitDaysByPet: new Map(),
    });
    const dayOf = out.find((p) => p.kind === 'day_of')!;
    expect(dayOf.title).toBe('Nyx sees the vet tomorrow at 7:30 am');
    expect(dayOf.body).toBe('Make a report to take along.');
  });

  it('no time: no clock in either string', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16))],
      petNames: NAMES,
      visitDaysByPet: new Map(),
    });
    expect(out.map((p) => p.title)).toEqual(['Nyx sees the vet Monday', 'Nyx sees the vet today']);
    expect(out[0].body.startsWith('Monday, Nov 16. ')).toBe(true);
  });

  it('nothing from the record beyond the name reaches a string: no reason, clinic, vet, question or count', () => {
    const SECRET = /Lumps|Riverside|Dr\. Ho|question|\d+ (times|days|events)|!/;
    const rows = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30)), appt('b', at(Y, NOV, 16, 11), { pet_id: PET_B })],
      petNames: NAMES,
      visitDaysByPet: new Map(visitDays),
    });
    // The planner's input type carries no reason, clinic or vet at all; the strings are
    // checked anyway, so a future field threaded through cannot reach a lock screen quietly.
    for (const r of rows) {
      expect(r.title).not.toMatch(SECRET);
      expect(r.body).not.toMatch(SECRET);
    }
  });
});
