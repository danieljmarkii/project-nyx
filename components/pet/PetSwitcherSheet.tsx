import { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { openMenu as openMenuHaptic } from '../../lib/haptics';
import { petIdentityLine } from '../../lib/utils';
import { PetAvatar } from './PetAvatar';

interface PetSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  // The host exists to CAPTURE (the log sheet's title, the FAB menu's "Logging
  // for" chip) rather than to manage the household. Drops the two management rows
  // — see the rule on the panel below. Named for what the HOST is, not for what it
  // hides, so a new host declares itself and inherits the rule instead of
  // re-deciding it.
  captureSurface?: boolean;
}

interface PetSwitcherPanelProps extends PetSwitcherSheetProps {
  // Fired alongside onClose when a row LEAVES this surface (Add a pet / Archived
  // pets). A host that is itself a Modal must use this to dismiss too: an RN
  // Modal renders above the whole app window, so a pushed screen would otherwise
  // land invisibly behind it — the owner taps "Add a pet" and nothing happens.
  //
  // No row fires this under captureSurface, since the only rows that leave are the
  // ones it hides. It stays wired on those hosts anyway: it is the contract for a
  // Modal host that shows the rows, and a future one that arrives without it
  // rediscovers CUL-662 invisibly.
  onNavigateAway?: () => void;
  // Animate the panel in. Off for the Modal wrapper below (the Modal already
  // slides); on for an in-Modal layer, which has no presentation of its own.
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ROW_AVATAR = 36;
// A layer arriving ON TOP of an already-open sheet, not from the screen edge, so it
// rises one spacing step rather than its own height — which also means it never needs
// a measured height it does not have at first paint. Off the spacing scale rather
// than a bare number so the rise keeps the app's rhythm if that scale ever moves.
const RISE = theme.space3;

// The switcher's CONTENT — scrim + sheet, with no Modal of its own.
//
// Split out from PetSwitcherSheet by CUL-662. EventTypeSheet is ITSELF a <Modal>,
// and presenting a second RN Modal from inside a presented one is the classic
// unreliable iOS case: the inner Modal fails to present (or presents detached),
// its `visible` state sticks true with nothing on screen, and the wedged invisible
// layer leaves the sheet untappable until the app is killed. That is the reported
// defect — the pet switcher froze the beta log sheet for every multi-pet account.
// HomeHeader and the FAB present from the root with nothing already up, so they
// keep the Modal wrapper below unchanged; EventTypeSheet renders this panel as a
// layer inside its own Modal instead. One Modal, no sibling presentation.
//
// The surface itself is the multi-pet spec §3.1 / mock A2: "Your pets" with one
// row per active pet (tap switches + dismisses — selection is device-local, spec
// §2), then "Add a pet", then a quiet "Archived pets" link that renders only when
// at least one archived pet exists.
//
// THE MANAGEMENT ROWS ARE HOST-DEPENDENT (CUL-678, PM ruling D1 = A / D2 = i).
// On the Home header and the Pet tab they are right: that is the household's
// roster, edited from a screen about the household, and adding a pet then landing
// on that pet is coherent. On a CAPTURE surface they are account admin standing
// where the owner came to record something, and both of them leave — the host
// closes, and "Add a pet" additionally makes the new pet active device-wide
// (`app/add-pet.tsx` → `addPet(data, { select: true })`). So one mis-tap two taps
// from a vomit log costs the log, and if the form is completed it silently
// re-points every surface in the app at a different pet.
//
// The rule hides ADMIN, never a pet: the switcher still answers the one question
// its title asks. Nothing is removed from the app either — every household keeps a
// route to both destinations from the Home header, and a second from the Pet tab
// (CUL-618 shipped that door, which is what made this deletable at all; before it,
// `/add-pet` and `/archived-pets` were reachable from this file alone).
export function PetSwitcherPanel({
  visible, onClose, onNavigateAway, captureSurface = false, animated = false, style,
}: PetSwitcherPanelProps) {
  const { pets, activePet, selectPet } = usePetStore();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [hasArchived, setHasArchived] = useState(false);

  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(animated ? 0 : 1)).current;

  // ENTRY only, and only when this panel has no Modal to animate it. Dismissal is
  // deliberately instant: the panel unmounts on the same tick as the tap, so "the
  // switcher closed" stays a synchronous fact rather than one waiting on a frame
  // callback, and the thing the selection just changed — the title underneath, now
  // naming the new pet — is revealed immediately instead of behind a fade.
  //
  // The reset on the way OUT is what makes a re-open look like the first one. The
  // panel stays MOUNTED between opens — the host renders it unconditionally and gates
  // on `visible` — so `anim` survives a close still holding 1. A passive effect runs
  // AFTER paint, so without this the second open would paint one frame at the END
  // state before the effect snapped it back to replay: a visible jump on every open
  // after the first, and none on the first, which is what makes it easy to miss.
  // `setValue` stops any animation in flight, so an interrupted entry lands here too.
  //
  // The SCRIM does not animate. It stands in for the host's own scrim (which the
  // host drops while this is up, so the dim never doubles); fading it would dip the
  // dim to zero and flash the undimmed screen at the moment of transfer.
  useEffect(() => {
    if (!animated) return;
    anim.setValue(0);
    if (!visible) return;
    Animated.timing(anim, {
      toValue: 1,
      // Matches SheetLogBeat, the other layer that arrives inside a sheet.
      duration: reducedMotion ? 0 : theme.durationFast, // reduced motion → the static frame
      useNativeDriver: true,
    }).start();
  }, [animated, visible, reducedMotion, anim]);

  // The store only holds ACTIVE pets, so the archived-pets link needs its own
  // (cheap, head-only) count. Fetched per open; any failure just hides the
  // link — a quiet entry point degrading to quiet absence, never an error.
  //
  // Skipped entirely on a capture surface: the link is the only consumer, so with
  // it hidden this would be a network round-trip whose answer nothing can read —
  // and one made at the moment the owner is trying to log something.
  useEffect(() => {
    if (!visible || !user || captureSurface) return;
    let cancelled = false;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('pets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', false);
        if (error) throw error;
        if (!cancelled) setHasArchived((count ?? 0) > 0);
      } catch (e) {
        console.warn('[PetSwitcherSheet] archived count failed:', e);
        if (!cancelled) setHasArchived(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user, captureSurface]);

  function handleSelect(petId: string) {
    // Light impact, NOT a commit pattern: switching pets writes nothing to the record.
    openMenuHaptic();
    selectPet(petId);
    onClose();
  }

  function handleAddPet() {
    onClose();
    onNavigateAway?.();
    router.push('/add-pet');
  }

  function handleArchived() {
    onClose();
    onNavigateAway?.();
    router.push('/archived-pets');
  }

  if (!visible) return null;

  return (
    // accessibilityViewIsModal: as a Modal this was implicit — iOS makes a presented
    // modal's siblings inert for VoiceOver. As a LAYER it is not, so it is declared,
    // or a screen reader would still walk the event grid sitting behind the scrim.
    // Its Android counterpart is the host hiding its own content while this is up
    // (EventTypeSheet does), because that side has to be done from outside.
    <View style={[styles.backdrop, style]} accessibilityViewIsModal>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + theme.space2 },
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }] },
        ]}
      >
        <View style={styles.grabber} />
        <ThemedText style={styles.header}>Your pets</ThemedText>

        <ScrollView style={styles.list} bounces={false}>
          {pets.map((pet) => {
            const selected = pet.id === activePet?.id;
            const line = petIdentityLine(pet);
            return (
              <TouchableOpacity
                key={pet.id}
                style={[styles.petRow, selected && styles.petRowSelected]}
                onPress={() => handleSelect(pet.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Switch to ${pet.name}`}
              >
                <PetAvatar name={pet.name} photoPath={pet.photo_path} size={ROW_AVATAR} />
                <View style={styles.petText}>
                  <ThemedText style={styles.petName} numberOfLines={1}>{pet.name}</ThemedText>
                  {line ? (
                    <ThemedText style={styles.petLine} numberOfLines={1}>{line}</ThemedText>
                  ) : null}
                </View>
                {selected && (
                  <Check size={18} color={theme.colorAccent} strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* The management rows — see the rule above the component. Both are absent
            on a capture host, so nothing in the sheet can leave the surface the
            owner is mid-log on. */}
        {!captureSurface && (
          <TouchableOpacity
            style={styles.addRow}
            onPress={handleAddPet}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={styles.addDisc}>
              <Plus size={16} color={theme.colorTextTertiary} strokeWidth={1.75} />
            </View>
            <ThemedText style={styles.addLabel}>Add a pet</ThemedText>
          </TouchableOpacity>
        )}

        {!captureSurface && hasArchived && (
          <TouchableOpacity
            onPress={handleArchived}
            activeOpacity={0.7}
            accessibilityRole="button"
            // The link is deliberately quiet (textXS); the padding keeps the
            // tap target at the 44pt floor anyway.
            style={styles.archivedLinkWrap}
          >
            <ThemedText style={styles.archivedLink}>Archived pets</ThemedText>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// The switcher as its own presentation, for hosts that are NOT already inside a
// Modal — the home header, the Pet tab (CUL-618), and the FAB menu (an in-tree
// overlay, not a Modal). The CUL-662 split only moved the content out so
// EventTypeSheet can render it without a second presentation; presentation here is
// unchanged.
//
// Which host it is still matters, though, and the wrapper is not a shortcut past
// that: the FAB menu passes captureSurface and the other two do not. Presenting from
// the root and managing the household are independent facts, so the prop is
// forwarded rather than assumed either way.
export function PetSwitcherSheet({ visible, onClose, captureSurface }: PetSwitcherSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <PetSwitcherPanel visible={visible} onClose={onClose} captureSurface={captureSurface} />
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
    paddingHorizontal: theme.space2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  // Type sizes bumped one token step from the mock-lifted values after
  // on-device QA read them as too small (PM, 2026-06-12).
  header: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  // Cap so a many-pet household scrolls inside the sheet instead of pushing
  // "Add a pet" off-screen.
  list: {
    maxHeight: 320,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: theme.radiusSmall,
    minHeight: 48,
  },
  petRowSelected: {
    backgroundColor: theme.colorAccentLight,
  },
  petText: {
    flex: 1,
    minWidth: 0,
  },
  petName: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  petLine: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    marginTop: 6,
    minHeight: 48,
  },
  addDisc: {
    width: 30,
    height: 30,
    borderRadius: theme.radiusFull,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colorBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  archivedLinkWrap: {
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  archivedLink: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
  },
});
