import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';

const ACCOUNT_DELETED_MSG = 'Your account and everything in it has been deleted.';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Post-deletion confirmation (B-039 FR-12). Capture the one-shot flag at first
  // mount — login mounts fresh after the SIGNED_OUT route replace — then clear it
  // from the store so a later remount (e.g. a normal sign-out) won't resurface it.
  const justDeletedAccount = useAuthStore((s) => s.justDeletedAccount);
  const setJustDeletedAccount = useAuthStore((s) => s.setJustDeletedAccount);
  const [showDeletedConfirmation] = useState(justDeletedAccount);
  useEffect(() => {
    if (justDeletedAccount) setJustDeletedAccount(false);
    // Run once on mount: capture-then-clear. Re-running on flag change would clear
    // it before the first paint shows the banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Text style={styles.wordmark}>Nyx</Text>
        <Text style={styles.subtitle}>Health tracking for the pets you love.</Text>

        {showDeletedConfirmation && (
          <View style={styles.deletedBanner}>
            <Text style={styles.deletedBannerText}>{ACCOUNT_DELETED_MSG}</Text>
          </View>
        )}

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

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign in</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space3,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space4,
  },
  deletedBanner: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    paddingVertical: theme.space2,
    paddingHorizontal: theme.space2,
    marginBottom: theme.space3,
  },
  deletedBannerText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: 13,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface,
    marginBottom: theme.space2,
  },
  button: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
    marginBottom: theme.space3,
    minHeight: 50,
  },
  buttonText: {
    color: '#fff',
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
  },
  link: {
    color: theme.colorTextSecondary,
    textAlign: 'center',
    fontSize: theme.textSM,
  },
});
