import { useWindowDimensions } from 'react-native';

// How many tiles a log picker row holds (CUL-1908, the log form round's §14). Two up holds
// an eyebrow and two lines of name at every standard text size and at 320pt; at the
// accessibility sizes (iOS AX1 and up reports a fontScale near 1.65 and above; the app
// sets no cap) two up clips a name to a word or two a line, so the grid drops to one
// column and every name reads whole.
export const ONE_COLUMN_FONT_SCALE = 1.6;

export function pickerColumnsFor(fontScale: number): 1 | 2 {
  return fontScale >= ONE_COLUMN_FONT_SCALE ? 1 : 2;
}

export function usePickerColumns(): 1 | 2 {
  return pickerColumnsFor(useWindowDimensions().fontScale);
}
