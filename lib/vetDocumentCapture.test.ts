// VF-3 capture path (B-478). What these tests are actually protecting:
//
//   • the VF-1 contract — every row's mime comes from resolveVetDocumentMime and
//     every key from buildVetDocumentPath, so row / key / bytes cannot disagree;
//   • the D11 zero-decision defaults — `other`, NULL title, EXIF-or-today date;
//   • §4.4 grouping, including the append path (a new page must not start a second
//     document or re-date the first);
//   • D13's "full independent copy" — new ids, new group, the OTHER pet's prefix,
//     its own local file, and no inherited visit link;
//   • the two screening rules that decide whether a document silently never backs
//     up (unsupported type, oversize PDF).

// The insert runs against a real node:sqlite built from the production DDL, so the
// column list and the schema cannot drift apart; everything else is pure.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

// Both transitively reach native/Expo modules (expo-sqlite; expo-file-system +
// expo-image-manipulator via lib/storage, which also builds the Supabase client at
// import time). persistCapture is stubbed here and injected explicitly in the
// builder tests.
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./storage', () => ({
  compressForUpload: jest.fn(),
  persistCapture: jest.fn((uri: string) => uri),
}));

import { BASE_SCHEMA_SQL } from './localSchema';
import {
  buildVetDocumentRows,
  duplicateVetDocumentRowsForPet,
  inferPickedMimeType,
  insertVetDocumentRows,
  pickedFilesFromDocumentAssets,
  pickedFilesFromImageAssets,
  rejectedPickMessage,
  savedMomentCopy,
  screenPickedFiles,
  vetDocumentDateFromPages,
  alsoAddLabel,
  alsoAddedLabel,
  addSheetTitle,
  ADD_SOURCE_ROWS,
  VET_DOCUMENT_MAX_BYTES,
  VET_DOCUMENT_FILENAME_MAX,
  sourceFilename,
  type PickedVetFile,
} from './vetDocumentCapture';
import { getDb } from './db';
import type { LocalVetDocument } from './vetDocuments';

// "Now": 2026-07-26 15:00 on the DEVICE's own clock, built from local components
// rather than a UTC instant (B-514). `document_date` defaults to the owner's
// calendar day, so a UTC "now" filed the document under 27 Jul in Kiritimati and
// the saved-moment card read "Document — Jul 27" — a date the owner's phone
// disagreed with, on the row the library sorts by.
const NOW = new Date(2026, 6, 26, 15, 0);
const PET = 'pet-1';

// Deterministic ids so the assertions can name the keys they expect.
function idFactory(prefix = 'doc') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function page(over: Partial<PickedVetFile> = {}): PickedVetFile {
  return {
    localUri: 'file:///cache/IMG_0001.HEIC',
    pickedMimeType: 'image/heic',
    exifIso: null,
    fileSizeBytes: null,
    ...over,
  };
}

function build(pages: PickedVetFile[], over: Partial<Parameters<typeof buildVetDocumentRows>[0]> = {}) {
  return buildVetDocumentRows({
    petId: PET,
    source: 'photo_library',
    pages,
    now: NOW,
    newId: idFactory(),
    persistFile: (src, name) => `file:///documents/attachments/${name}`,
    ...over,
  });
}

// ── inferPickedMimeType ──────────────────────────────────────────────────────

describe('inferPickedMimeType', () => {
  it('trusts a real claimed mime', () => {
    expect(inferPickedMimeType('application/pdf', 'labs.pdf')).toBe('application/pdf');
    expect(inferPickedMimeType('IMAGE/JPEG')).toBe('image/jpeg');
  });

  // The two fallbacks that exist because the platform does this: an Android image
  // pick with no mimeType, and a document provider that declines to sniff.
  it('falls back to the filename extension when the mime is absent or opaque', () => {
    expect(inferPickedMimeType(null, 'Bloodwork.PDF')).toBe('application/pdf');
    expect(inferPickedMimeType('application/octet-stream', 'scan.pdf')).toBe('application/pdf');
    expect(inferPickedMimeType(undefined, 'IMG_0001.HEIC')).toBe('image/heic');
  });

  it('keeps an unrecognised claim rather than inventing one', () => {
    expect(inferPickedMimeType('text/csv', 'results.csv')).toBe('text/csv');
    expect(inferPickedMimeType('', 'notes.txt')).toBe('');
  });
});

// ── Picker mapping ───────────────────────────────────────────────────────────

describe('pickedFilesFromImageAssets', () => {
  it('reads the EXIF capture date from either tag', () => {
    const [a, b] = pickedFilesFromImageAssets(
      [
        { uri: 'file:///a.jpg', exif: { DateTimeOriginal: '2026:07:14 09:30:00' } },
        { uri: 'file:///b.jpg', exif: { DateTime: '2026:07:15 11:00:00' } },
      ],
      NOW,
    );
    // EXIF carries a bare wall-clock reading with no zone, so it is parsed as the
    // camera's LOCAL time and `exifIso` is that instant in UTC. Asserted as the
    // whole instant rather than a `toContain('2026-07-14')` on the ISO text
    // (B-514): east of UTC+9:30 the same local morning renders a UTC string dated
    // the day before, and the substring check failed for a correct value.
    expect(a.exifIso).toBe(new Date(2026, 6, 14, 9, 30).toISOString());
    expect(b.exifIso).toBe(new Date(2026, 6, 15, 11, 0).toISOString());
  });

  // A wrong camera clock must not file a document under a date that has not
  // happened — the library sorts on document_date, so a future row pins itself to
  // the top of the list forever.
  it('drops a future-dated EXIF instant', () => {
    const [only] = pickedFilesFromImageAssets(
      [{ uri: 'file:///a.jpg', exif: { DateTimeOriginal: '2027:01:01 09:00:00' } }],
      NOW,
    );
    expect(only.exifIso).toBeNull();
  });

  it('carries no exif when the asset has none', () => {
    const [only] = pickedFilesFromImageAssets([{ uri: 'file:///a.jpg' }], NOW);
    expect(only.exifIso).toBeNull();
    expect(only.pickedMimeType).toBe('');
  });
});

// ── sourceFilename (B-546) ───────────────────────────────────────────────────
//
// This is the one value on the row that is persisted WITHOUT the owner typing it,
// so nobody reviews it before it lands. Every case below is something a real
// document provider actually hands back.

describe('sourceFilename', () => {
  it('keeps a real filename, extension and all', () => {
    // The extension is half of what makes the line read as a FILE rather than as
    // a title someone forgot to finish.
    expect(sourceFilename('Pixel-CBC-2026-07-14.pdf')).toBe('Pixel-CBC-2026-07-14.pdf');
  });

  it('cuts a provider-supplied path down to the basename', () => {
    // Android's SAF and some cloud providers return a display name with a path in
    // it. "Downloads/labs/CBC.pdf" is not the file's name.
    expect(sourceFilename('Downloads/labs/CBC.pdf')).toBe('CBC.pdf');
    expect(sourceFilename('C:\\Users\\sam\\CBC.pdf')).toBe('CBC.pdf');
  });

  it('strips control characters and collapses whitespace', () => {
    expect(sourceFilename('lab\nresult .pdf')).toBe('lab result .pdf');
    expect(sourceFilename('  spaced   out.pdf  ')).toBe('spaced out.pdf');
  });

  it('strips bidi overrides, which can make an extension render backwards', () => {
    // U+202E on a screen whose job is telling a PDF from a photo is a lie, not a
    // curiosity: "labs\u202Efdp.txt" renders as "labstxt.pdf".
    const spoofed = sourceFilename('labs\u202Efdp.txt');
    expect(spoofed).not.toMatch(/[\u202a-\u202e]/);
    expect(spoofed).toBe('labs fdp.txt');
  });

  it('caps the length well under the server CHECK', () => {
    const long = `${'a'.repeat(400)}.pdf`;
    const out = sourceFilename(long) as string;
    expect(out).toHaveLength(VET_DOCUMENT_FILENAME_MAX);
    // Migration 047 CHECKs 1..255; the client must never be able to mint a row the
    // server refuses, which would wedge that row at synced = 0 forever.
    expect(out.length).toBeLessThanOrEqual(255);
  });

  it('returns null for anything that is not a name', () => {
    expect(sourceFilename(null)).toBeNull();
    expect(sourceFilename(undefined)).toBeNull();
    expect(sourceFilename('   ')).toBeNull();
    expect(sourceFilename('some/dir/')).toBeNull();
  });

  it('is convergent — sanitising a sanitised name changes nothing', () => {
    for (const raw of ['Downloads/labs/CBC.pdf', '  a   b.pdf ', `${'x'.repeat(400)}.pdf`]) {
      const once = sourceFilename(raw);
      expect(sourceFilename(once)).toBe(once);
    }
  });
});

describe('pickedFilesFromDocumentAssets', () => {
  it('maps size and name-inferred mime, and never claims an exif date', () => {
    const [only] = pickedFilesFromDocumentAssets([
      { uri: 'file:///cache/labs.pdf', name: 'labs.pdf', size: 812_000, mimeType: null },
    ]);
    expect(only).toEqual({
      localUri: 'file:///cache/labs.pdf',
      pickedMimeType: 'application/pdf',
      exifIso: null,
      fileSizeBytes: 812_000,
      // B-546 — the name is CARRIED now, not read for its extension and dropped.
      fileName: 'labs.pdf',
    });
  });

  it('carries a null name rather than inventing one', () => {
    const [only] = pickedFilesFromDocumentAssets([
      { uri: 'file:///cache/x.pdf', mimeType: 'application/pdf' },
    ]);
    expect(only.fileName).toBeNull();
  });

  // The image pickers deliberately do NOT set fileName: an `IMG_4821.HEIC` would
  // put a meta line on every photo row to say nothing. If this ever starts
  // failing, someone has widened B-546 past the Files path without saying so.
  it('image picks carry no filename', () => {
    const [only] = pickedFilesFromImageAssets(
      [{ uri: 'file:///a.jpg', fileName: 'IMG_4821.HEIC' }],
      NOW,
    );
    expect(only.fileName).toBeUndefined();
  });
});

// ── Screening ────────────────────────────────────────────────────────────────

describe('screenPickedFiles', () => {
  it('accepts every image form and PDFs', () => {
    const screened = screenPickedFiles([
      page({ pickedMimeType: 'image/heic' }),
      page({ pickedMimeType: 'image/png' }),
      page({ pickedMimeType: 'image/jpeg' }),
      page({ pickedMimeType: 'application/pdf' }),
    ]);
    expect(screened.accepted).toHaveLength(4);
    expect(screened.rejectedType).toBe(0);
    expect(screened.rejectedSize).toBe(0);
  });

  // A partial accept: six screenshots and one stray file should save six
  // documents, not fail the capture.
  it('rejects an unsupported type without dropping the rest', () => {
    const screened = screenPickedFiles([
      page(),
      page({ pickedMimeType: 'text/csv' }),
      page(),
    ]);
    expect(screened.accepted).toHaveLength(2);
    expect(screened.rejectedType).toBe(1);
  });

  // The bucket's 15 MB limit, enforced at pick time: an oversize PDF would upload-
  // fail forever with synced = 0 and the owner would never be told.
  it('rejects a PDF over the bucket limit', () => {
    const screened = screenPickedFiles([
      page({ pickedMimeType: 'application/pdf', fileSizeBytes: VET_DOCUMENT_MAX_BYTES + 1 }),
      page({ pickedMimeType: 'application/pdf', fileSizeBytes: VET_DOCUMENT_MAX_BYTES }),
    ]);
    expect(screened.accepted).toHaveLength(1);
    expect(screened.rejectedSize).toBe(1);
  });

  // Images are re-encoded to ~1600px/q75 before upload, so their picked size says
  // nothing about what reaches Storage — rejecting on it would refuse a photo that
  // would have uploaded fine.
  it('does not size-reject an image, however large the original', () => {
    const screened = screenPickedFiles([
      page({ pickedMimeType: 'image/heic', fileSizeBytes: 60 * 1024 * 1024 }),
    ]);
    expect(screened.accepted).toHaveLength(1);
    expect(screened.rejectedSize).toBe(0);
  });

  it('never throws on a pick with no supported file at all', () => {
    const screened = screenPickedFiles([page({ pickedMimeType: 'video/mp4' })]);
    expect(screened.accepted).toEqual([]);
    expect(screened.rejectedType).toBe(1);
  });
});

// ── Dates ────────────────────────────────────────────────────────────────────

describe('vetDocumentDateFromPages', () => {
  it('uses page one’s EXIF date, in the DEVICE-LOCAL calendar', () => {
    // 2026-07-14T09:30 local — the local reading is the point: a UTC read would
    // file an evening capture under tomorrow for every owner east of Greenwich.
    const iso = new Date(2026, 6, 14, 9, 30).toISOString();
    expect(vetDocumentDateFromPages([page({ exifIso: iso })], NOW)).toBe('2026-07-14');
  });

  it('falls back to today when no page carries a date', () => {
    const today = new Date(2026, 6, 26, 8, 0);
    expect(vetDocumentDateFromPages([page()], today)).toBe('2026-07-26');
  });

  it('ignores pages 2..n — one document has one date', () => {
    const p1 = page({ exifIso: new Date(2026, 6, 14, 9, 0).toISOString() });
    const p2 = page({ exifIso: new Date(2026, 0, 2, 9, 0).toISOString() });
    expect(vetDocumentDateFromPages([p1, p2], NOW)).toBe('2026-07-14');
  });
});

// ── buildVetDocumentRows ─────────────────────────────────────────────────────

describe('buildVetDocumentRows', () => {
  it('defaults everything capture is forbidden to ask about (D11 / D7)', () => {
    const [row] = build([page()]);
    expect(row.kind).toBe('other');
    expect(row.title).toBeNull();
    expect(row.notes).toBeNull();
    // D7: an upload may never mint or point at a visit from this direction.
    expect(row.vet_visit_id).toBeNull();
    expect(row.synced).toBe(0);
    expect(row.deleted_at).toBeNull();
    expect(row.document_date).toBe('2026-07-26');
  });

  // The VF-1 contract: every image is re-encoded to JPEG, so the row must say
  // image/jpeg and the key must end .jpg whatever the camera roll handed over.
  it('normalises a HEIC pick to the JPEG the app actually stores', () => {
    const [row] = build([page({ pickedMimeType: 'image/heic' })]);
    expect(row.mime_type).toBe('image/jpeg');
    expect(row.storage_path).toBe(`${PET}/doc-1.jpg`);
  });

  it('keeps a PDF as picked and records its size', () => {
    const [row] = build([page({ pickedMimeType: 'application/pdf', fileSizeBytes: 400_000 })]);
    expect(row.mime_type).toBe('application/pdf');
    expect(row.storage_path).toBe(`${PET}/doc-1.pdf`);
    expect(row.file_size_bytes).toBe(400_000);
  });

  // The stored object is the re-encode, not the original, so the original's size
  // would describe a file that never exists.
  it('records no size for an image', () => {
    const [row] = build([page({ fileSizeBytes: 5_000_000 })]);
    expect(row.file_size_bytes).toBeNull();
  });

  it('keys every object under the pet prefix and names the local copy after it', () => {
    const rows = build([page(), page()]);
    expect(rows.map((r) => r.storage_path)).toEqual([`${PET}/doc-1.jpg`, `${PET}/doc-2.jpg`]);
    expect(rows.map((r) => r.local_uri)).toEqual([
      'file:///documents/attachments/doc-1.jpg',
      'file:///documents/attachments/doc-2.jpg',
    ]);
  });

  // §4.4 + §5.1: N pages are ONE document, and the group id is the cover's own id.
  it('groups multi-select pages into one document, in order', () => {
    const rows = build([page(), page(), page()]);
    expect(new Set(rows.map((r) => r.document_group_id)).size).toBe(1);
    expect(rows[0].document_group_id).toBe(rows[0].id);
    expect(rows.map((r) => r.page_index)).toEqual([0, 1, 2]);
    // All pages share the document's date.
    expect(new Set(rows.map((r) => r.document_date)).size).toBe(1);
  });

  it('appends to an existing group without re-dating or re-grouping it', () => {
    const first = build([page({ exifIso: new Date(2026, 6, 14, 9, 0).toISOString() })]);
    const appended = buildVetDocumentRows({
      petId: PET,
      source: 'camera',
      pages: [page()],
      groupId: first[0].document_group_id,
      documentDate: first[0].document_date,
      startPageIndex: 1,
      now: NOW,
      newId: idFactory('page2'),
      persistFile: (src, name) => `file:///documents/attachments/${name}`,
    });
    expect(appended[0].document_group_id).toBe(first[0].document_group_id);
    expect(appended[0].page_index).toBe(1);
    expect(appended[0].document_date).toBe('2026-07-14');
    // Its own id and its own object, though — a page is still a row.
    expect(appended[0].id).not.toBe(first[0].id);
    expect(appended[0].storage_path).not.toBe(first[0].storage_path);
  });

  it('records the provenance it was given (D10)', () => {
    expect(build([page()], { source: 'camera' })[0].source).toBe('camera');
    expect(build([page()], { source: 'files' })[0].source).toBe('files');
  });

  // B-546 — the PM ruled option (b): store the filename AND leave the row
  // untitled. Both halves are asserted together on purpose, because storing it as
  // the title is the tempting shortcut and it would cost the row its Name pill
  // forever (title IS NULL is the only test that can tell a defaulted row from a
  // named one).
  it('records a picked filename WITHOUT claiming the row is named', () => {
    const [row] = build(
      [page({ pickedMimeType: 'application/pdf', fileName: 'Pixel-CBC-2026-07-14.pdf' })],
      { source: 'files' },
    );
    expect(row.source_filename).toBe('Pixel-CBC-2026-07-14.pdf');
    expect(row.title).toBeNull();
  });

  it('sanitises the filename on the way in', () => {
    const [row] = build([page({ fileName: 'Downloads/labs/ CBC.pdf ' })], { source: 'files' });
    expect(row.source_filename).toBe('CBC.pdf');
  });

  it('leaves source_filename null when the pick carried no name (camera / Photos)', () => {
    expect(build([page()])[0].source_filename).toBeNull();
  });

  // A Files multi-pick is several documents, each its own row — so each keeps its
  // OWN name. Fusing them onto the cover's name is exactly the bug B-546 fixes,
  // one level up.
  it('gives each page its own filename rather than the cover\u2019s', () => {
    const rows = build([
      page({ pickedMimeType: 'application/pdf', fileName: 'cbc.pdf' }),
      page({ pickedMimeType: 'application/pdf', fileName: 'chem.pdf' }),
    ], { source: 'files' });
    expect(rows.map((r) => r.source_filename)).toEqual(['cbc.pdf', 'chem.pdf']);
  });

  // Past screenPickedFiles this is a bug, not owner input — so it must be loud.
  it('throws rather than guessing on an unsupported type', () => {
    expect(() => build([page({ pickedMimeType: 'text/csv' })])).toThrow(/unsupported document type/);
  });
});

// ── D13 duplicate-on-add ─────────────────────────────────────────────────────

describe('duplicateVetDocumentRowsForPet', () => {
  const source = build([page(), page()]);

  it('files a genuinely independent copy under the other pet', () => {
    const copies = duplicateVetDocumentRowsForPet(source, {
      petId: 'pet-2',
      now: NOW,
      newId: idFactory('copy'),
      persistFile: (src, name) => `file:///documents/attachments/${name}`,
    });
    expect(copies.map((r) => r.pet_id)).toEqual(['pet-2', 'pet-2']);
    // New ids, new keys under the OTHER pet's prefix (the CHECK + Storage policy
    // boundary), and its own local file — not a second row pointing at the first
    // one's object, which is what deleting one would then destroy.
    expect(copies.map((r) => r.id)).toEqual(['copy-1', 'copy-2']);
    expect(copies.map((r) => r.storage_path)).toEqual(['pet-2/copy-1.jpg', 'pet-2/copy-2.jpg']);
    expect(copies.map((r) => r.local_uri)).toEqual([
      'file:///documents/attachments/copy-1.jpg',
      'file:///documents/attachments/copy-2.jpg',
    ]);
    expect(copies.every((r) => r.synced === 0)).toBe(true);
  });

  it('keeps the page grouping and order intact', () => {
    const copies = duplicateVetDocumentRowsForPet(source, {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: (s, n) => n,
    });
    expect(new Set(copies.map((r) => r.document_group_id)).size).toBe(1);
    expect(copies[0].document_group_id).toBe(copies[0].id);
    expect(copies.map((r) => r.page_index)).toEqual([0, 1]);
  });

  // A Files multi-pick is several documents; copying it must not fuse them.
  it('preserves distinct groups across a multi-document capture', () => {
    const a = build([page({ pickedMimeType: 'application/pdf' })], { newId: idFactory('a') });
    const b = build([page({ pickedMimeType: 'application/pdf' })], { newId: idFactory('b') });
    const copies = duplicateVetDocumentRowsForPet([...a, ...b], {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: (s, n) => n,
    });
    expect(new Set(copies.map((r) => r.document_group_id)).size).toBe(2);
  });

  // A visit belongs to one pet; the server's same-pet trigger rejects a document
  // whose linked visit is another pet's, so the link cannot travel with the copy.
  it('drops any visit link', () => {
    const linked: LocalVetDocument[] = [{ ...source[0], vet_visit_id: 'visit-1' }];
    const [copy] = duplicateVetDocumentRowsForPet(linked, {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: (s, n) => n,
    });
    expect(copy.vet_visit_id).toBeNull();
  });

  // A hydrated row has no local bytes to copy; pointing the copy at a file that
  // does not exist would render an honest-looking row with a dead thumbnail.
  it('leaves local_uri empty when the source row has no local file', () => {
    const hydrated: LocalVetDocument[] = [{ ...source[0], local_uri: '' }];
    const [copy] = duplicateVetDocumentRowsForPet(hydrated, {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: () => 'file:///should-not-be-used',
    });
    expect(copy.local_uri).toBe('');
  });

  it('carries the owner’s metadata over — it is the same document', () => {
    const named: LocalVetDocument[] = [{
      ...source[0], title: 'Rabies certificate', kind: 'vaccination', document_date: '2026-01-08',
    }];
    const [copy] = duplicateVetDocumentRowsForPet(named, {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: (s, n) => n,
    });
    expect(copy.title).toBe('Rabies certificate');
    expect(copy.kind).toBe('vaccination');
    expect(copy.document_date).toBe('2026-01-08');
  });

  // B-546 — the copy is the same FILE, filed twice. A certificate added to both
  // cats arrived under one name and should read the same on both rows; unlike the
  // visit link, nothing about it belongs to one pet.
  it('carries the source filename to the copy', () => {
    const named: LocalVetDocument[] = [{ ...source[0], source_filename: 'rabies-2026.pdf' }];
    const [copy] = duplicateVetDocumentRowsForPet(named, {
      petId: 'pet-2', now: NOW, newId: idFactory('copy'), persistFile: (s, n) => n,
    });
    expect(copy.source_filename).toBe('rabies-2026.pdf');
  });
});

// ── Copy ─────────────────────────────────────────────────────────────────────

describe('the saved moment’s copy (D2-r2)', () => {
  it('names the pet and promises the offline truth', () => {
    const copy = savedMomentCopy('Pixel', build([page()]), NOW);
    expect(copy.headline).toBe('Saved to Pixel’s Vet Files');
    expect(copy.offlineLine).toBe('On this phone now — backs up when you’re online');
    expect(copy.cardTitle).toBe('Document — Jul 26');
    // One page, one document: nothing to add.
    expect(copy.cardSub).toBeNull();
  });

  it('counts pages for a grouped document', () => {
    expect(savedMomentCopy('Pixel', build([page(), page(), page()]), NOW).cardSub).toBe('3 pages');
  });

  it('counts documents when one capture filed several', () => {
    const a = build([page({ pickedMimeType: 'application/pdf' })], { newId: idFactory('a') });
    const b = build([page({ pickedMimeType: 'application/pdf' })], { newId: idFactory('b') });
    expect(savedMomentCopy('Pixel', [...a, ...b], NOW).cardSub).toBe('2 documents');
  });

  it('renders the year on an older document date', () => {
    const rows = build([page({ exifIso: new Date(2025, 11, 19, 10, 0).toISOString() })]);
    expect(savedMomentCopy('Pixel', rows, NOW).cardTitle).toBe('Document — Dec 19, 2025');
  });
});

describe('the add sheet’s copy (D1-r2)', () => {
  it('names the pet in the title', () => {
    expect(addSheetTitle('Pixel')).toBe('Add to Pixel’s Vet Files');
  });

  it('offers exactly the three ruled sources, camera first', () => {
    expect(ADD_SOURCE_ROWS.map((r) => r.source)).toEqual(['camera', 'photo_library', 'files']);
  });

  // The round-2 fix: a camera row that read as single-shot beside a Photos row that
  // promised a batch. Both must carry the grouping promise.
  it('promises page grouping on both photo rows', () => {
    const [camera, photos] = ADD_SOURCE_ROWS;
    expect(camera.title).toBe('Take photos');
    expect(camera.subtitle).toMatch(/stay together/);
    expect(photos.subtitle).toMatch(/stay together/);
  });
});

describe('D13 labels', () => {
  it('reads as an offer, then as a fact', () => {
    expect(alsoAddLabel('Juniper')).toBe('Also add to Juniper’s Vet Files');
    expect(alsoAddedLabel('Juniper')).toBe('Added to Juniper’s Vet Files');
  });
});

describe('rejectedPickMessage', () => {
  it('says nothing when nothing was skipped', () => {
    expect(rejectedPickMessage({ accepted: [], rejectedType: 0, rejectedSize: 0 })).toBeNull();
  });

  it('is specific and singular/plural correct, and never blames the saved ones', () => {
    expect(rejectedPickMessage({ accepted: [], rejectedType: 1, rejectedSize: 0 }))
      .toBe('One file wasn’t a photo or a PDF, so it was skipped.');
    expect(rejectedPickMessage({ accepted: [], rejectedType: 0, rejectedSize: 2 }))
      .toBe('2 PDFs were over 15 MB and were skipped.');
    const both = rejectedPickMessage({ accepted: [], rejectedType: 2, rejectedSize: 1 }) ?? '';
    expect(both).toContain('2 files weren’t photos or PDFs');
    expect(both).toContain('One PDF was over 15 MB');
  });

  it('carries no exclamation marks (nyx-voice)', () => {
    const messages = [
      rejectedPickMessage({ accepted: [], rejectedType: 1, rejectedSize: 1 }),
      savedMomentCopy('Pixel', build([page()]), NOW).headline,
      ...ADD_SOURCE_ROWS.map((r) => r.subtitle),
    ];
    for (const m of messages) expect(m).not.toContain('!');
  });
});

// ── insertVetDocumentRows ────────────────────────────────────────────────────

// A thin expo-sqlite stand-in over node:sqlite: enough of the surface for the
// insert (runAsync + withTransactionAsync) so the real column list is executed
// against the real DDL. A column that drifts from localSchema.ts fails here.
function memoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  return {
    handle: db,
    runAsync: async (sql: string, params: unknown[] = []) => {
      db.prepare(sql).run(...(params as never[]));
    },
    withTransactionAsync: async (fn: () => Promise<void>) => { await fn(); },
    getAllAsync: async <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as unknown as T[],
  };
}

describe('insertVetDocumentRows', () => {
  it('writes every column of a grouped capture against the production DDL', async () => {
    const db = memoryDb();
    (getDb as jest.Mock).mockReturnValue(db);
    const rows = build([page(), page(), page()]);

    await insertVetDocumentRows(rows);

    const stored = await db.getAllAsync<LocalVetDocument>(
      'SELECT * FROM vet_documents ORDER BY page_index',
    );
    expect(stored).toHaveLength(3);
    expect(stored[0].pet_id).toBe(PET);
    expect(stored[0].kind).toBe('other');
    expect(stored[0].title).toBeNull();
    expect(stored[0].document_group_id).toBe(rows[0].id);
    expect(stored[0].storage_path).toBe(`${PET}/doc-1.jpg`);
    expect(stored[0].mime_type).toBe('image/jpeg');
    expect(stored[0].local_uri).toBe('file:///documents/attachments/doc-1.jpg');
    // Unsynced, so the push queue picks it up — and the object upload with it.
    expect(stored.every((r) => r.synced === 0)).toBe(true);
    db.handle.close();
  });

  // B-546 — the column has to survive the INSERT, not just the builder. This runs
  // against BASE_SCHEMA_SQL, so a column added to the row type and forgotten in the
  // statement's column list fails here rather than on a device.
  it('persists the source filename through the real INSERT', async () => {
    const db = memoryDb();
    (getDb as jest.Mock).mockReturnValue(db);
    const rows = build([page({ pickedMimeType: 'application/pdf', fileName: 'cbc.pdf' })], {
      source: 'files',
    });

    await insertVetDocumentRows(rows);

    const [stored] = await db.getAllAsync<LocalVetDocument>('SELECT * FROM vet_documents');
    expect(stored.source_filename).toBe('cbc.pdf');
    expect(stored.title).toBeNull();
    db.handle.close();
  });

  it('is a no-op on an empty capture', async () => {
    const db = memoryDb();
    (getDb as jest.Mock).mockReturnValue(db);
    await insertVetDocumentRows([]);
    expect(await db.getAllAsync('SELECT * FROM vet_documents')).toHaveLength(0);
    db.handle.close();
  });
});
