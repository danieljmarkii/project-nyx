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
import { compressForUpload, getSignedUrls, stageForShare } from '../../lib/storage';
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
  isSignatureStale,
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
import {
  buildVetDocumentRows,
  duplicateVetDocumentRowsForPet,
  insertVetDocumentRows,
  readLocalVetDocumentGroup,
  screenPickedFiles,
  rejectedPickMessage,
  alsoAddLabel,
  alsoAddedLabel,
  type AlsoAddTarget,
} from '../../lib/vetDocumentCapture';
import { destructiveConfirm } from '../../lib/haptics';
import { pickVetImages } from '../../lib/vetDocumentPickers';

// Vet Files — document detail (B-478 VF-4).
// §4.3 + mock E-img-r2 / E-pdf-r2.
//
// The last unbuilt Vet Files surface, and the one the feature is actually FOR:
// §4.3 calls sharing "the single most important affordance after viewing" — the
// ER moment, where a vet asks for the last bloodwork and the answer has to be two
// taps rather than an inbox excavation. So the floor is Share alone, and every
// secondary action lives behind ⋯ rather than competing with it: Rename and Delete,
// plus the two additive ones — "Add another page" (B-549, image documents only) and
// D13's "Also add to {other pet}" (B-547, multi-pet accounts only).
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
  // path → epoch ms the URL was minted, so signatures expire instead of being held
  // for the life of the mount (VF-6).
  const signedAtRef = useRef<Map<string, number>>(new Map());

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

  // B-547 / B-549 — the two additive ⋯-menu actions. `capturing` guards a copy or a
  // page-append write in flight; it is separate from `saving` (which drives the
  // Share button's spinner and the edit sheets) because these run behind the menu
  // and behind an OS picker, not behind the primary CTA. `alsoAdded` flips a per-pet
  // copy line to its confirmed state so a second tap can't file a third copy. Both
  // are per-mount, i.e. per-document, which is the correct scope: this route is one
  // document, and expo-router mounts a fresh screen per groupId.
  const [capturing, setCapturing] = useState(false);
  const [alsoAdded, setAlsoAdded] = useState<Set<string>>(() => new Set());

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
    // Age-based, not presence-based — see isSignatureStale. This screen can sit
    // open on a document for a long time (that is what it is for), so it was the
    // more exposed of the two callers to the never-evicted ref.
    ).filter((p) => isSignatureStale(signedRef.current, signedAtRef.current, p));
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
      const nextAt = new Map(signedAtRef.current);
      const mintedAt = Date.now();
      resolved.forEach((url, path) => { next.set(path, url); nextAt.set(path, mintedAt); });
      signedRef.current = next;
      signedAtRef.current = nextAt;
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
            destructiveConfirm();
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

  // ── Add another page (B-549, §4.4) ──────────────────────────────────────────
  //
  // The detail-screen home for the append machinery that previously existed only on
  // the saved moment: a discharge sheet whose page 4 was missed at capture is
  // recovered by adding to the existing group, never by delete-and-recapture. Image
  // documents only — a PDF group is one page per PDF (§4.4), and buildVetDocumentDetail
  // reads the group's type from the cover, so appending an image page to a PDF would
  // break that one-mime assumption; the ⋯ item is simply absent for a PDF.
  //
  // Camera only, matching the saved-moment append and the "snap the page you missed"
  // moment this exists for. The menu stays OPEN across the picker for the same iOS
  // reason the library's capture flow does (expo-image-picker presents from the
  // topmost view controller, stable while this Modal is up and ambiguous mid-dismiss);
  // it closes once the picker returns, before the write.
  async function handleAddPage() {
    if (!detail || detail.isPdf || capturing) return;
    setCapturing(true);
    try {
      const picked = await pickVetImages('camera');
      setMenuOpen(false);
      if (picked.length === 0) return;
      const screened = screenPickedFiles(picked);
      if (screened.accepted.length === 0) {
        const skipped = rejectedPickMessage(screened);
        if (skipped) Alert.alert('Nothing to add', skipped);
        return;
      }
      const built = buildVetDocumentRows({
        petId: detail.petId,
        source: 'camera',
        pages: screened.accepted,
        // The existing group, its date, and the next free page index: a new page
        // joins the document, it never starts a second one or re-dates the first.
        groupId: detail.groupId,
        documentDate: detail.documentDate,
        startPageIndex: Math.max(...detail.pages.map((p) => p.pageIndex)) + 1,
        // Carry the group's per-document facts so the appended page agrees with its
        // siblings. Unlike the saved-moment append (always pre-metadata), this runs
        // after the owner may have set them — `detail.title` is a RENDERED default
        // when untitled, so pass NULL in that case to keep the cover's untitled state
        // and the Name pill (code-reviewer).
        kind: detail.kind,
        title: detail.untitled ? null : detail.title,
        notes: detail.notes,
      });
      await insertVetDocumentRows(built);
      await load();
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] add page failed:', e);
      Alert.alert('That page didn’t save', 'Something went wrong adding that page. Give it another try.');
    } finally {
      setCapturing(false);
    }
  }

  // ── Also add to another pet (B-547 / D13) ───────────────────────────────────
  //
  // D13's copy-to-another-pet, on the detail ⋯ menu where the spec says it belongs
  // (the saved moment shipped the other half). Reads the FULL local rows — the
  // library and detail read models drop columns the copy needs (source,
  // file_size_bytes, notes…) — and hands them to duplicateVetDocumentRowsForPet,
  // which files a genuinely independent copy: new ids, new object keys under the
  // other pet's prefix, its own local file, and no inherited visit link. The copy
  // reflects the document's CURRENT state (a rename or a kind set here travels),
  // because it reads live rows rather than the untitled capture rows the saved
  // moment copies.
  //
  // The menu deliberately stays open so the tapped line flips to "✓ Added…" in
  // place, and the guard on `alsoAdded` stops a second tap filing a third copy.
  async function handleAlsoAdd(otherPetId: string) {
    if (!detail || capturing || alsoAdded.has(otherPetId)) return;
    setCapturing(true);
    try {
      // Every page needs durable local bytes BEFORE the copy. A copy inherits its
      // source's local_uri, and for a page with none ('') duplicateVetDocumentRowsForPet
      // correctly leaves the copy's local_uri '' too — but then needsObjectUpload is
      // false, so sync never uploads an object to the copy's fresh key, and the row
      // lands under the other pet pointing at bytes that do not exist: a permanently
      // blank clinical document, silently. That happens exactly when the source was
      // hydrated on this device and never opened (its bytes live only in Storage). So
      // cache any un-cached page first, from the signed URLs the screen already
      // resolved — the same download the share path does for one page, here for all
      // (rls-privacy-reviewer, B-547).
      for (const p of detail.pages) {
        if (p.localUri) continue;
        const url = signed.get(p.storagePath);
        if (url) await cacheVetDocumentPage(p, url);
      }
      const rows = await readLocalVetDocumentGroup(detail.groupId);
      // Gone between opening the menu and tapping (deleted here, or a soft delete
      // synced in from another device): nothing to copy, and copying a tombstone
      // would file a pre-deleted document under the other pet.
      if (rows.length === 0) return;
      // A page still has no local bytes (offline, or its signature hadn't resolved):
      // decline rather than file a copy that renders blank on every device. Same
      // register as the share path's "needs a connection" — a document is safe on
      // your account, it just can't be copied until this phone has fetched it once.
      if (rows.some((r) => !r.local_uri)) {
        Alert.alert(
          'Needs a connection',
          'This document is saved to your account. Open it once with a signal, then you can add it to another pet.',
        );
        return;
      }
      const copies = duplicateVetDocumentRowsForPet(rows, { petId: otherPetId });
      await insertVetDocumentRows(copies);
      setAlsoAdded((prev) => new Set(prev).add(otherPetId));
      // Re-read so a page cached above shows its adopted local copy immediately.
      await load();
      syncPendingVetDocuments().catch((e) => console.warn('[vet-files] document push failed:', e));
    } catch (e) {
      console.warn('[vet-files] duplicate to pet failed:', e);
      Alert.alert('That copy didn’t save', 'Something went wrong filing the copy. Give it another try.');
    } finally {
      setCapturing(false);
    }
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
      // STRIP BEFORE IT LEAVES THE APP. `local_uri` on a device-captured document is
      // the picker's ORIGINAL asset — the EXIF/GPS strip lives inside
      // prepareVetDocumentUpload, which is on the path to Storage and nowhere else.
      // So until this, the one action that hands a photo to a third party was the
      // one path that skipped the strip, and a photo of a discharge sheet taken in
      // the owner's kitchen carried their home coordinates to the vet. The screen's
      // sibling comment claimed "GPS never travels"; it was true of the bucket and
      // false of the share sheet (B-478 VF-6, found by rls-privacy-reviewer).
      //
      // Best-effort by the same rule as the staging copy below: on a re-encode
      // failure we fall back to the raw file rather than blocking the ER moment this
      // screen exists for. That is the opposite of the upload path's rule (which
      // THROWS rather than send an original) and the asymmetry is deliberate — a
      // silent permanent copy in a bucket is a different risk from one file the owner
      // is deliberately handing to a clinician in front of them.
      let sendUri = uri;
      if (!detail.isPdf) {
        try {
          sendUri = await compressForUpload(uri);
        } catch (e) {
          console.warn('[vet-files] share re-encode failed, sending the original:', e);
        }
      }
      // The share sheet hands over the file AT ITS PATH, and our paths are UUIDs —
      // so the copy is what decides whether the vet receives "Pixel-Senior-panel-
      // 2026-07-14.pdf" or "a3f9c1e2-….pdf". Best-effort: a failed copy shares the
      // raw file rather than blocking the moment this screen exists for.
      // `documentPet?.name ?? ''`, NOT `petName`. The two fallbacks are different
      // kinds of thing and only one of them belongs in a filename: "your pet" is
      // PROSE, correct in the dialog title below, and it slugs to "your-pet-lab-
      // result-2026-07-14.pdf" — a file the vet keeps, named after a sentence.
      // Passing '' lets slug() use its own 'pet' fallback, which is what it is for.
      // The header above already degrades this way (plain "Vet Files" rather than
      // "your pet’s Vet Files"); the filename had been left behind.
      // (pm-feature-review on B-550.)
      const shareUri = stageForShare(
        sendUri,
        vetDocumentShareFilename(documentPet?.name ?? '', detail, page, detail.pages.length),
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
  // NO `activePet` RUNG — deliberately. `usePetStore.pets` holds only non-archived
  // pets, so archiving pet A while its document is on the stack (or deep-linking to
  // it afterwards) makes this `find` miss. An `?? activePet?.name` fallback then
  // names whichever pet is CURRENTLY active, and the vet receives
  // "Juniper-lab-result-2026-07-14.pdf" containing Pixel's bloodwork. That is the
  // exact mis-attribution this lookup exists to prevent, so the miss falls straight
  // through to the anonymous fallback: an unnamed file is recoverable, a confidently
  // wrong name is not. (VF-6, found by rls-privacy-reviewer.)
  const documentPet = pets.find((p) => p.id === detail?.petId) ?? null;
  const petName = documentPet?.name ?? 'your pet';

  // B-550 — this screen used to name the pet NOWHERE. The header read "Vet Files",
  // the body read "Document — Jul 14", and the only place Pixel appeared was inside
  // the filename of a file that had already left the app. So Sam could hand an ER
  // vet a phone showing a two-cat household's document with nothing on screen
  // saying whose it is — on the one surface where getting that wrong means a vet
  // reads the wrong patient's bloodwork.
  //
  // The header is the right home for it: §4.1 already makes the pet's name the
  // library header's job ("the only filing cue a multi-pet household gets"), and
  // this bar sits OUTSIDE the ScrollView, so it is still on screen when the phone
  // is turned around over a scrolled document.
  //
  // Falls back to the bare title rather than "your pet’s Vet Files" when the pet
  // cannot be resolved (an archived pet, a cold deep link) — same rule as the
  // filename above it: silence beats a confident guess, and the awkward possessive
  // would read as a bug besides.
  const headerTitle = documentPet ? `${documentPet.name}’s Vet Files` : 'Vet Files';

  const linkedVisit = detail?.vetVisitId
    ? visits.find((v) => v.id === detail.vetVisitId) ?? null
    : null;

  // D13 targets — one per OTHER pet in the household; empty in a single-pet account,
  // where the ⋯ menu shows only Rename/Delete (plus Add another page for an image).
  // Excludes the document's OWN pet (detail.petId), never merely the active pet — a
  // deep link or a mid-session pet switch must not offer "also add" to the pet the
  // document already belongs to, nor mis-target the copy.
  const alsoAddTargets: AlsoAddTarget[] = detail
    ? pets
        .filter((p) => p.id !== detail.petId)
        .map((p) => ({
          petId: p.id,
          label: alsoAdded.has(p.id) ? alsoAddedLabel(p.name) : alsoAddLabel(p.name),
          done: alsoAdded.has(p.id),
        }))
    : [];

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
        title={headerTitle}
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

            <View style={styles.titleBlock}>
              <Text style={[styles.title, detail.untitled && styles.titleUntitled]}>
                {detail.title}
              </Text>
              {/* B-546 — the name the file arrived with. Shown here whatever the
                  title is (the library row drops it once a name exists; this screen
                  does not — see VetDocumentDetail.sourceFilename), and shown as
                  provenance rather than as a heading: it is the answer to "is this
                  the right PDF" in the seconds before Send. Middle-truncated so the
                  extension and the distinguishing stem both survive. */}
              {detail.sourceFilename ? (
                <Text style={styles.file} numberOfLines={1} ellipsizeMode="middle">
                  {detail.sourceFilename}
                </Text>
              ) : null}
            </View>

            <DocumentMetaCard rows={metaRows} />
          </ScrollView>

          {/* Share owns the floor alone (mock E-img-r2). The label names the
              OBJECT rather than the recipient, and on a multi-page document it
              names the page — because that is what actually leaves the app.
              Two problems, one string (VF-6):

              • The silent-page bug. handleShare sends detail.pages[page] only,
                and a bare "Share" over a 3-page discharge sheet let an owner
                believe they had handed the vet the document when they had handed
                over its cover. They found out from the "-p1" in the filename,
                after the vet had the file. Aggregate share is parked (§11), so
                the honest move is to say which page is going.
              • The label reconciliation §9 asks for. The vet report says "Send
                to vet" because it has exactly one audience by construction. A
                stored document does not — this feature's own empty state names
                boarding and groomers, and §2 ranks vaccination certificates as
                the highest-frequency need — so naming the vet would misdescribe
                the most common use. Naming the object keeps both surfaces on one
                verb without inventing a recipient the app cannot know.

              Deviates from the mock's bare "Share"; flagged for a Designer word. */}
          <View style={styles.actions}>
            <PrimaryButton
              label={
                detail.pages.length > 1
                  // "of N" is the load-bearing half — "Send page 1" still lets an
                  // owner assume page 1 is all there is.
                  ? `Send page ${page + 1} of ${detail.pages.length}`
                  : 'Send this document'
              }
              onPress={handleShare}
              loading={saving}
            />
          </View>
        </>
      )}

      {detail && (
        <>
          <PhotoViewer
            visible={imageViewer}
            uris={detail.pages.map((p) => uriFor(p))}
            initialIndex={viewerStart}
            // B-590 — the pet rides into the lightbox the same way it rides into the
            // PDF viewer's bar just below: an image document is the primary capture
            // class (§1/§2), so this chrome-less black surface was the higher-volume
            // handover surface with no name on it. Same resolve-or-stay-silent rule
            // as the header and the PDF title — a confident wrong name is worse than
            // none on the surface a vet reads a patient's record off.
            caption={documentPet ? `${documentPet.name} · ${detail.title}` : detail.title}
            // Matches the hero's sentence rather than the shared default's "Photo
            // unavailable": this is a clinical document, and AC 12 wants the cause
            // named, not the symptom.
            unavailableLabel="Needs a connection to show this page"
            // A swipe inside the viewer is what the hero's dots, the Share action
            // and the AC-12 cache all follow — a page the owner never looked at is
            // not a page worth downloading in full.
            onPageChange={(index) => { setPage(index); cacheOpenedPage(index); }}
            onClose={() => setImageViewer(false)}
          />

          <DocumentPdfViewer
            visible={pdfViewer}
            uri={coverUri}
            // B-550 continued. The header fix above is invisible from inside this
            // Modal, and this IS the handover surface for the PDF case — a lab
            // result full-screen is the thing actually turned around to face a vet.
            // So the pet rides in the bar's title too, same resolve-or-stay-silent
            // rule as the header.
            title={documentPet ? `${documentPet.name} · ${detail.title}` : detail.title}
            onClose={() => setPdfViewer(false)}
          />

          <DocumentMoreMenu
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            // B-549 — image documents only (a PDF group is one page per PDF, §4.4).
            onAddPage={detail.isPdf ? undefined : handleAddPage}
            // B-547 / D13 — one line per other pet; empty ⇒ nothing renders.
            alsoAdd={alsoAddTargets}
            onAlsoAdd={handleAlsoAdd}
            busy={capturing}
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
  titleBlock: {
    gap: 3,
  },
  title: {
    fontSize: theme.textLG,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
  },
  // Provenance sits below the title and quieter than it — the filename is what the
  // document was CALLED, never what it IS.
  file: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
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
