import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Platform, Alert } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme, shadows } from '../../constants/theme';
import { useMomentStore } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore } from '../../store/petStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { updateEvent, getEventSource } from '../../lib/db';
import { syncPendingEvents } from '../../lib/sync';
import {
  summarizeLoggedRecord, canChangeTime, resolveNamedTimeEdit, applyNamedTimeEdit,
  timeEditPrompt, removedNoticeCopy, HITSLOP_ACTION_LEFT, HITSLOP_ACTION_RIGHT,
} from '../../lib/completionCard';
import { sourceAfterPointEdit } from '../../lib/eventTimeEdit';
import { ThemedText } from './ThemedText';
import { TimeEditSheet } from './TimeEditSheet';

// Tab bar height from app/(tabs)/_layout.tsx — the card must clear it so it isn't
// occluded when the owner lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;

// Root-mounted NAMED COMPLETION CARD — register R1 of the two-register completion
// system (CUL-606; docs/nyx-app-polish-requirements.md §5).
//
// ── WHAT THIS REPLACED ──────────────────────────────────────────────────────
// <CompletionMoment/>: a full-screen, solid-WHITE takeover with a check ring that
// blocked input for 1.4s after every symptom log and every weight check. Three
// things were wrong with it, and this card is shaped by all three:
//
//   1. It was a camera flash. The canonical capture moment in Jordan's brief is
//      one-handed, in a dark bedroom, at 2am. So the ground here DIMS instead —
//      and the dim is the whole visual event, which is why there is no white
//      surface anywhere in this component.
//   2. It said "Logged". The app knew exactly what it had just written and threw
//      that away. This card speaks the record's own sentence (see below).
//   3. It offered nothing. No Change time, no way back. A mis-tapped time was
//      fixed through History → detail → edit — five taps. The card carries
//      Change time, and CUL-612 put Undo beside it.
//
// ── UNDO ────────────────────────────────────────────────────────────────────
// The reversal itself lives in momentStore.undo() (soft-delete + drop from
// Today), so every card inherits it and the invariants are stated once. What is
// this component's job:
//
//   · Undo renders UNCONDITIONALLY, unlike Change time. A weight check and a
//     two-sided window both withhold the time picker (see canChangeTime), and
//     those are exactly the records with no other in-place way back. An affordance
//     that disappears on the records that need it most is not a safety net.
//   · Once removed, the card collapses to the removal line and nothing else. Not
//     disabled controls — ABSENT ones: a "Change time" beside the word "Removed"
//     offers to edit a row that is no longer in the record.
//
// ── THE SCRIM IS VISUAL, NOT MODAL ──────────────────────────────────────────
// pointerEvents="none" on the scrim, "box-none" on the wrapper: Home recedes but
// stays live, and only the card's own controls take touches. This is the trade
// that lets the dwell be 5s instead of the takeover's 1.4s — a longer window is
// only affordable because it costs the owner nothing to ignore. A 5s BLOCKING
// scrim would be a worse surface than the flash it replaced, not a better one.
//
// ── THE SENTENCE ────────────────────────────────────────────────────────────
// Derived from the payload's structured record through lib/completionCard →
// lib/logCopy → describeOccurredAt — the same path History and the vet report
// use. The card cannot be handed a display string, so it cannot over-claim and
// cannot drift from the row the owner finds tomorrow. That module's header
// carries the full rule.
export function NamedCompletionCard() {
  const {
    visible, payload, removed, hide, undo, patchOccurredAt, patchRecord,
    pauseDwell, resumeDwell,
  } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { pets, activePet } = usePetStore();
  const reduced = useReducedMotion();

  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  // The mark's spring. Held at rest under Reduce Motion — the static frame.
  const checkScale = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isNamed = payload?.kind === 'named';
  const shown = visible && isNamed;

  useEffect(() => {
    if (reduced) {
      // Static frame: the card and its ground appear and leave at full value, and
      // the mark never springs. Deliberately still a state CHANGE, not a freeze —
      // an owner with Reduce Motion on must still see the confirmation arrive;
      // the setting asks for less movement, not less information. (The commit
      // haptic is unaffected — it fires in the store, and touch is not motion.)
      translateY.setValue(0);
      opacity.setValue(shown ? 1 : 0);
      scrimOpacity.setValue(shown ? 1 : 0);
      checkScale.setValue(1);
      return;
    }
    const anim = Animated.parallel([
      Animated.spring(translateY, {
        toValue: shown ? 0 : 80, useNativeDriver: true, tension: 80, friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: shown ? 1 : 0, duration: shown ? 180 : 140, useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: shown ? 1 : 0, duration: shown ? 180 : 140, useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: shown ? 1 : 0.6, useNativeDriver: true, tension: 60, friction: 7,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [shown, reduced, translateY, opacity, scrimOpacity, checkScale]);

  async function handleSaveTime(next: Date) {
    if (!isNamed) return;
    const edit = resolveNamedTimeEdit(payload.record, next);
    // Belt-and-braces: the affordance is not rendered when the record can't take a
    // single-point edit, so this is unreachable — but a null here must never
    // become a write that guesses.
    if (!edit) { setPickerOpen(false); return; }
    setSaving(true);
    try {
      // Provenance is PRESERVED on a peek-and-save. Save is live even when the
      // owner scrubbed nothing, and stamping 'manual' unconditionally would drop
      // the 'exif' attribution off a symptom logged from a photo — a restatement
      // of a field the caller was not told about, which is the same rule this
      // card applies to `confidence` and to notes. sourceAfterPointEdit is the
      // shared predicate (B-448's "re-selecting the current value is not a new
      // claim", applied to the point).
      const changed = edit.occurredAtIso !== payload.occurredAt;
      const source = sourceAfterPointEdit(await getEventSource(payload.eventId), changed);
      await updateEvent(payload.eventId, {
        occurred_at: edit.occurredAtIso,
        // `severity` and `notes` deliberately OMITTED. The /log flow writes an
        // owner-typed note on both of this card's paths, and this edit is about
        // the time and nothing else — restating a field you were not told about
        // is how B-448's leak happened, in the other direction. updateEvent takes
        // both optional-by-omission for exactly this caller.
        occurred_at_source: source,
        // Spread, not a literal: OMITTING the key is what leaves the three B-010
        // columns exactly as stored (B-448). resolveNamedTimeEdit only supplies a
        // confidence when the edit legitimately restates them — a "found by" whose
        // discovery bound moves with the point. Everything else keeps its stored
        // claim, so a time correction can never promote a row to "seen".
        ...(edit.confidence ? { confidence: edit.confidence } : {}),
      });
      patchInToday(payload.eventId, {
        occurred_at: edit.occurredAtIso,
        ...(edit.confidence
          ? {
              occurred_at_confidence: edit.confidence.value,
              occurred_at_earliest: edit.confidence.earliest,
              occurred_at_latest: edit.confidence.latest,
            }
          : {}),
      });
      patchOccurredAt(edit.occurredAtIso);
      patchRecord(applyNamedTimeEdit(payload.record, edit));
      setPickerOpen(false);
      // Dismiss on save — the affirmative action is its own confirmation, the same
      // call the meal card makes.
      hide();
      syncPendingEvents().catch(console.error);
    } catch (e) {
      console.error('[named-card] failed to update event time:', e);
      Alert.alert('Could not update time', 'Try again or edit from History.');
    } finally {
      setSaving(false);
    }
  }

  // The reversal, once it is going to happen. `confirmed` says whether the owner
  // passed through the attachment gate below, which changes what a no-op means.
  async function runUndo(eventId: string, confirmed: boolean) {
    const result = await undo(eventId);
    if (result === 'failed') {
      Alert.alert('Could not remove that log', 'Try again, or remove it from History.');
    } else if (result === 'ignored' && confirmed) {
      // 'ignored' is SILENT on the bare tap — a second tap or an already-gone card
      // did nothing wrong, and an error there teaches the owner Undo is unreliable
      // (momentStore's own reasoning). After an explicit confirm it is the opposite:
      // the owner asked for a removal and none happened, and saying nothing is the
      // one thing UndoResult's contract calls out as reading like "removed".
      Alert.alert(
        'That log is still saved',
        'Too much time passed to remove it here. You can still remove it from History.',
      );
    }
    // A card that is still on screen has a hide to re-arm: only the 'removed' path
    // arms its own (the removal dwell, which clears the pause through armHide).
    if (result !== 'removed') resumeDwell();
  }

  async function handleUndo() {
    // Narrowed, not asserted: `hasAttachment` is a NamedPayload field, and this
    // control only ever renders over one. Same guard shape as handleSaveTime.
    if (!payload || payload.kind !== 'named') return;

    // ── THE ATTACHMENT GATE (CUL-645) ─────────────────────────────────────────
    // Undo is one tap because the tap IS the destructive confirm (§5.6), and that
    // holds for everything this card can remove EXCEPT a record carrying a photo.
    // The event itself is re-loggable — the owner still knows what they saw — but
    // the photo is of the thing itself, at 2am, and it does not exist anywhere
    // else. No surface in the app exposes a soft-deleted event, so an accidental
    // tap is the last time that photo is reachable.
    //
    // The dialog is not friction bought for its own sake, and it is deliberately
    // NOT the generic "Are you sure?" the other three destructive actions use.
    // After CUL-612's asymmetric hitSlop the mistouch mechanism is closed; what is
    // left is a COMPREHENSION failure — an owner reversing a mis-logged event with
    // no idea the photo goes too. So the body's job is to say the one thing they
    // do not know. The extra tap is the price of delivering it, not the point.
    if (payload.hasAttachment) {
      // Hold the card open across the dialog. Without this the gate is worse than
      // no gate: this card never wired the dwell pause (only the chip-bearing meal
      // and dose cards did), so the 5s runs from the REVEAL and is not reset by the
      // Undo tap — an owner who taps at 4.5s and reads the dialog for a second is
      // confirming against a card that has already dismissed. `undo()` then refuses
      // on `!visible`, returns 'ignored', and the log silently survives a removal
      // the owner explicitly authorised. runUndo says so if it happens anyway (the
      // pause has a ~20s ceiling by design); this is what makes it not happen.
      pauseDwell();
      Alert.alert(
        'Remove this log?',
        'The photo you attached will be removed with it.',
        [
          { text: 'Keep it', style: 'cancel', onPress: resumeDwell },
          {
            text: 'Remove',
            style: 'destructive',
            // No destructiveConfirm() here: undo() fires it internally, which puts
            // the rigid tap on THIS press — the confirm — exactly where History and
            // the detail screen put theirs. Their shared reason is that a haptic
            // beside a live Cancel would say something was destroyed while the
            // owner can still back out, and this path now has that live Cancel. The
            // store's guards return 'ignored' before the haptic, so a confirm that
            // arrives too late does not buzz either.
            onPress: () => { void runUndo(payload.eventId, true); },
          },
        ],
        // Android's back-button / scrim dismissal never reaches the cancel button's
        // onPress, and a pause left hanging would strand the card for the ceiling's
        // full 20s. resumeDwell is idempotent, so double-firing with Cancel is safe.
        { cancelable: true, onDismiss: resumeDwell },
      );
      return;
    }

    void runUndo(payload.eventId, false);
  }

  // Keep rendering through the dismiss fade (hide() preserves the payload), but
  // never mount for another card's payload.
  if (!payload || payload.kind !== 'named') return null;

  const celebrate = payload.tone === 'celebrate';
  const sentence = summarizeLoggedRecord(payload.record, payload.occurredAt);
  // Name the RECORD's pet, not the active one. The write already landed on the
  // right animal, but a queue-then-switch would otherwise print another pet's name
  // on a card about this one — the multi-pet guard the meal card carries, for the
  // same reason.
  const petName = pets.find((p) => p.id === payload.petId)?.name ?? activePet?.name ?? 'your pet';
  const showChangeTime = canChangeTime(payload.record);
  const prompt = timeEditPrompt(payload.record);
  const notice = removed ? removedNoticeCopy(petName) : null;

  return (
    <>
      {/* The dimmed ground. Purely visual — it never takes a touch, so Home stays
          usable underneath for the whole dwell. */}
      <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: scrimOpacity }]} />

      <Animated.View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.card}>
          {notice ? (
            /* The removal line. No mark — a check over the word "Removed" would be
               two contradictory signals, and the quiet is the point. Announced
               politely so a screen-reader owner hears the reversal land, which is
               the only confirmation this state gets. */
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
            {/* The mark. The warm-gold halo is the CELEBRATE tone only: a symptom
                log and a weight check get the same mint check with no gold, which
                is the shipped tone call (Principle 4 — we acknowledge a 2am vomit,
                we never congratulate it) and the visual half of the same rule the
                haptic layer enforces with its single soft tap. */}
            <Animated.View
              style={[
                styles.checkBadge,
                celebrate && styles.checkBadgeCelebrate,
                { transform: [{ scale: checkScale }] },
              ]}
            >
              <Check size={18} color={theme.colorMomentConfirm} strokeWidth={3} />
            </Animated.View>
            {/* One summary node: a screen reader speaks what was saved and where it
                went as a single announcement, not two orphan lines. */}
            <View
              style={styles.labelCol}
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${sentence}. Saved to ${petName}’s record`}
            >
              <ThemedText style={styles.title}>{sentence}</ThemedText>
              <ThemedText style={styles.subLabel}>{`Saved to ${petName}’s record`}</ThemedText>
            </View>
          </View>

          {/* The action row — Undo left of Change time (round-2 mock). The ROW is
              unconditional now because Undo is; only Change time is gated, and it
              is absent rather than disabled (a dead control on a 5s card teaches
              the owner the app is broken). */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleUndo}
              hitSlop={HITSLOP_ACTION_LEFT}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="Undo — remove this log"
            >
              <ThemedText style={styles.actionText}>Undo</ThemedText>
            </TouchableOpacity>
            {showChangeTime && (
              <TouchableOpacity
                onPress={() => setPickerOpen(true)}
                hitSlop={HITSLOP_ACTION_RIGHT}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Change time of this log"
              >
                <ThemedText style={styles.actionText}>Change time</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          </>
          )}
        </View>
      </Animated.View>

      {/* The prompt comes from the RECORD, not from this call site: on a "found
          by" row the value written is the discovery bound, so the sheet asks
          "When did you find it?" instead of inviting an answer about occurrence.
          Non-null whenever the button rendered — both read canChangeTime. */}
      {pickerOpen && prompt && (
        <TimeEditSheet
          value={new Date(payload.occurredAt)}
          title={prompt}
          saving={saving}
          onCancel={() => setPickerOpen(false)}
          onSave={handleSaveTime}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // The dim. One step darker than a bottom-sheet scrim would be overkill here —
  // this is a recede, not a modal — so it takes the standard overlay token.
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
    zIndex: 49,
  },
  // Same berth as the meal card: above the tab bar and clear of the FAB, so the
  // two registers land in the same place and "saved" always appears where the
  // owner's eye already is.
  wrapper: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 64,
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
  checkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colorFillOnDark,
    borderWidth: 1.5,
    borderColor: theme.colorMomentConfirm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Celebrate-only warmth. The calm tone deliberately has no shadow at all.
  checkBadgeCelebrate: {
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
  // No numberOfLines: "Loose stool · between 2:00 PM and 5:33 PM" is a legitimate
  // sentence and truncating it would put the card back in the business of saying
  // less than the record holds.
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorDividerOnDark,
    paddingTop: theme.space1,
  },
  // Pill, per the round-2 mock — and a 44pt floor, which the visual height alone
  // does not reach (CUL-579's class).
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colorDividerOnDark,
  },
  actionText: {
    fontSize: theme.textSM,
    color: theme.colorTextOnDark,
    fontWeight: theme.weightMedium,
  },
});
