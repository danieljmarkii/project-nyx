// Mixed meals row 4 (CUL-2053; spec §7.2, §10) — a mixed bowl on History and Home's spine.
//
// One row, one node: "⅓ Chicken Pâté + ⅔ Rabbit Pâté", the ratio as the owner entered it
// (a stop as its fraction, anything else "~45%", never a default 50/50). Runs key on the
// composition PLUS the ratio, so identical mixes fold and a ratio step breaks the run; a
// mix never joins a plain meal of one of its foods; an incomplete bowl never joins a run
// and never reads as one food. The rows are built through the real composition helper
// (generations), never hand-written bowls.

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { bowlFromRows, type AppBowl, type BowlFood } from './mealBowls';
import { mintGenerationId, type MealComponentRow } from './mealComposition';
import { bowlRowLabel, shareGlyph, INCOMPLETE_BOWL_TAIL } from './mealBowlLabel';
import { buildSpine, type SpineEventInput, type SpineInput } from './spineNode';
import { describeDayEvent } from './dayEvents';
import type { TimelineRow } from './db';

const food = (productName: string, format = 'wet_canned'): BowlFood => ({
  brand: 'Acme',
  productName,
  foodType: 'meal',
  format,
  primaryProtein: null,
  proteins: [],
});
const CHICKEN = { id: 'chicken', label: 'Chicken Pâté', food: food('Chicken Pâté') };
const RABBIT = { id: 'rabbit', label: 'Rabbit Pâté', food: food('Rabbit Pâté') };
const DUCK = { id: 'duck', label: 'Duck Loaf', food: food('Duck Loaf') };

let gen = 1_760_000_000_000;
function bowl(parts: { f: typeof CHICKEN; share: number }[], count: number | null = parts.length): AppBowl {
  gen += 1;
  let i = 0;
  const rows: (MealComponentRow & { food: BowlFood })[] = parts.map((p, position) => ({
    id: mintGenerationId(gen, 7, () => ((i = (i * 7 + 3) % 97) / 97)),
    position,
    food_item_id: p.f.id,
    food_label: p.f.label,
    share: p.share,
    share_source: 'preset',
    amount_value: null,
    amount_unit: null,
    updated_at: '2026-10-21T08:00:00.000Z',
    deleted_at: null,
    food: p.f.food,
  }));
  const b = bowlFromRows({ food_item_id: null, component_count: count }, rows);
  if (!b) throw new Error('expected a bowl');
  return b;
}
const THIRDS = () => bowl([{ f: CHICKEN, share: 0.333 }, { f: RABBIT, share: 0.667 }]);
const QUARTERS = () => bowl([{ f: CHICKEN, share: 0.25 }, { f: RABBIT, share: 0.75 }]);

describe('the label (spec §7.2, T8)', () => {
  it('prints a preset stop as its fraction, a custom share as ~N%, and an unknown share as nothing', () => {
    expect([0.25, 0.333, 0.5, 0.667, 0.75].map(shareGlyph)).toEqual(['¼', '⅓', '½', '⅔', '¾']);
    expect(shareGlyph(0.45)).toBe('~45%');
    expect(shareGlyph(0.448)).toBe('~45%');
    expect(shareGlyph(null)).toBeNull();
  });

  it('names both foods with their shares, in bowl order, without the brand or the format', () => {
    expect(bowlRowLabel(THIRDS()).text).toBe('⅓ Chicken Pâté + ⅔ Rabbit Pâté');
  });

  it('a 3-food mix synced from elsewhere still renders: two named, "+1 more"', () => {
    const three = bowl([{ f: CHICKEN, share: 0.25 }, { f: RABBIT, share: 0.5 }, { f: DUCK, share: 0.25 }]);
    const label = bowlRowLabel(three);
    expect(label.more).toBe(1);
    expect(label.text).toBe('¼ Chicken Pâté + ½ Rabbit Pâté +1 more');
  });

  it('an incomplete bowl shows what it can see, no ratio, and never reads as one food', () => {
    const partial = bowl([{ f: CHICKEN, share: 0.333 }], 2);
    expect(partial.status).toBe('incomplete');
    const label = bowlRowLabel(partial);
    expect(label.segments).toEqual([{ share: null, name: 'Chicken Pâté' }]);
    expect(label.text).toBe(`Chicken Pâté ${INCOMPLETE_BOWL_TAIL}`);
  });
});

// ── The spine ─────────────────────────────────────────────────────────────────

const BASE = new Date(2026, 9, 21, 0, 0, 0, 0).getTime();
const iso = (h: number, m = 0) => new Date(BASE + (h * 60 + m) * 60_000).toISOString();
function mealRow(id: string, h: number, extra: Partial<SpineEventInput> = {}): SpineEventInput {
  return { id, pet_id: 'p1', event_type: 'meal', occurred_at: iso(h), occurred_at_confidence: 'witnessed', food_type: 'meal', ...extra };
}
function spine(rows: SpineEventInput[]) {
  const input: SpineInput = { rows, photographed: new Set(), analysis: new Map(), working: new Set(), feedings: [], freeFedSpans: [] };
  return buildSpine(input).nodes;
}

describe('the spine (spec §7.2)', () => {
  it('a mix is one node titled Meal, its foods and shares as the detail and the mix label', () => {
    const [node] = spine([mealRow('a', 8, { meal_bowl: THIRDS() })]);
    expect(node.kind).toBe('event');
    if (node.kind !== 'event') return;
    expect(node.title).toBe('Meal');
    expect(node.detail).toBe('⅓ Chicken Pâté + ⅔ Rabbit Pâté');
    expect(node.mix?.segments.map((s) => s.share)).toEqual(['⅓', '⅔']);
    expect(node.formatTag).toBeNull();
  });

  it('identical mixes fold into one run; a ratio step breaks it so the step stays visible', () => {
    const nodes = spine([
      mealRow('a', 7, { meal_bowl: THIRDS() }),
      mealRow('b', 9, { meal_bowl: THIRDS() }),
      mealRow('c', 12, { meal_bowl: THIRDS() }),
      mealRow('d', 18, { meal_bowl: QUARTERS() }),
    ]);
    expect(nodes.map((n) => (n.kind === 'compact' ? `run:${n.count}` : n.id))).toEqual(['run:3', 'd']);
  });

  it('a mix never joins a run of plain meals of one of its foods', () => {
    const plain = { food_brand: 'Acme', food_product_name: 'Rabbit Pâté', food_format: 'wet_canned' };
    const nodes = spine([
      mealRow('p1', 7, plain),
      mealRow('p2', 9, plain),
      mealRow('m', 12, { meal_bowl: THIRDS() }),
      mealRow('p3', 15, plain),
    ]);
    expect(nodes.some((n) => n.kind === 'compact' && n.ids.includes('m'))).toBe(false);
  });

  it('an incomplete bowl never joins a run', () => {
    const partial = () => bowl([{ f: CHICKEN, share: 0.333 }], 2);
    const nodes = spine([mealRow('a', 7, { meal_bowl: partial() }), mealRow('b', 9, { meal_bowl: partial() })]);
    expect(nodes.every((n) => n.kind === 'event')).toBe(true);
  });
});

describe('the day row describer (the recap and the Noticed list)', () => {
  it('names a mix by its foods and shares, with no format tag', () => {
    const row = { id: 'a', event_type: 'meal', occurred_at: iso(8), food_type: 'meal', meal_bowl: THIRDS() } as unknown as TimelineRow;
    const d = describeDayEvent(row);
    expect(d.title).toBe('⅓ Chicken Pâté + ⅔ Rabbit Pâté');
    expect(d.formatTag).toBeNull();
  });
});
