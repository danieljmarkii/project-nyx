import {
  uploadedPhotoPath, uploadedPhotoPaths, queuedFoodPhotoPath, foodSlotFilled, foodPathsWith,
} from './captureUploads';

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

// CUL-2704: the food capture's offline photo queue.
describe('queuedFoodPhotoPath', () => {
  it('is its own key, never the slot\'s fixed one, and still ends in the slot', () => {
    const p = queuedFoodPhotoPath('f1', 'front', 'ab12cd34');
    expect(p).toBe('f1/0-qab12cd34-front.jpg');
    expect(p).not.toBe('f1/0-front.jpg');
    expect(foodSlotFilled([p], 'front')).toBe(true);
    expect(queuedFoodPhotoPath('f1', 'barcode', 'x')).toBe('f1/2-qx-barcode.jpg');
  });
});

describe('foodSlotFilled', () => {
  it('reads the slot off the name\'s suffix, as the food page\'s replace does', () => {
    expect(foodSlotFilled(['f1/0-front.jpg'], 'front')).toBe(true);
    expect(foodSlotFilled(['f1/0-front.jpg'], 'ingredients')).toBe(false);
    expect(foodSlotFilled([], 'front')).toBe(false);
    expect(foodSlotFilled(['f1/3-additional.jpg'], 'front')).toBe(false);
  });
});

describe('foodPathsWith', () => {
  it('keeps the front first, whatever order the photos land in', () => {
    expect(foodPathsWith(['f1/1-ingredients.jpg'], 'f1/0-qa-front.jpg'))
      .toEqual(['f1/0-qa-front.jpg', 'f1/1-ingredients.jpg']);
    expect(foodPathsWith(['f1/0-front.jpg', 'f1/3-additional.jpg'], 'f1/2-qb-barcode.jpg'))
      .toEqual(['f1/0-front.jpg', 'f1/2-qb-barcode.jpg', 'f1/3-additional.jpg']);
  });

  it('never drops what the row already lists', () => {
    const held = ['f1/0-front.jpg', 'f1/1-additional.jpg', 'f1/1-ingredients.jpg'];
    expect(foodPathsWith(held, 'f1/2-qc-barcode.jpg')).toEqual([...held, 'f1/2-qc-barcode.jpg']);
  });
});
