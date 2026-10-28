import { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useColumnWidth } from '../../hooks/useLayoutClass';
import { theme } from '../../constants/theme';

// The text column's narrowest comfortable width beside the photo. Under it (an SE at
// 320pt) the row stacks the photo over the name, and so does a large text size, where
// a name and a fact line beside a 96pt photo would wrap a word a line (round §13, §14).
const TEXT_MIN_WIDTH = theme.space6 * 3;
const STACK_FONT_SCALE = 1.6;

/** Whether the row stacks, for a screen this wide at this text size. Pure for the test. */
export function identityRowStacks(
  windowWidth: number, fontScale: number, leadingSize: number, gutter: number,
): boolean {
  const textWidth = windowWidth - gutter * 2 - leadingSize - theme.space2;
  return textWidth < TEXT_MIN_WIDTH || fontScale >= STACK_FONT_SCALE;
}

interface Props {
  /** The photo, at `leadingSize`. */
  leading: ReactNode;
  leadingSize: number;
  /** The screen's side padding, so the row knows the width it has. */
  gutter: number;
  children: ReactNode;
}

/**
 * A pet's identity on the page's own ground (CUL-1911, the profile round's P1): the photo
 * left, the name and one fact line right, no card around them. It reads as the pet's
 * page rather than a settings card, and lets the first record fact onto the first screen.
 */
export function IdentityRow({ leading, leadingSize, gutter, children }: Props) {
  const width = useColumnWidth();
  const { fontScale } = useWindowDimensions();
  const stacked = identityRowStacks(width, fontScale, leadingSize, gutter);
  return (
    <View style={[styles.row, stacked && styles.stacked]} testID="identity-row">
      {leading}
      <View style={styles.text}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space1,
  },
  stacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
});
