import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB } from '../../components/log/FAB';
import { theme } from '../../constants/theme';

function TabIcon({ focused, label }: { focused: boolean; label: string }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  usePet();

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: styles.tabBar,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Home" />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="History" />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Pet" />,
          }}
        />
      </Tabs>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    elevation: 0,
    shadowOpacity: 0,
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
