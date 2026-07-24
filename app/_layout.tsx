import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { fontMap } from '../lib/fonts';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { initDb } from '../lib/db';
import { wipeLocalSession } from '../lib/session';
import { logAuth } from '../lib/authDebug';
import { coldStartDecision } from '../lib/authRouting';
import { APP_BUILD, PLATFORM } from '../lib/appInfo';
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
    // Diagnostic breadcrumb marking the start of this launch, so the on-device
    // log is grouped per process lifetime (build + platform for cross-device
    // correlation). See lib/authDebug.ts — temporary auth-persistence probe.
    logAuth('launch', { build: APP_BUILD, platform: PLATFORM });

    initDb().catch(console.error);

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // The single most diagnostic moment: did the persisted session survive to
      // this cold start? Crucially we now read `error` too — getSession returns
      // null-WITH-error when the token was within its expiry margin and the refresh
      // network call FAILED (offline/flaky on resume). That is NOT a sign-out, and
      // treating it as one — the old `if (!session)` bounce — is the frequent-logout
      // bug: a returning owner with a perfectly good refresh token still sitting in
      // encrypted storage got kicked to the login wall over a network blip.
      const decision = coldStartDecision(session, error);
      logAuth('coldstart.getSession', {
        hasSession: !!session,
        hadError: !!error,
        decision,
        expiresInSec:
          session?.expires_at != null
            ? session.expires_at - Math.floor(Date.now() / 1000)
            : null,
      });
      if (decision === 'proceed') {
        setSession(session);
      } else if (decision === 'to-auth') {
        // Genuinely no stored session (fresh install / cold start after a real
        // sign-out). The Signal-led Landing (app/(auth)/index) is the unauthenticated
        // entry point (B-251 PR 5) — a returning-but-logged-out owner taps "Log in"
        // from there. A live session skips straight past auth; the usePet hook (in
        // the tabs layout) then fetches the pet and redirects to onboarding if none.
        setSession(null);
        router.replace('/(auth)');
      } else {
        // retain — a transient refresh failure. Keep the owner in the app (their
        // local data is intact, offline-first) instead of bouncing to login, and
        // crucially do NOT null the store: a good session may already have arrived
        // (or is about to) via INITIAL_SESSION or the autoRefresh ticker auth-js
        // starts on init, and setSession(null) here would clobber it and needlessly
        // tear down sync (useSync keys on `session`). Leave the store as-is and force
        // an immediate refresh retry so recovery isn't gated on the next ~30s tick;
        // a real logout would instead arrive as SIGNED_OUT and route from the
        // listener below.
        supabase.auth.startAutoRefresh().catch(() => {});
      }
      // Release the initial-load gate only after the session decision above, so a
      // consumer of `isLoading` never observes loading:false with the session not
      // yet applied.
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Diagnostic breadcrumb: every auth transition (INITIAL_SESSION, SIGNED_IN,
      // TOKEN_REFRESHED, SIGNED_OUT). A SIGNED_OUT that is NOT the user's own tap
      // is the fingerprint of the bug — the app deciding the session is gone.
      logAuth('authchange', {
        event,
        hasSession: !!session,
        expiresInSec:
          session?.expires_at != null
            ? session.expires_at - Math.floor(Date.now() / 1000)
            : null,
      });
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
        // Route to the new Landing on sign-out (B-251 PR 5) — EXCEPT a just-deleted
        // account, which goes to login so the B-039 "your account has been deleted"
        // confirmation banner (armed on the auth store, shown on the login screen)
        // still surfaces immediately instead of behind the Landing's swipe cards.
        const justDeleted = useAuthStore.getState().justDeletedAccount;
        router.replace(justDeleted ? '/(auth)/login' : '/(auth)');
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
        setSession(session);
        // Config's SELECT policy is `authenticated`, so a fetch only succeeds once a
        // session exists. This one listener covers every fetchable transition:
        // INITIAL_SESSION (cold start with a persisted session), SIGNED_IN, and
        // TOKEN_REFRESHED — so it's the single authoritative "on start"/sign-in fetch,
        // with no duplicate SELECTs from initAppConfig or the getSession callback.
        refreshAppConfig().catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
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
        <Stack.Screen name="ask" />
        <Stack.Screen name="report" />
        <Stack.Screen name="rundown" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/feedback" />
        <Stack.Screen name="settings/diagnostics" />
      </Stack>
      <MealCompletionCard />
      <MedicationCompletionCard />
      <CompletionMoment />
      <Snackbar />
      <ColdStartOverlay />
    </>
  );
}
