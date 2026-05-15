import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      // user_profiles row is created by Supabase trigger on auth.users insert
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Let's get started.</Text>

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
          autoComplete="new-password"
        />

        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create account</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: theme.space3 },
  title: {
    fontSize: 32, fontWeight: theme.fontWeightMedium,
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
