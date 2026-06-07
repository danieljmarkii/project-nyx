import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { initDb, clearLocalData } from '../lib/db';
import { notifySignedOut } from '../lib/sync';
import { useSync } from '../hooks/useSync';
import { Toast } from '../components/ui/Toast';
import { ColdStartOverlay } from '../components/ColdStartOverlay';

export default function RootLayout() {
  const { setSession, setLoading } = useAuthStore();
  const { isOnboarded } = usePetStore();

  useSync();

  useEffect(() => {
    initDb().catch(console.error);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) {
        router.replace('/(auth)/login');
      }
      // If session exists, usePet hook (in tabs layout) will fetch the pet
      // and redirect to onboarding if none exists.
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // FR-9 (B-054 Trust & Safety gate): wipe the local pet-data copy on an
      // explicit sign-out before routing away. Gated on the SIGNED_OUT event
      // specifically — NOT on a null session generally — so a transient token
      // refresh can never destroy local data. Awaited so the wipe completes
      // before any subsequent sign-in starts re-hydrating.
      if (event === 'SIGNED_OUT') {
        // Abort any in-flight hydration BEFORE wiping, so a sync mid-cycle can't
        // re-populate the store after clearLocalData runs.
        notifySignedOut();
        await clearLocalData().catch((e) => console.warn('[auth] local wipe failed:', e));
      }
      setSession(session);
      if (!session) {
        router.replace('/(auth)/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="log" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-capture" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vet-visit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-event" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="report" />
      </Stack>
      <Toast />
      <ColdStartOverlay />
    </>
  );
}
