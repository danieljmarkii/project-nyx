import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, getPublicUrl } from '../../lib/storage';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { EditPetModal } from '../../components/profile/EditPetModal';
import { AddConditionModal, Condition } from '../../components/profile/AddConditionModal';

const PET_PHOTO_BUCKET = 'nyx-pet-photos';

interface DietTrialRow {
  id: string;
  started_at: string;
  target_duration_days: number;
  vet_name: string | null;
  food_items: { brand: string; product_name: string } | null;
}

interface DietTrialDisplay extends DietTrialRow {
  daysElapsed: number;
  daysLogged: number;
  compliance: number;
}

function calculateAge(dob: string | null): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (totalMonths < 1) return 'Under 1mo';
  if (totalMonths < 12) return `${totalMonths}mo`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years}yr ${months}mo` : `${years}yr`;
}

function formatSex(sex: string): string {
  if (sex === 'male') return 'Male';
  if (sex === 'female') return 'Female';
  return '—';
}

function formatWeightLbs(kg: number | null): string {
  if (kg == null) return '—';
  return `${Math.round(kg * 2.20462 * 10) / 10} lbs`;
}

function statusLabel(status: string): string {
  return status === 'monitoring' ? 'Monitoring' : 'Active';
}

export default function ProfileScreen() {
  const { activePet, updatePet, setActivePet, setOnboarded } = usePetStore();
  const { user } = useAuthStore();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [conditionModalVisible, setConditionModalVisible] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | undefined>(undefined);

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionsLoading, setConditionsLoading] = useState(true);

  const [dietTrial, setDietTrial] = useState<DietTrialDisplay | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [wiping, setWiping] = useState(false);

  const loadConditions = useCallback(async () => {
    if (!activePet) return;
    setConditionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('conditions')
        .select('id, pet_id, condition_name, diagnosed_at, status, notes, created_at')
        .eq('pet_id', activePet.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConditions((data as Condition[]) ?? []);
    } catch (e) {
      console.error('[Profile] load conditions failed:', e);
    } finally {
      setConditionsLoading(false);
    }
  }, [activePet?.id]);

  const loadDietTrial = useCallback(async () => {
    if (!activePet) return;
    setTrialLoading(true);
    try {
      const { data: trial, error: trialError } = await supabase
        .from('diet_trials')
        .select('id, started_at, target_duration_days, vet_name, food_items(brand, product_name)')
        .eq('pet_id', activePet.id)
        .eq('status', 'active')
        .maybeSingle();

      if (trialError) throw trialError;
      if (!trial) { setDietTrial(null); return; }

      const row = trial as unknown as DietTrialRow;

      const startedAt = new Date(row.started_at);
      startedAt.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysElapsed = Math.max(
        1,
        Math.floor((today.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      const { data: mealEvents } = await supabase
        .from('events')
        .select('occurred_at')
        .eq('pet_id', activePet.id)
        .eq('event_type', 'meal')
        .is('deleted_at', null)
        .gte('occurred_at', row.started_at);

      const distinctDays = new Set(
        (mealEvents ?? []).map((e) => new Date(e.occurred_at).toDateString()),
      ).size;

      const compliance = Math.round((distinctDays / daysElapsed) * 100);

      setDietTrial({ ...row, daysElapsed, daysLogged: distinctDays, compliance });
    } catch (e) {
      console.error('[Profile] load diet trial failed:', e);
    } finally {
      setTrialLoading(false);
    }
  }, [activePet?.id]);

  useEffect(() => {
    loadConditions();
    loadDietTrial();
  }, [loadConditions, loadDietTrial]);

  async function handlePickPhoto() {
    Alert.alert('Profile photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Camera access needed'); return; }
          launchPhotoPicker('camera');
        },
      },
      { text: 'Choose from library', onPress: () => launchPhotoPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchPhotoPicker(source: 'camera' | 'library') {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0] || !activePet) return;
    const localUri = result.assets[0].uri;
    setPhotoUploading(true);
    try {
      const storagePath = `${activePet.id}/profile.jpg`;
      await uploadPhoto(PET_PHOTO_BUCKET, storagePath, localUri);

      const { error } = await supabase
        .from('pets')
        .update({ photo_path: storagePath })
        .eq('id', activePet.id);

      if (error) throw error;
      updatePet({ photo_path: storagePath });
    } catch (e) {
      console.error('[Profile] photo upload failed:', e);
      Alert.alert('Upload failed', 'Could not save photo. Make sure the nyx-pet-photos storage bucket exists and has upload policies.');
    } finally {
      setPhotoUploading(false);
    }
  }

  function openAddCondition() {
    setEditingCondition(undefined);
    setConditionModalVisible(true);
  }

  function openEditCondition(condition: Condition) {
    setEditingCondition(condition);
    setConditionModalVisible(true);
  }

  async function handleResolveCondition(id: string) {
    try {
      const { error } = await supabase
        .from('conditions')
        .update({ status: 'resolved' })
        .eq('id', id);

      if (error) throw error;
      setConditions((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('[Profile] resolve condition failed:', e);
      Alert.alert('Could not resolve', 'Something went wrong. Try again.');
    }
  }

  function confirmResolveCondition(condition: Condition) {
    Alert.alert(
      'Mark as resolved',
      `Mark "${condition.condition_name}" as resolved? It will still appear in vet reports for the relevant date range.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark resolved', onPress: () => handleResolveCondition(condition.id) },
      ],
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function handleWipeData() {
    Alert.alert(
      'Wipe all data',
      'This will permanently delete your pet, all logs, and your profile. You will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe everything',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setWiping(true);
            await supabase.from('pets').delete().eq('user_id', user.id);
            await supabase.from('user_profiles').delete().eq('id', user.id);
            setActivePet(null);
            setOnboarded(false);
            setWiping(false);
            supabase.auth.signOut();
          },
        },
      ],
    );
  }

  if (!activePet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No pet profile found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const photoUri = activePet.photo_path
    ? getPublicUrl(PET_PHOTO_BUCKET, activePet.photo_path)
    : null;

  const initials = activePet.name.slice(0, 2).toUpperCase();
  const speciesLabel =
    activePet.species.charAt(0).toUpperCase() + activePet.species.slice(1);
  const subtitle = [speciesLabel, activePet.breed].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Pet header — centered, large photo ── */}
        <View style={styles.headerCard}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            style={styles.photoWrapper}
            activeOpacity={0.8}
            disabled={photoUploading}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoInitials}>{initials}</Text>
              </View>
            )}
            {photoUploading && (
              <View style={styles.photoOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePickPhoto} disabled={photoUploading} hitSlop={8}>
            <Text style={styles.photoLabel}>
              {photoUri ? 'Change photo' : 'Add photo'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.petName}>{activePet.name}</Text>
          {subtitle ? <Text style={styles.petSubtitle}>{subtitle}</Text> : null}

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditModalVisible(true)}
          >
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Info chips ── */}
        <View style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Age</Text>
            <Text style={styles.infoChipValue}>{calculateAge(activePet.date_of_birth)}</Text>
          </View>
          <View style={styles.infoChipDivider} />
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Sex</Text>
            <Text style={styles.infoChipValue}>{formatSex(activePet.sex)}</Text>
          </View>
          <View style={styles.infoChipDivider} />
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Weight</Text>
            <Text style={styles.infoChipValue}>{formatWeightLbs(activePet.weight_kg)}</Text>
          </View>
        </View>

        {/* ── Conditions ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <TouchableOpacity onPress={openAddCondition} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {conditionsLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={theme.colorTextSecondary} />
          ) : conditions.length === 0 ? (
            <View style={styles.emptyConditions}>
              <Text style={styles.emptyConditionsText}>
                No known conditions. Tap + Add to record one.
              </Text>
            </View>
          ) : (
            conditions.map((condition) => (
              <View key={condition.id} style={styles.conditionRow}>
                <View style={styles.conditionInfo}>
                  <Text style={styles.conditionName}>{condition.condition_name}</Text>
                  {condition.diagnosed_at && (
                    <Text style={styles.conditionDate}>
                      Diagnosed{' '}
                      {new Date(condition.diagnosed_at).toLocaleDateString([], {
                        year: 'numeric', month: 'short',
                      })}
                    </Text>
                  )}
                </View>
                <View style={styles.conditionRight}>
                  <View style={[
                    styles.statusChip,
                    condition.status === 'monitoring' && styles.statusChipMonitoring,
                  ]}>
                    <Text style={[
                      styles.statusChipText,
                      condition.status === 'monitoring' && styles.statusChipTextMonitoring,
                    ]}>
                      {statusLabel(condition.status)}
                    </Text>
                  </View>
                  <View style={styles.conditionActions}>
                    <TouchableOpacity onPress={() => openEditCondition(condition)} hitSlop={8}>
                      <Text style={styles.conditionActionText}>Edit</Text>
                    </TouchableOpacity>
                    <Text style={styles.conditionActionDivider}>·</Text>
                    <TouchableOpacity onPress={() => confirmResolveCondition(condition)} hitSlop={8}>
                      <Text style={styles.conditionActionText}>Resolve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Diet trial card ── */}
        {!trialLoading && dietTrial && (
          <View style={styles.trialCard}>
            <Text style={styles.trialLabel}>Diet trial</Text>
            {dietTrial.food_items && (
              <Text style={styles.trialFood}>
                {dietTrial.food_items.brand} {dietTrial.food_items.product_name}
              </Text>
            )}
            <Text style={styles.trialDays}>
              Day {dietTrial.daysElapsed} of {dietTrial.target_duration_days}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${Math.min(100, dietTrial.compliance)}%` },
                ]}
              />
            </View>
            <Text style={styles.trialCompliance}>
              {dietTrial.compliance}% compliance · {dietTrial.daysLogged} days with a meal logged
            </Text>
            {dietTrial.vet_name && (
              <Text style={styles.trialVet}>Vet: {dietTrial.vet_name}</Text>
            )}
          </View>
        )}

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.accountRow} onPress={handleSignOut}>
            <Text style={styles.accountRowText}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.accountRow} onPress={handleWipeData} disabled={wiping}>
            {wiping
              ? <ActivityIndicator color="#C0392B" />
              : <Text style={styles.destructiveText}>Wipe my data</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      <EditPetModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
      />

      <AddConditionModal
        visible={conditionModalVisible}
        petId={activePet.id}
        existingCondition={editingCondition}
        onClose={() => { setConditionModalVisible(false); setEditingCondition(undefined); }}
        onAdded={(c) => setConditions((prev) => [c, ...prev])}
        onUpdated={(c) =>
          setConditions((prev) => prev.map((x) => (x.id === c.id ? c : x)))
        }
      />
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
    gap: theme.space2,
  },

  // Header — centered layout, large photo
  headerCard: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space4,
    paddingHorizontal: theme.space3,
    alignItems: 'center',
    gap: theme.space1,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  photoWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colorNeutralDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontSize: 40,
    fontWeight: theme.fontWeightMedium,
    color: '#fff',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontSize: 13,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  petName: {
    fontSize: 26,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
    marginTop: 4,
  },
  petSubtitle: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  editBtn: {
    marginTop: theme.space1,
    paddingHorizontal: theme.space2,
    paddingVertical: 8,
    borderRadius: theme.radiusSmall,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  editBtnText: {
    fontSize: 14,
    color: theme.colorTextSecondary,
    fontWeight: theme.fontWeightMedium,
  },

  // Info chips
  infoRow: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  infoChip: {
    flex: 1,
    paddingVertical: theme.space2,
    alignItems: 'center',
    gap: 3,
  },
  infoChipDivider: {
    width: 1,
    backgroundColor: theme.colorBorder,
    marginVertical: theme.space1,
  },
  infoChipLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoChipValue: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },

  // Sections
  section: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    gap: theme.space2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  sectionAction: {
    fontSize: 15,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  sectionLoader: {
    alignSelf: 'center',
    paddingVertical: theme.space2,
  },

  // Empty conditions
  emptyConditions: {
    paddingVertical: theme.space1,
  },
  emptyConditionsText: {
    fontSize: 14,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },

  // Condition rows
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
    paddingTop: theme.space2,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  conditionInfo: {
    flex: 1,
    gap: 2,
  },
  conditionName: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  conditionDate: {
    fontSize: 12,
    color: theme.colorTextSecondary,
  },
  conditionRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusChip: {
    backgroundColor: `${theme.colorEventSymptom}22`,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusChipMonitoring: {
    backgroundColor: `${theme.colorAccent}1A`,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorEventSymptom,
  },
  statusChipTextMonitoring: {
    color: theme.colorAccent,
  },
  conditionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conditionActionText: {
    fontSize: 12,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
  conditionActionDivider: {
    fontSize: 12,
    color: theme.colorBorder,
  },

  // Diet trial card
  trialCard: {
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    gap: theme.space1,
  },
  trialLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trialFood: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  trialDays: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colorAccent,
  },
  trialCompliance: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  trialVet: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },

  // Account
  accountRow: {
    paddingVertical: theme.space1,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
  },
  accountRowText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    paddingTop: 4,
  },
  destructiveText: {
    fontSize: 15,
    color: '#C0392B',
    paddingTop: 4,
  },

  // Empty / bottom
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  bottomPad: {
    height: theme.space5,
  },
});
