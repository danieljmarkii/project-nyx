import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Platform, Alert, LayoutAnimation } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadows } from '../../constants/theme';
import { useMomentStore, completionTone, isNamedDimUp } from '../../store/momentStore';
import { useEventStore } from '../../store/eventStore';
import { usePetStore, resolveRecordPetName } from '../../store/petStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppActive } from '../../hooks/useAppActive';
import { useLiveRegionAnnouncement } from '../../hooks/useLiveRegionAnnouncement';
import { updateEvent, getEventSource } from '../../lib/db';
import { writeOwingFloorCheck } from '../../lib/incidentFloorQueue';
import { syncPendingEvents } from '../../lib/sync';
import {
  summarizeLoggedRecord, canChangeTime, resolveNamedTimeEdit, applyNamedTimeEdit,
  timeEditPrompt, removedNoticeCopy, undoGateCopy,
  HITSLOP_ACTION_LEFT, HITSLOP_ACTION_RIGHT,
} from '../../lib/completionCard';
import { sourceAfterPointEdit } from '../../lib/eventTimeEdit';
import { ThemedText } from './ThemedText';
import { COMPLETION_GROUND, CompletionMark } from './CompletionMark';
import { TimeEditSheet } from './TimeEditSheet';
import { FloorRaiseLine } from './FloorRaiseLine';
import { openRaisedRead } from './openRaisedRead';
import { COMPLETION_MOTION, useCompletionArrival } from '../motion/completionMotion';
import { FOLD_LAYOUT } from '../motion/foldMotion';

// Tab bar height from app/(tabs)/_layout.tsx — the card must clear it so it isn't
// occluded when the owner lands back on a tabs screen after a log.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 60;
// Clearance above the FAB, which sits over every tabs screen. Unchanged: the
// shipped berth is TAB_BAR_HEIGHT + this, and the meal card and Snackbar use the
// same pair so all three transient surfaces land where the owner's eye already is.
const FAB_CLEARANCE = 64;

// ── WHERE THE CARD SITS (CUL-802) ───────────────────────────────────────────
// A record screen has neither a tab bar nor a FAB, so BOTH halves of the shipped
// offset are clearance for things that are not there — 144pt of it would leave the
// card floating in the middle of nothing. Over the record it takes the shape every
// other bottom-anchored surface in the app uses (`insets.bottom + theme.space2` —
// the sheets, the report bar, the rundown bar): clear of the home indicator, with
// the standard gutter under it, and no invented allowance for absent chrome.
//
// The offset reads the ROUTE, not the payload. The card outlives the navigation it
// was fired over — Undo dismisses the record and the removal line lands on Home —
// so a landing baked into the payload would be stale exactly when it mattered: the
// card would sit at the record's offset while over Home, right on the tab bar.
//
// Path prefix rather than a segments match: `/event/[id]` is the only non-tabs
// destination any log path can reach, and a prefix keeps every other route —
// today's four tabs, and anything added later — on the shipped offset by default.
// Fail toward the shipped geometry, never toward the new one.
const RECORD_ROUTE_PREFIX = '/event/';

// Root-mounted NAMED COMPLETION CARD — register R1 of the two-register completion
// system (CUL-606; docs/nyx-app-polish-requirements.md §5).
//
// ── WHAT THIS REPLACED ──────────────────────────────────────────────────────
// <CompletionMoment/>: a full-screen, solid-WHITE takeover with a check ring that
// blocked input for 1.4s after every symptom log and every weight check. Three
// things were wrong with it, and this card is shaped by all three:
//
//   1. It was a camera flash. The canonical capture moment in Jordan's brief is
//      one-handed, in a dark bedroom, at 2am. So the screen behind DIMS instead:
//      a daylight bottom card over a dimmed Home, never a full-screen white
//      takeover (polish spec §5 R1, reworded by CUL-1691 D1). The card is the
//      app's own white, lifted by shadows.lg with no outline, and OPAQUE on
//      purpose: iOS traces a layer shadow off the composite alpha, so a
//      translucent card would grain its own shadow (#1125). The test pins it.
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
    visible, payload, removed, undoing, hide, undo, patchOccurredAt, patchRecord,
    pauseDwell, resumeDwell, armRemovedDwell,
  } = useMomentStore();
  const { patchInToday } = useEventStore();
  const { pets } = usePetStore();
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  // Both are provider-safe from here: app/_layout.tsx renders this INSIDE ExpoRoot,
  // which wraps the tree in a SafeAreaProvider, and expo-router's route info falls
  // back to a default when no navigator has mounted.
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const overRecord = pathname.startsWith(RECORD_ROUTE_PREFIX);
  const bottomOffset = overRecord
    ? insets.bottom + theme.space2
    : TAB_BAR_HEIGHT + FAB_CLEARANCE;
  // The route, read inside the async reversal below rather than off that closure: the
  // write is awaited, and the owner can leave the record while it is in flight. A
  // stale value there would pop a screen they had already left (CUL-170's shape — the
  // one-shot navigation lives in a ref, never in a captured value).
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isNamed = payload?.kind === 'named';
  // The card and its dim are up together: `isNamedDimUp` is the one predicate the scrim
  // and the look chips under it read (R4-2), so the two can never disagree.
  const shown = isNamedDimUp({ visible, payload });

  // CUL-1691 §2 — the motion: the meal card's hook, one tone predicate. The tone is read
  // from the store when a beat is due (`celebrateNow`), never from this render's closure.
  // No flight reaches this card, so `flying` is always false and `endFlight` has nothing
  // to end. Reduce Motion is a crossfade inside the hook, read once at start (C-43).
  const namedNow = isNamed ? payload : null;
  const arrival = useCompletionArrival({
    identity: namedNow ? namedNow.eventId : null,
    shown,
    removed,
    flying: false,
    reducedMotion: reduced,
    appActive,
    celebrate: namedNow ? completionTone(namedNow) === 'celebrate' : false,
    celebrateNow: () => {
      const p = useMomentStore.getState().payload;
      return p?.kind === 'named' && completionTone(p) === 'celebrate';
    },
    currentIdentity: () => useMomentStore.getState().payload?.eventId,
    onRemovedLanded: (id) => armRemovedDwell(id),
    endFlight: () => undefined,
  });

  // INERT FROM THE UNDO TAP (§2.3). Read from the store at the tap, so Change time or the
  // floor line's door pressed in the same frame as Undo is refused before the reversal's
  // await resolves. Nothing visual changes on the tap: a reversal is never shown before
  // it has happened (CUL-612).
  function inertNow(eventId: string): boolean {
    const st = useMomentStore.getState();
    return st.undoing === eventId || (st.removed && st.payload?.eventId === eventId);
  }
  const inert = namedNow ? undoing === namedNow.eventId || removed : false;

  // A VET-CALL LINE PATCHED IN AFTER THE REVEAL (§2.3, `patchFloorLine`). One committed
  // within `labelBeatMs` of the reveal lays out with the card. One later finishes the
  // arrival the way a touch does, THEN fires `FOLD_LAYOUT` (app-global: it animates the
  // next commit anywhere), then lays the line out, then the tone decides (a vet-call line
  // makes the card calm, so a standing halo leaves).
  const upId = shown && !removed && namedNow ? namedNow.eventId : null;
  const revealedAt = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  if (upId !== null && revealedAt.current.id !== upId) revealedAt.current = { id: upId, at: Date.now() };
  const [laid, setLaid] = useState<{ id: string | null; floorLine: unknown }>({ id: null, floorLine: null });
  const pendingSettle = useRef(false);
  const liveFloor = namedNow?.floorLine ?? null;
  useEffect(() => {
    if (!namedNow) return;
    const id = namedNow.eventId;
    if (laid.id === id && laid.floorLine === liveFloor) return;
    const next = { id, floorLine: liveFloor };
    const atReveal = laid.id !== id || Date.now() - revealedAt.current.at <= COMPLETION_MOTION.labelBeatMs;
    // A card that is hidden, leaving or undone lays the line out plainly: `configureNext`
    // is app-global, and there is no arrival left to finish.
    if (atReveal || upId === null) {
      setLaid(next);
      return;
    }
    arrival.finishForPatch();
    LayoutAnimation.configureNext(FOLD_LAYOUT);
    pendingSettle.current = true;
    setLaid(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namedNow?.eventId, liveFloor]);
  // The tone decides only after the FOLD_LAYOUT commit has laid the line out.
  const settleHaloRef = useRef(arrival.settleHalo);
  settleHaloRef.current = arrival.settleHalo;
  useEffect(() => {
    if (!pendingSettle.current) return;
    pendingSettle.current = false;
    settleHaloRef.current();
  }, [laid]);
  const layFloor = (namedNow !== null && laid.id === namedNow.eventId ? laid.floorLine : liveFloor) as typeof liveFloor;

  async function handleSaveTime(next: Date) {
    if (!isNamed || inertNow(payload.eventId)) return;
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
      await writeOwingFloorCheck(payload.eventId, () => updateEvent(payload.eventId, {
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
      }));
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
    // ── G5 (CUL-802): a screen never shows a row that is no longer in the record.
    // Over the incident record this card is sitting on top of the very event it
    // just soft-deleted — every section below it (the hero photo, the read, the
    // observations) is describing something the owner has removed. So the record
    // dismisses and the removal line lands on Home, where it lands from every other
    // log path. Only on 'removed': a failed or ignored reversal left the row in
    // place, and dismissing there would take the owner away from a record that
    // still exists, on the one path where they were told it might not have worked.
    // And only over the removed event's OWN record: the card outlives navigation, so
    // an owner can log A, open B while A's card dwells, and tap Undo. B is still in
    // the record, and popping it would dismiss a screen this card says nothing about.
    if (result === 'removed' && pathnameRef.current === `${RECORD_ROUTE_PREFIX}${eventId}`) {
      router.back();
    }
  }

  async function handleUndo() {
    // Narrowed, not asserted: `hasAttachment` is a NamedPayload field, and this
    // control only ever renders over one. Same guard shape as handleSaveTime.
    if (!payload || payload.kind !== 'named') return;

    // ── THE ATTACHMENT GATE (CUL-645, widened by CUL-869) ─────────────────────
    // Undo is one tap because the tap IS the destructive confirm (§5.6), and that
    // holds for everything this card can remove EXCEPT a record carrying something
    // the owner cannot make again. The full argument, and the wording, live in
    // `lib/completionCard`'s `undoGateCopy` — moved there by CUL-964 when the R2
    // in-sheet beat gained the same gate, because two copies of a safety string are
    // two copies to keep in step.
    const gate = undoGateCopy(payload);

    if (gate) {
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
        gate.title,
        gate.body,
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

  // The words, derived ABOVE the early return below because the announcement is a hook
  // and must run on every render (the rules of hooks). `named` is null for another
  // card's payload, so nothing here is computed for a payload this card never paints.
  const named = payload?.kind === 'named' ? payload : null;
  const raisedId = named?.floorLine?.eventId ?? '';
  const sentence = named ? summarizeLoggedRecord(named.record, named.occurredAt) : '';
  // Name the RECORD's pet, not the active one, through the one shared lookup
  // (CUL-574). The write already landed on the right animal, but a
  // queue-then-switch would otherwise print another pet's name on a card about
  // this one — the multi-pet guard the meal and dose cards carry. The lookup has
  // NO active-pet rung on purpose (CUL-659): `pets` holds only non-archived pets,
  // so a miss here means the record's pet is not the active one either, and the
  // `?? activePet?.name` fallback this line used to carry could only ever name
  // the wrong animal. A miss falls to the anonymous form.
  const petName = named ? resolveRecordPetName(pets, named.petId) : '';
  const notice = named && removed ? removedNoticeCopy(petName) : null;
  // The header always speaks the LOGGED sentence, derived from the payload, never from
  // `removed` (§2.3): through the collapse the old body is hidden from assistive tech,
  // and the Removed label belongs to the removal node and the announcement alone.
  const headerLabel = `${sentence}. Saved to ${petName}’s record`;
  // What VoiceOver is told: iOS speaks "Removed" through this hook on the `removed`
  // fact; Android through the removal node's live region when it mounts. Once each.
  const summaryLabel = notice ? notice.a11yLabel : headerLabel;

  // CUL-1275 — the summary node's `accessibilityLiveRegion` is Android-only, so on an
  // iPhone this card confirmed every save and every Undo in silence. Spoken only while
  // the card is SHOWN (a payload kept for the dismiss fade says nothing), and keyed on the
  // event so a second save with the same sentence is still a second confirmation.
  useLiveRegionAnnouncement(shown && named ? summaryLabel : null, named?.eventId);

  // Keep rendering through the dismiss fade (hide() preserves the payload), but
  // never mount for another card's payload.
  if (!payload || payload.kind !== 'named') return null;

  const showChangeTime = canChangeTime(payload.record);
  const prompt = timeEditPrompt(payload.record);

  // The collapse (§2.3): the body stays, frozen and hidden from assistive tech, until
  // "Removed" lands; under Reduce Motion both are mounted for a true crossfade.
  const bodyUp = !(removed && arrival.collapse === 'landed');
  const noticeUp = notice !== null && (arrival.collapse === 'landed' || (arrival.collapse === 'leaving' && reduced));
  // Never `disabled` (it announces "dimmed", C-7): hidden from assistive tech, because
  // TalkBack's double-tap reaches `onPress` through `pointerEvents="none"`.
  const leavingBody = removed
    ? ({ pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const)
    : null;

  return (
    <>
      {/* The dimmed ground. Purely visual — it never takes a touch, so Home stays
          usable underneath for the whole dwell. It fades with the card and leaves with
          it (§2.1): its opacity is the card's, and the card is up exactly while
          `isNamedDimUp` holds, the same predicate the look chips read. */}
      <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: arrival.cardOpacity }]} />

      <Animated.View
        pointerEvents={shown && !inert ? 'box-none' : 'none'}
        style={[styles.wrapper, { bottom: bottomOffset, opacity: arrival.cardOpacity, transform: [{ translateY: arrival.cardTranslateY }] }]}
      >
        {/* A touch finishes the motion; lifting it lets the tone settle the halo (§2.3).
            This card has no dwell pause on its root, so it gains the finish only. Not
            wired from the Undo tap on: that state has nothing to finish. */}
        <View
          style={styles.card}
          testID="named-card-surface"
          pointerEvents={inert ? 'none' : 'auto'}
          onTouchStart={inert ? undefined : arrival.finishForTouch}
          onTouchEnd={inert ? undefined : arrival.settleForTouch}
          onTouchCancel={inert ? undefined : arrival.settleForTouch}
        >
          {bodyUp && (
          <View style={styles.body} testID="named-card-body" {...leavingBody}>
          <View style={styles.headerRow}>
            {/* The mark. The warm-gold halo is the CELEBRATE tone only (`completionTone`):
                a symptom log and a weight check get the same check with no gold, which
                is the shipped tone call (Principle 4 — we acknowledge a 2am vomit, we
                never congratulate it) and the visual half of the same rule the haptic
                layer enforces with its single soft tap. */}
            <View testID="named-card-check">
              <CompletionMark halo={arrival.haloMode !== 'off'} motion={arrival.mark} />
            </View>
            {/* One summary node: a screen reader speaks what was saved and where it
                went as a single announcement, not two orphan lines. The words land on
                their own beat; the node itself is never split. */}
            <Animated.View
              style={[styles.labelCol, { opacity: arrival.wordsOpacity }]}
              accessible
              accessibilityRole="summary"
              accessibilityLiveRegion={removed ? undefined : 'polite'}
              accessibilityLabel={headerLabel}
            >
              <ThemedText style={styles.title}>{sentence}</ThemedText>
              <ThemedText style={styles.subLabel}>{`Saved to ${petName}’s record`}</ThemedText>
            </Animated.View>
          </View>

          {/* Engines v3 PR-28b — a read this log raised to a call (§6 item 3). Above the
              action row, its own control; the opening goes through the shared helper so
              a card already over that record only steps aside. No motion of its own. */}
          {layFloor ? (
            <Animated.View style={{ opacity: arrival.bodyOpacity }}>
              <FloorRaiseLine
                line={layFloor}
                petName={petName}
                onOpen={() => {
                  if (inertNow(payload.eventId)) return;
                  openRaisedRead(raisedId, pathnameRef.current, hide);
                }}
              />
            </Animated.View>
          ) : null}

          {/* The action row — Undo left of Change time (round-2 mock). The ROW is
              unconditional now because Undo is; only Change time is gated, and it
              is absent rather than disabled (a dead control on a 5s card teaches
              the owner the app is broken). */}
          <Animated.View style={[styles.actionRow, { opacity: arrival.bodyOpacity }]}>
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
                onPress={() => {
                  if (inertNow(payload.eventId)) return;
                  setPickerOpen(true);
                }}
                hitSlop={HITSLOP_ACTION_RIGHT}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Change time of this log"
              >
                <ThemedText style={styles.actionText}>Change time</ThemedText>
              </TouchableOpacity>
            )}
          </Animated.View>
          </View>
          )}
          {noticeUp && notice ? (
            /* The removal line. No mark — a check over the word "Removed" would be
               two contradictory signals, and the quiet is the point. From the frame it
               mounts it is the card's only live region (Android speaks it here; iOS
               through the hook above). */
            <Animated.View
              style={[styles.labelCol, !bodyUp ? null : styles.noticeOverlay, { opacity: arrival.noticeOpacity }]}
              // `accessible` is load-bearing: without it the label never applies and
              // the two lines stay two separate stops (SheetLogBeat, CUL-682).
              accessible
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              accessibilityLabel={notice.a11yLabel}
            >
              <ThemedText style={styles.title}>{notice.title}</ThemedText>
              <ThemedText style={styles.subLabel}>{notice.detail}</ThemedText>
            </Animated.View>
          ) : null}
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
    // `bottom` is supplied at render (route-aware, see the header) — the shipped
    // tabs value lives in bottomOffset, not here, so there is one owner of it.
    left: theme.space2,
    right: theme.space2,
    zIndex: 50,
    elevation: 12,
  },
  // Opaque under its shadow (see the header): the shadow lives here, never on the
  // transparent wrapper, and the ground is the one the mark's check is knocked out in.
  card: {
    backgroundColor: COMPLETION_GROUND,
    paddingHorizontal: theme.space2,
    paddingVertical: 12,
    borderRadius: theme.radiusLarge,
    gap: theme.space1,
    ...shadows.lg,
  },
  body: {
    gap: theme.space1,
  },
  // Reduce Motion's true crossfade: "Removed" over the leaving body, in the card's
  // padding box, until the body goes and the height snaps.
  noticeOverlay: {
    position: 'absolute',
    top: 12,
    left: theme.space2,
    right: theme.space2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
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
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
  subLabel: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    fontWeight: theme.weightRegular,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colorBorderStrong,
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
    borderColor: theme.colorBorderStrong,
  },
  actionText: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    fontWeight: theme.weightMedium,
  },
});
