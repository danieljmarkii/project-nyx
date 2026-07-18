// analysis.ts pulls in ./supabase (fail-fast env check) and ./sync (→ ./db →
// expo-sqlite, unresolvable under jest); stubbing both before the import resolves
// keeps this a pure-logic unit test (same shape as lib/meals.test.ts /
// account.test.ts). saveVomitFieldEdits is thin I/O over buildVomitEditWrite —
// the write SHAPE is tested via buildVomitEditWrite below; the round-trip is
// exercised by the Manual QA Script.
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  ensureEventAttachmentsSynced: jest.fn().mockResolvedValue(undefined),
}));

import {
  EDITABLE_VOMIT_FIELDS,
  EDITABLE_STOOL_FIELDS,
  VomitEditableFields,
  StoolEditableFields,
  normalizeVomitEdits,
  normalizeStoolEdits,
  extractEditableFromPayload,
  extractStoolEditableFromPayload,
  deriveEditedFields,
  deriveEditedStoolFields,
  buildVomitEditWrite,
  buildStoolEditWrite,
  triggerStoolAnalysis,
} from './analysis';
import { supabase } from './supabase';

// Grab a typed handle to the mocked invoke AFTER import (referencing it inside
// the jest.mock factory hits a TDZ/hoisting trap).
const mockInvoke = supabase.functions.invoke as jest.Mock;

const blank = (): VomitEditableFields => ({
  colour: null,
  consistency: null,
  contents: null,
  blood_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
});

describe('triggerStoolAnalysis (B-247)', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('invokes the analyze-stool function with the event id', async () => {
    mockInvoke.mockResolvedValue({ error: null });
    const res = await triggerStoolAnalysis('evt-1');
    // A typo in the function name silently means no stool read ever runs — lock it.
    expect(mockInvoke).toHaveBeenCalledWith('analyze-stool', { body: { event_id: 'evt-1' } });
    expect(res.error).toBeNull();
  });

  it('surfaces the invoke error message rather than throwing', async () => {
    mockInvoke.mockResolvedValue({ error: new Error('boom') });
    const res = await triggerStoolAnalysis('evt-2');
    expect(res.error).toBe('boom');
  });
});

describe('EDITABLE_STOOL_FIELDS (B-247)', () => {
  it('names the stool structured columns, never an n=1 read column', () => {
    // The editable set feeds the vet report and gates the client edit write —
    // it must never include a read/pipeline column, mirroring the vomit
    // never-clobber guarantee (a client edit can never alter the read).
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
      'edited_at',
    ]) {
      expect(EDITABLE_STOOL_FIELDS as readonly string[]).not.toContain(forbidden);
    }
    // The escalation-driving structured fields ARE owner-editable (the B-028
    // blood-correction case), so they must be present.
    expect(EDITABLE_STOOL_FIELDS as readonly string[]).toContain('stool_blood_present');
    expect(EDITABLE_STOOL_FIELDS as readonly string[]).toContain('stool_blood_type');
  });
});

describe('normalizeVomitEdits', () => {
  it('collapses empty strings and empty arrays to null (blank === absent)', () => {
    const n = normalizeVomitEdits({
      ...blank(),
      contents: [],
      foreign_material_note: '   ',
      description: '',
    });
    expect(n.contents).toBeNull();
    expect(n.foreign_material_note).toBeNull();
    expect(n.description).toBeNull();
  });

  it('trims text fields but preserves real content', () => {
    const n = normalizeVomitEdits({ ...blank(), description: '  A little yellow foam.  ' });
    expect(n.description).toBe('A little yellow foam.');
  });

  it('keeps enum + populated array values intact', () => {
    const n = normalizeVomitEdits({
      ...blank(),
      colour: 'yellow',
      blood_present: 'none_visible',
      contents: ['bile', 'foam'],
    });
    expect(n.colour).toBe('yellow');
    expect(n.blood_present).toBe('none_visible');
    expect(n.contents).toEqual(['bile', 'foam']);
  });

  it('de-dups contents (a set), preserving order — guards the marker mis-fire', () => {
    // A vision model can emit ['bile','bile']; without de-dup it would diff as an
    // edit against an owner's ['bile'] (adversarial-reviewer finding).
    const n = normalizeVomitEdits({ ...blank(), contents: ['bile', 'foam', 'bile'] });
    expect(n.contents).toEqual(['bile', 'foam']);
  });
});

describe('extractEditableFromPayload', () => {
  it('returns null when there is no payload (no AI baseline)', () => {
    expect(extractEditableFromPayload(null)).toBeNull();
    expect(extractEditableFromPayload(undefined)).toBeNull();
  });

  it('pulls only the editable fields out of a raw AI payload, normalized', () => {
    const got = extractEditableFromPayload({
      // Real ai_raw_payload shape — carries read fields too; they must be ignored.
      appears_to_show_vomit: true,
      colour: 'yellow',
      contents: ['bile', 'foam'],
      consistency: 'foamy',
      blood_present: 'none_visible',
      bile_present: 'yes',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'A small amount of yellow foam.',
      recommendation: 'monitor',
      read_text: "This one doesn't show anything concerning on its own.",
    });
    expect(got).toEqual({
      colour: 'yellow',
      consistency: 'foamy',
      contents: ['bile', 'foam'],
      blood_present: 'none_visible',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'A small amount of yellow foam.',
    });
    // bile_present is captured but not in the editable set — must not leak in.
    expect(got).not.toHaveProperty('bile_present');
  });

  it('drops non-string scalars and non-array contents to null', () => {
    const got = extractEditableFromPayload({ colour: 42, contents: 'bile' })!;
    expect(got.colour).toBeNull();
    expect(got.contents).toBeNull();
  });
});

describe('deriveEditedFields', () => {
  const ai: VomitEditableFields = {
    colour: 'yellow',
    consistency: 'foamy',
    contents: ['bile', 'foam'],
    blood_present: 'none_visible',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'A small amount of yellow foam.',
  };

  it('reports no edits when current matches the AI read exactly', () => {
    expect(deriveEditedFields({ ...ai }, ai)).toEqual([]);
  });

  it('reports no edits with no AI baseline to diff against', () => {
    expect(deriveEditedFields({ ...ai }, null)).toEqual([]);
  });

  it('flags the clinically load-bearing blood correction (the B-028 case)', () => {
    // The vet-report scenario: AI mis-read "Blood: none", owner corrects it.
    const edited = deriveEditedFields({ ...ai, blood_present: 'fresh_red' }, ai);
    expect(edited).toEqual(['blood_present']);
  });

  it('treats contents as a set — reorder is not an edit, add/remove is', () => {
    expect(deriveEditedFields({ ...ai, contents: ['foam', 'bile'] }, ai)).toEqual([]);
    expect(deriveEditedFields({ ...ai, contents: ['bile'] }, ai)).toEqual(['contents']);
  });

  it('a value reverted to the AI original is no longer "edited"', () => {
    // Owner corrects blood, then changes it back to what the AI said: value-based
    // diff correctly reports no edit (the report must not claim it as the owner's).
    expect(deriveEditedFields({ ...ai, blood_present: 'none_visible' }, ai)).toEqual([]);
  });

  it('flags clearing a field the AI had set', () => {
    expect(deriveEditedFields({ ...ai, colour: null }, ai)).toEqual(['colour']);
  });

  it('flags adding a field the AI left blank', () => {
    const aiNoNote = { ...ai, foreign_material_present: 'yes', foreign_material_note: null };
    const edited = deriveEditedFields(
      { ...aiNoNote, foreign_material_note: 'a strand of thread' },
      aiNoNote,
    );
    expect(edited).toEqual(['foreign_material_note']);
  });

  it('does not flag a whitespace-only / blank no-op against an absent field', () => {
    expect(deriveEditedFields({ ...ai, foreign_material_note: '   ' }, ai)).toEqual([]);
  });

  it('reports multiple independent edits', () => {
    const edited = deriveEditedFields(
      { ...ai, colour: 'green', blood_present: 'fresh_red' },
      ai,
    );
    expect(edited.sort()).toEqual(['blood_present', 'colour']);
  });
});

describe('buildVomitEditWrite — client-side never-clobber guarantee', () => {
  const NOW = '2026-06-22T10:00:00.000Z';
  const edits: VomitEditableFields = {
    colour: 'green',
    consistency: 'watery',
    contents: ['undigested_food'],
    blood_present: 'fresh_red',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Looked different this time.',
  };

  it('always stamps edited_at (this is what arms the re-analysis guard)', () => {
    expect(buildVomitEditWrite(blank(), NOW).edited_at).toBe(NOW);
    expect(buildVomitEditWrite(edits, NOW).edited_at).toBe(NOW);
  });

  it('writes ONLY the editable fields + edited_at — never a read column', () => {
    const w = buildVomitEditWrite(edits, NOW);
    expect(Object.keys(w).sort()).toEqual(
      [...EDITABLE_VOMIT_FIELDS, 'edited_at'].sort(),
    );
    // The read is owner-facing and dismissible-not-editable — a client edit must
    // never touch it, nor the cached original, nor the pipeline status.
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
    ]) {
      expect(w).not.toHaveProperty(forbidden);
    }
  });

  it('normalizes the written values (blank text/array → null)', () => {
    const w = buildVomitEditWrite(
      { ...blank(), description: '  ', contents: [] },
      NOW,
    );
    expect(w.description).toBeNull();
    expect(w.contents).toBeNull();
  });
});

// ── Stool edit machinery (B-247 PR 6) ─────────────────────────────────────────
const blankStool = (): StoolEditableFields => ({
  stool_consistency: null,
  stool_colour: null,
  stool_content: null,
  stool_blood_present: null,
  stool_blood_type: null,
  stool_mucus_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
});

describe('normalizeStoolEdits', () => {
  it('collapses empty strings and empty arrays to null (blank === absent)', () => {
    const n = normalizeStoolEdits({
      ...blankStool(),
      stool_content: [],
      foreign_material_note: '   ',
      description: '',
    });
    expect(n.stool_content).toBeNull();
    expect(n.foreign_material_note).toBeNull();
    expect(n.description).toBeNull();
  });

  it('de-dups stool_content (a set), preserving order', () => {
    const n = normalizeStoolEdits({ ...blankStool(), stool_content: ['hair', 'grass', 'hair'] });
    expect(n.stool_content).toEqual(['hair', 'grass']);
  });

  it('clears stool_blood_type when blood is not present (server-parity)', () => {
    // A "Dark / tarry" type left behind after the owner corrects blood → "None"
    // would let colour/blood corroboration drift — clear it (matches analyze-stool).
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'no', stool_blood_type: 'dark_tarry' }).stool_blood_type).toBeNull();
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'unsure', stool_blood_type: 'fresh_red' }).stool_blood_type).toBeNull();
    // Preserved when blood IS present.
    expect(normalizeStoolEdits({ ...blankStool(), stool_blood_present: 'yes', stool_blood_type: 'fresh_red' }).stool_blood_type).toBe('fresh_red');
  });
});

describe('extractStoolEditableFromPayload', () => {
  it('returns null when there is no payload (no AI baseline)', () => {
    expect(extractStoolEditableFromPayload(null)).toBeNull();
    expect(extractStoolEditableFromPayload(undefined)).toBeNull();
  });

  it('maps the UN-prefixed payload keys onto the prefixed editable fields, normalized', () => {
    const got = extractStoolEditableFromPayload({
      // Real ai_raw_payload shape (StoolAnalysis) — un-prefixed keys, carries read
      // fields too; they must be ignored.
      appears_to_show_stool: true,
      consistency: 'type_6_mushy',
      colour: 'brown',
      contents: ['hair'],
      blood_present: 'yes',
      blood_type: 'fresh_red',
      mucus_present: 'no',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'Soft and unformed.',
      recommendation: 'monitor',
      read_text: 'Keep an eye on things.',
    });
    expect(got).toEqual({
      stool_consistency: 'type_6_mushy',
      stool_colour: 'brown',
      stool_content: ['hair'],
      stool_blood_present: 'yes',
      stool_blood_type: 'fresh_red',
      stool_mucus_present: 'no',
      foreign_material_present: 'no',
      foreign_material_note: null,
      description: 'Soft and unformed.',
    });
    // Read fields must not leak into the editable set.
    expect(got).not.toHaveProperty('recommendation');
    expect(got).not.toHaveProperty('read_text');
  });
});

describe('deriveEditedStoolFields', () => {
  const ai: StoolEditableFields = {
    stool_consistency: 'type_6_mushy',
    stool_colour: 'brown',
    stool_content: ['hair'],
    stool_blood_present: 'no',
    stool_blood_type: null,
    stool_mucus_present: 'no',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Soft and unformed.',
  };

  it('reports no edits when current matches the AI read exactly', () => {
    expect(deriveEditedStoolFields({ ...ai }, ai)).toEqual([]);
  });

  it('reports no edits with no AI baseline to diff against', () => {
    expect(deriveEditedStoolFields({ ...ai }, null)).toEqual([]);
  });

  it('flags the clinically load-bearing blood correction (the B-028 case)', () => {
    // AI mis-read "Blood: none", owner corrects it to fresh red — the escalation-
    // driving field is owner-editable and the edit must be attributable.
    const edited = deriveEditedStoolFields(
      { ...ai, stool_blood_present: 'yes', stool_blood_type: 'fresh_red' },
      ai,
    );
    expect(edited.sort()).toEqual(['stool_blood_present', 'stool_blood_type']);
  });

  it('treats stool_content as a set — reorder is not an edit, add/remove is', () => {
    expect(deriveEditedStoolFields({ ...ai, stool_content: ['hair'] }, ai)).toEqual([]);
    expect(deriveEditedStoolFields({ ...ai, stool_content: ['hair', 'grass'] }, ai)).toEqual(['stool_content']);
  });

  it('does not flag an orphan blood_type once blood is cleared (normalize parity)', () => {
    // Owner sets blood present + fresh, then reverts presence to "no": both the
    // presence AND the type collapse back to the AI original (no spurious edit).
    const withBlood = { ...ai, stool_blood_present: 'no' as string | null, stool_blood_type: 'fresh_red' as string | null };
    expect(deriveEditedStoolFields(withBlood, ai)).toEqual([]);
  });
});

describe('buildStoolEditWrite — client-side never-clobber guarantee', () => {
  const NOW = '2026-07-17T10:00:00.000Z';
  const edits: StoolEditableFields = {
    stool_consistency: 'type_7_watery',
    stool_colour: 'red_streaked',
    stool_content: ['undigested_food'],
    stool_blood_present: 'yes',
    stool_blood_type: 'fresh_red',
    stool_mucus_present: 'yes',
    foreign_material_present: 'no',
    foreign_material_note: null,
    description: 'Looked different this time.',
  };

  it('always stamps edited_at (this is what arms the re-analysis guard)', () => {
    expect(buildStoolEditWrite(blankStool(), NOW).edited_at).toBe(NOW);
    expect(buildStoolEditWrite(edits, NOW).edited_at).toBe(NOW);
  });

  it('writes ONLY the editable fields + edited_at — never a read column', () => {
    const w = buildStoolEditWrite(edits, NOW);
    expect(Object.keys(w).sort()).toEqual([...EDITABLE_STOOL_FIELDS, 'edited_at'].sort());
    for (const forbidden of [
      'recommendation',
      'read_text',
      'visual_flags',
      'contextual_flags',
      'status',
      'ai_raw_payload',
      'ai_confidence',
      'dismissed_at',
    ]) {
      expect(w).not.toHaveProperty(forbidden);
    }
  });
});
