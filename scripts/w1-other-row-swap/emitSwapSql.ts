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

/** Every id in the list, swap and hold alike — the set the prelude validates. */
function allIds(list: ReviewedList): string[] {
  return [...list.swap.map((r) => r.id), ...list.hold.map((r) => r.id)];
}

function validate(list: ReviewedList): void {
  const { reviewer, counts, swap, hold } = list;

  if (!EMAIL_RE.test(reviewer.email)) {
    throw new Error(`reviewer email is not a safe SQL literal: ${JSON.stringify(reviewer.email)}`);
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

export function emitSwapSql(list: ReviewedList, opts: EmitOptions): string {
  validate(list);

  const email = list.reviewer.email;
  const scope = ownedPets(email);
  const reviewed = allIds(list);
  const n = reviewed.length;

  const updates = TARGET_LEAVES.flatMap((leaf) => {
    const ids = list.swap.filter((r) => r.to === leaf).map((r) => r.id);
    if (ids.length === 0) return [];
    return [
      `-- ${ids.length} row(s) → '${leaf}'. SET touches event_type and nothing else (property 4);`,
      `-- the ownership predicate is repeated here on purpose (property 1, defence in depth).`,
      `UPDATE events SET event_type = '${leaf}'`,
      ` WHERE id = ANY(${uuidArray(ids)})`,
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
    `  -- (3) The propagation mechanism is armed (HR-5b). Without the updated_at bump the`,
    `  --     re-key never leaves this connection's view: every OTHER device on the account`,
    `  --     keeps showing 'other' forever, and nothing anywhere reports an error.`,
    `  IF current_setting('session_replication_role') <> 'origin' THEN`,
    `    RAISE EXCEPTION 'swap refused: session_replication_role is %, so triggers are suppressed and the updated_at bump would not fire', current_setting('session_replication_role');`,
    `  END IF;`,
    `  IF NOT EXISTS (`,
    `    SELECT 1 FROM pg_trigger`,
    `     WHERE tgrelid = 'public.events'::regclass`,
    `       AND tgname  = 'trg_events_updated_at'`,
    `       AND tgenabled = 'O'`,
    `  ) THEN`,
    `    RAISE EXCEPTION 'swap refused: trg_events_updated_at is missing or disabled on public.events';`,
    `  END IF;`,
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

/** The reverse: re-key the swapped ids back to 'other'. Same prelude discipline. */
export function emitRollbackSql(list: ReviewedList, opts: EmitOptions): string {
  validate(list);
  const email = list.reviewer.email;
  const scope = ownedPets(email);
  const ids = list.swap.map((r) => r.id);
  const n = ids.length;

  return [
    `-- CUL-677 / W1-PR-4 — ROLLBACK of the §11 swap: re-key the swapped ids back to 'other'.`,
    `-- GENERATED by scripts/w1-other-row-swap/emit.deno.ts — do not hand-edit.`,
    `-- Generated: ${opts.generatedOn}`,
    `--`,
    `-- This restores the TYPE only. It cannot restore an updated_at, and it should not try:`,
    `-- the reverse re-key must ALSO propagate to the account's other devices, so it bumps`,
    `-- the watermark again, exactly as the forward swap did.`,
    ``,
    `BEGIN;`,
    ``,
    `DO $rb$`,
    `DECLARE`,
    `  v_user uuid;`,
    `  v_ids  uuid[] := ${uuidArray(ids)};`,
    `  v_ok   int;`,
    `BEGIN`,
    `  SELECT id INTO v_user FROM auth.users WHERE email = '${email}';`,
    `  IF v_user IS NULL THEN`,
    `    RAISE EXCEPTION 'rollback refused: no account for the reviewing owner (%)', '${email}';`,
    `  END IF;`,
    `  -- Every id is one of OURS and currently carries a W1 leaf. A row the owner has since`,
    `  -- re-typed by hand is not ours to move back.`,
    `  SELECT count(*) INTO v_ok FROM events e`,
    `   WHERE e.id = ANY(v_ids)`,
    `     AND e.event_type IN (${TARGET_LEAVES.map((l) => `'${l}'`).join(', ')})`,
    `     AND e.pet_id IN (${scope});`,
    `  IF v_ok <> ${n} THEN`,
    `    RAISE EXCEPTION 'rollback refused: % of ${n} ids are not owner-scoped W1-leaf rows', ${n} - v_ok;`,
    `  END IF;`,
    `END`,
    `$rb$;`,
    ``,
    `UPDATE events SET event_type = 'other'`,
    ` WHERE id = ANY(${uuidArray(ids)})`,
    `   AND pet_id IN (${scope});`,
    ``,
    opts.dryRun ? `ROLLBACK;` : `COMMIT;`,
    ``,
  ].join('\n');
}
