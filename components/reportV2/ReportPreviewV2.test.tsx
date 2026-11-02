// The v2 preview (PR-17, CUL-2297 + CUL-2383).
//
// GUARDS: the phone frame runs JavaScript (CUL-2383; with it off the band lands screens down at
// AX5) and may load nothing but its own document; the printed frame stays script-free; the wait
// covers the frame until the phone document's onLoadEnd and returns for a new document (MOT-2);
// the band slot draws only when asked. Each was proven by breaking the component.
// CUL-2430: the printed view carries the line's lead sentence pinned above it (or is withheld
// when the line cannot be read back), and the phone frame cannot be pinched.
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { WebView: (p: Record<string, unknown>) => React.createElement(View, p) };
});
jest.mock('../surfaces/waits/Tick', () => ({ Tick: () => null }));
let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import {
  PREVIEW_PHONE_TEST_ID,
  PREVIEW_PRINTED_TEST_ID,
  PREVIEW_PRINTED_WARNING_TEST_ID,
  ReportPreviewV2,
  lockedPreviewHtml,
  type ReportPreviewV2Props,
} from './ReportPreviewV2';
import { EXAM_VIEWPORT } from '../../lib/examRoom';
import { REPORT_FRONT_BAND_SLOT_TEST_ID, REPORT_FRONT_SILHOUETTE_TEST_ID } from '../surfaces/waits/ReportFrontSilhouette';

const base: ReportPreviewV2Props = {
  phoneHtml: '<html>phone</html>',
  printHtml: '<html>print</html>',
  view: 'phone',
  petName: 'Mochi',
  working: false,
  bandSlot: false,
};

beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('CUL-2383: the phone frame runs its layout script, and loads nothing but its own document', () => {
  const s = render(<ReportPreviewV2 {...base} />);
  const phone = s.getByTestId(PREVIEW_PHONE_TEST_ID);
  expect(phone.props.javaScriptEnabled).toBe(true);
  expect(phone.props.source).toEqual({ html: '<html>phone</html>' });
  const guard = phone.props.onShouldStartLoadWithRequest as (r: { url: string }) => boolean;
  expect(guard({ url: 'about:blank' })).toBe(true);
  expect(guard({ url: 'https://example.com' })).toBe(false);
  expect(guard({ url: 'javascript:alert(1)' })).toBe(false);
});

it('the printed frame mounts on first ask, script-free, the printed page', () => {
  const s = render(<ReportPreviewV2 {...base} />);
  expect(s.queryByTestId(PREVIEW_PRINTED_TEST_ID)).toBeNull();
  s.rerender(<ReportPreviewV2 {...base} view="printed" />);
  const printed = s.getByTestId(PREVIEW_PRINTED_TEST_ID);
  expect(printed.props.javaScriptEnabled).toBe(false);
  expect(printed.props.source).toEqual({ html: '<html>print</html>' });
  // Back to the phone: the printed frame stays mounted (no reload on the next swap).
  s.rerender(<ReportPreviewV2 {...base} view="phone" />);
  expect(s.getByTestId(PREVIEW_PRINTED_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  // ...and is out of VoiceOver's reach while the phone frame shows.
  expect(s.queryByTestId(PREVIEW_PRINTED_TEST_ID)).toBeNull();
});

it('MOT-2: the silhouette covers the frame until onLoadEnd, then leaves and VoiceOver hears "Report ready"', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const s = render(<ReportPreviewV2 {...base} />);
  expect(s.getByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  act(() => jest.advanceTimersByTime(2000));
  // Time alone never lifts the wait: only the document's own load does.
  expect(s.getByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  expect(announce).not.toHaveBeenCalled();
  act(() => s.getByTestId(PREVIEW_PHONE_TEST_ID).props.onLoadEnd());
  expect(announce).toHaveBeenCalledWith('Report ready');
  act(() => jest.advanceTimersByTime(1000));
  expect(s.queryByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeNull();
  announce.mockRestore();
});

it('a new document brings the wait back until it has loaded', () => {
  const s = render(<ReportPreviewV2 {...base} />);
  act(() => s.getByTestId(PREVIEW_PHONE_TEST_ID).props.onLoadEnd());
  act(() => jest.advanceTimersByTime(1000));
  expect(s.queryByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeNull();
  s.rerender(<ReportPreviewV2 {...base} phoneHtml="<html>phone 2</html>" />);
  expect(s.getByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  act(() => s.getByTestId(PREVIEW_PHONE_TEST_ID).props.onLoadEnd());
  act(() => jest.advanceTimersByTime(1000));
  expect(s.queryByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeNull();
});

it('under Reduce Motion the wait leaves at once', () => {
  mockReduced = true;
  const s = render(<ReportPreviewV2 {...base} />);
  act(() => s.getByTestId(PREVIEW_PHONE_TEST_ID).props.onLoadEnd());
  expect(s.queryByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeNull();
});

it('the first build: no document yet, only the silhouette', () => {
  const s = render(<ReportPreviewV2 {...base} phoneHtml={null} printHtml={null} working />);
  expect(s.getByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  expect(s.queryByTestId(PREVIEW_PHONE_TEST_ID)).toBeNull();
});

it('the band slot draws only when the outline reported a live flag', () => {
  expect(render(<ReportPreviewV2 {...base} bandSlot={false} />).queryByTestId(REPORT_FRONT_BAND_SLOT_TEST_ID, { includeHiddenElements: true })).toBeNull();
  expect(render(<ReportPreviewV2 {...base} bandSlot />).getByTestId(REPORT_FRONT_BAND_SLOT_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
});

// ---- CUL-2430: the bars never show without the pin or the line ----

const ZOOMABLE = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
const LEAD = 'Not a test of the diet alone. Itching fell while Apoquel ran & "most" of it overlapped.';
// The reflow as renderPhoneV2 writes it: the confounder block and its pinned lead, `h()`-escaped.
const PHONE_WITH_LINE = `<!DOCTYPE html><html><head>${ZOOMABLE}<style>x{}</style></head><body><main data-sheet="1"><div class="unit"><figure data-part="chart">bars</figure><section class="confounder" data-block="confounder"><p class="verdict" data-part="confounder-verdict" aria-hidden="true">Not a test of the diet alone. Itching fell while Apoquel ran &amp; &quot;most&quot; of it overlapped.</p><p>Not a test of the diet alone.</p></section></div></main><script>/*reflow*/</script></body></html>`;
const PHONE_NO_LINE = `<!DOCTYPE html><html><head>${ZOOMABLE}</head><body><main data-sheet="1"><figure data-part="chart">bars</figure></main></body></html>`;
// The line is there but its lead cannot be read back (a render whose markup moved).
const PHONE_UNREADABLE = `<!DOCTYPE html><html><head>${ZOOMABLE}</head><body><main data-sheet="1"><section class="confounder" data-block="confounder"><p class="verdict">Not a test of the diet alone.</p></section></main></body></html>`;
const PRINT = '<!DOCTYPE html><html><head></head><body><main>printed bars, line below</main></body></html>';

it('CUL-2430: the phone frame cannot be pinched (iOS viewport lock, Android zoom controls off)', () => {
  const s = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_WITH_LINE} printHtml={PRINT} />);
  const phone = s.getByTestId(PREVIEW_PHONE_TEST_ID);
  const html = (phone.props.source as { html: string }).html;
  expect(html).toContain(EXAM_VIEWPORT);
  expect(html).not.toContain(ZOOMABLE);
  expect(html).toContain('user-scalable=no');
  expect(phone.props.setBuiltInZoomControls).toBe(false);
  // Only the viewport changed: the reflow is otherwise the server's document, byte for byte.
  expect(html.replace(EXAM_VIEWPORT, ZOOMABLE)).toBe(PHONE_WITH_LINE);
});

it('CUL-2430: a reflow whose viewport moved still gets the lock, as the last viewport in its head', () => {
  const moved = PHONE_WITH_LINE.replace(ZOOMABLE, '<meta name="viewport" content="width=device-width, initial-scale=1">');
  const out = lockedPreviewHtml(moved);
  const head = out.slice(0, out.indexOf('</head>'));
  const metas = head.match(/<meta name="viewport"[^>]*>/g) ?? [];
  expect(metas[metas.length - 1]).toBe(EXAM_VIEWPORT);
});

type Node = { parent: Node | null; children: unknown[] };
/** Document order across the rendered tree: `a` renders before `b` (the room's own check). */
function comesBefore(a: unknown, b: unknown): boolean {
  const chain = (n: Node | null): Node[] => (n ? [n, ...chain(n.parent)] : []);
  const ca = chain(a as Node);
  const cb = chain(b as Node);
  const shared = ca.find((n) => cb.includes(n));
  if (!shared) return false;
  const branch = (c: Node[]) => c[c.indexOf(shared) - 1];
  return shared.children.indexOf(branch(ca)) < shared.children.indexOf(branch(cb));
}

it('CUL-2430: "View as printed" pins the line\'s own lead sentence above the printed page, never over it', () => {
  const s = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_WITH_LINE} printHtml={PRINT} view="printed" />);
  const pin = s.getByTestId(PREVIEW_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true });
  // The model's lead, read back from the reflow and decoded: the same words the reflow pins.
  expect(s.getByText(LEAD, { includeHiddenElements: true })).toBeTruthy();
  // A sibling ABOVE the printed page in one column: on screen at every scroll and zoom of it.
  const printed = s.getByTestId(PREVIEW_PRINTED_TEST_ID);
  expect(comesBefore(pin, printed)).toBe(true);
  expect(StyleSheet.flatten(pin.props.style).position).not.toBe('absolute');
  // The printed page itself is untouched: the pin never prints.
  expect(printed.props.source).toEqual({ html: PRINT });
  // For the eye only: the page below carries the line itself for VoiceOver.
  expect(pin.props.accessibilityElementsHidden).toBe(true);
});

it('CUL-2430: the pin follows the document: a new window without a line takes it away, one with a line brings it back', () => {
  const s = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_NO_LINE} printHtml={PRINT} view="printed" />);
  expect(s.getByTestId(PREVIEW_PRINTED_TEST_ID)).toBeTruthy();
  expect(s.queryByTestId(PREVIEW_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true })).toBeNull();
  s.rerender(<ReportPreviewV2 {...base} phoneHtml={PHONE_WITH_LINE} printHtml={PRINT} view="printed" />);
  expect(s.getByTestId(PREVIEW_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
});

it('CUL-2430: a line whose lead cannot be read back keeps the phone frame, never the printed bars bare', () => {
  const s = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_UNREADABLE} printHtml={PRINT} view="printed" />);
  expect(s.queryByTestId(PREVIEW_PRINTED_TEST_ID, { includeHiddenElements: true })).toBeNull();
  // The reflow (which pins its own line) stays the visible, reachable frame.
  expect(s.getByTestId(PREVIEW_PHONE_TEST_ID)).toBeTruthy();
  // ...and a printed frame mounted for an earlier document is taken down, not left showing.
  const t = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_NO_LINE} printHtml={PRINT} view="printed" />);
  expect(t.getByTestId(PREVIEW_PRINTED_TEST_ID)).toBeTruthy();
  t.rerender(<ReportPreviewV2 {...base} phoneHtml={PHONE_UNREADABLE} printHtml={PRINT} view="printed" />);
  expect(t.queryByTestId(PREVIEW_PRINTED_TEST_ID, { includeHiddenElements: true })).toBeNull();
  expect(t.getByTestId(PREVIEW_PHONE_TEST_ID)).toBeTruthy();
});

it('CUL-2430 (adversarial pass 1): a window change while printed shows gets a fresh printed frame, never the old page under the new pin', () => {
  const PRINT_B = '<!DOCTYPE html><html><head></head><body><main>record B, no trial</main></body></html>';
  const s = render(<ReportPreviewV2 {...base} phoneHtml={PHONE_WITH_LINE} printHtml={PRINT} view="printed" />);
  const before = s.getByTestId(PREVIEW_PRINTED_TEST_ID);
  // Record A's page, A's pin.
  expect(s.getByTestId(PREVIEW_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  // The window changes to record B, with no confounder line, in the same commit that keeps `printed`.
  s.rerender(<ReportPreviewV2 {...base} phoneHtml={PHONE_NO_LINE} printHtml={PRINT_B} view="printed" />);
  const after = s.getByTestId(PREVIEW_PRINTED_TEST_ID);
  expect(s.queryByTestId(PREVIEW_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true })).toBeNull();
  // Not the same native view handed a new source (which would keep painting A's bars): a new one.
  expect(after).not.toBe(before);
  expect(after.props.source).toEqual({ html: PRINT_B });
});
