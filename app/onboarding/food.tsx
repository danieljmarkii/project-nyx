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
import { FilterChip } from '../../components/ui/FilterChip';
import { SectionLabel } from '../../components/ui/SectionLabel';

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

        <SectionLabel label="Brand" style={styles.fieldLabel} />
        <TextInput
          style={styles.input}
          placeholder="e.g. Royal Canin"
          placeholderTextColor={theme.colorTextSecondary}
          value={brand}
          onChangeText={setBrand}
          autoCapitalize="words"
        />

        <SectionLabel label="Product name" style={styles.fieldLabel} />
        <TextInput
          style={styles.input}
          placeholder="e.g. Gastrointestinal Low Fat"
          placeholderTextColor={theme.colorTextSecondary}
          value={productName}
          onChangeText={setProductName}
          autoCapitalize="words"
        />

        <SectionLabel label="Format" style={styles.fieldLabel} />
        <View style={styles.formatGrid}>
          {FORMAT_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={format === opt.value}
              onPress={() => setFormat(opt.value)}
              variant="filled"
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, !hasFood && styles.buttonDisabled]}
          onPress={handleSaveAndContinue}
          disabled={!hasFood || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Save and continue</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} hitSlop={8}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.space3,
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
    lineHeight: 22,
    marginBottom: theme.space4,
  },
  fieldLabel: {
    marginBottom: theme.space1,
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
    marginBottom: theme.space3,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space1,
    marginBottom: theme.space4,
  },
  button: {
    backgroundColor: theme.colorNeutralDark,
    borderRadius: theme.radiusMedium,
    paddingVertical: theme.space2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space2,
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
  },
  skipBtn: {
    alignItems: 'center',
    padding: theme.space2,
  },
  skipText: {
    color: theme.colorTextSecondary,
    fontSize: theme.textMD,
  },
});
