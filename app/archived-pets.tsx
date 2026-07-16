import { useEffect, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { supabase } from '../lib/supabase';
import { usePetStore, Pet } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { petIdentityLine } from '../lib/utils';
import { PetAvatar } from '../components/pet/PetAvatar';

// Archived pets (multi-pet spec §3.5): the way back from archive-only removal.
// Lists every archived pet with a one-tap un-archive ("Bring back" — the word
// the confirm sheet promised). Un-archiving restores switcher presence and
// banner eligibility but does NOT steal the active selection — the owner is
// mid-task on their current pet; the restored pet is one switcher tap away.
export default function ArchivedPetsScreen() {
  const user = useAuthStore((s) => s.user);

  const [archivedPets, setArchivedPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Gates handleRestore's setState calls if the owner dismisses the modal
  // mid-restore — the store updates still apply (they must), only the local
  // list update is skipped on an unmounted screen.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', false)
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (!cancelled) setArchivedPets(data ?? []);
      } catch (e) {
        console.error('[ArchivedPets] load failed:', e);
        if (!cancelled) {
          Alert.alert('Could not load', 'Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleRestore(pet: Pet) {
    if (restoringId || !user) return;
    setRestoringId(pet.id);
    try {
      const { error } = await supabase
        .from('pets')
        .update({ is_active: true })
        .eq('id', pet.id);
      if (error) throw error;

      // Re-fetch the active list rather than patching the store: petStore.pets
      // is oldest-first (the launch fallback depends on it) and the Pet shape
      // doesn't carry created_at, so appending a restored older pet locally
      // would corrupt that ordering. The active selection is preserved.
      const { data, error: listError } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (listError) throw listError;
      const store = usePetStore.getState();
      store.setPets(data ?? [], store.activePet?.id ?? null);

      if (mountedRef.current) {
        setArchivedPets((prev) => prev.filter((p) => p.id !== pet.id));
      }
    } catch (e) {
      console.error('[ArchivedPets] restore failed:', e);
      if (mountedRef.current) {
        Alert.alert(
          'Could not bring back',
          `Something went wrong and ${pet.name} is still archived. Check your connection and try again.`,
        );
      }
    } finally {
      if (mountedRef.current) setRestoringId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Archived pets</Text>
        <Text style={styles.subtitle}>
          Their history stays safe. Bring a pet back anytime and everything picks
          up where it left off.
        </Text>

        {loading ? (
          <WhorlSpinner size="md" ground="day" style={styles.loader} />
        ) : archivedPets.length === 0 ? (
          <Text style={styles.emptyText}>
            No archived pets right now. Any pet you archive from their Pet tab
            will wait here.
          </Text>
        ) : (
          archivedPets.map((pet) => {
            const line = petIdentityLine(pet);
            return (
              <View key={pet.id} style={styles.petRow}>
                <PetAvatar name={pet.name} photoPath={pet.photo_path} size={38} />
                <View style={styles.petText}>
                  <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
                  {line ? (
                    <Text style={styles.petLine} numberOfLines={1}>{line}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={() => handleRestore(pet)}
                  disabled={restoringId !== null}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Bring ${pet.name} back`}
                >
                  {restoringId === pet.id ? (
                    <WhorlSpinner size="sm" ground="day" />
                  ) : (
                    <Text style={styles.restoreBtnText}>Bring back</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
  },
  title: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
    marginTop: theme.space1,
    marginBottom: theme.space3,
  },
  loader: {
    marginTop: theme.space3,
  },
  emptyText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusMedium,
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    marginBottom: theme.space1,
    minHeight: 56,
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
  restoreBtn: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtnText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
});
