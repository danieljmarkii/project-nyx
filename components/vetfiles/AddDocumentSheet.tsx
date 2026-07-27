import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, FileText, Images } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SheetShell } from './SheetShell';
import {
  ADD_SOURCE_ROWS,
  ADD_SHEET_SUBTITLE,
  addSheetTitle,
} from '../../lib/vetDocumentCapture';
import type { VetDocumentSource } from '../../lib/vetDocuments';

interface Props {
  visible: boolean;
  petName: string;
  onCancel: () => void;
  onPick: (source: VetDocumentSource) => void;
}

const ICONS: Record<VetDocumentSource, typeof Camera> = {
  camera: Camera,
  photo_library: Images,
  files: FileText,
};

// D1-r2 — the add sheet. Three sources, one tap each, and nothing else.
//
// The subtitle states the contract the whole flow rests on ("Saved right away — you
// can name things later"), because the sheet is the last moment an owner in a
// clinic parking lot is deciding whether this is worth doing. Every row's subtitle
// is a promise about what happens, not a description of the button: both photo rows
// promise page grouping (§4.4), and the Files row names where PDFs actually come
// from (email, a clinic portal) rather than saying "documents".
//
// No kind chips, no title field, no visit picker — D11 and D7 respectively. The
// only question this sheet may ask is "from where".
export function AddDocumentSheet({ visible, petName, onCancel, onPick }: Props) {
  return (
    <SheetShell
      visible={visible}
      onClose={onCancel}
      title={addSheetTitle(petName)}
      subtitle={ADD_SHEET_SUBTITLE}
    >
      <View style={styles.rows}>
        {ADD_SOURCE_ROWS.map((row, i) => {
          const Icon = ICONS[row.source];
          return (
            <TouchableOpacity
              key={row.source}
              style={[styles.row, i > 0 && styles.rowDivided]}
              onPress={() => onPick(row.source)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${row.title}. ${row.subtitle}`}
            >
              <View style={styles.icon}>
                <Icon size={17} color={theme.colorAccentInk} strokeWidth={1.9} />
              </View>
              <View style={styles.text}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSub}>{row.subtitle}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.cancel}
        onPress={onCancel}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  rows: {
    marginTop: theme.space2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    // Comfortably past the 44pt floor on its own, without hitSlop — these are the
    // feature's primary actions, not affordances tucked into a row.
    minHeight: 58,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  rowSub: {
    fontSize: theme.textXS,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  cancelText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
});
