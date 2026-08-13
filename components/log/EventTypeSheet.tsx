import { useEffect, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
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

  // Every open starts at the grid. Reset when the sheet is dismissed (by any path —
  // backdrop, the completion beat's onClose, or the FAB) so a reopen never resurfaces
  // a stale confirm/beat.
  useEffect(() => {
    if (!visible) { setStage('grid'); setConfirm(null); }
  }, [visible]);

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
    // Tone: never a festive beat over a symptom (Principle 4 / clinical-guardrails) —
    // the four symptom types get 'calm'; stool_normal and Other get 'celebrate'.
    const tone: MomentTone = confirm && SYMPTOM_TYPES.has(confirm.type) ? 'calm' : 'celebrate';
    setBeatTone(tone);
    setStage('done');
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          {/* Drop the scrim while the nested switcher is up (Android bleed-through
              guard, matching the FAB). During the completion beat the scrim stays but
              the beat auto-closes; an early dismiss tap is harmless (already written). */}
          {!switcherVisible && (
            <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
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
                onBack={() => { setStage('grid'); setConfirm(null); }}
                onLogged={handleLogged}
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
