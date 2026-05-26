import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../constants/theme';
import { FoodPicker } from '../components/log/FoodPicker';
import { TimeConfidenceField, TimeMode, FoundMode } from '../components/log/TimeConfidenceField';
import { EVENT_TYPES, EventTypeKey } from '../constants/eventTypes';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { useAttachmentStore } from '../store/attachmentStore';
import { useToastStore } from '../store/toastStore';
import { getDb, PickerFood } from '../lib/db';
import { supabase } from '../lib/supabase';
import { syncPendingEvents, syncPendingMeals } from '../lib/sync';
import { uploadPhoto, compressForUpload } from '../lib/storage';
import { triggerVomitAnalysis } from '../lib/analysis';
import { uuid, exifDateToISO, trustedPastExifIso, formatExifAttribution, formatTime, deriveOccurredAt, OccurredConfidence } from '../lib/utils';

type Step = 'type' | 'food' | 'symptom' | 'simple' | 'stool-type' | 'complete';

// B-010 — the time fields a logged event carries. occurred_at is always a
// single derived point; confidence + window bounds describe its certainty.
type TimeFields = {
  confidence: OccurredConfidence;
  occurredAt: Date;
  earliest: Date | null;
  latest: Date | null;
  source: 'manual' | 'exif' | 'now';
};

const TYPE_ICONS: Record<EventTypeKey, string> = {
  meal: '🍽',
  vomit: '🤢',
  diarrhea: '💩',
  stool_normal: '💩',
  lethargy: '😴',
  itch: '🐾',
  other: '➕',
};

const SEVERITY_CONFIG = [
  { value: 1, label: 'Mild' },
  { value: 2, label: '' },
  { value: 3, label: '' },
  { value: 4, label: '' },
  { value: 5, label: 'Severe' },
];

export default function LogModal() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  const { pendingAttachment, setPendingAttachment } = useAttachmentStore();
  const showToast = useToastStore((s) => s.show);
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<EventTypeKey | null>(null);

  // Photo attachment
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentTakenAt, setAttachmentTakenAt] = useState<string | null>(null);

  // Food state (set by the picker; used by handleConfirm)
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedFoodBrand, setSelectedFoodBrand] = useState<string | null>(null);
  const [selectedFoodProduct, setSelectedFoodProduct] = useState<string | null>(null);

  // Symptom state
  const [severity, setSeverity] = useState<number | null>(null);

  // Shared
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  // Provenance of `occurredAt`. Flips to 'exif' when a photo with
  // DateTimeOriginal is attached; flips to 'manual' the moment the user
  // touches the time picker. Default is 'manual' — clock value is `new Date()`
  // but the user has implicitly accepted that as their chosen time.
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('manual');
  const [showTimePicker, setShowTimePicker] = useState(false);

  // B-010 confidence state — used on the simple step (discovery-prone events).
  // 'saw' keeps the witnessed one-tap default; 'found' opens the window/estimate
  // path. occurredAt above doubles as the witnessed/estimated point.
  const [timeMode, setTimeMode] = useState<TimeMode>('saw');
  const [foundMode, setFoundMode] = useState<FoundMode>('before');
  const [earliest, setEarliest] = useState<Date | null>(null);
  const [foundLatest, setFoundLatest] = useState<Date>(() => new Date());
  // Estimated point is kept separate from `occurredAt` (the witnessed point)
  // so a guess entered in "Around a time" can never bleed into a witnessed log
  // if the owner toggles back to "Saw it happen".
  const [estimatedAt, setEstimatedAt] = useState<Date>(() => new Date());

  // Completion animation
  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  // Consume pending attachment from the FAB photo flow
  useEffect(() => {
    if (pendingAttachment) {
      setAttachmentUri(pendingAttachment.localUri);
      setAttachmentTakenAt(pendingAttachment.takenAt);
      const trustedIso = trustedPastExifIso(pendingAttachment.takenAt);
      if (trustedIso) {
        setOccurredAt(new Date(trustedIso));
        setOccurredAtSource('exif');
      }
      setPendingAttachment(null);
    }
  }, []);

  // Skip type selection when a type is pre-selected via route param (e.g. FAB "New meal")
  useEffect(() => {
    if (!typeParam) return;
    if (typeParam === 'meal') {
      setSelectedType('meal');
      setStep('food');
    } else if (typeParam in EVENT_TYPES) {
      const t = typeParam as EventTypeKey;
      setSelectedType(t);
      setStep(EVENT_TYPES[t].hasFood ? 'food' : 'simple');
    }
  }, [typeParam]);

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => router.back(), 1000);
    return () => clearTimeout(t);
  }, [step]);

  function handleTypeSelect(type: EventTypeKey) {
    setSelectedType(type);
    const config = EVENT_TYPES[type];
    if (config.hasFood) setStep('food');
    else if (type === 'stool_normal') setStep('stool-type');
    else setStep('simple');
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo access in Settings.');
      return;
    }
    Alert.alert('Attach photo', 'Choose a source', [
      {
        text: 'Take photo', onPress: async () => {
          const { status: cs } = await ImagePicker.requestCameraPermissionsAsync();
          if (cs !== 'granted') { Alert.alert('Camera access needed'); return; }
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
      exif: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAttachmentUri(asset.uri);

    const exifRaw = (asset.exif as Record<string, unknown> | undefined);
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    if (typeof dateRaw === 'string') {
      const iso = trustedPastExifIso(exifDateToISO(dateRaw));
      if (iso) {
        setAttachmentTakenAt(iso);
        setOccurredAt(new Date(iso));
        setOccurredAtSource('exif');
      }
    }
  }

  // One-tap log path from the new picker — bypasses state so it works
  // even before `selectedFoodId` has propagated through React. Provenance
  // is forced to 'now' (with a fresh new Date()) because the user never
  // saw the time picker on this path; the post-log toast offers the
  // "Change time" escape hatch. Exception: if a photo with EXIF was
  // attached before reaching the picker, preserve that provenance and
  // the EXIF-derived time — Dr. Chen relies on EXIF-stamped meals for
  // clinical trust, and clobbering it here would silently drop that.
  async function handlePickFood(food: PickerFood) {
    setSelectedFoodId(food.id);
    setSelectedFoodBrand(food.brand);
    setSelectedFoodProduct(food.product_name);
    const usingExif = occurredAtSource === 'exif';
    const effectiveOccurredAt = usingExif ? occurredAt : new Date();
    const result = await handleConfirm({
      foodId: food.id,
      foodBrand: food.brand,
      foodProduct: food.product_name,
      foodType: food.food_type ?? null,
      // Meals are inherently witnessed — you see yourself put the bowl down.
      // The B-010 found path does not apply (you don't "discover" a meal).
      timeFields: {
        confidence: 'witnessed',
        occurredAt: effectiveOccurredAt,
        earliest: null,
        latest: null,
        source: usingExif ? 'exif' : 'now',
      },
    });
    // Defer the toast past the 1s completion checkmark + modal dismiss so
    // it appears at the root layer (not occluded by the still-presented
    // modal on iOS) where the user can actually see and act on it. The
    // WSAVA intake chip row renders in the toast for food_type 'meal' and
    // 'treat' (B-014; treats added 2026-05-23). NOTE: every meal-entry
    // path must route through this toast — if a non-picker meal flow is
    // ever added (e.g. a manual quick-add), it must fire showToast too,
    // or the intake capture surface vanishes for that path.
    if (result) {
      const foodType = food.food_type === 'meal' || food.food_type === 'treat' || food.food_type === 'other'
        ? food.food_type
        : null;
      showToast(
        {
          eventId: result.eventId,
          occurredAt: result.occurredAt,
          foodType,
          intakeRating: null,
        },
        { delayMs: 1100 },
      );
    }
  }

  async function handleConfirm(override?: {
    foodId: string;
    foodBrand: string;
    foodProduct: string;
    foodType?: string | null;
    timeFields?: TimeFields;
  }): Promise<{ eventId: string; occurredAt: string } | null> {
    if (!activePet) return null;
    const foodId = override?.foodId ?? selectedFoodId;
    const foodBrand = override?.foodBrand ?? selectedFoodBrand;
    const foodProduct = override?.foodProduct ?? selectedFoodProduct;
    if (selectedType === 'meal' && !foodId) return null;
    // Meals pass their own witnessed time fields; the simple step derives from
    // the confidence affordance.
    const tf = override?.timeFields ?? buildTimeFields();
    const effectiveOccurredAt = tf.occurredAt;
    const effectiveSource = tf.source;
    const db = getDb();
    const eventId = uuid();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
          occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
          created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, 0)`,
      [eventId, activePet.id, selectedType!, effectiveOccurredAt.toISOString(),
       severity ?? null, notes.trim() || null, effectiveSource,
       tf.confidence, tf.earliest ? tf.earliest.toISOString() : null,
       tf.latest ? tf.latest.toISOString() : null, now, now]
    );
    if (selectedType === 'meal' && foodId) {
      const mealId = uuid();
      await db.runAsync(
        `INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, created_at, synced)
         VALUES (?, ?, ?, ?, 'unknown', ?, 0)`,
        [mealId, eventId, activePet.id, foodId, now]
      );
      await db.runAsync(
        `UPDATE food_items_cache SET last_used_at = ? WHERE id = ?`,
        [now, foodId]
      );
    }
    prependEvent({
      id: eventId,
      pet_id: activePet.id,
      event_type: selectedType!,
      occurred_at: effectiveOccurredAt.toISOString(),
      occurred_at_confidence: tf.confidence,
      occurred_at_earliest: tf.earliest ? tf.earliest.toISOString() : null,
      occurred_at_latest: tf.latest ? tf.latest.toISOString() : null,
      severity: severity ?? null,
      notes: notes.trim() || null,
      source: 'manual',
      deleted_at: null,
      created_at: now,
      updated_at: now,
      food_item_id: foodId,
      food_brand: foodBrand,
      food_product_name: foodProduct,
      food_type: override?.foodType ?? null,
      quantity: foodId ? 'unknown' : null,
    });

    // Save and upload photo attachment if present
    if (attachmentUri) {
      const attId = uuid();
      const storagePath = `${activePet.id}/${eventId}/${attId}.jpg`;
      await db.runAsync(
        `INSERT INTO event_attachments
           (id, event_id, pet_id, local_uri, storage_path, mime_type, taken_at, synced, created_at)
         VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
        [attId, eventId, activePet.id, attachmentUri, storagePath, attachmentTakenAt ?? null, now]
      );
      const isVomit = selectedType === 'vomit';
      // Compress before upload (longest edge ≤1600px, JPEG q75) so the file
      // stays well under Claude's 5 MB image cap and bounds storage. Runs in an
      // async block so it doesn't delay the completion animation below.
      (async () => {
        try {
          const uploadUri = await compressForUpload(attachmentUri);
          await uploadPhoto('nyx-event-attachments', storagePath, uploadUri);
          const { error: attErr } = await supabase.from('event_attachments').upsert({
            id: attId, event_id: eventId, pet_id: activePet.id,
            storage_path: storagePath, mime_type: 'image/jpeg', taken_at: attachmentTakenAt,
          }, { onConflict: 'id' });
          // Only mark synced + analyze if the row actually landed. supabase-js
          // returns errors rather than throwing, so an ignored error here is
          // what previously left rows flagged synced but absent from Supabase.
          // On failure leave synced=0 so the queue retries; the lazy detail-open
          // trigger will analyze once the row is up.
          if (attErr) { console.warn('[log] event_attachment upsert failed:', attErr.message); return; }
          await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
          // B-027: cache-on-log. The photo + attachment row are now in Supabase,
          // so the analyze-vomit function can read them. Fire-and-forget.
          if (isVomit) triggerVomitAnalysis(eventId).catch(() => {});
        } catch (e) {
          console.error('[log] photo upload failed:', e);
        }
      })();
    }

    setStep('complete');
    syncPendingEvents()
      .then(() => syncPendingMeals())
      .catch(console.error);
    return { eventId, occurredAt: effectiveOccurredAt.toISOString() };
  }

  function handleBack() {
    if (step === 'type') { router.back(); return; }
    if (step === 'food' || step === 'symptom' || step === 'simple' || step === 'stool-type') {
      setSelectedType(null);
      setSeverity(null);
      // Reset B-010 confidence state so the next event starts witnessed.
      setTimeMode('saw');
      setFoundMode('before');
      setEarliest(null);
      setStep('type');
      return;
    }
  }

  const petName = activePet?.name ?? 'your pet';

  // ── Completion ──────────────────────────────────────────────────────────────

  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>Logged</Animated.Text>
      </View>
    );
  }

  // ── Shared sub-components ───────────────────────────────────────────────────

  function renderPhotoAttachRow() {
    if (attachmentUri) {
      return (
        <TouchableOpacity style={styles.photoAttachedRow} onPress={handlePickPhoto} activeOpacity={0.8}>
          <Image source={{ uri: attachmentUri }} style={styles.photoThumb} resizeMode="cover" />
          <Text style={styles.photoAttachedText}>Photo attached · tap to replace</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.8}>
        <Text style={styles.photoRowIcon}>📷</Text>
        <Text style={styles.photoRowText}>Attach photo</Text>
      </TouchableOpacity>
    );
  }

  // Provenance flips only on an actual value change, so tapping the row to
  // peek at the picker doesn't silently drop the EXIF attribution.
  function handleTimePickerChange(date?: Date) {
    if (!date) return;
    if (occurredAtSource === 'exif' && date.getTime() !== occurredAt.getTime()) {
      setOccurredAtSource('manual');
    }
    setOccurredAt(date);
  }

  function handleTimeModeChange(m: TimeMode) {
    if (m === 'found') {
      setFoundMode('before');
      // A photo of discovered evidence is EXIF-stamped at discovery — the
      // window's latest edge — so seed from it; otherwise default to now.
      setFoundLatest(occurredAtSource === 'exif' ? occurredAt : new Date());
    }
    setTimeMode(m);
  }

  function handleFoundModeChange(m: FoundMode) {
    // Seed the estimate from when they found it, as a starting point to adjust.
    if (m === 'around' && foundMode !== 'around') {
      setEstimatedAt(foundLatest);
    }
    // Seed a sane lower bound the first time the owner opens a window.
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

  // Derive the stored time fields from the affordance the owner touched.
  // occurred_at is always a single point so every existing reader keeps
  // working; confidence + window bounds carry the uncertainty (B-010).
  function buildTimeFields(): TimeFields {
    if (timeMode === 'saw') {
      return { confidence: 'witnessed', occurredAt, earliest: null, latest: null, source: occurredAtSource };
    }
    if (foundMode === 'around') {
      return { confidence: 'estimated', occurredAt: estimatedAt, earliest: null, latest: null, source: 'manual' };
    }
    // 'before' (open-ended) or 'between' (bounded) -> window
    const e = foundMode === 'between' ? earliest : null;
    const l = foundLatest;
    return {
      confidence: 'window',
      occurredAt: deriveOccurredAt({ confidence: 'window', point: occurredAt, earliest: e, latest: l }),
      earliest: e,
      latest: l,
      source: 'manual',
    };
  }

  function renderTimeRow() {
    return (
      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>
          {occurredAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          {' · '}
          {formatTime(occurredAt)}
          {occurredAtSource === 'exif' && (
            <Text style={styles.exifAttribution}>
              {'  ·  '}{formatExifAttribution(occurredAt.toISOString())}
            </Text>
          )}
        </Text>
        <TouchableOpacity onPress={() => setShowTimePicker(!showTimePicker)} hitSlop={12}>
          <Text style={styles.changeTimeBtn}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderNotesInput() {
    return (
      <TextInput
        style={styles.notesInput}
        placeholder="Add a note (optional)"
        placeholderTextColor={theme.colorTextSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={300}
      />
    );
  }

  // ── Type selection ──────────────────────────────────────────────────────────

  if (step === 'type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Log for {petName}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        {attachmentUri && (
          <View style={styles.attachmentBanner}>
            <Image source={{ uri: attachmentUri }} style={styles.bannerThumb} resizeMode="cover" />
            <Text style={styles.bannerText}>{petName}'s photo is attached — which event is this for?</Text>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.typeGrid} showsVerticalScrollIndicator={false}>
          {(Object.entries(EVENT_TYPES) as [EventTypeKey, typeof EVENT_TYPES[EventTypeKey]][])
            // diarrhea is accessible via the stool-type sub-step; hide it from the top-level grid
            .filter(([key]) => key !== 'diarrhea')
            .map(([key, config]) => (
            <TouchableOpacity
              key={key}
              style={styles.typeCard}
              onPress={() => handleTypeSelect(key)}
              activeOpacity={0.7}
            >
              <Text style={styles.typeIcon}>{TYPE_ICONS[key]}</Text>
              <Text style={styles.typeLabel}>{key === 'stool_normal' ? 'Stool' : config.label}</Text>
            </TouchableOpacity>
          ))}
          {!attachmentUri && (
            <TouchableOpacity
              style={[styles.typeCard, styles.typeCardPhoto]}
              onPress={handlePickPhoto}
              activeOpacity={0.7}
            >
              <Text style={styles.typeIcon}>📷</Text>
              <Text style={styles.typeLabel}>Attach photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Food picker (Recent / Library / + Add new) ─────────────────────────────

  if (step === 'food') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>What did {petName} eat?</Text>
          <View style={styles.headerSpacer} />
        </View>
        {activePet && (
          <FoodPicker
            petId={activePet.id}
            onPickFood={handlePickFood}
            // Photo-first food capture (Step 5). On confirm, food-capture
            // logs the meal itself and routes back home — log.tsx is bypassed.
            onAddNew={() => router.push('/food-capture?fromLog=1')}
            // Long-press on a tile opens the editable detail screen. The
            // one-tap log path is preserved on regular tap.
            onOpenDetail={(food) => router.push(`/food/${food.id}`)}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Stool sub-type (normal vs loose) ───────────────────────────────────────

  if (step === 'stool-type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>What kind of stool?</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.stoolChoiceContainer}>
          <TouchableOpacity
            style={styles.stoolChoiceBtn}
            onPress={() => { setSelectedType('stool_normal'); setStep('simple'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.stoolChoiceEmoji}>💩</Text>
            <Text style={styles.stoolChoiceLabel}>Normal</Text>
            <Text style={styles.stoolChoiceHint}>Formed, typical</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stoolChoiceBtn, styles.stoolChoiceBtnLoose]}
            onPress={() => { setSelectedType('diarrhea'); setStep('simple'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.stoolChoiceEmoji}>💩</Text>
            <Text style={styles.stoolChoiceLabel}>Loose</Text>
            <Text style={styles.stoolChoiceHint}>Soft, runny, or diarrhea</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Severity (symptom events) ───────────────────────────────────────────────

  if (step === 'symptom') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    const canConfirm = severity !== null;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{eventLabel}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.symptomScroll} keyboardShouldPersistTaps="handled">
            {renderPhotoAttachRow()}
            <Text style={styles.severityHeading}>How severe?</Text>
            <View style={styles.severityRow}>
              {SEVERITY_CONFIG.map(({ value, label }) => {
                const isSelected = severity === value;
                const fillOpacity = 0.15 + (value - 1) * 0.175;
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.severityItem}
                    onPress={() => setSeverity(value)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.severityCircle,
                      { backgroundColor: isSelected ? theme.colorNeutralDark : `rgba(26,26,26,${fillOpacity})` },
                      isSelected && styles.severityCircleSelected,
                    ]}>
                      <Text style={[styles.severityNum, isSelected && styles.severityNumSelected]}>
                        {value}
                      </Text>
                    </View>
                    <Text style={styles.severityLabel}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.divider} />
            {renderNotesInput()}
            {renderTimeRow()}
            {showTimePicker && (
              <DateTimePicker
                value={occurredAt}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e, date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  handleTimePickerChange(date);
                }}
              />
            )}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={() => handleConfirm()}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmBtnText}>Log {eventLabel.toLowerCase()}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Simple events (stool, other) ────────────────────────────────────────────

  if (step === 'simple') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{eventLabel}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.simpleScroll} keyboardShouldPersistTaps="handled">
            {renderPhotoAttachRow()}
            {renderNotesInput()}
            <TimeConfidenceField
              mode={timeMode}
              onModeChange={handleTimeModeChange}
              point={occurredAt}
              pointSource={occurredAtSource}
              onPointChange={handleTimePickerChange}
              foundMode={foundMode}
              onFoundModeChange={handleFoundModeChange}
              estimatedAt={estimatedAt}
              onEstimatedChange={setEstimatedAt}
              earliest={earliest}
              latest={foundLatest}
              onEarliestChange={setEarliest}
              onLatestChange={handleLatestChange}
            />
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirm()}>
              <Text style={styles.confirmBtnText}>
                {eventLabel === 'Other' ? 'Log event' : `Log ${eventLabel.toLowerCase()}`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
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
  closeBtn: {
    width: 32,
    alignItems: 'flex-end',
  },
  closeBtnText: {
    fontSize: 18,
    color: theme.colorTextSecondary,
  },
  backBtn: {
    width: 32,
  },
  backBtnText: {
    fontSize: 22,
    color: theme.colorNeutralDark,
  },
  headerSpacer: {
    width: 32,
  },

  // ── Type grid ──
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.space2,
    gap: theme.space2,
    justifyContent: 'space-between',
  },
  typeCard: {
    width: '47%',
    aspectRatio: 1.3,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusMedium,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space1,
  },
  typeIcon: {
    fontSize: 28,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },

  // ── Notes input ──
  notesInput: {
    fontSize: 15,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    minHeight: 44,
    maxHeight: 88,
  },

  // ── Time row ──
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  changeTimeBtn: {
    fontSize: 14,
    color: theme.colorAccent,
  },
  exifAttribution: {
    fontSize: 13,
    color: theme.colorTextTertiary,
  },

  // ── Confirm button ──
  confirmBtn: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: theme.fontWeightMedium,
    color: '#fff',
  },

  // ── Severity ──
  symptomScroll: {
    padding: theme.space3,
    gap: theme.space3,
  },
  severityHeading: {
    fontSize: 22,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space1,
  },
  severityItem: {
    alignItems: 'center',
    gap: 6,
  },
  severityCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  severityCircleSelected: {
    borderColor: theme.colorNeutralDark,
  },
  severityNum: {
    fontSize: 18,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
  severityNumSelected: {
    color: '#fff',
  },
  severityLabel: {
    fontSize: 11,
    color: theme.colorTextSecondary,
    height: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colorBorder,
  },

  // ── Simple events ──
  simpleScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  // ── Bottom action bar ──
  bottomAction: {
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    padding: theme.space2,
  },

  // ── Photo attachment ──
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    paddingVertical: theme.space1,
  },
  photoRowIcon: { fontSize: 16 },
  photoRowText: {
    fontSize: 14,
    color: theme.colorTextSecondary,
  },
  photoAttachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: theme.space1,
  },
  photoThumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radiusSmall,
  },
  photoAttachedText: {
    fontSize: 13,
    color: theme.colorTextSecondary,
    flex: 1,
  },
  // Attachment banner shown at top of type-selection when photo pre-attached
  attachmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    backgroundColor: theme.colorNeutralLight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  bannerThumb: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSmall,
  },
  bannerText: {
    fontSize: 14,
    color: theme.colorTextSecondary,
    flex: 1,
    lineHeight: 20,
  },
  // Photo card in the type grid
  typeCardPhoto: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderStyle: 'dashed',
    backgroundColor: theme.colorSurface,
  },
  // ── Stool choice ──
  stoolChoiceContainer: {
    flex: 1,
    flexDirection: 'row',
    padding: theme.space2,
    gap: theme.space2,
    alignItems: 'stretch',
  },
  stoolChoiceBtn: {
    flex: 1,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingVertical: theme.space4,
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  stoolChoiceBtnLoose: {
    backgroundColor: theme.colorEventSymptomLight,
    borderColor: theme.colorEventSymptomLight,
  },
  stoolChoiceEmoji: {
    fontSize: 36,
  },
  stoolChoiceLabel: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  stoolChoiceHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
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
  checkMark: {
    fontSize: 36,
    color: '#fff',
  },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark,
  },
});
