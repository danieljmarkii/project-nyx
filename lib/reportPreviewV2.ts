// The v2 preview's rules (Vet report v2 PR-17, CUL-2297 + CUL-2383; spec §10.2, §6.3). Pure, so
// each one is unit-tested without a WebView.

import type { ComposerLive } from './reportComposer';
import type { VetReport } from './pdf';
import { FRAME_LOCK_SCRIPT, REPORT_WEBVIEW_ORIGINS } from './examRoom';

/** Which of the one document's two layouts the preview shows. */
export type PreviewView = 'phone' | 'printed';

/**
 * The v2 preview runs only when the server built the v2 document AND returned its phone layout.
 * A v2 response with no `phone_html` is refused by the screen (`isBareV2Report`, CUL-2458), so an
 * owner meets neither an empty preview frame nor the printed page on its own.
 */
export function hasPhonePreview(report: Pick<VetReport, 'reportVersion' | 'phoneHtml'>): boolean {
  return report.reportVersion === 'v2' && typeof report.phoneHtml === 'string' && report.phoneHtml.trim().length > 0;
}

/**
 * CUL-2458: a v2 response that came back without its phone layout. Its `html` is the PRINTED
 * page, and on a phone the printed page's lead chart can sit apart from its "not a test of the
 * diet alone" line, with zoom on and no pinned warning (the CUL-2430 class). The screen refuses
 * it as a failed build (error and retry) rather than showing the printed page bare: the pin
 * (`printedWarningOf`) needs the phone layout, so refusing is the louder fix and the simpler one.
 */
export function isBareV2Report(report: Pick<VetReport, 'reportVersion' | 'phoneHtml'>): boolean {
  return report.reportVersion === 'v2' && !hasPhonePreview(report);
}

/**
 * The band slot in the wait's silhouette: only on the outline's positive answer. `none`,
 * `incomplete` and an outline that was never read draw no slot, because a slot that shows and
 * then vanishes when the page lands reads as a flag withdrawn.
 */
export function bandSlotFor(live: ComposerLive | null | undefined): boolean {
  return live?.state === 'flags';
}

/**
 * CUL-2383 — the phone document runs its own inline layout script (compaction at font scale 1.6,
 * the keep-together spacer, the pinned warning's scroll padding, `data-tight`), so its WebView has
 * JavaScript ON. What makes that safe is that the WebView can go nowhere: the document is our own
 * server render with no external scripts or links that load, and every navigation away from the
 * inline document is refused here. `about:blank` (and `about:srcdoc`) is the inline document
 * itself on both platforms; a `data:` URL is how some Android builds report it.
 *
 * The v1 preview's check only (`app/report.tsx`, CUL-2527). Every v2 report frame passes
 * `reportFrameLoadAllowed`, which refuses `data:`.
 */
export function isPreviewLoadAllowed(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc' || url.startsWith('data:');
}

/** The part of a navigation the frame check reads. `isTopFrame` is iOS only. */
export interface ReportFrameRequest {
  url: string;
  isTopFrame?: boolean;
}

/**
 * THE ONE LOAD CHECK EVERY V2 REPORT FRAME PASSES (CUL-2494, CUL-2469): the preview's phone and
 * printed frames, the exam room's two frames and the saved copy. It admits the inline document,
 * `about:blank` in the top frame, and nothing else:
 *  - Every `data:` URL is refused. A `data:` navigation can only be the page leaving itself (an
 *    injected `<meta http-equiv=refresh>` or `location=` to a `data:` document that carries no
 *    CSP, whose `<img>` then carries the record out). The inline document never needs it:
 *    Android's `loadDataWithBaseURL` is an app-initiated load the check is never asked about, and
 *    iOS reports it as `about:blank`. A gate on "has it loaded yet" lost the race on Android (the
 *    check blocks the UI thread the load-end event needs; privacy pass 2 on CUL-2487), so there is
 *    none. Wrong about some build, this fails closed: a blank frame, never a leak.
 *  - Every sub-frame load is refused (iOS asks about them, `isTopFrame: false`): a report draws
 *    no frame, and one would be a fresh realm the frame lock cannot reach.
 *  - `about:srcdoc` is refused: the top document is never a srcdoc.
 */
export function reportFrameLoadAllowed(req: ReportFrameRequest): boolean {
  if (req.isTopFrame === false) return false;
  return req.url === 'about:blank';
}

/** Android's new-window path and iOS's, refused: the window never opens. */
function refuseWindow(): void {}

/**
 * THE PROPS EVERY V2 REPORT WEBVIEW SPREADS (CUL-2469), so no frame can drift from the others.
 *  - `originWhitelist: ['*']`: every URL reaches the load check, never the system browser
 *    (REPORT_WEBVIEW_ORIGINS, CUL-2428).
 *  - `onOpenWindow` refused, `setSupportMultipleWindows: false`, `javaScriptCanOpenWindowsAutomatically:
 *    false`: Android then never runs `onCreateWindow`, so no popup WebView and no popup document
 *    exist to script (a `target=_blank` link navigates this frame and meets the check instead);
 *    iOS's `createWebViewWithConfiguration` returns nil (installed 14.0.1 source, pinned by
 *    `lib/reportPreviewV2.test.ts`), so `window.open` gets null.
 *  - The frame lock (`FRAME_LOCK_SCRIPT`) injected before content as well as inline: the inline
 *    copy is what holds (Android's hook is an `evaluateJavascript` at page start, which can lose
 *    the race to the page's own script); the injected copy reaches any sub-frame on iOS. It is
 *    idempotent, so the second run changes nothing.
 * The caller keeps `javaScriptEnabled` and the layout props: those differ by frame.
 */
export const REPORT_FRAME_PROPS = {
  originWhitelist: REPORT_WEBVIEW_ORIGINS,
  onShouldStartLoadWithRequest: reportFrameLoadAllowed,
  onOpenWindow: refuseWindow,
  setSupportMultipleWindows: false,
  javaScriptCanOpenWindowsAutomatically: false,
  injectedJavaScriptBeforeContentLoaded: `${FRAME_LOCK_SCRIPT}\ntrue;`,
  injectedJavaScriptBeforeContentLoadedForMainFrameOnly: false,
} as const;

/**
 * Android's WebView ignores the system font scale; `textZoom` carries it (spec §6.3: "Android's
 * WebView passes textZoom from the font scale"). iOS needs nothing: the sheet's root takes
 * `font: -apple-system-body`, which follows Dynamic Type. A scale that cannot be read is 100.
 */
export function androidTextZoom(fontScale: number): number {
  return Number.isFinite(fontScale) && fontScale > 0 ? Math.round(fontScale * 100) : 100;
}

/** The control that swaps the layout names the OTHER one: where the tap goes. */
export const PREVIEW_TOGGLE_LABEL: Record<PreviewView, string> = {
  phone: 'View as printed',
  printed: 'View on phone',
};

/** VoiceOver hears the page arrive (spec §14, "Building": "Report ready"). */
export const PREVIEW_READY_ANNOUNCEMENT = 'Report ready';
