// jest validation for the App Review demo seed (B-271, PR 1) — the off-diet
// facts and the emitted-SQL safety guarantees. The Deno sibling
// (supabase/functions/generate-signal/demoStory.detection.test.ts) proves the
// Signal fires; this proves (a) the shipped off-diet predicate flags exactly the
// contraband and stays out of the B-494 refusal hold, and (b) the emitted SQL is
// upsert-only, scoped, and correctly quoted (docs/nyx-demo-account-requirements.md
// §12.2 / §13).
//
// B-514 timezone honesty: this suite runs under the non-UTC CI job. Every instant
// is built from demoStory's UTC-anchored helpers (Date#toISOString is UTC,
// runner-independent) and computeTrialFacts is passed an EXPLICIT `timeZone: 'UTC'`
// so the trial-day math is pinned — a UTC-literal seed instant is then the correct
// fixture, because the day boundary IS UTC midnight here. So the assertions below
// are identical under TZ=UTC+14 / +12:45 / −10.

import {
  computeTrialFacts,
  classifyFeeding,
  buildTrialContext,
  type TrialFactsInput,
  type TrialFeeding,
  type AllowedFood,
  type TrialSpec,
} from '../../lib/dietTrial';
import { foodIntakeKey } from '../../lib/food';
import { buildDemoStory, materializeDate, materializeInstantIso } from './demoStory';
import { emitSeedSqlForParams, DEMO_EMAIL } from './emitSeedSql';

const PARAMS = {
  userId: '11111111-1111-4111-8111-111111111111',
  petId: '22222222-2222-4222-8222-222222222222',
  timezone: 'America/New_York',
};
const SEED_MS = Date.parse('2026-08-11T15:30:00.000Z');
const TZ = 'UTC';

const story = buildDemoStory(PARAMS);
const venison = story.foods.find((f) => f.slotKey === 'food-venison')!;
const beef = story.foods.find((f) => f.slotKey === 'food-beef')!;

function trialSpec(): TrialSpec {
  return {
    id: story.trial.id,
    startedAt: materializeDate(story.trial.startedDayOffset, SEED_MS),
    targetDurationDays: story.trial.targetDurationDays,
    transitionStartedAt: materializeDate(story.trial.transitionStartedDayOffset, SEED_MS),
    endedAt: null,
    species: 'dog',
  };
}
function allowedFoods(): AllowedFood[] {
  return story.allowedFoods.map((a) => ({
    foodItemId: a.foodId,
    foodKey: foodIntakeKey(venison.brand, venison.productName),
    label: a.foodLabel,
    role: a.role,
    allowedFrom: materializeDate(a.allowedFromDayOffset, SEED_MS),
    allowedUntil: null,
    primaryProtein: venison.primaryProtein,
    proteins: venison.proteins,
  }));
}
function feedings(): TrialFeeding[] {
  return story.events
    .filter((e) => e.kind === 'meal' && e.meal)
    .map((e) => {
      const food = story.foods.find((x) => x.id === e.meal!.foodId)!;
      return {
        eventId: e.eventId,
        occurredAt: materializeInstantIso(e.time, SEED_MS),
        foodItemId: e.meal!.foodId,
        foodKey: foodIntakeKey(food.brand, food.productName),
        label: e.meal!.label,
        foodType: e.meal!.foodType,
        proteins: e.meal!.proteins,
        intakeRating: e.meal!.intakeRating,
      };
    });
}
const DAY_MS = 86_400_000;
// Rows are FIXED at seed time (feedings/trial materialized at SEED_MS); only `now`
// advances, modelling a report/card generated `readOffsetDays` after the seed ran.
function factsInput(readOffsetDays = 0): TrialFactsInput {
  return {
    trial: trialSpec(),
    allowedFoods: allowedFoods(),
    feedings: feedings(),
    nowMs: SEED_MS + readOffsetDays * DAY_MS,
    timeZone: TZ,
  };
}

describe('demo story — off-diet facts (lib/dietTrial)', () => {
  const facts = computeTrialFacts(factsInput());

  it('flags exactly the four beef feedings off-diet, all via the derived-protein rung', () => {
    expect(facts.exposures.offDiet).toBe(4);
    expect(facts.exposures.byRung.derived_protein).toBe(4);
    // No feeding names no food, so nothing is unclassifiable.
    expect(facts.exposures.unclassifiable).toBe(0);
  });

  it('classifies every beef feeding off-diet and every venison feeding permitted', () => {
    const ctx = buildTrialContext(trialSpec(), allowedFoods(), { timeZone: TZ });
    const all = feedings();
    const beefFeedings = all.filter((f) => f.proteins.includes('beef'));
    const venisonFeedings = all.filter((f) => f.proteins.includes('venison'));
    expect(beefFeedings).toHaveLength(4);

    for (const f of beefFeedings) {
      const c = classifyFeeding(ctx, f);
      expect(c.offDiet).toBe(true);
      expect(c.rung).toBe('derived_protein');
    }
    for (const f of venisonFeedings) {
      const c = classifyFeeding(ctx, f);
      expect(c.offDiet).toBe(false);
    }
  });

  it('keeps trialDietRefusal null at seed time — the dip is not a refusing patient (B-494 hold)', () => {
    // At seed time the 4 not-finished dip feedings are a ~0.14 share of the 14-day
    // venison recency window (2 finished meals/day), well under REFUSAL_SHARE (0.5),
    // so the trial-viability refusal fact does not fire — the story is a mild dip,
    // not a refusal, and does not walk into the held generate-report refusal band.
    expect(facts.trialDietRefusal).toBeNull();
    expect(facts.rangeRefusal).toBeNull();
  });

  it('keeps trialDietRefusal null for the whole ≤9-day freshness window, then decays into a FALSE refusal (adversarial finding)', () => {
    // The adversarial gate broke the single-instant assertion above: as `now`
    // advances WITHOUT a re-seed, the FINISHED baseline venison meals age out of the
    // 14-day refusal-recency window while the recent-edge dip (which ② needs on the
    // two most-recent days) stays — so the not-finished SHARE climbs past
    // REFUSAL_SHARE purely from the shrinking denominator, and computeTrialFacts
    // surfaces a FALSE "this diet isn't being eaten" card on the live trial card.
    // This is intrinsic (② requires the recent dip), so the only lever is FRESHNESS.
    // Pin the real boundary, exactly as the ② midnight singularity is pinned:
    //   • null across the whole window the ≤9-day cadence ceiling guarantees, and
    //   • the measured first-flip at +10d — the number that JUSTIFIES that ceiling.
    for (let d = 0; d <= 9; d++) {
      expect(computeTrialFacts(factsInput(d)).trialDietRefusal).toBeNull();
    }
    // +10d: the false refusal appears (share 0.5) — this is WHY §8's re-seed cadence
    // must carry a hard ≤9-day ceiling even during "In Review" (flagged to the PM).
    expect(computeTrialFacts(factsInput(10)).trialDietRefusal).not.toBeNull();
  });
});

describe('demo story — emitted SQL safety guarantees', () => {
  const sql = emitSeedSqlForParams(PARAMS);

  it('is upsert-only: no bare DELETE and no bare UPDATE (§8 scoping ban, §13)', () => {
    // `deleted_at`/`updated_at` are not word-boundary matches for DELETE/UPDATE.
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    const updates = sql.match(/\bUPDATE\b/gi) ?? [];
    const doUpdates = sql.match(/\bDO UPDATE\b/gi) ?? [];
    // Every UPDATE keyword is part of an `ON CONFLICT … DO UPDATE` upsert — there is
    // no unscoped mutation to name, the strongest form of the scoping ban.
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.length).toBe(doUpdates.length);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
  });

  it('runs in one transaction behind the assertion prelude (exact demo-email match)', () => {
    expect(sql).toMatch(/^-{2}.*\n(?:.*\n)*?BEGIN;/); // BEGIN near the top
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    // The prelude refuses any target other than the ratified demo account (DB-4).
    expect(sql).toContain(`IS DISTINCT FROM '${DEMO_EMAIL}'`);
    expect(sql).toContain('RAISE EXCEPTION');
    // …and self-enforces food ownership (the service role bypasses WITH CHECK, R-13b).
    expect(sql).toMatch(/created_by_user_id IS DISTINCT FROM/);
  });

  it('writes every food ai_extraction_status = manual (R-1 — else the reap deletes them)', () => {
    // The food VALUES order is `…, ai_extraction_status, source, …`, so the
    // `manual` then `user` pair is unique to food_items rows (events also carry a
    // `source = 'manual'`, which must not be miscounted here).
    const foodManual = sql.match(/\$demolit\$manual\$demolit\$, \$demolit\$user\$demolit\$/g) ?? [];
    expect(foodManual.length).toBe(story.foods.length); // one per seeded food
    expect(sql).not.toMatch(/ai_extraction_status[^\n]*pending/i);
  });

  it('stamps logged_via = app on events and meals (not the invalid quick_log, R-11e)', () => {
    expect(sql).toMatch(/\$demolit\$app\$demolit\$::logged_via/);
    expect(sql).not.toMatch(/quick_log/);
  });

  it('dollar-quotes the apostrophe label so it cannot break out (§11 S3)', () => {
    // The apostrophe survives verbatim inside the dollar-quote tags…
    expect(sql).toContain("$demolit$Cooper's Venison LID$demolit$");
    // …and the label is NEVER single-quoted (a bare `'Cooper…` is the break-out the
    // dollar-quoting exists to prevent; the doubled `''` escape must not appear either).
    expect(sql).not.toContain("'Cooper");
    expect(sql).not.toContain("Cooper''s");
  });

  it('refuses a value that would break out of the dollar-quoting (rls-privacy residual)', () => {
    // The `timezone` is the one operator-supplied value reaching `lit()`. A value
    // containing the FULL tag, or merely ENDING in the partial tag (the closing
    // wrapper supplies the trailing `$`), must be refused — not silently emitted.
    expect(() => emitSeedSqlForParams({ ...PARAMS, timezone: 'x$demolit$; DROP TABLE food_items;--' })).toThrow(
      /dollar-quote tag/,
    );
    expect(() => emitSeedSqlForParams({ ...PARAMS, timezone: '; DROP TABLE food_items; SELECT $demolit' })).toThrow(
      /dollar-quote tag/,
    );
    // A malformed uuid is refused before any SQL is built.
    expect(() => emitSeedSqlForParams({ ...PARAMS, petId: "x'; DROP TABLE food_items;--" })).toThrow(/UUID/);
  });

  it('is a data seed, not a migration (no DDL)', () => {
    expect(sql).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+TYPE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it('has a dry-run mode that reads counts back and ROLLBACKs (§8 pre-flight)', () => {
    const dry = emitSeedSqlForParams(PARAMS, { dryRun: true });
    expect(dry.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    expect(dry).not.toContain('\nCOMMIT;');
    expect(dry).toMatch(/count\(\*\)/);
  });
});

describe('demo story — deterministic ids (re-seed leaves the same rows, §8/§13)', () => {
  it('emits byte-identical SQL across re-emits with the same params', () => {
    expect(emitSeedSqlForParams(PARAMS)).toBe(emitSeedSqlForParams(PARAMS));
  });

  it('derives ids from the pet id (a different pet yields different ids)', () => {
    const other = { ...PARAMS, petId: '33333333-3333-4333-8333-333333333333' };
    const a = emitSeedSqlForParams(PARAMS);
    const b = emitSeedSqlForParams(other);
    expect(a).not.toBe(b);
    // The venison food id is uuidV5-derived from the pet id, so it changes.
    const otherStory = buildDemoStory(other);
    expect(a).toContain(story.foods[0].id);
    expect(a).not.toContain(otherStory.foods[0].id);
    expect(b).toContain(otherStory.foods[0].id);
  });

  it('anchors the two dip meals to now() with the ≤ now − 5 min clamp (§3.2)', () => {
    const clamps = sqlClampCount(emitSeedSqlForParams(PARAMS));
    expect(clamps).toBe(4); // two dip days × two meals
  });

  it('references only foods the assertion prelude self-checks (rls-privacy residual #2)', () => {
    // The prelude's food-ownership self-check covers `story.foods` ids. Every food a
    // seeded row references — the allowed set and every meal — must be in that set,
    // or a future profile could reference a food the self-check never validated.
    const checkedIds = new Set(story.foods.map((f) => f.id));
    for (const a of story.allowedFoods) expect(checkedIds.has(a.foodId)).toBe(true);
    for (const e of story.events) {
      if (e.meal) expect(checkedIds.has(e.meal.foodId)).toBe(true);
    }
    expect(story.trial.primaryFoodId && checkedIds.has(story.trial.primaryFoodId)).toBe(true);
  });
});

function sqlClampCount(sql: string): number {
  // The dip clamp signature — `LEAST(<instant>, now() - INTERVAL '5 minutes')` —
  // appears once per dip meal; count the tail, which is unique to it.
  return (sql.match(/LEAST\(/g) ?? []).length;
}
