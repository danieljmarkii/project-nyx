import { create } from 'zustand';

interface SyncState {
  pendingCount: number;
  oldestPendingAt: string | null;
  // B-398 — rows the push queue has GIVEN UP on: still on this device, still
  // honestly synced = 0, but they will not move without an owner edit. Held apart
  // from pendingCount because the two need different copy — "waiting for a
  // connection" is true of one and a lie about the other.
  quarantinedCount: number;
  setPendingStatus: (count: number, oldestAt: string | null, quarantined?: number) => void;

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

  // B-721 SR-3 (§5.3) — the post-log acknowledgment flag, per pet. Raised the moment a
  // fresh log schedules a debounced Signal regen (triggerSignalRegenDebounced) and
  // cleared when THAT regen settles (success OR failure — fail-quiet). The Home Signal
  // reads it (via useSignal) to show the quiet "Noted — updating {pet}'s picture…" line
  // above the still-readable findings. Owned by the regen lifecycle, not the render:
  // so a regen that lands while the owner is still on the log screen clears the flag
  // before they ever see it (no false "updating" on return). A pure render cue — the
  // flag-off Signal surface never reads it, so raising it is invisible there (FR-FLAG-2).
  signalAcknowledging: Record<string, boolean>;
  setSignalAcknowledging: (petId: string, value: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  oldestPendingAt: null,
  quarantinedCount: 0,
  setPendingStatus: (count, oldestAt, quarantined = 0) =>
    set({ pendingCount: count, oldestPendingAt: oldestAt, quarantinedCount: quarantined }),

  coldStartHydrating: false,
  setColdStartHydrating: (coldStartHydrating) => set({ coldStartHydrating }),

  hydrationTick: 0,
  bumpHydrationTick: () => set((s) => ({ hydrationTick: s.hydrationTick + 1 })),

  signalTick: 0,
  bumpSignalTick: () => set((s) => ({ signalTick: s.signalTick + 1 })),

  signalAcknowledging: {},
  setSignalAcknowledging: (petId, value) =>
    set((s) => {
      // No-op if already at the target — avoids a pointless store write (and the
      // re-render it would trigger) when a burst of logs re-raises an already-set flag.
      if ((s.signalAcknowledging[petId] ?? false) === value) return s;
      return { signalAcknowledging: { ...s.signalAcknowledging, [petId]: value } };
    }),
}));
