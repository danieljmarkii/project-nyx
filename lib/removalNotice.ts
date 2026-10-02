// "This row was just removed by the owner" — the one fact a list needs to FOLD a row away
// rather than let it vanish (History v2, HV-10 / CUL-1167; spec §4 "Remove a row: fold, for a
// removal, after the confirm, through `reverseLoggedEvent`").
//
// A row leaves a list for many reasons: another device's sync, a filter, a reload after
// midnight. Only one of them is the owner's own removal, and only that one earns the fold,
// because a fold says "this is what you just took away". So the reversal writes a notice
// here (`lib/undoLog.ts`, the one shared reversal every Remove and Undo goes through, C-20:
// a side effect of removal lives there, never on the surface that noticed it), and a list
// takes the notices for the rows it is drawing when it comes back into view.
//
// ONE-SHOT AND SHORT-LIVED. A notice is taken once, and it lapses after
// `REMOVAL_NOTICE_MS`: the record screen's Remove returns to the list within a second, and a
// notice nobody took (a removal from a screen no list was under) must not fold a row the
// next time some list happens to draw that id. It holds an event id and a time, nothing
// else, and is cleared at sign-out with the rest of the account's in-memory state
// (`wipeLocalSession`, the FR-9 parity rule).

/** How long a notice waits to be taken. */
export const REMOVAL_NOTICE_MS = 10_000;

const notices = new Map<string, number>();

function prune(now: number): void {
  for (const [id, at] of notices) if (now - at > REMOVAL_NOTICE_MS) notices.delete(id);
}

/** The owner removed this event (called by the shared reversal, after its local write). */
export function noteRemoval(eventId: string, now: number = Date.now()): void {
  prune(now);
  notices.set(eventId, now);
}

/**
 * The notices for the ids a list is drawing, TAKEN: each is returned at most once, in the
 * order asked. Ids with no live notice are ignored and their absence costs nothing.
 */
export function takeRemovals(ids: Iterable<string>, now: number = Date.now()): string[] {
  prune(now);
  const out: string[] = [];
  for (const id of ids) {
    if (!notices.has(id)) continue;
    notices.delete(id);
    out.push(id);
  }
  return out;
}

/** Sign-out teardown (`wipeLocalSession`), and a test's reset. */
export function clearRemovalNotices(): void {
  notices.clear();
}
