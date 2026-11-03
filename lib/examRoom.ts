// Vet report v2 exam-room mode (CUL-2299, row VR2-19; spec §10.6, §14).
//
// The owner hands the phone across the table: the report full screen on black, one sheet at a
// time, large enough to read at arm's length.
//
// A MODE OVER THE ONE REFLOW, NEVER A THIRD RENDER (spec §3.4, §6.3). `examRoomHtml` takes the
// phone document the server already built (renderPhoneV2) and adds one style and one script. The
// pages are that document's own `[data-sheet]` sections, in sheet order; the words, the flags and
// the order are the reflow's. Nothing here decides what the report says.
//
// THE KEEP-TOGETHER RULE HOLDS ON EVERY PAGE (PM ruling (a) on CUL-2320; spec §6.2). Showing a
// page re-runs the reflow's own layout (`__nyxV2Layout`), so the spacer that starts the lead
// chart's unit in the next frame, the pinned lead sentence and the scroll padding under it are
// all measured against the exam frame at exam type. `scripts/report-phone/guard.mjs` walks the
// exam pages with the same checks as the phone.
//
// IMPORT-FREE ON PURPOSE: `scripts/report-phone/dump.deno.ts` runs this under Deno to hand the
// guard the exact document the app shows, and an extensionless import would not resolve there.

/** The root size at arm's length, in CSS px: about 1.3× the default body (17px). A team call
 *  logged on CUL-2299; the PM can re-rule it. The owner's own size wins when it is larger. */
export const ARM_LENGTH_PX = 22;

/** The keep-awake lets go after this long without a touch (spec §10.6: released on idle). */
export const EXAM_IDLE_MS = 5 * 60 * 1000;

/** The pager's words, shown and announced (spec §10.6, §14: "Sheet 2 of 4"). */
export function sheetLabel(page: number, of: number): string {
  return `Sheet ${page} of ${of}`;
}

/** A page number the document can show: 1 to `of`, and 1 when there is nothing to page. */
export function clampPage(page: number, of: number): number {
  if (!Number.isFinite(page) || of < 1) return 1;
  return Math.min(of, Math.max(1, Math.round(page)));
}

/** Keep the screen awake only while the room is open, the app is in front and someone is using
 *  it (`idle` is set once EXAM_IDLE_MS passes with no touch or scroll). */
export function keepAwakeWanted(s: { open: boolean; appActive: boolean; idle: boolean }): boolean {
  return s.open && s.appActive && !s.idle;
}

export type ExamMessage = { kind: 'page'; page: number; of: number } | { kind: 'touch' };

/** What the exam document posts to the app. Anything else, malformed included, is ignored. */
export function parseExamMessage(data: string): ExamMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  if (o.type === 'exam-touch') return { kind: 'touch' };
  if (o.type === 'exam-page' && typeof o.page === 'number' && typeof o.of === 'number' && o.of >= 1) {
    return { kind: 'page', page: clampPage(o.page, o.of), of: Math.floor(o.of) };
  }
  return null;
}

/** The script the app injects to turn the page: `go` is 1-based, and the document clamps it. */
export function examGoScript(page: number): string {
  return `window.__nyxExamGo && window.__nyxExamGo(${Math.round(page)}); true;`;
}


function examStyle(ground: string): string {
  return `<style id="nyx-exam-style">
html[data-exam],html[data-exam] body{background:${ground};}
html[data-exam] [data-sheet]{background:var(--paper);max-width:none;min-height:100vh;}
html[data-exam] [data-exam-off]{display:none !important;}
html[data-exam] .sheet.back{border-top:0;}
</style>`;
}

// The page script. It runs after the reflow's own script (it sits after it in the body), so
// `__nyxV2Layout` exists by then.
const EXAM_SCRIPT = `<script id="nyx-exam-script">
(function(){
  var root = document.documentElement;
  var sheets = [].slice.call(document.querySelectorAll('[data-sheet]'));
  var page = 0;
  function post(m){ try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function lay(){ if (window.__nyxV2Layout) window.__nyxV2Layout(); }
  // The larger of the arm's-length size and the owner's own. The probe measures what is DRAWN, so
  // Android's textZoom counts; the root's CSS size is divided by that zoom, so the drawn size is
  // the larger of the two, never the product.
  function type(){
    root.style.fontSize = '';
    var p = document.getElementById('v2probe');
    var drawn = p ? p.getBoundingClientRect().height : 0;
    var css = parseFloat(getComputedStyle(root).fontSize) || drawn;
    if (!drawn || !css) return;
    var zoom = drawn / css;
    if (drawn < ${ARM_LENGTH_PX}) root.style.fontSize = (${ARM_LENGTH_PX} / zoom).toFixed(2) + 'px';
  }
  function show(n){
    page = Math.max(0, Math.min(sheets.length - 1, n));
    sheets.forEach(function(s, i){ if (i === page) s.removeAttribute('data-exam-off'); else s.setAttribute('data-exam-off', ''); });
    // scroll-motion-ok: a DOM scroll inside the page script, which jumps (no smooth behaviour).
    window.scrollTo(0, 0);
    lay();
    post({ type: 'exam-page', page: page + 1, of: sheets.length });
  }
  window.__nyxExamGo = function(n){ show(n - 1); };
  // A horizontal swipe turns the page; a vertical one scrolls it.
  var sx = null, sy = null, lastTouch = 0;
  document.addEventListener('touchstart', function(e){
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    var now = Date.now();
    if (now - lastTouch > 5000) { lastTouch = now; post({ type: 'exam-touch' }); }
  }, { passive: true });
  document.addEventListener('touchend', function(e){
    if (sx === null) return;
    var t = e.changedTouches[0]; var dx = t.clientX - sx; var dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) show(page + (dx < 0 ? 1 : -1));
  }, { passive: true });
  root.setAttribute('data-exam', '');
  type();
  show(0);
  window.addEventListener('resize', function(){ type(); lay(); });
})();
</script>`;

/**
 * A Content-Security-Policy for a report document shown in the room (privacy review on PR-19):
 * the document may run its own inline script and draw its own inline styles, fonts and images,
 * and may load or send nothing at all. The WebView's load predicate governs navigation only, so
 * without this an escaping miss upstream would be live script with the network open.
 */
export const EXAM_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The `originWhitelist` every report WebView passes (privacy review of CUL-2428). It lets EVERY
 * URL through to `onShouldStartLoadWithRequest`, which is the real gate. react-native-webview 14
 * checks the whitelist first and hands any URL that fails it to `Linking.openURL`, never to the
 * predicate: with `['about:*', 'data:*']` an injected `location='https://…?d=<record>'` opened the
 * system browser with the record in the query string (and a `nyx://` URL reached the app's own
 * routes). With `*` the predicate sees it and refuses it, and nothing leaves the frame.
 */
export const REPORT_WEBVIEW_ORIGINS: string[] = ['*'];

/** The document with the room's CSP as the first thing in its head; null when it has no head. */
export function withExamCsp(html: string): string | null {
  const m = /<head[^>]*>/i.exec(html);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${html.slice(0, at)}<meta http-equiv="Content-Security-Policy" content="${EXAM_CSP}">${html.slice(at)}`;
}

/**
 * THE PRINTED PAGE'S WARNING (PM ruling (a) on CUL-2430). The printed layout on a phone has no
 * pin and no keep-together spacer, so its first screen could show the lead chart's bars with the
 * confounder line below the fold. The room pins the line's own lead sentence above the printed
 * view, natively, whenever the record has one: the same words the reflow pins (the model's
 * `lead`, read back from the reflow's `confounder-verdict` part, never re-cut here). It never
 * prints. Null when the record has no confounder line, and then the reflow pins nothing either.
 */
export function printedWarningOf(phoneHtml: string): string | null {
  const m = /<p class="verdict" data-part="confounder-verdict" aria-hidden="true">([^<]*)<\/p>/.exec(phoneHtml);
  if (!m) return null;
  const text = unescapeText(m[1]);
  return text.length > 0 ? text : null;
}

/** Text escaped by `h()` (generate-report/render.ts), which escapes these five; `&amp;` decodes last. */
function unescapeText(escaped: string): string {
  return escaped
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export type SavedCopyWarning = { kind: 'none' } | { kind: 'pin'; text: string } | { kind: 'refuse' };

/**
 * THE SAVED COPY'S WARNING (CUL-2467, PM go 2026-11-03 on option (a)). A kept copy is the stored
 * PRINTED page only (`generate-report` `mode: 'open'`): there is no reflow to open and no reflow
 * lead to read back. So the saved-report screen pins the printed page's own confounder line, in
 * full, natively above the page: the page's words, nothing re-cut or mirrored from the server's
 * rule, and always a superset of the lead the reflow pins.
 *  - `none`: the page carries no confounder marker at all, so nothing to pin.
 *  - `pin`: the line, unescaped.
 *  - `refuse`: the page carries a confounder marker (the block, or the line's class) but the line
 *    cannot be read back whole (changed markup, inline markup inside it, or empty). The screen
 *    then shows no paper rather than the printed bars with nothing pinned.
 */
export function savedCopyWarningOf(printHtml: string): SavedCopyWarning {
  const marked = CONFOUNDER_BLOCK.test(printHtml) || CONFOUNDER_CLASS.test(printHtml);
  if (!marked) return { kind: 'none' };
  const lines = [...printHtml.matchAll(PRINTED_CONFOUNDER_LINE)];
  // One line, exactly as renderPrintV2 writes it. Two would mean a layout this rule never saw.
  if (lines.length !== 1) return { kind: 'refuse' };
  const text = unescapeText(lines[0][1]);
  return text.length > 0 ? { kind: 'pin', text: bowlFirst(text) } : { kind: 'refuse' };
}

/**
 * The bowl warning, as `documentV2.ts` writes it (`BOWL_WARNING`). Same value, same question: the
 * sentence that must lead a no-medication line, which the reflow leads with because the "no
 * medication" sentence alone reads as a clean trial (cold read on CUL-2295, Mira).
 * `guards/savedCopyBowlWarning.test.ts` reds when the server's sentence changes.
 */
export const SAVED_COPY_BOWL_WARNING = 'A free-fed bowl was down in this window; the trial cannot exclude it.';

/** The no-medication sentence, as `documentV2.ts` `confounderOf` writes it (`none`); guarded with the bowl's. */
export const SAVED_COPY_NO_MEDICATION =
  'No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.';

/**
 * The no-medication line with the bowl warning moved to the front (adversarial pass 1 on
 * CUL-2467), as the reflow leads with it: every word stays, only the order the eye meets them
 * changes. Only that line: a medication line leads with "Not a test of the diet alone.", which
 * stays first, and any other line is returned as it is.
 */
function bowlFirst(text: string): string {
  if (!text.startsWith(SAVED_COPY_NO_MEDICATION)) return text;
  const at = text.indexOf(SAVED_COPY_BOWL_WARNING);
  if (at < 0) return text;
  const rest = `${text.slice(0, at)}${text.slice(at + SAVED_COPY_BOWL_WARNING.length)}`.replace(/\s{2,}/g, ' ').trim();
  return `${SAVED_COPY_BOWL_WARNING} ${rest}`;
}

/** The printed confounder line, as renderPrintV2 writes it (`open('p', 'conf')`, then `h(text)`). */
const PRINTED_CONFOUNDER_LINE = /<p class="conf" data-block="confounder">([^<]*)<\/p>/g;

/**
 * The line's class on a PARAGRAPH: a marker the strict read above must then account for. Never a
 * bare class match: the back sheets' time and meal tags are `<span class="conf">` (render.ts), and
 * every no-trial copy carrying one was refused (adversarial pass 1 on CUL-2467, LOUD).
 */
const CONFOUNDER_CLASS = /<p\s[^>]*class="conf(?:\s[^"]*)?"/;

/**
 * May the room offer "Printed page"? Only when it can pin the warning. A record whose reflow
 * carries a confounder line but whose lead sentence cannot be read back (a server render that
 * changed the markup) would show the printed bars with nothing pinned, so the view is withheld
 * rather than shown quieter.
 */
export function printedViewAllowed(phoneHtml: string, printHtml: string): boolean {
  // Either layout carrying the line needs the pin (CUL-2458 adversarial pass 1): a reflow that
  // lost its confounder markup while the printed page kept it would otherwise pass as "no line".
  const hasLine = CONFOUNDER_BLOCK.test(phoneHtml) || CONFOUNDER_BLOCK.test(printHtml);
  return !hasLine || printedWarningOf(phoneHtml) !== null;
}

/** The confounder block's opening tag, as both renderPhoneV2 and renderPrintV2 write it. */
const CONFOUNDER_BLOCK = /<[a-z]+[^>]*\sdata-block="confounder"/;

/** The reflow's viewport, as renderPhoneV2 writes it. */
const PHONE_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';

/**
 * NO PINCH-ZOOM IN THE ROOM (adversarial pass on PR-19): the pinned lead sentence is pinned to
 * the layout viewport, so a magnified view of the chart's lower half showed bars with neither
 * the pin nor the confounder line. The room's type already follows the owner's own size (and the
 * system's Zoom still works), so the room locks the page scale. The report preview's phone frame
 * locks it the same way (CUL-2430).
 */
export const EXAM_VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />';

/**
 * The reflow with its page scale locked: renderPhoneV2's own viewport swapped for EXAM_VIEWPORT.
 * Null when the document does not carry that viewport. Shared by the room and the report
 * preview's phone frame (CUL-2430), so the two lock the same way.
 */
export function lockedViewportHtml(phoneHtml: string): string | null {
  return phoneHtml.includes(PHONE_VIEWPORT) ? phoneHtml.replace(PHONE_VIEWPORT, EXAM_VIEWPORT) : null;
}

/**
 * The phone document as the exam room shows it, or null when the document is not a v2 phone
 * reflow (no sheets, or no place to put the mode): the caller then refuses to open the room
 * rather than show a page that cannot page.
 */
export function examRoomHtml(phoneHtml: string, ground: string): string | null {
  if (!phoneHtml.includes('data-sheet=') || !phoneHtml.includes('</head>') || !phoneHtml.includes('</body>')) return null;
  // A document whose viewport the room cannot lock is refused, never shown zoomable.
  const locked = lockedViewportHtml(phoneHtml);
  if (locked === null) return null;
  const at = locked.lastIndexOf('</body>');
  const withScript = `${locked.slice(0, at)}${EXAM_SCRIPT}\n${locked.slice(at)}`;
  const head = withScript.indexOf('</head>');
  return withExamCsp(`${withScript.slice(0, head)}${examStyle(ground)}\n${withScript.slice(head)}`);
}
