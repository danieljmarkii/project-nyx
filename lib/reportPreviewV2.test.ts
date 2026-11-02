// The v2 preview's pure rules (PR-17, CUL-2297 + CUL-2383).
import { androidTextZoom, bandSlotFor, hasPhonePreview, isPreviewLoadAllowed, PREVIEW_TOGGLE_LABEL } from './reportPreviewV2';

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

describe('isPreviewLoadAllowed (CUL-2383: JS on, so the frame may load nothing but the inline document)', () => {
  it('lets the inline document load', () => {
    for (const u of ['about:blank', 'about:srcdoc', 'data:text/html;charset=utf-8,<html></html>']) {
      expect(isPreviewLoadAllowed(u)).toBe(true);
    }
  });
  it('refuses every navigation away from it', () => {
    for (const u of ['https://example.com', 'http://example.com', 'file:///etc/hosts', 'javascript:alert(1)', 'mailto:a@b.c', 'tel:123', 'about:blank.evil.com'.replace('about:blank', 'https://about')]) {
      expect(isPreviewLoadAllowed(u)).toBe(false);
    }
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
