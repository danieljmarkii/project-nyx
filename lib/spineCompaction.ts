// The spine's compaction rule (Design v2 — the whole day, D2-4 / CUL-1066; the round-4
// page §01, ruled from the owners' read: "3 meals · 12:41 – 5:07 PM is my cat's
// afternoon. I would not want three identical lines").
//
// ── THE RULE, IN ONE SENTENCE ────────────────────────────────────────────────
// Consecutive meal nodes with NOTHING between them share one line. Everything else is
// its own node, and everything else is also what a group may never cross: a symptom, a
// medication, a look, a weight — and a PHOTOGRAPHED meal, because a photo is a fact the
// compact line would hide (the spine's photo glyph is per node, and a group has no node
// to hang it on).
//
// The rule is stated over CHRONOLOGICAL order, not input order. Home's store hands rows
// newest-first; the spine reads top-to-bottom through the day; so the first thing this
// function does is sort, and "consecutive" means consecutive IN TIME. That is what makes
// the Data Scientist's falsification hold by construction: a meal logged after a vomit
// is never folded into the group before the vomit, because the vomit sits between them
// in time and a group is a maximal run of compactable nodes with no other node inside it.
//
// PURE. No react-native, no theme, no clock: the caller has already clipped the rows to
// the day and derived every fact this reads (`hasPhoto` from the attachment set,
// `category` from `eventTintCategory`). Tested by a property sweep in
// `spineCompaction.test.ts`, because the invariants ("never crosses", "maximal",
// "order-preserving") are the kind an example list lets slip.

import type { EventTintCategory } from './dayEvents';

/** The three facts the rule reads. A `NyxEvent` does not carry `hasPhoto`; the caller
 *  derives it from the attachment set (`lib/spineReads.ts`) before calling. */
export interface CompactableNode {
  id: string;
  category: EventTintCategory;
  /** The row's chronological key — `describeDayEvent`'s `timeMs`. */
  timeMs: number;
  hasPhoto: boolean;
}

/** One line on the spine: a single node, or a run of meals that share a line. A compact
 *  group always holds ≥ 2 nodes — one meal is just a meal. */
export type CompactGroup<T extends CompactableNode> =
  | { kind: 'single'; node: T }
  | { kind: 'compact'; nodes: T[] };

/** May this node join a compact line? Exactly one shape qualifies: an unphotographed
 *  meal. Named so the sweep can use the SAME predicate as the rule (the guard reads by
 *  effect, C-34: a test that restates the rule is a tautology with fixtures — this one
 *  reads it). */
export function isCompactable(node: CompactableNode): boolean {
  return node.category === 'meal' && !node.hasPhoto;
}

/** Chronological order, stable on ties (two rows at one instant keep their input order,
 *  so a re-render cannot swap them). */
export function sortChronological<T extends CompactableNode>(nodes: readonly T[]): T[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.timeMs - b.node.timeMs || a.index - b.index)
    .map((x) => x.node);
}

/**
 * Fold a day's nodes into spine lines. Sorted first; then a maximal run of compactable
 * nodes of length ≥ 2 becomes one `compact` group, and every other node — including a
 * lone compactable meal — is a `single`.
 *
 * Total: never throws, never drops a node (flattening the result in order is the
 * sorted input — pinned by the sweep).
 */
export function compactSpine<T extends CompactableNode>(nodes: readonly T[]): CompactGroup<T>[] {
  const sorted = sortChronological(nodes);
  const out: CompactGroup<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: 'compact', nodes: run });
    else for (const node of run) out.push({ kind: 'single', node });
    run = [];
  };
  for (const node of sorted) {
    if (isCompactable(node)) {
      run.push(node);
      continue;
    }
    flush();
    out.push({ kind: 'single', node });
  }
  flush();
  return out;
}
