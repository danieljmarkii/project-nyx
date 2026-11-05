import { act, render, screen } from '@testing-library/react-native';
import { SyncBanner, msUntilPendingLineDue, syncBannerText } from './SyncBanner';
import { useSyncStore } from '../../store/syncStore';
import { useAppActive } from '../../hooks/useAppActive';

jest.mock('../../hooks/useAppActive', () => ({ useAppActive: jest.fn(() => true) }));

// The banner is the ONLY place the app tells an owner their record has not left
// the phone, so what it says — and when it stays quiet — is the whole surface of
// B-398 from the owner's side. Tested through the pure decision function so both
// states are reachable without a renderer or a fake clock.

const NOW = Date.parse('2026-07-28T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe('syncBannerText', () => {
  it('stays quiet when there is nothing to say', () => {
    expect(syncBannerText({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 }, NOW))
      .toBeNull();
  });

  it('stays quiet for a queue that is merely young — a train tunnel is not news', () => {
    // Principle 4's warm-not-nagging register applies hardest to a persistent
    // banner: firing it on every commute is how it gets ignored when it matters.
    expect(
      syncBannerText({ pendingCount: 3, oldestPendingAt: hoursAgo(2), quarantinedCount: 0 }, NOW),
    ).toBeNull();
  });

  it('speaks once a pending queue is over a day old', () => {
    const text = syncBannerText(
      { pendingCount: 3, oldestPendingAt: hoursAgo(30), quarantinedCount: 0 },
      NOW,
    );
    expect(text).toContain("haven't synced");
    expect(text).toContain('Connect to the internet');
  });

  it('LEADS with quarantined, and drops the connection advice', () => {
    // The regression this prevents is a lie of the same family B-398 removed:
    // telling this owner to check their connection sends them to fix the one thing
    // that is not broken. A quarantined row is one the server refused, finally; no
    // amount of connectivity moves it.
    const text = syncBannerText(
      { pendingCount: 5, oldestPendingAt: hoursAgo(30), quarantinedCount: 2 },
      NOW,
    )!;
    expect(text).toContain('2 entries');
    expect(text).not.toContain('Connect to the internet');
    // It must also say what to do, and the action has to be one that works: any
    // edit clears sync_error and re-queues the row.
    expect(text).toContain('History');
  });

  it('speaks about a quarantined row even when nothing is pending', () => {
    // Quarantined rows have no pending timestamp, so a banner gated on
    // oldestPendingAt alone would go silent about the more serious of the two —
    // and it is the one that does not self-heal.
    const text = syncBannerText({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 1 }, NOW);
    expect(text).toContain('1 entry');
  });

  it('never claims a quarantined entry was lost', () => {
    // It is still on the device. Saying otherwise would be both untrue and the
    // single most alarming thing this surface could say to a diet-trial owner.
    const text = syncBannerText({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 1 }, NOW)!;
    expect(text).not.toMatch(/lost|deleted|gone/i);
    expect(text).toContain("still here");
  });

  it('survives a malformed timestamp instead of rendering NaN advice', () => {
    expect(
      syncBannerText({ pendingCount: 1, oldestPendingAt: 'not-a-date', quarantinedCount: 0 }, NOW),
    ).toBeNull();
  });
});

// CUL-2547: the banner decides at render, and the store changes only after a sync cycle.
// Held open and offline across the 24-hour mark, nothing redrew it, so the pending line
// stayed quiet. One timer to the mark is the redraw; these drive the real component on a
// fake clock (modern fake timers move Date.now with the timers).
describe('msUntilPendingLineDue (CUL-2547)', () => {
  const DAY = 24 * 3600_000;
  it('counts down to one millisecond past the day mark', () => {
    expect(msUntilPendingLineDue({ pendingCount: 1, oldestPendingAt: hoursAgo(23), quarantinedCount: 0 }, NOW))
      .toBe(3600_000 + 1);
    expect(msUntilPendingLineDue({ pendingCount: 1, oldestPendingAt: hoursAgo(0), quarantinedCount: 0 }, NOW))
      .toBe(DAY + 1);
  });
  it('is null when the line is already due, nothing is pending, quarantine leads, or the stamp is unreadable', () => {
    for (const state of [
      { pendingCount: 1, oldestPendingAt: hoursAgo(24), quarantinedCount: 0 },
      { pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 },
      { pendingCount: 1, oldestPendingAt: hoursAgo(2), quarantinedCount: 1 },
      { pendingCount: 1, oldestPendingAt: 'not-a-date', quarantinedCount: 0 },
    ]) {
      expect(msUntilPendingLineDue(state, NOW)).toBeNull();
    }
  });
});

describe('SyncBanner notices the day passing (CUL-2547)', () => {
  const LINE = /haven't synced in over a day/;
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    (useAppActive as jest.Mock).mockReturnValue(true);
  });
  afterEach(() => {
    jest.useRealTimers();
    act(() => useSyncStore.setState({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 }));
  });

  it('shows the pending line the moment the oldest entry turns a day old, with no store change', () => {
    useSyncStore.setState({ pendingCount: 1, oldestPendingAt: hoursAgo(23), quarantinedCount: 0 });
    render(<SyncBanner />);
    expect(screen.queryByText(LINE)).toBeNull();
    act(() => jest.advanceTimersByTime(3600_000 - 1000));
    expect(screen.queryByText(LINE)).toBeNull();
    act(() => jest.advanceTimersByTime(1001));
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it('re-arms on a store change: a newer oldest entry moves the moment later', () => {
    useSyncStore.setState({ pendingCount: 1, oldestPendingAt: hoursAgo(23), quarantinedCount: 0 });
    render(<SyncBanner />);
    act(() => useSyncStore.setState({ oldestPendingAt: hoursAgo(1) }));
    act(() => jest.advanceTimersByTime(3600_000 + 10));
    expect(screen.queryByText(LINE)).toBeNull();
    act(() => jest.advanceTimersByTime(22 * 3600_000));
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it('holds no timer while the app is in the background', () => {
    (useAppActive as jest.Mock).mockReturnValue(false);
    useSyncStore.setState({ pendingCount: 1, oldestPendingAt: hoursAgo(23), quarantinedCount: 0 });
    render(<SyncBanner />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer on unmount', () => {
    useSyncStore.setState({ pendingCount: 1, oldestPendingAt: hoursAgo(23), quarantinedCount: 0 });
    const { unmount } = render(<SyncBanner />);
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
