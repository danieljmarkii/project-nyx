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
