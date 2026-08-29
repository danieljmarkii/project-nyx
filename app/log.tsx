import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { ThemedText } from '../components/ui/ThemedText';
import { FoodPicker } from '../components/log/FoodPicker';
import { parseFoodScope } from '../lib/food';
import { MedicationPicker } from '../components/log/MedicationPicker';
import { ComboDoseConfirmSheet } from '../components/log/ComboDoseConfirmSheet';
import { TimeConfidenceField, TimeMode, FoundMode } from '../components/log/TimeConfidenceField';
import { resolveTimeModeChange, resolveFoundModeChange, sourceAfterPointEdit, refreshedNowPoint, DEFAULT_WINDOW_SPAN_MS, buildTimeFields as deriveTimeFields } from '../lib/eventTimeEdit';
import { insertSimpleEvent } from '../lib/simpleEvent';
import { pickPhotoSource, type PhotoSource } from '../lib/photoSource';
import { EventIcon } from '../components/event/EventIcon';
import { EventTypePicker } from '../components/log/EventTypePicker';
import { Header } from '../components/ui/Header';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../constants/eventTypes';
import { usePetStore } from '../store/petStore';
import { useWidgetPetLink } from '../hooks/useWidgetPetLink';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useAppActive } from '../hooks/useAppActive';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { useAllowlistFlag } from '../hooks/useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';
import { useMomentStore, MEAL_FLAGGED_DURATION_MS, whenMealCardVisible } from '../store/momentStore';
import { getActiveRegimenForDrug, getMealForEvent, updateDoseAdherence, PickerFood, PickerMedication } from '../lib/db';
import { supabase } from '../lib/supabase';
import { syncPendingMedicationAdministrations } from '../lib/sync';
import { insertMeal } from '../lib/meals';
import { insertMedicationDose, applyLogTimeDoubleDoseCheck } from '../lib/medicationDose';
import { insertWeightCheck, getLatestWeightKg, parseWeightLbsToKg, kgToLbs } from '../lib/weight';
import { inferDoseVehicleFromFoodType, initialComboDoseAdherence, isVehicleNotFinished, drugDisplayName, type DoseAdherence } from '../lib/medications';
// The simple-event write side-effects (event row + photo + its AI read + sync +
// regen) now live in lib/simpleEvent (imported near the eventTimeEdit import
// above), shared with the in-sheet confirm — so log.tsx no longer imports the
// storage / analysis / signal / sync-event helpers directly for this path.
import { evaluateMealLogTimeFlag, noteTrialFlagShown } from '../lib/trialContaminant';
import { exifDateToISO, trustedPastExifIso, formatExifAttribution, formatTime, OccurredConfidence } from '../lib/utils';

type Step = 'type' | 'food' | 'medication' | 'symptom' | 'simple' | 'stool-type' | 'weight';

// B-010 — the time fields a logged event carries. occurred_at is always a
// single derived point; confidence + window bounds describe its certainty.
type TimeFields = {
  confidence: OccurredConfidence;
  occurredAt: Date;
  earliest: Date | null;
  latest: Date | null;
  source: 'manual' | 'exif' | 'now';
};

const SEVERITY_CONFIG = [
  { value: 1, label: 'Mild' },
  { value: 2, label: '' },
  { value: 3, label: '' },
  { value: 4, label: '' },
  { value: 5, label: 'Severe' },
];

export default function LogModal() {
  const { activePet, pets } = usePetStore();
  const { user } = useAuthStore();
  const { prependEvent } = useEventStore();
  // B-745 — the More-events redesign is dark behind `log_picker_v2` (the B-712
  // two-gate beta shape): server allowlist eligibility × the local opt-in, never one
  // alone (both hooks called unconditionally — Rules of Hooks — then combined, like
  // SignalZone). Flag-off renders the shipped flat grid byte-identical (FL-1); only
  // the grouped-grid PRESENTATION is gated. The rest of PR 1 (the glyph family, the
  // shared Header, photo-first removal) is systemic and lands on both paths.
  const pickerEligible = useAllowlistFlag('log_picker_v2');
  const pickerOptedIn = useBetaOptIn('log_picker_v2');
  const pickerV2 = pickerEligible && pickerOptedIn;
  // W1 taxonomy expansion (event_types_v2, CUL-675) — same two-gate shape. Gates
  // the grouped grid's TILE LIST only (the Breathing group + the ruled regroup);
  // the flat grid never carries a v2 tile at any flag state, and EVENT_TYPES
  // itself is never flag-gated (§12 FL-1 — reads stay ungated by design).
  const taxonomyEligible = useAllowlistFlag('event_types_v2');
  const taxonomyOptedIn = useBetaOptIn('event_types_v2');
  const taxonomyV2 = taxonomyEligible && taxonomyOptedIn;
  const showNamedMoment = useMomentStore((s) => s.showNamed);
  const showMealMoment = useMomentStore((s) => s.showMeal);
  const patchTrialFlag = useMomentStore((s) => s.patchTrialFlag);
  const rescheduleMoment = useMomentStore((s) => s.rescheduleHide);
  const showMedicationMoment = useMomentStore((s) => s.showMedication);
  // B-156 PR B2b — combo params. When pairedEventId is set, this medication log is a
  // dose given WITH a just-logged meal/treat (entered from its completion card): the
  // dose binds to the meal's pet (pairedPetId) and links to the meal event, and
  // how_given is inferred from pairedFoodType. Absent on every standalone log path.
  const {
    type: typeParam,
    pet: petParam,
    scope: scopeParam,
    pairedEventId,
    pairedPetId,
    pairedFoodType,
    pairedFoodName,
    comboSource,
  } = useLocalSearchParams<{
    type?: string;
    pet?: string;
    scope?: string;
    pairedEventId?: string;
    pairedPetId?: string;
    pairedFoodType?: string;
    pairedFoodName?: string;
    comboSource?: string;
  }>();
  // B-406 — a treat door deep-links `log?type=meal&scope=treat`; validate the
  // untrusted param down to a known FoodScope (or undefined) so the food picker
  // opens pre-scoped. A bad value falls back to the picker's 'all' default.
  const initialFoodScope = parseFoodScope(scopeParam);
  // W5 — the widget's "Something else…" app door names its bound pet, so this
  // screen opens on that pet rather than whichever one the app last showed.
  useWidgetPetLink(petParam);
  const isComboMode = !!pairedEventId;
  // B-325 — a RETROACTIVE combo: the med is being added to an ALREADY-logged meal/treat
  // from that event's detail screen (comboSource='detail'), not from the in-the-moment
  // completion card (the B-156 PR B2b forward path). The two differ only in what happens
  // AFTER the dose is written: the forward path plays the completion card over Home; the
  // retroactive path suppresses that card and returns to the treat detail screen — and,
  // when the vehicle wasn't finished, first shows the deliberate confirm sheet in place of
  // the card's sharpened prompt. Everything up to and including the dose write is shared.
  const isRetroactiveCombo = isComboMode && comboSource === 'detail';

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<EventTypeKey | null>(null);

  // Photo attachment
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentTakenAt, setAttachmentTakenAt] = useState<string | null>(null);
  // Source pixel dimensions from the picker asset, kept only so the pre-upload
  // resize can cap the photo's true longest edge (B-352). Null on the FAB
  // pending-attachment path, which carries no dimensions — compressForUpload
  // falls back to measuring the image itself there.
  const [attachmentDims, setAttachmentDims] = useState<{ width: number; height: number } | null>(null);

  // Food state (set by the picker; used by handleConfirm)
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedFoodBrand, setSelectedFoodBrand] = useState<string | null>(null);
  const [selectedFoodProduct, setSelectedFoodProduct] = useState<string | null>(null);
  // B-568 — the picked food's physical form, carried alongside brand/product so the
  // optimistic row can name its variant before the next timeline read hydrates it.
  const [selectedFoodFormat, setSelectedFoodFormat] = useState<string | null>(null);

  // B-325 — the retroactive combo-confirm sheet. Set (with the just-written dose's event
  // id + the food/pet it rode in) when a retroactive combo dose lands UNCONFIRMED because
  // its vehicle wasn't finished; the sheet lets the owner resolve it before returning to
  // the treat. Null the rest of the time (finished/standalone paths never show it).
  const [comboConfirm, setComboConfirm] = useState<{
    doseEventId: string;
    petName: string;
    foodName: string | null;
  } | null>(null);

  // B-336 — the double-submit guard shared by both one-tap picker paths (food +
  // medication). A picker tile is the write, so a rapid double-tap used to run the
  // handler twice and land two events for one meal/pill. One guard for the screen
  // is correct rather than one per picker: only a single picker step is ever
  // mounted, so the two paths can never be in flight at the same time.
  const guardSubmit = useSubmitGuard();
  const appActive = useAppActive();
  // A photo trip is both the longest gap on this screen and the one thing that may
  // legitimately move the time (EXIF). The latch keeps the app-foreground effect
  // out of that decision: launchPhotoPicker settles the point itself, so the effect
  // can never race in and overwrite an EXIF stamp with the wall clock.
  const photoInFlight = useRef(false);

  // Symptom state
  const [severity, setSeverity] = useState<number | null>(null);

  // Weight state (B-186). The lbs the owner is entering — pre-filled with the
  // pet's last known weight (the pets.weight_kg snapshot, converted to lbs) so a
  // re-weigh is a small adjustment, not a from-scratch entry. Weight is the one
  // event where the value IS the entry (Principle 1's confirm-don't-enter can't
  // apply), so this field is the screen.
  const [weightLbsStr, setWeightLbsStr] = useState('');

  // Shared
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  // Provenance of `occurredAt`. Flips to 'exif' when a photo with
  // DateTimeOriginal is attached; flips to 'manual' the moment the user
  // touches the time picker (sourceAfterPointEdit).
  //
  // Default is 'now' (CUL-576). It used to be 'manual' on the reasoning that the
  // owner implicitly accepts the clock by not changing it — but that reads the
  // column backwards. `occurred_at_source` exists so the vet report and the
  // correlation engine can tell a witnessed-now log from an owner-backfilled one
  // (lib/eventTimeEdit, B-525), and 'manual' is the app asserting that a human
  // chose this timestamp. Nobody chose it: the app did, at mount. Every symptom
  // and weight logged on the default clock has been claiming otherwise.
  const [occurredAtSource, setOccurredAtSource] = useState<'manual' | 'exif' | 'now'>('now');
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

  // B-745 R4 — photo-first entry retired: every log starts from the event. Nothing
  // writes `pendingAttachment` anymore (the FAB no longer offers a photo-first door),
  // so the mount-time consumer, the type-step "photo is attached" banner, and the
  // dashed photo tile all retired here as dead code. Photos still attach INSIDE every
  // event flow (renderPhotoAttachRow on the symptom/simple steps; the photo row on
  // PR 3's confirm) — the capability audit stayed clean, only the entry point went.

  // Skip type selection when a type is pre-selected via route param (e.g. FAB
  // "Log food" → meal, or the Vomit / Loose stool quick taps → vomit / diarrhea)
  useEffect(() => {
    if (!typeParam) return;
    if (typeParam === 'meal') {
      setSelectedType('meal');
      setStep('food');
    } else if (typeParam === 'medication') {
      // Medication has hasFood:false but needs its own picker, not the simple
      // step — special-cased like stool_normal (handleTypeSelect mirrors this).
      setSelectedType('medication');
      setStep('medication');
    } else if (typeParam === 'weight_check') {
      // Weight has hasFood:false but needs its own numeric step, not the simple
      // step — special-cased like medication/stool (handleTypeSelect mirrors this).
      setSelectedType('weight_check');
      seedWeightPrefill();
      setStep('weight');
    } else if (typeParam in EVENT_TYPES) {
      const t = typeParam as EventTypeKey;
      setSelectedType(t);
      // Same D10 reset as handleTypeSelect: today this branch runs on a fresh
      // mount whose defaults already equal the reset, but the guarantee must be
      // enforced on every entry path into the simple step, not coincide with
      // mount state (code-review finding on this PR) — a later param change or
      // remount tweak must not be able to reopen the B-448 leak.
      resetTimeStateForWitnessed(t);
      setStep(EVENT_TYPES[t].hasFood ? 'food' : 'simple');
    }
  }, [typeParam]);

  // CUL-576 — re-derive the clock default when the screen is re-entered.
  //
  // The staleness this closes is the long tail of the same defect the photo trip
  // closes above: a log screen left open, backgrounded, and restored an hour later
  // still holds the point it mounted with, and that is what the time row shows and
  // what the write commits. Rising edge only, and 'inactive' counts as leaving
  // (useAppActive treats the iOS app-switcher / an incoming call as not-active),
  // which is exactly the transition a restored screen makes.
  //
  // Skipped while a photo picker is up: that path owns the point (an EXIF stamp
  // must win over the wall clock) and settles it on its own way back.
  const wasAppActive = useRef(appActive);
  useEffect(() => {
    const returned = appActive && !wasAppActive.current;
    // The edge is consumed BEFORE the guard, deliberately: a skip here means the
    // photo path owns the point on this trip, not that the re-derive is owed later.
    wasAppActive.current = appActive;
    if (!returned || photoInFlight.current) return;
    setOccurredAt((prev) => refreshedNowPoint(prev, occurredAtSource, new Date()));
  }, [appActive, occurredAtSource]);

  // D10 — a witnessed-by-construction leaf (cough/sneeze) renders no Saw it /
  // Found it, so its write must derive from a clean witnessed state. handleBack
  // already resets these on every path back to the grid; calling this on BOTH
  // entry paths into a step (the grid tap and the ?type= route param) is the
  // structural guarantee that no stale "Found it" state can ever reach a leaf
  // whose record cannot hold a window (the B-448 leak class, closed at the
  // selection seam). No-op for artifact leaves.
  function resetTimeStateForWitnessed(type: EventTypeKey) {
    if (EVENT_TYPES[type].confidenceModel !== 'witnessed') return;
    setTimeMode('saw');
    setFoundMode('before');
    setEarliest(null);
  }

  function handleTypeSelect(type: EventTypeKey) {
    setSelectedType(type);
    const config = EVENT_TYPES[type];
    resetTimeStateForWitnessed(type);
    if (config.hasFood) setStep('food');
    else if (type === 'medication') setStep('medication');
    else if (type === 'weight_check') { seedWeightPrefill(); setStep('weight'); }
    // B-745 PR 2 — the flag-on grouped grid SPLITS Stool inline (its Normal/Loose
    // segments emit stool_normal / diarrhea directly), so only the flag-off flat
    // grid's single Stool tile still opens the Normal/Loose sub-step. diarrhea never
    // reaches here from the flat grid (it's filtered out), so it falls to 'simple'.
    else if (type === 'stool_normal' && !pickerV2) setStep('stool-type');
    else setStep('simple');
  }

  // Pre-fill the weight field with the pet's last known weight (the snapshot),
  // converted to lbs — so a re-weigh is an adjustment, not a fresh entry. Blank
  // when no weight is on file yet (first-ever check).
  function seedWeightPrefill() {
    const lastKg = usePetStore.getState().activePet?.weight_kg ?? null;
    setWeightLbsStr(lastKg != null ? kgToLbs(lastKg) : '');
  }

  // Chooser first, then only the chosen source's permission (CUL-577, lib/photoSource).
  // The old order gated everything behind the media-library grant, so a
  // library-denied owner could never take a camera photo of the thing they were
  // logging — and here that photo is what fires the vomit/stool AI read.
  async function handlePickPhoto() {
    // Wrapped because this is a floating promise at the call site (onPress cannot
    // await it), so a rejecting picker would otherwise surface as an unhandled
    // rejection and a photo row that just does nothing. The log itself is
    // unaffected — a photo is an enrichment, never the event (lib/simpleEvent draws
    // the same line), so this reports and returns rather than failing the flow.
    try {
      const source = await pickPhotoSource('Attach photo');
      if (!source) return;
      await launchPhotoPicker(source);
    } catch (e) {
      console.error('[log] photo attach failed:', e);
      Alert.alert("Couldn't open that", 'Try again in a moment.');
    }
  }

  async function launchPhotoPicker(source: PhotoSource) {
    photoInFlight.current = true;
    try {
      await runPhotoPicker(source);
    } finally {
      photoInFlight.current = false;
    }
  }

  async function runPhotoPicker(source: PhotoSource) {
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
    setAttachmentDims({ width: asset.width, height: asset.height });

    const exifRaw = (asset.exif as Record<string, unknown> | undefined);
    const dateRaw = exifRaw?.DateTimeOriginal ?? exifRaw?.DateTime;
    const iso = typeof dateRaw === 'string' ? trustedPastExifIso(exifDateToISO(dateRaw)) : null;
    if (iso) {
      setAttachmentTakenAt(iso);
      setOccurredAt(new Date(iso));
      setOccurredAtSource('exif');
      return;
    }
    // No usable stamp, so the clock default still stands — and it has been
    // standing since mount, through however long the owner spent hunting for the
    // shot. Re-derive it here rather than at save (CUL-576, refreshedNowPoint):
    // the value is on screen in the time row, so the row and the write have to
    // agree. An owner-set or EXIF point returns from refreshedNowPoint untouched.
    setOccurredAt((prev) => refreshedNowPoint(prev, occurredAtSource, new Date()));
  }

  // One-tap log path from the new picker — bypasses state so it works
  // even before `selectedFoodId` has propagated through React. Provenance
  // is forced to 'now' (with a fresh new Date()) because the user never
  // saw the time picker on this path; the meal completion card offers the
  // "Change time" escape hatch. Exception: if a photo with EXIF was
  // attached before reaching the picker, preserve that provenance and
  // the EXIF-derived time — Dr. Chen relies on EXIF-stamped meals for
  // clinical trust, and clobbering it here would silently drop that.
  // B-351 slice 4 / B-693 — resolve the log-time trial heads-up (contents OR
  // membership, whichever fires) and land it on the card that is already showing.
  // Fire-and-forget by design: the meal is written, the card is up, and this is
  // strictly additive information. One evaluator, one read of the food record
  // (B-693 single-read composition). The ledger write happens ONLY if the patch
  // landed, so the food's one-per-trial budget can never be spent on a heads-up the
  // owner did not see — the read/write split that keeps rule 3 honest.
  async function applyTrialFlag(
    eventId: string,
    petId: string,
    foodId: string,
    occurredAt: string,
  ) {
    const flag = await evaluateMealLogTimeFlag({ petId, foodId, occurredAt });
    if (!flag) return;
    // Wait for the card to actually be on screen before patching. This path defers
    // the reveal (delayMs below) and the eval above is now an all-local read that
    // resolves first — so a bare patch would hit a not-yet-revealed card, return
    // false, and drop the heads-up (the FAB path has no delay and never saw this).
    // whenMealCardVisible resolves the instant the card reveals; false means a newer
    // log superseded it, in which case we skip BOTH the patch and rule 3's spend.
    if (!(await whenMealCardVisible(eventId))) return;
    if (!patchTrialFlag(eventId, flag)) return;
    rescheduleMoment(MEAL_FLAGGED_DURATION_MS);
    await noteTrialFlagShown(flag);
  }

  // Returns whether an event was COMMITTED — the double-submit guard's contract
  // (B-336). A null result means handleConfirm wrote nothing and already alerted,
  // so the tiles must stay live for the retry.
  async function handlePickFood(food: PickerFood): Promise<boolean> {
    setSelectedFoodId(food.id);
    setSelectedFoodBrand(food.brand);
    setSelectedFoodProduct(food.product_name);
    setSelectedFoodFormat(food.format);
    const usingExif = occurredAtSource === 'exif';
    const effectiveOccurredAt = usingExif ? occurredAt : new Date();
    const result = await handleConfirm({
      foodId: food.id,
      foodBrand: food.brand,
      foodProduct: food.product_name,
      foodFormat: food.format,
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
    // B-336 — settle the double-submit guard's answer HERE, on the write itself,
    // and make sure nothing below can change it. Everything past this point is
    // presentation (the completion card, a fire-and-forget trial flag); the meal is
    // already on disk. If presentation threw, the guard would release and a second
    // tap would write a SECOND meal for the same bowl — a broken card is cosmetic,
    // a duplicate meal corrupts the record the vet report reads.
    if (!result) return false;
    try {
      // Defer the meal card past the modal dismiss so it appears at the root layer
      // (not occluded by the still-presented modal on iOS) where the user can see
      // and act on it. Meals fire the meal presentation of the completion moment —
      // a single warmed bottom card (gold beat + "Logged {brand}") that ALSO
      // carries the intake follow-up + "Change time" (B-064 unified what used to be
      // a separate post-log toast). They deliberately skip the full-screen beat;
      // firing both would double the surface. The WSAVA intake chip row renders for
      // food_type 'meal' and 'treat' (B-014; treats added 2026-05-23). NOTE: every
      // meal-entry path must route through showMeal — if a non-picker meal flow is
      // ever added (e.g. a manual quick-add), it must fire showMeal too, or the
      // intake capture surface vanishes for that path.
      const foodType = food.food_type === 'meal' || food.food_type === 'treat' || food.food_type === 'other'
        ? food.food_type
        : null;
      showMealMoment(
        {
          eventId: result.eventId,
          petId: result.petId,
          occurredAt: result.occurredAt,
          foodType,
          foodBrand: food.brand,
          foodProductName: food.product_name,
          foodFormat: food.format,
          intakeRating: null,
        },
        { delayMs: 450 },
      );
      // B-351 slice 4 / B-693 — the log-time trial heads-up, resolved
      // fire-and-forget so neither the log nor the card ever waits on it
      // (Principle 1: the log stays one tap, the meal is already saved). The card
      // above reveals behind delayMs to clear the dismissing /log modal on iOS;
      // applyTrialFlag itself waits for THAT reveal before patching (whenMealCardVisible)
      // rather than racing ahead of it — the evaluation is a fast local read now, so
      // without the wait the patch landed on a not-yet-visible card and the warning
      // was dropped. The one-per-trial budget is still spent only once the heads-up
      // is genuinely on screen, so a card that never shows can't burn it.
      void applyTrialFlag(result.eventId, result.petId, food.id, result.occurredAt);
    } catch (e) {
      console.error('[log] meal saved, but its completion card failed:', e);
    }
    return true;
  }

  // Dose log from the medication picker — the medication twin of handlePickFood
  // (B-117 PR 3). insertMedicationDose owns the event + dose-child write and the sync
  // push; here we mirror the meal path's caller concerns: the optimistic store update
  // (prependEvent) and the completion card. Serves TWO entry points: a STANDALONE dose
  // (the FAB/medication step), and a COMBO dose (B-156 PR B2b) entered from a meal/treat
  // completion card — which binds the dose to the meal's pet + event (paired_event_id)
  // and infers the vehicle from the food. The only difference is which pet/link/vehicle
  // the write carries; everything downstream (regimen link, sync, card) is shared.
  // Returns whether a dose was COMMITTED — the double-submit guard's contract (B-336).
  // The two early exits (no pet to write for; the dose write threw) wrote nothing and
  // return false so the tile works again; every path past the successful insert returns
  // true, including the retroactive-combo path that stays mounted behind the confirm
  // sheet — the dose IS on disk there, so a second tap must not write another one.
  async function handlePickMedication(med: PickerMedication): Promise<boolean> {
    // The pet this dose is written for. STANDALONE: the active pet, read at write time
    // (the queue-then-switch edge, multi-pet spec §6). COMBO (B-156 PR B2b): the MEAL's
    // pet (pairedPetId) — a dose given with a meal must land on the same pet as that
    // meal, and binding to the meal's pet (never a possibly-switched active pet) makes
    // the paired_event_id link same-pet BY CONSTRUCTION; the migration-023 trigger is
    // the server-side backstop, not the primary guard.
    const writePetId = isComboMode
      ? (pairedPetId ?? null)
      : (usePetStore.getState().activePet?.id ?? null);
    if (!writePetId) return false;
    // COMBO: infer the vehicle from the food it rode in (meal → in_food, treat →
    // in_treat). A best-guess seed, pre-selected on the card for the owner to confirm
    // or change; descriptive only, no adherence/safety meaning of its own.
    const howGiven = isComboMode ? inferDoseVehicleFromFoodType(pairedFoodType) : null;

    // B-156 PR B3 — the intake → adherence SAFETY coupling. For a combo dose, the
    // linked vehicle's intake decides the dose's STARTING adherence: a not-finished
    // vehicle (refused/picked) starts the dose UNCONFIRMED (null), never an auto
    // 'given' — so if the completion card auto-dismisses unanswered, the dose is
    // recorded unconfirmed, never a false compliant record (clinical-guardrails
    // Pattern 2: no path to a reassuring verdict by construction; the medication
    // analog of analyze-vomit's escalation floor). A standalone dose, or a combo
    // whose vehicle was finished/unrated, keeps the affirmative 'given'. The vehicle
    // intake is read from the just-logged meal; on a read failure we fall back to
    // null (unconfirmed) rather than 'given' — under uncertainty we never assert the
    // drug got in, and the read-time resurface join self-corrects either way.
    let vehicleIntake: string | null = null;
    let adherence: DoseAdherence | null = 'given';
    if (isComboMode && pairedEventId) {
      try {
        const meal = await getMealForEvent(pairedEventId);
        vehicleIntake = meal?.intake_rating ?? null;
        adherence = initialComboDoseAdherence(vehicleIntake);
      } catch (e) {
        console.warn('[log] combo vehicle-intake read failed; logging the dose UNCONFIRMED (never auto-given):', e);
        vehicleIntake = null;
        adherence = null;
      }
    }

    // B-153: link this dose to the drug's active regimen (if any) so a configured
    // regimen accumulates doses and the dose inherits its dose_amount — confirm-don't-
    // enter (spec §5.1). Reads the locally-hydrated regimens, so it works offline. No
    // regimen → an honest ad-hoc dose; a lookup failure degrades to the same ad-hoc dose
    // rather than blocking the log (logging is never gated on an optional enrichment).
    // Orthogonal to the combo link — a dose can be both regimen-linked and food-paired.
    let link: Awaited<ReturnType<typeof getActiveRegimenForDrug>> = null;
    try {
      link = await getActiveRegimenForDrug(writePetId, med.id);
    } catch (e) {
      console.warn('[log] active-regimen lookup failed; logging an ad-hoc dose:', e);
    }
    let result: Awaited<ReturnType<typeof insertMedicationDose>>;
    try {
      result = await insertMedicationDose({
        petId: writePetId,
        medicationItemId: med.id,
        medicationId: link?.id ?? null,        // the active regimen, if one exists
        adherence,                             // standalone/finished: 'given'; not-finished combo: null (B-156 PR B3)
        doseAmount: link?.dose_amount ?? null, // inherit the regimen's dose; else honest-null
        howGiven,                              // combo: inferred vehicle; standalone: null
        pairedEventId: pairedEventId ?? null,  // combo: the co-logged meal/treat event; else null
        occurredAt: new Date(),
      });
    } catch (e) {
      console.error('[log] medication dose write failed:', e);
      Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
      return false;
    }
    // B-336 — the dose is ON DISK from here down. Everything below is presentation:
    // the optimistic timeline row, the completion card, the retroactive confirm sheet,
    // the navigation. None of it may release the double-submit guard, because a released
    // guard means a second tap writes a SECOND dose for the same pill — the exact
    // clinical artifact this guard exists to prevent, and one that would reach the vet
    // report as a real double-dose. A failed card is cosmetic and self-corrects (History
    // and the dose detail read ground truth); it must never cost a duplicate record.
    try {
      // Optimistic timeline insert (B-117 PR 8) — only when the dose's pet is the one on
      // screen. In the rare combo queue-then-switch edge (writePetId is the meal's pet and
      // the active pet has since changed) the dose is still written + synced correctly for
      // the meal's pet; skipping the prepend just avoids briefly showing it under the wrong
      // pet — it appears when that pet's timeline next loads. A later adherence edit on the
      // completion card / detail screen re-reads ground truth on focus.
      if (writePetId === (usePetStore.getState().activePet?.id ?? null)) {
        prependEvent({
          id: result.eventId,
          pet_id: writePetId,
          event_type: 'medication',
          occurred_at: result.occurredAtIso,
          occurred_at_confidence: 'witnessed',
          severity: null,
          notes: null,
          source: 'manual',
          deleted_at: null,
          created_at: result.now,
          updated_at: result.now,
          medication_item_id: med.id,
          adherence, // mirrors the dose write — null for a not-finished-vehicle combo (B-156 PR B3)
          // paired_event_id / paired_vehicle_intake / paired_food_name are deliberately
          // omitted here: the in-doubt tag + note render only on the DB-backed read
          // surfaces (History EventRow via getTimeline, dose detail via getEventById),
          // never the Today zone, which reads this optimistic store row. If a Today-zone
          // in-doubt tag is ever added, thread the paired fields through here.
          drug_generic_name: med.generic_name,
          drug_brand_name: med.brand_name,
        });
      }
      // B-325 — RETROACTIVE combo (added from the treat's detail screen). No completion card
      // here (that card is the moment-of-logging warmth for a FRESH log on Home; a retroactive
      // add is a reflective edit). Instead we return to the treat detail screen, whose
      // focus-refetch renders the paired-dose cross-link — the pairing lives there, persistent
      // and editable-later on the dose's own screen (the G2 model; PM steer). When the vehicle
      // was NOT finished, first present the deliberate confirm sheet (the discoverable home for
      // PR B3's "still get it?" prompt): the dose is already written UNCONFIRMED, so the sheet
      // only RESOLVES it — a dismiss leaves it unconfirmed (never a false 'given'), resurfaced
      // calmly by History + the dose detail. Gate on the vehicle actually being not-finished
      // (isVehicleNotFinished), NOT on adherence===null: a vehicle-read FAILURE also yields a
      // null adherence, but there we have no evidence the food went unfinished, so we must not
      // claim it did — skip the sheet and let the calm resurface handle it.
      if (isRetroactiveCombo) {
        if (isVehicleNotFinished(vehicleIntake)) {
          // Keep /log mounted so the sheet renders over the picker; the sheet's handlers own
          // the router.back() to the treat once the owner answers or dismisses.
          const comboPetName =
            (pairedPetId ? pets.find((p) => p.id === pairedPetId)?.name : null)
            ?? usePetStore.getState().activePet?.name
            ?? 'your pet';
          setComboConfirm({
            doseEventId: result.eventId,
            petName: comboPetName,
            foodName: pairedFoodName?.trim() || null,
          });
        } else {
          // Finished / unrated vehicle → the dose is cleanly 'given'; just return to the treat.
          router.back();
        }
        return true;
      }

      // Dismiss the picker, then play the dose completion card at the root layer (delayMs
      // clears the dismissing modal so the card isn't briefly occluded on iOS). A combo
      // dose frames the card as "Logged together · {drug} · with {food}" (the link made
      // legible) and pre-selects the inferred vehicle; a standalone dose is the normal
      // "Logged · {drug}". A standalone/finished-vehicle combo pre-lights 'given' (§5.1);
      // a NOT-finished-vehicle combo lands UNCONFIRMED (adherence null) and the card
      // sharpens its prompt to "Did {pet} still get it?" (B-156 PR B3) — vehicleIntake
      // lets the card derive that in-doubt state and never pre-light a false 'given'.
      router.back();
      showMedicationMoment(
        {
          eventId: result.eventId,
          petId: writePetId,
          medicationItemId: med.id,
          occurredAt: result.occurredAtIso,
          // B-171 — name the drug the way the owner does (brand when present), so the
          // card confirms with the word on the tile they just tapped. generic_name is
          // NOT NULL on the catalog, so the fallback is belt-and-braces for a blank one.
          drugName: drugDisplayName(med.generic_name, med.brand_name) ?? med.generic_name,
          adherence, // standalone/finished: 'given'; not-finished combo: null (B-156 PR B3)
          howGiven, // combo: inferred vehicle (pre-set); standalone: null (chips can set it)
          // combo: names the food on the card; else null. Reuse the SAME empty-name
          // fallback as the log-screen banner (comboFoodLabel below) so a vehicle food
          // with no brand AND no product name still yields a non-empty label ("meal"/
          // "treat"). This keeps the card's `isCombo = !!pairedFoodName` check reliable
          // — an empty string would read as a STANDALONE dose and (a) drop the "Logged
          // together" framing and (b) surface the standalone-only "Change time" button
          // on a genuine combo dose.
          pairedFoodName: isComboMode
            ? (pairedFoodName?.trim() || (pairedFoodType === 'treat' ? 'treat' : 'meal'))
            : null,
          vehicleIntake, // combo: the linked vehicle's intake → drives the in-doubt prompt; else null
        },
        { delayMs: 450 },
      );
      // B-157 (CUL-284) — the log-time double-dose check, fired fire-and-forget for the
      // same reason the meal path's trial heads-up is (Principle 1: the log stays one
      // tap, the dose is already saved). It waits for THIS card's deferred reveal before
      // patching, so it can't race ahead of the 450ms above and drop the note.
      //
      // Passing the adherence we just WROTE, not a re-read: a not-finished-vehicle combo
      // is UNCONFIRMED (null) here, and the detector correctly declines to call an
      // unconfirmed dose a repeat. If the owner then resolves it to 'given' on the card,
      // the card's own recompute is what surfaces the note.
      void applyLogTimeDoubleDoseCheck({
        eventId: result.eventId,
        petId: writePetId,
        medicationItemId: med.id,
        occurredAt: result.occurredAtIso,
        adherence,
      });
    } catch (e) {
      console.error('[log] dose saved, but its post-write presentation failed:', e);
    }
    return true;
  }

  // B-325 — resolve a retroactive in-doubt combo dose from the confirm sheet, then return
  // to the treat. The owner's explicit tap is authoritative (never an inference): persist
  // it, sync, and dismiss. A write failure keeps the dose UNCONFIRMED (the safe direction —
  // it never lands a false 'given') and still returns the owner to the treat, where the
  // dose detail's chips can resolve it later. The read-time resurface join self-corrects
  // either way.
  async function handleComboConfirmAnswer(next: DoseAdherence) {
    const target = comboConfirm;
    setComboConfirm(null);
    if (target) {
      try {
        await updateDoseAdherence(target.doseEventId, next);
        syncPendingMedicationAdministrations().catch(console.error);
      } catch (e) {
        console.error('[log] combo dose confirm failed; dose stays unconfirmed:', e);
        // Tell the owner it didn't save (matching the sibling adherence-write sites) and,
        // crucially, that the dose is UNCONFIRMED — never let a failed save read as done.
        // The dose is safely null and resolvable from its detail screen.
        Alert.alert('Could not save', "That didn't save — the dose is marked unconfirmed. Set it from the dose's detail screen.");
      }
    }
    router.back();
  }

  // "Not sure yet" / backdrop dismiss — leave the dose UNCONFIRMED (never coerced to
  // 'given') and return to the treat; the History tag + dose-detail note resurface it.
  function handleComboConfirmDismiss() {
    setComboConfirm(null);
    router.back();
  }

  // Weight log from the numeric step — the weight twin of handlePickFood /
  // handlePickMedication (B-186). insertWeightCheck owns the event + weight_checks
  // child write and the sync push; here we mirror the other paths' caller concerns:
  // the optimistic store update (prependEvent), the pets.weight_kg snapshot refresh,
  // and the completion card. Witnessed by construction (you read the scale), with a
  // "Change time" escape hatch for a back-dated reading.
  async function handleConfirmWeight() {
    // Write-time pet identity (multi-pet spec §6): read the store at the moment of
    // write, never the render-time closure, so the reading lands on the pet that's
    // active when the log is confirmed (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (!pet) return;
    // CUL-641 — the snapshot this write is about to displace, read BEFORE the
    // re-point below, so the card's Undo can put it back. Captured into its own
    // const rather than read off `pet` at the end: `pet` is a write-time snapshot
    // object and `updatePet` replaces the store's pet rather than mutating this
    // one, so reading it later happens to still work — and that is exactly the
    // kind of "happens to" a later refactor turns into the wrong number.
    const displacedSnapshotKg = pet.weight_kg;
    const weightKg = parseWeightLbsToKg(weightLbsStr);
    // The Log button is disabled on an invalid value, so this is a belt-and-braces
    // guard — never store a 0/NaN that would corrupt a trend line.
    if (weightKg == null) return;

    let result: Awaited<ReturnType<typeof insertWeightCheck>>;
    try {
      result = await insertWeightCheck({
        petId: pet.id,
        weightKg,
        occurredAt,
        occurredAtSource,
        notes: notes.trim() || null,
      });
    } catch (e) {
      console.error('[log] weight check write failed:', e);
      Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
      return;
    }

    // Optimistic timeline insert. The weight value rides along so a future History/
    // Today renderer (PR 4) can show it without a re-query; today the row renders as
    // a plain "Weight" entry like any other event.
    prependEvent({
      id: result.eventId,
      pet_id: pet.id,
      event_type: 'weight_check',
      occurred_at: result.occurredAtIso,
      occurred_at_confidence: 'witnessed',
      severity: null,
      notes: notes.trim() || null,
      source: 'manual',
      deleted_at: null,
      created_at: result.now,
      updated_at: result.now,
      weight_kg: weightKg,
    });

    // Keep the pets.weight_kg snapshot pointed at the LATEST reading (by
    // occurred_at, not insertion order — a back-dated entry must not overwrite a
    // newer reading's snapshot). getLatestWeightKg reads the local mirror that the
    // insert above just wrote, so the just-logged value wins when it's the most
    // recent. Best-effort: a snapshot-sync failure never blocks the log — the
    // weight_check row is the source of truth; the snapshot is a denormalized
    // convenience (it's what the profile header + EditPetModal pre-fill read).
    try {
      const latestKg = await getLatestWeightKg(pet.id);
      if (latestKg != null && latestKg !== pet.weight_kg) {
        const { error } = await supabase.from('pets').update({ weight_kg: latestKg }).eq('id', pet.id);
        if (error) {
          console.warn('[log] pets.weight_kg snapshot update failed:', error.message);
        } else if (usePetStore.getState().activePet?.id === pet.id) {
          // Only patch the store if this pet is still active (updatePet patches the
          // active pet); if it was switched away, the next load reads the synced row.
          usePetStore.getState().updatePet({ weight_kg: latestKg });
        }
      }
    } catch (e) {
      console.warn('[log] weight snapshot refresh failed:', e);
    }

    // Dismiss the modal, then land the named card at the root layer. A weight
    // check is neutral clinical data, never a celebration of the number — and the
    // never-reassure guardrail forbids any "looking good" verdict — so it gets the
    // calm tone, no gold. delayMs clears the dismissing modal so the card isn't
    // briefly occluded on iOS.
    //
    // CUL-606: the card names the VALUE ("Weight · 12.4 lbs"). The retired
    // white takeover never echoed the number back at all — the one path where the
    // owner had typed something and the confirmation showed no trace of it, which
    // is the one place a fat-fingered entry could have been caught.
    router.back();
    showNamedMoment(
      {
        tone: 'calm',
        eventId: result.eventId,
        petId: pet.id,
        occurredAt: result.occurredAtIso,
        record: { kind: 'weight', weightKg },
        // CUL-641 — what this write displaced, so Undo restores it rather than
        // leaving a mis-typed 124 lbs as the profile weight and the next
        // weigh-in's pre-fill. Always passed (never conditionally), so the
        // key's PRESENCE means "the log site knew" and its value may be null.
        previousSnapshotKg: displacedSnapshotKg,
      },
      { delayMs: 300 },
    );
  }

  async function handleConfirm(override?: {
    foodId: string;
    foodBrand: string;
    foodProduct: string;
    foodFormat?: string | null;
    foodType?: string | null;
    timeFields?: TimeFields;
  }): Promise<{ eventId: string; occurredAt: string; petId: string } | null> {
    // Write-time pet identity (multi-pet spec §6): read the store at the moment
    // of write, never the render-time closure, so an event always lands on the
    // pet that's active when the log is confirmed (the queue-then-switch edge).
    const pet = usePetStore.getState().activePet;
    if (!pet) return null;
    const foodId = override?.foodId ?? selectedFoodId;
    const foodBrand = override?.foodBrand ?? selectedFoodBrand;
    const foodProduct = override?.foodProduct ?? selectedFoodProduct;
    const foodFormat = override?.foodFormat ?? selectedFoodFormat;
    if (selectedType === 'meal' && !foodId) return null;
    // Meals pass their own witnessed time fields; the simple step derives from
    // the confidence affordance.
    const tf = override?.timeFields ?? buildTimeFields();
    const effectiveOccurredAt = tf.occurredAt;
    const effectiveSource = tf.source;
    const isMeal = selectedType === 'meal' && !!foodId;
    let eventId: string;
    let now: string;
    // The write can throw (insertMeal now wraps the meal DB writes, and the
    // non-meal branch hits SQLite directly). Surface a failure instead of
    // silently freezing on the current step — without this the touch handler
    // swallows the throw and nothing advances or explains why.
    try {
      if (isMeal) {
        // insertMeal owns the meal event+meal write, the food-recency touch, the
        // sync push, and the AI-Signal regen (B-059). Meals are always witnessed,
        // so the confidence/window it writes matches the witnessed timeFields this
        // path passes in (handlePickFood) — no B-010 information is lost.
        const res = await insertMeal({
          petId: pet.id,
          foodId: foodId!,
          occurredAt: effectiveOccurredAt,
          occurredAtSource: effectiveSource,
        });
        eventId = res.eventId;
        now = res.now;
      } else {
        // The simple (symptom / stool / Other) write — shared with the in-sheet
        // confirm (components/log/SimpleEventConfirm) via lib/simpleEvent so the two
        // entry points can't drift to different rows. insertSimpleEvent owns the
        // event row, the optional photo attachment + its per-incident AI read
        // (vomit/stool), the sync push and the Signal regen; prependEvent + the
        // completion beat stay here (per-surface UI concerns).
        const res = await insertSimpleEvent({
          petId: pet.id,
          eventType: selectedType!,
          confidence: tf.confidence,
          occurredAt: effectiveOccurredAt,
          earliest: tf.earliest,
          latest: tf.latest,
          source: effectiveSource,
          notes: notes.trim() || null,
          severity: severity ?? null,
          attachment: attachmentUri
            ? { uri: attachmentUri, takenAt: attachmentTakenAt, width: attachmentDims?.width, height: attachmentDims?.height }
            : null,
        });
        eventId = res.eventId;
        now = res.now;
      }
    } catch (e) {
      console.error('[log] event write failed:', e);
      Alert.alert("Couldn't save that", 'Something went wrong. Please try again.');
      return null;
    }
    // For a meal, tf.confidence is guaranteed 'witnessed' (handlePickFood always
    // passes that override) — matching what insertMeal wrote to the DB row.
    prependEvent({
      id: eventId,
      pet_id: pet.id,
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
      food_format: foodFormat,
      food_type: override?.foodType ?? null,
      quantity: foodId ? 'unknown' : null,
    });

    // The photo attachment + its per-incident AI read now live in
    // insertSimpleEvent (non-meal path). Meals never carry a photo — the food step
    // has no attach affordance — so nothing photo-related belongs on the meal path.

    // Dismiss the modal, then land the earned completion card at the root layer.
    // Meals are the exception: their confirmation is the meal completion card
    // (handlePickFood) — the warmed bottom-card presentation that carries the
    // intake follow-up. Firing both would double the surface (B-064 unifies meals
    // into a single warm surface).
    router.back();
    // Non-meal events land the named card here; the sync push + Signal regen
    // that used to live here now belong to insertSimpleEvent (so the in-sheet
    // confirm gets them too), and insertMeal already owns both for the meal branch.
    if (!isMeal) {
      // Tone-aware: symptom logs get a calm confirm (never a festive gold beat
      // over a worrying event); routine logs get the warm-gold celebrate moment.
      const tone = selectedType !== null && SYMPTOM_TYPES.has(selectedType) ? 'calm' : 'celebrate';
      // CUL-606 — the card is handed the RECORD, not a sentence, and derives what
      // it says from the SAME confidence fields the row was just written with
      // (tf.*, above). So a "found it" vomit's card reads "found by 5:33 PM",
      // exactly as its History row will: the card can neither invent a lower
      // bound nor flatten the window to a point it never held.
      // delayMs clears the dismissing modal so the card isn't briefly occluded
      // on iOS (same reason the meal card's reveal is deferred).
      showNamedMoment(
        {
          tone,
          eventId,
          petId: pet.id,
          occurredAt: effectiveOccurredAt.toISOString(),
          record: {
            kind: 'event',
            typeLabel: EVENT_TYPES[selectedType!].label,
            confidence: tf.confidence,
            earliest: tf.earliest ? tf.earliest.toISOString() : null,
            latest: tf.latest ? tf.latest.toISOString() : null,
          },
        },
        { delayMs: 300 },
      );
    }
    // petId is the pet the event was actually written for (read at write time) —
    // the meal card carries it so its "+ gave a med with this" combo can bind the
    // linked dose to the same pet (B-156 PR B2b multi-pet guard).
    return { eventId, occurredAt: effectiveOccurredAt.toISOString(), petId: pet.id };
  }

  function handleBack() {
    if (step === 'type') { router.back(); return; }
    // Combo mode (B-156 PR B2b) opened straight into the medication picker from the
    // meal card, so there's no type-grid to step back to — back closes the modal.
    if (isComboMode && step === 'medication') { router.back(); return; }
    if (step === 'food' || step === 'medication' || step === 'symptom' || step === 'simple' || step === 'stool-type' || step === 'weight') {
      setSelectedType(null);
      setSeverity(null);
      setWeightLbsStr('');
      // Reset B-010 confidence state so the next event starts witnessed.
      setTimeMode('saw');
      setFoundMode('before');
      setEarliest(null);
      setStep('type');
      return;
    }
  }

  const petName = activePet?.name ?? 'your pet';

  // ── Shared sub-components ───────────────────────────────────────────────────

  function renderPhotoAttachRow() {
    if (attachmentUri) {
      return (
        <TouchableOpacity style={styles.photoAttachedRow} onPress={handlePickPhoto} activeOpacity={0.8}>
          <Image source={{ uri: attachmentUri }} style={styles.photoThumb} resizeMode="cover" />
          <ThemedText style={styles.photoAttachedText}>Photo attached · tap to replace</ThemedText>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.8}>
        <Camera size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
        <ThemedText style={styles.photoRowText}>Attach photo</ThemedText>
      </TouchableOpacity>
    );
  }

  // Any value change makes the provenance 'manual' (B-525), whatever it was;
  // peeking at the picker without changing the value keeps the stored source, so
  // it never silently drops an EXIF attribution. Shares the rule with
  // edit-event.tsx via sourceAfterPointEdit. (This used to note that a fresh
  // symptom log is never 'now' and so the 'now' arm was defense-in-depth. Since
  // CUL-576 it is the DEFAULT arm: an untouched log is 'now', and this handler is
  // the one thing that turns it into the owner's own claim.)
  function handleTimePickerChange(date?: Date) {
    if (!date) return;
    setOccurredAtSource(sourceAfterPointEdit(occurredAtSource, date.getTime() !== occurredAt.getTime()));
    setOccurredAt(date);
  }

  // Shared with app/edit-event.tsx via lib/eventTimeEdit — same control, same
  // transitions, and the same no-op-re-tap bug lived in both copies (B-448).
  // Here it cost less than on the edit screen (no stored classification to
  // destroy) but it was still real: re-tapping the already-selected "Found it"
  // mid-entry reset the sub-mode to 'before' and the latest edge to now,
  // discarding a "between" window the owner had just dialled in.
  function handleTimeModeChange(m: TimeMode) {
    const t = resolveTimeModeChange(timeMode, m, occurredAtSource === 'exif');
    if (t.noOp) return;
    if (t.seedFoundMode) setFoundMode(t.seedFoundMode);
    // A photo of discovered evidence is EXIF-stamped at discovery — the
    // window's latest edge — so seed from it; otherwise default to now.
    if (t.seedLatestFrom) setFoundLatest(t.seedLatestFrom === 'point' ? occurredAt : new Date());
    setTimeMode(m);
  }

  function handleFoundModeChange(m: FoundMode) {
    const t = resolveFoundModeChange(foundMode, m, earliest != null);
    if (t.noOp) return;
    // Seed the estimate from when they found it, as a starting point to adjust.
    if (t.seedEstimatedFromLatest) setEstimatedAt(foundLatest);
    // Seed a sane lower bound the first time the owner opens a window.
    if (t.seedEarliest) setEarliest(new Date(foundLatest.getTime() - DEFAULT_WINDOW_SPAN_MS));
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
  // working; confidence + window bounds carry the uncertainty (B-010). The
  // reduction itself lives in lib/eventTimeEdit (deriveTimeFields) so this screen
  // and the in-sheet confirm (B-745 PR 3) can't derive a different row from the
  // same control state.
  function buildTimeFields(): TimeFields {
    return deriveTimeFields({
      timeMode, foundMode, point: occurredAt, pointSource: occurredAtSource,
      estimatedAt, earliest, latest: foundLatest,
    });
  }

  // The witnessed time section — the plain "date · time / Change" row plus its
  // inline point picker. ONE implementation for the three steps that render it
  // (weight, symptom severity, and the witnessed-by-construction simple branch —
  // code-review cleanup on this PR: the block had been copy-pasted per step, so
  // the picker wiring could drift between copies).
  function renderTimeRowWithPicker() {
    return (
      <>
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
      </>
    );
  }

  function renderTimeRow() {
    return (
      <View style={styles.timeRow}>
        <ThemedText style={styles.timeLabel}>
          {occurredAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          {' · '}
          {formatTime(occurredAt)}
          {/* geist-ok: Deliberately a raw <Text>, not a nested ThemedText (CUL-609; the same rule
              CUL-607 hit in FreeFeedingStrip, now a CLAUDE.md convention). Every ThemedText
              injects an explicit fontFamily, and an explicit family on a child is exactly what
              breaks RN's native text-style cascade. This EXIF span differs from its parent only
              in size and colour, so inheriting the parent's resolved Geist regular is the
              intended render. Swapping it mechanically ships a face change mid-sentence — which
              no test catches and no diff shows. */}
          {occurredAtSource === 'exif' && (
            <Text style={styles.exifAttribution}>
              {'  ·  '}{formatExifAttribution(occurredAt.toISOString())}
            </Text>
          )}
        </ThemedText>
        <TouchableOpacity onPress={() => setShowTimePicker(!showTimePicker)} hitSlop={12}>
          <ThemedText style={styles.changeTimeBtn}>Change</ThemedText>
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
        <Header
          title={`Log for ${petName}`}
          leading="close"
          onLeadingPress={() => router.back()}
        />
        <EventTypePicker
          grouped={pickerV2}
          expanded={taxonomyV2}
          species={activePet?.species}
          onSelectType={handleTypeSelect}
        />
      </SafeAreaView>
    );
  }

  // ── Food picker (Recent / Library / + Add new) ─────────────────────────────

  if (step === 'food') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={`What did ${petName} eat?`} leading="back" onLeadingPress={handleBack} />
        {activePet && (
          <FoodPicker
            petId={activePet.id}
            petName={activePet.name}
            // B-406 — a treat door lands the picker pre-scoped to treats; undefined
            // on every other entry point, leaving the picker's 'all' default.
            initialScope={initialFoodScope}
            // Guarded (B-336): the first tap latches, so a rapid double-tap on a
            // tile can't write two meals.
            onPickFood={(food) => { void guardSubmit(() => handlePickFood(food)); }}
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

  // ── Medication picker (Recent / Library / + Add medication) ────────────────

  if (step === 'medication') {
    // Combo context (B-156 PR B2b): resolve the MEAL's pet by pairedPetId (NOT the
    // possibly-switched active pet) + the food, so the banner + header name exactly the
    // pet and meal this dose is being added to — the multi-pet wrong-pet guard, made
    // visible. Fall back to a neutral 'your pet' (NOT the active pet's name — which may
    // be a different pet than the meal's, the whole reason we key off pairedPetId) on
    // the unreachable-in-practice case where pets haven't hydrated.
    const comboPetName = (pairedPetId ? pets.find((p) => p.id === pairedPetId)?.name : null) ?? 'your pet';
    const comboFoodLabel = pairedFoodName?.trim() || (pairedFoodType === 'treat' ? 'treat' : 'meal');
    const headerPetName = isComboMode ? comboPetName : petName;
    // The Recent shelf is pet-scoped, so it should show the MEAL's pet's drugs in
    // combo mode; the Library is global so it's identical either way.
    const pickerPetId = isComboMode && pairedPetId ? pairedPetId : activePet?.id;
    return (
      <SafeAreaView style={styles.container}>
        <Header title={`What did ${headerPetName} take?`} leading="back" onLeadingPress={handleBack} />
        {isComboMode && (
          <View style={styles.comboBanner}>
            <ThemedText style={styles.comboBannerText}>
              Adding to {comboPetName}'s {comboFoodLabel} — pick the medication you gave with it
            </ThemedText>
          </View>
        )}
        {/* Gate on pickerPetId alone, NOT activePet: in combo mode the picker must
            mount for the MEAL's pet (pairedPetId) even if the active pet is null/mid-
            hydration or has since been switched — gating on activePet here would
            contradict the whole "bind to the meal's pet" rationale. In standalone mode
            pickerPetId IS activePet?.id, so this is identical to the old activePet gate. */}
        {pickerPetId && (
          <MedicationPicker
            petId={pickerPetId}
            // Guarded (B-336): the first tap latches, so a rapid double-tap on a
            // tile can't write two doses — and on the retroactive combo path can't
            // overwrite the first dose's pending confirm sheet.
            onPickMedication={(med) => { void guardSubmit(() => handlePickMedication(med)); }}
            onAddNew={() => router.push('/medication-capture?fromLog=1')}
            // Long-press a tile opens the editable detail screen (B-117 PR 6).
            // One-tap dose-log stays on regular tap.
            onOpenDetail={(med) => router.push(`/medication/${med.id}`)}
          />
        )}
        {/* B-325 — the retroactive combo-confirm sheet, over the picker. Only mounts when a
            retroactive combo dose landed unconfirmed (vehicle not finished); its handlers own
            the return to the treat. */}
        <ComboDoseConfirmSheet
          visible={!!comboConfirm}
          petName={comboConfirm?.petName ?? 'your pet'}
          foodName={comboConfirm?.foodName ?? null}
          onAnswer={handleComboConfirmAnswer}
          onNotSure={handleComboConfirmDismiss}
        />
      </SafeAreaView>
    );
  }

  // ── Stool sub-type (normal vs loose) ───────────────────────────────────────

  if (step === 'stool-type') {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="What kind of stool?" leading="back" onLeadingPress={handleBack} />
        <View style={styles.stoolChoiceContainer}>
          <TouchableOpacity
            style={styles.stoolChoiceBtn}
            onPress={() => { setSelectedType('stool_normal'); setStep('simple'); }}
            activeOpacity={0.7}
          >
            <EventIcon type="stool_normal" size={24} />
            <ThemedText style={styles.stoolChoiceLabel}>Normal</ThemedText>
            <ThemedText style={styles.stoolChoiceHint}>Formed, typical</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stoolChoiceBtn, styles.stoolChoiceBtnLoose]}
            onPress={() => { setSelectedType('diarrhea'); setStep('simple'); }}
            activeOpacity={0.7}
          >
            <EventIcon type="diarrhea" size={24} color={theme.colorEventSymptom} />
            <ThemedText style={styles.stoolChoiceLabel}>Loose</ThemedText>
            <ThemedText style={styles.stoolChoiceHint}>Soft, runny, or diarrhea</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Weight (numeric, the value IS the entry) ───────────────────────────────

  if (step === 'weight') {
    // Weight is the one event where confirm-don't-enter can't apply — there's no
    // value to confirm, so we minimise friction instead: a pre-filled numeric pad
    // and a single Log button (Principle 1 / Jordan). The button only enables on a
    // real positive number (parseWeightLbsToKg), never a 0/NaN that would corrupt a
    // trend line.
    const canConfirmWeight = parseWeightLbsToKg(weightLbsStr) != null;
    return (
      <SafeAreaView style={styles.container}>
        <Header title={`What does ${petName} weigh?`} leading="back" onLeadingPress={handleBack} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.simpleScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.weightInputRow}>
              <TextInput
                style={styles.weightInput}
                value={weightLbsStr}
                onChangeText={setWeightLbsStr}
                placeholder="e.g. 12.5"
                placeholderTextColor={theme.colorTextTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoFocus
              />
              <ThemedText style={styles.weightUnit}>lbs</ThemedText>
            </View>
            {renderNotesInput()}
            {renderTimeRowWithPicker()}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirmWeight && styles.confirmBtnDisabled]}
              onPress={handleConfirmWeight}
              disabled={!canConfirmWeight}
            >
              <ThemedText style={styles.confirmBtnText}>Log weight</ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Severity (symptom events) ───────────────────────────────────────────────

  if (step === 'symptom') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    const canConfirm = severity !== null;
    return (
      <SafeAreaView style={styles.container}>
        <Header title={eventLabel} leading="back" onLeadingPress={handleBack} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.symptomScroll} keyboardShouldPersistTaps="handled">
            {renderPhotoAttachRow()}
            <ThemedText style={styles.severityHeading}>How severe?</ThemedText>
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
                      <ThemedText style={[styles.severityNum, isSelected && styles.severityNumSelected]}>
                        {value}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.severityLabel}>{label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.divider} />
            {renderNotesInput()}
            {renderTimeRowWithPicker()}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={() => handleConfirm()}
              disabled={!canConfirm}
            >
              <ThemedText style={styles.confirmBtnText}>Log {eventLabel.toLowerCase()}</ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Simple events (stool, other) ────────────────────────────────────────────

  if (step === 'simple') {
    const eventLabel = selectedType ? EVENT_TYPES[selectedType].label : '';
    // Per-leaf capture contract (taxonomy §6/§7, D10 — CUL-675): a leaf without
    // visual evidence never renders a photo zone, and a witnessed-by-construction
    // leaf (cough/sneeze) drops the Saw it / Found it affordance entirely — it
    // gets the plain witnessed time row, whose "Change" covers late logging.
    // Every pre-W1 simple type keeps both affordances (their fields describe the
    // shipped surfaces), so flag-off capture stays byte-identical (FL-1).
    const simpleConfig = selectedType ? EVENT_TYPES[selectedType] : null;
    const witnessedOnly = simpleConfig?.confidenceModel === 'witnessed';
    const offersPhoto = simpleConfig ? simpleConfig.hasPhoto : true;
    return (
      <SafeAreaView style={styles.container}>
        <Header title={eventLabel} leading="back" onLeadingPress={handleBack} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.simpleScroll} keyboardShouldPersistTaps="handled">
            {offersPhoto && renderPhotoAttachRow()}
            {renderNotesInput()}
            {witnessedOnly ? (
              renderTimeRowWithPicker()
            ) : (
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
            )}
          </ScrollView>
          <View style={styles.bottomAction}>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirm()}>
              <ThemedText style={styles.confirmBtnText}>
                {eventLabel === 'Other' ? 'Log event' : `Log ${eventLabel.toLowerCase()}`}
              </ThemedText>
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

  // The log's five step headers now use the shared Header (B-075); their
  // hand-rolled bar + the flat type grid moved out (to Header + EventTypePicker),
  // so those styles retired with B-745 PR 1.

  // ── Notes input ──
  notesInput: {
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBody,
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
    color: theme.colorTextOnDark,
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
    color: theme.colorTextOnDark,
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

  // ── Weight input (B-186) ──
  // A large, centred number with a quiet unit suffix — the value IS the screen,
  // so it reads as the primary input, not a buried field.
  weightInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: theme.space1,
    paddingVertical: theme.space3,
  },
  weightInput: {
    // text2XL is the type-scale's documented "hero number" token — the right size
    // for a single-value entry where the number is the screen (no new magic size).
    fontSize: theme.text2XL,
    // A TextInput is outside ThemedText's reach (the wrapper wraps Text), so the
    // field names its face directly — otherwise a swept screen keeps SF inputs.
    fontFamily: theme.fontBodyMedium,
    color: theme.colorNeutralDark,
    // A layout floor so the number doesn't collapse when the field is empty — a
    // dimension like the other width literals in this file (severityCircle 52,
    // photoThumb 40), not a type/spacing token.
    minWidth: 120,
    textAlign: 'right',
    padding: 0,
  },
  weightUnit: {
    fontSize: theme.textLG,
    color: theme.colorTextSecondary,
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
  // ── Combo context banner (B-156 PR B2b) ──
  // A tinted strip above the medication picker naming the pet + food this dose is
  // being logged together with. accentLight signals "linked".
  comboBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    backgroundColor: theme.colorAccentLight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  comboBannerText: {
    // On the type scale (textSM + its leading token) rather than the raw 14/20 the
    // sibling attachmentBanner carries (pre-existing, tracked B-066) — a new style
    // shouldn't add a second off-scale value. lineHeightSM is the token designed for
    // exactly this secondary-banner body.
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    flex: 1,
    lineHeight: theme.lineHeightSM,
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
  stoolChoiceLabel: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  stoolChoiceHint: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
});
