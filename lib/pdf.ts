import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { getSyncStatus } from './db';
import { supabase } from './supabase';
import { syncNow } from './sync';
import { getDeviceTimezone } from './profile';

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
}

export interface VetReport {
  html: string;
  petName: string;
  startDate: string;
  endDate: string;
  scopeBasis: string;
  // PR 7 — the count of photographed incidents baked into this report + PDF. Surfaced to the owner
  // as a visibility line before sending (spec §8: "the mitigation is owner visibility"). The photo
  // bytes themselves are already embedded in `html` (EXIF-stripped, downscaled server-side), so
  // they flow into both the in-app WebView and the on-device PDF with no extra client wiring.
  photoCount: number;
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
//    this phone sent everything?", which `getSyncStatus` already answers across
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
  let counts: ReportFreshness;
  try {
    const s = await getSyncStatus();
    counts = { pending: s.pendingCount, quarantined: s.quarantinedCount };
  } catch (e) {
    console.warn('[Report] freshness check failed:', e);
    return { pending: 0, quarantined: 0 };
  }
  if (counts.pending === 0) return counts;
  try {
    // `syncNow` self-serializes: if a cycle is already in flight this returns
    // immediately and the re-count below may still see pending rows — an
    // over-warn in the safe direction, and the line's own remedy ("reopen the
    // report") is exactly what resolves it.
    await syncNow();
    const s = await getSyncStatus();
    return { pending: s.pendingCount, quarantined: s.quarantinedCount };
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

export async function generateVetReport(params: VetReportParams): Promise<VetReport> {
  // timezone: the DEVICE zone, so the report's trial "Day N" buckets by the same clock the
  // owner's card does (B-443), rather than a possibly-stale stored `user_profiles.timezone`.
  // Injected here (not in VetReportParams) so every caller sends it without threading it; null
  // when unresolvable → the server falls back to the stored zone. Never guessed.
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { ...params, timezone: getDeviceTimezone() },
  });
  if (error) throw new Error(`Report generation failed: ${error.message}`);
  if (!data || typeof data.html !== 'string' || data.html.length === 0) {
    // The function always renders SOMETHING (empty states are designed into the
    // HTML). A blank body means the call itself failed — surface, never show blank.
    throw new Error('The report came back empty. Please try again.');
  }
  return {
    html: data.html,
    petName: typeof data.pet_name === 'string' ? data.pet_name : '',
    startDate: typeof data.start_date === 'string' ? data.start_date : '',
    endDate: typeof data.end_date === 'string' ? data.end_date : '',
    scopeBasis: typeof data.scope_basis === 'string' ? data.scope_basis : '',
    photoCount: typeof data.photo_count === 'number' ? data.photo_count : 0,
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

// Render the report HTML to a PDF on-device and open the native share sheet
// (Mail / Messages / AirDrop) — the primary "give it to the vet" path (§8.2).
// Returns false when the platform has no share sheet, so the caller can message it.
export async function shareReportPdf(report: VetReport): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const { uri } = await Print.printToFileAsync({ html: report.html });

  // Rename the temp print output to a clinic-friendly name for the share sheet and
  // the vet's filing. Best-effort — a copy failure falls back to the raw uri so
  // sharing is never blocked (mirrors persistCapture's never-throw-on-copy rule).
  let shareUri = uri;
  try {
    const dest = new File(Paths.cache, reportPdfFilename(report.petName, report.startDate, report.endDate));
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    shareUri = dest.uri;
  } catch {
    shareUri = uri;
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Send vet report',
  });
  return true;
}
