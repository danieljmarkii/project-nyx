import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { join } from 'path';
// Exam-room mode's pure rules (CUL-2299, spec §10.6). What only a layout engine can see (one
// sheet at a time, the arm's-length type, the keep-together unit on every page) is
// scripts/report-phone/guard.mjs's exam pass.
import {
  ARM_LENGTH_PX,
  EXAM_CSP,
  EXAM_CSP_META,
  FRAME_LOCK_HEAD,
  FRAME_LOCK_SCRIPT,
  PREFETCH_OFF_META,
  neutralizeRefusedTags,
  withFrameLock,
  EXAM_VIEWPORT,
  EXAM_IDLE_MS,
  clampPage,
  examGoScript,
  examRoomHtml,
  keepAwakeWanted,
  parseExamMessage,
  printedViewAllowed,
  printedWarningOf,
  SAVED_COPY_BOWL_WARNING,
  SAVED_COPY_NO_MEDICATION,
  savedCopyWarningOf,
  sheetLabel,
  withExamCsp,
} from './examRoom';

const PHONE = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><style>x{}</style></head><body><main class="sheet" data-sheet="1">a</main><section class="sheet back" data-sheet="2">b</section><script>/*reflow*/</script></body></html>';

it('the pager says and announces "Sheet N of M"', () => {
  expect(sheetLabel(2, 4)).toBe('Sheet 2 of 4');
});

it('a page the document can show: never 0, never past the last sheet', () => {
  expect(clampPage(0, 3)).toBe(1);
  expect(clampPage(4, 3)).toBe(3);
  expect(clampPage(Number.NaN, 3)).toBe(1);
  expect(clampPage(2, 0)).toBe(1);
});

it('keep-awake holds only while open, foregrounded and not idle', () => {
  const base = { open: true, appActive: true, idle: false };
  expect(keepAwakeWanted(base)).toBe(true);
  expect(keepAwakeWanted({ ...base, open: false })).toBe(false);
  expect(keepAwakeWanted({ ...base, appActive: false })).toBe(false);
  expect(keepAwakeWanted({ ...base, idle: true })).toBe(false);
  expect(EXAM_IDLE_MS).toBe(5 * 60 * 1000);
});

it('reads only the two messages the document posts, and clamps the page', () => {
  expect(parseExamMessage('{"type":"exam-page","page":2,"of":3}')).toEqual({ kind: 'page', page: 2, of: 3 });
  expect(parseExamMessage('{"type":"exam-page","page":9,"of":3}')).toEqual({ kind: 'page', page: 3, of: 3 });
  expect(parseExamMessage('{"type":"exam-touch"}')).toEqual({ kind: 'touch' });
  expect(parseExamMessage('{"type":"exam-page","page":1,"of":0}')).toBeNull();
  expect(parseExamMessage('{"type":"other"}')).toBeNull();
  expect(parseExamMessage('not json')).toBeNull();
  expect(parseExamMessage('null')).toBeNull();
});

it('turns the page by a whole sheet number', () => {
  expect(examGoScript(2.4)).toBe('window.__nyxExamGo && window.__nyxExamGo(2); true;');
});

describe('examRoomHtml', () => {
  const out = examRoomHtml(PHONE, '#0A0A0A');

  it('adds the mode to the reflow and changes none of its words or blocks', () => {
    expect(out).not.toBeNull();
    const html = out as string;
    // Every byte of the reflow survives, in order: the mode only inserts.
    const stripped = html.replace(/<style id="nyx-exam-style">[\s\S]*?<\/style>\n/, '').replace(/<script id="nyx-exam-script">[\s\S]*?<\/script>\n/, '').replace(FRAME_LOCK_HEAD, '').replace(EXAM_VIEWPORT, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
    expect(stripped).toBe(PHONE);
  });

  it('runs after the reflow’s own layout script, so it can re-run that layout on every page', () => {
    const html = out as string;
    expect(html.indexOf('/*reflow*/')).toBeLessThan(html.indexOf('nyx-exam-script'));
    expect(html).toContain('window.__nyxV2Layout');
  });

  it('puts the report on the black ground and sizes type to arm’s length or the owner’s, whichever is larger', () => {
    const html = out as string;
    expect(html).toContain('html[data-exam],html[data-exam] body{background:#0A0A0A;}');
    expect(html).toContain(`if (drawn < ${ARM_LENGTH_PX})`);
    // Landscape fits the sheet to the width.
    expect(html).toContain('max-width:none');
  });

  it('may run its own script and draw its own styles and images, and load or send nothing', () => {
    const html = out as string;
    expect(html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(html.indexOf('<style>'));
    expect(EXAM_CSP).toContain("default-src 'none'");
    expect(EXAM_CSP).toContain("connect-src 'none'");
    expect(EXAM_CSP).not.toMatch(/https?:|\*/);
    expect(withExamCsp('no head')).toBeNull();
  });

  it('locks the page scale, so a pinch never shows the bars without the pinned warning', () => {
    const html = out as string;
    expect(html).toContain(EXAM_VIEWPORT);
    expect(EXAM_VIEWPORT).toContain('maximum-scale=1');
    expect(EXAM_VIEWPORT).toContain('user-scalable=no');
    expect(html).not.toContain('initial-scale=1, viewport-fit=cover');
    // A reflow whose viewport the room cannot lock is refused.
    expect(examRoomHtml(PHONE.replace('initial-scale=1, ', ''), '#000')).toBeNull();
  });

  it('never touches brightness', () => {
    expect(out as string).not.toMatch(/brightness/i);
  });

  it('refuses a document that is not a v2 phone reflow', () => {
    expect(examRoomHtml('<html><head></head><body>v1</body></html>', '#000')).toBeNull();
    expect(examRoomHtml('', '#000')).toBeNull();
  });
});

describe('printedWarningOf (PM ruling (a) on CUL-2430)', () => {
  it('reads back the reflow’s own pinned lead sentence, unescaped', () => {
    const html = '<div class="keep"><p class="verdict" data-part="confounder-verdict" aria-hidden="true">Not a test of the diet alone.</p></div>';
    expect(printedWarningOf(html)).toBe('Not a test of the diet alone.');
    const bowl = '<p class="verdict" data-part="confounder-verdict" aria-hidden="true">A free-fed bowl &amp; a &quot;treat&quot; jar &lt;tuna&gt; Mira&#39;s</p>';
    expect(printedWarningOf(bowl)).toBe('A free-fed bowl & a "treat" jar <tuna> Mira\'s');
  });

  it('is null where the record has no confounder line (the layout script names the part, but no element carries it)', () => {
    expect(printedWarningOf('<script>var rep = unit.querySelector(\'[data-part="confounder-verdict"]\');</script>')).toBeNull();
    expect(printedWarningOf('')).toBeNull();
  });
});

describe('printedViewAllowed: the printed page is offered only when it can carry its warning', () => {
  const line = '<p class="conf" data-block="confounder">Not a test of the diet alone. Apoquel overlaps.</p>';
  const pin = '<p class="verdict" data-part="confounder-verdict" aria-hidden="true">Not a test of the diet alone.</p>';
  const print = `<main>${line}</main>`;
  const plainPrint = '<main><p class="lead">a</p></main>';
  it('a confounder line with its pin: allowed', () => {
    expect(printedViewAllowed(`${pin}${line}`, print)).toBe(true);
  });
  it('a confounder line whose pin cannot be read (changed markup): withheld, never shown quieter', () => {
    expect(printedViewAllowed(line, print)).toBe(false);
    expect(printedViewAllowed(`<p class="verdict v2" data-part="confounder-verdict">x</p>${line}`, print)).toBe(false);
  });
  it('the printed page carries the line but the reflow lost it and its pin: withheld (CUL-2458 pass 1)', () => {
    expect(printedViewAllowed('<main data-sheet="1">a</main>', print)).toBe(false);
  });
  it('no confounder line in either layout: allowed, and nothing to pin', () => {
    expect(printedViewAllowed('<main data-sheet="1">a</main><script>q(\'[data-block="confounder"]\')</script>', plainPrint)).toBe(true);
  });
});

describe('savedCopyWarningOf: a saved printed page pins its own confounder line, or is not drawn (CUL-2467)', () => {
  // renderPrintV2's own shapes: `open('p', 'conf')` then `h(text)`.
  const page = (body: string) => `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main class="sheet" data-sheet="1">${body}</main></body></html>`;
  const chart = '<section class="leadchart" data-block="lead_chart"><h2 class="charth">Itch</h2><svg></svg></section>';

  it('pins the line in full, unescaped: the page’s words, a superset of the reflow’s lead', () => {
    const line = 'Not a test of the diet alone. Overlapping the trial: Apoquel &amp; &quot;fish oil&quot; (entered as a supplement), overlapping it Oct 1 to Oct 20. Spans are the courses as recorded, not evidence of administration.';
    const out = savedCopyWarningOf(page(`${chart}<p class="conf" data-block="confounder">${line}</p>`));
    expect(out).toEqual({
      kind: 'pin',
      text: 'Not a test of the diet alone. Overlapping the trial: Apoquel & "fish oil" (entered as a supplement), overlapping it Oct 1 to Oct 20. Spans are the courses as recorded, not evidence of administration.',
    });
  });

  it('the no-medication line with a bowl keeps the bowl warning in what is pinned (its lead is not its first sentence)', () => {
    const line = 'No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner. A free-fed bowl was down in this window; the trial cannot exclude it. Free-fed: Kibble; intake not directly observed.';
    const out = savedCopyWarningOf(page(`${chart}<p class="conf" data-block="confounder">${line}</p>`));
    expect(out.kind === 'pin' && out.text).toContain('A free-fed bowl was down in this window; the trial cannot exclude it.');
  });

  it('a no-trial copy whose back sheets carry time and meal tags pins nothing and is drawn (adversarial pass 1)', () => {
    // render.ts's own tag shapes, as backSheetsV2 reuses them.
    const back = '<section class="sheet back" data-sheet="2"><p>Time tags: <span class="conf">seen</span> witnessed · <span class="conf">est</span> estimated</p><td>08:10 <span class="conf">seen</span> <span class="conf">2 logs</span></td></section>';
    expect(savedCopyWarningOf(page(`${chart}</main>${back}<main>`))).toEqual({ kind: 'none' });
  });

  it('a trial copy with back-sheet tags still pins its one line', () => {
    const back = '<section class="sheet back" data-sheet="2"><span class="conf">est</span></section>';
    const out = savedCopyWarningOf(page(`${chart}<p class="conf" data-block="confounder">Not a test of the diet alone.</p></main>${back}<main>`));
    expect(out).toEqual({ kind: 'pin', text: 'Not a test of the diet alone.' });
  });

  it('a no-medication line with a bowl leads with the bowl warning, every word kept (adversarial pass 1)', () => {
    const none = SAVED_COPY_NO_MEDICATION;
    const tail = 'Free-fed: Kibble; intake not directly observed.';
    const out = savedCopyWarningOf(page(`<p class="conf" data-block="confounder">${none} ${SAVED_COPY_BOWL_WARNING} ${tail}</p>`));
    expect(out).toEqual({ kind: 'pin', text: `${SAVED_COPY_BOWL_WARNING} ${none} ${tail}` });
    // A medication line keeps "Not a test of the diet alone." first, bowl and all.
    const meds = `Not a test of the diet alone. Overlapping the trial: Apoquel, overlapping it Oct 1 to Oct 20. Spans are the courses as recorded, not evidence of administration. ${SAVED_COPY_BOWL_WARNING} ${tail}`;
    expect(savedCopyWarningOf(page(`<p class="conf" data-block="confounder">${meds}</p>`))).toEqual({ kind: 'pin', text: meds });
    // The no-medication line with no bowl is unchanged.
    expect(savedCopyWarningOf(page(`<p class="conf" data-block="confounder">${none}</p>`))).toEqual({ kind: 'pin', text: none });
  });

  it('no confounder marker anywhere: nothing to pin', () => {
    expect(savedCopyWarningOf(page(chart))).toEqual({ kind: 'none' });
    // `cond` (the masthead's conditions) is not the line.
    expect(savedCopyWarningOf(page('<p class="cond">Atopy</p>'))).toEqual({ kind: 'none' });
  });

  it('a marker whose line cannot be read back whole is refused, never drawn quieter', () => {
    // Changed attribute order.
    expect(savedCopyWarningOf(page('<p data-block="confounder" class="conf">Not a test of the diet alone.</p>'))).toEqual({ kind: 'refuse' });
    // A second class.
    expect(savedCopyWarningOf(page('<p class="conf wide" data-block="confounder">Not a test of the diet alone.</p>'))).toEqual({ kind: 'refuse' });
    // The class alone on a paragraph, block id lost.
    expect(savedCopyWarningOf(page('<p class="conf">Not a test of the diet alone.</p>'))).toEqual({ kind: 'refuse' });
    // Inline markup inside the line.
    expect(savedCopyWarningOf(page('<p class="conf" data-block="confounder"><b>Not a test</b> of the diet alone.</p>'))).toEqual({ kind: 'refuse' });
    // Empty.
    expect(savedCopyWarningOf(page('<p class="conf" data-block="confounder">  </p>'))).toEqual({ kind: 'refuse' });
    // Two lines: a layout this rule never saw.
    const two = '<p class="conf" data-block="confounder">A.</p><p class="conf" data-block="confounder">B.</p>';
    expect(savedCopyWarningOf(page(two))).toEqual({ kind: 'refuse' });
  });
});

describe('the frame lock (CUL-2469, CUL-2495)', () => {
  it('opens the head of every v2 frame document: CSP, prefetch off, the lock script, before any server markup', () => {
    const doc = '<!DOCTYPE html><html><head><meta charset="utf-8" /><style>x{}</style></head><body><script>/*s*/</script></body></html>';
    const locked = withFrameLock(doc) as string;
    expect(locked.startsWith(`<!DOCTYPE html><html><head>${FRAME_LOCK_HEAD}<meta charset`)).toBe(true);
    expect(FRAME_LOCK_HEAD.indexOf(EXAM_CSP_META)).toBe(0);
    expect(FRAME_LOCK_HEAD).toContain(PREFETCH_OFF_META);
    expect(PREFETCH_OFF_META).toBe('<meta http-equiv="x-dns-prefetch-control" content="off">');
    expect(FRAME_LOCK_HEAD.indexOf(PREFETCH_OFF_META)).toBeLessThan(FRAME_LOCK_HEAD.indexOf('<script>'));
    expect(withFrameLock('no head')).toBeNull();
    // The room's own documents take it, both of them.
    expect(examRoomHtml(PHONE, '#0A0A0A')).toContain(`<head>${FRAME_LOCK_HEAD}`);
  });

  it('the v1 box is unchanged: CSP only (CUL-2527 moves v1 separately)', () => {
    expect(withExamCsp('<html><head></head><link rel=preconnect href=//x></html>')).toBe(
      `<html><head>${EXAM_CSP_META}</head><link rel=preconnect href=//x></html>`,
    );
  });

  it('renames every refused tag inert before the parser sees it, in any ASCII case, start or end', () => {
    expect(neutralizeRefusedTags('<link rel=dns-prefetch href=//d.evil.example>')).toBe('<x-refused-link rel=dns-prefetch href=//d.evil.example>');
    expect(neutralizeRefusedTags('<LINK\trel="preconnect" href="https://e">')).toBe('<x-refused-LINK\trel="preconnect" href="https://e">');
    expect(neutralizeRefusedTags('<iframe srcdoc="x"></iframe>')).toBe('<x-refused-iframe srcdoc="x"></x-refused-iframe>');
    expect(neutralizeRefusedTags('<IfRaMe/onload=alert(1)>')).toBe('<x-refused-IfRaMe/onload=alert(1)>');
    for (const t of ['frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe', 'a', 'area']) {
      expect(neutralizeRefusedTags(`<${t} data=x>`)).toBe(`<x-refused-${t} data=x>`);
    }
    expect(neutralizeRefusedTags('<iframe')).toBe('<x-refused-iframe');
    // Not a refused tag, or escaped text: untouched.
    for (const s of ['<links>', '<abbr>x</abbr>', '<aside>', '<article>', '&lt;iframe src=x&gt;', '<p>link iframe</p>', '<linkx>', '<script>/*s*/</script>', '<script id="nyx-exam-script">']) {
      expect(neutralizeRefusedTags(s)).toBe(s);
    }
    // An anchor's host is never a DNS prefetch, on an engine that ignores the switch either.
    expect(neutralizeRefusedTags('<a href="https://r.evil.example/">x</a>')).toBe('<x-refused-a href="https://r.evil.example/">x</x-refused-a>');
    // A script with any attribute but the room's own is renamed: speculation rules, import maps,
    // modules, a type spelled with character references, a `>` hidden in a quoted value.
    for (const tag of [
      '<script type="speculationrules">',
      '<SCRIPT type=speculationrules>',
      '<script/type=speculationrules>',
      '<script type="speculation&#114;ules">',
      '<script x=">" type=speculationrules>',
      '<script id="nyx-exam-script" type="speculationrules">',
      '<script\ttype=module>',
      '<script type=importmap>',
    ]) {
      const out = neutralizeRefusedTags(`${tag}{"prefetch":[{"urls":["https://p.evil.example/"]}]}</script>`);
      expect(out.startsWith('<x-refused-script')).toBe(true);
    }
    // Through the box, a parser-placed hint or frame never exists.
    const boxed = withFrameLock('<html><head></head><body><link rel=preconnect href=https://p.evil><iframe srcdoc="<script>x</script>"></iframe></body></html>') as string;
    expect(boxed).not.toMatch(/<(link|iframe)[\s/>]/i);
    // The report's own documents pass through untouched: the renderer's scripts, the room's
    // script and the lock carry nothing the renaming would touch.
    expect(neutralizeRefusedTags(PHONE)).toBe(PHONE);
    const room = examRoomHtml(PHONE, '#0A0A0A') as string;
    expect(room).toContain('<script id="nyx-exam-script">');
    expect(room).not.toContain('x-refused');
  });

  /** A browser-shaped window with the lock run first, as the head runs it. */
  function lockedWindow(runTwice = false) {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><main id="m"><p>record</p></main></body></html>', { runScripts: 'outside-only' });
    const w = dom.window as unknown as Record<string, unknown> & { eval: (s: string) => unknown; document: Document };
    // jsdom has no WebRTC; stand in the engine's constructors so the lock has something to take.
    w.eval('window.RTCPeerConnection = function(){}; window.webkitRTCPeerConnection = function(){}; window.RTCDataChannel = function(){};');
    w.eval(FRAME_LOCK_SCRIPT);
    if (runTwice) w.eval(FRAME_LOCK_SCRIPT);
    return w;
  }

  it('takes WebRTC away for good: gone, and a later script cannot put it back', () => {
    const w = lockedWindow();
    expect(w.eval('typeof RTCPeerConnection')).toBe('undefined');
    expect(w.eval('typeof webkitRTCPeerConnection')).toBe('undefined');
    expect(w.eval('typeof RTCDataChannel')).toBe('undefined');
    expect(w.eval('try { window.RTCPeerConnection = function(){}; } catch (e) {} typeof RTCPeerConnection')).toBe('undefined');
    expect(w.eval('try { Object.defineProperty(window, "RTCPeerConnection", { value: 1 }); "redefined"; } catch (e) { "refused"; }')).toBe('refused');
    expect(w.eval('delete window.RTCPeerConnection')).toBe(false);
  });

  it('window.open returns null and stays that way', () => {
    const w = lockedWindow();
    expect(w.eval('window.open("", "_blank")')).toBeNull();
    expect(w.eval('try { window.open = function(){ return 1; }; } catch (e) {} window.open()')).toBeNull();
  });

  it('no script can put a frame or a link into the document, by any insertion path', () => {
    const w = lockedWindow();
    const refused = (js: string) => w.eval(`try { ${js}; "ran"; } catch (e) { "refused"; }`);
    expect(refused('document.createElement("iframe")')).toBe('refused');
    expect(refused('document.createElement("LINK")')).toBe('refused');
    expect(refused('document.createElementNS("http://www.w3.org/1999/xhtml", "iframe")')).toBe('refused');
    expect(refused('document.write("<iframe></iframe>")')).toBe('refused');
    expect(refused('document.open()')).toBe('refused');
    expect(refused('document.body.attachShadow({ mode: "open" })')).toBe('refused');
    // setHTML (the Sanitizer API) parses and inserts on its own path: locked to throw, even where
    // the engine has none yet (jsdom has none, so the descriptor is the proof).
    expect(w.eval('var d = Object.getOwnPropertyDescriptor(Element.prototype, "setHTML"); typeof d.value + d.writable + d.configurable')).toBe('functionfalsefalse');
    expect(refused('document.body.setHTML("<iframe></iframe>")')).toBe('refused');
    // No script element goes in at all: a speculationrules script inserted by script prefetches.
    expect(refused('document.createElement("script")')).toBe('refused');
    expect(w.eval(`new DOMParser().parseFromString('<script type=speculationrules>{}<\\/script>', "text/html").head.firstChild.nodeName`)).toBe('SCRIPT');
    expect(refused(`document.body.appendChild(new DOMParser().parseFromString('<script type=speculationrules>{}<\\/script>', "text/html").head.firstChild)`)).toBe('refused');
    // An element from an inert parse (DOMParser keeps it), adopted and inserted: refused before it
    // lands, by every node path.
    const parsed = (tag: string) => `new DOMParser().parseFromString(${JSON.stringify(tag)}, "text/html").body.firstChild`;
    expect(w.eval(`${parsed('<iframe></iframe>')}.nodeName`)).toBe('IFRAME');
    for (const insert of ['document.body.appendChild(N)', 'document.body.append(N)', 'document.body.insertBefore(N, null)', 'document.getElementById("m").after(N)', 'document.body.replaceChildren(N)']) {
      expect(refused(insert.replace('N', parsed('<iframe></iframe>')))).toBe('refused');
      expect(refused(insert.replace('N', parsed('<p>x<link rel=preconnect href=//x></p>')).replace(/^/, 'var n = 0; ') + '; if (document.querySelector("link")) throw 0')).toBe('ran');
    }
    w.eval('document.body.innerHTML = "<main id=m><p>record</p></main>"');
    // A template's content is cleaned as it is parsed.
    expect(w.eval('var t = document.createElement("template"); t.innerHTML = "<iframe></iframe><link rel=preconnect href=//x><b>y</b>"; t.content.childNodes.length')).toBe(1);
    // HTML strings are parsed inert first and land without the refused elements.
    w.eval('document.getElementById("m").innerHTML = "<p>a</p><iframe srcdoc=x></iframe><link rel=preconnect href=//x>"');
    w.eval('document.getElementById("m").insertAdjacentHTML("beforeend", "<div><iframe></iframe><object data=x></object>b</div>")');
    w.eval('var r = document.createRange(); r.selectNodeContents(document.body); document.body.appendChild(r.createContextualFragment("<embed src=x><span>c</span>"))');
    const html = w.document.documentElement.outerHTML;
    expect(html).not.toMatch(/<(iframe|link|object|embed|frame)[\s>]/i);
    expect(w.document.querySelectorAll('iframe,link,object,embed').length).toBe(0);
    expect(w.eval('window.length')).toBe(0);
    // Ordinary content still goes in.
    expect(html).toContain('<p>a</p>');
    expect(html).toContain('<div>b</div>');
    expect(html).toContain('<span>c</span>');
    expect(refused('document.body.appendChild(document.createElement("div"))')).toBe('ran');
    // outerHTML too.
    w.eval('document.querySelector("span").outerHTML = "<i>d</i><iframe></iframe>"');
    expect(w.document.querySelectorAll('iframe').length).toBe(0);
    expect(w.document.body.innerHTML).toContain('<i>d</i>');
  });

  it('a second run (the injected copy after the inline one) changes nothing', () => {
    const w = lockedWindow(true);
    expect(w.eval('typeof RTCPeerConnection')).toBe('undefined');
    expect(w.eval('window.open()')).toBeNull();
    expect(w.eval('try { document.createElement("iframe"); "ran" } catch (e) { "refused" }')).toBe('refused');
    w.eval('document.body.innerHTML = "<p>e</p>"');
    expect(w.document.body.innerHTML).toBe('<p>e</p>');
  });

  // The lock refuses node insertion of frames and links and reroutes HTML strings; it relies on the
  // server's own scripts inserting nothing, so a renderer that starts to is read here first.
  it('the report scripts the lock sits under insert no nodes and write no HTML', () => {
    const phone = readFileSync(join(__dirname, '../supabase/functions/generate-report/renderPhoneV2.ts'), 'utf8');
    const start = phone.indexOf('const SCRIPT_PHONE = `');
    expect(start).toBeGreaterThan(0);
    const scripts = [phone.slice(start, phone.indexOf('`', start + 22)), readFileSync(join(__dirname, 'examRoom.ts'), 'utf8').split('const EXAM_SCRIPT')[1]?.split('</script>`')[0] ?? ''];
    expect(scripts[1].length).toBeGreaterThan(100);
    for (const s of scripts) {
      expect(s).not.toMatch(/innerHTML|outerHTML|insertAdjacent|appendChild|insertBefore|replaceChild|createElement|document\.write|attachShadow|\.append\(|\.prepend\(|\.after\(|\.before\(|replaceWith|replaceChildren/);
    }
  });
});
