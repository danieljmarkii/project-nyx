import { Tabs, router } from 'expo-router';
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native';
import { theme } from '../../constants/theme';
import { usePet } from '../../hooks/usePet';

function QuickLogButton() {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => router.push('/log')}
      accessibilityLabel="Log event"
    >
      <View style={styles.fabInner}>
        <View style={styles.plusH} />
        <View style={styles.plusV} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  usePet();

  return (
    <View style={styles.root}>
      <Tabs>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
        <Tabs.Screen name="profile" options={{ title: 'Pet' }} />
      </Tabs>
      <QuickLogButton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fab: {
    position: 'absolute', bottom: 72, right: theme.space3,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colorNeutralDark,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  fabInner: { width: 20, height: 20, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  plusH: { position: 'absolute', width: 20, height: 2, backgroundColor: '#fff', borderRadius: 1 },
  plusV: { position: 'absolute', width: 2, height: 20, backgroundColor: '#fff', borderRadius: 1 },
});
