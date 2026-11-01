// The composer's state table (Vet report v2 PR-16, CUL-2296; spec §10.7), one fixture per row:
// loading, failed, a live flag, no flag, a short read, a window change (newest wins), no events in
// the window, a new account, two pets, the largest text size (AX5) and the VoiceOver order.
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';
type ReactTestInstance = ReturnType<typeof render>['UNSAFE_root'];
import { ReportComposer } from './ReportComposer';
import { useReportComposer } from '../../hooks/useReportComposer';
import type { ComposerOpen, ComposerWindowCounts, ComposerCounts } from '../../lib/reportComposer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockOpen = jest.fn<Promise<ComposerOpen>, [string]>();
const mockWindow = jest.fn<Promise<ComposerWindowCounts>, [string, string, string]>();
jest.mock('../../lib/reportComposerApi', () => ({
  fetchComposerOpen: (petId: string) => mockOpen(petId),
  fetchComposerWindow: (petId: string, s: string, e: string) => mockWindow(petId, s, e),
}));

const TODAY = '2026-10-31';

function counts(over: Partial<ComposerCounts> = {}): ComposerCounts {
  return {
    startDate: '2026-09-16',
    endDate: TODAY,
    windowDays: 46,
    loggedDays: 45,
    symptomEntries: 24,
    weighIns: 1,
    latestWeighIn: { lbs: 8.2, date: '2026-09-16' },
    lead: { sign: 'vomit', reason: 'flag' },
    loggedDayKeys: ['2026-09-16', '2026-09-17'],
    incomplete: false,
    // The window's own report prints both live flags unless a test says otherwise.
    flags: [
      { kind: 'present_foreign', sign: 'vomit', trigger: null },
      { kind: 'symptom_burden', sign: 'vomit', trigger: null },
    ],
    ...over,
  };
}

/** Nyx's record, the round 5 payload: live flags, three windows. */
function nyx(over: Partial<ComposerOpen> = {}): ComposerOpen {
  return {
    today: TODAY,
    petName: 'Nyx',
    live: {
      state: 'flags',
      startDate: '2026-09-06',
      endDate: TODAY,
      flags: [
        { kind: 'present_foreign', sign: 'vomit', trigger: null },
        { kind: 'symptom_burden', sign: 'vomit', trigger: null },
      ],
    },
    windows: [
      { kind: 'since_visit', startDate: '2026-09-16', endDate: TODAY, days: 46, isDefault: true },
      { kind: 'diet_trial', startDate: '2026-07-26', endDate: '2026-10-20', days: 87, isDefault: false },
      { kind: 'last_30', startDate: '2026-10-02', endDate: TODAY, days: 30, isDefault: false },
    ],
    counts: counts(),
    after: null,
    ...over,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The screen holds the composer's state (Back keeps the choice); this host does the same. */
function Host({ petName = 'Nyx', onPreview = jest.fn(), onFallback = jest.fn() }: {
  petName?: string;
  onPreview?: jest.Mock;
  onFallback?: jest.Mock;
}) {
  const state = useReportComposer('pet-1');
  return <ReportComposer petId="pet-1" petName={petName} state={state} onPreview={onPreview} onFallback={onFallback} />;
}

async function renderReady(open: ComposerOpen, petName = 'Nyx') {
  mockOpen.mockResolvedValueOnce(open);
  const onPreview = jest.fn();
  const utils = render(<Host petName={petName} onPreview={onPreview} />);
  await act(async () => {});
  return { ...utils, onPreview };
}

// The fixture's "today" is pinned, so the clock is too (C-29, the time axis): the composer reads
// again when the device's day is not the day its windows were offered on. Only Date is faked; the
// timers the animations and promises run on stay real. Local noon, so every zone the non-UTC CI
// job runs in agrees on the day.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 31, 12, 0, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
      'queueMicrotask', 'nextTick', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
      'cancelIdleCallback', 'hrtime', 'performance'],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  mockOpen.mockReset();
  mockWindow.mockReset();
});

describe('the composer state table', () => {
  it('loading: one skeleton, and no card and no window until the flags and counts are both in', () => {
    mockOpen.mockReturnValueOnce(new Promise(() => {}));
    const r = render(<Host />);
    // Hidden from assistive tech on purpose (a skeleton is not content), so the query includes it.
    expect(r.getByTestId('composer-loading', { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByTestId('composer-live-card')).toBeNull();
    expect(r.queryByTestId('composer-window-since_visit')).toBeNull();
  });

  it('failed: says nothing was checked, and Try again reads again', async () => {
    mockOpen.mockRejectedValueOnce(new Error('offline'));
    const r = render(<Host />);
    await act(async () => {});
    expect(r.getByTestId('composer-failed')).toBeTruthy();
    expect(r.getByText(/nothing was checked for flags yet/)).toBeTruthy();
    mockOpen.mockResolvedValueOnce(nyx());
    fireEvent.press(r.getByText('Try again'));
    await act(async () => {});
    expect(r.getByTestId('composer-live-card')).toBeTruthy();
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });

  it('a live flag: the card is in the first painted frame, above the question', async () => {
    const r = await renderReady(nyx());
    const card = r.getByTestId('composer-live-card');
    expect(within(card).getByText('Nyx’s record has flags worth a call to your vet')).toBeTruthy();
    // b1: the first window is selected and its counts sit in its row.
    expect(r.getByTestId('composer-window-since_visit').props.accessibilityState).toEqual({ checked: true });
    expect(r.getByTestId('composer-row-counts')).toHaveTextContent('24 symptom entries · 45 days logged');
    expect(r.getByText('45 of 46 days logged.')).toBeTruthy();
    expect(r.getByText('Leads the report: vomiting, because it’s flagged.')).toBeTruthy();
    expect(r.getByText('1 weigh-in · 8.2 lb on Sep 16')).toBeTruthy();
  });

  it('no flag: no card at all, and nothing that reads as an all clear', async () => {
    const r = await renderReady(nyx({ live: { state: 'none', startDate: '2026-09-06', endDate: TODAY, flags: [] } }));
    expect(r.queryByTestId('composer-live-card')).toBeNull();
    expect(r.queryByText(/all clear|no flags|nothing to worry/i)).toBeNull();
  });

  it('a short live read: the card says it could not check', async () => {
    const r = await renderReady(nyx({ live: { state: 'incomplete', startDate: '2026-09-06', endDate: TODAY, flags: [] } }));
    expect(within(r.getByTestId('composer-live-card')).getByText('Couldn’t check Nyx’s record for flags')).toBeTruthy();
  });

  it('a window change: the radio moves and the counts go to Skeleton in the same frame; the card never moves', async () => {
    const r = await renderReady(nyx());
    const cardBefore = r.getByTestId('composer-live-card');
    const pending = deferred<ComposerWindowCounts>();
    mockWindow.mockReturnValueOnce(pending.promise);
    fireEvent.press(r.getByTestId('composer-window-last_30'));
    // Same commit as the tap: no await between the press and these reads.
    expect(r.getByTestId('composer-window-last_30').props.accessibilityState).toEqual({ checked: true });
    expect(r.getByTestId('composer-window-since_visit').props.accessibilityState).toEqual({ checked: false });
    expect(r.getByTestId('composer-counting', { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByTestId('composer-summary')).toBeNull();
    expect(r.getByTestId('composer-preview').props.accessibilityState).toMatchObject({ disabled: true });
    expect(r.getByTestId('composer-live-card')).toBe(cardBefore);
    expect(mockWindow).toHaveBeenCalledWith('pet-1', '2026-10-02', TODAY);
    await act(async () => {
      pending.resolve({ counts: counts({ startDate: '2026-10-02', windowDays: 30, loggedDays: 30, symptomEntries: 12 }), after: null });
    });
    expect(r.getByText('All 30 days logged.')).toBeTruthy();
    expect(r.getByTestId('composer-live-card')).toBe(cardBefore);
    // The live flags were read once, at open; a window change never re-reads them.
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('newest request wins: an earlier answer landing late never paints', async () => {
    const r = await renderReady(nyx());
    const slow = deferred<ComposerWindowCounts>();
    const fast = deferred<ComposerWindowCounts>();
    mockWindow.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    fireEvent.press(r.getByTestId('composer-window-diet_trial'));
    fireEvent.press(r.getByTestId('composer-window-last_30'));
    await act(async () => {
      fast.resolve({ counts: counts({ startDate: '2026-10-02', windowDays: 30, loggedDays: 30, symptomEntries: 12 }), after: null });
    });
    await act(async () => {
      slow.resolve({ counts: counts({ startDate: '2026-07-26', endDate: '2026-10-20', windowDays: 87, loggedDays: 80, symptomEntries: 40 }), after: null });
    });
    expect(r.getByText('All 30 days logged.')).toBeTruthy();
    expect(r.queryByText('80 of 87 days logged.')).toBeNull();
  });

  it('a window that ends before today names what it leaves out, and that the flags still print', async () => {
    const r = await renderReady(nyx());
    mockWindow.mockResolvedValueOnce({
      counts: counts({ startDate: '2026-07-26', endDate: '2026-10-20', windowDays: 87, loggedDays: 80, symptomEntries: 40 }),
      after: {
        startDate: '2026-10-21', endDate: TODAY, symptomEntries: 8, mealsRefused: 2, incomplete: false,
        byType: [{ type: 'vomit', count: 6 }, { type: 'cough', count: 2 }],
      },
    });
    fireEvent.press(r.getByTestId('composer-window-diet_trial'));
    await act(async () => {});
    expect(r.getByTestId('composer-after')).toHaveTextContent(
      'Left out by these dates: 8 symptom entries (6 vomiting, 2 coughing), 2 refused meals after Oct 20, and everything else logged after it, up to today.',
    );
    // The window's own report prints both live flags here, so no warning.
    expect(r.queryByTestId('composer-dropped-flags')).toBeNull();
  });

  it('a failed window read says so beside the counts and offers Try again; the card stays', async () => {
    const r = await renderReady(nyx());
    mockWindow.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(r.getByTestId('composer-window-last_30'));
    await act(async () => {});
    expect(r.getByTestId('composer-counts-failed')).toBeTruthy();
    expect(r.getByTestId('composer-live-card')).toBeTruthy();
  });

  it('no events in the window: the warm note, never a result', async () => {
    const r = await renderReady(
      nyx({ live: { state: 'none', startDate: '2026-09-06', endDate: TODAY, flags: [] }, counts: counts({ symptomEntries: 0, lead: null }) }),
      'Olive',
    );
    expect(r.getByTestId('composer-note-empty')).toHaveTextContent(/can’t rule anything out/);
  });

  it('a new account: "Since the first entry" is the window, and the short-record note shows', async () => {
    const r = await renderReady(
      nyx({
        live: { state: 'none', startDate: '2026-09-06', endDate: TODAY, flags: [] },
        windows: [{ kind: 'since_first', startDate: '2026-10-28', endDate: TODAY, days: 4, isDefault: false }],
        counts: counts({ startDate: '2026-10-28', windowDays: 4, loggedDays: 4, symptomEntries: 2 }),
      }),
      'Juniper',
    );
    expect(r.getByTestId('composer-window-since_first').props.accessibilityState).toEqual({ checked: true });
    expect(r.getByTestId('composer-note-thin')).toHaveTextContent(/^A short record\./);
  });

  it('two pets: every line names the record’s pet it was handed (C-9)', async () => {
    const r = await renderReady(nyx(), 'Cooper');
    expect(r.getByText('Cooper’s record has flags worth a call to your vet')).toBeTruthy();
    expect(r.queryByText(/Nyx/)).toBeNull();
  });

  it('Preview hands over the window on screen', async () => {
    const r = await renderReady(nyx());
    fireEvent.press(r.getByTestId('composer-preview'));
    expect(r.onPreview).toHaveBeenCalledWith(nyx().windows[0]);
  });

  it('dates that drop a live flag from their report say so in words, and the card stays (F1, F2)', async () => {
    const r = await renderReady(nyx());
    mockWindow.mockResolvedValueOnce({
      counts: counts({ startDate: '2026-10-25', windowDays: 7, loggedDays: 7, symptomEntries: 6, flags: [{ kind: 'present_foreign', sign: 'vomit', trigger: null }] }),
      after: null,
    });
    fireEvent.press(r.getByTestId('composer-window-last_30'));
    await act(async () => {});
    expect(r.getByTestId('composer-dropped-flags')).toHaveTextContent(
      'The report for these dates won’t show the flag for a lot of vomiting this week. Tell your vet, or choose dates that cover more of the last 56 days.',
    );
    expect(r.getByTestId('composer-live-card')).toBeTruthy();
  });

  it('a window whose printed flags the server did not report reads as unconfirmed, never as all printed', async () => {
    const r = await renderReady(nyx({ counts: counts({ flags: null }) }));
    expect(r.getByTestId('composer-dropped-flags')).toHaveTextContent(/^Couldn’t confirm the report for these dates shows the flags above/);
  });

  it('a failed first read offers the usual report as a way through', async () => {
    mockOpen.mockRejectedValueOnce(new Error('down'));
    const onFallback = jest.fn();
    const r = render(<Host onFallback={onFallback} />);
    await act(async () => {});
    fireEvent.press(r.getByTestId('composer-fallback'));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('a composer left open past midnight reads again instead of previewing yesterday’s window (F5)', async () => {
    const r = await renderReady(nyx({ today: '2026-10-30' }));
    mockOpen.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.press(r.getByTestId('composer-preview'));
    expect(r.onPreview).not.toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });

  it('AX5 (the largest text size): nothing truncates, the body scrolls, Preview stays outside the scroll', async () => {
    const r = await renderReady(nyx());
    // At AX5 the card and three windows outgrow an 844pt screen; nothing may be cut to fit.
    const texts = r.UNSAFE_queryAllByType(Text);
    expect(texts.length).toBeGreaterThan(10);
    expect(texts.filter((t) => t.props.numberOfLines !== undefined)).toHaveLength(0);
    const scroll = r.UNSAFE_getByType(ScrollView);
    expect(within(scroll).getByTestId('composer-live-card')).toBeTruthy();
    expect(within(scroll).queryByTestId('composer-preview')).toBeNull();
    expect(r.getByTestId('composer-preview')).toBeTruthy();
    // Every tappable row keeps its floor whatever the text size: the box grows, never shrinks.
    for (const id of ['composer-window-since_visit', 'composer-window-diet_trial', 'composer-window-last_30']) {
      const style = [r.getByTestId(id).props.style].flat(3).reduce((a, s) => ({ ...a, ...(s ?? {}) }), {});
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('VoiceOver order: the card is read first, then the question, then the windows', async () => {
    const r = await renderReady(nyx());
    const order = ['composer-live-card', 'composer-window-since_visit', 'composer-covers'];
    const all = r.UNSAFE_root.findAll(
      (n: ReactTestInstance) => typeof n.props.testID === 'string' && order.includes(n.props.testID) && typeof n.type === 'string',
    );
    const ids = all
      .map((n: ReactTestInstance) => n.props.testID as string)
      .filter((id: string, i: number, a: string[]) => a.indexOf(id) === i);
    expect(ids).toEqual(order);
    expect(r.getByTestId('composer-live-card').props.accessibilityLabel).toMatch(/^Nyx’s record has flags/);
  });
});
