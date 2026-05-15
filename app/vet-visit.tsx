import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../constants/theme';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { getDb } from '../lib/db';
import { uploadPhoto } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { syncPendingVetVisits } from '../lib/sync';

type Step = 'photo' | 'details' | 'complete';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function exifDateToISO(exifDate: string): string | null {
  const [datePart, timePart] = exifDate.split(' ');
  if (!datePart || !timePart) return null;
  try {
    return new Date(`${datePart.replace(/:/g, '-')}T${timePart}`).toISOString();
  } catch {
    return null;
  }
}

function isoToDateOnly(iso: string): string {
  return iso.split('T')[0];
}

export default function VetVisitModal() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>('photo');

  // Photo state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTakenAt, setPhotoTakenAt] = useState<string | null>(null);

  // Details state — visitedAt is a date only (no time)
  const [visitedAt, setVisitedAt] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [vetName, setVetName] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [nextVisitAt, setNextVisitAt] = useState<Date | null>(null);
  const [showNextDatePicker, setShowNextDatePicker] = useState(false);

  // Completion animation
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => router.back(), 1200);
    return () => clearTimeout(t);
  }, [step]);

  async function handlePickPhoto(source: 'camera' | 'library') {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      exif: true,
    };

    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo library access needed', 'Allow photo access in Settings to attach images.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);

    const exifRaw = (asset.exif as Record<string, unknown> | undefined);
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    if (typeof dateRaw === 'string') {
      const iso = exifDateToISO(dateRaw);
      if (iso) {
        setPhotoTakenAt(iso);
        setVisitedAt(new Date(iso));
      }
    }
  }

  function showPhotoOptions() {
    Alert.alert('Add photo', 'Choose a source', [
      { text: 'Take photo', onPress: () => handlePickPhoto('camera') },
      { text: 'Choose from library', onPress: () => handlePickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!activePet) return;
    const db = getDb();
    const visitId = uuid();
    const now = new Date().toISOString();
    const visitedAtStr = isoToDateOnly(visitedAt.toISOString());
    const nextVisitAtStr = nextVisitAt ? isoToDateOnly(nextVisitAt.toISOString()) : null;

    await db.runAsync(
      `INSERT INTO vet_visits
         (id, pet_id, visited_at, clinic_name, vet_name, reason, notes, next_visit_at, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        visitId, activePet.id, visitedAtStr,
        clinicName.trim() || null, vetName.trim() || null,
        reason.trim() || null, notes.trim() || null,
        nextVisitAtStr, now, now,
      ]
    );

    if (photoUri) {
      const attId = uuid();
      const storagePath = `${activePet.id}/${visitId}/${attId}.jpg`;
      await db.runAsync(
        `INSERT INTO vet_visit_attachments
           (id, vet_visit_id, pet_id, local_uri, storage_path, mime_type, taken_at, synced, created_at)
         VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
        [attId, visitId, activePet.id, photoUri, storagePath, photoTakenAt ?? null, now]
      );
      uploadPhoto('nyx-vet-attachments', storagePath, photoUri)
        .then(async () => {
          await supabase.from('vet_visit_attachments').upsert({
            id: attId, vet_visit_id: visitId, pet_id: activePet.id,
            storage_path: storagePath, mime_type: 'image/jpeg', taken_at: photoTakenAt,
          }, { onConflict: 'id' });
          await db.runAsync('UPDATE vet_visit_attachments SET synced = 1 WHERE id = ?', [attId]);
        })
        .catch(console.error);
    }

    setStep('complete');
    syncPendingVetVisits().catch(console.error);
  }

  const petName = activePet?.name ?? 'your pet';

  // ── Completion ────────────────────────────────────────────────────────────────

  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>Vet visit logged</Animated.Text>
      </View>
    );
  }

  // ── Photo step ────────────────────────────────────────────────────────────────

  if (step === 'photo') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vet visit</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.photoStepBody}>
          <Text style={styles.photoStepHeading}>Any docs from the visit?</Text>
          <Text style={styles.photoStepSub}>
            Attach a photo of the visit summary, prescription, or any paperwork.
          </Text>

          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.replacePhotoBtn} onPress={showPhotoOptions}>
                <Text style={styles.replacePhotoBtnText}>Replace photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoArea} onPress={showPhotoOptions} activeOpacity={0.7}>
              <Text style={styles.addPhotoIcon}>📄</Text>
              <Text style={styles.addPhotoLabel}>Tap to add a photo</Text>
              <Text style={styles.addPhotoSub}>Camera or photo library</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.photoStepFooter}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => setStep('details')}
          >
            <Text style={styles.continueBtnText}>
              {photoUri ? 'Continue' : 'Skip for now'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Details step ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('photo')} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vet visit details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">

          {photoUri && (
            <View style={styles.photoThumbRow}>
              <Image source={{ uri: photoUri }} style={styles.photoThumb} resizeMode="cover" />
              <Text style={styles.photoThumbLabel}>Photo attached</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>Visit date</Text>
          <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(!showDatePicker)}>
            <Text style={styles.dateFieldText}>
              {visitedAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            <Text style={styles.dateChangeText}>Change</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={visitedAt}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(_e, date) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (date) setVisitedAt(date);
              }}
            />
          )}

          <Text style={styles.fieldLabel}>Clinic</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Riverside Animal Hospital"
            placeholderTextColor={theme.colorTextSecondary}
            value={clinicName}
            onChangeText={setClinicName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Vet</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Dr. Alex Chen"
            placeholderTextColor={theme.colorTextSecondary}
            value={vetName}
            onChangeText={setVetName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Reason for visit</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. GI follow-up, annual check-up"
            placeholderTextColor={theme.colorTextSecondary}
            value={reason}
            onChangeText={setReason}
            autoCapitalize="sentences"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            placeholder="Diagnosis, medications, instructions..."
            placeholderTextColor={theme.colorTextSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={600}
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>Next visit (optional)</Text>
          <TouchableOpacity
            style={styles.dateField}
            onPress={() => setShowNextDatePicker(!showNextDatePicker)}
          >
            <Text style={[styles.dateFieldText, !nextVisitAt && { color: theme.colorTextSecondary }]}>
              {nextVisitAt
                ? nextVisitAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
                : 'Not set'}
            </Text>
            <Text style={styles.dateChangeText}>{nextVisitAt ? 'Change' : 'Set date'}</Text>
          </TouchableOpacity>
          {showNextDatePicker && (
            <DateTimePicker
              value={nextVisitAt ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(_e, date) => {
                if (Platform.OS === 'android') setShowNextDatePicker(false);
                if (date) setNextVisitAt(date);
              }}
            />
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Log {petName}'s visit</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
    textAlign: 'center',
  },
  closeBtn: { width: 32, alignItems: 'flex-end' },
  closeBtnText: { fontSize: 18, color: theme.colorTextSecondary },
  backBtn: { width: 32 },
  backBtnText: { fontSize: 22, color: theme.colorNeutralDark },
  headerSpacer: { width: 32 },

  // ── Photo step ──
  photoStepBody: {
    flex: 1,
    padding: theme.space3,
    gap: theme.space3,
  },
  photoStepHeading: {
    fontSize: 22,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  photoStepSub: {
    fontSize: 15,
    color: theme.colorTextSecondary,
    lineHeight: 22,
    marginTop: -theme.space2,
  },
  addPhotoArea: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
    borderRadius: theme.radiusMedium,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 200,
  },
  addPhotoIcon: { fontSize: 40 },
  addPhotoLabel: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  addPhotoSub: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  photoPreviewWrap: {
    flex: 1,
    gap: theme.space2,
    minHeight: 200,
  },
  photoPreview: {
    flex: 1,
    borderRadius: theme.radiusMedium,
    minHeight: 200,
  },
  replacePhotoBtn: { alignItems: 'center' },
  replacePhotoBtnText: {
    fontSize: 15,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  photoStepFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    padding: theme.space2,
  },
  continueBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: '#fff',
  },

  // ── Details form ──
  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  photoThumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingBottom: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radiusSmall,
  },
  photoThumbLabel: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: -theme.space1,
  },
  textInput: {
    fontSize: 16,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
  notesInput: {
    height: 100,
    paddingTop: theme.space1,
    textAlignVertical: 'top',
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
  dateFieldText: {
    fontSize: 16,
    color: theme.colorTextPrimary,
  },
  dateChangeText: {
    fontSize: 14,
    color: theme.colorAccent,
  },
  saveBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    marginTop: theme.space2,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: '#fff',
  },

  // ── Completion ──
  completeContainer: {
    flex: 1,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space2,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: { fontSize: 36, color: '#fff' },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
});
