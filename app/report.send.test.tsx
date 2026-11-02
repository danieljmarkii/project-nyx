// The send flow on the report screen (Vet report v2 PR-18, CUL-2298; spec §10.3 to §10.5).
//
// The sheet's own behaviour is pinned in components/reportV2/SendSheet.test.tsx; here it is a
// probe, so what is under test is the screen: the live-flag read completes BEFORE the sheet is
// asked to present, a failed read hands it the louder "couldn't check" card, the native result
// picks the confirmation's words, and a flagged send's confirmation shows no check and repeats
// the call card. Off the composer path, "Send to vet" still shares at once.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('../components/surfaces/waits/ReportSilhouette', () => ({ ReportSilhouette: () => null }));
jest.mock('../components/surfaces/waits/ReportFrontSilhouette', () => ({ ReportFrontSilhouette: () => null }));
jest.mock('../components/surfaces/waits/Tick', () => ({ Tick: () => null }));
jest.mock('../store/petStore', () => {
  const pet = { id: 'p1', name: 'Nyx' };
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
jest.mock('../lib/vetVisits', () => ({ readHomeAppointment: jest.fn(async () => null) }));
jest.mock('../lib/reportComposerApi', () => ({ fetchComposerOpen: jest.fn(), fetchComposerWindow: jest.fn() }));
jest.mock('../lib/reportSendActions', () => ({
  mailAvailable: jest.fn(async () => true),
  emailReport: jest.fn(async () => 'sent'),
  printReport: jest.fn(async () => 'done'),
  shareReport: jest.fn(async () => 'done'),
  copyEmailText: jest.fn(async () => 'done'),
}));
let mockEligible = true;
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockEligible }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => true }));
let mockComposerOpen: unknown = null;
jest.mock('../hooks/useReportComposer', () => ({
  useReportComposer: () => ({ screen: 'ready', open: mockComposerOpen, selected: null, counts: null, after: null, countsState: 'ready', landed: 0 }),
}));
jest.mock('../components/report/ReportComposer', () => {
  const { Pressable, View } = require('react-native');
  const React = require('react');
  return {
    ReportComposer: (p: { onFallback: () => void }) =>
      React.createElement(View, null, React.createElement(Pressable, { testID: 'fallback', onPress: () => p.onFallback() })),
  };
});
jest.mock('../components/reportV2/ReportPreviewV2', () => ({ ReportPreviewV2: () => null }));
// The sheet as a probe: it exposes what the screen handed it and lets a test choose a target.
jest.mock('../components/reportV2/SendSheet', () => {
  const { Pressable, Text, View } = require('react-native');
  const React = require('react');
  return {
    SendSheet: (p: {
      visible: boolean;
      card: { title: string } | null;
      onAction: (a: unknown) => void;
      onClose: () => void;
    }) =>
      p.visible
        ? React.createElement(
            View,
            { testID: 'sheet' },
            React.createElement(Text, { testID: 'sheet-card' }, p.card ? p.card.title : 'no card'),
            React.createElement(Pressable, { testID: 'pick-share', onPress: () => { p.onClose(); p.onAction({ target: 'share' }); } }),
            React.createElement(Pressable, {
              testID: 'pick-email',
              onPress: () => { p.onClose(); p.onAction({ target: 'email', subject: 's', body: 'b', documentUris: [] }); },
            }),
          )
        : null,
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { generateVetReport, shareReportPdf, type VetReport } from '../lib/pdf';
import { fetchComposerOpen } from '../lib/reportComposerApi';
import { emailReport, shareReport } from '../lib/reportSendActions';
import ReportScreen from './report';

const mockedGenerate = generateVetReport as jest.Mock;
const mockedOpen = fetchComposerOpen as jest.Mock;
const report: VetReport = {
  html: '<html>Nyx</html>',
  phoneHtml: null,
  petName: 'Nyx',
  startDate: '2026-09-16',
  endDate: '2026-10-31',
  scopeBasis: 'since_visit',
  photoCount: 0,
  trialAllowedListMissing: false,
  reportVersion: 'v2',
  ownerSurname: 'Reyes',
};
const FLAGGED = { state: 'flags', startDate: '2026-09-06', endDate: '2026-10-31', flags: [{ kind: 'present_foreign', sign: 'vomit', trigger: null }] };
const QUIET = { state: 'none', startDate: '2026-09-06', endDate: '2026-10-31', flags: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockEligible = true;
  mockComposerOpen = null;
  mockedGenerate.mockResolvedValue(report);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

async function toReport() {
  const r = render(<ReportScreen />);
  fireEvent.press(await r.findByTestId('fallback'));
  await r.findByText('Send…');
  return r;
}

describe('Send reads the live flags before the sheet presents (GAP-13)', () => {
  it('the sheet is not asked up until the read answers, and the card is in its first frame', async () => {
    let answer: (v: unknown) => void = () => undefined;
    mockedOpen.mockReturnValue(new Promise((res) => { answer = res; }));
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    expect(mockedOpen).toHaveBeenCalledWith('p1');
    expect(r.queryByTestId('sheet')).toBeNull();
    await act(async () => answer({ live: FLAGGED }));
    expect(r.getByTestId('sheet-card').props.children).toMatch(/flag worth a call/);
  });

  it('a failed read hands the sheet the couldn’t-check card, never no card', async () => {
    mockedOpen.mockRejectedValue(new Error('offline'));
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-card').props.children).toMatch(/Couldn’t check/);
  });
});

describe('a failed send-time read never downgrades a flag the composer already showed (adversarial pass)', () => {
  it('the sheet keeps the known flag and its call rows, and the confirmation shows no check', async () => {
    mockComposerOpen = { live: FLAGGED };
    mockedOpen.mockRejectedValue(new Error('offline'));
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-card').props.children).toMatch(/flag worth a call/);
    fireEvent.press(r.getByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
    expect(r.getByTestId('send-confirmation-call-card-row-clinic')).toBeTruthy();
  });
});

describe('the confirmation (e1, e2)', () => {
  it('a flagged send: the status words, no check, and the call card repeated above Done', async () => {
    mockedOpen.mockResolvedValue({ live: FLAGGED });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(shareReport).toHaveBeenCalledWith(report);
    expect(r.getByTestId('send-confirmation-line').props.children).toBe('Sep 16 to Oct 31 · shared');
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
    expect(r.getByTestId('send-confirmation-call-card')).toBeTruthy();
  });

  it('an unchecked read is treated as flagged: no check', async () => {
    mockedOpen.mockRejectedValue(new Error('offline'));
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });

  it('a quiet send: the check writes itself, and no call card', async () => {
    mockedOpen.mockResolvedValue({ live: QUIET });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(r.getByTestId('send-confirmation-check')).toBeTruthy();
    expect(r.queryByTestId('send-confirmation-call-card')).toBeNull();
  });

  it('only an iOS Mail "sent" reads "sent from your Mail app"', async () => {
    mockedOpen.mockResolvedValue({ live: QUIET });
    const os = Platform.OS;
    Platform.OS = 'ios';
    try {
      const r = await toReport();
      fireEvent.press(r.getByTestId('report-send'));
      fireEvent.press(await r.findByTestId('pick-email'));
      await r.findByTestId('send-confirmation');
      expect(r.getByTestId('send-confirmation-line').props.children).toBe('Sep 16 to Oct 31 · sent from your Mail app');
    } finally {
      Platform.OS = os;
    }
  });

  it('a cancelled draft makes no card', async () => {
    mockedOpen.mockResolvedValue({ live: QUIET });
    (emailReport as jest.Mock).mockResolvedValueOnce('cancelled');
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-email'));
    await waitFor(() => expect(emailReport).toHaveBeenCalled());
    expect(r.queryByTestId('send-confirmation')).toBeNull();
  });
});

describe('off the composer path, nothing changed', () => {
  it('"Send to vet" shares at once, with no flag read and no sheet', async () => {
    mockEligible = false;
    const r = render(<ReportScreen />);
    fireEvent.press(await r.findByText('Send to vet'));
    await waitFor(() => expect(shareReportPdf).toHaveBeenCalledWith(report));
    expect(mockedOpen).not.toHaveBeenCalled();
    expect(r.queryByTestId('sheet')).toBeNull();
  });
});
