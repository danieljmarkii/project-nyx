import { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { ThemedText } from '../components/ui/ThemedText';
import { Header } from '../components/ui/Header';
import { HeaderAction } from '../components/ui/HeaderAction';
import { EVENT_TYPES, EventTypeKey, hasPerIncidentRead } from '../constants/eventTypes';
import { BowlEditor, type BowlPickerFood, type StagedBowlFood } from '../components/log/BowlEditor';
import { loadMealBowls, type AppBowl } from '../lib/mealBowls';
import { componentRowName } from '../lib/mealBowlLabel';
import { setMealComponents } from '../lib/mealComponents';
import { applyMealScreenTrialFlag } from '../lib/mealTrialFlag';
import { forgetFlagsSpentByEvent } from '../lib/trialContaminant';
import { AMOUNT_UNITS, type AmountUnit } from '../lib/mealComposition';
import { mixFoodOf } from '../lib/mixCard';
import { bowlDetailLine } from '../lib/mixDetail';
import { type PickerFood, getDb, updateEvent, updateMealFood, getMealForEvent, getDoseForEvent, getEventAttachments, getEventSource, getEventTimeFields } from '../lib/db';
import { writeOwingFloorCheck } from '../lib/incidentFloorQueue';
import { triggerSignalRegenDebounced } from '../lib/signal';
import { triggerVomitAnalysis, triggerStoolAnalysis, claimAnalysisChain, awaitAnalysisChain } from '../lib/analysis';
import { detachOtherEventAttachments } from '../lib/attachments';
import { syncPendingEvents, syncPendingMeals, syncPendingWeightChecks, syncPendingMedicationAdministrations, syncPendingLooks } from '../lib/sync';
import { uploadPhoto, compressForUpload, persistCapture, getSignedUrl } from '../lib/storage';
import { localFileExists } from '../lib/localFile';
import {
  resolveEditorPhoto, needsSignedUrl, priorsToDetach, photoPickerCopy, EDITOR_PHOTO_OFFLINE_LABEL,
  EDITOR_PHOTO_UNKNOWN_LABEL,
  type EditorAttachmentRow,
} from '../lib/editEventPhoto';
import { supabase } from '../lib/supabase';
import { foodFormatTag } from '../lib/food';
import { useEventStore } from '../store/eventStore';
import { uuid, formatExifAttribution, deriveOccurredAt, confidenceUpdateForEdit } from '../lib/utils';
import { formatRecordWhen } from '../lib/recordWhen';
import { getWeightKgForEvent, updateWeightCheck, parseWeightLbsToKg, kgToLbs, MAX_WEIGHT_LBS } from '../lib/weight';
import { usePetStore } from '../store/petStore';
import { IntakeChipRow, IntakeRating } from '../components/log/IntakeChipRow';
import { AdherenceChipRow, DoseAdherence } from '../components/log/AdherenceChipRow';
import { VehicleChipRow } from '../components/log/VehicleChipRow';
import { asDoseVehicle, type DoseVehicle } from '../lib/medications';
import { TimeConfidenceField, TimeMode, FoundMode } from '../components/log/TimeConfidenceField';
import { MultiChipGroup } from '../components/ui/MultiChipGroup';
import { getLookForEvent, updateLookForEdit, localDayForLook } from '../lib/looks';
import { rateMealIntake } from '../lib/meals';
import { rateDoseAdherence, recordDoseHowGiven } from '../lib/medicationDose';
import { gridSectionsFor, gridChipLabel } from '../lib/lookDisplay';
import { toggleLookWord } from '../lib/lookSelection';
import { lookSpeciesOf, LOOK_HEAD_WORDS, LOOK_OPENING_CHIP_KEY, notHerselfLabel } from '../constants/lookWords';
import { LOOK_NOTE_MAX, LOOK_NOTE_PLACEHOLDER, LOOK_NOTE_CUE } from '../components/event/LookRecordSection';
import { resolveTimeModeChange, resolveFoundModeChange, reconstructTimeControl, sourceAfterPointEdit, DEFAULT_WINDOW_SPAN_MS } from '../lib/eventTimeEdit';
import { PhotoViewer, TextField, NumberField, TimeEditSheet, QuietBand, PrimaryButton, SkeletonRows } from '../components/ui';
import { EditBlock, EditCard, EditRow } from '../components/ui/EditCard';
import { FoodPicker } from '../components/log/FoodPicker';
import { PickerReadFailed } from '../components/log/PickerReadFailed';
import { useIsOnline } from '../hooks/useIsOnline';
import { removeConfirmCopy, recordTypeWord } from '../lib/completionCard';
import { reverseLoggedEvent } from '../lib/undoLog';
import { destructiveConfirm } from '../lib/haptics';
import { resolveRecordPetName, ANONYMOUS_PET_NAME } from '../store/petStore';

/** A bowl as the editor stages it, in position order. */
function stagedFromBowl(bowl: AppBowl): StagedBowlFood[] {
  return bowl.components
    .filter((c) => c.foodItemId !== null)
    .map((c) => ({
      foodItemId: c.foodItemId as string,
      foodLabel: c.foodLabel,
      rowName: componentRowName(c),
      share: c.share ?? c.normalizedShare ?? 0,
      shareSource: c.shareSource === 'preset' || c.shareSource === 'amounts' ? c.shareSource : 'custom',
      amountValue: c.amountValue,
      amountUnit: c.amountUnit,
    }));
}

/** What Save compares against the loaded bowl: the foods, in order, and their shares. */
function bowlSignature(foods: readonly StagedBowlFood[]): string {
  return foods.map((f) => `${f.foodItemId}:${f.share}`).join('|');
}

function isAmountUnit(u: string | null): u is AmountUnit {
  return u !== null && (AMOUNT_UNITS as readonly string[]).includes(u);
}

export default function EditEventModal() {
  const { id, type, occurredAt: occurredAtParam, notes: notesParam } =
    useLocalSearchParams<{
      id: string;
      type: string;
      occurredAt: string;
      notes?: string;
    }>();

  const { patchInToday, removeFromToday } = useEventStore();

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
  // CUL-869 — the daily look. It edits its WORDS and its NOTE on the child, and
  // neither is a field this screen already had, so both branches below are new.
  const isLook = eventType === 'check_in';
  // A vomit / stool: a changed photo owes a per-incident read (CUL-1680).
  const isReadable = hasPerIncidentRead(eventType);

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
  // Reconstructed from stored fields on mount (reconstructTimeControl).
  // CUL-869 adds `!isLook`, and it is a second gate rather than a rewrite of this
  // expression. A look's stored time-confidence is WITNESSED BY CONSTRUCTION (§5.4,
  // taxonomy D10) — it is a perception at a moment the owner was there for, so there
  // is nothing to have found and the Saw-it / Found-it control has no honest answer
  // to offer. `insertLook` is where that value is written, and this screen still
  // writes none: the branch below hands the save a witnessed form value that
  // `confidenceUpdateForEdit` then discards, exactly as it does for a meal.
  //
  // The tempting refactor is to read `config.confidenceModel` instead of naming
  // three types. It is wrong here: `cough` and `sneeze` carry the same model and DO
  // get this control today, so that version would silently change two shipped types
  // under an unrelated PR.
  const showConfidenceControl = !config.hasFood && !isWeight && !isMedication && !isLook;
  // CUL-887 — the photo half of the leaf contract (§6/§7 hasPhoto). `?? true` is the §8
  // posture: an unknown future leaf keeps today's generic offer, as the record screen's
  // empty hero does. What it gates is narrower than the section: see the Photo block.
  const offersPhoto = EVENT_TYPES[eventType]?.hasPhoto ?? true;
  // The plain point's question names the act each type records (TimeEditSheet's title rule).
  const pointQuestion = isMedication ? 'When was this dose given?' : 'When did this happen?';
  // Seeds NULL, not 'saw' (B-527): an unclassified row must render with neither
  // segment selected, so the honest default before the reconstruct resolves is
  // "we don't know yet", never a borrowed witnessed claim. The reconstruct sets
  // the definite value for a classified row and leaves this null for a NULL one.
  const [timeMode, setTimeMode] = useState<TimeMode | null>(null);
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
  // B-448 — did the owner actually touch a CONFIDENCE-bearing affordance in this
  // edit? Only then does the save restate the row's confidence.
  //
  // Everything above is form state seeded with defaults. Without this flag every
  // save asserted whatever the control happened to show: opening a legacy row
  // (occurred_at_confidence NULL — 149 live rows in production at the time of
  // writing) to fix a note wrote 'witnessed', turning the vet report's honest
  // 'unspecified' into 'seen' on a time nobody ever claimed to have witnessed. It
  // also lost real information whenever the async reconstruct below hadn't
  // resolved before a fast save — a stored 'estimated'/'window' row would be
  // flattened to 'witnessed'. Both directions move toward false precision.
  // (B-527 also made the null seed render as an absence, but the write gate is
  // still what keeps an untouched NULL row NULL on save.)
  //
  // The point-in-time picker deliberately does NOT set this: correcting WHEN
  // something happened is not a claim about how well the time is known. Same rule
  // the adherence/how_given writes below already follow — write the field the
  // owner changed, never the ones they didn't.
  const confidenceTouched = useRef(false);

  // Photo attachment
  // CUL-2176: the row the editor shows, whatever its local_uri. `attachmentsLoaded` gates
  // the photo row until the read answers; `shownAttachmentIdsRef` is every row present at
  // load, the only rows Save may remove, and the count the Replace sheet names.
  const [existingAttachment, setExistingAttachment] = useState<EditorAttachmentRow | null>(null);
  const [existingLocalUsable, setExistingLocalUsable] = useState(false);
  const [existingRemoteUrl, setExistingRemoteUrl] = useState<string | null>(null);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);
  const [attachmentsFailed, setAttachmentsFailed] = useState(false);
  const shownAttachmentIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [newAttachmentUri, setNewAttachmentUri] = useState<string | null>(null);
  // Source pixel dimensions from the picker asset, kept only so the pre-upload
  // resize can cap the photo's true longest edge (B-352).
  const [newAttachmentDims, setNewAttachmentDims] = useState<{ width: number; height: number } | null>(null);

  // Meal food state
  const [currentFoodId, setCurrentFoodId] = useState<string | null>(null);
  const [currentFoodBrand, setCurrentFoodBrand] = useState<string | null>(null);
  const [currentFoodProduct, setCurrentFoodProduct] = useState<string | null>(null);
  // B-568 — the selected food's form. This screen is where getting it wrong costs most:
  // it shows what the meal is currently set to, right beside a "Change" affordance, and
  // brand + product alone cannot say whether that is the wet or the dry of one product.
  const [currentFoodFormat, setCurrentFoodFormat] = useState<string | null>(null);
  // P3: the food step stands in for the form while the owner picks (the log form's own).
  const [foodStep, setFoodStep] = useState(false);
  // Mixed meals row 5 (spec §7.1, D-M4) — a mixed bowl's foods, staged until Save. Null
  // for a plain meal, which keeps the single food row below exactly as it was.
  const [bowlFoods, setBowlFoods] = useState<StagedBowlFood[] | null>(null);
  const loadedBowlRef = useRef<string | null>(null);
  // A mix this screen must not rewrite: a food in it is gone from the library (its id was
  // purged), the bowl is incomplete on this phone, or its read failed. Saving a staged set
  // there would drop a food, and with it an exposure, so the foods are shown and kept.
  const [bowlReadOnly, setBowlReadOnly] = useState<string | null>(null);

  // WSAVA intake (B-014). Held in local state and persisted on Save —
  // unlike the detail screen's optimistic-on-tap, this is a Cancel-able
  // form, so intake must follow the same discard-on-Cancel semantics as
  // every other field here.
  const [intakeRating, setIntakeRating] = useState<IntakeRating | null>(null);
  // The rating as loaded, so Save writes it only when the owner changed it (CUL-1087):
  // a write asks the Signal to rebuild, and rebuilds count toward a daily cap
  // (CUL-1109). Seeded null like the dose refs below: until the meal's read answers,
  // the chips are blank over whatever is stored, so their null is not a change (C-12)
  // and only a rating the owner picks is.
  const loadedIntakeRef = useRef<IntakeRating | null>(null);
  // The food the meal loaded with: a save refreshes the Signal only when it moved (CUL-1219).
  const loadedFoodRef = useRef<string | null>(null);

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

  // CUL-869 — the look's editable halves. `lookWords` is the selection, in the order
  // chosen (§3.1a); `lookNote` is the child's note, which is NOT `notes` above —
  // that state drives the PARENT's field, and a look's parent holds NULL by CHECK.
  // `lookLoadedRef` holds the row as it was, so Save can leave an untouched look
  // entirely alone rather than re-queueing it (see handleSave).
  const [lookWords, setLookWords] = useState<string[]>([]);
  const [lookNote, setLookNote] = useState('');
  const [lookOutcome, setLookOutcome] = useState<'observed' | 'nothing_unusual' | null>(null);
  // The RECORD's pet, off the child's own column — this screen is pushed by event id
  // from History and from the record screen, either of which may be showing a pet who
  // is not the active one, and the species decides which words the grid offers (C-9).
  const [lookPetId, setLookPetId] = useState<string | null>(null);
  const lookLoadedRef = useRef<{ words: string[]; note: string | null } | null>(null);

  const [saving, setSaving] = useState(false);
  // P8 — a failed save is said in the form, over the values it kept, never in an alert
  // that hides the form it is about.
  const [saveFailed, setSaveFailed] = useState(false);
  const online = useIsOnline();
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);

  // CUL-1909 P6 — the record's reads, as one answer. Until every read the form paints
  // from has answered, the form is skeleton rows and Save waits (C-12: a read that has not
  // answered is never shown as a value, and a fast Save in that gap wrote a borrowed
  // "seen" over an honest unspecified time, CUL-433). A failed read says so, with Try
  // again, and Save stays waiting: there is no form to save. The photo's read is its own
  // (CUL-2176): it settles the wait either way, and a failure shows as the photo row's
  // unknown state rather than failing the form.
  const [reads, setReads] = useState<'loading' | 'answered' | 'failed'>('loading');
  const [readAttempt, setReadAttempt] = useState(0);
  // The record's own pet (C-9): whose record the line under the header names, and the
  // pet the food step lists foods for.
  const [recordPetId, setRecordPetId] = useState<string | null>(null);
  // The stored time fields, for the remove confirm's time (a guessed or ranged time keeps
  // to its date).
  const storedTimeRef = useRef<{ confidence: string | null } | null>(null);

  // Load the record on mount, and again on Try again.
  useEffect(() => {
    if (!id) return;
    let live = true;
    setReads('loading');

    const core: Promise<unknown>[] = [];

    // A core read: the record line, the food step and the remove confirm all name this
    // pet, so a miss is said with Try again rather than leaving a dead Food row.
    core.push(getDb().getFirstAsync<{ pet_id: string }>('SELECT pet_id FROM events WHERE id = ?', [id])
      .then((row) => { if (live) setRecordPetId(row?.pet_id ?? null); }));

    if (config.hasFood) {
      core.push(getMealForEvent(id).then(async (meal) => {
        if (meal && !meal.food_item_id) {
          // A mix names no food on its row (T2): read its bowl. A failed read leaves the
          // bowl editor out, and Save then writes no food at all, never a single food over
          // a mix.
          try {
            const bowl = (await loadMealBowls([id])).get(id) ?? null;
            if (bowl && bowl.status === 'mix' && bowl.components.every((c) => c.foodItemId !== null)) {
              const staged = stagedFromBowl(bowl);
              setBowlFoods(staged);
              loadedBowlRef.current = bowlSignature(staged);
            } else if (bowl) {
              setBowlReadOnly(bowlDetailLine(bowl));
            }
          } catch (e) {
            console.warn('[edit-event] bowl read failed:', e);
            setBowlReadOnly('');
          }
        }
        if (meal) {
          setCurrentFoodId(meal.food_item_id);
          loadedFoodRef.current = meal.food_item_id;
          setCurrentFoodBrand(meal.food_brand);
          setCurrentFoodProduct(meal.food_product_name);
          setCurrentFoodFormat(meal.food_format);
          const r = meal.intake_rating;
          const loaded =
            r === 'refused' || r === 'picked' || r === 'some'
              || r === 'most' || r === 'all' ? r : null;
          loadedIntakeRef.current = loaded;
          setIntakeRating(loaded);
        }
      }));
    }

    if (isMedication) {
      core.push(getDoseForEvent(id).then((d) => {
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
      }));
    }

    if (isWeight) {
      core.push(getWeightKgForEvent(id).then((kg) => {
        if (kg != null) setWeightLbsStr(kgToLbs(kg));
      }));
    }

    if (isLook) {
      core.push(getLookForEvent(id).then((look) => {
        // Null is a real state — the parent reached this device ahead of its child.
        // The form then offers no word grid and no note field, because there is no
        // row to write either to; Save still edits the time on the parent.
        if (!look) return;
        setLookOutcome(look.outcome);
        setLookPetId(look.petId);
        setLookWords(look.words);
        setLookNote(look.notes ?? '');
        lookLoadedRef.current = { words: look.words, note: look.notes };
      }));
    }

    const attachmentsSettled = getEventAttachments(id).then((rows) => {
      // FR-10 (B-054): a hydrated attachment row carries an empty local_uri (no
      // on-device file). It is still the record's photo (CUL-2176): treating it as
      // absent drew "Attach a photo" over it, and Save then deleted it unseen. A
      // missing on-device file resolves the Storage signed URL, as the record
      // screen does; the row reads as attached while that resolves or fails.
      shownAttachmentIdsRef.current = new Set(rows.map((r) => r.id));
      const att = rows[0] ?? null;
      setExistingAttachment(att);
      const usable = att != null && att.local_uri.length > 0 && localFileExists(att.local_uri);
      setExistingLocalUsable(usable);
      setAttachmentsLoaded(true);
      setAttachmentsFailed(false);
      if (att && needsSignedUrl(att, usable)) {
        getSignedUrl('nyx-event-attachments', att.storage_path, 60 * 60)
          .then(setExistingRemoteUrl)
          .catch((e) => console.warn('[edit-event] could not sign the attached photo', e));
      }
    }).catch((e) => {
      // Say so rather than hide the row: the editor cannot tell attached from absent.
      console.error(e);
      setAttachmentsFailed(true);
    });

    core.push(getEventSource(id).then(setOccurredAtSource));

    // Reconstruct the "Saw it / Found it" control from the stored row. An
    // unclassified (NULL) row seeds NEITHER segment — mode stays null — so it
    // renders as the absence it is, never a borrowed "Saw it happen" (B-527).
    // The pure mapping lives in reconstructTimeControl so it is pinned by a test.
    core.push(getEventTimeFields(id).then((stored) => {
      storedTimeRef.current = { confidence: stored.confidence };
      const seed = reconstructTimeControl(stored);
      setTimeMode(seed.mode);
      if (seed.foundMode) setFoundMode(seed.foundMode);
      if (seed.mode === 'found' && seed.foundMode === 'around') {
        setEstimatedAt(occurredAtParam ? new Date(occurredAtParam) : new Date());
      }
      if (seed.earliest) setEarliest(new Date(seed.earliest));
      if (seed.latest) setFoundLatest(new Date(seed.latest));
    }));

    Promise.all([Promise.all(core), attachmentsSettled])
      .then(() => { if (live) setReads('answered'); })
      .catch((e: unknown) => {
        console.error('[edit-event] the record did not load:', e);
        if (live) setReads('failed');
      });
    return () => { live = false; };
  }, [id, readAttempt]);

  // The bowl editor's "Change" list: meal foods only (R1), the picker's own archive rule.
  async function loadMixableFoods(): Promise<BowlPickerFood[]> {
    return getDb().getAllAsync<BowlPickerFood>(
      `SELECT id, brand, product_name, format
       FROM food_items_cache
       WHERE archived_at IS NULL AND food_type = 'meal' AND COALESCE(format, '') <> 'topper'
       GROUP BY LOWER(brand), LOWER(product_name)
       ORDER BY MAX(COALESCE(last_used_at, '')) DESC, brand ASC
       LIMIT 30`,
    );
  }

  // P3 — the meal's food is picked on the log form's own food step (FoodPicker: the
  // tiles, search, the trial list order and its archive rule) and comes back to the form,
  // staged until Save like every other field here.
  function handlePickFood(food: PickerFood) {
    setCurrentFoodId(food.id);
    setCurrentFoodBrand(food.brand);
    setCurrentFoodProduct(food.product_name);
    setCurrentFoodFormat(food.format);
    setFoodStep(false);
  }

  // P4 — Remove from the editor's foot: the same confirm as the record screen's
  // (`removeConfirmCopy`), the same reversal (`reverseLoggedEvent`), one confirm before
  // (C-21). The photo is asked of the RECORD at the tap (CUL-825), never read off a
  // state that may not have answered; a failed re-check makes no photo claim. The note
  // is the stored one, not the draft in the field: the confirm names what the record
  // holds. A removal closes the editor and the record behind it together.
  const removeAskingRef = useRef(false);
  async function handleRemove() {
    // Never while a save is writing: the two would race the same row and both close the screen.
    if (!id || saving || removeAskingRef.current) return;
    removeAskingRef.current = true;
    // null when neither the load nor the re-check could answer: the confirm then says any
    // photo goes with it, never nothing (the adversarial pass on this PR).
    let hasAttachment: boolean | null = shownAttachmentIdsRef.current.size > 0;
    try {
      if (!hasAttachment) hasAttachment = (await getEventAttachments(id)).length > 0;
    } catch (e) {
      console.warn('[edit-event] attachment re-check before remove failed:', e);
      if (!attachmentsLoaded) hasAttachment = null;
    } finally {
      removeAskingRef.current = false;
    }
    const copy = removeConfirmCopy(
      {
        event_type: eventType,
        notes: notesParam ?? null,
        look_note: lookLoadedRef.current?.note ?? null,
        pet_id: recordPetId,
        occurred_at: occurredAtParam ?? null,
        occurred_at_confidence: storedTimeRef.current?.confidence ?? null,
      },
      { hasAttachment },
    );
    Alert.alert(copy.title, copy.body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          // CUL-604 §5.6 — rigid, on the CONFIRM, never on the row that opens it.
          destructiveConfirm();
          try {
            await reverseLoggedEvent(id);
            removeFromToday(id);
            router.dismiss(2);
          } catch (e) {
            console.error('[edit-event] remove failed:', e);
            Alert.alert('Could not remove', 'Try again.');
          }
        },
      },
    ]);
  }

  async function handlePickPhoto() {
    const copy = photoPickerCopy(shownAttachmentIdsRef.current.size);
    Alert.alert(copy.title, copy.message, [
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
      const asset = result.assets[0];
      setNewAttachmentUri(asset.uri);
      setNewAttachmentDims({ width: asset.width, height: asset.height });
    }
  }

  // Point picker (TimeConfidenceField 'saw'/unclassified mode, and the plain
  // meal/weight/dose picker). Any value change makes the provenance 'manual',
  // whatever it was — including a stored 'now' the pre-B-525 handler left drifting
  // (B-525). A peek that changes nothing keeps the stored source, so opening the
  // picker never silently drops an EXIF attribution.
  function handlePointChange(date: Date) {
    setOccurredAtSource(sourceAfterPointEdit(occurredAtSource, date.getTime() !== occurredAt.getTime()));
    setOccurredAt(date);
  }

  // Every handler below drives a confidence-bearing control, so each one marks
  // the confidence as owner-asserted (B-448). The Saw-it/Found-it toggle and the
  // around/before/between sub-mode are claims in themselves; the window's edges
  // are the claim's content, and moving one on a row stored as NULL is the owner
  // saying "it happened in here" — which the save must record.
  //
  // The two mode handlers route through lib/eventTimeEdit so the no-op rule —
  // re-tapping the segment that is already selected asserts nothing and seeds
  // nothing — is pinned by a test rather than by this screen and log.tsx
  // remembering to agree. Read that module's header: a no-op re-tap used to
  // destroy a stored estimate and re-date occurred_at to the edit time.
  function handleTimeModeChange(m: TimeMode) {
    const t = resolveTimeModeChange(timeMode, m, occurredAtSource === 'exif');
    if (t.noOp) return;
    if (t.asserted) confidenceTouched.current = true;
    if (t.seedFoundMode) setFoundMode(t.seedFoundMode);
    if (t.seedLatestFrom) setFoundLatest(t.seedLatestFrom === 'point' ? occurredAt : new Date());
    setTimeMode(m);
  }

  function handleFoundModeChange(m: FoundMode) {
    const t = resolveFoundModeChange(foundMode, m, earliest != null);
    if (t.noOp) return;
    if (t.asserted) confidenceTouched.current = true;
    if (t.seedEstimatedFromLatest) setEstimatedAt(foundLatest);
    if (t.seedEarliest) setEarliest(new Date(foundLatest.getTime() - DEFAULT_WINDOW_SPAN_MS));
    setFoundMode(m);
  }

  function handleEstimatedChange(d: Date) {
    confidenceTouched.current = true;
    setEstimatedAt(d);
  }

  function handleEarliestChange(d: Date | null) {
    confidenceTouched.current = true;
    // The sheet caps the edge at the latest bound; this is the belt to it, so a window
    // never reaches the chk_occurred_window_order constraint inverted (migration 012).
    setEarliest(d && d.getTime() > foundLatest.getTime() ? foundLatest : d);
  }

  // Clamp earliest <= latest so a windowed event never violates the
  // chk_occurred_window_order DB constraint (B-010 migration 012).
  function handleLatestChange(d: Date) {
    confidenceTouched.current = true;
    setFoundLatest(d);
    if (earliest && earliest.getTime() > d.getTime()) setEarliest(d);
  }

  // Derive the stored time fields from the affordance touched (mirrors log.tsx).
  // occurred_at stays a single point; confidence + window bounds carry the
  // uncertainty. Meals never reach here — they're forced witnessed in handleSave.
  function buildTimeFields() {
    // 'saw' AND unclassified (null) both resolve occurred_at to the plain point.
    // For a null row the 'witnessed' here is inert: the save writes a confidence
    // only when confidenceTouched is set, and the owner cannot touch a segment
    // without leaving null (picking one sets 'saw'/'found'), so a still-null row
    // never has an asserted confidence to write — its NULL is preserved (B-527/B-448).
    if (timeMode !== 'found') {
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
    // Save waits on the record's reads (P6): a form painted from defaults has nothing
    // true to save.
    if (!id || reads !== 'answered') return;
    setSaveFailed(false);

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

    // A look must keep at least one word (§5.2: non-empty iff outcome = 'observed').
    // Validated BEFORE any write, exactly as the weight is, so a refused save leaves
    // the time and the note untouched rather than half-landing.
    //
    // The alert names the way OUT as well as the rule: an owner who has cleared every
    // chip is usually trying to take the look back, and Remove is what does that.
    // Without that sentence the screen is a dead end she has to guess her way out of.
    if (isLook && lookLoadedRef.current && lookOutcome === 'observed' && lookWords.length === 0) {
      Alert.alert(
        'Pick at least one word',
        'A look says what you saw, so it needs at least one word. To take this one back instead, use Remove.',
      );
      return;
    }

    setSaving(true);
    try {
      // Meals/weight/doses don't show the confidence control — the event type
      // itself carries the claim (you see yourself put the bowl down, read the
      // scale, give the pill), so there is no affordance to touch and nothing
      // for this edit to restate. Their branch's 'witnessed' is inert: with no
      // control there is nothing to mark confidenceTouched, so the save below
      // never reaches this value. What the row already holds is what it keeps —
      // including a legacy NULL, which stays the PM's backfill to make (012),
      // not something an unrelated edit does one row at a time.
      const tf = showConfidenceControl
        ? buildTimeFields()
        : { confidence: 'witnessed' as const, occurredAt, earliest: null as Date | null, latest: null as Date | null, source: occurredAtSource };
      const occurredAtIso = tf.occurredAt.toISOString();

      // B-448 — restate the confidence ONLY when the owner touched a
      // confidence-bearing control this session. Otherwise the row keeps exactly
      // what it had, read back here rather than from the mount-time state so a
      // save that beats the async reconstruct can't flatten it either.
      const stored = await getEventTimeFields(id);
      const confidence = confidenceUpdateForEdit({
        ownerAsserted: confidenceTouched.current,
        form: { confidence: tf.confidence, earliest: tf.earliest, latest: tf.latest },
      });
      // What the row will hold once this save lands — the patch below must mirror
      // it, or Today renders a confidence the DB doesn't have.
      const savedConfidence = confidence
        ? { value: confidence.value, earliest: confidence.earliest, latest: confidence.latest }
        : { value: stored.confidence, earliest: stored.earliest, latest: stored.latest };

      // A look's PARENT holds NULL notes, always. The server's
      // events_check_in_notes_null CHECK is the authority and this is the belt to it:
      // the field is not rendered for a check_in (below), so `notes` here can only
      // ever be the route param's '' — but writing that expression rather than
      // trusting it means a future param, or a route reached with a stale value,
      // cannot push a row the server will reject forever (T-22).
      const parentNotes = isLook ? null : notes.trim() || null;

      await writeOwingFloorCheck(id, () => updateEvent(id, {
        occurred_at: occurredAtIso,
        severity: null,
        notes: parentNotes,
        occurred_at_source: tf.source,
        ...(confidence ? { confidence } : {}),
      }));

      // CUL-869 — the look's child. Three fields, three different reasons to write:
      //
      //   · WORDS and NOTE are passed only once the child has actually loaded
      //     (`lookLoadedRef`). Without that gate a Save that beat the async load
      //     would hand the helper the empty form state and erase the words — the
      //     B-448 shape, one screen over. The gate is "the form is showing the real
      //     row", NOT "the owner touched it": `updateLookForEdit` compares against
      //     the STORED row, which is the stronger test.
      //
      //   · LOCAL_DAY is passed only when `occurred_at` actually MOVED, compared
      //     against the value this screen was opened with. C-10: a peek-and-save is
      //     a real gesture that changed nothing, and re-deriving the day key on every
      //     save would move an owner's answered day the first time she opened a
      //     record in another timezone — silently, and on the one column every count
      //     in this feature is keyed to (T-19). It needs no loaded gate: the helper
      //     re-reads the row and writes nothing when the derived day already matches.
      if (isLook) {
        // INSTANTS, never strings. `occurredAtIso` is always JS-canonical
        // (`…ssssZ`), but `occurredAtParam` is `events.occurred_at` verbatim out of
        // local SQLite — and a row that has been through one sync round-trip holds
        // whatever PostgREST serialised, which is `…+00:00` (`lib/sync.ts:1121`
        // writes the server's value with no normalisation; `parseTs`'s own comment
        // in lib/hydration.ts says these forms arrive). The two spellings are the
        // same instant and are NOT string-equal.
        //
        // Left as `!==` this gate reports "the point moved" on every save of any
        // previously-synced look, which is precisely the failure the comment below
        // says it exists to prevent: `local_day` re-derived against whatever zone
        // the device is in NOW, silently moving an owner's answered day the first
        // time she opens an old record in another timezone. `updateLookForEdit`'s
        // own no-op check cannot catch it — in that case the recomputed day really
        // does differ from the stored one. Mirrors `parseTs`, which this codebase
        // already uses for exactly this class of comparison.
        const pointMoved =
          new Date(occurredAtIso).getTime() !== new Date(occurredAtParam).getTime();
        await updateLookForEdit(id, {
          ...(lookLoadedRef.current
            ? { words: lookWords, notes: lookNote.trim() || null }
            : {}),
          ...(pointMoved ? { localDay: localDayForLook(tf.occurredAt) } : {}),
        });
      }

      // A mixed bowl saves its whole staged set through the bowl's one writer, and only
      // when it changed; it never takes `updateMealFood`, which would name one food on a
      // row whose components say otherwise.
      const bowlChanged = bowlFoods !== null && bowlSignature(bowlFoods) !== loadedBowlRef.current;
      if (config.hasFood && bowlFoods !== null) {
        if (bowlChanged) {
          // CUL-2088: no card is up here, so the bowl's heads-up waits for the meal's screen.
          await setMealComponents(id, bowlFoods.map((f) => ({
            foodItemId: f.foodItemId,
            foodLabel: f.foodLabel,
            share: f.share,
            shareSource: f.shareSource,
            amountValue: f.amountValue,
            amountUnit: isAmountUnit(f.amountUnit) ? f.amountUnit : null,
          })), new Date(), { headsUp: 'meal_screen' });
        }
      } else if (config.hasFood && currentFoodId && bowlReadOnly === null) {
        await updateMealFood(id, currentFoodId);
        // CUL-2087: a food this meal spent its one trial heads-up on, and no longer holds,
        // gets the heads-up back, so its real feeding later is still warned about. The food
        // now on the meal is kept, so an unchanged food gives nothing back. The bowl branch
        // above gives back through its own writer. Best-effort, never failing the save: a
        // miss only leaves the food spent, as it was before this edit.
        await forgetFlagsSpentByEvent(id, [currentFoodId]).catch((e: unknown) => {
          console.warn('[edit-event] trial heads-up give-back failed:', e);
        });
        // CUL-2088: a food changed in after the fact gets the heads-up the card would have
        // given, as a line on the meal's screen this one returns to. Only when the food
        // changed; after the give-back, so it reads today's ledger. Fire-and-forget: the
        // save never waits on it.
        if (currentFoodId !== loadedFoodRef.current) void applyMealScreenTrialFlag(id, currentFoodId);
      }

      // Through the shared write path, which also refreshes the Signal (CUL-1087), and
      // only when it changed: the dose fields below follow the same rule, which also
      // keeps an untouched rating from overwriting a newer one from another device.
      // Before the meal's read answers the ref is still null, so blank chips write
      // nothing: their null would erase a stored refusal and take it off Home.
      if (config.hasFood && intakeRating !== loadedIntakeRef.current) {
        await rateMealIntake(id, intakeRating);
      }

      // Dose adherence + how-given (the meal-intake twin). Only when the dose child
      // hydrated locally (`dose` non-null) — otherwise a partial-hydration device would
      // throw on the zero-row guard and fail the whole edit; time/notes/photo still save.
      // Write each field ONLY if the owner changed it (compare against the as-loaded
      // value): an untouched adherence is never re-stamped (so a null-adherence dose
      // stays unrated, never a phantom 'given', and a caregiver's newer state isn't
      // clobbered), and an untouched legacy how_given isn't round-tripped to null.
      if (isMedication && dose) {
        if (adherence !== loadedAdherenceRef.current) await rateDoseAdherence(id, adherence);
        if (howGiven !== loadedHowGivenRef.current) await recordDoseHowGiven(id, howGiven);
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
          // B-105 — capture the rows this photo supersedes before inserting it.
          // "Add" here is really a replace: the event carries one photo, and the
          // old row/file/Storage object used to be left behind entirely.
          // CUL-2176: only the rows present at load, the count the Replace sheet named. A
          // row that arrived after the editor opened stays; Save cannot remove it unseen.
          const priors = priorsToDetach(await getEventAttachments(id), shownAttachmentIdsRef.current, attId);
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
          //
          // CUL-1680 — a vomit / stool whose photo changed gets a fresh read, as the detail
          // screen's photo-add does (`app/event/[id].tsx`). Without it the stored read keeps
          // describing the photo it saw, and a "can wait until morning" stands over a photo
          // nobody looked at, on this event and on the incidents beside it (the new read is
          // what lets the server's may_wait revalidation take those back). The claim is taken
          // before `router.back()`, so the detail screen's section awaits this read on mount
          // instead of firing a second one (CUL-801).
          const readClaim = isReadable ? claimAnalysisChain(id) : null;
          let readInvoked = false;
          let landed = false;
          compressForUpload(newAttachmentUri, newAttachmentDims?.width, newAttachmentDims?.height)
            .then((uploadUri) => uploadPhoto('nyx-event-attachments', storagePath, uploadUri))
            .then(async () => {
              const { error } = await supabase.from('event_attachments').upsert(
                { id: attId, event_id: id, pet_id: petResult.pet_id, storage_path: storagePath, mime_type: 'image/jpeg' },
                { onConflict: 'id' },
              );
              // Only mark synced when the row actually landed — supabase-js returns
              // the error rather than throwing, so an unchecked upsert would flag a
              // row synced that never reached Supabase (supabase-sync Pattern 1;
              // already guarded in log.tsx / event/[id].tsx).
              if (error) { console.warn('[edit-event] attachment upsert failed:', error.message); return; }
              await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [attId]);
              landed = true;
              if (isReadable) {
                // A null claim means another chain owns this event's read. Wait for it, then
                // read anyway: this call exists because the PHOTO changed, and a read of the
                // previous photo does not answer the new one (the detail screen's reasoning).
                if (readClaim === null) await awaitAnalysisChain(id);
                // CUL-1835: the owner just added or replaced this photo, so the read is theirs to
                // ask for: a tap, under whatever answer is on file now (a no still declines). Without
                // it, a photo added under the yes to a record logged before it is held behind the old
                // read, unseen (adversarial pass 2, finding 1).
                const { error: readErr } = eventType === 'vomit'
                  ? await triggerVomitAnalysis(id, { ownerTap: true })
                  : await triggerStoolAnalysis(id, { ownerTap: true });
                if (readErr) console.warn('[edit-event] per-incident read trigger failed:', readErr);
                readInvoked = !readErr;
              }
            })
            .catch(console.error)
            // Settles on every exit, so a section waiting on the chain triggers its own read
            // when this one died before reading, instead of watching for a row nothing writes.
            .finally(() => {
              readClaim?.settle(readInvoked);
              // The Signal counts the new photo once its read has had its turn (CUL-1219), and
              // only once the photo reached the server: a rebuild spends a daily cap unit.
              if (isReadable && landed && readInvoked) triggerSignalRegenDebounced(petResult.pet_id);
            });
          // Detach the rows this photo replaced — after the replacement is
          // stored and its upload is in flight, so a failed insert can never
          // leave the event photoless and the owner's save doesn't wait on a
          // Storage round-trip. Never throws.
          await detachOtherEventAttachments(priors, attId);
        }
      }

      patchInToday(id, {
        occurred_at: occurredAtIso,
        occurred_at_confidence: savedConfidence.value,
        occurred_at_earliest: savedConfidence.earliest,
        occurred_at_latest: savedConfidence.latest,
        severity: null,
        notes: parentNotes,
        // CUL-869 — the look's note travels on its own field, so Today's row names
        // it the way History does. `look_outcome` is unchanged by an edit (the two
        // outcomes are not editable — an absence is a different observation, not a
        // correction), so it is not restated here.
        ...(isLook ? { look_note: lookNote.trim() || null } : {}),
        // A bowl left with one food is a plain meal of it; a mix names none (T2).
        ...(bowlFoods !== null
          ? bowlFoods.length === 1
            ? { food_item_id: bowlFoods[0].foodItemId }
            : { food_item_id: null, food_brand: null, food_product_name: null, food_format: null }
          : {
              food_item_id: currentFoodId,
              food_brand: currentFoodBrand,
              food_product_name: currentFoodProduct,
              food_format: currentFoodFormat,
            }),
        intake_rating: intakeRating,
        ...(isMedication && dose ? { adherence, how_given: howGiven } : {}),
        ...(isWeight && weightKg != null ? { weight_kg: weightKg } : {}),
      });

      // CUL-1219 (BRK-44): a moved time, a restated confidence, a changed food or a new photo
      // changes what the Signal counted, so the save refreshes it, as a log and a removal do.
      // Only then: a rebuild counts toward generate-signal's daily cap (CUL-1087), so a
      // peek-and-save spends none (a changed rating already rebuilt through `rateMealIntake`;
      // the debounce folds the two). A look never enters the engine (T-5), so its edit does not.
      const openedMs = occurredAtParam ? new Date(occurredAtParam).getTime() : NaN;
      const engineInputMoved =
        (Number.isFinite(openedMs) && new Date(occurredAtIso).getTime() !== openedMs) ||
        confidence != null ||
        // A new photo on a vomit / stool refreshes the Signal from its read chain above, once
        // the read has had its turn (CUL-1680); on any other event the photo counts here.
        (newAttachmentUri != null && !isReadable) ||
        // A food cleared to none writes nothing (`updateMealFood` is skipped above), so only
        // a food set to another one counts.
        (config.hasFood && currentFoodId != null && currentFoodId !== loadedFoodRef.current) ||
        bowlChanged;
      if (!isLook && engineInputMoved) {
        // Best effort, after the edit is stored: a failed lookup never reports the save failed.
        try {
          const owner = await getDb().getFirstAsync<{ pet_id: string }>('SELECT pet_id FROM events WHERE id = ?', [id]);
          if (owner) triggerSignalRegenDebounced(owner.pet_id);
        } catch (e) {
          console.warn('[edit-event] Signal refresh skipped:', e);
        }
      }

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
          // The look joins the CHILDREN half for the same reason the others are
          // there: its drain gates on `events.synced = 1`, so it must follow the
          // parent's push or simply wait a cycle.
          syncPendingLooks(),
        ]))
        .catch(console.error);
      router.back();
    } catch (e) {
      console.error('[edit-event] save failed:', e);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const photoState = resolveEditorPhoto({
    loaded: attachmentsLoaded,
    failed: attachmentsFailed,
    existing: existingAttachment,
    localFileUsable: existingLocalUsable,
    remoteUrl: existingRemoteUrl,
    newUri: newAttachmentUri,
  });
  const displayAttachmentUri = photoState.kind === 'attached' ? photoState.thumbUri : null;
  // The beg goes on a `hasPhoto: false` leaf; the evidence never does (CUL-887). An
  // unknown read is shown too, since the editor cannot tell attached from absent there.
  const photoSectionShown =
    offersPhoto || photoState.kind === 'attached' || photoState.kind === 'unknown';
  // P2 — whose record this is, off the record's own pet (C-9). A miss says nothing rather
  // than a guess: correct-but-anonymous beats confidently wrong.
  const pets = usePetStore((st) => st.pets);
  const recordPetName = resolveRecordPetName(pets, recordPetId);
  const recordPetKnown = recordPetName !== ANONYMOUS_PET_NAME;
  const typeWord = recordTypeWord(eventType);

  // CUL-869 — the look's chip options, or null when there are none to draw: an
  // absence row (no words by definition), a child that has not loaded, or a pet with
  // no vocabulary at all.
  //
  // The species comes from the RECORD's pet, resolved by the event's own pet id
  // (C-9) — never `activePet`. This screen is pushed from History and from the record
  // screen, both of which can be showing a pet who is not the active one, and the
  // species decides which 26 or 28 words the grid offers. `lookSpeciesOf` returns
  // null for an `other` pet rather than guessing a list, and the grid is then not
  // drawn: the words already stored still render on the record screen, which resolves
  // across both lists, so nothing is hidden — only the editing of them is declined,
  // which is the honest outcome when the app does not know which vocabulary applies.
  const lookPetForGrid = usePetStore((st) => st.pets.find((p) => p.id === lookPetId));
  const lookSpecies = lookSpeciesOf(lookPetForGrid?.species);
  const lookGrid =
    isLook && lookSpecies && lookOutcome === 'observed'
      ? gridSectionsFor(
          lookSpecies,
          LOOK_HEAD_WORDS[lookSpecies],
          lookPetForGrid?.sex ?? 'unknown',
        ).map((section, i) => ({
          label: section.label,
          options: [
            // The opening chip leads the head-word block. It is not one of the grid's
            // 26 / 28 — its own key, its own sex-following label — but it IS storable,
            // so an owner who saved *Not herself* alone must be able to see and clear
            // it here, and the head block is where the compact card puts it.
            ...(i === 0
              ? [{
                  value: LOOK_OPENING_CHIP_KEY,
                  label: notHerselfLabel(lookPetForGrid?.sex ?? 'unknown'),
                }]
              : []),
            ...section.words.map((w) => ({ value: w.key, label: gridChipLabel(w) })),
          ],
        }))
      : null;

  // P3 — the meal's food step, in place of the form while the owner picks.
  if (foodStep && recordPetId) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title={`What did ${recordPetKnown ? recordPetName : 'your pet'} eat?`}
          leading="back"
          onLeadingPress={() => setFoodStep(false)}
        />
        <FoodPicker
          petId={recordPetId}
          petName={recordPetKnown ? recordPetName : undefined}
          onPickFood={handlePickFood}
          // Capture in its add only mode, returning here: the new food is then one tap
          // away on this step. `fromLog` is never passed, since it would log a meal.
          onAddNew={() => router.push('/food-capture?returnTo=back')}
          onOpenDetail={(food) => router.push(`/food/${food.id}`)}
        />
      </SafeAreaView>
    );
  }

  const exifLine = occurredAtSource === 'exif' ? formatExifAttribution(occurredAt.toISOString()) : null;
  const whenLine = formatRecordWhen(occurredAt);

  const timeCard = (
    <EditCard testID="edit-card-time">
      {showConfidenceControl ? (
        // Non-meal events can be re-classified witnessed/found after logging.
        <TimeConfidenceField
          layout="rows"
          mode={timeMode}
          onModeChange={handleTimeModeChange}
          point={occurredAt}
          pointSource={occurredAtSource}
          onPointChange={handlePointChange}
          foundMode={foundMode}
          onFoundModeChange={handleFoundModeChange}
          estimatedAt={estimatedAt}
          onEstimatedChange={handleEstimatedChange}
          earliest={earliest}
          latest={foundLatest}
          onEarliestChange={handleEarliestChange}
          onLatestChange={handleLatestChange}
        />
      ) : (
        // A witnessed-by-construction act (a meal, a dose, a weigh-in, a look) keeps the
        // plain point, on the kit's one time sheet.
        <EditRow
          first
          label="When"
          value={whenLine}
          detail={exifLine}
          onPress={() => setShowTimePicker(true)}
          accessibilityLabel={`When, ${whenLine}${exifLine ? `, ${exifLine}` : ''}. Change time`}
          testID="time-when"
        />
      )}
      {showTimePicker && (
        <TimeEditSheet
          value={occurredAt}
          title={pointQuestion}
          onCancel={() => setShowTimePicker(false)}
          onSave={(date) => {
            setShowTimePicker(false);
            handlePointChange(date);
          }}
        />
      )}
    </EditCard>
  );

  /* Photo — the per-leaf affordance (§6/§7 hasPhoto, CUL-675), and the gate suppresses
     the BEG, NEVER THE EVIDENCE: an existing photo keeps its row on any leaf, and only
     the offer to add one disappears. That is the contract `resolveEventPhotoDisplay`
     encodes (`!photoUri && offersPhoto`), and the record screen shows an existing photo
     as its hero either way, so an editor that hid it would be the surface telling the
     lie. Never delete an owner's photo to satisfy a flag.

     CUL-887 replaced an `isLook` gate here. Four leaves declare `hasPhoto: false` (meal,
     cough, sneeze, check_in) and this editor was the one door offering the row on all
     four; the record screen and both capture surfaces already ask the contract. Measured
     before the door closed: zero attachments on any of the four in production (the
     issue's row checks), so nothing is hidden by this today. */
  const photoCard = photoSectionShown ? (
    <EditCard testID="edit-card-photo">
      {photoState.kind === 'unknown' ? (
        <EditRow first label="Photo" value={EDITOR_PHOTO_UNKNOWN_LABEL} />
      ) : photoState.kind === 'attached' ? (
        <EditRow
          first
          label="Photo attached"
          value={offersPhoto ? 'View or replace' : 'View'}
          valueIsAction
          leading={displayAttachmentUri ? (
            <Image source={{ uri: displayAttachmentUri }} style={styles.photoThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.photoThumb, styles.photoThumbPending]}>
              <Camera size={18} color={theme.colorTextSecondary} strokeWidth={1.75} />
            </View>
          )}
          onPress={() => setPhotoViewerVisible(true)}
          accessibilityLabel={offersPhoto ? 'Photo attached. View or replace' : 'Photo attached. View'}
          testID="edit-photo-attached"
        />
      ) : photoState.kind === 'loading' ? null : (
        <EditRow
          first
          label="Photo"
          value="Add a photo"
          valueIsAction
          onPress={handlePickPhoto}
          accessibilityLabel="Photo. Add a photo"
          testID="edit-photo-offer"
        />
      )}
      {/* P7 — a vomit or stool's photo owes a read (CUL-1680), said before Save. */}
      {isReadable && offersPhoto ? (
        <EditBlock>
          <ThemedText variant="caption" style={styles.caption}>A new photo gets a new read.</ThemedText>
        </EditBlock>
      ) : null}
      {/* P8 — offline, the edit saves on the phone; only a new photo has to wait. */}
      {newAttachmentUri && !online ? (
        <EditBlock>
          <ThemedText variant="caption" style={styles.caption}>
            The photo uploads when you’re back online. Everything else saves now.
          </ThemedText>
        </EditBlock>
      ) : null}
    </EditCard>
  ) : null;

  /* Notes — the PARENT's field, and never rendered for a look (E-7, T-22). This screen's
     note box is type-blind and always was; a look's note has to land on `looks.notes`
     because Ask's recall fetch selects `events.notes` with no type filter, so a note left
     here would reach a model before D10 is ruled. The gate is the UI half of that rule
     and the server's events_check_in_notes_null CHECK is the other; `guards/
     lookNotes.test.ts` asserts this branch so it cannot quietly come back.
     P9: an Other is its note, so it asks the log form's question. */
  const noteLabel = eventType === 'other' ? 'What did you notice?' : 'Note';
  const parentNoteCard = isLook ? null : (
    <EditCard testID="edit-card-note">
      <EditBlock first label={noteLabel}>
        <TextField
          multiline
          placeholder="Add a note (optional)"
          accessibilityLabel={noteLabel}
          value={notes}
          onChangeText={setNotes}
          maxLength={300}
        />
      </EditBlock>
    </EditCard>
  );

  // The look's note — on the CHILD (`looks.notes`), never on the parent.
  const lookNoteBlock = isLook && lookLoadedRef.current ? (
    <EditBlock label="Note" first={lookOutcome === 'nothing_unusual'}>
      <TextField
        multiline
        placeholder={LOOK_NOTE_PLACEHOLDER}
        value={lookNote}
        onChangeText={setLookNote}
        maxLength={LOOK_NOTE_MAX}
        accessibilityLabel="Note"
      />
      <ThemedText style={styles.lookNoteCue}>{LOOK_NOTE_CUE}</ThemedText>
    </EditBlock>
  ) : null;

  const intakeBlock = (
    <EditBlock label="Intake">
      <IntakeChipRow value={intakeRating} onChange={setIntakeRating} label={null} />
    </EditBlock>
  );

  // The type's own facts (P1: the record's order). A meal's food, a mixed bowl, a dose,
  // a weigh-in, a look's words; null for a type whose record is its time and note.
  const factCard = config.hasFood ? (
    <EditCard testID="edit-card-facts">
      {bowlFoods !== null ? (
        // Mixed meals row 5 — a mixed bowl's foods, each with Change and Take out,
        // staged until Save (spec §7.1, D-M4).
        <EditBlock first label="Foods in this bowl">
          <BowlEditor
            foods={bowlFoods}
            onChange={setBowlFoods}
            loadChoices={loadMixableFoods}
            toStaged={(food, replacing) => ({
              ...replacing,
              ...mixFoodOf({ id: food.id, brand: food.brand, product_name: food.product_name, format: food.format }),
            })}
          />
        </EditBlock>
      ) : bowlReadOnly !== null ? (
        <EditBlock first label="Foods in this bowl">
          {bowlReadOnly ? <ThemedText variant="bodyStrong" style={styles.value}>{bowlReadOnly}</ThemedText> : null}
          <ThemedText variant="caption" style={styles.caption}>
            {bowlReadOnly
              ? 'One of these foods isn’t on this phone, so the bowl’s foods can’t be changed here. Everything else saves as usual.'
              : 'This bowl’s foods didn’t load, so they can’t be changed here. Everything else saves as usual.'}
          </ThemedText>
        </EditBlock>
      ) : (
        <EditRow
          first
          label="Food"
          value={currentFoodProduct ?? 'No food selected'}
          // BRAND · FORMAT, the meta shape the picker's tiles use, so the meal's food is
          // named the way the options are (B-568: the wet or the dry of one product).
          detail={[currentFoodBrand, foodFormatTag(currentFoodFormat)].filter(Boolean).join(' · ') || null}
          onPress={recordPetId ? () => setFoodStep(true) : undefined}
          testID="edit-food"
        />
      )}
      {intakeBlock}
    </EditCard>
  ) : isMedication && dose ? (
    // Drug identity is read-only here (a per-dose drug swap is a mislog → Remove +
    // re-log, not a field edit); the row opens the drug's page, where a name or
    // strength correction fixes every dose. Adherence + how-given are the dose's fields.
    <EditCard testID="edit-card-facts">
      <EditRow
        first
        label="Medication"
        value={dose.genericName ?? config.label}
        detail={[dose.brandName, dose.strength].filter(Boolean).join(' · ') || null}
        onPress={dose.medicationItemId ? () => router.push(`/medication/${dose.medicationItemId}`) : undefined}
        accessibilityLabel={dose.medicationItemId ? `View drug details for ${dose.genericName ?? config.label}` : undefined}
      />
      <EditBlock label="Adherence">
        <AdherenceChipRow value={adherence} onChange={setAdherence} label={null} />
      </EditBlock>
      <EditBlock label="How given">
        <VehicleChipRow value={howGiven} onChange={setHowGiven} label={null} />
      </EditBlock>
    </EditCard>
  ) : isWeight ? (
    // The value IS the entry (B-197), so it leads, as it does on the record.
    <EditCard testID="edit-card-facts">
      <EditBlock first label="Weight">
        <NumberField
          value={weightLbsStr}
          onChangeText={setWeightLbsStr}
          unit="lbs"
          placeholder="e.g. 12.5"
          accessibilityLabel="Weight in pounds"
        />
      </EditBlock>
    </EditCard>
  ) : isLook && lookOutcome === 'nothing_unusual' ? (
    // An absence look has no words to edit, and the screen has to SAY so. T-14: seeing
    // something later is a second observation with its own hour, not a correction of
    // this row, so there is deliberately no outcome control here.
    <EditCard testID="edit-card-facts">
      <EditBlock first label="What you noticed">
        <ThemedText variant="body" style={styles.value}>Nothing unusual</ThemedText>
        <ThemedText variant="caption" style={styles.caption}>
          You marked nothing unusual. Something you see later is its own entry,
          with its own time, so this one stays as it is.
        </ThemedText>
      </EditBlock>
    </EditCard>
  ) : isLook && (lookGrid || lookNoteBlock) ? (
    /* CUL-869 — what she noticed. Editable as the words themselves rather than as a
       free-text field: the vocabulary is closed by design (§4.1 rule 10), and an "other"
       box here would be the one place in the feature an owner could mint a key nothing
       downstream can read. Head words first, then the rest in the vet's family order
       (§3.1a); the full label (head word, gloss) is what the grid shows, never the head
       alone (§4.1 rule 12, Sam). */
    <EditCard testID="edit-card-facts">
      {lookGrid ? (
        <EditBlock first label="What you noticed">
          {lookGrid.map((section) => (
            <View key={section.label ?? '__head'} style={styles.lookGridSection}>
              {/* The family's own name, in the owner's words (§3.1a). The first block is
                  the seven head words and carries no label — it is not a family, it is
                  what the compact card shows (T-13). */}
              {section.label ? (
                <ThemedText style={styles.lookGroupLabel}>{section.label}</ThemedText>
              ) : null}
              <MultiChipGroup
                options={section.options}
                values={lookWords}
                onToggle={(key) => setLookWords((prev) => toggleLookWord(prev, key))}
                accessibilityLabel={section.label ?? 'What you noticed'}
              />
            </View>
          ))}
        </EditBlock>
      ) : null}
      {lookNoteBlock}
    </EditCard>
  ) : null;

  // P1 — the record's order, per type, as the round drew it: a weigh-in leads with its
  // value; Other with its note (P9); every other type with its time.
  const cards = isWeight
    ? [factCard, timeCard, photoCard, parentNoteCard]
    : eventType === 'other'
      ? [parentNoteCard, photoCard, timeCard]
      : isLook && lookOutcome === 'nothing_unusual'
        ? [timeCard, factCard, lookNoteBlock ? <EditCard key="look-note">{lookNoteBlock}</EditCard> : null]
        : [timeCard, factCard, photoCard, parentNoteCard];

  const ready = reads === 'answered';
  const removeLabel = isLook ? `Remove ${typeWord}` : `Remove this ${typeWord}`;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={`Edit ${typeWord}`}
        titleBelowAtLargeText
        left={<HeaderAction label="Cancel" tone="quiet" onPress={() => router.back()} />}
        right={(
          <HeaderAction
            label="Save"
            onPress={handleSave}
            working={saving}
            disabled={!ready}
            disabledReason={reads === 'failed' ? 'the record didn’t load' : 'loading the record'}
          />
        )}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {saveFailed ? (
            <QuietBand testID="edit-save-failed">
              <ThemedText variant="caption" style={styles.bandText}>Couldn’t save. Your changes are still here.</ThemedText>
            </QuietBand>
          ) : null}

          {recordPetKnown ? (
            <ThemedText variant="caption" style={styles.recordLine}>{`${recordPetName}’s record`}</ThemedText>
          ) : null}

          {reads === 'failed' ? (
            <PickerReadFailed
              message="This record didn’t load, so it can’t be changed yet."
              onRetry={() => setReadAttempt((n) => n + 1)}
            />
          ) : !ready ? (
            <EditCard testID="edit-loading">
              <SkeletonRows count={3} />
            </EditCard>
          ) : (
            <>
              {cards.map((card, i) => (card ? <View key={i}>{card}</View> : null))}
              <PrimaryButton label={removeLabel} variant="destructive" onPress={handleRemove} disabled={saving} testID="edit-remove" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fullscreen photo viewer. `onReplace` reopens the picker, the same door as the
          offer, so it takes the same gate: a `hasPhoto: false` leaf that already carries
          a photo can still SHOW it, and never becomes a way to attach another. */}
      <PhotoViewer
        visible={photoViewerVisible}
        uris={[displayAttachmentUri ?? null]}
        unavailableLabel={EDITOR_PHOTO_OFFLINE_LABEL}
        onClose={() => setPhotoViewerVisible(false)}
        onReplace={offersPhoto ? () => { setPhotoViewerVisible(false); handlePickPhoto(); } : undefined}
      />
    </SafeAreaView>
  );
}

// The photo's thumbnail on the spacing scale (F7): the 56pt it always was, now named.
const PHOTO_THUMB = theme.space5 + theme.space1;

const styles = StyleSheet.create({
  // The record's ground, so the cards read as the record in edit mode (S1 B).
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  flex: { flex: 1 },
  form: {
    padding: theme.space2,
    paddingBottom: theme.space6,
    gap: theme.space2,
  },
  recordLine: {
    color: theme.colorTextSecondary,
  },
  bandText: {
    color: theme.colorTextPrimary,
  },
  value: {
    color: theme.colorTextPrimary,
  },
  caption: {
    color: theme.colorTextSecondary,
  },
  photoThumb: {
    width: PHOTO_THUMB,
    height: PHOTO_THUMB,
    borderRadius: theme.radiusSmall,
  },
  photoThumbPending: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colorBorder,
  },
  lookGridSection: {
    marginBottom: theme.space2,
  },
  // The family's label. The same quiet tracked-caps register `SectionLabel` uses one
  // level up, a step smaller, so the hierarchy reads as "What you noticed → Energy"
  // rather than as two competing headings.
  lookGroupLabel: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
    fontWeight: theme.fontWeightMedium,
    textTransform: 'uppercase',
    marginTop: theme.space2,
    marginBottom: theme.space0_5,
  },
  // The note's destination cue, under the field it describes.
  lookNoteCue: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightXS,
  },
});
