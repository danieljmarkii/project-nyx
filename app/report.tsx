import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { theme } from '../constants/theme';
import { Header, PrimaryButton } from '../components/ui';
import { usePetStore } from '../store/petStore';
import { generateVetReport, shareReportPdf, type VetReport } from '../lib/pdf';

// Vet report — owner-facing MVP (Step 9, Phase 2 PR 5).
//
// The owner opens "Vet report" and sees the report *inside the app* (a WebView of
// the server-rendered clinical HTML — never a downloaded .html file, §8.2), then
// taps "Send to vet" to hand it over as a PDF via the native share sheet. No public
// link / no unauthenticated path yet (PR 6). The report always renders SOMETHING —
// the empty/sparse states are designed into the HTML by render.ts (Principle 5) —
// so there is no "no data" screen state here; only loading / error.

type Status = 'loading' | 'ready' | 'error';

export default function ReportScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('loading');
  const [report, setReport] = useState<VetReport | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sharing, setSharing] = useState(false);

  // `token` guards against a stale response: if the active pet changes while a
  // generate call is in flight, the older response must not overwrite the newer one.
  const load = useCallback(
    async (token?: { cancelled: boolean }) => {
      if (!activePet) {
        setErrorMsg('Add a pet before generating a report.');
        setStatus('error');
        return;
      }
      setStatus('loading');
      try {
        const r = await generateVetReport({ petId: activePet.id });
        if (token?.cancelled) return;
        setReport(r);
        setStatus('ready');
      } catch (e) {
        if (token?.cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : 'Something went wrong preparing the report.');
        setStatus('error');
      }
    },
    [activePet],
  );

  // Generate once per active pet. The report is a snapshot; the owner re-opens the
  // screen (or taps Try again) to regenerate against the latest data.
  useEffect(() => {
    const token = { cancelled: false };
    load(token);
    return () => {
      token.cancelled = true;
    };
  }, [load]);

  const onShare = useCallback(async () => {
    if (!report) return;
    setSharing(true);
    try {
      const shared = await shareReportPdf(report);
      if (!shared) {
        Alert.alert('Sharing unavailable', "This device can't open a share sheet.");
      }
    } catch (e) {
      Alert.alert("Couldn't create the PDF", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [report]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Vet report" leading="back" onLeadingPress={() => router.back()} />

      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colorTextSecondary} />
          <Text style={styles.muted}>
            Putting together {activePet ? `${activePet.name}’s` : 'the'} report…
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn’t prepare the report</Text>
          <Text style={styles.muted}>{errorMsg}</Text>
          <PrimaryButton label="Try again" onPress={() => load()} variant="secondary" style={styles.retry} />
        </View>
      )}

      {status === 'ready' && report && (
        <>
          <WebView
            style={styles.web}
            originWhitelist={['*']}
            source={{ html: report.html }}
            // The report is static, self-contained clinical HTML — no scripts, no
            // third-party subresources (§8). Disabling JS keeps the surface minimal.
            javaScriptEnabled={false}
            showsVerticalScrollIndicator
          />
          <View style={[styles.bar, { paddingBottom: insets.bottom + theme.space2 }]}>
            {report.photoCount > 0 && (
              // Owner visibility (spec §8): before sending, the owner sees how many of their own
              // incident photos this report hands to the vet. The interactive "tap to exclude any"
              // review is the deferred fast-follow (B-236) that builds on this.
              <Text style={styles.barPhotos}>
                Includes {report.photoCount} photo{report.photoCount === 1 ? '' : 's'} from logged incidents.
              </Text>
            )}
            <PrimaryButton
              label={sharing ? 'Preparing PDF…' : 'Send to vet'}
              onPress={onShare}
              disabled={sharing}
            />
            <Text style={styles.barHint}>
              Creates a PDF you can email, message, or AirDrop to your vet.
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorSurface },
  web: { flex: 1, backgroundColor: theme.colorSurface },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space3,
    gap: theme.space2,
  },
  muted: {
    fontFamily: theme.fontBody,
    fontSize: theme.textMD,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: theme.fontBodySemibold,
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  retry: { marginTop: theme.space2, paddingHorizontal: theme.space3 },
  bar: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space2,
    backgroundColor: theme.colorSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colorBorder,
    gap: theme.space1,
  },
  barHint: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
  barPhotos: {
    fontFamily: theme.fontBody,
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    textAlign: 'center',
  },
});
