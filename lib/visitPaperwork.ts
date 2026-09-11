// Paperwork photographed at a visit — the capture, and the pointer the in-room one
// needs (CUL-902 / VV-4).
//
// THE PROBLEM. "At the vet" (mock C1) offers *Photograph the paperwork*, and the
// photo goes to Vet Files under the visit's pet. But the `vet_visits` row does not
// exist yet — spec §5.1 is explicit that the in-room draft lives on the APPOINTMENT
// precisely so no phantom visit is minted to hold typing — so there is nothing for
// `vet_documents.vet_visit_id` to point at. The link is made at the D1 save, and
// something has to remember which documents to link.
//
// WHY NOT A COLUMN. It would be a migration, and a migration is its own PR
// (§ Git Workflow). `vet_appointments.questions` is the only JSON on the row and it
// is CHECKed as an array of question objects (migration 066); smuggling document ids
// through it would be a second meaning on a column with a stated one.
//
// WHY A DEVICE-LOCAL STORE IS HONEST HERE, and this is the whole argument: the
// pointer is a CONVENIENCE, never the record. The document itself is already filed —
// a real `vet_documents` row under the right pet, pushed by the ordinary queue,
// visible in Vet Files. Losing the pointer costs the automatic link, and the owner
// can still set it from the document's own detail screen (VF-4's visit-link row),
// which is the sanctioned door for exactly this. Nothing about the health record
// depends on a key in AsyncStorage. Contrast the draft and the ticks, which ARE the
// record and therefore live in SQLite and sync.
//
// ONE KEY, NOT A KEY PER APPOINTMENT — for the wipe, not the write. `lib/signalFold.ts`
// states the same reason: a key PREFIX cannot be removed by name, so a per-appointment
// scheme leaves the next account on a shared device to inherit whatever the previous
// owner left behind. One key is one `removeItem` in `wipeLocalSession`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncPendingVetDocuments } from './sync';
import {
  buildVetDocumentRows,
  insertVetDocumentRows,
  rejectedPickMessage,
  screenPickedFiles,
} from './vetDocumentCapture';
import { pickVetImages } from './vetDocumentPickers';

export const VISIT_PAPERWORK_STORAGE_KEY = 'nyx.visitPaperwork';

/** appointment id → the `document_group_id`s captured against it, oldest first. */
export type VisitPaperworkStore = Record<string, string[]>;

/**
 * How many appointments' pointers are kept. The store is pruned to the most
 * recently touched entries on every write, so a device that never logs a visit
 * cannot grow this unboundedly.
 *
 * Insertion order is the proxy for recency: `JSON.parse` preserves the key order of
 * the object it read, and every write re-inserts the touched key at the end (the
 * entry is deleted before it is set below), so the oldest entries are at the front.
 */
const MAX_TRACKED_APPOINTMENTS = 20;

async function readStore(): Promise<VisitPaperworkStore> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(VISIT_PAPERWORK_STORAGE_KEY);
  } catch (e) {
    // A read failure is not an empty store — but for this consumer the two have the
    // same safe answer (offer no automatic link), and throwing would take the
    // in-room screen down over a cache.
    console.warn('[visitPaperwork] read failed:', e);
    return {};
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: VisitPaperworkStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((v): v is string => typeof v === 'string');
      if (ids.length > 0) out[key] = ids;
    }
    return out;
  } catch {
    console.warn('[visitPaperwork] store was not valid JSON — read as empty');
    return {};
  }
}

async function writeStore(store: VisitPaperworkStore): Promise<void> {
  try {
    await AsyncStorage.setItem(VISIT_PAPERWORK_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    // Best-effort by design (see the header): the document is already saved, and a
    // failure here costs the automatic link, nothing else.
    console.warn('[visitPaperwork] write failed:', e);
  }
}

/** The documents captured in the room against this appointment, oldest first. */
export async function readPaperworkFor(appointmentId: string): Promise<string[]> {
  const store = await readStore();
  return store[appointmentId] ?? [];
}

/** Remember a document group captured against this appointment. Idempotent. */
export async function rememberPaperwork(appointmentId: string, groupId: string): Promise<void> {
  const store = await readStore();
  const existing = store[appointmentId] ?? [];
  if (existing.includes(groupId)) return;
  // Delete before set so the touched appointment moves to the END of the insertion
  // order, which is what makes the prune below drop the least recently touched.
  delete store[appointmentId];
  store[appointmentId] = [...existing, groupId];

  const keys = Object.keys(store);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_TRACKED_APPOINTMENTS))) {
    delete store[stale];
  }
  await writeStore(store);
}

/** Drop an appointment's pointers — called once its documents have been linked. */
export async function forgetPaperwork(appointmentId: string): Promise<void> {
  const store = await readStore();
  if (!(appointmentId in store)) return;
  delete store[appointmentId];
  await writeStore(store);
}

/**
 * Sign-out wipe. Wired into `wipeLocalSession` BY NAME (`lib/session.ts`) — the
 * FR-9 parity rule: wipe every place account state rests, not just SQLite. A
 * document-group id is a pointer into the previous owner's health record, and a
 * shared device must not carry it into the next account.
 */
export async function clearVisitPaperwork(): Promise<void> {
  try {
    await AsyncStorage.removeItem(VISIT_PAPERWORK_STORAGE_KEY);
  } catch (e) {
    console.warn('[visitPaperwork] wipe failed:', e);
  }
}

// ── The capture itself ──────────────────────────────────────────────────────────
//
// Both visit screens photograph paperwork — "At the vet" in the room and "How did it
// go?" afterwards — and they differ only in what they do with the result (the
// in-room one remembers a pointer, the after-visit one links the visit that now
// exists). The capture is therefore ONE function rather than two copies of the
// screen-picker-screen-insert sequence, which is how `app/vet-files.tsx` and a second
// caller would otherwise drift on the parts that matter: the size screen, the group
// shape, and the push.


export interface PaperworkCapture {
  /** The document group that was created, or null when nothing was saved. */
  groupId: string | null;
  /** An owner-facing sentence about files that were refused, or null. */
  skipped: string | null;
}

/**
 * Photograph the paperwork, into this pet's Vet Files.
 *
 * NO DOCUMENT TYPE IS ASKED (Vet Files D11 — capture stays zero-decision), and the
 * pages of one capture stay ONE document, which is the discharge sheet the owner is
 * actually holding. `vet_visit_id` is left NULL here: D7 forbids an upload minting or
 * dating a visit, so the LINK is the caller's, made afterwards to a visit the owner
 * created themselves.
 *
 * Camera only. The room is the use case, and a Photos/Files picker in front of
 * someone holding an animal is a browse where a shutter belongs; the full source list
 * lives on Vet Files, which is one tap from the saved document.
 */
export async function captureVisitPaperwork(petId: string): Promise<PaperworkCapture> {
  const picked = await pickVetImages('camera');
  if (picked.length === 0) return { groupId: null, skipped: null };

  const screened = screenPickedFiles(picked);
  const skipped = rejectedPickMessage(screened);
  if (screened.accepted.length === 0) return { groupId: null, skipped };

  const rows = buildVetDocumentRows({ petId, source: 'camera', pages: screened.accepted });
  await insertVetDocumentRows(rows);
  // Fire-and-forget: the push is the backup, not the save — which is what the
  // offline line promises on every surface that says it.
  syncPendingVetDocuments().catch((e) => console.warn('[visitPaperwork] document push failed:', e));

  return { groupId: rows[0]?.document_group_id ?? null, skipped };
}
