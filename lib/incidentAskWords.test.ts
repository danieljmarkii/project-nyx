import {
  askLevelOf,
  allAskStrings,
  DEFERENTIAL_ASK,
  FLOOR_ASK,
  floorReasonOf,
  hasFloorSign,
  KNOWN_ASK_FLAGS,
  WORD_STRIP_ASKS,
  type AskReasonRow,
} from './incidentAskWords';

const clean: AskReasonRow = {
  tier: 'call_today',
  contextual_flags: ['repeated_vomiting'],
  visual_flags: [],
  edited_at: null,
  blood_present: 'none_visible',
  foreign_material_present: 'no',
};

describe('askLevelOf: the floor', () => {
  it('a known, floor-free reason set is deferential (the dog that vomited twice)', () => {
    expect(askLevelOf(clean)).toBe('deferential');
    expect(askLevelOf({ ...clean, contextual_flags: ['repeated_loose_stool', 'concurrent_vomiting'] })).toBe('deferential');
    expect(askLevelOf({ ...clean, contextual_flags: ['concurrent_lethargy'] })).toBe('deferential');
  });

  it('the model\'s own call with no flag at all is deferential', () => {
    expect(askLevelOf({ ...clean, contextual_flags: [] })).toBe('deferential');
  });

  it.each([
    ['call_now', { ...clean, tier: 'call_now' }],
    ['fresh red blood', { ...clean, blood_present: 'fresh_red' }],
    ['coffee-ground blood', { ...clean, blood_present: 'coffee_ground' }],
    ['stool blood', { ...clean, blood_present: undefined, stool_blood_present: 'yes' }],
    ['foreign material', { ...clean, foreign_material_present: 'yes' }],
    ['the cat intake flag', { ...clean, contextual_flags: ['feline_reduced_intake'] }],
    ['a visual blood flag on an unedited rescue row', { ...clean, blood_present: null, visual_flags: ['blood'] }],
    ['a visual foreign flag on an unedited row', { ...clean, foreign_material_present: null, visual_flags: ['suspected_foreign_material'] }],
  ])('%s is floor', (_name, row) => {
    expect(askLevelOf(row as AskReasonRow)).toBe('floor');
  });

  it('a floor reason beside a deferential one wins (blood plus repeat vomiting)', () => {
    expect(floorReasonOf({ ...clean, blood_present: 'fresh_red', contextual_flags: ['repeated_vomiting'] })).toBe('blood');
    expect(askLevelOf({ ...clean, contextual_flags: ['repeated_vomiting', 'feline_reduced_intake'] })).toBe('floor');
  });

  it('an unknown contextual flag, visual flag or unreadable field is floor', () => {
    expect(floorReasonOf({ ...clean, contextual_flags: ['something_new'] })).toBe('unknown');
    expect(floorReasonOf({ ...clean, visual_flags: ['something_new'] })).toBe('unknown');
    expect(floorReasonOf({ ...clean, contextual_flags: 'not json' })).toBe('unknown');
    expect(floorReasonOf({ ...clean, contextual_flags: [42] })).toBe('unknown');
  });

  it('a reasons field the caller never supplied is floor, never a guess at the quiet answer', () => {
    const { contextual_flags: _c, ...noContext } = clean;
    expect(floorReasonOf(noContext)).toBe('unknown');
    const { visual_flags: _v, ...noVisual } = clean;
    expect(floorReasonOf(noVisual)).toBe('unknown');
    expect(floorReasonOf(null)).toBe('unknown');
  });

  it('the phone\'s JSON text of a text[] reads like the array', () => {
    expect(askLevelOf({ ...clean, contextual_flags: '["repeated_vomiting"]', visual_flags: '[]' })).toBe('deferential');
  });

  it('an owner edit silences the photo\'s flag only where the owner said none of THAT sign', () => {
    const edited = { ...clean, edited_at: '2026-11-01T10:00:00Z', visual_flags: ['blood'] };
    expect(askLevelOf(edited)).toBe('deferential'); // blood_present: none_visible, the owner's word
    expect(askLevelOf({ ...edited, blood_present: 'fresh_red' })).toBe('floor');
    // The adversarial pass's 5b: the owner edited the colour; blood stayed unsure under the model's flag.
    expect(askLevelOf({ ...edited, blood_present: 'unsure' })).toBe('floor');
    expect(askLevelOf({ ...edited, blood_present: null })).toBe('floor');
    const foreign = { ...clean, edited_at: '2026-11-01T10:00:00Z', visual_flags: ['suspected_foreign_material'] };
    expect(askLevelOf({ ...foreign, foreign_material_present: 'unsure' })).toBe('floor');
    expect(askLevelOf({ ...foreign, foreign_material_present: 'no' })).toBe('deferential');
    // A stool row's own blood column speaks for it.
    const stool = { tier: 'call_today', contextual_flags: ['repeated_loose_stool'], visual_flags: ['blood'], edited_at: '2026-11-01T10:00:00Z' };
    expect(askLevelOf({ ...stool, stool_blood_present: 'no' })).toBe('deferential');
    expect(askLevelOf({ ...stool, stool_blood_present: 'unsure' })).toBe('floor');
    // Edited or not, a visual field the caller never handed over is floor (rule 2).
    const { visual_flags: _v, ...editedNoVisual } = edited;
    expect(askLevelOf(editedNoVisual)).toBe('floor');
  });

  it('the live cat check adds the floor and never removes it', () => {
    expect(askLevelOf(clean, { catNoGoodMeal24h: true })).toBe('floor');
    expect(askLevelOf(clean, { catNoGoodMeal24h: false })).toBe('deferential');
    expect(askLevelOf({ ...clean, contextual_flags: ['feline_reduced_intake'] }, { catNoGoodMeal24h: false })).toBe('floor');
  });
});

describe('hasFloorSign: an earlier-rule or unknown tier (CUL-2675 (a))', () => {
  it('a floor sign raises the shipped "Worth a call"', () => {
    expect(hasFloorSign({ tier: null, blood_present: 'fresh_red' })).toBe(true);
    expect(hasFloorSign({ tier: 'mystery', foreign_material_present: 'yes' })).toBe(true);
    expect(hasFloorSign({ tier: null, contextual_flags: ['feline_reduced_intake'] })).toBe(true);
    expect(hasFloorSign({ tier: null, visual_flags: ['blood'], edited_at: null })).toBe(true);
  });

  it('absent fields are not a sign here: an old read keeps its words', () => {
    expect(hasFloorSign({ tier: null })).toBe(false);
    expect(hasFloorSign({ tier: null, contextual_flags: ['repeated_vomiting'] })).toBe(false);
  });

  it('a call_now tier alone is not a floor SIGN (it has its own words)', () => {
    expect(hasFloorSign({ tier: 'call_now', contextual_flags: [], visual_flags: [] })).toBe(false);
  });
});

describe('the words', () => {
  it('the floor words are today\'s call-today words, to the byte', () => {
    expect(FLOOR_ASK.label).toBe('Call your vet today');
    expect(FLOOR_ASK.action).toBe("Call your vet today. If they're closed, call an emergency clinic.");
  });

  it('every deferential ask keeps its clock (Pattern 11: soften the verb, keep the clock)', () => {
    for (const s of [DEFERENTIAL_ASK.label, DEFERENTIAL_ASK.short, DEFERENTIAL_ASK.imperative, DEFERENTIAL_ASK.door, DEFERENTIAL_ASK.inline, DEFERENTIAL_ASK.strip]) {
      expect(s).toMatch(/today/);
    }
    expect(DEFERENTIAL_ASK.action).toMatch(/same day/);
    expect(DEFERENTIAL_ASK.action).toMatch(/emergency clinic/);
  });

  it('no ask carries the Never column (Pattern 11)', () => {
    const never = /\b(if (this|it) isn'?t like|if you'?re not worried|can wait|no rush|when convenient|soon)\b/i;
    for (const s of allAskStrings()) expect(s).not.toMatch(never);
  });

  it('every strip verb fits the strip (STRIP_ASK_LINE_MAX = 20)', () => {
    for (const s of [FLOOR_ASK.strip, DEFERENTIAL_ASK.strip, WORD_STRIP_ASKS.tell, WORD_STRIP_ASKS.check]) {
      expect(s.length).toBeLessThanOrEqual(20);
    }
  });

  it('the known flag sets match the analyze-* flag types (a new server flag reds this)', () => {
    expect([...KNOWN_ASK_FLAGS.deferentialContextual, ...KNOWN_ASK_FLAGS.floorContextual].sort()).toEqual(
      ['concurrent_lethargy', 'concurrent_vomiting', 'feline_reduced_intake', 'repeated_loose_stool', 'repeated_vomiting'],
    );
    expect([...KNOWN_ASK_FLAGS.floorVisual].sort()).toEqual(['blood', 'suspected_foreign_material']);
  });
});
