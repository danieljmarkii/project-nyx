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
  Animated, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Camera, Images } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { SectionLabel } from '../components/ui/SectionLabel';
import { FilterChip } from '../components/ui/FilterChip';
import { ChipGroup } from '../components/ui/ChipGroup';
import {
  ProteinSetPicker,
  type ProteinSetPickerHandle,
} from '../components/food/ProteinSetPicker';
import { NightMoment } from '../components/brand/NightMoment';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { useMomentStore, whenMealCardVisible } from '../store/momentStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { insertMeal } from '../lib/meals';
import { uploadPhoto, compressForUpload } from '../lib/storage';
import { uuid, exifDateToISO, trustedPastExifIso, formatExifAttribution } from '../lib/utils';
import { seedPickerProteins, pickerProteinsToSet, pickerProteinWrite, proteinsToCacheText } from '../lib/protein';
import { foodIntakeKey } from '../lib/food';
import { sourceAfterPointEdit } from '../lib/eventTimeEdit';
import { ProteinDisclosure, proteinSummaryLine } from '../components/food/ProteinDisclosure';
import { TrialContaminantSheet } from '../components/food/TrialContaminantSheet';
import {
  loadTrialProteinContext,
  foodContaminantFlag,
  addFlagCopy,
  noteTrialFlagShown,
  type TrialProteinContext,
} from '../lib/trialContaminant';
import { useAppConfig } from '../hooks/useAppConfig';
import { parseGateResponse } from '../lib/appConfig';
import { EARLY_ACCESS_LABEL, foodCapCopy, careFirstLine } from '../constants/monetizationCopy';

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
  // The meal completion card (CUL-613). Selected, not destructured off getState(),
  // so this screen uses the same store handle every other meal-entry path does.
  const showMealMoment = useMomentStore((st) => st.showMeal);
  const { fromLog, returnTo } = useLocalSearchParams<{ fromLog?: string; returnTo?: string }>();
  const cameFromMealLog = fromLog === '1';
  // B-625 — a return-aware exit. The default exit unwinds the whole stack to Home
  // (`dismissAll`), which is right for the two callers that PRESENT capture over a tab (the
  // FAB's log flow, the Foods tab): the owner lands on Home, not on a stale picker. A screen
  // that PUSHED capture as one step of its own flow (/trial-foods' mid-trial add is the first)
  // passes `returnTo=back` so we pop back to IT instead of dismissing it along with the
  // capture — the captured food is then one tap away on the screen that asked for it.
  const returnToPusher = returnTo === 'back';

  // B-329 flag-aware state. Render-only: the Edge Function re-checks the flag + cap
  // server-side (B-252), so this only shapes what's shown, never what's allowed.
  const config = useAppConfig();
  const extractionEnabled = config.ai_food_extraction_enabled;

  const [step, setStep] = useState<CaptureStep>('intro');
  const [foodId] = useState<string>(() => uuid());

  // Set from a typed cap_reached response (§4.5). Drives the calm §7.3 cap band on
  // the edit step in place of the retryable failure banner.
  const [capReached, setCapReached] = useState<{ cap: 'daily' | 'monthly' } | null>(null);

  // ── B-351 slice 4 ────────────────────────────────────────────────────────────
  // The two D10 completeness arms for the food being captured, held in memory
  // because this row is mid-flight: the server copy may not exist yet (manual
  // path) and the cache copy definitely does not carry them until the next sync.
  // Null on the manual path, which the gate reads as "panel not captured" — the
  // honest answer for a food nobody photographed the ingredients of.
  const [extractionProvenance, setExtractionProvenance] =
    useState<{ ingredientsText: string | null; confidence: unknown } | null>(null);
  // Active-trial context for the add-time soft confirm (D2). Best-effort and
  // TTL-cached; null offline / no trial / unknown target protein, and a null
  // context means the sheet simply never opens — never an all-clear.
  const [trialCtx, setTrialCtx] = useState<TrialProteinContext | null>(null);
  // The commit the sheet is holding, if any. Non-null == the sheet is up.
  const [pendingCommit, setPendingCommit] =
    useState<{ brand: string; product: string; format: string; type: FoodType } | null>(null);
  // Set once the owner taps "Add anyway", so a later re-tap of Save (or a bounce
  // between the confirm and edit steps) doesn't re-ask a question they answered.
  const trialAcknowledged = useRef(false);

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

  // B-332 manual protein capture, widened to the B-351 D8 two-line set. Seeded
  // from the AI extraction (if any) so the edit step shows the detected proteins,
  // but `proteinTouched` only flips on an owner interaction — an untouched picker
  // must never null-clobber the AI-hydrated primary_protein / proteins on the
  // food_items row (mirrors the deliberate omission in commitFoodInner's cache
  // upsert below).
  const [primaryProtein, setPrimaryProtein] = useState<string | null>(null);
  const [alsoContains, setAlsoContains] = useState<string[]>([]);
  const proteinPickerRef = useRef<ProteinSetPickerHandle>(null);
  const proteinTouched = useRef(false);

  // Meal-time override on the confirm screen. Initialised lazily on entry to
  // the confirm step — see runUploadAndExtract. Provenance is 'exif' when the
  // front photo had DateTimeOriginal, 'now' otherwise, and flips to 'manual'
  // when the owner actually changes it in the time editor (sourceAfterPointEdit).
  const [mealOccurredAt, setMealOccurredAt] = useState<Date>(() => new Date());
  const [mealOccurredAtSource, setMealOccurredAtSource] = useState<'exif' | 'now' | 'manual'>('now');
  const [showMealTimePicker, setShowMealTimePicker] = useState(false);

  const checkScale = useRef(new Animated.Value(0.5)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  // Submission guard — prevents double-tap on "Looks right" / "Save" from
  // writing two events for the same meal.
  const submitting = useRef(false);

  // How this screen leaves. Default: dismissAll() unwinds both the food-capture modal
  // and the underlying meal-log picker so the owner lands on Home, not on a stale
  // picker. When a screen pushed capture as a step of its own flow (returnToPusher,
  // B-625), pop back to it instead so it isn't dismissed along with the capture —
  // guarded by canGoBack so a lost history fails safe to dismissAll rather than a
  // no-op. Shared by the add-only beat below and the meal path's card hand-off, so
  // the two exits cannot drift.
  function exitCapture() {
    if (returnToPusher && router.canGoBack()) router.back();
    else router.dismissAll();
  }

  // The add-only library-save beat. The MEAL path no longer reaches this — it hands
  // off to the real completion card at commit (CUL-613) — so there is no trial
  // heads-up to hold the beat open for any more, and the dwell is back to the plain
  // 900ms confirmation it was sized for.
  useEffect(() => {
    if (step !== 'complete') return;
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(exitCapture, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, returnToPusher]);

  // §6.1 flag-off: when photo extraction is disabled the flow has no camera path —
  // it opens directly on the manual edit step (no banner, no dead affordance). We
  // fail open, so this only fires on a deliberate PM flip reaching the client.
  useEffect(() => {
    if (step === 'intro' && !extractionEnabled) handleManualEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, extractionEnabled]);

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

  // Insert the pending food_items row, upload its photos, then kick off async
  // extraction. Order matters (B-358): the owner-locked row is written FIRST so
  // the owner-scoped nyx-food-photos Storage INSERT policy can resolve each
  // {foodId}/… path to its owner and authorize the upload — and so the realtime
  // subscription (Step 6) has a row to watch even on slow Claude.
  async function runUploadAndExtract(
    front: CapturedPhoto,
    ingredients: CapturedPhoto | null,
    barcode: CapturedPhoto | null,
  ) {
    setStep('uploading');
    setExtracting(true);
    setExtractionFailed(false);
    setCapReached(null);

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
      // Insert the pending food_items row BEFORE uploading its photos (B-358).
      // The tightened nyx-food-photos Storage INSERT policy scopes uploads to the
      // owner of the food named by the path's first segment ({foodId}/…), so the
      // owner-locked row (which carries created_by_user_id) must exist first or
      // the upload 42501s. brand/product_name/format are NOT NULL on the table,
      // so we seed placeholders that the Edge Function overwrites on extraction
      // success. created_by_user_id is required by the RLS insert policy.
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
        // A 23505 duplicate-key here is the benign retry path (the row was
        // created on a prior attempt) — the row still exists and satisfies the
        // upload policy, so continue. Any OTHER code (RLS 42501, NOT NULL 23502,
        // network) is a genuine root-cause failure worth surfacing at error
        // level so it isn't masked below as an "upload/extract error" symptom;
        // we still continue, since a missing owned row makes the upload 42501
        // and routes to the same manual-edit fallback (setExtractionFailed).
        if (insertError.code === '23505') {
          console.warn('[food-capture] food_items insert conflict (retry):', insertError.message);
        } else {
          console.error('[food-capture] food_items insert failed:', insertError.code, insertError.message);
        }
      }

      // Compress + upload all photos in parallel. Runs AFTER the insert so the
      // owner-scoped Storage INSERT policy can authorize each {foodId}/… path.
      await Promise.all(photos.map(async (p) => {
        const compressedUri = await compressForUpload(p.localUri, p.width, p.height);
        await uploadPhoto('nyx-food-photos', p.storagePath, compressedUri);
      }));

      // Invoke extraction. We await it for the confirm screen, but don't block
      // the meal log on it — if it errors, we fall through to manual edit.
      const { data, error } = await supabase.functions.invoke('extract-food-from-photo', {
        body: { food_item_id: foodId, photo_paths: storagePaths },
      });

      // Genuine transport/function fault → the retryable failure banner (unchanged).
      if (error) {
        console.warn('[food-capture] extraction failed:', error.message);
        setExtractionFailed(true);
        setStep('edit');
        return;
      }

      // §4.5 typed product states (HTTP 200, so `error` is null) — branch on the
      // body, never an error string. Both route to the manual edit step with the
      // photo already saved; neither is an error.
      const gate = parseGateResponse(data);
      if (gate.kind === 'cap_reached') {
        setCapReached({ cap: gate.cap });
        setStep('edit');
        return;
      }
      if (gate.kind === 'feature_disabled') {
        // Stale-client path: config said enabled but the server has since flagged it
        // off. Route to manual with no banner (the flag-off designed state, §6.1).
        setStep('edit');
        return;
      }

      if (!data?.extraction) {
        console.warn('[food-capture] extraction returned no data');
        setExtractionFailed(true);
        setStep('edit');
        return;
      }

      const ex = data.extraction;
      setExtractedBrand(ex.brand ?? '');
      setExtractedProduct(ex.product_name ?? '');
      setExtractedFormat(mapAiFormat(ex.format));
      // Seed both picker lines from the AI read, but leave `proteinTouched`
      // false so saving without editing preserves the server's AI values.
      // seedPickerProteins owns the primary-vs-set reconciliation (spec §11).
      const seeded = seedPickerProteins(ex.primary_protein ?? null, ex.proteins);
      setPrimaryProtein(seeded.main);
      setAlsoContains(seeded.alsoContains);
      proteinTouched.current = false;
      // The D10 arms, straight off the extraction result — the only place this
      // client ever sees them for a brand-new row.
      setExtractionProvenance({
        ingredientsText: ex.ingredients_text ?? null,
        confidence: ex.confidence ?? null,
      });
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

  // ── B-351 slice 4 — the add-time soft confirm (D2, §8) ─────────────────────
  //
  // Register: a CHOICE is allowed here and only here. Adding a food to the
  // library is not the moment of event — the owner is deciding what to feed, not
  // recording what they fed — so "Not now / Add anyway" costs nothing they were
  // mid-way through. The log-time twin of this fact is deliberately passive prose
  // on the completion card, because Principle 1 forbids a decision there.
  //
  // Both Save buttons route through here, so neither step can ship the gate and
  // the other skip it. Silence (no trial, offline, unknown target, an unread
  // panel, nothing off-trial) commits straight through — the sheet has no
  // reassuring state to render.
  //
  // ⚠️ THE SOFT CONFIRM NEVER RUNS ON THE MEAL-LOG PATH. This screen is reachable
  // as `/food-capture?fromLog=1`, where the button reads "Save and log food" and
  // the commit below WRITES A MEAL. Gating that on a modal put a decision at the
  // moment of event — a straight Principle 1 violation — and worse, "Not now"
  // (or a backdrop tap, or Android back) discarded the meal silently: no food
  // row, no meal row, no explanation, for an owner who had just fed the treat and
  // opened the app specifically to record it. Caught by the adversarial pass; the
  // defence written here originally ("adding a food is not the moment of event")
  // is true of the add-only path and exactly inverted on this one.
  //
  // So the meal path commits unconditionally and the same fact rides the
  // completion step afterwards, non-blocking — the register D2 actually ratified
  // for log time, and the same shape the meal completion card uses.
  function attemptCommit(brand: string, product: string, format: string, type: FoodType) {
    if (!cameFromMealLog && !trialAcknowledged.current && trialFlag) {
      setPendingCommit({ brand, product, format, type });
      return;
    }
    void commitFood(brand, product, format, type);
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

    // B-332 / B-351: mirror the protein SET into the local cache only when the
    // owner touched the picker — an untouched picker leaves the AI-hydrated cache
    // values (and the server values below) intact. The cache row was just written
    // above without the protein columns, so a separate targeted UPDATE keeps that
    // omission deliberate rather than threading a conditional into the INSERT's
    // VALUES. primary_protein is written as proteins[0], the derived convenience
    // migration 039 defines it as — so the pair cannot drift.
    // The protein "Other" field commits on blur, and this form's ScrollView uses
    // keyboardShouldPersistTaps="handled" — so tapping the confirm button never
    // blurs it. Resolve any open draft first (same reason as app/food/[id].tsx).
    const pendingProteins = proteinPickerRef.current?.commitPending() ?? null;
    const mainToSave = pendingProteins ? pendingProteins.main : primaryProtein;
    const tailToSave = pendingProteins ? pendingProteins.alsoContains : alsoContains;
    if (pendingProteins) {
      proteinTouched.current = true;
      setPrimaryProtein(pendingProteins.main);
      setAlsoContains(pendingProteins.alsoContains);
    }
    // R7(b) — both columns as ONE value, so the local mirror and the remote
    // upsert below cannot write one without the other (B-529).
    const proteinWrite = pickerProteinWrite(mainToSave, tailToSave);
    const proteinSet = proteinWrite.proteins;
    if (proteinTouched.current) {
      await db.runAsync(
        `UPDATE food_items_cache SET primary_protein = ?, proteins = ? WHERE id = ?`,
        [proteinWrite.primaryProtein, proteinsToCacheText(proteinSet), foodId],
      );
    }

    // If extraction didn't run (manual path), the row may not exist remotely
    // yet — upsert with the user-confirmed values. If it does exist (AI path),
    // the Edge Function already wrote richer fields; we only patch when user
    // edited via the "Edit" screen.
    // AI actually produced data only when the extraction ran and returned. A capped
    // (or flag-off) commit routes exactly as the failure path (§6.1) — the photo is
    // saved but extraction didn't run, so it must NOT be recorded as 'completed'.
    const aiRead = !!frontPhoto && !extractionFailed && !capReached;
    const foodUpsert: Record<string, unknown> = {
      id: foodId,
      brand: brand.trim(),
      product_name: product.trim(),
      format,
      food_type: type,
      created_by_user_id: user?.id ?? null,
      photo_paths: frontPhoto ? [frontPhoto.storagePath, ingredientsPhoto?.storagePath, barcodePhoto?.storagePath].filter(Boolean) : [],
      ai_extraction_status: frontPhoto ? (aiRead ? 'completed' : 'failed') : 'manual',
      source: aiRead ? 'ai_extracted' : 'user',
    };
    // Only include the protein columns when the owner actually touched the
    // picker. Omitting the keys leaves the columns untouched on an ON CONFLICT
    // update, so an AI-extracted protein set survives the owner saving the
    // confirm screen without editing it (B-332 AC, extended to the set).
    if (proteinTouched.current) {
      foodUpsert.primary_protein = proteinWrite.primaryProtein;
      foodUpsert.proteins = proteinWrite.proteins;
    }
    supabase.from('food_items').upsert(foodUpsert, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[food-capture] upsert failed:', error.message);
    });

    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, not the render-time closure (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    // What the completion card needs, captured from the write itself. Stays null on
    // the add-only path, which writes no meal and so has no record to speak for.
    let loggedMeal: { eventId: string; occurredAt: string } | null = null;
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
      loggedMeal = { eventId, occurredAt: occurredAtIso };
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

    // The log-time heads-up for THIS path (see attemptCommit): resolved at commit
    // and handed to the completion card. Only when a meal was actually written —
    // an add-only commit already had its say in the soft confirm.
    //
    // Two guards this path needs and the picker paths get from
    // evaluateMealLogTimeFlag, which it deliberately does not call (the food is
    // brand-new and in memory, not in the cache yet). NB this path surfaces the
    // CONTENTS flag only (foodContaminantFlag) — the B-693 membership heads-up is a
    // meal-log-time concern, not part of the food's own add flow:
    //   • THE TRIAL WINDOW. mealOccurredAt is EXIF-seeded, so a photo taken last
    //     week yields a meal that predates the trial — and the card would say
    //     "…'s duck trial should skip chicken. The meal's saved" about a
    //     PRE-TRIAL feeding. Two meal paths must not disagree about the predicate.
    //   • RULE 3's LEDGER. Without the write, the same food fires again on its
    //     next log from the picker, silently contradicting "counted in heads-ups
    //     GIVEN".
    const inTrialWindow =
      trialCtx != null &&
      !Number.isNaN(trialCtx.startedAtMs) &&
      mealOccurredAt.getTime() >= trialCtx.startedAtMs;
    const cardTrialFlag = trialFlag && inTrialWindow ? trialFlag : null;

    // CUL-613 — the meal-log path ends on the REAL meal completion card, not this
    // screen's own beat. It used to render a hand-rolled ✓ over the word "Logged"
    // and then dismiss, which meant a meal logged here silently skipped the two
    // things every other meal path gets: the WSAVA intake chip row and "Change
    // time" (CUL-368). Both files carried a comment saying every meal-entry path
    // must route through showMeal; this path did not, and the comment could not
    // fail a build. `guards/completionCard.test.ts` now can.
    //
    // The card is store-driven from the root layout, so it outlives this screen —
    // we dismiss FIRST and reveal behind delayMs, exactly as the picker path does
    // (app/log.tsx), so the card lands at the root layer instead of being occluded
    // by the still-presented modal on iOS.
    if (loggedMeal && pet) {
      // Everything from here down is presentation — the meal is already on disk and
      // synced. A throw must not reach commitFood's catch, because that releases the
      // double-submit guard and a second tap would write a SECOND meal for the same
      // bowl. A broken card is cosmetic; a duplicate meal reaches the vet report
      // (the B-336 rule, applied to this path).
      try {
        exitCapture();
        showMealMoment(
          {
            eventId: loggedMeal.eventId,
            petId: pet.id,
            occurredAt: loggedMeal.occurredAt,
            foodType: type,
            foodBrand: brand.trim(),
            foodProductName: product.trim(),
            foodFormat: format,
            intakeRating: null,
            // Passed in the payload rather than patched in afterwards: unlike the
            // picker path, this screen has already resolved the flag synchronously
            // by commit time, so there is nothing to wait for and no late-answer
            // race to guard. showMeal reads it to size the dwell (the 7s flagged
            // window) on its own.
            trialFlag: cardTrialFlag,
          },
          { delayMs: 450 },
        );
        // Rule 3's ledger is spent only once the heads-up is genuinely on screen.
        // It used to be written unconditionally at commit, so a card that never
        // revealed still burned the food's one-per-trial budget and the picker path
        // would then stay silent about it forever — "counted in heads-ups GIVEN"
        // has to mean given.
        if (cardTrialFlag) {
          void whenMealCardVisible(loggedMeal.eventId)
            .then((shown) => (shown ? noteTrialFlagShown(cardTrialFlag) : undefined))
            // A failed ledger write costs at most ONE extra heads-up later, never a
            // suppressed one — the safe direction, and the same one readHeadsUpLedger
            // already fails in. Never let it surface: the meal is saved and this is
            // bookkeeping about a note the owner has already read.
            .catch((e) => console.warn('[food-capture] trial heads-up ledger write failed:', e));
        }
      } catch (e) {
        console.error('[food-capture] meal saved, but its completion card failed:', e);
      }
      return;
    }

    // Add-only: no meal was written, so there is no record for a completion card to
    // speak — no occurred_at to change, no intake to ask about, nothing to undo. The
    // library-save beat below stays (CUL-613 Option A, PM-ruled); its copy is in
    // CUL-614's pass.
    setStep('complete');
  }

  // Best-effort active-trial load for the add-time gate. Keyed on the active pet
  // (a trial belongs to a pet; the library is per-account) and re-run on switch.
  useEffect(() => {
    let cancelled = false;
    const petId = activePet?.id;
    if (!petId) { setTrialCtx(null); return; }
    loadTrialProteinContext(petId)
      .then((ctx) => { if (!cancelled) setTrialCtx(ctx); })
      .catch(() => { if (!cancelled) setTrialCtx(null); });
    return () => { cancelled = true; };
  }, [activePet?.id]);

  // The captured set as it stands right now, and the two derived facts every
  // B-351 surface on this screen reads. `foodId` is a fresh uuid, so the
  // trial-diet exclusion inside foodContaminantFlag can never match — an add is
  // shape ② by construction (the trial food is already in the library).
  const capturedProteins = pickerProteinsToSet(primaryProtein, alsoContains);
  const disclosureInput = {
    proteins: capturedProteins,
    ingredientsNotes: extractionProvenance?.ingredientsText ?? null,
    extractionConfidence: extractionProvenance?.confidence ?? null,
  };
  // `foodId` is a fresh uuid on every capture, so the id-based half of rule 2's
  // exclusion can never match — the brand+product key is what stops a
  // re-photographed bag of the TRIAL DIET being flagged against itself.
  const trialFlag = foodContaminantFlag(
    trialCtx,
    foodId,
    capturedProteins,
    foodIntakeKey(extractedBrand, extractedProduct),
  );
  const trialFlagCopy = trialFlag ? addFlagCopy(trialFlag, activePet?.name ?? 'your pet') : null;
  const summaryLine = proteinSummaryLine(disclosureInput);

  function handleManualEntry() {
    setExtractedBrand('');
    setExtractedProduct('');
    setExtractedFormat('dry_kibble');
    setPrimaryProtein(null);
    setAlsoContains([]);
    proteinTouched.current = false;
    // Manual entry: no panel was read by anyone, and the gate must say so rather
    // than let an owner-typed single protein render as a complete set.
    setExtractionProvenance(null);
    setStep('edit');
  }

  // ── Completion (ADD-ONLY) ──
  // The meal-log path does not reach here: it hands off to the real meal completion
  // card (CUL-613), which carries the intake row + "Change time" this beat never
  // could. What is left is the library save, which writes no event — so there is no
  // record to speak, no occurred_at to change, and nothing to undo.
  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
        <Animated.Text style={[styles.loggedText, { opacity: checkOpacity }]}>
          {/* This saves to the food LIBRARY — it does not log a meal, and (on the
              /trial-foods path) it does not put the food on the trial's allowed set.
              Name the real destination so "Added" can't read as "added to the list"
              (B-625, pm-review). */}
          Saved to your foods
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
          {/* D-M6 early-access label (§7.2) — quiet, small, no badge. Dual-signals
              free-now and may-be-paid-later. Retired in T3-E when the gate flips. */}
          <Text style={styles.earlyAccessLabel}>{EARLY_ACCESS_LABEL}</Text>
          {/* B-062 — Lucide Camera/Images (were 📷/🖼 emoji). Both glyphs on the
              screen convert together so the two buttons don't end up one vector +
              one emoji. */}
          <TouchableOpacity style={styles.primaryBtn} onPress={() => handleSnapFront('camera')} activeOpacity={0.85}>
            <Camera size={20} color={theme.colorTextOnDark} strokeWidth={2} />
            <Text style={styles.primaryBtnText}>Take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => handleSnapFront('library')} activeOpacity={0.85}>
            <Images size={20} color={theme.colorTextPrimary} strokeWidth={2} />
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
            {nextEncouragedSlot && <Camera size={20} color={theme.colorTextOnDark} strokeWidth={2} />}
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
        <View style={styles.momentBody}>
          {/* The brief upload precursor is a light in-place Tier-2 spinner (<2s → not the
              night moment). */}
          {!extracting && (
            <View style={styles.loadingContainer}>
              <WhorlSpinner size="md" ground="day" />
              <Text style={styles.loadingText}>Uploading…</Text>
              <Text style={styles.loadingHint}>This usually takes a few seconds.</Text>
            </View>
          )}
          {/* The AI read is the qualifying photo-extraction wait (§6). KEPT MOUNTED and
              toggled by `visible` so its min-hold runs and it crossfades in from the upload
              spinner rather than hard-cutting; the flex body keeps the Header/back. */}
          <NightMoment visible={extracting} title="Reading the label…" subtitle="A few seconds." />
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
          {/* Tier-1 (D7/§8.5) — the confirm step shows no protein picker, so this
              compact line is the whole disclosure here: primary first, secondaries
              after, and "ingredient list not read" instead of an implied-complete
              set when the D10 gate fails. Silent when there is nothing honest to
              say (proteinSummaryLine returns null). */}
          {summaryLine ? <Text style={styles.proteinSummary}>{summaryLine}</Text> : null}
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
                    // Provenance flips to 'manual' on an actual value change from any
                    // non-manual source ('exif' or 'now'); a peek-tap that changes
                    // nothing preserves it, so an EXIF attribution is never silently
                    // dropped. Shares the one rule with app/log.tsx and app/edit-event.tsx
                    // via sourceAfterPointEdit — before B-525 this screen only handled
                    // 'exif', so a 'now'-seeded meal the owner re-timed was stored as
                    // witnessed-live provenance ('now') rather than the manual edit it
                    // was — the case occurred_at_source exists to distinguish. (The column
                    // is written + synced but not yet read by the report/engine, so this
                    // is a stored-correctness + forward-safety fix, not a live one.)
                    setMealOccurredAtSource(
                      sourceAfterPointEdit(mealOccurredAtSource, date.getTime() !== mealOccurredAt.getTime()),
                    );
                    setMealOccurredAt(date);
                  }}
                />
              )}
            </>
          )}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => attemptCommit(extractedBrand, extractedProduct, extractedFormat, foodType)}
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
      {/* B-351 slice 4 — the add-time soft confirm. Rendered on both the confirm
          and edit steps from one place, so the two Save paths cannot diverge.
          Backdrop / Android-back both resolve to "Not now": a dismissed sheet is
          never read as consent. */}
      <TrialContaminantSheet
        visible={pendingCommit != null}
        title={trialFlagCopy?.title ?? ''}
        body={trialFlagCopy?.body ?? ''}
        trialLine={trialCtx?.trialFoodLabel ? `Trial diet · ${trialCtx.trialFoodLabel}` : null}
        onNotNow={() => setPendingCommit(null)}
        onAddAnyway={() => {
          const pending = pendingCommit;
          setPendingCommit(null);
          trialAcknowledged.current = true;
          if (pending) void commitFood(pending.brand, pending.product, pending.format, pending.type);
        }}
      />
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
            {/* §6.1 cap-reached: a calm informational band (never error styling), with
                the first B-333 care-first surface (§16). Distinct from the retryable
                failure banner below, which is a genuine fault. */}
            {capReached ? (
              <View style={styles.capBand}>
                <Text style={styles.capBandText}>{foodCapCopy(capReached.cap)}</Text>
                <Text style={styles.careLine}>{careFirstLine(activePet?.name)}</Text>
              </View>
            ) : extractionFailed ? (
              <View style={styles.failedBanner}>
                <Text style={styles.failedBannerText}>
                  Couldn't read the label automatically. You can fill it in below — we'll retry extraction in the background.
                </Text>
              </View>
            ) : null}
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
            <ChipGroup
              options={FOOD_FORMATS}
              value={extractedFormat}
              // allowDeselect={false} guarantees a non-null value at runtime; the guard
              // also narrows ChipGroup's (string | null) onChange to the string this setter wants.
              onChange={(v) => { if (v !== null) setExtractedFormat(v); }}
              allowDeselect={false}
              accessibilityLabel="Format"
              style={styles.formatRow}
            />
            <ProteinSetPicker
              ref={proteinPickerRef}
              main={primaryProtein}
              alsoContains={alsoContains}
              onChange={(next) => {
                proteinTouched.current = true;
                setPrimaryProtein(next.main);
                setAlsoContains(next.alsoContains);
              }}
            />
            {/* Tier-1 (D7) — the chips above show the set; this says whether it is
                the WHOLE set, which is the one thing D10 forbids leaving implied. */}
            <ProteinDisclosure input={disclosureInput} />
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
              onPress={() => attemptCommit(extractedBrand, extractedProduct, extractedFormat, foodType)}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {cameFromMealLog ? 'Save and log food' : 'Save'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      {/* B-351 slice 4 — the add-time soft confirm. Rendered on both the confirm
          and edit steps from one place, so the two Save paths cannot diverge.
          Backdrop / Android-back both resolve to "Not now": a dismissed sheet is
          never read as consent. */}
      <TrialContaminantSheet
        visible={pendingCommit != null}
        title={trialFlagCopy?.title ?? ''}
        body={trialFlagCopy?.body ?? ''}
        trialLine={trialCtx?.trialFoodLabel ? `Trial diet · ${trialCtx.trialFoodLabel}` : null}
        onNotNow={() => setPendingCommit(null)}
        onAddAnyway={() => {
          const pending = pendingCommit;
          setPendingCommit(null);
          trialAcknowledged.current = true;
          if (pending) void commitFood(pending.brand, pending.product, pending.format, pending.type);
        }}
      />
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
  primaryBtnText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
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
  // Fills the body below the Header for the extraction night moment (it measures this
  // box and paints its own night ground into it).
  momentBody: {
    flex: 1,
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
    backgroundColor: theme.colorScrimDark,
    gap: 2,
  },
  confirmBrand: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextOnDark,
  },
  confirmProduct: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDarkMuted,
    lineHeight: theme.lineHeightBody,
  },
  // Tier-1 protein disclosure on the confirm step — quiet, under the "Is this
  // right?" caption, where it reads as part of what the owner is confirming.
  proteinSummary: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    marginTop: -theme.space1,
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
  // D-M6 early-access label — quiet tertiary line, no badge/pill styling (§7.2).
  earlyAccessLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    marginBottom: theme.space2,
  },
  // §6.1 cap band — a calm neutral surface, NEVER error red. Reads as an
  // informational note; the record is already saved.
  capBand: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    gap: theme.space1,
  },
  capBandText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    lineHeight: 18,
  },
  // The first B-333 care-first surface — quieter than the cap copy above it.
  careLine: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    lineHeight: 16,
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
    color: theme.colorTextOnDark,
  },
  loggedText: {
    fontSize: 20,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
});
