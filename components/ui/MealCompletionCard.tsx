import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { ThemedText } from './ThemedText';
import { TimeEditSheet } from './TimeEditSheet';
import { useMomentStore } from '../../store/momentStore';
import {
  removedNoticeCopy, HITSLOP_ACTION_LEFT, HITSLOP_ACTION_RIGHT,
} from '../../lib/completionCard';
import { useEventStore } from '../../store/eventStore';
import { usePetStore, resolveRecordPetName } from '../../store/petStore';
import { updateEvent, updateMealIntake } from '../../lib/db';
import { syncPendingEvents, syncPendingMeals } from '../../lib/sync';
import { formatTime } from '../../lib/utils';
import { IntakeChipRow, IntakeRating } from '../log/IntakeChipRow';
import { mealFlagCopy, membershipFlagCopy } from '../../lib/trialContaminant';
import { foodFormatTag } from '../../lib/food';
import { AddTrialFoodSheet } from '../profile/AddTrialFoodSheet';
import { buildAddTrialFoodSheet, ADD_TRIAL_FOOD_ERROR } from '../../lib/trialFoodsScreen';
import { addTrialFood, foodLabel, type TrialFoodSelection } from '../../lib/dietTrialSetup';
import type { TrialAllowedSetTrial } from '../../lib/trialAllowedSet';

// The bar's real height, imported rather than re-derived: this file used to carry
// its own `Platform.OS === 'ios' ? 80 : 60` sourced by comment from
// app/(tabs)/_layout.tsx, which stopped defining it (CUL-599) — and the bar has
// since grown. The card must clear the bar so it is not occluded when the owner
// lands back on a tabs screen after a log.
import { TAB_HEIGHT } from '../nav/NyxTabBar';

// Hold the card open this long after a chip tap so the selected chip is visibly
// confirmed before dismiss. Per the B-014 persona round: snatching it away
// immediately reads as the system overriding the input.
const INTAKE_CONFIRM_HOLD_MS = 1500;

// B-693 — everything the shipped AddTrialFoodSheet needs, captured from the
// membership flag + the meal payload at the moment the owner taps "+ Add to the
// trial list". Captured into local state (rather than read live off the payload)
// so a second meal logged mid-add cannot swap the food or pet the sheet is about:
// the trial's day-math + the meal's pet ride on the flag itself, evaluated for THIS
// meal's pet (`payload.petId`), so the write lands on the right trial even in the
// queue-then-switch edge where the active pet has since changed.
interface AddTarget {
  /** For `buildAddTrialFoodSheet` — the trial's day-math renders the sheet's
   *  "Joins the list · day N" line. `endedAt` is null because the flag only fires
   *  while the trial is running (isTrialRunning), and the sheet ignores it anyway. */
  trial: TrialAllowedSetTrial;
  /** The MEAL's pet — the write target, never a re-read active pet. */
  petId: string;
  petName: string;
  /** The food to add (id + denormalized brand/product + type for the role). */
  food: TrialFoodSelection;
}

// Root-mounted MEAL completion card — the warmed bottom-card presentation of the
// completion moment (B-064). Replaces the old standalone post-log toast: a meal
// log is now ONE warm surface (gold beat + "Logged {brand}") that ALSO carries
// the meal follow-ups, instead of a full-screen beat chased by a separate toast.
//
// Store-driven (momentStore) so every meal-entry path — the /log picker
// (handlePickFood) and the FAB quick-meal (handleQuickMeal) — fires the same
// surface via showMeal(). The full-screen terminal beat for non-meal logs is a
// sibling presentation rendered by <CompletionMoment/>.
//
// Two affordances live here, both visible in the same moment:
//   1. "Change time" — backfill path for meals fed before the owner reached
//      their phone (Linear/Gmail "Undo send" pattern). Preserves Principle 1:
//      tap-to-log stays one tap.
//   2. WSAVA intake chips — owner-reported intake (refused / picked / some /
//      most / all). Rendered for food_type 'meal' and 'treat' (B-014; treats
//      added 2026-05-23 — treat refusal is itself a clinical signal). Default
//      stays null; NEVER pre-stamped. 'other' opts out.
//
// Both are skippable: the card auto-dismisses with the user's last input
// preserved (the "intake is not preference" invariant — capture stays optional,
// default-null, at peak recall).
//
// A THIRD affordance was deliberately spent here under B-156 PR B2b: the opt-in
// "+ Add a med given with this" combo line (meal/treat only). The surface's standing
// warning — "if a third affordance is proposed, stop and reconsider, it's
// intentionally narrow" — was honored, not waived: it's a quiet, visually-quietest
// line the ~99% no-med majority reads past (Principle 1), it never adds a tap to
// the no-med path, and it only renders for foods you'd actually hide a pill in. It
// hands off to the medication picker pre-bound to THIS meal (event id = the link,
// the meal's pet = the same-pet write target, food type = the inferred vehicle).
// The intake→adherence SAFETY coupling is deliberately NOT here — that's the gated,
// adversarial-reviewed PR B3. Before proposing a FOURTH affordance: stop.
//
// B-351 slice 4 added a fourth BLOCK but not a fourth AFFORDANCE, and the
// distinction is the whole reason the standing warning above was not tripped: the
// trial CONTENTS heads-up ("this has chicken in it") is passive prose with no
// target, no state and no write. It adds zero taps to every path, including its
// own — D2 ratified the log-time register as NON-BLOCKING precisely because
// Principle 1 forbids a decision at the moment of event, so this line reports a
// fact about a meal that is already saved and asks nothing.
//
// CUL-612 adds UNDO. It is not the fourth affordance the warning above guards
// against, and the distinction is the same one B-351 relied on: the warning is
// about DOORS — controls that hand the owner off to another surface or another
// decision. Undo opens nothing and asks nothing. It reverses the single act this
// card exists to announce, on the card that announced it, and it is the answer to
// the finding that produced this whole track: a wrong-food tap in the dark was
// five taps to fix (History → detail → Remove). The reversal itself lives in
// momentStore.undo() so all three cards share one definition of "undone"; what is
// local here is that the removal line REPLACES the card's body — the intake chips,
// both trial flags and the combo line all go with it, because every one of them is
// an offer to add something to a meal that is no longer in the record.
//
// B-693 adds the trial MEMBERSHIP heads-up ("this isn't on the trial list") as an
// amber "attention" inset panel — design-locked to the mock's round-2 amber frame
// (PM-ruled amber over a rose "danger" rendering: the claim the record can back is
// list-absence, not harm). Unlike the contents flag it DOES carry one affordance,
// the quiet "+ Add to the trial list" line, and it is deliberately not a fifth
// door in the sense the standing warning guards against: it opens the SHIPPED
// AddTrialFoodSheet (B-616 PR 2) — a soft, dated confirm that never rewrites the
// feeding that just fired it (the sheet says so). It is still non-blocking; the
// meal is saved before the panel resolves, and adding is optional. Both kinds
// render only when evaluateMealLogTimeFlag returned a flag; the absence of either
// is never an all-clear, and there is deliberately no "no conflict" state.
export function MealCompletionCard() {
  const {
    visible, payload, removed, hide, undo, patchOccurredAt, patchIntakeRating, rescheduleHide,
    pauseDwell, resumeDwell,
  } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { pets } = usePetStore();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // The gold "beat" — the mint check springs in with a warm-gold halo so the
  // card carries the moment's warmth without a full-screen takeover.
  const checkScale = useRef(new Animated.Value(0.6)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  // No local draft: TimeEditSheet owns it, so opening and abandoning the picker
  // cannot touch the card's authoritative occurredAt.
  const [saving, setSaving] = useState(false);

  // B-693 — the "+ Add to the trial list" confirm-sheet state. `addTarget` is the
  // captured food/trial/pet (null when the sheet is closed); `addSaving` blocks the
  // sheet's buttons during the local write; `addError` renders in-place on a failed
  // insert (the sheet stays open, never a silent close — a food the owner believes
  // is on the list but isn't would make the vet report's next off-diet exposure
  // look like the app's mistake, per the sheet's own contract).
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Only the meal presentation renders here; the beat is the sibling overlay.
  const isMeal = payload?.kind === 'meal';
  const shown = visible && isMeal;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: shown ? 0 : 80,
        useNativeDriver: true,
        tension: 80,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: shown ? 1 : 0,
        duration: shown ? 180 : 140,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: shown ? 1 : 0.6,
        useNativeDriver: true,
        tension: 60,
        friction: 7,
      }),
    ]).start();
  }, [shown, translateY, opacity, checkScale]);

  function openPicker() {
    if (!isMeal) return;
    setPickerOpen(true);
  }

  async function savePicker(next: Date) {
    if (!isMeal) return;
    setSaving(true);
    try {
      const iso = next.toISOString();
      // Touching the picker means the user explicitly chose a time → flip
      // provenance from 'now' to 'manual' so the vet report and correlation
      // engine can distinguish witnessed-now from owner-backfilled later.
      // Re-assert 'witnessed' — meals are always witnessed (you see yourself put
      // the bowl down; the B-010 found path never applies), and this card only
      // ever edits a meal insertMeal just wrote as witnessed. Restating it is a
      // no-op that keeps the row's claim explicit; omitting the key would now
      // leave it untouched rather than wipe it (B-448), so either is safe here.
      await updateEvent(payload.eventId, {
        occurred_at: iso,
        severity: null,
        notes: null,
        occurred_at_source: 'manual',
        confidence: { value: 'witnessed', earliest: null, latest: null },
      });
      patchInToday(payload.eventId, { occurred_at: iso });
      patchOccurredAt(iso);
      setPickerOpen(false);
      // Dismiss on save — the affirmative action is its own confirmation;
      // lingering with an updated time would just be noise.
      hide();
      syncPendingEvents().catch(console.error);
    } catch (e) {
      console.error('[meal-card] failed to update event time:', e);
      Alert.alert('Could not update time', 'Try again or edit from History.');
    } finally {
      setSaving(false);
    }
  }

  async function handleIntakeChange(next: IntakeRating | null) {
    if (!isMeal) return;
    const eventId = payload.eventId;
    const prevRating = payload.intakeRating;
    // Optimistic update first so the chip lights immediately. Persistence and
    // sync follow; if either fails we surface and revert.
    patchIntakeRating(next);
    patchInToday(eventId, { intake_rating: next });
    // Swap the auto-dismiss for a brief confirmation window so the user sees the
    // selection light up before the card goes.
    rescheduleHide(INTAKE_CONFIRM_HOLD_MS);
    try {
      await updateMealIntake(eventId, next);
      syncPendingMeals().catch(console.error);
    } catch (e) {
      console.error('[meal-card] failed to update intake rating:', e);
      // Revert local state. The next focus on History/detail will refetch from
      // SQLite and confirm ground truth.
      patchIntakeRating(prevRating);
      patchInToday(eventId, { intake_rating: prevRating });
      Alert.alert('Could not save intake', 'Try again from the food\'s detail screen.');
    }
  }

  // B-156 PR B2b — the opt-in combo entry. Dismiss THIS card and open the medication
  // picker pre-bound to this meal: the meal's event id (the paired_event_id link), the
  // meal's pet (the same-pet dose-write target — read from the payload, captured at
  // log time, never a re-read active pet), and the food type (→ inferred vehicle) flow
  // as route params; the picked dose lands linked via insertMedicationDose. Hiding the
  // card first avoids it lingering behind the picker modal or racing its auto-dismiss;
  // the dose confirmation will present its own "Logged together" card on return.
  function handleAddMed() {
    if (!isMeal) return;
    const foodName = [payload.foodBrand, payload.foodProductName].filter(Boolean).join(' ').trim();
    hide();
    router.push({
      pathname: '/log',
      params: {
        type: 'medication',
        pairedEventId: payload.eventId,
        pairedPetId: payload.petId,
        pairedFoodType: payload.foodType ?? '',
        pairedFoodName: foodName,
      },
    });
  }

  // CUL-612 — see the module header. 'ignored' is silent (a second tap, or a card
  // already gone); only a real failure gets a word, and it names the other way in.
  async function handleUndo() {
    if (!payload) return;
    if ((await undo(payload.eventId)) === 'failed') {
      Alert.alert('Could not remove that log', 'Try again, or remove it from History.');
    }
  }

  // Keep rendering through the dismiss fade (payload is preserved by hide()),
  // but never mount for a beat payload.
  if (!payload || payload.kind !== 'meal') return null;

  const occurredDate = new Date(payload.occurredAt);
  // One-glance reminder of what was just logged. Brand + product, trimmed so a
  // missing brand/product doesn't leave a stray space.
  // B-568 — the variant rides INSIDE the name here (unlike the timeline rows). This
  // line has no truncating-name-plus-badge layout to protect, and the card is a
  // sentence ("Logged · …"), so a parenthetical reads better than a caps tag.
  const formatTag = foodFormatTag(payload.foodFormat);
  const foodName = [
    [payload.foodBrand, payload.foodProductName].filter(Boolean).join(' ').trim(),
    formatTag ? `(${formatTag.charAt(0)}${formatTag.slice(1).toLowerCase()})` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  // Intake capture renders for meals and treats. Treats opt in (PM call
  // 2026-05-23) because treat refusal is itself a clinical signal. Default stays
  // null; never pre-stamped. 'other' and unclassified foods stay opted out.
  const showIntake = payload.foodType === 'meal' || payload.foodType === 'treat';
  // Name the MEAL's pet, not the active one. The flag is already targeted
  // correctly either way (evaluateMealLogTimeFlag runs against payload.petId, the
  // pet captured at log time), but a queue-then-switch would otherwise print
  // another pet's name in a sentence about this pet's trial — and a clinical
  // heads-up naming the wrong animal is worse than no name at all.
  //
  // Re-based onto `resolveRecordPetName` (CUL-574), which drops the `?? activePet`
  // rung this line used to carry: on the archived-pet miss that fallback named the
  // wrong animal, which is the failure the rest of this comment describes. There is
  // one name on this card now — the sites below used to read the ACTIVE pet's while
  // the flag copy two lines up read the meal's, so one card could name two cats.
  const mealPetName = resolveRecordPetName(pets, payload.petId);
  const trialFlag = payload.trialFlag ?? null;
  // The removal line names the MEAL's pet for the same reason the flag copy does.
  const notice = removed ? removedNoticeCopy(mealPetName) : null;
  // Two registers, one per kind (B-693). CONTENTS (rung 2) → the calm passive
  // prose it has always been; MEMBERSHIP (rung 3) → the amber panel copy + the
  // "+ Add to the trial list" hatch. mealFlagCopy names a protein, so it may only
  // be handed a contents flag — the kind check is what keeps that honest.
  const contentsCopy =
    trialFlag?.kind === 'off_diet_protein' ? mealFlagCopy(trialFlag, mealPetName) : null;
  const membershipCopy =
    trialFlag?.kind === 'off_trial_list' ? membershipFlagCopy(mealPetName) : null;

  // Open the shipped AddTrialFoodSheet for the membership flag's food. Capture
  // everything the sheet + the write need NOW (see AddTarget), then dismiss the
  // card — the sheet is fully self-describing, and this mirrors handleAddMed, which
  // also dismisses the card before handing off. The meal is already saved; a "Not
  // now" just closes, losing nothing.
  function handleAddToTrialList() {
    // `if (!isMeal)` narrows `payload` to the meal payload (the aliased-discriminant
    // pattern the sibling handlers use); the kind check narrows the flag to the
    // membership one, so its trial-schedule fields are in scope below.
    if (!isMeal) return;
    if (trialFlag?.kind !== 'off_trial_list') return;
    const brand = payload.foodBrand ?? '';
    const product_name = payload.foodProductName ?? '';
    setAddError(null);
    setAddTarget({
      trial: {
        id: trialFlag.trialId,
        startedAt: trialFlag.trialStartedAt,
        targetDurationDays: trialFlag.trialTargetDurationDays,
        endedAt: null,
      },
      petId: payload.petId,
      petName: mealPetName,
      food: { id: trialFlag.foodId, brand, product_name, food_type: payload.foodType },
    });
    hide();
  }

  async function handleAddConfirm() {
    if (!addTarget) return;
    setAddSaving(true);
    setAddError(null);
    try {
      // addTrialFood writes allowed_from = TODAY, which permits the food from today
      // FORWARD (that function's own design). So EARLIER-DAY feedings keep their
      // off-list reading — the sheet's "Earlier feedings" row, and the guard against
      // adding contraband on day 13 to launder twelve prior exposures.
      //
      // ⚠️ THE SAME-DAY BOUNDARY IS UNRESOLVED (B-456), and B-693 makes it the
      // PRIMARY path: membership is day-granular (`membershipOn`, dayIndex >= from),
      // so the feeding that fired THIS heads-up — logged today, the same local day as
      // the add — re-classifies as permitted at the next recompute and drops out of
      // the off-diet count. Whether a vet-okayed add should un-count today's own
      // triggering feeding, or `allowed_from` should be tomorrow so it stays off-list,
      // is a clinical/product call (Dr. Chen) on the SHARED write, not a surface fix —
      // routed, not silently decided. The role is inferred from the food's type; a
      // mid-trial add is only ever a permitted extra, never a diet-defining row.
      await addTrialFood({
        trialId: addTarget.trial.id,
        petId: addTarget.petId,
        food: addTarget.food,
      });
      setAddTarget(null);
    } catch (e) {
      // Never silent: the sheet stays open, says so, and keeps its button live — a
      // sheet that closed on a failed insert would leave the owner believing a food
      // is permitted when the record says otherwise.
      console.error('[meal-card] add to trial list failed:', e);
      setAddError(ADD_TRIAL_FOOD_ERROR);
    } finally {
      setAddSaving(false);
    }
  }

  function handleAddCancel() {
    if (addSaving) return;
    setAddError(null);
    setAddTarget(null);
  }

  return (
    <>
      <Animated.View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
      >
        {/* CUL-614 / §5 "Dwell" — the auto-dismiss stops while a finger is on the card
            and any interaction resets it. Wired at the ROOT because touch events bubble
            from every child, so the pause covers the whole gesture including the reading
            pause between two chip taps; a per-control version would only ever cover the
            taps themselves, which were never the part being lost. onTouchCancel matters
            as much as onTouchEnd: a gesture the responder system takes away (a scroll
            claiming it, a Modal mounting over it) ends there and nowhere else.

            NOT wired over the CUL-612 removal line, deliberately — see the twin note in
            MedicationCompletionCard: that state has nothing to read, tap or answer, and
            resuming arms a full interactive window, which would let a stray touch
            stretch a 2.4s "Removed" past the dwell chosen so a reversal does not outstay
            the log it reversed. */}
        <View
          style={styles.card}
          testID="meal-card-surface"
          onTouchStart={notice ? undefined : pauseDwell}
          onTouchEnd={notice ? undefined : resumeDwell}
          onTouchCancel={notice ? undefined : resumeDwell}
        >
          {notice ? (
            /* The removal line — no mark, no controls, no follow-ups. A gold check
               over the word "Removed" would be two contradictory signals, and an
               intake chip row would be asking how much of a meal was eaten that is
               no longer in the record. Announced politely: this state has no other
               confirmation for a screen-reader owner. */
            <View
              style={styles.labelCol}
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              accessibilityLabel={notice.a11yLabel}
            >
              <ThemedText style={styles.title}>{notice.title}</ThemedText>
              <ThemedText style={styles.subLabel}>{notice.detail}</ThemedText>
            </View>
          ) : (
          <>
          <View style={styles.headerRow}>
            {/* Gold beat: mint check + warm-gold halo, carrying the moment's
                warmth into the non-blocking card. */}
            <Animated.View style={[styles.checkBadge, { transform: [{ scale: checkScale }] }]}>
              <Check size={18} color={theme.colorMomentConfirm} strokeWidth={3} />
            </Animated.View>
            <View style={styles.labelCol}>
              {/* CUL-614 — the nameless-food fallback says "Food logged", never a bare
                  "Logged": §5's sentence rule is that a beat names the record, and a
                  card that has lost the food's name still knows it wrote food.
                  Deliberately NOT "Meal logged" / "Treat logged" — that rule already
                  has two implementations (EventRow, lib/dayEvents) and this is not the
                  place to mint a third; "Food" is true for all four foodType values,
                  including the 'other' and null ones neither of those covers. */}
              <ThemedText style={styles.title} numberOfLines={1}>
                {foodName ? `Logged · ${foodName}` : 'Food logged'}
              </ThemedText>
              <ThemedText style={styles.subLabel}>{formatTime(occurredDate)}</ThemedText>
            </View>
            {/* Undo sits LEFT of Change time (round-2 mock's R1 pairing). It is in
                the header row rather than a footer of its own because everything
                below this line is a follow-up ABOUT the meal — putting a reversal
                at the end of that stack would read as one more thing to add.
                Grouped so the header's wide gap applies once, to the pair. */}
            <View style={styles.actionPair}>
            <TouchableOpacity
              onPress={handleUndo}
              hitSlop={HITSLOP_ACTION_LEFT}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Undo — remove this log"
            >
              <ThemedText style={styles.action}>Undo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openPicker}
              hitSlop={HITSLOP_ACTION_RIGHT}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Change time of this log"
            >
              <ThemedText style={styles.action}>Change time</ThemedText>
            </TouchableOpacity>
            </View>
          </View>
          {showIntake && (
            <View style={styles.intakeWrap}>
              <ThemedText style={styles.intakeLabel}>How much did {mealPetName} eat?</ThemedText>
              <IntakeChipRow
                value={payload.intakeRating ?? null}
                onChange={handleIntakeChange}
                label={null}
                size="compact"
                onDark
              />
            </View>
          )}
          {/* B-351 slice 4 — the rung-2 CONTENTS heads-up ("this has chicken in
              it"). Sits below the intake row (the mock's order): the owner's muscle
              memory for the chips is untouched, and the note is read on the way out
              rather than in place of the thing they came to do. Non-interactive —
              accessible as one summary node so a screen reader speaks the fact and
              its context together instead of two orphan lines. Divider-only, no
              tint: a contents claim is calm by design (D2's non-blocking register). */}
          {contentsCopy && (
            <View
              style={styles.flagWrap}
              accessibilityRole="summary"
              accessibilityLabel={`${contentsCopy.headline} ${contentsCopy.detail}`}
            >
              <ThemedText style={styles.flagHeadline}>{contentsCopy.headline}</ThemedText>
              <ThemedText style={styles.flagDetail}>{contentsCopy.detail}</ThemedText>
            </View>
          )}
          {/* B-693 — the rung-3 MEMBERSHIP heads-up ("this isn't on the trial
              list"), as the amber "attention" inset panel (design-locked mock round
              2). Tint + left bar break the card's calm stack and can't be read past,
              but the claim is list-absence, not harm — so the moment gold, never the
              app's rose symptom red. The text block is one summary node; the "+ Add
              to the trial list" hatch is a separate button into the shipped confirm
              sheet. */}
          {membershipCopy && (
            <View style={styles.membershipSect}>
              <View style={styles.membershipPanel}>
                <View
                  style={styles.membershipTextBlock}
                  accessibilityRole="summary"
                  accessibilityLabel={`${membershipCopy.eyebrow}. ${membershipCopy.headline} ${membershipCopy.detail}`}
                >
                  <ThemedText style={styles.membershipEyebrow}>{membershipCopy.eyebrow}</ThemedText>
                  <ThemedText style={styles.flagHeadline}>{membershipCopy.headline}</ThemedText>
                  <ThemedText style={styles.flagDetail}>{membershipCopy.detail}</ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.membershipAddRow}
                  onPress={handleAddToTrialList}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={membershipCopy.addLine}
                >
                  {/* The "+" is chrome rendered at the call site, not baked into the
                      copy string (membershipFlagCopy carries words only) — the same
                      way the combo row hardcodes its own "+ Add …" literal below. */}
                  <ThemedText style={styles.membershipAddText}>+ {membershipCopy.addLine}</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {/* B-156 PR B2b — the opt-in combo line (meal/treat only). The quietest line
              on the card; the no-med majority reads past it, the few who hid a pill in
              the food tap it to add the linked dose. */}
          {showIntake && (
            <TouchableOpacity
              style={styles.comboRow}
              onPress={handleAddMed}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add a medication given with ${mealPetName}'s ${foodName || 'food'}`}
            >
              {/* Copy: "+ Add … given with this" — the "+ Add" frames it as logging an
                  existing fact and "given with this" pins the PAST tense to the meal, so
                  it can't read as "go give a med now" (the tense ambiguity the bare
                  "Gave a med with this?" carried — flagged in investigation §9 + the
                  B2b pm-feature-review). The banner on the next screen echoes it
                  ("…you gave with it"). */}
              <ThemedText style={styles.comboText}>+ Add a med given with this</ThemedText>
            </TouchableOpacity>
          )}
          </>
          )}
        </View>
      </Animated.View>

      {/* The shared time-edit sheet (CUL-621) — this card carried its own inline
          copy until the named card's extraction gave all three completion
          surfaces one. Mounted conditionally, which is what pins the sheet's
          maximumDate to the moment the owner opened it.

          A meal is witnessed by construction, so the question is about
          OCCURRENCE. That is not a default the sheet supplies: `title` is
          required precisely so a caller editing a discovery bound cannot inherit
          this question (CUL-606's adversarial finding). */}
      {pickerOpen && (
        <TimeEditSheet
          value={new Date(payload.occurredAt)}
          title="When did this happen?"
          saving={saving}
          onCancel={() => setPickerOpen(false)}
          onSave={savePicker}
        />
      )}

      {/* B-693 — the "+ Add to the trial list" hatch's destination: the SHIPPED
          AddTrialFoodSheet (B-616 PR 2), reused verbatim (mock §3). Its own Modal,
          so it survives the card's dismiss; rendered off the captured addTarget, so
          a second meal logged mid-add can never swap the food it is about. */}
      {addTarget && (
        <AddTrialFoodSheet
          model={buildAddTrialFoodSheet(addTarget.petName, foodLabel(addTarget.food), addTarget.trial)}
          saving={addSaving}
          error={addError}
          onConfirm={handleAddConfirm}
          onCancel={handleAddCancel}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Sits ABOVE the FAB so the chip row can span full width without colliding
  // with it. FAB is at bottom: 72, height 56 → its top is at 128; the card
  // clears that with breathing room.
  wrapper: {
    position: 'absolute',
    bottom: TAB_HEIGHT + 64,
    left: theme.space2,
    right: theme.space2,
    zIndex: 50,
    elevation: 12,
  },
  card: {
    backgroundColor: theme.colorNeutralDark,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusLarge,
    gap: theme.space1,
    ...shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  // Mint ring on the dark card with a warm-gold halo — the celebrate warmth.
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colorFillOnDark,
    borderWidth: 1.5,
    borderColor: theme.colorMomentConfirm,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colorMomentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  labelCol: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 1,
  },
  title: {
    fontSize: theme.textMD,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
  },
  subLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  // The two reversal/correction controls, grouped (CUL-612). Tight internal gap:
  // they are one cluster, and the header's space2 belongs between the cluster and
  // the name it acts on.
  actionPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  // 44pt min touch target (the 3am-test rule) — the underlined label alone is
  // 15pt; hitSlop helps but the container guarantees the floor.
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  // textSM since CUL-612 put a second control here: at textMD the pair left a
  // long food name ~110pt to render in, which truncated the one thing the card
  // exists to name. It also matches the named card's action scale, so the two R1
  // presentations now agree — the sentence leads, the controls sit under it.
  action: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
    textDecorationLine: 'underline',
  },
  intakeWrap: {
    // Subtle separator so the chip row reads as a related-but-distinct
    // affordance, not a second action on the same line.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
    gap: 6,
  },
  intakeLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightRegular,
  },
  // B-351 slice 4 — the passive trial-contaminant heads-up. Same divider treatment
  // as the rows around it so the card stays one calm stack, and no accent fill: on
  // this dark ground the tinted safety card the detail screens use would read as an
  // alarm, and D2's whole point is that log-time is the NON-blocking register. The
  // headline carries slightly more weight than the detail so the fact lands first.
  flagWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
    gap: 2,
  },
  flagHeadline: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextOnDark,
  },
  flagDetail: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.4,
    color: theme.colorTextOnDarkSubtle,
  },
  // B-693 — the amber "attention" panel for the rung-3 membership heads-up. The
  // wrapper carries the same top-divider treatment as the sibling blocks so the
  // card stays one calm stack; the tinted, left-barred panel inside is what makes
  // THIS one unmissable (mock round 2, PM-ruled amber over a rose "danger"
  // rendering) — its claim-strength stays list-absence, not harm, which is why it
  // is the moment gold and not the app's rose symptom red.
  membershipSect: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
  },
  membershipPanel: {
    backgroundColor: theme.colorMomentGlowFillOnDark,
    borderLeftWidth: 3,
    borderLeftColor: theme.colorMomentGlow,
    borderRadius: theme.radiusMedium,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  membershipTextBlock: {
    gap: 2,
  },
  // The micro-caps eyebrow in the moment gold — "Off the trial list". Names the
  // register (a fact about the LIST) before the sentence lands.
  membershipEyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightSemibold,
    color: theme.colorMomentGlow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // The add hatch — the quietest line in the panel, still a full 44pt tap target
  // (the 3am-test floor). Subtle-on-dark, like the combo row it sits above.
  membershipAddRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  membershipAddText: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightMedium,
  },
  // The opt-in combo entry (B-156 PR B2b). ≥44pt tappable (the 3am-test floor) via
  // minHeight; a faint divider so it reads as a separate, optional add-on beneath the
  // intake row, never a peer of the logged act. Deliberately the quietest line.
  comboRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
    minHeight: 44,
    justifyContent: 'center',
  },
  comboText: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDarkSubtle,
    fontWeight: theme.weightMedium,
  },

});
