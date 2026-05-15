import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../constants/theme';

export default function ProfileScreen() {
  const { activePet, setActivePet, setOnboarded } = usePetStore();
  const { user } = useAuthStore();
  const [wiping, setWiping] = useState(false);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function handleWipeData() {
    Alert.alert(
      'Wipe all data',
      'This will permanently delete your pet, all logs, and your profile. You will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe everything',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setWiping(true);

            // Delete pets (cascades to events, meals, conditions, diet_trials,
            // vet_visits, vet_reports via ON DELETE CASCADE in schema)
            await supabase.from('pets').delete().eq('user_id', user.id);

            // Delete user profile
            await supabase.from('user_profiles').delete().eq('id', user.id);

            setActivePet(null);
            setOnboarded(false);
            setWiping(false);
            supabase.auth.signOut();
          },
        },
      ]
    );
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

        <View style={styles.actions}>
          <TouchableOpacity style={styles.wipeBtn} onPress={handleWipeData} disabled={wiping}>
            {wiping
              ? <ActivityIndicator color="#C0392B" />
              : <Text style={styles.wipeText}>Wipe my data</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
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
  actions: { marginTop: 'auto', gap: theme.space2 },
  wipeBtn: { padding: theme.space2 },
  wipeText: { color: '#C0392B', fontSize: 15 },
  signOut: { padding: theme.space2 },
  signOutText: { color: theme.colorTextSecondary, fontSize: 15 },
});
