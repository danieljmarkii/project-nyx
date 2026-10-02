// The vet report's regenerate cadence (CUL-371 / B-237).
//
// The report screen regenerates whenever its request params change. Inside "Custom…"
// that means From-then-To fires two server builds back to back and throws the first
// away — a beat of "Updating…" churn for the owner and a wasted round trip. The fix is
// to let a custom-window EDIT settle before regenerating, and ONLY that: a pet change,
// a switch between Default and Custom, or the very first request still regenerates at
// once, because there the owner is waiting on a whole new report rather than nudging a
// bound of the one on screen. The predicate is pure so the screen's timer has exactly
// one reason to exist, tested here without a render.

import type { VetReportParams } from './pdf';
import { recordRange } from './recordDates';
import { ANCHORED_WINDOW_NAMES } from './historyWindows';

/** How long a custom-window edit is given to settle before the report regenerates.
 *  Long enough to cover a From tap followed by a To tap; short enough that a single
 *  edit does not feel ignored. */
export const CUSTOM_RANGE_SETTLE_MS = 600;

/** True when `next` is an edit of the custom window the screen is ALREADY showing —
 *  same pet, custom mode on both sides, and something moved — the one case that
 *  waits `CUSTOM_RANGE_SETTLE_MS` before regenerating. Everything else is immediate. */
export function isCustomWindowEdit(
  prev: VetReportParams | null,
  next: VetReportParams | null,
): boolean {
  if (!prev || !next) return false;
  if (prev.petId !== next.petId) return false;
  if (prev.startDate === undefined || next.startDate === undefined) return false;
  return prev.startDate !== next.startDate || prev.endDate !== next.endDate;
}

// ── The resolved-window line under the range control ─────────────────────────────

/** What each server scope basis is called on the screen. The visit rung takes History's own
 *  long name for the window (§3.9), imported so the report screen, the rundown and History
 *  cannot name one window three ways (CUL-1126). The report's rung 1 and History's window
 *  are the same bound (H-11), so they may share a name. */
export const SCOPE_BASIS_LABEL: Readonly<Record<string, string>> = {
  since_visit: ANCHORED_WINDOW_NAMES.visit,
  diet_trial: 'Active diet trial',
  fallback_90d: 'Last 90 days',
  custom: 'Custom range',
};

/**
 * "Since the last vet visit · Jul 2 – Sep 21": the window the server resolved, so the owner
 * sees what "Default" landed on without scrolling into the report's own range box.
 *
 * The range goes through the one formatter (H-10, CUL-1126): a year only outside the
 * current year, stated once, so a window that opens on a visit fourteen months ago reads
 * "Jul 2, 2025 – Sep 21", never "Jul 2 – Sep 21", which reads as eleven weeks. Both keys are
 * local day keys from the server's `resolveScope`. An unreadable or inverted pair prints the
 * basis alone rather than a window the report never had.
 */
export function reportScopeLine(
  scopeBasis: string,
  startDate: string,
  endDate: string,
  today: string,
): string {
  const basis = SCOPE_BASIS_LABEL[scopeBasis] ?? 'Report range';
  const range = recordRange(startDate, endDate, today);
  return range ? `${basis} · ${range}` : basis;
}
