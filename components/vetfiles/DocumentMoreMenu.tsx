import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import type { AlsoAddTarget } from '../../lib/vetDocumentCapture';
import { ThemedText } from '../ui/ThemedText';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  /**
   * B-549 — "Add another page". Passed only for an image document (a PDF group is
   * one page per PDF, §4.4, and appending an image page to it would break the
   * group's one-mime assumption); absent ⇒ the item does not render.
   */
  onAddPage?: () => void;
  /**
   * B-547 / D13 — "Also add to {other pet}'s Vet Files", one item per other pet in
   * the household. Empty in a single-pet account, where nothing renders. Same
   * targets and same done-flip as the saved moment (DocumentSavedMoment) so the
   * action reads identically wherever the owner meets it.
   */
  alsoAdd?: AlsoAddTarget[];
  onAlsoAdd?: (petId: string) => void;
  /** A copy / append write is in flight; the additive items disable to block a double-file. */
  busy?: boolean;
}

// The ⋯ overflow menu (mock E-img-r2, shown open). Rename and Delete are the floor;
// the two additive actions above them are conditional:
//
//   • **Add another page** (B-549) — the detail-screen home for the append machinery
//     that previously existed only on the saved moment. Missing page 4 of a
//     discharge sheet and noticing later should not mean delete-and-recapture; this
//     is the recovery the §4.4 `document_group_id` grouping was built for.
//   • **Also add to {other pet}** (B-547) — D13 says this copy-to-another-pet action
//     sits "on the saved moment AND the detail ⋯ menu". The saved moment shipped it;
//     this is the other half, so a multi-pet owner who taps Done and only then
//     remembers the other pet's boarding form still has a path.
//
// Two secondary actions was already the case Header's own note carves out — it ships
// no built-in ⋯ *because* a single secondary action belongs inline, and a screen
// with several passes its own trigger through `right`. This is that trigger's menu,
// and the floor below (on the detail screen) stays reserved for Share, the action
// this screen exists for (§4.3: the single most important affordance after viewing).
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
// accident. The also-add items deliberately do NOT dismiss on tap: they flip to a
// confirmed "✓ Added…" in place (as on the saved moment), so the owner sees the copy
// land before tapping away.
export function DocumentMoreMenu({
  visible, onClose, onRename, onDelete, onAddPage, alsoAdd = [], onAlsoAdd, busy,
}: Props) {
  const insets = useSafeAreaInsets();

  // Built top-to-bottom so the divider rule is a plain index test and the ordering
  // reads once here rather than being spread across the JSX: additive actions, then
  // Rename, then Delete last (destructive always last).
  const rows: { key: string; node: React.ReactNode }[] = [];

  if (onAddPage) {
    rows.push({
      key: 'add-page',
      node: (
        <TouchableOpacity
          style={styles.item}
          onPress={onAddPage}
          disabled={busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!busy }}
          accessibilityLabel="Add another page to this document"
        >
          <ThemedText style={styles.itemText}>Add another page</ThemedText>
        </TouchableOpacity>
      ),
    });
  }

  for (const target of alsoAdd) {
    rows.push({
      key: `also-${target.petId}`,
      node: (
        <TouchableOpacity
          style={styles.item}
          onPress={() => onAlsoAdd?.(target.petId)}
          disabled={target.done || busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          // Includes busy so an explicit state can't clobber the disabled-during-write
          // one the `disabled` prop would otherwise convey (code-reviewer).
          accessibilityState={{ disabled: target.done || !!busy }}
          accessibilityLabel={target.label}
        >
          <ThemedText style={[styles.itemText, target.done && styles.itemDone]} numberOfLines={2}>
            {target.done ? `✓  ${target.label}` : target.label}
          </ThemedText>
        </TouchableOpacity>
      ),
    });
  }

  rows.push({
    key: 'rename',
    node: (
      <TouchableOpacity
        style={styles.item}
        onPress={onRename}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <ThemedText style={styles.itemText}>Rename</ThemedText>
      </TouchableOpacity>
    ),
  });

  rows.push({
    key: 'delete',
    node: (
      <TouchableOpacity
        style={styles.item}
        onPress={onDelete}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Delete. Kept for 30 days — undo from the library."
      >
        <ThemedText style={[styles.itemText, styles.destructive]}>Delete</ThemedText>
        <ThemedText style={styles.itemSub}>Kept for 30 days — undo from the library</ThemedText>
      </TouchableOpacity>
    ),
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Anchored under the header's ⋯, mirroring the mock's popover position.
            insets.top keeps it under the trigger on a notched device rather than
            at a hardcoded offset that lands over the status bar on some phones. */}
        <View style={[styles.menu, { top: insets.top + 44 }]}>
          {rows.map((row, i) => (
            <View key={row.key}>
              {i > 0 ? <View style={styles.divider} /> : null}
              {row.node}
            </View>
          ))}
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
    // Wider than the original 208: the also-add label ("Also add to {name}'s Vet
    // Files") is the longest string this menu carries, and 240 keeps a short name
    // on one line while numberOfLines={2} catches a long one.
    width: 240,
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
  // The confirmed "✓ Added…" state, matching the saved moment's done styling: the
  // action has happened, so it recedes rather than inviting a second tap.
  itemDone: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextTertiary,
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
