// Vet Files capture (B-478 VF-3).
// Spec: docs/nyx-vet-files-requirements.md §4.2 / §4.4 / §5.2 / §6.2. Design
// authority: docs/culprit-vet-files-mockups.html round 2.1 (D1-r2 add sheet,
// D2-r2 saved moment).
//
// VF-1 shipped the write CONTRACT (lib/vetDocuments.ts — the key convention, the
// mime chokepoint, the no-original-fallback upload rule) and VF-2 the read model.
// This is the write PATH: what a picked file becomes, and what the saved moment
// says about it. The screen (app/vet-files.tsx) owns the native pickers and the
// alerts; everything here is checkable in jest, which is the point — the two rules
// that matter most in this module are invisible on a device until a vet asks for
// the file:
//
//   1. every row's mime goes through resolveVetDocumentMime and every key through
//      buildVetDocumentPath, so the row, the object key and the bytes in Storage
//      cannot disagree (VF-1's whole reason for existing);
//   2. capture asks NOTHING (D11) — kind defaults to `other`, title stays NULL,
//      document_date defaults to the page's own EXIF date or today. Nothing on
//      this path may become a question.

import { getDb } from './db';
import { persistCapture } from './storage';
import { uuid, exifDateToISO } from './utils';
import {
  resolveVetDocumentMime,
  buildVetDocumentPath,
  VET_DOCUMENT_DEFAULT_KIND,
  type LocalVetDocument,
  type VetDocumentSource,
} from './vetDocuments';
import { formatVetDocumentDate, defaultVetDocumentTitle } from './vetDocumentLibrary';

// The `nyx-vet-documents` bucket's file_size_limit, mirrored client-side (15 MB,
// set at creation per §5.2).
//
// Mirrored deliberately rather than discovered by trying: an oversize upload fails
// server-side, the row stays synced = 0, and the offline queue retries it forever —
// so the owner is told at pick time, once, instead of holding a document that
// silently never backs up. Enforced on PDFs only: an image is re-encoded by
// compressForUpload to ~1600px/q75 before it ever reaches Storage, so a 40 MB HEIC
// lands well under the limit and rejecting it on its picked size would refuse a
// file that would have uploaded fine.
export const VET_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

// A file the owner has picked, before it is anything else. `pickedMimeType` is what
// the OS said — NOT what we will store (resolveVetDocumentMime decides that).
export interface PickedVetFile {
  localUri: string;
  pickedMimeType: string;
  /** Trusted EXIF capture instant, if the asset carried one. */
  exifIso?: string | null;
  /** Byte size as reported by the picker; null when unknown. */
  fileSizeBytes?: number | null;
  /**
   * B-546 — the name the file arrived with, for the Files/PDF path ONLY.
   *
   * Set by pickedFilesFromDocumentAssets and deliberately NOT by
   * pickedFilesFromImageAssets: a camera-roll asset is called `IMG_4821.HEIC`,
   * which would put a meta line on every image row to say nothing. A file the
   * owner or their clinic named is a different kind of fact.
   */
  fileName?: string | null;
}

// ── Picker → PickedVetFile ───────────────────────────────────────────────────

// What the OS handed us, narrowed to the fields this module reads. Structural
// types rather than the SDK's own so the mapping stays testable without importing
// a native module (and so an SDK field rename surfaces here, at one call site).
export interface ImageAssetLike {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  exif?: Record<string, unknown> | null;
}

export interface DocumentAssetLike {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
  size?: number | null;
}

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
};

// The mime the picker claims, or the filename's extension when it claims nothing
// useful.
//
// Both fallbacks are real: expo-image-picker omits `mimeType` on some Android
// paths, and a document provider can hand back `application/octet-stream` for a
// PDF it declined to sniff. Neither is a reason to refuse a lab result — but a
// GUESS must never reach the row, which is why this feeds resolveVetDocumentMime
// (the chokepoint) rather than being written anywhere.
export function inferPickedMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): string {
  const claimed = mimeType?.trim().toLowerCase() ?? '';
  if (claimed && claimed !== 'application/octet-stream') return claimed;
  const ext = (fileName ?? '').trim().toLowerCase().split('.').pop() ?? '';
  return EXTENSION_MIME[ext] ?? claimed;
}

// Drop a future-dated EXIF instant (a wrong camera clock) rather than filing the
// document under a date that has not happened. Same rule as trustedPastExifIso in
// lib/utils, taking `now` as an argument instead of reading the clock so the
// builder below stays deterministic under test.
function trustedPastIso(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t > now.getTime()) return null;
  return iso;
}

export function pickedFilesFromImageAssets(
  assets: ImageAssetLike[],
  now: Date = new Date(),
): PickedVetFile[] {
  return assets.map((asset) => {
    const dateRaw = asset.exif?.DateTimeOriginal ?? asset.exif?.DateTime;
    const exifIso = typeof dateRaw === 'string'
      ? trustedPastIso(exifDateToISO(dateRaw), now)
      : null;
    return {
      localUri: asset.uri,
      pickedMimeType: inferPickedMimeType(asset.mimeType, asset.fileName),
      exifIso,
      fileSizeBytes: asset.fileSize ?? null,
    };
  });
}

export function pickedFilesFromDocumentAssets(assets: DocumentAssetLike[]): PickedVetFile[] {
  return assets.map((asset) => ({
    localUri: asset.uri,
    pickedMimeType: inferPickedMimeType(asset.mimeType, asset.name),
    // A PDF from a clinic portal carries no EXIF; its `document_date` defaults to
    // today and the owner can correct it on the detail screen (VF-4).
    exifIso: null,
    fileSizeBytes: asset.size ?? null,
    // B-546. This function used to read `asset.name` purely to infer a mime type
    // (the line above) and then discard it — which is how two lab PDFs from one
    // clinic visit ended up as two rows reading "Document — Jul 14", with no
    // thumbnail to tell them apart (PDFs get none by design, D5) and nothing
    // asked at capture to name them (D11). The name was in our hands the whole
    // time; keeping it costs nothing and no taps.
    fileName: asset.name ?? null,
  }));
}

// What may be STORED as source_filename, out of whatever a document provider
// hands over.
//
// Bounded and sanitised at the write path rather than trusted, because unlike
// `title` and `notes` this string is persisted WITHOUT the owner typing it — so
// nobody sees it before it lands on a clinical row. Four rules, each closing
// something a real provider does:
//
//   • directory separators are cut to the basename. Android's Storage Access
//     Framework and some cloud providers return a display name containing a
//     path, and "Downloads/labs/CBC.pdf" is both wrong (it is not the file's
//     name) and a shape no other value on this row can take.
//   • control characters and newlines are dropped, and runs of whitespace
//     collapse to one space. A name with a \n in it would silently break a
//     single-line row's layout, and a name carrying U+202E would reverse the
//     rendering of the extension — which on a screen whose whole job is telling
//     a PDF from a photo is a lie, not a curiosity.
//   • the result is capped to VET_DOCUMENT_FILENAME_MAX. It renders on one line
//     beside a 44pt row; anything past this is invisible on every device and is
//     bytes on a clinical row for nothing. Trimmed WELL under migration 048's
//     255-char CHECK so the client can never mint a row the server refuses.
//   • empty in, null out. "" is not a filename, and NULL is what every reader
//     already branches on.
//
// The extension is deliberately NOT stripped: ".pdf" is half of what makes the
// line legible as a file rather than as a title.
export const VET_DOCUMENT_FILENAME_MAX = 120;

export function sourceFilename(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const basename = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = basename
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > VET_DOCUMENT_FILENAME_MAX
    ? cleaned.slice(0, VET_DOCUMENT_FILENAME_MAX).trimEnd()
    : cleaned;
}

// ── Screening ────────────────────────────────────────────────────────────────

export interface ScreenedPicks {
  accepted: PickedVetFile[];
  /** Count of picks whose type this bucket cannot hold at all. */
  rejectedType: number;
  /** Count of PDFs over the bucket's file_size_limit. */
  rejectedSize: number;
}

// Split a pick into what can be saved and what cannot, WITHOUT throwing.
//
// A partial accept is the right behaviour: an owner who multi-selects six
// screenshots and one unsupported file should end up with six saved documents and
// one honest sentence, not a failed capture. The screen reports the counts; this
// function decides them.
export function screenPickedFiles(files: PickedVetFile[]): ScreenedPicks {
  const out: ScreenedPicks = { accepted: [], rejectedType: 0, rejectedSize: 0 };
  for (const file of files) {
    let stored: string;
    try {
      stored = resolveVetDocumentMime(file.pickedMimeType);
    } catch {
      out.rejectedType += 1;
      continue;
    }
    if (
      stored === 'application/pdf' &&
      typeof file.fileSizeBytes === 'number' &&
      file.fileSizeBytes > VET_DOCUMENT_MAX_BYTES
    ) {
      out.rejectedSize += 1;
      continue;
    }
    out.accepted.push(file);
  }
  return out;
}

// ── Building the rows ────────────────────────────────────────────────────────

// Local calendar date 'YYYY-MM-DD' for the `document_date` DATE column.
//
// The DEVICE-LOCAL day, never UTC: a document photographed at 8pm in California is
// filed under that day, not tomorrow. The read side hand-parses for the mirror
// image of this reason (see formatVetDocumentDate).
function localCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// One document, one date — page 0's EXIF date if it has one, else today (§4.2:
// "document_date = EXIF date or today"). Pages 2..n do NOT get their own dates:
// they are pages of the same discharge sheet, and a multi-page document whose
// pages disagree about its date would sort against itself in the library.
export function vetDocumentDateFromPages(
  pages: PickedVetFile[],
  now: Date = new Date(),
): string {
  const exif = trustedPastIso(pages[0]?.exifIso ?? null, now);
  return localCalendarDate(exif ? new Date(exif) : now);
}

export interface BuildVetDocumentRowsInput {
  petId: string;
  source: VetDocumentSource;
  /** The pages of ONE document, in order. */
  pages: PickedVetFile[];
  /**
   * Append to an existing group instead of starting one: its id, and the
   * page_index to continue from. Used by the saved moment's "Add another page".
   */
  groupId?: string;
  startPageIndex?: number;
  /** The group's date when appending — a new page inherits it, never re-dates it. */
  documentDate?: string | null;
  now?: Date;
  /** Seams for the test: an id factory and the durable-copy call. */
  newId?: () => string;
  persistFile?: (sourceUri: string, fileName: string) => string;
}

// Turn picked pages into local rows, ready to insert.
//
// Order inside the loop is load-bearing and mirrors VF-1's contract note: resolve
// the STORED mime first, then the id, then the key — so the extension in the key,
// the `mime_type` on the row, and the bytes prepareVetDocumentUpload will send are
// decided in one place from one value. The durable local copy is named after the
// key's own basename, so a file on disk can be matched to its object by eye.
//
// Throws (via resolveVetDocumentMime / buildVetDocumentPath) on a page that should
// never have reached here — screenPickedFiles is the caller's filter, and a throw
// past it means a bug, not an owner mistake.
export function buildVetDocumentRows(input: BuildVetDocumentRowsInput): LocalVetDocument[] {
  const {
    petId, source, pages,
    startPageIndex = 0,
    now = new Date(),
    newId = uuid,
    persistFile = persistCapture,
  } = input;

  const nowIso = now.toISOString();
  const documentDate = input.documentDate ?? vetDocumentDateFromPages(pages, now);
  const ids = pages.map(() => newId());
  // §5.1: document_group_id equals the row id for a single-page document, so the
  // cover's id is the group's identity. Appending passes the existing group in.
  const groupId = input.groupId ?? ids[0];

  return pages.map((page, i) => {
    const storedMime = resolveVetDocumentMime(page.pickedMimeType);
    const id = ids[i];
    const storagePath = buildVetDocumentPath(petId, id, storedMime);
    const fileName = storagePath.slice(storagePath.indexOf('/') + 1);
    return {
      id,
      pet_id: petId,
      // Never set at capture — D7 forbids the upload direction entirely, and §4.2
      // makes linkage a deferrable detail-screen action (VF-4).
      vet_visit_id: null,
      document_group_id: groupId,
      kind: VET_DOCUMENT_DEFAULT_KIND,
      // NULL, not a stored default: a stored "Document — Jul 26" is
      // indistinguishable from an owner who typed it, and the row would lose its
      // Name affordance forever (see lib/vetDocumentLibrary's header).
      title: null,
      document_date: documentDate,
      notes: null,
      source,
      // B-546. Per PAGE, not per group — for the Files path each document IS one
      // page (two PDFs are two records, see the grouping note in app/vet-files.tsx),
      // and for the camera/Photos paths this is null on every page anyway. Stored
      // ALONGSIDE the NULL title above, never instead of it: the row must stay
      // untitled or it loses its one-tap Name pill (migration 048's header).
      source_filename: sourceFilename(page.fileName),
      // B-104 — copy off the OS cache directory (reclaimed under storage pressure)
      // into app-owned storage, and store THAT. This is also the free half of
      // AC 12: a document captured on this phone renders with no network, forever.
      local_uri: persistFile(page.localUri, fileName),
      storage_path: storagePath,
      mime_type: storedMime,
      // Only the PDF path knows the size of the object we will actually store —
      // an image is re-encoded before upload, so recording its picked size here
      // would describe a file that never exists.
      file_size_bytes: storedMime === 'application/pdf' ? page.fileSizeBytes ?? null : null,
      page_index: startPageIndex + i,
      deleted_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      synced: 0,
    };
  });
}

// D13 — "Also add to {other pet}'s Vet Files": a full independent copy.
//
// Independent means every layer: new row ids, a new group id per group, a new
// object key under the OTHER pet's prefix, and its own durable local file. The
// shared-object model was rejected in the ruling because one object serving two
// pets breaks the pet-prefixed key CHECK, the per-pet Storage policies, and the
// delete-account cascade — and locally it would break the same way, since deleting
// one pet's copy removes the file the other one renders from.
//
// `source_filename` IS carried (via the spread), and that is the right direction:
// the copy is the same file, filed twice — a vaccination certificate added to both
// cats arrived under one name and should read the same on both rows. It describes
// the artifact, not the filing.
//
// `vet_visit_id` is dropped, not carried: a visit belongs to one pet, and the
// server's enforce_vet_document_pet_scope() trigger rejects a document whose
// linked visit is another pet's. Moot today (capture never links) and correct for
// when VF-4's ⋯ menu reuses this.
export function duplicateVetDocumentRowsForPet(
  rows: LocalVetDocument[],
  input: {
    petId: string;
    now?: Date;
    newId?: () => string;
    persistFile?: (sourceUri: string, fileName: string) => string;
  },
): LocalVetDocument[] {
  const { petId, now = new Date(), newId = uuid, persistFile = persistCapture } = input;
  const nowIso = now.toISOString();
  const groupIds = new Map<string, string>();

  return rows.map((row) => {
    const id = newId();
    const storedMime = resolveVetDocumentMime(row.mime_type);
    const storagePath = buildVetDocumentPath(petId, id, storedMime);
    const fileName = storagePath.slice(storagePath.indexOf('/') + 1);
    // First row of each source group defines the copy's group id, so a 3-page
    // thread stays one 3-page thread under the other pet.
    if (!groupIds.has(row.document_group_id)) groupIds.set(row.document_group_id, id);
    return {
      ...row,
      id,
      pet_id: petId,
      vet_visit_id: null,
      document_group_id: groupIds.get(row.document_group_id) as string,
      // A hydrated row carries '' and has no local bytes to copy; leave it empty
      // rather than pointing the copy at a file that does not exist.
      local_uri: row.local_uri ? persistFile(row.local_uri, fileName) : '',
      storage_path: storagePath,
      mime_type: storedMime,
      created_at: nowIso,
      updated_at: nowIso,
      synced: 0,
    };
  });
}

// ── Copy (D1-r2 / D2-r2) ─────────────────────────────────────────────────────

export interface AddSourceRow {
  source: VetDocumentSource;
  title: string;
  subtitle: string;
}

// The add sheet's three rows, in the mock's order. Camera leads because the
// parking-lot case (§4.2) is the one that has to be fastest, and both photo rows
// carry the SAME page-grouping promise — the round-2 review's fix for a camera row
// that read as single-shot while Photos promised a batch.
export const ADD_SOURCE_ROWS: AddSourceRow[] = [
  {
    source: 'camera',
    title: 'Take photos',
    subtitle: 'Snap each page — they stay together as one document',
  },
  {
    source: 'photo_library',
    title: 'Choose from Photos',
    subtitle: 'Pick several — pages stay together as one document',
  },
  {
    source: 'files',
    title: 'Browse Files',
    subtitle: 'PDFs from email or a clinic portal',
  },
];

export function addSheetTitle(petName: string): string {
  return `Add to ${petName}’s Vet Files`;
}

// Says the contract out loud: the save asks nothing, and naming is a later,
// optional thing (D11).
export const ADD_SHEET_SUBTITLE = 'Saved right away — you can name things later.';

export interface SavedMomentCopy {
  headline: string;
  offlineLine: string;
  cardTitle: string;
  /** "3 pages" / "2 documents", or null when there is nothing to add. */
  cardSub: string | null;
}

// D2-r2. Two lines were argued for in review and neither is decoration:
//   • the pet's NAME, because a two-cat household has no other filing cue;
//   • the OFFLINE line, because the save completed with no network and an owner
//     who does not know that will re-do it, or worse, not trust it.
export function savedMomentCopy(
  petName: string,
  rows: LocalVetDocument[],
  now: Date = new Date(),
): SavedMomentCopy {
  const cover = rows[0];
  const groupCount = new Set(rows.map((r) => r.document_group_id)).size;
  const coverPages = cover
    ? rows.filter((r) => r.document_group_id === cover.document_group_id).length
    : 0;
  const dateLabel = cover
    ? formatVetDocumentDate(cover.document_date ?? cover.created_at, now)
    : '';
  return {
    headline: `Saved to ${petName}’s Vet Files`,
    offlineLine: 'On this phone now — backs up when you’re online',
    cardTitle: defaultVetDocumentTitle(dateLabel),
    cardSub:
      groupCount > 1 ? `${groupCount} documents`
      : coverPages > 1 ? `${coverPages} pages`
      : null,
  };
}

export function alsoAddLabel(petName: string): string {
  return `Also add to ${petName}’s Vet Files`;
}

export function alsoAddedLabel(petName: string): string {
  return `Added to ${petName}’s Vet Files`;
}

// What the screen says when part of a pick could not be saved. Plain, specific,
// no exclamation, and it never implies the saved ones failed too.
export function rejectedPickMessage(screened: ScreenedPicks): string | null {
  const parts: string[] = [];
  if (screened.rejectedType > 0) {
    parts.push(
      screened.rejectedType === 1
        ? 'One file wasn’t a photo or a PDF, so it was skipped.'
        : `${screened.rejectedType} files weren’t photos or PDFs, so they were skipped.`,
    );
  }
  if (screened.rejectedSize > 0) {
    parts.push(
      screened.rejectedSize === 1
        ? 'One PDF was over 15 MB and was skipped.'
        : `${screened.rejectedSize} PDFs were over 15 MB and were skipped.`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

// ── Local I/O ────────────────────────────────────────────────────────────────

// Insert a capture's rows as one unit.
//
// One transaction because a multi-page document is one thing: a partial insert
// would leave a 3-page discharge sheet rendering as a 1-page document whose
// missing pages are on disk but in no row — invisible, and unrecoverable without
// re-capturing. Rolls back whole on any throw.
export async function insertVetDocumentRows(rows: LocalVetDocument[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO vet_documents
           (id, pet_id, vet_visit_id, document_group_id, kind, title, document_date,
            notes, source, source_filename, local_uri, storage_path, mime_type,
            file_size_bytes, page_index, deleted_at, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          row.id, row.pet_id, row.vet_visit_id, row.document_group_id, row.kind,
          row.title, row.document_date, row.notes, row.source, row.source_filename,
          row.local_uri, row.storage_path, row.mime_type, row.file_size_bytes,
          row.page_index, row.deleted_at, row.created_at, row.updated_at,
        ],
      );
    }
  });
}
