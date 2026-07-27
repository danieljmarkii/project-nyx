import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

// The ⋯ overflow menu (mock E-img-r2, shown open): Rename and Delete.
//
// Two secondary actions is exactly the case Header's own note carves out — it
// ships no built-in ⋯ *because* a single secondary action belongs inline, and a
// screen with several passes its own trigger through `right`. This is that trigger's
// menu, and the floor below stays reserved for Share, which is the action this
// screen exists for (§4.3: the single most important affordance after viewing).
//
// **The Delete sub-line is not decoration.** AC 5 requires the delete copy to name
// the 30-day window, and it requires that window to actually exist — the sentence
// is what makes the deletion feel survivable enough to use, and a promise of
// recovery with no recovery surface behind it would be worse than a bare "Delete".
// The Recently deleted list in the library is the other half; change neither alone.
//
// Rendered as a `Modal` rather than an absolutely-positioned View so a tap anywhere
// dismisses it, including on the scroll content underneath — an overflow menu that
// only closes via its own items is a trap on a screen the owner may have opened by
// accident.
export function DocumentMoreMenu({ visible, onClose, onRename, onDelete }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Anchored under the header's ⋯, mirroring the mock's popover position.
            insets.top keeps it under the trigger on a notched device rather than
            at a hardcoded offset that lands over the status bar on some phones. */}
        <View style={[styles.menu, { top: insets.top + 44 }]}>
          <TouchableOpacity
            style={styles.item}
            onPress={onRename}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.itemText}>Rename</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.item}
            onPress={onDelete}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete. Kept for 30 days — undo from the library."
          >
            <Text style={[styles.itemText, styles.destructive]}>Delete</Text>
            <Text style={styles.itemSub}>Kept for 30 days — undo from the library</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // No scrim colour: an overflow menu is a light-touch affordance, and dimming
    // the whole screen for two items reads as a decision that matters more than
    // this one does.
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    right: theme.space2,
    width: 208,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
    // Deliberately heavier than shadows.sm: this floats over content, and the
    // separation is what stops it reading as part of the card underneath.
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
  },
  itemText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  destructive: {
    color: theme.colorDestructive,
  },
  itemSub: {
    fontSize: theme.textXS,
    lineHeight: 15,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
});
