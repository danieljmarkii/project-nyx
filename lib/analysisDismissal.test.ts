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

import { sameWords, writeAnalysisDismissal } from './analysisDismissal';

const CALM = { recommendation: 'monitor', read_text: 'Nothing obviously concerning on its own.' };

beforeEach(() => {
  mockCalls = [];
  mockResult = { data: [{ event_id: 'e1' }], error: null };
});

describe('writeAnalysisDismissal', () => {
  it('a Hide matches the event AND the words on screen, and asks for the rows it wrote', async () => {
    const iso = '2026-09-27T12:00:00.000Z';
    expect(await writeAnalysisDismissal('e1', CALM, iso)).toBe('written');
    expect(mockCalls).toEqual([
      ['from', 'event_ai_analysis'],
      ['update', { dismissed_at: iso }],
      ['eq', 'event_id', 'e1'],
      ['eq', 'recommendation', 'monitor'],
      ['eq', 'read_text', CALM.read_text],
      ['select', 'event_id'],
    ]);
  });

  it('a Show takes the same compare', async () => {
    expect(await writeAnalysisDismissal('e1', CALM, null)).toBe('written');
    expect(mockCalls).toContainEqual(['update', { dismissed_at: null }]);
    expect(mockCalls).toContainEqual(['eq', 'recommendation', 'monitor']);
    expect(mockCalls).toContainEqual(['eq', 'read_text', CALM.read_text]);
  });

  it('a null half compares with IS, never eq (eq never matches NULL)', async () => {
    await writeAnalysisDismissal('e1', { recommendation: null, read_text: null }, null);
    expect(mockCalls).toContainEqual(['is', 'recommendation', null]);
    expect(mockCalls).toContainEqual(['is', 'read_text', null]);
    expect(mockCalls.some((c) => c[0] === 'eq' && c[1] !== 'event_id')).toBe(false);
  });

  it('no row matched is the read having changed underneath, never a success', async () => {
    mockResult = { data: [], error: null };
    expect(await writeAnalysisDismissal('e1', CALM, '2026-09-27T12:00:00.000Z')).toBe('read_changed');
    mockResult = { data: null, error: null };
    expect(await writeAnalysisDismissal('e1', CALM, '2026-09-27T12:00:00.000Z')).toBe('read_changed');
  });

  it('an error is a failure', async () => {
    mockResult = { data: null, error: { message: 'network' } };
    expect(await writeAnalysisDismissal('e1', CALM, null)).toBe('failed');
  });
});

describe('sameWords', () => {
  it('is the verdict and the read text, nothing else', () => {
    expect(sameWords(CALM, { ...CALM })).toBe(true);
    expect(sameWords(CALM, { ...CALM, recommendation: 'worth_a_call' })).toBe(false);
    expect(sameWords(CALM, { ...CALM, read_text: 'Worth a call to your vet.' })).toBe(false);
    expect(sameWords({ recommendation: null, read_text: null }, { recommendation: null, read_text: null })).toBe(true);
  });
});
