// The completion milestone's sheets — B-417 PR 6 (§4.3; mock Surface 3).
//
// Presentation only. Every string comes from `lib/dietTrialCompletion.ts`, which
// is where the clinical rules that shaped them live, and every write goes through
// `lib/dietTrialSetup.ts`. This file lays out three steps and owns no judgement of
// its own except which step follows which.
//
// ── WHY THERE IS A `decision` STEP AT ALL ────────────────────────────────────
// The milestone card (state 5) renders the three-way row INLINE — action-first,
// where the owner already is. But §4.3 says the milestone "never expires and
// re-surfaces until acted on", and the state that renders while it is ignored is
// the OVERRUN card (state 6), which the design lock draws with a single quiet
// action rather than three buttons. So overrun opens here at `decision` and the
// milestone opens here at `outcome` / `stopped` directly. One decision, two entry
// points, one set of labels — `trialDecisionChoices` is the single source, so the
// card's buttons and this sheet's rows cannot drift.
//
// `Keep going` is NOT handled here, on either path. It is a one-tap write with a
// named default, so it belongs to the host, which already owns the trial's reload;
// giving it a second implementation inside a modal is how the two would come to
// disagree about which day the extension counts from. `onExtend` is the same
// handler the card's inline button calls.
//
// ── THE ONE THING THIS SCREEN MUST NOT DO ────────────────────────────────────
// Read as permission to stop the diet. No completion vocabulary appears here, the
// data leads and the question follows, and `Keep going` is never the weaker
// option. The greppable guard lives in the pure module's test.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { Divider } from '../ui/Divider';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ThemedText } from '../ui/ThemedText';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import {
  buildOutcomeSheet, milestoneNote, stopReasonNote, trialDecisionChoices,
  trialStopReasons, OUTCOME_OPTIONS, STOPPED_SHEET_INTRO, STOPPED_SHEET_TITLE,
  type TrialOutcome, type TrialOutcomeFacts, type TrialOutcomeSheetModel,
  type TrialStopReason,
} from '../../lib/dietTrialCompletion';
import { destructiveConfirm } from '../../lib/haptics';
import { loadTrialOutcomeFacts } from '../../lib/dietTrialOutcomeFacts';
import {
  endActiveTrial, TrialEndRefused, trialEndRefusedNotice, type TrialIndication,
} from '../../lib/dietTrialSetup';

/** Which screen the host wants. `decision` is the overrun card's entry; the
 *  milestone card's three buttons land on the last two directly (its `Keep going`
 *  never opens this sheet at all). */
export type TrialCompletionEntry = 'decision' | 'complete' | 'stopped_early';

export interface CompletionSheetTrial {
  id: string;
  petId: string;
  startedAt: string;
  targetDurationDays: number;
  indication?: TrialIndication | null;
}

/** The host's newly read row for a trial that is no longer `active` (CUL-2041): the
 *  ending another device recorded, as hydration brought it in. Only what
 *  `trialEndRefusedNotice` weighs; a field the host's read does not carry is null,
 *  and the notice reads a null it cannot match as a loss (it errs loud). */
export interface CompletionSheetEndedRow {
  id: string;
  status: string;
  endedOn: string | null;
  stoppedReason: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
}

interface Props {
  /** null closes the sheet — the host clears its entry state. */
  entry: TrialCompletionEntry | null;
  trial: CompletionSheetTrial | null;
  /** The record's row once `trial` is no longer active — what another phone's ending
   *  left. Read only when `trial` goes away under an answer the owner had entered. */
  endedRow?: CompletionSheetEndedRow | null;
  petName: string;
  /** Drives the decline note's register — the 48h window is feline. */
  species?: 'dog' | 'cat' | 'other';
  /** From the shipped `petPronouns`; the copy layer defaults to they/them. */
  pronouns?: { object: string; possessive: string };
  /** The day the owner is actually on, from `getDietTrialProgress`. */
  dayCounter: number;
  /** §5.2's composition, carried onto this terminal surface too. */
  intakeDeclineHeadline?: string | null;
  onClose: () => void;
  /** `Keep going`. Owned by the host so the extension has one implementation. */
  onExtend: () => void;
  /** The trial changed; the card reloads. */
  onChanged: () => void;
}

type Step = 'decision' | 'outcome' | 'stopped';

function stepFor(entry: TrialCompletionEntry): Step {
  return entry === 'complete' ? 'outcome' : entry === 'stopped_early' ? 'stopped' : 'decision';
}

export function TrialCompletionSheet({
  entry, trial, endedRow, petName, species, pronouns, dayCounter,
  intakeDeclineHeadline, onClose, onExtend, onChanged,
}: Props) {
  const [step, setStep] = useState<Step>('decision');
  // A read remembers the inputs it was read for (CUL-1560). A trial that changes
  // while the sheet is open must not render the previous trial's counts for even
  // one commit, and only a key compared at render time can stop that: an effect
  // that clears the read runs after the render that would paint it.
  const [read, setRead] = useState<{ key: string; facts: TrialOutcomeFacts } | null>(null);
  const [factsLoading, setFactsLoading] = useState(false);
  const [outcome, setOutcome] = useState<TrialOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [stopReason, setStopReason] = useState<TrialStopReason | null>(null);
  const [saving, setSaving] = useState(false);
  // CUL-2041 — what the sheet says when the trial it was open over went away under an
  // answer the owner had entered. Held until the owner reads it.
  const [lostNotice, setLostNotice] = useState<{ title: string; body: string } | null>(null);
  // CUL-2055 — the trial this open was for went away or was replaced, with nothing
  // entered. The sheet has asked the host to close, and stays shut until it does:
  // it must never come back drawn over a different trial with its saves live.
  const [orphaned, setOrphaned] = useState(false);

  // The entry point decides the step every time the sheet opens, so re-opening
  // from a different button never lands on the previous one's screen.
  useEffect(() => {
    if (!entry) return;
    setStep(stepFor(entry));
    setSaving(false);
  }, [entry]);

  // EVERY OPEN READS THE RECORD AFRESH (CUL-1560). The host keeps this sheet
  // mounted while it is closed, so state survives a close. An owner who backs out
  // to log this morning's vomit and reopens must not be shown the read taken
  // before it ("No symptoms are on the record for either stretch"). Keyed on
  // `entry` rather than done in `handleClose`, because a close also comes from
  // `endTrial` and from the host itself: nulling the entry is the one thing every
  // close shares. The step goes back too, which does two jobs: a reopen at
  // `decision` never renders, or reads for, the previous open's outcome step; and
  // since `step` is in the loader's deps, the close cancels a read still in flight,
  // which would otherwise land after the close, refill the read, and leave the
  // reopen showing it without a read of its own.
  useEffect(() => {
    setRead(null);
    if (!entry) {
      setStep('decision');
      setLostNotice(null);
      setOrphaned(false);
    }
  }, [entry]);

  // The counts the outcome sheet leads with. Loaded when that step opens rather
  // than on mount: an owner who taps "Stopped early" is never asked how it went,
  // so they never pay for this read.
  const trialId = trial?.id ?? null;
  const petId = trial?.petId ?? null;
  const startedAt = trial?.startedAt ?? null;
  const readKey = petId && startedAt ? `${petId}|${startedAt}` : null;
  const facts = read && read.key === readKey ? read.facts : null;
  useEffect(() => {
    if (step !== 'outcome' || !petId || !startedAt || !readKey || facts) return;
    let cancelled = false;
    setFactsLoading(true);
    loadTrialOutcomeFacts({ petId, startedAt })
      .then((f) => { if (!cancelled) setRead(f ? { key: readKey, facts: f } : null); })
      .finally(() => { if (!cancelled) setFactsLoading(false); });
    return () => { cancelled = true; };
  }, [step, petId, startedAt, readKey, facts]);

  // AN ANSWER THE SHEET LOSES BEFORE SAVE IS SAID, NEVER DROPPED (CUL-2041).
  //
  // The host re-reads on every hydration, so another phone's ending reaches this
  // sheet as its trial going away (or turning into a different trial) while it is
  // open. Without this the sheet vanished and took the owner's picked outcome, note
  // or stopped-early reason with it, which is the loss CUL-2012 and CUL-2035 fixed at
  // Save, one step earlier. So it is phrased exactly as at Save: a refusal built from
  // the newly read row, through the same `trialEndRefusedNotice`, and the sheet stays
  // open to say it. Nothing is written; the first ending stays the record.
  //
  // Only when the owner had ENTERED something: a sheet with nothing picked loses
  // nothing, and closes. A row the host could not hand over (the trial is gone or was
  // replaced) is an ending this sheet cannot read, and the notice reads an unknown
  // ending as a loss, so it errs loud.
  //
  // CLOSES, NEVER CARRIES ON (CUL-2055). With nothing entered this used to return and
  // leave the host's entry set, so a trial replaced elsewhere (A→B, or A→gone→B) redrew
  // this sheet over B with every save live: one tap ended a trial the owner never
  // opened it for. The sheet was opened for one trial and answers for that one only.
  //
  // BOUND TO ONE TRIAL PER OPEN. `lastSeenTrialId` follows the prop; `boundTrialId` is
  // the trial an open was made over, fixed for that open and released with it. The
  // open binds to the trial the previous commit showed, so an open and a replacement
  // landing in one commit still bind to the trial the owner tapped over. Judging
  // against the bound trial, never the last one seen, is what stops a Save that fails
  // after a replacement from leaving the sheet live over the new trial (CUL-2055).
  //
  // A Save in flight owns the verdict: its refusal says the same sentence, once. So
  // the answer is snapshotted as it stood when the trial changed (the clear below
  // empties it in the same commit), and judged once the Save settles without closing.
  //
  // Once this open is over (`orphaned`) nothing re-judges it: a second change under an
  // unread notice must never take the notice down (CUL-2055 adversarial, BROKE-2).
  //
  // Declared ABOVE the clear below, which empties the answers on the same change;
  // both read this render's values, so the order is for the reader.
  const lastSeenTrialId = useRef<string | null>(trialId);
  const boundTrialId = useRef<string | null>(null);
  const deferredAnswer = useRef<{
    ownerReason: string | null;
    step: Step;
    outcome: TrialOutcome | null;
    notes: string;
  } | null>(null);
  useEffect(() => {
    const lastSeen = lastSeenTrialId.current;
    lastSeenTrialId.current = trialId;
    if (!entry) {
      boundTrialId.current = null;
      deferredAnswer.current = null;
      return;
    }
    if (boundTrialId.current === null) boundTrialId.current = lastSeen ?? trialId;
    const was = boundTrialId.current;
    if (!was || was === trialId || orphaned) return;
    const ownerNotes = notes.trim();
    const answer = deferredAnswer.current ?? {
      ownerReason:
        step === 'stopped'
          ? stopReason
          : step === 'outcome' && (outcome !== null || ownerNotes !== '')
            ? 'completed'
            : null,
      step,
      outcome,
      notes: ownerNotes,
    };
    if (saving) {
      deferredAnswer.current = answer;
      return;
    }
    deferredAnswer.current = null;
    // Either way this open is over: the notice, if any, is the last thing it draws.
    setOrphaned(true);
    if (!answer.ownerReason) {
      onClose();
      return;
    }
    const row = endedRow && endedRow.id === was ? endedRow : null;
    const notice = trialEndRefusedNotice({
      refusal: new TrialEndRefused({
        reason: 'not_running',
        status: row?.status ?? null,
        endedOn: row?.endedOn ?? null,
        storedReason: row?.stoppedReason ?? null,
        storedOutcome: row?.outcome ?? null,
        storedOutcomeNotes: row?.outcomeNotes ?? null,
      }),
      ownerReason: answer.ownerReason,
      petName,
      ownerOutcome: answer.step === 'outcome' ? answer.outcome : null,
      ownerOutcomeNotes: answer.step === 'outcome' ? answer.notes : null,
    });
    if (notice) setLostNotice(notice);
    else onClose();
  }, [trialId, entry, step, outcome, notes, stopReason, endedRow, petName, onClose, saving, orphaned]);

  // A different trial must never inherit the previous one's counts or answers.
  // The read's key stops a switch painting the old counts for even one commit;
  // this clear is still needed, because a trial that goes away (ended elsewhere and
  // synced in) and comes back with the same key would otherwise bring back the
  // read taken before the gap, with no read of its own.
  useEffect(() => {
    setRead(null);
    setOutcome(null);
    setNotes('');
    setStopReason(null);
  }, [trialId]);

  const handleClose = useCallback(() => {
    setOutcome(null);
    setNotes('');
    setStopReason(null);
    onClose();
  }, [onClose]);

  /** Both saves end the trial; they differ only in what they are allowed to
   *  record. `endActiveTrial` is structurally incapable of attaching an outcome
   *  to a trial that ended early (§4.3's refusal rule), so the stopped path
   *  passes none and could not use one if it did. */
  const endTrial = useCallback(
    async (params: { reason: string; outcome?: TrialOutcome | null; notes?: string }) => {
      if (!trialId || saving) return;
      // CUL-604 §5.6 — ending a trial is the destructive verb. Both paths (completed
      // and stopped-early) end it, and both are already the owner's confirmed tap on
      // this sheet, so there is no second Cancel this could pre-empt.
      destructiveConfirm();
      setSaving(true);
      try {
        await endActiveTrial({
          trialId,
          reason: params.reason,
          outcome: params.outcome ?? null,
          outcomeNotes: params.notes ?? null,
        });
        setOutcome(null);
        setNotes('');
        setStopReason(null);
        setOrphaned(true);
        onChanged();
        onClose();
      } catch (e) {
        // A REFUSAL IS NOT A FAILURE — IT MEANS THIS SHEET IS STALE (CUL-1329).
        // The trial was already ended (here, on the other host, or on another
        // device), and that first ending is the record. The host's `handleExtendTrial`
        // rule, for the same reason: re-read, close, no alert. "The trial is
        // unchanged. Have another go" would be false twice — it is not running, and
        // another go cannot succeed (C-28).
        if (e instanceof TrialEndRefused) {
          // CUL-2012 — the first ending stays, but a reason it does not hold (a
          // refusal the vet report will not show) is said once, never dropped; so is
          // a verdict or note it does not hold (CUL-2035).
          const notice = trialEndRefusedNotice({
            refusal: e, ownerReason: params.reason, petName,
            ownerOutcome: params.outcome, ownerOutcomeNotes: params.notes,
          });
          if (notice) Alert.alert(notice.title, notice.body);
          setOutcome(null);
          setNotes('');
          setStopReason(null);
          setOrphaned(true);
          onChanged();
          onClose();
          return;
        }
        console.error('[DietTrial] end-trial failed:', e);
        Alert.alert('That didn’t save', 'The trial is unchanged. Have another go in a moment.');
      } finally {
        setSaving(false);
      }
    },
    [trialId, saving, onChanged, onClose, petName],
  );

  if (!entry) return null;

  if (lostNotice) {
    const dismissNotice = () => {
      setLostNotice(null);
      handleClose();
    };
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={dismissNotice}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <ThemedText style={styles.headerTitle}>Diet trial</ThemedText>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <ThemedText testID="trial-lost-notice-title" style={styles.sheetTitle}>
              {lostNotice.title}
            </ThemedText>
            <ThemedText testID="trial-lost-notice-body" style={styles.sheetSub}>
              {lostNotice.body}
            </ThemedText>
            <PrimaryButton label="OK" onPress={dismissNotice} style={styles.primaryAction} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  if (!trial) return null;
  // The commit that brings in a different trial renders before the effect above can
  // close, and a Save in flight defers it: the bound trial (or, on the commit that
  // opens, the trial the previous commit showed) keeps every such frame from drawing
  // the new trial's saves (CUL-2055).
  const openFor = boundTrialId.current ?? lastSeenTrialId.current;
  if (orphaned || (openFor !== null && openFor !== trial.id)) return null;

  const sheet: TrialOutcomeSheetModel | null = facts
    ? buildOutcomeSheet({
        facts, petName, species, indication: trial?.indication, intakeDeclineHeadline,
      })
    : null;

  const outcomeOptions = (
    <>
      {OUTCOME_OPTIONS.map((o) => (
        <TouchableOpacity
          key={o.value}
          testID={`trial-outcome-${o.value}`}
          style={styles.optionRow}
          onPress={() => setOutcome(o.value)}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityState={{ checked: outcome === o.value }}
          hitSlop={4}
        >
          <View style={[styles.radio, outcome === o.value && styles.radioOn]} />
          <ThemedText style={styles.optionLabel}>{o.label}</ThemedText>
        </TouchableOpacity>
      ))}
    </>
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Diet trial</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

            {/* ── The decision, for the overrun entry point ── */}
            {step === 'decision' && (
              <>
                <ThemedText style={styles.sheetTitle}>Day {dayCounter} — what’s next?</ThemedText>
                {/* The decline outranks the decision here too. This is the one
                    screen that offers the PRIMARY action on a pet that has stopped
                    eating, and it was the only one in the flow not carrying the
                    sentence — the card before it does, the outcome step after it
                    does. */}
                {intakeDeclineHeadline && (
                  <ThemedText testID="trial-decision-decline" style={styles.declineLead}>
                    {intakeDeclineHeadline}
                  </ThemedText>
                )}
                <ThemedText style={styles.sheetSub}>{milestoneNote(trial.indication)}</ThemedText>
                <View style={styles.decisionRow}>
                  {trialDecisionChoices(trial.indication).map((c) => (
                    <PrimaryButton
                      key={c.id}
                      testID={`trial-decision-${c.id}`}
                      label={c.label}
                      variant={c.emphasis === 'primary' ? 'primary' : 'secondary'}
                      onPress={() => {
                        if (c.id === 'extend') { onExtend(); return; }
                        setStep(c.id === 'complete' ? 'outcome' : 'stopped');
                      }}
                      style={styles.decisionButton}
                    />
                  ))}
                </View>
              </>
            )}

            {/* ── The outcome sheet — the data leads, the question follows ── */}
            {step === 'outcome' && (
              <>
                {factsLoading && !sheet && (
                  <View style={styles.loading}>
                    <WhorlSpinner size="md" ground="day" />
                  </View>
                )}

                {sheet && (
                  <>
                    <ThemedText style={styles.sheetTitle}>{sheet.title}</ThemedText>

                    {/* §5.2's composition, on a terminal surface. A pet that has
                        stopped eating outranks a symptom tally about the last
                        eight weeks, whatever the tally says — so the decline
                        REPLACES the counts rather than sitting beside them. */}
                    {sheet.declineLead ? (
                      <>
                        <ThemedText testID="trial-outcome-decline" style={styles.declineLead}>
                          {sheet.declineLead}
                        </ThemedText>
                        <ThemedText testID="trial-outcome-decline-note" style={styles.sheetSub}>
                          {sheet.declineNote}
                        </ThemedText>
                      </>
                    ) : (
                      <>
                        <ThemedText style={styles.sheetSub}>{sheet.comparisonLine}</ThemedText>
                        <Divider style={styles.divider} />
                        {sheet.factLines.map((line, i) => (
                          <ThemedText key={i} testID="trial-outcome-fact" style={styles.fact}>
                            {line}
                          </ThemedText>
                        ))}
                        {/* C5 — mandatory on this sheet. Two ratios, no verdict. */}
                        <ThemedText testID="trial-outcome-density" style={styles.density}>
                          {sheet.densityLine}
                        </ThemedText>
                      </>
                    )}

                    <Divider style={styles.divider} />
                    {/* §4.3 is a property of the FLOW: the continuation sentence
                        travels with the owner onto the screen that actually ends
                        the trial, not only onto the card that offered to. */}
                    <ThemedText testID="trial-outcome-continuation" style={styles.continuation}>
                      {sheet.continuationNote}
                    </ThemedText>
                    <ThemedText style={styles.question}>{sheet.question}</ThemedText>
                    <ThemedText style={styles.sheetSub}>{sheet.questionNote}</ThemedText>
                    {outcomeOptions}

                    <TextInput
                      style={styles.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder={sheet.notesPlaceholder}
                      placeholderTextColor={theme.colorTextTertiary}
                      multiline
                    />

                    {/* UN-GATED ON THE ANSWER, BY DESIGN — R4 (PM, 2026-07-27).
                        The data leads and the owner question is optional, so a
                        null outcome saves cleanly and the report simply omits
                        the owner line. The question note above is what makes
                        the skip legible; do not add a disabled={!outcome}. */}
                    <PrimaryButton
                      label={sheet.saveLabel}
                      onPress={() => endTrial({ reason: 'completed', outcome, notes })}
                      loading={saving}
                      style={styles.primaryAction}
                    />
                  </>
                )}

                {/* The counts could not be read. The question is still worth
                    asking — it is the one thing the counts cannot supply — and
                    inventing numbers on this screen would be far worse than
                    having none. Same options, from the same constant. */}
                {!sheet && !factsLoading && (
                  <>
                    <ThemedText style={styles.sheetTitle}>How did it go?</ThemedText>
                    <ThemedText style={styles.sheetSub}>
                      Culprit couldn’t pull the counts for this stretch just now. Your read
                      still goes on the report in your name. Answering is optional — the
                      record goes on the report either way.
                    </ThemedText>
                    {outcomeOptions}
                    <TextInput
                      style={styles.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Anything you want your vet to know (optional)"
                      placeholderTextColor={theme.colorTextTertiary}
                      multiline
                    />
                    <PrimaryButton
                      label="Save"
                      onPress={() => endTrial({ reason: 'completed', outcome, notes })}
                      loading={saving}
                      style={styles.primaryAction}
                    />
                  </>
                )}
              </>
            )}

            {/* ── "Stopped early" — the structured reason ── */}
            {step === 'stopped' && (
              <>
                <ThemedText style={styles.sheetTitle}>{STOPPED_SHEET_TITLE}</ThemedText>
                <ThemedText style={styles.sheetSub}>{STOPPED_SHEET_INTRO}</ThemedText>

                {trialStopReasons(petName, pronouns).map((r) => {
                  const note = stopReason === r.value ? stopReasonNote(r.value, petName) : null;
                  return (
                    <View key={r.value}>
                      <TouchableOpacity
                        testID={`trial-stop-${r.value}`}
                        style={styles.optionRow}
                        onPress={() => setStopReason(r.value)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: stopReason === r.value }}
                        hitSlop={4}
                      >
                        <View style={[styles.radio, stopReason === r.value && styles.radioOn]} />
                        <ThemedText style={styles.optionLabel}>{r.label}</ThemedText>
                      </TouchableOpacity>
                      {/* The health-lane line for a refusal, and the
                          never-permission-to-stop line for "symptoms cleared up".
                          Rendered under the selected reason, where it answers the
                          choice the owner just made. */}
                      {note && (
                        <ThemedText testID={`trial-stop-note-${r.value}`} style={styles.reasonNote}>
                          {note}
                        </ThemedText>
                      )}
                    </View>
                  );
                })}

                <PrimaryButton
                  label="Save"
                  onPress={() => stopReason && endTrial({ reason: stopReason })}
                  disabled={!stopReason}
                  loading={saving}
                  style={styles.primaryAction}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space3,
    paddingVertical: theme.space2,
  },
  headerTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  headerSpacer: { width: 56 },
  cancelText: {
    fontSize: theme.textSM,
    color: theme.colorAccentInk,
    width: 56,
  },
  body: { padding: theme.space3, paddingBottom: theme.space5 },
  sheetTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  sheetSub: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginTop: theme.space1,
  },
  divider: { marginVertical: theme.space2 },
  fact: {
    fontSize: theme.textMD,
    lineHeight: theme.textMD * 1.4,
    color: theme.colorTextPrimary,
    marginTop: theme.space1,
  },
  // Subordinate to the counts it qualifies, and never hidden — the same treatment
  // the card's blind-spot qualifier gets, for the same reason.
  density: {
    fontSize: theme.textXS,
    lineHeight: theme.textXS * 1.5,
    color: theme.colorTextSecondary,
    marginTop: theme.space2,
  },
  declineLead: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    marginTop: theme.space1,
  },
  continuation: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextPrimary,
    marginBottom: theme.space2,
  },
  question: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colorBorder,
    marginRight: theme.space2,
  },
  radioOn: {
    borderColor: theme.colorAccent,
    backgroundColor: theme.colorAccent,
  },
  optionLabel: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  reasonNote: {
    fontSize: theme.textSM,
    lineHeight: theme.textSM * 1.45,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
    marginLeft: 28,
  },
  notesInput: {
    marginTop: theme.space2,
    minHeight: 72,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    padding: theme.space2,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    textAlignVertical: 'top',
  },
  decisionRow: { marginTop: theme.space3 },
  decisionButton: { marginTop: theme.space2 },
  primaryAction: { marginTop: theme.space3 },
  loading: { paddingVertical: theme.space5, alignItems: 'center' },
});
