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

/** Keep the screen awake only while the room is open, the app is in front and someone is using it. */
export function keepAwakeWanted(s: { open: boolean; appActive: boolean; lastTouchAt: number; now: number }): boolean {
  return s.open && s.appActive && s.now - s.lastTouchAt < EXAM_IDLE_MS;
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

/** Re-measure the type after the owner changes their text size with the room open. */
export const EXAM_RETYPE_SCRIPT = 'window.__nyxExamType && window.__nyxExamType(); true;';

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
    window.scrollTo(0, 0);
    lay();
    post({ type: 'exam-page', page: page + 1, of: sheets.length });
  }
  window.__nyxExamGo = function(n){ show(n - 1); };
  window.__nyxExamType = function(){ type(); lay(); };
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
 * The phone document as the exam room shows it, or null when the document is not a v2 phone
 * reflow (no sheets, or no place to put the mode): the caller then refuses to open the room
 * rather than show a page that cannot page.
 */
export function examRoomHtml(phoneHtml: string, ground: string): string | null {
  if (!phoneHtml.includes('data-sheet=') || !phoneHtml.includes('</head>') || !phoneHtml.includes('</body>')) return null;
  const at = phoneHtml.lastIndexOf('</body>');
  const withScript = `${phoneHtml.slice(0, at)}${EXAM_SCRIPT}\n${phoneHtml.slice(at)}`;
  const head = withScript.indexOf('</head>');
  return `${withScript.slice(0, head)}${examStyle(ground)}\n${withScript.slice(head)}`;
}
