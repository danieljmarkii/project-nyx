jest.mock('./storage', () => ({
  // The durable copy is a filesystem move the jest mock cannot make; it keeps its name.
  persistCapture: (_uri: string, name: string) => `file:///docs/${name}`,
}));

import { foodPhotoQueueId, queueFoodPhotoUpload, QUEUE_FOOD_PHOTO_SQL } from './foodPhotoQueue';

// CUL-2704: the food capture's offline photo queue write.
describe('queueFoodPhotoUpload', () => {
  it('queues the durable copy, never the picker\'s cache path', async () => {
    const runAsync = jest.fn(async () => undefined);
    await queueFoodPhotoUpload({ runAsync }, {
      id: foodPhotoQueueId('f1', 'ingredients'), foodItemId: 'f1', slot: 'ingredients', ownerUserId: 'u1',
      localUri: 'file:///cache/ImagePicker/ing.jpg', storagePath: 'f1/1-qq1-ingredients.jpg',
    }, '2026-11-11T15:00:00.000Z');
    expect(runAsync).toHaveBeenCalledWith(QUEUE_FOOD_PHOTO_SQL, [
      'f1-ingredients', 'f1', 'ingredients', 'u1', 'file:///docs/food-f1-ingredients.jpg',
      'f1/1-qq1-ingredients.jpg', '2026-11-11T15:00:00.000Z',
    ]);
  });

  it('keys one row per food and slot, so a retried save replaces rather than doubles it', () => {
    expect(foodPhotoQueueId('f1', 'front')).toBe(foodPhotoQueueId('f1', 'front'));
    expect(foodPhotoQueueId('f1', 'front')).not.toBe(foodPhotoQueueId('f1', 'barcode'));
    expect(QUEUE_FOOD_PHOTO_SQL).toMatch(/^INSERT OR REPLACE/);
  });
});
