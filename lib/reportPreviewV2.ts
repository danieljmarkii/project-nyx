// The v2 preview's rules (Vet report v2 PR-17, CUL-2297 + CUL-2383; spec §10.2, §6.3). Pure, so
// each one is unit-tested without a WebView.

import type { ComposerLive } from './reportComposer';
import type { VetReport } from './pdf';

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
 */
export function isPreviewLoadAllowed(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc' || url.startsWith('data:');
}

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
