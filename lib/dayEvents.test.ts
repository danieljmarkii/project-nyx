// dayEvents imports ./dashboardCards → ./analytics → ./db (expo-sqlite) +
// ./feedingArrangements. Nothing here touches the DB — stub them so the native module
// chain isn't loaded under jest (the dashboardScreen.test.ts / analytics.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  describeDayEvent,
  describeDayEvents,
  describeDayEventDoors,
  daySheetSubtitle,
  eventTintCategory,
  assertNeverCategory,
  productKeyOf,
  productNameBesideTag,
  rowFoodLabelOf,
  unfinishedIntakePhrase,
} from './dayEvents';
import type { TimelineRow } from './db';

// A TimelineRow filled only with the fields describeDayEvent reads; the rest are nulled.
function row(over: Partial<TimelineRow>): TimelineRow {
  return {
    event_type: 'other',
    occurred_at: '2026-06-24T12:00:00.000Z',
    occurred_at_confidence: null,
    occurred_at_earliest: null,
    occurred_at_latest: null,
    food_brand: null,
    food_product_name: null,
    food_type: null,
    food_format: null,
    intake_rating: null,
    drug_generic_name: null,
    drug_brand_name: null,
    adherence: null,
    ...over,
  } as unknown as TimelineRow;
}

describe('describeDayEvent (B-284 N5b drill-in labels)', () => {
  // B-568 — the drill-in must be able to tell apart two rows of one product stocked in
  // both forms. Before this, "Royal Canin · Selected Protein PR" wet and dry rendered
  // as the same string on the same day.
  it('carries the wet/dry variant as a separate tag, not inside the truncating title', () => {
    const dry = describeDayEvent(row({
      event_type: 'meal', food_brand: 'Royal Canin',
      food_product_name: 'Selected Protein PR', food_type: 'meal', food_format: 'dry_kibble',
    }));
    const wet = describeDayEvent(row({
      event_type: 'meal', food_brand: 'Royal Canin',
      food_product_name: 'Selected Protein PR', food_type: 'meal', food_format: 'wet_canned',
    }));
    // Same title — that IS the collision; the tag is what separates them.
    expect(dry.title).toBe('Royal Canin · Selected Protein PR');
    expect(wet.title).toBe(dry.title);
    expect(dry.formatTag).toBe('DRY');
    expect(wet.formatTag).toBe('WET');
    // Kept OUT of the title on purpose: the title truncates and the tag must not.
    expect(dry.title).not.toContain('DRY');
  });

  it('adds no tag when the form is unspecified or would echo the row label', () => {
    expect(describeDayEvent(row({
      event_type: 'meal', food_product_name: 'Salmon', food_type: 'meal', food_format: 'other',
    })).formatTag).toBeNull();
    // A treat-format treat already reads "Treat" — no "TREAT" tag beside it.
    expect(describeDayEvent(row({
      event_type: 'meal', food_type: 'treat', food_format: 'treat',
    })).formatTag).toBeNull();
    // A non-meal row never carries one.
    expect(describeDayEvent(row({ event_type: 'vomit' })).formatTag).toBeNull();
  });

  it('a meal with a food + intake → food name title + intake qualifier, not a symptom', () => {
    const d = describeDayEvent(
      row({ event_type: 'meal', food_brand: 'Acme', food_product_name: 'Salmon', food_type: 'meal', intake_rating: 'all' }),
    );
    expect(d.title).toBe('Acme · Salmon');
    expect(d.detail).toBe('all eaten');
    expect(d.category).toBe('meal'); // meal teal, not the symptom rose (B-311)
  });

  it('a treat with no food name reads "Treat"; a plain meal with no rating shows no detail', () => {
    expect(describeDayEvent(row({ event_type: 'meal', food_type: 'treat' })).title).toBe('Treat');
    const plain = describeDayEvent(row({ event_type: 'meal', food_type: 'meal' }));
    expect(plain.title).toBe('Meal');
    expect(plain.detail).toBeNull();
  });

  it('surfaces a refusal plainly, never softened', () => {
    const d = describeDayEvent(row({ event_type: 'meal', food_product_name: 'Kibble', intake_rating: 'refused' }));
    expect(d.detail).toBe('refused');
  });

  it('a medication dose → drug label + adherence; a null adherence NEVER reads as given', () => {
    const given = describeDayEvent(
      row({ event_type: 'medication', drug_generic_name: 'Amoxicillin', drug_brand_name: 'Amoxil', adherence: 'given' }),
    );
    expect(given.title).toBe('Amoxicillin · Amoxil');
    expect(given.detail).toBe('given');

    // The safety invariant: an unrecorded adherence shows no qualifier — it is never
    // assumed "given" (B-156 G1 "unanswered ≠ given").
    const untouched = describeDayEvent(row({ event_type: 'medication', drug_generic_name: 'Insulin', adherence: null }));
    expect(untouched.title).toBe('Insulin');
    expect(untouched.detail).toBeNull();

    const missed = describeDayEvent(row({ event_type: 'medication', drug_generic_name: 'Insulin', adherence: 'missed' }));
    expect(missed.detail).toBe('missed');
  });

  it('a nameless dose reads "Medication" and carries the medication (slate) category', () => {
    const d = describeDayEvent(row({ event_type: 'medication' }));
    expect(d.title).toBe('Medication');
    expect(d.category).toBe('medication'); // its own slate tint, never indigo/teal (B-311)
  });

  it('a symptom carries the type label + the rose (symptom) tint, no detail', () => {
    const d = describeDayEvent(row({ event_type: 'vomit' }));
    expect(d.title).toBe('Vomit');
    expect(d.category).toBe('symptom');
    expect(d.detail).toBeNull();
  });

  it('a weight check reads "Weight" and is neutral (no category tint)', () => {
    const d = describeDayEvent(row({ event_type: 'weight_check' }));
    expect(d.title).toBe('Weight');
    expect(d.category).toBe('other'); // falls back to the neutral fg-2 glyph
  });

  it('an estimated time renders honestly (~), not a false-precise point', () => {
    const d = describeDayEvent(row({ event_type: 'vomit', occurred_at_confidence: 'estimated' }));
    expect(d.time.startsWith('~')).toBe(true);
  });
});

describe('a look on the spine (CUL-868) — the fifth category', () => {
  it('a check_in row categorises as look, and never as symptom or other', () => {
    expect(eventTintCategory('check_in')).toBe('look');
    // The two it must not fall into: 'symptom' would tint it rose on every row
    // surface and fire the symptom commit haptic; 'other' is the bucket the count
    // line and the lead used to sweep into an event count (§5.1 rows 1a/1b).
    expect(eventTintCategory('lethargy')).toBe('symptom');
    expect(eventTintCategory('weight_check')).toBe('other');
  });

  it('renders as Noticed, with nothing invented about what it said', () => {
    const look = describeDayEvent(row({ event_type: 'check_in' }));
    expect(look.category).toBe('look');
    expect(look.title).toBe('Noticed');
    // The words and the note live on the `looks` child, which a TimelineRow does not
    // carry. A detail here would be this surface claiming to know what a look said;
    // the row that names them is N-3's (CUL-869).
    expect(look.detail).toBeNull();
    expect(look.formatTag).toBeNull();
  });

  it('keeps its own time, and sorts with everything else', () => {
    const rows = [
      row({ event_type: 'meal', occurred_at: '2026-06-24T18:00:00.000Z' }),
      row({ event_type: 'check_in', occurred_at: '2026-06-24T07:04:00.000Z' }),
    ];
    const out = describeDayEvents(rows);
    expect(out.map((r) => r.category)).toEqual(['look', 'meal']);
    expect(out[0].time).toBeTruthy();
  });

  // The exhaustiveness mechanism, exercised rather than asserted: `assertNeverCategory`
  // is the runtime half of the guarantee tsc gives at compile time, and a category
  // that reached it would mean a branch nobody wrote.
  it('assertNeverCategory throws rather than returning undefined', () => {
    expect(() => assertNeverCategory('unheard_of' as never)).toThrow(/Unhandled event tint category/);
  });
});

describe('describeDayEvents (chronological order)', () => {
  it('sorts earliest-first regardless of input order', () => {
    const rows = [
      row({ event_type: 'meal', occurred_at: '2026-06-24T18:00:00.000Z' }),
      row({ event_type: 'vomit', occurred_at: '2026-06-24T06:00:00.000Z' }),
      row({ event_type: 'meal', occurred_at: '2026-06-24T12:00:00.000Z' }),
    ];
    const out = describeDayEvents(rows);
    expect(out.map((e) => e.timeMs)).toEqual([...out.map((e) => e.timeMs)].sort((a, b) => a - b));
    expect(out[0].eventType).toBe('vomit'); // 06:00 leads
  });
});

describe('describeDayEventDoors (CUL-320 — the month\'s rows are doors)', () => {
  it('is describeDayEvents, same order and words, with each row carrying the id it opens', () => {
    const rows = [
      row({ id: 'm', event_type: 'meal', occurred_at: '2026-06-24T18:00:00.000Z' } as Partial<TimelineRow>),
      row({ id: 'v', event_type: 'vomit', occurred_at: '2026-06-24T06:00:00.000Z' } as Partial<TimelineRow>),
    ];
    const doors = describeDayEventDoors(rows);
    expect(doors.map((d) => d.id)).toEqual(['v', 'm']);
    expect(doors.map(({ id: _id, ...display }) => display)).toEqual(describeDayEvents(rows));
  });
});

describe('daySheetSubtitle (never an all-clear)', () => {
  it('nothing logged', () => {
    expect(daySheetSubtitle('Vomiting', 0, 0)).toBe('Nothing logged this day.');
  });

  it('names the symptom count and pluralizes "times", never "episodes"', () => {
    expect(daySheetSubtitle('Vomiting', 3, 5)).toBe('Vomiting logged 3 times · everything this day:');
    expect(daySheetSubtitle('Vomiting', 1, 2)).toBe('Vomiting logged 1 time · everything this day:');
  });

  it('a symptom-free day with other events is factual, not a reassurance', () => {
    expect(daySheetSubtitle('Vomiting', 0, 4)).toBe('No vomiting logged · everything this day:');
  });
});

// ── The row's product name and product key (History v2 HV-6 / CUL-1163; rule B, rule K) ──

describe('productNameBesideTag — a trailing word that only repeats the tag is dropped', () => {
  it('drops ", Dry" beside a DRY tag and ", Wet" beside a WET one (the owner’s two Royal Canin items)', () => {
    expect(productNameBesideTag('Selected Protein PR, Dry', 'dry_kibble', 'Meal')).toBe('Selected Protein PR');
    expect(productNameBesideTag('Selected Protein PR, Wet', 'wet_canned', 'Meal')).toBe('Selected Protein PR');
  });

  it('reads the qualifier off the item’s OWN format, never a fixed word list (BRK-12)', () => {
    // The record disagrees with itself: the row shows both halves rather than choosing.
    expect(productNameBesideTag('Selected Protein PR, Wet', 'dry_kibble', 'Meal')).toBe('Selected Protein PR, Wet');
    // Any format the one label map names, spelled the way the map spells it.
    expect(productNameBesideTag('Rabbit Bites, Freeze-dried', 'freeze_dried', 'Treat')).toBe('Rabbit Bites');
    expect(productNameBesideTag('Turkey (Raw)', 'raw', 'Meal')).toBe('Turkey');
    expect(productNameBesideTag('Turkey - Raw', 'raw', 'Meal')).toBe('Turkey');
  });

  it('touches nothing when there is no tag beside it, or no separator before the word', () => {
    expect(productNameBesideTag('Mystery Food, Dry', 'other', 'Meal')).toBe('Mystery Food, Dry');
    expect(productNameBesideTag('Mystery Food, Dry', null, 'Meal')).toBe('Mystery Food, Dry');
    // A treat-format treat shows no tag (it would echo "Treat"), so its name keeps the word.
    expect(productNameBesideTag('Tasty Chicken, Treat', 'treat', 'Treat')).toBe('Tasty Chicken, Treat');
    expect(productNameBesideTag("Hill's Dry", 'dry_kibble', 'Meal')).toBe("Hill's Dry");
  });

  it('never strips a name to nothing', () => {
    expect(productNameBesideTag(', Dry', 'dry_kibble', 'Meal')).toBe(', Dry');
    expect(productNameBesideTag('Dry', 'dry_kibble', 'Meal')).toBe('Dry');
    expect(productNameBesideTag('   ', 'dry_kibble', 'Meal')).toBeNull();
  });

  it('rowFoodLabelOf names the food beside its tag: "Royal Canin · Selected Protein PR"', () => {
    expect(rowFoodLabelOf({ brand: 'Royal Canin', product: 'Selected Protein PR, Dry', format: 'dry_kibble', rowLabel: 'Meal' })).toBe(
      'Royal Canin · Selected Protein PR',
    );
  });
});

describe('CONVERGENCE (a Class A key, CLAUDE.md § Canonical keys): f(f(x)) === f(x), over a cross product', () => {
  const NAMES = [
    'Selected Protein PR, Dry',
    'Selected Protein PR, Dry, Dry',
    'Selected Protein PR , dry',
    'Selected Protein PR (Dry)',
    'Selected Protein PR - Dry',
    'Selected Protein PR, Wet',
    'Selected Protein PR',
    ', Dry',
    'Dry',
    'Dry, Dry',
    'Freeze-dried, Freeze-dried',
    'Tasty Chicken, Treat',
    '  padded , Wet  ',
    '',
  ];
  const FORMATS = [null, 'dry_kibble', 'wet_canned', 'freeze_dried', 'treat', 'other', 'a_format_from_the_future'];
  const LABELS = ['Meal', 'Treat'];
  const cases = NAMES.flatMap((n) => FORMATS.flatMap((f) => LABELS.map((l) => [n, f, l] as const)));

  it('builds a non-trivial product (and strips on some of it)', () => {
    expect(cases.length).toBe(NAMES.length * FORMATS.length * LABELS.length);
    expect(cases.some(([n, f, l]) => productNameBesideTag(n, f, l) !== (n.trim() || null))).toBe(true);
  });

  it.each(cases)('%p · %p · %p', (name, format, label) => {
    const once = productNameBesideTag(name, format, label);
    expect(productNameBesideTag(once, format, label)).toBe(once);
    // The key is stable under the same re-application (a key computed from a stripped
    // name is the key of the unstripped one).
    expect(productKeyOf({ brand: 'Royal Canin', product: once, format, rowLabel: label })).toBe(
      productKeyOf({ brand: 'Royal Canin', product: name, format, rowLabel: label }),
    );
  });
});

describe('productKeyOf — which product a meal is of', () => {
  const key = (brand: string | null, product: string | null, format: string | null, rowLabel = 'Meal') =>
    productKeyOf({ brand, product, format, rowLabel });

  it('wet and dry of one line are ONE product (the run crosses them)', () => {
    expect(key('Royal Canin', 'Selected Protein PR, Dry', 'dry_kibble')).toBe(key('Royal Canin', 'Selected Protein PR, Wet', 'wet_canned'));
  });

  it('formatting noise folds (case, spacing, trademark glyphs, apostrophes); a word never does', () => {
    expect(key('Hill’s®', '  Z/D  ', 'dry_kibble')).toBe(key("hill's", 'z/d', 'dry_kibble'));
    expect(key('Wellness', 'Core', 'dry_kibble')).not.toBe(key('Wellness Core', '', 'dry_kibble'));
  });

  it('another brand or another product is another key', () => {
    expect(key('Royal Canin', 'Selected Protein PR', 'dry_kibble')).not.toBe(key('Purina', 'Selected Protein PR', 'dry_kibble'));
    expect(key('Royal Canin', 'Selected Protein PR', 'dry_kibble')).not.toBe(key('Royal Canin', 'Weight Care', 'dry_kibble'));
  });

  it('a tagged and an untagged member are never one run (its second line speaks for every member)', () => {
    expect(key('Delectables', 'Squeeze Up with Chicken & Duck', 'wet_canned', 'Treat')).not.toBe(
      key('Delectables', 'Squeeze Up with Chicken & Duck', 'treat', 'Treat'),
    );
  });

  it('a meal that names no food has no key: it never joins a run', () => {
    expect(key(null, null, 'dry_kibble')).toBeNull();
    expect(key('  ', '', null)).toBeNull();
  });
});

describe('unfinishedIntakePhrase — the vehicle meal’s intake beside a dose', () => {
  it('names Some, Picked and Refused in the drill-in’s words; says nothing for a finished or unrated bowl', () => {
    expect(unfinishedIntakePhrase('some')).toBe('some eaten');
    expect(unfinishedIntakePhrase('picked')).toBe('picked at');
    expect(unfinishedIntakePhrase('refused')).toBe('refused');
    for (const r of ['all', 'most', null, undefined, 'odd']) expect(unfinishedIntakePhrase(r)).toBeNull();
  });
});
