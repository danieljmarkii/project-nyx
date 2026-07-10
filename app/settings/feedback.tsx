import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header, PrimaryButton, SectionLabel } from '../../components/ui';
import { ChipGroup, ChipGroupOption } from '../../components/ui/ChipGroup';
import { buildFeedbackSubject, buildSupportMailto } from '../../lib/support';
import { APP_VERSION, APP_BUILD, PLATFORM } from '../../lib/appInfo';
import { SUPPORT_EMAIL } from '../../constants/links';

// "Share feedback" — a lightweight in-app composer (spec §6 / §D8). Product
// input, NOT a help ticket: Contact support (§D6) says "something's broken, reply
// expected"; this says "here's a product thought, no reply guaranteed". Both end
// up in one inbox — feedback is disambiguated by a [Feedback] subject tag routed
// via Cloudflare — so there's no schema and no backend here: Send just composes a
// mailto, reusing PR 1's pure helpers. A stored feedback table + admin view is a
// future upgrade (§12).
//
// Category is optional (the house ChipGroup, single-select, deselectable); the
// note is the payload. We deliberately never claim "Sent" — a mailto only opens a
// draft and we can't know the owner actually sends it — but on a successful open
// we DO signpost the hand-off (a line under Send) and return to the You screen, so
// the mail app clearly takes over and a second tap can't spawn a duplicate draft
// (honest-over-reassuring; true confirmation waits on expo-mail-composer, B-288).

const CATEGORY_OPTIONS: ChipGroupOption[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'problem', label: 'Problem' },
  { value: 'praise', label: 'Praise' },
];

// Generous cap that keeps the composed mailto URL within the length some mail
// clients silently truncate at, without ever reading as a word limit the owner
// has to watch (no visible counter — Principle 4, warm not nagging).
const FEEDBACK_MAX_LENGTH = 2000;

// Resting height of the note field — ~5 lines of room to write before it scrolls
// internally. A deliberate component-local layout value (there's no textarea
// token; the 8pt grid tops out at 64), named so it reads as intentional.
const NOTE_MIN_HEIGHT = 140;

export default function FeedbackScreen() {
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [focused, setFocused] = useState(false);

  const canSend = note.trim().length > 0;

  function handleBack() {
    // Pushed from the You screen, so back pops to it. Guarded for the deep-link /
    // no-history case (mirrors app/settings.tsx) so back is never a dead no-op.
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  function noMailFallback() {
    // §4.5 — never fail silently: show the address so the owner can still reach us.
    Alert.alert('No mail app found', `You can reach us at ${SUPPORT_EMAIL}.`, [{ text: 'OK' }]);
  }

  async function handleSend() {
    const trimmed = note.trim();
    if (!trimmed) return; // Guarded even though the button is disabled while empty.

    const categoryLabel = CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? null;
    const url = buildSupportMailto(SUPPORT_EMAIL, {
      version: APP_VERSION,
      build: APP_BUILD,
      platform: PLATFORM,
      subject: buildFeedbackSubject(categoryLabel),
      body: trimmed,
    });

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        noMailFallback();
        return;
      }
      await Linking.openURL(url);
      // Honest post-send state (pm-feature-review, PR 4): a raw mailto can't tell
      // us the owner actually sent, so we never claim "Sent" — but we DO return to
      // the You screen so the hand-off to the mail app is unmistakable and a second
      // tap can't spawn a duplicate draft. The signpost under Send already set the
      // expectation that the real send happens in the mail app. (A true in-app
      // confirmation waits on expo-mail-composer — B-288.)
      handleBack();
    } catch (e) {
      console.warn('[Feedback] open feedback mailto failed:', e);
      noMailFallback();
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Share feedback" leading="back" onLeadingPress={handleBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Prompt + the reply-expectation as one header block, so the owner
              knows this is a no-guaranteed-reply channel BEFORE investing in a
              note (pm-feature-review: set the expectation before the send
              decision, not as fine print after it). */}
          <View style={styles.intro}>
            <Text style={styles.prompt}>What's working? What could be better?</Text>
            <Text style={styles.replyNote}>We read every note; we can't always reply.</Text>
          </View>

          <View style={styles.section}>
            <SectionLabel label="Category (optional)" />
            <ChipGroup
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              accessibilityLabel="Feedback category"
            />
          </View>

          <View style={styles.section}>
            <SectionLabel label="Your note" />
            <TextInput
              style={[styles.noteInput, focused && styles.noteInputFocused]}
              value={note}
              onChangeText={setNote}
              placeholder="Anything on your mind — a rough edge, an idea, something you love."
              placeholderTextColor={theme.colorTextTertiary}
              multiline
              maxLength={FEEDBACK_MAX_LENGTH}
              textAlignVertical="top"
              autoCapitalize="sentences"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityLabel="Your feedback"
            />
          </View>

          {/* Send + its mechanic signpost as one block: the button never lands the
              owner in a mail draft unannounced — the line under it names the
              hand-off so returning to the app afterward isn't "did anything
              happen?" (pm-feature-review, PR 4). */}
          <View style={styles.sendBlock}>
            <PrimaryButton label="Send" onPress={handleSend} disabled={!canSend} />
            <Text style={styles.sendHint}>We'll open your mail app so you can send it.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space3,
  },
  intro: {
    gap: theme.space1,
  },
  prompt: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightSignal,
  },
  replyNote: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },
  section: {
    gap: theme.space1,
  },
  noteInput: {
    minHeight: NOTE_MIN_HEIGHT,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space2,
    backgroundColor: theme.colorSurface,
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  // The calm accent focus ring the house TextField uses — reused here so the
  // multiline composer reads as the same family of input.
  noteInputFocused: {
    borderColor: theme.colorAccent,
  },
  sendBlock: {
    gap: theme.space1,
  },
  sendHint: {
    textAlign: 'center',
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
  },
});
