// Renders the "Cooper" demo story (demoStory.ts) into the seed SQL that the PM
// runs via the Supabase MCP `execute_sql` (service role) at runbook step 2
// (B-271, PR 1). docs/nyx-demo-account-requirements.md §8 / §12.
//
// FOUR safety properties, all load-bearing (R-2 / R-7 / R-13b), all asserted by
// scripts/demo/demoStory.test.ts:
//
//   1. UPSERT-ONLY — every write is `INSERT … ON CONFLICT (id) DO UPDATE`, keyed
//      on deterministic uuidV5 ids. There is NO bare DELETE and NO bare UPDATE in
//      the output, so a re-seed LWW-updates the SAME rows in place (no ghost
//      timeline, no orphaned Storage objects, no second locally-active trial) and
//      the destructive service-role DELETE that made the v2 design a blocker is
//      gone. This is the strongest form of the §8 scoping ban: not "every mutation
//      names both scopes" but "there is no unscoped mutation to name".
//
//   2. TRANSACTION + ASSERTION PRELUDE — the whole seed runs inside one
//      transaction, and a `DO` prelude runs BEFORE any write. It refuses to
//      proceed unless the target user's email is EXACTLY `support@getculprit.app`
//      (DB-4), the target pet is owned by that user, and no demo food id already
//      belongs to a different account (the food-ownership self-check the service
//      role's RLS bypass makes the emitter's job — R-13b). Any failure RAISEs and
//      the transaction rolls back, so a wrong id can't touch a real account.
//
//   3. RUN-TIME-RELATIVE — every instant is a `now()`-relative Postgres
//      expression (never a baked literal), so the committed .sql is timeless and
//      "re-run" means re-run (§8). The intake-DIP days are UTC-date-anchored and
//      clamped to `now() - 5 min`, mirroring demoStory.materializeInstant exactly.
//
//   4. DOLLAR-QUOTED LITERALS — every string literal is dollar-quoted with a tag
//      that the emitter guards is absent from the value, so an apostrophe label
//      ("Cooper's Venison LID") can never break out of its quoting (the §11 S3
//      property test).
//
// It is NOT a migration (nothing in supabase/migrations/): it writes rows to
// existing tables and never alters schema. Pure and runtime-neutral (portable
// string building only) so it runs identically under Node (jest) and Deno (the
// scripts/emit-demo-seed.deno.ts CLI).

import {
  buildDemoStory,
  materializeDate,
  type DemoEvent,
  type DemoStory,
  type DemoStoryParams,
  type TimeSpec,
} from './demoStory.ts';

/** The one demo account the assertion prelude will accept (DB-4 / §8). */
export const DEMO_EMAIL = 'support@getculprit.app';
/** All seeded foods carry this so `reapStalePendingFoods` never deletes them (R-1). */
export const FOOD_EXTRACTION_STATUS = 'manual';
/** Dollar-quote tag for string literals; guarded absent from every value emitted. */
const LIT_TAG = 'demolit';

export interface EmitOptions {
  /**
   * Dry-run: emit the assertion prelude + all upserts inside a transaction, then a
   * scoped counts read-back, then ROLLBACK — nothing persists. The operator runs
   * this first, reads the counts, then runs the real (committing) seed (§8).
   */
  dryRun?: boolean;
}

// ── Literal helpers (portable; no runtime SQL library) ───────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A UUID literal cast to ::uuid. Throws on a malformed value (defense-in-depth). */
function uuidLit(v: string): string {
  if (!UUID_RE.test(v)) throw new Error(`emitSeedSql: not a UUID: ${JSON.stringify(v)}`);
  return `'${v}'::uuid`;
}

/**
 * A dollar-quoted string literal. Dollar-quoting means the apostrophe in
 * "Cooper's Venison LID" needs no escaping — it appears verbatim between the
 * tags. Guard: refuse a value that itself contains the tag, so it can never break
 * out (there is no such value in this story, but a future label edit is checked).
 */
function lit(v: string): string {
  if (v.includes(`$${LIT_TAG}$`)) {
    throw new Error(`emitSeedSql: value collides with the dollar-quote tag: ${JSON.stringify(v)}`);
  }
  return `$${LIT_TAG}$${v}$${LIT_TAG}$`;
}

function num(v: number | null | undefined): string {
  if (v == null) return 'NULL';
  if (!Number.isFinite(v)) throw new Error(`emitSeedSql: non-finite number: ${v}`);
  return String(v);
}

function bool(v: boolean): string {
  return v ? 'TRUE' : 'FALSE';
}

// ── Time expressions — the run-time-relative twin of demoStory.materializeInstant ──
//
// `date_trunc('day', now() AT TIME ZONE 'UTC')` is UTC midnight of now's UTC date
// as a naive timestamp; `+ INTERVAL '1 unit' * n` shifts by whole units, sign-safe
// (multiplication carries the sign, unlike a signed interval string); `AT TIME
// ZONE 'UTC'` reinterprets the naive timestamp as a UTC instant → timestamptz.
// This equals utcMidnight(now) + dayOffset·day + hh:mm exactly, so the tests
// (which materialize) validate what this SQL produces (which the reviewer runs).

const UTC_MIDNIGHT = `date_trunc('day', now() AT TIME ZONE 'UTC')`;

function instantSql(spec: TimeSpec): string {
  const naive =
    `${UTC_MIDNIGHT}` +
    ` + INTERVAL '1 day' * (${spec.dayOffset})` +
    ` + INTERVAL '1 hour' * (${spec.hour})` +
    ` + INTERVAL '1 minute' * (${spec.minute})`;
  const instant = `((${naive}) AT TIME ZONE 'UTC')`;
  // Dip days: never future-date today's meals — clamp to now − 5 min (§3.2).
  return spec.clampToNow ? `LEAST(${instant}, now() - INTERVAL '5 minutes')` : instant;
}

function dateSql(dayOffset: number): string {
  return `(${UTC_MIDNIGHT} + INTERVAL '1 day' * (${dayOffset}))::date`;
}

// ── Statement builders ───────────────────────────────────────────────────────

/**
 * `INSERT … VALUES (…) ON CONFLICT (id) DO UPDATE SET …` over the given columns.
 * A re-seed LWW-updates the same row in place (§8). `updated_at` in `updateCols`
 * is set to `now()` (the "bumped updated_at" the upsert idempotency wants) rather
 * than `EXCLUDED.updated_at` — the seed never inserts an `updated_at` value.
 */
function upsert(
  table: string,
  cols: string[],
  values: string[],
  updateCols: string[],
): string {
  const set = updateCols
    .map((c) => (c === 'updated_at' ? 'updated_at = now()' : `${c} = EXCLUDED.${c}`))
    .join(', ');
  return (
    `INSERT INTO ${table} (${cols.join(', ')})\n` +
    `VALUES (${values.join(', ')})\n` +
    `ON CONFLICT (id) DO UPDATE SET ${set};`
  );
}

function assertionPrelude(story: DemoStory): string {
  const u = uuidLit(story.userId);
  const p = uuidLit(story.petId);
  // Every seeded food id — not just the first two — so the self-check stays
  // complete for a future story profile that seeds more foods (B-324).
  const foodIds = story.foods.map((f) => uuidLit(f.id)).join(', ');
  // Plain string comparisons inside the DO block use a distinct dollar tag ($do$)
  // for the block body; the email has no apostrophe, so a simple '…' literal is safe.
  return (
    `DO $do$\n` +
    `DECLARE\n` +
    `  v_email text;\n` +
    `  v_owner uuid;\n` +
    `BEGIN\n` +
    `  -- (1) The target user is the ratified demo account, by EXACT email match (DB-4).\n` +
    `  SELECT email INTO v_email FROM auth.users WHERE id = ${u};\n` +
    `  IF v_email IS DISTINCT FROM '${DEMO_EMAIL}' THEN\n` +
    `    RAISE EXCEPTION 'demo seed refused: user % is not the demo account (email=%)', ${u}, COALESCE(v_email, '(none)');\n` +
    `  END IF;\n` +
    `  -- (2) The target pet is owned by that user (the §5 ownership graph).\n` +
    `  SELECT user_id INTO v_owner FROM pets WHERE id = ${p};\n` +
    `  IF v_owner IS DISTINCT FROM ${u} THEN\n` +
    `    RAISE EXCEPTION 'demo seed refused: pet % is not owned by the demo user', ${p};\n` +
    `  END IF;\n` +
    `  -- (3) Food-ownership self-check (D5 / R-13b): the service role bypasses the\n` +
    `  --     diet_trial_foods WITH CHECK, so the emitter enforces food ownership —\n` +
    `  --     a deterministic demo food id must not already belong to another account.\n` +
    `  IF EXISTS (\n` +
    `    SELECT 1 FROM food_items\n` +
    `    WHERE id IN (${foodIds})\n` +
    `      AND created_by_user_id IS DISTINCT FROM ${u}\n` +
    `  ) THEN\n` +
    `    RAISE EXCEPTION 'demo seed refused: a demo food id already belongs to another account';\n` +
    `  END IF;\n` +
    `END\n` +
    `$do$;`
  );
}

function foodUpserts(story: DemoStory): string[] {
  const u = uuidLit(story.userId);
  return story.foods.map((f) => {
    const proteins = `ARRAY[${f.proteins.map((p) => lit(p)).join(', ')}]::text[]`;
    return upsert(
      'food_items',
      [
        'id',
        'brand',
        'product_name',
        'format',
        'food_type',
        'primary_protein',
        'proteins',
        'is_novel_protein',
        'ai_extraction_status',
        'source',
        'created_by_user_id',
      ],
      [
        uuidLit(f.id),
        lit(f.brand),
        lit(f.productName),
        `${lit(f.format)}::food_format`,
        `${lit(f.foodType)}::food_type_kind`,
        lit(f.primaryProtein),
        proteins,
        bool(f.isNovelProtein),
        // 'manual' — the column defaults to 'pending', and reapStalePendingFoods
        // hard-deletes owned pending foods every sync cycle, cascading away the
        // trial's allowed set and both findings (R-1, the highest-severity finding).
        lit(FOOD_EXTRACTION_STATUS),
        lit('user'),
        u,
      ],
      [
        'brand',
        'product_name',
        'format',
        'food_type',
        'primary_protein',
        'proteins',
        'is_novel_protein',
        'ai_extraction_status',
        'source',
        'created_by_user_id',
        'updated_at',
      ],
    );
  });
}

function trialUpserts(story: DemoStory): string[] {
  const t = story.trial;
  const p = uuidLit(story.petId);
  const trialRow = upsert(
    'diet_trials',
    [
      'id',
      'pet_id',
      'food_item_id',
      'started_at',
      'target_duration_days',
      'status',
      'indication',
      'phase',
      'food_label',
      'transition_started_at',
      'target_protein',
      'target_protein_set_at',
      'ended_at',
    ],
    [
      uuidLit(t.id),
      p,
      uuidLit(t.primaryFoodId),
      dateSql(t.startedDayOffset),
      num(t.targetDurationDays),
      `${lit(t.status)}::trial_status`,
      `${lit(t.indication)}::diet_trial_indication`,
      `${lit(t.phase)}::diet_trial_phase`,
      lit(t.foodLabel),
      dateSql(t.transitionStartedDayOffset),
      lit(t.targetProtein),
      // set_at is paired-non-null with target_protein (§5 write contract); use the
      // trial-start instant so TP-3 provenance reads "confirmed day 1".
      instantSql({ dayOffset: t.targetProteinSetDayOffset, hour: 12, minute: 0 }),
      'NULL',
    ],
    [
      'pet_id',
      'food_item_id',
      'started_at',
      'target_duration_days',
      'status',
      'indication',
      'phase',
      'food_label',
      'transition_started_at',
      'target_protein',
      'target_protein_set_at',
      'ended_at',
      'updated_at',
    ],
  );

  const allowed = story.allowedFoods.map((a) =>
    upsert(
      'diet_trial_foods',
      ['id', 'diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from'],
      [
        uuidLit(a.id),
        uuidLit(t.id),
        p,
        uuidLit(a.foodId),
        `${lit(a.role)}::diet_trial_food_role`,
        lit(a.foodLabel),
        dateSql(a.allowedFromDayOffset),
      ],
      ['diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from', 'updated_at'],
    ),
  );

  return [trialRow, ...allowed];
}

function eventUpserts(story: DemoStory): string[] {
  const p = uuidLit(story.petId);
  const out: string[] = [];
  for (const e of story.events) {
    out.push(eventRow(e, p));
    if (e.kind === 'meal' && e.meal) {
      out.push(
        upsert(
          'meals',
          ['id', 'event_id', 'pet_id', 'food_item_id', 'quantity', 'is_full_portion', 'intake_rating', 'logged_via'],
          [
            uuidLit(e.meal.mealId),
            uuidLit(e.eventId),
            p,
            uuidLit(e.meal.foodId),
            `${lit('normal')}::meal_quantity`,
            e.meal.intakeRating == null ? 'NULL' : bool(e.meal.intakeRating === 'all'),
            e.meal.intakeRating == null ? 'NULL' : `${lit(e.meal.intakeRating)}::intake_rating`,
            `${lit('app')}::logged_via`,
          ],
          ['event_id', 'pet_id', 'food_item_id', 'quantity', 'is_full_portion', 'intake_rating', 'logged_via', 'updated_at'],
        ),
      );
    }
    if (e.kind === 'weight_check' && e.weight) {
      out.push(
        upsert(
          'weight_checks',
          ['id', 'event_id', 'pet_id', 'weight_kg'],
          [uuidLit(e.weight.weightCheckId), uuidLit(e.eventId), p, num(e.weight.weightKg)],
          ['event_id', 'pet_id', 'weight_kg', 'updated_at'],
        ),
      );
    }
    if (e.photo) {
      // Tier-2 photo METADATA only (stable id + path). The benign image BYTES and
      // the analyze-vomit read land LIVE, in-app, at runbook step 3 (§9, R-9) — the
      // seed never uploads bytes and never writes event_ai_analysis (§5). The stable
      // id + path are what make the live-added read survive every re-seed (R-7).
      out.push(
        upsert(
          'event_attachments',
          ['id', 'event_id', 'pet_id', 'storage_path', 'mime_type', 'sort_order'],
          [
            uuidLit(e.photo.attachmentId),
            uuidLit(e.eventId),
            p,
            lit(e.photo.storagePath),
            lit(e.photo.mimeType),
            '0',
          ],
          ['event_id', 'pet_id', 'storage_path', 'mime_type', 'sort_order'],
        ),
      );
    }
  }
  return out;
}

function eventRow(e: DemoEvent, petIdLit: string): string {
  const eventType =
    e.kind === 'meal' ? 'meal' : e.kind === 'vomit' ? 'vomit' : e.kind === 'stool_normal' ? 'stool_normal' : 'weight_check';
  return upsert(
    'events',
    ['id', 'pet_id', 'event_type', 'occurred_at', 'occurred_at_confidence', 'severity', 'source', 'logged_via', 'deleted_at'],
    [
      uuidLit(e.eventId),
      petIdLit,
      `${lit(eventType)}::event_type`,
      instantSql(e.time),
      `${lit(e.occurredAtConfidence)}::occurred_at_confidence`,
      num(e.severity),
      `${lit('manual')}::event_source`,
      `${lit('app')}::logged_via`,
      'NULL',
    ],
    [
      'pet_id',
      'event_type',
      'occurred_at',
      'occurred_at_confidence',
      'severity',
      'source',
      'logged_via',
      'deleted_at',
      'updated_at',
    ],
  );
}

/** A scoped counts read-back for the dry-run — what the seed WOULD leave behind. */
function countsReadback(story: DemoStory): string {
  const p = uuidLit(story.petId);
  const u = uuidLit(story.userId);
  return (
    `SELECT 'food_items' AS entity, count(*) AS n FROM food_items WHERE created_by_user_id = ${u}\n` +
    `UNION ALL SELECT 'diet_trials', count(*) FROM diet_trials WHERE pet_id = ${p}\n` +
    `UNION ALL SELECT 'diet_trial_foods', count(*) FROM diet_trial_foods WHERE pet_id = ${p} AND deleted_at IS NULL\n` +
    `UNION ALL SELECT 'events', count(*) FROM events WHERE pet_id = ${p} AND deleted_at IS NULL\n` +
    `UNION ALL SELECT 'meals', count(*) FROM meals WHERE pet_id = ${p}\n` +
    `UNION ALL SELECT 'weight_checks', count(*) FROM weight_checks WHERE pet_id = ${p}\n` +
    `UNION ALL SELECT 'event_attachments', count(*) FROM event_attachments WHERE pet_id = ${p}\n` +
    `ORDER BY entity;`
  );
}

/**
 * Render the whole seed. `dryRun` runs the asserts + upserts, reads counts back,
 * then ROLLBACKs so nothing persists — the operator's pre-flight (§8).
 */
export function emitSeedSql(story: DemoStory, options: EmitOptions = {}): string {
  const header =
    `-- Culprit App Review demo seed — "${story.pet.name}" (B-271, PR 1).\n` +
    `-- GENERATED by scripts/demo/emitSeedSql.ts from scripts/demo/demoStory.ts.\n` +
    `-- Run via the Supabase MCP execute_sql (SERVICE ROLE) at runbook step 2.\n` +
    `-- NOT a migration. Upsert-only + assertion-prelude + transaction (§8).\n` +
    `-- ${options.dryRun ? 'DRY RUN — reads counts back, then ROLLBACKs (nothing persists).' : 'LIVE — COMMITs.'}\n`;

  const body: string[] = [
    'BEGIN;',
    assertionPrelude(story),
    // user_profiles: set the timezone detector ⑥ reads. Upsert (not a bare UPDATE)
    // so the seed stays mutation-free; the row exists (signup trigger) so this is
    // effectively an update, scoped to the demo user by the primary key.
    upsert(
      'user_profiles',
      ['id', 'timezone'],
      [uuidLit(story.userId), lit(story.timezone)],
      ['timezone', 'updated_at'],
    ),
    ...foodUpserts(story),
    ...trialUpserts(story),
    ...eventUpserts(story),
  ];

  if (options.dryRun) {
    body.push(countsReadback(story), 'ROLLBACK;');
  } else {
    body.push('COMMIT;');
  }

  return header + '\n' + body.join('\n\n') + '\n';
}

/** Convenience: build the story from params and emit in one call. */
export function emitSeedSqlForParams(params: DemoStoryParams, options: EmitOptions = {}): string {
  return emitSeedSql(buildDemoStory(params), options);
}
