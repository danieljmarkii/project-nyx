import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { PrimaryButton } from '../ui';

// The pre-permission primer (B-661 PR 3, Notification Foundation §2). We get ONE
// system permission prompt per install, so it is never fired at launch, at
// onboarding, or unprompted — only from an explicit owner intent (turning the
// Daily summary toggle on). This sheet is the step BETWEEN that tap and the OS
// prompt: it says what the category sends, how often, and that it is reversible,
// so the owner reaches the system dialog already knowing what "Allow" means.
//
// DECLINING SPENDS NOTHING (§2, AC 2). "Not now" / the scrim only calls
// onDismiss — the screen never reaches ensurePermission(request=true), so the one
// prompt is preserved for a later, more considered yes.
//
// SAFETY (clinical-guardrails G4 — the D7 lineage): the copy is strictly
// RETROSPECTIVE — a look back at what the owner already logged — and implies no
// medication reminder, armed or otherwise. Part 1 ships no reminder; nothing here
// may read like one.
//
// CHROME NOTE (→ B-667): the Modal/backdrop/scrim/grabber/rounded-sheet below is
// the same chrome components/vetfiles/SheetShell.tsx owns — deliberately the SAME
// tokens (colorScrim, radiusLarge, grabber 36×4, paddingTop:10) so there is no
// drift, but a hand-rolled copy nonetheless. SheetShell isn't a drop-in (this sheet
// wants a hero header its plain `title` prop doesn't cover, and it lives under
// vetfiles/), so consolidating the app's sheets onto one shared shell is filed as
// its own refactor rather than smuggled into this feature PR.

interface NotificationPrimerSheetProps {
  visible: boolean;
  /** The single pet's name for warmer copy; null on a multi-pet or nameless
   *  account, where the copy stays neutral (the one-notification-per-account
   *  shape, D3). */
  petName?: string | null;
  /** "Turn on" — the screen then fires the OS permission request. */
  onConfirm: () => void;
  /** "Not now" / scrim — dismiss without spending the prompt. */
  onDismiss: () => void;
  /** True while the OS permission request is in flight, so the CTA reads as
   *  working rather than dead. */
  requesting?: boolean;
}

export function NotificationPrimerSheet({
  visible,
  petName,
  onConfirm,
  onDismiss,
  requesting = false,
}: NotificationPrimerSheetProps) {
  const insets = useSafeAreaInsets();

  const title = petName
    ? `A recap of ${petName}’s day, every evening`
    : 'A recap of the day, every evening';

  // Retrospective by construction: "you logged" makes this a look BACK at the
  // record, never a forward reminder (G4). "Just one a night" + "turn it off
  // whenever you like" carry the how-often and the reversibility §2 asks for.
  const body = petName
    ? `Around 9:00 each night, we’ll let you know ${petName}’s day is ready to read — a calm look back at the meals, symptoms, and doses you logged. Just one notification a night, and you can turn it off whenever you like.`
    : `Around 9:00 each night, we’ll let you know the day is ready to read — a calm look back at the meals, symptoms, and doses you logged. One notification a night for all your pets, and you can turn it off whenever you like.`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}>
          <View style={styles.grabber} />

          <View style={styles.iconDisc}>
            <Bell size={22} color={theme.colorAccentInk} strokeWidth={1.75} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {/* Honest about the one-shot OS prompt that follows — so "Allow" on the
              system dialog is an informed tap, not a surprise. */}
          <Text style={styles.note}>
            Next, your phone will ask whether Culprit can send notifications.
          </Text>

          <PrimaryButton
            label="Turn on"
            onPress={onConfirm}
            loading={requesting}
            style={styles.cta}
          />
          <TouchableOpacity
            onPress={onDismiss}
            disabled={requesting}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={styles.notNowWrap}
          >
            <Text style={styles.notNow}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingTop: 10,
    paddingHorizontal: theme.space3,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    alignSelf: 'center',
    marginBottom: theme.space2,
  },
  iconDisc: {
    width: 48,
    height: 48,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space2,
  },
  title: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  body: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
  },
  note: {
    fontFamily: theme.fontBody,
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    lineHeight: theme.lineHeightSM,
    marginTop: theme.space2,
  },
  cta: {
    marginTop: theme.space3,
  },
  notNowWrap: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  notNow: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
  },
});
