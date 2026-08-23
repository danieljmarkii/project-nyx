import { useEffect, useRef, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../../constants/eventTypes';
import type { MomentTone } from '../../store/momentStore';
import { GroupedEventGrid } from './EventTypePicker';
import { SimpleEventConfirm } from './SimpleEventConfirm';
import { SheetLogBeat } from './SheetLogBeat';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';
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
// identically. The pet switcher lives on the grid title and reuses PetSwitcherSheet
// as a SIBLING Modal (not nested). In the confirm/done stages there is no switcher —
// the pet is fixed at grid→confirm (SimpleEventConfirm names it), which IS write-time
// identity here since nothing can switch it mid-confirm (multi-pet §6).

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

  const [stage, setStage] = useState<Stage>('grid');
  // The event being confirmed + the pet it writes to, captured at grid→confirm.
  const [confirm, setConfirm] = useState<{ type: EventTypeKey; petId: string; petName: string } | null>(null);
  const [beatTone, setBeatTone] = useState<MomentTone>('calm');
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
    if (!visible) { setStage('grid'); setConfirm(null); setDraft(null); }
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

  const petName = activePet?.name ?? 'your pet';
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
    if (!pet) { onClose(); return; } // no pet to write for — nothing to confirm
    setConfirm({ type, petId: pet.id, petName: pet.name });
    setStage('confirm');
  }

  function handleLogged() {
    // If the sheet was dismissed while the write was in flight, don't resurface — the
    // event is written and will appear on Home; showing a beat on a hidden/reopened
    // sheet would be a stale flash (the reset effect already returned it to the grid).
    if (!visibleRef.current) return;
    // Tone: never a festive beat over a symptom (Principle 4 / clinical-guardrails) —
    // the four symptom types get 'calm'; stool_normal and Other get 'celebrate'.
    const tone: MomentTone = confirm && SYMPTOM_TYPES.has(confirm.type) ? 'calm' : 'celebrate';
    setBeatTone(tone);
    setStage('done');
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
        <View style={styles.backdrop}>
          {/* Drop the scrim while the nested switcher is up (Android bleed-through
              guard, matching the FAB). During the completion beat the scrim stays but
              the beat auto-closes; an early dismiss tap is harmless (already written). */}
          {!switcherVisible && (
            <Pressable style={styles.scrim} onPress={requestClose} accessibilityLabel="Close" />
          )}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
            <View style={styles.grabber} />

            {stage === 'grid' && (
              <>
                <TouchableOpacity
                  style={styles.titleRow}
                  onPress={() => setSwitcherVisible(true)}
                  disabled={!multiPet}
                  activeOpacity={0.7}
                  accessibilityRole={multiPet ? 'button' : undefined}
                  accessibilityLabel={multiPet ? `Log for ${petName} — switch pet` : undefined}
                >
                  <Text style={styles.title} numberOfLines={1}>
                    Log for {petName}
                  </Text>
                  {multiPet && (
                    <ChevronDown size={18} color={theme.colorTextSecondary} strokeWidth={1.75} />
                  )}
                </TouchableOpacity>
                <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
                  <GroupedEventGrid onSelectType={handleSelect} />
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

            {stage === 'done' && (
              <SheetLogBeat tone={beatTone} onDone={onClose} />
            )}
          </View>
        </View>
      </Modal>

      <PetSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
    </>
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
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  gridScroll: {
    flexShrink: 1,
  },
});
