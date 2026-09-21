// lib/spineCompaction.ts — the spine's compaction rule (D2-4 / CUL-1066).
//
// Two halves: the ten-event fixture from the issue (the real Sep 17 shape — 7 meals, two
// photographed vomits three and four minutes after eating, a cough → SIX nodes), and a
// property sweep over random days for the invariants an example cannot pin: a group never
// crosses a non-meal or a photographed meal, groups are maximal, and the flattened result
// is the chronological input.
//
// TIMEZONE HONESTY (C-29): every instant is an offset from one UTC anchor and the rule
// only ever compares instants, so nothing here depends on the runner's zone.

import { compactSpine, isCompactable, sortChronological, type CompactableNode } from './spineCompaction';
import type { EventTintCategory } from './dayEvents';

const BASE = Date.parse('2026-09-17T05:00:00Z');
const MIN = 60_000;
const at = (h: number, m: number): number => BASE + (h * 60 + m) * MIN;

function node(
  id: string,
  category: EventTintCategory,
  timeMs: number,
  hasPhoto = false,
): CompactableNode {
  return { id, category, timeMs, hasPhoto };
}

/** The issue's fixture, handed over NEWEST-FIRST the way the Home store does — the rule
 *  must sort before it looks for runs. */
const SEP_17: CompactableNode[] = [
  node('m7', 'meal', at(22, 39)),
  node('m6', 'meal', at(17, 39)),
  node('v2', 'symptom', at(17, 11), true),
  node('c1', 'symptom', at(17, 9)),
  node('m5', 'meal', at(17, 7)),
  node('m4', 'meal', at(15, 2)),
  node('m3', 'meal', at(12, 41)),
  node('v1', 'symptom', at(10, 58), true),
  node('m2', 'meal', at(10, 55)),
  node('m1', 'meal', at(5, 47)),
];

describe('compactSpine — the ten-event day becomes six nodes', () => {
  it('folds the three meal runs and leaves the two vomits and the cough on their own', () => {
    const groups = compactSpine(SEP_17);
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => (g.kind === 'compact' ? g.nodes.map((n) => n.id) : g.node.id))).toEqual([
      ['m1', 'm2'],
      'v1',
      ['m3', 'm4', 'm5'],
      'c1',
      'v2',
      ['m6', 'm7'],
    ]);
  });

  it('the meal before each vomit is on its own line side — never folded across the vomit', () => {
    // Sam's grazing cat, read the other way round: m2 (10:55) and m3 (12:41) are both meals
    // and nothing but the 10:58 vomit sits between them. They must NOT share a line.
    const groups = compactSpine(SEP_17);
    const holding = (id: string) => groups.findIndex((g) => (g.kind === 'compact' ? g.nodes.some((n) => n.id === id) : g.node.id === id));
    expect(holding('m2')).not.toBe(holding('m3'));
    expect(holding('v1')).toBeGreaterThan(holding('m2'));
    expect(holding('v1')).toBeLessThan(holding('m3'));
  });

  it('a meal logged AFTER a vomit is never folded into the group before it (the Data Scientist’s case)', () => {
    // Two meals, a vomit between them in time, handed over with the later meal FIRST in
    // the input (the store's order): input adjacency must not read as time adjacency.
    const groups = compactSpine([
      node('later', 'meal', at(12, 0)),
      node('earlier', 'meal', at(9, 0)),
      node('v', 'symptom', at(10, 0)),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['single', 'single', 'single']);
  });

  it('a lone meal is a single node, not a group of one', () => {
    const groups = compactSpine([node('m', 'meal', at(8, 0))]);
    expect(groups).toEqual([{ kind: 'single', node: node('m', 'meal', at(8, 0)) }]);
  });

  it('a photographed meal breaks a run and stands alone', () => {
    const groups = compactSpine([
      node('a', 'meal', at(8, 0)),
      node('b', 'meal', at(9, 0), true),
      node('c', 'meal', at(10, 0)),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['single', 'single', 'single']);
  });

  it('a look and a medication both break a run', () => {
    for (const cat of ['look', 'medication', 'other'] as const) {
      const groups = compactSpine([
        node('a', 'meal', at(8, 0)),
        node('x', cat, at(9, 0)),
        node('c', 'meal', at(10, 0)),
      ]);
      expect(groups.map((g) => g.kind)).toEqual(['single', 'single', 'single']);
    }
  });

  it('is empty over nothing', () => {
    expect(compactSpine([])).toEqual([]);
  });

  it('sorts stably — two rows at one instant keep their input order', () => {
    const a = node('a', 'symptom', at(8, 0));
    const b = node('b', 'symptom', at(8, 0));
    expect(sortChronological([a, b]).map((n) => n.id)).toEqual(['a', 'b']);
    expect(sortChronological([b, a]).map((n) => n.id)).toEqual(['b', 'a']);
  });
});

// ── The property sweep ──────────────────────────────────────────────────────

/** Deterministic LCG so a failure is reproducible without a dependency. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const CATEGORIES: EventTintCategory[] = ['meal', 'meal', 'meal', 'symptom', 'medication', 'look', 'other'];

function randomDay(rng: () => number): CompactableNode[] {
  const n = Math.floor(rng() * 14);
  const nodes: CompactableNode[] = [];
  for (let i = 0; i < n; i++) {
    const category = CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
    // Coarse minutes so ties (two rows at one instant) actually occur in the sweep.
    const timeMs = at(0, Math.floor(rng() * 48) * 30);
    nodes.push(node(`n${i}`, category, timeMs, rng() < 0.15));
  }
  // Shuffle: the rule must not depend on input order.
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }
  return nodes;
}

describe('compactSpine — properties over 400 random days', () => {
  const rng = lcg(0xd24);
  const days = Array.from({ length: 400 }, () => randomDay(rng));

  it.each(days.map((d, i) => [i, d] as const))('day %i holds every invariant', (_i, day) => {
    const groups = compactSpine(day);
    const sorted = sortChronological(day);

    // 1. Nothing dropped, nothing reordered: flattening is the chronological input.
    const flat = groups.flatMap((g) => (g.kind === 'compact' ? g.nodes : [g.node]));
    expect(flat.map((n) => n.id)).toEqual(sorted.map((n) => n.id));

    // 2. A group holds only compactable nodes, and at least two of them.
    for (const g of groups) {
      if (g.kind !== 'compact') continue;
      expect(g.nodes.length).toBeGreaterThanOrEqual(2);
      for (const n of g.nodes) expect(isCompactable(n)).toBe(true);
    }

    // 3. NEVER ACROSS: a group is contiguous in chronological order, so no non-compactable
    //    node can sit between two of its members.
    for (const g of groups) {
      if (g.kind !== 'compact') continue;
      const first = sorted.indexOf(g.nodes[0]);
      const last = sorted.indexOf(g.nodes[g.nodes.length - 1]);
      for (let k = first; k <= last; k++) expect(isCompactable(sorted[k])).toBe(true);
      expect(last - first + 1).toBe(g.nodes.length);
    }

    // 4. MAXIMAL: two chronologically adjacent compactable nodes are in the same line.
    //    (Sam: the rule must never draw two identical meal lines back to back.)
    const lineOf = new Map<string, number>();
    groups.forEach((g, gi) => {
      if (g.kind === 'compact') g.nodes.forEach((n) => lineOf.set(n.id, gi));
      else lineOf.set(g.node.id, gi);
    });
    for (let k = 1; k < sorted.length; k++) {
      if (isCompactable(sorted[k - 1]) && isCompactable(sorted[k])) {
        expect(lineOf.get(sorted[k - 1].id)).toBe(lineOf.get(sorted[k].id));
      }
    }
  });
});
