// Supabase Edge Function — sweep-orphaned-storage / plan.ts
//
// The pure core of the periodic orphaned-storage sweep (CUL-2421, the backstop CUL-231
// named). Every bucket keys its objects under one owner id: `{petId}/…` for the five
// pet-health buckets, `{foodItemId}/…` for food labels, `{uid}/…` for drug labels
// (delete-account's SWEEP_SCOPE). When that owner row is gone, nothing can reach the
// files any more and no erasure path can find them by a row: a late upload that
// committed after delete-account's post-delete sweep (its blind spots 1 to 5), files
// under a pet deleted before migration 116, a food the account hard-deleted. This
// module finds those folders and removes their files.
//
// THE DIRECTION OF EVERY CHOICE: never delete a live file. A file is removed only when
//   1. its bucket is one STORAGE_BUCKETS names (an unknown bucket is reported, never
//      listed);
//   2. its top-level folder is a lowercase canonical uuid. Lowercase is load-bearing:
//      Postgres compares uuids case-blind, so `id in ('ABC…')` returns the live row as
//      `abc…`, and a set check on the raw folder name would call a live pet gone;
//   3. the owner read for that folder SUCCEEDED and proved it gone: for a pet or food
//      folder, the batch read returned no error and an exact count equal to the rows
//      returned, and the folder's id is not among them; for a drug-label folder, GoTrue
//      answered `user_not_found` (delete-account's userProbeOf; a bare 404 is unknown);
//      and for a food folder, ALSO that the food can never come back (below);
//   4. its key has exactly the segment count its bucket's writer produces;
//   5. its newest timestamp (created_at or updated_at) parses and is older than the
//      grace period.
// Anything else stays, and is counted under a named reason in the run line.
//
// Why "gone" stays gone. Pet ids: 116 refuses re-inserting a retired id for every role,
// the same owner included. Auth uids: a fresh v4 uuid per account. Food ids are the
// exception (rls-privacy-reviewer F3): 106 refuses another account, but lets the OWNER
// re-create its own retired id, and the app relies on that (reapStalePendingFoods can
// remove a pending capture whose edit form is still open; commitFood's upsert brings
// the row back with photo_paths naming the files). So a missing food row alone proves
// nothing. A food folder is gone only when 106's ledger names the id and either holds
// no owner (106 then refuses every re-create) or names an owner whose auth user is gone
// (`user_not_found`). A dead food of a LIVE account whose ledger row names that account
// is left and counted (`folder_owner_may_return`): that is retention, not an orphan, and
// is CUL-231's. One exception, stated (rls-privacy-reviewer pass 2, R1): 106's backfill
// wrote NO owner for a pre-106 folder with several uploaders or an unattributed object,
// so such a folder goes even when one uploader's account is live. Nobody can reach
// those files (106 refuses every re-create, no row names them), the same as the folders
// of a pet a live account deleted before 116, which this sweep also removes.
//
// Why the grace period still matters when the owner row is the proof: it is the margin
// for a proof this module does not see, such as a row written by a path that uploads
// first. No such writer exists today (every upload policy looks up its owner row; the
// drug-label folder is the uid itself), so 24 h costs nothing but a day's delay.
//
// No I/O lives here. index.ts wires the real Storage, PostgREST and GoTrue calls.

import {
  chunk,
  listPrefixForSweep,
  STORAGE_BUCKETS,
  STORAGE_LIST_PAGE,
  STORAGE_REMOVE_CHUNK,
  SWEEP_SCOPE,
  type StorageLister,
  type UserProbe,
} from '../delete-account/plan.ts'

// ── Bucket rules ──────────────────────────────────────────────────────────────

// The number of path segments every legitimate key in each bucket has, from the
// writers (lib/storage.ts builders, generate-report's saved copy). A mapped type over
// every STORAGE_BUCKETS key, so a bucket added there fails the build here until it says
// what its keys look like. A key of any other depth is left: it was not written by
// anything we know, so its folder is not proof of who owns it.
export const KEY_SEGMENTS: { readonly [K in keyof typeof STORAGE_BUCKETS]: number } = {
  petPhotos: 2, // {petId}/profile.jpg
  eventAttachments: 3, // {petId}/{eventId}/{attachmentId}.jpg
  vetAttachments: 3, // {petId}/{visitId}/{attachmentId}.jpg
  vetDocuments: 2, // {petId}/{documentId}.pdf
  vetReports: 2, // {petId}/{reportId}.html
  medicationPhotos: 3, // {uid}/{medId}/{slot}.jpg
  foodPhotos: 2, // {foodItemId}/{slot}.jpg
}

export type OwnerScope = 'pet' | 'food' | 'user'

export interface BucketRule {
  bucket: string
  scope: OwnerScope
  segments: number
}

export const BUCKET_RULES: ReadonlyArray<BucketRule> = (
  Object.keys(STORAGE_BUCKETS) as Array<keyof typeof STORAGE_BUCKETS>
).map((k) => ({ bucket: STORAGE_BUCKETS[k], scope: SWEEP_SCOPE[k], segments: KEY_SEGMENTS[k] }))

// 24 hours. A signed upload URL lasts 2 h by default and a slow upload a few minutes;
// a day is far past both, and a late file after an account deletion still leaves
// within a day of landing (plus the time to the next daily run).
export const GRACE_MS = 24 * 60 * 60 * 1000

// Owner ids per PostgREST `in` read: one uuid is 36 characters plus a comma, kept well
// under the URL limit (sweepIds.ts uses the same bound).
export const OWNER_READ_CHUNK = 100

// The only root shape the sweep acts on: a canonical, LOWERCASE uuid (rule 2 above).
const ROOT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isSweepableRoot(name: string): boolean {
  return ROOT_UUID.test(name)
}

// ── Injected I/O ──────────────────────────────────────────────────────────────

// One directory entry, with the timestamps the grace check reads. `id` null marks a
// folder (storage-api's convention), as in delete-account's StorageListEntry.
export interface TimedEntry {
  name: string
  id: string | null
  createdAt: string | null
  updatedAt: string | null
}

// One page of a folder's direct children; `prefix` '' is the bucket's top level.
// Throws on any error.
export type TimedLister = (prefix: string, offset: number, limit: number) => Promise<TimedEntry[]>

export interface LiveIdRead {
  ids: string[] | null
  count: number | null
  error: string | null
}

export interface RetiredRead {
  rows: Array<{ id: string; owner: string | null }> | null
  count: number | null
  error: string | null
}

export interface SweepIO {
  // Every bucket in the project. Throws on error.
  listBuckets(): Promise<string[]>
  listerFor(bucket: string): TimedLister
  // `select id from <table> where id in (ids)`, count exact.
  liveIds(table: 'pets' | 'food_items', ids: string[]): Promise<LiveIdRead>
  // `select id, owner_id from food_item_retired_ids where id in (ids)`, count exact.
  retiredFoods(ids: string[]): Promise<RetiredRead>
  // delete-account's userProbeOf over `auth.admin.getUserById(id)`.
  probeUser(id: string): Promise<UserProbe>
  // Removes the keys, returns how many objects Storage says it removed. Throws on error.
  remove(bucket: string, keys: string[]): Promise<number>
}

export interface SweepRunOptions {
  now: () => number
  // Epoch ms after which no new folder starts.
  deadline?: number
  // Epoch ms by which every call must have ended.
  cutoff?: number
  callTimeoutMs?: number
}

// ── The run line ──────────────────────────────────────────────────────────────

// Why something was left. Folder reasons count folders, file reasons count files,
// bucket reasons count buckets: the prefix says which, so no count is read in the
// wrong unit.
export type LeftReason =
  | 'bucket_unknown'
  | 'bucket_list_failed'
  | 'bucket_not_reached'
  | 'folder_unknown_shape'
  | 'folder_owner_unread'
  | 'folder_owner_may_return'
  | 'folder_not_retired'
  | 'folder_walk_gap'
  | 'folder_not_reached'
  | 'file_at_root'
  | 'file_unknown_shape'
  | 'file_no_timestamp'
  | 'file_in_grace'
  | 'file_remove_failed'

export interface SweepReport {
  removed: Record<string, number>
  // Folders whose owner was read, by outcome.
  folders: Record<string, { live: number; gone: number }>
  left: Record<string, Partial<Record<LeftReason, number>>>
}

function emptyReport(): SweepReport {
  return { removed: {}, folders: {}, left: {} }
}

// A bucket name is project data (only the service role creates buckets), but it is
// used as an object key, so the three that would write to a prototype are renamed.
function safeKey(bucket: string): string {
  return bucket === '__proto__' || bucket === 'constructor' || bucket === 'prototype' ? '?' : bucket
}

function bump(report: SweepReport, bucket: string, reason: LeftReason, n = 1): void {
  if (n <= 0) return
  const b = (report.left[safeKey(bucket)] ??= {})
  b[reason] = (b[reason] ?? 0) + n
}

// The `sweep-orphaned-storage.run` line. Counts, bucket names and reason codes only:
// never a path, an id or a file name, because a pet or food id is the key to a folder
// of health photos and a name is attacker-chosen text.
export function runLine(report: SweepReport): string {
  return JSON.stringify({ event: 'sweep-orphaned-storage.run', ...report })
}

// ── Timing ────────────────────────────────────────────────────────────────────

export const CALL_TIMEOUT_MS = 15_000

async function withinTime<T>(call: () => Promise<T>, opts: SweepRunOptions): Promise<T> {
  const callTimeout = opts.callTimeoutMs ?? CALL_TIMEOUT_MS
  const left = opts.cutoff === undefined ? callTimeout : Math.min(callTimeout, opts.cutoff - opts.now())
  if (left <= 0) throw new Error('sweep time limit: not started, past the cutoff')
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sweep time limit: no answer in ${left} ms`)), left)
  })
  try {
    return await Promise.race([call(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

// ── Pure decisions ────────────────────────────────────────────────────────────

// The newest of a file's two timestamps, or null when neither parses. Taking the
// NEWER one means an overwrite (upsert) restarts the grace period.
export function newestTimestamp(e: { createdAt: string | null; updatedAt: string | null }): number | null {
  let best: number | null = null
  for (const t of [e.createdAt, e.updatedAt]) {
    if (typeof t !== 'string' || t.length === 0) continue
    const ms = Date.parse(t)
    if (Number.isNaN(ms)) continue
    if (best === null || ms > best) best = ms
  }
  return best
}

export type FileVerdict = 'remove' | 'file_unknown_shape' | 'file_no_timestamp' | 'file_in_grace'

// What to do with one file inside a folder already PROVED orphaned.
export function fileVerdict(
  key: string,
  segments: number,
  stamp: { createdAt: string | null; updatedAt: string | null } | undefined,
  now: number,
): FileVerdict {
  const parts = key.split('/')
  if (parts.length !== segments || parts.some((p) => p.length === 0 || p === '.' || p === '..')) {
    return 'file_unknown_shape'
  }
  const t = stamp ? newestTimestamp(stamp) : null
  if (t === null) return 'file_no_timestamp'
  // A timestamp in the future is not old: it stays until the clock passes it plus grace.
  if (now - t < GRACE_MS) return 'file_in_grace'
  return 'remove'
}

// Which of `ids` a successful, complete read proves gone. Returns null when the read
// proves nothing (an error, no count, a count that does not match the rows, or a row
// the read was not asked for), so the caller leaves every folder in the batch.
export function goneFromRead(ids: ReadonlyArray<string>, read: LiveIdRead): string[] | null {
  if (read.error) return null
  if (!Array.isArray(read.ids)) return null
  if (typeof read.count !== 'number' || read.count !== read.ids.length) return null
  const asked = new Set(ids)
  const live = new Set<string>()
  for (const id of read.ids) {
    // A row we did not ask for (or a case-folded one) means the read and our ids
    // disagree on what an id is; nothing in this batch is proved either way.
    if (typeof id !== 'string' || !asked.has(id)) return null
    live.add(id)
  }
  return ids.filter((id) => !live.has(id))
}

// ── The run ───────────────────────────────────────────────────────────────────

interface Candidate {
  rule: BucketRule
  root: string
}

// Lists a bucket's top level, paging until an empty page (C-42). Returns the folder
// names, after counting root files and unsafe names as left. Throws on a list error.
async function topLevelFolders(
  rule: BucketRule,
  list: TimedLister,
  report: SweepReport,
  opts: SweepRunOptions,
): Promise<string[]> {
  const folders: string[] = []
  for (let offset = 0; ; ) {
    const page = await withinTime(() => list('', offset, STORAGE_LIST_PAGE), opts)
    if (page.length === 0) break
    offset += page.length
    for (const e of page) {
      if (e.id !== null) bump(report, rule.bucket, 'file_at_root')
      else if (typeof e.name !== 'string' || !isSweepableRoot(e.name)) bump(report, rule.bucket, 'folder_unknown_shape')
      else folders.push(e.name)
    }
  }
  return [...new Set(folders)]
}

async function goneRoots(
  rule: BucketRule,
  roots: string[],
  io: SweepIO,
  report: SweepReport,
  opts: SweepRunOptions,
): Promise<string[]> {
  const tally = (report.folders[rule.bucket] ??= { live: 0, gone: 0 })
  const gone: string[] = []
  if (rule.scope === 'user') {
    for (const root of roots) {
      const p = await probe(io, root, opts)
      if (p === 'gone') {
        tally.gone++
        gone.push(root)
      } else if (p === 'present') tally.live++
      else bump(report, rule.bucket, 'folder_owner_unread')
    }
    return gone
  }
  const table = rule.scope === 'pet' ? 'pets' : 'food_items'
  for (const batch of chunk(roots, OWNER_READ_CHUNK)) {
    let read: LiveIdRead
    try {
      read = await withinTime(() => io.liveIds(table, batch), opts)
    } catch (e) {
      read = { ids: null, count: null, error: e instanceof Error ? e.message : String(e) }
    }
    const g = goneFromRead(batch, read)
    if (g === null) {
      bump(report, rule.bucket, 'folder_owner_unread', batch.length)
      continue
    }
    tally.live += batch.length - g.length
    if (rule.scope === 'food') {
      const forGood = await foodsGoneForGood(rule, g, io, report, opts)
      tally.gone += forGood.length
      gone.push(...forGood)
    } else {
      tally.gone += g.length
      gone.push(...g)
    }
  }
  return gone
}

async function probe(io: SweepIO, id: string, opts: SweepRunOptions): Promise<UserProbe> {
  try {
    return await withinTime(() => io.probeUser(id), opts)
  } catch {
    return 'unknown'
  }
}

// Which food ids, already missing from food_items, can never come back (see the
// header): 106's ledger names them, with no owner or with an owner whose account is
// gone. Every other id is left and counted.
async function foodsGoneForGood(
  rule: BucketRule,
  missing: string[],
  io: SweepIO,
  report: SweepReport,
  opts: SweepRunOptions,
): Promise<string[]> {
  if (missing.length === 0) return []
  let read: RetiredRead
  try {
    read = await withinTime(() => io.retiredFoods(missing), opts)
  } catch (e) {
    read = { rows: null, count: null, error: e instanceof Error ? e.message : String(e) }
  }
  const owners = retiredOwners(missing, read)
  if (owners === null) {
    bump(report, rule.bucket, 'folder_owner_unread', missing.length)
    return []
  }
  const probes = new Map<string, UserProbe>()
  const out: string[] = []
  for (const id of missing) {
    if (!owners.has(id)) {
      bump(report, rule.bucket, 'folder_not_retired')
      continue
    }
    const owner = owners.get(id) ?? null
    if (owner === null) {
      out.push(id)
      continue
    }
    if (!probes.has(owner)) probes.set(owner, await probe(io, owner, opts))
    const p = probes.get(owner)
    if (p === 'gone') out.push(id)
    else if (p === 'present') bump(report, rule.bucket, 'folder_owner_may_return')
    else bump(report, rule.bucket, 'folder_owner_unread')
  }
  return out
}

// The ledger rows for `ids` as id → owner (null: no owner), or null when the read
// proves nothing (an error, no count, a count that disagrees with the rows, a row it
// was not asked for, an id twice). An id absent from the map has no ledger row.
export function retiredOwners(ids: ReadonlyArray<string>, read: RetiredRead): Map<string, string | null> | null {
  if (read.error || !Array.isArray(read.rows)) return null
  if (typeof read.count !== 'number' || read.count !== read.rows.length) return null
  const asked = new Set(ids)
  const out = new Map<string, string | null>()
  for (const row of read.rows) {
    if (!row || typeof row.id !== 'string' || !asked.has(row.id) || out.has(row.id)) return null
    if (row.owner !== null && typeof row.owner !== 'string') return null
    out.set(row.id, row.owner)
  }
  return out
}

// Empties one proved-orphaned folder of every file the verdict allows.
async function sweepFolder(c: Candidate, io: SweepIO, report: SweepReport, opts: SweepRunOptions): Promise<void> {
  const { rule, root } = c
  const stamps = new Map<string, { createdAt: string | null; updatedAt: string | null }>()
  const timed = io.listerFor(rule.bucket)
  // delete-account's walker, fed through a lister that keeps each file's timestamps
  // (the walker returns keys only). One walker, one set of unsafe-name and depth rules.
  const lister: StorageLister = async (prefix, offset, limit) => {
    const page = await withinTime(() => timed(prefix, offset, limit), opts)
    for (const e of page) {
      if (e.id !== null && typeof e.name === 'string') {
        stamps.set(`${prefix}/${e.name}`, { createdAt: e.createdAt, updatedAt: e.updatedAt })
      }
    }
    return page.map((e) => ({ name: e.name, id: e.id }))
  }
  let keys: string[]
  try {
    const listing = await listPrefixForSweep(lister, root)
    if (listing.gaps.length > 0) bump(report, rule.bucket, 'folder_walk_gap')
    keys = listing.keys
  } catch {
    bump(report, rule.bucket, 'folder_walk_gap')
    return
  }
  const now = opts.now()
  const doomed: string[] = []
  for (const key of keys) {
    const v = fileVerdict(key, rule.segments, stamps.get(key), now)
    if (v === 'remove') doomed.push(key)
    else bump(report, rule.bucket, v)
  }
  for (const batch of chunk(doomed, STORAGE_REMOVE_CHUNK)) {
    try {
      const n = await withinTime(() => io.remove(rule.bucket, batch), opts)
      report.removed[rule.bucket] = (report.removed[rule.bucket] ?? 0) + n
      bump(report, rule.bucket, 'file_remove_failed', batch.length - n)
    } catch {
      bump(report, rule.bucket, 'file_remove_failed', batch.length)
    }
  }
}

// One full pass. Best-effort and never throws: every failure is a count in the report.
// Each bucket is listed, resolved and swept before the next is listed, so the time a
// run has always removes something (rls-privacy-reviewer F4: collecting every bucket's
// candidates first could spend the whole budget listing, every day). The starting
// bucket rotates by UTC day, so a bucket that would always come last cannot be starved.
// Folders are swept one at a time (a daily job has no hurry, and serial work keeps the
// load flat). Past the deadline the rest are counted as not reached; the next run finds
// them again, since a folder proved gone stays gone.
export async function runSweep(io: SweepIO, opts: SweepRunOptions): Promise<SweepReport> {
  const report = emptyReport()
  const known = new Set(BUCKET_RULES.map((r) => r.bucket))

  try {
    const buckets = await withinTime(() => io.listBuckets(), opts)
    for (const b of buckets) if (typeof b === 'string' && !known.has(b)) bump(report, b, 'bucket_unknown')
  } catch {
    // Not knowing the bucket list says nothing about the known buckets; each one is
    // still listed (and a missing one fails its own listing, below).
    bump(report, '*', 'bucket_list_failed')
  }

  const past = () => opts.deadline !== undefined && opts.now() >= opts.deadline
  for (const rule of rotatedRules(opts.now())) {
    if (past()) {
      bump(report, rule.bucket, 'bucket_not_reached')
      continue
    }
    let roots: string[]
    try {
      roots = await topLevelFolders(rule, io.listerFor(rule.bucket), report, opts)
    } catch {
      bump(report, rule.bucket, 'bucket_list_failed')
      continue
    }
    const gone = await goneRoots(rule, roots, io, report, opts)
    let next = 0
    for (; next < gone.length && !past(); next++) await sweepFolder({ rule, root: gone[next] }, io, report, opts)
    bump(report, rule.bucket, 'folder_not_reached', gone.length - next)
  }
  return report
}

// BUCKET_RULES, starting at the UTC day's index.
export function rotatedRules(now: number): BucketRule[] {
  const n = BUCKET_RULES.length
  const day = Math.floor(now / 86_400_000)
  const start = ((day % n) + n) % n
  return [...BUCKET_RULES.slice(start), ...BUCKET_RULES.slice(0, start)]
}

// ── The request gate ──────────────────────────────────────────────────────────

// The body the pg_cron job sends. NOT a secret: it is written in the schedule's
// migration. It exists so a call that is not the schedule's does nothing: the deploy's
// anon smoke POST (`{}`) gets a 400 with an error body, which is what its check passes
// on, instead of running a real sweep on every deploy (rls-privacy-reviewer F1).
export const RUN_MARKER = 'sweep-orphaned-storage'

// The schedule: 09:23 UTC daily (the schedule's migration must match), and a run only
// starts within RUN_WINDOW_MIN of it. Any anon-key holder can reach the function, so
// this bounds how much work anyone can start to one short window a day
// (rls-privacy-reviewer F2). It is a bound, not a lease: callers inside the window can
// still start a run on each worker they reach.
export const RUN_HOUR_UTC = 9
export const RUN_MINUTE_UTC = 23
export const RUN_WINDOW_MIN = 15

export type GateVerdict = 'run' | 'not_a_run' | 'outside_window'

export function gate(body: unknown, now: number): GateVerdict {
  if (typeof body !== 'object' || body === null || (body as { run?: unknown }).run !== RUN_MARKER) return 'not_a_run'
  const d = new Date(now)
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() - (RUN_HOUR_UTC * 60 + RUN_MINUTE_UTC)
  return minutes >= 0 && minutes < RUN_WINDOW_MIN ? 'run' : 'outside_window'
}
