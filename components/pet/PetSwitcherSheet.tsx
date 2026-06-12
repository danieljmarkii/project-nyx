import { useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { petIdentityLine } from '../../lib/utils';
import { PetAvatar } from './PetAvatar';

interface PetSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
}

const ROW_AVATAR = 36;

// The switcher bottom sheet (multi-pet spec §3.1, mock A2): "Your pets" with
// one row per active pet (tap switches + dismisses — selection is device-local,
// spec §2), then "Add a pet", then a quiet "Archived pets" link that renders
// only when at least one archived pet exists. Controlled (visible/onClose) so
// the home header owns it now and the FAB "Logging for {pet}" chip can reuse
// the same sheet in build PR 4.
export function PetSwitcherSheet({ visible, onClose }: PetSwitcherSheetProps) {
  const { pets, activePet, selectPet } = usePetStore();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [hasArchived, setHasArchived] = useState(false);

  // The store only holds ACTIVE pets, so the archived-pets link needs its own
  // (cheap, head-only) count. Fetched per open; any failure just hides the
  // link — a quiet entry point degrading to quiet absence, never an error.
  useEffect(() => {
    if (!visible || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('pets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', false);
        if (error) throw error;
        if (!cancelled) setHasArchived((count ?? 0) > 0);
      } catch (e) {
        console.warn('[PetSwitcherSheet] archived count failed:', e);
        if (!cancelled) setHasArchived(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user]);

  function handleSelect(petId: string) {
    selectPet(petId);
    onClose();
  }

  function handleAddPet() {
    onClose();
    router.push('/add-pet');
  }

  function handleArchived() {
    onClose();
    router.push('/archived-pets');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
          <View style={styles.grabber} />
          <Text style={styles.header}>Your pets</Text>

          <ScrollView style={styles.list} bounces={false}>
            {pets.map((pet) => {
              const selected = pet.id === activePet?.id;
              const line = petIdentityLine(pet);
              return (
                <TouchableOpacity
                  key={pet.id}
                  style={[styles.petRow, selected && styles.petRowSelected]}
                  onPress={() => handleSelect(pet.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Switch to ${pet.name}`}
                >
                  <PetAvatar name={pet.name} photoPath={pet.photo_path} size={ROW_AVATAR} />
                  <View style={styles.petText}>
                    <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
                    {line ? (
                      <Text style={styles.petLine} numberOfLines={1}>{line}</Text>
                    ) : null}
                  </View>
                  {selected && (
                    <Check size={18} color={theme.colorAccent} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.addRow}
            onPress={handleAddPet}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.addDisc}>
              <Plus size={16} color={theme.colorTextTertiary} strokeWidth={1.75} />
            </View>
            <Text style={styles.addLabel}>Add a pet</Text>
          </TouchableOpacity>

          {hasArchived && (
            <TouchableOpacity
              onPress={handleArchived}
              activeOpacity={0.7}
              accessibilityRole="button"
              // The link is deliberately quiet (textXS); the padding keeps the
              // tap target at the 44pt floor anyway.
              style={styles.archivedLinkWrap}
            >
              <Text style={styles.archivedLink}>Archived pets</Text>
            </TouchableOpacity>
          )}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.35)',
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  // Cap so a many-pet household scrolls inside the sheet instead of pushing
  // "Add a pet" off-screen.
  list: {
    maxHeight: 320,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: theme.radiusSmall,
    minHeight: 48,
  },
  petRowSelected: {
    backgroundColor: theme.colorAccentLight,
  },
  petText: {
    flex: 1,
    minWidth: 0,
  },
  petName: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  petLine: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: 6,
    minHeight: 48,
  },
  addDisc: {
    width: 30,
    height: 30,
    borderRadius: theme.radiusFull,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  archivedLinkWrap: {
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  archivedLink: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
  },
});
