import { useCallback, useEffect, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header, PrimaryButton, SkeletonCard, ThemedText } from '../../components/ui';
import { ANONYMOUS_PET_NAME, resolveRecordPetName, usePetStore } from '../../store/petStore';
import { androidTextZoom, isPreviewLoadAllowed } from '../../lib/reportPreviewV2';
import {
  asSentLine,
  COPY_FAILED,
  COPY_TITLE_PENDING,
  COPY_OFFLINE,
  COPY_UNAVAILABLE,
  copyTitle,
  NEW_REPORT_LABEL,
  newReportSubline,
  openSavedReport,
  readSavedReport,
  type SavedReport,
} from '../../lib/reportLibrary';

// One saved report, exactly as it was sent (Vet report v2 PR-21, CUL-2301; spec §11.1, §11.3).
//
// THE STORED HTML, UNCHANGED. The server returns the bytes it kept at send, and only while they
// still match the hash frozen with the row (`generate-report` `mode: 'open'`); this screen draws
// them in a WebView locked like the preview's (no script, nothing loads but the document itself).
// The paper never moves (spec §14).
//
// ONE ACTION, AND IT NEVER READS AS UPDATING THIS COPY (WBC-4): "New report through today" opens
// the composer for a NEW report, and its sub-line says this copy stays exactly as sent.
//
// WHOSE RECORD (C-9): the title names the pet the ROW belongs to, never the active pet. A `pet`
// param this account does not hold opens nothing.

type Copy =
  | { kind: 'loading' }
  | { kind: 'ok'; html: string }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

export default function SavedReportScreen() {
  const pets = usePetStore((s) => s.pets);
  const { id, pet } = useLocalSearchParams<{ id?: string; pet?: string }>();
  const held = typeof pet === 'string' && pets.some((p) => p.id === pet);
  const [row, setRow] = useState<SavedReport | null>(null);
  const [copy, setCopy] = useState<Copy>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (typeof id !== 'string' || typeof pet !== 'string' || !held) {
      setCopy({ kind: 'unavailable' });
      return;
    }
    setCopy({ kind: 'loading' });
    const [r, opened] = await Promise.all([readSavedReport(pet, id), openSavedReport(pet, id)]);
    if (r !== 'failed') setRow(r);
    setCopy(opened.kind === 'ok' && r === null ? { kind: 'unavailable' } : opened);
  }, [id, pet, held]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentYear = new Date().getFullYear();
  const petName = resolveRecordPetName(pets, row?.petId ?? null);
  const title = row ? copyTitle(petName, ANONYMOUS_PET_NAME, row.sharedAt, currentYear) : COPY_TITLE_PENDING;
  const message = copy.kind === 'offline' ? COPY_OFFLINE : copy.kind === 'unavailable' ? COPY_UNAVAILABLE : copy.kind === 'failed' ? COPY_FAILED : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={title} leading="back" onLeadingPress={() => router.back()} titleBelowAtLargeText />
      {row && copy.kind === 'ok' && (
        <ThemedText variant="caption" style={styles.asSent} testID="report-as-sent">
          {asSentLine(row.sharedAt, currentYear)}
        </ThemedText>
      )}
      <View style={styles.paper}>
        {copy.kind === 'loading' && <SkeletonCard style={styles.wait} />}
        {copy.kind === 'ok' && (
          <WebView
            testID="report-copy"
            style={styles.web}
            originWhitelist={['about:*', 'data:*']}
            source={{ html: copy.html }}
            // The stored print page carries no script; nothing on paper runs or loads.
            javaScriptEnabled={false}
            // Health bytes never land in the WebView's own storage, outside every wipe path
            // (DocumentPdfViewer's precedent; rls-privacy-reviewer F2).
            incognito
            cacheEnabled={false}
            onShouldStartLoadWithRequest={(req) => isPreviewLoadAllowed(req.url)}
            // The owner's text size reaches the page on Android, as in the preview.
            textZoom={Platform.OS === 'android' ? androidTextZoom(PixelRatio.getFontScale()) : undefined}
            showsVerticalScrollIndicator
          />
        )}
        {message !== null && (
          <View style={styles.message} testID={`report-${copy.kind}`}>
            <ThemedText variant="caption" style={styles.messageText}>{message}</ThemedText>
            {copy.kind !== 'unavailable' && <PrimaryButton label="Try again" variant="secondary" onPress={() => void load()} />}
          </View>
        )}
      </View>
      {row && (
        <View style={styles.footer}>
          <PrimaryButton label={NEW_REPORT_LABEL} onPress={() => router.push('/report')} testID="report-new" />
          <ThemedText variant="note" style={styles.subline}>{newReportSubline(row.sharedAt, currentYear)}</ThemedText>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colorNeutralLight },
  asSent: { color: theme.colorTextSecondary, paddingHorizontal: theme.space3, paddingBottom: theme.space1_5 },
  paper: { flex: 1, backgroundColor: theme.colorSurface },
  wait: { margin: theme.space3 },
  web: { flex: 1, backgroundColor: theme.colorSurface },
  message: { padding: theme.space3, gap: theme.space2 },
  messageText: { color: theme.colorTextSecondary },
  footer: { padding: theme.space3, gap: theme.space1 },
  subline: { color: theme.colorTextSecondary, textAlign: 'center' },
});
