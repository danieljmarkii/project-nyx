// Food capture + AI-confirm flow. Replaces the legacy text-form food add.
// Hero path: front-of-package snap → optional ingredients + barcode →
// upload + Edge Function extract → confirm brand/product → meal logged.
//
// Constraints:
// - Client-side compression only (compressForUpload in lib/storage.ts).
// - Never block meal logging on extraction — Edge Function runs async and
//   the food_items row flips status in the background.
// - Bucket is private; reads via getSignedUrl.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../constants/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { FilterChip } from '../components/ui/FilterChip';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { insertMeal } from '../lib/meals';
import { uploadPhoto, compressForUpload } from '../lib/storage';
import { uuid, exifDateToISO, trustedPastExifIso, formatExifAttribution } from '../lib/utils';

type CaptureStep =
  | 'intro'
  | 'review'
  | 'uploading'
  | 'confirm'
  | 'edit'
  | 'complete';

type OptionalSlot = 'ingredients' | 'barcode';

interface CapturedPhoto {
  localUri: string;
  storagePath: string;
  width?: number;
  height?: number;
  exifIso?: string | null;
}

const FOOD_FORMATS = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze-dried' },
  { value: 'jerky', label: 'Jerky' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
  // B-102: people-food given to a pet (deli meat, rotisserie chicken). Sits
  // after 'fresh_cooked' to match the food_format enum order (migration 019).
  { value: 'human_food', label: 'Human food' },
  { value: 'topper', label: 'Topper' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

// Usage classification (B-011). Distinct from `format` (physical form).
// Defaults to 'meal' on the confirm screen — most adds are meals, treats are
// the explicit user action. NULL is never set from this screen; it's reserved
// for legacy rows the user hasn't classified yet on the food detail screen.
type FoodType = 'meal' | 'treat' | 'other';
const FOOD_TYPES: { value: FoodType; label: string }[] = [
  { value: 'meal',  label: 'Meal' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
];

// Map AI 'format' enum to the cache's format key (Edge Function emits the
// canonical pet-nutrition enum; cache uses the picker-friendly variant).
// Mirrors AI_FORMAT_TO_DB in extract-food-from-photo/index.ts — keep in sync.
function mapAiFormat(ai: string | null | undefined): string {
  switch (ai) {
    case 'dry':          return 'dry_kibble';
    case 'wet':          return 'wet_canned';
    case 'raw':          return 'raw';
    case 'freeze_dried': return 'freeze_dried';
    case 'jerky':        return 'jerky';       // B-103 — the Edge Function already maps jerky; the client had dropped it to 'other'
    case 'human_food':   return 'human_food';  // B-102 PR 3 — snapped people-food container
    case 'treats':       return 'treat';
    case 'supplement':   return 'topper';
    default:             return 'other';
  }
}

export default function FoodCaptureScreen() {
  const { activePet } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  const { fromLog } = useLocalSearchParams<{ fromLog?: string }>();
  const cameFromMealLog = fromLog === '1';

  const [step, setStep] = useState<CaptureStep>('intro');
  const [foodId] = useState<string>(() => uuid());

  const [frontPhoto, setFrontPhoto] = useState<CapturedPhoto | null>(null);
  const [ingredientsPhoto, setIngredientsPhoto] = useState<CapturedPhoto | null>(null);
  const [barcodePhoto, setBarcodePhoto] = useState<CapturedPhoto | null>(null);
  // Tracks slots the user has explicitly skipped on the review screen so we
  // don't re-encourage them after a Skip tap. Filling a slot via the tile
  // (out of order) doesn't need to live here — `*Photo` state is the truth.
  const [skippedSlots, setSkippedSlots] = useState<Set<OptionalSlot>>(() => new Set());

  // Next slot the review screen should encourage, or null if the user has
  // either captured or skipped both optional shots.
  const nextEncouragedSlot: OptionalSlot | null =
    !ingredientsPhoto && !skippedSlots.has('ingredients') ? 'ingredients'
    : !barcodePhoto    && !skippedSlots.has('barcode')    ? 'barcode'
    : null;

  // Extraction state — populated after Edge Function returns.
  const [extracting, setExtracting] = useState(false);
  const [extractedBrand, setExtractedBrand] = useState<string>('');
  const [extractedProduct, setExtractedProduct] = useState<string>('');
  const [extractedFormat, setExtractedFormat] = useState<string>('dry_kibble');
  // Default to 'meal' — the common case. User taps a chip to override.
  const [foodType, setFoodType] = useState<FoodType>('meal');
  const [extractionFailed, setExtractionFailed] = useState(false);

  // Meal-time override on the confirm screen. Initialised lazily on entry to
  // the confirm step — see runUploadAndExtract. Provenance is 'exif' when the
  // front photo had DateTimeOriginal, 'now' otherwise, and flips to 'manual'
  // the moment the user opens the time editor.
  const [mealOccurredAt, setMealOccurredAt] = useState<Date>(() => new Date());
  const [mealOccurredAtSource, setMealOccurredAtSource] = useState<'exif' | 'now' | 'manual'>('now');
  const [showMealTimePicker, setShowMealTimePicker] = useState(false);

  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  // Submission guard — prevents double-tap on "Looks right" / "Save" from
  // writing two events for the same meal.
  const submitting = useRef(false);

  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    // dismissAll() unwinds both the food-capture modal and the underlying
    // meal-log picker so the user lands on Home, not on a stale picker.
    const t = setTimeout(() => router.dismissAll(), 900);
    return () => clearTimeout(t);
  }, [step]);

  // Captures a photo for a slot. When `presetSource` is supplied (the intro
  // screen, where Take photo / Choose from library are explicit on-screen
  // buttons) we go straight to that source — no action sheet. When it's
  // omitted (the review screen's optional ingredients/barcode slots) we fall
  // back to the source chooser so those single CTAs still offer both paths.
  // Returning null means the user cancelled at any point in the chain.
  async function pickPhoto(
    slot: 'front' | 'ingredients' | 'barcode',
    presetSource?: 'camera' | 'library',
  ): Promise<CapturedPhoto | null> {
    const source = presetSource ?? await new Promise<'camera' | 'library' | null>((resolve) => {
      Alert.alert(
        'Add photo',
        undefined,
        [
          { text: 'Take photo', onPress: () => resolve('camera') },
          { text: 'Choose from library', onPress: () => resolve('library') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });
    if (!source) return null;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera access needed',
          'Allow camera access in Settings, choose from your library, or add this food manually.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enter manually', onPress: () => setStep('edit') },
          ],
        );
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Allow photo access in Settings to choose a photo.');
        return null;
      }
    }

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      exif: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];

    const exifRaw = asset.exif as Record<string, unknown> | undefined;
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    // trustedPastExifIso drops future-dated EXIF (wrong camera clock) so we
    // never seed a meal time past `now`.
    const exifIso = typeof dateRaw === 'string'
      ? trustedPastExifIso(exifDateToISO(dateRaw))
      : null;

    const slotIndex = slot === 'front' ? 0 : slot === 'ingredients' ? 1 : 2;
    return {
      localUri: asset.uri,
      storagePath: `${foodId}/${slotIndex}-${slot}.jpg`,
      width: asset.width,
      height: asset.height,
      exifIso,
    };
  }

  async function handleSnapFront(source: 'camera' | 'library') {
    const photo = await pickPhoto('front', source);
    if (!photo) return;
    setFrontPhoto(photo);
    setStep('review');
  }

  // Primary CTA on the review screen — captures the next encouraged slot.
  // Doesn't auto-advance; the review screen will re-render with the next
  // encouragement (or the Continue CTA) once state updates.
  async function handleSnapNext() {
    if (!nextEncouragedSlot) return;
    const photo = await pickPhoto(nextEncouragedSlot);
    if (!photo) return;
    if (nextEncouragedSlot === 'ingredients') setIngredientsPhoto(photo);
    else                                       setBarcodePhoto(photo);
  }

  function handleSkipNext() {
    if (!nextEncouragedSlot) return;
    setSkippedSlots((prev) => new Set(prev).add(nextEncouragedSlot));
  }

  // Tile-tap from the PhotoChecklist — sets the chosen slot's photo without
  // changing step. Filling a slot also clears its skipped flag so the review
  // CTA reflects reality.
  async function handleSlotTap(slot: 'front' | 'ingredients' | 'barcode') {
    const photo = await pickPhoto(slot);
    if (!photo) return;
    if (slot === 'front')            setFrontPhoto(photo);
    else if (slot === 'ingredients') setIngredientsPhoto(photo);
    else                             setBarcodePhoto(photo);
    if (slot !== 'front') {
      setSkippedSlots((prev) => {
        if (!prev.has(slot)) return prev;
        const next = new Set(prev);
        next.delete(slot);
        return next;
      });
    }
  }

  // Upload all captured photos and kick off async extraction. The food_items
  // row is inserted with status='pending' before extraction is invoked so the
  // realtime subscription (Step 6) has something to watch even on slow Claude.
  async function runUploadAndExtract(
    front: CapturedPhoto,
    ingredients: CapturedPhoto | null,
    barcode: CapturedPhoto | null,
  ) {
    setStep('uploading');
    setExtracting(true);
    setExtractionFailed(false);

    // Seed the meal time up-front from the front photo's EXIF (if any) so the
    // manual-edit fallback path inherits the right provenance even when AI
    // extraction fails and the user never sees the confirm screen.
    if (front.exifIso) {
      setMealOccurredAt(new Date(front.exifIso));
      setMealOccurredAtSource('exif');
    } else {
      setMealOccurredAt(new Date());
      setMealOccurredAtSource('now');
    }

    const photos = [front, ingredients, barcode].filter((p): p is CapturedPhoto => p !== null);
    const storagePaths = photos.map((p) => p.storagePath);

    try {
      // Compress + upload all photos in parallel
      await Promise.all(photos.map(async (p) => {
        const compressedUri = await compressForUpload(p.localUri, p.width, p.height);
        await uploadPhoto('nyx-food-photos', p.storagePath, compressedUri);
      }));

      // Insert pending food_items row. The brand/product_name/format columns
      // are NOT NULL on the table, so we seed placeholders that the Edge
      // Function overwrites on extraction success. created_by_user_id is
      // required by the RLS insert policy.
      const { error: insertError } = await supabase.from('food_items').insert({
        id: foodId,
        brand: 'Extracting…',
        product_name: 'Extracting…',
        format: 'other',
        // food_type is intentionally NOT set here — the user picks it on the
        // confirm screen. commitFood writes it through to food_items on save.
        created_by_user_id: user?.id ?? null,
        photo_paths: storagePaths,
        ai_extraction_status: 'pending',
        source: 'ai_extracted',
      });
      if (insertError) {
        // If the row already exists (retry path), continue — extraction can still run.
        console.warn('[food-capture] food_items insert:', insertError.message);
      }

      // Invoke extraction. We await it for the confirm screen, but don't block
      // the meal log on it — if it errors, we fall through to manual edit.
      const { data, error } = await supabase.functions.invoke('extract-food-from-photo', {
        body: { food_item_id: foodId, photo_paths: storagePaths },
      });

      if (error || !data?.extraction) {
        console.warn('[food-capture] extraction failed:', error?.message);
        setExtractionFailed(true);
        setStep('edit');
        return;
      }

      const ex = data.extraction;
      setExtractedBrand(ex.brand ?? '');
      setExtractedProduct(ex.product_name ?? '');
      setExtractedFormat(mapAiFormat(ex.format));
      // Seed meal time from EXIF if available; otherwise fall back to now.
      if (front.exifIso) {
        setMealOccurredAt(new Date(front.exifIso));
        setMealOccurredAtSource('exif');
      } else {
        setMealOccurredAt(new Date());
        setMealOccurredAtSource('now');
      }
      setStep('confirm');
    } catch (err) {
      console.error('[food-capture] upload/extract error:', err);
      setExtractionFailed(true);
      setStep('edit');
    } finally {
      setExtracting(false);
    }
  }

  // Write the food into the local cache and (if from the meal-log flow) log
  // the meal immediately. EXIF from the front-of-package photo seeds the
  // meal's occurred_at — falls back to new Date() per the existing pattern.
  async function commitFood(brand: string, product: string, format: string, type: FoodType) {
    if (!brand.trim() || !product.trim()) return;
    if (submitting.current) return; // guard against double-tap
    submitting.current = true;
    try {
      await commitFoodInner(brand, product, format, type);
    } catch (err) {
      console.error('[food-capture] commit failed:', err);
      submitting.current = false; // allow retry
    }
  }

  async function commitFoodInner(brand: string, product: string, format: string, type: FoodType) {
    const db = getDb();
    // `now` stamps the food_items_cache row below. The meal's event/meal rows get
    // their own `now` from insertMeal (returned as mealNow) — a sub-millisecond
    // split with no LWW impact, kept separate so the helper owns its timestamps.
    const now = new Date().toISOString();
    const frontStoragePath = frontPhoto?.storagePath ?? null;
    // ON CONFLICT DO UPDATE, not INSERT OR REPLACE: on an edit of an existing
    // food, REPLACE would null the columns not listed here — last_used_at
    // (local-only recency, unrecoverable once lost) and the AI-extracted
    // primary_protein/flags hydrated from the server. Update only what this
    // screen owns; leave the rest intact.
    await db.runAsync(
      `INSERT INTO food_items_cache
         (id, brand, product_name, format, food_type, photo_path, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         brand = excluded.brand,
         product_name = excluded.product_name,
         format = excluded.format,
         food_type = excluded.food_type,
         photo_path = excluded.photo_path,
         cached_at = excluded.cached_at`,
      [foodId, brand.trim(), product.trim(), format, type, frontStoragePath, now],
    );

    // If extraction didn't run (manual path), the row may not exist remotely
    // yet — upsert with the user-confirmed values. If it does exist (AI path),
    // the Edge Function already wrote richer fields; we only patch when user
    // edited via the "Edit" screen.
    supabase.from('food_items').upsert({
      id: foodId,
      brand: brand.trim(),
      product_name: product.trim(),
      format,
      food_type: type,
      created_by_user_id: user?.id ?? null,
      photo_paths: frontPhoto ? [frontPhoto.storagePath, ingredientsPhoto?.storagePath, barcodePhoto?.storagePath].filter(Boolean) : [],
      ai_extraction_status: frontPhoto ? (extractionFailed ? 'failed' : 'completed') : 'manual',
      source: frontPhoto && !extractionFailed ? 'ai_extracted' : 'user',
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[food-capture] upsert failed:', error.message);
    });

    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (cameFromMealLog && pet) {
      // mealOccurredAt is seeded from EXIF (or now) on confirm-screen entry,
      // and may have been overridden by the user via the date-time picker —
      // in which case mealOccurredAtSource will have flipped to 'manual'.
      // insertMeal owns the event+meal write, the sync push, and the AI-Signal
      // regen (B-059) so this path can't drift from the others.
      const { eventId, occurredAtIso, now: mealNow } = await insertMeal({
        petId: pet.id,
        foodId,
        occurredAt: mealOccurredAt,
        occurredAtSource: mealOccurredAtSource,
      });
      prependEvent({
        id: eventId,
        pet_id: pet.id,
        event_type: 'meal',
        occurred_at: occurredAtIso,
        occurred_at_confidence: 'witnessed',
        severity: null,
        notes: null,
        source: 'manual',
        deleted_at: null,
        created_at: mealNow,
        updated_at: mealNow,
        food_item_id: foodId,
        food_brand: brand.trim(),
        food_product_name: product.trim(),
        food_type: type,
        quantity: 'unknown',
      });
    }

    setStep('complete');
  }

  function handleManualEntry() {
    setExtractedBrand('');
    setExtractedProduct('');
    setExtractedFormat('dry_kibble');
    setStep('edit');
  }

  // ── Completion ──
  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>
          {cameFromMealLog ? 'Logged' : 'Added'}
        </Animated.Text>
      </View>
    );
  }

  // ── Intro ──
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" onClose={() => router.back()} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <Text style={styles.introHeading}>Add the front of the package</Text>
          <Text style={styles.introBody}>
            A clear shot of the front lets us read the label. The ingredients
            and barcode are optional but make the entry more useful later.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleSnapFront('camera')} activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>📷</Text>
            <Text style={styles.primaryBtnText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => handleSnapFront('library')} activeOpacity={0.85}>
            <Text style={styles.outlineBtnIcon}>🖼</Text>
            <Text style={styles.outlineBtnText}>Choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={handleManualEntry} hitSlop={8}>
            <Text style={styles.linkBtnText}>Enter manually</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Review: tile checklist + next-encouraged-slot CTA ──
  // One screen for both ingredients and barcode encouragement. The CTA and
  // copy are computed from `nextEncouragedSlot` so tile-taps that fill a
  // slot out of order never leave the CTA pointing at a slot that's already
  // captured.
  if (step === 'review') {
    const heading = nextEncouragedSlot === 'ingredients' ? 'Add the ingredients label'
                  : nextEncouragedSlot === 'barcode'     ? 'Add the barcode'
                  : 'Ready to read the label';
    const body = nextEncouragedSlot === 'ingredients'
      ? 'Optional, but lets us extract the full ingredients list. You can skip and add it later.'
      : nextEncouragedSlot === 'barcode'
      ? 'A clear shot of the barcode helps the AI confirm the exact product. Optional.'
      : 'We\'ll read the front of the package and confirm with you.';
    const ctaLabel = nextEncouragedSlot === 'ingredients' ? 'Add ingredients photo'
                   : nextEncouragedSlot === 'barcode'     ? 'Add barcode photo'
                   : 'Continue';
    const ctaAction = nextEncouragedSlot
      ? handleSnapNext
      : () => runUploadAndExtract(frontPhoto!, ingredientsPhoto, barcodePhoto);
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" onBack={() => setStep('intro')} />
        <ScrollView contentContainerStyle={styles.introScroll}>
          <PhotoChecklist
            front={frontPhoto}
            ingredients={ingredientsPhoto}
            barcode={barcodePhoto}
            onSlotTap={handleSlotTap}
          />
          <Text style={styles.introHeading}>{heading}</Text>
          <Text style={styles.introBody}>{body}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={ctaAction} activeOpacity={0.85}>
            {nextEncouragedSlot && <Text style={styles.primaryBtnIcon}>📷</Text>}
            <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
          </TouchableOpacity>
          {nextEncouragedSlot && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleSkipNext}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>Skip</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Uploading + extracting ──
  if (step === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colorAccent} />
          <Text style={styles.loadingText}>
            {extracting ? 'Reading the label…' : 'Uploading…'}
          </Text>
          <Text style={styles.loadingHint}>This usually takes a few seconds.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Confirm extracted brand + product ──
  if (step === 'confirm') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Confirm" />
        <ScrollView contentContainerStyle={styles.confirmScroll}>
          {frontPhoto && (
            <View style={styles.confirmHero}>
              <Image source={{ uri: frontPhoto.localUri }} style={styles.confirmPhoto} resizeMode="cover" />
              <View style={styles.confirmOverlay}>
                <Text style={styles.confirmBrand} numberOfLines={1}>{extractedBrand}</Text>
                <Text style={styles.confirmProduct} numberOfLines={2}>{extractedProduct}</Text>
              </View>
            </View>
          )}
          <Text style={styles.confirmCaption}>Is this right?</Text>
          <SectionLabel label="Type" />
          <View style={styles.foodTypeRow}>
            {FOOD_TYPES.map((t) => (
              <FilterChip
                key={t.value}
                label={t.label}
                active={foodType === t.value}
                onPress={() => setFoodType(t.value)}
                variant="filled"
              />
            ))}
          </View>
          {/* Meal time is meaningful only when this capture also logs a meal.
              In B-110 add-only mode (no `fromLog`) no meal is written, so the
              time picker would set a value nothing consumes — hide it. */}
          {cameFromMealLog && (
            <>
              <TouchableOpacity
                style={styles.mealTimeRow}
                onPress={() => setShowMealTimePicker((v) => !v)}
                activeOpacity={0.7}
                hitSlop={12}
              >
                <Text style={styles.mealTimeText}>
                  {mealOccurredAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {mealOccurredAtSource === 'exif' ? (
                    <Text style={styles.mealTimeAttribution}>
                      {'  ·  '}{formatExifAttribution(mealOccurredAt.toISOString())}
                    </Text>
                  ) : null}
                </Text>
                <Text style={styles.mealTimeChange}>Change</Text>
              </TouchableOpacity>
              {showMealTimePicker && (
                <DateTimePicker
                  value={mealOccurredAt}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_e, date) => {
                    if (Platform.OS === 'android') setShowMealTimePicker(false);
                    if (!date) return;
                    // Provenance flips only on an actual value change so a peek-tap
                    // doesn't silently drop the EXIF attribution.
                    if (mealOccurredAtSource === 'exif' && date.getTime() !== mealOccurredAt.getTime()) {
                      setMealOccurredAtSource('manual');
                    }
                    setMealOccurredAt(date);
                  }}
                />
              )}
            </>
          )}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => commitFood(extractedBrand, extractedProduct, extractedFormat, foodType)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Looks right</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('edit')}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Edit</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Edit / manual entry ──
  if (step === 'edit') {
    const canSave = extractedBrand.trim().length > 0 && extractedProduct.trim().length > 0;
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Edit food"
          // Only return to Confirm if there's valid AI-extracted data to show
          // — when extraction failed, that screen would be empty.
          onBack={frontPhoto && !extractionFailed ? () => setStep('confirm') : () => router.back()}
        />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {extractionFailed && (
              <View style={styles.failedBanner}>
                <Text style={styles.failedBannerText}>
                  Couldn't read the label automatically. You can fill it in below — we'll retry extraction in the background.
                </Text>
              </View>
            )}
            <SectionLabel label="Brand" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Royal Canin"
              placeholderTextColor={theme.colorTextSecondary}
              value={extractedBrand}
              onChangeText={setExtractedBrand}
              autoCapitalize="words"
            />
            <SectionLabel label="Product name" />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Gastrointestinal Adult"
              placeholderTextColor={theme.colorTextSecondary}
              value={extractedProduct}
              onChangeText={setExtractedProduct}
              autoCapitalize="words"
            />
            <SectionLabel label="Format" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatRow}>
              {FOOD_FORMATS.map((f) => (
                <View key={f.value} style={{ marginRight: theme.space1 }}>
                  <FilterChip
                    label={f.label}
                    active={extractedFormat === f.value}
                    onPress={() => setExtractedFormat(f.value)}
                    variant="filled"
                  />
                </View>
              ))}
            </ScrollView>
            <SectionLabel label="Type" />
            <View style={styles.foodTypeRow}>
              {FOOD_TYPES.map((t) => (
                <FilterChip
                  key={t.value}
                  label={t.label}
                  active={foodType === t.value}
                  onPress={() => setFoodType(t.value)}
                  variant="filled"
                />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
              onPress={() => commitFood(extractedBrand, extractedProduct, extractedFormat, foodType)}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {cameFromMealLog ? 'Save and log meal' : 'Save'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header({ title, onClose, onBack }: { title: string; onClose?: () => void; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.headerSide} hitSlop={10}>
          <Text style={styles.headerBack}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSide} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      {onClose ? (
        <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={10}>
          <Text style={styles.headerClose}>✕</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSide} />
      )}
    </View>
  );
}

// Visual progress through the three encouraged shots. Each tile is itself
// tappable — empty slots open the photo source picker, filled slots offer
// to replace. Lets the user fill out of order.
function PhotoChecklist({
  front, ingredients, barcode, onSlotTap,
}: {
  front: CapturedPhoto | null;
  ingredients: CapturedPhoto | null;
  barcode: CapturedPhoto | null;
  onSlotTap: (slot: 'front' | 'ingredients' | 'barcode') => void;
}) {
  return (
    <View style={styles.checklistRow}>
      <ChecklistTile photo={front}        label="Front"   onPress={() => onSlotTap('front')} />
      <ChecklistTile photo={ingredients}  label="Label"   onPress={() => onSlotTap('ingredients')} />
      <ChecklistTile photo={barcode}      label="Barcode" onPress={() => onSlotTap('barcode')} />
    </View>
  );
}

function ChecklistTile({
  photo, label, onPress,
}: {
  photo: CapturedPhoto | null;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.checklistTile}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={8}
    >
      {photo ? (
        <Image source={{ uri: photo.localUri }} style={styles.checklistThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.checklistThumb, styles.checklistThumbEmpty]}>
          <Text style={styles.checklistEmptyIcon}>+</Text>
        </View>
      )}
      <Text style={styles.checklistLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerSide: {
    width: 40,
    height: 32,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  headerBack: {
    fontSize: 22,
    color: theme.colorTextPrimary,
  },
  headerClose: {
    fontSize: 18,
    color: theme.colorTextSecondary,
    textAlign: 'right',
  },

  introScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  introHeading: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.space2,
  },
  introBody: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space2,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    minHeight: 52,
  },
  primaryBtnDisabled: {
    backgroundColor: theme.colorBorder,
  },
  primaryBtnIcon: {
    fontSize: 18,
  },
  primaryBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: '#fff',
  },
  // Outline button — the on-screen "Choose from library" affordance. Reads as
  // a real button (visible border) so the library path isn't hidden, while
  // sitting clearly below the dark "Take a photo" primary. Distinct from the
  // plain-text `secondaryBtn` used for Skip / Edit elsewhere on this screen.
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    backgroundColor: theme.colorSurface,
    borderWidth: 1,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    minHeight: 52,
  },
  outlineBtnIcon: {
    fontSize: 18,
  },
  outlineBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space2,
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkBtnText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },

  checklistRow: {
    flexDirection: 'row',
    gap: theme.space2,
    marginBottom: theme.space2,
  },
  checklistTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  checklistThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
  },
  checklistThumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistEmptyIcon: {
    fontSize: 24,
    color: theme.colorTextTertiary,
  },
  checklistLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    letterSpacing: theme.trackingWide,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space2,
    padding: theme.space3,
  },
  loadingText: {
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  loadingHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },

  confirmScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  confirmHero: {
    borderRadius: theme.radiusMedium,
    overflow: 'hidden',
    backgroundColor: theme.colorNeutralLight,
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  confirmPhoto: {
    width: '100%',
    height: '100%',
  },
  confirmOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.space2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 2,
  },
  confirmBrand: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: '#fff',
  },
  confirmProduct: {
    fontSize: theme.textMD,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
  },
  confirmCaption: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    paddingVertical: theme.space1,
  },
  mealTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
    minHeight: 44,
  },
  mealTimeText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    flex: 1,
  },
  mealTimeAttribution: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  mealTimeChange: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },

  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  textInput: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    height: 48,
  },
  formatRow: {
    marginBottom: theme.space2,
  },
  foodTypeRow: {
    flexDirection: 'row',
    gap: theme.space1,
    marginBottom: theme.space2,
  },
  failedBanner: {
    backgroundColor: theme.colorEventSymptomLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
  },
  failedBannerText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 18,
  },

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
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
});
