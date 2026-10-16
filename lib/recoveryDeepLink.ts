// The password-recovery deep-link handler (B-280 FR-4/5/6/7/14/15, spec §6.4).
//
// This is the orchestration the spec puts "inside the handler" — the impure
// counterpart to the pure `lib/passwordRecovery.ts`. It is kept OUT of
// `app/_layout.tsx` so the ordering that took two review rounds and a B-576
// correction to get right (option (d)) is a unit-testable function with injected
// I/O, not a branch buried in the root layout's effect. `app/_layout.tsx` only
// wires it to the cold-start launch URL and the warm `Linking` event.
//
// THE ORDERING (§6.4 option (d)), and why each step is where it is:
//   1. Classify the URL shape (FR-4). A non-`valid` shape never touches auth state.
//   2. Require local provenance (FR-14) and HOLD the email in memory. Refuse a link
//      this device never asked for — `nyx:///reset-password?code=x` is firable by
//      any app or webpage, so an unvouched-for URL must never arm the gate.
//   3. Arm the gate (disk then memory, FR-6) and route to the recovery screen.
//   4. `setSession(null)` + `wipeLocalSession()`, invoked DIRECTLY — NOT via
//      `supabase.auth.signOut()`, which deletes the PKCE `code-verifier` the
//      exchange needs (B-576). Nulling the STORE session stands the session-keyed
//      producers (`useSync`, `useWidgetSnapshots`) down exactly as SIGNED_OUT does,
//      because they key on `useAuthStore` — so A's data can't re-publish onto B's
//      device after the wipe (the F1 blocker). The verifier survives.
//   5. `exchangeCodeForSession` — onto a clean device, with the verifier intact.
//   6/7. On success, adopt EXACTLY the session the exchange returned and route to
//      the set-password form. The root listener adopts nothing in the window
//      (CUL-1205), so this is the one writer, whatever auth-js names the event.
//   8. On failure (FR-15): set the failure state, then a REAL `signOut()` — the
//      B-576 reconcile that purges A's tokens auth-js still holds after step 4
//      nulled only the store — then release the gate. Safe here precisely because
//      the exchange already failed, so no live PKCE flow remains to break. A
//      sign-out that fails is checked, and the keychain is purged directly.

import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, supabase } from './supabase';
import { ChunkedSecureStoreAdapter } from './secureStore';
import { flushForSignOut, wipeLocalSession } from './session';
import {
  useAuthStore,
  armRecoveryGate,
  releaseRecoveryGate,
} from '../store/authStore';
import { readRecoveryRequest, hasLocalProvenance } from './recoveryMarker';
import {
  parseRecoveryLink,
  classifyExchangeOutcome,
  RecoveryExchangeOutcome,
} from './passwordRecovery';

const RECOVERY_ROUTE = '/(auth)/reset-password' as const;

// Guards a cold-start launch URL and a warm `url` event from BOTH processing the
// same single-use link — the second attempt would find the code spent and wipe the
// device for a `link_unusable`. Set at ENTRY (before any await) so a concurrent
// re-entry for the same URL is refused synchronously. There is no same-code retry to
// let through (CUL-1888): auth-js deletes the verifier on any failed exchange.
let lastHandledUrl: string | null = null;

/**
 * Steps 5–8: exchange the code, then finalize. Assumes the gate is ARMED and local
 * data is already wiped (or empty).
 */
async function runExchangeAndFinalize(code: string): Promise<void> {
  const store = useAuthStore.getState();
  let outcome: RecoveryExchangeOutcome;
  let exchanged: Session | null = null;
  try {
    // The verifier is intact (step 4 did NOT signOut), so B's session arrives onto
    // the clean device the wipe just produced.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    outcome = classifyExchangeOutcome(error);
    exchanged = data?.session ?? null;
  } catch (e) {
    // exchangeCodeForSession throws (not just returns { error }) on the local
    // verifier-absent shape; classify the thrown message the same way. Never log the
    // code/verifier/URL (FR-17) — only the classification is logged, elsewhere.
    outcome = classifyExchangeOutcome({
      message: e instanceof Error ? e.message : 'exchange failed',
    });
  }

  if (outcome === 'success') {
    if (!exchanged) {
      // auth-js returns a session on every success; a success without one has nothing
      // to adopt, so it fails forward to "send a new link" rather than spinning until
      // the watchdog (the verifier is already spent, so a retry cannot work).
      await failAndReconcile('link_unusable');
      return;
    }
    // The store must never say B while auth-js holds someone else: every write the
    // form makes goes out under auth-js's session, not the store's. `signInWithPassword`
    // takes no auth-js lock, so a sign-in for A (the Change password re-auth, a login
    // from the watchdog's Back to log in) can land after the exchange saved B
    // (rls-privacy-reviewer, reproduced against auth-js 2.105.4). Adopt only when the
    // stored session IS the returned one; otherwise fail and reconcile.
    if (!(await authHolds(exchanged))) {
      await failAndReconcile('failed');
      return;
    }
    // step 6/7 (CUL-1205): adopt EXACTLY the session the exchange returned. auth-js
    // emitted it as PASSWORD_RECOVERY while the exchange ran, and the root listener
    // refused it along with everything else in the window, so this is the only write
    // that can put a session in the store before the window closes. Matching on the
    // returned object, not an event name, is what keeps A out (O2). The gate is still
    // armed, so the session lands on the set-password form, never on Home. The user is
    // pinned for the save, which must write to this account and no other.
    store.setRecoveryUserId(exchanged.user.id);
    store.setSession(exchanged);
    store.setRecoveryExchangePending(false);
    // Clear any failure state a slow-exchange watchdog may have set on the screen, so
    // a late success renders the form rather than a stale "failed".
    store.setRecoveryScreen(null);
    // supabase-js hands realtime a new token only on SIGNED_IN / TOKEN_REFRESHED, never
    // on PASSWORD_RECOVERY, so B's channels would join with whatever token A last left
    // there and RLS would deliver them nothing.
    supabase.realtime.setAuth(exchanged.access_token).catch((e: unknown) =>
      console.warn('[recovery] realtime token swap failed:', e instanceof Error ? e.message : e));
    // FR-6 / Trap 1: pin the route, whichever screen is foreground.
    router.replace(RECOVERY_ROUTE);
    return;
  }
  await failAndReconcile(outcome);
}

/**
 * End a reset that cannot finish, the FR-15 way: the designed failure state, a local
 * sign-out of whatever auth-js holds (purged from the keychain if that fails), and the
 * gate released. The set-password save calls it when auth-js no longer holds the
 * recovery user (CUL-1205), so a refused write never leaves an armed gate behind.
 */
export async function abandonRecovery(
  outcome: Exclude<RecoveryExchangeOutcome, 'success'>,
): Promise<void> {
  await failAndReconcile(outcome);
}

async function failAndReconcile(
  outcome: Exclude<RecoveryExchangeOutcome, 'success'>,
): Promise<void> {
  const store = useAuthStore.getState();
  // step 8 (FR-15): render the designed failure state, then reconcile. The adoption
  // window is OPEN through the reconcile (opened here for the save's caller, already
  // open for the handler's): signOut first loads the session, which refreshes a
  // near-expiry token and emits TOKEN_REFRESHED, and with the window closed the
  // listener adopted it (rls-privacy-reviewer, reproduced). It closes below, once the
  // tokens are gone.
  store.setRecoveryExchangePending(true);
  store.setRecoveryScreen(outcome);
  // The B-576 reconcile: step 4 nulled the STORE but left A's tokens in auth-js's own
  // persisted storage, so a failed exchange leaves autoRefresh able to restore A onto
  // the just-wiped device. A real signOut purges them. Its SIGNED_OUT is handled
  // teardown-only by app/_layout while the gate is armed (routing + the gate release
  // are owned here, to avoid a route/release race).
  //
  // `scope: 'local'` is load-bearing: the default is 'global', which would revoke A's
  // sessions on EVERY device A owns — but a failed exchange (an expired or
  // scanner-consumed link, D8's routine blameless cases) must only purge THIS device's
  // copy of A's tokens, never evict A elsewhere for an event that never happened
  // (code-reviewer).
  //
  // CUL-1205 O3: even `scope: 'local'` POSTs /logout first, and auth-js hands a network
  // or 5xx failure back as a RESOLVED `{ error }` without removing the session, so
  // offline A's tokens stayed and came back on the next refresh. Check the result as
  // well as a throw, and on either do the storage half of auth-js's own
  // `_removeSession` (the CUL-1461 teardown DeleteAccountSheet uses): auth-js keeps no
  // in-memory copy, so with the keychain entries gone nothing can restore A.
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) await purgePersistedAuthSession(error);
  } catch (e) {
    await purgePersistedAuthSession(e);
  }
  // A purge fires no SIGNED_OUT, so nothing else nulls the store. Null it here, so no
  // session of A's can outlive its tokens, then close the window so a later resume is
  // adopted normally, and drop A's token from realtime.
  store.setSession(null);
  store.setRecoveryExchangePending(false);
  supabase.realtime.setAuth().catch((e: unknown) =>
    console.warn('[recovery] realtime token reset failed:', e instanceof Error ? e.message : e));
  // Release the gate LAST (§6.4 step 8). reset-password keeps rendering the failure
  // state from `recoveryScreen`, which the gate release does not touch.
  await releaseRecoveryGate();
}

// Whether auth-js's own stored session belongs to the user the exchange returned. By
// user, not token: a refresh between the exchange and this read (a skewed clock) is
// still B. A read that fails counts as no: the caller then reconciles, the safe way.
async function authHolds(session: Session): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === session.user.id;
  } catch (e) {
    console.warn('[recovery] stored-session check failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function purgePersistedAuthSession(cause: unknown): Promise<void> {
  console.warn(
    '[recovery] reconcile sign-out failed; purging the stored session:',
    cause instanceof Error ? cause.message : (cause as { message?: string } | null)?.message ?? cause,
  );
  // `removeItem` swallows its own keychain errors, so a failed delete only shows as the
  // key still being there. Read it back, and try once more before giving up loudly.
  // `getItem` swallows read errors too (reads null), so a keychain failing on BOTH
  // reads and deletes still passes this check (CUL-1975).
  for (let attempt = 0; attempt < 2; attempt++) {
    await ChunkedSecureStoreAdapter.removeItem(AUTH_STORAGE_KEY);
    await ChunkedSecureStoreAdapter.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
    if ((await ChunkedSecureStoreAdapter.getItem(AUTH_STORAGE_KEY)) === null) return;
  }
  console.warn('[recovery] stored session still present after purge');
}

/**
 * Handle an incoming recovery deep link (cold start OR warm). Idempotent for a
 * repeated identical URL; drives the whole §6.4 ordering.
 *
 * `nowMs` is injected for the provenance-window check (testability); defaults to the
 * wall clock.
 */
export async function handleRecoveryDeepLink(
  url: string | null | undefined,
  opts: { nowMs?: number } = {},
): Promise<void> {
  const { nowMs = Date.now() } = opts;
  const link = parseRecoveryLink(url);
  // Not a recovery link at all (a widget deep link, a confirm link, anything else) —
  // ignore it. NEVER treat it as a broken recovery attempt.
  if (link.kind === 'unrelated') return;

  const key = url ?? '';
  if (key === lastHandledUrl) return;
  lastHandledUrl = key;

  const store = useAuthStore.getState();

  // step 1: a non-`valid` shape never touches auth state. An error/malformed link
  // has no code to exchange, so it renders §5.5 directly. Pre-fill from the marker
  // if one exists (a real owner whose link expired) — this path does NOT wipe, so
  // the marker is still there to read.
  if (link.kind === 'error' || link.kind === 'malformed') {
    const marker = await readRecoveryRequest();
    store.setRecoveryEmail(marker?.email ?? null);
    store.setRecoveryScreen('link_unusable');
    router.replace(RECOVERY_ROUTE);
    return;
  }

  // step 2: provenance (FR-14). A `valid`-shaped link with no local request marker
  // is a wrong-device open (Sam's household iPad, §5.5b) or a hostile deep link
  // (§10 row 23). Refuse: no gate, no wipe, no exchange — render §5.5b and stop.
  const marker = await readRecoveryRequest();
  if (!marker || !hasLocalProvenance(marker, nowMs)) {
    store.setRecoveryEmail(null);
    store.setRecoveryScreen('wrong_device');
    router.replace(RECOVERY_ROUTE);
    return;
  }
  // Hold the email in memory NOW — step 4's wipe clears the disk marker, and a
  // failure state's pre-fill must come from this value, not a re-read (FR-12).
  store.setRecoveryEmail(marker.email);

  // step 3: open the exchange window, arm the gate (disk then memory), null the STORE
  // session, then route to the working state. Nulling the session BEFORE the route is
  // load-bearing: the set-password form renders on (session && recoveryInProgress),
  // and on a WARM deep link A's live session is still in the store — so routing to the
  // form while it is non-null would let a "Save and continue" tap DURING the step-4
  // flush window write B's new password onto A's account (Trap 2, caught by
  // code-reviewer). With the session null, reset-password shows the working spinner
  // until B's session arrives from the exchange. `recoveryExchangePending` closes the
  // sibling window the rls re-review found — auth-js's autoRefresh re-emitting A as a
  // `TOKEN_REFRESHED` during the flush and the root listener re-adopting it; while it
  // is set the listener adopts nothing, and the exchange's own return is adopted by
  // `runExchangeAndFinalize` (CUL-1205).
  // Nulling the STORE (not auth-js) does not touch the flush, which drains A's queue
  // under auth-js's own still-valid session at step 4.
  store.setRecoveryExchangePending(true);
  await armRecoveryGate();
  store.setRecoveryScreen(null);
  useAuthStore.getState().setSession(null);
  router.replace(RECOVERY_ROUTE);

  // step 4: flush (best-effort, so a co-resident's unsynced queue is not destroyed
  // by the wipe — B-430) then wipe. NO signOut (that deletes the verifier).
  await flushForSignOut().catch((e) =>
    console.warn('[recovery] pre-wipe flush failed:', e instanceof Error ? e.message : e));
  await wipeLocalSession();

  // steps 5–8.
  await runExchangeAndFinalize(link.code);
}

// Test seam only: reset the double-fire guard between cases.
export function __resetRecoveryDedupeForTest(): void {
  lastHandledUrl = null;
}
