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
  blood_present: 'none_visible',
  foreign_material_present: null,
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
      ['eq', 'blood_present', 'none_visible'],
      ['is', 'foreign_material_present', null],
      ['select', 'event_id'],
    ]);
  });

  it('a Show takes the same compare', async () => {
    expect(await writeAnalysisDismissal('e1', shownRead(CALM, VOMIT_DISMISSAL_COLUMNS), null)).toBe('written');
    expect(mockCalls).toContainEqual(['update', { dismissed_at: null }]);
    expect(mockCalls).toContainEqual(['eq', 'blood_present', 'none_visible']);
  });

  it('a null column compares with IS, never eq (eq never matches NULL)', async () => {
    const blank = { recommendation: null, read_text: null, stool_blood_present: null, foreign_material_present: null };
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

  it('a column that is not a string reads as null, the way the screen held it', () => {
    expect(shownRead({ ...CALM, blood_present: undefined }, VOMIT_DISMISSAL_COLUMNS).blood_present).toBeNull();
  });
});

describe('the red-flag columns mirror the server descriptors (C-34)', () => {
  // Same question as each descriptor's RED_FLAG_COLUMNS: which structured columns carry
  // a red flag. A column added there and not here would let a Hide made on a stale grid
  // cover the new finding.
  const serverColumns = (fn: string): string[] => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', fn, 'index.ts'), 'utf8');
    const m = /export const RED_FLAG_COLUMNS = \[([^\]]*)\]/.exec(src);
    if (!m) throw new Error(`${fn}: RED_FLAG_COLUMNS moved`);
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };
  it('vomit', () => {
    expect(VOMIT_DISMISSAL_COLUMNS.slice(2)).toEqual(serverColumns('analyze-vomit'));
  });
  it('stool', () => {
    expect(STOOL_DISMISSAL_COLUMNS.slice(2)).toEqual(serverColumns('analyze-stool'));
  });
});
