// The composition helper (Mixed meals row 2, CUL-2051; spec §3, §4, §10 "Composition and
// sync (row 2)"). Pure: no database, no clock. The two-device property test at the foot
// models the server as 105 actually behaves (an insert keeps the client's updated_at, an
// update has it rewritten by the BEFORE UPDATE trigger) and asserts the §10 criterion over
// random interleavings: the live set is always one device's whole set, never a union.

import {
  compositionKey,
  dominantComponent,
  generationMs,
  generationOf,
  liveComponentRows,
  mintGenerationId,
  planComponentWrite,
  readMealComposition,
  MealComponentInputError,
  type ComponentInput,
  type MealComponentRow,
} from './mealComposition';
import { advanceWatermark, watermarkQueryFloor } from './hydration';

/** A deterministic PRNG, so a failing interleaving reproduces. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = Date.parse('2026-10-21T08:00:00.000Z');

function row(over: Partial<MealComponentRow> & { id: string; position: number }): MealComponentRow {
  return {
    food_item_id: `food-${over.position}`,
    food_label: `Food ${over.position}`,
    share: 0.5,
    share_source: 'preset',
    amount_value: null,
    amount_unit: null,
    updated_at: '2026-10-21T08:00:00.000Z',
    deleted_at: null,
    ...over,
  };
}

/** The rows a write plan produces, as the phone stores them. */
function rowsOf(plan: ReturnType<typeof planComponentWrite>, at: string): MealComponentRow[] {
  return plan.inserts.map((r) => ({ ...r, updated_at: at, deleted_at: null }));
}

function input(...shares: number[]): ComponentInput[] {
  return shares.map((share, i) => ({ foodItemId: `food-${i}`, foodLabel: `Food ${i}`, share, shareSource: 'preset' }));
}

describe('generation ids', () => {
  it('stamps every row of a set with one generation and a distinct id', () => {
    const random = prng(1);
    const a = mintGenerationId(T0, 0xabc, random);
    const b = mintGenerationId(T0, 0xabc, random);
    expect(a).not.toBe(b);
    expect(generationOf(a)).toBe(generationOf(b));
    expect(generationMs(a)).toBe(T0);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('orders generations by millisecond, then by the shared bits, as text', () => {
    const r = prng(2);
    expect(generationOf(mintGenerationId(T0 + 1, 0, r)) > generationOf(mintGenerationId(T0, 0xfff, r))).toBe(true);
    expect(generationOf(mintGenerationId(T0, 2, r)) > generationOf(mintGenerationId(T0, 1, r))).toBe(true);
  });

  it('gives an unstamped (non-v7) id the oldest generation', () => {
    expect(generationOf('3f1c2b9e-1111-4aaa-8bbb-cccccccccccc')).toBe('');
    expect(generationMs('not-a-uuid')).toBeNull();
  });
});

describe('the read rule', () => {
  it('reads the live rows of the newest generation, whatever their sizes (no union)', () => {
    const r = prng(3);
    // Device A wrote three foods; device B, later, wrote two. Per position alone this would
    // be B's 0 and 1 plus A's 2.
    const a = [0, 1, 2].map((p) => row({ id: mintGenerationId(T0, 1, r), position: p, food_item_id: `a${p}` }));
    const b = [0, 1].map((p) => row({ id: mintGenerationId(T0 + 5, 2, r), position: p, food_item_id: `b${p}` }));
    expect(liveComponentRows([...a, ...b]).map((x) => x.food_item_id)).toEqual(['b0', 'b1']);
  });

  it('ignores tombstones, and a retried row whose updated_at the server rewrote', () => {
    const r = prng(4);
    const old = [0, 1].map((p) => row({ id: mintGenerationId(T0, 1, r), position: p, food_item_id: `o${p}`, deleted_at: '2026-10-21T09:00:00.000Z' }));
    const cur = [0, 1].map((p) => row({ id: mintGenerationId(T0 + 9, 1, r), position: p, food_item_id: `c${p}` }));
    // The server re-stamped position 1 on a retried push: it must not outrank anything.
    cur[1] = { ...cur[1], updated_at: '2026-10-22T00:00:00+00:00' };
    expect(liveComponentRows([...old, ...cur]).map((x) => x.food_item_id)).toEqual(['c0', 'c1']);
  });

  it('within one generation, keeps one row per position (updated_at parsed, then id)', () => {
    const r = prng(5);
    const g = (pos: number, at: string, food: string) => row({ id: mintGenerationId(T0, 7, r), position: pos, updated_at: at, food_item_id: food });
    const rows = [
      g(0, '2026-10-21T08:00:00.000Z', 'older'),
      g(0, '2026-10-21T08:00:01+00:00', 'newer'), // the other ISO spelling, one second later (C-40)
      g(1, '2026-10-21T08:00:00.000Z', 'only'),
    ];
    expect(liveComponentRows(rows).map((x) => x.food_item_id)).toEqual(['newer', 'only']);
  });
});

describe('shares and the tie rule', () => {
  it('normalises shares over the live components', () => {
    const r = prng(6);
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: mintGenerationId(T0, 1, r), position: 0, share: 0.25 }),
      row({ id: mintGenerationId(T0, 1, r), position: 1, share: '0.5' }), // NUMERIC as text
    ]);
    expect(c.components.map((x) => x.normalizedShare)).toEqual([1 / 3, 2 / 3]);
    expect(c.dominant?.position).toBe(1);
  });

  it('normalises over LIVE rows only, never over a tombstoned food', () => {
    const r = prng(7);
    const gone = row({ id: mintGenerationId(T0, 1, r), position: 2, share: 0.5, deleted_at: '2026-10-21T09:00:00.000Z' });
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: generationSibling(gone.id, r), position: 0, share: 0.5 }),
      row({ id: generationSibling(gone.id, r), position: 1, share: 0.5 }),
      gone,
    ]);
    expect(c.components.map((x) => x.normalizedShare)).toEqual([0.5, 0.5]);
  });

  it('returns position 0 on a tie', () => {
    const r = prng(8);
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: mintGenerationId(T0, 1, r), position: 1, share: 0.5, food_item_id: 'second' }),
      row({ id: mintGenerationId(T0, 1, r), position: 0, share: 0.5, food_item_id: 'first' }),
    ]);
    expect(c.dominant?.foodItemId).toBe('first');
  });

  it('returns position 0, and no normalised share, when any share is unknown', () => {
    const r = prng(9);
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: mintGenerationId(T0, 1, r), position: 0, share: null, share_source: 'unknown' }),
      row({ id: mintGenerationId(T0, 1, r), position: 1, share: 0.9 }),
    ]);
    expect(c.components.map((x) => x.normalizedShare)).toEqual([null, null]);
    expect(c.dominant?.position).toBe(0);
    expect(dominantComponent([])).toBeNull();
  });
});

describe('status: live components win over the parent', () => {
  const r = prng(10);
  const two = () => [0, 1].map((p) => row({ id: mintGenerationId(T0, 3, r), position: p }));

  it('a plain meal is single', () => {
    expect(readMealComposition({ food_item_id: 'f', component_count: null }, [])).toEqual({
      status: 'single', consistent: true, components: [], dominant: null,
    });
  });

  it('component_count = 2 with one live component is incomplete', () => {
    const [first] = two();
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [first]);
    expect(c.status).toBe('incomplete');
    expect(c.consistent).toBe(false);
    expect(c.dominant).toBeNull();
  });

  it('component_count = 2 with no live component is incomplete, never one food', () => {
    expect(readMealComposition({ food_item_id: null, component_count: 2 }, []).status).toBe('incomplete');
  });

  it('a NULL count over two live components reads as a mix (inconsistent)', () => {
    const c = readMealComposition({ food_item_id: 'stale', component_count: null }, two());
    expect(c.status).toBe('mix');
    expect(c.consistent).toBe(false);
  });

  it('a count larger than the live set is incomplete', () => {
    expect(readMealComposition({ food_item_id: null, component_count: 3 }, two()).status).toBe('incomplete');
  });

  it('a mix whose parent agrees is consistent', () => {
    expect(readMealComposition({ food_item_id: null, component_count: 2 }, two()).consistent).toBe(true);
  });
});

describe('the composition key', () => {
  const r = prng(11);
  const comps = (a: number, b: number, foods = ['rabbit', 'chicken']) =>
    readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: mintGenerationId(T0, 1, r), position: 0, food_item_id: foods[0], share: a }),
      row({ id: mintGenerationId(T0, 1, r), position: 1, food_item_id: foods[1], share: b }),
    ]).components;

  it('is the sorted set of foods, whatever the order or ratio', () => {
    expect(compositionKey(comps(0.25, 0.75))).toBe(compositionKey(comps(0.5, 0.5, ['chicken', 'rabbit'])));
    expect(compositionKey(comps(0.25, 0.75))).toBe('id:chicken+id:rabbit');
  });

  it('with the ratio, separates two ratios and names each share', () => {
    expect(compositionKey(comps(0.25, 0.75), { withRatio: true })).not.toBe(compositionKey(comps(0.5, 0.5), { withRatio: true }));
    expect(compositionKey(comps(1 / 3, 2 / 3), { withRatio: true })).toBe('id:chicken@0.667+id:rabbit@0.333');
  });

  it('falls back to the snapshot name for a purged food, and folds one food named twice', () => {
    const c = readMealComposition({ food_item_id: null, component_count: 2 }, [
      row({ id: mintGenerationId(T0, 1, r), position: 0, food_item_id: null, food_label: ' Rabbit  Pâté ', share: 0.5 }),
      row({ id: mintGenerationId(T0, 1, r), position: 1, food_item_id: null, food_label: 'rabbit pâté', share: 0.5 }),
    ]).components;
    expect(compositionKey(c)).toBe('label:rabbit pâté');
    expect(compositionKey(c, { withRatio: true })).toBe('label:rabbit pâté@1.000');
  });
});

describe('the write plan', () => {
  it('a mix: tombstones every live row, inserts one generation, and names no food on the parent', () => {
    const r = prng(12);
    const prior = [0, 1].map((p) => row({ id: mintGenerationId(T0, 1, r), position: p }));
    const plan = planComponentWrite({ existing: prior, components: input(0.25, 0.75), nowMs: T0 + 10, random: r });
    expect(plan.tombstoneIds).toEqual(prior.map((p) => p.id));
    expect(plan.inserts.map((i) => i.position)).toEqual([0, 1]);
    expect(new Set(plan.inserts.map((i) => generationOf(i.id))).size).toBe(1);
    expect(plan.parent).toEqual({ food_item_id: null, component_count: 2 });
  });

  it('back to one food: no live rows, and a parent indistinguishable from one never mixed', () => {
    const r = prng(13);
    const prior = [0, 1].map((p) => row({ id: mintGenerationId(T0, 1, r), position: p }));
    const plan = planComponentWrite({ existing: prior, components: input(1), nowMs: T0 + 10, random: r });
    expect(plan.inserts).toEqual([]);
    expect(plan.tombstoneIds).toHaveLength(2);
    expect(plan.parent).toEqual({ food_item_id: 'food-0', component_count: null });
  });

  it('mints a generation later than any it has seen, even when the clock runs behind', () => {
    const r = prng(14);
    const seen = row({ id: mintGenerationId(T0 + 60_000, 1, r), position: 0, deleted_at: '2026-10-21T09:00:00.000Z' });
    const plan = planComponentWrite({ existing: [seen], components: input(0.5, 0.5), nowMs: T0, random: r });
    expect(generationMs(plan.inserts[0].id)).toBe(T0 + 60_001);
  });

  it('refuses no food, too many, a share that rounds to 0, an empty name, and a half amount', () => {
    const plan = (components: ComponentInput[]) => () => planComponentWrite({ existing: [], components, nowMs: T0 });
    expect(plan([])).toThrow(MealComponentInputError);
    expect(plan(input(...Array(9).fill(0.1)))).toThrow(MealComponentInputError);
    expect(plan(input(0.0004, 0.9996))).toThrow(MealComponentInputError);
    expect(plan(input(0, 1))).toThrow(MealComponentInputError);
    expect(plan([{ ...input(0.5)[0], foodLabel: '   ' }, input(0.5, 0.5)[1]])).toThrow(MealComponentInputError);
    expect(plan([{ ...input(0.5)[0], amountValue: 1 }, input(0.5, 0.5)[1]])).toThrow(MealComponentInputError);
  });

  it('trims and caps a name at 300 characters, and holds a share to 3 places', () => {
    const long = `  ${'x'.repeat(400)}  `;
    const plan = planComponentWrite({
      existing: [], nowMs: T0,
      components: [{ ...input(1 / 3)[0], foodLabel: long }, input(0.5, 2 / 3)[1]],
    });
    expect(plan.inserts[0].food_label).toHaveLength(300);
    expect(plan.inserts.map((i) => i.share)).toEqual([0.333, 0.667]);
  });
});

// ── §10: after any offline interleaving of two devices, the live set is one device's
//    whole set ──────────────────────────────────────────────────────────────────────
//
// One shared real clock (`world.now`); each phone reads it with its own skew. The server
// stamps as 105 does: an insert keeps the phone's updated_at, an update (the ON CONFLICT
// branch, even a no-op re-push) has it rewritten to server NOW by the trigger. Phones pull
// INCREMENTALLY, through the shipped watermark functions, because that is where a
// client-stamped insert goes missing (adversarial review, CUL-2051 F1).

const world = { now: T0 };

class Server {
  rows = new Map<string, MealComponentRow>();
  private tick = 0;
  private stamp(): string {
    this.tick += 1;
    return new Date(world.now + this.tick / 1000).toISOString();
  }
  upsert(r: MealComponentRow): void {
    const held = this.rows.get(r.id);
    if (!held) this.rows.set(r.id, { ...r });
    else this.rows.set(r.id, { ...held, deleted_at: r.deleted_at, updated_at: this.stamp() });
  }
}

class Device {
  rows = new Map<string, MealComponentRow & { synced: boolean }>();
  writes: string[][] = [];
  private watermark: string | null = null;
  constructor(public skewMs: number, private random: () => number) {}

  write(n: number): void {
    const clock = world.now + this.skewMs;
    const at = new Date(clock).toISOString();
    const shares = Array.from({ length: n }, () => 1 / n);
    const plan = planComponentWrite({ existing: [...this.rows.values()], components: input(...shares), nowMs: clock, random: this.random });
    for (const id of plan.tombstoneIds) {
      const r = this.rows.get(id)!;
      this.rows.set(id, { ...r, deleted_at: at, updated_at: at, synced: false });
    }
    for (const r of rowsOf(plan, at)) this.rows.set(r.id, { ...r, synced: false });
    this.writes.push(plan.inserts.map((i) => i.id).sort());
  }

  /** Push every unsynced row; `retry` re-sends some synced ones too (a lost ack).
   *  `serverStamp` is the shipped drain's double send (pushRows' opts). */
  push(server: Server, retry: boolean, serverStamp = true): void {
    for (const r of this.rows.values()) {
      if (!r.synced || (retry && this.random() < 0.5)) {
        server.upsert(r);
        if (serverStamp) server.upsert(r);
        this.rows.set(r.id, { ...r, synced: true });
      }
    }
  }

  /** hydrateMealComponents: incremental from the watermark, LWW, never over an unpushed
   *  local edit. */
  pull(server: Server): void {
    const floor = watermarkQueryFloor(this.watermark);
    const page = [...server.rows.values()].filter((s) => floor === null || Date.parse(s.updated_at) >= Date.parse(floor));
    for (const s of page) {
      const local = this.rows.get(s.id);
      if (!local) { this.rows.set(s.id, { ...s, synced: true }); continue; }
      if (local.synced && Date.parse(s.updated_at) > Date.parse(local.updated_at)) this.rows.set(s.id, { ...s, synced: true });
    }
    this.watermark = advanceWatermark(page.map((s) => s.updated_at), this.watermark);
  }

  live(): string[] {
    return liveComponentRows([...this.rows.values()]).map((r) => r.id).sort();
  }
}

const liveOn = (server: Server) => liveComponentRows([...server.rows.values()]).map((r) => r.id).sort();

describe('two devices, any interleaving (§10)', () => {
  it('the live set equals one write\'s whole set (or none), on the server and on both phones', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = prng(seed);
      world.now = T0;
      const server = new Server();
      // Skewed clocks, in either direction, up to a minute off.
      const a = new Device(Math.floor(random() * 120_000) - 60_000, random);
      const b = new Device(Math.floor(random() * 120_000) - 60_000, random);
      const steps = 4 + Math.floor(random() * 10);
      for (let i = 0; i < steps; i += 1) {
        // Up to 30 minutes between steps, so offline writes are pushed long after the overlap.
        world.now += Math.floor(random() * 30 * 60_000);
        const d = random() < 0.5 ? a : b;
        const op = random();
        if (op < 0.5) d.write(1 + Math.floor(random() * 4)); // 1 = back to a plain meal
        else if (op < 0.8) d.push(server, random() < 0.3);
        else d.pull(server);
      }
      world.now += 60_000;
      a.push(server, false); b.push(server, false);
      world.now += 60_000;
      a.pull(server); b.pull(server);

      const winner = liveOn(server);
      const sets = [...a.writes, ...b.writes];
      const isOneWrite = winner.length === 0 || sets.some((s) => s.length === winner.length && s.every((id, k) => id === winner[k]));
      if (!isOneWrite) throw new Error(`seed ${seed}: live set ${winner.join(',')} is not one write's set`);
      if (a.live().join() !== winner.join() || b.live().join() !== winner.join()) {
        throw new Error(`seed ${seed}: a phone disagrees with the server`);
      }
    }
  });

  it('an offline ratio edit pushed an hour later reaches the other phone (F1)', () => {
    const run = (serverStamp: boolean) => {
      world.now = T0;
      const random = prng(99);
      const server = new Server();
      const a = new Device(0, random);
      const b = new Device(0, random);
      a.write(2); a.push(server, false, serverStamp); b.pull(server);
      world.now += 5 * 60_000;
      a.write(2); // offline
      world.now += 15 * 60_000;
      // Unrelated server-stamped activity (another bowl's food taken out) moves B's watermark.
      const elsewhere = row({ id: 'another-bowl', position: 0, deleted_at: new Date(world.now).toISOString() });
      server.upsert(elsewhere); server.upsert(elsewhere);
      b.pull(server);
      world.now += 40 * 60_000;
      a.push(server, false, serverStamp);
      b.pull(server);
      return { server: liveOn(server), b: b.live() };
    };
    // Non-vacuity: a single send leaves B on the old set's tombstones, the bug itself.
    const single = run(false);
    expect(single.server).toHaveLength(2);
    expect(single.b).toEqual([]);
    const stamped = run(true);
    expect(stamped.b).toEqual(stamped.server);
    expect(stamped.b).toHaveLength(2);
  });

  it('is not vacuous: the interleavings produce mixes that survive, and contested ones', () => {
    let contested = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = prng(seed);
      world.now = T0;
      const server = new Server();
      const a = new Device(0, random);
      const b = new Device(30_000, random);
      a.write(3); b.write(2);
      a.push(server, false); b.push(server, false);
      expect(liveOn(server)).toHaveLength(2);
      // Both sets reached the server live: only the read rule stands between them and a union.
      if ([...server.rows.values()].filter((r) => r.deleted_at === null).length === 5) contested += 1;
    }
    expect(contested).toBe(400);
  });
});

/** A row id in the same generation as `id` (for the fixtures above). */
function generationSibling(id: string, random: () => number): string {
  const ms = generationMs(id)!;
  const randA = parseInt(generationOf(id).slice(12), 16);
  return mintGenerationId(ms, randA, random);
}
