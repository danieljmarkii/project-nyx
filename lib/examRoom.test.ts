// Exam-room mode's pure rules (CUL-2299, spec §10.6). What only a layout engine can see (one
// sheet at a time, the arm's-length type, the keep-together unit on every page) is
// scripts/report-phone/guard.mjs's exam pass.
import {
  ARM_LENGTH_PX,
  EXAM_CSP,
  EXAM_IDLE_MS,
  clampPage,
  examGoScript,
  examRoomHtml,
  keepAwakeWanted,
  parseExamMessage,
  sheetLabel,
  withExamCsp,
} from './examRoom';

const PHONE = '<!DOCTYPE html><html><head><style>x{}</style></head><body><main class="sheet" data-sheet="1">a</main><section class="sheet back" data-sheet="2">b</section><script>/*reflow*/</script></body></html>';

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
    const stripped = html.replace(/<style id="nyx-exam-style">[\s\S]*?<\/style>\n/, '').replace(/<script id="nyx-exam-script">[\s\S]*?<\/script>\n/, '').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
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

  it('never touches brightness', () => {
    expect(out as string).not.toMatch(/brightness/i);
  });

  it('refuses a document that is not a v2 phone reflow', () => {
    expect(examRoomHtml('<html><head></head><body>v1</body></html>', '#000')).toBeNull();
    expect(examRoomHtml('', '#000')).toBeNull();
  });
});
