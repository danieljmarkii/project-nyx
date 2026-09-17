// `lib/trialWindowSheet.ts` — CUL-1040 (spec §4.2, §4.3, D1a/D3a).
//
// ── WHY THE FIXTURES ARE BUILT FROM LOCAL COMPONENTS ───────────────────────────
//
// Every question here is a LOCAL-DAY question — the trial's day counter, "the rest
// of the day the window moved", the end date the owner plans around — and the CI
// matrix runs this suite at UTC+14 / +12:45 / −10 (`App (jest, non-UTC timezones)`).
// A UTC literal fixture is a different calendar day in three of those, so a day
// key is built from local components and "today" is derived from `Date.now()`
// rather than pinned to a date that a calendar boundary will falsify (C-29).

import {
  WINDOW_LADDER_DAYS,
  WINDOW_MAX_DAYS,
  windowFloorDays,
  windowLabel,
  windowOptionsFor,
  windowOptionFor,
  ladderIsExhausted,
  windowSummaryLines,
  windowRefusalLine,
  saveStateFor,
  windowMovedTodayLine,
  windowEntryIsSettled,
  windowRefusedLine,
} from './trialWindowSheet';

/** 'YYYY-MM-DD' for a local date `daysAgo` before today — the shape every trial's
 *  `started_at` has, on the owner's own clock. */
function localDayKeyAgo(daysAgo: number): string {
  const d = new Date();
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo);
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${mm}-${dd}`;
}

/** The worked case the spec is written against: the PM's cat, day 53 of 56. Day 1
 *  is the start date, so day 53 means the trial started 52 days ago. */
const WORKED = {
  currentTargetDays: 56,
  dayCounter: 53,
  startDayKey: localDayKeyAgo(52),
};

describe('windowFloorDays — the forward floor, mirrored from changeTrialWindow', () => {
  it('is the current target mid-window, where the target is further along', () => {
    expect(windowFloorDays({ currentTargetDays: 56, dayCounter: 53 })).toBe(56);
  });

  it('is the DAY COUNTER in overrun, where it is the binding half', () => {
    // Day 61 of 56. A floor of 56 would permit 58, which writes a window the trial
    // has already passed and leaves the card in the state it was opened from.
    expect(windowFloorDays({ currentTargetDays: 56, dayCounter: 61 })).toBe(61);
  });

  it('degrades a non-finite half to zero rather than producing NaN', () => {
    expect(windowFloorDays({ currentTargetDays: Number.NaN, dayCounter: 20 })).toBe(20);
    expect(windowFloorDays({ currentTargetDays: 56, dayCounter: Number.NaN })).toBe(56);
  });
});

describe('windowLabel — weeks where the total is whole weeks, days where it is not', () => {
  it('names whole weeks', () => {
    expect(windowLabel(56)).toBe('8 weeks');
    expect(windowLabel(84)).toBe('12 weeks');
    expect(windowLabel(7)).toBe('1 week');
  });

  it('does NOT round a non-week total into a week label', () => {
    // 53 rounded to weeks is 8, which is the label 56 already carries. Two
    // different windows must never print the same string.
    expect(windowLabel(53)).toBe('53 days');
    expect(windowLabel(53)).not.toBe(windowLabel(56));
  });

  it('names a single day', () => {
    expect(windowLabel(1)).toBe('1 day');
  });
});

describe('windowOptionsFor — the chips (§4.2, D3a)', () => {
  it('offers exactly the mock’s set on the worked case', () => {
    const opts = windowOptionsFor(WORKED);
    expect(opts.map((o) => o.label)).toEqual(['8 weeks', '10 weeks', '12 weeks', '16 weeks']);
  });

  it('marks the current window, and marks only it', () => {
    const opts = windowOptionsFor(WORKED);
    expect(opts.filter((o) => o.isCurrent).map((o) => o.days)).toEqual([56]);
  });

  it('keeps the current window in ladder order, not bolted onto an end', () => {
    // 42 is a ladder member AND the cat·gi default, so this also pins that an
    // owner on a default sees their own window in place.
    const opts = windowOptionsFor({ currentTargetDays: 42, dayCounter: 30, startDayKey: WORKED.startDayKey });
    expect(opts.map((o) => o.days)).toEqual([42, 56, 70, 84, 112]);
    expect(opts[0].isCurrent).toBe(true);
  });

  it('a non-ladder current window still lands in sorted position', () => {
    const opts = windowOptionsFor({ currentTargetDays: 60, dayCounter: 30, startDayKey: WORKED.startDayKey });
    expect(opts.map((o) => o.days)).toEqual([60, 70, 84, 112]);
    expect(opts.find((o) => o.days === 60)?.isCurrent).toBe(true);
    // …and 56 is GONE, because it is behind the current window. Forward-only is an
    // absence, never a dimmed chip.
    expect(opts.map((o) => o.days)).not.toContain(56);
  });

  it('offers NOTHING at or below the forward floor, in every case', () => {
    for (const dayCounter of [1, 27, 41, 53, 61, 85, 111]) {
      for (const currentTargetDays of [28, 42, 56, 70, 84, 112]) {
        const floor = windowFloorDays({ currentTargetDays, dayCounter });
        const opts = windowOptionsFor({ currentTargetDays, dayCounter, startDayKey: WORKED.startDayKey });
        for (const o of opts) {
          if (o.isCurrent) continue;
          expect(o.days).toBeGreaterThan(floor);
        }
      }
    }
  });

  it('never offers a preset above the ceiling', () => {
    // True of today's ladder by construction; asserted so a ladder member added
    // above the ceiling cannot ship as an un-saveable chip.
    for (const d of WINDOW_LADDER_DAYS) {
      const opts = windowOptionsFor({ currentTargetDays: 28, dayCounter: 1, startDayKey: WORKED.startDayKey });
      if (d > WINDOW_MAX_DAYS) expect(opts.map((o) => o.days)).not.toContain(d);
    }
    expect(windowOptionsFor({ currentTargetDays: 28, dayCounter: 1, startDayKey: WORKED.startDayKey })
      .every((o) => o.days <= WINDOW_MAX_DAYS)).toBe(true);
  });

  it('carries an end date per option, and the dates ascend with the totals', () => {
    const opts = windowOptionsFor(WORKED);
    expect(opts.every((o) => o.endDayKey !== null)).toBe(true);
    const keys = opts.map((o) => o.endDayKey as string);
    expect([...keys].sort()).toEqual(keys);
  });

  it('an unparseable start date yields options with no end date, never a thrown sheet', () => {
    const opts = windowOptionsFor({ ...WORKED, startDayKey: 'not-a-date' });
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.endDayKey === null)).toBe(true);
  });

  it('on a long overrun the ladder is exhausted and says so', () => {
    // Day 200 of 112: every preset is behind the day counter. The sheet must not
    // render one lonely marked chip with no way forward.
    const opts = windowOptionsFor({ currentTargetDays: 112, dayCounter: 200, startDayKey: localDayKeyAgo(199) });
    expect(ladderIsExhausted(opts)).toBe(true);
    expect(opts.map((o) => o.isCurrent)).toEqual([true]);
  });

  it('is NOT exhausted on the worked case', () => {
    expect(ladderIsExhausted(windowOptionsFor(WORKED))).toBe(false);
  });
});

describe('windowOptionFor — the free-entry path’s one option', () => {
  const startDayKey = localDayKeyAgo(52);

  it('labels and dates a total that is not on the ladder', () => {
    const o = windowOptionFor({ days: 91, startDayKey, currentTargetDays: 56 })!;
    expect(o.days).toBe(91);
    expect(o.label).toBe('13 weeks');
    expect(o.endDayKey).not.toBeNull();
    expect(o.isCurrent).toBe(false);
  });

  it('marks a typed total that equals the current window', () => {
    expect(windowOptionFor({ days: 56, startDayKey, currentTargetDays: 56 })?.isCurrent).toBe(true);
  });

  it('gives an over-ceiling total NO end date — a date beside a refusal is a window we just declined', () => {
    const o = windowOptionFor({ days: 840, startDayKey, currentTargetDays: 56 })!;
    expect(o.days).toBe(840);
    expect(o.endDayKey).toBeNull();
  });

  it('is null for a total that is not a window at all', () => {
    for (const days of [0, -5, Number.NaN]) {
      expect(windowOptionFor({ days, startDayKey, currentTargetDays: 56 })).toBeNull();
    }
  });

  it('agrees with the ladder on a total the ladder also offers', () => {
    // One code path for both, so free entry can never disagree with the chip for
    // the same number.
    const chip = windowOptionsFor({ currentTargetDays: 56, dayCounter: 53, startDayKey })
      .find((o) => o.days === 84)!;
    expect(windowOptionFor({ days: 84, startDayKey, currentTargetDays: 56 })).toEqual(chip);
  });
});

describe('windowSummaryLines — the end-date line (§4.2)', () => {
  const twelveWeeks = () => windowOptionsFor(WORKED).find((o) => o.days === 84)!;

  it('names the total and its end date, then the delta as a consequence', () => {
    const lines = windowSummaryLines({ option: twelveWeeks(), currentTargetDays: 56 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^12 weeks — ends .+\.$/);
    expect(lines[1]).toBe('That is 28 more days than the window you set.');
  });

  it('states no delta on the current window — there is nothing more', () => {
    const current = windowOptionsFor(WORKED).find((o) => o.isCurrent)!;
    expect(windowSummaryLines({ option: current, currentTargetDays: 56 })).toHaveLength(1);
  });

  it('singularises one day', () => {
    const lines = windowSummaryLines({
      option: { days: 57, label: '57 days', endDayKey: null, isCurrent: false },
      currentTargetDays: 56,
    });
    expect(lines[1]).toBe('That is 1 more day than the window you set.');
  });

  it('is the free-entry legibility beat — an absurd total renders absurdly', () => {
    // The CUL-1039 handoff's case. This is what keeps `Save` confirm-free: the
    // number is visible in the line the design already requires.
    const lines = windowSummaryLines({
      option: { days: 840, label: '120 weeks', endDayKey: null, isCurrent: false },
      currentTargetDays: 56,
    });
    expect(lines[0]).toBe('120 weeks.');
    expect(lines[1]).toBe('That is 784 more days than the window you set.');
  });

  it('drops the end clause rather than printing a broken date', () => {
    const lines = windowSummaryLines({
      option: { days: 84, label: '12 weeks', endDayKey: null, isCurrent: false },
      currentTargetDays: 56,
    });
    expect(lines[0]).toBe('12 weeks.');
  });
});

describe('windowRefusalLine — the two sentences, from structured fields (§4.2, D3a)', () => {
  const base = { currentTargetDays: 56, dayCounter: 53, petName: 'Nyx' };

  it('names the DAY COUNTER when the total is at or below it', () => {
    expect(windowRefusalLine({ ...base, requestedDays: 40 })).toBe('Nyx is already on day 53.');
    expect(windowRefusalLine({ ...base, requestedDays: 53 })).toBe('Nyx is already on day 53.');
  });

  it('names the STORED WINDOW when the total clears the day but not the window', () => {
    // 54 and 55 are past day 53 and still shorter than the 56-day window. This is
    // the second sentence, and it is a different fact from the first.
    const line = windowRefusalLine({ ...base, requestedDays: 55 });
    expect(line).toBe(
      'That is shorter than the 56-day window you set. To end this trial and start a new one, use Replace the trial.',
    );
    expect(line).not.toContain('day 53');
  });

  it('names EQUALITY as equality, never as shortness', () => {
    // The field path calls this directly, so a typed 56 against a 56-day window used
    // to read "That is shorter than the 56-day window you set".
    expect(windowRefusalLine({ ...base, requestedDays: 56 })).toBe('That is the window you have now.');
    // …and it agrees with what Save says about the same total, which is the reason
    // the bug mattered: two surfaces, one record, one answer.
    expect(windowRefusalLine({ ...base, requestedDays: 56 }))
      .toBe(saveStateFor({ ...base, selectedDays: 56 }).reason);
  });

  it('still says SHORTER for a total genuinely below the window', () => {
    expect(windowRefusalLine({ ...base, requestedDays: 55 })).toMatch(/^That is shorter than the 56-day window/);
  });

  it('the two sentences are genuinely different strings', () => {
    expect(windowRefusalLine({ ...base, requestedDays: 40 }))
      .not.toBe(windowRefusalLine({ ...base, requestedDays: 55 }));
  });

  it('prefers the DAY sentence in overrun, where the window is a passed number', () => {
    // Day 61 of 56: quoting "shorter than the 56-day window" would name a window
    // the trial is already past.
    const line = windowRefusalLine({ currentTargetDays: 56, dayCounter: 61, petName: 'Nyx', requestedDays: 58 });
    expect(line).toBe('Nyx is already on day 61.');
  });

  it('refuses above the ceiling, and says what Culprit records rather than what a trial should be', () => {
    const line = windowRefusalLine({ ...base, requestedDays: 840 });
    expect(line).toBe(
      'Culprit records a trial up to 365 days. For longer than that, your vet is the best call.',
    );
    // No clinical claim about trial length anywhere in it.
    expect(line).not.toMatch(/too long|should|shouldn|excessive|unsafe/i);
  });

  it('accepts exactly the ceiling, and refuses one past it', () => {
    expect(windowRefusalLine({ ...base, requestedDays: WINDOW_MAX_DAYS })).toBeNull();
    expect(windowRefusalLine({ ...base, requestedDays: WINDOW_MAX_DAYS + 1 })).not.toBeNull();
  });

  it('answers a zero or a blank with the floor, not the ceiling', () => {
    expect(windowRefusalLine({ ...base, requestedDays: 0 })).toBe(
      'Enter the trial’s whole length in days.',
    );
    expect(windowRefusalLine({ ...base, requestedDays: Number.NaN })).toBe(
      'Enter the trial’s whole length in days.',
    );
  });

  it('returns null on a real forward total', () => {
    expect(windowRefusalLine({ ...base, requestedDays: 84 })).toBeNull();
  });

  it('falls back to second person when the name is missing — never "the pet"', () => {
    const line = windowRefusalLine({ ...base, petName: '', requestedDays: 40 });
    expect(line).toBe('your pet is already on day 53.');
    expect(line).not.toContain('the pet');
  });

  it('no refusal carries an exclamation mark', () => {
    for (const requestedDays of [0, 40, 55, 840, Number.NaN]) {
      expect(windowRefusalLine({ ...base, requestedDays })).not.toContain('!');
    }
  });
});

describe('windowEntryIsSettled — the refusal waits for a whole number (pm-review)', () => {
  it('withholds every PREFIX of a valid total', () => {
    // The measured defect: typing 84 reddened the field at `8`, and 112 at `1` and
    // `11`, each announced on iOS. Every digit on the way to a real answer.
    for (const prefix of [8, 1, 11, 4, 5, 7, 16]) {
      expect(windowEntryIsSettled(prefix)).toBe(false);
    }
  });

  it('settles a total that another digit could not rescue', () => {
    // 40 × 10 = 400 > 365, so 40 is as complete as it will get — and it really is
    // behind day 53, so the refusal is about the number she meant.
    expect(windowEntryIsSettled(40)).toBe(true);
    expect(windowEntryIsSettled(50)).toBe(true);
    expect(windowEntryIsSettled(84)).toBe(true);
    expect(windowEntryIsSettled(840)).toBe(true);
  });

  it('is false for an empty or absurd entry, so neither reds the field mid-type', () => {
    for (const v of [0, -1, Number.NaN]) expect(windowEntryIsSettled(v)).toBe(false);
  });

  it('a LADDER total can still be a prefix, and that is correct', () => {
    // 28 × 10 = 280, which is inside the ceiling, so `28` really could be on its way
    // to `280`. Written first as "every ladder total is settled" and the suite said
    // otherwise — the premise was wrong, not the predicate.
    expect(windowEntryIsSettled(28)).toBe(false);
    expect(windowEntryIsSettled(42)).toBe(true);
  });

  it('…and withholding it costs no reason, because Save still carries one', () => {
    // THE INVARIANT THE LADDER TEST WAS REACHING FOR. The gate may delay a sentence
    // on the FIELD; it may never leave an un-saveable total with no sentence
    // anywhere. Swept over every total the free field can hold up to the ceiling.
    for (let d = 1; d <= WINDOW_MAX_DAYS + 1; d++) {
      const save = saveStateFor({ selectedDays: d, currentTargetDays: 56, dayCounter: 53, petName: 'Nyx' });
      if (!save.canSave) expect(save.reason).not.toBeNull();
    }
  });

  it('does NOT relax what may be SAVED — silence is "not yet", never "fine"', () => {
    // The half that keeps the gate honest. `8` is withheld from the field AND
    // refused by Save, so nothing invalid can be submitted while its reason is
    // being held back.
    expect(windowEntryIsSettled(8)).toBe(false);
    expect(saveStateFor({ selectedDays: 8, currentTargetDays: 56, dayCounter: 53, petName: 'Nyx' }).canSave)
      .toBe(false);
  });
});

describe('saveStateFor — the confirm-free Save and its stated reasons (§4.2)', () => {
  const base = { currentTargetDays: 56, dayCounter: 53, petName: 'Nyx' };

  it('cannot save with nothing chosen, and says nothing — there is no refusal yet', () => {
    expect(saveStateFor({ ...base, selectedDays: null })).toEqual({ canSave: false, reason: null });
  });

  it('cannot save the CURRENT window, and names it as an answer rather than an error', () => {
    const state = saveStateFor({ ...base, selectedDays: 56 });
    expect(state.canSave).toBe(false);
    expect(state.reason).toBe('That is the window you have now.');
    // Not phrased as the owner getting something wrong.
    expect(state.reason).not.toMatch(/already on day|shorter than/);
  });

  it('can save a real forward total, with no reason to render', () => {
    expect(saveStateFor({ ...base, selectedDays: 84 })).toEqual({ canSave: true, reason: null });
  });

  it('EVERY un-saveable state that is not "nothing chosen" carries a reason', () => {
    // The C-7 pairing: a `disabled` Save asserts a control exists and is
    // unavailable, so the sheet always has something to say about why.
    for (const selectedDays of [0, 40, 55, 56, 840]) {
      const state = saveStateFor({ ...base, selectedDays });
      expect(state.canSave).toBe(false);
      expect(state.reason).not.toBeNull();
    }
  });

  it('routes the refusals through the same phrasing as the free-entry field', () => {
    expect(saveStateFor({ ...base, selectedDays: 40 }).reason).toBe(
      windowRefusalLine({ ...base, requestedDays: 40 }),
    );
  });
});

describe('windowRefusedLine — a write the PREDICATE refused (CUL-1039 handoff)', () => {
  const base = { requestedDays: 84, currentTargetDays: 56, dayCounter: 53, petName: 'Nyx' };

  it('re-uses the live sentences on not_forward, so the wording is the field’s wording', () => {
    expect(windowRefusedLine({ ...base, reason: 'not_forward', requestedDays: 40 }))
      .toBe(windowRefusalLine({ ...base, requestedDays: 40 }));
  });

  it('says the trial ended on not_running, which is a different fact from a bad number', () => {
    expect(windowRefusedLine({ ...base, reason: 'not_running' }))
      .toBe('Nyx’s trial has ended, so its window cannot change.');
  });

  it('every arm returns a sentence, and none of them is an error message', () => {
    for (const reason of ['not_found', 'not_running', 'not_forward', 'out_of_range'] as const) {
      const line = windowRefusedLine({ ...base, reason });
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toContain('!');
      // Never the diagnostic `TrialWindowRefused` builds for `message`.
      expect(line).not.toMatch(/changeTrialWindow|refused \(|floor \d|undefined/);
    }
  });

  it('falls back rather than reporting success when not_forward arrives with no fields', () => {
    // `windowRefusalLine` returns null when the total WAS forward of what it was
    // handed, which only happens when the fields are absent. Returning null here
    // would render nothing over a write that did not happen.
    const line = windowRefusedLine({
      reason: 'not_forward', requestedDays: 84, currentTargetDays: null, dayCounter: null, petName: 'Nyx',
    });
    expect(line).toBe('Nyx’s trial has a different window now. Have a look and try again.');
  });
});

describe('windowMovedTodayLine — §4.3’s one added line', () => {
  const startDayKey = localDayKeyAgo(52);

  it('renders the new end date on the day the window moved', () => {
    const line = windowMovedTodayLine({
      targetDurationSetAt: new Date().toISOString(),
      currentTargetDays: 84,
      startDayKey,
      nowMs: Date.now(),
    });
    expect(line).toMatch(/^The window now runs to .+\.$/);
  });

  it('is absent when the window has never moved', () => {
    expect(
      windowMovedTodayLine({ targetDurationSetAt: null, currentTargetDays: 84, startDayKey, nowMs: Date.now() }),
    ).toBeNull();
  });

  it('is absent the day after — one line, for the rest of that day, and no longer', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(
      windowMovedTodayLine({
        targetDurationSetAt: yesterday.toISOString(),
        currentTargetDays: 84,
        startDayKey,
        nowMs: Date.now(),
      }),
    ).toBeNull();
  });

  it('reads the two ISO spellings of ONE instant identically (C-40)', () => {
    // A local write produces `…T04:00:00.000Z`; PostgREST hands the same instant
    // back as `…T04:00:00+00:00`. `'+'` sorts before `'.'`, so a lexical compare
    // splits them — and the day the window moved is exactly where a row sits.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const localNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const asZ = localNoon.toISOString();
    const asOffset =
      `${asZ.slice(0, 19)}+00:00`.replace(
        asZ.slice(0, 19),
        `${new Date(asZ).getUTCFullYear()}-${pad(new Date(asZ).getUTCMonth() + 1)}-${pad(
          new Date(asZ).getUTCDate(),
        )}T${pad(new Date(asZ).getUTCHours())}:${pad(new Date(asZ).getUTCMinutes())}:${pad(
          new Date(asZ).getUTCSeconds(),
        )}`,
      );

    // The proof is non-vacuous only if the two spellings really are one instant AND
    // really do differ as text — otherwise this measures nothing (C-34).
    expect(new Date(asOffset).getTime()).toBe(new Date(asZ).getTime());
    expect(asOffset).not.toBe(asZ);

    const args = { currentTargetDays: 84, startDayKey, nowMs: localNoon.getTime() };
    expect(windowMovedTodayLine({ ...args, targetDurationSetAt: asOffset })).toBe(
      windowMovedTodayLine({ ...args, targetDurationSetAt: asZ }),
    );
    expect(windowMovedTodayLine({ ...args, targetDurationSetAt: asZ })).not.toBeNull();
  });

  it('is absent when the stamp is unparseable', () => {
    expect(
      windowMovedTodayLine({
        targetDurationSetAt: 'yesterday-ish',
        currentTargetDays: 84,
        startDayKey,
        nowMs: Date.now(),
      }),
    ).toBeNull();
  });

  it('is absent when the new window has already ended — nothing "runs to" a past date', () => {
    // A window shortened is impossible (D3a), but a trial resumed after a long gap
    // can hold a stamp from today over a window whose end is behind today.
    expect(
      windowMovedTodayLine({
        targetDurationSetAt: new Date().toISOString(),
        currentTargetDays: 10,
        startDayKey,
        nowMs: Date.now(),
      }),
    ).toBeNull();
  });

  it('carries no cheer, no countdown, and no exclamation mark (TE-7)', () => {
    const line = windowMovedTodayLine({
      targetDurationSetAt: new Date().toISOString(),
      currentTargetDays: 84,
      startDayKey,
      nowMs: Date.now(),
    }) as string;
    expect(line).not.toContain('!');
    expect(line).not.toMatch(/nice|great|well done|keep going|you'?ve got|to go|remaining|left/i);
  });
});
