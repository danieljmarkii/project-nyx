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
  VomitEditableFields,
  normalizeVomitEdits,
  extractEditableFromPayload,
  deriveEditedFields,
  buildVomitEditWrite,
} from './analysis';

const blank = (): VomitEditableFields => ({
  colour: null,
  consistency: null,
  contents: null,
  blood_present: null,
  foreign_material_present: null,
  foreign_material_note: null,
  description: null,
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
