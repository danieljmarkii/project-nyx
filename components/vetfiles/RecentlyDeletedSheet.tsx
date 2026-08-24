import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { theme } from '../../constants/theme';
import { SheetShell } from './SheetShell';
import { VetDocumentThumb } from './VetDocumentThumb';
import { VET_DOCUMENT_RECOVERY_DAYS, type DeletedVetDocumentRow } from '../../lib/vetDocumentLibrary';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  visible: boolean;
  rows: DeletedVetDocumentRow[];
  /** Which group is mid-restore, so its button can say so. */
  restoringGroupId?: string | null;
  onClose: () => void;
  onRestore: (groupId: string) => void;
}

// Recently deleted (§8 AC 5) — the other half of the ⋯ menu's promise.
//
// The delete action's copy says "Kept for 30 days — undo from the library", so this
// surface is not a nicety: a stated recovery window with no recovery surface behind
// it is a worse product than an honest permanent delete, because the owner only
// finds out at the moment they need the document back.
//
// A sheet on the library rather than its own route, and reachable only when
// something is IN it (the library renders no entry point otherwise). Two reasons:
// the steady state is empty, and a permanently-visible "Recently deleted" row on a
// screen whose whole job is one calm list is a trash can nobody asked to see.
//
// Every row states its own countdown rather than the sheet stating the rule once.
// The rule is uniform, but the number is not — a document deleted three weeks ago
// and one deleted this morning are in genuinely different situations, and the one
// with two days left is the one an owner needs told.
export function RecentlyDeletedSheet({
  visible, rows, restoringGroupId, onClose, onRestore,
}: Props) {
  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Recently deleted"
      subtitle={`Deleted documents stay here for ${VET_DOCUMENT_RECOVERY_DAYS} days. Restore one and it goes back to the library.`}
    >
      <ScrollView bounces={false} style={styles.scroll}>
        {rows.map((row) => (
          <View key={row.groupId} style={styles.row}>
            <VetDocumentThumb uri={row.localUri || null} isPdf={row.isPdf} />
            <View style={styles.main}>
              <ThemedText style={styles.title} numberOfLines={1}>{row.title}</ThemedText>
              <ThemedText style={styles.meta}>{row.deletedLabel}</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.restore}
              onPress={() => onRestore(row.groupId)}
              disabled={restoringGroupId != null}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${row.title}`}
            >
              <ThemedText style={styles.restoreText}>
                {restoringGroupId === row.groupId ? 'Restoring…' : 'Restore'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    marginTop: theme.space2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  meta: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 3,
  },
  restore: {
    backgroundColor: theme.colorAccentLight,
    borderRadius: theme.radiusFull,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  restoreText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
  },
});
