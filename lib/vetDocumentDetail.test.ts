// VF-4 document detail (B-478). Four halves, and the first one is the reason this
// file exists at all:
//
//   1. **The D7 invariant, against a real database.** Every write this feature can
//      make is run through the SHIPPED functions against node:sqlite built from the
//      production DDL, and `vet_visits` is compared byte-for-byte before and after.
//      D7 is a rule about a table this code must never touch, and the only honest
//      way to test "never touches" is to look at the table.
//   2. DETAIL_VET_DOCUMENT_QUERY + VET_VISIT_OPTIONS_QUERY run for real — page
//      ordering, the soft-delete exclusion and the pet scope live in SQL.
//   3. The pure detail model, where the untitled steady state (D11) is decided.
//   4. The AC-12 cache write, whose whole contract is which columns it does NOT
//      touch.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

// Both transitively reach native/Expo modules (expo-sqlite; expo-image-manipulator
// and the Supabase client via lib/storage). Every DB call under test is routed to
// the real node:sqlite below through the getDb mock.
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./storage', () => ({
  compressForUpload: jest.fn(),
  persistCapture: jest.fn(),
  persistRemoteObject: jest.fn(),
}));

import { BASE_SCHEMA_SQL } from './localSchema';
import { getDb } from './db';
import { persistRemoteObject } from './storage';
import {
  DETAIL_VET_DOCUMENT_QUERY,
  VET_VISIT_OPTIONS_QUERY,
  buildVetDocumentDetail,
  readVetDocumentDetail,
  readVetVisitOptions,
  formatVetVisitOption,
  vetDocumentShareFilename,
  adoptVetDocumentLocalUri,
  cacheVetDocumentPage,
  type VetDocumentPageRow,
} from './vetDocumentDetail';
import {
  linkVetDocumentVisit,
  renameVetDocument,
  setVetDocumentKind,
  setVetDocumentNotes,
  setVetDocumentDate,
  softDeleteVetDocument,
  restoreVetDocument,
} from './vetDocumentLibrary';

type Row = Record<string, unknown>;

// The expo-sqlite surface the lib layer actually calls, over a synchronous
// node:sqlite handle. Thin on purpose — a fatter fake would start testing itself.
function adapt(raw: InstanceType<typeof DatabaseSync>) {
  return {
    runAsync: async (sql: string, params: unknown[] = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql: string, params: unknown[] = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => raw.prepare(sql).get(...params) ?? null,
  };
}

interface DocSeed {
  id: string;
  pet_id?: string;
  group?: string;
  kind?: string;
  title?: string | null;
  document_date?: string | null;
  notes?: string | null;
  vet_visit_id?: string | null;
  mime?: string;
  page_index?: number;
  local_uri?: string;
  deleted_at?: string | null;
  created_at?: string;
  synced?: number;
}

interface VisitSeed {
  id: string;
  pet_id?: string;
  visited_at?: string;
  clinic_name?: string | null;
  vet_name?: string | null;
  reason?: string | null;
}

function freshDb(docs: DocSeed[] = [], visits: VisitSeed[] = []) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(BASE_SCHEMA_SQL);

  const insertVisit = raw.prepare(
    `INSERT INTO vet_visits (id, pet_id, visited_at, clinic_name, vet_name, reason, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 1)`,
  );
  for (const v of visits) {
    insertVisit.run(
      v.id, v.pet_id ?? 'pet-1', v.visited_at ?? '2026-07-14',
      v.clinic_name ?? null, v.vet_name ?? null, v.reason ?? null,
    );
  }

  const insertDoc = raw.prepare(
    `INSERT INTO vet_documents
       (id, pet_id, vet_visit_id, document_group_id, kind, title, document_date, notes,
        source, local_uri, storage_path, mime_type, page_index, deleted_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'photo_library', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of docs) {
    const created = d.created_at ?? '2026-07-20T10:00:00.000Z';
    insertDoc.run(
      d.id, d.pet_id ?? 'pet-1', d.vet_visit_id ?? null, d.group ?? d.id,
      d.kind ?? 'other', d.title ?? null, d.document_date ?? '2026-07-20', d.notes ?? null,
      d.local_uri ?? '', `${d.pet_id ?? 'pet-1'}/${d.id}.jpg`,
      d.mime ?? 'image/jpeg', d.page_index ?? 0, d.deleted_at ?? null,
      created, created, d.synced ?? 1,
    );
  }

  (getDb as jest.Mock).mockReturnValue(adapt(raw));
  return raw;
}

/** Every vet_visits row, ordered and stringified — the D7 comparison unit. */
function visitSnapshot(raw: InstanceType<typeof DatabaseSync>): string {
  return JSON.stringify(raw.prepare('SELECT * FROM vet_visits ORDER BY id').all());
}

// ── 1. D7 — the report-window protection rule ────────────────────────────────

describe('D7 — a document never mints or re-dates a vet visit', () => {
  // The rule's teeth: the vet report's scope cascade keys rung 1 off
  // vet_visits.visited_at, so a link that created or moved a visit would silently
  // move the window of every report the owner generates afterwards. Nothing short
  // of reading the table proves the absence of a write.
  it('leaves vet_visits byte-identical across link, re-link and unlink', async () => {
    const raw = freshDb(
      [{ id: 'doc-1', page_index: 0 }],
      [
        { id: 'visit-1', visited_at: '2026-07-14', clinic_name: 'Lakeview Animal Clinic' },
        { id: 'visit-2', visited_at: '2026-05-02', clinic_name: 'Riverside Vets' },
      ],
    );
    const before = visitSnapshot(raw);

    await linkVetDocumentVisit('doc-1', 'visit-1');
    expect(visitSnapshot(raw)).toBe(before);

    await linkVetDocumentVisit('doc-1', 'visit-2');
    expect(visitSnapshot(raw)).toBe(before);

    await linkVetDocumentVisit('doc-1', null);
    expect(visitSnapshot(raw)).toBe(before);

    // Belt and braces on the half the snapshot could not distinguish from a
    // no-op: the count itself never moved.
    const { n } = raw.prepare('SELECT COUNT(*) AS n FROM vet_visits').get() as Row as { n: number };
    expect(n).toBe(2);
    raw.close();
  });

  it('does not mint a visit when linking an id no visit row has', async () => {
    // The local mirror declares no FK on vet_visit_id (deliberate — hydration can
    // legitimately see a document before the visit it references). That makes an
    // unknown id INSERTABLE, which is exactly why "never mints" has to be checked
    // rather than assumed from a constraint.
    const raw = freshDb([{ id: 'doc-1' }], []);
    await linkVetDocumentVisit('doc-1', 'visit-not-here-yet');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM vet_visits').get()).toEqual({ n: 0 });
    expect(
      (raw.prepare('SELECT vet_visit_id FROM vet_documents WHERE id = ?').get('doc-1') as Row).vet_visit_id,
    ).toBe('visit-not-here-yet');
    raw.close();
  });

  it('no write this feature can make touches vet_visits', async () => {
    // The generalised guard. A future setter that "helpfully" re-dates a visit to
    // match its document — the exact shape D7 forbids — fails here rather than in
    // a vet report six weeks later.
    const raw = freshDb(
      [{ id: 'doc-1' }],
      [{ id: 'visit-1', visited_at: '2026-07-14', clinic_name: 'Lakeview Animal Clinic' }],
    );
    const before = visitSnapshot(raw);

    await renameVetDocument('doc-1', 'Senior panel');
    await setVetDocumentKind('doc-1', 'lab_result');
    await setVetDocumentNotes('doc-1', 'Dr. Chen wanted this before the recheck');
    await setVetDocumentDate('doc-1', '2026-07-14');
    await linkVetDocumentVisit('doc-1', 'visit-1');
    await adoptVetDocumentLocalUri('doc-1', 'file:///docs/doc-1.jpg');
    await softDeleteVetDocument('doc-1');
    await restoreVetDocument('doc-1');

    expect(visitSnapshot(raw)).toBe(before);
    raw.close();
  });

  it('links every page of a multi-page document, and queues them all for push', async () => {
    const raw = freshDb(
      [
        { id: 'p1', group: 'g1', page_index: 0 },
        { id: 'p2', group: 'g1', page_index: 1 },
        { id: 'p3', group: 'g1', page_index: 2 },
      ],
      [{ id: 'visit-1' }],
    );
    await linkVetDocumentVisit('g1', 'visit-1');
    const pages = raw.prepare(
      'SELECT vet_visit_id, synced FROM vet_documents WHERE document_group_id = ?',
    ).all('g1') as Row[];
    expect(pages).toHaveLength(3);
    // A per-document fact written to a per-row column: page 2 of a discharge sheet
    // pointing at a different visit than page 1 would be invisible in the library.
    expect(pages.every((p) => p.vet_visit_id === 'visit-1')).toBe(true);
    expect(pages.every((p) => p.synced === 0)).toBe(true);
    raw.close();
  });
});

// ── 2. The queries ───────────────────────────────────────────────────────────

describe('DETAIL_VET_DOCUMENT_QUERY', () => {
  it('returns one group in page order, cover first', async () => {
    const raw = freshDb([
      { id: 'p3', group: 'g1', page_index: 2 },
      { id: 'p1', group: 'g1', page_index: 0 },
      { id: 'p2', group: 'g1', page_index: 1 },
      { id: 'other', group: 'g2', page_index: 0 },
    ]);
    const rows = raw.prepare(DETAIL_VET_DOCUMENT_QUERY).all('g1') as unknown as VetDocumentPageRow[];
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
    raw.close();
  });

  it('hides soft-deleted pages, so a deleted document reads as gone', async () => {
    const raw = freshDb([
      { id: 'p1', group: 'g1', page_index: 0, deleted_at: '2026-07-25T00:00:00.000Z' },
    ]);
    expect(await readVetDocumentDetail('g1')).toBeNull();
    raw.close();
  });
});

describe('VET_VISIT_OPTIONS_QUERY', () => {
  it('lists this pet’s visits newest first, and never another pet’s', async () => {
    const raw = freshDb([], [
      { id: 'old', visited_at: '2026-01-04' },
      { id: 'new', visited_at: '2026-07-14' },
      { id: 'theirs', pet_id: 'pet-2', visited_at: '2026-07-20' },
    ]);
    const options = await readVetVisitOptions('pet-1');
    expect(options.map((o) => o.id)).toEqual(['new', 'old']);
    raw.close();
  });

  it('returns [] for a pet with no visits — the signal the row must not render', async () => {
    // Round-2 ruling: visits have no browse surface in this app, so an empty picker
    // reads as broken software rather than as an empty list.
    const raw = freshDb([], []);
    expect(await readVetVisitOptions('pet-1')).toEqual([]);
    raw.close();
  });
});

describe('formatVetVisitOption', () => {
  const now = new Date('2026-07-26T12:00:00Z');

  it('reads as date — clinic (mock E-pdf-r2)', () => {
    expect(formatVetVisitOption(
      { id: 'v', visited_at: '2026-07-14', clinic_name: 'Lakeview Animal Clinic', vet_name: null, reason: null },
      now,
    ).label).toBe('Jul 14 — Lakeview Animal Clinic');
  });

  it('degrades clinic → vet → reason rather than saying "Untitled visit"', () => {
    const base = { id: 'v', visited_at: '2026-07-14', clinic_name: null, vet_name: null, reason: null };
    expect(formatVetVisitOption({ ...base, vet_name: 'Dr. Chen' }, now).label).toBe('Jul 14 — Dr. Chen');
    expect(formatVetVisitOption({ ...base, reason: 'Vomiting recheck' }, now).label)
      .toBe('Jul 14 — Vomiting recheck');
    // A bare date is honest for a visit that recorded nothing else; "Untitled"
    // would read as a broken row rather than a sparse one.
    expect(formatVetVisitOption(base, now).label).toBe('Jul 14');
  });

  it('keeps the year on a visit from a previous year', () => {
    // A vaccination record's whole value is knowing whether it is current.
    expect(formatVetVisitOption(
      { id: 'v', visited_at: '2025-12-19', clinic_name: 'Riverside', vet_name: null, reason: null },
      now,
    ).label).toBe('Dec 19, 2025 — Riverside');
  });
});

// ── 3. The detail model ──────────────────────────────────────────────────────

function pageRow(over: Partial<VetDocumentPageRow> = {}): VetDocumentPageRow {
  return {
    id: 'p1',
    pet_id: 'pet-1',
    document_group_id: 'g1',
    kind: 'other',
    title: null,
    document_date: '2026-07-20',
    notes: null,
    vet_visit_id: null,
    source_filename: null,
    local_uri: '',
    storage_path: 'pet-1/p1.jpg',
    mime_type: 'image/jpeg',
    page_index: 0,
    created_at: '2026-07-20T10:00:00.000Z',
    ...over,
  };
}

describe('buildVetDocumentDetail', () => {
  const now = new Date('2026-07-26T12:00:00Z');

  it('returns null for an empty group — the "this document is gone" state', () => {
    expect(buildVetDocumentDetail([], now)).toBeNull();
  });

  it('renders the default title for the untitled steady state (D11)', () => {
    const d = buildVetDocumentDetail([pageRow()], now);
    expect(d?.title).toBe('Document — Jul 20');
    expect(d?.untitled).toBe(true);
    // `other` is the capture default — an absence, not a fact about the document —
    // so it renders as the "Add a type" placeholder, never a chip reading "Other".
    expect(d?.kindLabel).toBeNull();
  });

  it('treats a whitespace-only title and notes as unset', () => {
    const d = buildVetDocumentDetail([pageRow({ title: '   ', notes: '  \n ' })], now);
    expect(d?.untitled).toBe(true);
    expect(d?.notes).toBeNull();
  });

  // B-546. Deliberately DIFFERENT from the library row, which drops the filename
  // once a title exists: the list can afford that (the name has disambiguated it),
  // this screen cannot. It is where the owner confirms they are handing a vet the
  // right file, and "which PDF is this, actually" is a question a typed name does
  // not answer.
  it('exposes the source filename whatever the title is', () => {
    const untitled = buildVetDocumentDetail([pageRow({ source_filename: 'cbc.pdf' })], now);
    expect(untitled?.sourceFilename).toBe('cbc.pdf');

    const named = buildVetDocumentDetail(
      [pageRow({ title: 'Senior panel', source_filename: 'cbc.pdf' })],
      now,
    );
    expect(named?.sourceFilename).toBe('cbc.pdf');
    expect(named?.untitled).toBe(false);
  });

  it('reports no filename when none was recorded', () => {
    expect(buildVetDocumentDetail([pageRow()], now)?.sourceFilename).toBeNull();
    expect(buildVetDocumentDetail([pageRow({ source_filename: '  ' })], now)?.sourceFilename)
      .toBeNull();
  });

  // Every per-document fact comes from the COVER, and this is one more of them —
  // a half-hydrated group must not render page 2's filename under page 1.
  it('takes the filename from the cover page', () => {
    const d = buildVetDocumentDetail([
      pageRow({ id: 'p1', page_index: 0, source_filename: 'cover.pdf' }),
      pageRow({ id: 'p2', page_index: 1, source_filename: 'page-two.pdf' }),
    ], now);
    expect(d?.sourceFilename).toBe('cover.pdf');
  });

  it('carries the owner’s title, kind, notes and visit link', () => {
    const d = buildVetDocumentDetail(
      [pageRow({ title: 'Senior panel', kind: 'lab_result', notes: 'Before the recheck', vet_visit_id: 'v1' })],
      now,
    );
    expect(d?.title).toBe('Senior panel');
    expect(d?.untitled).toBe(false);
    expect(d?.kindLabel).toBe('Lab result');
    expect(d?.notes).toBe('Before the recheck');
    expect(d?.vetVisitId).toBe('v1');
  });

  it('falls back to the capture date when the document carries none', () => {
    const d = buildVetDocumentDetail([pageRow({ document_date: null })], now);
    expect(d?.dateLabel).toBe('Jul 20');
    expect(d?.documentDate).toBeNull();
  });

  it('takes every per-document fact from the COVER, not an arbitrary page', () => {
    // Group writes keep the pages in step, so a disagreement means a partially
    // applied write or a half-hydrated group — which should render as page 1
    // rather than as a mixture.
    const d = buildVetDocumentDetail(
      [
        pageRow({ id: 'p1', page_index: 0, title: 'Discharge sheet' }),
        pageRow({ id: 'p2', page_index: 1, title: 'STALE' }),
      ],
      now,
    );
    expect(d?.title).toBe('Discharge sheet');
    expect(d?.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('flags a PDF so the screen picks the PDF viewer, not the image one', () => {
    const d = buildVetDocumentDetail([pageRow({ mime_type: 'application/pdf' })], now);
    expect(d?.isPdf).toBe(true);
  });
});

describe('vetDocumentShareFilename', () => {
  // The vet files this by name out of Mail; "IMG_4471.jpg" is a worse artifact
  // than the same bytes with a name.
  const named = {
    kind: 'lab_result' as const,
    documentDate: '2026-07-14',
    isPdf: true,
    title: 'Senior panel',
    untitled: false,
    sourceFilename: null,
  };

  it('uses the owner’s title when there is one', () => {
    expect(vetDocumentShareFilename('Pixel', named)).toBe('Pixel-Senior-panel-2026-07-14.pdf');
  });

  it('falls back to the kind for the untitled steady state', () => {
    expect(vetDocumentShareFilename('Pixel', { ...named, untitled: true, title: 'Document — Jul 14' }))
      // The taxonomy value's underscore is slugged out with everything else — the
      // vet reads the filename, not the enum.
      .toBe('Pixel-lab-result-2026-07-14.pdf');
  });

  it('numbers the pages of a multi-page document so the vet can order them', () => {
    expect(vetDocumentShareFilename('Pixel', { ...named, isPdf: false }, 1, 3))
      .toBe('Pixel-Senior-panel-2026-07-14-p2.jpg');
  });

  it('never produces a path-breaking name from a pet name with punctuation', () => {
    const name = vetDocumentShareFilename("Mr. O'Malley /2", named);
    expect(name).toBe('Mr-O-Malley-2-Senior-panel-2026-07-14.pdf');
    expect(name).not.toMatch(/[/\\]/);
  });

  // The caller passes '' when it cannot resolve the pet (archived pet, cold deep
  // link) rather than its own "your pet" PROSE fallback — which would slug to
  // "your-pet-lab-result-….pdf", a file the vet keeps, named after a sentence.
  // Asserted here so the anonymous path is a defined behaviour rather than an
  // accident of whatever the screen happens to hold (pm-feature-review on B-550).
  it('degrades to an anonymous name when the pet cannot be resolved', () => {
    expect(vetDocumentShareFilename('', named)).toBe('pet-Senior-panel-2026-07-14.pdf');
    expect(vetDocumentShareFilename('   ', named)).toBe('pet-Senior-panel-2026-07-14.pdf');
  });

  // ── B-583: the source filename is the middle rung ──────────────────────────
  //
  // The regression this closes: `untitled + kind 'other'` is not an edge case, it
  // is what EVERY document is until the owner does two optional things — so the
  // vet routinely received "Pixel-other-2026-07-14.pdf" for a file the app could
  // already name. PM-ratified 2026-07-29.

  const untitled = { ...named, untitled: true, title: 'Document — Jul 14' };

  it('uses the source filename’s stem for an untitled document', () => {
    expect(vetDocumentShareFilename('Pixel', { ...untitled, sourceFilename: 'CBC.pdf' }))
      .toBe('Pixel-CBC-2026-07-14.pdf');
  });

  it('never lets `other` reach the vet’s copy', () => {
    // slug()'s own fallback cannot catch this — 'other' slugs to a non-empty
    // 'other', so the fallback never fires and the word ships.
    expect(vetDocumentShareFilename('Pixel', { ...untitled, kind: 'other' as const }))
      .toBe('Pixel-document-2026-07-14.pdf');
  });

  it('still falls through to a real kind when there is no filename', () => {
    expect(vetDocumentShareFilename('Pixel', untitled)).toBe('Pixel-lab-result-2026-07-14.pdf');
  });

  // A PIMS export very often already carries both, and
  // "Pixel-Pixel-CBC-2026-07-14-2026-07-14.pdf" reads as a bug in the app that
  // produced it.
  it('does not repeat the pet or the date the stem already carries', () => {
    expect(vetDocumentShareFilename('Pixel', {
      ...untitled, sourceFilename: 'Pixel-CBC-2026-07-14.pdf',
    })).toBe('Pixel-CBC-2026-07-14.pdf');
    // Case-insensitively — a clinic exports PIXEL- as readily as Pixel-.
    expect(vetDocumentShareFilename('Pixel', {
      ...untitled, sourceFilename: 'PIXEL_CBC.pdf',
    })).toBe('PIXEL-CBC-2026-07-14.pdf');
  });

  it('still dates a stem that carries no date', () => {
    expect(vetDocumentShareFilename('Pixel', { ...untitled, sourceFilename: 'bloodwork.pdf' }))
      .toBe('Pixel-bloodwork-2026-07-14.pdf');
  });

  it('drops only the extension, and uses the row’s own type for the new one', () => {
    // "labs.PDF" must not become "labs-PDF.pdf"; and an image row ends .jpg even
    // when the picked name said otherwise.
    expect(vetDocumentShareFilename('Pixel', { ...untitled, sourceFilename: 'labs.PDF' }))
      .toBe('Pixel-labs-2026-07-14.pdf');
    expect(vetDocumentShareFilename('Pixel', {
      ...untitled, sourceFilename: 'scan.pdf', isPdf: false,
    })).toBe('Pixel-scan-2026-07-14.jpg');
  });

  it('lets an owner’s title outrank the filename', () => {
    expect(vetDocumentShareFilename('Pixel', { ...named, sourceFilename: 'CBC.pdf' }))
      .toBe('Pixel-Senior-panel-2026-07-14.pdf');
  });

  it('cannot be walked out of its directory by a hostile stem', () => {
    const out = vetDocumentShareFilename('Pixel', {
      ...untitled, sourceFilename: '../../etc/passwd.pdf',
    });
    expect(out).not.toMatch(/[/\\]/);
    expect(out).not.toMatch(/\.\./);
  });
});

// ── 4. AC 12 — the offline read ──────────────────────────────────────────────

describe('adoptVetDocumentLocalUri', () => {
  it('sets local_uri WITHOUT touching updated_at or synced', async () => {
    // local_uri is local-only: VF-1's push payload omits it and hydration never
    // overwrites it. Bumping updated_at here would mean that merely LOOKING at a
    // document on one device beats a real rename made on another under LWW.
    const raw = freshDb([{ id: 'p1', synced: 1 }]);
    const before = raw.prepare('SELECT updated_at, synced FROM vet_documents WHERE id = ?').get('p1') as Row;

    await adoptVetDocumentLocalUri('p1', 'file:///docs/p1.jpg');

    const after = raw.prepare('SELECT local_uri, updated_at, synced FROM vet_documents WHERE id = ?').get('p1') as Row;
    expect(after.local_uri).toBe('file:///docs/p1.jpg');
    expect(after.updated_at).toBe(before.updated_at);
    expect(after.synced).toBe(1);
    raw.close();
  });

  it('ignores an empty path rather than blanking a real one', async () => {
    const raw = freshDb([{ id: 'p1', local_uri: 'file:///docs/p1.jpg' }]);
    await adoptVetDocumentLocalUri('p1', '');
    expect((raw.prepare('SELECT local_uri FROM vet_documents WHERE id = ?').get('p1') as Row).local_uri)
      .toBe('file:///docs/p1.jpg');
    raw.close();
  });
});

describe('cacheVetDocumentPage', () => {
  beforeEach(() => (persistRemoteObject as jest.Mock).mockReset());

  it('downloads once, and records the durable copy on the row', async () => {
    const raw = freshDb([{ id: 'p1' }]);
    (persistRemoteObject as jest.Mock).mockResolvedValue('file:///docs/p1.jpg');

    const out = await cacheVetDocumentPage(
      { id: 'p1', storagePath: 'pet-1/p1.jpg', localUri: '' },
      'https://signed.example/p1.jpg',
    );

    expect(out).toBe('file:///docs/p1.jpg');
    // Named after the object key's own basename, so a file on disk can be matched
    // to its object by eye.
    expect(persistRemoteObject).toHaveBeenCalledWith('https://signed.example/p1.jpg', 'p1.jpg');
    expect((raw.prepare('SELECT local_uri FROM vet_documents WHERE id = ?').get('p1') as Row).local_uri)
      .toBe('file:///docs/p1.jpg');
    raw.close();
  });

  it('short-circuits a page that is already local — no second download', async () => {
    freshDb([{ id: 'p1', local_uri: 'file:///docs/p1.jpg' }]);
    const out = await cacheVetDocumentPage(
      { id: 'p1', storagePath: 'pet-1/p1.jpg', localUri: 'file:///docs/p1.jpg' },
      'https://signed.example/p1.jpg',
    );
    expect(out).toBe('file:///docs/p1.jpg');
    expect(persistRemoteObject).not.toHaveBeenCalled();
  });

  it('returns null with no signed URL, instead of pretending to cache', async () => {
    freshDb([{ id: 'p1' }]);
    expect(await cacheVetDocumentPage({ id: 'p1', storagePath: 'pet-1/p1.jpg', localUri: '' }, ''))
      .toBeNull();
    expect(persistRemoteObject).not.toHaveBeenCalled();
  });

  it('returns null when the download fails, leaving the row untouched', async () => {
    // Caching is a side effect of viewing. A failure must cost the owner nothing —
    // the screen keeps rendering from the signed URL it already has.
    const raw = freshDb([{ id: 'p1' }]);
    (persistRemoteObject as jest.Mock).mockResolvedValue(null);
    expect(await cacheVetDocumentPage(
      { id: 'p1', storagePath: 'pet-1/p1.jpg', localUri: '' },
      'https://signed.example/p1.jpg',
    )).toBeNull();
    expect((raw.prepare('SELECT local_uri FROM vet_documents WHERE id = ?').get('p1') as Row).local_uri).toBe('');
    raw.close();
  });
});

// VF-6 — the fourth filename component (found by rls-privacy-reviewer).
//
// `documentDate` was the one of four parts vetDocumentShareFilename did not slug,
// which made its docstring's "sanitised" claim narrower than it read. Unreachable
// today — the only writers are the date picker and hydration from a Postgres DATE —
// but the staged share copy is written to disk under this name, so a separator here
// walks the file out of its directory.
describe('vetDocumentShareFilename — every component is sanitised', () => {
  const base = {
    kind: 'lab_result' as const,
    isPdf: true,
    title: 'Senior panel',
    untitled: false,
    sourceFilename: null,
  };

  it('slugs a separator out of the document date', () => {
    const name = vetDocumentShareFilename('Pixel', { ...base, documentDate: '2026-07-14/../../x' });
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('leaves an ordinary ISO date readable', () => {
    // The slug must not damage the normal case — the vet files this by eye.
    expect(vetDocumentShareFilename('Pixel', { ...base, documentDate: '2026-07-14' }))
      .toBe('Pixel-Senior-panel-2026-07-14.pdf');
  });

  it('never emits a path separator from any component', () => {
    const name = vetDocumentShareFilename('Mr. O’Malley /2', {
      ...base,
      title: '../../etc/passwd',
      documentDate: '../..',
    });
    expect(name).not.toMatch(/[/\\]/);
    expect(name.startsWith('.')).toBe(false);
  });
});
