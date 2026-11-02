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
// The AI lead's columns are not written here: aiLead/run.ts is their one writer
// (aiLead/storage.guard.test.ts), and `keepCopy` takes its settle step as an argument.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/** How a kept copy left the phone. `shared_via` is free text (≤ 32) in 113; this is its set. */
export const SHARED_VIA = ['email', 'print', 'share'] as const
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
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The snapshot as the row keeps it: every embedded photo's bytes dropped (they live in the
 *  stored HTML, the copy that was sent), every other field as assembled. */
export function snapshotForCopy(snapshot: unknown): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(snapshot, (key, value) => (key === 'dataUri' ? null : value)))
  if (out === null || typeof out !== 'object' || Array.isArray(out)) throw new Error('snapshotForCopy: the snapshot is not an object')
  return out as Record<string, unknown>
}

/** `{ mode: 'keep', reportId, sharedVia }`. Null for any other mode. A keep request with a
 *  malformed id or an unknown route is refused by the caller (400), never run against a guess. */
export function parseKeepRequest(body: {
  mode?: unknown
  reportId?: unknown
  report_id?: unknown
  sharedVia?: unknown
  shared_via?: unknown
}): { reportId: string | null; sharedVia: SharedVia | null } | null {
  if (body.mode !== 'keep') return null
  const id = body.reportId ?? body.report_id
  const via = body.sharedVia ?? body.shared_via
  return {
    reportId: typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null,
    sharedVia: typeof via === 'string' && (SHARED_VIA as readonly string[]).includes(via) ? (via as SharedVia) : null,
  }
}

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
  markKept(id: string, via: SharedVia, atIso: string, sha: string): Promise<boolean>
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
      const { data, error } = await admin.from('vet_reports').select('status, storage_path, content_sha256, created_at')
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
    markKept: async (id, via, atIso, sha) => {
      // One write: 113's vet_reports_kept_complete CHECK needs snapshot, short_id, shared_at and
      // content_sha256 together, and the freeze starts on the next statement.
      const { data, error } = await admin.from('vet_reports')
        .update({ status: 'kept', shared_via: via, shared_at: atIso, content_sha256: sha })
        .eq('id', id).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
        .eq('content_sha256', sha)
        .select('id')
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

/** This owner's drafts of this pet older than 24 h: objects removed first, then the rows, so a
 *  failed pass leaves rows the next pass retries, never an orphaned object. Best-effort. */
export async function reapStaleDrafts(io: SavedCopyIO): Promise<number> {
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
 * columns are settled first (aiLead/run.ts, handed in as `settleLead`), because the freeze starts
 * with the keep. A copy already kept only moves its departure stamp.
 */
export async function keepCopy(
  io: SavedCopyIO,
  req: { reportId: string | null; sharedVia: SharedVia | null },
  settleLead: (storedHtml: string) => Promise<boolean>,
): Promise<KeepOutcome> {
  if (req.reportId === null || req.sharedVia === null) return { status: 400, body: { error: 'reportId and sharedVia required' } }
  const at = new Date(io.now()).toISOString()
  const row = await io.readRow(req.reportId)
  if (row === 'error') return { status: 500, body: { error: 'Saved copy could not be read' } }
  if (row === null) return { status: 404, body: { error: 'Saved copy not found' } }
  if (row.status === 'kept') {
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
  if (!(await settleLead(new TextDecoder().decode(bytes)))) return { status: 500, body: { error: 'Saved copy could not be kept' } }
  if (await io.markKept(req.reportId, req.sharedVia, at, row.content_sha256)) return { status: 200, body: { kept: true, first: true } }
  // Two sends racing: the other one kept it. Anything else is a failure, said as one.
  const again = await io.readRow(req.reportId)
  if (again !== 'error' && again !== null && again.status === 'kept') {
    return (await io.restamp(req.reportId, req.sharedVia, at))
      ? { status: 200, body: { kept: true, first: false } }
      : { status: 500, body: { error: 'Saved copy could not be updated' } }
  }
  return { status: 500, body: { error: 'Saved copy could not be kept' } }
}
