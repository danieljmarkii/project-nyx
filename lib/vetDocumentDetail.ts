// Vet Files — the document detail read model (B-478 VF-4).
// Spec: docs/nyx-vet-files-requirements.md §4.3 / §4.4 / §8. Design authority:
// docs/culprit-vet-files-mockups.html round 2.1 (E-img-r2 / E-pdf-r2).
//
// VF-1 shipped the write contract, VF-2 the library read, VF-3 the capture path.
// This is the last read model: one DOCUMENT, all of its pages, and the four things
// the detail screen can change about it. The screen (app/vet-document/[id].tsx)
// owns the viewer, the sheets and the share sheet; everything checkable without a
// device lives here.
//
// Two things in this file are the whole reason it is separately testable:
//
//   1. **D7.** Nothing here writes to `vet_visits`. The link is one column on the
//      DOCUMENT, and vetDocumentDetail.test.ts proves against a real database that
//      linking, unlinking and re-linking leave every `vet_visits` row byte-identical
//      — because the vet report's scope cascade keys its first rung off
//      `vet_visits.visited_at`, so a link that minted or moved a visit would move
//      the window of every report generated afterwards.
//   2. **The visit picker is conditional.** `readVetVisitOptions` returning [] is
//      the signal the row must not render at all (round-2 ruling). Visits have no
//      browse surface in this app yet, so an empty picker reads as broken software
//      rather than as an empty list.

import { getDb } from './db';
import { persistRemoteObject } from './storage';
import {
  VET_DOCUMENT_KINDS,
  VET_DOCUMENT_DEFAULT_KIND,
  type VetDocumentKind,
} from './vetDocuments';
import {
  VET_DOCUMENT_KIND_LABELS,
  formatVetDocumentDate,
  defaultVetDocumentTitle,
} from './vetDocumentLibrary';

// ── The document ─────────────────────────────────────────────────────────────

// Every page of one document, cover first. Soft-deleted rows are excluded rather
// than carried with a flag: the detail screen is only ever reached from the live
// library, and an empty result IS the "this document is gone" state (deleted here,
// or deleted on another device and hydrated in while this screen was open).
export const DETAIL_VET_DOCUMENT_QUERY =
  `SELECT id, pet_id, document_group_id, kind, title, document_date, notes,
          vet_visit_id, source_filename,
          local_uri, storage_path, mime_type, page_index, created_at
   FROM vet_documents
   WHERE document_group_id = ? AND deleted_at IS NULL
   ORDER BY page_index, created_at`;

/** One row of the group, straight off SQLite. */
export interface VetDocumentPageRow {
  id: string;
  pet_id: string;
  document_group_id: string;
  kind: string;
  title: string | null;
  document_date: string | null;
  notes: string | null;
  vet_visit_id: string | null;
  source_filename: string | null;
  local_uri: string;
  storage_path: string;
  mime_type: string;
  page_index: number;
  created_at: string;
}

export interface VetDocumentPage {
  id: string;
  pageIndex: number;
  storagePath: string;
  /** '' for a hydrated page whose bytes live only in Storage (VF-1 convention). */
  localUri: string;
  isPdf: boolean;
}

export interface VetDocumentDetail {
  groupId: string;
  petId: string;
  /** Owner's title, or the rendered default. Never empty. */
  title: string;
  /** Drives the quieter title weight and the ⋯ menu's Rename wording. */
  untitled: boolean;
  kind: VetDocumentKind;
  /** null ⇒ the row renders its "Add type" placeholder, never a chip reading "Other". */
  kindLabel: string | null;
  /** 'YYYY-MM-DD' — the date ON the paper, or null if the document carries none. */
  documentDate: string | null;
  dateLabel: string;
  notes: string | null;
  vetVisitId: string | null;
  /**
   * B-546 — the filename the document arrived with, or null.
   *
   * Unlike the library row's `fileLabel`, this is exposed WHATEVER the title is.
   * The list can afford to drop it once a name exists (the name has done the
   * disambiguating there); this screen is where the owner confirms they are about
   * to hand a vet the right file, and "which PDF is this, actually" is a question
   * a typed name can't answer.
   */
  sourceFilename: string | null;
  /** The cover's type. A group is homogeneous by construction (§4.4 grouping). */
  isPdf: boolean;
  pages: VetDocumentPage[];
}

function asKind(raw: string): VetDocumentKind {
  return (VET_DOCUMENT_KINDS as readonly string[]).includes(raw)
    ? (raw as VetDocumentKind)
    : VET_DOCUMENT_DEFAULT_KIND;
}

// Rows in, one document out. Returns null for an empty group, which the screen
// reads as "gone" — see the query note.
//
// Every per-document fact is taken from the COVER (rows[0], i.e. the lowest
// page_index) rather than from whichever row SQLite happened to hand back first.
// The group writes in vetDocumentLibrary keep all pages in step, so in practice
// they agree; taking them from one named row means a partially-applied write
// (an update interrupted mid-transaction, a half-hydrated group) renders as page 1
// rather than as an arbitrary mixture of pages.
export function buildVetDocumentDetail(
  rows: VetDocumentPageRow[],
  now: Date = new Date(),
): VetDocumentDetail | null {
  const cover = rows[0];
  if (!cover) return null;

  const kind = asKind(cover.kind);
  const dateLabel = formatVetDocumentDate(cover.document_date ?? cover.created_at, now);
  // Same rule as the library row: '' or '   ' counts as untitled, because an owner
  // who clears the Name field is asking for the default back, not for a blank.
  const owned = cover.title?.trim() ? cover.title.trim() : null;
  const notes = cover.notes?.trim() ? cover.notes.trim() : null;

  return {
    groupId: cover.document_group_id,
    petId: cover.pet_id,
    title: owned ?? defaultVetDocumentTitle(dateLabel),
    untitled: owned == null,
    kind,
    kindLabel: kind === VET_DOCUMENT_DEFAULT_KIND ? null : VET_DOCUMENT_KIND_LABELS[kind],
    documentDate: cover.document_date,
    dateLabel,
    notes,
    vetVisitId: cover.vet_visit_id,
    sourceFilename: cover.source_filename?.trim() ? cover.source_filename.trim() : null,
    isPdf: cover.mime_type === 'application/pdf',
    pages: rows.map((r) => ({
      id: r.id,
      pageIndex: r.page_index,
      storagePath: r.storage_path,
      localUri: r.local_uri ?? '',
      isPdf: r.mime_type === 'application/pdf',
    })),
  };
}

export async function readVetDocumentDetail(
  groupId: string,
  now: Date = new Date(),
): Promise<VetDocumentDetail | null> {
  const db = getDb();
  const rows = await db.getAllAsync<VetDocumentPageRow>(DETAIL_VET_DOCUMENT_QUERY, [groupId]);
  return buildVetDocumentDetail(rows, now);
}

// ── The conditional visit link (§4.2, round-2 ruling) ────────────────────────

export interface VetVisitRow {
  id: string;
  visited_at: string;
  clinic_name: string | null;
  vet_name: string | null;
  reason: string | null;
}

export interface VetVisitOption {
  id: string;
  /** "Jul 14 — Lakeview Animal Clinic" (mock E-pdf-r2). */
  label: string;
}

// Newest first: an owner linking a lab PDF is almost always linking it to the visit
// it came from, which is the most recent one. Capped because this feeds a picker,
// not an archive — and there is no visit browse surface to page through.
export const VET_VISIT_OPTIONS_QUERY =
  `SELECT id, visited_at, clinic_name, vet_name, reason
   FROM vet_visits
   WHERE pet_id = ?
   ORDER BY visited_at DESC, created_at DESC
   LIMIT 50`;

// `visited_at` is written as a calendar day 'YYYY-MM-DD' by app/vet-visit.tsx
// (isoToDateOnly), so formatVetDocumentDate's hand-parse is correct for it and no
// UTC→local conversion applies — there is no time to shift.
//
// The trailing half degrades through what the visit actually recorded: the clinic
// is the filing cue an owner scans for, the vet's name is the next best, the reason
// is a last resort, and a bare date is honest when the visit carries nothing else.
// Never "Untitled visit" — that reads as a broken row rather than a sparse one.
export function formatVetVisitOption(row: VetVisitRow, now: Date = new Date()): VetVisitOption {
  const when = formatVetDocumentDate(row.visited_at, now);
  const who = row.clinic_name?.trim() || row.vet_name?.trim() || row.reason?.trim() || '';
  return {
    id: row.id,
    label: when && who ? `${when} — ${who}` : when || who || 'Vet visit',
  };
}

// [] is meaningful: it is the signal that the visit-link row must not render at
// all. See the file header.
export async function readVetVisitOptions(
  petId: string,
  now: Date = new Date(),
): Promise<VetVisitOption[]> {
  const db = getDb();
  const rows = await db.getAllAsync<VetVisitRow>(VET_VISIT_OPTIONS_QUERY, [petId]);
  return rows.map((r) => formatVetVisitOption(r, now));
}

// ── Sharing (§4.3 — the ER moment) ───────────────────────────────────────────

// A clinic-filable filename, same shape and same reasoning as reportPdfFilename in
// lib/pdf.ts: the vet receives this in Mail or Messages and files it by name, so
// "IMG_4471.jpg" is a worse artifact than the same bytes called
// "Pixel-lab-result-2026-07-14.jpg". Sanitised because a pet named "Mr. O'Malley /2"
// must never produce a path-breaking filename.
//
// ── B-587: WHAT NAMES THE DOCUMENT, IN ORDER ────────────────────────────────
//
//   owner's title  →  the source filename's stem  →  the kind  →  "document"
//
// The middle rung is new (PM-ratified 2026-07-29) and it is what closes B-546 end
// to end. Before it, this function fell straight from title to kind — and BOTH of
// those default at capture, so `untitled + kind = 'other'` is not an edge case, it
// is what every document is until the owner does two optional things. The result
// was that an owner could read "CBC-Pixel-2026-07-14.pdf" on the detail screen to
// check they had the right PDF, tap Send, and hand the vet
// "Pixel-other-2026-07-14.pdf". B-546's whole thesis is that the app had the name
// and dropped it on the floor; this was the last place it still did, at the one
// action §4.3 calls "the single most important affordance after viewing".
//
// `other` no longer reaches the name at all. Every other surface in this feature
// treats it as an ABSENCE — the library row renders it as a dashed invitation, never
// as a chip reading "Other" (see buildVetLibraryRow) — so letting it become an
// assertion inside a clinical filename was the one place it changed meaning.
//
// Two "don't say it twice" rules, because the stem is a string someone else wrote
// and it routinely already contains what we were about to append:
//
//   • the PET PREFIX is dropped when the name already starts with it. A PIMS export
//     is very often "Pixel-CBC-2026-07-14.pdf" — prefixing again gives
//     "Pixel-Pixel-CBC-…", which reads as a bug in the app that produced it.
//   • the DATE SUFFIX is dropped when the name already contains that date. Same
//     reason, same shape. When the stem carries no date ("bloodwork.pdf") the date
//     is still appended, because a vet filing the artifact wants it.
//
// Both rules apply to a typed TITLE too, not just to a stem — an owner who types
// "Pixel bloodwork" gets the same courtesy, and one rule is easier to hold than two.
export function vetDocumentShareFilename(
  petName: string,
  detail: Pick<
    VetDocumentDetail,
    'kind' | 'documentDate' | 'isPdf' | 'title' | 'untitled' | 'sourceFilename'
  >,
  pageIndex = 0,
  pageCount = 1,
): string {
  const slug = (value: string, fallback: string) =>
    value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

  const name = slug(petName || '', 'pet');

  // The stem, i.e. the filename without its extension: the extension is decided
  // below by `isPdf` (the row's stored mime, which is the truth about the bytes),
  // and carrying the picked one through would let "labs.PDF" become "labs-PDF.pdf".
  // Only consulted for an untitled document — a title the owner typed always wins.
  const stem = detail.untitled
    ? slug((detail.sourceFilename ?? '').replace(/\.[^.]{1,8}$/, ''), '')
    : '';

  const what = !detail.untitled
    ? slug(detail.title, 'document')
    : stem
      // `other` is an absence, not a taxonomy value — see the header. Note that
      // slug()'s own fallback cannot do this job: 'other' slugs to a non-empty
      // 'other', so the fallback never fires and the word reaches the vet.
      || (detail.kind === VET_DOCUMENT_DEFAULT_KIND ? 'document' : slug(detail.kind, 'document'));

  // Slugged like every other component. `documentDate` is written only by the date
  // picker and by hydration from a Postgres DATE, so it cannot currently hold a
  // separator — but it was the one of four parts this function skipped, which made
  // the docstring's "sanitised" claim narrower than it read, and a value of
  // "2026-07-14/../../x" would have walked the staged copy out of its directory
  // (VF-6, found by rls-privacy-reviewer). Sanitising all four is cheaper than
  // maintaining the argument for why one is safe.
  const dated = detail.documentDate ? slug(detail.documentDate, 'dated') : '';
  const when = dated && !what.includes(dated) ? `-${dated}` : '';

  // Case-insensitive: a clinic exports "PIXEL-CBC.pdf" as readily as "Pixel-CBC.pdf",
  // and the duplicate reads the same either way.
  const lowerWhat = what.toLowerCase();
  const lowerName = name.toLowerCase();
  const prefix = lowerWhat === lowerName || lowerWhat.startsWith(`${lowerName}-`) ? '' : `${name}-`;

  // Multi-page documents share one page at a time (aggregate export is parked, §11),
  // so the page has to be in the name or the vet gets three files called the same
  // thing and no way to order them.
  const page = pageCount > 1 ? `-p${pageIndex + 1}` : '';
  const ext = detail.isPdf ? 'pdf' : 'jpg';
  return `${prefix}${what}${when}${page}.${ext}`;
}

// ── AC 12 — the offline read ─────────────────────────────────────────────────

// Adopt a downloaded copy as this device's local file.
//
// **This deliberately does NOT touch `updated_at` or `synced`.** `local_uri` is a
// local-only column: VF-1's push payload omits it and hydration never overwrites
// it, because it describes where THIS phone keeps the bytes and the server has no
// opinion about that. Re-queuing the row would push a no-op edit — and worse, it
// would bump `updated_at`, so under last-write-wins the mere act of LOOKING at a
// document on one device would beat a real rename made on another.
//
// Addresses one PAGE, not the group: pages are cached as they are opened, and a
// three-page thread the owner swiped twice through is legitimately half-cached.
export async function adoptVetDocumentLocalUri(pageId: string, localUri: string): Promise<void> {
  if (!localUri) return;
  const db = getDb();
  await db.runAsync('UPDATE vet_documents SET local_uri = ? WHERE id = ?', [localUri, pageId]);
}

// Cache one page's bytes on a successful full-size open (§8 AC 12 — Sam's ER case:
// concrete walls, no signal, a document uploaded from another device).
//
// The VF-2 feasibility pass recommended exactly this shape, and its virtue is that
// there is no new mechanism in it: the bytes go through persistCapture's durable
// directory, so the sign-out file wipe already covers them, and `local_uri` already
// wins over a signed URL everywhere it is read — so the library thumbnail starts
// rendering offline as a side effect of having opened the document once.
//
// Returns the durable path on success, null on any failure. Never throws: caching
// is a side effect of viewing, and a document the owner is looking at right now
// must not break because a background copy failed.
export async function cacheVetDocumentPage(
  page: Pick<VetDocumentPage, 'id' | 'storagePath' | 'localUri'>,
  signedUrl: string,
): Promise<string | null> {
  // Already local — nothing to fetch. (Also the common case: most documents were
  // captured on this device.)
  if (page.localUri) return page.localUri;
  if (!signedUrl) return null;
  // The object key's own basename, which is `{document_id}.{ext}` — globally unique
  // by construction (VF-1) and the same convention persistCapture is given
  // everywhere else, so a file on disk can be matched to its object by eye.
  const fileName = page.storagePath.slice(page.storagePath.lastIndexOf('/') + 1);
  if (!fileName) return null;
  const durable = await persistRemoteObject(signedUrl, fileName);
  if (!durable) return null;
  try {
    await adoptVetDocumentLocalUri(page.id, durable);
  } catch (e) {
    // The bytes are on disk but the row doesn't know: harmless (the next open
    // re-downloads), and not worth failing the open the owner is waiting on.
    console.warn('[vet-files] could not record cached copy:', e);
    return null;
  }
  return durable;
}
