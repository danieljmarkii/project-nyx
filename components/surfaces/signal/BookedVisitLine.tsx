import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { theme } from '../../../constants/theme';
import type { BookedVisitRowLine } from '../../../lib/careState';
import { ThemedText } from '../../ui/ThemedText';

// CUL-2652 (mock https://claude.ai/artifact/U29JENLeZ3VeUqRBSmo3CL, frames 2 and 3): the booked
// visit on a Signal row, a calendar glyph and one line. Display only: the row stays one door and
// writes nothing (Home's write classes, C-33). The glyph is decorative; the row's label says it.

const GLYPH = theme.textMD;

export function BookedVisitLine({ line }: { line: BookedVisitRowLine }) {
  // The quiet line stands where the ask stood, in primary ink (the mock's #0A0A0A); the call and
  // fact lines sit under an ask that still speaks, in secondary ink so the ask stays the loudest.
  const tone = line.kind === 'quiet' ? styles.textQuiet : styles.textUnder;
  return (
    <View style={styles.row} testID={`signal-row-booked-${line.kind}`}>
      <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" fill="none" accessible={false} style={styles.glyph}>
        <Rect x={3} y={5} width={18} height={16} rx={2} stroke={theme.colorTextSecondary} strokeWidth={2} />
        <Path d="M3 10h18M8 3v4M16 3v4" stroke={theme.colorTextSecondary} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <ThemedText style={[styles.text, tone]} testID="signal-row-booked-text">
        {line.text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space1,
    paddingTop: theme.spaceMicro,
  },
  glyph: {
    marginTop: theme.spaceMicro,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
  },
  textQuiet: {
    color: theme.colorTextPrimary,
  },
  textUnder: {
    color: theme.colorTextSecondary,
  },
});
