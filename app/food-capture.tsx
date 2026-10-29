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
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { colorRoles, theme } from '../constants/theme';
import { ThemedText } from '../components/ui/ThemedText';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ChipGroup } from '../components/ui/ChipGroup';
import { Header } from '../components/ui/Header';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { TextField } from '../components/ui/TextField';
import { QuietBand } from '../components/ui/QuietBand';
import { CompletionMark } from '../components/ui/CompletionMark';
import { CaptureSilhouette } from '../components/surfaces/waits/CaptureSilhouette';
import { HomeCard } from '../components/surfaces/home/HomeCard';
import { SlotRow } from '../components/ui/SlotRow';
import { PhotoThumb } from '../components/ui/PhotoThumb';
import { PhotoViewer } from '../components/ui/PhotoViewer';
import { TimeEditSheet } from '../components/ui/TimeEditSheet';
import { PhotoSlots } from '../components/food/PhotoSlots';
import { CaptureReadCard } from '../components/food/CaptureReadCard';
import { useIsOnline } from '../hooks/useIsOnline';
import { useColumnWidth, useLayoutClass, useWindowFrame } from '../hooks/useLayoutClass';
import { frameCap, withCap } from '../lib/layoutCaps';
import {
  ProteinSetPicker,
  type ProteinSetPickerHandle,
} from '../components/food/ProteinSetPicker';
import { usePetStore, resolveRecordPetName } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { useMomentStore, whenMealCardVisible } from '../store/momentStore';
import { getDb } from '../lib/db';
import { supabase } from '../lib/supabase';
import { insertMeal } from '../lib/meals';
import { offerCapturedFood } from '../lib/captureHandBack';
import { uploadPhoto, compressForUpload } from '../lib/storage';
import { uploadedPhotoPath, uploadedPhotoPaths } from '../lib/captureUploads';
import { uuid, exifDateToISO, trustedPastExifIso, formatExifAttribution } from '../lib/utils';
import { seedPickerProteins, pickerProteinsToSet, pickerProteinWrite, proteinsToCacheText } from '../lib/protein';
import { PENDING_CAPTURE_LABEL, foodIntakeKey } from '../lib/food';
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
import { claimLostLogHandOff } from '../lib/mealTrialFlag';
import { useAppConfig } from '../hooks/useAppConfig';
import { useAiConsentDoor } from '../hooks/useAiConsentDoor';
import { consentUnreadableNotice } from '../constants/aiConsentCopy';
import { AiConsentSheet } from '../components/consent/AiConsentSheet';
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
  const { activePet, pets } = usePetStore();
  // The modal presents outside the column, so at regular the photo frames cap by height and
  // by the column and centre (CUL-2238): a frame is never taller than the screen. Null on a phone.
  const widthClass = useLayoutClass().width;
  const columnWidth = useColumnWidth();
  const windowHeight = useWindowFrame().height;
  const reviewFrameCap = frameCap(widthClass, columnWidth, windowHeight, 4 / 3);
  const confirmFrameCap = frameCap(widthClass, columnWidth, windowHeight, 16 / 9);
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  // The meal completion card (CUL-613). Selected, not destructured off getState(),
  // so this screen uses the same store handle every other meal-entry path does.
  const showMealMoment = useMomentStore((st) => st.showMeal);
  const { fromLog, returnTo, handBack } =
    useLocalSearchParams<{ fromLog?: string; returnTo?: string; handBack?: string }>();
  const cameFromMealLog = fromLog === '1';
  // B-625 — a return-aware exit. The default exit unwinds the whole stack to Home
  // (`dismissAll`), which is right for the two callers that PRESENT capture over a tab (the
  // FAB's log flow, the Foods tab): the owner lands on Home, not on a stale picker. A screen
  // that PUSHED capture as one step of its own flow (/trial-foods' mid-trial add is the first)
  // passes `returnTo=back` so we pop back to IT instead of dismissing it along with the
  // capture — the captured food is then one tap away on the screen that asked for it.
  const returnToPusher = returnTo === 'back';
  // CUL-2089 — the bowl picker's add: the saved food is handed back to the meal named here
  // (lib/captureHandBack.ts), so the split rises with it. Add only: never with `fromLog`,
  // whose commit writes a meal of its own.
  const handBackKey = !cameFromMealLog && typeof handBack === 'string' && handBack ? handBack : null;

  // B-329 flag-aware state. Render-only: the Edge Function re-checks the flag + cap
  // server-side (B-252), so this only shapes what's shown, never what's allowed.
  const config = useAppConfig();
  const consentDoor = useAiConsentDoor('label');
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
  // Local URIs of the photos whose own upload resolved (CUL-2170). The commit
  // records a photo path only for these, so an offline capture never lists a
  // photo Storage does not hold. A ref, not state: the commit reads it after
  // the awaited uploads, never through a render.
  const uploadedUris = useRef<Set<string>>(new Set());
  // P8 (CUL-1910): an offline owner is told before the wait, not after it, since the
  // read can only fail without a connection. Render only: the upload path below still
  // routes any failure to the typed form.
  const online = useIsOnline();
  // Whether the read was asked for (the upload-and-read ran), and whether it answered
  // with a read. The commit records the food as AI read only on the second, so a food
  // typed in before any read ran (offline, or the camera refused mid-flow) is never
  // stored as 'completed' / 'ai_extracted' just because a photo was taken.
  const [readStarted, setReadStarted] = useState(false);
  const [readLanded, setReadLanded] = useState(false);
  // D-1 (A): the failed band may point at the food page's retry only when that retry
  // exists, which is when the server recorded its own failed read (ai_extraction_error;
  // app/food/[id].tsx gates the button on it). Never after a transport fault, an upload
  // that failed or an offline phone: then the photos are not there to read again.
  const [retryOnFoodPage, setRetryOnFoodPage] = useState(false);
  // The front photo open full screen (P4 on confirm, P7 on the typed form).
  const [viewingPhoto, setViewingPhoto] = useState(false);
  // The library beat names the food it saved (P10, C-17).
  const [savedName, setSavedName] = useState<string | null>(null);

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
  // 900ms confirmation it was sized for. The mark is the kit's CompletionMark at rest
  // (CUL-1910 F7): nothing on this beat moves.
  useEffect(() => {
    if (step !== 'complete') return;
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
    }
    // The library needs no grant: the system picker hands back only the chosen
    // photo (CUL-1840, App Review 5.1.1(iii)).

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

  // CUL-1834 (mock frame A): the AI consent door sits BEFORE the picker, camera and
  // library alike (a library pick is sent to Anthropic too), so no photo is ever taken
  // and then held behind a question. Only the front slot asks: every later slot is
  // reached after this one. Don't allow and Not now both open the typed form.
  async function handleSnapFront(source: 'camera' | 'library') {
    const answer = await consentDoor.ask();
    if (answer === 'declined' || answer === 'not_now') {
      handleManualEntry();
      return;
    }
    // An answer the phone couldn't read sends nothing (CUL-1933): no photo is taken,
    // the owner stays on this step and the next tap reads again.
    if (answer === 'unreadable') {
      const notice = consentUnreadableNotice('label');
      Alert.alert(notice.title, notice.body);
      return;
    }
    const photo = await pickPhoto('front', source);
    if (!photo) return;
    setFrontPhoto(photo);
    setStep('review');
  }

  // An optional slot's row on the photos step (P2): adds that photo, or replaces it once
  // taken. Never changes step, so "Read the label" stays the one way on.
  async function handleSlotTap(slot: OptionalSlot) {
    const photo = await pickPhoto(slot);
    if (!photo) return;
    if (slot === 'ingredients') setIngredientsPhoto(photo);
    else                        setBarcodePhoto(photo);
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
    setReadStarted(true);
    setReadLanded(false);
    setRetryOnFoodPage(false);

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
        brand: PENDING_CAPTURE_LABEL,
        product_name: PENDING_CAPTURE_LABEL,
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
      // allSettled, not all: a fast failure must not route to the form while a
      // sibling upload is still in flight, or a save there would leave out a photo
      // that lands a moment later (CUL-2170). Every upload settles first.
      const settled = await Promise.allSettled(photos.map(async (p) => {
        const compressedUri = await compressForUpload(p.localUri, p.width, p.height);
        await uploadPhoto('nyx-food-photos', p.storagePath, compressedUri);
        uploadedUris.current.add(p.localUri);
      }));
      const failedUpload = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failedUpload) throw failedUpload.reason;

      // Invoke extraction. We await it for the confirm screen, but don't block
      // the meal log on it — if it errors, we fall through to manual edit.
      const { data, error } = await supabase.functions.invoke('extract-food-from-photo', {
        body: { food_item_id: foodId, photo_paths: storagePaths },
      });

      // Genuine transport/function fault → the retryable failure banner (unchanged).
      if (error) {
        console.warn('[food-capture] extraction failed:', error.message);
        setRetryOnFoodPage(await serverRecordedFailedRead(foodId));
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
        setRetryOnFoodPage(await serverRecordedFailedRead(foodId));
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
      setReadLanded(true);
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
    // Only a photo whose upload finished is recorded (CUL-2170): offline, the
    // front never reached Storage and the row must not claim it.
    const frontStoragePath = uploadedPhotoPath(frontPhoto, uploadedUris.current);
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
    const aiRead = readLanded && !extractionFailed && !capReached;
    const foodUpsert: Record<string, unknown> = {
      id: foodId,
      brand: brand.trim(),
      product_name: product.trim(),
      format,
      food_type: type,
      created_by_user_id: user?.id ?? null,
      photo_paths: uploadedPhotoPaths([frontPhoto, ingredientsPhoto, barcodePhoto], uploadedUris.current),
      // 'failed' only when a read was asked for and did not land; a food typed in before
      // any read ran (offline, or the camera refused mid-flow) is 'manual', photo or not.
      ai_extraction_status: frontPhoto && readStarted ? (aiRead ? 'completed' : 'failed') : 'manual',
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
        // A card a newer log replaced before it revealed hands its heads-up to the meal's
        // own screen, which spends the ledger once the line is seen (CUL-2106).
        if (cardTrialFlag) {
          const handOff = claimLostLogHandOff(loggedMeal.eventId);
          void whenMealCardVisible(loggedMeal.eventId)
            .then((shown) => (shown
              ? noteTrialFlagShown(cardTrialFlag, loggedMeal.eventId)
              : handOff(cardTrialFlag)))
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
    if (handBackKey) {
      offerCapturedFood(handBackKey, {
        id: foodId,
        brand: brand.trim(),
        product_name: product.trim(),
        format,
        food_type: type,
        photo_path: frontStoragePath,
      });
    }
    setSavedName(`${brand.trim()} · ${product.trim()}`);
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
  // record to speak, no occurred_at to change, and nothing to undo. It names the food it
  // saved (P10), so the beat speaks the record it wrote (C-17).
  if (step === 'complete') {
    return (
      <View style={styles.completeContainer}>
        <CompletionMark halo={false} />
        {/* This saves to the food LIBRARY — it does not log a meal, and (on the
            /trial-foods path) it does not put the food on the trial's allowed set.
            Name the real destination so "Added" can't read as "added to the list"
            (B-625, pm-review). */}
        <ThemedText variant="heading" style={styles.savedHeading} accessibilityRole="header">
          Saved to your foods
        </ThemedText>
        {savedName ? <ThemedText variant="body" style={styles.savedName}>{savedName}</ThemedText> : null}
      </View>
    );
  }

  // ── Intro ── P1: the whole job before the camera opens.
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Add a food" leading="close" onLeadingPress={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText style={styles.introHeading} accessibilityRole="header">Add the front of the package</ThemedText>
          <ThemedText variant="body" style={styles.introBody}>
            Only the front is needed. We read the rest from it.
          </ThemedText>
          <PhotoSlots
            slots={[
              { label: 'Front · needed', uri: null },
              { label: 'Ingredients · optional', uri: null },
              { label: 'Barcode · optional', uri: null },
            ]}
          />
          {/* D-M6 early-access label (§7.2) — quiet, small, no badge. Dual-signals
              free-now and may-be-paid-later. Retired in T3-E when the gate flips. */}
          <ThemedText variant="caption" style={styles.earlyAccessLabel}>{EARLY_ACCESS_LABEL}</ThemedText>
          <PrimaryButton label="Take a photo" icon={Camera} onPress={() => handleSnapFront('camera')} />
          <PrimaryButton label="Choose from library" variant="secondary" onPress={() => handleSnapFront('library')} />
          <TouchableOpacity style={styles.linkBtn} onPress={handleManualEntry} accessibilityRole="button">
            <ThemedText style={styles.linkBtnText}>Type it in instead</ThemedText>
          </TouchableOpacity>
        </ScrollView>
        <AiConsentSheet {...consentDoor.sheetProps} />
      </SafeAreaView>
    );
  }

  // ── The photos step ── P2: "Read the label" is the way on from the first photo; the two
  // optional shots are quiet rows, and the ingredients row says why it matters. P8: an
  // offline phone is told here, before any wait, with the typed form one tap away.
  if (step === 'review') {
    const offline = !online;
    return (
      <SafeAreaView style={[styles.container, styles.ground]}>
        <Header title="Add a food" leading="back" onLeadingPress={() => setStep('intro')} />
        <ScrollView contentContainerStyle={styles.scroll}>
          {frontPhoto && (
            <HomeCard noPadding style={withCap(styles.heroCard, reviewFrameCap)}>
              <Image
                source={{ uri: frontPhoto.localUri }}
                style={styles.reviewPhoto}
                resizeMode="cover"
                accessibilityLabel="Your photo of the front of the package"
              />
            </HomeCard>
          )}
          <ThemedText style={styles.introHeading} accessibilityRole="header">Ready to read the label</ThemedText>
          {offline ? (
            <QuietBand testID="capture-offline">
              <ThemedText variant="caption" style={styles.bandText}>
                You're offline. Reading the label needs a connection: type it in now, or tap Read the label once you're back.
              </ThemedText>
            </QuietBand>
          ) : null}
          <PrimaryButton
            label={offline ? 'Read the label · needs a connection' : 'Read the label'}
            disabled={offline}
            onPress={() => { if (frontPhoto) void runUploadAndExtract(frontPhoto, ingredientsPhoto, barcodePhoto); }}
          />
          {offline ? <PrimaryButton label="Type it in now" variant="secondary" onPress={() => setStep('edit')} /> : null}
          <HomeCard>
            <SlotRow
              title="Add the ingredients"
              detail="Lets us read every protein, not just the main one."
              onPress={() => handleSlotTap('ingredients')}
              trailing={ingredientsPhoto ? <AddedThumb uri={ingredientsPhoto.localUri} /> : undefined}
              accessibilityLabel={ingredientsPhoto ? 'Ingredients photo added. Replace it' : undefined}
              testID="capture-slot-ingredients"
            />
            <SlotRow
              title="Add the barcode"
              onPress={() => handleSlotTap('barcode')}
              trailing={barcodePhoto ? <AddedThumb uri={barcodePhoto.localUri} /> : undefined}
              accessibilityLabel={barcodePhoto ? 'Barcode photo added. Replace it' : undefined}
              divided
              testID="capture-slot-barcode"
            />
          </HomeCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── The wait and the confirm: one tree ── P3 + P4. The wait is the confirm screen
  // itself: the owner's photo stands from the first frame, the read card holds the tick
  // at its rail, and when the read answers the tick grows into the rail and the facts
  // fill in place (CaptureReadCard). The same element across both steps, so nothing has
  // to fly.
  if (step === 'uploading' || step === 'confirm') {
    const reading = step === 'uploading';
    const formatLabel = FOOD_FORMATS.find((f) => f.value === extractedFormat)?.label ?? extractedFormat;
    const facts = [
      { label: 'Brand', value: extractedBrand.trim() },
      { label: 'Product', value: extractedProduct.trim() },
      { label: 'Format', value: formatLabel },
      { label: 'Protein', value: summaryLine ?? '' },
    ].filter((f) => f.value.length > 0);
    // P6: whose meal this is. The record is written for the active pet at commit, so
    // that pet is the record's pet here (C-9); a blank name reads anonymous, never wrong.
    const mealPetName = resolveRecordPetName(pets, activePet?.id);
    const mealTime = mealOccurredAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return (
      <SafeAreaView style={[styles.container, styles.ground]}>
        <Header title="Confirm" />
        <ScrollView contentContainerStyle={styles.confirmScroll} scrollEnabled={!reading}>
          {frontPhoto && (
            <HomeCard noPadding style={withCap(styles.heroCard, confirmFrameCap)}>
              {reading ? (
                // During the wait the photo is only a picture: no control, rather than a
                // control announced as dimmed (C-7).
                <Image
                  source={{ uri: frontPhoto.localUri }}
                  style={styles.confirmPhoto}
                  resizeMode="cover"
                  accessibilityLabel="Your photo of the front of the package"
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setViewingPhoto(true)}
                  activeOpacity={0.85}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Your photo of the front of the package"
                  accessibilityHint="Opens the photo full screen"
                >
                  <Image source={{ uri: frontPhoto.localUri }} style={styles.confirmPhoto} resizeMode="cover" />
                </TouchableOpacity>
              )}
            </HomeCard>
          )}
          <CaptureReadCard
            reading={reading}
            facts={facts}
            identity={foodId}
            // Tier-1 (D7/§8.5): the provenance line says whether the protein set is the
            // WHOLE set, and "ingredient list not read" when the D10 gate fails.
            provenance={<ProteinDisclosure input={disclosureInput} />}
          />
          {reading ? (
            <CaptureSilhouette working={extracting} withHead={false} />
          ) : (
            <>
              <SectionLabel label="Type" />
              <TypeChips value={foodType} onChange={setFoodType} />
              {/* Meal time is meaningful only when this capture also logs a meal.
                  In B-110 add-only mode (no `fromLog`) no meal is written, so the
                  time editor would set a value nothing consumes — hide it. */}
              {cameFromMealLog && (
                <View style={styles.mealTimeRow}>
                  <ThemedText variant="body" style={styles.mealTimeText}>
                    {`${mealPetName}'s meal · ${mealTime}`}
                    {/* geist-ok: Deliberately a raw <Text>, not a nested ThemedText (CUL-609; the CLAUDE.md
                        nested-span convention). A nested ThemedText's explicit fontFamily breaks RN's
                        native text-style cascade; this EXIF span differs from its parent only in size and
                        colour, so it inherits the parent's resolved Geist regular. See app/log.tsx. */}
                    {mealOccurredAtSource === 'exif' ? (
                      <Text style={styles.mealTimeAttribution}>
                        {'  ·  '}{formatExifAttribution(mealOccurredAt.toISOString())}
                      </Text>
                    ) : null}
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.changeTime}
                    onPress={() => setShowMealTimePicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Change time"
                  >
                    <ThemedText variant="caption" style={styles.changeTimeText}>Change time</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
              <PrimaryButton
                label="Looks right"
                // A read missing its brand or product cannot be saved as it stands, and
                // a commit that silently does nothing is worse than the form that says
                // what is missing.
                onPress={() => (extractedBrand.trim() && extractedProduct.trim()
                  ? attemptCommit(extractedBrand, extractedProduct, extractedFormat, foodType)
                  : setStep('edit'))}
              />
              <PrimaryButton label="Edit" variant="secondary" onPress={() => setStep('edit')} />
            </>
          )}
        </ScrollView>
        {showMealTimePicker && (
          <TimeEditSheet
            value={mealOccurredAt}
            title="When did this happen?"
            onCancel={() => setShowMealTimePicker(false)}
            onSave={(date) => {
              // Provenance flips to 'manual' on an actual value change from any
              // non-manual source ('exif' or 'now'); a peek-and-save that changes
              // nothing preserves it, so an EXIF attribution is never silently
              // dropped. Shares the one rule with app/log.tsx and app/edit-event.tsx
              // via sourceAfterPointEdit (B-525).
              setMealOccurredAtSource(
                sourceAfterPointEdit(mealOccurredAtSource, date.getTime() !== mealOccurredAt.getTime()),
              );
              setMealOccurredAt(date);
              setShowMealTimePicker(false);
            }}
          />
        )}
        {frontPhoto && (
          <PhotoViewer visible={viewingPhoto} uris={[frontPhoto.localUri]} onClose={() => setViewingPhoto(false)} />
        )}
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
    const saveLabel = cameFromMealLog ? 'Save and log food' : 'Save';
    // Back goes where the owner came from: the read (when one landed), the photos step
    // (typed in before any read ran), or out.
    const goBack = readLanded
      ? () => setStep('confirm')
      : frontPhoto && !readStarted
        ? () => setStep('review')
        : () => router.back();
    // P7: after a read was asked for, the photo stays in view while the owner types.
    const showThumb = !!frontPhoto && readStarted;
    return (
      <SafeAreaView style={[styles.container, styles.ground]}>
        <Header title="Edit food" leading="back" onLeadingPress={goBack} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* §6.1 cap-reached: a calm informational band (never error styling), with
                the first B-333 care-first surface (§16). Distinct from the failure band
                below, which is a genuine fault. */}
            {capReached ? (
              <QuietBand>
                <ThemedText variant="caption" style={styles.bandText}>{foodCapCopy(capReached.cap)}</ThemedText>
                <ThemedText variant="note" style={styles.careLine}>{careFirstLine(activePet?.name)}</ThemedText>
              </QuietBand>
            ) : extractionFailed ? (
              // F6: a failed read is not a symptom, so it sits on the quiet band.
              <QuietBand testID="capture-read-failed">
                {/* CUL-2164 / D-1 (A): says only what is true. Nothing retries in the
                    background, and the food page's retry is named only when it exists:
                    the server recorded its own failed read (retryOnFoodPage). */}
                <ThemedText variant="caption" style={styles.bandText}>
                  {retryOnFoodPage
                    ? "Couldn't read the label. Fill in what you know below; you can try reading it again from the food's page."
                    : "Couldn't read the label. Fill in what you know below."}
                </ThemedText>
              </QuietBand>
            ) : null}
            {showThumb && frontPhoto ? (
              <PhotoThumb
                uri={frontPhoto.localUri}
                caption="Your photo. Tap to see it full size."
                accessibilityLabel="Your photo of the front of the package"
                onPress={() => setViewingPhoto(true)}
                testID="capture-photo-thumb"
              />
            ) : null}
            <TextField
              label="Brand"
              placeholder="e.g. Royal Canin"
              value={extractedBrand}
              onChangeText={setExtractedBrand}
              autoCapitalize="words"
            />
            <TextField
              label="Product name"
              placeholder="e.g. Gastrointestinal Adult"
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
              variant="default"
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
            <TypeChips value={foodType} onChange={setFoodType} />
            {/* C-7: a disabled Save says why it is waiting, in the words it shows. */}
            <PrimaryButton
              label={canSave ? saveLabel : `${saveLabel} · add a brand and product`}
              onPress={() => attemptCommit(extractedBrand, extractedProduct, extractedFormat, foodType)}
              disabled={!canSave}
            />
          </ScrollView>
        </KeyboardAvoidingView>
        {frontPhoto && (
          <PhotoViewer visible={viewingPhoto} uris={[frontPhoto.localUri]} onClose={() => setViewingPhoto(false)} />
        )}
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

// Type (Meal, Treat, Other) as the radio group it is (CUL-1910 F3): three bare chips
// announced three buttons and no choice. One required answer, so no deselect; the
// chosen chip takes the selected role, the same as Format beside it.
function TypeChips({ value, onChange }: { value: FoodType; onChange: (next: FoodType) => void }) {
  return (
    <ChipGroup
      options={FOOD_TYPES}
      value={value}
      onChange={(v) => {
        const next = FOOD_TYPES.find((t) => t.value === v);
        if (next) onChange(next.value);
      }}
      allowDeselect={false}
      variant="default"
      accessibilityLabel="Type"
      style={styles.typeRow}
    />
  );
}

// An optional photo once taken: the slot row's trailing mark. Not a button of its own:
// the whole row is the button (it replaces the photo), so a nested target would split
// one control in two.
function AddedThumb({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.addedThumb} resizeMode="cover" />;
}

// D-1 (A): whether the food page will offer "try reading it again" for this food. That
// page shows its retry only on a 'failed' row whose ai_extraction_error the Edge
// Function wrote (its catch is the only writer), so ask the server the same question
// rather than guess from the transport error. Any doubt (offline, a failed read of the
// row) answers false: the band then promises nothing, which is never untrue.
const READ_BACK_TIMEOUT_MS = 3000;
async function serverRecordedFailedRead(foodId: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    // Bounded: the owner is on the wait while this runs, and an answer that never comes
    // is the same as no answer.
    const timedOut = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ data: null, error: { message: 'read-back timed out' } }), READ_BACK_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([
      supabase.from('food_items').select('ai_extraction_error').eq('id', foodId).maybeSingle(),
      timedOut,
    ]);
    if (error || !data) return false;
    const recorded = (data as { ai_extraction_error: string | null }).ai_extraction_error;
    return typeof recorded === 'string' && recorded.length > 0;
  } catch (err) {
    console.warn('[food-capture] could not read the failed read back:', err);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  // Home's ground under the photos, the read and the form, so the cards sit on it the
  // way Home's do (P4).
  ground: {
    backgroundColor: theme.colorNeutralLight,
  },

  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  introHeading: {
    fontSize: theme.textXL,
    fontWeight: theme.weightMedium,
    lineHeight: theme.lineHeightXL,
    color: theme.colorTextPrimary,
  },
  introBody: {
    color: theme.colorTextSecondary,
  },
  // D-M6 early-access label — quiet tertiary line, no badge/pill styling (§7.2).
  earlyAccessLabel: {
    color: theme.colorTextTertiary,
  },

  linkBtn: {
    alignItems: 'center',
    minHeight: theme.hitTarget,
    justifyContent: 'center',
  },
  // F5: a link is a control, so it speaks the action role, never the teal of a good fact.
  linkBtnText: {
    fontSize: theme.textMD,
    color: colorRoles.action.onLight,
  },

  heroCard: {
    overflow: 'hidden',
  },
  reviewPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: theme.colorNeutralLight,
  },
  // P4: 16:9, so the commit stays reachable at 390pt with the read card under it.
  confirmPhoto: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colorNeutralLight,
  },
  addedThumb: {
    width: theme.space4,
    height: theme.space4,
    borderRadius: theme.radiusXS,
    backgroundColor: theme.colorNeutralLight,
  },

  confirmScroll: {
    padding: theme.space2,
    gap: theme.space2,
  },
  mealTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space2,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorSurface,
    minHeight: theme.hitTarget,
  },
  mealTimeText: {
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  mealTimeAttribution: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
  changeTime: {
    minHeight: theme.hitTarget,
    justifyContent: 'center',
  },
  changeTimeText: {
    color: colorRoles.action.onLight,
    fontWeight: theme.weightMedium,
  },

  formScroll: {
    padding: theme.space3,
    gap: theme.space2,
  },
  formatRow: {
    marginBottom: theme.space2,
  },
  typeRow: {
    marginBottom: theme.space2,
  },
  bandText: {
    color: theme.colorTextPrimary,
  },
  // The first B-333 care-first surface — quieter than the cap copy above it.
  careLine: {
    color: theme.colorTextSecondary,
  },

  completeContainer: {
    flex: 1,
    backgroundColor: theme.colorSurface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space2,
    padding: theme.space3,
  },
  savedHeading: {
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  savedName: {
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
