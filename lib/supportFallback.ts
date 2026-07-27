import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSnackbarStore } from '../store/snackbarStore';

// The shared "there's no mail client on this device" fallback for both support
// paths (B-298, spec §4.5). Contact support (app/settings.tsx) and the Share-
// feedback composer (app/settings/feedback.tsx) each used to inline their own
// copy of this alert; §4.5 promises a *copyable*-address fallback, and an
// address rendered in an Alert body is not selectable on iOS — the owner could
// read it and then had to retype it by hand. Lives here rather than in
// lib/support.ts because that module is deliberately pure (no I/O); this one
// owns the clipboard write and the alert, so the two callers share one
// behaviour and one voice instead of drifting apart.

// The dwell is short — this is a neutral confirmation, not a reversible action
// with an Undo to reach for, so it doesn't need the store's 5s default.
const COPIED_SNACKBAR_MS = 2600;

// Let the alert's dismiss animation finish before the snackbar slides up, so the
// two surfaces don't overlap on iOS (the same reason snackbarStore has delayMs).
const COPIED_SNACKBAR_DELAY_MS = 250;

// Write the support address to the clipboard and confirm it landed. Returns
// whether the write succeeded so callers/tests can assert on it; the owner-facing
// outcome is the snackbar (success) or the honest alert (failure) — never silence.
export async function copySupportAddress(email: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(email);
    // Names the thing that was copied rather than a bare "Copied" — the owner is
    // about to paste it somewhere and should be able to see what they've got.
    useSnackbarStore.getState().show(
      { message: `Copied ${email}` },
      { delayMs: COPIED_SNACKBAR_DELAY_MS, durationMs: COPIED_SNACKBAR_MS },
    );
    return true;
  } catch (e) {
    console.warn('[Support] copy address failed:', e);
    // Failing quietly would leave the owner believing they have the address.
    // Re-state it so the fallback still ends with a way to reach us.
    Alert.alert("Couldn't copy", `You can still reach us at ${email}.`);
    return false;
  }
}

// §4.5 — never fail silently: show the address, and make it one tap to keep.
export function showNoMailFallback(email: string): void {
  Alert.alert('No mail app found', `You can reach us at ${email}.`, [
    { text: 'Close', style: 'cancel' },
    // Not awaited: Alert's onPress is sync, and copySupportAddress handles its own
    // failure path. void keeps the floating promise explicit rather than implied.
    { text: 'Copy address', onPress: () => void copySupportAddress(email) },
  ]);
}
