import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { useSheetCap } from '../../hooks/useLayoutClass';
import { usePendingReportKeeps, type KeepMissNoticeState } from '../../hooks/usePendingReportKeeps';

// The "report copy wasn't saved" notice (CUL-2522), drawn by the app rather than the system so a
// sign-out can close it (CUL-2576). Mounted once in the root layout, beside the other hosts. The
// shape is the floating confirm card (ArchivePetSheet, multi-pet mock B4) with its one action: the
// notice asks nothing, it says what happened and OK dismisses it.
export function PendingReportKeepsHost() {
  const { notice, dismiss } = usePendingReportKeeps();
  return <KeepMissSheet notice={notice} onDismiss={dismiss} />;
}

export function KeepMissSheet({ notice, onDismiss }: { notice: KeepMissNoticeState | null; onDismiss: () => void }) {
  const sheetCap = useSheetCap(theme.space2);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={notice !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {/* No tap-away: the rows go only on OK, so a stray tap never clears an unread notice. */}
        <View style={styles.scrim} />
        <View
          style={[styles.card, { marginBottom: insets.bottom + theme.space2 }, sheetCap]}
          accessibilityViewIsModal
        >
          <ThemedText style={styles.title} accessibilityRole="header">{notice?.title ?? ''}</ThemedText>
          <ThemedText style={styles.body}>{notice?.body ?? ''}</ThemedText>
          <PrimaryButton label="OK" onPress={onDismiss} style={styles.okBtn} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  card: {
    marginHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusLarge,
    paddingTop: theme.space3,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space2,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  okBtn: {
    alignSelf: 'stretch',
    marginTop: theme.space2,
  },
});
