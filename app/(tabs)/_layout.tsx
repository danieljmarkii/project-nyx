import { Tabs, Redirect } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB } from '../../components/log/FAB';
import { SyncBanner } from '../../components/ui';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';

// Custom tab bar gives full control over layout — the default Expo Tabs
// icon container clips text when using text-as-icon, so we own the bar entirely.
interface TabBarProps {
  state: {
    routes: { key: string; name: string }[];
    index: number;
  };
  descriptors: Record<string, {
    options: { title?: string; tabBarAccessibilityLabel?: string };
  }>;
  navigation: {
    emit: (event: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

function NyxTabBar({ state, descriptors, navigation }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label = options.title ?? route.name;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
          >
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

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
        <Tabs.Screen name="profile" options={{ title: 'Pet' }} />
      </Tabs>
      <FAB />
    </View>
  );
}

const TAB_HEIGHT = Platform.OS === 'ios' ? 80 : 60;
const TAB_BOTTOM_PAD = Platform.OS === 'ios' ? 24 : 8;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    height: TAB_HEIGHT,
    paddingBottom: TAB_BOTTOM_PAD,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorTextTertiary,
    letterSpacing: theme.trackingWide,
  },
  tabLabelActive: {
    color: theme.colorNeutralDark,
  },
});
