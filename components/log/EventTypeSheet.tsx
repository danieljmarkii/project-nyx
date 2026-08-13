import { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { EventTypeKey } from '../../constants/eventTypes';
import { GroupedEventGrid } from './EventTypePicker';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';

// The "More events" destination as a bottom sheet over the current tab (B-745 PR 2,
// round-4 mock frame 1 — "B-007's destination half"). The FAB opens this instead of
// pushing the full-screen /log picker when log_picker_v2 is live; flag-off keeps the
// shipped push, byte-identical. Presentation only (§1): picking a type routes into
// the EXISTING sub-flow via /log?type=, so the write path, EVENT_TYPES and the
// route-param handler are all unchanged.
//
// Chrome matches SheetShell / PetSwitcherSheet / ScopeMenu so every sheet in the app
// dims, grabs and rounds identically. The pet switcher lives on the title (mock:
// "Log for {pet} ▾") and reuses PetSwitcherSheet, rendered as a SIBLING Modal (not
// nested) so the two transparent Modals stack predictably on both platforms — the
// switcher presents over the sheet, and closing it returns here.

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EventTypeSheet({ visible, onClose }: Props) {
  const { pets, activePet } = usePetStore();
  const insets = useSafeAreaInsets();
  const [switcherVisible, setSwitcherVisible] = useState(false);

  const petName = activePet?.name ?? 'your pet';
  // Multi-pet chrome only for multi-pet households (Jordan's single-pet condition
  // sees a plain, non-interactive title) — the app-wide switcher rule (HomeHeader,
  // the FAB "Logging for" chip).
  const multiPet = pets.length > 1;

  function handleSelect(type: EventTypeKey) {
    // Close the sheet, then hand off to the existing sub-flow. stool_normal /
    // diarrhea land on the 'simple' step through the route-param path, so the
    // deleted sub-step is bypassed by construction (no data-semantics change).
    // Write-time pet identity holds: /log reads the store's active pet at write
    // time, so a switch made here lands the event on the pet named in the title
    // (multi-pet spec §6; QA spine #5).
    onClose();
    router.push(`/log?type=${type}`);
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          {/* Drop the sheet's own scrim while the nested switcher is up: on Android a
              scrim-dismiss tap on the switcher can bleed through to this full-screen
              Pressable and close the sheet underneath it. The FAB guards its backdrop
              the same way for the same PetSwitcherSheet-over-a-trigger shape
              (FAB.tsx `{open && !switcherVisible && …}`). The switcher's own scrim
              carries the dim while it's up, so the surface stays visually continuous. */}
          {!switcherVisible && (
            <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
          )}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
            <View style={styles.grabber} />
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
            {/* flexShrink lets the grid scroll within the capped sheet at large
                accessibility font sizes; at the default size the grid fits and the
                ScrollView is content-sized (no scroll). */}
            <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
              <GroupedEventGrid onSelectType={handleSelect} />
            </ScrollView>
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
    // The grid's tiles carry their own horizontal inset (groupedContent padding),
    // so the sheet only rounds + tops; matching SheetShell's edge treatment.
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
    // The title is the switcher tap zone for multi-pet accounts — hold the 44pt
    // floor even though the text alone is shorter.
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
