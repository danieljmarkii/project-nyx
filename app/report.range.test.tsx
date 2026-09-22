// CUL-371 (B-237) — the custom window settles before the report regenerates.
//
// A GUARD, run red against the pre-fix screen: there, From-then-To fired two builds
// and this suite's final count is one too many. The Default → Custom case is the
// refactor-safety half (green before and after): switching mode is a new report and
// still regenerates at once, so the settle timer cannot make the chip feel dead.
//
// The picker is mocked as a button that hands the screen's `onChange` a date the test
// chose, because the real picker has no JS implementation under jest; the timer, the
// regenerate effect and the predicate are the real ones. Real timers on purpose — a
// fake clock under `waitFor` advances itself, which would fire the very timer under
// test in the middle of an assertion about it not having fired yet.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
let mockPickedDate = new Date(2026, 5, 1);
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = require('react-native');
  const React = require('react');
  return (props: { onChange: (e: unknown, d: Date) => void }) =>
    React.createElement(Pressable, {
      testID: 'picker',
      onPress: () => props.onChange({}, mockPickedDate),
    });
});
jest.mock('../components/brand/NightMoment', () => ({ NightMoment: () => null }));
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
jest.mock('../components/designV2/waits/ReportSilhouette', () => ({ ReportSilhouette: () => null }));
jest.mock('../components/designV2/waits/Tick', () => ({ Tick: () => null }));
jest.mock('../hooks/useDesignV2', () => ({ useDesignV2: () => false }));
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
jest.mock('../store/petStore', () => {
  const state = { activePet: { id: 'p1', name: 'Mochi' } };
  return {
    usePetStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('../lib/pdf', () => ({
  flushBeforeReport: jest.fn(async () => ({ pending: 0, quarantined: 0 })),
  reportFreshnessLine: () => null,
  generateVetReport: jest.fn(),
  shareReportPdf: jest.fn(async () => true),
}));
jest.mock('../lib/vetDocumentLibrary', () => ({ readVetLibrary: jest.fn(async () => []) }));
jest.mock('../lib/vetFilesEntry', () => ({ VET_FILES_ENTRY_ENABLED: false }));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { generateVetReport, type VetReport } from '../lib/pdf';
import { CUSTOM_RANGE_SETTLE_MS } from '../lib/reportRange';
import ReportScreen from './report';

const mockedGenerate = generateVetReport as jest.Mock;

const report: VetReport = {
  html: '<html>Mochi</html>',
  petName: 'Mochi',
  startDate: '2026-06-22',
  endDate: '2026-07-02',
  scopeBasis: 'diet_trial',
  photoCount: 0,
  trialAllowedListMissing: false,
};

const settle = () => new Promise<void>((r) => setTimeout(r, CUSTOM_RANGE_SETTLE_MS + 100));

beforeEach(() => {
  jest.clearAllMocks();
  mockedGenerate.mockResolvedValue(report);
});

describe('the custom window settles before the report regenerates (CUL-371)', () => {
  it('Default → Custom regenerates at once — a new report, not an edit', async () => {
    const { findByText } = render(<ReportScreen />);
    await findByText('Send to vet');
    expect(mockedGenerate).toHaveBeenCalledTimes(1);

    fireEvent.press(await findByText('Custom…'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(2));
    expect(mockedGenerate.mock.calls[1][0]).toMatchObject({ petId: 'p1', startDate: expect.any(String) });
  });

  it('From then To inside Custom is ONE build, carrying the window both taps made', async () => {
    const { findByText, findByLabelText, findByTestId } = render(<ReportScreen />);
    await findByText('Send to vet');
    fireEvent.press(await findByText('Custom…'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(2));

    // From: open the start picker, pick a day.
    mockPickedDate = new Date(2026, 5, 1);
    fireEvent.press(await findByLabelText(/^Start date,/));
    fireEvent.press(await findByTestId('picker'));
    fireEvent.press(await findByLabelText('Done choosing dates'));
    // To: open the end picker, pick a day — inside the settle window.
    mockPickedDate = new Date(2026, 5, 20);
    fireEvent.press(await findByLabelText(/^End date,/));
    fireEvent.press(await findByTestId('picker'));

    // Neither tap has built yet.
    expect(mockedGenerate).toHaveBeenCalledTimes(2);

    await settle();
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(3));
    expect(mockedGenerate.mock.calls[2][0]).toMatchObject({
      petId: 'p1',
      startDate: '2026-06-01',
      endDate: '2026-06-20',
    });
  });

  it('a lone edit still lands — the settle is a wait, not a gate', async () => {
    const { findByText, findByLabelText, findByTestId } = render(<ReportScreen />);
    await findByText('Send to vet');
    fireEvent.press(await findByText('Custom…'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(2));

    mockPickedDate = new Date(2026, 5, 3);
    fireEvent.press(await findByLabelText(/^Start date,/));
    fireEvent.press(await findByTestId('picker'));

    await settle();
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalledTimes(3));
    expect(mockedGenerate.mock.calls[2][0]).toMatchObject({ startDate: '2026-06-03' });
  });
});
