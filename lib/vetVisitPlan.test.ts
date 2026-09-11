import {
  courseRowSubtitle,
  courseVerdictLabel,
  DEFAULT_RECHECK_WEEKS,
  defaultRecheckDate,
  describeVisitSave,
  trialVerdictLabel,
  VISIT_OFFLINE_LINE,
  type LinkedLine,
} from './vetVisitPlan';

// CUL-902 VV-4 — the after-visit view model, and in particular the ONE clinically
// load-bearing string on the saved moment: what the save did to the vet report's
// window (§7 AC 8 / AC 9).
//
// The whole suite is pure. `describeVisitSave` takes the record's answer rather than
// asking for it, which is what makes these assertions about COPY rather than about a
// database — and what lets the three branches be enumerated at all.

const LINKED: LinkedLine[] = [
  { key: 'course:1', title: 'Cerenia kept', note: 'linked to this visit' },
  { key: 'next-visit', title: 'Oct 28 · recheck', note: 'booked' },
];

describe('describeVisitSave — the saved moment (AC 8)', () => {
  it('names the pet in the heading', () => {
    const s = describeVisitSave({
      petName: 'Mochi',
      consequence: { isLatest: true, isBeforeToday: false },
      linked: [],
    });
    expect(s.heading).toBe('Saved to Mochi’s visits');
  });

  it('lists what was linked, in the order it was given', () => {
    const s = describeVisitSave({
      petName: 'Mochi',
      consequence: { isLatest: true, isBeforeToday: false },
      linked: LINKED,
    });
    expect(s.linked.map((l) => l.title)).toEqual(['Cerenia kept', 'Oct 28 · recheck']);
  });

  it('carries the Vet Files offline line verbatim', () => {
    const s = describeVisitSave({
      petName: 'Mochi',
      consequence: { isLatest: true, isBeforeToday: false },
      linked: [],
    });
    expect(s.offlineLine).toBe(VISIT_OFFLINE_LINE);
    expect(s.offlineLine).toBe('On this phone now — backs up when you’re online');
  });
});

describe('the report-window sentence (AC 9)', () => {
  // A visit logged TODAY. The report's rung 1 is the most recent visit STRICTLY
  // BEFORE today, so this visit anchors the window from TOMORROW — and a report the
  // owner builds in the car park still runs up to yesterday.
  const today = { isLatest: true, isBeforeToday: false };
  // A visit logged for an earlier day, and still the most recent one. It is the
  // anchor already.
  const earlier = { isLatest: true, isBeforeToday: true };
  // A visit logged LATE, behind one already on file. It changes nothing.
  const behind = { isLatest: false, isBeforeToday: true };

  it('never says "from today", in any branch — the rule the mock’s D2 frame breaks', () => {
    for (const consequence of [today, earlier, behind]) {
      const s = describeVisitSave({ petName: 'Mochi', consequence, linked: LINKED });
      // Every string the moment renders, not just the report line: the ban is on the
      // SURFACE, and a "from today" that drifted into the heading or a linked note
      // would be just as wrong.
      const everything = [s.heading, s.reportLine, s.homeLine, s.offlineLine]
        .concat(s.linked.flatMap((l) => [l.title, l.note]))
        .filter((v): v is string => !!v)
        .join(' ');
      expect(everything).not.toMatch(/from today/i);
    }
  });

  it('says "starts from this visit" for a visit logged today, and dates it TOMORROW', () => {
    const s = describeVisitSave({ petName: 'Mochi', consequence: today, linked: [] });
    expect(s.reportLine).toContain('starts from this visit');
    expect(s.reportLine).toContain('From tomorrow');
    // The half AC 9 asks for explicitly: a same-day report still runs to yesterday,
    // and the copy says so rather than leaving the owner to discover it.
    expect(s.reportLine).toContain('still covers up to yesterday');
  });

  it('says the window has ALREADY moved for a visit dated before today', () => {
    const s = describeVisitSave({ petName: 'Mochi', consequence: earlier, linked: [] });
    expect(s.reportLine).toBe('Mochi’s vet report now starts from this visit.');
    // No "tomorrow" clause: this one is true now, and repeating the caveat would
    // describe a delay that is not there.
    expect(s.reportLine).not.toMatch(/tomorrow/i);
  });

  it('says NOTHING about the report when a later visit already anchors it', () => {
    // The branch the mock does not draw, and the one where a hardcoded sentence
    // would be a false claim: logging March's visit in September moves neither the
    // report window nor Home.
    const s = describeVisitSave({ petName: 'Mochi', consequence: behind, linked: [] });
    expect(s.reportLine).toBeNull();
    expect(s.homeLine).toBeNull();
  });

  it('moves Home’s "since last visit" on any latest visit, today’s included', () => {
    // Home's anchor is an UNBOUNDED MAX(visited_at) (`lib/rundown.ts`), so it moves
    // the moment this visit is the latest — a DIFFERENT bound from the report's, and
    // the reason these are two sentences rather than one.
    expect(describeVisitSave({ petName: 'Mochi', consequence: today, linked: [] }).homeLine)
      .toContain('Since last visit');
    expect(describeVisitSave({ petName: 'Mochi', consequence: earlier, linked: [] }).homeLine)
      .toContain('Since last visit');
  });

  it('never renders an exclamation mark (nyx-voice)', () => {
    for (const consequence of [today, earlier, behind]) {
      const s = describeVisitSave({ petName: 'Mochi', consequence, linked: LINKED });
      expect([s.heading, s.reportLine, s.homeLine, s.offlineLine].join(' ')).not.toContain('!');
    }
  });
});

describe('the plan rows’ copy', () => {
  it('says what the record holds, and no number of its own', () => {
    expect(courseRowSubtitle({ doseAmount: '4 mg', sinceLabel: 'Jul 30' }))
      .toBe('4 mg · since Jul 30');
  });

  it('drops an absent half rather than rendering an empty join', () => {
    expect(courseRowSubtitle({ doseAmount: null, sinceLabel: 'Jul 30' })).toBe('since Jul 30');
    expect(courseRowSubtitle({ doseAmount: '4 mg', sinceLabel: null })).toBe('4 mg');
    expect(courseRowSubtitle({ doseAmount: '   ', sinceLabel: null })).toBe('');
  });

  it('renders the verdicts as OWNER ACTIONS in the past tense (Dr. Chen)', () => {
    // "stopped" and "ended" are the owner actions the H1 register requires before a
    // course or a trial may read as over — silence never ends one. Nothing here
    // grades the owner or the course.
    expect(courseVerdictLabel('keep')).toBe('kept');
    expect(courseVerdictLabel('changed')).toBe('changed');
    expect(courseVerdictLabel('stopped')).toBe('stopped');
    expect(trialVerdictLabel('keep')).toBe('continuing');
    expect(trialVerdictLabel('ended')).toBe('ended');
    expect(trialVerdictLabel('switched')).toBe('switched');
  });
});

describe('defaultRecheckDate — the "in six weeks" seed', () => {
  it('lands six weeks out, on the LOCAL calendar', () => {
    // Anchored to a constructed local date rather than a UTC literal: the CI matrix
    // runs this suite at UTC+14, UTC+12:45 and UTC−10, and a `new Date('…Z')` would
    // be a different calendar day in two of them (C-29).
    const now = new Date(2026, 8, 16, 9, 30);
    const seeded = defaultRecheckDate(now);
    expect(seeded.getFullYear()).toBe(2026);
    expect(seeded.getMonth()).toBe(9); // October
    expect(seeded.getDate()).toBe(28); // Sep 16 + 42 days
    expect(DEFAULT_RECHECK_WEEKS).toBe(6);
  });

  it('crosses a month and a year boundary without drifting a day', () => {
    const seeded = defaultRecheckDate(new Date(2026, 11, 20, 23, 45));
    expect(seeded.getFullYear()).toBe(2027);
    expect(seeded.getMonth()).toBe(0);
    expect(seeded.getDate()).toBe(31);
  });

  it('sits at local NOON, so a DST shift cannot move its calendar day', () => {
    // The seed is handed to a date picker, which renders its local day. Midnight
    // would be one hour from crossing on a spring-forward day.
    expect(defaultRecheckDate(new Date(2026, 2, 1, 0, 5)).getHours()).toBe(12);
  });
});
