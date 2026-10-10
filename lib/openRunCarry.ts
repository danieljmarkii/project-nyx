// An open run that is re-keyed stays open (CUL-1757). A run's id is its first member's
// (`lib/spineNode.ts` `compactNode`), so a backdated earlier meal, or the first member
// deleted, gives the same run a new id. The hosts hold their open runs by id, so without
// this the re-keyed run is simply not in the open set: its row mounts under the new key
// closed, and the meals the owner was reading vanish in one frame.
//
// A run is the same run when it holds a member the open one held. The carry only ever
// MOVES an id to the run that now holds those meals; it never closes anything. An open id
// with no successor stays as it was (the host's behaviour before this), so a read that
// answers with nothing for a moment never closes a run the next read brings back.
//
// The id is not made stable instead: it is the row's key, its testIDs, the reveal's and the
// focus's handle, and no field of a run survives both edits (the backdated meal is new;
// the deleted one is gone).

import type { DayNode } from './dayNodes';

/** `open` with every re-keyed run's id moved to its successor in `next`; the same set (by
 *  reference) when nothing moved, so a host's state update is a no-op. */
export function carryOpenRuns(
  open: ReadonlySet<string>,
  prev: readonly DayNode[],
  next: readonly DayNode[],
): ReadonlySet<string> {
  if (open.size === 0) return open;
  const nextIds = new Set(next.map((n) => n.id));
  // Each member's run in `next`. A member in two runs cannot happen (a run partitions its
  // day); the first wins all the same.
  const runOfMember = new Map<string, string>();
  for (const n of next) {
    if (n.kind !== 'compact') continue;
    for (const id of n.ids) if (!runOfMember.has(id)) runOfMember.set(id, n.id);
  }
  const prevRuns = new Map<string, readonly string[]>();
  for (const n of prev) if (n.kind === 'compact') prevRuns.set(n.id, n.ids);

  let moved = false;
  const out = new Set<string>();
  for (const id of open) {
    const members = nextIds.has(id) ? undefined : prevRuns.get(id);
    // The run's meals in order, so a run split in two follows its earliest surviving meal.
    const successor = members?.map((m) => runOfMember.get(m)).find((r) => r !== undefined);
    if (successor !== undefined && successor !== id) {
      out.add(successor);
      moved = true;
    } else {
      out.add(id);
    }
  }
  return moved ? out : open;
}
