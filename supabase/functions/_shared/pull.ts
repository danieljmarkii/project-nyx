// The paged reader every multi-row pull in an Edge Function goes through (CUL-975, CUL-989).
//
// Built in generate-report for CUL-975 (the vet report silently dropped its newest events once
// a record passed PostgREST's `max-rows`), and lifted here verbatim by Engines v3 PR-09
// (CUL-989) so generate-signal and ask read their records the same way. The comments below
// were written against the report and still describe it; what each CALLER does with an
// incomplete pull is that caller's decision, stated at its call site:
//
//   • generate-report — the (a') ruling: refuse where the window could be cut, disclose
//     otherwise (generateReportForPet).
//   • generate-signal — the CUL-989 step-3 ruling (PM, 2026-09-26): an incomplete read never
//     produces a reassuring or resolving finding; escalations still fire, their counts stated
//     as "at least N" (pipeline.ts, `incompletePulls`).
//   • ask — an incomplete read answers nothing: the designed deflection, with the engine's
//     safety lead still attached (index.ts).
//
// DEPLOY SCOPE. A `_shared/` file is inlined only into the functions that import it
// (scripts/edge-deploy/fingerprint.ts), so an edit here redeploys exactly those three.
//
// Pure of I/O: the caller hands `fetchAll` a page builder, so the loop is tested offline
// (generate-report/index.test.ts drives it against a server that caps).

/**
 * How many rows one PAGE of a paginated pull asks for (CUL-975).
 *
 * Not a cap on the pull — `fetchAll` below keeps asking until the result set is
 * exhausted — so this is a round-trip size, not a claim about any record.
 *
 * It is deliberately NOT load-bearing for correctness. The obvious trap in a paged
 * reader is a page size at or above the server's PostgREST `max-rows`: every page then
 * comes back short, and a loop that stops on a short page stops on page one believing it
 * read everything. This function cannot observe that setting (the `looks` pull's comment
 * below says so, and the `rls-privacy-reviewer` named it unverifiable from the repo), so
 * `fetchAll` does not depend on the two being ordered: it ADVANCES BY THE NUMBER OF ROWS
 * IT ACTUALLY RECEIVED, which is correct at any server ceiling, and earns completeness
 * from `count: 'exact'` rather than from the page's fullness.
 */
export const PULL_PAGE = 500

/**
 * The most pages `fetchAll` will request for ONE pull — a ceiling on work, not a
 * statement about the record. It bounds `PULL_MAX_PAGES x min(PULL_PAGE, the server's own
 * page)`, NOT `x PULL_PAGE`: at the default ceiling that is 20,000 rows, roughly eight
 * years of the heaviest record we have measured (~7 events a day), but under a `max-rows`
 * of 25 it is 1,000 — and a record above it then reports incomplete, which on a window-
 * cutting shortfall means (a') refuses and the owner gets no report. That is the fail-safe
 * direction and it is also a cliff, so a deliberately low `max-rows` is a decision about
 * this function whether or not anyone setting it knows that.
 *
 * It exists because an Edge Function has a wall clock and a 256 MB isolate, and a loop
 * with no ceiling turns a runaway query into a timeout with no diagnosis. Reaching it is
 * reported as an INCOMPLETE pull and never as a complete one: the whole of CUL-975 is
 * that a truncation the code cannot see is a truncation nobody discloses.
 */
export const PULL_MAX_PAGES = 40

/**
 * Rows from a query result, or THROW on a query error. A vet report renders as a
 * clinical artifact a vet acts on, so a swallowed query error (RLS misconfig,
 * transient PostgREST fault, an ambiguous embed) that silently becomes "zero rows"
 * would produce a FALSE-CLEAN report — the exact absence≠wellness / n=1-never-
 * reassures failure the report exists to avoid. So every read is checked: a real
 * error surfaces as a 500, never as a quietly empty section. (CLAUDE.md: no silent
 * failures in API calls; the B-196 class of bug re-hardened.)
 */
export function rowsOrThrow<T>(res: { data: unknown; error: { message: string } | null }, table: string): T[] {
  if (res.error) throw new Error(`${table} read failed: ${res.error.message}`)
  return (res.data ?? []) as T[]
}

/** One page of a paginated pull — the supabase-js response, narrowed to what the loop
 *  reads. `count` is present because every page below is built with `count: 'exact'`. */
export interface PullPage {
  data: unknown
  error: { message: string; code?: string } | null
  count?: number | null
}

/** PostgREST's "Requested range not satisfiable" — returned when a `.range()`'s lower bound
 *  is past the end of the result set. On a paged read that means the set SHRANK under the
 *  cursor, which is a short read, not a fault: the loop stops and the count comparison
 *  below reports the pull incomplete. Everything else still throws. */
export function isRangeNotSatisfiable(err: { message: string; code?: string } | null): boolean {
  return err !== null && (err.code === 'PGRST103' || /range not satisfiable/i.test(err.message))
}

/** A pull that knows whether it read everything. `complete` is EARNED (see below); a
 *  consumer that treats absent/false as "the record is short" is reading it correctly. */
export interface Pull<T> {
  rows: T[]
  complete: boolean
}

/**
 * Every row a query matches, read in pages, with an EARNED answer to "was that all?".
 *
 * WHY THIS EXISTS (CUL-975). PostgREST caps an unbounded select at the project's
 * `max-rows`. A select with no `ORDER BY` comes back in physical order, which on these
 * append-only tables is insertion order — so the cap kept the OLDEST rows and dropped the
 * NEWEST, silently. The vet report a PM generated for a real appointment on 2026-09-16
 * was missing every event after Sep 7: a cough that happened yesterday printed as ten
 * days ago, and the more diligently the owner had logged, the calmer their pet looked.
 * There was no error, no caveat and no log line, and every number on the page agreed with
 * every other number, because they all derived from the same truncated set.
 *
 * THREE THINGS MAKE A PULL HONEST, and this helper owns the second and third:
 *
 *  1. AN ORDER, at the call site. Every converted pull orders newest-first on a TOTAL
 *     key. Total matters as much as the direction: `occurred_at` is not unique (this
 *     record logs ~7 events a day and meal one-taps land on the same second), and under
 *     a non-total sort Postgres may order tied rows differently per page, which repeats
 *     and skips rows at every page seam. Each call site therefore ends `, id DESC`.
 *
 *  2. A STRIDE THAT MATCHES REALITY. The loop advances by the number of rows it actually
 *     RECEIVED, never by `PULL_PAGE`. This is what makes it correct at a server ceiling
 *     it cannot observe: if `max-rows` were ever below the page size, a fixed stride would
 *     skip the rows between what was asked for and what came back, while advancing by the
 *     received count simply costs more round trips and loses nothing.
 *
 *  3. COMPLETENESS FROM THE COUNT, NEVER FROM THE PAGE'S FULLNESS. `rows.length < PULL_PAGE`
 *     is the inference the `looks` pull's comment already warns against, and it is exactly
 *     what a lowered `max-rows` defeats. The count comes from page 0 — the SAME request
 *     that returned page 0's rows, so for any record that fits in one page (the common
 *     case) the count and the rows are one consistent snapshot and completeness is exact.
 *
 * WHAT `complete: false` MEANS AFTER THIS. Because every pull is newest-first, a shortfall
 * drops the OLDEST rows — the inverse of the defect above. So it means one of: the page
 * ceiling was reached, the server capped a page below what we asked for, or the table was
 * written while the report generated. `generateReportForPet` acts on it per the PM's
 * (a') ruling on CUL-975 — refuse only where the report's own WINDOW could have been cut,
 * disclose otherwise.
 *
 * WHAT A MULTI-PAGE PULL GUARANTEES, measured rather than reasoned. Two earlier versions
 * of this paragraph were wrong in the same way — they described what the author expected
 * the loop to do — so each clause below is a harness result against this reader.
 *
 *   • INSERT during the pull: every row that existed at the count's instant is returned,
 *     and `complete` is true. A head insert shifts the list down and re-serves a row the
 *     previous page already gave us; `keyOf` drops the duplicate and the stride still
 *     advances by the full batch, so the window keeps descending. The new row is NOT
 *     included — it did not exist when the count was taken, and this document is a snapshot
 *     as of the request (the client flushes its queues before calling). Verified for a head
 *     insert, a mid-list backdated insert, and two backdated inserts landing inside the
 *     final partial window.
 *
 *   • DELETE during the pull: the list shifts UP under the cursor, so an offset the loop
 *     has already passed now holds a row it never requested. The overlap check sees that
 *     directly — the overlapped row is unseen — and the pull reports INCOMPLETE. This is the
 *     case a count cannot catch on its own: an `adversarial-reviewer` harness showed one
 *     soft-delete PLUS one backdated insert returning `complete: true` with a live in-window
 *     row absent, because the insert restored the number the delete took away. A number that
 *     can be made whole by a different row is not a proof that no row is missing.
 *
 * So completeness now rests on three independent things, and all three must hold: the loop
 * reached the end of the set (not the page ceiling), no page began on a row it had not
 * already seen, and the rows in hand account for page 0's count.
 *
 * Neither race can reach a single-page record, where the count and the rows come from one
 * request. Keyset pagination on `(occurred_at, id)` would make the offset space irrelevant
 * altogether and is the upgrade if multi-page pulls ever stop being the exception.
 *
 * COST, stated because it is a deliberate trade: `count: 'exact'` rides every page although
 * only page 0's is read, and each page after the first re-reads one row. Keeping the count
 * on one builder function is what makes each call site a single readable chain; the
 * alternative threads a page index through eleven of them to save a counted index scan.
 *
 * @param table   the table name, for the error message `rowsOrThrow` raises
 * @param keyOf   a PRIMARY-KEY-unique key per row — the de-dupe above; a non-unique key
 *                would silently drop live rows, so every call site passes a column the
 *                schema declares unique
 * @param page    builds the query for one half-open range; MUST carry `count: 'exact'`
 */
export async function fetchAll<T>(
  table: string,
  keyOf: (row: T) => string,
  page: (from: number, to: number) => PromiseLike<PullPage>,
): Promise<Pull<T>> {
  const rows: T[] = []
  const seen = new Set<string>()
  let total: number | null = null
  // Proven FALSE by a page that ends the result set. Starting true is the direction that
  // cannot mislead: a loop that falls out of its bounds has not read to the end.
  let hitCeiling = true

  // Set when the offset space moved under the cursor — see the continuity check below.
  let shifted = false

  let from = 0
  for (let p = 0; p < PULL_MAX_PAGES; p++) {
    // ONE ROW OF DELIBERATE OVERLAP on every page after the first, and it is the whole of
    // the continuity check below. It costs one duplicate per page, which `keyOf` absorbs.
    const start = p === 0 ? 0 : from - 1
    const res = await page(start, start + PULL_PAGE - 1)
    if (isRangeNotSatisfiable(res.error)) break
    const batch = rowsOrThrow<T>(res, table)
    // PAGE 0'S COUNT, AND ONLY PAGE 0'S — enforced by the `p === 0`, not merely intended.
    // It is the count taken in the same request as page 0's rows, so for a single-page
    // record the two are one consistent snapshot. A later page's count is a different
    // instant, and measuring completeness against it compares a snapshot to rows that were
    // never in it. Page 0 returning no count leaves `total` null ⇒ incomplete, which is the
    // direction that cannot mislead.
    if (p === 0 && typeof res.count === 'number') total = res.count

    // THE CONTINUITY CHECK. The overlapped row is one we have already returned — unless
    // rows were REMOVED above the cursor, in which case everything shifted up and the row
    // now sitting at this offset is one we never requested. That is a skip, and without
    // this it is invisible: a concurrent delete skips a row while a concurrent insert
    // restores the count, so `rows.length >= total` certifies a pull that is missing a live
    // row. Measured on the shipped reader before this existed — one soft-delete plus one
    // backdated insert during a 1,057-row pull returned `complete: true` with an in-window
    // event absent and no disclosure anywhere. That is CUL-975's own failure class, and a
    // count alone cannot see it because the count was made whole by a different row.
    if (p > 0 && batch.length > 0 && !seen.has(keyOf(batch[0]))) shifted = true

    for (const row of batch) {
      const key = keyOf(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }

    // The result set ended. (An empty page is the unambiguous end; a short one may be the
    // server's ceiling, which is why the stride follows the batch and the loop continues.)
    if (batch.length === 0) {
      hitCeiling = false
      break
    }
    from = start + batch.length
    if (total !== null && rows.length >= total) {
      hitCeiling = false
      break
    }
  }

  // ABSENT MEANS UNKNOWN MEANS INCOMPLETE — the `lookRowsComplete` rule, the direction
  // that cannot mislead. Every page here requests the count, so an absent one is an
  // anomaly, and an anomaly must not read as a clean bill of health.
  return { rows, complete: !hitCeiling && !shifted && total !== null && rows.length >= total }
}

/**
 * THE DOSE PULL READS AS IT DID BEFORE CUL-989, AND IT IS THE ONLY ONE THAT DOES.
 *
 * Every other pull in generate-signal and ask throws on a query error. The dose pull cannot
 * yet: its embed `medication_administrations(...)` is ambiguous since migration 023 added
 * `paired_event_id` (a second FK to `events`), and the live API answers PGRST201 on every call
 * (CUL-1099, verified 2026-09-23; the other embeds in both functions were checked against the
 * live schema on 2026-09-28 and are unambiguous). The shipped code read that error as "no
 * doses", so the Signal and Ask have both run with none. Making it fatal would 500 every
 * pet's Signal; adding the hint turns on dose lanes that have never run on production data,
 * which CUL-1099 owns together with its mandatory adversarial pass. So this keeps today's
 * answer — no doses, and NOT an incomplete read (counting it incomplete would withhold every
 * reflection for every pet) — and makes the failure loud. CUL-1099 deletes this in the PR that
 * adds the hint; `guards/reportPullPagination.test.ts` registers it as the one exemption.
 */
export async function readDosesAsToday<T>(fn: string, pull: Promise<Pull<T>>): Promise<Pull<T>> {
  try {
    return await pull
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.warn(`${fn}: dose-event read failed, read as no doses (CUL-1099):`, detail)
    return { rows: [], complete: true }
  }
}

/** The names of the pulls that did not read to the end, in the order given (a log line, and
 *  generate-signal's `record_incomplete`). */
export function incompletePullNames(pulls: Record<string, Pull<unknown>>): string[] {
  return Object.entries(pulls).filter(([, p]) => !p.complete).map(([name]) => name)
}
