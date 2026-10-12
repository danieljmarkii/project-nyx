import { useState } from 'react';
import {
  Alert, Linking, Modal, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, ScanEye, ScanText } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PrimaryButton } from '../ui/PrimaryButton';
import { PRIVACY_POLICY_URL } from '../../constants/links';
import {
  AI_NAMED,
  ALLOW_LABEL,
  DONT_ALLOW_LABEL,
  PRIVACY_POLICY_LINK,
  WHATS_SENT_DONE,
  WHATS_SENT_LINK,
  WHATS_SENT_TITLE,
  consentSheetCopy,
  whatsSentSections,
  type ConsentBenefit,
  type ConsentDoor,
} from '../../constants/aiConsentCopy';

// The AI permission sheet (CUL-1834; mock round 4, frames A, B and C). One
// component for every in-context door: the headline and picture fit the door, and
// the benefits, the disclosure and the "Without it" line say the same thing at each,
// because one answer covers them all.
//
// Allow is the primary button and Don't allow sits beside it at the same size,
// never a link (PM, round 3); nothing is preselected. Not now is a full-width text
// button below them and writes nothing (D13). The parent owns the writes: this
// surface only reports which button was pressed, so it cannot write on its own.
//
// C-14: the sheet is a panel plus a thin Modal wrapper, and *What's sent* (frame B)
// replaces the panel's content inside the same Modal rather than opening a second
// one, which iOS presents unreliably from inside a Modal.

export type ConsentChoice = 'allow' | 'dont_allow';

interface PanelProps {
  door: ConsentDoor;
  petName: string | null;
  onChoose: (choice: ConsentChoice) => void;
  onNotNow: () => void;
  /** Which write is in flight, so its button reads as working and the rest wait. */
  saving: ConsentChoice | null;
  /** Shown above the buttons when the last write failed. The sheet stays up. */
  error: string | null;
}

export function AiConsentPanel({ door, petName, onChoose, onNotNow, saving, error }: PanelProps) {
  const [showWhatsSent, setShowWhatsSent] = useState(false);
  const copy = consentSheetCopy(door, petName);
  const busy = saving !== null;

  if (showWhatsSent) {
    return <WhatsSentPanel petName={petName} onDone={() => setShowWhatsSent(false)} />;
  }

  return (
    <View>
      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {door === 'ask'
          ? <MessageCircle size={28} color={theme.colorAccentInk} strokeWidth={1.75} />
          : <ScanText size={28} color={theme.colorAccentInk} strokeWidth={1.75} />}
      </View>
      <ThemedText style={styles.headline} accessibilityRole="header">{copy.headline}</ThemedText>
      <View style={styles.benefits}>
        {copy.benefits.map((b, i) => (
          <BenefitRow key={b.title} benefit={b} icon={i === 0 && door === 'label' ? 'label' : 'eye'} />
        ))}
      </View>
      <View style={styles.disclosure}>
        <ThemedText style={styles.disclosureText}>
          {copy.disclosureBefore}
          <ThemedText style={styles.disclosureStrong}>{AI_NAMED}</ThemedText>
          {copy.disclosureAfter}
        </ThemedText>
        <TouchableOpacity
          onPress={() => setShowWhatsSent(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.linkWrap}
        >
          <ThemedText style={styles.link}>{WHATS_SENT_LINK}</ThemedText>
        </TouchableOpacity>
      </View>
      <ThemedText style={styles.without}>{copy.without}</ThemedText>
      {error ? (
        <ThemedText style={styles.error} accessibilityRole="alert">{error}</ThemedText>
      ) : null}
      <View style={styles.pair}>
        <PrimaryButton
          label={DONT_ALLOW_LABEL}
          variant="secondary"
          onPress={() => onChoose('dont_allow')}
          loading={saving === 'dont_allow'}
          disabled={busy && saving !== 'dont_allow'}
          style={styles.pairButton}
          testID="consent-dont-allow"
        />
        <PrimaryButton
          label={ALLOW_LABEL}
          onPress={() => onChoose('allow')}
          loading={saving === 'allow'}
          disabled={busy && saving !== 'allow'}
          style={styles.pairButton}
          testID="consent-allow"
        />
      </View>
      <TouchableOpacity
        onPress={onNotNow}
        disabled={busy}
        accessibilityRole="button"
        style={styles.notNow}
        testID="consent-not-now"
      >
        <ThemedText style={styles.notNowText}>{copy.notNow}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

function BenefitRow({ benefit, icon }: { benefit: ConsentBenefit; icon: 'label' | 'eye' }) {
  return (
    <View style={styles.benefit} accessible>
      <View style={styles.benefitIcon}>
        {icon === 'label'
          ? <ScanText size={18} color={theme.colorAccentInk} strokeWidth={2} />
          : <ScanEye size={18} color={theme.colorAccentInk} strokeWidth={2} />}
      </View>
      <View style={styles.benefitBody}>
        <ThemedText style={styles.benefitTitle}>{benefit.title}</ThemedText>
        <ThemedText style={styles.benefitDetail}>{benefit.detail}</ThemedText>
      </View>
    </View>
  );
}

// Frame B. Also used by Settings, which shows it in place of its own content.
export function WhatsSentPanel({ petName, onDone }: { petName: string | null; onDone: () => void }) {
  async function openPolicy() {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (e) {
      console.warn('[AiConsentSheet] open privacy policy failed:', e);
      Alert.alert("Couldn't open link", `You can find our privacy policy at ${PRIVACY_POLICY_URL}.`);
    }
  }
  return (
    <View>
      <View style={styles.whatsSentHead}>
        <ThemedText style={styles.whatsSentTitle} accessibilityRole="header">{WHATS_SENT_TITLE}</ThemedText>
        <TouchableOpacity onPress={onDone} accessibilityRole="button" hitSlop={8} testID="whats-sent-done">
          <ThemedText style={styles.link}>{WHATS_SENT_DONE}</ThemedText>
        </TouchableOpacity>
      </View>
      {whatsSentSections(petName).map((s) => (
        <View key={s.title} style={styles.section} accessible>
          <ThemedText style={styles.sectionTitle}>{s.title}</ThemedText>
          <ThemedText style={styles.sectionBody}>{s.body}</ThemedText>
        </View>
      ))}
      <TouchableOpacity onPress={openPolicy} accessibilityRole="link" hitSlop={8} style={styles.policy}>
        <ThemedText style={styles.link}>{PRIVACY_POLICY_LINK}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

interface SheetProps extends PanelProps {
  visible: boolean;
  /** iOS: the Modal finished sliding away, so the door may open the camera. */
  onDismissed?: () => void;
}

export function AiConsentSheet({ visible, onDismissed, ...panel }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android back is Not now: it writes nothing, so leaving can never answer.
      onRequestClose={panel.saving ? () => {} : panel.onNotNow}
      onDismiss={onDismissed}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }]}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />
          {/* A ScrollView so that at the largest text sizes the buttons scroll into
              reach rather than off the screen: a consent sheet must never make
              declining unreachable (NotificationPrimer's rule). */}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <AiConsentPanel {...panel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colorScrim,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: theme.colorSurface,
    borderTopLeftRadius: theme.radiusLarge,
    borderTopRightRadius: theme.radiusLarge,
    paddingHorizontal: theme.space3,
    paddingTop: theme.space1,
  },
  grab: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorBorderStrong,
    marginBottom: theme.space2,
  },
  art: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: theme.radiusMedium,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space2,
  },
  headline: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textXL,
    color: theme.colorTextPrimary,
    textAlign: 'center',
    marginBottom: theme.space2,
  },
  benefits: {
    gap: theme.space2,
    marginBottom: theme.space2,
  },
  benefit: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitBody: {
    flex: 1,
    minWidth: 0,
  },
  benefitTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  benefitDetail: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space0_5,
  },
  disclosure: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    padding: theme.space1,
    marginBottom: theme.space1,
  },
  disclosureText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  disclosureStrong: {
    fontSize: theme.textSM,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  linkWrap: {
    alignSelf: 'flex-start',
    marginTop: theme.space1,
  },
  link: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: theme.colorAccentInk,
  },
  without: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
  },
  error: {
    fontSize: theme.textSM,
    color: theme.colorDestructive,
    marginBottom: theme.space1,
  },
  pair: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  pairButton: {
    flex: 1,
  },
  notNow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space1,
  },
  notNowText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  whatsSentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space2,
  },
  whatsSentTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: theme.textLG,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  section: {
    marginBottom: theme.space2,
  },
  sectionTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  sectionBody: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space0_5,
  },
  policy: {
    alignSelf: 'flex-start',
    marginBottom: theme.space2,
  },
});
