import { Tabs, Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB, HiddenUnderFabMenu } from '../../components/log/FAB';
import { SyncBanner } from '../../components/ui';
import { NyxTabBar } from '../../components/nav/NyxTabBar';
import { useAuthStore } from '../../store/authStore';
import { useAiConsentPreload } from '../../hooks/useAiConsentPreload';
import { useSceneGutters, useTabRail } from '../../hooks/useLayoutClass';
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
  // The tabs fill the window (CUL-2703): no column stands around this navigator, so its bar
  // reaches the window's edge and nothing here is clipped. Our bar goes where the system's
  // bars go (PM ruling, D1 = A, D2 = A). Where iOS stands its bars in a strip down one
  // side (a folded Duo, an unfolded one on its side, Split View), ours is a rail in that
  // strip, on that edge, the + at its foot; where iOS lays them flat (every other iPhone,
  // the Duo unfolded and upright), ours is the bottom row. Each scene pads its content
  // into the column, and the header bleeds back into that padding.
  const rail = useTabRail();
  const scene = useSceneGutters();
  const held = rail !== null || scene.left > 0 || scene.right > 0;

  if (recoveryInProgress) {
    return <Redirect href="/(auth)/reset-password" />;
  }

  return (
    <View style={styles.root}>
      {/* Everything under the FAB's menu, hidden from assistive tech while it is open
          (CUL-322 / C-14): the menu's layer is modal, and this is its host. */}
      <HiddenUnderFabMenu>
        <SyncBanner />
        <View style={styles.root}>
          <Tabs
            // The bar is ours, not Expo's (components/nav/NyxTabBar.tsx) — the default
            // Tabs icon container clips a text-as-icon label, which is why this file
            // owned a hand-rolled bar in the first place. CUL-599 moved the bar itself
            // out to its own component so the Pet tab's fallback ladder can be tested;
            // the layout is back to being a router.
            tabBar={(props) => <NyxTabBar {...props} />}
            // The bar's side is the system's, not a device's: one tree in every pose, so a
            // fold moves the bar between the bottom and the rail without remounting a tab.
            // A plain phone passes nothing, and is exactly what it was.
            screenOptions={
              held
                ? {
                    headerShown: false,
                    tabBarPosition: rail?.edge ?? 'bottom',
                    sceneStyle: [styles.scene, { paddingLeft: scene.left, paddingRight: scene.right }],
                  }
                : { headerShown: false }
            }
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
