import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colorRoles, theme } from '../../constants/theme';
import { ThemedText } from '../ui/ThemedText';
import { PrimaryButton } from '../ui/PrimaryButton';
import { WhatsSentPanel, type ConsentChoice } from './AiConsentSheet';
import { useAuthStore } from '../../store/authStore';
import { saveAiConsent } from '../../store/aiConsentStore';
import {
  ALLOW_LABEL,
  CONSENT_WRITE_FAILED,
  DONT_ALLOW_LABEL,
  RECORD_NOT_NOW,
  RECORD_NOT_READ_YET_BODY,
  RECORD_NOT_READ_YET_HEADING,
  RECORD_OFF_HEADING,
  RECORD_OFF_LINK,
  RECORD_READ_THIS_PHOTO,
  RECORD_TRY_AGAIN,
  RECORD_UNREAD_HEADING,
  WHATS_SENT_LINK,
  recordAskCopy,
  recordAskVetLineBesideCall,
  recordOffBesideCall,
  recordOffBody,
  recordVetLine,
  type RecordKind,
} from '../../constants/aiConsentCopy';
import { useSheetCap } from '../../hooks/useLayoutClass';

// The AI consent where a vomit or stool photo's read would sit (CUL-1835; mock round 4
// §3). Every frame here is a STATUS, never a verdict: none of them uses the read's card,
// tone or label, and each one that isn't a read carries the vet line, so a photo that
// wasn't read never looks like a photo that was checked (clinical-guardrails, CUL-552's
// "analysis off" rule).
//
// The ask is inline, never modal, and only ever after the save (Principle 1): ignoring it
// writes nothing. Its one Modal is What's sent, and nothing else presents from it (C-14).

// ── Frames D and E: no answer yet ──

export function RecordAskCard({
  kind,
  petName,
  onAllowed,
  onNotNow,
  besideCall = false,
}: {
  kind: RecordKind;
  petName: string | null;
  /** Under a call (frame G): the vet line backs the log instead of conditioning it. */
  besideCall?: boolean;
  /** The yes is saved: the record runs the read in place. */
  onAllowed: () => void;
  /** Nothing is written; the card is back next visit. */
  onNotNow: () => void;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [saving, setSaving] = useState<ConsentChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsSent, setWhatsSent] = useState(false);
  // A double tap sends one answer: the second press lands before `saving` re-renders.
  const inFlight = useRef(false);
  // Allow swaps this card for the pending read, so the write's last state update may land
  // after it has gone.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const copy = recordAskCopy(kind, petName);
  const busy = saving !== null;

  async function choose(choice: ConsentChoice) {
    if (inFlight.current) return;
    if (!userId) {
      setError(CONSENT_WRITE_FAILED);
      return;
    }
    inFlight.current = true;
    setSaving(choice);
    setError(null);
    try {
      // Every in-context door writes 'backstop' (team call on CUL-1832, no migration).
      const result = await saveAiConsent(userId, choice === 'allow', 'backstop');
      if (result.status !== 'saved') {
        if (mounted.current) setError(CONSENT_WRITE_FAILED);
        return;
      }
      // A no needs nothing more here: the store now holds it, and the record re-renders
      // to frame F. A yes reads this photo, because the owner just asked for exactly that.
      if (choice === 'allow') onAllowed();
    } catch (e) {
      console.warn('[RecordAskCard] consent write threw:', e);
      if (mounted.current) setError(CONSENT_WRITE_FAILED);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(null);
    }
  }

  return (
    <View style={styles.card} testID="record-consent-ask">
      <ThemedText style={styles.title} accessibilityRole="header">{copy.title}</ThemedText>
      <ThemedText style={styles.body}>{copy.body}</ThemedText>
      <View style={styles.disclosure}>
        <ThemedText style={styles.disclosureText}>{copy.disclosure}</ThemedText>
        <TouchableOpacity
          onPress={() => setWhatsSent(true)}
          accessibilityRole="button"
          style={styles.linkWrap}
          testID="record-consent-whats-sent"
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
          onPress={() => { void choose('dont_allow'); }}
          loading={saving === 'dont_allow'}
          disabled={busy && saving !== 'dont_allow'}
          style={styles.pairButton}
          testID="record-consent-dont-allow"
        />
        <PrimaryButton
          label={ALLOW_LABEL}
          onPress={() => { void choose('allow'); }}
          loading={saving === 'allow'}
          disabled={busy && saving !== 'allow'}
          style={styles.pairButton}
          testID="record-consent-allow"
        />
      </View>
      <TouchableOpacity
        onPress={onNotNow}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.notNow, busy ? styles.notNowBusy : null]}
        testID="record-consent-not-now"
      >
        <ThemedText style={styles.notNowText}>{RECORD_NOT_NOW}</ThemedText>
      </TouchableOpacity>
      <ThemedText style={styles.vetLine}>{besideCall ? recordAskVetLineBesideCall(petName) : copy.vetLine}</ThemedText>
      {/* Mounted only while open: nothing about the sheet costs the record until asked. */}
      {whatsSent ? <WhatsSentSheet petName={petName} onDone={() => setWhatsSent(false)} /> : null}
    </View>
  );
}

function WhatsSentSheet({ petName, onDone }: { petName: string | null; onDone: () => void }) {
  const sheetCap = useSheetCap();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space2 }, sheetCap]} accessibilityViewIsModal>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <WhatsSentPanel petName={petName} onDone={onDone} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Frames F and H, and the unread frame ──

export type RecordUnreadVariant = 'off' | 'read_this' | 'unread';

export function RecordUnreadStatus({
  kind,
  variant,
  petName,
  onTurnOn,
  onRead,
  reading,
  onTryAgain,
  framed = false,
}: {
  kind: RecordKind;
  variant: RecordUnreadVariant;
  petName: string | null;
  /** Frame F's way back: Settings → AI reading. */
  onTurnOn?: () => void;
  /** Frame H's one tap. */
  onRead?: () => void;
  reading?: boolean;
  /** The unread frame, when the photo was held because a read failed. */
  onTryAgain?: () => void;
  /** Drawn inside the record's read frame (CUL-1912, P3: every state that is not a read
   *  sits on the dashed edge), which supplies the box; this then draws only its content. */
  framed?: boolean;
}) {
  const heading =
    variant === 'off' ? RECORD_OFF_HEADING
    : variant === 'read_this' ? RECORD_NOT_READ_YET_HEADING
    : RECORD_UNREAD_HEADING;
  const body =
    variant === 'off' ? recordOffBody(petName)
    : variant === 'read_this' ? RECORD_NOT_READ_YET_BODY
    : null;
  return (
    <View style={framed ? styles.statusFramed : styles.status} testID={`record-consent-${variant}`}>
      <View style={styles.headingRow} accessible accessibilityRole="header">
        {/* A hollow dot, never a tick or a colour: nothing was found, nothing was checked. */}
        <View style={styles.dot} />
        <ThemedText style={styles.heading}>{heading}</ThemedText>
      </View>
      {body ? <ThemedText style={styles.body}>{body}</ThemedText> : null}
      {variant === 'off' && onTurnOn ? (
        <TouchableOpacity onPress={onTurnOn} accessibilityRole="link" style={styles.linkWrap} testID="record-consent-turn-on">
          <ThemedText style={styles.link}>{RECORD_OFF_LINK}</ThemedText>
        </TouchableOpacity>
      ) : null}
      {variant === 'read_this' && onRead ? (
        <PrimaryButton
          label={RECORD_READ_THIS_PHOTO}
          variant="secondary"
          onPress={onRead}
          loading={!!reading}
          style={styles.readButton}
          testID="record-consent-read-this"
        />
      ) : null}
      {variant === 'unread' && onTryAgain ? (
        <TouchableOpacity onPress={onTryAgain} accessibilityRole="button" style={styles.linkWrap} testID="record-consent-try-again">
          <ThemedText style={styles.link}>{RECORD_TRY_AGAIN}</ThemedText>
        </TouchableOpacity>
      ) : null}
      <ThemedText style={styles.vetLine}>{recordVetLine(kind, petName)}</ThemedText>
    </View>
  );
}

// ── Frame G: under a call, the photo unread and reading off ──
// It backs the log rather than discounting it, and carries no Turn on link: under a
// warning the one action is the call (round 4).
export function RecordOffBesideCall({ petName }: { petName: string | null }) {
  return (
    <View style={styles.besideCall} testID="record-consent-beside-call">
      <View style={styles.headingRow} accessible accessibilityRole="header">
        <View style={styles.dot} />
        <ThemedText style={styles.heading}>{RECORD_UNREAD_HEADING}</ThemedText>
      </View>
      <ThemedText style={styles.body}>{recordOffBesideCall(petName)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colorSurface,
    borderColor: theme.colorBorder,
    borderWidth: 1,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
  },
  title: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    marginBottom: theme.space1,
  },
  body: {
    fontSize: theme.textMD,
    color: theme.colorTextPrimary,
    lineHeight: theme.lineHeightBody,
  },
  disclosure: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    paddingHorizontal: theme.space1,
    paddingTop: theme.space1,
    marginTop: theme.space1,
    marginBottom: theme.space1,
  },
  disclosureText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
  // 44pt targets with no hitSlop (C-5): the link, the buttons and Not now stack flush.
  linkWrap: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontSize: theme.textSM,
    fontWeight: theme.weightMedium,
    color: colorRoles.action.onLight,
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
  notNowBusy: {
    opacity: theme.opacityDisabled,
  },
  notNowText: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextSecondary,
  },
  vetLine: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    lineHeight: theme.lineHeightBody,
    marginTop: theme.space1,
  },
  status: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderColor: theme.colorBorder,
    borderWidth: 1,
    borderRadius: theme.radiusMedium,
    padding: theme.space2,
    gap: theme.space1,
  },
  statusFramed: {
    gap: theme.space1,
  },
  besideCall: {
    marginTop: theme.space2,
    gap: theme.space1,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radiusFull,
    borderWidth: 1.5,
    borderColor: theme.colorTextSecondary,
  },
  heading: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    flexShrink: 1,
  },
  readButton: {
    alignSelf: 'flex-start',
  },
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
    paddingTop: theme.space2,
  },
});
