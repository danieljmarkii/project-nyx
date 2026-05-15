import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

export default function ReportScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Vet report</Text>
        <Text style={styles.placeholder}>Report generation — coming in build step 9.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  inner: { flex: 1, padding: theme.space3 },
  title: { fontSize: 28, fontWeight: theme.fontWeightMedium, color: theme.colorNeutralDark, marginBottom: theme.space2 },
  placeholder: { fontSize: 15, color: theme.colorTextSecondary },
});
