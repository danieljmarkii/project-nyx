import { useEffect } from 'react';
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
import { useSync } from '../hooks/useSync';
import { useSyncTimezone } from '../hooks/useSyncTimezone';
import { MealCompletionCard } from '../components/ui/MealCompletionCard';
import { MedicationCompletionCard } from '../components/ui/MedicationCompletionCard';
import { CompletionMoment } from '../components/ui/CompletionMoment';
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
  // B-085: keep user_profiles.timezone populated with the device zone so the
  // detection engine's detector ⑥ can run (engine input only — never surfaced).
  useSyncTimezone();

  useEffect(() => {
    initDb().catch(console.error);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) {
        // The Signal-led Landing (app/(auth)/index) is the unauthenticated entry
        // point (B-251 PR 5) — a returning-but-logged-out owner taps "Log in" from
        // there. A live session skips straight past auth; the usePet hook (in the
        // tabs layout) then fetches the pet and redirects to onboarding if none.
        router.replace('/(auth)');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // FR-9 (B-054 Trust & Safety gate): wipe the local pet-data copy on an
      // explicit sign-out before routing away. Gated on the SIGNED_OUT event
      // specifically — NOT on a null session generally — so a transient token
      // refresh can never destroy local data. Awaited so the wipe completes
      // before any subsequent sign-in starts re-hydrating.
      if (event === 'SIGNED_OUT') {
        // FR-9 local teardown, extracted to lib/session so the post-deletion
        // fallback (DeleteAccountSheet) runs the identical sequence — one source
        // of truth for the wipe. Awaited so it completes before any subsequent
        // sign-in starts re-hydrating.
        await wipeLocalSession();
      }
      setSession(session);
      if (!session) {
        // Route to the new Landing on sign-out (B-251 PR 5) — EXCEPT a just-deleted
        // account, which goes to login so the B-039 "your account has been deleted"
        // confirmation banner (armed on the auth store, shown on the login screen)
        // still surfaces immediately instead of behind the Landing's swipe cards.
        const justDeleted = useAuthStore.getState().justDeletedAccount;
        router.replace(justDeleted ? '/(auth)/login' : '/(auth)');
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
        <Stack.Screen name="report" />
        <Stack.Screen name="settings" />
      </Stack>
      <MealCompletionCard />
      <MedicationCompletionCard />
      <CompletionMoment />
      <ColdStartOverlay />
    </>
  );
}
