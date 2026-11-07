import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { countRecordGaps } from './db';
import { countUnclaimedInbox } from './captureInbox';
import { usePetStore } from '../store/petStore';
import { transientDirectory } from './transientFiles';
import { supabase } from './supabase';
import { syncNow } from './sync';
import { fetchOwnerSurname, getDeviceTimezone } from './profile';
import { parseReportPhotos, type ReportPhoto } from './reportPhotoPicker';
import { lockedPrintHtml } from './examRoom';

// Vet report client (Step 9, Phase 2 PR 5 — the owner-facing MVP).
//
// The authenticated `generate-report` Edge Function returns the fully-rendered
// clinical HTML for the owner's own pet. PR 5 has NO public share token / no
// unauthenticated link (that's PR 6) — the report is a snapshot re-generated on
// demand, shown in-app in a WebView, and handed to the vet as a PDF via the
// native share sheet. On-device PDF generation of the already-server-rendered,
// immutable HTML is a presentation step (spec §14 S7).

export interface VetReportParams {
  petId: string;
  // Optional owner override → a custom window (§6). Absent ⇒ the default cascade
  // (since-visit → active trial → 90-day fallback), resolved server-side.
  startDate?: string;
  endDate?: string;
  /**
   * CUL-875 — *Include your Noticed notes* (T-22, §9 rule 4). Governs whether the
   * sentences the owner wrote on her daily looks are printed in the report's Noticed
   * appendix.
   *
   * REQUIRED (CUL-1464): an optional field lets a caller decide by writing nothing (C-37).
   * The server reads an absent value as OFF since CUL-1548, so an omission now drops the
   * notes the owner asked for rather than printing ones they never chose; neither is a
   * caller's to decide by silence.
   *
   * IT GOVERNS THE LOOK NOTE AND NOTHING ELSE TODAY. The older `events.notes` field —
   * the 300-character box on every symptom and meal — has printed verbatim in appendix A
   * and E since Step 9 with no disclosure anywhere in the product; whether it gains a cue
   * and joins this toggle is CUL-848, a PM decision that is still open. Until it is
   * ruled, this flag must not be renamed to something that implies it covers both, and
   * the screen's copy says which notes it means.
   */
  includeNotes: boolean;
  /**
   * PR-23b (CUL-2454): the attachment ids the owner left out in the preview's photo picker.
   * Sent only on a v2 request, and only when non-empty; the server honours it on the v2 document
   * alone and ignores any id that is not one of this pet's photos. Absent means every photo goes,
   * which is what the picker shows before the owner touches it.
   */
  photosLeftOut?: readonly string[];
}

export interface VetReport {
  html: string;
  /**
   * VR2-17 (CUL-2297): the v2 document's phone reflow (`renderPhoneV2`), built from the same
   * document as `html`. Null for v1, and for a v2 response from a server older than PR-17; the
   * screen then reads `html` as before. Never sent anywhere: the PDF is always `html`.
   */
  phoneHtml: string | null;
  petName: string;
  startDate: string;
  endDate: string;
  scopeBasis: string;
  // PR 7 — the count of photographed incidents baked into this report + PDF. Surfaced to the owner
  // as a visibility line before sending (spec §8: "the mitigation is owner visibility"). The photo
  // bytes themselves are already embedded in `html` (EXIF-stripped, downscaled server-side), so
  // they flow into both the in-app WebView and the on-device PDF with no extra client wiring.
  photoCount: number;
  /**
   * PR-23b (CUL-2454): every photo this report held before the owner's choice, for the picker
   * (`lib/reportPhotoPicker.ts`). Null on v1 and from a server older than PR-23b: no picker.
   * Absent reads as null, like `reportId`, so a report built elsewhere offers no picker.
   */
  photos?: ReportPhoto[] | null;
  /**
   * R-16 (CUL-998 / CUL-861) — the report's own verdict that the trial it describes is
   * still running and has no allowed-food list, so nothing on it was checked against one.
   * Returned by the function rather than re-derived here, because the line the owner reads
   * before Send is a claim about THIS document, and a client re-read of the local mirror
   * could name a different trial or a different day than the report did (C-4: one
   * predicate both surfaces switch on).
   *
   * ABSENT ⇒ FALSE. A client built before the function deploys shows nothing, which is
   * the pre-R-16 state — never a false "no list" over a report that did not say so.
   */
  trialAllowedListMissing: boolean;
  /**
   * Which renderer the function ran (spec §3.6), read off its `report_version`. It decides the
   * PDF's name only: v2 is filed as the owner's home log, v1 keeps its name. Anything but 'v2'
   * reads as v1, the shape every build before CUL-2292 shared.
   */
  reportVersion: 'v1' | 'v2';
  /** `user_profiles.last_name`, read only for a v2 report (CUL-2292). Null: unset or unreadable. */
  ownerSurname: string | null;
  /**
   * VR2-20 (CUL-2300): the draft saved copy the server kept of this exact `html`, which a send
   * turns into the owner's kept copy (`lib/reportKeep.ts`). Null: not saved (v1, a failed save,
   * or a server older than PR-20), and the report still sends; nothing is kept. Absent reads as
   * null, so a report built elsewhere (a fixture, an older caller) is never kept by mistake.
   */
  reportId?: string | null;
  /** The pet the report is of, as the request named it: the keep call names its row by both. */
  petId?: string;
}

// ── B-534 — the report's freshness gate ─────────────────────────────────────
//
// Every local write is local-first with a fire-and-forget push, while
// `generate-report` reads live Supabase — so "log something → open the report"
// races the queue, and the artifact renders whatever the server had when the
// call landed. The canonical case is the one the pre-ship review executed: end
// a trial, tap "Open vet report" on the completed card, and on weak signal the
// vet reads the trial as ongoing (the B-455 harm via timing).
//
// TWO RULES SHAPE THIS GATE, both learned adversarially on the first cut:
//
//  • THE GATE COVERS EVERY QUEUE, NOT JUST TRIALS. The first cut counted and
//    flushed `diet_trials`/`diet_trial_foods` only, and the reviewer's
//    counterexample was immediate: twelve unsynced refused bowls (the trial row
//    itself long synced) produced an empty safety band on a refusing cat, with
//    the staleness zone advertising currency. The report reads events, meals,
//    weights, doses, visits and trials alike, so the honest question is "has
//    this phone sent everything?", which the sync queue count already answers across
//    every queue — and the flush is `syncNow()`, the one documented cycle with
//    the FK ordering and the in-flight guard, not a bespoke two-table push
//    running concurrently against it.
//
//  • THE DISCLOSURE FAILS SAFE, NEVER CLOSED. The first cut raised its flag
//    only from the RE-count after the flush, so any throw between "we counted
//    pending rows" and "we re-counted zero" silently cleared it — the repair
//    attempt gating the disclosure, which is B-494's rule inverted. Now: a
//    positive first count STANDS unless a successful re-count clears it. The
//    one silent path left is the first count itself failing — with no evidence
//    either way, a standing false alarm on every report would be the B-398
//    "wrong advice forever" failure in new clothes.
export interface ReportFreshness {
  /** Rows waiting for a connection (quarantined excluded — they get their own copy). */
  pending: number;
  /** Rows the push queue has given up on; no amount of connectivity moves them. */
  quarantined: number;
}

export async function flushBeforeReport(): Promise<ReportFreshness> {
  return (await flushAndCount(oneReadCount)) ?? { pending: 0, quarantined: 0 };
}

type UnsentCounter = () => Promise<ReportFreshness>;

/**
 * ONE statement (`countRecordGaps`, Ask's reader). `getSyncStatus` counts pending and refused in
 * two reads, and a drain that marks a parent synced and then re-arms its refused child between
 * them (refused → pending) makes both answer zero while the child is still on this phone
 * (CUL-2457 adversarial pass 2). Same rows, partitioned by the same `sync_error` test. Both gates
 * use it: the send's calm check since CUL-2457, the report's freshness line since CUL-2471.
 */
const oneReadCount: UnsentCounter = async () => {
  const g = await countRecordGaps();
  return { pending: g.unsent, quarantined: g.refused };
};

/** The pets whose widget captures this phone may still hold (the ingest's own allowlist). */
function accountPetIds(): ReadonlySet<string> {
  return new Set(usePetStore.getState().pets.map((p) => p.id));
}

/**
 * CUL-2468: the widget's capture inbox, counted with the rows. A capture waits there (outside
 * SQLite) until the foreground ingest (hooks/useSync.ts) takes it in, so a SQLite-only count read
 * a treat logged from the widget during a diet trial as "everything sent" while the server, and
 * the report's off-diet read, had never seen it. Whatever is still in the inbox counts as pending:
 * it has not reached the server.
 *
 * COUNTED, NEVER INGESTED HERE. The gate does not run the ingest itself: an ingest is a WRITER,
 * and one started from this screen while a sign-out is wiping the store would have no session
 * epoch to fence on (useSync captures it at session start; this gate cannot), so it could write
 * the old account's rows after the wipe (CUL-1968's hazard). Counting alone closes the gap; the
 * cost is an over-warn for a capture the foreground has not reached yet, which reopening clears.
 *
 * ORDER: the inbox is read BEFORE the rows. A foreground ingest running beside this gate only
 * ever moves a record inbox → rows, so read in this order a record caught mid-move is counted
 * twice (an over-warn), never by neither (the CUL-2471 two-read hazard, across two stores).
 *
 * AN UNREADABLE INBOX ERRS LOUD, AND NEVER COSTS THE ROWS (adversarial passes 1 and 2). Its read is
 * its own, so a throwing listing never nulls a row count that succeeded (pass 1: 12 unsent and 2
 * refused rows went silent). What it counts for when unreadable:
 *  • on the re-count, the first read's value carries forward: `syncNow` never ingests, so nothing
 *    but a successful read can show those captures gone (pass 2: three treats went to zero);
 *  • on the first read, the send answers "unknown" (null), because an unknown record never earns
 *    its calm check; the freshness line counts ONE pending entry, the louder side of a ruling the
 *    PM owns (silence over a possible capture vs a line that may stand while the inbox stays
 *    unreadable). The stopgap is loud until that ruling.
 */
function readInbox(): number | null {
  try {
    return countUnclaimedInbox(accountPetIds());
  } catch (e) {
    console.warn('[Report] capture inbox unreadable:', e);
    return null;
  }
}

/** What the gate does with an inbox it could not read on the FIRST count. */
type UnreadableInbox = 'count-one' | 'unknown';

/**
 * CUL-2457, the send's half of the same gate: flush, then count what is still on this phone.
 * Null when the first count could not be read. The report's freshness line reads that as silence
 * (above), because a standing false alarm there would be wrong advice forever; the send's calm
 * check reads it as "unknown", and an unknown record never earns the check. Same flush, same
 * fail-safe re-count; only what the caller does with "no evidence" differs.
 */
export async function flushBeforeSend(): Promise<ReportFreshness | null> {
  return flushAndCount(oneReadCount, 'unknown');
}

async function flushAndCount(
  rowCount: UnsentCounter,
  unreadableInbox: UnreadableInbox = 'count-one',
): Promise<ReportFreshness | null> {
  // The inbox is read BEFORE the rows, each time (above).
  const firstInbox = readInbox();
  if (firstInbox === null && unreadableInbox === 'unknown') return null;
  const inboxOnce = firstInbox ?? 1;
  let counts: ReportFreshness;
  try {
    const rows = await rowCount();
    counts = { pending: rows.pending + inboxOnce, quarantined: rows.quarantined };
  } catch (e) {
    console.warn('[Report] freshness check failed:', e);
    return null;
  }
  if (counts.pending === 0) return counts;
  try {
    // `syncNow` self-serializes: if a cycle is already in flight this returns
    // immediately and the re-count below may still see pending rows — an
    // over-warn in the safe direction, and the line's own remedy ("reopen the
    // report") is exactly what resolves it.
    await syncNow();
    const inbox = readInbox() ?? inboxOnce;
    const rows = await rowCount();
    return { pending: rows.pending + inbox, quarantined: rows.quarantined };
  } catch (e) {
    console.warn('[Report] pre-report flush failed (counts stand):', e);
    return counts;
  }
}

/**
 * The owner-facing line for a report built while this phone still holds unsent
 * rows — or null when there is nothing to say.
 *
 * B-398's two-state rule, applied to the report bar: QUARANTINE LEADS, because
 * "connect to the internet" is true of a pending row and a lie about a
 * quarantined one (`store/syncStore.ts`'s own words), and the owner who can fix
 * a quarantined row needs the action that actually works. Register and remedy
 * mirror `SyncBanner` — the same fact told to the same owner on another surface
 * must not use different words.
 */
export function reportFreshnessLine(f: ReportFreshness): string | null {
  if (f.quarantined > 0) {
    const entries = f.quarantined === 1 ? '1 entry' : `${f.quarantined} entries`;
    const them = f.quarantined === 1 ? 'it' : 'them';
    return (
      `${entries} on this phone couldn’t be saved to your records, so this report ` +
      `may not include ${them}. Open ${f.quarantined === 1 ? 'it' : 'one'} from ` +
      'History and save it again to retry.'
    );
  }
  if (f.pending > 0) {
    return (
      'Some of what you’ve logged on this phone hasn’t synced yet, so this report ' +
      'may not include it. Connect to the internet and reopen the report.'
    );
  }
  return null;
}

// ── CUL-2347 — which layout to ask for ───────────────────────────────────────
// The "New report layout" switch (`report_document_v2`, PM ruling (a) on CUL-2290). The
// request carries `reportVersion: 'v2'` only when BOTH gates hold: the account is on the
// allowlist (Gate 1) AND the owner turned the switch on (Gate 2). Being eligible turns
// nothing on. Every other caller sends today's body byte for byte, with no key at all, so
// the server's v1 default is what they get. The server re-checks the flag against the JWT
// uid either way; this only decides whether to ask.
//
// Pure, so the two-gate truth table is unit-tested without the stores.
export function reportVersionFor(eligible: boolean, optedIn: boolean): 'v2' | null {
  return eligible && optedIn ? 'v2' : null;
}

// Read once per request, not reactive: the report is generated on open, so a flip takes
// effect on the next one. The config store is required LAZILY (the floorOnNow pattern,
// lib/incidentFloorQueue.ts): it pulls the auth store into every importer of this module.
// A store that cannot be loaded reads as v1, the fail-closed direction.
function reportVersionNow(): 'v2' | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { allowlistFlagNow } = require('../hooks/useAppConfig') as typeof import('../hooks/useAppConfig');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useBetaOptInStore } = require('./betaFeatures') as typeof import('./betaFeatures');
    return reportVersionFor(
      allowlistFlagNow('report_document_v2'),
      useBetaOptInStore.getState().optIns.report_document_v2 === true,
    );
  } catch {
    return null;
  }
}

export async function generateVetReport(params: VetReportParams): Promise<VetReport> {
  // timezone: the DEVICE zone, so the report's trial "Day N" buckets by the same clock the
  // owner's card does (B-443), rather than a possibly-stale stored `user_profiles.timezone`.
  // Injected here (not in VetReportParams) so every caller sends it without threading it; null
  // when unresolvable → the server falls back to the stored zone. Never guessed.
  // reportVersion is injected the same way, and only when it is 'v2' (CUL-2347).
  const reportVersion = reportVersionNow();
  const { photosLeftOut, ...rest } = params;
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: {
      ...rest,
      timezone: getDeviceTimezone(),
      ...(reportVersion === 'v2' ? { reportVersion } : {}),
      // PR-23b: v2 only, and only a real choice; v1 has no words for a photo left out.
      ...(reportVersion === 'v2' && photosLeftOut && photosLeftOut.length > 0 ? { photosLeftOut: [...photosLeftOut] } : {}),
    },
  });
  if (error) throw new Error(`Report generation failed: ${error.message}`);
  if (!data || typeof data.html !== 'string' || data.html.length === 0) {
    // The function always renders SOMETHING (empty states are designed into the
    // HTML). A blank body means the call itself failed — surface, never show blank.
    throw new Error('The report came back empty. Please try again.');
  }
  const version: 'v1' | 'v2' = data.report_version === 'v2' ? 'v2' : 'v1';
  return {
    html: data.html,
    phoneHtml:
      // A whitespace-only layout is no layout (CUL-2458 adversarial pass): null here, so the
      // screen refuses the response and the exam room is never offered an empty frame.
      version === 'v2' && typeof data.phone_html === 'string' && data.phone_html.trim().length > 0 ? data.phone_html : null,
    reportVersion: version,
    ownerSurname: version === 'v2' ? await ownerSurnameNow() : null,
    petName: typeof data.pet_name === 'string' ? data.pet_name : '',
    startDate: typeof data.start_date === 'string' ? data.start_date : '',
    endDate: typeof data.end_date === 'string' ? data.end_date : '',
    scopeBasis: typeof data.scope_basis === 'string' ? data.scope_basis : '',
    photoCount: typeof data.photo_count === 'number' ? data.photo_count : 0,
    photos: version === 'v2' ? parseReportPhotos(data.photos) : null,
    trialAllowedListMissing: data.trial_allowed_list_missing === true,
    petId: params.petId,
    reportId: version === 'v2' && typeof data.report_id === 'string' && data.report_id.length > 0 ? data.report_id : null,
  };
}

// A clinic-friendly, PIMS-filable filename: "Nyx-vet-report-2026-04-04-to-2026-07-03.pdf".
// Pure + exported so the sanitisation is unit-tested — a pet named "Mr. O'Malley /2"
// must never produce a path-breaking filename.
export function reportPdfFilename(petName: string, startDate: string, endDate: string): string {
  const safeName =
    (petName || 'pet')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pet';
  const range = startDate && endDate ? `-${startDate}-to-${endDate}` : '';
  return `${safeName}-vet-report${range}.pdf`;
}

// The signed-in owner's surname, or null. Never throws: a name the filename cannot read is a
// name it leaves out, and the report itself must still open.
async function ownerSurnameNow(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    return userId ? await fetchOwnerSurname(userId) : null;
  } catch (e) {
    console.warn('[pdf] owner surname read skipped:', e);
    return null;
  }
}

// One letter set for a filename every PIMS and mail client accepts: Latin letters with their
// marks dropped ("Zoë" → "Zoe", "Müller" → "Muller"), the few Latin letters that do not
// decompose spelled out, and every other run collapsed to one hyphen. A name with no Latin
// letter left (李, Ωμέγα's Greek) comes back empty and is omitted, never guessed at.
const LATIN_SPELLED: Record<string, string> = {
  ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L',
  đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', þ: 'th', Þ: 'Th', ı: 'i', ĸ: 'k',
};
const NAME_PART_MAX = 40;

export function filenamePart(raw: string | null): string {
  if (!raw) return '';
  const latin = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßæÆœŒøØłŁđĐðÐþÞıĸ]/g, (c) => LATIN_SPELLED[c] ?? '');
  return latin
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_PART_MAX)
    .replace(/-+$/, '');
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// The v2 name (spec §8): "Cooper-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf". The
// surname comes only from `last_name` (§5.7) and is omitted when empty; the dates only when
// both are real days, so nothing the server sends can put a path character in the name.
export function reportPdfFilenameV2(petName: string, surname: string | null, startDate: string, endDate: string): string {
  const who = [filenamePart(petName) || 'pet', filenamePart(surname)].filter((x) => x !== '').join('-');
  const range = ISO_DAY.test(startDate) && ISO_DAY.test(endDate) ? `_${startDate}_to_${endDate}` : '';
  return `${who}_owner-home-log${range}.pdf`;
}

export function reportPdfFilenameFor(report: VetReport): string {
  return report.reportVersion === 'v2'
    ? reportPdfFilenameV2(report.petName, report.ownerSurname, report.startDate, report.endDate)
    : reportPdfFilename(report.petName, report.startDate, report.endDate);
}

/**
 * The report as a named PDF on this phone, plus `release` to delete both files' temp halves.
 * `uri` is the clinic-friendly named copy (in the transient directory the sign-out wipe
 * clears), or expo-print's own temp when the copy fails, so a send is never blocked.
 *
 * CUL-1045: neither file may outlive the account. The named copy is the whole clinical record
 * under the pet's name, so it goes in the transient directory the sign-out wipe clears
 * (lib/transientFiles.ts, the stageForShare precedent). expo-print's own temp
 * (<Caches>/Print/<uuid>.pdf) is deleted by `release` once the native sheet has closed, and
 * the wipe also clears that folder, because a process that dies with the sheet open never
 * reaches the caller's `finally`.
 *
 * PR-18 (CUL-2298) lifted this out of `shareReportPdf` so the Email target attaches exactly
 * the file Share sends: one render, one name.
 */
export async function renderReportPdf(report: VetReport): Promise<{ uri: string; release: () => void }> {
  const { uri } = await Print.printToFileAsync({ html: lockedPrintHtml(report.html) });
  let named = uri;
  try {
    const dir = transientDirectory();
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, reportPdfFilenameFor(report));
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    named = dest.uri;
  } catch {
    named = uri;
  }
  return { uri: named, release: () => deletePrintTemp(uri) };
}

// Render the report HTML to a PDF on-device and open the native share sheet
// (Mail / Messages / AirDrop) — the primary "give it to the vet" path (§8.2).
// Returns false when the platform has no share sheet, so the caller can message it.
export async function shareReportPdf(report: VetReport): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const pdf = await renderReportPdf(report);
  try {
    await Sharing.shareAsync(pdf.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Send vet report',
    });
  } finally {
    pdf.release();
  }
  return true;
}

function deletePrintTemp(uri: string): void {
  try {
    const temp = new File(uri);
    if (temp.exists) temp.delete();
  } catch (e) {
    console.warn('[pdf] print temp cleanup skipped:', e);
  }
}
