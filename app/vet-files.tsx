import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header, ScopeMenu } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { VetDocumentRow } from '../components/vetfiles/VetDocumentRow';
import { VetFilesEmptyState } from '../components/vetfiles/VetFilesEmptyState';
import { NameDocumentSheet, DocumentKindSheet } from '../components/vetfiles/VetDocumentMetaSheets';
import { AddDocumentSheet } from '../components/vetfiles/AddDocumentSheet';
import { DocumentSavedMoment } from '../components/vetfiles/DocumentSavedMoment';
import { RecentlyDeletedSheet } from '../components/vetfiles/RecentlyDeletedSheet';
import { VetFilesLowCountNote } from '../components/vetfiles/VetFilesLowCountNote';
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
  readRecentlyDeletedVetDocuments,
  renameVetDocument,
  restoreVetDocument,
  setVetDocumentKind,
  buildKindFilterOptions,
  reconcileKindFilter,
  filterByKind,
  shouldShowKindLens,
  isYoungLibrary,
  VET_DOCUMENT_SIGNED_URL_TTL_SEC,
  isSignatureStale,
  type DeletedVetDocumentRow,
  type VetLibraryRow,
} from '../lib/vetDocumentLibrary';
import {
  buildVetDocumentRows,
  duplicateVetDocumentRowsForPet,
  insertVetDocumentRows,
  isDocumentPickerAvailable,
  rejectedPickMessage,
  savedMomentCopy,
  screenPickedFiles,
  alsoAddLabel,
  alsoAddedLabel,
  type AlsoAddTarget,
  type PickedVetFile,
} from '../lib/vetDocumentCapture';
import { pickVetImages, pickVetPdfs } from '../lib/vetDocumentPickers';

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
// Every forward link is built as of VF-4: a row opens /vet-document/{groupId}, which
// views, edits, shares and soft-deletes. (This note previously described a
// `pendingScreen` no-op standing in for the unbuilt detail screen; that helper is
// gone — corrected in VF-6.)
export default function VetFilesScreen() {
  const activePet = usePetStore((s) => s.activePet);
  const pets = usePetStore((s) => s.pets);
  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  const [rows, setRows] = useState<VetLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  // path → signed URL. Held for the life of this mount only and never persisted
  // (§6.2).
  //
  // Re-signed on focus, but ONLY once a URL is near the end of the 15-minute TTL.
  // This note used to claim a plain re-sign on every focus, and that was not what
  // the code did: `resolveThumbnails` skips every path already in `signedRef` and
  // nothing ever evicted it, so a screen left mounted and blurred for 20 minutes
  // came back with dead tokens and rested every tile on its glyph until remount.
  // It failed CLOSED (no privacy consequence) but the comment was load-bearing —
  // the short TTL's whole mitigation is that focus re-signs (VF-6, found by
  // rls-privacy-reviewer).
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [thumbsLoading, setThumbsLoading] = useState(false);
  const signedRef = useRef<Map<string, string>>(new Map());
  // path → epoch ms the URL was minted, so the eviction above can be age-based.
  const signedAtRef = useRef<Map<string, number>>(new Map());

  // The Name sheet addresses a GROUP, and it is opened from two places — a library
  // row and the saved moment — so it holds the fields both can supply rather than a
  // whole library row. `fileLabel` is B-588's disambiguator: the filename shown in
  // the sheet so the owner can tell which of two identical PDFs they opened.
  const [naming, setNaming] = useState<
    { groupId: string; title: string; untitled: boolean; fileLabel: string | null } | null
  >(null);
  const [typing, setTyping] = useState<VetLibraryRow | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Recently deleted (VF-4, §8 AC 5) ────────────────────────────────────────
  //
  // The detail screen's ⋯ menu promises "Kept for 30 days — undo from the library",
  // and this is the library half of that promise. Read alongside the library rather
  // than lazily on tap, because its COUNT decides whether the entry point renders
  // at all: the steady state is empty, and a permanent trash-can row on a screen
  // whose whole job is one calm list is a surface nobody asked to see.
  const [deleted, setDeleted] = useState<DeletedVetDocumentRow[]>([]);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

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
  // B-548 — probe expo-document-picker ONCE, at mount, so the Files row can render
  // disabled with an honest subtitle instead of failing after the tap. A lazy
  // initializer runs it synchronously the first render and never again; the probe
  // never throws (it catches the native-module absence itself), so this is safe even
  // on the stale binary it exists to detect.
  const [filesAvailable] = useState(() => isDocumentPickerAvailable());

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
    ).filter((p) => isSignatureStale(signedRef.current, signedAtRef.current, p));
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
      const nextAt = new Map(signedAtRef.current);
      const mintedAt = Date.now();
      resolved.forEach((url, path) => { next.set(path, url); nextAt.set(path, mintedAt); });
      signedRef.current = next;
      signedAtRef.current = nextAt;
      setThumbUrls(next);
    } finally {
      setThumbsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!petId) { setRows([]); setDeleted([]); setLoading(false); return; }
    try {
      const library = await readVetLibrary(petId);
      setRows(library);
      setDeleted(await readRecentlyDeletedVetDocuments(petId));
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
      setDeleted([]);
    } finally {
      setLoading(false);
    }
  }, [petId, resolveThumbnails]);

  async function handleRestore(groupId: string) {
    if (restoring) return;
    setRestoring(groupId);
    try {
      await restoreVetDocument(groupId);
      // Restoring the last one empties the sheet; close it rather than leaving the
      // owner looking at an empty list they now have to dismiss themselves.
      if (deleted.length <= 1) setDeletedOpen(false);
      await load();
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] restore failed:', e);
      Alert.alert('That didn’t restore', 'Something went wrong putting the document back. Give it another try.');
    } finally {
      setRestoring(null);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      const picked = source === 'files' ? await pickVetPdfs() : await pickVetImages(source);
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
      const picked = await pickVetImages('camera');
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
      // The sheet stays OPEN on failure (setNaming(null) is inside the try), so
      // the owner's typed title is still there to re-submit — but without this
      // alert the only signal was the spinner stopping, which reads as "it
      // saved". D11 rests entirely on this affordance: capture asks nothing, so
      // the library row's one-tap Name IS the recovery, and a recovery that can
      // fail silently is worse than no recovery (VF-6).
      Alert.alert('That didn’t save', 'Something went wrong saving that name. Give it another try.');
    } finally {
      setSaving(false);
    }
  }

  async function handleKind(kind: VetDocumentKind) {
    // Re-entrancy is now the ChipGroup's job: the sheet passes `busy={saving}`, so
    // while this write is in flight the chips are disabled and a second tap fires
    // nothing (B-555). `saving` still drives that busy state; this guard only keeps
    // TypeScript honest about `typing` being non-null.
    if (!typing) return;
    setSaving(true);
    try {
      await setVetDocumentKind(typing.groupId, kind);
      setTyping(null);
      await load();
    } catch (e) {
      console.warn('[vet-files] set type failed:', e);
      Alert.alert('That didn’t save', 'Something went wrong saving that type. Give it another try.');
    } finally {
      setSaving(false);
    }
  }

  const kindOptions = buildKindFilterOptions(rows);
  // The lens renders only once the library spans ≥2 types (B-712) — a filter that
  // can only offer "All types" is machinery over a set of one. When it's hidden any
  // stale selection is ignored too, so a library that drops back to one type can't
  // strand the owner on a filtered view with no control to clear it.
  const showKindLens = shouldShowKindLens(rows);
  const visible = filterByKind(rows, showKindLens ? kindFilter : null);
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
              // The one just-saved document's own filename, when it has one. B-589
              // removes this button entirely for a multi-document save, so this
              // path only ever names a single document — there is no ambiguity to
              // resolve here, but the identifier is free and keeps the sheet honest
              // about what it is naming.
              fileLabel: savedCover.source_filename ?? null,
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
              from the header alone. Hidden until the library spans ≥2 types (B-712):
              a lens that can only offer "All types" is scaffolding, not a control. */}
          {showKindLens && (
            <View style={styles.lensRow}>
              <ScopeMenu
                options={kindOptions}
                value={kindFilter}
                onChange={setKindFilter}
                sheetLabel="Show documents of type"
                accessibilityPrefix="Document type"
              />
            </View>
          )}

          <View style={styles.list}>
            {visible.map((row) => (
              <VetDocumentRow
                key={row.groupId}
                row={row}
                thumbUri={thumbUriFor(row)}
                thumbLoading={thumbsLoading}
                // VF-4: the detail route is keyed on the DOCUMENT GROUP, not the
                // cover row's id — a 3-page thread is one document, and its pages
                // are what the detail screen swipes through.
                onPress={() => router.push(`/vet-document/${row.groupId}`)}
                onName={() => setNaming({ groupId: row.groupId, title: row.title, untitled: row.untitled, fileLabel: row.fileLabel })}
                onAddType={() => setTyping(row)}
              />
            ))}
          </View>

          {/* The "young library" note (B-712): a one- or two-document library reads
              as a void on a full screen, so it earns a quiet, forward-looking line
              and a low-key way to add the next. Not the empty state — there IS a
              document — and it retires once the list can stand on its own. */}
          {isYoungLibrary(rows) && <VetFilesLowCountNote onAdd={() => setAddOpen(true)} />}
        </ScrollView>
      )}

      {/* Renders only when there IS something recoverable — see the state
          declaration. Deliberately OUTSIDE the empty/populated branch: deleting
          your only document lands you on the empty state, and that is precisely
          the moment the ⋯ menu's "undo from the library" has to still be true.
          Quiet and at the bottom either way — a safety net, not a destination. */}
      {!loading && deleted.length > 0 && (
        <TouchableOpacity
          style={styles.deletedLink}
          onPress={() => setDeletedOpen(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Recently deleted, ${deleted.length} ${deleted.length === 1 ? 'document' : 'documents'}`}
        >
          <Text style={styles.deletedLinkText}>
            Recently deleted ({deleted.length})
          </Text>
        </TouchableOpacity>
      )}
      </>
      )}

      <AddDocumentSheet
        visible={addOpen}
        petName={petName}
        filesAvailable={filesAvailable}
        onCancel={() => setAddOpen(false)}
        onPick={handlePick}
      />

      <NameDocumentSheet
        visible={naming != null}
        initialTitle={naming?.title ?? ''}
        untitled={naming?.untitled ?? true}
        fileLabel={naming?.fileLabel ?? null}
        onCancel={() => setNaming(null)}
        onSave={handleRename}
        saving={saving}
      />

      <DocumentKindSheet
        visible={typing != null}
        current={typing?.kind ?? 'other'}
        onCancel={() => setTyping(null)}
        onSelect={handleKind}
        busy={saving}
      />

      <RecentlyDeletedSheet
        visible={deletedOpen}
        rows={deleted}
        restoringGroupId={restoring}
        onClose={() => setDeletedOpen(false)}
        onRestore={handleRestore}
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
  deletedLink: {
    alignSelf: 'center',
    paddingVertical: theme.space1,
    paddingHorizontal: theme.space2,
    paddingBottom: theme.space2,
  },
  deletedLinkText: {
    fontSize: theme.textSM,
    color: theme.colorTextTertiary,
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
