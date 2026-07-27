import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { MoreHorizontal } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { Header, PhotoViewer, PrimaryButton } from '../../components/ui';
import { WhorlSpinner } from '../../components/brand/WhorlSpinner';
import { DocumentHero } from '../../components/vetfiles/DocumentHero';
import { DocumentMetaCard, type MetaRow } from '../../components/vetfiles/DocumentMetaCard';
import { DocumentMoreMenu } from '../../components/vetfiles/DocumentMoreMenu';
import { DocumentPdfViewer } from '../../components/vetfiles/DocumentPdfViewer';
import {
  NameDocumentSheet,
  DocumentKindSheet,
  DocumentNotesSheet,
  DocumentDateSheet,
  DocumentVisitSheet,
} from '../../components/vetfiles/VetDocumentMetaSheets';
import { usePetStore } from '../../store/petStore';
import { getSignedUrls, stageForShare } from '../../lib/storage';
import { syncPendingVetDocuments } from '../../lib/sync';
import { VET_DOCUMENTS_BUCKET, type VetDocumentKind } from '../../lib/vetDocuments';
import {
  renameVetDocument,
  setVetDocumentKind,
  setVetDocumentNotes,
  setVetDocumentDate,
  linkVetDocumentVisit,
  softDeleteVetDocument,
  VET_DOCUMENT_SIGNED_URL_TTL_SEC,
} from '../../lib/vetDocumentLibrary';
import {
  readVetDocumentDetail,
  readVetVisitOptions,
  cacheVetDocumentPage,
  vetDocumentShareFilename,
  type VetDocumentDetail,
  type VetDocumentPage,
  type VetVisitOption,
} from '../../lib/vetDocumentDetail';

// Vet Files — document detail (B-478 VF-4).
// §4.3 + mock E-img-r2 / E-pdf-r2.
//
// The last unbuilt Vet Files surface, and the one the feature is actually FOR:
// §4.3 calls sharing "the single most important affordance after viewing" — the
// ER moment, where a vet asks for the last bloodwork and the answer has to be two
// taps rather than an inbox excavation. So the floor is Share alone, and the two
// lesser actions (Rename, Delete) live behind ⋯ rather than competing with it.
//
// Four things here are contracts rather than choices:
//
//  • **D7.** Linking a visit writes one column on this DOCUMENT and never touches
//    `vet_visits` — no INSERT, no re-date. The vet report's scope cascade keys its
//    first rung off `vet_visits.visited_at`, so a link that minted a visit would
//    silently move the window of every report the owner generates afterwards. The
//    write lives in linkVetDocumentVisit and is regression-tested against a real
//    database; this screen only calls it.
//  • **The visit row is conditional.** It renders only when the pet has ≥1 logged
//    visit (round-2 ruling). Visits still have no browse surface in this app, so an
//    empty picker would read as broken software rather than as an empty list.
//  • **Delete is soft, and the 30-day promise is real.** The ⋯ item says "Kept for
//    30 days"; the library's Recently deleted sheet is what makes that true. A hard
//    delete is not available anyway — `vet_documents` grants SELECT/INSERT/UPDATE
//    only, so removing a row IS an UPDATE setting deleted_at.
//  • **AC 12.** The first successful full-size open of a page caches its bytes
//    durably and adopts them as `local_uri`, so the document (and, as a side
//    effect, its library thumbnail) reads with no network from then on. Every
//    unreachable state on this screen is an honest sentence, never a spinner.
export default function VetDocumentDetailScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const pets = usePetStore((s) => s.pets);
  const activePet = usePetStore((s) => s.activePet);

  const [detail, setDetail] = useState<VetDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VetVisitOption[]>([]);

  // path → signed URL, for pages with no local copy. Held for this mount only and
  // never persisted (§6.2); re-signed on focus, which is what keeps the 15-minute
  // TTL from stranding a long-open screen on dead tokens.
  const [signed, setSigned] = useState<Map<string, string>>(new Map());
  const [signing, setSigning] = useState(false);
  const signedRef = useRef<Map<string, string>>(new Map());

  const [page, setPage] = useState(0);
  // The index the viewer OPENS on, captured at open and held still while it is up.
  // Kept separate from `page` on purpose: `page` follows the owner's swipes, and
  // feeding a live index back into PhotoViewer's `initialIndex` makes its open
  // effect scroll back to it mid-gesture (see that component's note).
  const [viewerStart, setViewerStart] = useState(0);
  const [imageViewer, setImageViewer] = useState(false);
  const [pdfViewer, setPdfViewer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<'name' | 'kind' | 'notes' | 'date' | 'visit' | null>(null);
  const [saving, setSaving] = useState(false);

  // A page whose bytes are being cached right now, so a fast second open doesn't
  // start a duplicate download of the same object.
  const cachingRef = useRef<Set<string>>(new Set());

  // Local copy always wins over a signed URL: it is faster, and it is the only copy
  // that survives a dead signal in an exam room (AC 12).
  const uriFor = useCallback(
    (p: VetDocumentPage | undefined): string | null =>
      p ? (p.localUri ? p.localUri : signed.get(p.storagePath) ?? null) : null,
    [signed],
  );

  const resolveSignedUrls = useCallback(async (doc: VetDocumentDetail) => {
    const missing = Array.from(
      new Set(doc.pages.filter((p) => !p.localUri).map((p) => p.storagePath)),
    ).filter((p) => !signedRef.current.has(p));
    if (missing.length === 0) return;
    setSigning(true);
    try {
      const resolved = await getSignedUrls(
        VET_DOCUMENTS_BUCKET,
        missing,
        VET_DOCUMENT_SIGNED_URL_TTL_SEC,
      );
      // Merge onto the ref re-read after the await, so a concurrent resolve's
      // writes aren't clobbered.
      const next = new Map(signedRef.current);
      resolved.forEach((url, path) => next.set(path, url));
      signedRef.current = next;
      setSigned(next);
    } finally {
      setSigning(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    try {
      const doc = await readVetDocumentDetail(groupId);
      setDetail(doc);
      if (!doc) return;
      // Clamp: a page may have gone away between mounts (a soft delete synced in
      // from another device), and a stale index would render an empty hero.
      setPage((prev) => Math.min(prev, Math.max(0, doc.pages.length - 1)));
      // The visit list is read here rather than lazily in the sheet because its
      // LENGTH decides whether the row renders at all — see the header.
      setVisits(await readVetVisitOptions(doc.petId));
      // Fire-and-forget: the document's own text is fully legible without them.
      resolveSignedUrls(doc);
    } catch (e) {
      // No silent failures in a data path (house rule). This read is local-first,
      // so a failure here is a device problem, not a network one.
      console.warn('[vet-files] detail read failed:', e);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, resolveSignedUrls]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── AC 12 — cache on first successful full-size open ────────────────────────
  //
  // Fired when the owner actually opens a page, not when the list renders its
  // thumbnail: a document the owner opened is the one they will want again in a
  // room with no signal, and downloading full-size bytes for every row of a
  // scrolled library would be a data bill nobody asked for.
  async function cacheOpenedPage(index: number) {
    const p = detail?.pages[index];
    if (!p || p.localUri || cachingRef.current.has(p.id)) return;
    const url = signed.get(p.storagePath);
    if (!url) return;
    cachingRef.current.add(p.id);
    try {
      const durable = await cacheVetDocumentPage(p, url);
      // Re-read the row rather than patching state by hand, so `local_uri` and
      // what is rendered can't disagree.
      if (durable) await load();
    } finally {
      cachingRef.current.delete(p.id);
    }
  }

  function openViewer() {
    if (!detail) return;
    if (detail.isPdf) {
      setPdfViewer(true);
    } else {
      setViewerStart(page);
      setImageViewer(true);
    }
    // The open succeeded as far as this screen can tell (there is a URI, or the
    // hero wouldn't have been tappable); caching runs alongside the viewer rather
    // than in front of it, so the owner never waits on a background copy.
    cacheOpenedPage(page);
  }

  // ── Edits ───────────────────────────────────────────────────────────────────
  //
  // One shape for all five: write, close, reload, push. The push is
  // fire-and-forget — it is the backup, not the save, and the offline queue retries.
  async function commit(write: () => Promise<void>) {
    setSaving(true);
    try {
      await write();
      setSheet(null);
      await load();
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] detail edit failed:', e);
      Alert.alert('That didn’t save', 'Something went wrong saving that change. Give it another try.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    setMenuOpen(false);
    Alert.alert(
      'Delete this document?',
      'It stays in Recently deleted for 30 days, so you can put it back from the library.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!groupId) return;
            try {
              await softDeleteVetDocument(groupId);
              syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
              // Back to the library, where the undo lives — leaving the owner on
              // the detail screen of a document they just deleted would be a
              // moment with nothing true left on it.
              if (router.canGoBack()) router.back();
              else router.replace('/vet-files');
            } catch (e) {
              console.warn('[vet-files] soft delete failed:', e);
              Alert.alert('That didn’t delete', 'Something went wrong. Give it another try.');
            }
          },
        },
      ],
    );
  }

  // ── Share (§4.3 — the ER moment) ────────────────────────────────────────────
  //
  // Shares the CURRENT page's file, one page at a time (aggregate "everything as
  // one PDF" is parked, §11). The local copy is preferred and the signed URL is
  // the fallback — a signed URL cannot be handed to the share sheet as a file, so
  // a page with no local copy is cached first and then shared. That download is
  // the one place on this screen the owner genuinely waits, and it is in service
  // of an action they just asked for.
  async function handleShare() {
    if (!detail) return;
    const p = detail.pages[page];
    if (!p) return;
    setSaving(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        // Word-for-word the vet report's alert (app/report.tsx) — see the note
        // there; one device limitation, one sentence (VF-6 voice pass).
        Alert.alert('Sharing isn’t available', 'This device can’t open a share sheet.');
        return;
      }
      let uri = p.localUri;
      if (!uri) {
        const url = signed.get(p.storagePath);
        const cached = url ? await cacheVetDocumentPage(p, url) : null;
        if (!cached) {
          Alert.alert(
            'Needs a connection',
            'This document is saved to your account. Open it once with a signal and it stays on this phone.',
          );
          return;
        }
        uri = cached;
        await load();
      }
      // The share sheet hands over the file AT ITS PATH, and our paths are UUIDs —
      // so the copy is what decides whether the vet receives "Pixel-Senior-panel-
      // 2026-07-14.pdf" or "a3f9c1e2-….pdf". Best-effort: a failed copy shares the
      // raw file rather than blocking the moment this screen exists for.
      const shareUri = stageForShare(
        uri,
        vetDocumentShareFilename(petName, detail, page, detail.pages.length),
      );
      await Sharing.shareAsync(shareUri, {
        mimeType: detail.isPdf ? 'application/pdf' : 'image/jpeg',
        UTI: detail.isPdf ? 'com.adobe.pdf' : 'public.jpeg',
        dialogTitle: `Send ${petName}’s document`,
      });
    } catch (e) {
      console.warn('[vet-files] share failed:', e);
      Alert.alert('That didn’t send', 'Something went wrong opening the share sheet. Give it another try.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // The name of the pet this DOCUMENT belongs to, not whichever pet happens to be
  // active. They are the same in the normal flow (the library is per-active-pet),
  // but a deep link or a pet switch mid-session would otherwise put the wrong name
  // on the file the vet receives — and a mis-attributed clinical record is exactly
  // the failure the D13 copy rule exists to prevent elsewhere.
  const petName =
    pets.find((p) => p.id === detail?.petId)?.name ?? activePet?.name ?? 'your pet';

  const linkedVisit = detail?.vetVisitId
    ? visits.find((v) => v.id === detail.vetVisitId) ?? null
    : null;

  const metaRows: MetaRow[] = detail
    ? [
        {
          key: 'kind',
          label: 'Type',
          value: detail.kindLabel,
          placeholder: 'Add a type',
          chip: true,
          onPress: () => setSheet('kind'),
        },
        {
          key: 'date',
          // The mock says "Doc date"; this ships as "Date" (VF-6 voice pass,
          // flagged for a Designer word). "Doc" reads as *doctor* in a vet app —
          // and the row directly below it is "Vet visit", so the two adjacent
          // labels can both scan as "when was the appointment", which is precisely
          // the distinction this row exists to hold. The editor sheet already
          // carries the disambiguation ("Not when you saved it — the date printed
          // on the paper"), so the shorter label loses nothing and it fits the
          // card's fixed 78pt label column, which "Document date" would not.
          label: 'Date',
          value: detail.dateLabel || null,
          placeholder: 'Add the date',
          onPress: () => setSheet('date'),
        },
        // Conditional by construction: no visits on record ⇒ the row is simply
        // absent (mock E-img-r2, "no dead ends").
        ...(visits.length > 0
          ? [{
              key: 'visit',
              label: 'Vet visit',
              value: linkedVisit?.label ?? null,
              placeholder: 'Link a visit',
              link: true,
              onPress: () => setSheet('visit'),
            } as MetaRow]
          : []),
        {
          key: 'notes',
          label: 'Notes',
          value: detail.notes,
          placeholder: 'Add a note',
          onPress: () => setSheet('notes'),
        },
      ]
    : [];

  const coverUri = uriFor(detail?.pages[page]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header
        leading="back"
        // canGoBack-guarded: this route is reachable by direct link, and a cold
        // deep-link has nothing to pop.
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-files'))}
        title="Vet Files"
        right={
          detail ? (
            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="More actions for this document"
            >
              <MoreHorizontal size={22} color={theme.colorTextSecondary} strokeWidth={2} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : !detail ? (
        // The document is gone — deleted here, or deleted on another device and
        // hydrated in while this screen was open. Said plainly rather than shown as
        // an error: nothing went wrong, the document just isn't here any more.
        <View style={styles.centre}>
          <Text style={styles.goneTitle}>This document isn’t here any more</Text>
          <Text style={styles.goneBody}>
            It may have been deleted. Deleted documents stay in Recently deleted for 30 days.
          </Text>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/vet-files'))}
            accessibilityRole="button"
          >
            <Text style={styles.goneLink}>Back to Vet Files</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <DocumentHero
              uri={coverUri}
              isPdf={detail.isPdf}
              pageCount={detail.pages.length}
              pageIndex={page}
              loading={signing}
              onOpen={openViewer}
            />

            <Text style={[styles.title, detail.untitled && styles.titleUntitled]}>
              {detail.title}
            </Text>

            <DocumentMetaCard rows={metaRows} />
          </ScrollView>

          {/* Share owns the floor alone (mock E-img-r2). */}
          <View style={styles.actions}>
            <PrimaryButton label="Share" onPress={handleShare} loading={saving} />
          </View>
        </>
      )}

      {detail && (
        <>
          <PhotoViewer
            visible={imageViewer}
            uris={detail.pages.map((p) => uriFor(p))}
            initialIndex={viewerStart}
            // A swipe inside the viewer is what the hero's dots, the Share action
            // and the AC-12 cache all follow — a page the owner never looked at is
            // not a page worth downloading in full.
            onPageChange={(index) => { setPage(index); cacheOpenedPage(index); }}
            onClose={() => setImageViewer(false)}
          />

          <DocumentPdfViewer
            visible={pdfViewer}
            uri={coverUri}
            title={detail.title}
            onClose={() => setPdfViewer(false)}
          />

          <DocumentMoreMenu
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            onRename={() => { setMenuOpen(false); setSheet('name'); }}
            onDelete={confirmDelete}
          />

          <NameDocumentSheet
            visible={sheet === 'name'}
            initialTitle={detail.title}
            untitled={detail.untitled}
            onCancel={() => setSheet(null)}
            onSave={(title) => commit(() => renameVetDocument(detail.groupId, title))}
            saving={saving}
          />

          <DocumentKindSheet
            visible={sheet === 'kind'}
            current={detail.kind}
            onCancel={() => setSheet(null)}
            onSelect={(kind: VetDocumentKind) => commit(() => setVetDocumentKind(detail.groupId, kind))}
          />

          <DocumentDateSheet
            visible={sheet === 'date'}
            initialDate={detail.documentDate}
            onCancel={() => setSheet(null)}
            onSave={(date) => commit(() => setVetDocumentDate(detail.groupId, date))}
          />

          <DocumentNotesSheet
            visible={sheet === 'notes'}
            initialNotes={detail.notes ?? ''}
            onCancel={() => setSheet(null)}
            onSave={(notes) => commit(() => setVetDocumentNotes(detail.groupId, notes))}
            saving={saving}
          />

          <DocumentVisitSheet
            visible={sheet === 'visit'}
            visits={visits}
            current={detail.vetVisitId}
            petName={petName}
            onCancel={() => setSheet(null)}
            onSelect={(visitId) => commit(() => linkVetDocumentVisit(detail.groupId, visitId))}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colorNeutralLight,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space1,
    paddingHorizontal: theme.space3,
  },
  scroll: {
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space3,
    gap: 14,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  // The untitled steady state (D11) reads quieter here for the same reason it does
  // in the library row: the document is real, it just hasn't been named.
  titleUntitled: {
    fontWeight: theme.weightRegular,
    color: theme.colorTextSecondary,
  },
  actions: {
    paddingHorizontal: theme.space2,
    paddingTop: theme.space1,
    paddingBottom: theme.space2,
  },
  goneTitle: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    textAlign: 'center',
  },
  goneBody: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextTertiary,
    textAlign: 'center',
  },
  goneLink: {
    fontSize: theme.textMD,
    fontWeight: theme.weightSemibold,
    color: theme.colorAccentInk,
    marginTop: theme.space1,
  },
});
