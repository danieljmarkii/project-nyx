// An open run that is re-keyed stays open (CUL-1757). A run's id is its first member's
// (`lib/spineNode.ts` `compactNode`), so a backdated earlier meal, or the first member
// deleted, gives the same run a new id. The hosts hold their open runs by id, so without
// this the re-keyed run is simply not in the open set: its row mounts under the new key
// closed, and the meals the owner was reading vanish in one frame.
//
// A run is the same run when it holds a member the open one held. The carry only ever
// MOVES an id to the run that now holds most of those meals; it never closes anything. An
// open id with no successor stays as it was (the host's behaviour before this). Its known
// limit: a re-key that lands across a read with no nodes is not carried (the empty read is
// the only "before" the carry sees), and the run then reads closed.
//
// The id is not made stable instead: it is the row's key, its testIDs, the reveal's and the
// focus's handle, and no field of a run survives both edits (the backdated meal is new;
// the deleted one is gone).

import type { DayNode } from './dayNodes';

/** The run in `next` holding the MOST of the old run's meals; a tie goes to the one holding
 *  the earlier meal. Never simply the first meal's run: a first meal backdated across
 *  midnight into another day's run would open that run and leave this one shut. */
function successorOf(members: readonly string[], runOfMember: ReadonlyMap<string, string>): string | undefined {
  const held = new Map<string, number>();
  for (const m of members) {
    const r = runOfMember.get(m);
    if (r !== undefined) held.set(r, (held.get(r) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [r, n] of held) if (best === undefined || n > (held.get(best) as number)) best = r;
  return best;
}

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
    const successor = members ? successorOf(members, runOfMember) : undefined;
    if (successor !== undefined && successor !== id) {
      out.add(successor);
      moved = true;
    } else {
      out.add(id);
    }
  }
  return moved ? out : open;
}
