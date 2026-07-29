// Vet Files — the library read model (B-478 VF-2).
// Spec: docs/nyx-vet-files-requirements.md §4.1 / §4.5 / §9. Design authority:
// docs/culprit-vet-files-mockups.html round 2.1 (A1-r2 / A1z / E1-r2 / L-real).
//
// VF-1 shipped the write contract (lib/vetDocuments.ts) and the mirror; this is
// the read half. The split is the same one lib/foodQueries.ts draws: the SQL and
// every string the list renders live in an I/O-light module so both can be
// exercised in jest — the grouped query against a real node:sqlite built from the
// production DDL, the labels and the date formatting as plain functions.
//
// The one thing to understand before changing anything here: **an untitled,
// kind-less document is the expected steady state, not an error state** (D11).
// Capture asks nothing, so the library is where naming happens — which is why the
// default title is RENDERED and never stored (a stored default is indistinguishable
// from an owner who typed "Document — Jul 26", and the row would lose its Name
// affordance forever).

import { getDb } from './db';
import { localDayIndex, localDayIndexOf } from './utils';
import {
  VET_DOCUMENT_KINDS,
  VET_DOCUMENT_DEFAULT_KIND,
  type VetDocumentKind,
} from './vetDocuments';

// Owner-facing labels for the §4.5 taxonomy. Two are deliberately NOT the column
// value spelled out: `correspondence` renders as "Email" (the mock's word, and the
// thing owners actually save — a screenshot of a clinic thread), and
// `invoice_estimate` splits into the two words it covers. Everything else is the
// clinical term, because a vet record's type is not a place to be folksy.
export const VET_DOCUMENT_KIND_LABELS: Record<VetDocumentKind, string> = {
  lab_result: 'Lab result',
  vaccination: 'Vaccination',
  visit_summary: 'Visit summary',
  imaging: 'Imaging',
  prescription: 'Prescription',
  referral: 'Referral',
  invoice_estimate: 'Invoice or estimate',
  insurance: 'Insurance',
  correspondence: 'Email',
  other: 'Other',
};

// The library read (§4.1): one entry per DOCUMENT, newest first, soft-deleted rows
// hidden.
//
// A document is a GROUP of rows (§4.4 — an email thread is N screenshots that are
// one document), so the list groups by document_group_id and renders the cover
// page. `MIN(page_index)` is doing real work, not decoration: it makes SQLite's
// single-min/max bare-column rule tie every projected bare column (id, kind, title,
// storage_path, mime_type…) to the SAME row — the cover. Without it the engine may
// take each bare column from an arbitrary member row, and a four-page thread could
// render page 3's thumbnail beside page 1's title. LIBRARY_FOODS_QUERY leans on the
// identical rule for its photo dedup.
//
// Ordering keys off document_date — the date ON the paper, which is the one an
// owner scans for — and falls back to the capture date when the document carries
// none. SUBSTR over SQLite's DATE() deliberately: created_at arrives in three
// shapes here (SQLite's `datetime('now')` space-separated form, and the server's
// `…T…Z` / `…+00:00` ISO forms), and a plain prefix cut is correct for all three
// without depending on which of them SQLite's date parser accepts.
export const LIBRARY_VET_DOCUMENTS_QUERY =
  `SELECT document_group_id AS group_id,
          COUNT(*)          AS page_count,
          MIN(page_index)   AS cover_page_index,
          id, kind, title, document_date, vet_visit_id, source_filename,
          local_uri, storage_path, mime_type, created_at
   FROM vet_documents
   WHERE pet_id = ? AND deleted_at IS NULL
   GROUP BY document_group_id
   ORDER BY COALESCE(document_date, SUBSTR(created_at, 1, 10)) DESC, created_at DESC`;

// The projected cover row, straight off SQLite (every column TEXT/INTEGER).
export interface VetDocumentGroupRow {
  group_id: string;
  page_count: number;
  cover_page_index: number;
  id: string;
  kind: string;
  title: string | null;
  document_date: string | null;
  vet_visit_id: string | null;
  source_filename: string | null;
  local_uri: string;
  storage_path: string;
  mime_type: string;
  created_at: string;
}

// What a list row actually renders (L-real).
export interface VetLibraryRow {
  /** The COVER row's id. Page edits address the group, not this. */
  id: string;
  groupId: string;
  kind: VetDocumentKind;
  /** null ⇒ render the dashed "Add type" chip instead of a kind chip. */
  kindLabel: string | null;
  /** Owner's title, or the rendered default. Never empty. */
  title: string;
  /** Drives the quieter title weight AND the one-tap Name pill (D11). */
  untitled: boolean;
  /**
   * B-546 — the filename this document arrived with, rendered as a secondary
   * meta line, or null when there is nothing to show.
   *
   * Null on a NAMED row even when a filename is stored, and that is the rule
   * rather than an omission: the whole problem this solves is that two untitled
   * PDF rows are indistinguishable. Once the owner has typed a name, the name IS
   * the identity, and "Scan_20260714_0001.pdf" underneath it is noise on a
   * surface whose job is one calm list. The stored value is not lost — the
   * detail screen shows it either way (see VetDocumentDetail.sourceFilename).
   */
  fileLabel: string | null;
  dateLabel: string;
  pageCount: number;
  /** "3 pages", or null for a single-page document. */
  pageLabel: string | null;
  isPdf: boolean;
  storagePath: string;
  /** '' for a hydrated row whose bytes live only in Storage (VF-1 convention). */
  localUri: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Jul 26" this year, "Dec 19, 2025" otherwise — the mock's two forms. The year is
// dropped only when it is unambiguous, because a vaccination certificate's whole
// value is knowing whether it is current.
//
// Hand-parsed on purpose. `new Date('2026-07-26')` is parsed as UTC midnight by
// spec, so in any negative-offset timezone `toLocaleDateString` renders it as the
// 25th — the document would be filed under the wrong day for every owner west of
// Greenwich. document_date is a calendar date with no time and no zone; treating
// its three numbers as local is the only reading that can't drift.
export function formatVetDocumentDate(dateOrTimestamp: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOrTimestamp ?? '');
  if (!m) return '';
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11) return '';
  const stem = `${MONTHS[monthIdx]} ${day}`;
  return year === now.getFullYear() ? stem : `${stem}, ${year}`;
}

// The rendered default (never stored — see the header note).
export function defaultVetDocumentTitle(dateLabel: string): string {
  return dateLabel ? `Document — ${dateLabel}` : 'Document';
}

function asKind(raw: string): VetDocumentKind {
  return (VET_DOCUMENT_KINDS as readonly string[]).includes(raw)
    ? (raw as VetDocumentKind)
    : VET_DOCUMENT_DEFAULT_KIND;
}

export function buildVetLibraryRow(row: VetDocumentGroupRow, now: Date = new Date()): VetLibraryRow {
  const kind = asKind(row.kind);
  const dateLabel = formatVetDocumentDate(row.document_date ?? row.created_at, now);
  // A title of '' or '   ' counts as untitled: an owner who opens the Name sheet
  // and clears the field is asking for the default back, not for a blank row.
  const owned = row.title?.trim() ? row.title.trim() : null;
  const pageCount = Math.max(1, row.page_count ?? 1);
  return {
    id: row.id,
    groupId: row.group_id,
    kind,
    // `other` is the capture default, i.e. "nobody has said what this is" — so it
    // renders as the dashed invitation, never as a chip reading "Other". A real
    // taxonomy value is a fact about the document; the default is an absence.
    kindLabel: kind === VET_DOCUMENT_DEFAULT_KIND ? null : VET_DOCUMENT_KIND_LABELS[kind],
    title: owned ?? defaultVetDocumentTitle(dateLabel),
    untitled: owned == null,
    // See the field's note: shown only while the row is untitled, which is the
    // state it exists to disambiguate.
    fileLabel: owned == null ? (row.source_filename?.trim() || null) : null,
    dateLabel,
    pageCount,
    pageLabel: pageCount > 1 ? `${pageCount} pages` : null,
    isPdf: row.mime_type === 'application/pdf',
    storagePath: row.storage_path,
    localUri: row.local_uri ?? '',
  };
}

// The kind lens (§4.1, `docs/nyx-filter-ux-requirements.md`): a growable 10-value
// set behind a ScopeMenu pill.
//
// Only kinds PRESENT in this library are offered. Listing all ten would put nine
// dead options in front of a week-one owner — pick one, get an empty list, learn
// nothing. Offering only what's there means selecting any option always yields
// rows, so the filtered-empty state is unreachable by construction rather than
// designed around. Order follows §4.5's continuity-of-care ranking (labs first),
// never alphabetical.
export interface VetKindOption {
  key: string | null;
  label: string;
}

export function buildKindFilterOptions(rows: VetLibraryRow[]): VetKindOption[] {
  const present = new Set(rows.map((r) => r.kind));
  const options: VetKindOption[] = [{ key: null, label: 'All types' }];
  for (const kind of VET_DOCUMENT_KINDS) {
    if (present.has(kind)) options.push({ key: kind, label: VET_DOCUMENT_KIND_LABELS[kind] });
  }
  return options;
}

// Keep a selection only while it still names something. Deleting the last lab
// result would otherwise strand the owner on a filter whose option no longer
// exists — the one way a filtered-empty state could still happen.
export function reconcileKindFilter(selected: string | null, options: VetKindOption[]): string | null {
  if (selected == null) return null;
  return options.some((o) => o.key === selected) ? selected : null;
}

export function filterByKind(rows: VetLibraryRow[], kind: string | null): VetLibraryRow[] {
  return kind == null ? rows : rows.filter((r) => r.kind === kind);
}

// ── The profile card (A1-r2 / A1z) ───────────────────────────────────────────

export interface VetFilesCardModel {
  blurb: string;
  actionLabel: string;
  documentCount: number;
  /** Cover paths for the thumbnail strip; [] in the zero state. */
  stripPaths: string[];
  /** "+3" overflow badge, or null when the strip shows everything. */
  overflowLabel: string | null;
  countLabel: string | null;
}

// The strip is a pulse, not a browse surface — three tiles and a count.
export const VET_FILES_STRIP_LIMIT = 3;

// Signed-URL lifetime for a vet document (§5.1, §6.2: short-lived, request-time,
// never persisted).
//
// Deliberately far shorter than the Foods tab's 24h. That tab caches its URLs for a
// whole browse session over a food photo; these are clinical records — bloodwork
// with a clinic's letterhead, a discharge sheet naming the owner's address — and a
// signed URL is a bearer token in a string. Fifteen minutes outlives any single
// pass through the library and re-signs on the next focus, so nothing long-lived
// leaks into a log, a screenshot, or a crash report. Nothing here writes a signed
// URL to disk.
export const VET_DOCUMENT_SIGNED_URL_TTL_SEC = 60 * 15;

// Re-sign this long before a URL actually expires, so a signature can't die between
// the check and the render (or mid-scroll on a slow list).
const SIGNED_URL_REFRESH_MARGIN_MS = 60 * 1000;

// Should this path be (re-)signed?
//
// The screens cache signed URLs in a ref for the life of a mount and skip any path
// already in it. That was written as "re-signed on every focus" — but nothing ever
// evicted the ref, so a screen left mounted and blurred past the TTL came back with
// dead tokens and rested every tile on its glyph until remount. It fails CLOSED, so
// this is availability rather than exposure; the reason it matters is that the short
// TTL's entire mitigation, as written in the comment above, is that focus re-signs.
//
// Pure and exported so the expiry rule is unit-testable, rather than living twice as
// an inline predicate in two screens (B-478 VF-6, found by rls-privacy-reviewer).
export function isSignatureStale(
  urls: Map<string, string>,
  mintedAt: Map<string, number>,
  path: string,
  now: number = Date.now(),
): boolean {
  if (!urls.has(path)) return true;
  const at = mintedAt.get(path);
  // A URL we hold but cannot date is treated as stale — the safe direction is a
  // redundant re-sign, never a render against a token we can't vouch for.
  if (at == null) return true;
  return now - at >= VET_DOCUMENT_SIGNED_URL_TTL_SEC * 1000 - SIGNED_URL_REFRESH_MARGIN_MS;
}

export function buildVetFilesCardModel(
  petName: string,
  rows: VetLibraryRow[],
): VetFilesCardModel {
  const documentCount = rows.length;
  if (documentCount === 0) {
    return {
      // A1z. Names the camera roll because that is where the documents already
      // are — the invitation is "move what you have", not "start a filing habit".
      blurb: `One place for ${petName}’s records, results and clinic emails — starting with whatever’s in your camera roll.`,
      actionLabel: 'Add the first one',
      documentCount: 0,
      stripPaths: [],
      overflowLabel: null,
      countLabel: null,
    };
  }
  const strip = rows.slice(0, VET_FILES_STRIP_LIMIT);
  const overflow = documentCount - strip.length;
  return {
    // A1-r2. The second sentence is the D14 honesty line, and it is load-bearing:
    // this card sits directly beneath the Vet report card, and both persona reviews
    // assumed a saved document rode along with the report. Silence between two
    // adjacent cards reads as inclusion. Worded as fact, not apology — and it stops
    // being true the day B-480 ships, at which point this string changes with it.
    blurb: 'Records, results and clinic emails you’ve saved. Not included in the vet report — shared one at a time.',
    actionLabel: 'Open Vet Files',
    documentCount,
    stripPaths: strip.map((r) => r.storagePath),
    overflowLabel: overflow > 0 ? `+${overflow}` : null,
    countLabel: `${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`,
  };
}

// ── Local I/O ────────────────────────────────────────────────────────────────

export async function readVetLibrary(petId: string, now: Date = new Date()): Promise<VetLibraryRow[]> {
  const db = getDb();
  const rows = await db.getAllAsync<VetDocumentGroupRow>(LIBRARY_VET_DOCUMENTS_QUERY, [petId]);
  return rows.map((r) => buildVetLibraryRow(r, now));
}

export async function readRecentlyDeletedVetDocuments(
  petId: string,
  now: Date = new Date(),
): Promise<DeletedVetDocumentRow[]> {
  const db = getDb();
  const rows = await db.getAllAsync<VetDocumentGroupRow & { deleted_at: string | null }>(
    RECENTLY_DELETED_VET_DOCUMENTS_QUERY,
    [petId, restoreWindowStart(now)],
  );
  return rows.map((r) => buildDeletedVetDocumentRow(r, now));
}

// Every editable field is a per-ROW column but a per-DOCUMENT fact, so every write
// addresses the whole group. Renaming only the cover would leave page 2 of a
// discharge sheet carrying a different title than page 1 — invisible in the library
// (which renders the cover) and confusing the moment the detail view swipes.
//
// Every touched row goes back to synced = 0 with a fresh updated_at, which is what
// carries the edit to the owner's other devices under last-write-wins. An UPDATE
// that forgot either would look correct on this phone forever and never leave it.
//
// ⚠ THE COLUMN LIST IS CLOSED, AND `storage_path` IS DELIBERATELY NOT IN IT.
// Migration 045 makes storage_path immutable server-side: relocating a document is
// a new row plus a new object, never an UPDATE. A local UPDATE would therefore
// succeed on this phone and be rejected forever on push, wedging the row at
// synced = 0. `pet_id` is absent for the same class of reason — D13 files a COPY.
type EditableVetDocumentColumn = 'title' | 'kind' | 'notes' | 'document_date' | 'vet_visit_id';

async function updateVetDocumentGroup(
  groupId: string,
  column: EditableVetDocumentColumn,
  value: string | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE vet_documents
     SET ${column} = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
     WHERE document_group_id = ? AND deleted_at IS NULL`,
    [value, new Date().toISOString(), groupId],
  );
}

// Empty / whitespace-only input clears the title back to NULL rather than storing
// a blank — which restores the rendered default and the Name affordance with it.
export async function renameVetDocument(groupId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  await updateVetDocumentGroup(groupId, 'title', trimmed.length > 0 ? trimmed : null);
}

export async function setVetDocumentKind(groupId: string, kind: VetDocumentKind): Promise<void> {
  await updateVetDocumentGroup(groupId, 'kind', kind);
}

// Same clear-to-NULL rule as the title: an emptied notes field is "no note", not a
// stored blank, so the row goes back to rendering its "Add a note" placeholder.
export async function setVetDocumentNotes(groupId: string, notes: string): Promise<void> {
  const trimmed = notes.trim();
  await updateVetDocumentGroup(groupId, 'notes', trimmed.length > 0 ? trimmed : null);
}

// `date` is a calendar day 'YYYY-MM-DD' — the date ON the paper (§5.1), which is
// not the capture instant and carries no time and no zone.
export async function setVetDocumentDate(groupId: string, date: string): Promise<void> {
  await updateVetDocumentGroup(groupId, 'document_date', date);
}

// D7 — THE REPORT-WINDOW PROTECTION RULE, AND THE ONE FUNCTION THAT IMPLEMENTS IT.
//
// Linking writes exactly one column on the DOCUMENT and touches `vet_visits` in no
// way at all: no INSERT, no UPDATE, no re-dating. That is not an implementation
// detail — the vet report's scope cascade keys rung 1 off `vet_visits.visited_at`,
// so a link that minted or moved a visit would silently move the window of every
// report the owner generates afterwards. A document may point at a visit; it may
// never create one, and it may never change when one happened.
//
// The invariant is regression-tested against a real database (see
// vetDocumentDetail.test.ts), not asserted here — a comment cannot fail a build.
//
// `visitId = null` unlinks, which is why the parameter is nullable rather than the
// caller writing a second function that could drift from this one.
export async function linkVetDocumentVisit(
  groupId: string,
  visitId: string | null,
): Promise<void> {
  await updateVetDocumentGroup(groupId, 'vet_visit_id', visitId);
}

// ── Soft delete and the 30-day recovery window (§8 AC 5) ─────────────────────

// How long a deleted document stays recoverable. Named here because THREE things
// have to agree on it and two of them are owner-facing promises: the ⋯ menu's
// "Kept for 30 days", the Recently deleted list's countdown, and the query below.
//
// The eventual purge of the storage OBJECT is deliberately NOT implemented here —
// it joins the B-249 orphan/retention decision (§11) rather than forking a second
// retention rule. Until then a document past the window stops being offered for
// restore, which is the half this surface can honestly own.
export const VET_DOCUMENT_RECOVERY_DAYS = 30;

// Soft delete, house rule — and here it is also the only delete that EXISTS: the
// `vet_documents` grants are SELECT/INSERT/UPDATE, so a hard DELETE affects zero
// rows server-side (verified live in VF-1). Setting deleted_at is not a softer
// alternative to removing the row; it is the mechanism.
//
// synced = 0 + a fresh updated_at is what carries the delete to the owner's other
// devices at all. An insert-only contract could never propagate one.
export async function softDeleteVetDocument(groupId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE vet_documents
     SET deleted_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
     WHERE document_group_id = ? AND deleted_at IS NULL`,
    [now, now, groupId],
  );
}

// Undo. Guarded on `deleted_at IS NOT NULL` so a double-tap on Restore cannot
// re-stamp updated_at on a live document and pointlessly re-queue its whole group.
export async function restoreVetDocument(groupId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE vet_documents
     SET deleted_at = NULL, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
     WHERE document_group_id = ? AND deleted_at IS NOT NULL`,
    [now, groupId],
  );
}

// The Recently deleted read: the mirror of LIBRARY_VET_DOCUMENTS_QUERY, keeping
// what that one hides. `MIN(page_index)` does the identical cover-row job (see that
// query's note) — a restored 4-page thread must come back looking like itself.
//
// The window is bounded IN SQL against a bound parameter rather than filtered in
// JS: a document past 30 days must stop being offered the moment it ages out, and
// a list that renders it and then fails to restore it is the cruellest possible
// version of this surface.
export const RECENTLY_DELETED_VET_DOCUMENTS_QUERY =
  `SELECT document_group_id AS group_id,
          COUNT(*)          AS page_count,
          MIN(page_index)   AS cover_page_index,
          id, kind, title, document_date, vet_visit_id, source_filename,
          local_uri, storage_path, mime_type, created_at,
          MAX(deleted_at)   AS deleted_at
   FROM vet_documents
   WHERE pet_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?
   GROUP BY document_group_id
   ORDER BY MAX(deleted_at) DESC`;

export interface DeletedVetDocumentRow extends VetLibraryRow {
  /** "Deleted Jul 26 · 28 days left" — the window, stated where the undo is. */
  deletedLabel: string;
}

// Days left, counted in CALENDAR days rather than in elapsed hours.
//
// That choice is the whole design of this number. A document deleted an hour ago
// reads "30 days left", which is exactly what the ⋯ menu just promised — an
// elapsed-hours floor would say 29 and read as an off-by-one to anyone who saw both
// strings. It is also how people already read a "30 days" window: in days on a
// calendar, not in hours since an instant.
//
// Returns 0 on the final day and past it. The label says "Last day to restore"
// rather than the meaningless "0 days left" — the row is still restorable when it
// renders, because the query decides that, and a countdown that reads zero next to
// a working Restore button is a bug the owner has to interpret.
export function daysLeftToRestore(deletedAtIso: string, now: Date = new Date()): number {
  const deletedDay = localDayIndexOf(deletedAtIso ?? '');
  if (deletedDay == null) return 0;
  const elapsed = localDayIndex(now.getTime()) - deletedDay;
  return Math.max(0, VET_DOCUMENT_RECOVERY_DAYS - elapsed);
}

export function restoreCountdownLabel(deletedAtIso: string, now: Date = new Date()): string {
  const left = daysLeftToRestore(deletedAtIso, now);
  if (left === 0) return 'Last day to restore';
  return left === 1 ? '1 day left' : `${left} days left`;
}

export function buildDeletedVetDocumentRow(
  row: VetDocumentGroupRow & { deleted_at: string | null },
  now: Date = new Date(),
): DeletedVetDocumentRow {
  const base = buildVetLibraryRow(row, now);
  const deletedAt = row.deleted_at ?? '';
  const when = formatVetDocumentDate(deletedAt, now);
  return {
    ...base,
    deletedLabel: [
      when ? `Deleted ${when}` : 'Deleted',
      restoreCountdownLabel(deletedAt, now),
    ].join(' · '),
  };
}

// The ISO cutoff a row must have been deleted at-or-after to still be restorable.
export function restoreWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - VET_DOCUMENT_RECOVERY_DAYS * 86_400_000).toISOString();
}
