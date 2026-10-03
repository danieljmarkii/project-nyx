// Renders the device-pass fixture story (fixtureStory.ts) into the seed SQL the PM runs,
// via the Supabase MCP `execute_sql` (service role), on the morning of the sitting
// (CUL-1222, GC-2; the runbook is docs/device-pass-fixture-runbook.md).
//
// The demo seed's four safety properties (scripts/demo/emitSeedSql.ts, whose literal and
// statement builders this file reuses rather than restates), applied to a test account:
//
//   1. UPSERT-ONLY on deterministic uuidV5 ids. No DELETE, no bare UPDATE: a re-seed
//      moves the same rows back to their story positions (and revives a soft-deleted one),
//      so "re-run the morning of the pass" is the whole reset procedure.
//   2. ONE TRANSACTION behind an ASSERTION PRELUDE that runs before any write and RAISEs
//      (rolling everything back) unless:
//        (a) the user id and the email name the SAME auth user (C-27: the subject by id,
//            paired with its owner — a mistyped id cannot reach a real account);
//        (b) that email is a fixture alias (lib/deviceFixture.ts: `…+culprit-fixture@…`),
//            which the PM's own account and the App Review demo account can never be;
//        (c) the account owns NO pet outside the fixture's own four ids — so even a
//            fixture-tagged account that someone used for real is refused;
//        (d) no fixture id, on any table the seed upserts, already belongs to another
//            account or pet (the service role bypasses RLS, so ownership is the emitter's
//            job, and an upsert keyed on id would otherwise re-point a planted row).
//   3. RUN-TIME-RELATIVE instants (`now()`-relative SQL; today's rows clamp to now − 5 min).
//   4. DOLLAR-QUOTED literals.
//
// It writes no `event_ai_analysis`, no look, no medication and no photo (fixtureStory.ts
// § WHAT IT NEVER WRITES). Pure and runtime-neutral: jest asserts its shape, the Deno CLI
// (scripts/emit-fixture-seed.deno.ts) prints it.

import { buildFixtureStory, type FixtureStory, type FixturePet, type FixtureEvent, type FixtureStoryParams } from './fixtureStory.ts';
import { uuidLit, lit, num, bool, instantSql, dateSql, upsert } from '../demo/emitSeedSql.ts';
import { FIXTURE_EMAIL_TAG, isFixtureEmail } from '../../lib/deviceFixture.ts';

export interface FixtureEmitParams extends FixtureStoryParams {
  /** The fixture account's email. Must pass `isFixtureEmail`; the prelude re-checks it in SQL. */
  email: string;
}

export interface FixtureEmitOptions {
  /** Assert + upsert, then an error carrying the scoped counts, which rolls back: the pre-flight. */
  dryRun?: boolean;
}

/**
 * A plain single-quoted literal for the prelude's comparisons. It sits INSIDE the prelude's
 * `$do$` body, so it admits only an address-shaped charset: no quote, no backslash, and no
 * `$` (rls-privacy-reviewer, PR-21: an email carrying `$do$` closed the body early, and the
 * only thing failing it closed was an accident of the leftover text).
 */
function plainLit(v: string): string {
  if (!/^[A-Za-z0-9._%+@-]+$/.test(v)) {
    throw new Error(`emitFixtureSql: refusing a value outside the address charset: ${JSON.stringify(v)}`);
  }
  return `'${v}'`;
}

function allPetIds(story: FixtureStory): string {
  return story.pets.map((p) => uuidLit(p.id)).join(', ');
}

function allFoodIds(story: FixtureStory): string {
  return story.pets.flatMap((p) => p.foods.map((f) => uuidLit(f.id))).join(', ');
}

/**
 * Every child row the seed upserts, by table, keyed on `pet_id`. Check (d) refuses when any
 * of these ids already exists on a pet that is not a fixture pet: an upsert keyed on `id`
 * would otherwise re-point that row's `pet_id` into the fixture account. The ids are v5 and a
 * client mints v4, so no collision is accidental, but the fixture uid is readable from the
 * allowlist and the slot strings are in the repo, so one can be planted (PR-21 review).
 */
function childIds(story: FixtureStory): Array<{ table: string; ids: string[] }> {
  const events = story.pets.flatMap((p) => p.events);
  return [
    { table: 'events', ids: events.map((e) => e.eventId) },
    { table: 'meals', ids: events.flatMap((e) => (e.meal ? [e.meal.mealId] : [])) },
    { table: 'weight_checks', ids: events.flatMap((e) => (e.weight ? [e.weight.weightCheckId] : [])) },
    { table: 'diet_trials', ids: story.pets.flatMap((p) => (p.trial ? [p.trial.id] : [])) },
    { table: 'diet_trial_foods', ids: story.pets.flatMap((p) => (p.trial ? [p.trial.allowedFoodRowId] : [])) },
  ].filter((t) => t.ids.length > 0);
}

function assertionPrelude(story: FixtureStory, email: string): string {
  const u = uuidLit(story.userId);
  const e = plainLit(email.toLowerCase());
  const tag = plainLit(FIXTURE_EMAIL_TAG);
  return (
    `DO $do$\n` +
    `DECLARE\n` +
    `  v_email text;\n` +
    `BEGIN\n` +
    `  -- (a) The id and the email name the same auth user (C-27).\n` +
    `  SELECT lower(email) INTO v_email FROM auth.users WHERE id = ${u};\n` +
    `  IF v_email IS DISTINCT FROM ${e} THEN\n` +
    `    RAISE EXCEPTION 'fixture seed refused: user % is not %', ${u}, ${e};\n` +
    `  END IF;\n` +
    `  -- (b) A fixture alias: the local part ends in the tag, after a non-empty base.\n` +
    `  IF NOT (split_part(v_email, '@', 1) LIKE ('_%' || ${tag})) THEN\n` +
    `    RAISE EXCEPTION 'fixture seed refused: % is not a fixture alias', v_email;\n` +
    `  END IF;\n` +
    `  -- (c) The account holds no pet outside the fixture's own.\n` +
    `  IF EXISTS (SELECT 1 FROM pets WHERE user_id = ${u} AND id NOT IN (${allPetIds(story)})) THEN\n` +
    `    RAISE EXCEPTION 'fixture seed refused: the account owns a pet that is not a fixture pet';\n` +
    `  END IF;\n` +
    `  -- (d) No fixture id, on any table the seed writes, belongs to another account or pet.\n` +
    `  IF EXISTS (SELECT 1 FROM pets WHERE id IN (${allPetIds(story)}) AND user_id IS DISTINCT FROM ${u}) THEN\n` +
    `    RAISE EXCEPTION 'fixture seed refused: a fixture pet id belongs to another account';\n` +
    `  END IF;\n` +
    `  IF EXISTS (SELECT 1 FROM food_items WHERE id IN (${allFoodIds(story)}) AND created_by_user_id IS DISTINCT FROM ${u}) THEN\n` +
    `    RAISE EXCEPTION 'fixture seed refused: a fixture food id belongs to another account';\n` +
    `  END IF;\n` +
    childIds(story)
      .map(
        ({ table, ids }) =>
          `  IF EXISTS (SELECT 1 FROM ${table} WHERE id IN (${ids.map(uuidLit).join(', ')}) AND pet_id NOT IN (${allPetIds(story)})) THEN\n` +
          `    RAISE EXCEPTION 'fixture seed refused: a fixture ${table} id belongs to another pet';\n` +
          `  END IF;\n`,
      )
      .join('') +
    `END\n` +
    `$do$;`
  );
}

function petUpsert(story: FixtureStory, pet: FixturePet): string {
  return upsert(
    'pets',
    ['id', 'user_id', 'name', 'species', 'breed', 'weight_kg', 'is_active'],
    [
      uuidLit(pet.id),
      uuidLit(story.userId),
      lit(pet.name),
      `${lit(pet.species)}::pet_species`,
      lit(pet.breed),
      num(pet.weightKg),
      bool(true),
    ],
    ['user_id', 'name', 'species', 'breed', 'weight_kg', 'is_active', 'updated_at'],
  );
}

function foodUpserts(story: FixtureStory, pet: FixturePet): string[] {
  const u = uuidLit(story.userId);
  return pet.foods.map((f) =>
    upsert(
      'food_items',
      ['id', 'brand', 'product_name', 'format', 'food_type', 'primary_protein', 'proteins', 'is_novel_protein', 'ai_extraction_status', 'source', 'created_by_user_id'],
      [
        uuidLit(f.id),
        lit(f.brand),
        lit(f.productName),
        `${lit(f.format)}::food_format`,
        `${lit(f.foodType)}::food_type_kind`,
        lit(f.primaryProtein),
        `ARRAY[${f.proteins.map((p) => lit(p)).join(', ')}]::text[]`,
        bool(f.isNovelProtein),
        // 'manual', never the column's 'pending' default: reapStalePendingFoods hard-deletes
        // owned pending foods every sync, which would cascade the trial's allowed set away
        // (the demo seed's R-1).
        lit('manual'),
        lit('user'),
        u,
      ],
      ['brand', 'product_name', 'format', 'food_type', 'primary_protein', 'proteins', 'is_novel_protein', 'ai_extraction_status', 'source', 'created_by_user_id', 'updated_at'],
    ),
  );
}

function trialUpserts(pet: FixturePet): string[] {
  const t = pet.trial;
  if (!t) return [];
  const p = uuidLit(pet.id);
  return [
    upsert(
      'diet_trials',
      ['id', 'pet_id', 'food_item_id', 'started_at', 'target_duration_days', 'status', 'indication', 'phase', 'food_label', 'transition_started_at', 'target_protein', 'target_protein_set_at', 'ended_at'],
      [
        uuidLit(t.id),
        p,
        uuidLit(t.food.id),
        dateSql(t.startedDayOffset),
        num(t.targetDurationDays),
        `${lit('active')}::trial_status`,
        `${lit('gi')}::diet_trial_indication`,
        `${lit('elimination')}::diet_trial_phase`,
        lit(t.foodLabel),
        dateSql(t.transitionStartedDayOffset),
        lit(t.targetProtein),
        instantSql({ dayOffset: t.startedDayOffset, hour: 12, minute: 0 }),
        'NULL',
      ],
      ['pet_id', 'food_item_id', 'started_at', 'target_duration_days', 'status', 'indication', 'phase', 'food_label', 'transition_started_at', 'target_protein', 'target_protein_set_at', 'ended_at', 'updated_at'],
    ),
    upsert(
      'diet_trial_foods',
      ['id', 'diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from', 'deleted_at'],
      [
        uuidLit(t.allowedFoodRowId),
        uuidLit(t.id),
        p,
        uuidLit(t.food.id),
        `${lit('primary_diet')}::diet_trial_food_role`,
        lit(t.food.label),
        dateSql(t.startedDayOffset),
        'NULL',
      ],
      ['diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from', 'deleted_at', 'updated_at'],
    ),
  ];
}

function eventUpserts(pet: FixturePet): string[] {
  const p = uuidLit(pet.id);
  return pet.events.flatMap((e: FixtureEvent) => {
    const out = [
      upsert(
        'events',
        ['id', 'pet_id', 'event_type', 'occurred_at', 'occurred_at_confidence', 'severity', 'source', 'logged_via', 'deleted_at'],
        [
          uuidLit(e.eventId),
          p,
          `${lit(e.type)}::event_type`,
          instantSql(e.time),
          `${lit(e.confidence)}::occurred_at_confidence`,
          'NULL',
          `${lit('manual')}::event_source`,
          `${lit('app')}::logged_via`,
          // `deleted_at` is in the update set too, so a re-seed revives a row the PM
          // removed during the sitting (step 58) and the next sitting starts whole.
          'NULL',
        ],
        ['pet_id', 'event_type', 'occurred_at', 'occurred_at_confidence', 'severity', 'source', 'logged_via', 'deleted_at', 'updated_at'],
      ),
    ];
    if (e.meal) {
      const r = e.meal.intakeRating;
      out.push(
        upsert(
          'meals',
          ['id', 'event_id', 'pet_id', 'food_item_id', 'quantity', 'is_full_portion', 'intake_rating', 'logged_via'],
          [
            uuidLit(e.meal.mealId),
            uuidLit(e.eventId),
            p,
            uuidLit(e.meal.food.id),
            `${lit('normal')}::meal_quantity`,
            r == null ? 'NULL' : bool(r === 'all'),
            r == null ? 'NULL' : `${lit(r)}::intake_rating`,
            `${lit('app')}::logged_via`,
          ],
          ['event_id', 'pet_id', 'food_item_id', 'quantity', 'is_full_portion', 'intake_rating', 'logged_via', 'updated_at'],
        ),
      );
    }
    if (e.weight) {
      out.push(
        upsert(
          'weight_checks',
          ['id', 'event_id', 'pet_id', 'weight_kg'],
          [uuidLit(e.weight.weightCheckId), uuidLit(e.eventId), p, num(e.weight.weightKg)],
          ['event_id', 'pet_id', 'weight_kg', 'updated_at'],
        ),
      );
    }
    return out;
  });
}

/**
 * The dry run's read-back. `execute_sql` returns only the LAST statement's result, and a
 * SELECT before a ROLLBACK is not the last, so the counts travel in an exception message
 * instead: the DO block reads them and RAISEs, which aborts the transaction (nothing
 * persists) and puts the counts in the one place the operator is sure to see them.
 */
function dryRunReadback(story: FixtureStory): string {
  const pets = allPetIds(story);
  return (
    `DO $do$\n` +
    `DECLARE\n` +
    `  v_counts text;\n` +
    `BEGIN\n` +
    `  SELECT string_agg(format('%s: %s events, %s active trial(s)', p.name,\n` +
    `           (SELECT count(*) FROM events e WHERE e.pet_id = p.id AND e.deleted_at IS NULL),\n` +
    `           (SELECT count(*) FROM diet_trials t WHERE t.pet_id = p.id AND t.status = 'active')),\n` +
    `         '; ' ORDER BY p.name)\n` +
    `    INTO v_counts\n` +
    `    FROM pets p WHERE p.id IN (${pets}) AND p.user_id = ${uuidLit(story.userId)};\n` +
    `  RAISE EXCEPTION 'fixture DRY RUN, nothing written: %', v_counts;\n` +
    `END\n` +
    `$do$;`
  );
}

export function emitFixtureSql(story: FixtureStory, email: string, options: FixtureEmitOptions = {}): string {
  if (!isFixtureEmail(email)) {
    throw new Error(`emitFixtureSql: ${JSON.stringify(email)} is not a fixture alias (…${FIXTURE_EMAIL_TAG}@…)`);
  }
  const header =
    `-- Culprit device-pass fixture seed (CUL-1222). GENERATED by scripts/fixture/emitFixtureSql.ts.\n` +
    `-- Run via the Supabase MCP execute_sql (SERVICE ROLE). NOT a migration.\n` +
    `-- Upsert-only, one transaction, behind an assertion prelude. Pets and their declared leads:\n` +
    story.pets.map((p) => `--   ${p.name} (${p.species}): ${p.role}\n`).join('') +
    `-- ${options.dryRun ? 'DRY RUN: ends in an error carrying the counts, which rolls everything back.' : 'LIVE: COMMITs.'}\n`;

  const body: string[] = [
    'BEGIN;',
    assertionPrelude(story, email),
    upsert('user_profiles', ['id', 'timezone'], [uuidLit(story.userId), lit(story.timezone)], ['timezone', 'updated_at']),
    ...story.pets.map((p) => petUpsert(story, p)),
    ...story.pets.flatMap((p) => foodUpserts(story, p)),
    ...story.pets.flatMap((p) => trialUpserts(p)),
    ...story.pets.flatMap((p) => eventUpserts(p)),
  ];
  body.push(...(options.dryRun ? [dryRunReadback(story), 'ROLLBACK;'] : ['COMMIT;']));
  return header + '\n' + body.join('\n\n') + '\n';
}

export function emitFixtureSqlForParams(params: FixtureEmitParams, options: FixtureEmitOptions = {}): string {
  return emitFixtureSql(buildFixtureStory(params), params.email, options);
}
