import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { courseSourceLine, recordNoun } from '../../lib/vetContacts';
import type { CourseVisitSource } from '../../lib/vetVisits';

interface Props {
  source: CourseVisitSource;
  onPress: () => void;
}

// Where a course came from (Vet contacts PR-06, CUL-2749; spec §4.6, mock D5): one row,
// "Started after a call with the vet, Nov 9" or "Started after a visit, Sep 16", a door to that
// record. Without it a course started on the phone reads, on the record, as one the owner
// started alone (Dr. Chen's §1 row).
//
// The row is the only control in its band and holds the 44pt floor itself, with no hitSlop, so
// it reaches nothing beside it (C-5).
export function CourseSourceRow({ source, onPress }: Props) {
  const line = courseSourceLine(source.channel, source.visitedAt);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${line}. Opens the ${recordNoun(source.channel)}`}
      testID={`course-source-${source.visitId}`}
    >
      <View style={styles.main}>
        <ThemedText style={styles.text}>{line}</ThemedText>
      </View>
      <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: theme.hitTarget,
    paddingVertical: theme.space1,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
});
