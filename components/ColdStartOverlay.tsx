import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';

// B-054 §6 — block-only-when-empty cold-start state.
//
// Shown ONLY while the first hydration after login is populating a genuinely
// empty local store (new device / reinstall / account switch after the sign-out
// wipe). It exists so a freshly-logged-in device never shows a bare, empty
// timeline that reads as data loss — the exact moment that kicked off B-054 (the
// PM's wife logging into the shared account on a second phone and seeing nothing).
//
// Gated on an active pet so it can never flash over onboarding: a brand-new
// account also starts with an empty local store, but has no pet yet, so this
// stays hidden and the normal "Nothing logged yet" empty states take over once
// the (instant) empty hydration resolves. Once local has data, foreground/
// reconnect re-syncs reconcile silently — coldStartHydrating is never set, so
// this never appears on a returning device.
//
// Tradeoff (accepted): the headline copy REQUIRES the pet name, so there is no
// meaningful version of this overlay before usePet resolves the pet. On an
// existing account the pet is read live from Supabase (it already crosses
// devices today, §2) and lands fast — typically alongside the hydration — so the
// pre-pet window where Home briefly shows its own designed empty/loading zones is
// short and is NOT the misleading "populated-but-empty timeline" that B-054 was
// built to fix. We accept that brief window rather than render a nameless
// "Catching up on 's history…".
export function ColdStartOverlay() {
  const coldStartHydrating = useSyncStore((s) => s.coldStartHydrating);
  const activePet = usePetStore((s) => s.activePet);

  if (!coldStartHydrating || !activePet) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <ActivityIndicator color={theme.colorAccent} />
      <Text style={styles.title}>Catching up on {activePet.name}'s history…</Text>
      <Text style={styles.subtitle}>Restoring everything you've logged. This only takes a moment.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Above the Stack and the Toast layers (zIndex 50) — nothing should paint
    // over the cold-start state while it's up.
    zIndex: 100,
    backgroundColor: theme.colorNeutralLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space4,
    gap: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
