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
import { EXAM_CSP, REPORT_WEBVIEW_ORIGINS } from '../lib/examRoom';
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
// meta refresh loaded https in the frame. Boxed now like every report frame.
it('the v1 frame is boxed: every URL reaches the load check, which refuses all but the document; no window; CSP', async () => {
  mockedGenerate.mockResolvedValue(report({ reportVersion: 'v1', phoneHtml: null, html: '<html><head></head><body>v1</body></html>' }));
  const s = render(<ReportScreen />);
  await s.findByText('Send to vet');
  const web = s.getByTestId(V1_PREVIEW_TEST_ID, hidden);
  const p = web.props as {
    originWhitelist: string[];
    javaScriptEnabled: boolean;
    source: { html: string };
    onShouldStartLoadWithRequest: (r: { url: string }) => boolean;
    onOpenWindow?: unknown;
  };
  expect(p.originWhitelist).toEqual(REPORT_WEBVIEW_ORIGINS);
  expect(p.javaScriptEnabled).toBe(false);
  expect(p.source.html).toBe(boxedV1Html('<html><head></head><body>v1</body></html>'));
  expect(p.source.html.indexOf('Content-Security-Policy')).toBeLessThan(p.source.html.indexOf('<body>'));
  expect(p.source.html).toContain(`content="${EXAM_CSP}"`);
  expect(typeof p.onOpenWindow).toBe('function');
  expect(p.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
  for (const url of ['https://evil.example/?d=record', 'http://x.test', 'nyx://report', 'mailto:a@b.c', 'javascript:alert(1)']) {
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

it('boxedV1Html: the policy lands in a real head, never in a <header>, and without a head after the doctype', () => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${EXAM_CSP}">`;
  expect(boxedV1Html('<html><head><title>t</title></head><body/></html>')).toBe(`<html><head>${meta}<title>t</title></head><body/></html>`);
  expect(boxedV1Html('<!DOCTYPE html><body><header>h</header></body>')).toBe(`<!DOCTYPE html>${meta}<body><header>h</header></body>`);
  expect(boxedV1Html('<body>x</body>')).toBe(`${meta}<body>x</body>`);
});
