import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, Platform, Keyboard,
  KeyboardAvoidingView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { usePetStore } from '../../store/petStore';
import { ageToDob, birthdayToDob } from '../../lib/age';
import { theme } from '../../constants/theme';
import { ChipGroup, type ChipGroupOption } from '../../components/ui/ChipGroup';
import { TextField } from '../../components/ui/TextField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { OnboardingHeader } from '../../components/onboarding/OnboardingHeader';

// Age — the third (and last) SKIPPABLE pet-setup step (B-251 PR 9, spec §3.6,
// mockup 10). Dual input: an approximate integer age (years/months) OR a witnessed
// birthday. Both resolve to `date_of_birth`, but the write records HOW it was given
// via `date_of_birth_precision` (migration 028) — an integer age is anchored
// (today − duration, S6) and flagged 'approximate' so no surface (Profile, edit
// form, vet report) ever renders it as a real birthday. The transforms live in the
// pure, unit-tested lib/age.ts; this screen is only the input + the write.
type Mode = 'age' | 'birthday';

// Closed-set single-select → ChipGroup (CLAUDE.md convention, B-146), with
// allowDeselect off so a mode is always chosen (unlike the optional gender chips).
const MODE_OPTIONS: ChipGroupOption[] = [
  { value: 'age', label: 'Age' },
  { value: 'birthday', label: 'Birthday' },
];

const MAX_YEARS = 40; // a generous ceiling; the oldest recorded pets sit well under this
const MAX_MONTHS = 11; // months is the remainder within a year — years carries the rest

// Digits only, clamped to a sane ceiling. A silent cap (vs a red error) keeps the
// numeric entry calm — the value is an estimate either way (Principle 4).
function sanitizeInt(text: string, max: number): string {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits === '') return '';
  return String(Math.min(parseInt(digits, 10), max));
}

export default function PetAgeScreen() {
  const { activePet, updatePet } = usePetStore();

  // Escape hatch: only reachable after the pet exists (pushed from gender); if it's
  // somehow entered without one — a deep link straight here — restart pet setup.
  useEffect(() => {
    if (!activePet) router.replace('/onboarding/pet-type');
  }, [activePet]);

  // Seed from the created pet so a value saved on a prior pass is restored on
  // back-then-forward (matching breed/gender): an exact DOB reopens in Birthday
  // mode with its date; an approximate DOB reopens in Age mode with its
  // years/months; a null DOB (the first pass) opens empty in Age mode.
  const seeded = seedFromPet(activePet?.date_of_birth ?? null, activePet?.date_of_birth_precision ?? 'exact');
  const [mode, setMode] = useState<Mode>(seeded.mode);
  const [years, setYears] = useState(seeded.years);
  const [months, setMonths] = useState(seeded.months);
  const [birthday, setBirthday] = useState<Date | null>(seeded.birthday);
  // A birthday is only "chosen" once the owner has touched the picker — an
  // untouched spinner defaulting to "2 years ago" must not be saved as a witnessed
  // date they never asserted.
  const [birthdayTouched, setBirthdayTouched] = useState(seeded.birthday != null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!activePet) return null;

  const yearsNum = years === '' ? 0 : parseInt(years, 10);
  const monthsNum = months === '' ? 0 : parseInt(months, 10);
  const canContinue =
    mode === 'age'
      ? yearsNum > 0 || monthsNum > 0
      : birthday != null && birthdayTouched;

  function chooseMode(next: Mode) {
    if (next === mode) return;
    // Leaving the numeric fields → drop the keypad so the birthday picker isn't
    // fighting it for the bottom of the screen.
    if (next === 'birthday') Keyboard.dismiss();
    setMode(next);
  }

  function finish() {
    // Age is the last pet-setup step; the paywall + "All set" close the flow (PR 10).
    // Push (not replace) so back from the paywall returns here with this step intact,
    // matching gender → age. The paywall's "Maybe later" advances to done, which
    // writes the durable onboarding_completed_at and hands off to Home.
    router.push('/onboarding/paywall');
  }

  async function handleContinue() {
    if (!activePet || saving || !canContinue) return;
    // Both branches route through the pure transforms so precision is set in exactly
    // one place — Age is always 'approximate', Birthday always 'exact'.
    const result =
      mode === 'age' ? ageToDob(yearsNum, monthsNum) : birthdayToDob(birthday as Date);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pets')
        .update({
          date_of_birth: result.dateOfBirth,
          date_of_birth_precision: result.precision,
        })
        .eq('id', activePet.id);
      if (error) {
        // Log the raw cause for debugging; the owner sees calm, in-voice copy
        // (nyx-voice Pattern 8 — never surface a raw DB/RLS error string).
        console.warn('[pet-age] date_of_birth update failed:', error.message);
        Alert.alert('Something went wrong', 'Please try again.');
        return;
      }
      updatePet({ date_of_birth: result.dateOfBirth, date_of_birth_precision: result.precision });
      finish();
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    // Guard against a Skip tap racing an in-flight Continue save (matches breed/
    // gender) — the header also disables Skip while saving.
    if (saving) return;
    // No write: leaves date_of_birth as-is — null on the first pass, or a value kept
    // if one was already saved on a prior pass. Backfillable in-app anytime.
    finish();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader step={5} onSkip={handleSkip} skipLabel="Not sure? Skip" skipDisabled={saving} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.title}>{`How old is ${activePet.name}?`}</Text>
          <Text style={styles.subtitle}>An age or a birthday — whichever you know.</Text>

          <ChipGroup
            options={MODE_OPTIONS}
            value={mode}
            onChange={(next) => { if (next) chooseMode(next as Mode); }}
            allowDeselect={false}
            variant="filled"
            accessibilityLabel="How to enter age"
            style={styles.modeToggle}
          />

          {mode === 'age' ? (
            <View style={styles.ageRow}>
              <View style={styles.ageField}>
                <TextField
                  label="Years"
                  value={years}
                  onChangeText={(t) => setYears(sanitizeInt(t, MAX_YEARS))}
                  placeholder="0"
                  keyboardType="number-pad"
                  maxLength={2}
                  testID="pet-age-years"
                />
              </View>
              <View style={styles.ageField}>
                <TextField
                  label="Months"
                  value={months}
                  onChangeText={(t) => setMonths(sanitizeInt(t, MAX_MONTHS))}
                  placeholder="0"
                  keyboardType="number-pad"
                  maxLength={2}
                  testID="pet-age-months"
                />
              </View>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => setShowPicker((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel="Choose birthday"
                testID="pet-age-birthday"
              >
                <Text style={birthday && birthdayTouched ? styles.dateValue : styles.datePlaceholder}>
                  {birthday && birthdayTouched
                    ? birthday.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Choose a date'}
                </Text>
                <Text style={styles.changeLabel}>{showPicker ? 'Done' : 'Set'}</Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  value={birthday ?? defaultBirthday()}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_e: unknown, date?: Date) => {
                    if (Platform.OS === 'android') setShowPicker(false);
                    if (date) {
                      setBirthday(date);
                      setBirthdayTouched(true);
                    }
                  }}
                />
              )}
            </View>
          )}

          <View style={styles.grow} />

          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            disabled={!canContinue}
            loading={saving}
            testID="pet-age-continue"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// A sensible default for the birthday spinner when no date is set yet — two years
// back, a plausible middle for a pet. Never saved unless the owner touches the
// picker (birthdayTouched).
function defaultBirthday(): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
}

// Reopen the screen in the mode that matches a previously-saved DOB (back-then-
// forward preservation). An approximate DOB → Age mode with its years/months
// derived back out; an exact DOB → Birthday mode with the date; null → empty Age.
function seedFromPet(
  dob: string | null,
  precision: 'exact' | 'approximate',
): { mode: Mode; years: string; months: string; birthday: Date | null } {
  if (!dob) return { mode: 'age', years: '', months: '', birthday: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return { mode: 'age', years: '', months: '', birthday: null };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (precision === 'exact') {
    return { mode: 'birthday', years: '', months: '', birthday: new Date(y, mo - 1, d) };
  }
  const now = new Date();
  const totalMonths = Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() - (mo - 1)));
  return {
    mode: 'age',
    years: String(Math.floor(totalMonths / 12)),
    months: String(totalMonths % 12),
    birthday: null,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
    paddingHorizontal: theme.space3,
  },
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: theme.text2XL,
    fontWeight: theme.weightMedium,
    color: theme.colorNeutralDark,
    letterSpacing: theme.trackingTight,
    marginTop: theme.space3,
    marginBottom: theme.space1,
  },
  subtitle: {
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginBottom: theme.space3,
  },
  modeToggle: {
    marginBottom: theme.space3,
  },
  ageRow: {
    flexDirection: 'row',
    columnGap: theme.space2,
  },
  ageField: {
    flex: 1,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.space5,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    backgroundColor: theme.colorSurface,
  },
  dateValue: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  datePlaceholder: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  changeLabel: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccent,
  },
  grow: {
    flex: 1,
    minHeight: theme.space4,
  },
});
