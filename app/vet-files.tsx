import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Plus } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header, ScopeMenu } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { VetDocumentRow } from '../components/vetfiles/VetDocumentRow';
import { VetFilesEmptyState } from '../components/vetfiles/VetFilesEmptyState';
import { NameDocumentSheet, DocumentKindSheet } from '../components/vetfiles/VetDocumentMetaSheets';
import { AddDocumentSheet } from '../components/vetfiles/AddDocumentSheet';
import { DocumentSavedMoment, type AlsoAddTarget } from '../components/vetfiles/DocumentSavedMoment';
import { usePetStore } from '../store/petStore';
import { getSignedUrls } from '../lib/storage';
import { syncPendingVetDocuments } from '../lib/sync';
import {
  VET_DOCUMENTS_BUCKET,
  type LocalVetDocument,
  type VetDocumentKind,
  type VetDocumentSource,
} from '../lib/vetDocuments';
import {
  readVetLibrary,
  renameVetDocument,
  setVetDocumentKind,
  buildKindFilterOptions,
  reconcileKindFilter,
  filterByKind,
  VET_DOCUMENT_SIGNED_URL_TTL_SEC,
  type VetLibraryRow,
} from '../lib/vetDocumentLibrary';
import {
  buildVetDocumentRows,
  duplicateVetDocumentRowsForPet,
  insertVetDocumentRows,
  pickedFilesFromDocumentAssets,
  pickedFilesFromImageAssets,
  rejectedPickMessage,
  savedMomentCopy,
  screenPickedFiles,
  alsoAddLabel,
  alsoAddedLabel,
  type PickedVetFile,
} from '../lib/vetDocumentCapture';

// Vet Files — the library (B-478 VF-2) and its capture flow (VF-3).
// §4.1 / §4.2 + mock L-real / E1-r2 / D1-r2 / D2-r2.
//
// Reached from the pet profile (G3). Per-pet, reverse-chron, kind lens only — no
// folders ever (§2: Apple Health organises by type × date × source and never asks
// a user to file anything), and no search in v1 (D12 → B-479).
//
// Capture lives on this screen rather than in its own route because the whole
// contract is that it barely exists: the add sheet opens over the library, the save
// happens before any screen changes, and the saved moment is a state of this screen
// that "Done" simply leaves. A pushed capture route would put a navigation
// transition between the owner and a document that is already on disk.
//
// The one forward link still unbuilt is the document detail (VF-4), wired through
// the named `pendingScreen` no-op below so the call site stays greppable.
export default function VetFilesScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);
  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  const [rows, setRows] = useState<VetLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  // path → signed URL. Held for the life of this mount only and never persisted
  // (§6.2). Re-signed on every focus, which is also what keeps the 15-minute TTL
  // from stranding a long-open screen on dead tokens.
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [thumbsLoading, setThumbsLoading] = useState(false);
  const signedRef = useRef<Map<string, string>>(new Map());

  // The Name sheet addresses a GROUP, and it is opened from two places — a library
  // row and the saved moment — so it holds the three fields both can supply rather
  // than a whole library row.
  const [naming, setNaming] = useState<{ groupId: string; title: string; untitled: boolean } | null>(null);
  const [typing, setTyping] = useState<VetLibraryRow | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Capture (VF-3) ──────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  // The rows a just-finished capture wrote, and the screen's own "saved moment"
  // state. Non-null ⇒ D2-r2 is showing.
  const [saved, setSaved] = useState<LocalVetDocument[] | null>(null);
  // Pets this capture has already been copied to (D13), so a second tap on the
  // same line cannot file a third copy.
  const [alsoAdded, setAlsoAdded] = useState<Set<string>>(() => new Set());
  // A picker / write is in flight. Guards double-taps on the add affordances; no
  // spinner, because every step here is a local write behind OS-modal picker UI.
  const [capturing, setCapturing] = useState(false);

  // A document captured on THIS device keeps a durable local file, so it renders
  // with no network at all — the free half of AC 12. A hydrated row carries '' and
  // needs a signed URL; when that can't be had (offline, expired session) the tile
  // rests on its glyph rather than spinning. Local always wins: it is both faster
  // and the only copy that survives a dead signal in an exam room.
  const thumbUriFor = useCallback(
    (row: VetLibraryRow): string | null =>
      row.localUri ? row.localUri : thumbUrls.get(row.storagePath) ?? null,
    [thumbUrls],
  );

  // Batch-sign in ONE request rather than N per-row round-trips (the getSignedUrls
  // primitive exists for exactly this). Only rows without a local copy need signing,
  // and only paths we don't already hold this mount. Never throws — a path that
  // fails to sign is simply absent, so its row keeps the glyph.
  const resolveThumbnails = useCallback(async (libraryRows: VetLibraryRow[]) => {
    const missing = Array.from(
      new Set(libraryRows.filter((r) => !r.localUri).map((r) => r.storagePath)),
    ).filter((p) => !signedRef.current.has(p));
    if (missing.length === 0) return;
    setThumbsLoading(true);
    try {
      const resolved = await getSignedUrls(
        VET_DOCUMENTS_BUCKET,
        missing,
        VET_DOCUMENT_SIGNED_URL_TTL_SEC,
      );
      // Merge onto the latest ref (re-read after the await) so a concurrent
      // resolve's writes aren't clobbered.
      const next = new Map(signedRef.current);
      resolved.forEach((url, path) => next.set(path, url));
      signedRef.current = next;
      setThumbUrls(next);
    } finally {
      setThumbsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!petId) { setRows([]); setLoading(false); return; }
    try {
      const library = await readVetLibrary(petId);
      setRows(library);
      // Drop a filter whose kind no longer exists (the owner deleted the last one),
      // so a stale selection can never present an empty list.
      setKindFilter((prev) => reconcileKindFilter(prev, buildKindFilterOptions(library)));
      // Fire-and-forget: thumbnails are a progressive enhancement over rows that
      // are already fully legible as text, so they must not delay the list.
      resolveThumbnails(library);
    } catch (e) {
      // No silent failures in a data path (house rule). The library is local-first,
      // so a read failure here is a device problem, not a network one.
      console.warn('[vet-files] library read failed:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [petId, resolveThumbnails]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // TODO(VF-4): route to the document detail (viewer, metadata edit, share, soft
  // delete). Kept as one named no-op so the call site is greppable when that PR
  // lands, and so an unbuilt route can't silently swallow a tap in a QA build.
  // Until then a named row's chevron leads nowhere — called out in VF-3's QA script
  // rather than hidden, since the profile entry point unlocks with this PR.
  const pendingScreen = useCallback((what: 'detail') => {
    console.warn(`[vet-files] ${what} lands in VF-4`);
  }, []);

  // ── Pickers ─────────────────────────────────────────────────────────────────
  // Returns [] for every "nothing happened" outcome — cancelled, denied — so the
  // caller has one quiet path and no thrown control flow.

  async function pickImages(source: 'camera' | 'photo_library'): Promise<PickedVetFile[]> {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera access needed',
          'Allow camera access in Settings to photograph a document, or choose one from Photos instead.',
        );
        return [];
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Allow photo access in Settings to add a document from Photos.');
        return [];
      }
    }

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      // No cropping: this is a record, and a crop is an edit to a clinical document.
      allowsEditing: false,
      quality: 0.9,
      // Needed for document_date — the date ON the paper is usually the date the
      // photo was taken (§4.2). GPS never travels: compressForUpload re-encodes
      // before upload and prepareVetDocumentUpload has no original-fallback (§6.2).
      exif: true,
      // Multi-select is the Photos row's whole promise (§4.4): an email thread is N
      // screenshots that are ONE document. The camera returns a single shot per
      // launch, so its multi-page path is the saved moment's "Add another page".
      ...(source === 'photo_library' ? { allowsMultipleSelection: true } : {}),
    };

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return [];
    return pickedFilesFromImageAssets(result.assets ?? []);
  }

  async function pickPdfs(): Promise<PickedVetFile[]> {
    const result = await DocumentPicker.getDocumentAsync({
      // PDFs only, which is exactly what the row promises ("PDFs from email or a
      // clinic portal"). Images from Files would land as one document per file and
      // quietly break the page-grouping promise the two photo rows make — a photo
      // in Files belongs in the Photos path. A provider that ignores the filter is
      // caught by screenPickedFiles, not by trust.
      type: 'application/pdf',
      multiple: true,
      // Gives us a readable file:// copy on both platforms. Without it Android
      // hands back a content:// URI that persistCapture skips and
      // `new File(uri).bytes()` cannot read at upload time.
      copyToCacheDirectory: true,
    });
    if (result.canceled) return [];
    return pickedFilesFromDocumentAssets(result.assets ?? []);
  }

  // ── The capture itself (§4.2) ───────────────────────────────────────────────
  //
  // Every source lands here, and the shape is the same: pick → screen → build →
  // insert → saved moment. Nothing between the picker and the insert asks a
  // question, and the insert is a local SQLite write, so the document is safe on
  // the phone before the saved moment renders (which is what lets that screen
  // promise it).
  //
  // The add sheet stays OPEN across the picker, and closes only once something was
  // actually saved. Two reasons, one of them iOS mechanics: expo-image-picker
  // presents from `currentViewController()`, i.e. the topmost presented view
  // controller — which is stable while the sheet's Modal is up and AMBIGUOUS while
  // it is mid-dismiss, so closing first can drop the presentation on the floor and
  // leave a tap that does nothing. The product reason is the better one anyway:
  // cancelling the camera returns the owner to the source list, not to the library.
  async function handlePick(source: VetDocumentSource) {
    if (capturing) return;
    // Write-time pet identity (multi-pet spec §6): read the store at the moment of
    // write, not the render-time closure, so a pet switch mid-picker cannot file
    // this document under the wrong pet.
    const pet = usePetStore.getState().activePet;
    if (!pet) return;

    setCapturing(true);
    try {
      const picked = source === 'files' ? await pickPdfs() : await pickImages(source);
      if (picked.length === 0) return;

      const screened = screenPickedFiles(picked);
      const skipped = rejectedPickMessage(screened);
      if (screened.accepted.length === 0) {
        if (skipped) Alert.alert('Nothing to save', skipped);
        return;
      }

      // Grouping (§4.4). Camera and Photos produce ONE document whose pages are the
      // picked images — the thread or the discharge sheet. Files produces one
      // document PER PDF, because two lab PDFs from a portal are two records, and
      // asserting they are one document would make Phase-2 attribution wrong in a
      // way nothing in the UI could show.
      const groups: PickedVetFile[][] = source === 'files'
        ? screened.accepted.map((file) => [file])
        : [screened.accepted];

      const built = groups.flatMap((pages) =>
        buildVetDocumentRows({ petId: pet.id, source, pages }),
      );
      await insertVetDocumentRows(built);

      setAddOpen(false);
      setSaved(built);
      setAlsoAdded(new Set());
      await load();
      // Fire-and-forget: the push is the backup, not the save. It fails silently
      // offline and the queue retries — which is what the offline line promises.
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));

      if (skipped) Alert.alert('Some files were skipped', skipped);
    } catch (e) {
      // No silent failures on a write path (house rule). The owner is told plainly,
      // because a document they believe is saved and isn't is the worst outcome
      // this screen can produce.
      console.warn('[vet-files] capture failed:', e);
      Alert.alert('That didn’t save', 'Something went wrong saving that document. Give it another try.');
    } finally {
      setCapturing(false);
    }
  }

  // The camera's multi-page path (D1-r2: "Snap each page — they stay together").
  //
  // A deliberate addition to the mock's saved moment, which shows a 3-page document
  // without showing how the camera produced one: expo-image-picker takes one shot
  // per launch, so the alternatives were asking "another page?" BEFORE saving
  // (which puts a decision in front of the save the sheet promises is instant) or
  // quietly not honouring the row's own copy. Appending after the save keeps both —
  // page 1 is already filed and backed up before this button exists.
  async function handleAddPage() {
    const current = saved;
    if (!current || current.length === 0 || capturing) return;
    setCapturing(true);
    try {
      const picked = await pickImages('camera');
      if (picked.length === 0) return;
      const screened = screenPickedFiles(picked);
      if (screened.accepted.length === 0) {
        const skipped = rejectedPickMessage(screened);
        if (skipped) Alert.alert('Nothing to save', skipped);
        return;
      }
      const cover = current[0];
      const built = buildVetDocumentRows({
        petId: cover.pet_id,
        source: 'camera',
        pages: screened.accepted,
        // The existing group, its date, and the next free page index: a new page
        // joins the document, it never re-dates it or starts a second one.
        groupId: cover.document_group_id,
        documentDate: cover.document_date,
        startPageIndex: Math.max(...current.map((r) => r.page_index)) + 1,
      });
      await insertVetDocumentRows(built);
      setSaved([...current, ...built]);
      await load();
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] add page failed:', e);
      Alert.alert('That page didn’t save', 'Something went wrong adding that page. Give it another try.');
    } finally {
      setCapturing(false);
    }
  }

  // D13 — file a full independent copy under another pet in the household.
  async function handleAlsoAdd(otherPetId: string) {
    const current = saved;
    if (!current || capturing || alsoAdded.has(otherPetId)) return;
    setCapturing(true);
    try {
      const copies = duplicateVetDocumentRowsForPet(current, { petId: otherPetId });
      await insertVetDocumentRows(copies);
      setAlsoAdded((prev) => new Set(prev).add(otherPetId));
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] duplicate to pet failed:', e);
      Alert.alert('That copy didn’t save', 'Something went wrong filing the copy. Give it another try.');
    } finally {
      setCapturing(false);
    }
  }

  async function handleRename(title: string) {
    if (!naming) return;
    setSaving(true);
    try {
      await renameVetDocument(naming.groupId, title);
      setNaming(null);
      await load();
    } catch (e) {
      console.warn('[vet-files] rename failed:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleKind(kind: VetDocumentKind) {
    if (!typing) return;
    try {
      await setVetDocumentKind(typing.groupId, kind);
      setTyping(null);
      await load();
    } catch (e) {
      console.warn('[vet-files] set type failed:', e);
    }
  }

  const kindOptions = buildKindFilterOptions(rows);
  const visible = filterByKind(rows, kindFilter);
  const isEmpty = rows.length === 0;

  // ── The saved moment (D2-r2) ────────────────────────────────────────────────
  //
  // A state of this screen rather than a pushed route: the document is already
  // written, so there is nothing to navigate to and nothing to come back from —
  // "Done" just clears this. The list underneath already carries the new row.
  //
  // It swaps the screen's BODY and is not itself a Modal, and the three sheets stay
  // mounted around it. That shape is deliberate: replacing the whole tree would
  // unmount the add sheet's `Modal` while it was still visible, which on iOS can
  // strand its presented view controller and leave the screen unresponsive. Here the
  // sheet gets an ordinary animated dismissal while the body changes underneath it.
  const savedCover = saved && saved.length > 0 ? saved[0] : null;
  const savedCopy = saved && savedCover ? savedMomentCopy(petName, saved) : null;
  // D13 renders per OTHER pet, so a single-pet account gets nothing at all.
  const alsoAddTargets: AlsoAddTarget[] = savedCover
    ? pets
        .filter((p) => p.id !== savedCover.pet_id)
        .map((p) => ({
          petId: p.id,
          label: alsoAdded.has(p.id) ? alsoAddedLabel(p.name) : alsoAddLabel(p.name),
          done: alsoAdded.has(p.id),
        }))
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {saved && savedCover && savedCopy ? (
        <DocumentSavedMoment
          copy={savedCopy}
          // The cover's own durable file — a just-captured document never needs a
          // signed URL to show itself.
          thumbUri={savedCover.local_uri || null}
          isPdf={savedCover.mime_type === 'application/pdf'}
          alsoAdd={alsoAddTargets}
          onAlsoAdd={handleAlsoAdd}
          // Offered only for a single camera-captured document: a Photos batch and a
          // PDF pick already had their own multi-select, and appending a camera page
          // to one of several PDFs would have no defensible target.
          onAddPage={
            savedCover.source === 'camera' &&
            new Set(saved.map((r) => r.document_group_id)).size === 1
              ? handleAddPage
              : undefined
          }
          busy={capturing}
          onName={() => {
            // Hand off to the same Name sheet the library row uses — one naming
            // surface, and the owner lands on the list with their new row visible
            // behind it rather than naming into a screen they then have to leave.
            setSaved(null);
            setNaming({
              groupId: savedCover.document_group_id,
              title: savedCopy.cardTitle,
              untitled: true,
            });
          }}
          onDone={() => setSaved(null)}
        />
      ) : (
      <>
      <Header
        leading="back"
        // canGoBack-guarded: this route is reachable by direct link (that is how
        // VF-2 is QA'd before the profile entry unlocks), and a cold deep-link has
        // nothing to pop.
        onLeadingPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        title={isEmpty ? 'Vet Files' : undefined}
        right={
          // Hidden on the empty state, where the big CTA already owns the action —
          // two competing add affordances on a screen whose whole job is one
          // invitation (mock E1-r2 renders the + as a ghost).
          isEmpty ? undefined : (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setAddOpen(true)}
              disabled={capturing}
              activeOpacity={0.7}
              // 30pt circle + 12pt slop ⇒ ~54pt target, past the 44pt floor.
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`Add documents to ${petName}’s Vet Files`}
            >
              <Plus size={19} color={theme.colorTextOnDark} strokeWidth={2.25} />
            </TouchableOpacity>
          )
        }
      />

      {loading ? (
        <View style={styles.centre}>
          <WhorlSpinner size="md" ground="day" />
        </View>
      ) : isEmpty ? (
        <VetFilesEmptyState petName={petName} onAdd={() => setAddOpen(true)} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>Vet Files</Text>
            {/* The pet's name is the only filing cue a multi-pet household gets on
                this screen (round-2 review). */}
            <Text style={styles.pageSub}>
              {petName} · {rows.length} {rows.length === 1 ? 'document' : 'documents'}
            </Text>
          </View>

          {/* A growable 10-value set behind a pill, per the house lens rule — and
              the pill tints when filtered, so a short list always explains itself
              from the header alone. */}
          <View style={styles.lensRow}>
            <ScopeMenu
              options={kindOptions}
              value={kindFilter}
              onChange={setKindFilter}
              sheetLabel="Show documents of type"
              accessibilityPrefix="Document type"
            />
          </View>

          <View style={styles.list}>
            {visible.map((row) => (
              <VetDocumentRow
                key={row.groupId}
                row={row}
                thumbUri={thumbUriFor(row)}
                thumbLoading={thumbsLoading}
                onPress={() => pendingScreen('detail')}
                onName={() => setNaming({ groupId: row.groupId, title: row.title, untitled: row.untitled })}
                onAddType={() => setTyping(row)}
              />
            ))}
          </View>
        </ScrollView>
      )}
      </>
      )}

      <AddDocumentSheet
        visible={addOpen}
        petName={petName}
        onCancel={() => setAddOpen(false)}
        onPick={handlePick}
      />

      <NameDocumentSheet
        visible={naming != null}
        initialTitle={naming?.title ?? ''}
        untitled={naming?.untitled ?? true}
        onCancel={() => setNaming(null)}
        onSave={handleRename}
        saving={saving}
      />

      <DocumentKindSheet
        visible={typing != null}
        current={typing?.kind ?? 'other'}
        onCancel={() => setTyping(null)}
        onSelect={handleKind}
      />
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
  },
  scroll: {
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space5,
    gap: 12,
  },
  titleBlock: {
    marginTop: theme.spaceMicro,
  },
  pageTitle: {
    fontSize: theme.textPageTitle,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
    marginTop: 2,
  },
  lensRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: {
    gap: theme.space1,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.radiusFull,
    backgroundColor: theme.colorAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
