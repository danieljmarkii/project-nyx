import { captureVisitResults, VISIT_RESULTS_KIND } from './visitPaperwork';
import { pickVetImages, pickVetPdfs } from './vetDocumentPickers';
import { insertVetDocumentRows } from './vetDocumentCapture';
import { syncPendingVetDocuments } from './sync';

// CUL-2759: *Results arrived?* files results under the visit the owner is standing on,
// typed as results, in one insert. The real row builder runs; only the camera, the
// database write and the push are stubbed.
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./storage', () => ({
  compressForUpload: jest.fn(),
  persistCapture: jest.fn((uri: string) => uri),
}));
jest.mock('./vetDocumentPickers', () => ({ pickVetImages: jest.fn(), pickVetPdfs: jest.fn() }));
jest.mock('./vetDocumentCapture', () => ({
  ...jest.requireActual('./vetDocumentCapture'),
  insertVetDocumentRows: jest.fn(() => Promise.resolve()),
}));
jest.mock('./sync', () => ({ syncPendingVetDocuments: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));

const pick = pickVetImages as jest.MockedFunction<typeof pickVetImages>;
const pickPdfs = pickVetPdfs as jest.MockedFunction<typeof pickVetPdfs>;
const insert = insertVetDocumentRows as jest.MockedFunction<typeof insertVetDocumentRows>;

beforeEach(() => jest.clearAllMocks());

describe('captureVisitResults', () => {
  it('writes every page linked to the visit and typed as results, untitled, then pushes', async () => {
    pick.mockResolvedValue([
      { localUri: 'file:///p1.jpg', pickedMimeType: 'image/jpeg', fileSizeBytes: 1000 },
      { localUri: 'file:///p2.jpg', pickedMimeType: 'image/jpeg', fileSizeBytes: 1000 },
    ]);
    const out = await captureVisitResults('pet-a', 'visit-1');

    expect(pick).toHaveBeenCalledWith('camera');
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.vet_visit_id).toBe('visit-1');
      expect(row.pet_id).toBe('pet-a');
      expect(row.kind).toBe(VISIT_RESULTS_KIND);
      expect(VISIT_RESULTS_KIND).toBe('lab_result');
      // A stored title could not be told from one the owner typed.
      expect(row.title).toBeNull();
    }
    // One document: the pages share a group, and the cover names it.
    expect(new Set(rows.map((r) => r.document_group_id)).size).toBe(1);
    expect(out).toEqual({ groupId: rows[0].document_group_id, skipped: null });
    expect(syncPendingVetDocuments).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the camera is cancelled', async () => {
    pick.mockResolvedValue([]);
    expect(await captureVisitResults('pet-a', 'visit-1')).toEqual({ groupId: null, skipped: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('writes nothing, and says why, when every page is refused', async () => {
    pick.mockResolvedValue([{ localUri: 'file:///clip.mov', pickedMimeType: 'video/quicktime', fileSizeBytes: 1000 }]);
    const out = await captureVisitResults('pet-a', 'visit-1');
    expect(out.groupId).toBeNull();
    expect(out.skipped).toEqual(expect.any(String));
    expect(insert).not.toHaveBeenCalled();
  });

  it('files each PDF as its own document, every one under the visit and typed as results', async () => {
    pickPdfs.mockResolvedValue([
      { localUri: 'file:///cbc.pdf', pickedMimeType: 'application/pdf', fileSizeBytes: 1000, fileName: 'cbc.pdf' },
      { localUri: 'file:///culture.pdf', pickedMimeType: 'application/pdf', fileSizeBytes: 1000, fileName: 'culture.pdf' },
    ]);
    await captureVisitResults('pet-a', 'visit-1', 'files');
    expect(pick).not.toHaveBeenCalled();
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.document_group_id)).size).toBe(2);
    for (const row of rows) {
      expect(row.vet_visit_id).toBe('visit-1');
      expect(row.kind).toBe('lab_result');
      expect(row.source).toBe('files');
    }
  });
});
