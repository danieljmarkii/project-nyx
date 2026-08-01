import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { fontMap } from '../lib/fonts';
import { supabase } from '../lib/supabase';
import {
  useAuthStore,
  loadPersistedRecoveryGate,
  releaseRecoveryGate,
} from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { initDb } from '../lib/db';
import { wipeLocalSession } from '../lib/session';
import {
  coldStartDecision,
  signedOutRoute,
  shouldAdoptSessionDuringRecovery,
} from '../lib/authRouting';
import { isAuthDeepLink } from '../lib/authDeepLink';
import { isRecoveryDeepLink } from '../lib/passwordRecovery';
import { handleRecoveryDeepLink } from '../lib/recoveryDeepLink';
import { PASSWORD_RECOVERY_ENABLED } from '../constants/flags';
import { purgeRetiredStorage } from '../lib/retiredStorage';
import { useSync } from '../hooks/useSync';
import { useSyncTimezone } from '../hooks/useSyncTimezone';
import { useWidgetSnapshots } from '../hooks/useWidgetSnapshots';
import { useAppActive } from '../hooks/useAppActive';
import { initAppConfig, refreshAppConfig } from '../hooks/useAppConfig';
import { MealCompletionCard } from '../components/ui/MealCompletionCard';
import { MedicationCompletionCard } from '../components/ui/MedicationCompletionCard';
import { CompletionMoment } from '../components/ui/CompletionMoment';
import { Snackbar } from '../components/ui/Snackbar';
import { ColdStartOverlay } from '../components/ColdStartOverlay';

// Hold the native splash until the font gate releases, so the first painted
// frame is already in the v1.2 faces — no system→custom flash, and no blank
// frame between the auto-hidden splash and the first render (the failure mode of
// a bare `return null` gate). Errors are swallowed: a splash-control hiccup must
// never block startup.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { setSession, setLoading } = useAuthStore();
  const { isOnboarded } = usePetStore();

  // Font-load gate: hold the tree until the v1.2 faces resolve so type never
  // flashes from system → custom on first paint. On a load error we render
  // anyway (system fallback) rather than brick the app on a font fetch.
  const [fontsLoaded, fontError] = useFonts(fontMap);

  useSync();
  // B-290: keep the App Group widget snapshots current — debounced re-publish on
  // event/pet-store changes + each hydration tick. Inert off iOS.
  useWidgetSnapshots();
  // B-085: keep user_profiles.timezone populated with the device zone so the
  // detection engine's detector ⑥ can run (engine input only — never surfaced).
  useSyncTimezone();

  // B-329: load the server-flippable app_config flags on start, then refresh on
  // every foreground (a PM flag flip reaches the client without a reinstall). Values
  // are render-only — every gate is re-checked server-side (B-252). Refresh is also
  // fired on sign-in below, since an unauthenticated fetch is RLS-denied.
  const appActive = useAppActive();
  const prevActive = useRef(appActive);
  useEffect(() => {
    initAppConfig().catch(() => {});
  }, []);
  useEffect(() => {
    if (appActive && !prevActive.current) refreshAppConfig().catch(() => {});
    prevActive.current = appActive;
  }, [appActive]);

  useEffect(() => {
    // B-301: drop the retired auth-probe log left on devices that ran builds
    // 33/34. Fire-and-forget — never gates startup.
    purgeRetiredStorage();

    initDb().catch(console.error);

    // Cold start FROM a recovery link (B-280 §6.4): the deep-link handler owns the
    // ENTIRE auth transition — provenance (FR-14), the gate (FR-6), and the
    // wipe-before-exchange (FR-7). Run it instead of the normal cold-start routing
    // so the two do not race on setSession / router.replace. `getLinkingURL()` is
    // synchronous, so this reads the launch URL without racing.
    if (isRecoveryDeepLink(Linking.getLinkingURL())) {
      // Keep isLoading TRUE until the handler has finished routing — releasing it
      // synchronously here would let a consumer of `isLoading` (e.g. the Landing's
      // auth CTAs) observe loading:false with no session and no recovery route yet
      // applied, flashing the login wall on the exact screen Jordan's "lands the
      // owner in the app" rule protects (code-reviewer). `.finally` covers success
      // and failure alike.
      void handleRecoveryDeepLink(Linking.getLinkingURL()).finally(() => setLoading(false));
    } else {
      void initColdStart();
    }

    async function initColdStart() {
      // Load the persisted FR-6 gate alongside getSession. A force-quit on the
      // set-password screen (§10 row 21) persists BOTH the recovery session and this
      // gate; without loading it, the restored session would fall through to Home
      // with the password still unchanged (Trap 1). Read in parallel so a normal
      // cold start pays only one round-trip of latency, not two.
      const [gateArmed, { data: { session }, error }] = await Promise.all([
        loadPersistedRecoveryGate(),
        supabase.auth.getSession(),
      ]);
      // The single most diagnostic moment: did the persisted session survive to this
      // cold start? We read `error` too — getSession returns null-WITH-error when the
      // token was within its expiry margin and the refresh network call FAILED
      // (offline/flaky on resume). That is NOT a sign-out; treating it as one is the
      // frequent-logout bug.
      const decision = coldStartDecision(session, error);

      if (gateArmed) {
        // Resume an interrupted reset (§10 row 21). The gate is the routing here.
        useAuthStore.getState().setRecoveryInProgress(true);
        if (session) {
          // A live recovery session behind the gate → the set-password form.
          setSession(session);
          router.replace('/(auth)/reset-password');
        } else if (decision === 'retain') {
          // A TRANSIENT refresh failure on resume (null-with-error) — the recovery
          // session is almost certainly still in storage, so do NOT release the gate
          // over a network blip. Keep it and let autoRefresh recover: TOKEN_REFRESHED
          // then arrives as SIGNED_IN and the FR-6 branch renders the form. Land on
          // the auth entry meanwhile (the recovery session guard holds the redirect).
          router.replace('/(auth)');
          supabase.auth.startAutoRefresh().catch(() => {});
        } else {
          // to-auth (null-without-error): the recovery session genuinely expired.
          // Nothing to resume — release the gate and route to auth rather than wedge
          // the owner on a formless set-password screen.
          await releaseRecoveryGate();
          router.replace('/(auth)');
        }
      } else if (decision === 'proceed') {
        // Writing the store is the routing: the Landing's session guard replaces to
        // the tabs the moment this write lands (the TestFlight login-every-launch fix).
        setSession(session);
      } else if (decision === 'to-auth') {
        // Genuinely no stored session (fresh install / cold start after a real
        // sign-out). The Signal-led Landing is the unauthenticated entry point.
        setSession(null);
        // …EXCEPT on a cold start FROM an auth link (B-432 confirmation; B-280
        // recovery). Those links have no session BY DEFINITION — establishing one is
        // their entire job — so the bounce would replace the route expo-router just
        // opened from the link. (A recovery link is handled above; this covers a
        // confirm link and is the general guard.)
        if (!isAuthDeepLink(Linking.getLinkingURL())) {
          router.replace('/(auth)');
        }
      } else {
        // retain — a transient refresh failure. Do NOT null the store: a good
        // session may already have arrived (or is about to) via INITIAL_SESSION or
        // the autoRefresh ticker; setSession(null) here would clobber it and tear
        // down sync. Force an immediate refresh retry instead (B-609 known limit: an
        // offline cold start waits on the Landing).
        supabase.auth.startAutoRefresh().catch(() => {});
      }
      // Release the initial-load gate only after the session decision above, so a
      // consumer of `isLoading` never observes loading:false with the session not
      // yet applied.
      setLoading(false);
    }

    // Warm deep links (app already running). `handleRecoveryDeepLink` ignores every
    // non-recovery link (the widget's `nyx:///history?…` / `nyx:///log?…`, a confirm
    // link), so attaching this unconditionally is safe and interferes with nothing.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleRecoveryDeepLink(url);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // FR-9 (B-054 Trust & Safety gate): a real sign-out is signalled ONLY by
      // SIGNED_OUT — auth-js emits it from _removeSession on every genuine removal
      // (explicit signOut, or a NON-retryable refresh failure), and never for a
      // transient one. So SIGNED_OUT is the sole authority for "route to auth":
      // routing on a bare `!session` used to bounce the owner on a transient
      // INITIAL_SESSION-with-no-session (the sibling of the cold-start bug above).
      if (event === 'SIGNED_OUT') {
        // FR-9 local teardown, extracted to lib/session so the post-deletion
        // fallback (DeleteAccountSheet) runs the identical sequence — one source
        // of truth for the wipe. Awaited so it completes before any subsequent
        // sign-in starts re-hydrating.
        await wipeLocalSession();
        setSession(null);
        const store = useAuthStore.getState();
        // B-280 §6.4 step 8: a SIGNED_OUT while the recovery gate is STILL armed is
        // the FR-15 reconcile signOut on a FAILED exchange. The recovery handler
        // owns that path's routing (it already showed the failure screen) AND the
        // gate release — so here we run ONLY the teardown, then defer. Routing or
        // releasing the gate here would race the handler. (The FR-7 wipe at step 4
        // fires NO event — it nulls the store directly — so it never reaches here.)
        if (store.recoveryInProgress) return;
        // FR-20 (§7.2.4): tell an INVOLUNTARY sign-out (a revoked refresh token — the
        // FR-18 eviction on another device) apart from a deliberate one, and land the
        // former on login with the §5.6b banner that names the likely cause without
        // asserting it. Deletion keeps its own B-039 banner. Gated on the recovery
        // flag inside signedOutRoute so PR 2 stays inert until enablement.
        const route = signedOutRoute({
          justDeletedAccount: store.justDeletedAccount,
          deliberateSignOut: store.deliberateSignOut,
          recoveryEnabled: PASSWORD_RECOVERY_ENABLED,
        });
        if (store.deliberateSignOut) store.setDeliberateSignOut(false); // consume the one-shot
        if (route.armBanner) store.setSignedOutInvoluntarily(true);
        router.replace(route.path);
        return;
      }
      // Only WRITE a session we actually have. A non-SIGNED_OUT event can still carry
      // a null session — auth-js's own INITIAL_SESSION emission does an independent
      // getSession and, on a transient refresh failure, invokes this callback with
      // (INITIAL_SESSION, null) — the sibling of the cold-start bug above. Since
      // SIGNED_OUT is the ONLY authoritative logout (handled above), nulling the
      // store on that transient null would clobber a good session racing in from the
      // getSession callback / autoRefresh and needlessly tear down sync. So set only
      // when present; otherwise leave the last-known session untouched.
      if (session) {
        // During the recovery exchange window, adopt ONLY the exchange's SIGNED_IN(B)
        // — never a TOKEN_REFRESHED re-emission of the pre-recovery owner A that
        // auth-js's autoRefresh can fire mid-flush (rls-privacy re-review). Inert
        // outside that window, so normal auth is untouched.
        if (!shouldAdoptSessionDuringRecovery(event, useAuthStore.getState().recoveryExchangePending)) {
          return;
        }
        setSession(session);
        // FR-6 / Trap 1: a recovery-exchange SIGNED_IN must land on set-password,
        // never fall through to Home. The Landing guard and the §6.5 tabs gate also
        // enforce this, but pinning it here routes the recovery session correctly the
        // instant it is adopted, regardless of which screen was foreground. Returns
        // before the config fetch — it runs after the reset completes and routes to
        // the tabs.
        if (useAuthStore.getState().recoveryInProgress) {
          router.replace('/(auth)/reset-password');
          return;
        }
        // Config's SELECT policy is `authenticated`, so a fetch only succeeds once a
        // session exists. This one listener covers every fetchable transition:
        // INITIAL_SESSION (cold start with a persisted session), SIGNED_IN, and
        // TOKEN_REFRESHED — so it's the single authoritative "on start"/sign-in fetch,
        // with no duplicate SELECTs from initAppConfig or the getSession callback.
        refreshAppConfig().catch(() => {});
      }
    });

    return () => {
      linkSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  // Auth init (above) runs in parallel while fonts resolve; only the rendered
  // tree waits. Fonts ready (or a load error → system fallback) releases the
  // gate and hides the native splash that's been held since module load.
  const fontGateReleased = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontGateReleased) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontGateReleased]);

  if (!fontGateReleased) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="log" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-capture" options={{ presentation: 'modal' }} />
        <Stack.Screen name="medication-capture" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="medication/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vet-visit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-pet" options={{ presentation: 'modal' }} />
        <Stack.Screen name="archived-pets" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-event" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="vet-document/[id]" />
        <Stack.Screen name="ask" />
        <Stack.Screen name="report" />
        <Stack.Screen name="rundown" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/feedback" />
      </Stack>
      <MealCompletionCard />
      <MedicationCompletionCard />
      <CompletionMoment />
      <Snackbar />
      <ColdStartOverlay />
    </>
  );
}
