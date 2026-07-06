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
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }
    // When email confirmation is on, signUp succeeds with NO session until the user
    // taps the emailed link. Routing to onboarding here would bounce straight back
    // to login (the root layout gates every screen on a live session), which reads
    // to the user as "sign-up does nothing". Handle the no-session case explicitly
    // instead of treating no-error as signed-in.
    if (!data.session) {
      // Supabase returns a user with an empty identities array when the email is
      // already registered (it hides this while confirmation is on, so it can't be
      // used to probe which emails have accounts).
      const alreadyRegistered = !!data.user && (data.user.identities?.length ?? 0) === 0;
      Alert.alert(
        alreadyRegistered ? 'You already have an account' : 'Check your email',
        alreadyRegistered
          ? 'That email is already set up. Try signing in instead.'
          : `We sent a confirmation link to ${email.trim()}. Open it to finish setting up your account, then come back and sign in.`,
      );
      router.replace('/(auth)/login');
      return;
    }
    // Session present (email confirmation disabled): straight into onboarding.
    // The user_profiles row is created by the Supabase trigger on auth.users insert.
    router.replace('/onboarding/pet-type');
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

        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create account</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
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
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    marginBottom: theme.space1,
    letterSpacing: theme.trackingTight,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    marginBottom: theme.space4,
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
