// lib/spineCompaction.ts — the run rule (D2-4 / CUL-1066; rule B since History v2 HV-6 /
// CUL-1163, spec §3.6, AC 16).
//
// Three parts: the ten-event fixture from D2-4 (the real Sep 17 shape — 7 meals, two
// photographed vomits three and four minutes after eating, a cough → SIX nodes), rule B's
// breaks one by one (CUL-1121's Saturday first), and a property sweep over random days for
// the invariants an example cannot pin: a refusal is never inside a run, a run is one
// product, kind and day, a group never crosses a node that may not join it, groups are
// maximal, and the flattened result is the chronological input.
//
// TIMEZONE HONESTY (C-29): every instant is an offset from one UTC anchor and the rule
// only ever compares instants, so nothing here depends on the runner's zone.

import { compactSpine, isCompactable, sameRun, sortChronological, type CompactableNode } from './spineCompaction';
import type { EventTintCategory } from './dayEvents';

const BASE = Date.parse('2026-09-17T05:00:00Z');
const MIN = 60_000;
const at = (h: number, m: number): number => BASE + (h * 60 + m) * MIN;

/** A node, eaten normally unless told otherwise: one product ('rc'), unrated, no photo,
 *  note, dose, timing anchor or approximate time, on the anchor's day. */
function node(
  id: string,
  category: EventTintCategory,
  timeMs: number,
  hasPhoto = false,
  mealKind: 'Meal' | 'Treat' | null = category === 'meal' ? 'Meal' : null,
  over: Partial<CompactableNode> = {},
): CompactableNode {
  return {
    id,
    category,
    timeMs,
    day: 0,
    hasPhoto,
    mealKind,
    product: category === 'meal' ? 'rc' : null,
    intake: null,
    noted: false,
    vehicle: false,
    timed: false,
    approximate: false,
    ...over,
  };
}

/** A meal of the one product, with the given facts. */
const bowl = (id: string, timeMs: number, over: Partial<CompactableNode> = {}) =>
  node(id, 'meal', timeMs, false, 'Meal', over);

/** Each line as the day reads: a run's ids, or a single id. */
const lines = (groups: ReturnType<typeof compactSpine>) =>
  groups.map((g) => (g.kind === 'compact' ? g.nodes.map((n) => n.id) : g.node.id));

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

  it('a treat never joins a meal line — two Temptations and a bowl are two lines (F3)', () => {
    const groups = compactSpine([
      node('t1', 'meal', at(8, 0), false, 'Treat'),
      node('t2', 'meal', at(8, 5), false, 'Treat'),
      node('m1', 'meal', at(9, 0)),
    ]);
    expect(groups.map((g) => (g.kind === 'compact' ? g.nodes.map((n) => n.id) : g.node.id))).toEqual([
      ['t1', 't2'],
      'm1',
    ]);
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

  it('a same-instant pair sorts on its id, whatever order it was handed over in (rule H)', () => {
    const a = node('a', 'symptom', at(8, 0));
    const b = node('b', 'symptom', at(8, 0));
    expect(sortChronological([a, b]).map((n) => n.id)).toEqual(['a', 'b']);
    expect(sortChronological([b, a]).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

// ── Rule B, one break at a time (History v2 §3.6, AC 16) ────────────────────

describe('rule B — a run joins meals of one product eaten normally, and nothing else', () => {
  it('CUL-1121: Saturday 8 AM All, noon Refused, 5 PM All is three rows, the refusal its own', () => {
    const groups = compactSpine([
      bowl('b8', at(8, 0), { intake: 'all' }),
      bowl('b12', at(12, 0), { intake: 'refused' }),
      bowl('b17', at(17, 0), { intake: 'all' }),
    ]);
    expect(lines(groups)).toEqual(['b8', 'b12', 'b17']);
  });

  it('a recorded rating below Most breaks a run, and so does a rating this build does not know', () => {
    for (const intake of ['refused', 'picked', 'some', 'a_rating_from_the_future']) {
      const groups = compactSpine([bowl('a', at(8, 0)), bowl('x', at(9, 0), { intake }), bowl('c', at(10, 0))]);
      expect(lines(groups)).toEqual(['a', 'x', 'c']);
    }
  });

  it('Most, All and a MISSING rating join: the break keys on a recorded rating (CUL-1118 cannot move it)', () => {
    const groups = compactSpine([
      bowl('a', at(8, 0), { intake: 'all' }),
      bowl('b', at(9, 0), { intake: null }),
      bowl('c', at(10, 0), { intake: 'most' }),
    ]);
    expect(lines(groups)).toEqual([['a', 'b', 'c']]);
  });

  it('a photographed, noted, vehicle, timed or approximate meal is its own row, and splits the run it sat in', () => {
    const breaks: Partial<CompactableNode>[] = [
      { hasPhoto: true },
      { noted: true },
      { vehicle: true },
      { timed: true },
      { approximate: true },
    ];
    for (const over of breaks) {
      const groups = compactSpine([bowl('a', at(8, 0)), bowl('b', at(9, 0)), bowl('x', at(10, 0), over), bowl('c', at(11, 0)), bowl('d', at(12, 0))]);
      expect(lines(groups)).toEqual([['a', 'b'], 'x', ['c', 'd']]);
    }
  });

  it('a second product breaks a run; the run crosses formats only within ONE product key', () => {
    const groups = compactSpine([
      bowl('rc1', at(8, 0), { product: 'rc' }),
      bowl('rc2', at(9, 0), { product: 'rc' }),
      bowl('inst', at(10, 0), { product: 'instinct' }),
      bowl('rc3', at(11, 0), { product: 'rc' }),
    ]);
    expect(lines(groups)).toEqual([['rc1', 'rc2'], 'inst', 'rc3']);
  });

  it('a meal that names no food never joins a run: a run always names its product (rule K)', () => {
    const groups = compactSpine([bowl('a', at(8, 0), { product: null }), bowl('b', at(9, 0), { product: null })]);
    expect(lines(groups)).toEqual(['a', 'b']);
  });

  it('midnight breaks a run', () => {
    const groups = compactSpine([bowl('late', at(23, 30), { day: 0 }), bowl('early', at(24, 10), { day: 1 })]);
    expect(lines(groups)).toEqual(['late', 'early']);
  });

  it('a same-instant pair is ordered, and so run-assigned, the same way from every input order', () => {
    const x = bowl('x', at(8, 0));
    const y = bowl('y', at(8, 0), { intake: 'refused' });
    const z = bowl('z', at(9, 0));
    expect(lines(compactSpine([x, y, z]))).toEqual(lines(compactSpine([z, y, x])));
    expect(lines(compactSpine([y, z, x]))).toEqual(['x', 'y', 'z']);
  });

  it('HV-2’s day: a refused bowl just before a vomit is never folded away above it', () => {
    // "3 meals · 8:00 AM – 10:00 PM" directly above "Vomit 10:05 PM · 6h or more after
    // eating" hid the one row that explains the line. The refused 4 PM bowl is its own
    // row, and the 3 PM bowl the lane measured from is its own row too.
    const groups = compactSpine([
      bowl('b8', at(8, 0), { intake: 'all' }),
      bowl('b12', at(12, 0), { intake: 'all' }),
      bowl('b15', at(15, 0), { intake: 'all', timed: true }),
      bowl('b16', at(16, 0), { intake: 'refused' }),
      bowl('b22', at(22, 0), { intake: 'refused' }),
      node('v', 'symptom', at(22, 5), true),
    ]);
    expect(lines(groups)).toEqual([['b8', 'b12'], 'b15', 'b16', 'b22', 'v']);
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
    const kind = category === 'meal' ? (rng() < 0.3 ? 'Treat' : 'Meal') : null;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
    nodes.push(
      node(`n${i}`, category, timeMs, rng() < 0.15, kind, {
        // A midnight inside the sweep's two days, so a run has one to refuse to cross.
        day: timeMs < at(24, 0) ? 0 : 1,
        product: category === 'meal' ? pick(['rc', 'rc', 'rc', 'instinct', null]) : null,
        intake: category === 'meal' ? pick([null, null, 'all', 'most', 'some', 'picked', 'refused', 'odd']) : null,
        noted: rng() < 0.08,
        vehicle: rng() < 0.08,
        timed: rng() < 0.08,
        approximate: rng() < 0.08,
      }),
    );
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

    // 2. A group holds only compactable nodes of ONE kind, product and day, at least two.
    for (const g of groups) {
      if (g.kind !== 'compact') continue;
      expect(g.nodes.length).toBeGreaterThanOrEqual(2);
      for (const n of g.nodes) expect(isCompactable(n)).toBe(true);
      expect(new Set(g.nodes.map((n) => n.mealKind)).size).toBe(1);
      expect(new Set(g.nodes.map((n) => n.product)).size).toBe(1);
      expect(new Set(g.nodes.map((n) => n.day)).size).toBe(1);
    }

    // 2b. INTAKE IS NOT PREFERENCE: no run holds a meal with a recorded rating below Most,
    //     nor any fact its one line cannot show. Stated from the facts, not the predicate,
    //     so a predicate that forgot a break reds here (C-34).
    for (const g of groups) {
      if (g.kind !== 'compact') continue;
      for (const n of g.nodes) {
        expect([null, 'most', 'all']).toContain(n.intake);
        expect(n.product).not.toBeNull();
        expect([n.hasPhoto, n.noted, n.vehicle, n.timed, n.approximate]).toEqual([false, false, false, false, false]);
      }
    }

    // 3. NEVER ACROSS: a group is contiguous in chronological order, so no non-compactable
    //    node — and no node of the other kind — can sit between two of its members.
    for (const g of groups) {
      if (g.kind !== 'compact') continue;
      const first = sorted.indexOf(g.nodes[0]);
      const last = sorted.indexOf(g.nodes[g.nodes.length - 1]);
      for (let k = first; k <= last; k++) expect(sameRun(sorted[first], sorted[k])).toBe(true);
      expect(last - first + 1).toBe(g.nodes.length);
    }

    // 4. MAXIMAL: two chronologically adjacent compactable nodes of one kind are in the
    //    same line. (Sam: the rule must never draw two identical meal lines back to back.)
    const lineOf = new Map<string, number>();
    groups.forEach((g, gi) => {
      if (g.kind === 'compact') g.nodes.forEach((n) => lineOf.set(n.id, gi));
      else lineOf.set(g.node.id, gi);
    });
    for (let k = 1; k < sorted.length; k++) {
      if (sameRun(sorted[k - 1], sorted[k])) {
        expect(lineOf.get(sorted[k - 1].id)).toBe(lineOf.get(sorted[k].id));
      } else if (isCompactable(sorted[k - 1]) && isCompactable(sorted[k])) {
        expect(lineOf.get(sorted[k - 1].id)).not.toBe(lineOf.get(sorted[k].id));
      }
    }
  });
});
