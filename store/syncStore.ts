import { create } from 'zustand';

interface SyncState {
  pendingCount: number;
  oldestPendingAt: string | null;
  setPendingStatus: (count: number, oldestAt: string | null) => void;

  // B-054 §6 — block-only-when-empty cold start. True while the FIRST sync after
  // a session is established is hydrating an empty local store (new device /
  // reinstall / post-wipe account switch). Drives the full-screen "Catching up…"
  // overlay. Never set on foreground/reconnect re-syncs — local is already
  // populated by then, so those reconcile silently (the §6 synthesis).
  coldStartHydrating: boolean;
  setColdStartHydrating: (v: boolean) => void;

  // B-054 §6 — reactive refresh-after-hydrate. Bumped at the end of every
  // completed sync cycle so screens reading local SQLite (Home, Trend, History)
  // re-read and surface rows another device just pushed, without a manual
  // pull-to-refresh or reload. A monotonic counter so an effect can depend on it.
  hydrationTick: number;
  bumpHydrationTick: () => void;

  // B-150 — reactive refresh-after-regen for the Signal surfaces. Bumped when a
  // generate-signal regen SUCCEEDS (for any pet), so the Home Signal and the
  // cross-pet safety banner re-read the fresh cache without waiting for a screen
  // re-focus. A non-active pet's finding can RESOLVE while its owner sits on
  // another pet's home; without this tick the banner showed the stale (resolved)
  // finding until the next Home re-focus. A monotonic counter so an effect deps on it.
  signalTick: number;
  bumpSignalTick: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  oldestPendingAt: null,
  setPendingStatus: (count, oldestAt) => set({ pendingCount: count, oldestPendingAt: oldestAt }),

  coldStartHydrating: false,
  setColdStartHydrating: (coldStartHydrating) => set({ coldStartHydrating }),

  hydrationTick: 0,
  bumpHydrationTick: () => set((s) => ({ hydrationTick: s.hydrationTick + 1 })),

  signalTick: 0,
  bumpSignalTick: () => set((s) => ({ signalTick: s.signalTick + 1 })),
}));
