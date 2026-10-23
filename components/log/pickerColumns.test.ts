import { ONE_COLUMN_FONT_SCALE, pickerColumnsFor } from './pickerColumns';

describe('pickerColumnsFor (the log form round §14)', () => {
  it('keeps two up through the standard text sizes', () => {
    expect(pickerColumnsFor(1)).toBe(2);
    expect(pickerColumnsFor(1.353)).toBe(2); // iOS xxxLarge, the largest standard size
  });

  it('drops to one column from the accessibility sizes up', () => {
    expect(pickerColumnsFor(ONE_COLUMN_FONT_SCALE)).toBe(1);
    expect(pickerColumnsFor(3.1)).toBe(1); // AX5, the size the round drew
  });
});
