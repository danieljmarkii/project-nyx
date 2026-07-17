import { useState, useEffect } from 'react';
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
import { FoodPicker } from '../components/log/FoodPicker';
import { MedicationPicker } from '../components/log/MedicationPicker';
import { ComboDoseConfirmSheet } from '../components/log/ComboDoseConfirmSheet';
import { TimeConfidenceField, TimeMode, FoundMode } from '../components/log/TimeConfidenceField';
import { EventIcon } from '../components/event/EventIcon';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../constants/eventTypes';
import { usePetStore } from '../store/petStore';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { useAttachmentStore } from '../store/attachmentStore';
import { useMomentStore } from '../store/momentStore';
import { getDb, getActiveRegimenForDrug, getMealForEvent, updateDoseAdherence, PickerFood, PickerMedication } from '../lib/db';
import { supabase } from '../lib/supabase';
import { syncPendingEvents, syncPendingMeals, syncPendingMedicationAdministrations } from '../lib/sync';
import { insertMeal } from '../lib/meals';
import { insertMedicationDose } from '../lib/medicationDose';
import { insertWeightCheck, getLatestWeightKg, parseWeightLbsToKg, kgToLbs } from '../lib/weight';
import { inferDoseVehicleFromFoodType, initialComboDoseAdherence, isVehicleNotFinished, type DoseAdherence } from '../lib/medications';
import { uploadPhoto, compressForUpload, persistCapture } from '../lib/storage';
import { triggerVomitAnalysis, triggerStoolAnalysis } from '../lib/analysis';
import { triggerSignalRegenDebounced } from '../lib/signal';
import { uuid, exifDateToISO, trustedPastExifIso, formatExifAttribution, formatTime, deriveOccurredAt, OccurredConfidence } from '../lib/utils';

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
  const { pendingAttachment, setPendingAttachment } = useAttachmentStore();
  const showMoment = useMomentStore((s) => s.show);
  const showMealMoment = useMomentStore((s) => s.showMeal);
  const showMedicationMoment = useMomentStore((s) => s.showMedication);
  // B-156 PR B2b — combo params. When pairedEventId is set, this medication log is a
  // dose given WITH a just-logged meal/treat (entered from its completion card): the
  // dose binds to the meal's pet (pairedPetId) and links to the meal event, and
  // how_given is inferred from pairedFoodType. Absent on every standalone log path.
  const { type: typeParam, pairedEventId, pairedPetId, pairedFoodType, pairedFoodName, comboSource } =
    useLocalSearchParams<{
      type?: string;
      pairedEventId?: string;
      pairedPetId?: string;
      pairedFoodType?: string;
      pairedFoodName?: string;
      comboSource?: string;
    }>();
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

  // Food state (set by the picker; used by handleConfirm)
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedFoodBrand, setSelectedFoodBrand] = useState<string | null>(null);
  const [selectedFoodProduct, setSelectedFoodProduct] = useState<string | null>(null);

  // B-325 — the retroactive combo-confirm sheet. Set (with the just-written dose's event
  // id + the food/pet it rode in) when a retroactive combo dose lands UNCONFIRMED because
  // its vehicle wasn't finished; the sheet lets the owner resolve it before returning to
  // the treat. Null the rest of the time (finished/standalone paths never show it).
  const [comboConfirm, setComboConfirm] = useState<{
    doseEventId: string;
    petName: string;
    foodName: string | null;
  } | null>(null);

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
      setStep(EVENT_TYPES[t].hasFood ? 'food' : 'simple');
    }
  }, [typeParam]);

  function handleTypeSelect(type: EventTypeKey) {
    setSelectedType(type);
    const config = EVENT_TYPES[type];
    if (config.hasFood) setStep('food');
    else if (type === 'medication') setStep('medication');
    else if (type === 'weight_check') { seedWeightPrefill(); setStep('weight'); }
    else if (type === 'stool_normal') setStep('stool-type');
    else setStep('simple');
  }

  // Pre-fill the weight field with the pet's last known weight (the snapshot),
  // converted to lbs — so a re-weigh is an adjustment, not a fresh entry. Blank
  // when no weight is on file yet (first-ever check).
  function seedWeightPrefill() {
    const lastKg = usePetStore.getState().activePet?.weight_kg ?? null;
    setWeightLbsStr(lastKg != null ? kgToLbs(lastKg) : '');
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
  // saw the time picker on this path; the meal completion card offers the
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
    if (result) {
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
          intakeRating: null,
        },
        { delayMs: 450 },
      );
    }
  }

  // Dose log from the medication picker — the medication twin of handlePickFood
  // (B-117 PR 3). insertMedicationDose owns the event + dose-child write and the sync
  // push; here we mirror the meal path's caller concerns: the optimistic store update
  // (prependEvent) and the completion card. Serves TWO entry points: a STANDALONE dose
  // (the FAB/medication step), and a COMBO dose (B-156 PR B2b) entered from a meal/treat
  // completion card — which binds the dose to the meal's pet + event (paired_event_id)
  // and infers the vehicle from the food. The only difference is which pet/link/vehicle
  // the write carries; everything downstream (regimen link, sync, card) is shared.
  async function handlePickMedication(med: PickerMedication) {
    // The pet this dose is written for. STANDALONE: the active pet, read at write time
    // (the queue-then-switch edge, multi-pet spec §6). COMBO (B-156 PR B2b): the MEAL's
    // pet (pairedPetId) — a dose given with a meal must land on the same pet as that
    // meal, and binding to the meal's pet (never a possibly-switched active pet) makes
    // the paired_event_id link same-pet BY CONSTRUCTION; the migration-023 trigger is
    // the server-side backstop, not the primary guard.
    const writePetId = isComboMode
      ? (pairedPetId ?? null)
      : (usePetStore.getState().activePet?.id ?? null);
    if (!writePetId) return;
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
      return;
    }
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
      return;
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
        occurredAt: result.occurredAtIso,
        drugName: med.generic_name,
        adherence, // standalone/finished: 'given'; not-finished combo: null (B-156 PR B3)
        howGiven, // combo: inferred vehicle (pre-set); standalone: null (chips can set it)
        pairedFoodName: pairedFoodName ?? null, // combo: names the food on the card; else null
        vehicleIntake, // combo: the linked vehicle's intake → drives the in-doubt prompt; else null
      },
      { delayMs: 450 },
    );
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

    // Dismiss the modal, then play a calm completion beat at the root layer. A
    // weight check is neutral clinical data, never a celebration of the number —
    // and the never-reassure guardrail forbids any "looking good" verdict — so it
    // gets the calm tone, not the festive gold beat. delayMs clears the dismissing
    // modal so the overlay isn't briefly occluded on iOS.
    router.back();
    showMoment({ tone: 'calm' }, { delayMs: 300 });
  }

  async function handleConfirm(override?: {
    foodId: string;
    foodBrand: string;
    foodProduct: string;
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
    if (selectedType === 'meal' && !foodId) return null;
    // Meals pass their own witnessed time fields; the simple step derives from
    // the confidence affordance.
    const tf = override?.timeFields ?? buildTimeFields();
    const effectiveOccurredAt = tf.occurredAt;
    const effectiveSource = tf.source;
    const db = getDb();
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
        eventId = uuid();
        now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO events
             (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
              occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
              created_at, updated_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, 0)`,
          [eventId, pet.id, selectedType!, effectiveOccurredAt.toISOString(),
           severity ?? null, notes.trim() || null, effectiveSource,
           tf.confidence, tf.earliest ? tf.earliest.toISOString() : null,
           tf.latest ? tf.latest.toISOString() : null, now, now]
        );
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
      food_type: override?.foodType ?? null,
      quantity: foodId ? 'unknown' : null,
    });

    // Save and upload photo attachment if present
    if (attachmentUri) {
      const attId = uuid();
      const storagePath = `${pet.id}/${eventId}/${attId}.jpg`;
      // B-104 — persist the capture off the OS cache directory (reclaimed under
      // storage pressure) into the app-owned document directory, and store THAT
      // as local_uri so it survives. Compression/upload below still read the
      // original capture; both point at identical bytes.
      const localUri = persistCapture(attachmentUri, `${attId}.jpg`);
      await db.runAsync(
        `INSERT INTO event_attachments
           (id, event_id, pet_id, local_uri, storage_path, mime_type, taken_at, synced, created_at)
         VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, 0, ?)`,
        [attId, eventId, pet.id, localUri, storagePath, attachmentTakenAt ?? null, now]
      );
      const isVomit = selectedType === 'vomit';
      // Both stool event_type values (formed + loose) carry a photographed read.
      const isStool = selectedType === 'stool_normal' || selectedType === 'diarrhea';
      // Compress before upload (longest edge ≤1600px, JPEG q75) so the file
      // stays well under Claude's 5 MB image cap and bounds storage. Runs in an
      // async block so it doesn't delay the completion animation below.
      (async () => {
        try {
          const uploadUri = await compressForUpload(attachmentUri);
          await uploadPhoto('nyx-event-attachments', storagePath, uploadUri);
          const { error: attErr } = await supabase.from('event_attachments').upsert({
            id: attId, event_id: eventId, pet_id: pet.id,
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
          // so the analyze-vomit / analyze-stool function can read them.
          // Fire-and-forget. B-247: stool gets the same cache-on-log path.
          if (isVomit) triggerVomitAnalysis(eventId).catch(() => {});
          else if (isStool) triggerStoolAnalysis(eventId).catch(() => {});
        } catch (e) {
          console.error('[log] photo upload failed:', e);
        }
      })();
    }

    // Dismiss the modal, then play the earned completion moment at the root
    // layer. Meals are the exception: their confirmation is the meal completion
    // card (handlePickFood) — the warmed bottom-card presentation that carries
    // the intake follow-up. The full-screen beat here is terminal/non-interactive,
    // so firing both would double the surface (B-064 unifies meals into a single
    // warm surface).
    router.back();
    // Non-meal events still push + regen here; insertMeal already did both for
    // the meal branch (§2 freshness — a new event may change the cached insight
    // set; debounced so a meal + the symptom logged after it collapse into one
    // regen). Fire-and-forget — home re-reads cache on focus.
    if (!isMeal) {
      // Tone-aware: symptom logs get a calm confirm (never a festive gold beat
      // over a worrying event); routine logs get the warm-gold celebrate moment.
      const tone = selectedType !== null && SYMPTOM_TYPES.has(selectedType) ? 'calm' : 'celebrate';
      // delayMs clears the dismissing modal so the root overlay isn't briefly
      // occluded on iOS (same reason the meal toast is deferred).
      showMoment({ tone }, { delayMs: 300 });
      syncPendingEvents()
        .then(() => syncPendingMeals())
        .catch(console.error);
      triggerSignalRegenDebounced(pet.id);
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
          <Text style={styles.photoAttachedText}>Photo attached · tap to replace</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.photoRow} onPress={handlePickPhoto} activeOpacity={0.8}>
        <Camera size={16} color={theme.colorTextSecondary} strokeWidth={1.75} />
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
              <EventIcon type={key} size={24} />
              <Text style={styles.typeLabel}>{key === 'stool_normal' ? 'Stool' : config.label}</Text>
            </TouchableOpacity>
          ))}
          {!attachmentUri && (
            <TouchableOpacity
              style={[styles.typeCard, styles.typeCardPhoto]}
              onPress={handlePickPhoto}
              activeOpacity={0.7}
            >
              <Camera size={24} color={theme.colorTextSecondary} strokeWidth={1.75} />
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
            petName={activePet.name}
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
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>What did {headerPetName} take?</Text>
          <View style={styles.headerSpacer} />
        </View>
        {isComboMode && (
          <View style={styles.comboBanner}>
            <Text style={styles.comboBannerText}>
              Adding to {comboPetName}'s {comboFoodLabel} — pick the medication you gave with it
            </Text>
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
            onPickMedication={handlePickMedication}
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
            <EventIcon type="stool_normal" size={24} />
            <Text style={styles.stoolChoiceLabel}>Normal</Text>
            <Text style={styles.stoolChoiceHint}>Formed, typical</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stoolChoiceBtn, styles.stoolChoiceBtnLoose]}
            onPress={() => { setSelectedType('diarrhea'); setStep('simple'); }}
            activeOpacity={0.7}
          >
            <EventIcon type="diarrhea" size={24} color={theme.colorEventSymptom} />
            <Text style={styles.stoolChoiceLabel}>Loose</Text>
            <Text style={styles.stoolChoiceHint}>Soft, runny, or diarrhea</Text>
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
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>What does {petName} weigh?</Text>
          <View style={styles.headerSpacer} />
        </View>
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
              <Text style={styles.weightUnit}>lbs</Text>
            </View>
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
              style={[styles.confirmBtn, !canConfirmWeight && styles.confirmBtnDisabled]}
              onPress={handleConfirmWeight}
              disabled={!canConfirmWeight}
            >
              <Text style={styles.confirmBtnText}>Log weight</Text>
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
    fontWeight: theme.fontWeightMedium,
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
  // ── Combo context banner (B-156 PR B2b) ──
  // Mirrors attachmentBanner: a tinted strip above the medication picker naming the
  // pet + food this dose is being logged together with. accentLight signals "linked".
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
