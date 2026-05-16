import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Divider } from '../../components/ui/Divider';
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

        {/* ── Pet header ── */}
        <Card style={styles.headerCard}>
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
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
        </Card>

        {/* ── Info chips ── */}
        <Card noPadding style={styles.infoRow}>
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
        </Card>

        {/* ── Conditions ── */}
        <Card style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <TouchableOpacity onPress={openAddCondition} hitSlop={8}>
              <Text style={styles.sectionAction}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {conditionsLoading ? (
            <ActivityIndicator style={styles.sectionLoader} color={theme.colorTextSecondary} />
          ) : conditions.length === 0 ? (
            <Text style={styles.emptyConditionsText}>
              No known conditions. Tap + Add to record one.
            </Text>
          ) : (
            conditions.map((condition) => (
              <View key={condition.id} style={styles.conditionRow}>
                <Divider style={styles.conditionDivider} />
                <View style={styles.conditionInner}>
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
                    <Badge
                      label={statusLabel(condition.status)}
                      variant={condition.status === 'monitoring' ? 'accent' : 'symptom'}
                    />
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
              </View>
            ))
          )}
        </Card>

        {/* ── Diet trial card ── */}
        {!trialLoading && dietTrial && (
          <Card style={styles.sectionGap}>
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
          </Card>
        )}

        {/* ── Account ── */}
        <Card style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Divider style={styles.accountDivider} />
          <TouchableOpacity style={styles.accountRow} onPress={handleSignOut}>
            <Text style={styles.accountRowText}>Sign out</Text>
          </TouchableOpacity>
          <Divider style={styles.accountDivider} />
          <TouchableOpacity style={styles.accountRow} onPress={handleWipeData} disabled={wiping}>
            {wiping
              ? <ActivityIndicator color="#C0392B" />
              : <Text style={styles.destructiveText}>Wipe my data</Text>
            }
          </TouchableOpacity>
        </Card>

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

  // ── Header card ──
  headerCard: {
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space4,
  },
  photoWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  photoPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: theme.colorNeutralDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontSize: 38,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 56,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  petName: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginTop: 4,
  },
  petSubtitle: {
    fontSize: theme.textMD,
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
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightMedium,
  },

  // ── Info row ──
  infoRow: {
    flexDirection: 'row',
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
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWide,
  },
  infoChipValue: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },

  // ── Section layout (gap for inner rows) ──
  sectionGap: {
    gap: theme.space2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  sectionAction: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  sectionLoader: {
    alignSelf: 'center',
    paddingVertical: theme.space2,
  },

  // ── Conditions ──
  emptyConditionsText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: 20,
  },
  conditionRow: {
    gap: theme.space2,
  },
  conditionDivider: {
    marginBottom: 0,
  },
  conditionInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space2,
  },
  conditionInfo: {
    flex: 1,
    gap: 2,
  },
  conditionName: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  conditionDate: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
  },
  conditionRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  conditionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conditionActionText: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    textDecorationLine: 'underline',
  },
  conditionActionDivider: {
    fontSize: theme.textXS,
    color: theme.colorBorder,
  },

  // ── Diet trial ──
  trialLabel: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
  },
  trialFood: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  trialDays: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorChartEmpty,
    overflow: 'hidden',
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colorAccent,
  },
  trialCompliance: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  trialVet: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  // ── Account ──
  accountDivider: {
    marginVertical: 0,
  },
  accountRow: {
    paddingVertical: 6,
  },
  accountRowText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  destructiveText: {
    fontSize: theme.textMD,
    color: '#C0392B',
  },

  // ── Empty / bottom ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  bottomPad: {
    height: theme.space5,
  },
});
