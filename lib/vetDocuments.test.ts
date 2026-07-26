import {
  VET_DOCUMENT_KINDS,
  VET_DOCUMENT_SOURCES,
  VET_DOCUMENT_STORED_MIME_TYPES,
  VET_DOCUMENTS_BUCKET,
  buildVetDocumentPath,
  needsObjectUpload,
  prepareVetDocumentUpload,
  resolveVetDocumentMime,
  vetDocumentRowToRemote,
  type LocalVetDocument,
} from './vetDocuments';
import { readFileSync } from 'fs';
import { join } from 'path';

// compressForUpload reaches expo-image-manipulator (a native module), so it is
// mocked. Every assertion below is about WHICH path is taken and what is emitted —
// the re-encode itself is expo's job, not ours.
jest.mock('./storage', () => ({
  compressForUpload: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compressForUpload } = require('./storage') as { compressForUpload: jest.Mock };

beforeEach(() => {
  compressForUpload.mockReset();
});

const PET = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

describe('resolveVetDocumentMime', () => {
  it('normalises every image type to image/jpeg (compressForUpload re-encodes)', () => {
    // The HEIC case is the real one: an iPhone camera roll hands over image/heic,
    // and what lands in Storage is JPEG. A row claiming image/heic would put a
    // lying content-type on the object and send the detail screen down the wrong
    // viewer branch.
    expect(resolveVetDocumentMime('image/jpeg')).toBe('image/jpeg');
    expect(resolveVetDocumentMime('image/png')).toBe('image/jpeg');
    expect(resolveVetDocumentMime('image/heic')).toBe('image/jpeg');
  });

  it('keeps a PDF as application/pdf (D5 store-and-view, no transform exists)', () => {
    expect(resolveVetDocumentMime('application/pdf')).toBe('application/pdf');
  });

  it('is case- and whitespace-insensitive (pickers are inconsistent)', () => {
    expect(resolveVetDocumentMime('  Application/PDF ')).toBe('application/pdf');
    expect(resolveVetDocumentMime('IMAGE/HEIC')).toBe('image/jpeg');
  });

  it('throws on an unsupported type rather than guessing', () => {
    // A guess here produces a row describing an object that was never written —
    // invisible until a vet asks for the file.
    expect(() => resolveVetDocumentMime('video/mp4')).toThrow(/unsupported document type/);
    expect(() => resolveVetDocumentMime('')).toThrow(/unsupported document type/);
  });
});

describe('buildVetDocumentPath', () => {
  it('produces {pet_id}/{document_id}.{ext}', () => {
    expect(buildVetDocumentPath(PET, DOC, 'image/jpeg')).toBe(`${PET}/${DOC}.jpg`);
    expect(buildVetDocumentPath(PET, DOC, 'application/pdf')).toBe(`${PET}/${DOC}.pdf`);
  });

  it('satisfies migration 044 storage_path CHECK by construction', () => {
    // starts_with(storage_path, pet_id || '/') — the ownership boundary. If this
    // ever stops holding, every upload 42501s and every insert 23514s.
    expect(buildVetDocumentPath(PET, DOC, 'image/jpeg').startsWith(`${PET}/`)).toBe(true);
  });

  it('names the object after the DOCUMENT ID so storage_path is unique per row', () => {
    // Migration 044 puts a UNIQUE index on storage_path — one row, one object.
    // Two documents under the same pet must not collide, which is also what makes
    // D13's duplicate-on-add get its own bytes instead of sharing them.
    const a = buildVetDocumentPath(PET, DOC, 'image/jpeg');
    const b = buildVetDocumentPath(PET, '33333333-3333-4333-8333-333333333333', 'image/jpeg');
    expect(a).not.toBe(b);
  });

  it('refuses to mint a traversal key', () => {
    // `{ownPetId}/../{victimPetId}/x.pdf` passes BOTH the starts_with CHECK and the
    // Storage INSERT policy (its first folder segment is an owned pet). Refusing to
    // construct it is the cheapest of the three places to stop it — the other two
    // are scopeVetDocumentPaths and Storage treating keys as opaque.
    expect(() => buildVetDocumentPath(PET, `../${DOC}`, 'image/jpeg')).toThrow(/illegal path segment/);
    expect(() => buildVetDocumentPath(`${PET}/..`, DOC, 'image/jpeg')).toThrow(/illegal path segment/);
    expect(() => buildVetDocumentPath(PET, `a/b`, 'image/jpeg')).toThrow(/illegal path segment/);
    expect(() => buildVetDocumentPath(PET, `a\\b`, 'image/jpeg')).toThrow(/illegal path segment/);
  });

  it('fails fast on a missing segment instead of emitting a leading slash', () => {
    // An empty petId yields '/…', whose first foldername is '' — silently rejected
    // by RLS. A silent RLS rejection is the bug this helper exists to prevent.
    expect(() => buildVetDocumentPath('', DOC, 'image/jpeg')).toThrow(/petId is required/);
    expect(() => buildVetDocumentPath('   ', DOC, 'image/jpeg')).toThrow(/petId is required/);
    expect(() => buildVetDocumentPath(PET, '', 'image/jpeg')).toThrow(/documentId is required/);
  });

  it('rejects a stored mime it has no extension for', () => {
    expect(() =>
      buildVetDocumentPath(PET, DOC, 'image/heic' as never),
    ).toThrow(/unsupported stored mime/);
  });
});

describe('prepareVetDocumentUpload — the no-original-fallback rule (§6.2)', () => {
  it('re-encodes an image through compressForUpload (EXIF/GPS strip)', async () => {
    compressForUpload.mockResolvedValue('file:///cache/compressed.jpg');
    const prep = await prepareVetDocumentUpload('file:///docs/original.heic', 'image/jpeg');
    expect(compressForUpload).toHaveBeenCalledWith('file:///docs/original.heic');
    expect(prep).toEqual({ uri: 'file:///cache/compressed.jpg', mimeType: 'image/jpeg' });
  });

  it('THROWS on a failed re-encode — it never falls back to the original', async () => {
    // The load-bearing divergence from prepareAttachmentUpload, which catches and
    // uploads the original so an attachment is never blocked. §5.2 names that as the
    // hazard to verify against at build: a vet document is a photograph of paperwork
    // carrying a home address, and no urgency beats not leaking where it was taken.
    // The caller leaves the row synced = 0 and retries; the document is on the
    // device throughout.
    compressForUpload.mockRejectedValue(new Error('manipulator failed'));
    await expect(
      prepareVetDocumentUpload('file:///docs/original.jpg', 'image/jpeg'),
    ).rejects.toThrow('manipulator failed');
  });

  it('passes a PDF through untouched without calling the image path', async () => {
    // No PDF transform exists (D5). Acceptable because a PIMS PDF carries no GPS
    // EXIF — revisit if a scanned-to-PDF capture path is ever added.
    const prep = await prepareVetDocumentUpload('file:///docs/labs.pdf', 'application/pdf');
    expect(prep).toEqual({ uri: 'file:///docs/labs.pdf', mimeType: 'application/pdf' });
    expect(compressForUpload).not.toHaveBeenCalled();
  });

  it('throws on a stored mime outside the two canonical ones', async () => {
    // Unreachable via resolveVetDocumentMime; explicit so a hand-written row
    // carrying image/heic fails loudly rather than uploading JPEG bytes under a
    // content-type that lies about them.
    await expect(
      prepareVetDocumentUpload('file:///docs/x.heic', 'image/heic' as never),
    ).rejects.toThrow(/unsupported stored mime/);
    expect(compressForUpload).not.toHaveBeenCalled();
  });
});

describe('needsObjectUpload', () => {
  it('is true for a locally-captured document (durable file:// path)', () => {
    expect(needsObjectUpload('file:///data/attachments/doc-1.jpg')).toBe(true);
  });

  it('is false for a hydrated row (the empty sentinel)', () => {
    // A hydrated row can legitimately be synced = 0 — the owner renamed or
    // soft-deleted it on this device. Only the ROW needs pushing; there are no
    // bytes here, and trying to read them from '' would throw every cycle.
    expect(needsObjectUpload('')).toBe(false);
    expect(needsObjectUpload(null)).toBe(false);
    expect(needsObjectUpload(undefined)).toBe(false);
  });

  it('is false for a non-file scheme (content:// can read as 0 bytes)', () => {
    expect(needsObjectUpload('content://media/1234')).toBe(false);
    expect(needsObjectUpload('https://example.com/x.jpg')).toBe(false);
  });
});

describe('vetDocumentRowToRemote', () => {
  const row: LocalVetDocument = {
    id: DOC,
    pet_id: PET,
    vet_visit_id: null,
    document_group_id: DOC,
    kind: 'lab_result',
    title: null,
    document_date: '2026-07-01',
    notes: null,
    source: 'photo_library',
    local_uri: 'file:///data/attachments/doc.jpg',
    storage_path: `${PET}/${DOC}.jpg`,
    mime_type: 'image/jpeg',
    file_size_bytes: 812345,
    page_index: 0,
    deleted_at: null,
    created_at: '2026-07-26T10:00:00.000Z',
    updated_at: '2026-07-26T10:00:00.000Z',
    synced: 0,
  };

  it('never pushes the device-only columns', () => {
    // local_uri is THIS phone's copy of the bytes and synced is queue state. The
    // server has no column for either; sending them would 400 the upsert.
    const remote = vetDocumentRowToRemote(row) as unknown as Record<string, unknown>;
    expect(remote).not.toHaveProperty('local_uri');
    expect(remote).not.toHaveProperty('synced');
  });

  it('round-trips every server column, including deleted_at', () => {
    // deleted_at riding the payload is what makes a soft delete travel between
    // devices at all — the whole reason this is an LWW table and not insert-only.
    expect(vetDocumentRowToRemote({ ...row, deleted_at: '2026-07-26T12:00:00.000Z' })).toEqual({
      id: DOC,
      pet_id: PET,
      vet_visit_id: null,
      document_group_id: DOC,
      kind: 'lab_result',
      title: null,
      document_date: '2026-07-01',
      notes: null,
      source: 'photo_library',
      storage_path: `${PET}/${DOC}.jpg`,
      mime_type: 'image/jpeg',
      file_size_bytes: 812345,
      page_index: 0,
      deleted_at: '2026-07-26T12:00:00.000Z',
      created_at: '2026-07-26T10:00:00.000Z',
      updated_at: '2026-07-26T10:00:00.000Z',
    });
  });

  it('coerces undefined optionals to null rather than dropping the key', () => {
    // A dropped key in a PostgREST upsert leaves the server value untouched, so
    // clearing a title by editing it away would silently not clear it.
    const sparse = { ...row } as unknown as Record<string, unknown>;
    delete sparse.title;
    delete sparse.notes;
    delete sparse.vet_visit_id;
    delete sparse.file_size_bytes;
    const remote = vetDocumentRowToRemote(sparse as unknown as LocalVetDocument);
    expect(remote.title).toBeNull();
    expect(remote.notes).toBeNull();
    expect(remote.vet_visit_id).toBeNull();
    expect(remote.file_size_bytes).toBeNull();
  });
});

// ── Constants vs. the migration ──────────────────────────────────────────────
// The kind list, the source list and the bucket name exist in TWO places — here
// and in migration 044's CHECK constraints. A drift between them is not a lint
// issue: a kind the client can emit but the DB rejects turns into a 23514 on the
// push flush, which is a TERMINAL error the offline queue cannot retry its way out
// of, on a row the owner believes is saved. Read the migration and compare.
describe('VET_DOCUMENT constants match migration 044', () => {
  const migration = readFileSync(
    join(__dirname, '..', 'supabase', 'migrations', '044_vet_documents.sql'),
    'utf8',
  );

  const checkValues = (constraint: string): string[] => {
    const block = migration.split(`CONSTRAINT ${constraint}`)[1];
    if (!block) throw new Error(`migration 044 has no ${constraint}`);
    const body = block.slice(0, block.indexOf('))'));
    return [...body.matchAll(/'([a-z0-9_/+.-]+)'/g)].map((m) => m[1]);
  };

  it('kind list matches vet_documents_kind_check, in the same order', () => {
    // Order matters beyond equality: §4.5 requires pickers to render the §2
    // continuity-of-care ranking, never alphabetical, and this constant IS that
    // order. Comparing as arrays keeps the migration readable as the same list.
    expect(checkValues('vet_documents_kind_check')).toEqual([...VET_DOCUMENT_KINDS]);
  });

  it('source list matches vet_documents_source_check', () => {
    expect(new Set(checkValues('vet_documents_source_check'))).toEqual(
      new Set(VET_DOCUMENT_SOURCES),
    );
  });

  it('every mime the client can store is accepted by vet_documents_mime_type_check', () => {
    // Deliberately a SUBSET assertion, not equality: the DB CHECK mirrors the
    // bucket's allowed_mime_types (jpeg/png/heic/pdf) so a future store-the-original
    // path cannot upload successfully and then fail to insert, while the client only
    // ever writes the two it can actually produce.
    const allowed = new Set(checkValues('vet_documents_mime_type_check'));
    for (const mime of VET_DOCUMENT_STORED_MIME_TYPES) {
      expect(allowed.has(mime)).toBe(true);
    }
  });

  it('the bucket name matches the one the Storage policies are written against', () => {
    expect(migration).toContain(`bucket_id = '${VET_DOCUMENTS_BUCKET}'`);
  });
});
