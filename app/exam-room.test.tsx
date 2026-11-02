// Exam-room mode's screen (CUL-2299, spec §10.6, §14).
//
// GUARDS: the room shows the staged copy as the exam document, with JavaScript on and nowhere to
// go; the pager says and announces "Sheet N of M" and VoiceOver can turn it; keep-awake holds
// only while open, foregrounded and touched, and lets go on Done, background and idle; the copy
// is deleted when the room closes; nothing here touches brightness.
import fs from 'fs';
import path from 'path';

const mockInject = jest.fn();
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((p: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return React.createElement(View, p);
  });
  return { WebView };
});
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
const mockActivate = jest.fn(() => Promise.resolve());
const mockDeactivate = jest.fn(() => Promise.resolve());
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: (...a: unknown[]) => mockActivate(...(a as [])),
  deactivateKeepAwake: (...a: unknown[]) => mockDeactivate(...(a as [])),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockRotation = jest.fn();
jest.mock('../lib/screenOrientation', () => ({ useRotationUnlocked: (a: boolean) => mockRotation(a) }));
let mockActive = true;
jest.mock('../hooks/useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
let mockCopy: { phoneHtml: string; printHtml: string | null } | null = null;
const mockClear = jest.fn();
jest.mock('../lib/examRoomCopy', () => ({ readExamCopy: () => mockCopy, clearExamCopy: () => mockClear() }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import ExamRoomScreen, {
  EXAM_COPY,
  EXAM_KEEP_AWAKE_TAG,
  EXAM_PAGER_TEST_ID,
  EXAM_PAGES_TEST_ID,
  EXAM_PRINTED_TEST_ID,
  EXAM_PRINTED_WARNING_TEST_ID,
} from './exam-room';
import { EXAM_IDLE_MS } from '../lib/examRoom';

const PRINT = '<html><head></head><body>printed</body></html>';
const PHONE = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></head><body><main class="sheet" data-sheet="1">Mochi<div class="keep"><p class="verdict" data-part="confounder-verdict" aria-hidden="true">Not a test of the diet alone.</p></div></main><section class="sheet back" data-sheet="2">b</section></body></html>';

beforeEach(() => {
  jest.useFakeTimers();
  mockActive = true;
  mockFontScale = 1;
  mockCopy = { phoneHtml: PHONE, printHtml: PRINT };
  [mockInject, mockBack, mockActivate, mockDeactivate, mockClear].forEach((m) => m.mockClear());
});
afterEach(() => jest.useRealTimers());

type Node = { parent: Node | null; children: unknown[] };
/** True when `a` sits in an earlier sibling branch than `b` under their nearest shared ancestor:
 *  stacked above it in a column, never laid over it. */
function comesBefore(a: unknown, b: unknown): boolean {
  const chain = (n: Node | null): Node[] => (n ? [n, ...chain(n.parent)] : []);
  const ca = chain(a as Node);
  const cb = chain(b as Node);
  const shared = ca.find((n) => cb.includes(n));
  if (!shared) return false;
  const branch = (c: Node[]) => c[c.indexOf(shared) - 1];
  return shared.children.indexOf(branch(ca)) < shared.children.indexOf(branch(cb));
}

function post(s: ReturnType<typeof render>, data: unknown) {
  act(() => {
    s.getByTestId(EXAM_PAGES_TEST_ID).props.onMessage({ nativeEvent: { data: JSON.stringify(data) } });
  });
}

it('shows the staged copy as the exam document, runs its scripts, and loads nothing else', () => {
  const s = render(<ExamRoomScreen />);
  const web = s.getByTestId(EXAM_PAGES_TEST_ID);
  expect(web.props.javaScriptEnabled).toBe(true);
  expect(web.props.source.html).toContain('id="nyx-exam-script"');
  expect(web.props.source.html).toContain('Mochi');
  expect(web.props.onShouldStartLoadWithRequest({ url: 'https://example.com' })).toBe(false);
  expect(web.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
  // Every URL reaches the predicate; none is handed to the system browser (CUL-2428 review).
  expect(web.props.originWhitelist).toEqual(['*']);
  expect(web.props.onOpenWindow).toBeDefined();
  expect(web.props.source.html).toContain('http-equiv="Content-Security-Policy"');
});

it('the pager says and announces "Sheet N of M", and VoiceOver turns it without hearing it twice', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const s = render(<ExamRoomScreen />);
  // Entry: the document's first message is announced.
  post(s, { type: 'exam-page', page: 1, of: 2 });
  expect(s.getByText('Sheet 1 of 2')).toBeTruthy();
  expect(announce).toHaveBeenLastCalledWith('Sheet 1 of 2');
  const pager = s.getByTestId(EXAM_PAGER_TEST_ID);
  expect(pager.props.accessibilityRole).toBe('adjustable');
  expect(pager.props.accessibilityLabel).toBe(EXAM_COPY.pagerLabel);
  expect(pager.props.accessibilityValue).toEqual({ text: 'Sheet 1 of 2' });
  // A pager turn: VoiceOver speaks the new value itself, so no second announcement.
  announce.mockClear();
  act(() => pager.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('__nyxExamGo(2)'));
  post(s, { type: 'exam-page', page: 2, of: 2 });
  expect(announce).not.toHaveBeenCalled();
  expect(s.getByTestId(EXAM_PAGER_TEST_ID).props.accessibilityValue).toEqual({ text: 'Sheet 2 of 2' });
  // Past the last sheet: nothing is asked for.
  mockInject.mockClear();
  act(() => s.getByTestId(EXAM_PAGER_TEST_ID).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(mockInject).not.toHaveBeenCalled();
  // A swipe on the page turns it from the document's side: announced.
  post(s, { type: 'exam-page', page: 1, of: 2 });
  expect(announce).toHaveBeenLastCalledWith('Sheet 1 of 2');
});

it('keeps the screen awake while open and foregrounded, and lets go on background', () => {
  const s = render(<ExamRoomScreen />);
  expect(mockActivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  mockActive = false;
  s.rerender(<ExamRoomScreen />);
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
});

it('lets go when the idle timer fires, whatever the clock says, and holds again on a touch or a scroll', () => {
  const s = render(<ExamRoomScreen />);
  mockActivate.mockClear();
  act(() => {
    jest.advanceTimersByTime(EXAM_IDLE_MS - 1);
  });
  expect(mockDeactivate).not.toHaveBeenCalled();
  // The timer's firing is the release: idle is state, never re-derived from Date.now() (a timer
  // that fires a few ms early must still let go).
  jest.spyOn(Date, 'now').mockReturnValue(0);
  act(() => {
    jest.advanceTimersByTime(1);
  });
  (Date.now as jest.Mock).mockRestore();
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  expect(mockActivate).not.toHaveBeenCalled();
  post(s, { type: 'exam-touch' });
  expect(mockActivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  // A scroll of the page counts as use too.
  act(() => {
    jest.advanceTimersByTime(EXAM_IDLE_MS + 1);
  });
  mockActivate.mockClear();
  act(() => {
    jest.advanceTimersByTime(2000);
    s.getByTestId(EXAM_PAGES_TEST_ID).props.onScroll();
  });
  expect(mockActivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
});

it('a text-size change with the room open reloads the pages at the new size', () => {
  const s = render(<ExamRoomScreen />);
  const before = s.getByTestId(EXAM_PAGES_TEST_ID);
  mockFontScale = 2;
  s.rerender(<ExamRoomScreen />);
  expect(s.getByTestId(EXAM_PAGES_TEST_ID)).not.toBe(before);
});

it('Done lets go of keep-awake and closes; closing deletes the copy', () => {
  const s = render(<ExamRoomScreen />);
  fireEvent.press(s.getByText(EXAM_COPY.done));
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockClear).not.toHaveBeenCalled();
  s.unmount();
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
});

it('the large-type pages never zoom', () => {
  const s = render(<ExamRoomScreen />);
  const web = s.getByTestId(EXAM_PAGES_TEST_ID);
  expect(web.props.setBuiltInZoomControls).toBe(false);
  expect(web.props.source.html).toContain('user-scalable=no');
});

describe('"Printed page" carries its warning (PM ruling (a) on CUL-2430)', () => {
  it('swaps to the printed layout in place, script-free, with the line’s lead sentence pinned above it', () => {
    const s = render(<ExamRoomScreen />);
    expect(s.queryByTestId(EXAM_PRINTED_TEST_ID)).toBeNull();
    fireEvent.press(s.getByText(EXAM_COPY.printed));
    const printed = s.getByTestId(EXAM_PRINTED_TEST_ID);
    expect(printed.props.javaScriptEnabled).toBe(false);
    expect(printed.props.source.html).toContain('printed');
    expect(printed.props.source.html).toContain('http-equiv="Content-Security-Policy"');
    expect(printed.props.onShouldStartLoadWithRequest({ url: 'https://example.com' })).toBe(false);
    expect(printed.props.originWhitelist).toEqual(['*']);
    expect(printed.props.onOpenWindow).toBeDefined();
    // The pin: the reflow's own words, a sibling ABOVE the printed view (never over it).
    // Hidden from VoiceOver by design (the full line is read in the page), so queried as such.
    const pin = s.getByTestId(EXAM_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true });
    expect(pin.props.accessibilityElementsHidden).toBe(true);
    expect(s.getByText('Not a test of the diet alone.', { includeHiddenElements: true })).toBeTruthy();
    expect(comesBefore(pin, printed)).toBe(true);
    expect(s.getByText(EXAM_COPY.pages)).toBeTruthy();
  });

  it('a record with no confounder line pins nothing, as the reflow pins nothing', () => {
    mockCopy = { phoneHtml: PHONE.replace(/<div class="keep">.*?<\/div>/, ''), printHtml: PRINT };
    const s = render(<ExamRoomScreen />);
    fireEvent.press(s.getByText(EXAM_COPY.printed));
    expect(s.getByTestId(EXAM_PRINTED_TEST_ID)).toBeTruthy();
    expect(s.queryByTestId(EXAM_PRINTED_WARNING_TEST_ID, { includeHiddenElements: true })).toBeNull();
  });

  it('withholds "Printed page" when the record has a confounder line but no readable pin', () => {
    mockCopy = {
      phoneHtml: PHONE.replace(/<div class="keep">.*?<\/div>/, '<p class="conf" data-block="confounder">Not a test of the diet alone.</p>'),
      printHtml: PRINT,
    };
    const s = render(<ExamRoomScreen />);
    expect(s.queryByText(EXAM_COPY.printed)).toBeNull();
  });

  it('offers no "Printed page" when the copy has no printed layout', () => {
    mockCopy = { phoneHtml: PHONE, printHtml: null };
    const s = render(<ExamRoomScreen />);
    expect(s.queryByText(EXAM_COPY.printed)).toBeNull();
  });
});

it('is the one route that may turn sideways', () => {
  render(<ExamRoomScreen />);
  expect(mockRotation).toHaveBeenCalledWith(true);
});

it('with no copy on the phone, says so and shows no page', () => {
  mockCopy = null;
  const s = render(<ExamRoomScreen />);
  expect(s.getByText(EXAM_COPY.missing)).toBeTruthy();
  expect(s.queryByTestId(EXAM_PAGES_TEST_ID)).toBeNull();
});

it('never changes system brightness (spec §10.6)', () => {
  const root = path.resolve(__dirname, '..');
  for (const f of ['app/exam-room.tsx', 'lib/examRoom.ts', 'lib/examRoomCopy.ts']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    expect(src).not.toMatch(/expo-brightness|setBrightness|Brightness\./);
  }
});
