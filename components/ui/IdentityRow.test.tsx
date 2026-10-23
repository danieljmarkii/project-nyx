import { identityRowStacks } from './IdentityRow';
import { PHOTO_SLOT_SIZE } from './PhotoSlot';
import { theme } from '../../constants/theme';

// Round §13 and §14: the row holds at 390pt, and stacks the photo over the name on an SE
// (320pt) and at a large text size.
describe('identityRowStacks (CUL-1911)', () => {
  const at = (w: number, scale: number) => identityRowStacks(w, scale, PHOTO_SLOT_SIZE, theme.space3);
  it('a 390pt phone at the default text size keeps the row', () => expect(at(390, 1)).toBe(false));
  it('a 375pt phone keeps the row', () => expect(at(375, 1)).toBe(false));
  it('a 320pt SE stacks', () => expect(at(320, 1)).toBe(true));
  it('the largest text size stacks on any phone', () => expect(at(430, 3.1)).toBe(true));
});
