import { create } from 'zustand';

// Report copies a sign-out wiped before they were kept (Vet report v2, CUL-2573).
//
// A sign-out the owner chose is warned BEFORE the wipe (app/settings.tsx, unsentSignOutWarning).
// A sign-out the app is forced into is not: an expired session (SIGNED_OUT on a refresh
// failure), and the password-reset paths, which wipe the phone on the way to a new session. Each
// of those counts what it is about to wipe and notes it here; `usePendingReportKeeps` says it once,
// after the wipe, to the account that lost it.
//
// Memory only, on purpose. It holds a count and the id of the account it belongs to, never a
// report, a pet or a send time, so it names nothing a wipe exists to remove; it is not cleared by the
// wipe (the wipe is what it reports on). An app killed before the notice shows loses the line:
// the same bound as every in-memory notice here.
interface KeepLossState {
  /** The account whose copies were lost (null when it could not be read), and how many. */
  lost: { userId: string | null; count: number } | null;
  /** When the one sign-out that already warned the owner was confirmed (epoch ms), or null. */
  accepted: number | null;
  note: (userId: string | null, count: number) => void;
  /** The pending loss, cleared. */
  take: () => { userId: string | null; count: number } | null;
  acceptNextSignOut: (now?: number) => void;
  /** True once, within ACCEPT_WINDOW_MS of `acceptNextSignOut`; any later call is false. */
  consumeAccepted: (now?: number) => boolean;
}

/** How long a confirmed sign-out's acceptance waits for its SIGNED_OUT. A sign-out that never
 *  emits one (it failed without saying) must not silence a later forced sign-out (rls-privacy-
 *  reviewer): past this, the acceptance is spent and the loss is said. */
export const ACCEPT_WINDOW_MS = 60_000;

export const useKeepLossStore = create<KeepLossState>((set, get) => ({
  lost: null,
  accepted: null,
  note: (userId, count) => {
    if (count <= 0) return;
    const prior = get().lost;
    // Two forced wipes before the notice shows: one account's losses add up; a different
    // account's replace them (the earlier owner is gone, and the next one is never told of it).
    set({ lost: prior && prior.userId === userId ? { userId, count: prior.count + count } : { userId, count } });
  },
  take: () => {
    const lost = get().lost;
    if (lost) set({ lost: null });
    return lost;
  },
  acceptNextSignOut: (now = Date.now()) => set({ accepted: now }),
  consumeAccepted: (now = Date.now()) => {
    const accepted = get().accepted;
    if (accepted === null) return false;
    set({ accepted: null });
    return now - accepted >= 0 && now - accepted <= ACCEPT_WINDOW_MS;
  },
}));

/** Who may be told: nobody signed in (the sign-in screen), or the account that lost them. */
export function mayHearKeepLoss(lostUserId: string | null, sessionUserId: string | null): boolean {
  return sessionUserId === null || (lostUserId !== null && sessionUserId === lostUserId);
}

/**
 * The line after a forced sign-out wiped copies still waiting (CUL-2573). No pet name: the pets
 * left the phone with the wipe, and the sign-in screen may be shown to someone else. nyx-voice:
 * what happened, calm, one action.
 */
export function keepLossNotice(count: number): { title: string; body: string } | null {
  if (count <= 0) return null;
  return count === 1
    ? {
      title: 'A report copy wasn’t saved',
      body: 'You were signed out before a copy of a vet report you sent could be saved to your vet reports. Preview the report again and send it to save one.',
    }
    : {
      title: 'Some report copies weren’t saved',
      body: `You were signed out before ${count} copies of vet reports you sent could be saved to your vet reports. Preview the report again and send it to save one.`,
    };
}
