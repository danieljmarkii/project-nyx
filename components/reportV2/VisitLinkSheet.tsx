import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colorRoles, theme } from '../../constants/theme';
import { Divider } from '../ui/Divider';
import { ThemedText } from '../ui/ThemedText';
import {
  NOT_FOR_A_VISIT,
  PICKER_NOTE,
  PICKER_TITLE,
  sameTarget,
  type VisitLinkOption,
  type VisitLinkTarget,
} from '../../lib/reportVisitLink';

// The visit a saved report was for (Vet report v2 PR-22, CUL-2302; spec §11.3, GAP-28).
//
// One tap files it: a row is the whole answer, so there is no second confirm (Principle 1). The
// current choice reads as checked. "Not for a visit" is always offered, and is checked for a copy
// filed under nothing, so a copy made for no visit can be filed later and a mis-filed one undone.
//
// This sheet WRITES NOTHING. It hands the choice back; the host saves it and closes the sheet.

interface Props {
  options: readonly VisitLinkOption[];
  current: VisitLinkTarget | null;
  /** Shown in place of the list when the pet has no visit or booking (Principle 5). */
  emptyText: string;
  onPick: (target: VisitLinkTarget | null) => void;
  onClose: () => void;
}

export function VisitLinkSheet({ options, current, emptyText, onPick, onClose }: Props) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} accessibilityViewIsModal>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" testID="visit-link-cancel">
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Visit</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText style={styles.title}>{PICKER_TITLE}</ThemedText>
          <ThemedText style={styles.note}>{PICKER_NOTE}</ThemedText>
          <Divider style={styles.divider} />
          {options.length === 0 ? (
            <ThemedText style={styles.note} testID="visit-link-empty">{emptyText}</ThemedText>
          ) : (
            options.map((o) => (
              <Row
                key={`${o.target.kind}:${o.target.id}`}
                primary={o.primary}
                secondary={o.secondary}
                checked={sameTarget(o.target, current)}
                onPress={() => onPick(o.target)}
                testID={`visit-link-${o.target.kind}-${o.target.id}`}
              />
            ))
          )}
          <Divider style={styles.divider} />
          <Row
            primary={NOT_FOR_A_VISIT}
            secondary=""
            checked={current === null}
            onPress={() => onPick(null)}
            testID="visit-link-none"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Row({
  primary,
  secondary,
  checked,
  onPress,
  testID,
}: {
  primary: string;
  secondary: string;
  checked: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      testID={testID}
    >
      <View style={[styles.radio, checked && styles.radioOn]} />
      <View style={styles.rowText}>
        <ThemedText style={styles.primary}>{primary}</ThemedText>
        {secondary.length > 0 ? <ThemedText style={styles.secondary}>{secondary}</ThemedText> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorSurface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: { fontSize: theme.textLG, fontWeight: theme.weightMedium, color: theme.colorNeutralDark },
  headerSpacer: { width: 56 },
  cancelText: { fontSize: theme.textMD, color: theme.colorTextSecondary },
  body: { padding: theme.space3, paddingBottom: theme.space6, gap: theme.space1 },
  title: { fontSize: theme.textXL, fontWeight: theme.weightSemibold, color: theme.colorNeutralDark },
  note: { fontSize: theme.textSM, lineHeight: theme.lineHeightBody, color: theme.colorTextSecondary },
  divider: { marginVertical: theme.space2 },
  // Rows are flush and already at the 44pt floor, so they take no hitSlop (C-5).
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space2, minHeight: theme.hitTarget, paddingVertical: theme.space1 },
  rowText: { flex: 1 },
  primary: { fontSize: theme.textMD, fontWeight: theme.weightMedium, color: theme.colorTextPrimary },
  secondary: { fontSize: theme.textSM, color: theme.colorTextSecondary },
  // The trial reason sheet's radio (EndTrialReasonSheet), so the app's choice lists look alike.
  radio: { width: 20, height: 20, borderRadius: theme.radiusFull, borderWidth: 2, borderColor: theme.colorBorderStrong },
  radioOn: { borderColor: colorRoles.selected.edge, borderWidth: 6 },
});
