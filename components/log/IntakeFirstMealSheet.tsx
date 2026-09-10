// The INTAKE-FIRST meal sheet — where the Noticed card's *Didn't eat ›* door lands
// (CUL-870 / N-3b; docs/nyx-daily-look-requirements.md §3.1a, §4.5).
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
// §4.5 describes opening the meal path "at the intake step". The review's E-1 found
// that step does not exist in the tree: `app/log.tsx`'s `handlePickFood` (~401) writes
// the meal THE INSTANT a food is picked, with `intakeRating: null`, and hands the arms
// to the root-level `MealCompletionCard`, which auto-dismisses. So an owner who came
// through a door labelled *Didn't eat*, picked the food, and let the card go would
// leave an ordinary, unrated meal row behind — a record saying the bowl went down,
// where she had just said it came back full. That is the mis-record §4.5 was written
// against, and routing the door at today's picker "for now" would have shipped it.
//
// This sheet inverts the order: FOOD FIRST AS A DEFAULT, INTAKE AS THE COMMIT.
// Nothing is written until the owner names the arm, and the arm tap IS the save (two
// taps from the card to a saved refusal — Jordan's 10-second test).
//
// ── THE RULES THAT ARE NOT OBVIOUS FROM THE TREE ─────────────────────────────
// • NOTHING IS PRE-SELECTED on the intake row, ever (§4.5, the B-156 G1 shape). A cat
//   who ate a quarter is `some`, not `refused`; the door names a concern, never a
//   value. `IntakeChipRow` is the shipped WSAVA scale — this sheet does not spell a
//   sixth label of its own.
// • ONE PREDICATE FOR INTAKE. What this writes is a meal row with an
//   `intake_rating`, which is the row `intake_decline` and `feline_reduced_intake`
//   already read. No new field, no new flag, no "declined via the look" provenance —
//   the door is a way IN to the existing record, not a second one beside it.
// • THE PET IS THE REQUEST'S, never the active one (C-9 / T-11). A header switch while
//   this is up must not re-point the meal at the other cat.
// • IT MOUNTS OUTSIDE HOME'S CLOSURE. `store/uiStore.ts`'s `IntakeDoorRequest` block
//   carries the whole argument; the short version is that a meal write reachable from a
//   Home card is a third Home write class, and `guards/homeWrites.test.ts` is right
//   about that.
// • THE PANEL / WRAPPER SPLIT IS C-14. A component already inside a Modal never
//   presents another one. Today the only host is the root layout, which presents from
//   the root with nothing up; the panel exists so a future in-Modal host (the log
//   sheet, say) can render it as a layer instead of rediscovering CUL-662.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
// The log-time trial heads-up (`applyTrialFlag`, on the picker and FAB paths) is not
// wired here — CUL-893. *Add new food* from the food step leaves for the shipped
// capture flow, which owns its own write and its own card; this sheet closes first
// (C-14's `onNavigateAway`) and reports that it saved nothing.

import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { Skeleton } from '../ui/Skeleton';
import { FoodPicker } from './FoodPicker';
import { IntakeChipRow, type IntakeRating } from './IntakeChipRow';
import { insertMeal } from '../../lib/meals';
import {
  loadIntakeDoor,
  pickedFoodSource,
  type IntakePrefill,
} from '../../lib/intakeFirstMeal';
import type { TrialAllowedSet } from '../../lib/trialAllowedSet';
import { refreshedNowPoint } from '../../lib/eventTimeEdit';
import {
  INTAKE_SHEET_CARD_KEPT,
  INTAKE_SHEET_CHANGE_FOOD,
  INTAKE_SHEET_BACK,
  INTAKE_SHEET_FOOD_STEP_TITLE,
  INTAKE_SHEET_NEW_MEAL,
  INTAKE_SHEET_NOTHING_SAVED,
  intakeSheetFoodLine,
  intakeSheetFoodStepLine,
  intakeSheetQuestion,
  intakeSheetTitle,
} from '../../lib/intakeSheet';
import { useAppActive } from '../../hooks/useAppActive';
import { useEventStore } from '../../store/eventStore';
import { useMomentStore } from '../../store/momentStore';
import type { PickerFood } from '../../lib/db';

/** Brand + product, the app's one spelling of a food's name (`foodLabel` in
 *  `lib/dietTrialSetup.ts` and `lib/feedingArrangements.ts` are the same two words);
 *  restated here rather than imported so the sheet does not pull a trial-SETUP write
 *  module in to format a string. */
function foodLabel(food: PickerFood): string {
  return `${food.brand} ${food.product_name}`.trim();
}

/** What the sheet tells its host it did. `'dismissed'` is load-bearing: it is how the
 *  host knows the record is untouched, so the Noticed card's selections are left exactly
 *  as the owner had them (§3.1a — she came through this door believing she had told the
 *  app something, and closing must not quietly make that true OR quietly undo it). */
export type IntakeSheetOutcome = 'saved' | 'dismissed';

/** Defer the completion card past the Modal's own dismiss so it lands at the root layer
 *  rather than behind a still-presented Modal on iOS — the same 450 ms `app/log.tsx`
 *  spends for the same reason. */
const CARD_DELAY_MS = 450;

interface PanelProps {
  petId: string;
  petName: string;
  sex: 'male' | 'female' | 'unknown';
  /** Only then does the sheet promise the card's words are kept. */
  cardHasSelections: boolean;
  onClose: (outcome: IntakeSheetOutcome) => void;
  /** Fired alongside `onClose` when a control LEAVES this surface. A Modal host must
   *  dismiss on it: an RN Modal renders above the whole app window, so a pushed screen
   *  would land invisibly behind it (C-14, CUL-662). */
  onNavigateAway?: () => void;
}

type Step =
  /** The pre-fill read has not answered. NOT the food step: showing the picker and then
   *  yanking it away a frame later is the "a read that hasn't answered is never an empty
   *  record" failure with the states inverted (C-12). */
  | { kind: 'loading' }
  | { kind: 'food' }
  | { kind: 'intake'; food: PickerFood; source: IntakePrefill['source'] };

/** The sheet's CONTENT — scrim + panel, with no Modal of its own (C-14). */
export function IntakeFirstMealPanel({
  petId,
  petName,
  sex,
  cardHasSelections,
  onClose,
  onNavigateAway,
}: PanelProps) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  // The pet's trial set, held so a food the owner picks LATER can still be named as the
  // trial diet (§4.5's naming has to survive *Change food ›* — that is the one moment it
  // does any work). `unknown` until the read answers, which `pickedFoodSource` reads as
  // "no membership", i.e. no claim.
  const [trial, setTrial] = useState<TrialAllowedSet>({ status: 'unknown' });
  const { prependEvent } = useEventStore();
  const showMealMoment = useMomentStore((st) => st.showMeal);
  const appActive = useAppActive();

  // The instant the sheet is about, seeded at open and REFRESHED when the app comes
  // back to the foreground (C-10: `refreshedNowPoint` moves a `'now'` point and only a
  // `'now'` point). The same value is displayed and written, so the title is a promise
  // the row keeps — a sheet left open on a locked phone for twenty minutes must not
  // announce 7:12 and record 7:32.
  const [nowPoint, setNowPoint] = useState<Date>(() => new Date());
  useEffect(() => {
    if (appActive) setNowPoint((p) => refreshedNowPoint(p, 'now', new Date()));
  }, [appActive]);

  // One shot, on mount. The sheet is mounted fresh per open (the host keys it on the
  // request), so there is no stale-prefill case to re-resolve.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { prefill, trial: set } = await loadIntakeDoor(petId);
      // The step is the only thing this read decides, and an unmounted sheet has no
      // step. Guarded rather than left to React's warning because the picker flashing
      // up behind a dismissed Modal is a visible artefact, not just noise.
      if (!alive) return;
      setTrial(set);
      setStep(
        prefill ? { kind: 'intake', food: prefill.food, source: prefill.source } : { kind: 'food' },
      );
    })();
    return () => {
      alive = false;
    };
  }, [petId]);

  const onPickFood = useCallback(
    (food: PickerFood) => {
      // DELIBERATELY NOT A WRITE. This is the single line that separates this sheet from
      // `handlePickFood`, and the whole reason the issue exists: picking the food moves
      // the step, it does not commit a meal.
      //
      // The SOURCE is derived, never assumed. The first cut hardcoded `'recent_meal'`
      // here, which did two wrong things at once: it printed a recency claim nothing had
      // checked, and it dropped the trial naming at the exact moment §4.5 wants it — the
      // moment she changes away from the trial diet.
      setStep({ kind: 'intake', food, source: pickedFoodSource(trial, food) });
    },
    [trial],
  );

  const onArm = useCallback(
    async (rating: IntakeRating | null) => {
      // `IntakeChipRow` toggles an active chip back to null. Nothing is selected here
      // ever, so a null can only mean a double-fire — and "the owner cleared her answer"
      // is not a state this sheet has: the arm IS the commit.
      if (rating == null || saving || step.kind !== 'intake') return;
      setSaving(true);
      const food = step.food;
      const occurredAt = nowPoint;
      try {
        const { eventId, occurredAtIso, now } = await insertMeal({
          petId,
          foodId: food.id,
          occurredAt,
          // Clock-seeded, so the provenance is `'now'` and never `'manual'` — the app's
          // claim about when this happened, not the owner's (C-10).
          occurredAtSource: 'now',
          // The arm, in the SAME transaction as the row. See `InsertMealParams`.
          intakeRating: rating,
        });

        const foodType =
          food.food_type === 'meal' || food.food_type === 'treat' || food.food_type === 'other'
            ? food.food_type
            : null;
        prependEvent({
          id: eventId,
          pet_id: petId,
          event_type: 'meal',
          occurred_at: occurredAtIso,
          occurred_at_confidence: 'witnessed',
          severity: null,
          notes: null,
          source: 'manual',
          deleted_at: null,
          created_at: now,
          updated_at: now,
          food_item_id: food.id,
          food_brand: food.brand,
          food_product_name: food.product_name,
          food_format: food.format,
          food_type: foodType,
        });

        // Close FIRST, then raise the card — see CARD_DELAY_MS.
        onClose('saved');
        showMealMoment(
          {
            eventId,
            petId,
            occurredAt: occurredAtIso,
            foodType,
            foodBrand: food.brand,
            foodProductName: food.product_name,
            foodFormat: food.format,
            // Already the owner's own answer, so the card opens with it lit and stays
            // the place to correct it — never a second, emptier ask about the same bowl.
            intakeRating: rating,
          },
          { delayMs: CARD_DELAY_MS },
        );
      } catch (e) {
        // A FAILED WRITE IS ALWAYS SAID (C-25 / CUL-575) — and the first cut of this
        // file only claimed it was: it logged, released the guard and left the sheet
        // sitting there unchanged, which is indistinguishable from "still thinking" on
        // the one surface where the owner has just reported a refusal. The `pm-review`
        // caught it against this feature's own sibling, `LookCard.handleDone`, whose
        // alert this now matches word for word. Never the error itself (the copy guard):
        // calm, no code, pointing at the one thing she can do — the arms are still live
        // underneath, so the retry is one tap.
        console.error('[IntakeFirstMealSheet] meal write failed:', e);
        setSaving(false);
        Alert.alert('Couldn\u2019t save that', 'Please try again in a moment.');
      }
    },
    [nowPoint, onClose, petId, prependEvent, saving, showMealMoment, step],
  );

  const onAddNew = useCallback(() => {
    // Leaves this surface: dismiss the host before the push (C-14), and report the
    // truth — this sheet wrote nothing. The capture flow owns its own meal write and
    // its own completion card from there.
    onNavigateAway?.();
    onClose('dismissed');
    router.push('/food-capture');
  }, [onClose, onNavigateAway]);

  return (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={() => onClose('dismissed')}
        accessibilityRole="button"
        accessibilityLabel={INTAKE_SHEET_BACK}
      />
      <View
        style={[styles.sheet, step.kind === 'food' && styles.sheetTall]}
        accessibilityViewIsModal
      >
        <View style={styles.grabber} />

        {step.kind === 'loading' && (
          // A skeleton, not a spinner: the wait is two local SQLite reads, and the
          // loading convention puts a content-shaped wait under ~1s here — an `md` whorl
          // for that is a flash of chrome where the content is about to be. Hidden from
          // assistive tech (the `SkeletonRows` rule) — there is nothing to announce yet.
          <View style={styles.loading} importantForAccessibility="no-hide-descendants">
            <Skeleton width="55%" height={16} />
            <Skeleton width="40%" height={12} />
            <Skeleton width="70%" height={12} />
          </View>
        )}

        {step.kind === 'food' && (
          <>
            <ThemedText style={styles.title}>{INTAKE_SHEET_FOOD_STEP_TITLE}</ThemedText>
            <ThemedText style={styles.sub}>{intakeSheetFoodStepLine(petName)}</ThemedText>
            <View style={styles.picker}>
              <FoodPicker
                petId={petId}
                petName={petName}
                onPickFood={onPickFood}
                onAddNew={onAddNew}
              />
            </View>
          </>
        )}

        {step.kind === 'intake' && (
          <>
            <ThemedText style={styles.title} testID="intake-sheet-title">
              {intakeSheetTitle(nowPoint)}
            </ThemedText>
            <ThemedText style={styles.sub}>{INTAKE_SHEET_NEW_MEAL}</ThemedText>

            <ThemedText style={styles.foodLine} testID="intake-sheet-food">
              {intakeSheetFoodLine(foodLabel(step.food), step.source, sex)}
            </ThemedText>
            {/* CHIP-SIZED, not a text link. §4.5 says "the food one chip-sized tap to
                change" and the mock draws it as a chip; the first cut shipped a bare
                text row, which is quieter than the control that protects trial fidelity
                ought to be. The 44pt floor is the row's `minHeight`, so the pill itself
                can keep chip proportions (C-5). */}
            <View style={styles.changeFoodRow}>
              <TouchableOpacity
                style={styles.changeFood}
                onPress={() => setStep({ kind: 'food' })}
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole="button"
                accessibilityLabel={INTAKE_SHEET_CHANGE_FOOD}
                testID="intake-sheet-change-food"
              >
                <ThemedText style={styles.changeFoodText}>{INTAKE_SHEET_CHANGE_FOOD}</ThemedText>
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.question}>{intakeSheetQuestion(petName)}</ThemedText>
            {/* The shipped WSAVA row, nothing pre-selected, its own label suppressed
                because the question above it is the label. */}
            <View style={styles.chips} pointerEvents={saving ? 'none' : 'auto'}>
              <IntakeChipRow value={null} onChange={onArm} label={null} />
            </View>
          </>
        )}

        {/* THE TWO PROMISES, on BOTH steps. They were gated to the intake step in the
            first cut, which left the two states that most need them — a first-run pet
            with no meals, and the trial owner who tapped *Change food ›* — with neither
            (the `pm-review`). At the foot, where the mock draws them, but in the mock's
            teal ink at a readable size rather than the quietest tertiary at textXS: the
            copy module's own header calls these the sentences that are not decoration,
            and the first cut set them in the type it uses for metadata. */}
        {step.kind !== 'loading' && (
          <>
            <ThemedText style={styles.promise}>{INTAKE_SHEET_NOTHING_SAVED}</ThemedText>
            {cardHasSelections && (
              <ThemedText style={styles.promise} testID="intake-sheet-card-kept">
                {INTAKE_SHEET_CARD_KEPT}
              </ThemedText>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.close}
          onPress={() => onClose('dismissed')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={INTAKE_SHEET_BACK}
          testID="intake-sheet-close"
        >
          <ThemedText style={styles.backText}>{INTAKE_SHEET_BACK}</ThemedText>
        </TouchableOpacity>
      </View>
    </>
  );
}

interface SheetProps extends Omit<PanelProps, 'onNavigateAway'> {
  visible: boolean;
}

/** The thin Modal wrapper — the only host in v1 (the root layout). `onNavigateAway`
 *  dismisses this Modal before a pushed screen would otherwise land behind it. */
export function IntakeFirstMealSheet({ visible, onClose, ...panel }: SheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onClose('dismissed')}
      statusBarTranslucent
    >
      <IntakeFirstMealPanel {...panel} onClose={onClose} onNavigateAway={() => onClose('dismissed')} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    position: 'absolute',
    left: theme.space2,
    right: theme.space2,
    bottom: theme.space3,
    backgroundColor: theme.colorSurface,
    borderRadius: theme.radiusMedium,
    padding: theme.space3,
    gap: theme.space1,
    ...shadows.lg,
  },
  // The food step carries the picker, which needs room to be a picker rather than a
  // letterbox. Pinned top as well as bottom so it grows into the screen instead of
  // pushing its own controls off it.
  sheetTall: {
    top: theme.space5,
  },
  grabber: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space1,
  },
  loading: {
    gap: theme.space1,
    paddingVertical: theme.space2,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  sub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  picker: {
    flex: 1,
    marginTop: theme.space1,
  },
  foodLine: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.space2,
  },
  // Its own row rather than a trailing tap target on the line above: two controls that
  // share a row have to be separated by the sum of their reaches (C-5), and this one's
  // neighbour would be a whole sentence. The ROW owns the 44pt floor so the chip keeps
  // chip proportions inside it.
  changeFoodRow: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  changeFood: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    backgroundColor: theme.colorSurface,
  },
  changeFoodText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    // The ink, never the bright accent: this sits on a light surface (C-1).
    color: theme.colorAccentInk,
  },
  question: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.space1,
  },
  chips: {
    marginBottom: theme.space1,
  },
  promise: {
    fontSize: theme.textSM,
    // The mock's teal ink. On a light surface that is the INK sibling, never the bright
    // accent (C-1) — and it is what makes these read as the sheet speaking rather than
    // as metadata.
    color: theme.colorAccentInk,
  },
  // Quiet and centered — never louder than the arms, which are the answer this sheet
  // is asking for. A 44pt target (the 3am floor).
  close: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space2,
    marginTop: theme.space1,
  },
  backText: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
  },
});
