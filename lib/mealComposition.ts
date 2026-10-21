// What a mixed bowl contains (Mixed meals row 2, CUL-2051; spec
// docs/nyx-mixed-meals-requirements.md §3 and §4).
//
// A mixed bowl is ONE meal event with N `meal_components` rows (T1). This module is the
// only place that decides which of those rows are the bowl, so the app and every Edge
// Function read a bowl the same way. It imports nothing and takes plain data, because it
// sits inside the C-26 shared-module boundary the moment row 3's server readers import
// it; nothing owner-facing belongs here.
//
// ── THE READ RULE: GENERATIONS (PM, 2026-10-21) ─────────────────────────────────────
// Components sync as a replace-whole-set unit. Every write mints a GENERATION: it
// tombstones every live row it can see and inserts the new set, every row of which
// carries the same generation stamp inside its id (a UUIDv7 layout: the write's
// millisecond, then 12 random bits shared by the whole set). The bowl is the live rows
// of the newest generation; within it, per position, the newest row (updated_at, then
// id) wins.
//
// Why not the spec's first rule (per position, the newest live row wins): it lets two
// phones' sets interleave. Phone A writes three foods, phone B later writes two, and
// per position the bowl becomes B's 0 and 1 plus A's 2, a union §10 forbids. It also
// leaned on `updated_at`, which the server's BEFORE UPDATE trigger rewrites on any
// re-push, so one retried row could outrank its own siblings. An id is minted here and
// never rewritten by anyone, so retries and hydration cannot split a set.
//
// Residual, stated: two phones writing one bowl in the same millisecond with the same 12
// random bits (1 in 4096 within that millisecond) share a generation, and the per-
// position rule then decides. A row whose id carries no generation (any non-v7 id: none
// is written today) belongs to the oldest generation, so a stamped set always wins.
//
// ── LIVE COMPONENTS WIN OVER THE PARENT ─────────────────────────────────────────────
// `meals.component_count` rides in the parent row; the components decide. Two or more
// live components are a mix whatever the count says, and fewer live components than the
// count says is INCOMPLETE (adversarial pass 1, break 3). No reader treats an incomplete
// bowl as one food; the clinical readers (rows 3–4) make it unclassifiable.

export const SHARE_SOURCES = ['preset', 'custom', 'amounts', 'unknown'] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

export const AMOUNT_UNITS = ['can', 'pouch', 'cup', 'tbsp', 'scoop', 'g', 'oz'] as const;
export type AmountUnit = (typeof AMOUNT_UNITS)[number];

/** Migration 105's bounds: positions 0..7, a label of 1..300 characters after trimming. */
export const MAX_MEAL_COMPONENTS = 8;
export const FOOD_LABEL_MAX = 300;

/** One `meal_components` row as either store holds it. Numerics are accepted as text
 *  too: PostgREST can hand NUMERIC back as a string. */
export interface MealComponentRow {
  id: string;
  position: number;
  food_item_id: string | null;
  food_label: string;
  share: number | string | null;
  share_source: string;
  amount_value: number | string | null;
  amount_unit: string | null;
  updated_at: string;
  deleted_at: string | null;
}

/** The parent `meals` fields the rule reads. */
export interface MealParent {
  food_item_id: string | null;
  component_count: number | null;
}

export interface ResolvedComponent {
  id: string;
  position: number;
  foodItemId: string | null;
  foodLabel: string;
  /** The share as the owner entered it. */
  share: number | null;
  /** The share over the bowl's live components, summing to 1. Null for every component
   *  when any share is missing: an unknown ratio is never filled in with a guess (T8). */
  normalizedShare: number | null;
  shareSource: string;
  amountValue: number | null;
  amountUnit: string | null;
}

export type MealCompositionStatus = 'single' | 'mix' | 'incomplete';

export interface MealComposition {
  /** `single`: a plain meal, read from `meals.food_item_id`. `mix`: two or more live
   *  components. `incomplete`: the parent or the rows say a mix, and the live set is
   *  smaller than that (or is one row): never one food, never a full mix. */
  status: MealCompositionStatus;
  /** Whether the parent agrees with the live set (count, and a NULL food on a mix).
   *  A `mix` can be inconsistent (a NULL count over two live rows still reads as a mix). */
  consistent: boolean;
  /** The bowl's live components in position order; empty for a plain meal. */
  components: ResolvedComponent[];
  /** For DISPLAY only (T2): the largest share; on a tie or an unknown ratio, the lowest
   *  position. No clinical reader may use it to stand for the bowl. Null unless a mix. */
  dominant: ResolvedComponent | null;
}

const SHARE_EPSILON = 1e-9;

function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parsed, never compared as text: the two ISO spellings of one instant sort apart (C-40). */
function instantOf(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * A row's generation: the 12 hex digits of milliseconds plus the 3 hex digits of the
 * set's shared random bits, as one fixed-width lowercase string, so generations compare
 * as text. '' for an id that carries none (not version 7), which ranks oldest.
 */
export function generationOf(id: string): string {
  const hex = id.toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(hex) || hex[12] !== '7') return '';
  return hex.slice(0, 12) + hex.slice(13, 16);
}

/** The millisecond a generation was minted at, or null for an unstamped id. */
export function generationMs(id: string): number | null {
  const g = generationOf(id);
  return g ? parseInt(g.slice(0, 12), 16) : null;
}

function newerRow(a: MealComponentRow, b: MealComponentRow): MealComponentRow {
  const ta = instantOf(a.updated_at);
  const tb = instantOf(b.updated_at);
  if (ta !== tb) return ta > tb ? a : b;
  return a.id > b.id ? a : b;
}

/** The read rule: the live rows of the newest generation, one per position, in position
 *  order. Every reader of a bowl goes through this. */
export function liveComponentRows(rows: readonly MealComponentRow[]): MealComponentRow[] {
  const live = rows.filter((r) => r.deleted_at === null || r.deleted_at === undefined);
  if (live.length === 0) return [];
  let newest = '';
  for (const r of live) {
    const g = generationOf(r.id);
    if (g > newest) newest = g;
  }
  const byPosition = new Map<number, MealComponentRow>();
  for (const r of live) {
    if (generationOf(r.id) !== newest) continue;
    const held = byPosition.get(r.position);
    byPosition.set(r.position, held ? newerRow(held, r) : r);
  }
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

function resolve(rows: readonly MealComponentRow[]): ResolvedComponent[] {
  const shares = rows.map((r) => toNumber(r.share));
  const known = shares.every((s): s is number => s !== null && s > 0);
  const total = known ? shares.reduce((sum, s) => sum + (s as number), 0) : 0;
  return rows.map((r, i) => ({
    id: r.id,
    position: r.position,
    foodItemId: r.food_item_id,
    foodLabel: r.food_label,
    share: shares[i],
    normalizedShare: known && total > 0 ? (shares[i] as number) / total : null,
    shareSource: r.share_source,
    amountValue: toNumber(r.amount_value),
    amountUnit: r.amount_unit,
  }));
}

/** The tie rule: the largest normalised share, and on a tie or an unknown ratio the
 *  lowest position. `components` must be in position order. */
export function dominantComponent(components: readonly ResolvedComponent[]): ResolvedComponent | null {
  if (components.length === 0) return null;
  let best = components[0];
  for (const c of components.slice(1)) {
    if (c.normalizedShare === null || best.normalizedShare === null) continue;
    if (c.normalizedShare > best.normalizedShare + SHARE_EPSILON) best = c;
  }
  return best;
}

/** What one meal is, from its parent row and every component row it has (live or not). */
export function readMealComposition(
  parent: MealParent,
  rows: readonly MealComponentRow[],
): MealComposition {
  const components = resolve(liveComponentRows(rows));
  const n = components.length;
  const count = parent.component_count ?? null;
  let status: MealCompositionStatus;
  if (n >= 2) status = count !== null && n < count ? 'incomplete' : 'mix';
  else if (n === 1) status = 'incomplete';
  else status = count === null ? 'single' : 'incomplete';
  const consistent = status === 'single'
    || (status === 'mix' && count === n && parent.food_item_id === null);
  return {
    status,
    consistent,
    components: status === 'single' ? [] : components,
    dominant: status === 'mix' ? dominantComponent(components) : null,
  };
}

/** A component's food identity: its food id, or its snapshot name once the food is
 *  purged (food_item_id SET NULL), case- and space-folded (a Class A key). */
export function componentFoodKey(c: Pick<ResolvedComponent, 'foodItemId' | 'foodLabel'>): string {
  if (c.foodItemId) return `id:${c.foodItemId}`;
  return `label:${c.foodLabel.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * The composition key: the sorted set of the bowl's food keys. With `withRatio`, each
 * key carries its normalised share to 3 places ('?' when the ratio is unknown), so two
 * bowls of the same foods at different ratios get different keys (History's runs, §7.2).
 * Two components with one food key are one food: their shares add.
 */
export function compositionKey(
  components: readonly ResolvedComponent[],
  opts: { withRatio?: boolean } = {},
): string {
  const byKey = new Map<string, number | null>();
  for (const c of components) {
    const k = componentFoodKey(c);
    const prior = byKey.has(k) ? byKey.get(k)! : 0;
    byKey.set(k, prior === null || c.normalizedShare === null ? null : prior + c.normalizedShare);
  }
  const keys = [...byKey.keys()].sort();
  if (!opts.withRatio) return keys.join('+');
  return keys.map((k) => {
    const s = byKey.get(k)!;
    return `${k}@${s === null ? '?' : s.toFixed(3)}`;
  }).join('+');
}

// ── The write plan (the one writer's pure half) ────────────────────────────────────

export interface ComponentInput {
  foodItemId: string;
  foodLabel: string;
  /** The owner's share, 0 < share <= 1. v1 never writes an unknown ratio (P-3). */
  share: number;
  shareSource: ShareSource;
  amountValue?: number | null;
  amountUnit?: AmountUnit | null;
}

export interface NewComponentRow {
  id: string;
  position: number;
  food_item_id: string;
  food_label: string;
  share: number;
  share_source: ShareSource;
  amount_value: number | null;
  amount_unit: AmountUnit | null;
}

export interface ComponentWritePlan {
  /** Every live row the write can see: the whole set is replaced (§3). */
  tombstoneIds: string[];
  /** The new generation; empty when the bowl goes back to one food. */
  inserts: NewComponentRow[];
  /** The parent's new food and count (T2: a mix names no food). */
  parent: MealParent;
}

function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, '0').slice(-width);
}

function randomBits(random: () => number, bits: number): number {
  return Math.floor(random() * 2 ** bits) % 2 ** bits;
}

/** A UUIDv7-shaped id stamped with one generation: `ms` and the shared `randA`, then 62
 *  bits of its own. */
export function mintGenerationId(ms: number, randA: number, random: () => number): string {
  const t = hex(ms, 12);
  const a = hex(randA & 0xfff, 3);
  const variant = hex(0x8 | randomBits(random, 2), 1);
  const b1 = hex(randomBits(random, 12), 3);
  const b2 = hex(randomBits(random, 24), 6) + hex(randomBits(random, 24), 6);
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7${a}-${variant}${b1}-${b2}`;
}

/** Thrown for an input the writer refuses; the message is for logs, never an owner. */
export class MealComponentInputError extends Error {}

function normalisedLabel(label: string): string {
  const trimmed = (label ?? '').trim().slice(0, FOOD_LABEL_MAX).trim();
  if (trimmed.length === 0) throw new MealComponentInputError('A component needs a food name');
  return trimmed;
}

/** NUMERIC(4,3) on the server: a share is held to 3 places here too, so the phone and
 *  the server hold one value and a share that rounds to 0 is refused before the push. */
function storedShare(share: number): number {
  if (typeof share !== 'number' || !Number.isFinite(share)) {
    throw new MealComponentInputError('A component needs a share');
  }
  const s = Math.round(share * 1000) / 1000;
  if (s <= 0 || s > 1) throw new MealComponentInputError('A share must be above 0 and at most 1');
  return s;
}

/**
 * The bowl becomes `components`. Tombstones every live row (any generation), and for two
 * or more foods mints a generation later than any this phone has seen, so a phone's own
 * edits always supersede each other whatever its clock does. One food leaves a plain
 * meal, indistinguishable from one never mixed. Zero foods is refused: there is no
 * zero-food meal.
 */
export function planComponentWrite(input: {
  existing: readonly MealComponentRow[];
  components: readonly ComponentInput[];
  nowMs: number;
  random?: () => number;
}): ComponentWritePlan {
  const random = input.random ?? Math.random;
  const { components } = input;
  if (components.length === 0) throw new MealComponentInputError('A meal has at least one food');
  if (components.length > MAX_MEAL_COMPONENTS) {
    throw new MealComponentInputError(`A bowl holds at most ${MAX_MEAL_COMPONENTS} foods`);
  }
  const tombstoneIds = input.existing
    .filter((r) => r.deleted_at === null || r.deleted_at === undefined)
    .map((r) => r.id);

  if (components.length === 1) {
    if (!components[0].foodItemId) throw new MealComponentInputError('A component needs a food');
    return { tombstoneIds, inserts: [], parent: { food_item_id: components[0].foodItemId, component_count: null } };
  }

  let seen = 0;
  for (const r of input.existing) seen = Math.max(seen, generationMs(r.id) ?? 0);
  const ms = Math.max(Math.trunc(input.nowMs), seen + 1);
  const randA = randomBits(random, 12);

  const inserts = components.map((c, position): NewComponentRow => {
    if (!c.foodItemId) throw new MealComponentInputError('A component needs a food');
    if (!(SHARE_SOURCES as readonly string[]).includes(c.shareSource)) {
      throw new MealComponentInputError('Unknown share source');
    }
    const amountValue = c.amountValue ?? null;
    const amountUnit = c.amountUnit ?? null;
    if ((amountValue === null) !== (amountUnit === null)) {
      throw new MealComponentInputError('An amount needs its unit');
    }
    if (amountValue !== null && !(Number.isFinite(amountValue) && amountValue > 0)) {
      throw new MealComponentInputError('An amount must be above 0');
    }
    if (amountUnit !== null && !(AMOUNT_UNITS as readonly string[]).includes(amountUnit)) {
      throw new MealComponentInputError('Unknown amount unit');
    }
    return {
      id: mintGenerationId(ms, randA, random),
      position,
      food_item_id: c.foodItemId,
      food_label: normalisedLabel(c.foodLabel),
      share: storedShare(c.share),
      share_source: c.shareSource,
      amount_value: amountValue,
      amount_unit: amountUnit,
    };
  });
  return { tombstoneIds, inserts, parent: { food_item_id: null, component_count: inserts.length } };
}
