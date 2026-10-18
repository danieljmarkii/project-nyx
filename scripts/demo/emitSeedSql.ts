// Renders the "Cooper" demo story (demoStory.ts) into the seed SQL that the PM
// runs via the Supabase MCP `execute_sql` (service role) at runbook step 2
// (B-271, PR 1). docs/nyx-demo-account-requirements.md §8 / §12.
//
// FOUR safety properties, all load-bearing (R-2 / R-7 / R-13b), all asserted by
// scripts/demo/demoStory.test.ts:
//
//   1. UPSERT, PLUS TWO EXACT-ID RETIREMENTS — every write is `INSERT … ON CONFLICT
//      (id) DO UPDATE`, keyed on deterministic uuidV5 ids, so a re-seed LWW-updates
//      the SAME rows in place (no ghost timeline, no second locally-active trial).
//      There is no bare UPDATE. The only DELETEs are the D13 (a) retirement of the
//      2026-08 photo slot (CUL-1848): one event_attachments row and the
//      event_ai_analysis row on that one seeded vomit, each named by its exact
//      deterministic id AND the demo pet AND a subquery pinning that pet to the demo
//      user (C-27), the §8 scoping ban's "every mutation names both scopes". After
//      the first run they match nothing.
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
   * Dry-run: emit the assertion prelude + all writes inside a transaction, then a DO
   * block that RAISEs the scoped counts (so `execute_sql` shows them) — nothing
   * persists. The operator runs this first, reads the counts, then runs the real
   * (committing) seed (§8).
   */
  dryRun?: boolean;
}

// ── Literal helpers (portable; no runtime SQL library) ───────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A UUID literal cast to ::uuid. Throws on a malformed value (defense-in-depth). */
export function uuidLit(v: string): string {
  if (!UUID_RE.test(v)) throw new Error(`emitSeedSql: not a UUID: ${JSON.stringify(v)}`);
  return `'${v}'::uuid`;
}

/**
 * A dollar-quoted string literal. Dollar-quoting means the apostrophe in
 * "Cooper's Venison LID" needs no escaping — it appears verbatim between the
 * tags. Guard: refuse a value containing `$<tag>` (the tag WITHOUT its trailing
 * `$`), so it can never break out. Checking the full `$<tag>$` would miss a value
 * that merely ENDS in `$<tag>`: the closing wrapper then supplies the trailing
 * `$`, forming `$<tag>$` and closing the literal early (rls-privacy-reviewer,
 * B-271 PR 1). `$` is the tag's only delimiter, so the `$<tag>`-substring check
 * covers the full-tag and the partial-suffix cases at once; no real label
 * contains it (there is no such value in this story, but a future edit is checked).
 */
export function lit(v: string): string {
  if (v.includes(`$${LIT_TAG}`)) {
    throw new Error(`emitSeedSql: value collides with the dollar-quote tag: ${JSON.stringify(v)}`);
  }
  return `$${LIT_TAG}$${v}$${LIT_TAG}$`;
}

export function num(v: number | null | undefined): string {
  if (v == null) return 'NULL';
  if (!Number.isFinite(v)) throw new Error(`emitSeedSql: non-finite number: ${v}`);
  return String(v);
}

export function bool(v: boolean): string {
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

export function instantSql(spec: TimeSpec): string {
  const naive =
    `${UTC_MIDNIGHT}` +
    ` + INTERVAL '1 day' * (${spec.dayOffset})` +
    ` + INTERVAL '1 hour' * (${spec.hour})` +
    ` + INTERVAL '1 minute' * (${spec.minute})`;
  const instant = `((${naive}) AT TIME ZONE 'UTC')`;
  // Dip days: never future-date today's meals — clamp to now − 5 min (§3.2).
  return spec.clampToNow ? `LEAST(${instant}, now() - INTERVAL '5 minutes')` : instant;
}

export function dateSql(dayOffset: number): string {
  return `(${UTC_MIDNIGHT} + INTERVAL '1 day' * (${dayOffset}))::date`;
}

// ── Statement builders ───────────────────────────────────────────────────────

/**
 * `INSERT … VALUES (…) ON CONFLICT (id) DO UPDATE SET …` over the given columns.
 * A re-seed LWW-updates the same row in place (§8). `updated_at` in `updateCols`
 * is set to `now()` (the "bumped updated_at" the upsert idempotency wants) rather
 * than `EXCLUDED.updated_at` — the seed never inserts an `updated_at` value.
 */
export function upsert(
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
    `  -- (4) No story id on a pet-scoped table belongs to another pet (rls-privacy F2,\n` +
    `  --     CUL-1848). Ids are client-choosable and uuidV5 of the pet id is in the repo,\n` +
    `  --     so without this an ON CONFLICT (id) DO UPDATE could overwrite another\n` +
    `  --     account's row (or, where the upsert carries pet_id, re-parent it).\n` +
    childIdChecks(story) +
    `  -- (5) The before-counts the dry run reports beside its after-counts (F1).\n` +
    `  PERFORM set_config('demo_seed.attachments_before', (SELECT count(*) FROM event_attachments WHERE event_id = ${uuidLit(story.retired.eventId)} AND pet_id = ${p})::text, true);\n` +
    `  PERFORM set_config('demo_seed.reads_before', (SELECT count(*) FROM event_ai_analysis WHERE event_id = ${uuidLit(story.retired.eventId)} AND pet_id = ${p})::text, true);\n` +
    `END\n` +
    `$do$;`
  );
}

/** Every id the seed upserts on a table that carries pet_id, grouped by table. */
function childIds(story: DemoStory): Array<{ table: string; ids: string[] }> {
  const meals = story.events.flatMap((e) => (e.meal ? [e.meal.mealId] : []));
  const weights = story.events.flatMap((e) => (e.weight ? [e.weight.weightCheckId] : []));
  return [
    { table: 'events', ids: story.events.map((e) => e.eventId) },
    { table: 'meals', ids: meals },
    { table: 'weight_checks', ids: weights },
    { table: 'diet_trials', ids: [story.trial.id] },
    { table: 'diet_trial_foods', ids: story.allowedFoods.map((a) => a.id) },
    { table: 'vet_visits', ids: [story.visit.id] },
    { table: 'vet_appointments', ids: [story.appointment.id] },
  ];
}

function childIdChecks(story: DemoStory): string {
  const p = uuidLit(story.petId);
  return childIds(story)
    .map(
      ({ table, ids }) =>
        `  IF EXISTS (SELECT 1 FROM ${table} WHERE id IN (${ids.map(uuidLit).join(', ')}) AND pet_id IS DISTINCT FROM ${p}) THEN\n` +
        `    RAISE EXCEPTION 'demo seed refused: a demo ${table} id belongs to another pet';\n` +
        `  END IF;\n`,
    )
    .join('');
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
      'vet_visit_id',
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
      uuidLit(t.vetVisitId),
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
      'vet_visit_id',
      'updated_at',
    ],
  );

  const allowed = story.allowedFoods.map((a) =>
    upsert(
      'diet_trial_foods',
      ['id', 'diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from', 'deleted_at'],
      [
        uuidLit(a.id),
        uuidLit(t.id),
        p,
        uuidLit(a.foodId),
        `${lit(a.role)}::diet_trial_food_role`,
        lit(a.foodLabel),
        dateSql(a.allowedFromDayOffset),
        'NULL',
      ],
      // `deleted_at` is in the update set so a re-seed REVIVES a soft-deleted
      // allowed-food row back to NULL — the only diet-trial table with a
      // `deleted_at`, and the one row the "venison washes out" story depends on, so
      // "re-seed heals everything" (R-7/§8) must hold even after a soft delete.
      ['diet_trial_id', 'pet_id', 'food_item_id', 'role', 'food_label', 'allowed_from', 'deleted_at', 'updated_at'],
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
  }
  return out;
}

/**
 * The scope every retirement DELETE carries: the demo pet, pinned to the demo user
 * by a subquery (C-27: a subject named by id PAIRED WITH ITS OWNER). The prelude has
 * already refused any user but the demo account, so this is the second lock.
 */
function ownedPetScope(story: DemoStory): string {
  const p = uuidLit(story.petId);
  return `pet_id = ${p} AND pet_id IN (SELECT id FROM pets WHERE id = ${p} AND user_id = ${uuidLit(story.userId)})`;
}

/**
 * D13 (a) (PM 2026-10-12, CUL-1848): the demo account carries no photo and no AI
 * read. The 2026-08 run left a photo row pointing at an object that was never
 * uploaded, and an analyze-vomit call on that vomit left one read. Both go, by exact
 * id; neither table has a soft-delete column. On every later run these match nothing,
 * and the read is kept whenever the event holds a photo of its own (a reviewer's).
 * Hydration is insert-if-absent for attachments, so a device that already synced the
 * row keeps it until sign-out (the §12.3 step 5 note); the reviewer's device is fresh.
 */
function retirePhotoSlot(story: DemoStory): string[] {
  const scope = ownedPetScope(story);
  const eventId = uuidLit(story.retired.eventId);
  const attachmentId = uuidLit(story.retired.attachmentId);
  return [
    // Only while the event holds no photo but the retired one (rls-privacy F3): a
    // reviewer who adds their own photo to this vomit gets a real read, and the
    // cadence re-seed must not take it away.
    `DELETE FROM event_ai_analysis\nWHERE event_id = ${eventId} AND ${scope}\n` +
      `  AND NOT EXISTS (SELECT 1 FROM event_attachments x WHERE x.event_id = ${eventId} AND x.id <> ${attachmentId});`,
    `DELETE FROM event_attachments\nWHERE id = ${attachmentId}\n  AND event_id = ${eventId} AND ${scope};`,
  ];
}

function visitUpserts(story: DemoStory): string[] {
  const p = uuidLit(story.petId);
  const v = story.visit;
  const a = story.appointment;
  const visitRow = upsert(
    'vet_visits',
    ['id', 'pet_id', 'visited_at', 'clinic_name', 'vet_name', 'reason', 'notes', 'next_visit_at', 'deleted_at'],
    [
      uuidLit(v.id),
      p,
      dateSql(v.visitedDayOffset),
      lit(v.clinicName),
      lit(v.vetName),
      lit(v.reason),
      lit(v.notes),
      dateSql(v.nextVisitDayOffset),
      'NULL',
    ],
    // pet_id is never in the update set: 067 makes a visit's pet immutable, and the
    // conflict row is this pet's by its deterministic id.
    ['visited_at', 'clinic_name', 'vet_name', 'reason', 'notes', 'next_visit_at', 'deleted_at', 'updated_at'],
  );
  const appointmentRow = upsert(
    'vet_appointments',
    [
      'id',
      'pet_id',
      'scheduled_at',
      'clinic_name',
      'vet_name',
      'reason',
      'questions',
      'notes_draft',
      'vet_visit_id',
      'cancelled_at',
      'deleted_at',
    ],
    [
      uuidLit(a.id),
      p,
      instantSql(a.scheduled),
      lit(a.clinicName),
      lit(a.vetName),
      lit(a.reason),
      'NULL',
      'NULL',
      'NULL',
      'NULL',
      'NULL',
    ],
    // A re-seed moves the booking forward with now() and revives it if the reviewer
    // cancelled or deleted it; questions and notes_draft are the reviewer's to type
    // and are left as they are.
    ['scheduled_at', 'clinic_name', 'vet_name', 'reason', 'vet_visit_id', 'cancelled_at', 'deleted_at', 'updated_at'],
  );
  return [visitRow, appointmentRow];
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

/**
 * The dry run's read-back (rls-privacy F1). `execute_sql` returns only the LAST
 * statement's result, and a SELECT before a ROLLBACK is not the last, so the counts
 * travel in an exception message (the fixture seed's shape, emitFixtureSql.ts): the DO
 * block reads them and RAISEs, which aborts the transaction (nothing persists) and puts
 * them where the operator is sure to see them. The two retired tables report
 * before -> after, from the settings the prelude stored.
 */
function dryRunReadback(story: DemoStory): string {
  const p = uuidLit(story.petId);
  const u = uuidLit(story.userId);
  const e = uuidLit(story.retired.eventId);
  return (
    `DO $do$\n` +
    `DECLARE\n` +
    `  v_counts text;\n` +
    `BEGIN\n` +
    `  SELECT format(\n` +
    `    'food_items %s, diet_trials %s, diet_trial_foods %s, events %s, meals %s, weight_checks %s, ' ||\n` +
    `    'vet_visits %s, vet_appointments %s, trial linked to visit %s, ' ||\n` +
    `    'retired-event attachments %s -> %s, retired-event reads %s -> %s, pet attachments %s, pet reads %s',\n` +
    `    (SELECT count(*) FROM food_items WHERE created_by_user_id = ${u}),\n` +
    `    (SELECT count(*) FROM diet_trials WHERE pet_id = ${p}),\n` +
    `    (SELECT count(*) FROM diet_trial_foods WHERE pet_id = ${p} AND deleted_at IS NULL),\n` +
    `    (SELECT count(*) FROM events WHERE pet_id = ${p} AND deleted_at IS NULL),\n` +
    `    (SELECT count(*) FROM meals WHERE pet_id = ${p}),\n` +
    `    (SELECT count(*) FROM weight_checks WHERE pet_id = ${p}),\n` +
    `    (SELECT count(*) FROM vet_visits WHERE pet_id = ${p} AND deleted_at IS NULL),\n` +
    `    (SELECT count(*) FROM vet_appointments WHERE pet_id = ${p} AND deleted_at IS NULL),\n` +
    `    (SELECT count(*) FROM diet_trials WHERE id = ${uuidLit(story.trial.id)} AND vet_visit_id = ${uuidLit(story.visit.id)}),\n` +
    `    current_setting('demo_seed.attachments_before', true),\n` +
    `    (SELECT count(*) FROM event_attachments WHERE event_id = ${e} AND pet_id = ${p}),\n` +
    `    current_setting('demo_seed.reads_before', true),\n` +
    `    (SELECT count(*) FROM event_ai_analysis WHERE event_id = ${e} AND pet_id = ${p}),\n` +
    `    (SELECT count(*) FROM event_attachments WHERE pet_id = ${p}),\n` +
    `    (SELECT count(*) FROM event_ai_analysis WHERE pet_id = ${p})\n` +
    `  ) INTO v_counts;\n` +
    `  RAISE EXCEPTION 'demo DRY RUN, nothing written: %', v_counts;\n` +
    `END\n` +
    `$do$;`
  );
}

/**
 * Render the whole seed. `dryRun` runs the asserts + writes, RAISEs the counts (F1),
 * then ROLLBACKs so nothing persists — the operator's pre-flight (§8).
 */
export function emitSeedSql(story: DemoStory, options: EmitOptions = {}): string {
  const header =
    `-- Culprit App Review demo seed — "${story.pet.name}" (B-271, PR 1).\n` +
    `-- GENERATED by scripts/demo/emitSeedSql.ts from scripts/demo/demoStory.ts.\n` +
    `-- Run via the Supabase MCP execute_sql (SERVICE ROLE) at runbook step 2.\n` +
    `-- NOT a migration. Upserts + two exact-id retirements + assertion prelude + transaction (§8).\n` +
    `-- ${options.dryRun ? 'DRY RUN — RAISEs the counts as an error; nothing persists.' : 'LIVE — COMMITs.'}\n`;

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
    ...retirePhotoSlot(story),
    ...foodUpserts(story),
    // The visit before the trial: the trial's vet_visit_id names it, and 066's
    // same-pet guard looks the visit up when the link is written.
    ...visitUpserts(story),
    ...trialUpserts(story),
    ...eventUpserts(story),
  ];

  if (options.dryRun) {
    body.push(dryRunReadback(story), 'ROLLBACK;');
  } else {
    body.push('COMMIT;');
  }

  return header + '\n' + body.join('\n\n') + '\n';
}

/** Convenience: build the story from params and emit in one call. */
export function emitSeedSqlForParams(params: DemoStoryParams, options: EmitOptions = {}): string {
  return emitSeedSql(buildDemoStory(params), options);
}
