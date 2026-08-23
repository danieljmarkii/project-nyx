import { Tabs, Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB } from '../../components/log/FAB';
import { SyncBanner } from '../../components/ui';
import { NyxTabBar, type TabBarProps } from '../../components/nav/NyxTabBar';
import { useAuthStore } from '../../store/authStore';

// The bar itself is components/nav/NyxTabBar (CUL-599) — a custom one, because the
// default Expo Tabs icon container clips its content, and because the Pet tab renders
// the pet's own avatar and name rather than a static icon. This file keeps routing.

export default function TabsLayout() {
  // §6.5 — the recovery gate's enforcement point. FR-6 says the router holds the
  // owner on the set-password screen; there is no other auth gate in the router, and
  // the shipped widget emits `nyx:///history?…` / `nyx:///log?…` deep links, so a
  // single Home Screen tap would otherwise walk straight past the gate into the tabs
  // (§10 row 22, this guard's acceptance test). A `<Redirect>` here beats expo-
  // router's built-in deep linking. Inert whenever no reset is in progress, so it is
  // a no-op unless `PASSWORD_RECOVERY_ENABLED` is on and a reset is live.
  const recoveryInProgress = useAuthStore((s) => s.recoveryInProgress);
  usePet();

  if (recoveryInProgress) {
    return <Redirect href="/(auth)/reset-password" />;
  }

  return (
    <View style={styles.root}>
      <SyncBanner />
      <Tabs
        tabBar={(props) => <NyxTabBar {...(props as unknown as TabBarProps)} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
        <Tabs.Screen name="foods" options={{ title: 'Foods' }} />
        {/* No title: the Pet tab's label is the pet's name, resolved by the bar. */}
        <Tabs.Screen name="profile" options={{ title: 'Pet' }} />
      </Tabs>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
