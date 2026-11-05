// The saved copy (Vet report v2 PR-20, CUL-2300; spec §11.1, §11.2; migration 113).
//
// EVERY REPORT AN OWNER SENDS IS KEPT, EXACTLY AS SENT. At Preview the server writes a `draft`
// row, renders the report with the row's short id in its colophon, stores that print HTML in the
// private `nyx-vet-reports` bucket and stamps the HTML's SHA-256 on the row. When the report
// leaves the phone (Mail, Print, Share), `mode: 'keep'` re-reads the stored file, checks it is
// still the file the hash names, and turns the row `kept` in one write. After that migration
// 113's trigger freezes every content column for every writer; only the departure stamp moves.
//
// THE ORDER IS THE DELETION PROMISE. The row is written BEFORE the object, and an object is
// removed BEFORE its row (the reaper, a failed save). Account deletion reads every row of the
// owner's pets, drafts included, and sweeps every pet folder, so at no moment does an object
// exist that neither a row nor a swept folder names.
//
// EVERY SERVICE-ROLE QUERY NAMES ITS ROW BY ID PAIRED WITH ITS PET AND ITS MAKER (C-27): the
// maker is the uid `auth.getUser()` verified on the request JWT, never a body value, and 113's
// trigger refuses a maker who does not own the pet. A row of someone else's pet matches nothing.
//
// A FAILED SAVE NEVER BLOCKS THE REPORT. The owner still previews and sends; the response says
// `report_id: null` and the colophon carries no short id (spec §5.10: never one nothing resolves).
//
// The AI lead's columns are not NAMED here: aiLead/run.ts builds what the keep writes to them
// (`KeepLead`, aiLead/storage.guard.test.ts), `keepCopy` takes that settle step as an argument,
// and `markKept` carries its result into the keep's one UPDATE without reading it (CUL-2436).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { KeepLead, KeepRefusal } from './aiLead/run.ts'

export const VET_REPORTS_BUCKET = 'nyx-vet-reports'

/** Which renderer wrote a stored copy (spec §3.6). Bump the suffix whenever renderPrintV2's
 *  output changes in a way a reader of an old copy should be able to tell apart. */
export const RENDERER_FINGERPRINT = 'renderPrintV2@1'

/** A draft not kept within this long is removed by the reaper (spec §11.1). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** A draft older than this is no longer kept: an hour inside the reaper's 24 h, so a keep can
 *  never race the reaper removing the same draft's file (rls-privacy-reviewer F2, PR-20). */
export const KEEP_WINDOW_MS = DRAFT_TTL_MS - 60 * 60 * 1000

/** Rows the reaper takes per pass: one Storage remove call, one row delete. */
export const REAP_BATCH = 50

/** Short-id attempts before the save gives up (20 bits per pet; a clash is rare, a run is rarer). */
export const SHORT_ID_ATTEMPTS = 5

/** Crockford base32: no I, L, O, U. Migration 113's `vet_reports_short_id_crockford` CHECK. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** How a kept copy left the phone. `shared_via` is free text (≤ 32) in 113; this is its set.
 *  `shown`: exam-room mode, the report shown across the table (CUL-2434, PM go (a) 2026-11-04). */
export const SHARED_VIA = ['email', 'print', 'share', 'shown'] as const
export type SharedVia = (typeof SHARED_VIA)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Pure pieces ──────────────────────────────────────────────────────────────

/** The one object key a row may name: `{pet_id}/{id}.html`, lower-case as uuid::text prints it.
 *  Migration 113's `vet_reports_storage_path_is_row_key` CHECK, and the shape
 *  scopeVetReportPaths keeps for the owner at deletion (guards/vetReportPathShape.test.ts). */
export function savedCopyPath(petId: string, reportId: string): string {
  if (!UUID.test(petId) || !UUID.test(reportId)) throw new Error('savedCopyPath: both ids must be UUIDs')
  return `${petId.toLowerCase()}/${reportId.toLowerCase()}.html`
}

/** A 4-character Crockford id. Uniform: 256 is a multiple of 32, so `byte % 32` has no bias. */
export function newShortId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(4), (b) => CROCKFORD[b % 32]).join('')
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A fresh copy is ArrayBuffer-backed, which digest's BufferSource requires.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The snapshot as the row keeps it: every embedded photo's bytes dropped (they live in the
 *  stored HTML, the copy that was sent), every other field as assembled. */
export function snapshotForCopy(snapshot: unknown): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(snapshot, (key, value) => (key === 'dataUri' ? null : value)))
  if (out === null || typeof out !== 'object' || Array.isArray(out)) throw new Error('snapshotForCopy: the snapshot is not an object')
  return out as Record<string, unknown>
}

/** What a keep request names. `sharedAt`: when the report left the phone, which the app sends on
 *  every try since CUL-2522 (a retry can land hours after the send). Absent from an older app,
 *  whose keep is stamped now. Bounded to [the Preview, now] (`clampSentAt`). */
export interface KeepRequest {
  reportId: string | null
  sharedVia: SharedVia | null
  sharedAt?: string | null
}

/** `{ mode: 'keep', reportId, sharedVia, sharedAt? }`. Null for any other mode. A keep request
 *  with a malformed id or an unknown route is refused by the caller (400), never run against a
 *  guess; a malformed `sharedAt` reads as none. */
export function parseKeepRequest(body: {
  mode?: unknown
  reportId?: unknown
  report_id?: unknown
  sharedVia?: unknown
  shared_via?: unknown
  sharedAt?: unknown
}): KeepRequest | null {
  if (body.mode !== 'keep') return null
  const id = body.reportId ?? body.report_id
  const via = body.sharedVia ?? body.shared_via
  const at = typeof body.sharedAt === 'string' && Number.isFinite(Date.parse(body.sharedAt)) ? body.sharedAt : null
  return {
    reportId: typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null,
    sharedVia: typeof via === 'string' && (SHARED_VIA as readonly string[]).includes(via) ? (via as SharedVia) : null,
    sharedAt: at,
  }
}

/** The answer that tells the phone a new Preview is the only way to a kept copy (its "Preview the
 *  report again" line): the stored copy's AI summary can no longer be kept (CUL-2523). */
export const NEW_PREVIEW_ERROR = 'Saved copy needs a new preview'

// ── The I/O, bound to one pet and one verified maker ─────────────────────────

export interface DraftRow {
  id: string
  storage_path: string
  date_range_start: string
  date_range_end: string
  report_version: string
  renderer_fingerprint: string
  params: Record<string, unknown>
  snapshot: Record<string, unknown>
  scope_basis: string
  short_id: string
}

export type InsertOutcome = 'ok' | 'short_id_taken' | 'failed'

export interface StoredRow {
  status: 'draft' | 'kept'
  storage_path: string
  content_sha256: string | null
  created_at: string
  /** The latest departure stamp; null on a draft. Optional: a reader that predates the replay
   *  (CUL-2522) may not carry it, and a replay then reads as later. */
  shared_at?: string | null
}

export interface SavedCopyIO {
  insertDraft(row: DraftRow): Promise<InsertOutcome>
  upload(path: string, bytes: Uint8Array): Promise<boolean>
  stampHash(id: string, sha: string): Promise<boolean>
  /** Removes a DRAFT row (113 refuses a kept one). */
  deleteDraft(id: string): Promise<boolean>
  removeObjects(paths: string[]): Promise<boolean>
  listStaleDrafts(createdBeforeIso: string, limit: number): Promise<Array<{ id: string; storage_path: string }> | null>
  deleteDrafts(ids: string[]): Promise<boolean>
  /** 'error' on a failed read; null when no row of this pet and maker has the id. */
  readRow(id: string): Promise<StoredRow | null | 'error'>
  download(path: string): Promise<Uint8Array | null>
  /** The keep: ONE statement that turns the draft kept and settles its lead (`lead`, CUL-2436). */
  markKept(id: string, via: SharedVia, atIso: string, sha: string, lead: KeepLead): Promise<boolean>
  restamp(id: string, via: SharedVia, atIso: string): Promise<boolean>
  now(): number
}

export interface CopyKey {
  petId: string
  uid: string
}

export function savedCopyIO(admin: SupabaseClient, key: CopyKey): SavedCopyIO {
  const warn = (what: string, e: { message?: string } | null | unknown) =>
    console.warn(`vet_reports saved copy: ${what}:`, (e as { message?: string } | null)?.message ?? String(e))
  const bucket = () => admin.storage.from(VET_REPORTS_BUCKET)
  return {
    insertDraft: async (row) => {
      const { error } = await admin.from('vet_reports').insert({ ...row, pet_id: key.petId, generated_by: key.uid, status: 'draft' })
      if (!error) return 'ok'
      // 23505 on (pet_id, short_id): draw again. Any other error, including a clash on id, fails.
      if ((error as { code?: string }).code === '23505' && /short_id/.test(error.message ?? '')) return 'short_id_taken'
      warn('draft insert failed', error)
      return 'failed'
    },
    upload: async (path, bytes) => {
      const { error } = await bucket().upload(path, bytes, { contentType: 'text/html; charset=utf-8', upsert: false })
      if (error) warn('upload failed', error)
      return !error
    },
    stampHash: async (id, sha) => {
      const { data, error } = await admin.from('vet_reports').update({ content_sha256: sha })
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft').select('id')
      if (error) warn('hash stamp failed', error)
      return !error && Array.isArray(data) && data.length === 1
    },
    deleteDraft: async (id) => {
      const { error } = await admin.from('vet_reports').delete()
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
      if (error) warn('draft delete failed', error)
      return !error
    },
    removeObjects: async (paths) => {
      if (paths.length === 0) return true
      const { error } = await bucket().remove(paths)
      if (error) warn('object remove failed', error)
      return !error
    },
    listStaleDrafts: async (createdBeforeIso, limit) => {
      // A capped pull, oldest first: what the cap leaves is reaped by the next pass
      // (guards/reportPullPagination.test.ts DELIBERATE_CAP 'generate-report/vet_reports').
      const { data, error } = await admin.from('vet_reports').select('id, storage_path', { count: 'exact' })
        .eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
        .lt('created_at', createdBeforeIso)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .limit(limit)
      if (error) {
        warn('stale draft read failed', error)
        return null
      }
      return (data ?? []) as Array<{ id: string; storage_path: string }>
    },
    deleteDrafts: async (ids) => {
      if (ids.length === 0) return true
      const { error } = await admin.from('vet_reports').delete()
        .in('id', ids).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
      if (error) warn('stale draft delete failed', error)
      return !error
    },
    readRow: async (id) => {
      const { data, error } = await admin.from('vet_reports').select('status, storage_path, content_sha256, created_at, shared_at')
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).maybeSingle()
      if (error) {
        warn('row read failed', error)
        return 'error'
      }
      return (data as StoredRow | null) ?? null
    },
    download: async (path) => {
      const { data, error } = await bucket().download(path)
      if (error || !data) {
        warn('download failed', error)
        return null
      }
      return new Uint8Array(await data.arrayBuffer())
    },
    markKept: async (id, via, atIso, sha, lead) => {
      // One write: 113's vet_reports_kept_complete CHECK needs snapshot, short_id, shared_at and
      // content_sha256 together, and the freeze starts on the next statement. The lead's settled
      // columns ride in the SAME statement (CUL-2436), so no lead write can land between the settle
      // and the freeze; a pinned lead that changed since its read matches nothing here.
      let q = admin.from('vet_reports')
        .update({ ...lead.set, status: 'kept', shared_via: via, shared_at: atIso, content_sha256: sha })
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
        .eq('content_sha256', sha)
      // A null pin is `IS NULL` (CUL-2523): `= NULL` matches nothing, which would refuse every
      // keep over a cleared column rather than pin it.
      for (const [column, value] of Object.entries(lead.unchanged)) q = value === null ? q.is(column, null) : q.eq(column, value)
      const { data, error } = await q.select('id')
      if (error) warn('keep failed', error)
      return !error && Array.isArray(data) && data.length === 1
    },
    restamp: async (id, via, atIso) => {
      const { data, error } = await admin.from('vet_reports').update({ shared_via: via, shared_at: atIso })
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'kept')
        .select('id')
      if (error) warn('departure stamp failed', error)
      return !error && Array.isArray(data) && data.length === 1
    },
    now: () => Date.now(),
  }
}

/** What the Preview reaper needs, and all it can reach. The scheduled sweep has its own I/O
 *  (reap-report-drafts/sweep.ts, CUL-2465). */
export type DraftReaperIO = Pick<SavedCopyIO, 'listStaleDrafts' | 'removeObjects' | 'deleteDrafts' | 'now'>

// ── The flows ────────────────────────────────────────────────────────────────

export interface DraftInput {
  petId: string
  startDate: string
  endDate: string
  scopeBasis: string
  params: Record<string, unknown>
  snapshot: unknown
}

export interface Rendered<D> {
  doc: D
  html: string
}

export type SaveResult<D> =
  | { saved: true; reportId: string; shortId: string; rendered: Rendered<D> }
  | { saved: false; rendered: Rendered<D> }

/**
 * Write the draft, render with its short id, store the HTML, stamp its hash. Any failure undoes
 * what it wrote (object first, then row) and hands back an UNSAVED render: no short id, so the
 * colophon never names a copy nothing holds. Never throws for a Storage or row failure.
 */
export async function saveDraft<D>(
  io: SavedCopyIO,
  input: DraftInput,
  render: (shortId: string | null) => Rendered<D>,
  newId: () => string = () => crypto.randomUUID(),
  drawShortId: () => string = () => newShortId(),
): Promise<SaveResult<D>> {
  const unsaved = (): SaveResult<D> => ({ saved: false, rendered: render(null) })
  const id = newId().toLowerCase()
  let path: string
  let snapshot: Record<string, unknown>
  try {
    path = savedCopyPath(input.petId, id)
    snapshot = snapshotForCopy(input.snapshot)
  } catch (e) {
    console.warn('vet_reports saved copy: not saved:', e instanceof Error ? e.message : String(e))
    return unsaved()
  }
  let shortId: string | null = null
  for (let i = 0; i < SHORT_ID_ATTEMPTS && shortId === null; i++) {
    const candidate = drawShortId()
    const out = await io.insertDraft({
      id,
      storage_path: path,
      date_range_start: input.startDate,
      date_range_end: input.endDate,
      report_version: 'v2',
      renderer_fingerprint: RENDERER_FINGERPRINT,
      params: input.params,
      snapshot,
      scope_basis: input.scopeBasis,
      short_id: candidate,
    })
    if (out === 'ok') shortId = candidate
    else if (out === 'failed') return unsaved()
  }
  if (shortId === null) return unsaved()

  const rendered = render(shortId)
  const bytes = new TextEncoder().encode(rendered.html)
  // Undo object first, and the row only once the object is gone: if the remove fails the row
  // stays, a draft the reaper lists and retries, so no object is ever left that no row names.
  const undo = async () => {
    if (await io.removeObjects([path])) await io.deleteDraft(id)
  }
  if (!(await io.upload(path, bytes))) {
    // The upload may have landed before its error came back: remove the key either way.
    await undo()
    return unsaved()
  }
  if (!(await io.stampHash(id, await sha256Hex(bytes)))) {
    await undo()
    return unsaved()
  }
  return { saved: true, reportId: id, shortId, rendered }
}

/** One batch of this owner's drafts of this pet older than 24 h, at Preview: objects removed
 *  first, then the rows, so a failed pass leaves rows the next pass retries, never an orphaned
 *  object. Best-effort. The scheduled sweep over every owner is reap-report-drafts/sweep.ts. */
export async function reapStaleDrafts(io: DraftReaperIO): Promise<number> {
  const stale = await io.listStaleDrafts(new Date(io.now() - DRAFT_TTL_MS).toISOString(), REAP_BATCH)
  if (stale === null || stale.length === 0) return 0
  if (!(await io.removeObjects(stale.map((r) => r.storage_path)))) return 0
  return (await io.deleteDrafts(stale.map((r) => r.id))) ? stale.length : 0
}

export type KeepOutcome =
  | { status: 200; body: { kept: true; first: boolean } }
  | { status: 400 | 404 | 409 | 500; body: { error: string } }

/**
 * Keep the draft as sent. The stored file must still be the one its hash names; the AI lead's
 * columns are settled IN the keep's one write (aiLead/run.ts builds them, handed in as
 * `settleLead`; CUL-2436), because the freeze starts with the keep. A copy already kept only
 * moves its departure stamp.
 */
/** The phone's send time, never before the Preview that made the draft nor after now. */
function clampSentAt(sentAt: string, createdAt: string, now: number): number {
  const sent = Date.parse(sentAt)
  const created = Date.parse(createdAt)
  return Math.min(now, Math.max(Number.isFinite(created) ? created : now, sent))
}

export async function keepCopy(
  io: SavedCopyIO,
  req: KeepRequest,
  settleLead: (storedHtml: string) => Promise<KeepLead | KeepRefusal | null>,
): Promise<KeepOutcome> {
  if (req.reportId === null || req.sharedVia === null) return { status: 400, body: { error: 'reportId and sharedVia required' } }
  const replay = typeof req.sharedAt === 'string'
  const row = await io.readRow(req.reportId)
  if (row === 'error') return { status: 500, body: { error: 'Saved copy could not be read' } }
  if (row === null) return { status: 404, body: { error: 'Saved copy not found' } }
  // A keep that names its send time is stamped with it, held between the Preview and now; one
  // that does not (an older app) is stamped now. So a keep the phone retries at the next open, or
  // after a background pause, never stamps that moment as the send (rls-privacy-reviewer F3).
  const at = new Date(replay ? clampSentAt(req.sharedAt as string, row.created_at, io.now()) : io.now()).toISOString()
  if (row.status === 'kept') {
    // A timed keep of a copy already kept (a second send, or a retry of one that landed before
    // the app could clear its row) stamps only a departure LATER than the one on the copy: an
    // earlier one is already logged, and a later send must still reach 119's departures
    // (rls-privacy-reviewer R1).
    if (replay) {
      const stamped = row.shared_at ? Date.parse(row.shared_at) : Number.NaN
      if (Number.isFinite(stamped) && Date.parse(at) <= stamped) return { status: 200, body: { kept: true, first: false } }
    }
    return (await io.restamp(req.reportId, req.sharedVia, at))
      ? { status: 200, body: { kept: true, first: false } }
      : { status: 500, body: { error: 'Saved copy could not be updated' } }
  }
  if (row.content_sha256 === null) return { status: 409, body: { error: 'Saved copy unavailable' } }
  // Past the keep window the reaper may already be removing this draft's file: refuse rather than
  // freeze a kept row over a file that is about to go.
  const created = Date.parse(row.created_at)
  if (!Number.isFinite(created) || io.now() - created > KEEP_WINDOW_MS) return { status: 409, body: { error: 'Saved copy expired' } }
  const bytes = await io.download(row.storage_path)
  if (bytes === null || (await sha256Hex(bytes)) !== row.content_sha256) {
    return { status: 409, body: { error: 'Saved copy unavailable' } }
  }
  const lead = await settleLead(new TextDecoder().decode(bytes))
  if (lead === null) return { status: 500, body: { error: 'Saved copy could not be kept' } }
  // A copy whose summary no record can make true, or whose summary the owner has since withdrawn
  // (CUL-2523, PM ruling (a)): refused for good, so the owner is told now and resends without it.
  if ('refused' in lead) return { status: 409, body: { error: NEW_PREVIEW_ERROR } }
  if (await io.markKept(req.reportId, req.sharedVia, at, row.content_sha256, lead)) return { status: 200, body: { kept: true, first: true } }
  // Two sends racing: the other one kept it. Anything else is a failure, said as one.
  const again = await io.readRow(req.reportId)
  if (again !== 'error' && again !== null && again.status === 'kept') {
    return (await io.restamp(req.reportId, req.sharedVia, at))
      ? { status: 200, body: { kept: true, first: false } }
      : { status: 500, body: { error: 'Saved copy could not be updated' } }
  }
  return { status: 500, body: { error: 'Saved copy could not be kept' } }
}

// ── Opening a kept copy (Vet report v2 PR-21, CUL-2301; spec §11.3) ──────────
//
// THE OWNER'S ONE READ OF THE STORED FILE. `nyx-vet-reports` has no Storage policy, so only the
// service role reaches it; this is the path the Reports library opens a copy through. The caller's
// uid is the one `auth.getUser()` verified (never a body value), the row is read by id PAIRED WITH
// its pet and that maker (`readRow`), and only a KEPT row opens: a draft answers exactly as a
// missing id does, so a library can never show a report that was not sent. The bytes go back
// inline (no signed URL is minted, so there is no bearer link to leak), and only after their
// SHA-256 matches the hash the row froze at keep: a copy whose object changed is refused, never
// shown as "exactly as sent".

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** `{ mode: 'open', reportId }`. Null for any other mode; a malformed id reads as null. */
export function parseOpenRequest(body: { mode?: unknown; reportId?: unknown; report_id?: unknown }): { reportId: string | null } | null {
  if (body.mode !== 'open') return null
  const id = body.reportId ?? body.report_id
  return { reportId: isUuid(id) ? id.toLowerCase() : null }
}

export type OpenOutcome =
  | { status: 200; body: { html: string } }
  | { status: 400 | 404 | 409 | 500; body: { error: string } }

/** The stored HTML of one kept copy, exactly as it was sent, or a refusal that shows nothing. */
export async function openCopy(io: Pick<SavedCopyIO, 'readRow' | 'download'>, req: { reportId: string | null }): Promise<OpenOutcome> {
  if (req.reportId === null) return { status: 400, body: { error: 'reportId required' } }
  const row = await io.readRow(req.reportId)
  if (row === 'error') return { status: 500, body: { error: 'Saved copy could not be read' } }
  // A draft is not a sent report: it answers as a missing id does.
  if (row === null || row.status !== 'kept') return { status: 404, body: { error: 'Saved copy not found' } }
  if (row.content_sha256 === null) return { status: 409, body: { error: 'Saved copy unavailable' } }
  const bytes = await io.download(row.storage_path)
  // A failed download may be a passing Storage error: 500, which the app offers to retry. Only a
  // file that is no longer the one sent is 409, which it does not.
  if (bytes === null) return { status: 500, body: { error: 'Saved copy could not be read' } }
  if ((await sha256Hex(bytes)) !== row.content_sha256) return { status: 409, body: { error: 'Saved copy unavailable' } }
  return { status: 200, body: { html: new TextDecoder().decode(bytes) } }
}
