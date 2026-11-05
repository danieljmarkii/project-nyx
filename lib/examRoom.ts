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

/**
 * NO DNS PREFETCH FROM A REPORT DOCUMENT (CUL-2495, CUL-2469). A resolver lookup is not a fetch,
 * so the CSP cannot stop one: an `<a href>` host or a `dns-prefetch` hint would ping a chosen
 * name when the page opens. Both engines honour this switch from a meta in the document.
 */
export const PREFETCH_OFF_META = '<meta http-equiv="x-dns-prefetch-control" content="off">';

/** The room's CSP as a head element. */
export const EXAM_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${EXAM_CSP}">`;

/**
 * Elements no report document carries (the renderers and this module emit none), each a path out
 * a CSP does not close: a frame or object is a fresh realm (a pristine `RTCPeerConnection`, a
 * `window.open`) the lock script cannot reach, and a `<link>` is a dns-prefetch / preconnect /
 * prefetch hint, which the browser acts on as the element lands.
 */
export const FRAME_REFUSED_TAGS = ['iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe', 'link'] as const;

/**
 * The frame lock (CUL-2469). It runs first in every report document, before any of the server's
 * markup, so it holds against a script an escaping miss upstream let in:
 *  - WebRTC is gone: a peer connection's STUN lookup leaves the frame by DNS/UDP, which no CSP
 *    directive governs in either engine.
 *  - `window.open` returns null, so no popup document exists to write into.
 *  - No refused element can be put into the document by script: node insertions are checked
 *    before they land (a frame's load event fires synchronously on insertion, so removing it
 *    afterwards is too late) and HTML strings are parsed inert in a template first. The parser's
 *    own copies never exist, because `withExamCsp` renames those tags before the page loads.
 * Every lock is non-writable and non-configurable, so a later script cannot undo it. The server's
 * scripts insert no nodes at all (`lib/examRoom.test.ts` reads them), so nothing they do is lost.
 */
export const FRAME_LOCK_SCRIPT = `(function(){
'use strict';
var w=window,d=document,O=Object;
function lock(o,k,v){try{O.defineProperty(o,k,{value:v,writable:false,configurable:false});}catch(e){}}
var rtc=['RTCPeerConnection','webkitRTCPeerConnection','mozRTCPeerConnection','RTCDataChannel','RTCIceCandidate','RTCIceTransport','RTCDtlsTransport','RTCSctpTransport','RTCSessionDescription','RTCRtpSender','RTCRtpReceiver','RTCRtpTransceiver','RTCCertificate','RTCDTMFSender','RTCRtpScriptTransform'];
for(var i=0;i<rtc.length;i++)lock(w,rtc[i],undefined);
lock(w,'open',function(){return null;});
var SEL='${FRAME_REFUSED_TAGS.join(',')}';
function refused(n){return !!n&&n.nodeType===1&&typeof n.matches==='function'&&n.matches(SEL);}
function clean(n){
if(!n||typeof n!=='object')return n;
if(refused(n))throw new TypeError('refused');
if((n.nodeType===1||n.nodeType===11)&&n.querySelectorAll){var q=n.querySelectorAll(SEL);for(var j=q.length-1;j>=0;j--){if(q[j].parentNode)q[j].parentNode.removeChild(q[j]);}}
return n;}
function guardNodes(proto,names){if(!proto)return;names.forEach(function(k){var f=proto[k];if(typeof f!=='function')return;lock(proto,k,function(){for(var a=0;a<arguments.length;a++)clean(arguments[a]);return f.apply(this,arguments);});});}
var NODE_INSERTS=['appendChild','insertBefore','replaceChild'];
var CHILD_INSERTS=['append','prepend','after','before','replaceWith','replaceChildren','insertAdjacentElement','moveBefore'];
guardNodes(w.Node&&Node.prototype,NODE_INSERTS);
[w.Element,w.CharacterData,w.DocumentType,w.Document,w.DocumentFragment].forEach(function(C){if(C)guardNodes(C.prototype,CHILD_INSERTS);});
if(w.Range){guardNodes(Range.prototype,['insertNode','surroundContents']);}
var mk=d.createElement.bind(d);
var tplSet=O.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set;
function frag(html){var t=mk('template');tplSet.call(t,String(html));return clean(t.content);}
var ins=Element.prototype.insertBefore||Node.prototype.insertBefore;
var rc=Element.prototype.replaceChildren;var rw=Element.prototype.replaceWith;
function setter(proto,k,fn){if(!proto||!O.getOwnPropertyDescriptor(proto,k))return;try{O.defineProperty(proto,k,{get:O.getOwnPropertyDescriptor(proto,k).get,set:fn,configurable:false});}catch(e){}}
setter(Element.prototype,'innerHTML',function(v){if(this.localName==='template'){tplSet.call(this,v);clean(this.content);return;}rc.call(this,frag(v));});
setter(Element.prototype,'outerHTML',function(v){rw.call(this,frag(v));});
if(w.ShadowRoot)setter(ShadowRoot.prototype,'innerHTML',function(){throw new TypeError('refused');});
lock(Element.prototype,'insertAdjacentHTML',function(pos,v){var f=frag(v),p=String(pos).toLowerCase(),par=this.parentNode;
if(p==='beforebegin'){if(par)ins.call(par,f,this);}else if(p==='afterbegin'){ins.call(this,f,this.firstChild);}else if(p==='beforeend'){ins.call(this,f,null);}else if(p==='afterend'){if(par)ins.call(par,f,this.nextSibling);}else{throw new TypeError('refused');}});
function no(){throw new TypeError('refused');}
lock(Element.prototype,'attachShadow',no);lock(Element.prototype,'setHTMLUnsafe',no);
if(w.ShadowRoot)lock(ShadowRoot.prototype,'setHTMLUnsafe',no);
['write','writeln','open','execCommand'].forEach(function(k){lock(Document.prototype,k,no);});
lock(Document.prototype,'createElement',function(n){var e=mk(n);if(refused(e))throw new TypeError('refused');return e;});
var mkNS=Document.prototype.createElementNS;
lock(Document.prototype,'createElementNS',function(){var e=mkNS.apply(this,arguments);if(refused(e))throw new TypeError('refused');return e;});
})();`;

/** The lock every report frame's document opens its head with: CSP, prefetch off, the lock script. */
export const FRAME_LOCK_HEAD = `${EXAM_CSP_META}${PREFETCH_OFF_META}<script>${FRAME_LOCK_SCRIPT}</script>`;

/**
 * The refused elements renamed inert before the parser sees them (CUL-2495, CUL-2469): a start
 * or end tag the tokenizer would read as one becomes an unknown `x-refused-*` element, which
 * loads, hints and opens nothing. The tokenizer folds ASCII case only, so `/i` matches exactly
 * what it reads as the tag. Escaped text (`&lt;iframe`) is untouched.
 */
export function neutralizeRefusedTags(html: string): string {
  return html.replace(new RegExp(`<(/?)(${FRAME_REFUSED_TAGS.join('|')})(?=[\\s/>]|$)`, 'gi'), '<$1x-refused-$2');
}

/**
 * The document with the room's CSP as the first thing in its head; null when it has no head. The
 * v1 preview's box only (`app/report.tsx`, CUL-2527): every v2 report frame takes `withFrameLock`.
 */
export function withExamCsp(html: string): string | null {
  const m = /<head[^>]*>/i.exec(html);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${html.slice(0, at)}${EXAM_CSP_META}${html.slice(at)}`;
}

/**
 * A v2 report document with the frame lock as the first thing in its head (CSP, prefetch off, the
 * lock script) and its refused tags renamed inert; null when it has no head. Every v2 frame's
 * document goes through here (`examRoomHtml`, the room's printed page, `boxedPreviewHtml`).
 */
export function withFrameLock(html: string): string | null {
  const m = /<head[^>]*>/i.exec(html);
  if (!m) return null;
  const at = m.index + m[0].length;
  return neutralizeRefusedTags(`${html.slice(0, at)}${FRAME_LOCK_HEAD}${html.slice(at)}`);
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
  return withFrameLock(`${withScript.slice(0, head)}${examStyle(ground)}\n${withScript.slice(head)}`);
}
