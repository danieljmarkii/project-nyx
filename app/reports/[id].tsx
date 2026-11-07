import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../constants/theme';
import { Header, PrimaryButton, SkeletonCard, ThemedText } from '../../components/ui';
import { VisitLinkSheet } from '../../components/reportV2/VisitLinkSheet';
import { boxedPreviewHtml } from '../../components/reportV2/ReportPreviewV2';
import { savedCopyWarningOf } from '../../lib/examRoom';
import { ANONYMOUS_PET_NAME, resolveRecordPetName, usePetStore } from '../../store/petStore';
import { REPORT_FRAME_PROPS, androidTextZoom } from '../../lib/reportPreviewV2';
import {
  asSentLine,
  COPY_FAILED,
  COPY_TITLE_PENDING,
  COPY_OFFLINE,
  COPY_UNAVAILABLE,
  copyTitle,
  departureLine,
  departuresHeading,
  SENDS_SHOWN,
  showAllSendsLabel,
  NEW_REPORT_LABEL,
  newReportSubline,
  openSavedReport,
  readDepartures,
  readSavedReport,
  type Departure,
  type SavedReport,
} from '../../lib/reportLibrary';
import {
  ATTACH_LABEL,
  CHANGE_LABEL,
  LINK_FAILED,
  LINK_OFFLINE,
  LINK_REFUSED,
  linkedLine,
  linkOptions,
  linkSavedReport,
  pickerEmpty,
  readReportLink,
  type VisitLinkOption,
  type VisitLinkTarget,
} from '../../lib/reportVisitLink';
import { readVetVisitsHome } from '../../lib/vetVisits';

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
// ITS VISIT (PR-22, CUL-2302): a copy can be filed under the visit or booking it was for, now or
// later, or under none. Provenance only: filing it changes nothing in the copy, so the line sits
// with the footer, never on the paper. The link row shows only once its read answered; a failed
// read hides it rather than offering "Attach" over a copy that may already be filed (C-12).
//
// EVERY SEND (CUL-2445, migration 119): the footer lists each time this copy left the phone,
// newest first. The paper is the same every time, so the list sits with the provenance, never on
// the paper. It shows only once its read answered in full; a failed read shows nothing rather than
// a shorter history that would read as the whole one (C-12).
//
// WHOSE RECORD (C-9): the title names the pet the ROW belongs to, never the active pet. A `pet`
// param this account does not hold opens nothing. Each load clears the previous copy's row first,
// and an answer for an earlier id, pet or attempt never lands (CUL-2477).
//
// THE BARS NEVER SHOW WITHOUT THEIR WARNING (CUL-2467, PM go on option (a)). The stored copy is
// the PRINTED page, which has no pin and no keep-together spacer. Above it this screen pins the
// page's own confounder line, in full (`savedCopyWarningOf`, lib/examRoom.ts), as a native
// sibling, never an overlay: no scroll or zoom of the page can move the bars away from it. The
// strip has no height cap, so a long line shrinks the paper, never the warning. A page whose line
// cannot be read back shows no paper at all.
//
// BOXED IN LIKE THE PREVIEW (CUL-2487, CUL-2469). The page opens with the one frame lock
// (`boxedPreviewHtml`: the room's CSP, DNS prefetch off, the lock script, frame and link tags
// renamed inert). The frame spreads REPORT_FRAME_PROPS (lib/reportPreviewV2.ts), as every v2 report frame does:
// every navigation reaches the one load check (`reportFrameLoadAllowed`, which refuses every
// `data:` navigation; privacy passes 1 and 2), and no window ever opens.

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
  const [link, setLink] = useState<VisitLinkTarget | null | 'unknown'>('unknown');
  const [options, setOptions] = useState<VisitLinkOption[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sends, setSends] = useState<Departure[] | null>(null);
  const [allSends, setAllSends] = useState(false);
  // Every load (a params change, or "Try again") takes a number; only the newest one may land.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setRow(null);
    if (typeof id !== 'string' || typeof pet !== 'string' || !held) {
      setCopy({ kind: 'unavailable' });
      return;
    }
    setCopy({ kind: 'loading' });
    const [r, opened] = await Promise.all([readSavedReport(pet, id), openSavedReport(pet, id)]);
    if (seq !== loadSeq.current) return;
    if (r !== 'failed') setRow(r);
    setCopy(opened.kind === 'ok' && r === null ? { kind: 'unavailable' } : opened);
  }, [id, pet, held]);

  useEffect(() => {
    void load();
    return () => {
      // An answer that arrives after the screen moved on (or unmounted) never lands.
      loadSeq.current += 1;
    };
  }, [load]);

  // The copy's link and the picker's choices. A read for an earlier copy never lands on this one.
  useEffect(() => {
    let live = true;
    setLink('unknown');
    setLinkError(null);
    if (typeof id !== 'string' || typeof pet !== 'string' || !held) return;
    void (async () => {
      try {
        const [current, home] = await Promise.all([readReportLink(pet, id), readVetVisitsHome(pet)]);
        if (!live) return;
        setOptions(linkOptions(home));
        setLink(current === 'failed' ? 'unknown' : current);
      } catch (e) {
        console.warn('[saved-report] the visit link could not be read:', e);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, pet, held]);

  // The copy's send history. A read for an earlier copy never lands on this one.
  useEffect(() => {
    let live = true;
    setSends(null);
    setAllSends(false);
    if (typeof id !== 'string' || typeof pet !== 'string' || !held) return;
    void readDepartures(pet, id).then((out) => {
      if (live && out.kind === 'ok' && out.departures.length > 0) setSends(out.departures);
    });
    return () => {
      live = false;
    };
  }, [id, pet, held]);

  const pick = useCallback(
    async (target: VisitLinkTarget | null) => {
      setPicking(false);
      // One write at a time: a second tap while one is in flight does nothing.
      if (saving || typeof id !== 'string' || typeof pet !== 'string') return;
      setSaving(true);
      setLinkError(null);
      const out = await linkSavedReport(pet, id, target);
      setSaving(false);
      if (out.kind === 'ok') setLink(target);
      else setLinkError(out.kind === 'offline' ? LINK_OFFLINE : out.kind === 'refused' ? LINK_REFUSED : LINK_FAILED);
    },
    [id, pet, saving],
  );

  const currentYear = new Date().getFullYear();
  const petName = resolveRecordPetName(pets, row?.petId ?? null);
  const title = row ? copyTitle(petName, ANONYMOUS_PET_NAME, row.sharedAt, currentYear) : COPY_TITLE_PENDING;
  const warning = useMemo(() => (copy.kind === 'ok' ? savedCopyWarningOf(copy.html) : null), [copy]);
  const boxedHtml = useMemo(() => (copy.kind === 'ok' ? boxedPreviewHtml(copy.html) : null), [copy]);
  // A printed page whose warning cannot be read back is never drawn (CUL-2467): it reads as a
  // copy that cannot be shown, and the vet's copy is untouched.
  const shown = copy.kind === 'ok' && warning !== null && warning.kind !== 'refuse';
  const message = copy.kind === 'ok' && !shown ? COPY_UNAVAILABLE : copy.kind === 'offline' ? COPY_OFFLINE : copy.kind === 'unavailable' ? COPY_UNAVAILABLE : copy.kind === 'failed' ? COPY_FAILED : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Header title={title} leading="back" onLeadingPress={() => router.back()} titleBelowAtLargeText />
      {row && shown && (
        <ThemedText variant="caption" style={styles.asSent} testID="report-as-sent">
          {asSentLine(row.sharedAt, currentYear)}
        </ThemedText>
      )}
      <View style={styles.paper}>
        {copy.kind === 'loading' && <SkeletonCard style={styles.wait} />}
        {shown && warning?.kind === 'pin' && (
          // The line's own words are in the page below; this repeat is for the eye only, as the
          // reflow's pin is (aria-hidden there). Taller than the paper (a long line at the largest
          // text), it scrolls inside the paper rather than clip, and the page below gets nothing.
          <ScrollView
            testID="report-copy-warning"
            style={styles.warningScroll}
            contentContainerStyle={styles.warning}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <ThemedText style={styles.warningText}>{warning.text}</ThemedText>
          </ScrollView>
        )}
        {shown && boxedHtml !== null && (
          <WebView
            testID="report-copy"
            style={styles.web}
            // The one frame lock (CUL-2469, CUL-2494): load check, no window, the lock head.
            {...REPORT_FRAME_PROPS}
            source={{ html: boxedHtml }}
            // The stored print page carries no script; nothing on paper runs or loads.
            javaScriptEnabled={false}
            // Health bytes never land in the WebView's own storage, outside every wipe path
            // (DocumentPdfViewer's precedent; rls-privacy-reviewer F2).
            incognito
            cacheEnabled={false}
            // The owner's text size reaches the page on Android, as in the preview.
            textZoom={Platform.OS === 'android' ? androidTextZoom(PixelRatio.getFontScale()) : undefined}
            showsVerticalScrollIndicator
          />
        )}
        {message !== null && (
          <View style={styles.message} testID={`report-${copy.kind === 'ok' ? 'unavailable' : copy.kind}`}>
            <ThemedText variant="caption" style={styles.messageText}>{message}</ThemedText>
            {copy.kind !== 'unavailable' && copy.kind !== 'ok' && <PrimaryButton label="Try again" variant="secondary" onPress={() => void load()} />}
          </View>
        )}
      </View>
      {row && (
        <View style={styles.footer}>
          {sends !== null && (
            <View style={styles.sends} testID="report-sends">
              <ThemedText variant="caption" style={styles.sendsHeading} testID="report-sends-heading">
                {departuresHeading(sends.length)}
              </ThemedText>
              {(allSends ? sends : sends.slice(0, SENDS_SHOWN)).map((d) => (
                <ThemedText key={d.id} variant="caption" style={styles.sendLine} testID="report-send">
                  {departureLine(d, currentYear)}
                </ThemedText>
              ))}
              {!allSends && sends.length > SENDS_SHOWN && (
                <PrimaryButton
                  label={showAllSendsLabel(sends.length)}
                  variant="secondary"
                  onPress={() => setAllSends(true)}
                  testID="report-sends-all"
                />
              )}
            </View>
          )}
          {link !== 'unknown' && (
            <View style={styles.visit} testID="report-visit">
              {link === null ? (
                <PrimaryButton
                  label={ATTACH_LABEL}
                  variant="secondary"
                  loading={saving}
                  onPress={() => setPicking(true)}
                  testID="report-visit-attach"
                />
              ) : (
                <View style={styles.visitLine}>
                  <ThemedText variant="caption" style={styles.visitText} testID="report-visit-line">
                    {linkedLine(link, options)}
                  </ThemedText>
                  <PrimaryButton
                    label={CHANGE_LABEL}
                    variant="secondary"
                    loading={saving}
                    onPress={() => setPicking(true)}
                    testID="report-visit-change"
                  />
                </View>
              )}
              {linkError !== null && (
                <ThemedText variant="caption" style={styles.visitError} testID="report-visit-error">{linkError}</ThemedText>
              )}
            </View>
          )}
          <PrimaryButton label={NEW_REPORT_LABEL} onPress={() => router.push('/report')} testID="report-new" />
          <ThemedText variant="note" style={styles.subline}>{newReportSubline(row.sharedAt, currentYear)}</ThemedText>
        </View>
      )}
      {picking && link !== 'unknown' && (
        <VisitLinkSheet
          options={options}
          current={link}
          emptyText={pickerEmpty(petName, ANONYMOUS_PET_NAME)}
          onPick={(t) => void pick(t)}
          onClose={() => setPicking(false)}
        />
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
  // Its own height up to the whole paper, never more: the page takes what is left.
  warningScroll: { flexGrow: 0, flexShrink: 1 },
  // The preview's printed-view pin (ReportPreviewV2), so the two read as one warning.
  warning: {
    backgroundColor: theme.colorSurface,
    paddingHorizontal: theme.space2,
    paddingVertical: theme.space1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colorBorder,
  },
  warningText: {
    fontSize: theme.textLG,
    lineHeight: theme.lineHeightLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorEventSymptomInk,
  },
  message: { padding: theme.space3, gap: theme.space2 },
  messageText: { color: theme.colorTextSecondary },
  footer: { padding: theme.space3, gap: theme.space1 },
  subline: { color: theme.colorTextSecondary, textAlign: 'center' },
  sends: { gap: theme.space0_5, paddingBottom: theme.space1 },
  sendsHeading: { color: theme.colorTextPrimary },
  sendLine: { color: theme.colorTextSecondary },
  visit: { gap: theme.space1, paddingBottom: theme.space1 },
  visitLine: { flexDirection: 'row', alignItems: 'center', gap: theme.space2 },
  visitText: { flex: 1, color: theme.colorTextSecondary },
  visitError: { color: theme.colorTextSecondary },
});
