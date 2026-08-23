import { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../constants/theme';
import { ThemedText, fontFamilyForWeight } from '../components/ui/ThemedText';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { getDb } from '../lib/db';
import { uploadPhoto, compressForUpload, persistCapture } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { syncPendingVetVisits } from '../lib/sync';
import { uuid, exifDateToISO } from '../lib/utils';

type Step = 'photo' | 'details' | 'complete';

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
  // Source pixel dimensions from the picker asset, kept only so the pre-upload
  // resize can cap the photo's true longest edge (B-352) — a photographed
  // discharge sheet is portrait far more often than not.
  const [photoDims, setPhotoDims] = useState<{ width: number; height: number } | null>(null);

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
    setPhotoDims({ width: asset.width, height: asset.height });

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
    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (!pet) return;
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
        visitId, pet.id, visitedAtStr,
        clinicName.trim() || null, vetName.trim() || null,
        reason.trim() || null, notes.trim() || null,
        nextVisitAtStr, now, now,
      ]
    );

    if (photoUri) {
      const attId = uuid();
      const storagePath = `${pet.id}/${visitId}/${attId}.jpg`;
      // B-104 — persist the capture off the OS cache directory (reclaimed under
      // storage pressure) into the app-owned document directory, and store THAT
      // as local_uri so it survives. Done at save time (not pick time) so a
      // cancelled or replaced photo never leaves an orphan. Upload still reads
      // the original capture; both point at identical bytes.
      const localUri = persistCapture(photoUri, `${attId}.jpg`);
      await db.runAsync(
        `INSERT INTO vet_visit_attachments
           (id, vet_visit_id, pet_id, local_uri, storage_path, mime_type, taken_at, synced, created_at)
         VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
        [attId, visitId, pet.id, localUri, storagePath, photoTakenAt ?? null, now]
      );
      // Compress + EXIF/GPS-strip before upload. The EXIF date-taken was already
      // read at pick time (handlePickPhoto reads asset.exif), so re-encoding here
      // only affects the stored file — a camera-roll document photo's GPS metadata
      // never reaches storage. 1600px/q75 keeps a photographed document legible.
      compressForUpload(photoUri, photoDims?.width, photoDims?.height)
        .then((uploadUri) => uploadPhoto('nyx-vet-attachments', storagePath, uploadUri))
        .then(async () => {
          // Only mark synced if the row actually landed — supabase-js returns
          // errors, it doesn't throw, so an unchecked upsert here would flag a
          // row synced that never reached Supabase (same guard as log.tsx).
          const { error: attErr } = await supabase.from('vet_visit_attachments').upsert({
            id: attId, vet_visit_id: visitId, pet_id: pet.id,
            storage_path: storagePath, mime_type: 'image/jpeg', taken_at: photoTakenAt,
          }, { onConflict: 'id' });
          if (attErr) {
            console.warn('[vet-visit] attachment upsert failed:', attErr.message);
            return;
          }
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
          <ThemedText style={styles.checkMark}>✓</ThemedText>
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
          <ThemedText style={styles.headerTitle}>Vet visit</ThemedText>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <ThemedText style={styles.closeBtnText}>✕</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.photoStepBody}>
          <ThemedText style={styles.photoStepHeading}>Any docs from the visit?</ThemedText>
          <ThemedText style={styles.photoStepSub}>
            Attach a photo of the visit summary, prescription, or any paperwork.
          </ThemedText>

          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.replacePhotoBtn} onPress={showPhotoOptions}>
                <ThemedText style={styles.replacePhotoBtnText}>Replace photo</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoArea} onPress={showPhotoOptions} activeOpacity={0.7}>
              <ThemedText style={styles.addPhotoIcon}>📄</ThemedText>
              <ThemedText style={styles.addPhotoLabel}>Tap to add a photo</ThemedText>
              <ThemedText style={styles.addPhotoSub}>Camera or photo library</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.photoStepFooter}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => setStep('details')}
          >
            <ThemedText style={styles.continueBtnText}>
              {photoUri ? 'Continue' : 'Skip for now'}
            </ThemedText>
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
          <ThemedText style={styles.backBtnText}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Vet visit details</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">

          {photoUri && (
            <View style={styles.photoThumbRow}>
              <Image source={{ uri: photoUri }} style={styles.photoThumb} resizeMode="cover" />
              <ThemedText style={styles.photoThumbLabel}>Photo attached</ThemedText>
            </View>
          )}

          <ThemedText style={styles.fieldLabel}>Visit date</ThemedText>
          <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(!showDatePicker)}>
            <ThemedText style={styles.dateFieldText}>
              {visitedAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
            </ThemedText>
            <ThemedText style={styles.dateChangeText}>Change</ThemedText>
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

          <ThemedText style={styles.fieldLabel}>Clinic</ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Riverside Animal Hospital"
            placeholderTextColor={theme.colorTextSecondary}
            value={clinicName}
            onChangeText={setClinicName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ThemedText style={styles.fieldLabel}>Vet</ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Dr. Alex Chen"
            placeholderTextColor={theme.colorTextSecondary}
            value={vetName}
            onChangeText={setVetName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ThemedText style={styles.fieldLabel}>Reason for visit</ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. GI follow-up, annual check-up"
            placeholderTextColor={theme.colorTextSecondary}
            value={reason}
            onChangeText={setReason}
            autoCapitalize="sentences"
            returnKeyType="next"
          />

          <ThemedText style={styles.fieldLabel}>Notes</ThemedText>
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

          <ThemedText style={styles.fieldLabel}>Next visit (optional)</ThemedText>
          <TouchableOpacity
            style={styles.dateField}
            onPress={() => setShowNextDatePicker(!showNextDatePicker)}
          >
            <ThemedText style={[styles.dateFieldText, !nextVisitAt && { color: theme.colorTextSecondary }]}>
              {nextVisitAt
                ? nextVisitAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
                : 'Not set'}
            </ThemedText>
            <ThemedText style={styles.dateChangeText}>{nextVisitAt ? 'Change' : 'Set date'}</ThemedText>
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
            <ThemedText style={styles.saveBtnText}>Log {petName}'s visit</ThemedText>
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
    lineHeight: theme.lineHeightBody,
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
    color: theme.colorTextOnDark,
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
    color: theme.colorTextOnDark,
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
  checkMark: { fontSize: 36, color: theme.colorTextOnDark },
  // `Animated.Text` can't be a ThemedText (no Animated variant — §7), so this one
  // resolves its face through the primitive's mapper instead of the wrapper. Same one
  // fact, same path; see components/log/SheetLogBeat.tsx for the full note.
  loggedText: {
    fontSize: 20,
    fontFamily: fontFamilyForWeight(theme.fontWeightMedium),
    color: theme.colorNeutralDark,
  },
});
