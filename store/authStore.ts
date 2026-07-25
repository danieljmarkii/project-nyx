import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  // Transient one-shot flag (B-039 FR-12): set just before the post-deletion
  // signOut so the auth screen can show a brief "account deleted" confirmation
  // after the SIGNED_OUT wipe routes there. Survives setSession(null) (it isn't
  // touched here) and the petStore.reset() in the SIGNED_OUT handler (different
  // store); the login screen reads it once on mount and clears it.
  justDeletedAccount: boolean;
  // The recovery gate (B-280 FR-6). True from just before the recovery-code
  // exchange until the new password is written (or the attempt is abandoned).
  //
  // WHY IT LIVES HERE rather than in the set-password screen: the recovery
  // session arrives through `onAuthStateChange`, which fires from
  // `app/_layout.tsx` — ABOVE every screen. A screen-local flag cannot suppress
  // the root listener's routing, and a cold start with a persisted recovery
  // session would bypass a screen-local guard entirely. Same shape and lifecycle
  // as `justDeletedAccount` above, so it follows that precedent rather than
  // inventing a second pattern for flags that outlive an auth transition.
  //
  // WHAT IT PREVENTS (spec §0.3 Trap 1): a recovery session is just… a session.
  // The root listener adopts any session unconditionally, so without this gate the
  // owner lands on Home with their password still unchanged and unknown — the
  // reset silently didn't happen, and the next cold start strands them again.
  recoveryInProgress: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setJustDeletedAccount: (justDeletedAccount: boolean) => void;
  // In-memory only. Callers that need the gate to survive a force-quit must use
  // `armRecoveryGate` / `releaseRecoveryGate` below, which write disk too.
  setRecoveryInProgress: (recoveryInProgress: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  justDeletedAccount: false,
  recoveryInProgress: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
  setJustDeletedAccount: (justDeletedAccount) => set({ justDeletedAccount }),
  setRecoveryInProgress: (recoveryInProgress) => set({ recoveryInProgress }),
}));

// ── The gate's disk half (FR-6) ─────────────────────────────────────────────────
//
// The gate MUST be persisted, not merely in-memory. The recovery *session* is
// persisted (SecureStore, `persistSession: true`), so an in-memory-only gate means
// a jetsam kill / force-quit / crash on the set-password screen resumes straight
// into the tabs with the password unchanged — the F3 merge blocker, and the exact
// Trap-1 failure the gate exists to prevent (§10 row 21).
//
// AsyncStorage matches the shipped precedent for device-local auth-adjacent state
// (`nyx.activePetId`, store/petStore.ts). It carries a boolean, not a secret.
const RECOVERY_GATE_KEY = 'nyx.recoveryInProgress';

/**
 * Arm the gate: disk FIRST, then memory.
 *
 * The order is the whole point. A crash between the two writes leaves the gate ON
 * (fail-closed → the owner is held on set-password) rather than OFF (fail-open →
 * straight into the tabs with an unchanged password).
 */
export async function armRecoveryGate(): Promise<void> {
  try {
    await AsyncStorage.setItem(RECOVERY_GATE_KEY, '1');
  } catch (e) {
    // Non-fatal: the in-memory gate below still holds this session. What is lost
    // is only survival across a force-quit, and the recovery session itself
    // expires — so the degraded case is a stranded owner who must request a new
    // link, never an ungated one.
    console.warn('[authStore] failed to persist recovery gate:', e);
  }
  useAuthStore.getState().setRecoveryInProgress(true);
}

/**
 * Release the gate (FR-15) — cleared on EVERY terminal path, success or not.
 *
 * Clearing only on success wedges the app in the gate, and once the flag is
 * persisted that becomes a permanent lockout: every relaunch routes back to
 * set-password with no valid recovery session to complete it. Hence the `finally`
 * in §6.4 step 9.
 *
 * Memory is cleared even if the disk clear fails, so a storage error can never be
 * the thing that traps an owner in the flow.
 */
export async function releaseRecoveryGate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECOVERY_GATE_KEY);
  } catch (e) {
    console.warn('[authStore] failed to clear persisted recovery gate:', e);
  }
  useAuthStore.getState().setRecoveryInProgress(false);
}

/**
 * Read the persisted gate at cold start, before any routing decision.
 *
 * A read failure returns `false`, and that is NOT a fail-open compromise — it is
 * the only defensible reading. A throw here is a storage-layer failure, which
 * means the arming write in `armRecoveryGate` almost certainly failed too, so
 * `true` would be a guess with no evidence behind it. And the cost of guessing
 * wrong is asymmetric the other way: an owner who never touched recovery would be
 * routed to set-password with no recovery session to complete, take the FR-16
 * escape, sign in again, and hit the same dead end on the next launch — an
 * app-breaking loop for someone the gate was never about. The gate's real
 * protection is the write having landed, which is the normal case.
 */
export async function loadPersistedRecoveryGate(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(RECOVERY_GATE_KEY)) === '1';
  } catch (e) {
    console.warn('[authStore] failed to read persisted recovery gate:', e);
    return false;
  }
}
