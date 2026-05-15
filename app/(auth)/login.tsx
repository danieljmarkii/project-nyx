import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Nyx</Text>
        <Text style={styles.subtitle}>Health tracking for the pets you love.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.colorTextSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.colorTextSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign in</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  inner: {
    flex: 1, justifyContent: 'center', paddingHorizontal: theme.space3,
  },
  title: {
    fontSize: 40, fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark, marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: 16, color: theme.colorTextSecondary, marginBottom: theme.space4,
  },
  input: {
    borderWidth: 1, borderColor: theme.colorBorder, borderRadius: theme.radiusSmall,
    padding: theme.space2, fontSize: 16, color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface, marginBottom: theme.space2,
  },
  button: {
    backgroundColor: theme.colorNeutralDark, borderRadius: theme.radiusSmall,
    padding: theme.space2, alignItems: 'center', marginTop: theme.space1,
    marginBottom: theme.space3,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: theme.fontWeightMedium },
  link: { color: theme.colorTextSecondary, textAlign: 'center', fontSize: 14 },
});
