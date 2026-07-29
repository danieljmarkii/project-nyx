import { syncBannerText } from './SyncBanner';

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
