import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { supabase } from './supabase';

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
}

export async function generateVetReport(params: VetReportParams): Promise<VetReport> {
  const { data, error } = await supabase.functions.invoke('generate-report', { body: params });
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
