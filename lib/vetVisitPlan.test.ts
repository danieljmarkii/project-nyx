import {
  courseRowSubtitle,
  courseVerdictLabel,
  DEFAULT_RECHECK_WEEKS,
  defaultRecheckDate,
  describeVisitSave,
  endTrialCopy,
  mergePlanCourses,
  settledVerdictLine,
  stopCourseCopy,
  visitAnchorsAnything,
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
      consequence: { isLatest: true, dayRelation: 'today' as const },
      linked: [],
    });
    expect(s.heading).toBe('Saved to Mochi’s visits');
  });

  it('lists what was linked, in the order it was given', () => {
    const s = describeVisitSave({
      petName: 'Mochi',
      consequence: { isLatest: true, dayRelation: 'today' as const },
      linked: LINKED,
    });
    expect(s.linked.map((l) => l.title)).toEqual(['Cerenia kept', 'Oct 28 · recheck']);
  });

  it('carries the Vet Files offline line verbatim', () => {
    const s = describeVisitSave({
      petName: 'Mochi',
      consequence: { isLatest: true, dayRelation: 'today' as const },
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
  const today = { isLatest: true, dayRelation: 'today' } as const;
  // A visit logged for an earlier day, and still the most recent one. It is the
  // anchor already.
  const earlier = { isLatest: true, dayRelation: 'before_today' } as const;
  // A visit logged LATE, behind one already on file. It changes nothing.
  const behind = { isLatest: false, dayRelation: 'before_today' } as const;
  // THE FOURTH STATE, and the one the first cut could not represent: a recheck booked
  // six weeks out, opened from *Next* and saved with no tap on the picker. The report
  // skips a future-dated visit for as long as the date is in the future.
  const future = { isLatest: true, dayRelation: 'after_today' } as const;

  it('never says "from today", in any branch — the rule the mock’s D2 frame breaks', () => {
    for (const consequence of [today, earlier, behind, future]) {
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

  it('says NOTHING about the report for a FUTURE-dated visit', () => {
    // Driven from the real `resolveScope` by the adversarial pass: a visit dated 47
    // days out returns `fallback_90d`, not `since_visit`, for all 47 of them — so
    // "From tomorrow, your vet report starts from this visit" was false for a month
    // and a half. The seeds are clamped so this screen can no longer write one; this
    // is the other half, so the copy cannot make the claim if a future row arrives by
    // sync from a device that did.
    const s = describeVisitSave({ petName: 'Mochi', consequence: future, linked: [] });
    expect(s.reportLine).toBeNull();
  });

  it('says NOTHING about Home either for a future-dated visit — the truer sentence is the worse one', () => {
    // Home's anchor IS unbounded, so "since last visit starts again from here" would
    // be literally true — and that is the harm: the rundown then renders an absence
    // over a window that cannot contain anything, which is a false all-clear on the
    // surface an owner reads in the exam room.
    expect(describeVisitSave({ petName: 'Mochi', consequence: future, linked: [] }).homeLine)
      .toBeNull();
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

  it('never asserts wellness, in any branch (clinical-guardrails Pattern 8)', () => {
    // The saved moment is not an AI read, and the n=1 rule does not reach it — but
    // it IS the most health-adjacent confirmation in the app, and Pattern 8's
    // discipline applies wherever an owner-facing template can drift: the invariant
    // is an assertion, never a comment. A future edit adding "everything's recorded,
    // you're all set" is exactly the drift this catches.
    for (const consequence of [today, earlier, behind, future]) {
      const s = describeVisitSave({ petName: 'Mochi', consequence, linked: LINKED });
      const everything = [s.heading, s.reportLine, s.homeLine, s.offlineLine]
        .concat(s.linked.flatMap((l) => [l.title, l.note]))
        .filter((v): v is string => !!v)
        .join(' ');
      expect(/\b(fine|okay|ok|healthy|well|all clear|nothing to worry|all set)\b/i.test(everything))
        .toBe(false);
    }
  });

  it('never renders an exclamation mark (nyx-voice)', () => {
    for (const consequence of [today, earlier, behind, future]) {
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

// ── The shared anchor predicate (CUL-953 item 1) ─────────────────────────────
//
// `visitAnchorsAnything` was extracted from `describeVisitSave` when the EDIT
// screen gained a second reader. The extraction is the point: the editor makes the
// same claim one step EARLIER — under the date picker, before the write — and it
// was making it unconditionally, so correcting a typo on a March visit with April's
// already on record told an owner they had moved their report window.
//
// One question, one function. These cases pin the rule at the level both surfaces
// now read it at, so a change made for one of them cannot quietly apply to only one.
describe('visitAnchorsAnything — what the report window and Home key off', () => {
  it('is true for the latest visit dated before today — the anchor already', () => {
    expect(visitAnchorsAnything({ isLatest: true, dayRelation: 'before_today' })).toBe(true);
  });

  it('is true for the latest visit dated today — the anchor tomorrow', () => {
    // The report's rung 1 is strictly before today, so this visit anchors the
    // window from tomorrow. It still ANCHORS, which is what this predicate asks;
    // which of the two sentences to print is describeVisitSave's separate job.
    expect(visitAnchorsAnything({ isLatest: true, dayRelation: 'today' })).toBe(true);
  });

  it('is false for a FUTURE-dated visit even though it is the latest', () => {
    // A future row anchors nothing and is claimed for nothing: the report skips it
    // until the day arrives, and Home's unbounded MAX(visited_at) WOULD adopt it
    // and then render an absence over a window that cannot contain anything.
    expect(visitAnchorsAnything({ isLatest: true, dayRelation: 'after_today' })).toBe(false);
  });

  it('is false for a visit logged behind one already on record', () => {
    // The case that made the edit screen lie: a March visit corrected while April's
    // is on file moves neither surface.
    expect(visitAnchorsAnything({ isLatest: false, dayRelation: 'before_today' })).toBe(false);
    expect(visitAnchorsAnything({ isLatest: false, dayRelation: 'today' })).toBe(false);
  });

  it('is the same rule describeVisitSave speaks — asserted, not assumed', () => {
    // The extraction's whole value is that these cannot diverge, so the agreement
    // is checked rather than trusted: wherever the predicate says a visit anchors
    // nothing, the moment must also be silent about both surfaces, and wherever it
    // says it anchors, the moment must speak about both.
    const cases = [
      { isLatest: true, dayRelation: 'before_today' as const },
      { isLatest: true, dayRelation: 'today' as const },
      { isLatest: true, dayRelation: 'after_today' as const },
      { isLatest: false, dayRelation: 'before_today' as const },
      { isLatest: false, dayRelation: 'today' as const },
      { isLatest: false, dayRelation: 'after_today' as const },
    ];
    for (const consequence of cases) {
      const s = describeVisitSave({ petName: 'Mochi', consequence, linked: [] });
      const anchors = visitAnchorsAnything(consequence);
      expect(s.homeLine !== null).toBe(anchors);
      expect(s.reportLine !== null).toBe(anchors);
    }
  });
});

// CUL-951 — the one safety net on *Stopped* / *Ended*, and what the row says after.
describe('the Stopped / Ended confirm (CUL-951)', () => {
  it('names the course, the pet and the day it ends', () => {
    const c = stopCourseCopy({ drugName: 'Motozol', petName: 'Nyx', endLabel: 'Sep 22' });
    expect(c.title).toBe('Stop Motozol?');
    expect(c.body).toBe(
      'Nyx’s Motozol course ends today, Sep 22. Its logged doses stay on the timeline and in vet reports.',
    );
    expect(c.keepLabel).toBe('Keep it');
    expect(c.confirmLabel).toBe('Stop it');
  });

  it('trims a drug name the record stored with padding', () => {
    expect(stopCourseCopy({ drugName: ' Cerenia ', petName: 'Nyx', endLabel: 'Sep 22' }).title)
      .toBe('Stop Cerenia?');
  });

  it('names the trial by its food, and the day it ends', () => {
    const c = endTrialCopy({ foodLabel: 'Hill’s z/d', petName: 'Juniper', endLabel: 'Sep 22' });
    expect(c.title).toBe('End the Hill’s z/d trial?');
    expect(c.body).toBe(
      'Juniper’s trial ends today, Sep 22. Everything logged during it stays on the timeline.',
    );
    expect(c.confirmLabel).toBe('End it');
  });

  it('never reads "the Diet trial trial" for a trial with no food name', () => {
    expect(endTrialCopy({ foodLabel: null, petName: 'Nyx', endLabel: 'Sep 22' }).title)
      .toBe('End the diet trial?');
    expect(endTrialCopy({ foodLabel: '  ', petName: 'Nyx', endLabel: 'Sep 22' }).title)
      .toBe('End the diet trial?');
  });

  it('makes no claim about the vet report for a trial (B-455: an ended-early trial still reads as ongoing there)', () => {
    const c = endTrialCopy({ foodLabel: 'Hill’s z/d', petName: 'Nyx', endLabel: 'Sep 22' });
    expect(c.body).not.toMatch(/report/i);
  });

  it('carries no exclamation mark and never says the cancel is the *Keep* verdict', () => {
    const all = [
      stopCourseCopy({ drugName: 'Motozol', petName: 'Nyx', endLabel: 'Sep 22' }),
      endTrialCopy({ foodLabel: 'Hill’s z/d', petName: 'Nyx', endLabel: 'Sep 22' }),
    ];
    for (const c of all) {
      expect(`${c.title} ${c.body} ${c.keepLabel} ${c.confirmLabel}`).not.toMatch(/!/);
      // The cancel is a phrase, not the bare chip label: *Keep* would read as the
      // verdict it is not.
      expect(c.keepLabel).not.toBe('Keep');
    }
  });
});

describe('settledVerdictLine — the row says what happened instead of vanishing', () => {
  it('says "today" on the day it was written', () => {
    expect(settledVerdictLine({ verdict: 'stopped', endedOn: '2026-09-22', today: '2026-09-22', endLabel: 'Sep 22' }))
      .toBe('Stopped today');
    expect(settledVerdictLine({ verdict: 'ended', endedOn: '2026-09-22', today: '2026-09-22', endLabel: 'Sep 22' }))
      .toBe('Ended today');
  });

  it('names the day once it is no longer today — a screen left open past midnight', () => {
    expect(settledVerdictLine({ verdict: 'stopped', endedOn: '2026-09-22', today: '2026-09-23', endLabel: 'Sep 22' }))
      .toBe('Stopped Sep 22');
  });
});

describe('mergePlanCourses — a settled course keeps its place across a re-read', () => {
  const a = { id: 'a', v: 1 };
  const b = { id: 'b', v: 1 };
  const c = { id: 'c', v: 1 };

  it('keeps a settled course the active read no longer returns, in the place it held', () => {
    // `b` was stopped: the read filters `status = 'active'` and drops it.
    expect(mergePlanCourses([a, b, c], [a, c], new Set(['b'])).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops an UNSETTLED course the read no longer returns — the record wins there', () => {
    // Ended on another surface: nothing on this screen answered it, so nothing on this
    // screen should keep claiming it is running.
    expect(mergePlanCourses([a, b, c], [a, c], new Set()).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('takes the fresh row for everything not settled (a *Changed* dose shows)', () => {
    const a2 = { id: 'a', v: 2 };
    expect(mergePlanCourses([a, b], [a2, b], new Set())[0]).toBe(a2);
  });

  it('keeps the settled SNAPSHOT even if the read returns the row again', () => {
    // A settled row is an answer given; a late read must not re-open its chips.
    const b2 = { id: 'b', v: 2 };
    expect(mergePlanCourses([a, b], [a, b2], new Set(['b']))[1]).toBe(b);
  });

  it('appends a newly added course after the rows already on screen', () => {
    expect(mergePlanCourses([a, b], [c, a, b], new Set()).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is the fresh read on first load', () => {
    expect(mergePlanCourses([], [c, a], new Set()).map((x) => x.id)).toEqual(['c', 'a']);
  });
});
