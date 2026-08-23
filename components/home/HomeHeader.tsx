import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { ThemedText } from '../ui/ThemedText';
import { PetAvatar } from '../pet/PetAvatar';
import { OwnerAvatar } from '../settings/OwnerAvatar';
import { PetSwitcherSheet } from '../pet/PetSwitcherSheet';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import {
  ASK_BORDER,
  ASK_DOT_GAP,
  ASK_DOT_SIZE,
  ASK_PADDING_X,
  ASK_PILL_LABEL,
  HEADER_AVATAR_GAP,
  HEADER_AVATAR_SIZE,
  HEADER_CHEVRON_GAP,
  HEADER_CHEVRON_SIZE,
  HEADER_OWNER_AVATAR_SIZE,
  HEADER_PADDING_X,
  HEADER_RIGHT_GAP,
  headerNameBudget,
  headerSwitcherLabel,
  resolveHeaderName,
} from '../../lib/headerName';

// The Home header (CUL-600; app-polish spec §2 DP-2, rulings D3 + D4).
//
// H2a: ONE row, and the pet's photo leads it —
//
//     [photo] [Name ▾]                              [Ask] [you]
//
// What left, and why it is not coming back:
//
//   · the wordmark and the CulpritMark — D3. The brand keeps Landing, the loading
//     system and the night surfaces; Home belongs to the pet. The PM's own reason is
//     the whole argument: "when my wife saw Nyx's photo she was delighted."
//   · the mark's `live` PULSE and the teal "new signal" dot — D4. A cue that needs
//     explaining has failed ("not understanding it"), and the cross-cutting rule it
//     settled is absolute: NO LOOPING ANIMATION IN APP CHROME, EVER. "Something new"
//     is announced by CONTENT — the Signal card's live rail and the arrival moment —
//     never by chrome. Do not reintroduce a badge, dot, pulse or shimmer here.
//   · the breed · age identity line, and the second row it sat on. The identity line
//     lives on the Pet tab; deleting the row is what lifts the Signal ~50pt up the
//     page, which is the point of the whole change (Principle 3 — the Signal leads).
//   · the mark's jump-to-Signal tap, which retired with the mark. The standard
//     affordance replaces it: re-tapping the Home tab scrolls to top, wired in
//     app/(tabs)/index.tsx (spec §2 SHOULD).
//
// What stayed: the left cluster is the pet-switcher target at the 44pt floor (the
// sheet is also the only "Add a pet" door, so it stays tappable for one-pet
// households — they just see no chevron, and therefore no multi-pet chrome at all).
// The Ask pill and the owner-avatar doorway are unchanged (B-228 D5 placement).

/** Vertical padding, per side. The row is deliberately tight — it is chrome. */
const HEADER_PADDING_Y = 6;
/** The switcher's tap floor. Larger than the 30pt photo, which is why it is stated. */
const HEADER_ROW_MIN_HEIGHT = 44;

/**
 * The header's height BELOW the safe-area inset, derived from its parts rather than
 * stated as a literal — a stated total is a number that goes stale the first time a
 * part moves (the CUL-599 tab-bar lesson, which cost three files holding a copy of a
 * height that had changed).
 *
 * Exported so the shrink the ruling promises is asserted rather than eyeballed: the
 * two-row header this replaced measured 106pt by the same arithmetic.
 */
export const HOME_HEADER_CONTENT_HEIGHT = HEADER_ROW_MIN_HEIGHT + HEADER_PADDING_Y * 2;

export function HomeHeader() {
  const { pets, activePet } = usePetStore();
  // The owner email seeds the account-avatar monogram (§D10). Home renders only
  // behind a live session, so it's populated whenever this strip is on screen.
  const email = useAuthStore((s) => s.user?.email);
  // Own the top safe-area inset so the white surface bleeds up behind the
  // status bar — otherwise the screen's grey bg shows above the strip.
  const insets = useSafeAreaInsets();
  // The Ask entry (B-228 D5) — header chrome, not a card (Principle 3). Visible iff the
  // experimental flag resolves on for this caller (fail-closed; allowlist-gated until
  // Track-3). It NEVER changes/badges/disables when capped — Home carries no monetization
  // state; the capped experience lives inside the surface (D5). Render-only; the server
  // re-checks the flag authoritatively on every ask call.
  const askEnabled = useAllowlistFlag('ask_enabled');
  // The name's rung is a function of the ROW's width, so it re-resolves on rotation
  // and on a foldable rather than baking in the width the app happened to launch at.
  const { width } = useWindowDimensions();

  const [switcherVisible, setSwitcherVisible] = useState(false);

  // Home only renders behind a created pet (usePet redirects to onboarding
  // otherwise), but guard anyway so a transient null never throws.
  if (!activePet) return null;

  const multiPet = pets.length > 1;
  // 17pt → 16pt → tail-ellipsis (spec §2). Deliberately NOT the Pet tab's ladder —
  // both are written down in the spec so neither is re-derived from the other, and
  // lib/headerName.ts carries the reason they differ.
  const name = resolveHeaderName(activePet.name, headerNameBudget({ windowWidth: width, multiPet, askEnabled }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + HEADER_PADDING_Y }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.identityCluster}
          onPress={() => setSwitcherVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          // ALWAYS the pet's full name, at every rung — the half of the ladder that
          // makes an ellipsis floor acceptable: the name is never lost, only
          // unrendered.
          accessibilityLabel={headerSwitcherLabel(activePet.name, multiPet)}
        >
          <PetAvatar
            name={activePet.name}
            photoPath={activePet.photo_path}
            size={HEADER_AVATAR_SIZE}
          />
          <ThemedText
            style={[styles.name, { fontSize: name.fontSize }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            // Deliberately NOT the tab bar's `allowFontScaling={false}`. The ladder
            // there fits a name at a known size into a box that CANNOT grow, so a
            // scaled label would overflow the tab the ladder had just fitted it to.
            // Here the row grows and the ladder's floor is already a tail, so a
            // scaled name degrades exactly the way the ruling says it should. The
            // name is the one thing on this row an owner may need larger.
          >
            {activePet.name}
          </ThemedText>
          {multiPet && (
            <ChevronDown
              size={HEADER_CHEVRON_SIZE}
              color={theme.colorTextSecondary}
              strokeWidth={1.75}
              style={styles.chevron}
            />
          )}
        </TouchableOpacity>

        <View style={styles.rightCluster}>
          {askEnabled ? (
            <TouchableOpacity
              onPress={() => router.push('/ask')}
              style={styles.askPill}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Ask about ${activePet.name}`}
            >
              <View style={styles.askDot} />
              <ThemedText style={styles.askLabel}>{ASK_PILL_LABEL}</ThemedText>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="You — account and settings"
          >
            <OwnerAvatar email={email} size={HEADER_OWNER_AVATAR_SIZE} />
          </TouchableOpacity>
        </View>
      </View>

      <PetSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colorSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colorBorder,
    // The geometry tokens come from lib/headerName.ts, which is also what the name's
    // width budget subtracts — the budget and the rendered row are the same fact, and
    // splitting them is how a name starts fitting the arithmetic instead of the row.
    paddingHorizontal: HEADER_PADDING_X,
    // paddingTop is applied inline as insets.top + HEADER_PADDING_Y so the white
    // surface fills the status-bar inset (no grey strip above the header).
    paddingBottom: HEADER_PADDING_Y,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: HEADER_ROW_MIN_HEIGHT,
  },
  // Photo + name + chevron: one tap target, the 44pt floor from the row above it.
  // `flexShrink` + `minWidth: 0` are what let the NAME absorb a narrow frame (and
  // tail) instead of pushing the Ask pill off the row.
  identityCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    minHeight: HEADER_ROW_MIN_HEIGHT,
  },
  // Explicit margins rather than a container `gap`: the photo→name and name→chevron
  // gaps are different numbers, and they are the same numbers the budget subtracts.
  name: {
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginLeft: HEADER_AVATAR_GAP,
    flexShrink: 1,
  },
  chevron: {
    marginLeft: HEADER_CHEVRON_GAP,
  },
  // The right cluster: the Ask pill sits beside the owner avatar (D5 — "beside the
  // avatar"). It never shrinks; the name absorbs a narrow frame instead.
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_RIGHT_GAP,
    flexShrink: 0,
  },
  // The Ask pill (mock §1 option A): the word + a quiet Signal-teal dot in a bordered
  // pill. Chrome, never a card. Teal here is the interactive accent (a tappable entry),
  // so the one-accent rule holds.
  askPill: {
    flexDirection: 'row',
    alignItems: 'center',
    // Every dimension the name's width budget subtracts, rendered from the same
    // constant it subtracts — see askPillWidth() in lib/headerName.ts.
    gap: ASK_DOT_GAP,
    borderWidth: ASK_BORDER,
    borderColor: theme.colorBorderStrong,
    borderRadius: theme.radiusFull,
    paddingHorizontal: ASK_PADDING_X,
    paddingVertical: 5,
    backgroundColor: theme.colorSurface,
  },
  askDot: {
    width: ASK_DOT_SIZE,
    height: ASK_DOT_SIZE,
    borderRadius: ASK_DOT_SIZE / 2,
    backgroundColor: theme.colorAccent,
  },
  askLabel: {
    fontWeight: theme.weightSemibold,
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
  },
});
