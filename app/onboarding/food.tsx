import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { theme } from '../../constants/theme';

type FoodFormat = 'dry_kibble' | 'wet_canned' | 'raw' | 'freeze_dried' | 'fresh_cooked' | 'topper' | 'treat' | 'other';

const FORMAT_OPTIONS: { value: FoodFormat; label: string }[] = [
  { value: 'dry_kibble', label: 'Dry kibble' },
  { value: 'wet_canned', label: 'Wet / canned' },
  { value: 'raw', label: 'Raw' },
  { value: 'freeze_dried', label: 'Freeze dried' },
  { value: 'fresh_cooked', label: 'Fresh cooked' },
  { value: 'other', label: 'Other' },
];

export default function OnboardingFoodScreen() {
  const { user } = useAuthStore();
  const { activePet } = usePetStore();

  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState('');
  const [format, setFormat] = useState<FoodFormat | null>(null);
  const [loading, setLoading] = useState(false);

  const hasFood = brand.trim().length > 0 && productName.trim().length > 0 && format !== null;

  async function handleSaveAndContinue() {
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from('food_items').insert({
      brand: brand.trim(),
      product_name: productName.trim(),
      format: format!,
      created_by_user_id: user.id,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Something went wrong', error.message);
      return;
    }

    router.replace('/(tabs)');
  }

  function handleSkip() {
    router.replace('/(tabs)');
  }

  const petName = activePet?.name ?? 'your pet';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>What does {petName} eat?</Text>
        <Text style={styles.subtitle}>
          Adding their main food now means meal logs are a single tap. You can skip this and add it later.
        </Text>

        <Text style={styles.label}>Brand</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Royal Canin"
          placeholderTextColor={theme.colorTextSecondary}
          value={brand}
          onChangeText={setBrand}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Product name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Gastrointestinal Low Fat"
          placeholderTextColor={theme.colorTextSecondary}
          value={productName}
          onChangeText={setProductName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Format</Text>
        <View style={styles.formatGrid}>
          {FORMAT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.formatBtn, format === opt.value && styles.formatBtnActive]}
              onPress={() => setFormat(opt.value)}
            >
              <Text style={[styles.formatBtnText, format === opt.value && styles.formatBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, !hasFood && styles.buttonDisabled]}
          onPress={handleSaveAndContinue}
          disabled={!hasFood || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Save and continue</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: theme.space3 },
  title: {
    fontSize: 28, fontWeight: theme.fontWeightMedium,
    color: theme.colorNeutralDark, marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: 15, color: theme.colorTextSecondary,
    lineHeight: 22, marginBottom: theme.space4,
  },
  label: {
    fontSize: 13, fontWeight: theme.fontWeightMedium,
    color: theme.colorTextSecondary, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: theme.space1,
  },
  input: {
    borderWidth: 1, borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall, padding: theme.space2,
    fontSize: 16, color: theme.colorTextPrimary,
    backgroundColor: theme.colorSurface, marginBottom: theme.space3,
  },
  formatGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: theme.space1, marginBottom: theme.space4,
  },
  formatBtn: {
    paddingVertical: 10, paddingHorizontal: theme.space2,
    borderRadius: theme.radiusSmall, borderWidth: 1,
    borderColor: theme.colorBorder, backgroundColor: theme.colorSurface,
  },
  formatBtnActive: {
    backgroundColor: theme.colorNeutralDark, borderColor: theme.colorNeutralDark,
  },
  formatBtnText: { fontSize: 14, color: theme.colorTextSecondary },
  formatBtnTextActive: { color: '#fff', fontWeight: theme.fontWeightMedium },
  button: {
    backgroundColor: theme.colorNeutralDark, borderRadius: theme.radiusSmall,
    padding: theme.space2, alignItems: 'center', marginBottom: theme.space2,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: theme.fontWeightMedium },
  skipBtn: { alignItems: 'center', padding: theme.space2 },
  skipText: { color: theme.colorTextSecondary, fontSize: 15 },
});
