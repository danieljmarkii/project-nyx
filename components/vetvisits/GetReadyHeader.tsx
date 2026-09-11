import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';

// Get ready's title block and its ⋯ menu (CUL-903 VV-5; mock B1).
//
// The page has a JOB TITLE rather than the rundown's descriptive one — "Get ready
// for Nyx's visit" — because the owner arrived here from a strip that said a visit
// is coming, and the screen should say it is the answer to that.
//
// The eyebrow and the sub-line are the appointment's own `when` / `where` strings,
// composed by `lib/vetVisits.ts` and rendered unchanged, so the page and the strip
// that opened it can never disagree about when the visit is.

interface Props {
  /** 'Tuesday · 3:00 pm' — the appointment's own `when`. */
  when: string;
  /** 'Riverside Animal Hospital · Dr. Chen · recheck' — its own `where`. */
  where: string;
  petName: string;
}

export function GetReadyTitle({ when, where, petName }: Props) {
  return (
    <View style={styles.title}>
      {when ? <ThemedText style={styles.eyebrow}>{when}</ThemedText> : null}
      <ThemedText style={styles.heading}>Get ready for {petName}’s visit</ThemedText>
      {where ? <ThemedText style={styles.sub}>{where}</ThemedText> : null}
    </View>
  );
}

/** The ⋯ trigger for `Header`'s `right` slot. */
export function GetReadyMoreTrigger({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="More actions for this visit"
    >
      {/* An icon glyph, not copy — the vet-document menu's own trigger, same size and
          tone, so the two overflow menus read as one affordance.
          geist-ok: glyph-only, no resolvable family needed. */}
      <ThemedText style={styles.glyph}>⋯</ThemedText>
    </TouchableOpacity>
  );
}

interface MenuProps {
  petName: string;
  visible: boolean;
  onClose: () => void;
  onCopyAsText: () => void;
  onChangeAppointment: () => void;
}

/**
 * The two demoted actions (R-share).
 *
 * *Copy as text* is the shipped rundown share (CUL-206), renamed and moved off the
 * primary. The PM doubted the rundown should go to the vet and all nine lenses
 * agreed independently: the report is the clinical artifact, and this text is for
 * the human going in with the pet — which is what the sub-line says, and why the
 * label says what it DOES rather than promising a persistence the app does not have
 * ("Keep a copy" was CUL-206's original gap).
 *
 * A `Modal` rather than an absolutely-positioned View, the `DocumentMoreMenu`
 * precedent: a tap anywhere dismisses it, including on the content underneath. An
 * overflow menu that only closes via its own items is a trap on a screen the owner
 * may have opened by accident.
 */
export function GetReadyMoreMenu({ petName, visible, onClose, onCopyAsText, onChangeAppointment }: MenuProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <View style={[styles.menu, { top: insets.top + 48 }]} accessibilityViewIsModal>
          <TouchableOpacity
            style={styles.item}
            onPress={onCopyAsText}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <ThemedText style={styles.itemText}>Copy as text</ThemedText>
            <ThemedText style={styles.itemSub}>for whoever’s taking {petName} in</ThemedText>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.item}
            onPress={onChangeAppointment}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <ThemedText style={styles.itemText}>Change the appointment</ThemedText>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: theme.space1, gap: 2 },
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    letterSpacing: theme.trackingWide,
    textTransform: 'uppercase',
    color: theme.colorTextTertiary,
  },
  heading: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  sub: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
  },
  glyph: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
  },
  backdrop: {
    flex: 1,
    // No scrim: an overflow menu is a light-touch affordance, and dimming the screen
    // for two items reads as a decision that matters more than this one does.
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    right: theme.space2,
    width: 240,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
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
  divider: { height: 1, backgroundColor: theme.colorBorder },
  itemText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  itemSub: {
    fontSize: theme.textXS,
    lineHeight: 15,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
});
