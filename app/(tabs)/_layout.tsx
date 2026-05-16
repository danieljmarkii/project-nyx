import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { usePet } from '../../hooks/usePet';
import { FAB } from '../../components/log/FAB';

export default function TabsLayout() {
  usePet();

  return (
    <View style={styles.root}>
      <Tabs>
        <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
        <Tabs.Screen name="history" options={{ title: 'History', headerShown: false }} />
        <Tabs.Screen name="profile" options={{ title: 'Pet', headerShown: false }} />
      </Tabs>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
