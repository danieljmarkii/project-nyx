// B-417 PR 5 — the acceptance suite for the ONE off-diet predicate.
//
// §12's QA finding on v0.9's criteria was that "not one of the seven named a
// harness or an oracle", so every criterion below is a literal assertion against
// `lib/dietTrial.ts`'s returned model — the oracle the spec asks for. Each `it`
// title names the §12 PR-5 criterion or the §5 rule it enforces.
//
// The fixture world is deliberately concrete: Rex, a dog, on a 56-day duck
// elimination trial started 1 July 2026, with a wet and a dry of the same diet
// (the multi-food case that broke B-351 slice 4) and one vet-permitted treat.
import {
  CHALLENGE_WINDOW_DAYS,
  COVERAGE_FLOOR,
  MIN_INTERPRETABLE_DAYS,
  buildTrialContext,
  classifyDose,
  classifyFeeding,
  computeTrialFacts,
  contaminationNote,
  feedingWasFinished,
  explainVerdict,
  interpretabilityStatement,
  isWithinChallengeWindow,
  mayClaimAllMatched,
  mayStateRecordClean,
  oralRouteCopy,
  sanctionedProteinsOn,
  trialContamination,
  trialViabilityHeadline,
  trialViabilityNote,
  type AllowedFood,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';
import { localDayIndexOf } from './utils';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TRIAL: TrialSpec = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 56,
  species: 'dog',
};

/** Local noon on a given local day — never midnight, so a test never depends on
 *  the runner's zone straddling a boundary. */
function at(day: string, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function food(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
  return {
    foodKey: null,
    label: 'Food',
    role: 'primary_diet',
    allowedFrom: '2026-07-01',
    allowedUntil: null,
    primaryProtein: null,
    proteins: [],
    ...over,
  };
}

const DRY_DUCK = food({
  foodItemId: 'dry-duck',
  foodKey: 'royal caninduck dry',
  label: 'Royal Canin Duck Dry',
  primaryProtein: 'duck',
  proteins: ['duck'],
});

const WET_DUCK = food({
  foodItemId: 'wet-duck',
  foodKey: 'royal caninduck wet',
  label: 'Royal Canin Duck Wet',
  primaryProtein: 'duck',
  proteins: ['duck'],
});

/** The vet-approved extra. Its own primary is rabbit; it also lists chicken fat
 *  — D-A's worked example. */
const RABBIT_JERKY = food({
  foodItemId: 'rabbit-jerky',
  foodKey: 'barkworthiesrabbit jerky',
  label: 'Barkworthies Rabbit Jerky',
  role: 'permitted_treat',
  primaryProtein: 'rabbit',
  proteins: ['rabbit', 'chicken'],
});

const ALLOWED = [DRY_DUCK, WET_DUCK, RABBIT_JERKY];

function feeding(over: Partial<TrialFeeding> & Pick<TrialFeeding, 'eventId'>): TrialFeeding {
  return {
    occurredAt: at('2026-07-10'),
    foodItemId: null,
    foodKey: null,
    label: null,
    foodType: 'meal',
    proteins: [],
    ...over,
  };
}

const ctx = () => buildTrialContext(TRIAL, ALLOWED);

// ── Rung 1 — the allowed set is the only permit path ─────────────────────────

describe('§5.3 rung 1 — the explicit allowed set', () => {
  // §12: "a permitted treat classifies `permitted` on EVERY feeding (the
  // alarm-fatigue test)". C2's reasoning applies to any food fed daily, not only
  // the trial diet: a per-feeding verdict on a food the owner was TOLD to give
  // fires 100+ times and trains them to ignore the flag that matters on day 22.
  it('a permitted treat classifies permitted on every one of 168 feedings', () => {
    const verdicts = new Set<string>();
    for (let day = 1; day <= 56; day += 1) {
      for (let n = 0; n < 3; n += 1) {
        const c = classifyFeeding(
          ctx(),
          feeding({
            eventId: `t-${day}-${n}`,
            occurredAt: at(`2026-07-${String(day).padStart(2, '0')}`.replace('07-57', '08-26'), 8 + n),
            foodItemId: RABBIT_JERKY.foodItemId,
            foodKey: RABBIT_JERKY.foodKey,
            foodType: 'treat',
            proteins: ['rabbit', 'chicken'],
          }),
        );
        verdicts.add(`${c.verdict}:${c.rung}`);
      }
    }
    expect([...verdicts]).toEqual(['permitted:allowed_set']);
  });

  // §5.4 — identity is the case-folded brand+product, NOT the UUID. Re-
  // photographing the bag mints a new row; matching on the id would flag every
  // remaining meal of the PRESCRIBED diet on a 100%-compliant owner.
  it('a re-captured duplicate of the trial food does not flag', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({
        eventId: 'm1',
        foodItemId: 'dry-duck-RECAPTURED',
        foodKey: DRY_DUCK.foodKey,
        proteins: ['duck'],
      }),
    );
    expect(c.verdict).toBe('permitted');
    expect(c.matchedBy).toBe('food_key');
  });

  // The un-hydrated-library case: the food row has not arrived, so the join
  // yields a null key while `meals.food_item_id` is still there. Without the id
  // arm this classifies the trial diet itself as an exposure.
  it('matches on the id when the food row has not hydrated (null key)', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({ eventId: 'm2', foodItemId: DRY_DUCK.foodItemId, foodKey: null, foodType: null }),
    );
    expect(c.verdict).toBe('permitted');
    expect(c.matchedBy).toBe('food_id');
  });

  // A blank brand+product key is the bare separator. Two blank-named rows must
  // not collide into a permit — that is the dangerous direction.
  it('an empty brand+product key never matches the allowed set', () => {
    const blankAllowed = [food({ foodItemId: 'blank', foodKey: '', proteins: ['duck'] })];
    const c = classifyFeeding(
      buildTrialContext(TRIAL, blankAllowed),
      feeding({ eventId: 'm3', foodItemId: 'other', foodKey: '' }),
    );
    expect(c.verdict).not.toBe('permitted');
  });

  // §3.2 — membership is DATED. Adding the contraband on day 13 must not
  // retroactively re-score twelve prior exposures as permitted.
  it('membership is dated — a food added on day 13 does not permit day 5', () => {
    const late = food({
      foodItemId: 'late',
      foodKey: 'brandlate',
      role: 'permitted_other',
      allowedFrom: '2026-07-13',
    });
    const c = buildTrialContext(TRIAL, [...ALLOWED, late]);
    const day5 = classifyFeeding(c, feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: 'late', foodKey: late.foodKey }));
    const day13 = classifyFeeding(c, feeding({ eventId: 'b', occurredAt: at('2026-07-13'), foodItemId: 'late', foodKey: late.foodKey }));
    expect(day5.verdict).toBe('off_diet_unrecognised');
    expect(day13.verdict).toBe('permitted');
  });

  it('a removed food stops being permitted after allowed_until', () => {
    const ended = { ...RABBIT_JERKY, allowedUntil: '2026-07-10' };
    const c = buildTrialContext(TRIAL, [DRY_DUCK, ended]);
    const inside = classifyFeeding(c, feeding({ eventId: 'a', occurredAt: at('2026-07-10'), foodItemId: ended.foodItemId, foodKey: ended.foodKey, proteins: ['rabbit', 'chicken'] }));
    const after = classifyFeeding(c, feeding({ eventId: 'b', occurredAt: at('2026-07-11'), foodItemId: ended.foodItemId, foodKey: ended.foodKey, proteins: ['rabbit', 'chicken'] }));
    expect(inside.verdict).toBe('permitted');
    expect(after.verdict).toBe('off_diet_protein');
  });
});

// ── Rung 2 — the derived protein arm ─────────────────────────────────────────

describe('§5.3 rung 2 — full-array protein comparison', () => {
  // §12: "a food whose array contains an unsanctioned protein flags at rung 2
  // EVEN WHEN `proteins[0]` IS SANCTIONED" — the duck formula that also lists
  // chicken by-product meal. This is the exact case migration 039 was written
  // for, and the reason the comparison is over arrays and not primaries.
  it('the duck-that-lists-chicken flags even though proteins[0] is duck', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({
        eventId: 'm',
        foodItemId: 'other-duck',
        foodKey: 'valuebrandduck formula',
        proteins: ['duck', 'chicken by-product meal'],
      }),
    );
    expect(c.verdict).toBe('off_diet_protein');
    expect(c.rung).toBe('derived_protein');
    expect(c.antigens).toEqual(['chicken']);
  });

  // §5.3: a hydrolyzed or novel-protein trial is precisely where a different
  // brand of the "same" protein is still an exposure — the food fails rung 1
  // regardless, and rung 2 supplies the ANTIGEN a dermatologist reads.
  it('a different-brand same-protein food flags on a novel-protein trial', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({
        eventId: 'm',
        foodItemId: 'other-brand',
        foodKey: 'aldiduck dinner',
        proteins: ['duck'],
      }),
    );
    // Rung 1 rejects it (not on the list); rung 2 has nothing to add, because
    // duck IS sanctioned — a dark rung 2 costs attribution, not detection.
    expect(c.verdict).toBe('off_diet_unrecognised');
    expect(c.offDiet).toBe(true);
  });

  // §12: "`sanctionedProteins` is NOT widened by a permitted extra." Otherwise
  // the allowed list becomes a self-granted loophole.
  it('a permitted extra does not widen the sanctioned set', () => {
    const sanctioned = sanctionedProteinsOn(ctx(), localDayIndexOf('2026-07-10') as number);
    expect([...sanctioned].sort()).toEqual(['duck']);
    // …and the proof it matters: a DIFFERENT chicken food still flags at rung 2
    // even though a permitted treat also lists chicken.
    const c = classifyFeeding(
      ctx(),
      feeding({ eventId: 'm', foodItemId: 'x', foodKey: 'bchicken chew', proteins: ['chicken'] }),
    );
    expect(c.antigens).toEqual(['chicken']);
  });

  it('an empty protein array is silence, never an all-clear — it falls to rung 3', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({ eventId: 'm', foodItemId: 'x', foodKey: 'bmystery', proteins: [] }),
    );
    expect(c.verdict).toBe('off_diet_unrecognised');
    expect(c.offDiet).toBe(true);
    expect(c.antigens).toEqual([]);
  });
});

// ── Rung 3 — the modal case ──────────────────────────────────────────────────

describe('§5.3 rung 3 — not recognised as trial food', () => {
  // §12: "a food with no protein data flags `off_diet_unrecognised` with HEDGED
  // copy." Rung 3 is the modal case on a real library, so it gets a designed
  // first-class treatment rather than a fallback.
  it('the reason names the rung and asserts nothing about the food', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({ eventId: 'm', foodItemId: 'x', foodKey: 'bbiscuit', proteins: [] }),
    );
    const reason = explainVerdict(c, 'Generic Biscuit');
    expect(reason?.title).toBe('Not recognised as trial food');
    // Hedged: it states what Culprit does NOT know, and makes no claim that the
    // food is a contaminant.
    expect(reason?.body).toMatch(/hasn’t read its ingredients/);
    expect(reason?.body).not.toMatch(/contaminant|broke|ruined|violat/i);
  });

  it('every off-diet verdict is tappable to a reason naming its rung', () => {
    const rungs = ['derived_protein', 'unrecognised', 'no_identity'] as const;
    for (const rung of rungs) {
      const c = { rung, antigens: ['chicken'], role: null } as never;
      expect(explainVerdict(c, 'A food')).not.toBeNull();
    }
  });
});

// ── D-B — the antigen rides a permitted feeding ──────────────────────────────

describe('§5.5 D-B — record the antigen, keep the verdict', () => {
  // §12: "a permitted food carrying an unsanctioned protein classifies
  // `permitted` AND emits an antigen exposure."
  it('the vet-approved rabbit jerky stays permitted and still records chicken', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({
        eventId: 'm',
        foodItemId: RABBIT_JERKY.foodItemId,
        foodKey: RABBIT_JERKY.foodKey,
        foodType: 'treat',
        proteins: ['rabbit', 'chicken'],
      }),
    );
    expect(c.verdict).toBe('permitted');
    expect(c.offDiet).toBe(false);
    expect(c.antigens).toEqual(['rabbit', 'chicken']);
  });

  // Without this the six-dental-chews-a-day case reads as a clean elimination to
  // both owner and vet — a STRONGER false negative than the mislabel it replaces.
  it('the tally separates antigen exposure from compliance', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: 6 }, (_, i) =>
        feeding({
          eventId: `c-${i}`,
          occurredAt: at('2026-07-10', 6 + i),
          foodItemId: RABBIT_JERKY.foodItemId,
          foodKey: RABBIT_JERKY.foodKey,
          foodType: 'treat',
          proteins: ['rabbit', 'chicken'],
        }),
      ),
      nowMs: new Date(2026, 6, 20, 12).getTime(),
    });
    expect(facts.exposures.offDiet).toBe(0);
    const chicken = facts.exposures.antigenTally.find((a) => a.protein === 'chicken');
    expect(chicken).toEqual({ protein: 'chicken', feedings: 6, fromPermitted: 6 });
  });

  // C2 by construction: the trial diet's own proteins are IN the sanctioned set,
  // so a `primary_diet` feeding can never emit a per-feeding antigen verdict.
  it('the trial diet itself never emits a per-feeding antigen', () => {
    const c = classifyFeeding(
      ctx(),
      feeding({ eventId: 'm', foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, proteins: ['duck'] }),
    );
    expect(c.antigens).toEqual([]);
  });
});

// ── D-A — the standing contamination fact ────────────────────────────────────

describe('§5.5 D-A — the standing fact covers permitted extras', () => {
  // §12: "the contamination standing fact is computed over permitted extras as
  // well as `primary_diet` rows."
  it('flags the vet-approved jerky that also lists chicken', () => {
    const facts = trialContamination(ctx());
    expect(facts).toHaveLength(1);
    expect(facts[0].food.foodItemId).toBe('rabbit-jerky');
    expect(facts[0].extraProteins).toEqual(['chicken']);
  });

  it('flags a contaminated PRIMARY diet against its own designated protein', () => {
    const dirty = { ...DRY_DUCK, proteins: ['duck', 'chicken'] };
    const facts = trialContamination(buildTrialContext(TRIAL, [dirty]));
    expect(facts[0].extraProteins).toEqual(['chicken']);
  });

  // The trap the module header names: comparing against `sanctionedProteins`
  // would be vacuous, because a duck food listing chicken puts chicken INTO the
  // union and could never flag itself.
  it('is not vacuous — the sanctioned set would have swallowed the finding', () => {
    const dirty = { ...DRY_DUCK, proteins: ['duck', 'chicken'] };
    const c = buildTrialContext(TRIAL, [dirty]);
    expect([...sanctionedProteinsOn(c, localDayIndexOf('2026-07-10') as number)].sort())
      .toEqual(['chicken', 'duck']);
    expect(trialContamination(c)).toHaveLength(1);
  });

  it('a food with no designated primary is skipped, never "everything is extra"', () => {
    const unknown = food({ foodItemId: 'u', primaryProtein: null, proteins: ['duck', 'chicken'] });
    expect(trialContamination(buildTrialContext(TRIAL, [unknown]))).toEqual([]);
  });

  it('the note is disclosure, not accusation', () => {
    const note = contaminationNote(trialContamination(ctx()), 'Rex');
    expect(note?.body).toMatch(/Worth raising with your vet/);
    expect(note?.body).not.toMatch(/you (?:fed|gave|should)/i);
  });
});

// ── Rung 4 — the oral route (C3) ─────────────────────────────────────────────

describe('§5.3 rung 4 — the oral route', () => {
  // §12: "a chewable preventive given mid-trial appears in the exposure list, and
  // its copy NEVER implies the dose should have been skipped."
  it('a chewable preventive is an exposure', () => {
    const hit = classifyDose(ctx(), {
      eventId: 'd1',
      occurredAt: at('2026-07-15'),
      drugLabel: 'NexGard',
      form: 'chewable',
      pairedEventId: null,
      adherence: 'given',
    });
    expect(hit?.trigger).toBe('chewable');
  });

  it('a dose given inside a food vehicle is an exposure (B-156 pairing)', () => {
    const hit = classifyDose(ctx(), {
      eventId: 'd2',
      occurredAt: at('2026-07-15'),
      drugLabel: 'Apoquel',
      form: 'tablet',
      pairedEventId: 'meal-9',
      adherence: 'given',
      vehicleFoodItemId: 'peanut-butter',
      vehicleFoodKey: 'genericpeanut butter',
    });
    expect(hit?.trigger).toBe('food_vehicle');
  });

  it('a plain tablet with no vehicle is not an exposure (B-419 stays out)', () => {
    expect(
      classifyDose(ctx(), {
        eventId: 'd3',
        occurredAt: at('2026-07-15'),
        drugLabel: 'Metronidazole',
        form: 'tablet',
        pairedEventId: null,
        adherence: 'given',
      }),
    ).toBeNull();
  });

  // §6.8 — a missed critical dose is a worse outcome than a contaminated trial.
  it('the copy never implies the dose should have been skipped', () => {
    const copy = oralRouteCopy({
      eventId: 'd1',
      occurredAt: at('2026-07-15'),
      drugLabel: 'NexGard',
      trigger: 'chewable',
    });
    expect(copy.body).toMatch(/Keep giving it exactly as prescribed/);
    expect(copy.body).not.toMatch(/skip|stop giving|don’t give|do not give|hold the dose/i);
    // It points at the vet FOR A SUBSTITUTION, not at the next dose.
    expect(copy.body).toMatch(/unflavoured version/);
  });

  it('doses never enter the feeding ratio', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [],
      doses: [
        { eventId: 'd1', occurredAt: at('2026-07-15'), drugLabel: 'NexGard', form: 'chewable', pairedEventId: null, adherence: 'given' },
      ],
      nowMs: new Date(2026, 6, 20, 12).getTime(),
    });
    expect(facts.oralRoute).toHaveLength(1);
    expect(facts.exposures.totalFeedings).toBe(0);
    expect(facts.exposures.offDiet).toBe(0);
  });
});

// ── §5.1 — the two metrics ───────────────────────────────────────────────────

describe('§5.1 — coverage and exposures are independent facts', () => {
  const nowMs = new Date(2026, 6, 30, 12).getTime(); // 30 July → day 30

  it('coverage excludes treats from the numerator; exposures include them', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        // Day 2: a treat only. Excluded from coverage, included in exposures.
        feeding({ eventId: 'a', occurredAt: at('2026-07-02'), foodType: 'treat', foodItemId: RABBIT_JERKY.foodItemId, foodKey: RABBIT_JERKY.foodKey, proteins: ['rabbit', 'chicken'] }),
        // Day 3: a meal.
        feeding({ eventId: 'b', occurredAt: at('2026-07-03'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, proteins: ['duck'] }),
      ],
      nowMs,
    });
    // §10 S3: the range opens at the first NON-TREAT log (3 July) — a treat may
    // not clear the denominator any more than it may clear the numerator — so the
    // two untracked days before it are named rather than scored.
    expect(facts.coverage).toMatchObject({ daysLogged: 1, daysElapsed: 28 });
    expect(facts.untrackedDaysBeforeFirstLog).toBe(2);
    // …and the clip moved the COVERAGE denominator only. The day-2 treat is still
    // a logged in-window feeding and still counted: §5.2 rules the exposure count
    // a floor, and a floor may not quietly shed real records.
    expect(facts.exposures.totalFeedings).toBe(2);
  });

  // §5.1: "one overlap range". v0.9's window-scoped numerator over a
  // trial-scoped denominator rendered "27 / 56" on a well-logged trial.
  it('both sides of the ratio use ONE overlap range', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: 5 }, (_, i) =>
        feeding({ eventId: `m${i}`, occurredAt: at(`2026-07-2${i}`), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey }),
      ),
      nowMs,
      scopeStart: '2026-07-20',
    });
    expect(facts.range).toMatchObject({ daysElapsed: 11, clipped: true });
    expect(facts.coverage?.daysLogged).toBe(5);
  });

  // A feeding naming no food is excluded from BOTH sides and disclosed. Counting
  // it as an exposure accuses the owner on a record-keeping gap (§6.9); counting
  // it as "matched" is the reassurance G2 deletes.
  it('an unidentifiable feeding is excluded from both sides and disclosed', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'x', occurredAt: at('2026-07-05'), foodItemId: null, foodKey: null })],
      nowMs,
    });
    expect(facts.exposures.totalFeedings).toBe(0);
    expect(facts.exposures.offDiet).toBe(0);
    expect(facts.exposures.unclassifiable).toBe(1);
  });

  it('the transition window is excluded by construction', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, transitionStartedAt: '2026-06-24' },
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 'pre', occurredAt: at('2026-06-26'), foodItemId: 'old-kibble', foodKey: 'xold' }),
      ],
      nowMs,
    });
    expect(facts.exposures.totalFeedings).toBe(0);
  });

  it('a feeding after ended_at is out of window', () => {
    const c = buildTrialContext({ ...TRIAL, endedAt: '2026-07-15' }, ALLOWED);
    const after = classifyFeeding(c, feeding({ eventId: 'a', occurredAt: at('2026-07-16'), foodItemId: 'x', foodKey: 'bx' }));
    expect(after.verdict).toBe('out_of_window');
    expect(after.offDiet).toBe(false);
    expect(after.countsAsFeeding).toBe(false);
  });
});

// ── §5.2 / §7.2 — the floor and the interpretability statement ───────────────

describe('§5.2 — the floor gates the interpretability statement only', () => {
  function factsWithCoverage(daysLogged: number, daysElapsed: number) {
    const start = new Date(2026, 6, 1);
    const nowMs = new Date(2026, 6, daysElapsed, 12).getTime();
    return computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: daysLogged }, (_, i) =>
        feeding({
          eventId: `m${i}`,
          occurredAt: new Date(start.getFullYear(), start.getMonth(), 1 + i, 12).toISOString(),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
        }),
      ),
      nowMs,
    });
  }

  it('is two-sided below the minimum — no claim AND no alarm', () => {
    const facts = factsWithCoverage(1, MIN_INTERPRETABLE_DAYS - 1);
    expect(facts.interpretability).toBe('not_yet');
    expect(facts.belowCoverageFloor).toBe(false);
    expect(interpretabilityStatement(facts)).toBeNull();
  });

  it('reads does_not_support below the floor', () => {
    const facts = factsWithCoverage(3, 20);
    expect(facts.coverage!.fraction).toBeLessThan(COVERAGE_FLOOR);
    expect(facts.interpretability).toBe('does_not_support');
    expect(facts.belowCoverageFloor).toBe(true);
  });

  it('reads supports at high coverage', () => {
    const facts = factsWithCoverage(19, 20);
    expect(facts.interpretability).toBe('supports');
    expect(facts.belowCoverageFloor).toBe(false);
  });

  // §7.2 — strictly a statement about the RECORD. Never about the pet (§6.1),
  // never about the owner (§6.9).
  it('every statement variant is about the record, not the pet or the owner', () => {
    for (const [logged, elapsed] of [[19, 20], [12, 20], [3, 20]]) {
      const s = interpretabilityStatement(factsWithCoverage(logged, elapsed));
      expect(s).toMatch(/This record/);
      expect(s).not.toMatch(/\byou\b|\byour\b/i);
      expect(s).not.toMatch(/%|\b(?:grade|score|streak)\b/i);
      // Both denominators, never a bare number (§12: "an exposure figure never
      // renders without both denominators").
      expect(s).toMatch(/\d+ of \d+ days/);
    }
  });

  it('the exposure count is a floor — the model never claims it is a total', () => {
    const facts = factsWithCoverage(19, 20);
    // The only "total" on the model is the feeding DENOMINATOR, and the off-diet
    // count is separately named. Nothing here asserts completeness.
    expect(Object.keys(facts.exposures)).toContain('totalFeedings');
    expect(facts.exposures.offDiet).toBeLessThanOrEqual(facts.exposures.totalFeedings);
  });
});

// ── §5.2 proof #1 — the all-refused trial ────────────────────────────────────

describe('§5.2 — a 14-day all-refused trial renders no clean-trial statement', () => {
  // The §5.2 proof the requirements review was built on: a cat that refuses the
  // hydrolyzed diet every day, whose owner dutifully puts the bowl down and logs
  // it, scores 100% COVERAGE and 0 EXPOSURES — a maximally clean trial rendered
  // over a starving animal, seven times past the feline 48h hepatic-lipidosis
  // window. Coverage does not read `intakeRating` and MUST NOT: the composition
  // is structural on the card (an intake-decline flag REPLACES the adherence
  // line). What this module owes is that nothing IT returns is a clean-trial
  // claim in the first place.
  const facts = computeTrialFacts({
    trial: { ...TRIAL, species: 'cat', startedAt: '2026-07-01' },
    allowedFoods: ALLOWED,
    feedings: Array.from({ length: 14 }, (_, i) =>
      feeding({
        eventId: `r${i}`,
        occurredAt: at(`2026-07-${String(i + 1).padStart(2, '0')}`),
        foodItemId: DRY_DUCK.foodItemId,
        foodKey: DRY_DUCK.foodKey,
      }),
    ),
    nowMs: new Date(2026, 6, 14, 12).getTime(),
  });

  it('produces facts, and not one of them is a verdict on the trial', () => {
    expect(facts.coverage).toMatchObject({ daysLogged: 14, daysElapsed: 14 });
    expect(facts.exposures.offDiet).toBe(0);
    // There is no field on this model that says the trial went well, is clean,
    // is on track, or is passing. The only judgement it carries is about the
    // RECORD.
    expect(Object.keys(facts)).not.toContain('clean');
    expect(interpretabilityStatement(facts)).toMatch(/This record covers 14 of 14 days/);
  });

  it('no string this module can emit describes an absence in the world', () => {
    const strings = [
      interpretabilityStatement(facts) ?? '',
      contaminationNote(facts.contamination, 'Mochi')?.body ?? '',
      explainVerdict(classifyFeeding(buildTrialContext(TRIAL, ALLOWED), feeding({ eventId: 'a', foodItemId: 'z', foodKey: 'bz' })), 'A food')?.body ?? '',
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/no off-diet|nothing off-diet|\b0 off-diet/i);
      expect(s).not.toMatch(/no (?:contaminants|exposures|slips)/i);
      expect(s).not.toMatch(/clean (?:trial|elimination)|all clear|nothing else/i);
    }
  });
});

// ── §5.6 — free-fed and multi-pet ────────────────────────────────────────────

describe('§5.6 — free-fed arrangements', () => {
  const nowMs = new Date(2026, 6, 20, 12).getTime();

  it('an off-list free-choice bowl is a standing exposure', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [],
      arrangements: [
        { foodItemId: 'grocery-dry', foodKey: 'aldichicken dry', label: 'Aldi Chicken Dry', startedAt: '2026-06-01' },
      ],
      nowMs,
    });
    expect(facts.arrangementExposures).toHaveLength(1);
    expect(facts.intakeNotDirectlyObserved).toBe(true);
  });

  it('a free-choice bowl OF THE TRIAL DIET is not an exposure', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [],
      arrangements: [
        { foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, label: DRY_DUCK.label, startedAt: '2026-06-01' },
      ],
      nowMs,
    });
    expect(facts.arrangementExposures).toEqual([]);
    // The RATIO is still replaced — a free-fed bowl emits no meal events, so the
    // denominator has no meaning either way (§5.6, `lib/analytics` invariant #6).
    expect(facts.intakeNotDirectlyObserved).toBe(true);
  });
});

// ── §5.5's named counterexample ──────────────────────────────────────────────

describe('§5.5 — exposure↔symptom juxtaposition is forward-only', () => {
  // "…must use a 1–14 day FORWARD window, species-dependent, NEVER same-day and
  // NEVER a nearest-preceding-meal join — this repo shipped that exact
  // attribution bug once under three ceremonial sign-offs."
  it('never pairs a symptom with a same-day exposure', () => {
    expect(isWithinChallengeWindow(100, 100, 'dog')).toBe(false);
  });

  it('never pairs backwards (the nearest-preceding-meal shape)', () => {
    expect(isWithinChallengeWindow(100, 99, 'dog')).toBe(false);
    expect(isWithinChallengeWindow(100, 86, 'dog')).toBe(false);
  });

  it('pairs forward within the species window and not beyond it', () => {
    expect(isWithinChallengeWindow(100, 101, 'dog')).toBe(true);
    expect(isWithinChallengeWindow(100, 114, 'dog')).toBe(true);
    expect(isWithinChallengeWindow(100, 115, 'dog')).toBe(false);
    // Cat TTF90 is 7 days, not 14 (Olivry & Mueller).
    expect(isWithinChallengeWindow(100, 107, 'cat')).toBe(true);
    expect(isWithinChallengeWindow(100, 108, 'cat')).toBe(false);
  });

  it('an unknown species takes the WIDER window — missing a flare is the worse error', () => {
    expect(CHALLENGE_WINDOW_DAYS.other).toBe(CHALLENGE_WINDOW_DAYS.dog);
  });
});

// ── The adversarial pass's breaks, each pinned by the input that produced it ──
//
// The `adversarial-reviewer` returned FAIL on the first cut with eight breaks,
// and its structural finding was that almost every one was at the WIRING
// boundary: this module computes five disclosure channels and only `offDiet`
// reached a surface, so everything it got right about "a floor, never a total"
// was discarded one call later. The module-side halves are pinned here; the
// wiring halves are in `dietTrialFacts.test.ts`.

describe('adversarial regressions — the module half', () => {
  const nowMs = new Date(2026, 6, 15, 12).getTime();

  // BREAK 1 — §5.2 proof #1 run end-to-end. `detectIntakeDecline` is a RELATIVE
  // decline detector: a diet refused from day 1 is uniformly low, not declining,
  // and has no prior mean for that food — so it returns `{status:'none'}` and the
  // card's structural replacement never fires. The clean two-fact sentence then
  // renders over a cat seven times past the 48h hepatic-lipidosis window.
  it('a refused trial diet is a computed fact, not a silence', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: 28 }, (_, i) =>
        feeding({
          eventId: `r${i}`,
          occurredAt: at(`2026-07-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`, 8 + (i % 2) * 10),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
          intakeRating: 'refused',
        }),
      ),
      nowMs: new Date(2026, 6, 14, 22).getTime(),
    });
    expect(facts.trialDietRefusal).toEqual({ refusedFeedings: 28, ratedFeedings: 28, days: 14 , population: 'trial_diet' as const });
    // …and the affirmative sentence becomes unsayable, which is the whole job.
    expect(mayClaimAllMatched(facts)).toBe(false);
    // Coverage is UNCHANGED — the owner kept a perfect record and is not scored
    // for the pet's illness.
    expect(facts.coverage).toMatchObject({ daysLogged: 14, daysElapsed: 14 });
  });

  it('the viability line names the record, with its own denominator', () => {
    const line = trialViabilityHeadline({ refusedFeedings: 28, ratedFeedings: 40, days: 14 , population: 'trial_diet' as const });
    expect(line).toMatch(/were left unfinished/);
    // Never asserts a refusal over a `some`/`picked` record.
    expect(line).not.toMatch(/logged as refused/);
    expect(line).not.toMatch(/pick|fussy|prefer|doesn’t like|taste/i);
    // R1a — the evidence base is ON the claim. "28 feedings were left unfinished"
    // reads identically whether the owner rated 40 feedings or 400.
    expect(line).toContain('28 feedings of the 40 trial-diet feedings you’ve rated');
    // `days` is DISTINCT DAYS, not a span, so the phrasing may not imply a window.
    expect(line).toContain('across 14 days');
    expect(line).not.toMatch(/over the last/);
  });

  it('the viability note escalates on the record, and never on intake it cannot see', () => {
    const cat = trialViabilityNote('Mochi', 'cat');
    const dog = trialViabilityNote('Rex', 'dog');
    expect(cat).toMatch(/your vet|a call/);
    // THE FELINE CLOCK IS NAMED, AND IT SAYS "TODAY". This lane is the only
    // watcher on the 48h hepatic-lipidosis window for a diet refused from day 1 —
    // `detectIntakeDecline` is structurally blind to that patient — so the sooner
    // word is the safe error direction, and it matches what the sibling clinical
    // lane says over the same animal. An earlier draft said "soon", which was the
    // quieter word on the more urgent case.
    expect(cat).toContain('today');
    expect(dog).not.toContain('today');
    expect(dog).not.toMatch(/\bsoon\b/);
    // No volitional frame anywhere: "won't eat" locates the cause in the animal's
    // choice, one step from the preference framing this lane's first rule forbids.
    for (const line of [cat, dog]) expect(line).not.toMatch(/won’t eat|refuses to/i);
    // THE OVER-CLAIM THE MOCK CARRIED. The record here is the TRIAL DIET going
    // unfinished — a cat that refuses the hydrolysate and clears a bowl of
    // chicken every night produces exactly this fact, so "a cat eating this
    // little" asserts something no logged row supports.
    for (const line of [cat, dog]) {
      expect(line).not.toMatch(/eating this little|barely eating|hardly eating/i);
      expect(line).not.toMatch(/pick|fussy|prefer|taste/i);
      // Says WHAT it withheld, not just that it went quiet. "the trial numbers"
      // was an absolute claim rendered one line above a trial number, once this
      // state stopped deleting the off-diet count.
      expect(line).toContain('isn’t reading these days as a clean run');
    }
  });

  it('does not fire on one bad dinner', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 'a', occurredAt: at('2026-07-05', 8), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        feeding({ eventId: 'b', occurredAt: at('2026-07-05', 18), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'all' }),
        feeding({ eventId: 'c', occurredAt: at('2026-07-06', 8), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'all' }),
      ],
      nowMs,
    });
    expect(facts.trialDietRefusal).toBeNull();
    expect(mayClaimAllMatched(facts)).toBe(true);
  });

  // BREAK 2 — the free-choice bowl of an off-list food is a standing exposure
  // that emits no meal events. It was computed and then discarded, and the card
  // said "all 12 were the trial diet".
  it('an off-list free-choice bowl makes the affirmative claim unsayable', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey })],
      arrangements: [{ foodItemId: 'aldi', foodKey: 'aldichicken dry', label: 'Aldi Chicken Dry', startedAt: '2026-06-01' }],
      nowMs,
    });
    expect(facts.arrangementExposures).toHaveLength(1);
    expect(mayClaimAllMatched(facts)).toBe(false);
  });

  // BREAK 4 — a trial food carrying `['duck','chicken']` with a NULL designated
  // primary used to put CHICKEN into the sanctioned set (the contaminant
  // sanctioning itself) while `trialContamination` skipped the same food for
  // lack of a comparator. Both halves went silent at once, and nothing said so.
  it('an undesignated trial food defines nothing, and the check says so', () => {
    const undesignated = food({
      foodItemId: 'dirty',
      foodKey: 'brandduck formula',
      primaryProtein: null,
      proteins: ['duck', 'chicken'],
    });
    const c = buildTrialContext(TRIAL, [undesignated]);
    // It does NOT sanction its own contaminant…
    expect([...sanctionedProteinsOn(c, localDayIndexOf('2026-07-10') as number)]).toEqual([]);
    // …so the protein arm is dark, and a chicken chew is still RECORDED (rung 3,
    // closed-world) rather than silently cleared.
    const chew = classifyFeeding(c, feeding({ eventId: 'x', foodItemId: 'chew', foodKey: 'bchicken chew', proteins: ['chicken'] }));
    expect(chew.verdict).toBe('off_diet_unrecognised');
    expect(chew.offDiet).toBe(true);
  });

  // BREAK 5a — a dose that was never swallowed carried no flavouring with it.
  // `generate-signal/detection.ts` already rules this for the same events, so
  // counting one here would ship a second, contradictory definition.
  it.each(['missed', 'refused'])('a %s dose is not an oral-route exposure', (adherence) => {
    expect(
      classifyDose(ctx(), {
        eventId: 'd',
        occurredAt: at('2026-07-10'),
        drugLabel: 'NexGard',
        form: 'chewable',
        pairedEventId: null,
        adherence,
      }),
    ).toBeNull();
  });

  // …and the two the first cut wrongly dropped. `partial` is a half-chewed
  // flavoured chewable — unambiguously an exposure — and NULL is an unrated
  // logged administration, not an absence. Both are `on board` in
  // `generate-signal/detection.ts:458`, which is where the rule is defined.
  it.each(['given', 'partial', null])('a %s dose IS an oral-route exposure', (adherence) => {
    expect(
      classifyDose(ctx(), {
        eventId: 'd',
        occurredAt: at('2026-07-10'),
        drugLabel: 'NexGard',
        form: 'chewable',
        pairedEventId: null,
        adherence,
      })?.trigger,
    ).toBe('chewable');
  });

  // BREAK 5b — a daily pill hidden in the PRESCRIBED DIET produced 56 oral-route
  // exposures across a 56-day trial. That is C2's alarm-fatigue reasoning applied
  // to rungs 1–3 and forgotten at rung 4.
  it('a dose hidden in the trial diet itself is not an exposure', () => {
    expect(
      classifyDose(ctx(), {
        eventId: 'd',
        occurredAt: at('2026-07-10'),
        drugLabel: 'Apoquel',
        form: 'tablet',
        pairedEventId: 'the-duck-meal',
        adherence: 'given',
        vehicleFoodItemId: DRY_DUCK.foodItemId,
        vehicleFoodKey: DRY_DUCK.foodKey,
      }),
    ).toBeNull();
  });

  it('a dose hidden in an UNKNOWN vehicle still counts (closed-world)', () => {
    expect(
      classifyDose(ctx(), {
        eventId: 'd',
        occurredAt: at('2026-07-10'),
        drugLabel: 'Apoquel',
        form: 'tablet',
        pairedEventId: 'some-meal',
        adherence: 'given',
        vehicleFoodItemId: null,
        vehicleFoodKey: null,
      })?.trigger,
    ).toBe('food_vehicle');
  });

  // BREAK 6 — `unclassifiable` and `oralRoute` were both absorbed at the card
  // boundary. The blind-spot qualifier says flavoured products "aren't visible
  // here", so the one oral exposure that IS visible must not be the one dropped.
  it('an oral-route exposure or an unclassifiable feeding blocks the claim', () => {
    const withDose = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey })],
      doses: [{ eventId: 'd', occurredAt: at('2026-07-06'), drugLabel: 'NexGard', form: 'chewable', pairedEventId: null, adherence: 'given' }],
      nowMs,
    });
    expect(mayClaimAllMatched(withDose)).toBe(false);

    const withOrphan = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey }),
        feeding({ eventId: 'b', occurredAt: at('2026-07-06'), foodItemId: null, foodKey: null }),
      ],
      nowMs,
    });
    expect(withOrphan.exposures.unclassifiable).toBe(1);
    expect(mayClaimAllMatched(withOrphan)).toBe(false);
  });

  it('the gate is one-directional — it can only ever withhold', () => {
    // A clean trial with nothing else computed still permits the claim, so the
    // gate has not quietly deleted the sentence outright.
    const clean = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey })],
      nowMs,
    });
    expect(mayClaimAllMatched(clean)).toBe(true);
  });

  // BREAK 8 — §10 S3. The vet-directed setup is: handed the diet at the clinic,
  // back-date to the day the vet started it, log from home. Denominating from
  // `started_at` scored the owner for days before the app was on their phone.
  it('the range opens at the first log, and names the untracked head', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'a', occurredAt: at('2026-07-15'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey })],
      nowMs,
    });
    expect(facts.untrackedDaysBeforeFirstLog).toBe(14);
    expect(facts.coverage).toMatchObject({ daysLogged: 1, daysElapsed: 1 });
    expect(facts.range?.clipped).toBe(true);
  });

  it('the clip cannot hide a gap in the middle or the tail', () => {
    // Logged on days 1 and 2, then nothing for twelve days. The head is not
    // clipped (there IS a log on day 1), so the gap is fully counted.
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [1, 2].map((d) =>
        feeding({ eventId: `a${d}`, occurredAt: at(`2026-07-0${d}`), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey }),
      ),
      nowMs,
    });
    expect(facts.untrackedDaysBeforeFirstLog).toBe(0);
    expect(facts.coverage).toMatchObject({ daysLogged: 2, daysElapsed: 15 });
    expect(facts.belowCoverageFloor).toBe(true);
  });
});


// ── The SECOND adversarial pass's breaks ─────────────────────────────────────
//
// The re-attack on the first round of fixes returned FAIL with ten breaks, two of
// them INTRODUCED by those fixes. Each is pinned below by the input that produced
// it — including the two self-inflicted ones, which is the case this file exists
// to make impossible to reintroduce.

describe('adversarial regressions — the second pass', () => {
  const nowMs = new Date(2026, 6, 15, 12).getTime();

  function refusalTrial(rating: string, days = 14, perDay = 2) {
    return computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: days * perDay }, (_, i) =>
        feeding({
          eventId: `r${i}`,
          occurredAt: at(`2026-07-${String(Math.floor(i / perDay) + 1).padStart(2, '0')}`, 8 + (i % perDay) * 10),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
          intakeRating: rating,
        }),
      ),
      nowMs: new Date(2026, 6, days, 22).getTime(),
    });
  }

  // ① — the highest-consequence one. `refused` alone missed the cat that PICKS at
  // every bowl for two weeks: §5.2 proof #1 with one rating value changed. And
  // because every non-refused rating still counted toward the denominator, a
  // `picked` rating actively SUPPRESSED the fact — scoring a picking cat as more
  // viable than a refusing one, which is backwards.
  it.each(['refused', 'picked', 'some'])('a diet rated %s every bowl for 14 days fires', (rating) => {
    const facts = refusalTrial(rating);
    expect(facts.trialDietRefusal).not.toBeNull();
    expect(mayClaimAllMatched(facts)).toBe(false);
  });

  it.each(['most', 'all'])('a diet rated %s does NOT fire — that pet is eating', (rating) => {
    expect(refusalTrial(rating).trialDietRefusal).toBeNull();
  });

  it('a picked rating no longer dilutes the share', () => {
    // 6 refused then 22 picked: under the old `=== refused` test this read
    // 6/28 = 0.21 and went silent. Both are "not finished", so both count.
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: 28 }, (_, i) =>
        feeding({
          eventId: `m${i}`,
          occurredAt: at(`2026-07-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`, 8 + (i % 2) * 10),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
          intakeRating: i < 6 ? 'refused' : 'picked',
        }),
      ),
      nowMs: new Date(2026, 6, 14, 22).getTime(),
    });
    expect(facts.trialDietRefusal?.refusedFeedings).toBe(28);
  });

  it('the ordinal agrees with lib/analytics, which cannot be imported here', () => {
    // The duplicate constant is the lesser evil (analytics pulls expo-sqlite);
    // this is what keeps the copy honest.
    expect(feedingWasFinished('refused')).toBe(false);
    expect(feedingWasFinished('picked')).toBe(false);
    expect(feedingWasFinished('some')).toBe(false);
    expect(feedingWasFinished('most')).toBe(true);
    expect(feedingWasFinished('all')).toBe(true);
    expect(feedingWasFinished(null)).toBeNull();
    expect(feedingWasFinished('nonsense')).toBeNull();
  });

  // ③ — a two-day wobble during the transition week latched the card into a
  // clinical-urgency state for the remaining 47 days, over a cat that then ate
  // every meal. The counters had no recency bound at all.
  it('a day-1 wobble does not latch the card for the rest of the trial', () => {
    const feedings = [
      feeding({ eventId: 'a', occurredAt: at('2026-07-01', 8), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
      feeding({ eventId: 'b', occurredAt: at('2026-07-01', 18), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
      feeding({ eventId: 'c', occurredAt: at('2026-07-02', 8), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
      ...Array.from({ length: 44 }, (_, i) =>
        feeding({ eventId: `g${i}`, occurredAt: at(`2026-07-${String(i + 3).padStart(2, '0')}`.replace(/07-(3[2-9]|4\d|5\d)/, (_m, d) => `08-${String(Number(d) - 31).padStart(2, '0')}`), 9), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'all' }),
      ),
    ];
    const early = computeTrialFacts({ trial: { ...TRIAL, species: 'cat' }, allowedFoods: ALLOWED, feedings, nowMs: new Date(2026, 6, 3, 12).getTime() });
    const late = computeTrialFacts({ trial: { ...TRIAL, species: 'cat' }, allowedFoods: ALLOWED, feedings, nowMs: new Date(2026, 7, 15, 12).getTime() });
    expect(early.trialDietRefusal).not.toBeNull();  // it was real when it happened
    expect(late.trialDietRefusal).toBeNull();       // …and it is not news on day 46
  });

  // ④ — "two distinct local days" is a calendar test, not an episode test. One
  // bout straddling midnight satisfied it in four hours.
  it('one bout straddling midnight does not clear the two-day floor', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 'a', occurredAt: at('2026-07-05', 20), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        feeding({ eventId: 'b', occurredAt: at('2026-07-05', 22), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        feeding({ eventId: 'c', occurredAt: at('2026-07-06', 0), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
      ],
      nowMs,
    });
    expect(facts.trialDietRefusal).toBeNull();
  });

  // …and the guard must not cost a REAL overnight refusal. Dinner 18:00,
  // breakfast 08:00, lunch 12:00 is 18h with nothing eaten — a third of the way
  // into the feline 48h hepatic-lipidosis window, and the only lane watching.
  it('an 18h overnight refusal still fires', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 'a', occurredAt: at('2026-07-05', 18), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        feeding({ eventId: 'b', occurredAt: at('2026-07-06', 8), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        feeding({ eventId: 'c', occurredAt: at('2026-07-06', 12), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
      ],
      nowMs,
    });
    expect(facts.trialDietRefusal).not.toBeNull();
  });

  // ⑤ (self-inflicted by the first round of fixes) — the §10 S3 clip anchored on
  // ALL feedings, so one logged treat erased eight untracked days from the
  // DENOMINATOR. §5.1 forbids a treat clearing the numerator; clearing the
  // denominator is strictly worse.
  it('a treat cannot anchor the head-clip', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        feeding({ eventId: 't', occurredAt: at('2026-07-09'), foodType: 'treat', foodItemId: RABBIT_JERKY.foodItemId, foodKey: RABBIT_JERKY.foodKey }),
        ...[10, 11, 12].map((d) =>
          feeding({ eventId: `m${d}`, occurredAt: at(`2026-07-${d}`), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey }),
        ),
      ],
      nowMs: new Date(2026, 6, 12, 22).getTime(),
    });
    expect(facts.untrackedDaysBeforeFirstLog).toBe(9);
    expect(facts.coverage).toMatchObject({ daysLogged: 3, daysElapsed: 3 });
    // …and the treat is STILL counted as a feeding: the clip moves the coverage
    // denominator, never the exposure floor.
    expect(facts.exposures.totalFeedings).toBe(4);
  });

  // ⑥ (self-inflicted) — a free-fed bowl OF THE TRIAL DIET produces no
  // arrangement exposure, so the gate did not fire; both intake lanes are
  // structurally blind there, and the card affirmed "all 14 were the trial diet"
  // over an animal nothing in the app can observe eating.
  it('ANY free-choice bowl blocks the claim, not only an off-list one', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: [feeding({ eventId: 'a', occurredAt: at('2026-07-05'), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey })],
      arrangements: [{ foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, label: DRY_DUCK.label, startedAt: '2026-07-01' }],
      nowMs,
    });
    expect(facts.arrangementExposures).toEqual([]);   // it IS the trial diet
    expect(facts.intakeNotDirectlyObserved).toBe(true);
    expect(mayClaimAllMatched(facts)).toBe(false);
  });
});

// ── The greppable guard (§12) ────────────────────────────────────────────────

describe('§12 — no surface renders a negative claim about the world', () => {
  /// <reference types="node" />
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');

  // Source-scanned rather than model-scanned, because the failure this catches is
  // a string ADDED LATER to a copy function no test happens to call. Whole-line
  // comments are stripped: this module NAMES the claims it deletes, in prose, and
  // matching raw source would make an accurate comment fail the test.
  const source = readFileSync(join(__dirname, 'dietTrial.ts'), 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

  const NEGATIVE_CLAIMS = [
    /'[^']*no off-diet/i,
    /'[^']*\b0 off-diet/i,
    /'[^']*no (?:contaminants|exposures|slips)/i,
    /'[^']*clean (?:trial|elimination)/i,
    /'[^']*all clear/i,
  ];

  it.each(NEGATIVE_CLAIMS)('lib/dietTrial.ts contains no string matching %s', (pattern) => {
    expect(source).not.toMatch(pattern);
  });

  it('contains no percentage, grade or streak string (§6.9)', () => {
    expect(source).not.toMatch(/'[^']*%[^']*'/);
    expect(source).not.toMatch(/'[^']*\b(?:streak|badge|grade|perfect week)\b/i);
  });
});

// ── The adversarial pass's executed counterexamples, pinned (B-533) ──────────
//
// Every case below rendered a WRONG ANSWER on this PR's first cut and was found
// by executing it, not by reasoning about it. They live here rather than in the
// card suite because the fix in each case was to teach the shared module the
// question, so this is where a regression would first show.
describe('B-533 adversarial regressions — the module half', () => {
  const mealAt = (day: string, hour: number, rating: string | null, tag = '') =>
    feeding({
      eventId: `${day}-${hour}-${tag}`,
      occurredAt: at(day, hour),
      foodItemId: DRY_DUCK.foodItemId,
      foodKey: DRY_DUCK.foodKey,
      intakeRating: rating,
    });

  function dayKey(offset: number): string {
    const d = new Date(2026, 6, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // BREAK 1 — the terminal card said "all 112 matched" over a record showing the
  // diet went uneaten. The now-fact's 14-day recency window saw only the good
  // fortnight at the end; `generate-report` computed a whole-range fact for
  // exactly this and the client had no way to ask the same question.
  it('a diet unfinished for six weeks then eaten for two is NOT a clean record', () => {
    const feedings = [];
    for (let k = 0; k < 42; k += 1) {
      feedings.push(mealAt(dayKey(k), 8, 'refused', 'a'), mealAt(dayKey(k), 18, 'refused', 'b'));
    }
    for (let k = 42; k < 56; k += 1) {
      feedings.push(mealAt(dayKey(k), 8, 'all', 'a'), mealAt(dayKey(k), 18, 'all', 'b'));
    }
    const facts = computeTrialFacts({
      trial: { ...TRIAL, endedAt: dayKey(55) },
      allowedFoods: ALLOWED,
      feedings,
      nowMs: new Date(2026, 6, 1 + 55, 22).getTime(),
    });
    // The now-fact is correctly quiet — the last fortnight WAS eaten.
    expect(facts.trialDietRefusal).toBeNull();
    // The range fact is not, and it is what gates the claim.
    expect(facts.rangeRefusal).toEqual({ refusedFeedings: 84, ratedFeedings: 112, days: 42 , population: 'trial_diet' as const });
    expect(mayClaimAllMatched(facts)).toBe(false);
    expect(mayStateRecordClean(facts)).toBe(false);
  });

  // BREAK 2 — rating fatigue reached the same hole on the LIVE card: 84 rated
  // refusals, then the owner stops rating. The now-fact goes quiet; the range
  // fact does not.
  it('survives rating fatigue — the range fact does not decay with the now-fact', () => {
    const feedings = [];
    for (let k = 0; k < 42; k += 1) {
      feedings.push(mealAt(dayKey(k), 8, 'refused', 'a'), mealAt(dayKey(k), 18, 'refused', 'b'));
    }
    for (let k = 42; k < 56; k += 1) {
      feedings.push(mealAt(dayKey(k), 8, null, 'a'), mealAt(dayKey(k), 18, null, 'b'));
    }
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings,
      nowMs: new Date(2026, 6, 1 + 55, 22).getTime(),
    });
    expect(facts.trialDietRefusal).toBeNull();
    expect(facts.rangeRefusal).not.toBeNull();
    expect(mayStateRecordClean(facts)).toBe(false);
  });

  // BREAK 3 — the affirmative claim rendered under `not_yet` (day 3 of 56) and
  // under `does_not_support` (the sub-floor card, which contradicted its own lead
  // sentence one line down). `mayClaimAllMatched` alone never asked.
  it('withholds the clean statement under not_yet and does_not_support', () => {
    const young = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        mealAt('2026-07-01', 8, 'all'),
        mealAt('2026-07-02', 8, 'all'),
        mealAt('2026-07-03', 8, 'all'),
      ],
      nowMs: new Date(2026, 6, 3, 22).getTime(),
    });
    expect(young.interpretability).toBe('not_yet');
    // Nothing is FALSE about the record, so the weak gate is happy…
    expect(mayClaimAllMatched(young)).toBe(true);
    // …and the composite gate is the one that knows it means nothing yet.
    expect(mayStateRecordClean(young)).toBe(false);

    const sparse = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => mealAt(dayKey(k), 8, 'all')),
      nowMs: new Date(2026, 6, 1 + 29, 22).getTime(),
    });
    expect(sparse.interpretability).toBe('does_not_support');
    expect(mayStateRecordClean(sparse)).toBe(false);
  });

  // BREAK 3b — a trial the owner ENDED because the pet would not eat it cannot
  // have its days read as clean ones, whatever the counts say.
  it('withholds the clean statement on a trial stopped for refusal', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: 20 }, (_, k) => mealAt(dayKey(k), 8, 'all')),
      nowMs: new Date(2026, 6, 1 + 19, 22).getTime(),
    });
    expect(mayStateRecordClean(facts)).toBe(true);
    expect(mayStateRecordClean(facts, { stoppedForRefusal: true })).toBe(false);
  });

  // BREAK 5 — the worst one. An un-hydrated `diet_trial_foods` (reachable in
  // normal operation: `lib/sync.ts` swallows a failed hydration step) made every
  // feeding of the PRESCRIBED diet fall to rung 3, so a fully compliant owner was
  // told "0 matched, 40 did not" — with a drill-in listing her own prescription.
  it('an allowed set with no primary_diet row is UNAVAILABLE, not all-off-diet', () => {
    const feedings = Array.from({ length: 40 }, (_, k) =>
      mealAt(dayKey(Math.floor(k / 2)), k % 2 === 0 ? 8 : 18, 'all', String(k)));
    const cold = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [],
      feedings,
      nowMs: new Date(2026, 6, 1 + 19, 22).getTime(),
    });
    expect(cold.allowedSetUnavailable).toBe(true);
    // The counts are still what they are — the module does not lie in either
    // direction — but no surface may read them as adherence.
    expect(cold.exposures.offDiet).toBe(40);
    expect(mayClaimAllMatched(cold)).toBe(false);
    expect(mayStateRecordClean(cold)).toBe(false);

    // A trial whose only rows are permitted extras is the same state: rung 2's
    // comparator is built from `primary_diet` alone.
    const extrasOnly = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [RABBIT_JERKY],
      feedings,
      nowMs: new Date(2026, 6, 1 + 19, 22).getTime(),
    });
    expect(extrasOnly.allowedSetUnavailable).toBe(true);

    // …and a properly hydrated set is NOT flagged.
    const warm = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings,
      nowMs: new Date(2026, 6, 1 + 19, 22).getTime(),
    });
    expect(warm.allowedSetUnavailable).toBe(false);
    expect(mayStateRecordClean(warm)).toBe(true);
  });

});

// ── Round 2 of the adversarial pass — the module half ───────────────────────
describe('B-533 adversarial regressions — round 2, the module half', () => {
  const mealAt = (day: string, hour: number, rating: string | null, tag = '') =>
    feeding({
      eventId: `${day}-${hour}-${tag}`,
      occurredAt: at(day, hour),
      foodItemId: DRY_DUCK.foodItemId,
      foodKey: DRY_DUCK.foodKey,
      intakeRating: rating,
    });

  function dayKey(offset: number): string {
    const d = new Date(2026, 6, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // THE HALF-HYDRATED SET, which is commoner than the empty one and was not
  // covered: a `primary_diet` row IS present but matches nothing — a stale
  // `food_item_id` whose food never hydrated, a re-photographed bag, an
  // `allowed_from` dated after the window. 110 feedings of the prescribed diet
  // rendered "0 matched, 110 did not" on a fully compliant owner.
  it('a primary_diet row that matches NOTHING is also an unusable allowed set', () => {
    const stale = food({
      foodItemId: 'stale-id-nobody-logs-against',
      foodKey: null,
      label: 'Royal Canin Duck Dry',
      role: 'primary_diet',
    });
    const feedings = Array.from({ length: 20 }, (_, k) =>
      mealAt(dayKey(Math.floor(k / 2)), k % 2 === 0 ? 8 : 18, 'all', String(k)));
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [stale],
      feedings,
      nowMs: new Date(2026, 6, 1 + 9, 22).getTime(),
    });
    expect(facts.exposures.offDiet).toBe(20);
    expect(facts.allowedSetUnavailable).toBe(true);
    expect(mayStateRecordClean(facts)).toBe(false);
  });

  // Dated membership reaches the same place from a different cause.
  it('a primary_diet row allowed only AFTER the window is an unusable set', () => {
    const late = { ...DRY_DUCK, allowedFrom: '2026-09-01' };
    const feedings = Array.from({ length: 20 }, (_, k) =>
      mealAt(dayKey(Math.floor(k / 2)), k % 2 === 0 ? 8 : 18, 'all', String(k)));
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [late],
      feedings,
      nowMs: new Date(2026, 6, 1 + 9, 22).getTime(),
    });
    expect(facts.allowedSetUnavailable).toBe(true);
  });

  // THE FLOOR IS WHAT KEEPS IT HONEST. Below it "the diet matched nothing" is not
  // yet evidence of a cold cache — an owner three feedings into a trial may
  // simply not have fed the diet yet — so the fact stays false and the counts
  // stand on their own.
  it('does not cry cold-cache below the reconciliation floor', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      // A real, NAMED food that simply is not on the list — not an
      // identity-less feeding, which classifies `unclassifiable` rather than
      // off-diet and would not exercise the floor at all.
      feedings: [
        feeding({ eventId: 'a', occurredAt: at('2026-07-05', 8), foodItemId: 'rival', foodKey: 'brandrival kibble' }),
        feeding({ eventId: 'b', occurredAt: at('2026-07-05', 18), foodItemId: 'rival', foodKey: 'brandrival kibble' }),
        feeding({ eventId: 'c', occurredAt: at('2026-07-06', 8), foodItemId: 'rival', foodKey: 'brandrival kibble' }),
      ],
      nowMs: new Date(2026, 6, 6, 22).getTime(),
    });
    expect(facts.exposures.offDiet).toBe(3);
    expect(facts.allowedSetUnavailable).toBe(false);
  });

  // A well-hydrated trial must not be caught by any of this.
  it('leaves a hydrated allowed set alone', () => {
    const feedings = Array.from({ length: 20 }, (_, k) =>
      mealAt(dayKey(Math.floor(k / 2)), k % 2 === 0 ? 8 : 18, 'all', String(k)));
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings,
      nowMs: new Date(2026, 6, 1 + 9, 22).getTime(),
    });
    expect(facts.allowedSetUnavailable).toBe(false);
    expect(mayStateRecordClean(facts)).toBe(true);
  });

  // THE TWO ARRANGEMENT QUESTIONS. The claim is about the whole window; the copy
  // is present-tense. Splitting them is what stops a bowl removed on day 3
  // latching the free-fed state for the rest of the trial.
  it('separates "a bowl overlapped the window" from "a bowl is down now"', () => {
    const feedings = Array.from({ length: 20 }, (_, k) =>
      mealAt(dayKey(Math.floor(k / 2)), k % 2 === 0 ? 8 : 18, 'all', String(k)));
    const removed = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings,
      arrangements: [{
        foodItemId: 'bowl', foodKey: 'brandbowl', label: 'Kibble',
        startedAt: dayKey(0), endedAt: dayKey(2),
      }],
      nowMs: new Date(2026, 6, 1 + 9, 22).getTime(),
    });
    // The claim stays withheld — nothing could observe intake on days 0–2, ever.
    expect(removed.intakeNotDirectlyObserved).toBe(true);
    expect(mayClaimAllMatched(removed)).toBe(false);
    // …but the present-tense copy must not fire.
    expect(removed.intakeNotDirectlyObservedNow).toBe(false);

    const stillDown = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings,
      arrangements: [{
        foodItemId: 'bowl', foodKey: 'brandbowl', label: 'Kibble',
        startedAt: dayKey(0), endedAt: null,
      }],
      nowMs: new Date(2026, 6, 1 + 9, 22).getTime(),
    });
    expect(stillDown.intakeNotDirectlyObservedNow).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-533 PR B — THE THREE FACTS THE LIVE R1 REGISTER READS
//
// `trialDietRefusal` and `rangeRefusal` already have suites above. These are the
// three that were added so a LIVE, present-tense register could speak from them
// safely, and each one is a defect that was executed rather than a nicety:
//
//   `recentFinishedFeedings`     — silence must not cancel an alarm, and more
//                                  logged refusals must not cancel one either.
//   `rangeRefusalSpansEpisodes`  — the range fact drops the episode guard, which
//                                  is right for a history and wrong for "today".
//   `intakeRating`               — the refusal lane sees only RATED feedings, so
//                                  something has to teach the tap (R1b).
// ─────────────────────────────────────────────────────────────────────────────
describe('B-533 PR B — the facts behind the live refusal register', () => {
  /** N days × `perDay` primary-diet feedings, each carrying `ratingFor(i)`. */
  function trialWithRatings(
    days: number,
    perDay: number,
    ratingFor: (index: number) => string | null,
    over: { foodType?: 'meal' | 'treat'; foodItemId?: string; foodKey?: string | null } = {},
  ) {
    return computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings: Array.from({ length: days * perDay }, (_, i) =>
        feeding({
          eventId: `p${i}`,
          occurredAt: at(
            `2026-07-${String(Math.floor(i / perDay) + 1).padStart(2, '0')}`,
            8 + (i % perDay) * 10,
          ),
          foodItemId: over.foodItemId ?? DRY_DUCK.foodItemId,
          foodKey: over.foodKey === undefined ? DRY_DUCK.foodKey : over.foodKey,
          foodType: over.foodType ?? 'meal',
          intakeRating: ratingFor(i) ?? undefined,
        }),
      ),
      nowMs: new Date(2026, 6, days, 22).getTime(),
    });
  }

  describe('recentFinishedFeedings — FINISHED, never merely rated', () => {
    // THE DEFECT THIS PINS: counting ratings meant two more logged refusals
    // inside the recency window stood the register down. More evidence of
    // refusal bought less disclosure — the register present at 0 recent
    // ratings, absent at 1–2, present again at 3+, with a dead zone occupied by
    // exactly the refusing cat.
    it('a fortnight of refusals leaves it at zero, however many are rated', () => {
      const facts = trialWithRatings(14, 2, () => 'refused');
      expect(facts.trialDietRefusal).not.toBeNull();
      expect(facts.recentFinishedFeedings).toBe(0);
    });

    it.each(['picked', 'some'])('a %s bowl is not a finished one', (rating) => {
      expect(trialWithRatings(14, 2, () => rating).recentFinishedFeedings).toBe(0);
    });

    it.each(['all', 'most'])('a %s bowl is', (rating) => {
      expect(trialWithRatings(14, 2, () => rating).recentFinishedFeedings).toBe(28);
    });

    // Unrated is NOT finished. R1a's rule is that absence of ratings never
    // alarms; the mirror rule is that absence of ratings is not evidence of
    // recovery either, so it may not stand a fired register down.
    it('an unrated bowl is neither — absence is not evidence of eating', () => {
      expect(trialWithRatings(14, 2, () => null).recentFinishedFeedings).toBe(0);
    });

    // The recency window is what makes this a NOW-fact. A diet eaten in week one
    // and refused since is not evidence the pet is eating today.
    // THE DENOMINATOR SHIPS WITH THE NUMERATOR (B-571). `recentFinishedFeedings`
    // alone cannot express a share, and a share is what the stand-down needs to
    // be symmetric with the fire — a bare `=== 0` test on the numerator is what
    // let one eaten bowl cancel sixty documented refusals.
    it('carries its own denominator, over the same window and rows', () => {
      const facts = trialWithRatings(14, 2, (i) => (i % 4 === 0 ? 'all' : 'refused'));
      expect(facts.recentRatedFeedings).toBe(28);
      expect(facts.recentFinishedFeedings).toBe(7);
      // Unrated feedings enter NEITHER side — they are not evidence in either
      // direction, which is R1a and its mirror in one line.
      const half = trialWithRatings(14, 2, (i) => (i % 2 === 0 ? 'refused' : null));
      expect(half.recentRatedFeedings).toBe(14);
      expect(half.recentFinishedFeedings).toBe(0);
    });

    it('is bounded to the recency window, not the range', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        // 40 days: the first 20 finished, the last 20 refused.
        feedings: Array.from({ length: 40 }, (_, i) =>
          feeding({
            eventId: `w${i}`,
            occurredAt: at(
              i < 20
                ? `2026-07-${String(i + 1).padStart(2, '0')}`
                : `2026-08-${String(i - 19).padStart(2, '0')}`,
            ),
            foodItemId: DRY_DUCK.foodItemId,
            foodKey: DRY_DUCK.foodKey,
            intakeRating: i < 20 ? 'all' : 'refused',
          }),
        ),
        nowMs: new Date(2026, 7, 20, 22).getTime(),
      });
      expect(facts.recentFinishedFeedings).toBe(0);
      expect(facts.rangeRefusal).not.toBeNull();
    });
  });

  describe('rangeRefusalSpansEpisodes — one bout is not a history', () => {
    // THE DEFECT THIS PINS: `rangeRefusal` deliberately drops
    // `REFUSAL_MIN_SPAN_MS` because a multi-week refusal, not a midnight
    // straddle, is a history's failure mode. The moment a LIVE present-tense
    // register read that fact, one four-hour bout fired "needs a call today" for
    // the next 36 days over a cat that ate throughout.
    it('three refusals in one evening straddling midnight do not span episodes', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        feedings: [
          feeding({ eventId: 'b1', occurredAt: at('2026-07-10', 20), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
          feeding({ eventId: 'b2', occurredAt: at('2026-07-10', 22), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
          feeding({ eventId: 'b3', occurredAt: at('2026-07-11', 0), foodItemId: DRY_DUCK.foodItemId, foodKey: DRY_DUCK.foodKey, intakeRating: 'refused' }),
        ],
        nowMs: new Date(2026, 6, 11, 12).getTime(),
      });
      // The range fact still fires — that is correct for a history, and is
      // exactly why the live register needs a second question to ask.
      expect(facts.rangeRefusal).not.toBeNull();
      expect(facts.rangeRefusalSpansEpisodes).toBe(false);
    });

    it('a fortnight of refused bowls does', () => {
      expect(trialWithRatings(14, 2, () => 'refused').rangeRefusalSpansEpisodes).toBe(true);
    });

    // Measured on the RANGE's own stamps, not the recency window's. A refusal
    // that has aged out of the now-fact still has to be able to answer "was this
    // one bout or many?", because the stand-down path reads the range fact.
    it('measures the range’s refusals, not the recent ones', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        feedings: Array.from({ length: 8 }, (_, i) =>
          feeding({
            eventId: `o${i}`,
            occurredAt: at(`2026-07-${String(i + 1).padStart(2, '0')}`),
            foodItemId: DRY_DUCK.foodItemId,
            foodKey: DRY_DUCK.foodKey,
            intakeRating: 'refused',
          }),
        ),
        // Read five weeks later: every refusal is outside the recency window.
        nowMs: new Date(2026, 7, 10, 12).getTime(),
      });
      expect(facts.trialDietRefusal).toBeNull();
      expect(facts.rangeRefusalSpansEpisodes).toBe(true);
    });
  });

  describe('intakeRating (R1b) — the rated share of the meal record', () => {
    it('is null when there is nothing in range to have rated', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        feedings: [],
        nowMs: new Date(2026, 6, 10, 12).getTime(),
      });
      // NULL, NOT A ZEROED OBJECT. "Nothing in range to have rated" and "nothing
      // rated" are different facts, and a surface handed `{rated: 0, feedings: 0}`
      // divides by zero and teaches the tap on day 1 of an empty trial.
      expect(facts.intakeRating).toBeNull();
    });

    it('counts the rated share over both populations', () => {
      // 20 primary-diet feedings, every fourth one rated.
      const facts = trialWithRatings(10, 2, (i) => (i % 4 === 0 ? 'all' : null));
      expect(facts.intakeRating).toEqual({
        rated: 5, feedings: 20, primaryRated: 5, primaryFeedings: 20,
      });
    });

    // The WIDE denominator is the coverage numerator's population, so it excludes
    // treats for the same reason: a treat nobody rated is not the gap in the
    // record this teaches about, and on live data 82% of feedings are treats — a
    // treat-inclusive denominator would fire the teach line on nearly every card.
    it('excludes treats from the wide population', () => {
      const facts = trialWithRatings(10, 2, () => null, {
        foodType: 'treat', foodItemId: RABBIT_JERKY.foodItemId, foodKey: RABBIT_JERKY.foodKey,
      });
      expect(facts.intakeRating).toBeNull();
    });

    // THE COUNTEREXAMPLE THAT PROVES BOTH POPULATIONS ARE NEEDED: an owner who
    // logs unrated bowls of the prescribed diet beside rated permitted toppers
    // has a healthy-looking wide share and a zero narrow one — and the narrow one
    // is the population the refusal lane actually reads.
    it('separates the narrow population, which the refusal lane reads', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        feedings: [
          // Two unrated bowls of the trial diet a day…
          ...Array.from({ length: 20 }, (_, i) => feeding({
            eventId: `d${i}`,
            occurredAt: at(`2026-07-${String(Math.floor(i / 2) + 1).padStart(2, '0')}`, 8 + (i % 2) * 10),
            foodItemId: DRY_DUCK.foodItemId,
            foodKey: DRY_DUCK.foodKey,
          })),
          // …beside three RATED permitted toppers, logged as meals.
          ...Array.from({ length: 30 }, (_, i) => feeding({
            eventId: `j${i}`,
            occurredAt: at(`2026-07-${String(Math.floor(i / 3) + 1).padStart(2, '0')}`, 13 + (i % 3)),
            foodItemId: RABBIT_JERKY.foodItemId,
            foodKey: RABBIT_JERKY.foodKey,
            intakeRating: 'all',
          })),
        ],
        nowMs: new Date(2026, 6, 10, 22).getTime(),
      });
      expect(facts.intakeRating?.primaryRated).toBe(0);
      expect(facts.intakeRating?.primaryFeedings).toBe(20);
      // 30 of 50 rated overall — comfortably above the teach floor, on a record
      // whose viability is completely unknowable.
      expect(facts.intakeRating?.rated).toBe(30);
      expect(facts.intakeRating?.feedings).toBe(50);
    });

    // §10 S3's clipped head. Days the owner could not have logged are not a gap
    // in their record, so they may not drag the rated share down and fire a
    // teach line about a record that did not exist yet.
    it('is denominated from the first log, not from the trial start', () => {
      const facts = computeTrialFacts({
        trial: { ...TRIAL, species: 'cat' },
        allowedFoods: ALLOWED,
        feedings: Array.from({ length: 4 }, (_, i) => feeding({
          eventId: `h${i}`,
          occurredAt: at(`2026-07-${String(i + 12).padStart(2, '0')}`),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
          intakeRating: 'all',
        })),
        nowMs: new Date(2026, 6, 16, 22).getTime(),
      });
      expect(facts.untrackedDaysBeforeFirstLog).toBeGreaterThan(0);
      expect(facts.intakeRating).toEqual({
        rated: 4, feedings: 4, primaryRated: 4, primaryFeedings: 4,
      });
    });
  });
});

// ── B-530 — the refusal lane survives a food-identity miss ───────────────────
//
// The pre-ship adversarial chair executed the counterexample: a 21-day all-refused
// cat behind a RE-PHOTOGRAPHED BAG. Re-shooting the bag mints a new `food_items` row
// with a slightly different product name; the trial's allowed set still points at the
// old one, so rung 1 misses on every feeding. Both refusal gates keyed on
// `role === 'primary_diet'`, which only exists when rung 1 matched — so the population
// did not degrade, it EMPTIED, and the fact went null over an animal that had not
// eaten for three weeks. An app action the product actively encourages silenced the
// one lane built for the sickest patient in it.
describe('B-530 — the refusal population falls back when identity misses', () => {
  /** Every feeding names a food the allowed set does not carry (the new bag). */
  function refusedBehindABrokenBag(rating: string | null, count = 42) {
    return computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: [DRY_DUCK],
      feedings: Array.from({ length: count }, (_, i) =>
        feeding({
          eventId: `m${i}`,
          // Two a day across `count / 2` days, so the day and span floors clear.
          occurredAt: at(`2026-07-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`, i % 2 === 0 ? 8 : 20),
          foodItemId: 'dry-duck-rephotographed',
          foodKey: 'royal caninduck dry kibble',
          intakeRating: rating,
        }),
      ),
      nowMs: new Date(2026, 6, 22, 12).getTime(),
    });
  }

  it('fires over the MEAL RECORD when the allowed set cannot identify the diet', () => {
    const facts = refusedBehindABrokenBag('refused');
    expect(facts.allowedSetUnavailable).toBe(true);
    expect(facts.rangeRefusal).not.toBeNull();
    expect(facts.rangeRefusal).toMatchObject({
      refusedFeedings: 42,
      ratedFeedings: 42,
      population: 'meal_record',
    });
    // And the affirmative claim was already withheld — the fallback adds disclosure,
    // it never turns a claim on.
    expect(mayClaimAllMatched(facts)).toBe(false);
  });

  it('keeps the NARROW population — and the named finding — when identity resolves', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: [DRY_DUCK],
      feedings: Array.from({ length: 42 }, (_, i) =>
        feeding({
          eventId: `m${i}`,
          occurredAt: at(`2026-07-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`, i % 2 === 0 ? 8 : 20),
          foodItemId: DRY_DUCK.foodItemId,
          foodKey: DRY_DUCK.foodKey,
          intakeRating: 'refused',
        }),
      ),
      nowMs: new Date(2026, 6, 22, 12).getTime(),
    });
    expect(facts.allowedSetUnavailable).toBe(false);
    expect(facts.rangeRefusal?.population).toBe('trial_diet');
  });

  // R1a, in both populations. The fallback widens WHICH ROWS are counted; it never
  // lowers the bar to logged evidence, so an owner who does not rate intake still
  // cannot be told her cat is not eating.
  it('never fires on an unrated record, however broken the identity', () => {
    const facts = refusedBehindABrokenBag(null);
    expect(facts.rangeRefusal).toBeNull();
    expect(facts.trialDietRefusal).toBeNull();
    // The teach line still measures the same wide record, so the surface that would
    // ask for the tap is not silenced by the same miss.
    expect(facts.intakeRating).toMatchObject({ rated: 0, feedings: 42, primaryFeedings: 0 });
  });

  it('never fires on a record the pet ATE, however broken the identity', () => {
    expect(refusedBehindABrokenBag('all').rangeRefusal).toBeNull();
  });

  // The wide population is the MEAL record — the same set the coverage numerator and
  // R1b walk. A refused chicken chew says nothing about whether meals are being eaten,
  // and letting treats in would let a fussy-about-treats record fire the safety lane.
  it('excludes treats from the wide population', () => {
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: [DRY_DUCK],
      feedings: Array.from({ length: 42 }, (_, i) =>
        feeding({
          eventId: `t${i}`,
          occurredAt: at(`2026-07-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`, i % 2 === 0 ? 8 : 20),
          foodItemId: 'some-treat',
          foodKey: 'acmechicken chew',
          foodType: 'treat',
          intakeRating: 'refused',
        }),
      ),
      nowMs: new Date(2026, 6, 22, 12).getTime(),
    });
    expect(facts.rangeRefusal).toBeNull();
  });

  // The stand-down pair must be measured over the SAME rows as the fact it stands
  // down. A numerator and denominator drawn from different populations is a silent lie
  // in the reassuring direction — and the reassuring direction is the one that matters.
  it('measures the stand-down pair over the population that spoke', () => {
    const facts = refusedBehindABrokenBag('refused');
    expect(facts.recentRatedFeedings).toBeGreaterThan(0);
    expect(facts.recentFinishedFeedings).toBe(0);
  });
});

describe('B-530 — the copy never names a diet the app could not identify', () => {
  it('widens the headline noun to the meal record', () => {
    const line = trialViabilityHeadline({
      refusedFeedings: 42,
      ratedFeedings: 42,
      days: 21,
      population: 'meal_record',
    });
    expect(line).toMatch(/42 meals you’ve rated/);
    expect(line).not.toMatch(/trial-diet/);
    // Still never softens toward preference.
    expect(line).not.toMatch(/pick|fussy|prefer|doesn’t like|taste/i);
  });

  it('discloses the attribution gap in the note, and still escalates', () => {
    const note = trialViabilityNote('Miso', 'cat', 'meal_record');
    expect(note).toMatch(/can’t match these meals to the foods on this trial’s list/);
    expect(note).toMatch(/needs a call today/);
    expect(note).not.toMatch(/A diet Miso isn’t eating/);
    // The narrow form is unchanged, and is still the default.
    expect(trialViabilityNote('Miso', 'cat')).toMatch(/A diet Miso isn’t eating/);
  });
});

// ── B-576 — the two residuals this fallback does NOT close ───────────────────
//
// Pinned as tests rather than left as prose, because the failure mode of a
// documented limit is that a later reader assumes coverage. Both are UNDER-fire and
// neither is a regression (the shipped behaviour in both is silence), and both have
// one root cause — food identity — which is B-529's PR. When that lands, these two
// assertions are expected to FLIP, and the flip is the signal that they were fixed.
describe('B-576 — known limits of the wide population (expected to flip with B-529)', () => {
  const CAT = { ...TRIAL, species: 'cat' as const };

  it('KNOWN LIMIT — a PARTIAL identity miss keeps the narrow population, which cannot see it', () => {
    // Wet + dry of the same diet (§4.1). Only the dry bag was re-photographed. The cat
    // eats the wet and refuses the dry — and the narrow population, which is all that
    // survives, sees only the wet and reads as eating.
    const facts = computeTrialFacts({
      trial: CAT,
      allowedFoods: [DRY_DUCK, WET_DUCK],
      feedings: [
        ...Array.from({ length: 21 }, (_, i) =>
          feeding({
            eventId: `dry${i}`,
            occurredAt: at(`2026-07-${String(1 + i).padStart(2, '0')}`, 8),
            foodItemId: 'dry-duck-rephotographed',
            foodKey: 'royal caninduck dry kibble',
            intakeRating: 'refused',
          }),
        ),
        ...Array.from({ length: 21 }, (_, i) =>
          feeding({
            eventId: `wet${i}`,
            occurredAt: at(`2026-07-${String(1 + i).padStart(2, '0')}`, 20),
            foodItemId: WET_DUCK.foodItemId,
            foodKey: WET_DUCK.foodKey,
            intakeRating: 'all',
          }),
        ),
      ],
      nowMs: new Date(2026, 6, 22, 12).getTime(),
    });
    expect(facts.allowedSetUnavailable).toBe(false);
    expect(facts.rangeRefusal).toBeNull();
  });

  it('KNOWN LIMIT — substitution DILUTES the wide share below the floor', () => {
    // The canonical diet-trial failure mode: the prescription is refused and the owner
    // tops the cat up with chicken. 21 refused + 42 eaten over the same 21 days is a
    // 33% not-finished share, under `REFUSAL_SHARE`. The identical record with intact
    // identity fires 21 of 21 (asserted below), which is what makes this a limit of the
    // wide population rather than of the floors.
    const substituted = Array.from({ length: 42 }, (_, i) =>
      feeding({
        eventId: `sub${i}`,
        occurredAt: at(`2026-07-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`, i % 2 ? 20 : 14),
        foodItemId: 'rotisserie',
        foodKey: 'homerotisserie chicken',
        proteins: ['chicken'],
        intakeRating: 'all',
      }),
    );
    const refusedDry = (foodItemId: string, foodKey: string) =>
      Array.from({ length: 21 }, (_, i) =>
        feeding({
          eventId: `${foodItemId}${i}`,
          occurredAt: at(`2026-07-${String(1 + i).padStart(2, '0')}`, 8),
          foodItemId,
          foodKey,
          intakeRating: 'refused',
        }),
      );
    const nowMs = new Date(2026, 6, 22, 12).getTime();

    const broken = computeTrialFacts({
      trial: CAT,
      allowedFoods: [DRY_DUCK],
      feedings: [...refusedDry('dry-duck-rephotographed', 'royal caninduck dry kibble'), ...substituted],
      nowMs,
    });
    expect(broken.allowedSetUnavailable).toBe(true);
    expect(broken.rangeRefusal).toBeNull();
    // The exposures are still counted and still loud — what is lost is the intake fact.
    expect(broken.exposures.offDiet).toBeGreaterThan(0);

    const intact = computeTrialFacts({
      trial: CAT,
      allowedFoods: [DRY_DUCK],
      feedings: [...refusedDry(DRY_DUCK.foodItemId, DRY_DUCK.foodKey as string), ...substituted],
      nowMs,
    });
    expect(intact.rangeRefusal).toMatchObject({ refusedFeedings: 21, ratedFeedings: 21, population: 'trial_diet' });
  });
});
