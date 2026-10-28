import { Tabs, Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB, HiddenUnderFabMenu } from '../../components/log/FAB';
import { SyncBanner } from '../../components/ui';
import { NyxTabBar } from '../../components/nav/NyxTabBar';
import { useAuthStore } from '../../store/authStore';
import { useAiConsentPreload } from '../../hooks/useAiConsentPreload';
import { useColumn } from '../../hooks/useLayoutClass';
import { theme } from '../../constants/theme';

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
  // The AI consent answer the rows draw by (CUL-1174), read once per account.
  useAiConsentPreload();
  // The tab navigator clips its scenes (`overflow: hidden`, the library's own), so a
  // header inside a tab cannot bleed past a navigator sitting in the root's column
  // (CUL-2237). At regular it steps back out to the window, and each scene pads its
  // content back into the column: the header bleeds into that padding, the bar pads
  // itself. Nothing at compact.
  const { gutter } = useColumn();

  if (recoveryInProgress) {
    return <Redirect href="/(auth)/reset-password" />;
  }

  return (
    <View style={styles.root}>
      {/* Everything under the FAB's menu, hidden from assistive tech while it is open
          (CUL-322 / C-14): the menu's layer is modal, and this is its host. */}
      <HiddenUnderFabMenu>
        <SyncBanner />
        <View style={[styles.root, gutter > 0 && { marginHorizontal: -gutter }]}>
          <Tabs
            // The bar is ours, not Expo's (components/nav/NyxTabBar.tsx) — the default
            // Tabs icon container clips a text-as-icon label, which is why this file
            // owned a hand-rolled bar in the first place. CUL-599 moved the bar itself
            // out to its own component so the Pet tab's fallback ladder can be tested;
            // the layout is back to being a router.
            tabBar={(props) => <NyxTabBar {...props} />}
            screenOptions={gutter > 0 ? { headerShown: false, sceneStyle: [styles.scene, { paddingHorizontal: gutter }] } : { headerShown: false }}
          >
            <Tabs.Screen name="index" options={{ title: 'Home' }} />
            <Tabs.Screen name="history" options={{ title: 'History' }} />
            <Tabs.Screen name="foods" options={{ title: 'Foods' }} />
            {/* The title is the pre-pet fallback only — the bar renders the active
                pet's name here once the store has one (spec §1 D1/D2). */}
            <Tabs.Screen name="profile" options={{ title: 'Pet' }} />
          </Tabs>
        </View>
      </HiddenUnderFabMenu>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scene: {
    backgroundColor: theme.colorNeutralLight,
  },
});
