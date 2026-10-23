import { offerCapturedFood, takeCapturedFood } from './captureHandBack';
import type { PickerFood } from './db';

const food = (id: string): PickerFood => ({
  id, brand: 'B', product_name: 'Rabbit Pâté', format: 'wet_canned', food_type: 'meal', photo_path: null,
});

describe('captureHandBack', () => {
  beforeEach(() => {
    // Drain whatever a previous test left under the keys it used.
    takeCapturedFood('e1');
    takeCapturedFood('e2');
  });

  it('hands the food back to the meal that asked, once', () => {
    offerCapturedFood('e1', food('f1'));
    expect(takeCapturedFood('e1')?.id).toBe('f1');
    expect(takeCapturedFood('e1')).toBeNull();
  });

  it('never hands one meal’s food to another, and keeps it for the right one', () => {
    offerCapturedFood('e1', food('f1'));
    expect(takeCapturedFood('e2')).toBeNull();
    expect(takeCapturedFood('e1')?.id).toBe('f1');
  });

  it('a newer offer replaces an older one', () => {
    offerCapturedFood('e1', food('f1'));
    offerCapturedFood('e2', food('f2'));
    expect(takeCapturedFood('e1')).toBeNull();
    expect(takeCapturedFood('e2')?.id).toBe('f2');
  });

  it('nothing offered, nothing taken', () => {
    expect(takeCapturedFood('e1')).toBeNull();
  });
});
