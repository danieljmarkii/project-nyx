import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronRight } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/ui/Header';
import { SectionLabel } from '../components/ui/SectionLabel';
import { EVENT_TYPES, EventTypeKey } from '../constants/eventTypes';
import { getDb, updateEvent, updateMealFood, updateMealIntake, getMealForEvent, getDoseForEvent, updateDoseAdherence, updateDoseHowGiven, getEventAttachment, getEventSource, getEventTimeFields } from '../lib/db';
import { syncPendingEvents, syncPendingMeals, syncPendingWeightChecks, syncPendingMedicationAdministrations } from '../lib/sync';
import { uploadPhoto, compressForUpload, persistCapture } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useEventStore } from '../store/eventStore';
import { uuid, formatExifAttribution, formatTime, deriveOccurredAt } from '../lib/utils';
import { getWeightKgForEvent, updateWeightCheck, parseWeightLbsToKg, kgToLbs, MAX_WEIGHT_LBS } from '../lib/weight';
import { usePetStore } from '../store/petStore';
import { IntakeChipRow, IntakeRating } from '../components/log/IntakeChipRow';
import { AdherenceChipRow, DoseAdherence } from '../components/log/AdherenceChipRow';
import { VehicleChipRow } from '../components/log/VehicleChipRow';
import { asDoseVehicle, type DoseVehicle } from '../lib/medications';
import { TimeConfidenceField, TimeMode, FoundMode } from '../components/log/TimeConfidenceField';
import { PhotoViewer } from '../components/ui';

interface CachedFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
}

export default function EditEventModal() {
  const { id, type, occurredAt: occurredAtParam, notes: notesParam } =
    useLocalSearchParams<{
      id: string;
      type: string;
      occurredAt: string;
      notes?: string;
    }>();

  const { patchInToday } = useEventStore();

  const eventType = type as EventTypeKey;
  const config = EVENT_TYPES[eventType] ?? { label: 'Event', hasSeverity: false, hasFood: false };
  const isWeight = eventType === 'weight_check';
  // A dose is an administration act — always witnessed by whoever gave it, exactly
  // like a meal ("you see yourself put the bowl down") or a weight check ("you read
  // the scale"). It must NOT inherit the symptom Saw-it/Found-it model: you don't
  // "discover" that you gave a pill, and a mis-classified administration time would
  // degrade the timing the §6.4 double-dose check + the Signal confounder pass rely
  // on. So medication joins meals/weight on the plain witnessed point picker.
  const isMedication = eventType === 'medication';

  const [occurredAt, setOccurredAt] = useState(() =>
    occurredAtParam ? new Date(occurredAtParam) : new Date(),
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notes, setNotes] = useState(notesParam ?? '');
  // Provenance of the saved `occurred_at`. Loaded from the local DB on mount;
  // flips to 'manual' the moment the user taps the time row.
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('manual');

  // B-010 — editable witnessed/found confidence (QA Note 1: confidence wasn't
  // editable after logging). Shown only for non-meal events; meals are always
  // witnessed — and so is a weight check (you read the scale), so it uses the
  // plain point picker too and never the Saw-it/Found-it control (B-197).
  // Reconstructed from stored fields on mount. Mirrors log.tsx.
  const showConfidenceControl = !config.hasFood && !isWeight && !isMedication;
  const [timeMode, setTimeMode] = useState<TimeMode>('saw');
  const [foundMode, setFoundMode] = useState<FoundMode>('before');
  const [earliest, setEarliest] = useState<Date | null>(null);
  const [foundLatest, setFoundLatest] = useState<Date>(() =>
    occurredAtParam ? new Date(occurredAtParam) : new Date(),
  );
  // Estimated point kept distinct from `occurredAt` (the witnessed point) so a
  // guess never leaks into a witnessed log when the owner toggles back.
  const [estimatedAt, setEstimatedAt] = useState<Date>(() =>
    occurredAtParam ? new Date(occurredAtParam) : new Date(),
  );

  // Photo attachment
  const [existingAttachmentUri, setExistingAttachmentUri] = useState<string | null>(null);
  const [newAttachmentUri, setNewAttachmentUri] = useState<string | null>(null);

  // Meal food state
  const [currentFoodId, setCurrentFoodId] = useState<string | null>(null);
  const [currentFoodBrand, setCurrentFoodBrand] = useState<string | null>(null);
  const [currentFoodProduct, setCurrentFoodProduct] = useState<string | null>(null);
  const [showFoodPicker, setShowFoodPicker] = useState(false);
  const [foods, setFoods] = useState<CachedFood[]>([]);

  // WSAVA intake (B-014). Held in local state and persisted on Save —
  // unlike the detail screen's optimistic-on-tap, this is a Cancel-able
  // form, so intake must follow the same discard-on-Cancel semantics as
  // every other field here.
  const [intakeRating, setIntakeRating] = useState<IntakeRating | null>(null);

  // Medication (dose) state — the parity twin of the meal food/intake block, so the
  // Edit modal for a dose carries the fields a dose actually has (drug identity +
  // adherence + how-given), not just time/photo/notes. `dose` holds the drug-library
  // display fields for the read-only context line (with a link to the library screen);
  // `adherence` + `howGiven` are the editable states, held here and persisted on Save
  // with the same discard-on-Cancel semantics as intake. Loaded only for medication
  // events; `dose` staying null (child not hydrated) means we skip the dose writes on
  // Save so a partial-hydration device never fails the whole edit.
  const [dose, setDose] = useState<{
    genericName: string | null;
    brandName: string | null;
    strength: string | null;
    medicationItemId: string | null;
  } | null>(null);
  const [adherence, setAdherence] = useState<DoseAdherence | null>(null);
  const [howGiven, setHowGiven] = useState<DoseVehicle | null>(null);
  // The as-loaded dose values, so Save writes adherence/how-given ONLY when the
  // owner actually changed them (mirrors the detail screen's `if (next === prev)
  // return`). An unconditional re-write would (a) re-stamp a fresh updated_at on an
  // untouched safety field — a latent cross-device clobber of a caregiver's newer
  // 'refused'/'missed' once household shared-care lands — and (b) round-trip a
  // legacy out-of-union how_given down to null on an untouched Save. Refs, not
  // state: these never drive a render, they're only read in handleSave.
  const loadedAdherenceRef = useRef<DoseAdherence | null>(null);
  const loadedHowGivenRef = useRef<DoseVehicle | null>(null);

  // Weight value in lbs (B-197) — weight_check only; the value IS the entry, so
  // unlike every other field here it must be present and real on save.
  const [weightLbsStr, setWeightLbsStr] = useState('');

  const [saving, setSaving] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);

  // Load existing meal food and photo attachment on mount
  useEffect(() => {
    if (!id) return;

    if (config.hasFood) {
      getMealForEvent(id).then((meal) => {
        if (meal) {
          setCurrentFoodId(meal.food_item_id);
          setCurrentFoodBrand(meal.food_brand);
          setCurrentFoodProduct(meal.food_product_name);
          const r = meal.intake_rating;
          setIntakeRating(
            r === 'refused' || r === 'picked' || r === 'some'
              || r === 'most' || r === 'all' ? r : null,
          );
        }
      }).catch(console.error);
    }

    if (isMedication) {
      getDoseForEvent(id).then((d) => {
        if (!d) return;
        setDose({
          genericName: d.drug_generic_name,
          brandName: d.drug_brand_name,
          strength: d.drug_strength,
          medicationItemId: d.medication_item_id,
        });
        const a = d.adherence;
        const adh: DoseAdherence | null =
          a === 'given' || a === 'partial' || a === 'missed' || a === 'refused' ? a : null;
        setAdherence(adh);
        loadedAdherenceRef.current = adh;
        // Coerce the loose TEXT how_given to the closed vehicle union via the single
        // shared narrower; a legacy/unrecognized value reads as null, never a raw token.
        const veh = asDoseVehicle(d.how_given);
        setHowGiven(veh);
        loadedHowGivenRef.current = veh;
      }).catch(console.error);
    }

    if (isWeight) {
      getWeightKgForEvent(id).then((kg) => {
        if (kg != null) setWeightLbsStr(kgToLbs(kg));
      }).catch(console.error);
    }

    getEventAttachment(id).then((att) => {
      // FR-10 (B-054): a hydrated attachment row carries an empty local_uri (no
      // on-device file). Don't hand '' to <Image> — treat it as absent so the
      // edit screen shows no broken thumbnail. (The detail screen resolves the
      // Storage signed URL; editing the photo on a download-only device is out
      // of Phase 1 scope.)
      if (att && att.local_uri.length > 0) setExistingAttachmentUri(att.local_uri);
    }).catch(console.error);

    getEventSource(id).then(setOccurredAtSource).catch(console.error);

    // Reconstruct the "Saw it / Found it" control from stored confidence +
    // window bounds. Legacy/unclassified (null) rows default to witnessed.
    getEventTimeFields(id).then(({ confidence, earliest: e, latest: l }) => {
      if (confidence === 'estimated') {
        setTimeMode('found');
        setFoundMode('around');
        setEstimatedAt(occurredAtParam ? new Date(occurredAtParam) : new Date());
      } else if (confidence === 'window') {
        setTimeMode('found');
        if (e && l) {
          setFoundMode('between');
          setEarliest(new Date(e));
          setFoundLatest(new Date(l));
        } else if (l) {
          setFoundMode('before');
          setFoundLatest(new Date(l));
        } else if (e) {
          // Degenerate lower-edge-only window — render as open-ended "before".
          setFoundMode('before');
          setFoundLatest(new Date(e));
        }
      }
    }).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!showFoodPicker) return;
    loadFoods();
  }, [showFoodPicker]);

  async function loadFoods() {
    const db = getDb();
    const rows = await db.getAllAsync<CachedFood>(
      `SELECT id, brand, product_name, format
       FROM food_items_cache
       GROUP BY LOWER(brand), LOWER(product_name)
       ORDER BY MAX(COALESCE(last_used_at, '')) DESC, brand ASC
       LIMIT 30`,
    );
    setFoods(rows);
  }

  async function handlePickPhoto() {
    Alert.alert('Attach photo', 'Choose a source', [
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
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled && result.assets[0]) {
      setNewAttachmentUri(result.assets[0].uri);
    }
  }

  // Witnessed point picker (TimeConfidenceField 'saw' mode). Provenance flips
  // exif->manual only on an actual value change so a peek-tap keeps EXIF.
  function handlePointChange(date: Date) {
    if (occurredAtSource === 'exif' && date.getTime() !== occurredAt.getTime()) {
      setOccurredAtSource('manual');
    }
    setOccurredAt(date);
  }

  function handleTimeModeChange(m: TimeMode) {
    if (m === 'found') {
      setFoundMode('before');
      setFoundLatest(occurredAtSource === 'exif' ? occurredAt : new Date());
    }
    setTimeMode(m);
  }

  function handleFoundModeChange(m: FoundMode) {
    if (m === 'around' && foundMode !== 'around') {
      setEstimatedAt(foundLatest);
    }
    if (m === 'between' && !earliest) {
      setEarliest(new Date(foundLatest.getTime() - 2 * 60 * 60 * 1000));
    }
    setFoundMode(m);
  }

  // Clamp earliest <= latest so a windowed event never violates the
  // chk_occurred_window_order DB constraint (B-010 migration 012).
  function handleLatestChange(d: Date) {
    setFoundLatest(d);
    if (earliest && earliest.getTime() > d.getTime()) setEarliest(d);
  }

  // Derive the stored time fields from the affordance touched (mirrors log.tsx).
  // occurred_at stays a single point; confidence + window bounds carry the
  // uncertainty. Meals never reach here — they're forced witnessed in handleSave.
  function buildTimeFields() {
    if (timeMode === 'saw') {
      return { confidence: 'witnessed' as const, occurredAt, earliest: null as Date | null, latest: null as Date | null, source: occurredAtSource };
    }
    if (foundMode === 'around') {
      return { confidence: 'estimated' as const, occurredAt: estimatedAt, earliest: null as Date | null, latest: null as Date | null, source: 'manual' as const };
    }
    const e = foundMode === 'between' ? earliest : null;
    const l = foundLatest;
    return {
      confidence: 'window' as const,
      occurredAt: deriveOccurredAt({ confidence: 'window', point: occurredAt, earliest: e, latest: l }),
      earliest: e,
      latest: l,
      source: 'manual' as const,
    };
  }

  async function handleSave() {
    if (!id) return;

    // Weight value is mandatory + must be real (B-197) — validate before any write
    // so an invalid entry never half-saves (time/notes without the value).
    let weightKg: number | null = null;
    if (isWeight) {
      weightKg = parseWeightLbsToKg(weightLbsStr);
      if (weightKg == null) {
        Alert.alert('Enter a valid weight', `Weight must be a number up to ${MAX_WEIGHT_LBS} lbs.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Meals are always witnessed (you see yourself put the bowl down); the
      // confidence control isn't shown for them, so force witnessed here.
      const tf = showConfidenceControl
        ? buildTimeFields()
        : { confidence: 'witnessed' as const, occurredAt, earliest: null as Date | null, latest: null as Date | null, source: occurredAtSource };
      const occurredAtIso = tf.occurredAt.toISOString();
      const earliestIso = tf.earliest ? tf.earliest.toISOString() : null;
      const latestIso = tf.latest ? tf.latest.toISOString() : null;

      await updateEvent(id, {
        occurred_at: occurredAtIso,
        severity: null,
        notes: notes.trim() || null,
        occurred_at_source: tf.source,
        occurred_at_confidence: tf.confidence,
        occurred_at_earliest: earliestIso,
        occurred_at_latest: latestIso,
      });

      if (config.hasFood && currentFoodId) {
        await updateMealFood(id, currentFoodId);
      }

      if (config.hasFood) {
        await updateMealIntake(id, intakeRating);
      }

      // Dose adherence + how-given (the meal-intake twin). Only when the dose child
      // hydrated locally (`dose` non-null) — otherwise a partial-hydration device would
      // throw on the zero-row guard and fail the whole edit; time/notes/photo still save.
      // Write each field ONLY if the owner changed it (compare against the as-loaded
      // value): an untouched adherence is never re-stamped (so a null-adherence dose
      // stays unrated, never a phantom 'given', and a caregiver's newer state isn't
      // clobbered), and an untouched legacy how_given isn't round-tripped to null.
      if (isMedication && dose) {
        if (adherence !== loadedAdherenceRef.current) await updateDoseAdherence(id, adherence);
        if (howGiven !== loadedHowGivenRef.current) await updateDoseHowGiven(id, howGiven);
      }

      if (isWeight && weightKg != null) {
        const res = await updateWeightCheck(id, weightKg);
        // A weight_check must have its child row; a null return means nothing was
        // written (e.g. a partial-hydration window) — fail into the catch below
        // ("Could not save") rather than claim success, matching updateMealFood/
        // updateMealIntake's zero-row throw.
        if (!res) throw new Error(`updateWeightCheck: no weight_checks row for event ${id}`);
        // Keep the active pet's in-memory snapshot in step (screens own store
        // writes, as log.tsx does) so the profile header + next pre-fill read the
        // new value without waiting for a reload.
        if (res.snapshotKg != null && usePetStore.getState().activePet?.id === res.petId) {
          usePetStore.getState().updatePet({ weight_kg: res.snapshotKg });
        }
      }

      // Persist new photo attachment if one was selected
      if (newAttachmentUri) {
        const db = getDb();
        const petResult = await db.getFirstAsync<{ pet_id: string }>(
          'SELECT pet_id FROM events WHERE id = ?', [id],
        );
        if (petResult) {
          const attId = uuid();
          const storagePath = `${petResult.pet_id}/${id}/${attId}.jpg`;
          const now = new Date().toISOString();
          // B-104 — persist the capture off the OS cache directory (reclaimed
          // under storage pressure) into the app-owned document directory, and
          // store THAT as local_uri so it survives. Upload still reads the
          // original capture; both point at identical bytes.
          const localUri = persistCapture(newAttachmentUri, `${attId}.jpg`);
          await db.runAsync(
            `INSERT OR REPLACE INTO event_attachments
               (id, event_id, pet_id, local_uri, storage_path, mime_type, synced, created_at)
             VALUES (?, ?, ?, ?, ?, 'image/jpeg', 0, ?)`,
            [attId, id, petResult.pet_id, localUri, storagePath, now],
          );
          // Fire-and-forget: if upload fails offline, the synced=0 row is retried by background sync.
          // Compress + EXIF/GPS-strip before upload — parity with log.tsx / event/[id].tsx.
          // The local_uri persisted above keeps the original for the durable hero; only the
          // uploaded object is re-encoded, so a camera-roll photo's GPS metadata never reaches storage.
          compressForUpload(newAttachmentUri)
            .then((uploadUri) => uploadPhoto('nyx-event-attachments', storagePath, uploadUri))
            .then(async () => {
              const { error } = await supabase.from('event_attachments').upsert(
                { id: attId, event_id: id, pet_id: petResult.pet_id, storage_path: storagePath, mime_type: 'image/jpeg' },
                { onConflict: 'id' },
              );
              // Only mark synced when the row actually landed — supabase-js returns
              // the error rather than throwing, so an unchecked upsert would flag a
              // row synced that never reached Supabase (supabase-sync Pattern 1;
              // already guarded in log.tsx / event/[id].tsx / vet-visit.tsx).
              if (error) { console.warn('[edit-event] attachment upsert failed:', error.message); return; }
              await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
            })
            .catch(console.error);
        }
      }

      patchInToday(id, {
        occurred_at: occurredAtIso,
        occurred_at_confidence: tf.confidence,
        occurred_at_earliest: earliestIso,
        occurred_at_latest: latestIso,
        severity: null,
        notes: notes.trim() || null,
        food_item_id: currentFoodId,
        food_brand: currentFoodBrand,
        food_product_name: currentFoodProduct,
        intake_rating: intakeRating,
        ...(isMedication && dose ? { adherence, how_given: howGiven } : {}),
        ...(isWeight && weightKg != null ? { weight_kg: weightKg } : {}),
      });

      // Attachments are handled above with their own direct upload + retry-on-reconnect pattern.
      // One ordered push for all edited tables: events FIRST, then the children
      // (meals + weight_checks) — both child pushes gate on the parent event being
      // synced=1 (lib/sync.ts), so they must follow the event push. updateWeightCheck
      // deliberately does NOT self-sync for exactly this reason (B-197 review).
      syncPendingEvents()
        .then(() => Promise.all([
          syncPendingMeals(),
          syncPendingWeightChecks(),
          syncPendingMedicationAdministrations(),
        ]))
        .catch(console.error);
      router.back();
    } catch (e) {
      console.error('[edit-event] save failed:', e);
      Alert.alert('Could not save', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const displayAttachmentUri = newAttachmentUri ?? existingAttachmentUri;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={`Edit ${config.label}`}
        left={
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} hitSlop={8}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            hitSlop={8}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* Time */}
          <SectionLabel label="Time" style={{ marginBottom: 4 }} />
          {showConfidenceControl ? (
            // Non-meal events can be re-classified witnessed/found after logging.
            <TimeConfidenceField
              mode={timeMode}
              onModeChange={handleTimeModeChange}
              point={occurredAt}
              pointSource={occurredAtSource}
              onPointChange={handlePointChange}
              foundMode={foundMode}
              onFoundModeChange={handleFoundModeChange}
              estimatedAt={estimatedAt}
              onEstimatedChange={setEstimatedAt}
              earliest={earliest}
              latest={foundLatest}
              onEarliestChange={setEarliest}
              onLatestChange={handleLatestChange}
            />
          ) : (
            // Meals are always witnessed — keep the plain point picker.
            <>
              <TouchableOpacity
                style={styles.timeRow}
                onPress={() => setShowTimePicker(!showTimePicker)}
                activeOpacity={0.7}
              >
                <Text style={styles.timeValue}>
                  {occurredAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  {'  '}
                  {formatTime(occurredAt)}
                  {occurredAtSource === 'exif' && (
                    <Text style={styles.exifAttribution}>
                      {'  ·  '}{formatExifAttribution(occurredAt.toISOString())}
                    </Text>
                  )}
                </Text>
                <Text style={styles.changeLabel}>Change</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={occurredAt}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_e: unknown, date?: Date) => {
                    if (Platform.OS === 'android') setShowTimePicker(false);
                    if (!date) return;
                    handlePointChange(date);
                  }}
                />
              )}
            </>
          )}

          {/* Photo */}
          <SectionLabel label="Photo" style={{ marginTop: theme.space3, marginBottom: 4 }} />
          {displayAttachmentUri ? (
            <TouchableOpacity style={styles.photoAttachedRow} onPress={() => setPhotoViewerVisible(true)} activeOpacity={0.8}>
              <Image source={{ uri: displayAttachmentUri }} style={styles.photoThumb} resizeMode="cover" />
              <View style={styles.photoAttachedMeta}>
                <Text style={styles.photoAttachedText}>Photo attached</Text>
                <Text style={styles.photoChangeText}>Tap to view</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.7}>
              <Camera size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
              <Text style={styles.photoRowText}>Attach a photo</Text>
            </TouchableOpacity>
          )}

          {/* Food (meal events only) */}
          {config.hasFood ? (
            <>
              <SectionLabel label="Food" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              <TouchableOpacity
                style={styles.foodRow}
                onPress={() => setShowFoodPicker(!showFoodPicker)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  {currentFoodProduct ? (
                    <>
                      <Text style={styles.foodProduct}>{currentFoodProduct}</Text>
                      {currentFoodBrand ? (
                        <Text style={styles.foodBrand}>{currentFoodBrand}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.foodPlaceholder}>No food selected</Text>
                  )}
                </View>
                <Text style={styles.changeLabel}>{showFoodPicker ? 'Done' : 'Change'}</Text>
              </TouchableOpacity>

              {showFoodPicker ? (
                <View style={styles.foodList}>
                  {foods.length === 0 ? (
                    <Text style={styles.foodEmpty}>No foods yet — they'll show up here as you log meals.</Text>
                  ) : null}
                  {foods.map((item: CachedFood) => {
                    const isSelected = item.id === currentFoodId;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.foodItem, isSelected && styles.foodItemSelected]}
                        onPress={() => {
                          setCurrentFoodId(item.id);
                          setCurrentFoodBrand(item.brand);
                          setCurrentFoodProduct(item.product_name);
                          setShowFoodPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.foodItemName, isSelected && styles.foodItemNameSelected]}>
                          {item.product_name}
                        </Text>
                        <Text style={[styles.foodItemBrand, isSelected && styles.foodItemBrandSelected]}>
                          {item.brand}
                        </Text>
                        {isSelected ? <Text style={styles.foodItemCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          {/* Intake (meal events only — includes treats, B-014) */}
          {config.hasFood ? (
            <>
              <SectionLabel label="Intake" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              <IntakeChipRow
                value={intakeRating}
                onChange={setIntakeRating}
                label={null}
              />
            </>
          ) : null}

          {/* Medication (dose events only) — parity with the meal Food + Intake
              blocks. Drug identity is read-only here (a per-dose drug swap is a
              mislog → Remove + re-log, not a field edit); the row links to the
              drug-library screen where a name/strength correction fixes every dose.
              Adherence + how-given are the editable dose fields. */}
          {isMedication && dose ? (
            <>
              <SectionLabel label="Medication" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              {dose.medicationItemId ? (
                <TouchableOpacity
                  style={styles.foodRow}
                  onPress={() => router.push(`/medication/${dose.medicationItemId}`)}
                  activeOpacity={0.7}
                  accessibilityRole="link"
                  accessibilityLabel={`View drug details for ${dose.genericName ?? config.label}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foodProduct}>{dose.genericName ?? config.label}</Text>
                    {[dose.brandName, dose.strength].filter(Boolean).length > 0 ? (
                      <Text style={styles.foodBrand}>
                        {[dose.brandName, dose.strength].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={18} color={theme.colorAccent} strokeWidth={2} />
                </TouchableOpacity>
              ) : (
                <View style={styles.foodRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foodProduct}>{dose.genericName ?? config.label}</Text>
                    {[dose.brandName, dose.strength].filter(Boolean).length > 0 ? (
                      <Text style={styles.foodBrand}>
                        {[dose.brandName, dose.strength].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}

              <SectionLabel label="Adherence" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              <AdherenceChipRow value={adherence} onChange={setAdherence} label={null} />

              <SectionLabel label="How given" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              <VehicleChipRow value={howGiven} onChange={setHowGiven} label={null} />
            </>
          ) : null}

          {/* Weight value (weight_check only — the value IS the entry, B-197) */}
          {isWeight ? (
            <>
              <SectionLabel label="Weight" style={{ marginTop: theme.space3, marginBottom: 4 }} />
              <View style={styles.weightRow}>
                <TextInput
                  style={styles.weightInput}
                  value={weightLbsStr}
                  onChangeText={setWeightLbsStr}
                  placeholder="e.g. 12.5"
                  placeholderTextColor={theme.colorTextSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <Text style={styles.weightUnitText}>lbs</Text>
              </View>
            </>
          ) : null}

          {/* Notes */}
          <SectionLabel label="Notes" style={{ marginTop: theme.space3, marginBottom: 4 }} />
          <TextInput
            style={styles.notesInput}
            placeholder="Add a note (optional)"
            placeholderTextColor={theme.colorTextSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fullscreen photo viewer */}
      <PhotoViewer
        visible={photoViewerVisible}
        uris={[displayAttachmentUri ?? null]}
        onClose={() => setPhotoViewerVisible(false)}
        onReplace={() => { setPhotoViewerVisible(false); handlePickPhoto(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  cancelBtn: {},
  cancelBtnText: {
    fontSize: 16,
    color: theme.colorTextSecondary,
  },
  saveBtn: {},
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorAccent,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  timeValue: {
    fontSize: 15,
    color: theme.colorTextPrimary,
  },
  changeLabel: {
    fontSize: 14,
    color: theme.colorAccent,
    fontWeight: theme.fontWeightMedium,
  },
  exifAttribution: {
    fontSize: 13,
    color: theme.colorTextTertiary,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  photoRowText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  photoAttachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radiusSmall,
  },
  photoAttachedMeta: {
    flex: 1,
    gap: 2,
  },
  photoAttachedText: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  photoChangeText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
    gap: theme.space2,
  },
  foodProduct: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodBrand: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  foodPlaceholder: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
  foodList: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    overflow: 'hidden',
    marginTop: 4,
  },
  foodEmpty: {
    fontSize: 14,
    color: theme.colorTextSecondary,
    padding: theme.space2,
    textAlign: 'center',
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  foodItemSelected: {
    backgroundColor: theme.colorNeutralDark,
  },
  foodItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorTextPrimary,
  },
  foodItemNameSelected: {
    color: '#fff',
  },
  foodItemBrand: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    marginRight: theme.space1,
  },
  foodItemBrandSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  foodItemCheck: {
    fontSize: 15,
    color: '#fff',
  },
  notesInput: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  weightInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colorTextPrimary,
    paddingVertical: theme.space2,
  },
  weightUnitText: {
    fontSize: 15,
    color: theme.colorTextSecondary,
  },
});
