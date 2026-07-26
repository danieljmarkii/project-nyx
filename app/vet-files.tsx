import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { Header, ScopeMenu } from '../components/ui';
import { WhorlSpinner } from '../components/brand/WhorlSpinner';
import { VetDocumentRow } from '../components/vetfiles/VetDocumentRow';
import { VetFilesEmptyState } from '../components/vetfiles/VetFilesEmptyState';
import { NameDocumentSheet, DocumentKindSheet } from '../components/vetfiles/VetDocumentMetaSheets';
import { usePetStore } from '../store/petStore';
import { getSignedUrls } from '../lib/storage';
import { VET_DOCUMENTS_BUCKET, type VetDocumentKind } from '../lib/vetDocuments';
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

// Vet Files — the library (B-478 VF-2). §4.1 + mock L-real / E1-r2.
//
// Reached from the pet profile (G3). Per-pet, reverse-chron, kind lens only — no
// folders ever (§2: Apple Health organises by type × date × source and never asks
// a user to file anything), and no search in v1 (D12 → B-479).
//
// Two forward links belong to PRs that have not landed yet: capture is VF-3 and the
// document detail is VF-4. They are wired through `pendingScreen` below rather than
// left silently inert, and the profile entry point stays gated (VET_FILES_ENTRY —
// see components/vetfiles + app/(tabs)/profile.tsx) so no owner can reach a
// half-built feature in the meantime.
export default function VetFilesScreen() {
  const activePet = usePetStore((s) => s.activePet);
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

  const [naming, setNaming] = useState<VetLibraryRow | null>(null);
  const [typing, setTyping] = useState<VetLibraryRow | null>(null);
  const [saving, setSaving] = useState(false);

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

  // TODO(VF-3 / VF-4): route to the capture sheet and the document detail. Kept as
  // one named no-op so the two call sites are greppable when those PRs land, and so
  // an unbuilt route can't silently swallow a tap in a QA build.
  const pendingScreen = useCallback((what: 'capture' | 'detail') => {
    console.warn(`[vet-files] ${what} lands in ${what === 'capture' ? 'VF-3' : 'VF-4'}`);
  }, []);

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
              onPress={() => pendingScreen('capture')}
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
        <VetFilesEmptyState petName={petName} onAdd={() => pendingScreen('capture')} />
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
                onName={() => setNaming(row)}
                onAddType={() => setTyping(row)}
              />
            ))}
          </View>
        </ScrollView>
      )}

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
