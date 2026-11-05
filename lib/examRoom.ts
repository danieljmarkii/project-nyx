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
 * without this an escaping miss upstream would be live script with the network open. A v2 frame
 * narrows `script-src` to the hashes of its own scripts (`frameCsp`, CUL-2531); this
 * `'unsafe-inline'` form is the v1 frame's (JS off) and the fallback for a document whose scripts
 * cannot be accounted for.
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
 * Elements no report document carries (the renderers and this module emit none; lib/examRoom.test.ts
 * reads them), each a path out a CSP does not close: a frame or object is a fresh realm (a pristine
 * `RTCPeerConnection`, a `window.open`) the lock script cannot reach (on Android the before-content
 * hook never reaches a sub-frame, and the load check is never told one is asking); a `<link>` is a
 * dns-prefetch / preconnect / prefetch hint, which the browser acts on as the element lands; an
 * `<a>` or `<area>` host is an anchor DNS prefetch where an engine ignores the prefetch switch, and
 * a tap target besides; `<math>` because WebKit makes any MathML element with an `href` a link, so
 * one tap would send a JS-off frame to `about:blank`, which the load check admits (CUL-2552
 * privacy pass, F4).
 */
export const FRAME_REFUSED_TAGS = ['iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe', 'link', 'a', 'area', 'math'] as const;

/**
 * The one script start tag with attributes a report document may carry: the room's own. Every
 * other report script is a bare `<script>` (the renderer's, the lock's), so any other `<script`
 * with an attribute is injected, and the dangerous ones need one: `type=speculationrules` (an
 * open-time prefetch the CSP's `'unsafe-inline'` admits), `importmap`, `module`. A type spelled
 * with character references still needs the attribute NAME, which the tokenizer never decodes.
 */
const EXAM_SCRIPT_OPEN = '<script id="nyx-exam-script">';

/**
 * The frame lock (CUL-2469). It runs first in every report document, before any of the server's
 * markup, so it holds against a script an escaping miss upstream let in:
 *  - WebRTC is gone: a peer connection's STUN lookup leaves the frame by DNS/UDP, which no CSP
 *    directive governs in either engine.
 *  - `window.open` returns null, so no popup document exists to write into.
 *  - No refused element, and no script element at all (a `speculationrules` script inserted by
 *    script prefetches too), can be put into the document by script: node insertions are checked
 *    before they land (a frame's load event fires synchronously on insertion, so removing it
 *    afterwards is too late) and HTML strings are parsed inert in a template first. A node from
 *    any other document is refused outright, and `importNode` / `adoptNode` / `parseHTMLUnsafe`
 *    throw: another document can carry a declarative shadow root (closed ones included) whose
 *    frame no check from outside can see (privacy pass 2 on PR-31, A1). The parser's own copies
 *    never exist, because `withFrameLock` renames those tags before the page loads.
 *  - No navigation to `about:` from the page (CUL-2553). `about:blank` is how the inline document
 *    itself is reported, so the load check admits it, and a page sent there is a blank frame: the
 *    report and its warnings gone. `history.back` / `forward` / `go` and the Navigation API's
 *    methods throw; the lock's own `navigate` listener, registered before any other script runs,
 *    cancels a navigation to an `about:` URL where the engine has that API; a `<meta
 *    http-equiv>` cannot be inserted by script. `location` is unforgeable, so no page script can
 *    lock it: on Android the scripted frames' load check refuses `about:blank` instead
 *    (`SCRIPTED_REPORT_FRAME_PROPS`); on an iOS without the Navigation API it stays open (filed).
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
var SEL='${FRAME_REFUSED_TAGS.join(',')},script,meta[http-equiv]';
function refused(n){return !!n&&n.nodeType===1&&typeof n.matches==='function'&&n.matches(SEL);}
function sweep(n){
if((n.nodeType===1||n.nodeType===11)&&n.querySelectorAll){var q=n.querySelectorAll(SEL);for(var j=q.length-1;j>=0;j--){if(q[j].parentNode)q[j].parentNode.removeChild(q[j]);}}
return n;}
function clean(n){
if(!n||typeof n!=='object')return n;
if(n.nodeType&&n!==d&&n.ownerDocument!==d)throw new TypeError('refused');
if(refused(n))throw new TypeError('refused');
return sweep(n);}
function guardNodes(proto,names){if(!proto)return;names.forEach(function(k){var f=proto[k];if(typeof f!=='function')return;lock(proto,k,function(){for(var a=0;a<arguments.length;a++)clean(arguments[a]);return f.apply(this,arguments);});});}
var rawIns=Node.prototype.insertBefore,rawRc=Element.prototype.replaceChildren,rawRw=Element.prototype.replaceWith;
var NODE_INSERTS=['appendChild','insertBefore','replaceChild'];
var CHILD_INSERTS=['append','prepend','after','before','replaceWith','replaceChildren','insertAdjacentElement','moveBefore'];
guardNodes(w.Node&&Node.prototype,NODE_INSERTS);
[w.Element,w.CharacterData,w.DocumentType,w.Document,w.DocumentFragment].forEach(function(C){if(C)guardNodes(C.prototype,CHILD_INSERTS);});
if(w.Range){guardNodes(Range.prototype,['insertNode','surroundContents']);}
var mk=d.createElement.bind(d);
var tplSet=O.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set;
function frag(html){var t=mk('template');tplSet.call(t,String(html));return sweep(t.content);}
var ins=rawIns,rc=rawRc,rw=rawRw;
function setter(proto,k,fn){if(!proto||!O.getOwnPropertyDescriptor(proto,k))return;try{O.defineProperty(proto,k,{get:O.getOwnPropertyDescriptor(proto,k).get,set:fn,configurable:false});}catch(e){}}
setter(Element.prototype,'innerHTML',function(v){if(this.localName==='template'){tplSet.call(this,v);sweep(this.content);return;}rc.call(this,frag(v));});
setter(Element.prototype,'outerHTML',function(v){rw.call(this,frag(v));});
if(w.ShadowRoot)setter(ShadowRoot.prototype,'innerHTML',function(){throw new TypeError('refused');});
lock(Element.prototype,'insertAdjacentHTML',function(pos,v){var f=frag(v),p=String(pos).toLowerCase(),par=this.parentNode;
if(p==='beforebegin'){if(par)ins.call(par,f,this);}else if(p==='afterbegin'){ins.call(this,f,this.firstChild);}else if(p==='beforeend'){ins.call(this,f,null);}else if(p==='afterend'){if(par)ins.call(par,f,this.nextSibling);}else{throw new TypeError('refused');}});
function no(){throw new TypeError('refused');}
lock(Element.prototype,'attachShadow',no);lock(Element.prototype,'setHTMLUnsafe',no);lock(Element.prototype,'setHTML',no);
if(w.ShadowRoot){lock(ShadowRoot.prototype,'setHTMLUnsafe',no);lock(ShadowRoot.prototype,'setHTML',no);}
['write','writeln','open','execCommand','importNode','adoptNode'].forEach(function(k){lock(Document.prototype,k,no);});
lock(Document,'parseHTMLUnsafe',no);lock(Document,'parseHTML',no);
if(w.History){['back','forward','go'].forEach(function(k){lock(History.prototype,k,no);});}
var nav=w.navigation;
if(nav&&typeof nav.addEventListener==='function'){nav.addEventListener('navigate',function(e){var u=e&&e.destination&&e.destination.url;if(typeof u==='string'&&/^about:/i.test(u)&&e.cancelable)e.preventDefault();});}
if(w.Navigation){['navigate','reload','back','forward','traverseTo'].forEach(function(k){lock(Navigation.prototype,k,no);});}
var mkRaw=Document.prototype.createElement;
lock(Document.prototype,'createElement',function(){var e=mkRaw.apply(this,arguments);if(refused(e))throw new TypeError('refused');return e;});
var mkNS=Document.prototype.createElementNS;
lock(Document.prototype,'createElementNS',function(){var e=mkNS.apply(this,arguments);if(refused(e))throw new TypeError('refused');return e;});
})();`;

// ONLY OUR OWN SCRIPTS RUN (CUL-2531, CUL-2561). A frame's policy lists a SHA-256 of each script
// the report legitimately carries, never `'unsafe-inline'`: the lock below, the room's
// EXAM_SCRIPT, and the renderer's layout script. An injected inline script, an event-handler
// attribute and a `javascript:` URL then never run in either engine, which closes the whole class
// of residuals the lock exists for (an insertion path it misses, a `javascript:` page swap into a
// fresh realm, an empty script re-typed after load). The hashes are computed here, at render, so
// a server redeploy that changes its script needs no app release.

/**
 * The SHA-256 of a script's text as a CSP source (`'sha256-<base64>'`). The digest is over the
 * text's UTF-8 bytes, as both engines hash an inline script's content. Written out here rather
 * than imported: this module stays import-free (header), and React Native has no synchronous
 * digest. `lib/examRoom.test.ts` pins it against node:crypto.
 */
export function cspScriptHash(text: string): string {
  return `'sha256-${base64(sha256(utf8(text)))}'`;
}

function utf8(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    // A lone surrogate encodes as U+FFFD, as the engines' UTF-8 encoders do.
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(bytes: number[]): number[] {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bitLen = bytes.length * 8;
  const m = bytes.slice();
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  // The length as a 64-bit big-endian count; a report script is far below 2^32 bits.
  const hi = Math.floor(bitLen / 0x100000000);
  m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  m.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
  const w = new Array<number>(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < m.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      const j = off + t * 4;
      w[t] = ((m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3]) | 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + k) | 0;
  }
  const out: number[] = [];
  for (const x of h) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** The room's script as it sits in the document: the text between its tags, which is what runs. */
const EXAM_SCRIPT_TEXT = EXAM_SCRIPT.slice(EXAM_SCRIPT_OPEN.length, -'</script>'.length);

/**
 * Where a report document's own scripts end: the renderer's bare `<script>` closes just before
 * `</body></html>`, optionally followed by the room's script (renderPhoneV2 ends with it; the room
 * adds its script after). Every string interpolated from the record sits before this tail. Read
 * backwards from the end, never by a pattern's first match: an injected copy of the room's open
 * tag earlier in the body would otherwise start the match there and force the inline policy
 * (privacy pass 2 on CUL-2531, R1). Returns where the renderer's `</script>` starts and whether the
 * room's script follows it, or null when the document does not end this way.
 */
function documentTail(html: string): { close: number; room: boolean } | null {
  const end = /<\/body>\s*<\/html>\s*$/i.exec(html);
  if (end === null) return null;
  let before = html.slice(0, end.index).trimEnd();
  const room = before.endsWith(EXAM_SCRIPT);
  if (room) before = before.slice(0, -EXAM_SCRIPT.length).trimEnd();
  if (!before.endsWith('</script>')) return null;
  return { close: before.length - '</script>'.length, room };
}

/**
 * The renderer's script text, read from its OWN open tag: the last bare `<script>` before the
 * tail's close (privacy pass 1 on CUL-2531, F1/F2). Never the first match of a pattern: an
 * injected `<script>`, or the spelling `<script>` inside a title, textarea, attribute or svg, sits
 * earlier, and a match starting there would hash text the engine never runs as one script (so an
 * attacker prefix could be allowed, or the real layout script blocked). The renderer's own tag and
 * text are literals, so the last open tag is its own; if an injection before it swallows it (an
 * unclosed element), the layout does not run on any policy, today's included.
 *
 * Null when the text is not exactly what the engine will hash (F3): a CR or NUL is rewritten by
 * the parser before the script exists, and `<!--`, `<script` or `</script` would change how the
 * tokenizer reads it. Null keeps the inline policy, the louder side.
 */
function rendererScriptText(html: string, close: number): string | null {
  const open = html.lastIndexOf('<script>', close);
  if (open < 0) return null;
  const text = html.slice(open + '<script>'.length, close);
  if (/[\r\0]|<!--|<\/?script/i.test(text)) return null;
  return text;
}

/** The frame lock's hash, computed once. */
let lockHash: string | null = null;
function frameLockHash(): string {
  if (lockHash === null) lockHash = cspScriptHash(FRAME_LOCK_SCRIPT);
  return lockHash;
}

/** A frame's policy: EXAM_CSP with `script-src` naming exactly these hashes. */
export function frameCsp(scriptHashes: readonly string[]): string {
  return EXAM_CSP.replace("script-src 'unsafe-inline'", `script-src ${scriptHashes.join(' ')}`);
}

/**
 * The hashes a document's own scripts need, or null when it carries a script this module cannot
 * account for (a bare `<script>` with no recognisable renderer tail). Null keeps today's
 * `'unsafe-inline'` policy rather than block a layout script whose loss would drop the pinned
 * warning: the louder side. An injection cannot force it, because the tail is read backwards from
 * the document's literal end; the renderer moving it is what `lib/examRoom.test.ts` catches.
 */
function documentScriptHashes(html: string): string[] | null {
  const tail = documentTail(html);
  if (tail === null) return /<script>/i.test(html) ? null : [];
  const text = rendererScriptText(html, tail.close);
  if (text === null) return null;
  // The room's script is matched byte for byte above, so its hash is the constant's.
  return tail.room ? [cspScriptHash(text), cspScriptHash(EXAM_SCRIPT_TEXT)] : [cspScriptHash(text)];
}

/** The lock a document's head opens with, for that document's own scripts (after the rename). */
function frameLockHeadFor(html: string): string {
  const own = documentScriptHashes(html);
  const csp = own === null ? EXAM_CSP : frameCsp([frameLockHash(), ...own]);
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">${PREFETCH_OFF_META}<script>${FRAME_LOCK_SCRIPT}</script>`;
}

/**
 * The lock for a document that carries no script of its own: CSP (only the lock may run),
 * prefetch off, the lock script. Every v2 frame's head is built the same way, per document
 * (`withFrameLock`, `boxedFrameHtml`).
 */
export const FRAME_LOCK_HEAD = frameLockHeadFor('');

/** The head `withFrameLock` gives this document: its own scripts' hashes, read after the rename. */
export function frameLockHeadOf(html: string): string {
  return frameLockHeadFor(neutralizeRefusedTags(html));
}

/**
 * The refused elements renamed inert before the parser sees them (CUL-2495, CUL-2469): a start
 * or end tag the tokenizer would read as one becomes an unknown `x-refused-*` element, which
 * loads, hints and opens nothing; a `<script` start tag with any attribute but the room's own is
 * renamed the same way, so its content is never run or read as rules. The tokenizer folds ASCII
 * case only, so `/i` matches exactly what it reads as the tag. Escaped text (`&lt;iframe`) is
 * untouched.
 */
export function neutralizeRefusedTags(html: string): string {
  return html
    .replace(new RegExp(`<(/?)(${FRAME_REFUSED_TAGS.join('|')})(?=[\\s/>]|$)`, 'gi'), '<$1x-refused-$2')
    .replace(/<script(?=[\s/])[^>]*>?/gi, (tag) => (tag === EXAM_SCRIPT_OPEN ? tag : `<x-refused-script${tag.slice(7)}`))
    .replace(/<meta(?=[\t\n\f\r />]|$)[^>]*>?/gi, keptMetaOnce());
}

/**
 * The meta rename, one document at a time: a kept meta stays unless it is a SECOND viewport. The
 * last viewport meta wins, so an injected one after the document's own would undo a locked page
 * scale (EXAM_VIEWPORT) and could push a pinned warning off the first screen (privacy pass F5).
 */
function keptMetaOnce(): (tag: string) => string {
  let viewport = false;
  return (tag) => {
    // Any attribute position: KEPT_META admits name/content/charset in any order, and its values
    // hold no quote, so ` name="viewport"` cannot be faked from inside one (privacy pass D1).
    const isViewport = /[\t\n\f\r ]name="viewport"/i.test(tag);
    if (metaKept(tag) && !(isViewport && viewport)) {
      if (isViewport) viewport = true;
      return tag;
    }
    return `<x-refused-meta${tag.slice(5)}`;
  };
}

/**
 * A `<meta>` a report document may keep (CUL-2552, CUL-2553): the room's two head metas exactly,
 * or one whose only attributes are `name`, `content` and `charset`, each double-quoted with no
 * quote or angle bracket inside. Anything else is renamed inert, an injected `<meta
 * http-equiv=refresh content="0;url=about:blank">` first: the load check must admit `about:blank`
 * (it is how the inline document is reported), so a refresh there would blank the report. An
 * allowlist, never a search for `http-equiv`: the tokenizer decodes character references in a
 * value and a stray quote can hide an attribute from a pattern, but it never decodes an attribute
 * NAME, and a tag this grammar matches is read by the tokenizer exactly as written. Every meta the
 * renderers emit fits it (`lib/examRoom.test.ts` reads them); one that did not would only lose its
 * effect, never blank the frame.
 */
const KEPT_META = /^<meta(?:[\t\n\f\r ]+(?:name|content|charset)="[^"<>]*")+[\t\n\f\r ]*\/?>$/i;

function metaKept(tag: string): boolean {
  return tag === EXAM_CSP_META || tag === PREFETCH_OFF_META || KEPT_META.test(tag);
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
  // Renamed first, then hashed: the hash is of the text the engine will actually run.
  const neutral = neutralizeRefusedTags(html);
  const m = /<head[^>]*>/i.exec(neutral);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${neutral.slice(0, at)}${frameLockHeadFor(neutral)}${neutral.slice(at)}`;
}

/**
 * A v2 document with no `<head>`, boxed the louder way (`boxedPreviewHtml`): the lock at the very
 * top, after a leading doctype, where the parser places it in the implied head.
 */
export function boxedFrameHtml(html: string): string {
  const neutral = neutralizeRefusedTags(html);
  const head = frameLockHeadFor(neutral);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(neutral);
  if (doctype === null) return `${head}${neutral}`;
  const at = doctype.index + doctype[0].length;
  return `${neutral.slice(0, at)}${head}${neutral.slice(at)}`;
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
