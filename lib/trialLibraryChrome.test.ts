// B-616 PR 3 — the Foods-tab strip/chips and the food-detail membership row
// (spec §2.1 + §2.4; §6's PR-3 acceptance criteria).
//
// What is pinned here, in rough order of what would hurt if it broke:
//   • R1, the review bar for this PR: NOTHING OFF-LIST IS MARKED, ANYWHERE. Every
//     describing function returns null for a food that is not on the list, and the
//     sweep at the bottom asserts it over a whole library rather than one food —
//     a per-case test would pass on a function that marked the complement of a
//     smaller set;
//   • the strip never prints a claim about the record it cannot support: no trial,
//     an unhydrated read, and a list that permits nothing today all render nothing
//     rather than "0 foods on the trial list";
//   • membership is DATE-GATED and resolves through the one predicate, so a future
//     `allowed_from`, a passed `allowed_until`, and a re-photographed bag (new id,
//     same brand+product key) all behave the way `classifyFeeding` behaves;
//   • the day counter is `getDietTrialProgress`'s, asserted against that function
//     rather than against a literal (§5 edge 7).

// `lib/analytics` (where `getDietTrialProgress` lives) imports the feeding-
// arrangements module, which pulls `lib/sync` → `lib/supabase` and its fail-fast
// env check. The module under test is pure and touches neither, so stub the edge
// of the graph exactly as lib/trialFoodsScreen.test.ts does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { getDietTrialProgress } from './analytics';
import { buildTrialContext, trialFoodKey, type AllowedFood } from './dietTrial';
import type { TrialAllowedSet, TrialAllowedSetTrial } from './trialAllowedSet';
import {
  addToTrialListLabel,
  buildFoodsTrialStrip,
  trialChipLabel,
  trialMembershipLine,
  TRIAL_CHIP_PERMITTED,
  TRIAL_CHIP_PRIMARY,
} from './trialLibraryChrome';

const TRIAL: TrialAllowedSetTrial = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 28,
  endedAt: null,
};

/** Midday local, so the instant lands on that calendar day in the runner's own
 *  zone — the zone `allowed_from` day keys are written in. */
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const DAY_12 = localNoon(2026, 7, 12);

function food(over: Partial<AllowedFood> = {}): AllowedFood {
  return {
    foodItemId: 'food-dry',
    foodKey: trialFoodKey('Zignature', 'Kangaroo Formula'),
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
 *  membership back out through `allowedMembershipOn`, so a fake context would
 *  quietly test a different predicate than production runs. */
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

const TREAT = food({
  foodItemId: 'food-jerky',
  foodKey: trialFoodKey('Real Meat', 'Kangaroo Jerky'),
  label: 'Real Meat Kangaroo Jerky',
  role: 'permitted_treat',
  allowedFrom: '2026-07-12',
});

const SET = readySet([food(), TREAT]);

/** A food as the library holds it, in `TrialListFood` shape. */
const lib = (id: string, brand: string, productName: string) => ({ id, brand, productName });

const ON_LIST_DRY = lib('food-dry', 'Zignature', 'Kangaroo Formula');
const OFF_LIST = lib('food-kibble', 'Kirkland', 'Chicken & Rice');

// ════════════════════════════════════════════════════════════════════════════
// FR-2 — the chip
// ════════════════════════════════════════════════════════════════════════════

describe('the library chip (FR-2)', () => {
  it('names the trial diet on the primary_diet row', () => {
    expect(trialChipLabel(SET, ON_LIST_DRY, DAY_12)).toBe(TRIAL_CHIP_PRIMARY);
    expect(TRIAL_CHIP_PRIMARY).toBe('Trial diet');
  });

  // Both permitted roles group under one word for the same reason §2.2 groups
  // them: they behave identically at rung 1, and the distinction is provenance
  // for the vet report, not a rule an owner has to hold in their head.
  it.each(['permitted_treat', 'permitted_other', 'supplement'] as const)(
    'names %s as "Also allowed"',
    (role) => {
      const set = readySet([food({ role })]);
      expect(trialChipLabel(set, ON_LIST_DRY, DAY_12)).toBe(TRIAL_CHIP_PERMITTED);
      expect(TRIAL_CHIP_PERMITTED).toBe('Also allowed');
    },
  );

  // R1, the whole review bar. Null is not a fallback here — it is the rule.
  it('says NOTHING about a food that is not on the list', () => {
    expect(trialChipLabel(SET, OFF_LIST, DAY_12)).toBeNull();
  });

  // R2. A read that could not answer and a pet with no trial both render nothing,
  // and neither may be drawn as "no food is on a list".
  it.each([
    ['unknown', { status: 'unknown' } as TrialAllowedSet],
    ['no_trial', { status: 'no_trial' } as TrialAllowedSet],
  ])('renders no chip at all when the set is %s', (_label, set) => {
    expect(trialChipLabel(set, ON_LIST_DRY, DAY_12)).toBeNull();
  });

  // §5 edge 2 — membership is DATED. A row that has not opened yet is not a
  // membership, and the chip is a present-tense claim.
  it('does not mark a food whose membership starts tomorrow', () => {
    const set = readySet([food({ allowedFrom: '2026-07-13' })]);
    expect(trialChipLabel(set, ON_LIST_DRY, DAY_12)).toBeNull();
    expect(trialChipLabel(set, ON_LIST_DRY, localNoon(2026, 7, 13))).toBe(TRIAL_CHIP_PRIMARY);
  });

  it('stops marking a food whose membership has been closed', () => {
    const set = readySet([food({ allowedUntil: '2026-07-10' })]);
    expect(trialChipLabel(set, ON_LIST_DRY, localNoon(2026, 7, 9))).toBe(TRIAL_CHIP_PRIMARY);
    expect(trialChipLabel(set, ON_LIST_DRY, DAY_12)).toBeNull();
  });

  // §5 edge 6 / §5.4 — a re-photographed bag mints a new food_items row. The key
  // arm of the predicate is what keeps the prescribed diet marked through it; a
  // surface matching on id alone would silently un-mark the trial diet the day an
  // owner re-snapped the bag.
  it('still marks a re-photographed bag through the brand+product key', () => {
    expect(trialChipLabel(SET, lib('food-NEW-id', 'zignature', 'KANGAROO formula'), DAY_12))
      .toBe(TRIAL_CHIP_PRIMARY);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FR-1 — the strip
// ════════════════════════════════════════════════════════════════════════════

describe('the Foods-tab trial strip (FR-1)', () => {
  const opts = { petName: 'Biscuit', multiPet: false };

  it('renders the day counter and the count of foods on the list', () => {
    expect(buildFoodsTrialStrip(SET, opts, DAY_12)).toEqual({
      header: 'Diet trial — day 12 of 28',
      line: '2 foods on the trial list',
    });
  });

  it('counts one food in the singular', () => {
    expect(buildFoodsTrialStrip(readySet([food()]), opts, DAY_12)?.line)
      .toBe('1 food on the trial list');
  });

  // D7. On a single-pet account "Biscuit's diet trial" is noise — there is no
  // other trial it could be — and on a multi-pet one the strip must say whose
  // trial is marking the shared, per-account library.
  it('names the pet only on a multi-pet account', () => {
    expect(buildFoodsTrialStrip(SET, { petName: 'Biscuit', multiPet: true }, DAY_12)?.header)
      .toBe('Biscuit’s diet trial — day 12 of 28');
    expect(buildFoodsTrialStrip(SET, { petName: 'Biscuit', multiPet: false }, DAY_12)?.header)
      .toBe('Diet trial — day 12 of 28');
    // A multi-pet account whose active pet somehow has no name still gets a
    // truthful strip rather than "’s diet trial".
    expect(buildFoodsTrialStrip(SET, { petName: null, multiPet: true }, DAY_12)?.header)
      .toBe('Diet trial — day 12 of 28');
  });

  // §5 edge 7 — one day-math source. Asserted against the function itself, since
  // a local re-derivation that drifted by one would still satisfy a literal.
  it('shows the day the trial card is showing', () => {
    for (const at of [localNoon(2026, 7, 1), DAY_12, localNoon(2026, 7, 28), localNoon(2026, 8, 4)]) {
      const expected = getDietTrialProgress(
        { startedAt: TRIAL.startedAt, targetDurationDays: TRIAL.targetDurationDays },
        at,
      );
      expect(buildFoodsTrialStrip(SET, opts, at)?.header)
        .toBe(`Diet trial — day ${expected?.dayCounter} of 28`);
    }
  });

  it('drops the "of M" rather than printing a target of zero', () => {
    const set = readySet([food()], { ...TRIAL, targetDurationDays: 0 });
    expect(buildFoodsTrialStrip(set, opts, DAY_12)?.header).toBe('Diet trial — day 12');
  });

  it('drops the day clause entirely rather than fabricating a day', () => {
    const set = readySet([food()], { ...TRIAL, startedAt: 'not-a-date' });
    expect(buildFoodsTrialStrip(set, opts, DAY_12)?.header).toBe('Diet trial');
  });

  // FR-4 / §5 edge 3. `loadTrialAllowedSet` has already applied `isTrialRunning`
  // (B-422) by the time a set reaches here, so an ended — or merely stale —
  // trial arrives as `no_trial` and the strip disappears on the next render with
  // no farewell state and no stale day counter.
  it.each([
    ['unknown', { status: 'unknown' } as TrialAllowedSet],
    ['no_trial', { status: 'no_trial' } as TrialAllowedSet],
  ])('renders nothing when the set is %s', (_label, set) => {
    expect(buildFoodsTrialStrip(set, opts, DAY_12)).toBeNull();
  });

  // The one that is easy to get wrong. "0 foods on the trial list" is a CLAIM
  // ABOUT THE RECORD, not an absence of one — and it is reachable without any
  // hydration problem at all, from a live trial whose rows are all date-gated out.
  it('renders nothing rather than a count of zero', () => {
    const notYet = readySet([food({ allowedFrom: '2026-07-20' })]);
    expect(buildFoodsTrialStrip(notYet, opts, DAY_12)).toBeNull();
    const closed = readySet([food({ allowedUntil: '2026-07-05' })]);
    expect(buildFoodsTrialStrip(closed, opts, DAY_12)).toBeNull();
  });

  // The count is the LIST's size, never a coverage, adherence or match count
  // (§6.9). A duplicate row — two devices adding the same food — must not
  // inflate it, which is `trialListFoodsOn`'s identity dedupe doing its job here.
  it('counts foods, not rows', () => {
    const dupe = readySet([food(), food({ foodItemId: 'food-dry-2' })]);
    expect(buildFoodsTrialStrip(dupe, opts, DAY_12)?.line).toBe('1 food on the trial list');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FR-13 / FR-14 — food detail
// ════════════════════════════════════════════════════════════════════════════

describe('the food-detail membership row (FR-13)', () => {
  it('states membership as a dated fact', () => {
    expect(trialMembershipLine(SET, ON_LIST_DRY, 'Biscuit', DAY_12))
      .toBe('On Biscuit’s trial list · since Jul 1');
  });

  // The mid-trial add's date IS the disclosure on this surface: it is visibly not
  // the trial's start date. The full "earlier feedings keep the reading they
  // already have" sentence is stated where it changes a decision — in the confirm
  // sheet, before the write.
  it('dates a mid-trial add to the day it joined', () => {
    expect(trialMembershipLine(SET, lib('food-jerky', 'Real Meat', 'Kangaroo Jerky'), 'Biscuit', DAY_12))
      .toBe('On Biscuit’s trial list · since Jul 12');
  });

  // FR-13, verbatim: for a food not on the list the row is ABSENT. Never
  // "Not on the list" — that would be the app volunteering a verdict about a food
  // the vet never mentioned, on the screen most likely to be read as one.
  it('is absent for a food that is not on the list', () => {
    expect(trialMembershipLine(SET, OFF_LIST, 'Biscuit', DAY_12)).toBeNull();
  });

  it.each([
    ['unknown', { status: 'unknown' } as TrialAllowedSet],
    ['no_trial', { status: 'no_trial' } as TrialAllowedSet],
  ])('is absent when the set is %s', (_label, set) => {
    expect(trialMembershipLine(set, ON_LIST_DRY, 'Biscuit', DAY_12)).toBeNull();
  });

  // R2 is not a slogan here — it is why this behaves correctly without this
  // module knowing anything. `membershipOn` drops a row with an unparseable
  // `allowed_from` from the permit set (a corrupt value must never silently
  // permit a food forever), so the chip, the strip's count and this line all
  // inherit the same fail-closed answer. A surface that re-derived membership
  // would have had to remember to do that, and would have got a free pass from
  // every test that only checked well-formed dates.
  it('marks nothing when the membership date is unreadable', () => {
    const set = readySet([food({ allowedFrom: 'not-a-date' })]);
    expect(trialMembershipLine(set, ON_LIST_DRY, 'Biscuit', DAY_12)).toBeNull();
    expect(trialChipLabel(set, ON_LIST_DRY, DAY_12)).toBeNull();
    expect(buildFoodsTrialStrip(set, { petName: 'Biscuit', multiPet: false }, DAY_12)).toBeNull();
  });

  it('labels the add action with the pet whose list it is (FR-14)', () => {
    expect(addToTrialListLabel('Biscuit')).toBe('Add to Biscuit’s trial list');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// R1 — the sweep
// ════════════════════════════════════════════════════════════════════════════

describe('R1 — nothing off-list is marked, anywhere', () => {
  // A whole library, not one food. The failure this catches is a function that
  // marks the COMPLEMENT of the allowed set — which a single off-list assertion
  // would also catch, but which a `{ onList: boolean }` return shape would invite
  // a caller to render for every one of these rows.
  const PANTRY = [
    lib('food-kibble', 'Kirkland', 'Chicken & Rice'),
    lib('food-biscuit', 'Milk-Bone', 'Original biscuits'),
    lib('food-zuke', 'Zuke’s', 'Mini Naturals, peanut butter'),
    lib('food-scrap', '', ''),
    lib('food-nameless', 'Home-prepared', ''),
  ];

  it.each(PANTRY.map((f) => [f.brand || '(unnamed)', f] as const))(
    'says nothing about %s',
    (_name, f) => {
      expect(trialChipLabel(SET, f, DAY_12)).toBeNull();
      expect(trialMembershipLine(SET, f, 'Biscuit', DAY_12)).toBeNull();
    },
  );

  // The strings this module can produce are a closed set, and none of them is a
  // negative. A future edit that added "Not on the trial list" would have to
  // change this list to pass, which is the point.
  it('exposes no negative-marking copy at all', () => {
    const everyString = [
      TRIAL_CHIP_PRIMARY,
      TRIAL_CHIP_PERMITTED,
      buildFoodsTrialStrip(SET, { petName: 'Biscuit', multiPet: true }, DAY_12)?.header ?? '',
      buildFoodsTrialStrip(SET, { petName: 'Biscuit', multiPet: true }, DAY_12)?.line ?? '',
      trialMembershipLine(SET, ON_LIST_DRY, 'Biscuit', DAY_12) ?? '',
      addToTrialListLabel('Biscuit'),
    ].join(' | ');

    for (const banned of [
      'not on', 'off-diet', 'off diet', 'off the list', 'avoid', 'unsafe', 'safe',
      'allowed?', 'warning', 'careful', 'picky', '!',
    ]) {
      expect(everyString.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    // §6.9 — the trial's own chrome carries no performance measure anywhere.
    for (const banned of ['coverage', 'adherence', 'streak', 'score', '%']) {
      expect(everyString.toLowerCase()).not.toContain(banned);
    }
  });
});
