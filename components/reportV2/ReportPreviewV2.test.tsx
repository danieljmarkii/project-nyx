// The v2 preview (PR-17, CUL-2297 + CUL-2383).
//
// GUARDS: the phone frame runs JavaScript (CUL-2383; with it off the band lands screens down at
// AX5) and may load nothing but its own document; the printed frame stays script-free; the wait
// covers the frame until the phone document's onLoadEnd and returns for a new document (MOT-2);
// the band slot draws only when asked. Each was proven by breaking the component.
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { WebView: (p: Record<string, unknown>) => React.createElement(View, p) };
});
jest.mock('../surfaces/waits/Tick', () => ({ Tick: () => null }));
let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { PREVIEW_PHONE_TEST_ID, PREVIEW_PRINTED_TEST_ID, ReportPreviewV2, type ReportPreviewV2Props } from './ReportPreviewV2';
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
