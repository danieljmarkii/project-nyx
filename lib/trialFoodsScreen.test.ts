// B-616 PR 2 — "What {pet} can eat" and the mid-trial add's confirm sheet
// (spec §2.2/§2.3; §6's PR-2 acceptance criteria).
//
// What is pinned here, in rough order of what would hurt if it broke:
//   • FR-11's sheet states EXACTLY three facts and offers exactly two actions —
//     no role question, no wisdom-check. The count is the criterion;
//   • `Earlier feedings — Keep the reading they already have` is unconditional.
//     Delete it on any day and the add reads as an amnesty, which is the one
//     thing D5's dated membership exists to refuse;
//   • a mid-trial add renders as "Added {date}, day N" rather than as a plain
//     "since", and that N is the SAME number the trial card is showing (§5 edge
//     7 — asserted against `getDietTrialProgress` itself, not against a literal);
//   • the C6 disclosure renders verbatim;
//   • R1/§6.9 — no string on either surface marks a food off-diet, judges the
//     owner, or renders coverage, adherence, a score or a streak.

// `lib/analytics` (where `getDietTrialProgress` lives) imports the feeding-
// arrangements module, which pulls `lib/sync` → `lib/supabase` and its fail-fast
// env check. The module under test is pure and touches neither, so stub the edge
// of the graph exactly as lib/dietTrialCard.test.ts does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { getDietTrialProgress } from './analytics';
import { buildTrialContext, type AllowedFood } from './dietTrial';
import type { TrialAllowedSet, TrialAllowedSetTrial } from './trialAllowedSet';
import {
  ADD_TRIAL_FOOD_CAPTION,
  ADD_TRIAL_FOOD_ERROR,
  alreadyOnListNote,
  buildAddTrialFoodSheet,
  buildTrialFoodsScreen,
  membershipFact,
  noTrialLine,
  trialDayOn,
  TRIAL_FOODS_DISCLOSURE,
  TRIAL_FOODS_EMPTY_EXTRAS,
} from './trialFoodsScreen';

const TRIAL: TrialAllowedSetTrial = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 28,
  endedAt: null,
};

/** Midday local on a given day, so the instant lands on that calendar day in the
 *  runner's own zone — which is the zone `allowed_from` day keys are written in. */
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

function food(over: Partial<AllowedFood> = {}): AllowedFood {
  return {
    foodItemId: 'food-dry',
    foodKey: 'zignaturekangaroo formula',
    label: 'Zignature Kangaroo Formula',
    role: 'primary_diet',
    allowedFrom: '2026-07-01',
    allowedUntil: null,
    primaryProtein: 'kangaroo',
    proteins: ['kangaroo'],
    ...over,
  };
}

/** The REAL context builder, never a hand-rolled stand-in: this module reads
 *  membership back out through `trialListFoodsOn` → `allowedMembershipOn`, so a
 *  fake context would quietly test a different predicate than production runs. */
function readySet(foods: AllowedFood[], trial: TrialAllowedSetTrial = TRIAL): TrialAllowedSet {
  return {
    status: 'ready',
    trial,
    ctx: buildTrialContext(
      {
        id: trial.id,
        startedAt: trial.startedAt,
        endedAt: trial.endedAt,
        targetDurationDays: trial.targetDurationDays,
      },
      foods,
    ),
    foods,
  };
}

describe('the dated membership fact (FR-6)', () => {
  it('reads as the trial’s own opening set on day 1', () => {
    expect(membershipFact(TRIAL, food({ allowedFrom: '2026-07-01' })))
      .toBe('On the list since 1 July');
  });

  // D5's visible half. A mid-trial add rendered as a plain "since" would read as
  // though the food had always been permitted — the amnesty the confirm sheet
  // explicitly denies and the write path structurally refuses.
  it('names the DAY a mid-trial add joined, never just the date', () => {
    expect(membershipFact(TRIAL, food({ allowedFrom: '2026-07-12' })))
      .toBe('Added 12 July, day 12');
  });

  it('omits the clause rather than printing a fabricated day', () => {
    expect(membershipFact(TRIAL, food({ allowedFrom: 'not-a-date' }))).toBe('On the list');
  });

  // §5 edge 7, asserted against the app's ONE day-math source rather than against
  // a literal — a local re-derivation that drifted by one would still pass a
  // hardcoded expectation.
  it('agrees with getDietTrialProgress on which day it is', () => {
    for (const day of ['2026-07-01', '2026-07-12', '2026-07-28', '2026-08-04']) {
      const expected = getDietTrialProgress(
        { startedAt: TRIAL.startedAt, targetDurationDays: TRIAL.targetDurationDays },
        new Date(`${day}T12:00:00`).getTime(),
      );
      expect(trialDayOn(TRIAL, day)).toBe(expected?.dayCounter);
    }
  });

  // A backdated start still opens its founding rows at `started_at`, so day ≤ 1
  // is the right test for "this is part of what the vet prescribed" — no stored
  // was-this-an-add flag is needed, and none exists.
  it('treats a row dated before the start as founding, not as an add', () => {
    expect(membershipFact(TRIAL, food({ allowedFrom: '2026-06-28' })))
      .toBe('On the list since 28 June');
  });
});

describe('the screen (§2.2)', () => {
  const set = readySet([
    food(),
    food({
      foodItemId: 'food-jerky',
      foodKey: 'real meatkangaroo jerky',
      label: 'Real Meat Kangaroo Jerky',
      role: 'permitted_treat',
      allowedFrom: '2026-07-12',
    }),
    food({
      foodItemId: 'food-chew',
      foodKey: 'vetdental chew',
      label: 'Vet Dental Chew',
      role: 'permitted_other',
      allowedFrom: '2026-07-01',
    }),
  ]);
  const model = buildTrialFoodsScreen('Biscuit', set, localNoon(2026, 7, 12))!;

  it('is titled for the pet and dated to the trial’s own counter', () => {
    expect(model.title).toBe('What Biscuit can eat');
    expect(model.subtitle).toBe('Diet trial · day 12 of 28');
  });

  it('groups the prescribed diet apart from every permitted extra', () => {
    expect(model.groups.map((g) => g.title)).toEqual(['Trial diet', 'Also allowed']);
    expect(model.groups[0].rows.map((r) => r.label)).toEqual(['Zignature Kangaroo Formula']);
    // Both permitted roles group together — they behave identically at rung 1 and
    // the distinction is provenance for the vet report, not a rule an owner holds
    // in their head.
    expect(model.groups[1].rows.map((r) => r.label)).toEqual([
      'Real Meat Kangaroo Jerky',
      'Vet Dental Chew',
    ]);
    expect(model.groups[1].rows[0].fact).toBe('Added 12 July, day 12');
  });

  // Principle 5. An empty extras group is the NORMAL shape of a strict
  // elimination trial, so it may not render as a gap or as something missing.
  it('designs the empty extras group rather than leaving a hole', () => {
    const strict = buildTrialFoodsScreen('Biscuit', readySet([food()]), localNoon(2026, 7, 12))!;
    expect(strict.groups[1].rows).toEqual([]);
    expect(strict.groups[1].emptyState).toBe(TRIAL_FOODS_EMPTY_EXTRAS);
    expect(TRIAL_FOODS_EMPTY_EXTRAS).toBe(
      'Just the trial diet for now. If your vet okays an extra, add it here.',
    );
  });

  it('renders the C6 disclosure verbatim', () => {
    expect(model.disclosure).toBe(TRIAL_FOODS_DISCLOSURE);
    expect(TRIAL_FOODS_DISCLOSURE).toBe(
      'While the trial runs, Culprit records which feedings matched the trial diet ' +
        'and which didn’t, with dates. That’s the part your vet needs.',
    );
  });

  // R2, at the model layer: there is no "not loaded yet" model for a surface to
  // render as emptiness. The screen holds the three states itself.
  it('has no model at all for an unresolved or ended trial', () => {
    expect(buildTrialFoodsScreen('Biscuit', { status: 'unknown' })).toBeNull();
    expect(buildTrialFoodsScreen('Biscuit', { status: 'no_trial' })).toBeNull();
  });

  // Principle 5 — the one state that can strand an owner here (a trial ending
  // while they are standing on the screen) names the pet, says what is true, and
  // says what the screen is for. Not "No data", not a blank.
  it('designs the no-trial state rather than dead-ending it', () => {
    expect(noTrialLine('Biscuit')).toBe(
      'Biscuit isn’t on a diet trial right now. When one is running, the foods it allows show up here.',
    );
    expect(noTrialLine('your pet')).toContain('your pet isn’t');
  });

  it('omits the day line rather than counting toward a target that does not exist', () => {
    const noTarget = readySet([food()], { ...TRIAL, targetDurationDays: 0 });
    expect(buildTrialFoodsScreen('Biscuit', noTarget, localNoon(2026, 7, 12))!.subtitle).toBeNull();
  });
});

describe('the confirm sheet (FR-11)', () => {
  const sheet = buildAddTrialFoodSheet(
    'Biscuit',
    'Home-prepared plain sweet potato',
    TRIAL,
    localNoon(2026, 7, 12),
  );

  it('states exactly three facts and offers exactly two actions', () => {
    expect(sheet.title).toBe('Add to Biscuit’s trial list?');
    // EXACTLY three — the B-628 caption is framing, not a fourth fact, so it does
    // not touch this list.
    expect(sheet.rows).toEqual([
      { label: 'Food', value: 'Home-prepared plain sweet potato' },
      { label: 'Joins the list', value: 'Today, 12 July · day 12' },
      { label: 'Earlier feedings', value: 'Keep the reading they already have' },
    ]);
    expect(sheet.confirmLabel).toBe('Add to the list');
    expect(sheet.cancelLabel).toBe('Not now');
  });

  // B-628 — the sheet frames WHOSE call an extra is, from both entry points (they
  // share this model). Legitimacy, not a wisdom-check.
  it('carries the vet-framing caption', () => {
    expect(sheet.caption).toBe(ADD_TRIAL_FOOD_CAPTION);
    expect(ADD_TRIAL_FOOD_CAPTION).toBe('Extras are your vet’s call — Culprit just records the dates.');
  });

  // Principle 1 and Dr. Chen's mock note, as a greppable guard: no role question,
  // and nothing that second-guesses the vet's call — the caption included, since it
  // is the one line here that talks about the vet at all.
  it('asks nothing — not the role, not whether this is wise', () => {
    const joined = [sheet.title, sheet.caption, sheet.confirmLabel, sheet.cancelLabel, ...sheet.rows.flatMap((r) => [r.label, r.value])].join(' ');
    expect(joined).not.toMatch(/are you sure|is this|treat or|which kind|category|\brole\b|fits the trial|should you/i);
    // Exactly one question mark in the whole sheet: the title. The caption states,
    // it does not ask.
    expect(joined.match(/\?/g)).toHaveLength(1);
  });

  // THE LOAD-BEARING LINE. Unconditional on purpose: true and harmless on day 1,
  // and the whole promise on day 40, where the alternative reading is that adding
  // the food today forgives every prior feeding of it.
  it('promises no amnesty on any day of the trial', () => {
    for (const ms of [localNoon(2026, 7, 1), localNoon(2026, 7, 12), localNoon(2026, 8, 20)]) {
      const s = buildAddTrialFoodSheet('Biscuit', 'Sweet potato', TRIAL, ms);
      expect(s.rows[2]).toEqual({
        label: 'Earlier feedings',
        value: 'Keep the reading they already have',
      });
    }
  });

  it('dates the join to the local day the row will carry', () => {
    // A trial past its target still counts forward — the sheet names the day the
    // add happened, and `getDietTrialProgress` is the one thing that decides it.
    const late = buildAddTrialFoodSheet('Biscuit', 'Sweet potato', TRIAL, localNoon(2026, 8, 20));
    expect(late.rows[1].value).toBe('Today, 20 August · day 51');
  });
});

describe('the register (R1, §6.9)', () => {
  const strings = [
    ...buildTrialFoodsScreen('Biscuit', readySet([food()]), localNoon(2026, 7, 12))!.groups.flatMap(
      (g) => [g.title, g.emptyState ?? '', ...g.rows.flatMap((r) => [r.label, r.fact])],
    ),
    TRIAL_FOODS_DISCLOSURE,
    TRIAL_FOODS_EMPTY_EXTRAS,
    ...buildAddTrialFoodSheet('Biscuit', 'Sweet potato', TRIAL).rows.flatMap((r) => [
      r.label,
      r.value,
    ]),
    ADD_TRIAL_FOOD_CAPTION,
    alreadyOnListNote('Sweet potato'),
    noTrialLine('Biscuit'),
    ADD_TRIAL_FOOD_ERROR,
  ].join(' ');

  // D2 is permanent: nothing is ever marked off-diet, anywhere, and a mark's
  // absence is never a verdict either way (G2, two-sided).
  it('never marks anything off-diet and never warns', () => {
    expect(strings).not.toMatch(/off[- ]diet|not allowed|avoid|forbidden|banned|unsafe|safe\b/i);
  });

  // §6.9 is permanent too: the chips and rows here mark IDENTITY, never
  // performance. No coverage, no adherence, no score, no streak.
  it('renders no coverage, adherence, score or streak', () => {
    expect(strings).not.toMatch(/coverage|adherence|complian|streak|score|%|\bon track\b/i);
  });

  // The C6 register: about the list and the record, never about the person.
  it('says nothing about the owner', () => {
    expect(strings).not.toMatch(/you (?:fed|gave|slipped|forgot)|well done|good job|picky/i);
    expect(strings).not.toMatch(/!/);
  });
});
