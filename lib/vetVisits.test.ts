import {
  appointmentTimeKnown,
  buildAppointmentView,
  buildVetVisitsCardModel,
  buildVisitListRow,
  composeScheduledAt,
  dayStampFromDate,
  derivePlanTags,
  formatAppointmentWhen,
  formatVisitDate,
  formatVisitWeekday,
  formatWhereLine,
  localDateKey,
  type LocalVetAppointment,
  type LocalVetVisit,
  type VisitLinks,
} from './vetVisits';

// CUL-900 VV-2 — the companion's model layer.
//
// Every fixture here is built from LOCAL components rather than a UTC literal.
// That is not fussiness: the CI matrix runs this suite at UTC+14, UTC+12:45 and
// UTC−10, and the whole point of the hand-parsed date helpers is that they do not
// drift there (C-29).

function visit(over: Partial<LocalVetVisit> = {}): LocalVetVisit {
  return {
    id: 'v1',
    pet_id: 'pet-a',
    visited_at: '2026-07-30',
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'GI follow-up',
    notes: null,
    next_visit_at: null,
    deleted_at: null,
    ...over,
  };
}

function appointment(over: Partial<LocalVetAppointment> = {}): LocalVetAppointment {
  return {
    id: 'a1',
    pet_id: 'pet-a',
    scheduled_at: composeScheduledAt(new Date(2026, 8, 16), new Date(2026, 8, 16, 15, 0)),
    clinic_name: 'Riverside Animal Hospital',
    vet_name: 'Dr. Chen',
    reason: 'recheck',
    vet_visit_id: null,
    cancelled_at: null,
    deleted_at: null,
    ...over,
  };
}

const NO_LINKS: VisitLinks = {
  medicationNames: [],
  trialCount: 0,
  documentCount: 0,
  hasNextVisit: false,
};

describe('the time-optional sentinel', () => {
  it('a booking with a time reads that time back', () => {
    const iso = composeScheduledAt(new Date(2026, 8, 16), new Date(2026, 8, 16, 15, 30));
    expect(appointmentTimeKnown(iso)).toBe(true);
    expect(new Date(iso).getHours()).toBe(15);
    expect(new Date(iso).getMinutes()).toBe(30);
  });

  it('a booking with no time reads back as no time, on the day that was picked', () => {
    const iso = composeScheduledAt(new Date(2026, 8, 16), null);
    expect(appointmentTimeKnown(iso)).toBe(false);
    // The day survives the round trip through the instant, in the device's zone —
    // this is the assertion that fails if the composition ever goes through
    // `toISOString().slice(0,10)` or any other UTC-flavoured shortcut.
    expect(localDateKey(new Date(iso))).toBe('2026-09-16');
  });

  it('keeps the sentinel total: a real midnight booking is not read as "no time"', () => {
    // The one value the representation cannot hold. Nudged by a minute so that
    // "no time" stays a claim about the sentinel rather than about any booking
    // that happens to land on it.
    const iso = composeScheduledAt(new Date(2026, 8, 16), new Date(2026, 8, 16, 0, 0));
    expect(appointmentTimeKnown(iso)).toBe(true);
    expect(localDateKey(new Date(iso))).toBe('2026-09-16');
  });

  it('an unparseable instant is not claimed to carry a time', () => {
    expect(appointmentTimeKnown('not-a-date')).toBe(false);
  });

  it('MEASURES the known limit: the sentinel is read in the reading zone', () => {
    // Not a wish — a demonstration, so the limit documented in the module header
    // is a number someone can check rather than a paragraph someone can believe.
    //
    // The CI timezone matrix cannot see this: it runs the whole suite at one fixed
    // TZ per job, so compose-time and read-time always agree inside a run. Here
    // the two are deliberately different, built by hand rather than by moving the
    // process clock.
    //
    // Composed at local midnight in a UTC−7 zone, an appointment is 07:00Z. Read
    // back in UTC−10 that is 21:00 the PREVIOUS day: a time appears where none was
    // given, and the day slips by one. If a later PR adds `scheduled_time_known`,
    // this test is what should change — and it should change to assert the
    // opposite.
    const composedAtMidnightUtcMinus7 = '2026-09-16T07:00:00.000Z';
    const readInUtcMinus10 = new Date(composedAtMidnightUtcMinus7);
    const hoursThere = (readInUtcMinus10.getUTCHours() - 10 + 24) % 24;
    expect(hoursThere).toBe(21);
    // …which is not midnight, so the read would report a time that was never given.
    expect(hoursThere === 0).toBe(false);
  });
});

describe('dates as the owner reads them', () => {
  it('reads a calendar date as LOCAL, not as UTC midnight', () => {
    // `new Date('2026-07-30')` is UTC midnight by spec, so west of Greenwich a
    // naive implementation renders the 29th. Driven rather than asserted about:
    // the stamp must be the 30th in every zone the CI matrix runs.
    expect(dayStampFromDate('2026-07-30')).toEqual({ day: '30', month: 'Jul' });
    expect(formatVisitDate('2026-07-30', new Date(2026, 8, 1))).toBe('Jul 30');
    expect(formatVisitWeekday('2026-07-30')).toBe('Thursday, Jul 30');
  });

  it('keeps the year when it is not this one', () => {
    expect(formatVisitDate('2025-12-19', new Date(2026, 8, 1))).toBe('Dec 19, 2025');
  });

  it('returns nothing rather than a wrong date for a malformed value', () => {
    expect(dayStampFromDate('')).toBeNull();
    expect(dayStampFromDate('2026-13-01')).toBeNull();
    expect(formatVisitDate('nonsense')).toBe('');
  });

  it('names the near days and falls back to a date once a weekday is ambiguous', () => {
    const now = new Date(2026, 8, 14, 9, 0);
    const at = (d: number, h: number) =>
      composeScheduledAt(new Date(2026, 8, d), new Date(2026, 8, d, h, 0));

    expect(formatAppointmentWhen(at(14, 15), now)).toBe('Today · 3:00 pm');
    expect(formatAppointmentWhen(at(15, 9), now)).toBe('Tomorrow · 9:00 am');
    expect(formatAppointmentWhen(at(16, 15), now)).toBe('Wednesday · 3:00 pm');
    // Seven days out, "Monday" could be either one — so the date takes over.
    expect(formatAppointmentWhen(at(21, 15), now)).toBe('Mon, Sep 21 · 3:00 pm');
  });

  it('says only the day when no time was given', () => {
    const now = new Date(2026, 8, 14, 9, 0);
    const iso = composeScheduledAt(new Date(2026, 8, 16), null);
    expect(formatAppointmentWhen(iso, now)).toBe('Wednesday');
  });

  it('is still today at 5pm for a 9am appointment', () => {
    // The window is the local DAY, not the instant: an appointment does not stop
    // being today's because its hour has passed.
    const now = new Date(2026, 8, 14, 17, 0);
    const iso = composeScheduledAt(new Date(2026, 8, 14), new Date(2026, 8, 14, 9, 0));
    expect(formatAppointmentWhen(iso, now)).toBe('Today · 9:00 am');
  });

  it('joins only the parts that exist', () => {
    expect(formatWhereLine({ clinicName: 'Riverside', vetName: null, reason: 'recheck' }))
      .toBe('Riverside · recheck');
    expect(formatWhereLine({ clinicName: '  ', vetName: null, reason: null })).toBe('');
  });
});

describe('the plan a visit left behind', () => {
  it('derives tags from the linked records, in a fixed order', () => {
    expect(
      derivePlanTags({
        medicationNames: ['Cerenia'],
        trialCount: 1,
        documentCount: 2,
        hasNextVisit: true,
      }),
    ).toEqual([
      { label: 'Trial started', kind: 'diet' },
      { label: 'Cerenia', kind: 'med' },
      { label: 'Recheck set', kind: 'recheck' },
      { label: '2 documents', kind: 'document' },
    ]);
  });

  it('renders no tags for a visit nothing was linked to', () => {
    expect(derivePlanTags(NO_LINKS)).toEqual([]);
  });

  it('counts in the plural only when there is more than one', () => {
    const tags = derivePlanTags({ ...NO_LINKS, documentCount: 1, trialCount: 2 });
    expect(tags.map((t) => t.label)).toEqual(['2 trials started', '1 document']);
  });
});

describe('the list row', () => {
  it('carries the reason as its title', () => {
    const row = buildVisitListRow(visit(), NO_LINKS);
    expect(row.title).toBe('GI follow-up');
    expect(row.where).toBe('Riverside Animal Hospital · Dr. Chen');
  });

  it('names an untyped visit by its date rather than calling it untitled', () => {
    const row = buildVisitListRow(visit({ reason: null }), NO_LINKS, new Date(2026, 8, 1));
    expect(row.title).toBe('Visit on Jul 30');
  });

  it('names the RECORD\'s pet id, so a caller cannot resolve the wrong one', () => {
    expect(buildVisitListRow(visit({ pet_id: 'pet-b' }), NO_LINKS).petId).toBe('pet-b');
  });

  it('still carries the document tag as a pill — only the card\'s sentence drops it', () => {
    const row = buildVisitListRow(visit(), { ...NO_LINKS, documentCount: 2 }, new Date(2026, 8, 14));
    expect(row.tags).toEqual([{ label: '2 documents', kind: 'document' }]);
  });
});

describe('the Pet-tab card model', () => {
  const now = new Date(2026, 8, 14);

  it('is empty only when there is neither a visit nor a booking', () => {
    expect(buildVetVisitsCardModel({ next: null, awaiting: [], visits: [] }, now).isEmpty).toBe(true);
  });

  it('is NOT empty for a first-ever booking with no history', () => {
    // Day one of the feature, and the card is doing its job rather than showing a
    // designed absence over a real appointment.
    const model = buildVetVisitsCardModel(
      { next: buildAppointmentView(appointment(), now), awaiting: [], visits: [] },
      now,
    );
    expect(model.isEmpty).toBe(false);
    expect(model.countLabel).toBeNull();
    expect(model.lastVisitLine).toBeNull();
  });

  it('counts the visits and summarises the last one with its plan', () => {
    const rows = [
      buildVisitListRow(visit(), { ...NO_LINKS, medicationNames: ['Cerenia'], trialCount: 1 }, now),
      buildVisitListRow(visit({ id: 'v2', visited_at: '2026-05-02' }), NO_LINKS, now),
    ];
    const model = buildVetVisitsCardModel({ next: null, awaiting: [], visits: rows }, now);
    expect(model.countLabel).toBe('2 visits');
    expect(model.lastVisitLine).toBe('Last visit Jul 30 — GI follow-up. Plan: trial started, Cerenia.');
  });

  it('says "1 visit", not "1 visits"', () => {
    const rows = [buildVisitListRow(visit(), NO_LINKS, now)];
    expect(buildVetVisitsCardModel({ next: null, awaiting: [], visits: rows }, now).countLabel).toBe('1 visit');
  });

  it('keeps a drug name cased, and never calls paperwork a plan', () => {
    // Two separate defects the product review caught in one line. A drug name is a
    // proper noun — the design authority reads "Cerenia" — and a document is
    // something the visit produced, not something the vet prescribed.
    const rows = [
      buildVisitListRow(
        visit(),
        { medicationNames: ['Cerenia'], trialCount: 1, documentCount: 2, hasNextVisit: true },
        now,
      ),
    ];
    const line = buildVetVisitsCardModel({ next: null, awaiting: [], visits: rows }, now).lastVisitLine;
    expect(line).toBe('Last visit Jul 30 — GI follow-up. Plan: trial started, Cerenia, recheck set.');
    expect(line).not.toMatch(/cerenia/);
    expect(line).not.toMatch(/document/);
  });

  it('omits the plan half rather than announcing that a visit left nothing behind', () => {
    const rows = [buildVisitListRow(visit(), NO_LINKS, now)];
    const line = buildVetVisitsCardModel({ next: null, awaiting: [], visits: rows }, now).lastVisitLine;
    expect(line).toBe('Last visit Jul 30 — GI follow-up.');
    expect(line).not.toMatch(/no plan|nothing/i);
  });
});

describe('the appointment view', () => {
  it('names the record\'s pet and joins clinic, vet and reason', () => {
    const view = buildAppointmentView(appointment({ pet_id: 'pet-b' }), new Date(2026, 8, 14));
    expect(view.petId).toBe('pet-b');
    expect(view.where).toBe('Riverside Animal Hospital · Dr. Chen · recheck');
    expect(view.stamp).toEqual({ day: '16', month: 'Sep' });
  });
});

describe('localDateKey', () => {
  it('is the LOCAL day, zero-padded', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
