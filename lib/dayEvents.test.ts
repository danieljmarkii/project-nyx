// dayEvents imports ./dashboardCards → ./analytics → ./db (expo-sqlite) +
// ./feedingArrangements. Nothing here touches the DB — stub them so the native module
// chain isn't loaded under jest (the dashboardScreen.test.ts / analytics.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { describeDayEvent, describeDayEvents, daySheetSubtitle } from './dayEvents';
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
    intake_rating: null,
    drug_generic_name: null,
    drug_brand_name: null,
    adherence: null,
    ...over,
  } as unknown as TimelineRow;
}

describe('describeDayEvent (B-284 N5b drill-in labels)', () => {
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
