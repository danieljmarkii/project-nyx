// Vet Files local mirror + upload contract (B-478 VF-1).
// Spec: docs/nyx-vet-files-requirements.md §5.1 / §5.2 / §6.2.
//
// The pure, testable half of the vet-document write path: the object-key
// convention, the mime normalisation, the row→remote mapping, and the upload
// preparation rule. lib/sync.ts is the I/O shell that calls these — same split as
// lib/medications.ts and lib/dietTrialMirror.ts, and for the same reason: the
// three things a reviewer has to be able to check (what key we write, what mime
// we claim, and whether a raw camera original can ever reach storage) should be
// checkable without a device.
//
// VF-1 is schema-isolated: nothing here renders anything. VF-3 (capture) is the
// first caller of buildVetDocumentPath / resolveVetDocumentMime.

import { compressForUpload } from './storage';

export const VET_DOCUMENTS_BUCKET = 'nyx-vet-documents';

// §4.5, ordered by the §2 continuity-of-care ranking — labs first because a
// specialist asks for the last year's bloodwork first; invoices last because they
// carry organisational rather than clinical value. Pickers render THIS order, never
// alphabetical (§4.5). Mirrors migration 044's vet_documents_kind_check exactly;
// the two must be changed together.
export const VET_DOCUMENT_KINDS = [
  'lab_result',
  'vaccination',
  'visit_summary',
  'imaging',
  'prescription',
  'referral',
  'invoice_estimate',
  'insurance',
  'correspondence',
  'other',
] as const;
export type VetDocumentKind = (typeof VET_DOCUMENT_KINDS)[number];

export const VET_DOCUMENT_DEFAULT_KIND: VetDocumentKind = 'other';

// D10 provenance. Mirrors vet_documents_source_check.
export const VET_DOCUMENT_SOURCES = ['camera', 'photo_library', 'files'] as const;
export type VetDocumentSource = (typeof VET_DOCUMENT_SOURCES)[number];

// The mime types a ROW may actually carry once written. Narrower than the bucket's
// allowed_mime_types (jpeg/png/heic/pdf) and narrower than migration 044's CHECK —
// deliberately, and the asymmetry is the design:
//   • the bucket is the OUTER gate (what may be uploaded at all),
//   • 044's CHECK mirrors the bucket so a future store-the-original path cannot
//     upload successfully and then fail to insert,
//   • this list is the INNER contract: every image the client stores has been
//     re-encoded to JPEG by compressForUpload, so image/png and image/heic can
//     never describe an object we actually wrote. Claiming otherwise would put a
//     `.heic` extension and a `image/heic` content-type on JPEG bytes, and the
//     detail screen branches on this value to pick its viewer (G2).
export const VET_DOCUMENT_STORED_MIME_TYPES = ['image/jpeg', 'application/pdf'] as const;
export type VetDocumentStoredMimeType = (typeof VET_DOCUMENT_STORED_MIME_TYPES)[number];

// Narrowing type guard for a value that arrives as plain TEXT from SQLite. The sync
// push uses this instead of an `as VetDocumentStoredMimeType` cast: the server CHECK
// permits four mime types and only these two can describe an object this app wrote,
// so the cast would be a lie that surfaces as a per-cycle throw on a queue slot
// rather than as a type error. See the call site in lib/sync.ts for why a wedged
// slot matters.
export function isStorableVetDocumentMime(mime: string): mime is VetDocumentStoredMimeType {
  return (VET_DOCUMENT_STORED_MIME_TYPES as readonly string[]).includes(mime);
}

const EXTENSION_BY_MIME: Record<VetDocumentStoredMimeType, string> = {
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

// What mime type the ROW should record for a file the owner just picked.
//
// One chokepoint, called at capture time BEFORE the row and the path are built, so
// the row, the object key and the bytes in storage can never disagree. Every image
// — JPEG, PNG, or the HEIC an iPhone camera roll actually hands over — becomes
// image/jpeg, because prepareVetDocumentUpload re-encodes it. PDFs are stored as
// picked because no PDF transform exists (D5: store-and-view only, no thumbnailing,
// no extraction, no server-side processing).
//
// Throws on anything else rather than guessing. The bucket would reject the upload
// anyway, but a silent guess here would produce a row describing an object that was
// never written — the failure mode that is invisible until a vet asks for the file.
export function resolveVetDocumentMime(pickedMimeType: string): VetDocumentStoredMimeType {
  const mime = pickedMimeType?.trim().toLowerCase() ?? '';
  if (mime === 'application/pdf') return 'application/pdf';
  if (mime.startsWith('image/')) return 'image/jpeg';
  throw new Error(`resolveVetDocumentMime: unsupported document type ${JSON.stringify(pickedMimeType)}`);
}

// The object key. `{pet_id}/{document_id}.{ext}`.
//
// The leading {pet_id} segment is the SECURITY boundary, enforced three
// independent ways: migration 044's storage_path CHECK (which binds even the
// service role), the nyx-vet-documents Storage policies (which bind every
// authenticated caller), and scopeVetDocumentPaths in delete-account (which binds
// the one service-role caller that removes objects). Centralising the convention
// in this one helper is the point — VF-3's capture screen calls this and cannot
// construct a non-compliant key.
//
// The DOCUMENT ID (not a slot, a counter, or a timestamp) is the filename, which is
// what makes migration 044's UNIQUE index on storage_path satisfiable by
// construction: one row, one object. D13's duplicate-on-add gets a new row id and
// therefore genuinely gets its own bytes under the other pet, rather than two rows
// sharing one object — which would make deleting one destroy the other's file.
export function buildVetDocumentPath(
  petId: string,
  documentId: string,
  storedMimeType: VetDocumentStoredMimeType,
): string {
  // Fail fast on a missing segment: an empty petId yields a leading '/', whose
  // first foldername is '' — rejected by RLS and by the CHECK — and a silently
  // rejected upload is exactly the class of bug this helper exists to prevent.
  if (!petId?.trim()) throw new Error('buildVetDocumentPath: petId is required (RLS prefix)');
  if (!documentId?.trim()) throw new Error('buildVetDocumentPath: documentId is required');
  // This helper is the single chokepoint for the convention, so it rejects any
  // segment that could break out of its slot. '..' matters specifically: the
  // storage predicate and the CHECK are both satisfied by
  // `{ownPetId}/../{victimPetId}/x.pdf` (its first folder segment IS a pet the
  // caller owns, and starts_with is a prefix test), so refusing to MINT that
  // string is the cheapest of the three places to stop it. Ids are
  // server-generated UUIDs today; guarding here keeps a future caller-supplied
  // segment from ever producing a surprising key.
  for (const seg of [petId, documentId]) {
    if (seg.includes('/') || seg.includes('\\') || seg.includes('..')) {
      throw new Error(`buildVetDocumentPath: illegal path segment ${JSON.stringify(seg)}`);
    }
  }
  const ext = EXTENSION_BY_MIME[storedMimeType];
  if (!ext) throw new Error(`buildVetDocumentPath: unsupported stored mime ${JSON.stringify(storedMimeType)}`);
  return `${petId}/${documentId}.${ext}`;
}

// Prepare a local file for upload — and the ONE rule that makes §6.2's privacy
// claim ("EXIF/GPS stripped on every image upload path, NO original-fallback")
// literally true for this bucket.
//
// ⚠ THE DIVERGENCE FROM prepareAttachmentUpload IS DELIBERATE. That helper (used by
// event and vet-visit attachments) catches a compression failure and uploads the
// ORIGINAL instead, so an attachment is never blocked. That is an
// original-with-GPS-intact upload path, and §5.2 names it explicitly as the hazard
// to verify against at build. Here the priority is inverted: a vet document is a
// photograph of paperwork carrying the owner's home address and the pet's clinical
// history, and there is no urgency that beats not leaking the location it was taken.
// So a failed re-encode THROWS. The caller leaves the row synced = 0 and the offline
// queue retries — the document is safe on the device throughout (AC 9), and the
// worst case is a delayed backup rather than a leaked coordinate.
//
// PDFs pass through untouched because no PDF transform exists in the project (D5).
// That is acceptable because a PDF from a PIMS carries no GPS EXIF — flag this if a
// scanned-to-PDF capture path is ever added, because that assumption dies with it.
export async function prepareVetDocumentUpload(
  localUri: string,
  storedMimeType: VetDocumentStoredMimeType,
): Promise<{ uri: string; mimeType: VetDocumentStoredMimeType }> {
  if (storedMimeType === 'application/pdf') {
    return { uri: localUri, mimeType: 'application/pdf' };
  }
  if (storedMimeType !== 'image/jpeg') {
    // Unreachable through resolveVetDocumentMime, which is the only sanctioned way
    // to produce this argument. Explicit so a hand-written row carrying, say,
    // 'image/heic' fails loudly here rather than uploading JPEG bytes under a
    // content-type that lies about them.
    throw new Error(`prepareVetDocumentUpload: unsupported stored mime ${JSON.stringify(storedMimeType)}`);
  }
  // No try/catch. A throw here is the point — see above.
  const uri = await compressForUpload(localUri);
  return { uri, mimeType: 'image/jpeg' };
}

// Does this row still hold bytes that need to reach Storage?
//
// A locally-captured document carries a durable file:// path from persistCapture; a
// HYDRATED row carries '' (the object exists server-side and there is no local file
// — the same empty sentinel event_attachments uses). Both can legitimately be
// synced = 0: the first because it has never been pushed, the second because the
// owner edited its title or soft-deleted it on this device. Only the first has
// anything to upload, and treating them the same would either skip a real upload or
// try to read bytes from ''.
export function needsObjectUpload(localUri: string | null | undefined): boolean {
  return typeof localUri === 'string' && localUri.startsWith('file://');
}

// ── The local SQLite row ─────────────────────────────────────────────────────

export interface LocalVetDocument {
  id: string;
  pet_id: string;
  vet_visit_id: string | null;
  document_group_id: string;
  kind: string;
  title: string | null;
  document_date: string | null;
  notes: string | null;
  source: string;
  // B-546 — the filename the document arrived with, or null. Provenance (D10),
  // sitting beside `source` and `file_size_bytes` rather than in `title`: see
  // migration 047's header for why filename-as-title would cost the row its Name
  // affordance forever.
  source_filename: string | null;
  // Local-only: the on-device file path. NEVER pushed and NEVER overwritten by
  // hydration (see hydrateVetDocuments) — it is this device's copy of the bytes,
  // and the server has no opinion about it.
  local_uri: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  page_index: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  synced: number;
}

// The Supabase upsert payload. `local_uri` and `synced` are deliberately absent —
// both are device state. Every other column round-trips, including deleted_at, which
// is how a soft delete travels between devices at all (an insert-only shape could
// never propagate one).
export interface RemoteVetDocumentUpsert {
  id: string;
  pet_id: string;
  vet_visit_id: string | null;
  document_group_id: string;
  kind: string;
  title: string | null;
  document_date: string | null;
  notes: string | null;
  source: string;
  source_filename: string | null;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  page_index: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function vetDocumentRowToRemote(row: LocalVetDocument): RemoteVetDocumentUpsert {
  return {
    id: row.id,
    pet_id: row.pet_id,
    vet_visit_id: row.vet_visit_id ?? null,
    document_group_id: row.document_group_id,
    kind: row.kind,
    title: row.title ?? null,
    document_date: row.document_date ?? null,
    notes: row.notes ?? null,
    source: row.source,
    source_filename: row.source_filename ?? null,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes ?? null,
    page_index: row.page_index ?? 0,
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
