import { useEffect, useRef, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { EmptyState } from '../ui/EmptyState';
import { usePetStore } from '../../store/petStore';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import type { MomentTone } from '../../store/momentStore';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import { useBetaOptIn } from '../../lib/betaFeatures';
import { GroupedEventGrid } from './EventTypePicker';
import { SimpleEventConfirm, SHEET_HEADER_DISC } from './SimpleEventConfirm';
import { summarizeLoggedRecord, type LoggedRecord } from '../../lib/completionCard';
import { SheetLogBeat } from './SheetLogBeat';
import { PetSwitcherPanel } from '../pet/PetSwitcherSheet';
import { PetAvatar } from '../pet/PetAvatar';
import { discardGuardCopy, type ConfirmDraft } from '../../lib/discardGuard';

// The "More events" destination as a bottom sheet over the current tab (B-745). The
// FAB opens this instead of pushing the full-screen /log picker when log_picker_v2
// is live; flag-off keeps the shipped push, byte-identical.
//
// PR 3 — the one-surface confirm. The sheet is now a three-stage flow:
//   'grid'    → the grouped picker (frame 1).
//   'confirm' → a simple event (symptom / stool / Other) completes IN PLACE via
//               SimpleEventConfirm — the picker never leaves the sheet, Home never
//               leaves the screen (frames 2–3). Meal / Medication / Weight still
//               route to their own screens (they have their own pickers).
//   'done'    → the completion beat lands in the sheet, then it closes.
// Presentation + step structure only (§1): the write goes through lib/simpleEvent,
// the same path the full-screen flow uses, so no data semantics change.
//
// Chrome matches SheetShell / PetSwitcherSheet so every sheet dims, grabs and rounds
// identically. The pet switcher lives on the grid title and renders PetSwitcherPanel
// as a LAYER INSIDE this Modal (CUL-662). It used to be a sibling <Modal>, which on
// iOS is the classic unreliable case — a second Modal presented while one is already
// up either fails to present or presents detached, leaving `switcherVisible` stuck
// true with nothing on screen and the sheet untappable until the app was killed. In
// the confirm/done stages there is no switcher — the pet is fixed at grid→confirm
// (SimpleEventConfirm names it), which IS write-time identity here since nothing can
// switch it mid-confirm (multi-pet §6).

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Stage = 'grid' | 'confirm' | 'done';

// Which types complete in the sheet vs. route to their own screen. Meal (food
// picker), Medication (med picker) and Weight (numeric) each need a dedicated flow;
// everything else is a one-surface simple event.
function routesOut(type: EventTypeKey): boolean {
  return type === 'meal' || type === 'medication' || type === 'weight_check';
}

export function EventTypeSheet({ visible, onClose }: Props) {
  const { pets, activePet } = usePetStore();
  const insets = useSafeAreaInsets();
  const [switcherVisible, setSwitcherVisible] = useState(false);

  // W1 taxonomy expansion (event_types_v2, CUL-675) — the B-712 two-gate shape,
  // exactly as the host sheet itself is gated: server allowlist × local opt-in,
  // both hooks called unconditionally (Rules of Hooks) then combined. This gates
  // the GRID'S TILE LIST only (the Breathing group's Cough/Sneeze tiles + the
  // ruled regroup); EVENT_TYPES itself is never flag-gated (§12 FL-1), so a
  // flag-off device still reads a beta device's cough rows fully labeled.
  const taxonomyEligible = useAllowlistFlag('event_types_v2');
  const taxonomyOptedIn = useBetaOptIn('event_types_v2');
  const expanded = taxonomyEligible && taxonomyOptedIn;

  const [stage, setStage] = useState<Stage>('grid');
  // The event being confirmed + the pet it writes to, captured at grid→confirm.
  const [confirm, setConfirm] = useState<{ type: EventTypeKey; petId: string; petName: string } | null>(null);
  const [beatTone, setBeatTone] = useState<MomentTone>('calm');
  // CUL-614 — what the beat SAYS, composed once from the record the confirm just
  // wrote. Held in state rather than recomputed on render so the sentence is fixed at
  // commit time: summarizeLoggedRecord resolves "today"/"yesterday" against a live
  // clock, and a beat that re-derived mid-dwell could change its own words at local
  // midnight. Null only before the first commit of a given open.
  const [beatSentence, setBeatSentence] = useState<string | null>(null);
  // CUL-612 — what the confirm currently holds, reported up by SimpleEventConfirm.
  // It lives HERE because the gestures that destroy it are this component's: a
  // backdrop tap and the Android back button both unmount the confirm, so the
  // child cannot intercept them on its own.
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);

  // Liveness: SimpleEventConfirm's write is async, so the owner can dismiss the sheet
  // (backdrop / Android back) while it's in flight. This ref lets handleLogged no-op
  // if that happened, so a write that resolves AFTER a dismiss can't flip a hidden
  // sheet to a stale 'done' beat that would then flash on the next open.
  const visibleRef = useRef(visible);

  // Every open starts at the grid. Reset when the sheet is dismissed (by any path —
  // backdrop, the completion beat's onClose, or the FAB) so a reopen never resurfaces
  // a stale confirm/beat.
  useEffect(() => {
    visibleRef.current = visible;
    // switcherVisible resets with the rest: every path that closes the sheet today
    // already lowers the switcher first, so this is symmetry rather than a live fix
    // — but a stray `true` surviving here would reopen the switcher over the grid on
    // the next open, and it belongs with the four resets it sits beside.
    if (!visible) {
      setStage('grid'); setConfirm(null); setBeatSentence(null); setDraft(null);
      setSwitcherVisible(false);
    }
  }, [visible]);

  // ── THE DISCARD GUARD (CUL-612, §5) ───────────────────────────────────────
  // Every dismissal that would throw away a half-filled confirm goes through
  // here. Two paths do: the backdrop tap and the Android back button. Both are
  // one gesture away from an attached photo the owner took of the thing itself,
  // and today both destroy it without a word.
  //
  // The BACK CHEVRON deliberately does not route through this. It is a labelled,
  // in-flow control whose whole purpose is "wrong type, take me back to the
  // grid" — the owner is choosing to leave, and a dialog on a deliberate choice
  // is friction, not a safety net. The guard is for the gestures that are easy
  // to hit by accident.
  //
  // Nothing to guard once the write has landed ('done'), and nothing to guard on
  // the grid — the tests pin both, because a guard that fires on a clean sheet
  // would put a dialog between the FAB and closing it.
  function requestClose() {
    const copy = stage === 'confirm' && draft ? discardGuardCopy(draft) : null;
    if (!copy) { onClose(); return; }
    Alert.alert(copy.title, copy.body, [
      // "Keep editing" first and non-destructive: the accidental tap is the
      // common case, so the default-weighted answer is the one that loses
      // nothing.
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }

  // Android back / the OS dismiss gesture. Now that the switcher is a layer inside
  // THIS Modal rather than its own, the Modal's onRequestClose is the only one there
  // is — so it has to peel the top layer first, or back would close the whole sheet
  // out from under an open switcher.
  function handleRequestClose() {
    if (switcherVisible) { setSwitcherVisible(false); return; }
    requestClose();
  }

  // No `petName` fallback here on purpose: the grid renders only WITH an active pet
  // (the stage-'grid' branch below), so a 'your pet' placeholder on this surface
  // would assert a state that can no longer reach it — CUL-681.
  const multiPet = pets.length > 1;

  function handleSelect(type: EventTypeKey) {
    if (routesOut(type)) {
      // Close the sheet, then hand off to the existing sub-flow. Write-time pet
      // identity holds: /log reads the store's active pet at write time.
      onClose();
      router.push(`/log?type=${type}`);
      return;
    }
    // A simple event — complete it in place. Capture the pet now (the confirm has no
    // switcher, so this is the pet the owner selected on the grid).
    const pet = usePetStore.getState().activePet;
    if (!pet) {
      // CUL-681. This used to call onClose(): the sheet vanished, nothing was
      // written and nothing was said — CUL-575's "a failed write is always said",
      // applied to a write that never starts. It now stays PUT, and the grid gate
      // below means there is no tile to tap without a pet in the first place, so
      // this is only the write-time re-read's answer for the instant between a
      // render and a tap. It is deliberately silent because the surface speaks for
      // itself: losing the pet re-renders the grid into the no-pet copy under the
      // owner's finger, which is the message.
      console.warn('[EventTypeSheet] tile tap with no active pet — nothing to write for');
      return;
    }
    setConfirm({ type, petId: pet.id, petName: pet.name });
    setStage('confirm');
  }

  function handleLogged(result: { eventId: string; occurredAtIso: string; record: LoggedRecord }) {
    // If the sheet was dismissed while the write was in flight, don't resurface — the
    // event is written and will appear on Home; showing a beat on a hidden/reopened
    // sheet would be a stale flash (the reset effect already returned it to the grid).
    if (!visibleRef.current) return;
    // Tone: never a festive beat over a symptom (Principle 4 / clinical-guardrails) —
    // the four symptom types get 'calm'; stool_normal and Other get 'celebrate'.
    const tone: MomentTone = confirm && SYMPTOM_TYPES.has(confirm.type) ? 'calm' : 'celebrate';
    setBeatTone(tone);
    // CUL-614 / §5's sentence rule — the R2 beat now speaks the record the same way
    // the R1 named card does, through the one composer (lib/completionCard →
    // lib/logCopy → describeOccurredAt). Until this, the sheet confirmed a "Found it"
    // vomit with the word "Logged": the app held the window it had just written and
    // said nothing about it, on the surface where the owner is least able to check.
    setBeatSentence(summarizeLoggedRecord(result.record, result.occurredAtIso));
    setStage('done');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <View style={styles.backdrop}>
        {/* Drop the scrim while the switcher layer is up: the panel brings its own,
            identical and in the same place, so the dim transfers with no visible
            change — and never doubles. During the completion beat the scrim stays but
            the beat auto-closes; an early dismiss tap is harmless (already written). */}
        {!switcherVisible && (
          <Pressable style={styles.scrim} onPress={requestClose} accessibilityLabel="Close" />
        )}
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          // Assistive-tech containment for the switcher layer. As a sibling Modal the
          // switcher got this from the platform; as a layer it does not, so the sheet
          // hides itself while the switcher is up — otherwise a screen reader walks
          // the event grid behind the scrim and can log for the pet being switched
          // away from. iOS is covered by the panel's own accessibilityViewIsModal;
          // this is the Android half, which has to come from out here.
          importantForAccessibility={switcherVisible ? 'no-hide-descendants' : 'auto'}
        >
          <View style={styles.grabber} />

          {/* ── THE GRID STAGE, GATED ON THERE BEING A PET (CUL-681) ────────────
              The grid does not render without an active pet, so there is no tile
              to tap into a vanish — the ruled shape (PM, 2026-08-29) is the issue's
              "a grid that does not accept taps at all", plus its line of copy.

              One gate closes both halves of the old defect. The in-sheet half was
              handleSelect's bare onClose(); the routes-out half never reached that
              guard at all — Meal/Medication/Weight closed the sheet and pushed
              /log, whose pickers are themselves gated on activePet, so the owner
              landed on an empty screen under a "What did your pet eat?" header.

              Not a rare state, either: the FAB mounts unconditionally in the tabs
              layout while pets hydrate from a NETWORK read (hooks/usePet.ts) that
              only runs once the session restores — so every cold start has a
              window, and on a failed double-read that hook leaves the store empty
              on purpose. The branch is reactive, so the grid replaces this copy the
              moment the rows land; no reopen. */}
          {stage === 'grid' && !activePet && (
            <EmptyState
              // Forward-looking, and true for each way an owner arrives here
              // (Principle 5 / nyx-voice P3). The order is the likelihood order: the
              // hydration read is the usual answer, a failed one is the next
              // ("check your connection" is the shipped idiom — lib/authErrors,
              // ArchivePetSheet), and the genuinely-petless account is last because
              // it is nearly unreachable (archiving a last pet is blocked). Telling
              // an owner who HAS a pet to add one would be the wrong instruction on
              // the common path, which is why adding one is the final clause rather
              // than the headline. No action button — CUL-678 keeps management rows
              // off a capture surface, and a push from inside a Modal renders BEHIND
              // it (CUL-662), so a door here would appear to do nothing.
              title="No pet to log for yet"
              body="Your pets load a moment after the app opens. If they don't, check your connection — or add a pet from the Pet tab."
              style={styles.noPet}
            />
          )}

          {stage === 'grid' && activePet && (
            <>
              <TouchableOpacity
                style={styles.titleRow}
                onPress={() => setSwitcherVisible(true)}
                disabled={!multiPet}
                activeOpacity={0.7}
                accessibilityRole={multiPet ? 'button' : undefined}
                accessibilityLabel={multiPet ? `Log for ${activePet.name} — switch pet` : undefined}
              >
                {/* CUL-679 — the pet's face leads the row, as it does everywhere else
                    the app names the active pet (Home header, the FAB's "Logging for"
                    chip, every row of the switcher the owner just tapped).

                    It matters HERE and not on Home because the eight tiles below are
                    pet-independent: nothing else on screen moves, so without this the
                    entire confirmation of a switch is four characters changing at the
                    top of the sheet, with the finger still resting where the switcher
                    row was. Two similarly-named pets and that fails a glance-check on
                    the one surface where the wrong answer writes a health row.

                    Rendered for a SINGLE-pet household too (R5-1, PM-ruled 2026-08-29).
                    Multi-pet §3.1 suppresses the CHEVRON below — the switch affordance
                    — not the pet's identity, and the Home header already draws the disc
                    for a one-pet account. It also keeps this row and the confirm's
                    header on the same leading disc, so stage 1 → stage 2 swaps the
                    disc's contents instead of sliding the title 38pt sideways.

                    Unguarded because the branch above narrows it: this row cannot
                    render without a pet. It used to carry its own `activePet &&`
                    check, because the title's `petName` fell back to "your pet" and
                    an avatar built from that renders a confident "Y" disc for a pet
                    that isn't there. CUL-681 removed the fallback rather than the
                    disc — the surface says what it means instead. */}
                <PetAvatar
                  name={activePet.name}
                  photoPath={activePet.photo_path}
                  size={SHEET_HEADER_DISC}
                />
                <ThemedText style={styles.title} numberOfLines={1}>
                  Log for {activePet.name}
                </ThemedText>
                {multiPet && (
                  <ChevronDown size={18} color={theme.colorTextSecondary} strokeWidth={1.75} />
                )}
              </TouchableOpacity>
              <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
                {/* species reads the store's active pet reactively, so a switch in
                    the panel above re-filters the grid before the next tap (§3). */}
                <GroupedEventGrid
                  onSelectType={handleSelect}
                  expanded={expanded}
                  species={activePet.species}
                />
              </ScrollView>
            </>
          )}

          {stage === 'confirm' && confirm && (
            <SimpleEventConfirm
              type={confirm.type}
              petId={confirm.petId}
              petName={confirm.petName}
              onBack={() => { setStage('grid'); setConfirm(null); setDraft(null); }}
              onLogged={handleLogged}
              onDraftChange={setDraft}
            />
          )}

          {/* `beatSentence` is set in the same handler that sets this stage, so the
              pair cannot separate; gating on it keeps the beat's required title
              honest without a fallback string that would re-open the bare-"Logged"
              door this PR closes. */}
          {stage === 'done' && beatSentence && confirm && (
            <SheetLogBeat
              tone={beatTone}
              title={beatSentence}
              // The pet captured at grid→confirm, NOT a re-read active pet: this
              // names the pet the row was actually written for, and the store's
              // active pet can have moved on by now (the multi-pet queue-then-switch
              // guard the completion payloads carry for the same reason).
              petName={confirm.petName}
              onDone={onClose}
            />
          )}
        </View>

        {/* The pet switcher, as the top LAYER of this Modal — never a second one.

            captureSurface (CUL-678) drops its "Add a pet" / "Archived pets" rows:
            this sheet exists to record something, and both of those leave it — the
            sheet closes, and "Add a pet" additionally makes the new pet active
            device-wide, so a mis-tap costs the log AND re-points the app. Both rows
            still live on the Home header and the Pet tab.

            onNavigateAway stays wired even though no row can now fire it. It is the
            contract for a Modal host that DOES show those rows — a pushed screen
            renders BEHIND an RN Modal, so without it the owner taps a navigating row
            and nothing appears to happen — and re-showing the rows here without
            re-adding this would bring CUL-662 back invisibly. It goes straight to
            onClose rather than requestClose: the switcher is only reachable from the
            grid title, so there is never a half-filled confirm to guard here. */}
        <PetSwitcherPanel
          visible={switcherVisible}
          animated
          captureSurface
          style={StyleSheet.absoluteFill}
          onClose={() => setSwitcherVisible(false)}
          onNavigateAway={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    maxHeight: '80%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
    minHeight: 44,
    paddingHorizontal: theme.space3,
  },
  title: {
    // The confirm header's headerText carries this for the same reason: with a
    // leading disc and a trailing chevron on the row, a long pet name would push
    // the chevron off the end rather than ellipsing itself. numberOfLines alone
    // does not shrink a Text inside a row — it needs somewhere to shrink to.
    flexShrink: 1,
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  gridScroll: {
    flexShrink: 1,
  },
  // The no-pet copy sits where the grid would (EmptyState's top-anchored 'inset'),
  // with the padding the eight tiles used to supply so the sheet does not collapse
  // to a sliver of text against its own rounded top.
  noPet: {
    // Overrides EmptyState's top-anchored 'inset' padding, which is sized to sit
    // below a screen header this sheet does not have — 64pt would leave the copy
    // floating off the grabber. The bottom pad stands in for what the eight tiles
    // used to give the sheet, so it does not collapse to a sliver of text.
    paddingTop: theme.space4,
    paddingBottom: theme.space3,
  },
});
