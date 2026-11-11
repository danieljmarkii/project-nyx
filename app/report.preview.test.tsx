// The v2 preview on the report screen (PR-17, CUL-2297 + CUL-2383).
//
// A v2 response that carries its phone layout renders the preview with "View as printed" in the
// header; a v1 response, or a v2 one without a phone layout, renders the plain report exactly as
// before (no toggle, no preview). Asking for v2, the first build's wait is the v2 Front Page.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { WebView: (p: Record<string, unknown>) => React.createElement(View, p) };
});
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('../components/surfaces/waits/ReportSilhouette', () => {
  const { Text } = require('react-native');
  const React = require('react');
  return {
    ReportSilhouette: () => React.createElement(Text, { testID: 'v1-silhouette' }, 'v1'),
    REPORT_WAIT_SUBTITLE: 'Pulling together the full record.',
    reportWaitTitle: (n: string) => `Writing ${n}’s report…`,
  };
});
jest.mock('../components/surfaces/waits/Tick', () => ({ Tick: () => null }));
jest.mock('../store/petStore', () => {
  const pet = { id: 'p1', name: 'Mochi' };
  const state = { activePet: pet, pets: [pet] };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, from: jest.fn() } }));
jest.mock('../lib/pdf', () => ({
  flushBeforeReport: jest.fn(async () => ({ pending: 0, quarantined: 0 })),
  reportFreshnessLine: () => null,
  reportVersionFor: (eligible: boolean, optedIn: boolean) => (eligible && optedIn ? 'v2' : null),
  generateVetReport: jest.fn(),
  shareReportPdf: jest.fn(async () => true),
}));
jest.mock('../lib/vetDocumentLibrary', () => ({ readVetLibrary: jest.fn(async () => []) }));
jest.mock('../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));
// The document layout flag on; the composer off, so the screen builds at once.
let mockDocV2 = true;
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: (key: string) => key === 'report_document_v2' && mockDocV2 }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { generateVetReport, type VetReport } from '../lib/pdf';
import { REPORT_FRONT_SILHOUETTE_TEST_ID } from '../components/surfaces/waits/ReportFrontSilhouette';
import ReportScreen, { V1_PREVIEW_TEST_ID, boxedV1Html } from './report';
import { EXAM_CSP, PREFETCH_OFF_META } from '../lib/examRoom';
import { REPORT_FRAME_PROPS } from '../lib/reportPreviewV2';
import { boxedPreviewHtml } from '../components/reportV2/ReportPreviewV2';

const mockedGenerate = generateVetReport as jest.Mock;
const report = (over: Partial<VetReport> = {}): VetReport => ({
  html: '<html>print</html>',
  phoneHtml: '<html>phone</html>',
  petName: 'Mochi',
  startDate: '2026-06-01',
  endDate: '2026-07-02',
  scopeBasis: 'since_visit',
  photoCount: 0,
  trialAllowedListMissing: false,
  reportVersion: 'v2',
  ownerSurname: null,
  ...over,
});
const hidden = { includeHiddenElements: true };

beforeEach(() => {
  mockDocV2 = true;
  mockedGenerate.mockReset();
});

it('a v2 report with its phone layout: the preview, and "View as printed" swaps in place', async () => {
  mockedGenerate.mockResolvedValue(report());
  const s = render(<ReportScreen />);
  const toggle = await s.findByTestId('report-v2-view-toggle');
  expect(s.getByTestId('report-v2-phone', hidden).props.source).toEqual({ html: boxedPreviewHtml('<html>phone</html>') });
  expect(s.getByTestId('report-v2-phone', hidden).props.javaScriptEnabled).toBe(true);
  expect(s.getByText('View as printed')).toBeTruthy();
  fireEvent.press(toggle);
  expect(s.getByText('View on phone')).toBeTruthy();
  expect(s.getByTestId('report-v2-printed').props.source).toEqual({ html: boxedPreviewHtml('<html>print</html>') });
  // Send still sends the printed page: nothing about the PDF moved.
  expect(s.getByText('Send to vet')).toBeTruthy();
});

it('a v1 report renders as before: no preview, no toggle, JS off', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, html: '<html>v1</html>' }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  expect(s.queryByTestId('report-v2-view-toggle')).toBeNull();
  expect(s.queryByTestId('report-v2-phone', hidden)).toBeNull();
});

// CUL-2486: the v1 frame had `originWhitelist ['*']` and no load check, so an injected link or
// meta refresh loaded https in the frame. CUL-2527: its own check still admitted every `data:` URL,
// so a meta refresh to a `data:` document with no CSP could carry the record out. It now spreads
// the one set of report frame props, so it refuses exactly what every v2 frame refuses.
it('the v1 frame spreads the report frame props: data:, sub-frames and every other scheme refused; JS off; CSP and prefetch off', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, html: '<html><head></head><body>v1</body></html>' }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  const web = s.getByTestId(V1_PREVIEW_TEST_ID, hidden);
  const p = web.props as Record<string, unknown> & {
    javaScriptEnabled: boolean;
    source: { html: string };
    onShouldStartLoadWithRequest: (r: { url: string; isTopFrame?: boolean }) => boolean;
  };
  for (const [key, value] of Object.entries(REPORT_FRAME_PROPS)) expect(p[key]).toBe(value);
  expect(p.javaScriptEnabled).toBe(false);
  expect(p.source.html).toBe(boxedV1Html('<html><head></head><body>v1</body></html>'));
  const body = p.source.html.indexOf('<body>');
  expect(p.source.html.indexOf('Content-Security-Policy')).toBeLessThan(body);
  expect(p.source.html.indexOf(PREFETCH_OFF_META)).toBeGreaterThan(-1);
  expect(p.source.html.indexOf(PREFETCH_OFF_META)).toBeLessThan(body);
  expect(p.source.html).toContain(`content="${EXAM_CSP}"`);
  expect(p.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
  expect(p.onShouldStartLoadWithRequest({ url: 'about:blank', isTopFrame: false })).toBe(false);
  for (const url of [
    'data:text/html,<img src=https://evil.example/?x=',
    'data:text/html;charset=utf-8,<html></html>',
    'data:image/svg+xml,<svg/>',
    'DATA:text/html,x',
    'about:srcdoc',
    'https://evil.example/?d=record',
    'http://x.test',
    'nyx://report',
    'mailto:a@b.c',
    'javascript:alert(1)',
  ]) {
    expect(p.onShouldStartLoadWithRequest({ url })).toBe(false);
  }
});

// CUL-2458: the v2 `html` is the PRINTED page; shown bare on a phone it has no pinned warning
// and zoom on. A v2 response without its phone layout is refused into the build error.
const printedOnScreen = (s: ReturnType<typeof render>) =>
  s.UNSAFE_root.findAll((n: { props: unknown }) => (n.props as { source?: { html?: string } }).source?.html === '<html>print</html>');

it.each([
  ['missing', null],
  ['empty', ''],
  ['whitespace only', '  \n  '],
])('a v2 report whose phone layout is %s is refused: the error and retry, never the printed page bare', async (_w, phoneHtml) => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockedGenerate.mockResolvedValue(report({ phoneHtml }));
  const s = render(<ReportScreen />);
  await s.findByText('Couldn’t prepare the report');
  expect(s.getByText('Try again')).toBeTruthy();
  expect(printedOnScreen(s)).toHaveLength(0);
  expect(s.queryByText('Send to vet')).toBeNull();
});

it('a refresh that comes back bare replaces the good v2 report with the error, not the printed page', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockedGenerate.mockResolvedValueOnce(report());
  const s = render(<ReportScreen />);
  await s.findByTestId('report-v2-view-toggle');
  mockedGenerate.mockResolvedValueOnce(report({ phoneHtml: null, html: '<html>print</html>' }));
  fireEvent.press(s.getByText('Custom…'));
  await s.findByText('Couldn’t prepare the report');
  expect(s.queryByTestId('report-v2-view-toggle')).toBeNull();
  // The good report's printed half sat in the toggle's other view; nothing printed is mounted now.
  expect(printedOnScreen(s)).toHaveLength(0);
});

it('the retry after a refused bare v2 report builds again and shows the preview when it lands whole', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockedGenerate.mockResolvedValueOnce(report({ phoneHtml: null })).mockResolvedValueOnce(report());
  const s = render(<ReportScreen />);
  fireEvent.press(await s.findByText('Try again'));
  await s.findByTestId('report-v2-view-toggle');
});

it('asking for v2, the first build waits on the v2 Front Page; asking for v1, on the shipped silhouette', async () => {
  mockedGenerate.mockReturnValue(new Promise(() => {}));
  const s = render(<ReportScreen />);
  await waitFor(() => expect(s.getByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, hidden)).toBeTruthy());
  expect(s.queryByTestId('v1-silhouette')).toBeNull();
  s.unmount();
  mockDocV2 = false;
  const v1 = render(<ReportScreen />);
  await waitFor(() => expect(v1.getByTestId('v1-silhouette')).toBeTruthy());
  expect(v1.queryByTestId(REPORT_FRONT_SILHOUETTE_TEST_ID, hidden)).toBeNull();
});

it('boxedV1Html: the policy and the prefetch switch land in a real head, never in a <header>, and without a head after the doctype', () => {
  const head = `<meta http-equiv="Content-Security-Policy" content="${EXAM_CSP}">${PREFETCH_OFF_META}`;
  expect(boxedV1Html('<html><head><title>t</title></head><body/></html>')).toBe(`<html><head>${head}<title>t</title></head><body/></html>`);
  expect(boxedV1Html('<html><HEAD lang="en"><title>t</title></HEAD></html>')).toBe(`<html><HEAD lang="en">${head}<title>t</title></HEAD></html>`);
  expect(boxedV1Html('<!DOCTYPE html><body><header>h</header></body>')).toBe(`<!DOCTYPE html>${head}<body><header>h</header></body>`);
  expect(boxedV1Html('<body>x</body>')).toBe(`${head}<body>x</body>`);
});

// CUL-2527 privacy pass F1/F2: JS is off, so no lock script removes an injected hint or frame; the
// rename does. A preconnect is a path out the CSP does not close; an about:blank iframe passes the
// iOS check as the top frame.
it('boxedV1Html renames every refused tag inert, and leaves escaped text alone', () => {
  const out = boxedV1Html(
    '<html><head></head><body><link rel=preconnect href=https://x.test><IFRAME src=about:blank></IFRAME><a href=https://y.test>a</a><object></object>&lt;iframe&gt;</body></html>',
  );
  expect(out).not.toMatch(/<(link|iframe|a|object)[\s>]/i);
  expect(out).toContain('<x-refused-link rel=preconnect');
  expect(out).toContain('<x-refused-IFRAME src=about:blank>');
  expect(out).toContain('&lt;iframe&gt;');
  expect(out).toContain(PREFETCH_OFF_META);
});

// CUL-2552: the v1 frame admits `about:blank` (how iOS reports the inline document), so an
// injected refresh there would blank the report. JS is off; the rename is what stops it.
it('boxedV1Html renames a meta refresh inert, so the v1 preview cannot be blanked by its own content', () => {
  const out = boxedV1Html(
    '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=794" /></head><body><META HTTP-EQUIV=refresh content="0;url=about:blank"><meta content="0" http-equiv="refresh"></body></html>',
  );
  expect(out).not.toMatch(/<meta[^>]*http-equiv=["']?refresh/i);
  expect(out).toContain('<meta charset="utf-8" />');
  expect(out).toContain('<meta name="viewport" content="width=794" />');
  expect(out.match(/<x-refused-meta/gi)).toHaveLength(2);
});

// PR-23b (CUL-2454): the v2 photo line opens the picker; Done rebuilds once with the choice, and a
// Done that changes nothing builds nothing.
jest.mock('../lib/reportPhotoThumbs', () => ({ readPickerThumbs: jest.fn(async () => new Map()) }));
it('PR-23b: the picker\'s Done rebuilds the report once with the photos left out', async () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const photos = [
    { attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: '2026-07-02T12:00:00Z', safety: 'blood' as const },
    { attachmentId: B, eventId: 'e2', type: 'vomit', occurredAt: '2026-06-28T12:00:00Z', safety: null },
  ];
  mockedGenerate.mockResolvedValue(report({ photoCount: 2, photos }));
  const s = render(<ReportScreen />);
  const row = await s.findByTestId('report-photos-choose');
  expect(s.getByText('Photos · 2 · Choose')).toBeTruthy();
  expect(mockedGenerate).toHaveBeenCalledTimes(1);

  // An unchanged Done builds nothing.
  fireEvent.press(row);
  fireEvent.press(await s.findByTestId('photo-leave-out-done'));
  expect(mockedGenerate).toHaveBeenCalledTimes(1);

  fireEvent.press(s.getByTestId('report-photos-choose'));
  fireEvent.press(await s.findByTestId(`photo-row-${A}`));
  expect(mockedGenerate).toHaveBeenCalledTimes(1);
  mockedGenerate.mockResolvedValue(report({ photoCount: 1, photos }));
  fireEvent.press(s.getByTestId('photo-leave-out-done'));
  await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(2));
  expect(mockedGenerate.mock.calls[1][0]).toEqual({ petId: 'p1', includeNotes: true, photosLeftOut: [A] });
  await waitFor(() => expect(s.getByText('Photos · 1 of 2 · Choose')).toBeTruthy());
});

it('PR-23b: v1 keeps its sentence and offers no picker', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, photoCount: 2, photos: null }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  expect(s.getByText('Includes 2 photos from logged incidents.')).toBeTruthy();
  expect(s.queryByTestId('report-photos-choose')).toBeNull();
});

it('PR-23b privacy F1: a rebuild that lands on v1 after a photo was left out says every photo goes', async () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const photos = [{ attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: '2026-07-02T12:00:00Z', safety: null }];
  mockedGenerate.mockResolvedValue(report({ photoCount: 1, photos }));
  const s = render(<ReportScreen />);
  fireEvent.press(await s.findByTestId('report-photos-choose'));
  fireEvent.press(await s.findByTestId(`photo-row-${A}`));
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, photoCount: 1, photos: null }));
  fireEvent.press(s.getByTestId('photo-leave-out-done'));
  await waitFor(() => expect(s.getByTestId('report-photos-choice-dropped')).toBeTruthy());
  expect(s.getByText('This version of the report sends every photo, including the ones you left out.')).toBeTruthy();
});

// CUL-1473: the Send bar says what the vet receives. The server embeds at most 40 photos, and a
// photo that fails its transform prints as a placeholder, so `photo_embedded` can be lower.
it('CUL-1473: v1 says both numbers when the server embedded fewer photos than were taken', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, photoCount: 57, photoEmbedded: 40, photos: null }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  expect(
    s.getByText('Includes 40 of 57 photos from logged incidents. The other 17 are noted in the report, without the pictures.'),
  ).toBeTruthy();
  expect(s.queryByText('Includes 57 photos from logged incidents.')).toBeNull();
});

it('CUL-1473: v1 keeps the one-number sentence when every photo is embedded', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, photoCount: 3, photoEmbedded: 3, photos: null }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  expect(s.getByText('Includes 3 photos from logged incidents.')).toBeTruthy();
});

it('CUL-1473: v2 adds the shortfall under the picker row, and nothing when all are embedded', async () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const photos = [
    { attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: '2026-07-02T12:00:00Z', safety: null },
    { attachmentId: B, eventId: 'e2', type: 'vomit', occurredAt: '2026-06-28T12:00:00Z', safety: null },
  ];
  mockedGenerate.mockResolvedValue(report({ photoCount: 2, photoEmbedded: 1, photos }));
  const s = render(<ReportScreen />);
  await s.findByTestId('report-photos-choose');
  expect(s.getByTestId('report-photos-shortfall')).toBeTruthy();
  expect(s.getByText('1 of 2 photos fit in the report. The other one is noted in the report, without the picture.')).toBeTruthy();
  s.unmount();

  mockedGenerate.mockResolvedValue(report({ photoCount: 2, photoEmbedded: 2, photos }));
  const t = render(<ReportScreen />);
  await t.findByTestId('report-photos-choose');
  expect(t.queryByTestId('report-photos-shortfall')).toBeNull();
});
