// The coverage door (D2-4 / CUL-1066): speaks coverage, opens Patterns, keeps nothing
// tappable at the row's right edge under the FAB (C-5).

const mockFocusListeners: (() => void)[] = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useNavigation: () => ({
    addListener: (_e: string, cb: () => void) => {
      mockFocusListeners.push(cb);
      return () => mockFocusListeners.splice(mockFocusListeners.indexOf(cb), 1);
    },
  }),
}));
// `lib/monthCoverage` now reads the event category (`lib/dayEvents`), whose closure
// reaches `lib/supabase`; stubbed at the boundary as every sibling suite does.
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const mockReadMonth = jest.fn();
const mockReadRecordStart = jest.fn();
jest.mock('../../../lib/spineReads', () => ({
  readMonthRows: (...a: unknown[]) => mockReadMonth(...a),
  readRecordStart: (...a: unknown[]) => mockReadRecordStart(...a),
}));
jest.mock('../../../store/petStore', () => ({
  usePetStore: (sel: (s: { activePet: { id: string } }) => unknown) => sel({ activePet: { id: 'p1' } }),
}));
jest.mock('../../../store/syncStore', () => ({
  useSyncStore: (sel: (s: { hydrationTick: number }) => unknown) => sel({ hydrationTick: 0 }),
}));
jest.mock('../../../store/eventStore', () => ({
  useEventStore: (sel: (s: { todayEvents: unknown[] }) => unknown) => sel({ todayEvents: [] }),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { CoverageDoor, COVERAGE_DOOR_LABEL } from './CoverageDoor';

function local(day: number, hour: number, eventType = 'meal'): { occurredAt: string; eventType: string } {
  const now = new Date();
  return { occurredAt: new Date(now.getFullYear(), now.getMonth(), day, hour).toISOString(), eventType };
}
/** A record older than the month: the window opens on the 1st. */
const OLD_RECORD = new Date(2020, 0, 1, 9).toISOString();

beforeEach(() => {
  mockReadMonth.mockReset();
  mockReadRecordStart.mockReset();
  mockReadRecordStart.mockResolvedValue(OLD_RECORD);
  (router.push as jest.Mock).mockReset();
});

// The day of the month decides which line is honest (the 1st has no finished day), so
// each case states the line it expects for BOTH shapes of today rather than skipping one.
const today = new Date().getDate();
const finished = today - 1; // days in the window over an old record

describe('CoverageDoor', () => {
  it('speaks the month’s coverage through YESTERDAY once the record has answered, and opens Patterns', async () => {
    // Two rows on the 1st and one today: today is in neither number (CUL-1221).
    mockReadMonth.mockResolvedValue([local(1, 9), local(1, 21), local(today, 8)]);
    const t = render(<CoverageDoor />);
    // Before the read answers: the door, with no number (C-12).
    expect(t.getByText(COVERAGE_DOOR_LABEL)).toBeTruthy();
    const expected =
      today === 1
        ? 'the month starts today'
        : `logged 1 of ${finished} ${finished === 1 ? 'day' : 'days'}`;
    await waitFor(() => expect(t.getByText(new RegExp(expected))).toBeTruthy());
    expect(mockReadRecordStart).toHaveBeenCalledWith('p1');
    fireEvent.press(t.getByTestId('coverage-door'));
    expect(router.push).toHaveBeenCalledWith('/insights');
  });

  it('a pet whose record starts today is told so — never "logged 1 of N" (BRK-22)', async () => {
    mockReadRecordStart.mockResolvedValue(local(today, 8).occurredAt);
    mockReadMonth.mockResolvedValue([local(today, 8)]);
    const t = render(<CoverageDoor />);
    await waitFor(() => expect(t.getByText(/the record starts today/)).toBeTruthy());
    expect(t.queryByText(/logged/)).toBeNull();
  });

  it('an empty record gets the month’s invitation, never a ratio', async () => {
    mockReadRecordStart.mockResolvedValue(null);
    mockReadMonth.mockResolvedValue([]);
    const t = render(<CoverageDoor />);
    await waitFor(() => expect(t.getByText(/the month fills in from the first entry/)).toBeTruthy());
    expect(t.queryByText(/logged/)).toBeNull();
  });

  it('the row hugs its content on the left — nothing sits at the right edge under the FAB (C-5)', async () => {
    mockReadMonth.mockResolvedValue([]);
    const t = render(<CoverageDoor />);
    await waitFor(() => expect(t.getByText(/September|January|February|March|April|May|June|July|August|October|November|December/)).toBeTruthy());
    const row = t.getByTestId('coverage-door-row');
    const style = StyleSheet.flatten(row.props.style) as { alignSelf?: string; flexDirection?: string };
    expect(style.alignSelf).toBe('flex-start');
    expect(style.flexDirection).toBe('row');
  });

  it('a month of looks alone is a month with nothing logged (floor 5)', async () => {
    mockReadMonth.mockResolvedValue([local(1, 8, 'check_in'), local(Math.max(1, finished), 8, 'check_in')]);
    const t = render(<CoverageDoor />);
    // On the 1st there is no finished day for a look to be counted in at all.
    const expected = today === 1 ? 'the month starts today' : `logged 0 of ${finished} day`;
    await waitFor(() => expect(t.getByText(new RegExp(expected))).toBeTruthy());
  });

  it('is one control with one label that carries the line', async () => {
    mockReadMonth.mockResolvedValue([local(today, 8)]);
    const t = render(<CoverageDoor />);
    await waitFor(() =>
      expect(t.getByTestId('coverage-door').props.accessibilityLabel).toMatch(/ · .+\. Open Patterns$/),
    );
    expect(t.getAllByRole('button')).toHaveLength(1);
  });

  it('re-reads the record when Home regains focus — an edit elsewhere can move where it starts', async () => {
    // The only event, today: the record starts today…
    mockReadRecordStart.mockResolvedValue(local(today, 8).occurredAt);
    mockReadMonth.mockResolvedValue([local(today, 8)]);
    const t = render(<CoverageDoor />);
    await waitFor(() => expect(t.getByText(/the record starts today/)).toBeTruthy());
    // …then, on another screen, it is re-timed to an older record start. Nothing Home
    // watches changed; focus is the only signal.
    mockReadRecordStart.mockResolvedValue(OLD_RECORD);
    const calls = mockReadRecordStart.mock.calls.length;
    act(() => mockFocusListeners.forEach((cb) => cb()));
    await waitFor(() => expect(mockReadRecordStart.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(t.queryByText(/the record starts today/)).toBeNull());
  });
});

