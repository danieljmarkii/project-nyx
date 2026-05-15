import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

export default function LogModal() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Log event</Text>
        <Text style={styles.placeholder}>Quick-log flow — coming in build step 4.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorSurface },
  inner: { flex: 1, padding: theme.space3 },
  title: { fontSize: 28, fontWeight: theme.fontWeightMedium, color: theme.colorNeutralDark, marginBottom: theme.space2 },
  placeholder: { fontSize: 15, color: theme.colorTextSecondary },
});
