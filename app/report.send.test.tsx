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
  flushBeforeSend: jest.fn(async () => ({ pending: 0, quarantined: 0 })),
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
      canShowOnPhone?: boolean;
    }) =>
      p.visible
        ? React.createElement(
            View,
            { testID: 'sheet' },
            React.createElement(Text, { testID: 'sheet-card' }, p.card ? p.card.title : 'no card'),
            React.createElement(Text, { testID: 'sheet-phone' }, p.canShowOnPhone ? 'phone' : 'no phone'),
            React.createElement(Pressable, { testID: 'pick-phone', onPress: () => { p.onClose(); p.onAction({ target: 'phone' }); } }),
            React.createElement(Pressable, { testID: 'pick-share', onPress: () => { p.onClose(); p.onAction({ target: 'share' }); } }),
            React.createElement(Pressable, {
              testID: 'pick-email',
              onPress: () => { p.onClose(); p.onAction({ target: 'email', subject: 's', body: 'b', documentUris: [] }); },
            }),
          )
        : null,
  };
});

const mockOpenExamRoom = jest.fn((_copy: unknown, push: (r: string) => void) => {
  push('/exam-room');
  return true;
});
jest.mock('../lib/examRoomCopy', () => ({ openExamRoom: (c: unknown, p: (r: string) => void) => mockOpenExamRoom(c, p) }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { flushBeforeSend, generateVetReport, shareReportPdf, type VetReport } from '../lib/pdf';
import { fetchComposerOpen } from '../lib/reportComposerApi';
import { SEND_READ_TIMEOUT_MS } from '../lib/reportComposer';
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
  // A v1 document on the send flow (the composer on, the v2 layout off): a v2 one without its
  // phone layout is refused before it can render (CUL-2458), so the fixture is never that shape.
  reportVersion: 'v1',
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
    // The flag read starts once the send's flush has answered (CUL-2457).
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledWith('p1'));
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

describe('the send read is bounded, and a partial read says so (CUL-2425)', () => {
  const BLOOD = { kind: 'present_blood', sign: 'stool', trigger: null };

  it('a hung read opens the sheet at the bound with the couldn’t-check card, never no card', async () => {
    jest.useFakeTimers();
    try {
      mockedOpen.mockReturnValue(new Promise(() => undefined));
      const r = await toReport();
      fireEvent.press(r.getByTestId('report-send'));
      expect(r.queryByTestId('sheet')).toBeNull();
      await act(async () => undefined); // the flush answers; the flag read's bound starts
      await act(async () => { jest.advanceTimersByTime(SEND_READ_TIMEOUT_MS); });
      expect(r.getByTestId('sheet-card').props.children).toMatch(/Couldn’t check/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a hung read after a flag this session keeps the flag, and the confirmation shows no check', async () => {
    jest.useFakeTimers();
    try {
      mockComposerOpen = { live: FLAGGED };
      mockedOpen.mockReturnValue(new Promise(() => undefined));
      const r = await toReport();
      fireEvent.press(r.getByTestId('report-send'));
      await act(async () => undefined); // the flush answers; the flag read's bound starts
      await act(async () => { jest.advanceTimersByTime(SEND_READ_TIMEOUT_MS); });
      expect(r.getByTestId('sheet-card').props.children).toMatch(/flag worth a call/);
      fireEvent.press(r.getByTestId('pick-share'));
      await act(async () => { jest.advanceTimersByTime(0); });
      expect(r.getByTestId('send-confirmation')).toBeTruthy();
      expect(r.queryByTestId('send-confirmation-check')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a read that answers after a pet switch presents nothing over the other pet', async () => {
    const { usePetStore } = jest.requireMock('../store/petStore') as {
      usePetStore: { getState: () => { activePet: { id: string; name: string }; pets: Array<{ id: string; name: string }> } };
    };
    const st = usePetStore.getState();
    const before = { activePet: st.activePet, pets: st.pets };
    let answer: (v: unknown) => void = () => undefined;
    mockedOpen.mockReturnValue(new Promise((res) => { answer = res; }));
    try {
      const r = await toReport();
      fireEvent.press(r.getByTestId('report-send'));
      const other = { id: 'p2', name: 'Mochi' };
      st.activePet = other;
      st.pets = [...before.pets, other];
      r.rerender(<ReportScreen />);
      await act(async () => answer({ live: QUIET }));
      expect(r.queryByTestId('sheet')).toBeNull();
    } finally {
      st.activePet = before.activePet;
      st.pets = before.pets;
    }
  });

  it('a partial read with fewer flags than the screen knew keeps them all, and shows no check', async () => {
    mockComposerOpen = { live: { ...FLAGGED, flags: [...FLAGGED.flags, BLOOD], partial: false } };
    mockedOpen.mockResolvedValue({ live: { ...FLAGGED, partial: true } });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-card').props.children).toMatch(/has flags worth a call/);
    fireEvent.press(r.getByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });
});

describe('the known flags survive the composer’s reload (adversarial pass 2)', () => {
  it('a reload clears the composer’s flags, the send read fails: the sheet still carries the flag', async () => {
    mockComposerOpen = { live: FLAGGED };
    mockedOpen.mockRejectedValue(new Error('offline'));
    const r = render(<ReportScreen />);
    fireEvent.press(await r.findByTestId('fallback'));
    await r.findByText('Send…');
    // The past-midnight guard reloads the composer, which clears `open` before it re-reads.
    mockComposerOpen = null;
    r.rerender(<ReportScreen />);
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-card').props.children).toMatch(/flag worth a call/);
  });

  it('a fresh none after a flag this session withholds the check (the louder side)', async () => {
    mockComposerOpen = { live: FLAGGED };
    mockedOpen.mockResolvedValue({ live: QUIET });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
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

describe('the check never shows over an entry still on this phone (CUL-2457)', () => {
  const mockedFlush = flushBeforeSend as jest.Mock;

  async function sendQuietly() {
    mockedOpen.mockResolvedValue({ live: QUIET });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-share'));
    await r.findByTestId('send-confirmation');
    return r;
  }

  it('the flush runs before the flag read, so the read can see what it just landed', async () => {
    const order: string[] = [];
    mockedFlush.mockImplementationOnce(async () => { order.push('flush'); return { pending: 0, quarantined: 0 }; });
    mockedOpen.mockImplementationOnce(async () => { order.push('read'); return { live: QUIET }; });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(order).toEqual(['flush', 'read']);
  });

  it('a server "none" with an entry the flush could not send: no check', async () => {
    mockedFlush.mockResolvedValueOnce({ pending: 1, quarantined: 0 });
    const r = await sendQuietly();
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });

  it('a server "none" with an entry the queue refused: no check', async () => {
    mockedFlush.mockResolvedValueOnce({ pending: 0, quarantined: 1 });
    const r = await sendQuietly();
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });

  it('an unsent count that could not be read is unknown, and unknown earns no check', async () => {
    mockedFlush.mockResolvedValueOnce(null);
    const r = await sendQuietly();
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });

  it('a flush that fails outright earns no check', async () => {
    mockedFlush.mockRejectedValueOnce(new Error('db'));
    const r = await sendQuietly();
    expect(r.queryByTestId('send-confirmation-check')).toBeNull();
  });

  it('a flush that hangs opens the sheet at the bound, and the confirmation shows no check', async () => {
    jest.useFakeTimers();
    try {
      mockedFlush.mockReturnValueOnce(new Promise(() => undefined));
      mockedOpen.mockResolvedValue({ live: QUIET });
      const r = await toReport();
      fireEvent.press(r.getByTestId('report-send'));
      await act(async () => { jest.advanceTimersByTime(SEND_READ_TIMEOUT_MS); });
      await act(async () => undefined);
      fireEvent.press(r.getByTestId('pick-share'));
      await act(async () => undefined);
      expect(r.getByTestId('send-confirmation')).toBeTruthy();
      expect(r.queryByTestId('send-confirmation-check')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('everything sent and a server "none": the check shows (the one quiet case)', async () => {
    mockedFlush.mockResolvedValueOnce({ pending: 0, quarantined: 0 });
    const r = await sendQuietly();
    expect(r.getByTestId('send-confirmation-check')).toBeTruthy();
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

describe('Show on this phone opens the exam room (CUL-2299)', () => {
  const v2: VetReport = { ...report, reportVersion: 'v2', phoneHtml: '<html>Nyx phone</html>' };

  it('is offered only when the report has its phone layout', async () => {
    mockedOpen.mockResolvedValue({ live: QUIET });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-phone').props.children).toBe('no phone');
  });

  it('stages the phone layout and opens the room over the report; no confirmation, it is not a send', async () => {
    mockedGenerate.mockResolvedValue(v2);
    mockedOpen.mockResolvedValue({ live: FLAGGED });
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    await r.findByTestId('sheet');
    expect(r.getByTestId('sheet-phone').props.children).toBe('phone');
    fireEvent.press(r.getByTestId('pick-phone'));
    await waitFor(() => expect(mockOpenExamRoom).toHaveBeenCalledTimes(1));
    expect(mockOpenExamRoom.mock.calls[0][0]).toEqual({ phoneHtml: '<html>Nyx phone</html>', printHtml: '<html>Nyx</html>' });
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
    expect(router.push).toHaveBeenCalledWith('/exam-room');
    expect(r.queryByTestId('send-confirmation')).toBeNull();
  });

  it('says so when the copy could not be staged, and never opens an empty room', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    mockedGenerate.mockResolvedValue(v2);
    mockedOpen.mockResolvedValue({ live: QUIET });
    mockOpenExamRoom.mockImplementationOnce(() => false);
    const r = await toReport();
    fireEvent.press(r.getByTestId('report-send'));
    fireEvent.press(await r.findByTestId('pick-phone'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Couldn’t show the report here', 'Please try again.'));
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
    expect(router.push).not.toHaveBeenCalledWith('/exam-room');
  });
});
