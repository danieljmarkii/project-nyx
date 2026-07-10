import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card, Header } from '../../components/ui';
import { SettingsRow } from '../../components/settings/SettingsRow';
import { ComingSoonLabel } from '../../components/settings/ComingSoonLabel';

// Notifications — MOCKED (B-283 spec §5, "You" screen PR 3). A reserved surface,
// wired later: the push provider is still an open decision (B-015/B-227), so
// nothing here fires yet. The screen exists now so turning notifications on is a
// later flag-flip, not a re-layout.
//
// SAFETY GATE (D7 / clinical-guardrails / Trust & Safety). A mocked notifications
// surface must NEVER read as an *armed* reminder. An owner who flips "remind me"
// and then relies on a nudge that isn't sending is a genuine hazard — a missed
// insulin / anti-seizure dose is the worst case. So, by construction:
//   • the top note is an honest not-live empty state (Principle 5), and
//   • the reserved categories are shown plainly OFF as static "coming soon" rows
//     (§S3) — never toggles that read as flippable-on, and
//   • NO medication reminder appears here, armed or otherwise. Owner-configured
//     med / care reminders (B-227) are a separate, later build with their own
//     safety framing. Do NOT add a medication-reminder row to this screen.
//
// Only the two safe, non-dose categories are previewed: the daily check-in nudge
// (the one-a-day Zone-2 nudge, Principle 4) and proactive Health insights (≤1/day).
export default function NotificationsScreen() {
  function handleBack() {
    // Always pushed from the "You" screen, so back pops to it. Guarded for the
    // deep-link / no-history case so back is never a dead no-op (mirrors settings).
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Notifications" leading="back" onLeadingPress={handleBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Honest not-live state (Principle 5) — warm, forward-looking, never a
            dead toggle. §5 copy, verbatim. */}
        <Card style={styles.note}>
          <Text style={styles.noteText}>
            Notifications aren’t turned on yet — we’ll let you know the moment they’re ready.
          </Text>
        </Card>

        {/* Reserved categories, shown plainly OFF (§S3 static rows). Non-interactive:
            no toggle, no chevron, no onPress — there is nothing here to arm. */}
        <Card noPadding>
          <SettingsRow
            first
            label="Daily check-in nudge"
            sublabel="One gentle nudge a day, only if nothing’s logged"
            trailing={<ComingSoonLabel />}
          />
          <SettingsRow
            label="Health insights"
            sublabel="A heads-up when a pattern is worth a look"
            trailing={<ComingSoonLabel />}
          />
        </Card>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  scroll: {
    padding: theme.space3,
    gap: theme.space2,
  },

  // ── Not-live note ──
  // A quiet neutral fill (the same "framed text, not an action row" treatment the
  // sibling You-screen disclaimer uses) — no accent tint, so the "one accent,
  // never decorative" rule holds and the settings surface stays consistent.
  note: {
    backgroundColor: theme.colorSurfaceSubtle,
  },
  noteText: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },

  bottomPad: {
    height: theme.space4,
  },
});
