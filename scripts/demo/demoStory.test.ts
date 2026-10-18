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
import { uuidV5 } from './uuidv5';
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

describe('uuidV5 — the hand-rolled crypto matches RFC 4122 v5 (golden vectors)', () => {
  // The seed's row ids are `uuidV5(slotKey, petId)`. uuidv5.ts implements SHA-1 by
  // hand (the `uuid` package won't resolve in the Deno --cached-only graph, and has
  // no bundled types), so this is its ONLY regression net: any drift from RFC 4122
  // v5 changes every seeded id, silently orphaning previously-synced rows on a
  // re-seed. These expected values were GENERATED ONCE from `uuid@7.0.3`'s v5() and
  // frozen here — including the well-known nil-namespace empty-name vector
  // (e129f27c-…) — so the test pins the output without a runtime `uuid` dependency.
  // [namespace, name, expected].
  const VECTORS: ReadonlyArray<readonly [string, string, string]> = [
    [PARAMS.petId, 'food-venison', '8800c716-de1d-5d9e-ab1b-e3504d4e8666'],
    [PARAMS.petId, 'food-beef', '66228a65-e208-5c86-847f-5e3498a711b1'],
    [PARAMS.petId, 'trial', '27a00220-01a4-50e5-92bf-457f3e4be5c8'],
    [PARAMS.petId, 'trial-food-venison', '37f0339f-0a40-5c0f-bc58-3cc5df8458ba'],
    [PARAMS.petId, 'event:meal-venison-d-16-am', '01ab78c7-a02e-5443-949c-c9eda7f6241e'],
    [PARAMS.petId, 'meal:treat-beef-d-3', '82045a58-02c4-5bd2-bf14-49d5dc826602'],
    [PARAMS.petId, 'attachment:vomit-d-3', '6e2b21dc-84d5-5b61-ab56-fbf7a36dd071'],
    [PARAMS.petId, "Cooper's Venison LID", 'a3a57f49-b79c-54bb-ae3b-66c1d7534cea'], // apostrophe
    [PARAMS.petId, '', 'ebee6950-a528-5f23-9c6f-8f6adebbd11e'], // empty name
    [PARAMS.petId, '日本語🐕', '749c0c05-760e-5863-a37c-a65c026c71e2'], // multibyte + surrogate pair
    ['6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'food-venison', 'a2d13618-1d63-5c00-9584-15b7cf65bb61'], // DNS ns
    ['00000000-0000-0000-0000-000000000000', '', 'e129f27c-5103-5c5c-844b-cdf0a15e160d'], // known nil-ns vector
  ];

  it('produces the exact v5 UUID for every golden vector', () => {
    for (const [ns, name, expected] of VECTORS) {
      const mine = uuidV5(name, ns);
      expect(mine).toBe(expected);
      // version 5 + RFC 4122 variant bits.
      expect(mine).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('is deterministic and rejects a non-UUID namespace', () => {
    expect(uuidV5('food-venison', PARAMS.petId)).toBe(uuidV5('food-venison', PARAMS.petId));
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(/UUID/);
  });
});

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

  it('deletes only the two retired photo-slot rows, each by exact id + demo pet + owner (§8 scoping ban, C-27)', () => {
    // `deleted_at`/`updated_at` are not word-boundary matches for DELETE/UPDATE.
    const deletes = sql.split(/;\n/).filter((stmt) => /\bDELETE\s+FROM\b/i.test(stmt));
    expect(deletes).toHaveLength(2);
    const ownerScope =
      `pet_id = '${PARAMS.petId}'::uuid AND pet_id IN (SELECT id FROM pets ` +
      `WHERE id = '${PARAMS.petId}'::uuid AND user_id = '${PARAMS.userId}'::uuid)`;
    for (const stmt of deletes) expect(stmt).toContain(ownerScope);
    const [readDelete, attachmentDelete] = deletes;
    expect(readDelete).toMatch(/DELETE FROM event_ai_analysis\nWHERE event_id = /);
    expect(readDelete).toContain(story.retired.eventId);
    expect(attachmentDelete).toMatch(/DELETE FROM event_attachments\nWHERE id = /);
    expect(attachmentDelete).toContain(story.retired.attachmentId);
    expect(attachmentDelete).toContain(story.retired.eventId);
    // Both run after the prelude and before the story's rows, inside the transaction.
    const prelude = sql.indexOf('$do$;');
    const firstInsert = sql.indexOf('INSERT INTO food_items');
    expect(sql.indexOf('DELETE FROM event_ai_analysis')).toBeGreaterThan(prelude);
    expect(sql.indexOf('DELETE FROM event_attachments')).toBeLessThan(firstInsert);
  });

  it('keeps a reviewer\'s own read: the read delete skips an event holding any other photo (rls-privacy F3)', () => {
    const readDelete = sql.slice(sql.indexOf('DELETE FROM event_ai_analysis'));
    expect(readDelete.slice(0, readDelete.indexOf(';'))).toContain(
      `AND NOT EXISTS (SELECT 1 FROM event_attachments x WHERE x.event_id = '${story.retired.eventId}'::uuid ` +
        `AND x.id <> '${story.retired.attachmentId}'::uuid)`,
    );
  });

  it('refuses any story id already owned by another pet, on every pet-scoped table it writes (rls-privacy F2)', () => {
    const prelude = sql.slice(0, sql.indexOf('$do$;'));
    const story_ = story;
    const expectations: Array<[string, string]> = [
      ['events', story_.events[0].eventId],
      ['meals', story_.events.find((e) => e.meal)!.meal!.mealId],
      ['weight_checks', story_.events.find((e) => e.weight)!.weight!.weightCheckId],
      ['diet_trials', story_.trial.id],
      ['diet_trial_foods', story_.allowedFoods[0].id],
      ['vet_visits', story_.visit.id],
      ['vet_appointments', story_.appointment.id],
    ];
    for (const [table, id] of expectations) {
      const check = new RegExp(
        `IF EXISTS \\(SELECT 1 FROM ${table} WHERE id IN \\([^)]*'${id}'::uuid[^)]*\\) ` +
          `AND pet_id IS DISTINCT FROM '${PARAMS.petId}'::uuid\\) THEN\\n` +
          `    RAISE EXCEPTION 'demo seed refused: a demo ${table} id belongs to another pet'`,
      );
      expect(prelude).toMatch(check);
    }
  });

  it('retires the exact ids the 2026-08 story wrote (golden: attachment:vomit-d-3)', () => {
    expect(story.retired.attachmentId).toBe('6e2b21dc-84d5-5b61-ab56-fbf7a36dd071');
    expect(story.retired.eventId).toBe(uuidV5('event:vomit-d-3', PARAMS.petId));
    expect(story.events.some((e) => e.eventId === story.retired.eventId && e.kind === 'vomit')).toBe(true);
  });

  it('seeds no photo and no AI read (D13 (a))', () => {
    expect(sql).not.toMatch(/INSERT INTO event_attachments/);
    expect(sql).not.toMatch(/INSERT INTO event_ai_analysis/);
    expect(sql).not.toMatch(/ai_consent/);
    expect(sql).not.toMatch(/\.jpg/);
  });

  it('has no bare UPDATE: every UPDATE is an upsert', () => {
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

  it('delivers the dry-run counts as the error execute_sql returns, before and after the retirement (rls-privacy F1)', () => {
    const dry = emitSeedSqlForParams(PARAMS, { dryRun: true });
    // execute_sql returns only the last statement's result, so the counts ride a RAISE.
    expect(dry).toContain(`RAISE EXCEPTION 'demo DRY RUN, nothing written: %', v_counts;`);
    expect(dry.indexOf('demo DRY RUN')).toBeGreaterThan(dry.lastIndexOf('INSERT INTO'));
    expect(dry).toContain("current_setting('demo_seed.attachments_before', true)");
    expect(dry).toContain("current_setting('demo_seed.reads_before', true)");
    // The before-counts are stored in the prelude, ahead of the deletes, transaction-local.
    const stored = dry.indexOf("set_config('demo_seed.reads_before'");
    expect(stored).toBeGreaterThan(-1);
    expect(stored).toBeLessThan(dry.indexOf('DELETE FROM event_ai_analysis'));
    expect(dry).toMatch(/set_config\('demo_seed\.attachments_before', [^\n]*, true\)/);
    // The live seed carries no dry-run RAISE.
    expect(emitSeedSqlForParams(PARAMS)).not.toContain('demo DRY RUN');
  });
});

describe('demo story — the logged visit and the booked recheck (CUL-1848)', () => {
  const sql = emitSeedSqlForParams(PARAMS);
  const { visit, appointment, trial } = story;

  it('logs the visit before the transition and every seeded event, so the report window keeps the whole record', () => {
    expect(visit.visitedDayOffset).toBeLessThan(trial.transitionStartedDayOffset);
    for (const e of story.events) expect(visit.visitedDayOffset).toBeLessThan(e.time.dayOffset);
  });

  it('books the recheck inside Home\'s five-day window, still upcoming after a 48h-late re-seed read', () => {
    const now = SEED_MS;
    const at = Date.parse(materializeInstantIso(appointment.scheduled, now));
    expect(at).toBeGreaterThan(now + 2 * DAY_MS);
    expect(at).toBeLessThan(now + 5 * DAY_MS);
    expect(visit.nextVisitDayOffset).toBe(appointment.scheduled.dayOffset);
  });

  it('links the trial to the visit and writes the visit first', () => {
    expect(trial.vetVisitId).toBe(visit.id);
    const visitAt = sql.indexOf('INSERT INTO vet_visits');
    const trialAt = sql.indexOf('INSERT INTO diet_trials');
    expect(visitAt).toBeGreaterThan(-1);
    expect(visitAt).toBeLessThan(trialAt);
    expect(sql).toContain('INSERT INTO vet_appointments');
  });

  it('never moves a visit to another pet (067: pet_id stays out of the update set)', () => {
    const visitStmt = sql.slice(sql.indexOf('INSERT INTO vet_visits'));
    const set = visitStmt.slice(visitStmt.indexOf('DO UPDATE SET'), visitStmt.indexOf(';'));
    expect(set).not.toMatch(/\bpet_id\b/);
  });

  it('keeps the visit note a plan, never an exam verdict', () => {
    expect(visit.notes).not.toMatch(/normal|healthy|fine|well\b|unremarkable/i);
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
