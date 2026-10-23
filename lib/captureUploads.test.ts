import { uploadedPhotoPath, uploadedPhotoPaths } from './captureUploads';

const front = { localUri: 'file:///front.jpg', storagePath: 'f1/0-front.jpg' };
const ingredients = { localUri: 'file:///ing.jpg', storagePath: 'f1/1-ingredients.jpg' };
const barcode = { localUri: 'file:///bar.jpg', storagePath: 'f1/2-barcode.jpg' };

describe('uploadedPhotoPaths', () => {
  it('records nothing when no upload finished (offline)', () => {
    expect(uploadedPhotoPaths([front, ingredients, barcode], new Set())).toEqual([]);
  });

  it('records only the photos whose upload finished, in slot order', () => {
    const done = new Set([barcode.localUri, front.localUri]);
    expect(uploadedPhotoPaths([front, ingredients, barcode], done)).toEqual([
      'f1/0-front.jpg',
      'f1/2-barcode.jpg',
    ]);
  });

  it('skips empty slots', () => {
    expect(uploadedPhotoPaths([front, null, undefined], new Set([front.localUri]))).toEqual(['f1/0-front.jpg']);
  });

  it('a retake on the same slot path is not covered by the earlier upload', () => {
    const retake = { localUri: 'file:///front-2.jpg', storagePath: front.storagePath };
    expect(uploadedPhotoPaths([retake], new Set([front.localUri]))).toEqual([]);
  });
});

describe('uploadedPhotoPath', () => {
  it('is the path once uploaded, null otherwise', () => {
    expect(uploadedPhotoPath(front, new Set([front.localUri]))).toBe('f1/0-front.jpg');
    expect(uploadedPhotoPath(front, new Set())).toBeNull();
    expect(uploadedPhotoPath(null, new Set([front.localUri]))).toBeNull();
  });
});
