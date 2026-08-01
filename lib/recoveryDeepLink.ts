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
//   6/7. On success the exchange fires SIGNED_IN; the FR-6 branch in
//      `onAuthStateChange` routes to the set-password form. Nothing to do here.
//   8. On failure (FR-15): set the failure state, then a REAL `signOut()` — the
//      B-576 reconcile that purges A's tokens auth-js still holds after step 4
//      nulled only the store — then release the gate. Safe here precisely because
//      the exchange already failed, so no live PKCE flow remains to break.

import { router } from 'expo-router';
import { supabase } from './supabase';
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
// re-entry for the same URL is refused synchronously. The §5.6 "Try again" does NOT
// route back through here — it calls `retryRecoveryExchange` directly — so this
// guard never blocks a deliberate retry.
let lastHandledUrl: string | null = null;

/**
 * Steps 5–8: exchange the code, then finalize. Assumes the gate is ARMED and local
 * data is already wiped (or empty). Shared by the full handler and the §5.6 retry.
 */
async function runExchangeAndFinalize(code: string): Promise<void> {
  const store = useAuthStore.getState();
  let outcome: RecoveryExchangeOutcome;
  try {
    // The verifier is intact (step 4 did NOT signOut), so B's session arrives onto
    // the clean device the wipe just produced.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    outcome = classifyExchangeOutcome(error);
  } catch (e) {
    // exchangeCodeForSession throws (not just returns { error }) on the local
    // verifier-absent shape; classify the thrown message the same way. Never log the
    // code/verifier/URL (FR-17) — only the classification is logged, elsewhere.
    outcome = classifyExchangeOutcome({
      message: e instanceof Error ? e.message : 'exchange failed',
    });
  }

  if (outcome === 'success') {
    // step 6/7: the SIGNED_IN from the exchange sets the session; the FR-6 branch in
    // onAuthStateChange routes to the set-password form (session + gate). No signOut
    // here — the exchange already replaced A's tokens with B's in auth-js storage.
    return;
  }

  // step 8 (FR-15): render the designed failure state, then reconcile.
  store.setRecoveryScreen(outcome);
  try {
    // The B-576 reconcile: step 4 nulled the STORE but left A's tokens in auth-js's
    // own persisted storage, so a failed exchange leaves autoRefresh able to restore
    // A onto the just-wiped device. A real signOut purges them. Its SIGNED_OUT is
    // handled teardown-only by app/_layout while the gate is armed (routing + the
    // gate release are owned here, to avoid a route/release race).
    //
    // `scope: 'local'` is load-bearing: the default is 'global', which would revoke
    // A's sessions on EVERY device A owns — but a failed exchange (an expired or
    // scanner-consumed link, D8's routine blameless cases) must only purge THIS
    // device's copy of A's tokens, never evict A elsewhere for an event that never
    // happened (code-reviewer).
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[recovery] reconcile sign-out failed:', e instanceof Error ? e.message : e);
  }
  // Release the gate LAST (§6.4 step 8). reset-password keeps rendering the failure
  // state from `recoveryScreen`, which the gate release does not touch.
  await releaseRecoveryGate();
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

  // step 3: arm the gate (disk then memory), null the STORE session, then route to
  // the working state. Nulling the session BEFORE the route is load-bearing: the
  // set-password form renders on (session && recoveryInProgress), and on a WARM deep
  // link A's live session is still in the store — so routing to the form while it is
  // non-null would let a "Save and continue" tap DURING the step-4 flush window write
  // B's new password onto A's account (Trap 2, caught by code-reviewer). With the
  // session null, reset-password shows the working spinner until B's session arrives
  // from the exchange, so the form is never reachable against A's session. Nulling
  // the STORE (not auth-js) does not touch the flush, which drains A's queue under
  // auth-js's own still-valid session at step 4.
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

/**
 * The §5.6 "Try again" for a `failed` (transport/server) exchange: re-attempt the
 * exchange with the same code, WITHOUT re-checking provenance (step 4's wipe has
 * already cleared the marker) or re-wiping (local is already clean). Re-arms the
 * gate so a success routes to the form, then runs steps 5–8.
 */
export async function retryRecoveryExchange(code: string): Promise<void> {
  await armRecoveryGate();
  useAuthStore.getState().setRecoveryScreen(null);
  router.replace(RECOVERY_ROUTE);
  await runExchangeAndFinalize(code);
}

// Test seam only: reset the double-fire guard between cases.
export function __resetRecoveryDedupeForTest(): void {
  lastHandledUrl = null;
}
