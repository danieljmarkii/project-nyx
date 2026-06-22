import { useSyncStore } from './syncStore';

// Reset to initial state before each test — zustand stores are module singletons,
// so without this a mutation in one test leaks into the next.
const INITIAL = {
  pendingCount: 0,
  oldestPendingAt: null,
  coldStartHydrating: false,
  hydrationTick: 0,
  signalTick: 0,
};

describe('syncStore', () => {
  beforeEach(() => {
    useSyncStore.setState(INITIAL);
  });

  it('initializes idle: no pending, not cold-start hydrating, tick at 0', () => {
    const s = useSyncStore.getState();
    expect(s.pendingCount).toBe(0);
    expect(s.oldestPendingAt).toBeNull();
    expect(s.coldStartHydrating).toBe(false);
    expect(s.hydrationTick).toBe(0);
    expect(s.signalTick).toBe(0);
  });

  it('setPendingStatus updates count and oldest timestamp together', () => {
    useSyncStore.getState().setPendingStatus(3, '2026-06-07T10:00:00.000Z');
    const s = useSyncStore.getState();
    expect(s.pendingCount).toBe(3);
    expect(s.oldestPendingAt).toBe('2026-06-07T10:00:00.000Z');
  });

  it('setColdStartHydrating toggles the block-only-when-empty flag', () => {
    useSyncStore.getState().setColdStartHydrating(true);
    expect(useSyncStore.getState().coldStartHydrating).toBe(true);
    useSyncStore.getState().setColdStartHydrating(false);
    expect(useSyncStore.getState().coldStartHydrating).toBe(false);
  });

  it('bumpHydrationTick increments monotonically so effects can depend on it', () => {
    expect(useSyncStore.getState().hydrationTick).toBe(0);
    useSyncStore.getState().bumpHydrationTick();
    expect(useSyncStore.getState().hydrationTick).toBe(1);
    useSyncStore.getState().bumpHydrationTick();
    expect(useSyncStore.getState().hydrationTick).toBe(2);
  });

  it('bumpHydrationTick produces a new value each call (drives re-read effects)', () => {
    const before = useSyncStore.getState().hydrationTick;
    useSyncStore.getState().bumpHydrationTick();
    const after = useSyncStore.getState().hydrationTick;
    expect(after).not.toBe(before);
  });

  it('cold-start flag and tick are independent (a silent re-sync still bumps the tick)', () => {
    // A foreground re-sync on an already-populated device never blocks, but must
    // still bump the tick so open screens refresh.
    useSyncStore.getState().bumpHydrationTick();
    expect(useSyncStore.getState().coldStartHydrating).toBe(false);
    expect(useSyncStore.getState().hydrationTick).toBe(1);
  });

  it('bumpSignalTick increments independently of hydrationTick (B-150 regen refresh)', () => {
    expect(useSyncStore.getState().signalTick).toBe(0);
    useSyncStore.getState().bumpSignalTick();
    useSyncStore.getState().bumpSignalTick();
    expect(useSyncStore.getState().signalTick).toBe(2);
    // Orthogonal ticks — a signal regen must not read as a sync cycle (or vice versa).
    expect(useSyncStore.getState().hydrationTick).toBe(0);
  });
});
