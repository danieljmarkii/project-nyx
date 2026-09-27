// CUL-1323 — Hide / Show write only over the words the owner saw. The chain is
// recorded call by call so each filter is asserted, not just "some update ran".
type Call = [string, ...unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown[] | null; error: unknown } = { data: [{ event_id: 'e1' }], error: null };

jest.mock('./supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['update', 'eq', 'is']) {
    builder[method] = (...args: unknown[]) => {
      mockCalls.push([method, ...args]);
      return builder;
    };
  }
  builder.select = (...args: unknown[]) => {
    mockCalls.push(['select', ...args]);
    return Promise.resolve(mockResult);
  };
  return {
    supabase: {
      from: (table: string) => {
        mockCalls.push(['from', table]);
        return builder;
      },
    },
  };
});

import * as fs from 'fs';
import * as path from 'path';
import {
  sameShown,
  shownRead,
  writeAnalysisDismissal,
  VOMIT_DISMISSAL_COLUMNS,
  STOOL_DISMISSAL_COLUMNS,
} from './analysisDismissal';

const CALM = {
  recommendation: 'monitor',
  read_text: 'Nothing obviously concerning on its own.',
  colour: 'yellow',
  consistency: 'foamy',
  blood_present: 'none_visible',
  foreign_material_present: null,
  foreign_material_note: null,
};

beforeEach(() => {
  mockCalls = [];
  mockResult = { data: [{ event_id: 'e1' }], error: null };
});

describe('writeAnalysisDismissal', () => {
  it('a Hide matches the event AND every column the owner saw, and asks for the rows it wrote', async () => {
    const iso = '2026-09-27T12:00:00.000Z';
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), iso)).toBe('written');
    expect(mockCalls).toEqual([
      ['from', 'event_ai_analysis'],
      ['update', { dismissed_at: iso }],
      ['eq', 'event_id', 'e1'],
      ['eq', 'recommendation', 'monitor'],
      ['eq', 'read_text', CALM.read_text],
      ['eq', 'colour', 'yellow'],
      ['eq', 'consistency', 'foamy'],
      ['eq', 'blood_present', 'none_visible'],
      ['is', 'foreign_material_present', null],
      ['is', 'foreign_material_note', null],
      ['select', 'event_id'],
    ]);
  });

  it('a Show takes the same compare', async () => {
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), null)).toBe('written');
    expect(mockCalls).toContainEqual(['update', { dismissed_at: null }]);
    expect(mockCalls).toContainEqual(['eq', 'blood_present', 'none_visible']);
  });

  it('a null column compares with IS, never eq (eq never matches NULL)', async () => {
    const blank = Object.fromEntries(STOOL_DISMISSAL_COLUMNS.map((c) => [c, null])) as Record<(typeof STOOL_DISMISSAL_COLUMNS)[number], null>;
    await writeAnalysisDismissal('e1', shownRead(blank, STOOL_DISMISSAL_COLUMNS), null);
    for (const column of STOOL_DISMISSAL_COLUMNS) expect(mockCalls).toContainEqual(['is', column, null]);
    expect(mockCalls.some((c) => c[0] === 'eq' && c[1] !== 'event_id')).toBe(false);
  });

  it('no row matched is the read having changed underneath, never a success', async () => {
    mockResult = { data: [], error: null };
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), '2026-09-27T12:00:00.000Z')).toBe('read_changed');
    mockResult = { data: null, error: null };
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), '2026-09-27T12:00:00.000Z')).toBe('read_changed');
  });

  it('an error is a failure', async () => {
    mockResult = { data: null, error: { message: 'network' } };
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), null)).toBe('failed');
  });
});

describe('sameShown', () => {
  const seen = shownRead(CALM, VOMIT_DISMISSAL_COLUMNS);
  it('is the verdict, the words and the red-flag observations', () => {
    expect(sameShown({ ...CALM, colour: 'yellow' }, seen)).toBe(true);
    expect(sameShown({ ...CALM, recommendation: 'worth_a_call' }, seen)).toBe(false);
    expect(sameShown({ ...CALM, read_text: 'Worth a call to your vet.' }, seen)).toBe(false);
  });

  it('a new red flag under byte-identical words is a different read (adversarial round 2)', () => {
    expect(sameShown({ ...CALM, blood_present: 'fresh_red' }, seen)).toBe(false);
    expect(sameShown({ ...CALM, foreign_material_present: 'yes' }, seen)).toBe(false);
  });

  it('so is a change the grid draws through a column that is not a red flag on its own (round 3)', () => {
    // Stool "Blood: Fresh red" becoming "Dark / tarry" moves stool_blood_type only.
    const stool = {
      recommendation: 'worth_a_call', read_text: 'Worth a call.', stool_consistency: 'loose', stool_colour: 'brown',
      stool_blood_present: 'yes', stool_blood_type: 'fresh_red', stool_mucus_present: 'no',
      foreign_material_present: 'unsure', foreign_material_note: null,
    };
    const seenStool = shownRead(stool, STOOL_DISMISSAL_COLUMNS);
    expect(sameShown({ ...stool, stool_blood_type: 'dark_tarry' }, seenStool)).toBe(false);
    // An 'unsure' foreign-material row appears only once a note exists.
    expect(sameShown({ ...stool, foreign_material_note: 'a small fragment' }, seenStool)).toBe(false);
  });

  it('a column that is not a string reads as null, the way the screen held it', () => {
    expect(shownRead({ ...CALM, blood_present: undefined }, VOMIT_DISMISSAL_COLUMNS).blood_present).toBeNull();
  });
});

describe('the columns cover everything Hide takes off the screen (C-34)', () => {
  // The question is "what did the owner see", so the source of truth is each section's
  // observation grid, not the descriptors' red-flag list (round 3: stool_blood_type and
  // foreign_material_note draw red-flag rows without being red-flag columns). The
  // contents arrays are the one stated exclusion: no red flag, and PostgREST compares an
  // array only through its literal syntax.
  const ARRAY_COLUMNS = new Set(['contents', 'stool_content']);
  const gridColumns = (file: string): string[] => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'event', file), 'utf8');
    const start = src.indexOf('function buildObservations(');
    if (start < 0) throw new Error(`${file}: buildObservations moved`);
    const body = src.slice(start, src.indexOf('\n}\n', start));
    return [...new Set([...body.matchAll(/\brow\.(\w+)/g)].map((m) => m[1]))].filter((c) => !ARRAY_COLUMNS.has(c));
  };
  const serverColumns = (fn: string): string[] => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', fn, 'index.ts'), 'utf8');
    const m = /export const RED_FLAG_COLUMNS = \[([^\]]*)\]/.exec(src);
    if (!m) throw new Error(`${fn}: RED_FLAG_COLUMNS moved`);
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };
  it.each([
    ['VomitAnalysisSection.tsx', 'analyze-vomit', VOMIT_DISMISSAL_COLUMNS],
    ['StoolAnalysisSection.tsx', 'analyze-stool', STOOL_DISMISSAL_COLUMNS],
  ] as const)('%s', (file, fn, columns) => {
    const grid = gridColumns(file);
    expect(grid.length).toBeGreaterThanOrEqual(5); // the scan found the grid, not nothing
    const listed: readonly string[] = columns;
    expect(grid.filter((c) => !listed.includes(c))).toEqual([]);
    expect(serverColumns(fn).filter((c) => !listed.includes(c))).toEqual([]);
    expect(listed.slice(0, 2)).toEqual(['recommendation', 'read_text']);
  });
});
