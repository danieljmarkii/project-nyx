import { useEffect, useState } from 'react';
import {
  Alert, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ThemedText } from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { WhorlSpinner } from '../brand/WhorlSpinner';
import { supabase } from '../../lib/supabase';
import { fetchDisplayName, updateDisplayName } from '../../lib/profile';

// OwnerNameRow — the Account card's "Your name" field (vet-report spec §7.1).
//
// The vet report's "Owner:" line files the record in the vet's PIMS, but nothing in
// the app ever set user_profiles.display_name — the first real report printed
// "Owner: not recorded" (PM feedback, 2026-07-03). Inline row, not a modal: setting
// your name once is a 5-second act, not a flow. Online-only write (a profile edit is
// a settings-class action, not pet-event logging — it doesn't ride the sync queue);
// a failed save says so honestly and keeps the draft in the field.

export function OwnerNameRow() {
  const [userId, setUserId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      const uid = error ? null : (data.session?.user.id ?? null);
      if (cancelled) return;
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);
      const read = await fetchDisplayName(uid);
      if (cancelled) return;
      if (read.status === 'ok') {
        setSavedName(read.displayName);
        setDraft(read.displayName ?? '');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = draft.trim() !== (savedName ?? '');

  const handleSave = async () => {
    if (!userId || saving) return;
    setSaving(true);
    const result = await updateDisplayName(userId, draft);
    setSaving(false);
    if (result.status === 'written') {
      setSavedName(result.displayName);
      setDraft(result.displayName ?? '');
    } else {
      Alert.alert(
        'Could not save your name',
        'Check your connection and try again — your draft is still here.',
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.row}>
        <ThemedText style={styles.label}>Your name</ThemedText>
        <WhorlSpinner size="sm" ground="day" />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <ThemedText style={styles.label}>Your name</ThemedText>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add your name"
          placeholderTextColor={theme.colorTextSecondary}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          editable={!saving}
        />
        {dirty && (
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving ? (
              <WhorlSpinner size="sm" ground="day" />
            ) : (
              <ThemedText style={styles.saveText}>Save</ThemedText>
            )}
          </TouchableOpacity>
        )}
      </View>
      <ThemedText style={styles.hint}>Shown as the owner on the vet report.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: theme.space1,
  },
  label: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
  },
  input: {
    flex: 1,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    paddingVertical: theme.space1,
    textAlign: 'right',
  },
  saveText: {
    fontFamily: theme.fontBodyMedium,
    fontSize: theme.textMD,
    color: theme.colorAccentInk,
  },
  // Tertiary grey so this caption shares one register with the Account card's
  // other caption (the email-change note) — the two "Your name" / email hints
  // read as the same tier, not two greys (Designer polish, 2026-08-08).
  hint: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginBottom: theme.space1,
  },
});
