// CUL-2678: every list chip (History, the month, the gallery, the Home spine) says what the record
// says, because they resolve through the record's own rules (`tierChipOf` beside `tierLabelOf`).
// The record's label is the oracle here, never a re-derived rule (C-34): each case asserts the
// chip's full phrase EQUALS `incidentReadLabel` over the same row, then pins the narrow form.

// `tileChipOf` lives in the Signal screen's loader, which imports the client and the database.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./db', () => ({ getDb: () => ({}) }));

import { incidentReadLabel } from './incidentReadState';
import { DEFERENTIAL_ASK, FLOOR_ASK } from './incidentAskWords';
import { louderReadAs, TIER_WORDS, tierChipOf, tierDisplayOf } from './incidentTierWords';
import { readVerdictOf, type ReadCopy } from './readState';
import { nodeReadOf, type SpineAnalysisRow } from './spineNode';
import { tileChipOf } from './signalScreen';
import { dayMarkA11yLabel } from './chartCopy';

const EN3 = JSON.stringify(['engines_v3_en3']);

/** A copy row as the phone holds it after this build's pull. */
function copy(over: Partial<SpineAnalysisRow> = {}): SpineAnalysisRow {
  return {
    event_id: 'e1',
    status: 'completed',
    recommendation: 'worth_a_call',
    updated_at: '2026-11-08T10:00:00+00:00',
    photo_set_key: null,
    rule_version: null,
    engine_flags: EN3,
    tier: 'call_today',
    contextual_flags: '[]',
    visual_flags: '[]',
    blood_present: null,
    stool_blood_present: null,
    foreign_material_present: null,
    ...over,
  };
}

/** The record's label for the same row, with the same cat check (its live `catNoGoodMeal24hOf`). */
function recordLabel(c: SpineAnalysisRow): string {
  const parse = (v: string | null | undefined) => (v == null ? undefined : (JSON.parse(v) as unknown));
  return incidentReadLabel(
    {
      status: c.status,
      recommendation: c.recommendation,
      tier: c.tier,
      engine_flags: c.engine_flags,
      contextual_flags: parse(c.contextual_flags),
      visual_flags: parse(c.visual_flags),
      blood_present: c.blood_present,
      stool_blood_present: c.stool_blood_present,
      foreign_material_present: c.foreign_material_present,
    },
    { catNoGoodMeal24h: c.catNoGoodMeal24h },
  );
}

const chipOf = (c: SpineAnalysisRow) => readVerdictOf({ eventType: 'vomit', hasPhoto: true, copy: c, inFlight: false, readingOff: false }).chip;
const spineOf = (c: SpineAnalysisRow) => nodeReadOf(c, false, { eventType: 'vomit', hasPhoto: true });

describe('the list chip is the record’s words (CUL-2678)', () => {
  const cases: [string, SpineAnalysisRow, string, string][] = [
    // [name, row, short, label]
    ['a deferential call today (a dog that vomited twice)', copy({ contextual_flags: '["repeated_vomiting"]' }), DEFERENTIAL_ASK.short, DEFERENTIAL_ASK.label],
    ['a call today over blood', copy({ visual_flags: '["blood"]', blood_present: 'fresh_red' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['a call today with blood plus repeat vomiting (any floor reason wins)', copy({ contextual_flags: '["repeated_vomiting"]', visual_flags: '["blood"]' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['a call today whose cat meets the live check', copy({ contextual_flags: '["repeated_vomiting"]', catNoGoodMeal24h: true }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['a call today whose cat ate well', copy({ contextual_flags: '["repeated_vomiting"]', catNoGoodMeal24h: false }), DEFERENTIAL_ASK.short, DEFERENTIAL_ASK.label],
    ['a call today with a reason this build does not know', copy({ contextual_flags: '["new_server_flag"]' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['an earlier-rule read over blood (the QUIET instance)', copy({ tier: null, engine_flags: null, visual_flags: '["blood"]', blood_present: 'fresh_red' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['an earlier-rule read over foreign material', copy({ tier: null, engine_flags: null, visual_flags: '["suspected_foreign_material"]' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['an earlier-rule read with a stool blood column and no flag', copy({ tier: null, engine_flags: null, stool_blood_present: 'yes' }), FLOOR_ASK.short, FLOOR_ASK.label],
    ['an earlier-rule read with no floor sign', copy({ tier: null, engine_flags: null, contextual_flags: '["repeated_vomiting"]' }), TIER_WORDS.worth_a_call.short, TIER_WORDS.worth_a_call.label],
    ['a call now', copy({ tier: 'call_now' }), TIER_WORDS.call_now.short, TIER_WORDS.call_now.label],
  ];

  it.each(cases)('%s: the chip, the Home spine and History say the record’s words', (_name, row, short, label) => {
    const record = recordLabel(row);
    expect(record).toBe(label);
    expect(chipOf(row)).toMatchObject({ short, label });
    const node = spineOf(row);
    expect(node).toEqual({ state: 'worth_a_call', label: short, spoken: label });
  });

  it('a row pulled before this build (no reasons yet) stays where it stood: a call today at the floor, an earlier call as it was', () => {
    const unpulled = { contextual_flags: null, visual_flags: null };
    expect(chipOf(copy(unpulled))).toMatchObject({ short: FLOOR_ASK.short, label: FLOOR_ASK.label });
    expect(chipOf(copy({ ...unpulled, tier: null, engine_flags: null }))).toMatchObject({
      short: TIER_WORDS.worth_a_call.short,
      label: TIER_WORDS.worth_a_call.label,
    });
  });

  it('the readAs form follows the same words', () => {
    const display = (c: SpineAnalysisRow) => tierDisplayOf(c)!;
    const dfr = copy({ contextual_flags: '["repeated_vomiting"]' });
    expect(tierChipOf(display(dfr), dfr).readAs).toBe(DEFERENTIAL_ASK.label.toLowerCase());
    const raised = copy({ tier: null, engine_flags: null, visual_flags: '["blood"]' });
    expect(tierChipOf(display(raised), raised).readAs).toBe(TIER_WORDS.call_today.readAs);
  });

  it('a quiet read carries no chip (its words do not depend on a reason)', () => {
    const calm = copy({ recommendation: 'monitor', tier: 'logged' });
    expect(readVerdictOf({ eventType: 'vomit', hasPhoto: true, copy: calm as ReadCopy, inFlight: false, readingOff: false }).chip).toBeUndefined();
  });
});

describe('a gallery tile speaks its bout’s loudest words (tileChipOf)', () => {
  const chip = (c: SpineAnalysisRow) => chipOf(c)!;
  const deferential = chip(copy({ contextual_flags: '["repeated_vomiting"]' }));
  const raisedBlood = chip(copy({ tier: null, engine_flags: null, visual_flags: '["blood"]' }));
  const earlier = chip(copy({ tier: null, engine_flags: null }));
  const callNow = chip(copy({ tier: 'call_now' }));

  it('a deferential call today beside an earlier-rule read over blood is the floor: that row’s record says so', () => {
    expect(tileChipOf(['a', 'b'], { a: deferential, b: raisedBlood })?.label).toBe(FLOOR_ASK.label);
  });
  it('call now leads, then the floor, then a deferential call today, then an earlier call', () => {
    expect(tileChipOf(['a', 'b', 'c'], { a: earlier, b: deferential, c: callNow })?.label).toBe(TIER_WORDS.call_now.label);
    expect(tileChipOf(['a', 'b'], { a: earlier, b: deferential })?.label).toBe(DEFERENTIAL_ASK.label);
    expect(tileChipOf(['a'], {})).toBeNull();
  });
});

describe('the month speaks a day in the record’s words (ruling (a), 2026-11-08)', () => {
  it('louderReadAs ranks the words a reader hears', () => {
    expect(louderReadAs(TIER_WORDS.worth_a_call.readAs, TIER_WORDS.call_today.readAs)).toBe(TIER_WORDS.call_today.readAs);
    expect(louderReadAs(DEFERENTIAL_ASK.label.toLowerCase(), TIER_WORDS.call_today.readAs)).toBe(TIER_WORDS.call_today.readAs);
    expect(louderReadAs(TIER_WORDS.worth_a_call.readAs, DEFERENTIAL_ASK.label.toLowerCase())).toBe(DEFERENTIAL_ASK.label.toLowerCase());
    expect(louderReadAs(null, TIER_WORDS.call_now.readAs)).toBe(TIER_WORDS.call_now.readAs);
  });

  it('a day’s spoken label says the read’s own words', () => {
    const base = { dayKey: '2026-09-02', count: 1, coverage: 'logged' as const, medication: false, photo: 'none' as const, answers: true, symptomLayer: true, today: false, selected: false };
    expect(dayMarkA11yLabel({ ...base, call: 'worth_a_call', callReadAs: 'call today' }, 'vomiting')).toContain('read as call today');
    expect(dayMarkA11yLabel({ ...base, call: 'call_today', callReadAs: 'worth a call today' }, 'vomiting')).toContain('read as worth a call today');
    // No words handed: the map's, as before.
    expect(dayMarkA11yLabel({ ...base, call: 'worth_a_call' }, 'vomiting')).toContain('read as worth a call');
  });
});
