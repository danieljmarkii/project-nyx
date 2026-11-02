// The owner's kept copy of a sent report (Vet report v2 PR-20, CUL-2300; spec §11.1).
//
// The server stored this report's exact HTML as a draft at Preview (`VetReport.reportId`). When
// the report leaves the phone, this asks the server to keep that draft: the stored copy becomes
// the owner's, unchangeable, and appears in their Reports library (VR2-21).
//
// WHICH SENDS KEEP A COPY (spec §10.3: status words follow what the app knows). A copy is kept
// whenever the report PROBABLY left: Mail's `sent`, and its `undetermined` (Android never says),
// a print job handed over, a share sheet completed. Never for a Mail draft saved or cancelled,
// a print backed out of, a failure, or Copy (which hands over the email text, not the report).
//
// NEVER IN THE OWNER'S WAY. Fire-and-forget after the platform answered: the confirmation never
// waits on it, and a failure is logged, never shown (the report reached the vet either way). An
// offline send is not kept and is not retried; the draft is reaped after 24 hours.

import { supabase } from './supabase';
import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';

export type KeepVia = 'email' | 'print' | 'share';

/** The route to keep under for one platform answer, or null when nothing should be kept. */
export function keepViaFor(via: KeepVia, result: SendResult): KeepVia | null {
  switch (result) {
    case 'sent':
    case 'undetermined':
      return via === 'email' ? via : null;
    case 'done':
      return via === 'print' || via === 'share' ? via : null;
    case 'saved':
    case 'cancelled':
    case 'failed':
      return null;
  }
}

type Invoke = (body: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

const invokeKeep: Invoke = async (body) => {
  const { error } = await supabase.functions.invoke('generate-report', { body });
  return { error: error ? { message: error.message } : null };
};

/** Keep `report`'s draft as sent by `via`. True when the server kept it. Never throws. */
export async function keepReportCopy(report: VetReport, via: KeepVia, invoke: Invoke = invokeKeep): Promise<boolean> {
  if (!report.reportId || !report.petId) return false;
  try {
    const { error } = await invoke({ mode: 'keep', petId: report.petId, reportId: report.reportId, sharedVia: via });
    if (error) {
      console.warn('[reportKeep] the copy was not kept:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[reportKeep] the copy was not kept:', e);
    return false;
  }
}

/** After a send: keep the copy when this answer means the report left, without waiting on it. */
export function keepAfterSend(report: VetReport, via: KeepVia, result: SendResult, keep: typeof keepReportCopy = keepReportCopy): void {
  const route = keepViaFor(via, result);
  if (route === null) return;
  void keep(report, route);
}
