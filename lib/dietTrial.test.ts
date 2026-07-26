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
  explainVerdict,
  interpretabilityStatement,
  isWithinChallengeWindow,
  oralRouteCopy,
  sanctionedProteinsOn,
  trialContamination,
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
        { eventId: 'd1', occurredAt: at('2026-07-15'), drugLabel: 'NexGard', form: 'chewable', pairedEventId: null },
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
    expect(facts.coverage).toMatchObject({ daysLogged: 1, daysElapsed: 30 });
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
