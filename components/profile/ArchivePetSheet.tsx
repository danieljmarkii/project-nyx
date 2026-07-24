import { useState } from 'react';
import {
  Alert, Modal, Pressable, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { supabase } from '../../lib/supabase';
import { usePetStore, Pet } from '../../store/petStore';
import { archiveBlockedCopy, archiveConfirmBody } from '../../lib/utils';

interface ArchivePetSheetProps {
  visible: boolean;
  /** Snapshot of the pet this sheet was opened FOR — the archive lands on this
   *  row even if the active pet somehow flips while the sheet is up (same
   *  identity rule as EditPetModal, multi-pet PR 2). */
  pet: Pet;
  onClose: () => void;
}

// Archive confirm (multi-pet spec §3.5, mock B4): a floating bottom card —
// title, the warm reversibility line, a single dark Archive button, quiet
// cancel. Archive is `pets.is_active = false` only: nothing cascades, history
// stays hydrated, and "Archived pets" is the way back.
export function ArchivePetSheet({ visible, pet, onClose }: ArchivePetSheetProps) {
  const insets = useSafeAreaInsets();
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    if (archiving) return;

    // Last-pet guard, re-checked at confirm time against the live store — the
    // Pet tab checks before opening, but another device could have archived a
    // sibling while this sheet sat open, and zero active pets is a state the
    // app must never reach (spec §3.5).
    if (usePetStore.getState().pets.length <= 1) {
      onClose();
      const blocked = archiveBlockedCopy(pet.name);
      Alert.alert(blocked.title, blocked.body);
      return;
    }

    setArchiving(true);
    try {
      const { error } = await supabase
        .from('pets')
        .update({ is_active: false })
        .eq('id', pet.id);
      if (error) throw error;

      // Drop from the active list; if this was the active pet the store falls
      // back to the oldest remaining active pet (spec §3.5).
      usePetStore.getState().removePet(pet.id);
      onClose();
    } catch (e) {
      console.error('[ArchivePetSheet] archive failed:', e);
      Alert.alert(
        'Could not archive',
        `Something went wrong and ${pet.name} is still on your list. Check your connection and try again.`,
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={archiving ? undefined : onClose} />
        <View style={[styles.card, { marginBottom: insets.bottom + 18 }]}>
          <Text style={styles.title}>Archive {pet.name}?</Text>
          <Text style={styles.body}>{archiveConfirmBody(pet)}</Text>
          <TouchableOpacity
            style={styles.archiveBtn}
            onPress={handleArchive}
            disabled={archiving}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {archiving
              ? <WhorlSpinner size="sm" tint={theme.colorSurface} />
              : <Text style={styles.archiveBtnText}>Archive</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            disabled={archiving}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    marginHorizontal: 14,
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
    lineHeight: 20,
    textAlign: 'center',
    marginTop: theme.space1,
  },
  archiveBtn: {
    alignSelf: 'stretch',
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 14,
  },
  archiveBtnText: {
    color: theme.colorSurface,
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
  },
  cancelBtn: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 4,
  },
  cancelText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
});
