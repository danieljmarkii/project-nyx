// CUL-677 / W1-PR-4 — emit the one-time `other`-row swap SQL from a PM-reviewed id list.
//
// Spec: docs/nyx-event-taxonomy-requirements.md §11 (D3), as hardened by the
// 2026-08-27 product-team review on CUL-677 (T&S + Dir. Eng lenses).
//
// This module is PURE: it takes an already-reviewed list and returns a SQL string.
// It reads no files, touches no network, and — deliberately — has no way to LEARN a
// row's note text, so the emitted SQL cannot leak one. The CLI wrapper is
// `emit.deno.ts`; the safety properties below are pinned by `emitSwapSql.test.ts`.
//
// FIVE safety properties, all load-bearing, all asserted by that suite:
//
//   1. OWNER SCOPE, on the read AND the write. §11's original SQL carried no
//      account predicate and runs on the service-role path, which HR-28 proved sees
//      every account — including a QA mirror holding 16 `other` rows on a pet ALSO
//      named "Nyx", in the same date range, with the same cough/sneeze notes. A
//      per-row review of (id, occurred_at, note) shows the reviewer no account
//      signal, so human review cannot substitute for the predicate and RLS does not
//      backstop a service-role write. Every statement here is scoped to the pets of
//      the reviewing owner, resolved from their email.
//
//   2. THE PRELUDE REFUSES RATHER THAN DRIFTS. Every reviewed id must still be an
//      un-deleted `other` row owned by that user, and the count must match what the
//      review approved. The list is a SNAPSHOT — `other` grew +11 rows in 13 days
//      while this was being specced, and the run is gated behind a TestFlight cut —
//      so a stale list is the expected failure, and it fails closed.
//
//   3. THE `updated_at` BUMP IS VERIFIED, NOT ASSUMED (HR-5b). Hydration pulls are
//      watermark-incremental on `updated_at` (lib/hydration.ts § FR-3) and
//      `trg_events_updated_at` fires on UPDATE — that bump IS how the re-key reaches
//      the account's other devices. Suppress it and every device except the one that
//      ran the script holds `other` rows forever, with no error anywhere. So the
//      prelude asserts the trigger exists, is enabled, and that replication role is
//      `origin`. We assert the MECHANISM rather than writing `updated_at` by hand:
//      a hand-written value would paper over a disabled trigger instead of catching
//      it, and it would widen the SET clause past the one column this may touch.
//
//   4. THE SET CLAUSE IS ONE COLUMN. `event_type`, nothing else. Notes, `occurred_at`,
//      `occurred_at_source`, `occurred_at_confidence`, `severity` and soft-delete
//      state are untouched — the note text is the provenance that justified the swap.
//      Column-narrow also keeps an in-flight LWW edit from clobbering a sibling field.
//
//   5. THE TOTAL IS INVARIANT. A swap MOVES rows between types; it never creates or
//      destroys one. Asserted inside the transaction (so a mismatch rolls back),
//      not merely observed in the output afterwards.

/**
 * THE TARGET ACCOUNT IS PINNED HERE, IN CODE — not read from the reviewed list (F1).
 *
 * Every other safety property in this file is *relative* to whichever account the
 * emitted SQL names. Taking that name from `reviewed-ids.json` meant one edited field
 * produced a fully-scoped, self-consistent script pointed at somebody else's health
 * record — with every validator, every test and the prelude itself raising no
 * objection, because each of them only ever checked internal consistency.
 *
 * That is this file's own argument turned one level up. The header says a per-row
 * human review "cannot substitute for the predicate"; a human rule about which email
 * goes in a JSON file cannot substitute for a constant either. The stop rule in
 * README.md and the warning in candidates.sql are both instructions to a person, and
 * D3's consent basis cannot rest on those alone.
 *
 * The shipped precedent had this and it was dropped in the copy: scripts/demo/
 * emitSeedSql.ts pins `DEMO_EMAIL` in code and its prelude refuses unless the target
 * user's email is EXACTLY that. The tell was the asymmetry — the two READ-ONLY files
 * here hardcode the owner, and the one file that WRITES took it from data.
 *
 * The user id is pinned too, so re-pointing the address in `auth.users` cannot
 * silently retarget the write either. Both are asserted again at run time by the
 * prelude, so a doctored emitted file fails against the database as well.
 *
 * Changing these is not a config change. It is the D3 consent decision being re-taken
 * for a different person, which this script is not cleared for.
 */
export const SWAP_OWNER_EMAIL = 'danieljmarkii@gmail.com';
export const SWAP_OWNER_USER_ID = '2eeeaef5-753a-467c-8c17-2b9fed40ee34';

/** The leaves W1 ships. An id may only ever be re-keyed to one of these. */
export const TARGET_LEAVES = ['cough', 'sneeze'] as const;
export type TargetLeaf = (typeof TARGET_LEAVES)[number];

export interface SwapRow {
  id: string;
  to: TargetLeaf;
}

/** A candidate the review deliberately did NOT swap. Recorded so a run-day reviewer
 *  meets a decision rather than a blank — §13a's "a blank is an unfinished decision". */
export interface HoldRow {
  id: string;
  reason: string;
}

export interface ReviewedList {
  reviewer: { email: string };
  counts: { candidates: number; cough: number; sneeze: number; hold: number };
  swap: SwapRow[];
  hold: HoldRow[];
}

export interface EmitOptions {
  /** Dry run ends the transaction with ROLLBACK — the prelude, both UPDATEs, the
   *  invariant checks and the before/after counts all run, and nothing persists. */
  dryRun: boolean;
  /** ISO date the SQL was generated, for the file header. */
  generatedOn: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Deliberately narrower than RFC 5322: this string is interpolated into a SQL
// literal, so the validator's job is to make that safe by construction rather than
// to be liberal about addresses. No quote, backslash, whitespace or semicolon can
// survive it. (Same reasoning as scripts/demo/emitSeedSql.ts's DEMO_EMAIL note.)
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// `generatedOn` lands in a `--` header line ABOVE `BEGIN;` (F2). An unvalidated
// newline there closes the comment and emits a statement OUTSIDE the transaction —
// where it is unscoped, un-preluded, and a dry run's `ROLLBACK;` cannot undo it. The
// caller passes a clean ISO date today; this is an exported API whose header claims
// safety by construction, so the guard belongs here rather than in the one caller.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Every id in the list, swap and hold alike — the set the prelude validates. */
function allIds(list: ReviewedList): string[] {
  return [...list.swap.map((r) => r.id), ...list.hold.map((r) => r.id)];
}

function validate(list: ReviewedList, opts: EmitOptions): void {
  const { reviewer, counts, swap, hold } = list;

  if (!EMAIL_RE.test(reviewer.email)) {
    throw new Error(`reviewer email is not a safe SQL literal: ${JSON.stringify(reviewer.email)}`);
  }
  // F1 — the pin. A list naming any other account is refused outright.
  if (reviewer.email !== SWAP_OWNER_EMAIL) {
    throw new Error(
      `this script is cleared for ${SWAP_OWNER_EMAIL} only (D3: the reviewer IS the rows' owner). ` +
        `Retargeting it at ${JSON.stringify(reviewer.email)} is a new consent decision, not a config change.`,
    );
  }
  if (!ISO_DATE_RE.test(opts.generatedOn)) {
    throw new Error(`generatedOn must be a bare YYYY-MM-DD date: ${JSON.stringify(opts.generatedOn)}`);
  }
  // F4 — `reason` is the one free-text field a human fills in, on a form whose subject
  // is health notes, in a file that gets committed. It must stay a STRUCTURAL statement
  // about the decision ("the row names both target leaves"), never a quotation of the row.
  //
  // The check targets the SHAPE A PASTE TAKES — double quotes and smart quotes — and
  // deliberately allows the straight apostrophe, because banning that fights ordinary
  // English ("the owner's correction") and the legitimate naming of a leaf as 'other'.
  // The first draft banned all quote characters and immediately rejected the one real
  // reason in the committed file, which is how you learn a guard is fighting its users
  // rather than its threat.
  //
  // Stated limit, because a guard that overstates itself is worse than none: this is a
  // PROXY, not a proof. A quotation reworded without quote marks passes. The real
  // control is that this file is committed and diffed; this makes the careless case
  // loud, not the determined one impossible.
  for (const row of hold) {
    if (/["\u2018\u2019\u201c\u201d]/.test(row.reason)) {
      throw new Error(
        `hold ${row.id}: reason carries double or smart quotes, which usually means note text ` +
          `was pasted in. Say what the DECISION was, structurally — never quote the row ` +
          `(T&S: ids and counts only).`,
      );
    }
  }

  for (const row of swap) {
    if (!UUID_RE.test(row.id)) throw new Error(`swap id is not a lowercase uuid: ${row.id}`);
    if (!(TARGET_LEAVES as readonly string[]).includes(row.to)) {
      throw new Error(`swap target is not a W1 leaf: ${row.to}`);
    }
  }
  for (const row of hold) {
    if (!UUID_RE.test(row.id)) throw new Error(`hold id is not a lowercase uuid: ${row.id}`);
    if (row.reason.trim() === '') throw new Error(`hold ${row.id} has no reason`);
  }

  // A duplicate id would be swapped twice, or swapped AND held — either way the
  // reviewer approved something other than what would run.
  const ids = allIds(list);
  const seen = new Set(ids);
  if (seen.size !== ids.length) throw new Error('duplicate id across the reviewed list');

  // The counts are the reviewer's own arithmetic. If they disagree with the arrays,
  // the file was hand-edited after review and the review no longer describes it.
  const cough = swap.filter((r) => r.to === 'cough').length;
  const sneeze = swap.filter((r) => r.to === 'sneeze').length;
  if (cough !== counts.cough) throw new Error(`cough count ${counts.cough} != ${cough} rows`);
  if (sneeze !== counts.sneeze) throw new Error(`sneeze count ${counts.sneeze} != ${sneeze} rows`);
  if (hold.length !== counts.hold) throw new Error(`hold count ${counts.hold} != ${hold.length} rows`);
  if (ids.length !== counts.candidates) {
    throw new Error(`candidates ${counts.candidates} != ${ids.length} reviewed rows`);
  }
}

/** `ARRAY['…','…']::uuid[]`, or a typed empty array (which `= ANY()` handles). */
function uuidArray(ids: readonly string[]): string {
  if (ids.length === 0) return `ARRAY[]::uuid[]`;
  return `ARRAY[\n    ${ids.map((id) => `'${id}'`).join(',\n    ')}\n  ]::uuid[]`;
}

/** The owner's pets, as a scalar subquery — the scope predicate, spelled once. */
function ownedPets(email: string): string {
  return `SELECT id FROM pets WHERE user_id = (SELECT id FROM auth.users WHERE email = '${email}')`;
}

/**
 * The HR-5b propagation assertion — shared by the swap AND the rollback, deliberately.
 *
 * Without the `updated_at` bump the re-key never leaves this connection's view: every
 * OTHER device on the account keeps showing the old type forever, and nothing anywhere
 * reports an error. That is exactly as true of the REVERSE re-key, so the rollback runs
 * the same check rather than asserting in a header comment that it "bumps the watermark
 * again". A guarantee stated in prose on one path and verified on the other is the
 * asymmetry that gets found later, on the path nobody rehearsed.
 */
function propagationAssertion(verb: 'swap' | 'rollback'): string[] {
  return [
    `  -- The propagation mechanism is armed (HR-5b): hydration is watermark-incremental`,
    `  -- on updated_at, and trg_events_updated_at is what moves it. Suppress the trigger`,
    `  -- and this ${verb} reaches no other device, silently.`,
    `  IF current_setting('session_replication_role') <> 'origin' THEN`,
    `    RAISE EXCEPTION '${verb} refused: session_replication_role is %, so triggers are suppressed and the updated_at bump would not fire', current_setting('session_replication_role');`,
    `  END IF;`,
    `  IF NOT EXISTS (`,
    `    SELECT 1 FROM pg_trigger`,
    `     WHERE tgrelid = 'public.events'::regclass`,
    `       AND tgname  = 'trg_events_updated_at'`,
    `       AND tgenabled = 'O'`,
    `  ) THEN`,
    `    RAISE EXCEPTION '${verb} refused: trg_events_updated_at is missing or disabled on public.events';`,
    `  END IF;`,
  ]
}

export function emitSwapSql(list: ReviewedList, opts: EmitOptions): string {
  validate(list, opts);

  const email = list.reviewer.email;
  const scope = ownedPets(email);
  const reviewed = allIds(list);
  const n = reviewed.length;

  const updates = TARGET_LEAVES.flatMap((leaf) => {
    const ids = list.swap.filter((r) => r.to === leaf).map((r) => r.id);
    if (ids.length === 0) return [];
    return [
      `-- ${ids.length} row(s) → '${leaf}'. SET touches event_type and nothing else (property 4).`,
      `-- The WHERE repeats ALL THREE prelude conditions, not just ownership (F5): each`,
      `-- statement takes a fresh READ COMMITTED snapshot, so a device sync landing between`,
      `-- the prelude and here could otherwise move a row out of 'other' or soft-delete it`,
      `-- and still have this write land on it. Sync quiescence is the operational guard;`,
      `-- this is the one that does not depend on remembering to do it.`,
      `UPDATE events SET event_type = '${leaf}'`,
      ` WHERE id = ANY(${uuidArray(ids)})`,
      `   AND event_type = 'other'`,
      `   AND deleted_at IS NULL`,
      `   AND pet_id IN (${scope});`,
      ``,
    ];
  });

  return [
    `-- CUL-677 / W1-PR-4 — the §11 \`other\`-row swap.`,
    `-- GENERATED by scripts/w1-other-row-swap/emit.deno.ts from reviewed-ids.json — do not hand-edit.`,
    `-- Generated: ${opts.generatedOn}${opts.dryRun ? '   MODE: DRY RUN (ends in ROLLBACK)' : '   MODE: LIVE (ends in COMMIT)'}`,
    `--`,
    `-- Reviewed candidates: ${n}  ·  → cough: ${list.counts.cough}  ·  → sneeze: ${list.counts.sneeze}  ·  held as 'other': ${list.counts.hold}`,
    `-- Notes, occurred_at, occurred_at_source/_confidence, severity and soft-delete state are UNTOUCHED.`,
    `-- The updated_at trigger bump is REQUIRED and is how this reaches the account's other`,
    `-- devices (hydration is watermark-incremental on updated_at) — the prelude verifies it.`,
    ``,
    `BEGIN;`,
    ``,
    `DO $swap$`,
    `DECLARE`,
    `  v_user  uuid;`,
    `  v_ids   uuid[] := ${uuidArray(reviewed)};`,
    `  v_ok    int;`,
    `BEGIN`,
    `  -- (1) Resolve the reviewing owner. D3's T&S basis is that the script's reviewer IS`,
    `  --     the rows' owner; this is where that stops being doctrine and becomes a`,
    `  --     precondition. This script may NEVER run over rows owned by anyone else —`,
    `  --     they wait for the future product re-type flow.`,
    `  SELECT id INTO v_user FROM auth.users WHERE email = '${email}';`,
    `  IF v_user IS NULL THEN`,
    `    RAISE EXCEPTION 'swap refused: no account for the reviewing owner (%)', '${email}';`,
    `  END IF;`,
    `  -- F1, the runtime half: the pinned user id must be the one that address resolves`,
    `  -- to. Catches a doctored emitted file, and an address re-pointed at another`,
    `  -- account in auth.users — neither of which the code-side pin can see.`,
    `  IF v_user <> '${SWAP_OWNER_USER_ID}'::uuid THEN`,
    `    RAISE EXCEPTION 'swap refused: % resolves to user %, not the pinned owner %', '${email}', v_user, '${SWAP_OWNER_USER_ID}';`,
    `  END IF;`,
    ``,
    `  IF coalesce(array_length(v_ids, 1), 0) <> ${n} THEN`,
    `    RAISE EXCEPTION 'swap refused: % reviewed ids embedded, expected ${n}', coalesce(array_length(v_ids, 1), 0);`,
    `  END IF;`,
    ``,
    `  -- (2) Every reviewed id is STILL an un-deleted \`other\` row on a pet this owner owns.`,
    `  --     Fails closed on drift: a row re-typed, soft-deleted, or belonging to another`,
    `  --     account since the review is not something the reviewer approved.`,
    `  SELECT count(*) INTO v_ok`,
    `    FROM events e`,
    `   WHERE e.id = ANY(v_ids)`,
    `     AND e.event_type = 'other'`,
    `     AND e.deleted_at IS NULL`,
    `     AND e.pet_id IN (${scope});`,
    `  IF v_ok <> ${n} THEN`,
    `    RAISE EXCEPTION 'swap refused: % of ${n} reviewed ids are not owner-scoped, un-deleted other rows. Re-run candidates.sql and re-review the delta.', ${n} - v_ok;`,
    `  END IF;`,
    ``,
    ...propagationAssertion('swap'),
    ``,
    `  -- Before-counts, stashed for the single before/after result set at the end.`,
    `  CREATE TEMP TABLE _swap_before ON COMMIT DROP AS`,
    `    SELECT e.event_type::text AS event_type, count(*)::int AS n`,
    `      FROM events e`,
    `     WHERE e.pet_id IN (${scope})`,
    `       AND e.deleted_at IS NULL`,
    `     GROUP BY 1;`,
    `END`,
    `$swap$;`,
    ``,
    ...updates,
    `DO $verify$`,
    `DECLARE`,
    `  v_ids     uuid[] := ${uuidArray(list.swap.map((r) => r.id))};`,
    `  v_before  int;`,
    `  v_after   int;`,
    `  v_stale   int;`,
    `BEGIN`,
    `  -- (5) The total is invariant: a swap MOVES rows between types. Checked inside the`,
    `  --     transaction so a mismatch rolls the whole thing back, rather than being`,
    `  --     noticed in the output after it committed.`,
    `  SELECT coalesce(sum(n), 0) INTO v_before FROM _swap_before;`,
    `  SELECT count(*) INTO v_after FROM events e`,
    `   WHERE e.pet_id IN (${scope}) AND e.deleted_at IS NULL;`,
    `  IF v_before <> v_after THEN`,
    `    RAISE EXCEPTION 'swap refused: row total moved % -> %, a swap must only re-key', v_before, v_after;`,
    `  END IF;`,
    ``,
    `  -- Every swapped id actually left 'other'. Scoped like every other statement here:`,
    `  -- the ids were validated as this owner's in the prelude, so this predicate is`,
    `  -- redundant — and it stays, because "which reads are safe to leave unscoped" is`,
    `  -- exactly the reasoning nobody should have to redo when editing this file.`,
    `  SELECT count(*) INTO v_stale FROM events e`,
    `   WHERE e.id = ANY(v_ids) AND e.event_type = 'other'`,
    `     AND e.pet_id IN (${scope});`,
    `  IF v_stale <> 0 THEN`,
    `    RAISE EXCEPTION 'swap refused: % swapped ids are still typed other', v_stale;`,
    `  END IF;`,
    `END`,
    `$verify$;`,
    ``,
    `-- The run-log record: per-type before/after over the owner's whole record.`,
    `SELECT coalesce(b.event_type, a.event_type) AS event_type,`,
    `       coalesce(b.n, 0) AS before,`,
    `       coalesce(a.n, 0) AS after`,
    `  FROM _swap_before b`,
    `  FULL JOIN (`,
    `    SELECT e.event_type::text AS event_type, count(*)::int AS n`,
    `      FROM events e`,
    `     WHERE e.pet_id IN (${scope})`,
    `       AND e.deleted_at IS NULL`,
    `     GROUP BY 1`,
    `  ) a ON a.event_type = b.event_type`,
    ` ORDER BY 1;`,
    ``,
    opts.dryRun ? `ROLLBACK;` : `COMMIT;`,
    ``,
  ].join('\n');
}

/**
 * The reverse: re-key the swapped ids back to 'other'.
 *
 * PARITY IS THE POINT (F3). The first version of this carried the prelude's *shape*
 * and dropped three of the five safety properties — no replication-role check, no
 * trigger check, no total invariant, no soft-delete predicate — while both this
 * comment and the runbook claimed it behaved "exactly as the forward swap did". A
 * guarantee stated in prose on one path and verified on the other is the asymmetry
 * that gets found on the path nobody rehearsed, and the rollback is precisely the
 * artifact you reach for under time pressure after something has already gone wrong.
 *
 * It also re-keys PER SOURCE LEAF (F7) rather than collapsing every id into one
 * `event_type IN ('cough','sneeze')` test. Collapsed, an owner who had corrected one
 * of our rows from cough to sneeze still passed the check, and the rollback silently
 * flattened their correction to 'other'. Per-leaf, that row no longer matches the leaf
 * we set it to, so the prelude refuses and a human looks at it.
 */
export function emitRollbackSql(list: ReviewedList, opts: EmitOptions): string {
  validate(list, opts);
  const email = list.reviewer.email;
  const scope = ownedPets(email);
  const n = list.swap.length;

  const perLeaf = TARGET_LEAVES.map((leaf) => ({
    leaf,
    ids: list.swap.filter((r) => r.to === leaf).map((r) => r.id),
  })).filter((g) => g.ids.length > 0);

  const preludeChecks = perLeaf.flatMap(({ leaf, ids }) => [
    `  -- Every id we set to '${leaf}' must STILL be '${leaf}' (F7). A row the owner has`,
    `  -- since corrected — including a cough↔sneeze fix on one of ours — is not ours to move.`,
    `  SELECT count(*) INTO v_ok FROM events e`,
    `   WHERE e.id = ANY(${uuidArray(ids)})`,
    `     AND e.event_type = '${leaf}'`,
    `     AND e.deleted_at IS NULL`,
    `     AND e.pet_id IN (${scope});`,
    `  IF v_ok <> ${ids.length} THEN`,
    `    RAISE EXCEPTION 'rollback refused: % of ${ids.length} ids are no longer owner-scoped, un-deleted ${leaf} rows', ${ids.length} - v_ok;`,
    `  END IF;`,
    ``,
  ]);

  const updates = perLeaf.flatMap(({ leaf, ids }) => [
    `UPDATE events SET event_type = 'other'`,
    ` WHERE id = ANY(${uuidArray(ids)})`,
    `   AND event_type = '${leaf}'`,
    `   AND deleted_at IS NULL`,
    `   AND pet_id IN (${scope});`,
    ``,
  ]);

  return [
    `-- CUL-677 / W1-PR-4 — ROLLBACK of the §11 swap: re-key the swapped ids back to 'other'.`,
    `-- GENERATED by scripts/w1-other-row-swap/emit.deno.ts — do not hand-edit.`,
    `-- Generated: ${opts.generatedOn}${opts.dryRun ? '   MODE: DRY RUN (ends in ROLLBACK)' : '   MODE: LIVE (ends in COMMIT)'}`,
    `--`,
    `-- Restores the TYPE only. It cannot restore an updated_at, and it must not try: the`,
    `-- reverse re-key has to reach the account's other devices exactly as the forward one`,
    `-- did, so it bumps the watermark again — and VERIFIES it can, below.`,
    `--`,
    `-- A rollback emitted from a reviewed-ids.json that has since GROWN (the runbook`,
    `-- mandates adding the swap-day delta) would undo only the subset it names. Emit it`,
    `-- from the same file the swap ran from.`,
    ``,
    `BEGIN;`,
    ``,
    `DO $rb$`,
    `DECLARE`,
    `  v_user uuid;`,
    `  v_ok   int;`,
    `BEGIN`,
    `  SELECT id INTO v_user FROM auth.users WHERE email = '${email}';`,
    `  IF v_user IS NULL THEN`,
    `    RAISE EXCEPTION 'rollback refused: no account for the reviewing owner (%)', '${email}';`,
    `  END IF;`,
    `  IF v_user <> '${SWAP_OWNER_USER_ID}'::uuid THEN`,
    `    RAISE EXCEPTION 'rollback refused: % resolves to user %, not the pinned owner %', '${email}', v_user, '${SWAP_OWNER_USER_ID}';`,
    `  END IF;`,
    ``,
    ...preludeChecks,
    ...propagationAssertion('rollback'),
    ``,
    `  CREATE TEMP TABLE _rb_before ON COMMIT DROP AS`,
    `    SELECT e.event_type::text AS event_type, count(*)::int AS n`,
    `      FROM events e`,
    `     WHERE e.pet_id IN (${scope})`,
    `       AND e.deleted_at IS NULL`,
    `     GROUP BY 1;`,
    `END`,
    `$rb$;`,
    ``,
    ...updates,
    `DO $rbverify$`,
    `DECLARE`,
    `  v_ids    uuid[] := ${uuidArray(list.swap.map((r) => r.id))};`,
    `  v_before int;`,
    `  v_after  int;`,
    `  v_stale  int;`,
    `BEGIN`,
    `  -- The same total invariant the forward script enforces: a re-key MOVES rows.`,
    `  SELECT coalesce(sum(n), 0) INTO v_before FROM _rb_before;`,
    `  SELECT count(*) INTO v_after FROM events e`,
    `   WHERE e.pet_id IN (${scope}) AND e.deleted_at IS NULL;`,
    `  IF v_before <> v_after THEN`,
    `    RAISE EXCEPTION 'rollback refused: row total moved % -> %, a re-key must only re-key', v_before, v_after;`,
    `  END IF;`,
    ``,
    `  SELECT count(*) INTO v_stale FROM events e`,
    `   WHERE e.id = ANY(v_ids)`,
    `     AND e.event_type <> 'other'`,
    `     AND e.pet_id IN (${scope});`,
    `  IF v_stale <> 0 THEN`,
    `    RAISE EXCEPTION 'rollback refused: % of ${n} ids did not return to other', v_stale;`,
    `  END IF;`,
    `END`,
    `$rbverify$;`,
    ``,
    opts.dryRun ? `ROLLBACK;` : `COMMIT;`,
    ``,
  ].join('\n');
}
