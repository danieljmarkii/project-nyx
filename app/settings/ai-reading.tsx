import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ScanEye, ScanText, MessageCircle } from 'lucide-react-native';
import { colorRoles, theme } from '../../constants/theme';
import { Card, Header, PrimaryButton, ThemedText } from '../../components/ui';
import { Skeleton } from '../../components/ui/Skeleton';
import { WhatsSentPanel } from '../../components/consent/AiConsentSheet';
import { useAuthStore } from '../../store/authStore';
import { usePetStore } from '../../store/petStore';
import { loadAiConsent, saveAiConsent } from '../../store/aiConsentStore';
import { hasEverGrantedAiConsent, type AiConsentRow } from '../../lib/aiConsent';
import { useAllowlistFlag } from '../../hooks/useAppConfig';
import {
  ALLOW_LABEL,
  CONSENT_WRITE_FAILED,
  DONT_ALLOW_LABEL,
  LABEL_BENEFIT_SETTINGS,
  READS_STAY_LINE,
  SETTINGS_READ_FAILED,
  SETTINGS_RETRY,
  SETTINGS_SCREEN_TITLE,
  SETTINGS_VALUE_NOT_SET,
  SETTINGS_WITHOUT,
  WHATS_SENT_LINK,
  askBenefitSettings,
  consentPetName,
  offLine,
  onSinceLine,
  readBenefit,
  settingsDisclosure,
  type ConsentBenefit,
} from '../../constants/aiConsentCopy';

// Settings → AI reading (CUL-1834; mock round 4, frames J, K and L). The one place
// an owner can always change the AI consent, and the path the App Review notes name.
//
// The switch writes on every flip, with no confirm in either direction (round 3
// ruling): turning it off is a withdrawal the owner must be able to make in one
// tap, and turning it on is the same yes a door asks for, written with a
// legal_acceptances row against the copy on this screen. While no answer is on
// file (L), Allow and Don't allow stand in for the switch, because a switch has to
// sit at on or off and either would look like an answer already given.
//
// Source 'settings' on every write here. The read is fresh on every focus: the
// answer may have changed on another phone, and this is the screen that must not be
// wrong about it (C-12: a read that has not answered is a skeleton, a failed one is
// an error with a retry, never an empty state).

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; row: AiConsentRow | null; everGranted: boolean };

export default function AiReadingSettingsScreen() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const pets = usePetStore((s) => s.pets);
  const askOn = useAllowlistFlag('ask_enabled');
  const pet = consentPetName(pets.map((p) => p.name));

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [saving, setSaving] = useState<boolean | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [showWhatsSent, setShowWhatsSent] = useState(false);

  // Every read and every write takes a ticket; a read lands only if nothing newer
  // started after it. Without this, a focus read in flight when the owner flips the
  // switch would put the previous answer back on screen once it returned.
  const ticket = useRef(0);

  const read = useCallback(async () => {
    if (!userId) {
      setLoad({ kind: 'error' });
      return;
    }
    const mine = ++ticket.current;
    setLoad({ kind: 'loading' });
    const [current, everGranted] = await Promise.all([
      loadAiConsent(userId),
      hasEverGrantedAiConsent(userId),
    ]);
    if (mine !== ticket.current) return;
    if (current.status === 'error') {
      setLoad({ kind: 'error' });
      return;
    }
    // A current yes is a past yes too, whatever the history read said: the reads line
    // must not vanish because that second read failed.
    setLoad({ kind: 'ready', row: current.row, everGranted: everGranted || current.row?.granted === true });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      read().catch((e) => {
        console.warn('[settings/ai-reading] read failed:', e);
        setLoad({ kind: 'error' });
      });
    }, [read]),
  );

  async function write(granted: boolean) {
    if (!userId || saving !== null) return;
    ++ticket.current;
    setSaving(granted);
    setWriteError(null);
    let result: Awaited<ReturnType<typeof saveAiConsent>> = { status: 'error' };
    try {
      result = await saveAiConsent(userId, granted, 'settings');
    } catch (e) {
      console.warn('[settings/ai-reading] write failed:', e);
    } finally {
      setSaving(null);
    }
    if (result.status === 'error') {
      // The switch never moved: it renders from the saved row, so a failed write
      // leaves it where the server is, and the line under it says so.
      setWriteError(CONSENT_WRITE_FAILED);
      return;
    }
    setLoad((prev) => ({
      kind: 'ready',
      row: result.row,
      everGranted: (prev.kind === 'ready' && prev.everGranted) || granted,
    }));
  }

  if (showWhatsSent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title={SETTINGS_SCREEN_TITLE} leading="back" onLeadingPress={() => setShowWhatsSent(false)} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card>
            <WhatsSentPanel petName={pet} onDone={() => setShowWhatsSent(false)} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const benefits: ConsentBenefit[] = [LABEL_BENEFIT_SETTINGS, readBenefit(pet)];
  if (askOn) benefits.push(askBenefitSettings(pet));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title={SETTINGS_SCREEN_TITLE} leading="back" onLeadingPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {load.kind === 'loading' && (
          <Card>
            <View
              style={styles.skeleton}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="ai-reading-skeleton"
            >
              <Skeleton width="40%" height={16} />
              <Skeleton height={12} />
              <Skeleton height={12} />
              <Skeleton width="70%" height={12} />
            </View>
          </Card>
        )}

        {load.kind === 'error' && (
          <Card>
            <ThemedText style={styles.body}>{SETTINGS_READ_FAILED}</ThemedText>
            <TouchableOpacity
              onPress={() => { read().catch(() => setLoad({ kind: 'error' })); }}
              accessibilityRole="button"
              style={styles.retry}
            >
              <ThemedText style={styles.link}>{SETTINGS_RETRY}</ThemedText>
            </TouchableOpacity>
          </Card>
        )}

        {load.kind === 'ready' && (
          <Card>
            <View style={styles.titleRow}>
              <ThemedText style={styles.title} accessibilityRole="header">{SETTINGS_SCREEN_TITLE}</ThemedText>
              {load.row ? (
                <Switch
                  value={load.row.granted}
                  onValueChange={(next) => { write(next).catch(() => setWriteError(CONSENT_WRITE_FAILED)); }}
                  disabled={saving !== null}
                  trackColor={{ true: colorRoles.action.onLight, false: theme.colorBorderStrong }}
                  ios_backgroundColor={theme.colorBorderStrong}
                  accessibilityLabel={SETTINGS_SCREEN_TITLE}
                  testID="ai-reading-switch"
                />
              ) : (
                <ThemedText style={styles.notSet}>{SETTINGS_VALUE_NOT_SET}</ThemedText>
              )}
            </View>

            <View style={[styles.benefits, load.row && !load.row.granted && styles.dimmed]}>
              {benefits.map((b, i) => (
                <View key={b.title} style={styles.benefit} accessible>
                  <View style={styles.benefitIcon}>
                    {i === 0
                      ? <ScanText size={18} color={theme.colorAccentInk} strokeWidth={2} />
                      : i === 1
                        ? <ScanEye size={18} color={theme.colorAccentInk} strokeWidth={2} />
                        : <MessageCircle size={18} color={theme.colorAccentInk} strokeWidth={2} />}
                  </View>
                  <View style={styles.benefitBody}>
                    <ThemedText style={styles.benefitTitle}>{b.title}</ThemedText>
                    <ThemedText style={styles.benefitDetail}>{b.detail}</ThemedText>
                  </View>
                </View>
              ))}
            </View>

            {load.row?.granted && (
              <ThemedText style={styles.stateLine}>{onSinceLine(load.row.decidedAt)}</ThemedText>
            )}
            {load.row && !load.row.granted && (
              <ThemedText style={styles.stateLine}>
                {offLine(pet, askOn)}
                {load.everGranted ? ` ${READS_STAY_LINE}` : ''}
              </ThemedText>
            )}

            <View style={styles.disclosure}>
              <ThemedText style={styles.disclosureText}>
                {settingsDisclosure(pet, askOn, !!load.row && !load.row.granted)}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowWhatsSent(true)}
                accessibilityRole="button"
                style={styles.linkWrap}
              >
                <ThemedText style={styles.link}>{WHATS_SENT_LINK}</ThemedText>
              </TouchableOpacity>
            </View>

            {!load.row && (
              <>
                <ThemedText style={styles.body}>{SETTINGS_WITHOUT}</ThemedText>
                <View style={styles.pair}>
                  <PrimaryButton
                    label={DONT_ALLOW_LABEL}
                    variant="secondary"
                    onPress={() => { write(false).catch(() => setWriteError(CONSENT_WRITE_FAILED)); }}
                    loading={saving === false}
                    disabled={saving === true}
                    style={styles.pairButton}
                    testID="ai-reading-dont-allow"
                  />
                  <PrimaryButton
                    label={ALLOW_LABEL}
                    onPress={() => { write(true).catch(() => setWriteError(CONSENT_WRITE_FAILED)); }}
                    loading={saving === true}
                    disabled={saving === false}
                    style={styles.pairButton}
                    testID="ai-reading-allow"
                  />
                </View>
              </>
            )}

            {writeError ? (
              <ThemedText style={styles.error} accessibilityRole="alert">{writeError}</ThemedText>
            ) : null}
          </Card>
        )}
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
  skeleton: {
    gap: theme.space1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: theme.space2,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
  },
  notSet: {
    fontSize: theme.textMD,
    color: theme.colorTextTertiary,
  },
  benefits: {
    gap: theme.space2,
    marginBottom: theme.space2,
  },
  dimmed: {
    opacity: 0.5,
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
  stateLine: {
    fontSize: theme.textSM,
    color: theme.colorTextPrimary,
    marginBottom: theme.space2,
  },
  disclosure: {
    backgroundColor: theme.colorSurfaceSubtle,
    borderRadius: theme.radiusSmall,
    padding: theme.space1,
    marginBottom: theme.space2,
  },
  disclosureText: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
  },
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
  body: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginBottom: theme.space2,
  },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  pair: {
    flexDirection: 'row',
    gap: theme.space1,
  },
  pairButton: {
    flex: 1,
  },
  error: {
    fontSize: theme.textSM,
    color: theme.colorDestructive,
    marginTop: theme.space1,
  },
});
