// CUL-1629, the second adversarial pass's F1: on a network slower than the re-read tick, a
// cancel-on-tick hook starved every answer and left the last clean one standing. These pin the
// fix: no read is cancelled by the next, the newest STARTED read wins, a moved row discards what
// was in flight, and a hung read leaves an answer whose age the line refuses.
import { renderHook, act } from '@testing-library/react-native';

type Facts = import('../lib/mayWaitLine').MayWaitFacts;
const mockLoads: { resolve: (f: Facts | null) => void; nowMs: number }[] = [];
jest.mock('../lib/mayWaitFacts', () => ({
  loadMayWaitFacts: (_e: string, _p: string, nowMs: number) =>
    new Promise((resolve) => mockLoads.push({ resolve, nowMs })),
}));

import { useMayWaitFacts } from './useMayWaitFacts';
import { mayWaitRefusalOf, MAY_WAIT_FRESH_MS } from '../lib/mayWaitLine';

const answer = (readAt: number, unsynced = false): Facts => ({
  readAt, anchorAt: new Date(0).toISOString(), serverAttachmentIds: [], localAttachmentIds: [],
  unsynced, vomits: [], stoolAt: [], lethargyAt: [], meals: [],
});

beforeEach(() => { mockLoads.length = 0; });

describe('useMayWaitFacts', () => {
  it('a read slower than the tick still lands: the next tick never cancels it', async () => {
    const { result, rerender } = renderHook((p: { tick: string }) => useMayWaitFacts('e', 'p', 'row1', p.tick, null, true), { initialProps: { tick: '1' } });
    rerender({ tick: '2' }); // the next tick starts a second read while the first hangs
    await act(async () => { mockLoads[0].resolve(answer(1, true)); });
    expect(result.current?.unsynced).toBe(true); // the first answer landed
    await act(async () => { mockLoads[1].resolve(answer(2, false)); });
    expect(result.current?.readAt).toBe(2); // and the newer one replaces it
  });

  it('an older read landing after a newer one never replaces it', async () => {
    const { result, rerender } = renderHook((p: { tick: string }) => useMayWaitFacts('e', 'p', 'row1', p.tick, null, true), { initialProps: { tick: '1' } });
    rerender({ tick: '2' });
    await act(async () => { mockLoads[1].resolve(answer(2, true)); });
    await act(async () => { mockLoads[0].resolve(answer(1, false)); });
    expect(result.current?.readAt).toBe(2);
    expect(result.current?.unsynced).toBe(true);
  });

  it('a moved row discards what was in flight for the old one', async () => {
    const { result, rerender } = renderHook((p: { rowKey: string }) => useMayWaitFacts('e', 'p', p.rowKey, '1', null, true), { initialProps: { rowKey: 'row1' } });
    rerender({ rowKey: 'row2' });
    await act(async () => { mockLoads[0].resolve(answer(1)); });
    expect(result.current).toBeNull();
    await act(async () => { mockLoads[1].resolve(answer(2)); });
    expect(result.current?.readAt).toBe(2);
  });

  it('STARVATION: every read after a clean one hangs; the clean answer ages out of the line', async () => {
    const t0 = 1_000_000;
    const { result, rerender } = renderHook((p: { tick: string; logged: unknown }) => useMayWaitFacts('e', 'p', 'row1', p.tick, p.logged, true), { initialProps: { tick: '0', logged: null as unknown } });
    await act(async () => { mockLoads[0].resolve(answer(t0)); });
    // The owner logs lethargy; then 29 ticks pass and no read ever answers.
    rerender({ tick: '0', logged: { kind: 'named' } });
    for (let i = 1; i < 30; i++) rerender({ tick: String(i), logged: { kind: 'named' } });
    expect(result.current?.readAt).toBe(t0); // the hook still holds the old clean answer...
    const gate = (nowMs: number, lastLoggedAt: number | null) => mayWaitRefusalOf({
      row: { status: 'completed', tier: 'call_today', engine_flags: ['engines_v3_en3'], may_wait: true, edited_at: null, error: null, updated_at: new Date(t0).toISOString(), photo_set_key: null, ai_raw_payload: null },
      freshRow: { may_wait: true, updated_at: new Date(t0).toISOString() }, freshReadAt: nowMs,
      lastLoggedAt, facts: result.current, kind: 'stool', petName: 'Rex', species: 'dog', birthDate: null, nowMs, offsetAt: () => 0,
    });
    // ...and the line refuses it: read before the log, and older than the cadence allows.
    expect(gate(t0 + 30_000, t0 + 10_000)).toBe('stale');
    expect(gate(t0 + MAY_WAIT_FRESH_MS + 1, null)).toBe('stale');
  });
});
