import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';

export default function ProfileScreen() {
  const { activePet } = usePetStore();

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>{activePet?.name ?? 'Pet Profile'}</Text>
        {activePet && (
          <Text style={styles.detail}>
            {activePet.species} · {activePet.breed ?? 'Unknown breed'}
          </Text>
        )}
        <Text style={styles.placeholder}>Full profile — coming in build step 7.</Text>

        <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  inner: { flex: 1, padding: theme.space3 },
  title: { fontSize: 28, fontWeight: theme.fontWeightMedium, color: theme.colorNeutralDark, marginBottom: theme.space1 },
  detail: { fontSize: 15, color: theme.colorTextSecondary, marginBottom: theme.space3 },
  placeholder: { fontSize: 15, color: theme.colorTextSecondary, marginBottom: theme.space5 },
  signOut: { marginTop: 'auto' },
  signOutText: { color: '#C0392B', fontSize: 15 },
});
