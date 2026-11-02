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
let mockActive = true;
jest.mock('../hooks/useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
let mockCopy: { phoneHtml: string; printHtml: string | null } | null = null;
const mockClear = jest.fn();
jest.mock('../lib/examRoomCopy', () => ({ readExamCopy: () => mockCopy, clearExamCopy: () => mockClear() }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import ExamRoomScreen, { EXAM_COPY, EXAM_KEEP_AWAKE_TAG, EXAM_PAGER_TEST_ID, EXAM_PAGES_TEST_ID, EXAM_PRINTED_TEST_ID } from './exam-room';
import { EXAM_IDLE_MS } from '../lib/examRoom';

const PHONE = '<!DOCTYPE html><html><head></head><body><main class="sheet" data-sheet="1">Mochi</main><section class="sheet back" data-sheet="2">b</section></body></html>';

beforeEach(() => {
  jest.useFakeTimers();
  mockActive = true;
  mockCopy = { phoneHtml: PHONE, printHtml: '<html>printed</html>' };
  [mockInject, mockBack, mockActivate, mockDeactivate, mockClear].forEach((m) => m.mockClear());
});
afterEach(() => jest.useRealTimers());

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
});

it('the pager says and announces "Sheet N of M", and VoiceOver turns it', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const s = render(<ExamRoomScreen />);
  post(s, { type: 'exam-page', page: 1, of: 2 });
  expect(s.getByText('Sheet 1 of 2')).toBeTruthy();
  expect(announce).toHaveBeenLastCalledWith('Sheet 1 of 2');
  const pager = s.getByTestId(EXAM_PAGER_TEST_ID);
  expect(pager.props.accessibilityRole).toBe('adjustable');
  expect(pager.props.accessibilityLabel).toBe('Sheet 1 of 2');
  act(() => pager.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('__nyxExamGo(2)'));
  post(s, { type: 'exam-page', page: 2, of: 2 });
  expect(announce).toHaveBeenLastCalledWith('Sheet 2 of 2');
  // Past the last sheet clamps; it never asks for sheet 3.
  act(() => s.getByTestId(EXAM_PAGER_TEST_ID).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('__nyxExamGo(2)'));
});

it('keeps the screen awake while open and foregrounded, and lets go on background', () => {
  const s = render(<ExamRoomScreen />);
  expect(mockActivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  mockActive = false;
  s.rerender(<ExamRoomScreen />);
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
});

it('lets go after the idle window with no touch, and holds again on a touch', () => {
  const s = render(<ExamRoomScreen />);
  mockActivate.mockClear();
  act(() => {
    jest.advanceTimersByTime(EXAM_IDLE_MS + 1);
  });
  expect(mockDeactivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
  expect(mockActivate).not.toHaveBeenCalled();
  post(s, { type: 'exam-touch' });
  expect(mockActivate).toHaveBeenCalledWith(EXAM_KEEP_AWAKE_TAG);
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

it('"Printed page" swaps to the printed layout in place, script-free', () => {
  const s = render(<ExamRoomScreen />);
  expect(s.queryByTestId(EXAM_PRINTED_TEST_ID)).toBeNull();
  fireEvent.press(s.getByText(EXAM_COPY.printed));
  const printed = s.getByTestId(EXAM_PRINTED_TEST_ID);
  expect(printed.props.javaScriptEnabled).toBe(false);
  expect(printed.props.source.html).toBe('<html>printed</html>');
  expect(s.getByText(EXAM_COPY.pages)).toBeTruthy();
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
