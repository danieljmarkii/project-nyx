// Start a diet trial — B-417 PR 3 (spec §4.1; mock screens A–D, design-locked at
// round 4).
//
// THE FIELD TEST, and it governs every layout choice below: the sheet asks only
// what an owner can answer standing in a clinic car park holding a bag of food.
// `AddMedicationModal` is the right LOCATION precedent (D5 — the Pet tab card is
// where an owner already tells Culprit standing facts) and the WRONG shape one: it
// is 566 lines collecting eight fields. Three fields render here — the third
// added by R3, and it is PREFILLED rather than asked, so the default path still
// answers two questions. Everything else sits behind one disclosure, and every
// one of those is optional.
//
// R3 (PM, 2026-07-27): the start date is on the primary screen because its
// SEMANTIC is the thing most easily got wrong — "day 1 is the first day the
// animal has had ONLY the trial-approved foods" — and a definition behind a
// disclosure is a definition most owners never read. It costs a glance, not a
// decision.
//
// The acceptance criterion is a wall-clock number, not a taste judgement: the
// default path — trial food + indication, "More options" never opened — completes
// in under 15 seconds on a physical device, timed. Read cost is inside that
// budget; a required third answer would not be.
//
// FOUR SCREENS, one component:
//   'blocked' — a trial is already running (D). One active trial per pet is a
//               DATABASE constraint now, so this is a gate, not a nudge.
//   'form'    — A, plus B when the disclosure is open.
//   'picker'  — the multi-select food picker, for the trial diet or the extras.
//   'done'    — C, the two LOCKED teaching lines. Shown once.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Divider } from '../ui/Divider';
import { ChipGroup } from '../ui/ChipGroup';
import { PrimaryButton } from '../ui/PrimaryButton';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { FoodPicker } from '../log/FoodPicker';
import { PickerFood } from '../../lib/db';
import { localDayIndexOf, toLocalDayKey } from '../../lib/utils';
import {
  ALLOWED_SET_HELPER, INDICATION_OPTIONS, START_DATE_LABEL, TRIAL_DIET_HELPER,
  TRIAL_RECORD_DISCLOSURE, canStartTrial, defaultDurationDays, durationHelperLine,
  endActiveTrial, foodLabel, formatTrialEndDate, getActiveTrialForPet,
  permittedRoleForFood, permittedRoleLabel, secondTrialIntro, startDateHelper,
  startDietTrial, startSheetIntro, stopReasonOptions, describeActiveTrial,
  trialEndDayKey, trialSetupLines,
  type ActiveTrialSummary, type TrialFoodSelection, type TrialIndication,
} from '../../lib/dietTrialSetup';

interface Props {
  visible: boolean;
  petId: string;
  petName: string;
  species: string | null;
  /** Dismiss. The form's values are deliberately NOT reset here — see `reset`. */
  onClose: () => void;
  /** A trial now exists — the card reloads. */
  onStarted: () => void;
  /** The owner wants to capture a food that isn't in the library yet. The host
   *  dismisses this sheet and routes to `/food-capture`; the form's state survives,
   *  so re-opening resumes where they left off with the new food available. */
  onAddFood: () => void;
  /** Screen C's quiet action. */
  onLogFirstMeal: () => void;
}

type Step = 'loading' | 'blocked' | 'form' | 'picker' | 'done';
type PickerTarget = 'primary' | 'permitted';

function toSelection(food: PickerFood): TrialFoodSelection {
  return {
    id: food.id,
    brand: food.brand,
    product_name: food.product_name,
    food_type: food.food_type,
  };
}

export function StartTrialModal({
  visible, petId, petName, species, onClose, onStarted, onAddFood, onLogFirstMeal,
}: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('primary');

  const [primaryFoods, setPrimaryFoods] = useState<TrialFoodSelection[]>([]);
  const [permittedFoods, setPermittedFoods] = useState<TrialFoodSelection[]>([]);
  const [indication, setIndication] = useState<TrialIndication | null>(null);
  const [duration, setDuration] = useState('');
  // Whether the owner has typed a duration of their own. Until they have, the
  // indication chip OWNS the number (that is what "sets and shows the default"
  // means); the moment they edit it, their value is theirs and a later chip tap
  // must not silently overwrite it.
  const [durationTouched, setDurationTouched] = useState(false);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [vetName, setVetName] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [existing, setExisting] = useState<ActiveTrialSummary | null>(null);
  const [stopReason, setStopReason] = useState<string | null>(null);
  // The end the owner has AGREED to but that has not been committed — see
  // handleEndAndContinue. Cleared by reset(), so cancelling out of the sheet
  // discards it and the running trial is untouched.
  const [pendingEnd, setPendingEnd] = useState<{ trialId: string; reason: string } | null>(null);

  const [startedSummary, setStartedSummary] =
    useState<{ food: string; endDate: string | null; dayCounter: number } | null>(null);

  const reset = useCallback(() => {
    setPrimaryFoods([]);
    setPermittedFoods([]);
    setIndication(null);
    setDuration('');
    setDurationTouched(false);
    setStartedAt(new Date());
    setShowDatePicker(false);
    setVetName('');
    setMoreOpen(false);
    setStopReason(null);
    setPendingEnd(null);
    setStartedSummary(null);
  }, []);

  // Re-check on every open, against the LOCAL MIRROR — never the network. One
  // active trial per pet became a UNIQUE partial index in migration 040, so a
  // second start is refused by the database; catching it here is what turns a
  // terminal 23505 on a later sync cycle into an ordered choice the owner makes
  // now, while the modal still exists to ask them.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setStep('loading');
    getActiveTrialForPet(petId)
      .then((trial) => {
        if (cancelled) return;
        setExisting(trial);
        setStep(trial ? 'blocked' : 'form');
      })
      .catch((err) => {
        // Never block the owner on a failed read: a false "no trial" costs a
        // refused write they can retry, a false "already running" costs them the
        // feature entirely.
        console.warn('[StartTrialModal] active-trial check failed:', err);
        if (!cancelled) { setExisting(null); setStep('form'); }
      });
    return () => { cancelled = true; };
  }, [visible, petId]);

  // The indication chip sets AND SHOWS the duration default without becoming a
  // third field (§4.1). P-1 provisional, pending Dr. Chen — see the lookup table.
  function pickIndication(next: string | null) {
    const value = (next as TrialIndication | null) ?? null;
    setIndication(value);
    if (value && !durationTouched) setDuration(String(defaultDurationDays(species, value)));
  }

  const targetDays = (() => {
    const parsed = parseInt(duration, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return indication ? defaultDurationDays(species, indication) : 0;
  })();

  const startDayKey = toLocalDayKey(startedAt);
  const endDayKey = targetDays > 0 ? trialEndDayKey(startDayKey, targetDays) : null;
  const canStart = canStartTrial({ primaryFoods, indication });

  function toggleFood(food: PickerFood) {
    const selection = toSelection(food);
    const setter = pickerTarget === 'primary' ? setPrimaryFoods : setPermittedFoods;
    setter((current) =>
      current.some((f) => f.id === food.id)
        ? current.filter((f) => f.id !== food.id)
        : [...current, selection],
    );
  }

  function removeFood(target: PickerTarget, id: string) {
    const setter = target === 'primary' ? setPrimaryFoods : setPermittedFoods;
    setter((current) => current.filter((f) => f.id !== id));
  }

  function openPicker(target: PickerTarget) {
    setPickerTarget(target);
    setStep('picker');
  }

  // NOTHING IS COMMITTED HERE. The end of the running trial is held until the new
  // one is actually being started (handleStart), because ending is destructive and
  // this app has no un-end path: committing on this button and then letting the
  // owner hit Cancel — or take a phone call, or have the app killed — would leave
  // an eight-week trial `abandoned` with a `stopped_reason`, unrecoverable, in
  // exchange for a decision they did not finish making. It also silently re-anchors
  // the vet report (scope-cascade rung 2 stops keying on the trial window and the
  // leading question flips off `diet_trial_working`).
  function handleEndAndContinue() {
    if (!existing || !stopReason) return;
    setPendingEnd({ trialId: existing.id, reason: stopReason });
    setStep('form');
  }

  async function handleStart() {
    if (!canStart || !indication) return;
    setSaving(true);
    try {
      // ORDERED, and now atomic from the owner's point of view: the old trial ends
      // only on the same action that creates the new one. The wire ordering is a
      // separate problem, owned by syncPendingDietTrials' gated two-pass push.
      if (pendingEnd) {
        await endActiveTrial(pendingEnd);
        setPendingEnd(null);
        setExisting(null);
      }
      await startDietTrial({
        petId,
        primaryFoods,
        permittedFoods,
        indication,
        targetDurationDays: targetDays,
        startedAt: startDayKey,
        vetName: vetName.trim() || null,
      });
      setStartedSummary({
        food: foodLabel(primaryFoods[0]),
        endDate: endDayKey ? formatTrialEndDate(endDayKey) : null,
        // Day 1 IS the start day (the inclusive convention every trial surface
        // uses), so a trial started today is day 1 and a back-dated one is not.
        dayCounter: Math.max(
          1,
          (localDayIndexOf(toLocalDayKey(new Date())) ?? 0) -
            (localDayIndexOf(startDayKey) ?? 0) + 1,
        ),
      });
      setStep('done');
      onStarted();
    } catch (e) {
      console.error('[StartTrialModal] start trial failed:', e);
      // Covers the end too: if endActiveTrial threw, startDietTrial was never
      // reached and the running trial is still running. Nothing partial lands.
      Alert.alert('Could not start the trial', 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    reset();
    onClose();
  }

  function handleDone() {
    reset();
    onClose();
  }

  // ── Picker sub-screen ─────────────────────────────────────────────────────
  if (step === 'picker') {
    const selected = pickerTarget === 'primary' ? primaryFoods : permittedFoods;
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} hitSlop={8}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {pickerTarget === 'primary' ? 'Trial diet' : 'Also allowed'}
            </Text>
            <TouchableOpacity onPress={() => setStep('form')} hitSlop={8}>
              <Text style={styles.saveText}>
                {selected.length > 0 ? `Done (${selected.length})` : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
          <FoodPicker
            petId={petId}
            petName={petName}
            selectedFoodIds={selected.map((f) => f.id)}
            onPickFood={toggleFood}
            // The trial food is usually a bag the owner was handed ten minutes
            // ago, so "not in the library yet" is the COMMON case here, not the
            // edge one. The host dismisses this sheet and routes to the capture
            // flow; the form's values survive because this component stays
            // mounted, so re-opening resumes with the new food in the list.
            onAddNew={onAddFood}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Screen D — a trial is already running ─────────────────────────────────
  if (step === 'blocked' && existing) {
    const { complete } = describeActiveTrial(existing);
    const reasons = stopReasonOptions(petName, complete);
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Diet trial</Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.sheetTitle}>{petName} already has a trial running</Text>
            <Text style={styles.sheetSub}>{secondTrialIntro(petName, existing)}</Text>
            <Divider style={styles.blockDivider} />
            {/* The options are DAY-DEPENDENT. At day 23 of 56 the trial cannot
                have run its course, so "It ran its course" is absent — offering it
                would write `completed` over an abandoned trial and destroy the
                `stopped_reason` a vet prescribes differently from. */}
            <Text style={styles.reasonPrompt}>
              {complete
                ? 'How did this one end?'
                : `${describeActiveTrial(existing).dayLine}, so this one is ending early. Which was it?`}
            </Text>
            {reasons.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={styles.reasonRow}
                onPress={() => setStopReason(r.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: stopReason === r.value }}
                hitSlop={4}
              >
                <View style={[styles.radio, stopReason === r.value && styles.radioOn]} />
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            {/* ORDERED, not simultaneous (§3.3): the running trial is ended first
                and only then does the form open. The wire order is enforced
                separately — `syncPendingDietTrials` pushes ending trials before
                starting ones, or the UNIQUE active index rejects the new row. */}
            <PrimaryButton
              label="End this one and start the new one"
              onPress={handleEndAndContinue}
              disabled={!stopReason}
              style={styles.primaryAction}
            />
            <TouchableOpacity onPress={handleCancel} style={styles.quietAction} hitSlop={8}>
              <Text style={styles.quietActionText}>Keep the current trial</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Screen C — the teaching moment, once ──────────────────────────────────
  if (step === 'done' && startedSummary) {
    const [everyoneLine, oralRouteLine] = trialSetupLines(petName);
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleDone}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <Text style={styles.headerTitle}>Diet trial</Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            {/* R3 MADE BACK-DATING THE ENCOURAGED PATH, and this sheet was still
                written for the only path that existed before it. The clinic
                hand-off — set day 1 to the day the vet started them — ended on
                "Mochi is on day 1" with the card behind it already reading
                "Day 11 of 56": the sheet and the card disagreeing inside one tap,
                on the flow R3 exists to make normal. */}
            <Text style={styles.sheetTitle}>
              {petName} is on day {startedSummary?.dayCounter ?? 1}
            </Text>
            <Text style={styles.sheetSub}>
              {startedSummary.food}
              {startedSummary.endDate ? `, through ${startedSummary.endDate}` : ''}. Two things
              worth knowing{(startedSummary?.dayCounter ?? 1) > 1 ? '' : ' before day 1'}.
            </Text>
            <Divider style={styles.blockDivider} />
            {/* Both lines are LOCKED in §4.1. Setup, not a log moment — Principle 1
                (zero decisions at moment of event) is untouched, because none of
                this is asked while anything is happening to the pet. */}
            <Text style={styles.teachLine}>{everyoneLine}</Text>
            <Divider style={styles.blockDivider} />
            <Text style={styles.teachLine}>{oralRouteLine}</Text>
            <PrimaryButton label="Got it" onPress={handleDone} style={styles.primaryAction} />
            <TouchableOpacity
              onPress={() => { reset(); onLogFirstMeal(); }}
              style={styles.quietAction}
              hitSlop={8}
            >
              <Text style={styles.quietActionText}>Log {petName}’s first meal</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Screens A + B — the form ──────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Start a diet trial</Text>
          <View style={styles.headerSpacer} />
        </View>

        {step === 'loading' ? (
          <WhorlSpinner size="md" ground="day" style={styles.loader} />
        ) : (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetSub}>{startSheetIntro(petName)}</Text>

              {/* ── Trial diet — MULTIPLE foods (§4.1) ───────────────────────
                  A real trial is often a wet and a dry of the same diet, or two
                  forms the vet named together. N rows at role='primary_diet';
                  the FIRST also lands on the legacy `diet_trials.food_item_id`
                  so the seven shipped readers keep rendering a name. */}
              <Text style={styles.label}>Trial diet</Text>
              {primaryFoods.map((f) => (
                <FoodRow
                  key={f.id}
                  title={foodLabel(f)}
                  onPress={() => openPicker('primary')}
                  onRemove={() => removeFood('primary', f.id)}
                />
              ))}
              <AddRow
                label={primaryFoods.length === 0 ? 'Choose the trial diet' : 'Add another trial food'}
                onPress={() => openPicker('primary')}
              />
              <Text style={styles.help}>{TRIAL_DIET_HELPER}</Text>

              {/* ── What's it for ───────────────────────────────────────────
                  Three short always-visible options on a hot path → visible
                  chips through the wrapping ChipGroup, per the filter-UX pattern
                  language (never a hidden-overflow h-scroll row, B-146). */}
              <Text style={styles.label}>What’s it for</Text>
              <ChipGroup
                options={INDICATION_OPTIONS}
                value={indication}
                onChange={pickIndication}
                allowDeselect={false}
                accessibilityLabel="What the trial is for"
              />
              {indication ? (
                <Text style={styles.help}>
                  {durationHelperLine(indication, targetDays, startDayKey, endDayKey)}
                </Text>
              ) : null}

              {/* ── First day on the trial diet only (R3, mock round 5) ───────
                  PROMOTED FROM "More options", and the promotion is a clinical
                  fix rather than a layout preference. Day 1 is the first day of
                  EXCLUSIVE feeding, after the ≥1-week transition — a definition
                  the owner cannot apply if the field it governs is behind a
                  disclosure they never open. The car-park owner starts the
                  countdown on the day the vet handed over the bag, so the whole
                  transition week lands inside the window and ~14 vet-INSTRUCTED
                  feedings of the old food enter the record as the owner's slips.
                  Back-dating is the affordance that keeps them out.

                  Still not a third DECISION: it is prefilled Today, so the
                  default path stays "read it and carry on" and Jordan's
                  under-15-seconds constraint holds. */}
              <Text style={styles.label}>{START_DATE_LABEL}</Text>
              <TouchableOpacity
                style={styles.fieldBtn}
                onPress={() => setShowDatePicker((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${START_DATE_LABEL}: ${startedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}`}
              >
                <Text style={styles.fieldBtnText}>
                  {startedAt.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={styles.changeLabel}>{showDatePicker ? 'Done' : 'Change'}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={startedAt}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_e: unknown, date?: Date) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (date) setStartedAt(date);
                  }}
                />
              )}
              <Text style={styles.help}>{startDateHelper(petName)}</Text>

              {/* ── One disclosure. Three fields, none required. ────────────── */}
              <TouchableOpacity
                style={styles.disclosure}
                onPress={() => setMoreOpen((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: moreOpen }}
                hitSlop={8}
              >
                <Text style={styles.disclosureText}>More options</Text>
                {moreOpen
                  ? <ChevronUp size={18} color={theme.colorTextSecondary} />
                  : <ChevronDown size={18} color={theme.colorTextSecondary} />}
              </TouchableOpacity>

              {moreOpen && (
                <>
                  {/* Copy locked to PROVENANCE. Never "treats you'll still give"
                      — that phrasing turns the field into a self-granted loophole
                      that silently zeroes the exposure count. */}
                  <Text style={styles.label}>Also allowed</Text>
                  {permittedFoods.map((f) => (
                    <FoodRow
                      key={f.id}
                      title={foodLabel(f)}
                      // The role is INFERRED from the library's own food_type and
                      // shown back here, so the owner can see what was assumed.
                      subtitle={permittedRoleLabel(permittedRoleForFood(f.food_type))}
                      onPress={() => openPicker('permitted')}
                      onRemove={() => removeFood('permitted', f.id)}
                    />
                  ))}
                  <AddRow
                    label={permittedFoods.length === 0 ? 'Add a permitted food' : 'Add another'}
                    onPress={() => openPicker('permitted')}
                  />
                  <Text style={styles.help}>{ALLOWED_SET_HELPER}</Text>

                  <Text style={styles.label}>How long</Text>
                  <View style={styles.durationRow}>
                    <TextInput
                      style={[styles.input, styles.durationInput]}
                      value={duration}
                      onChangeText={(t) => { setDuration(t.replace(/[^0-9]/g, '')); setDurationTouched(true); }}
                      placeholder="e.g. 56"
                      placeholderTextColor={theme.colorTextSecondary}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      accessibilityLabel="Trial length in days"
                    />
                    <Text style={styles.durationUnit}>days</Text>
                  </View>
                  {/* The field renders its resulting END DATE, not just a day
                      count — "56 days" is not a thing an owner can plan around. */}
                  {endDayKey ? (
                    <Text style={styles.help}>Ends {formatTrialEndDate(endDayKey)}.</Text>
                  ) : null}

                  {/* The start date used to live here; R3 moved it to the
                      primary screen (mock round 5, screen B's own caption). It is
                      NOT duplicated — one field, one state, one place. */}

                  <Text style={styles.label}>Vet (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={vetName}
                    onChangeText={setVetName}
                    placeholder="Who prescribed it"
                    placeholderTextColor={theme.colorTextSecondary}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </>
              )}

              {/* ── C6 (PM, 2026-07-25) — the disclosure, at the confirm action ──
                  This is the first record Culprit keeps that is a judgement about
                  a PERSON rather than a fact about a pet, on an artifact that
                  already names both owner and vet. It renders BEFORE the commit,
                  not on the card afterwards: "they consented by tapping Start" is
                  not consent to a disclosure never shown to them. Same warm
                  register as the rest of the sheet — no legal voice, no checkbox. */}
              <Text style={styles.consent}>{TRIAL_RECORD_DISCLOSURE}</Text>
              <PrimaryButton
                label="Start trial"
                onPress={handleStart}
                disabled={!canStart || saving}
                loading={saving}
                style={styles.primaryAction}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// One chosen food. The row opens the picker (where it can be deselected among the
// rest); "Remove" is a separate control so a single food can be dropped without a
// round trip. Both clear the 44pt floor.
function FoodRow({
  title, subtitle, onPress, onRemove,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.foodRow}>
      <TouchableOpacity style={styles.foodRowMain} onPress={onPress} activeOpacity={0.7} hitSlop={4}>
        <View style={styles.flex}>
          <Text style={styles.foodRowTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.foodRowSub}>{subtitle}</Text> : null}
        </View>
        <ChevronRight size={18} color={theme.colorTextTertiary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onRemove}
        style={styles.removeTouch}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title}`}
      >
        <Text style={styles.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.addRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.addRowPlus}>＋</Text>
      <Text style={styles.addRowText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: theme.colorSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
  },
  headerTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  headerSpacer: {
    width: 56,
  },
  cancelText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  saveText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  loader: {
    alignSelf: 'center',
    paddingVertical: theme.space4,
  },
  form: {
    padding: theme.space3,
    paddingBottom: theme.space6,
    gap: theme.space1,
  },
  sheetTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorNeutralDark,
  },
  sheetSub: {
    fontSize: theme.textSM,
    lineHeight: 20,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  label: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    marginTop: theme.space2,
    marginBottom: 4,
  },
  help: {
    fontSize: theme.textSM,
    lineHeight: 19,
    color: theme.colorTextTertiary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorNeutralLight,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space2,
    marginBottom: theme.space1,
  },
  foodRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 52,
  },
  foodRowTitle: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  foodRowSub: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  removeTouch: {
    minHeight: 44,
    justifyContent: 'center',
  },
  removeText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 48,
    paddingHorizontal: theme.space2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
  },
  addRowPlus: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },
  addRowText: {
    fontSize: theme.textMD,
    color: theme.colorAccent,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginTop: theme.space2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorder,
    paddingTop: theme.space2,
  },
  disclosureText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
  },
  durationInput: {
    flex: 1,
  },
  durationUnit: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    backgroundColor: theme.colorNeutralLight,
  },
  fieldBtnText: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  changeLabel: {
    fontSize: theme.textSM,
    color: theme.colorAccent,
    fontWeight: theme.weightMedium,
  },
  consent: {
    fontSize: theme.textSM,
    lineHeight: 20,
    color: theme.colorTextSecondary,
    backgroundColor: theme.colorNeutralLight,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    marginTop: theme.space3,
  },
  primaryAction: {
    marginTop: theme.space2,
  },
  quietAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  quietActionText: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
  blockDivider: {
    marginVertical: theme.space2,
  },
  reasonPrompt: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space1,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    minHeight: 48,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radiusFull,
    borderWidth: 2,
    borderColor: theme.colorBorderStrong,
  },
  radioOn: {
    borderColor: theme.colorAccent,
    borderWidth: 6,
  },
  reasonLabel: {
    flex: 1,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  teachLine: {
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextPrimary,
  },
});
