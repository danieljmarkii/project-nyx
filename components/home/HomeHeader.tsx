import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { petIdentityLine } from '../../lib/utils';
import { PetAvatar } from '../pet/PetAvatar';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';

// Home identity strip (B-076) — a thin orienting band above the Signal: a quiet
// "Project Nyx" wordmark + the active pet's avatar, name, and one slim line.
// Deliberately NOT a profile card (Principle 3): the AI Signal must keep leading
// and the full profile (sex/weight/conditions/diet trial) stays the Pet tab's
// job. The identity row is the switcher tap-target (multi-pet spec §3.1):
// tapping opens the switcher sheet. The chevron AFFORDANCE renders only when
// pets.length > 1 — single-pet households see no multi-pet chrome (Jordan's
// condition) — but the row stays tappable for everyone because the sheet is
// also the only "Add a pet" entry point (an owner's path to pet #2).
export function HomeHeader() {
  const { pets, activePet } = usePetStore();
  // Own the top safe-area inset so the white surface bleeds up behind the
  // status bar — otherwise the screen's grey bg shows above the strip.
  const insets = useSafeAreaInsets();

  const [switcherVisible, setSwitcherVisible] = useState(false);

  // Home only renders behind a created pet (usePet redirects to onboarding
  // otherwise), but guard anyway so a transient null never throws.
  if (!activePet) return null;

  const line = petIdentityLine(activePet);
  const multiPet = pets.length > 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.wordmark}>Project Nyx</Text>
      <TouchableOpacity
        style={styles.identityRow}
        onPress={() => setSwitcherVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={multiPet ? `Switch pet — ${activePet.name} active` : 'Your pets'}
      >
        <PetAvatar name={activePet.name} photoPath={activePet.photo_path} size={38} />
        <View style={styles.textColumn}>
          <Text style={styles.name} numberOfLines={1}>
            {activePet.name}
          </Text>
          {line ? (
            <Text style={styles.line} numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
        {multiPet && (
          <ChevronDown size={18} color={theme.colorTextSecondary} strokeWidth={1.75} />
        )}
      </TouchableOpacity>

      <PetSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    paddingHorizontal: theme.space2,
    // paddingTop is applied inline as insets.top + 10 so the white surface
    // fills the status-bar inset (no grey strip above the header).
    paddingBottom: 12,
  },
  // Quiet brand mark in the display face — identity, not a banner. "Project Nyx"
  // is a placeholder name; swaps out with no layout change when it's decided.
  wordmark: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingTight,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: theme.space1,
    // The whole row is the switcher tap zone — spec §3.1 mandates the 44pt
    // floor (the 38pt avatar alone would undershoot it).
    minHeight: 44,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  // Geist faces here (not bare fontWeight): RN doesn't synthesize weights for
  // custom fonts, so the weight lives in the family name (see lib/fonts.ts).
  // Header-scoped only — the app-wide Geist body rollout stays B-061.
  name: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
  },
  line: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
});
