// VF-2 library read model (B-478). Two halves:
//
//   1. LIBRARY_VET_DOCUMENTS_QUERY run for real against node:sqlite, built from the
//      PRODUCTION DDL (BASE_SCHEMA_SQL) rather than a hand-written mirror — the
//      grouping and the cover-row selection live entirely in SQL, so a JS-level
//      test could not catch a regression in either.
//   2. The pure row/card/filter model, which is where every owner-facing string and
//      the untitled-row contract live.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

// Both transitively reach native/Expo modules (expo-sqlite; expo-image-manipulator
// via lib/storage, which also constructs the Supabase client at import time).
// Nothing under test here does I/O — the SQL is run against a real node:sqlite
// below, and everything else is a pure function.
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./storage', () => ({ compressForUpload: jest.fn() }));

import { BASE_SCHEMA_SQL } from './localSchema';
import {
  LIBRARY_VET_DOCUMENTS_QUERY,
  buildVetLibraryRow,
  buildVetFilesCardModel,
  buildKindFilterOptions,
  reconcileKindFilter,
  filterByKind,
  formatVetDocumentDate,
  defaultVetDocumentTitle,
  VET_DOCUMENT_KIND_LABELS,
  type VetDocumentGroupRow,
} from './vetDocumentLibrary';
import { VET_DOCUMENT_KINDS } from './vetDocuments';

// ── 1. The SQL ───────────────────────────────────────────────────────────────

interface Doc {
  id: string;
  pet_id?: string;
  group?: string;
  kind?: string;
  title?: string | null;
  document_date?: string | null;
  mime?: string;
  page_index?: number;
  deleted_at?: string | null;
  created_at?: string;
  local_uri?: string;
}

function runLibraryQuery(docs: Doc[], petId = 'pet-1'): VetDocumentGroupRow[] {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  const insert = db.prepare(
    `INSERT INTO vet_documents
       (id, pet_id, document_group_id, kind, title, document_date, source,
        local_uri, storage_path, mime_type, page_index, deleted_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 'photo_library', ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  for (const d of docs) {
    insert.run(
      d.id,
      d.pet_id ?? petId,
      d.group ?? d.id,
      d.kind ?? 'other',
      d.title ?? null,
      d.document_date ?? null,
      d.local_uri ?? '',
      `${d.pet_id ?? petId}/${d.id}.jpg`,
      d.mime ?? 'image/jpeg',
      d.page_index ?? 0,
      d.deleted_at ?? null,
      d.created_at ?? '2026-07-01T00:00:00Z',
      d.created_at ?? '2026-07-01T00:00:00Z',
    );
  }
  const out = db.prepare(LIBRARY_VET_DOCUMENTS_QUERY).all(petId) as unknown as VetDocumentGroupRow[];
  db.close();
  return out;
}

describe('LIBRARY_VET_DOCUMENTS_QUERY', () => {
  it('collapses a multi-page group into one row carrying the page count', () => {
    const rows = runLibraryQuery([
      { id: 'a1', group: 'g1', page_index: 0, document_date: '2026-07-26' },
      { id: 'a2', group: 'g1', page_index: 1, document_date: '2026-07-26' },
      { id: 'a3', group: 'g1', page_index: 2, document_date: '2026-07-26' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].page_count).toBe(3);
  });

  // The MIN(page_index) bare-column rule. Without it SQLite may project any
  // member row's columns, so a four-page thread could render page 3's thumbnail
  // beside page 1's title. Page 2 is inserted FIRST and carries different values,
  // so a naive GROUP BY would very plausibly pick it.
  it('projects the cover page (lowest page_index), not an arbitrary member', () => {
    const rows = runLibraryQuery([
      { id: 'p2', group: 'g1', page_index: 1, title: 'page two', kind: 'invoice_estimate' },
      { id: 'p1', group: 'g1', page_index: 0, title: 'the cover', kind: 'lab_result' },
      { id: 'p3', group: 'g1', page_index: 2, title: 'page three', kind: 'insurance' },
    ]);
    expect(rows[0].id).toBe('p1');
    expect(rows[0].title).toBe('the cover');
    expect(rows[0].kind).toBe('lab_result');
    expect(rows[0].storage_path).toBe('pet-1/p1.jpg');
  });

  it('orders by document_date descending, falling back to the capture date', () => {
    const rows = runLibraryQuery([
      { id: 'old', document_date: '2025-12-19' },
      { id: 'new', document_date: '2026-07-26' },
      // No document_date: sorts on created_at's date prefix (2026-07-14).
      { id: 'mid', document_date: null, created_at: '2026-07-14T09:00:00Z' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('handles both SQLite and server created_at shapes in the date fallback', () => {
    const rows = runLibraryQuery([
      { id: 'sqlite-shape', document_date: null, created_at: '2026-07-20 08:00:00' },
      { id: 'server-shape', document_date: null, created_at: '2026-07-25T08:00:00+00:00' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['server-shape', 'sqlite-shape']);
  });

  it('hides soft-deleted documents', () => {
    const rows = runLibraryQuery([
      { id: 'kept' },
      { id: 'gone', deleted_at: '2026-07-26T00:00:00Z' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['kept']);
  });

  // The pet scope is the feature's whole security shape; the query must not lean
  // on RLS alone to keep another pet's paperwork off this screen.
  it('returns only the requested pet’s documents', () => {
    const rows = runLibraryQuery([
      { id: 'pixel-doc', pet_id: 'pet-1' },
      { id: 'juniper-doc', pet_id: 'pet-2' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['pixel-doc']);
  });
});

// ── 2. The row model ─────────────────────────────────────────────────────────

const NOW = new Date('2026-07-26T12:00:00Z');

function cover(overrides: Partial<VetDocumentGroupRow> = {}): VetDocumentGroupRow {
  return {
    group_id: 'g1',
    page_count: 1,
    cover_page_index: 0,
    id: 'd1',
    kind: 'other',
    title: null,
    document_date: '2026-07-26',
    vet_visit_id: null,
    local_uri: '',
    storage_path: 'pet-1/d1.jpg',
    mime_type: 'image/jpeg',
    created_at: '2026-07-26T10:00:00Z',
    ...overrides,
  };
}

describe('formatVetDocumentDate', () => {
  it('drops the year in the current year and keeps it otherwise', () => {
    expect(formatVetDocumentDate('2026-07-26', NOW)).toBe('Jul 26');
    expect(formatVetDocumentDate('2025-12-19', NOW)).toBe('Dec 19, 2025');
  });

  // The regression this exists for: `new Date('2026-07-26')` is UTC midnight by
  // spec, so toLocaleDateString renders it as the 25th anywhere west of Greenwich.
  // A vaccination certificate filed one day early is a real, silent defect.
  it('reads a calendar date as local, not UTC midnight', () => {
    const realTZ = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(formatVetDocumentDate('2026-07-26', NOW)).toBe('Jul 26');
      expect(formatVetDocumentDate('2026-01-01', NOW)).toBe('Jan 1');
    } finally {
      process.env.TZ = realTZ;
    }
  });

  it('accepts a full timestamp (the created_at fallback)', () => {
    expect(formatVetDocumentDate('2026-07-14T09:00:00Z', NOW)).toBe('Jul 14');
  });

  it('returns empty rather than throwing on junk', () => {
    expect(formatVetDocumentDate('', NOW)).toBe('');
    expect(formatVetDocumentDate('not-a-date', NOW)).toBe('');
  });
});

describe('buildVetLibraryRow — the untitled steady state (D11)', () => {
  it('renders the default title and flags the row untitled', () => {
    const row = buildVetLibraryRow(cover(), NOW);
    expect(row.title).toBe('Document — Jul 26');
    expect(row.untitled).toBe(true);
  });

  it('treats a whitespace-only title as untitled', () => {
    expect(buildVetLibraryRow(cover({ title: '   ' }), NOW).untitled).toBe(true);
  });

  it('keeps an owner’s title and drops the untitled flag', () => {
    const row = buildVetLibraryRow(cover({ title: 'Rabies certificate' }), NOW);
    expect(row.title).toBe('Rabies certificate');
    expect(row.untitled).toBe(false);
  });

  // `other` is the capture default — an absence, not a fact — so it renders as the
  // dashed "Add type" invitation rather than a chip that reads "Other".
  it('renders no kind label for the default kind, and a label for a real one', () => {
    expect(buildVetLibraryRow(cover({ kind: 'other' }), NOW).kindLabel).toBeNull();
    expect(buildVetLibraryRow(cover({ kind: 'lab_result' }), NOW).kindLabel).toBe('Lab result');
  });

  it('falls back to the default kind on an unknown value', () => {
    const row = buildVetLibraryRow(cover({ kind: 'wat' }), NOW);
    expect(row.kind).toBe('other');
    expect(row.kindLabel).toBeNull();
  });

  it('labels pages only when there is more than one', () => {
    expect(buildVetLibraryRow(cover(), NOW).pageLabel).toBeNull();
    expect(buildVetLibraryRow(cover({ page_count: 4 }), NOW).pageLabel).toBe('4 pages');
  });

  it('marks PDFs so the row never tries to preview one (D5)', () => {
    expect(buildVetLibraryRow(cover({ mime_type: 'application/pdf' }), NOW).isPdf).toBe(true);
    expect(buildVetLibraryRow(cover(), NOW).isPdf).toBe(false);
  });

  it('falls back to the capture date when the document carries none', () => {
    const row = buildVetLibraryRow(cover({ document_date: null }), NOW);
    expect(row.title).toBe('Document — Jul 26');
  });

  it('keeps a local file path so a device-captured document reads offline', () => {
    const row = buildVetLibraryRow(cover({ local_uri: 'file:///docs/d1.jpg' }), NOW);
    expect(row.localUri).toBe('file:///docs/d1.jpg');
  });
});

describe('defaultVetDocumentTitle', () => {
  it('degrades to a bare noun rather than a dangling dash', () => {
    expect(defaultVetDocumentTitle('')).toBe('Document');
    expect(defaultVetDocumentTitle('Jul 26')).toBe('Document — Jul 26');
  });
});

describe('kind labels', () => {
  it('covers every kind in the taxonomy', () => {
    for (const kind of VET_DOCUMENT_KINDS) {
      expect(VET_DOCUMENT_KIND_LABELS[kind]).toBeTruthy();
    }
  });
});

// ── 3. The kind lens ─────────────────────────────────────────────────────────

const rowsOfKinds = (kinds: string[]) =>
  kinds.map((k, i) => buildVetLibraryRow(cover({ kind: k, group_id: `g${i}`, id: `d${i}` }), NOW));

describe('buildKindFilterOptions', () => {
  // Offering all ten would put nine dead options in front of a week-one owner:
  // pick one, get an empty list, learn nothing. Offering only what's present makes
  // the filtered-empty state unreachable rather than something to design around.
  it('offers only kinds that are actually present, plus the default', () => {
    const options = buildKindFilterOptions(rowsOfKinds(['lab_result', 'vaccination', 'lab_result']));
    expect(options.map((o) => o.key)).toEqual([null, 'lab_result', 'vaccination']);
  });

  it('orders by continuity-of-care value, not alphabetically', () => {
    // Alphabetically this would be Email, Insurance, Lab result, Vaccination.
    const options = buildKindFilterOptions(
      rowsOfKinds(['insurance', 'correspondence', 'vaccination', 'lab_result']),
    );
    expect(options.map((o) => o.key)).toEqual([
      null, 'lab_result', 'vaccination', 'insurance', 'correspondence',
    ]);
  });

  it('offers only the default on an empty library', () => {
    expect(buildKindFilterOptions([]).map((o) => o.key)).toEqual([null]);
  });

  it('never yields an empty list for any option it offers', () => {
    const rows = rowsOfKinds(['lab_result', 'vaccination', 'other']);
    for (const option of buildKindFilterOptions(rows)) {
      expect(filterByKind(rows, option.key).length).toBeGreaterThan(0);
    }
  });
});

describe('reconcileKindFilter', () => {
  it('drops a selection whose kind no longer exists', () => {
    // The owner filtered to lab results, then deleted the last one.
    const options = buildKindFilterOptions(rowsOfKinds(['vaccination']));
    expect(reconcileKindFilter('lab_result', options)).toBeNull();
  });

  it('keeps a selection that still names something', () => {
    const options = buildKindFilterOptions(rowsOfKinds(['vaccination']));
    expect(reconcileKindFilter('vaccination', options)).toBe('vaccination');
  });
});

// ── 4. The profile card ──────────────────────────────────────────────────────

describe('buildVetFilesCardModel', () => {
  it('names the pet and invites a first document in the zero state (A1z)', () => {
    const model = buildVetFilesCardModel('Pixel', []);
    expect(model.blurb).toContain('Pixel');
    expect(model.blurb).toContain('camera roll');
    expect(model.actionLabel).toBe('Add the first one');
    expect(model.stripPaths).toEqual([]);
    expect(model.countLabel).toBeNull();
  });

  // D14 — the two Records cards sit adjacent on the profile, and until B-480 ships
  // a saved document does NOT go out with the report. Both persona reviews assumed
  // it did, so silence here is a false claim by adjacency.
  it('states the report-exclusion truth in the populated state (A1-r2)', () => {
    const model = buildVetFilesCardModel('Pixel', rowsOfKinds(['lab_result']));
    expect(model.blurb).toContain('Not included in the vet report');
    expect(model.actionLabel).toBe('Open Vet Files');
  });

  it('shows three thumbnails and an overflow badge', () => {
    const model = buildVetFilesCardModel('Pixel', rowsOfKinds(new Array(6).fill('other')));
    expect(model.stripPaths).toHaveLength(3);
    expect(model.overflowLabel).toBe('+3');
    expect(model.countLabel).toBe('6 documents');
  });

  it('omits the overflow badge when the strip shows everything', () => {
    const model = buildVetFilesCardModel('Pixel', rowsOfKinds(['other', 'other']));
    expect(model.stripPaths).toHaveLength(2);
    expect(model.overflowLabel).toBeNull();
    expect(model.countLabel).toBe('2 documents');
  });

  it('says “document” in the singular', () => {
    expect(buildVetFilesCardModel('Pixel', rowsOfKinds(['other'])).countLabel).toBe('1 document');
  });
});
