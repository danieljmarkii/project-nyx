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
  AHEAD_ASK,
  DAY_OF_BODY,
  dayOfInstant,
  describeReminderInstant,
  planVetReminders,
  upcomingReminderInstants,
  upcomingReminderPhrase,
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
  function plan(now: Date, appointments: ReminderAppointment[]) {
    return planVetReminders({ now, appointments, petNames: NAMES });
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

  it('a collapsed day fires once: a re-plan after its first member fired schedules nothing more (§3.3)', () => {
    // Nyx 08:15 → 06:15, Pip 10:30 → 08:00; one day_of on the 16th at 06:15.
    const appts = [appt('a', at(Y, NOV, 16, 8, 15)), appt('b', at(Y, NOV, 16, 10, 30), { pet_id: PET_B })];
    const before = plan(new Date(Y, NOV, 16, 5), appts).filter((p) => p.kind === 'day_of');
    expect(before.map((p) => [p.dayKey, hm(new Date(p.fireAt))])).toEqual([['2026-11-16', '2026-11-16 06:15']]);
    // 06:20: the 06:15 has fired. Pip's 08:00 slot must not come back as its own reminder.
    expect(plan(new Date(Y, NOV, 16, 6, 20), appts).filter((p) => p.kind === 'day_of')).toEqual([]);
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

describe('the words (R4; final at mock round 2, CUL-2728)', () => {
  const now = new Date(Y, NOV, 9, 12);

  it('ahead: the weekday in the title, the date and time in the body, then the ask (T2)', () => {
    const [ahead] = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30))],
      petNames: NAMES,
    });
    expect(ahead.title).toBe('Nyx sees the vet Monday');
    expect(ahead.body).toBe('Nov 16 at 10:30 am. A few minutes in Get ready now leaves time to weigh, log or call ahead.');
    expect(ahead.body).not.toMatch(/weigh in/);
  });

  it('day of: no date from the record (D1), only the line to take a report along', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30))],
      petNames: NAMES,
    });
    const dayOf = out.find((p) => p.kind === 'day_of')!;
    expect(dayOf.title).toBe('Nyx sees the vet today at 10:30 am');
    expect(dayOf.body).toBe('Make a report to take along.');
    expect(dayOf.body).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
  });

  it('day of, evening before, says tomorrow', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 7, 30))],
      petNames: NAMES,
    });
    const dayOf = out.find((p) => p.kind === 'day_of')!;
    expect(dayOf.title).toBe('Nyx sees the vet tomorrow at 7:30 am');
    expect(dayOf.body).toBe(DAY_OF_BODY);
  });

  it('an ahead reminder for a visit in the next year stamps the year (C-19)', () => {
    const [ahead] = planVetReminders({
      now: new Date(Y, 11, 20, 12),
      appointments: [appt('a', at(Y + 1, 0, 2, 9))],
      petNames: NAMES,
    });
    // Fires Dec 30 2026, the visit is Jan 2 2027.
    expect(ahead.body).toBe(`Jan 2, ${Y + 1} at 9:00 am. ${AHEAD_ASK}`);
  });

  it('every reminder carries the pet the tap opens on; a collapsed one carries the first (T4)', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('b', at(Y, NOV, 16, 11), { pet_id: PET_B }), appt('a', at(Y, NOV, 16, 10, 30))],
      petNames: NAMES,
    });
    const dayOf = out.find((p) => p.kind === 'day_of')!;
    expect(dayOf.appointmentId).toBeNull();
    // Both day-of instants are 08:00; the earlier appointment (Nyx, 10:30) leads.
    expect(dayOf.petId).toBe(PET_A);
    const single = planVetReminders({ now, appointments: [appt('b', at(Y, NOV, 16, 11), { pet_id: PET_B })], petNames: NAMES });
    expect(single.every((p) => p.petId === PET_B)).toBe(true);
  });

  it('no time: no clock in either string', () => {
    const out = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16))],
      petNames: NAMES,
    });
    expect(out.map((p) => p.title)).toEqual(['Nyx sees the vet Monday', 'Nyx sees the vet today']);
    expect(out[0].body).toBe(`Nov 16. ${AHEAD_ASK}`);
  });

  it('nothing from the record beyond the name reaches a string: no reason, clinic, vet, question or count', () => {
    const SECRET = /Lumps|Riverside|Dr\. Ho|question|\d+ (times|days|events)|!/;
    const rows = planVetReminders({
      now,
      appointments: [appt('a', at(Y, NOV, 16, 10, 30)), appt('b', at(Y, NOV, 16, 11), { pet_id: PET_B })],
      petNames: NAMES,
    });
    // The planner's input type carries no reason, clinic or vet at all; the strings are
    // checked anyway, so a future field threaded through cannot reach a lock screen quietly.
    for (const r of rows) {
      expect(r.title).not.toMatch(SECRET);
      expect(r.body).not.toMatch(SECRET);
    }
  });
});

describe("the booking sheet's line (D2)", () => {
  it('names both reminders a booking 5+ days out will get', () => {
    const now = new Date(Y, NOV, 10, 12);
    expect(upcomingReminderPhrase(at(Y, NOV, 16, 10, 30), now)).toBe('Friday at 6:00 pm and Monday at 8:00 am');
    // A week out, a bare "Monday" would read as today's weekday: the date is named.
    expect(upcomingReminderPhrase(at(Y, NOV, 16, 10, 30), new Date(Y, NOV, 9, 12))).toBe(
      'Friday at 6:00 pm and Nov 16 at 8:00 am',
    );
  });

  it('inside a window names only what is left, judged by the planner own R2 rule', () => {
    const scheduled = at(Y, NOV, 16, 10, 30);
    const now = new Date(Y, NOV, 14, 9);
    expect(upcomingReminderInstants(scheduled, now).map(hm)).toEqual(['2026-11-16 08:00']);
    expect(upcomingReminderPhrase(scheduled, now)).toBe('Monday at 8:00 am');
    // The same answer the planner gives for the same booking at the same moment.
    const planned = planVetReminders({ now, appointments: [appt('a', scheduled)], petNames: NAMES });
    expect(planned.map((p) => hm(new Date(p.fireAt)))).toEqual(['2026-11-16 08:00']);
  });

  it('another pet booked the same day: the collapsed time, never this booking own (code-reviewer B)', () => {
    const now = new Date(Y, NOV, 14, 12);
    // Pip at 09:30 fires the day-of at 07:30. The new booking at 11:30 would alone fire
    // at 08:00, but the day's one notification fires at the group's earliest, 07:30.
    const pip = appt('p', at(Y, NOV, 16, 9, 30), { pet_id: PET_B });
    expect(upcomingReminderInstants(at(Y, NOV, 16, 11, 30), now).map(hm)).toEqual(['2026-11-16 08:00']);
    expect(upcomingReminderInstants(at(Y, NOV, 16, 11, 30), now, [pip]).map(hm)).toEqual(['2026-11-16 07:30']);
  });

  it("that day's notification already fired: nothing is promised, as the planner sends nothing (code-reviewer A)", () => {
    // 07:45 on the 16th: Pip's day-of (07:30) has fired. A booking for 12:00 that day
    // would alone fire at 08:00, still ahead, but its group's notification is spent.
    const now = new Date(Y, NOV, 16, 7, 45);
    const pip = appt('p', at(Y, NOV, 16, 9, 30), { pet_id: PET_B });
    expect(upcomingReminderInstants(at(Y, NOV, 16, 12), now).map(hm)).toEqual(['2026-11-16 08:00']);
    expect(upcomingReminderInstants(at(Y, NOV, 16, 12), now, [pip])).toEqual([]);
    expect(upcomingReminderPhrase(at(Y, NOV, 16, 12), now, [pip])).toBeNull();
    // And the planner agrees: no day-of for the 16th.
    const planned = planVetReminders({ now, appointments: [pip, appt('n', at(Y, NOV, 16, 12))], petNames: NAMES });
    expect(planned.filter((p) => p.kind === 'day_of' && p.dayKey === '2026-11-16')).toEqual([]);
  });

  it('nothing left: null', () => {
    expect(upcomingReminderPhrase(at(Y, NOV, 16, 10, 30), new Date(Y, NOV, 16, 9))).toBeNull();
  });

  it('says today and tomorrow, and a date past the coming week', () => {
    const now = new Date(Y, NOV, 9, 7);
    expect(describeReminderInstant(new Date(Y, NOV, 9, 8), now)).toBe('today at 8:00 am');
    expect(describeReminderInstant(new Date(Y, NOV, 10, 19), now)).toBe('tomorrow at 7:00 pm');
    expect(describeReminderInstant(new Date(Y, NOV, 15, 18), now)).toBe('Sunday at 6:00 pm');
    expect(describeReminderInstant(new Date(Y, NOV, 16, 18), now)).toBe('Nov 16 at 6:00 pm');
  });
});
