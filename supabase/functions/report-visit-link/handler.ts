// Supabase Edge Function — report-visit-link, the pure half (Vet report v2 PR-22, CUL-2302;
// spec §11.3; critique GAP-28).
//
// WHAT IT DOES. Files one KEPT saved report under the visit or the booked appointment it was for,
// moves it to another, or takes it off ("Not for a visit"). Provenance only: the link changes no
// byte of the copy, no window, no count. Migration 113's content freeze is what makes that true
// for every writer, this one included: on a kept row only `vet_visit_id`, `vet_appointment_id`,
// the departure stamp, an earlier token expiry and `updated_at` may move.
//
// WHY A FUNCTION. 113 gives the client no column grant on either link (its PM plan, option a: the
// link goes through the server), and 110 lets a client UPDATE only `token_expires_at`. So this is
// the one write path, and it runs as the service role, which RLS does not scope. Every query below
// therefore names its row by id PAIRED WITH its pet and the uid `auth.getUser()` verified on the
// request JWT (C-27), never a body value alone:
//   1. the pet is the caller's (`pets.id = petId AND pets.user_id = uid`);
//   2. the report is that pet's, made by that caller, and kept (a draft is not a sent report);
//   3. the target visit or appointment is that SAME pet's and still live;
//   4. the write repeats the report's pairing and `status = 'kept'`, and must touch one row.
// Any miss answers one 404 with one message, so a caller learns nothing about another account's
// ids (109's no-oracle rule). Defence at rest stays where it was: 109's and 113's same-pet
// triggers refuse a cross-pet pair even if this file were wrong.
//
// ONE PROVENANCE. A report is for one visit OR one appointment, never both: setting either clears
// the other, so the visit screen never shows a report under two different visits.

export type LinkTarget = { kind: 'visit' | 'appointment'; id: string }

export interface LinkRequest {
  petId: string | null
  reportId: string | null
  /** Null clears the link ("Not for a visit"). Undefined: the body named no target at all. */
  target: LinkTarget | null | undefined
}

export interface ReportRow {
  status: string
}

/** The I/O, each call already paired with the verified uid by the shell. */
export interface LinkIO {
  /** Whether `petId` is a pet of the caller. */
  petIsCallers(petId: string): Promise<boolean | 'error'>
  /** The report by id, paired with its pet and the caller as maker. Null: no such row. */
  readReport(petId: string, reportId: string): Promise<ReportRow | null | 'error'>
  /** Whether the target exists, is the same pet's and is live. */
  targetIsPets(petId: string, target: LinkTarget): Promise<boolean | 'error'>
  /** Writes both link columns on the kept row; the number of rows changed. */
  writeLinks(
    petId: string,
    reportId: string,
    links: { vet_visit_id: string | null; vet_appointment_id: string | null },
  ): Promise<number | 'error'>
}

export type LinkOutcome =
  | { status: 200; body: { linked: LinkTarget | null } }
  | { status: 400 | 404 | 500; body: { error: string } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

/** Reads `{ petId, reportId, target: { kind, id } | null }`. A malformed field reads as null. */
export function parseLinkRequest(body: unknown): LinkRequest {
  const b = (body ?? {}) as { petId?: unknown; reportId?: unknown; target?: unknown }
  let target: LinkTarget | null | undefined
  if (b.target === null) {
    target = null
  } else if (typeof b.target === 'object' && b.target !== undefined) {
    const t = b.target as { kind?: unknown; id?: unknown }
    const id = uuidOrNull(t.id)
    target = (t.kind === 'visit' || t.kind === 'appointment') && id !== null ? { kind: t.kind, id } : undefined
  } else {
    target = undefined
  }
  return { petId: uuidOrNull(b.petId), reportId: uuidOrNull(b.reportId), target }
}

const NOT_FOUND: LinkOutcome = { status: 404, body: { error: 'Not found' } }
const FAILED: LinkOutcome = { status: 500, body: { error: 'Link could not be saved' } }

/** Sets, moves or clears one kept report's visit link. Never throws on a refusal. */
export async function linkReport(io: LinkIO, req: LinkRequest): Promise<LinkOutcome> {
  if (req.petId === null || req.reportId === null || req.target === undefined) {
    return { status: 400, body: { error: 'petId, reportId and target required' } }
  }
  const owned = await io.petIsCallers(req.petId)
  if (owned === 'error') return FAILED
  if (!owned) return NOT_FOUND

  const row = await io.readReport(req.petId, req.reportId)
  if (row === 'error') return FAILED
  if (row === null || row.status !== 'kept') return NOT_FOUND

  if (req.target !== null) {
    const ok = await io.targetIsPets(req.petId, req.target)
    if (ok === 'error') return FAILED
    if (!ok) return NOT_FOUND
  }

  const links = {
    vet_visit_id: req.target?.kind === 'visit' ? req.target.id : null,
    vet_appointment_id: req.target?.kind === 'appointment' ? req.target.id : null,
  }
  const changed = await io.writeLinks(req.petId, req.reportId, links)
  if (changed === 'error') return FAILED
  // Zero rows: the row moved between the read and the write (another device). Said as a miss.
  if (changed !== 1) return NOT_FOUND
  return { status: 200, body: { linked: req.target } }
}
