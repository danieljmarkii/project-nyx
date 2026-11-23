// The filing precheck (PR-15, CUL-2876): its shield, its routes, the dormant category bar, and
// the replay of 60 recorded findings against the retro's prediction (D3 on CUL-2854).

import { SAMPLE } from './fixtures/findings-sample-2026-11.ts';
import { FILING_BAR, precheck, protectedReasons, rerouted, titleOverlap, triggerLine, type ProposedFinding, type Route } from './precheck.ts';

const base: ProposedFinding = { title: 'A thing on the report', direction: 'neither', origin: 'diff', devices: 1, timing: 'any', precondition: 'none', surface: 'vet report', category: 'adversarial-reviewer' };
const ctx = { open: [], standing: { 'vet report': 'CUL-9001' } };
const at = (over: Partial<ProposedFinding>, c: Partial<Parameters<typeof precheck>[1]> = {}) => precheck({ ...base, ...over }, { ...ctx, ...c });

describe('the shield: a finding that could quiet a warning is never rerouted', () => {
  // Every shape that would reroute an unshielded finding, applied to each shielded one.
  const reroutingShapes: [string, Partial<ProposedFinding>, Partial<Parameters<typeof precheck>[1]>][] = [
    ['on main', { origin: 'main' }, {}],
    ['two phones', { devices: 2 }, {}],
    ['a race', { timing: 'race' }, {}],
    ['clock skew', { timing: 'clock' }, {}],
    ['abnormal precondition', { precondition: 'abnormal' }, {}],
    ['a duplicate', { cites: [{ file: 'a.ts', snippet: 'x' }] }, { open: [{ id: 'CUL-1', title: 'A thing on the report', cites: ['a.ts'] }] }],
    ['already fixed', { cites: [{ file: 'a.ts', snippet: 'x' }] }, { mainHas: () => false }],
    ['under the bar', {}, { bar: 0.5, rates: { 'adversarial-reviewer': 0.1 } }],
  ];
  const shields: [string, Partial<ProposedFinding>][] = [
    ['QUIET', { direction: 'QUIET' }],
    ['untagged', { direction: undefined }],
    ['a QUIET bundle item under a LOUD tag (CUL-2406)', { direction: 'LOUD', items: [{ text: 'a', direction: 'LOUD' }, { text: 'b', direction: 'QUIET' }] }],
    ['an untagged bundle item', { items: [{ text: 'a', direction: 'neither' }, { text: 'b' }] }],
    ['exposure', { harm: 'exposure' }],
    ['loss', { harm: 'loss' }],
    ['corruption', { harm: 'corruption' }],
    ['Live harm', { labels: ['Live harm'] }],
    ['Gate: clinical', { labels: ['Gate: clinical'] }],
    ['Gate: privacy', { labels: ['Gate: privacy'] }],
  ];
  for (const [s, shield] of shields) {
    for (const [r, shape, c] of reroutingShapes) {
      it(`${s} + ${r} → file`, () => expect(at({ ...shape, ...shield }, c).route).toBe('file'));
    }
  }
  it('a shielded duplicate or fixed hit is a note on the filing, never a skip', () => {
    const r = at({ direction: 'QUIET', cites: [{ file: 'a.ts', snippet: 'x' }] }, { open: [{ id: 'CUL-1', title: 'A thing on the report', cites: ['a.ts'] }], mainHas: () => false }) as Extract<Route, { route: 'file' }>;
    expect(r.notes.join(' ')).toMatch(/possible duplicate of CUL-1/);
    expect(r.notes.join(' ')).toMatch(/gone from main/);
  });
  it('LOUD and neither with no bundle are not shielded', () => {
    expect(protectedReasons({ ...base, direction: 'LOUD' })).toEqual([]);
    expect(protectedReasons(base)).toEqual([]);
  });
});

describe('routes for an unshielded finding', () => {
  it('caused by this diff, one phone, normal timing → file', () => expect(at({}).route).toBe('file'));
  it('already on main → the standing issue for its surface', () => expect(at({ origin: 'main' })).toEqual({ route: 'standing', surface: 'vet report', issue: 'CUL-9001', why: 'on main' }));
  it('rare → the standing issue; a surface with none yet says so', () => expect(at({ devices: 2, surface: 'sync' })).toEqual({ route: 'standing', surface: 'sync', issue: undefined, why: 'rare' }));
  it('a duplicate needs the same file and a shared title, or a near-identical title', () => {
    const open = [{ id: 'CUL-1', title: 'Phone guard: run guard.mjs in CI', cites: ['g.mjs'] }];
    expect(at({ title: 'Phone guard: check paint and run it in CI', cites: [{ file: 'g.mjs', snippet: '' }] }, { open })).toEqual({ route: 'duplicate', issue: 'CUL-1' });
    expect(at({ title: 'Phone guard: check paint, opacity, clip and transform', cites: [{ file: 'other.ts', snippet: '' }] }, { open }).route).toBe('file');
    expect(titleOverlap('Sync banner ages', 'Sync banner ages')).toBe(1);
  });
  it('fixed only when every cited line is gone from main', () => {
    const cites = [{ file: 'a.ts', snippet: 'x' }, { file: 'b.ts', snippet: 'y' }];
    expect(at({ cites }, { mainHas: () => false }).route).toBe('fixed');
    expect(at({ cites }, { mainHas: (f) => f === 'b.ts' }).route).toBe('file');
    expect(at({}, { mainHas: () => false }).route).toBe('file');
  });
  it('the trigger line the sort reads (CUL-2123) maps onto its four causes only', () => {
    expect(triggerLine({ ...base, devices: 2 })).toBe('Trigger: rare (two phones)');
    expect(triggerLine({ ...base, timing: 'race' })).toBe('Trigger: rare (timing)');
    expect(triggerLine({ ...base, timing: 'clock' })).toBe('Trigger: rare (clock skew)');
    expect(triggerLine({ ...base, precondition: 'abnormal', preconditionCause: 'storage failure' })).toBe('Trigger: rare (storage failure)');
    expect(triggerLine({ ...base, precondition: 'abnormal', preconditionCause: 'other' })).toBeUndefined();
    expect(triggerLine(base)).toBeUndefined();
  });
});

describe('the category bar waits for the PM', () => {
  it('is unset, and unset switches nothing off', () => {
    expect(FILING_BAR).toBeNull();
    expect(at({}, { rates: { 'adversarial-reviewer': 0 } }).route).toBe('file');
  });
  it('once set, a category under it comments only; at or over it files', () => {
    expect(at({}, { bar: 0.3, rates: { 'adversarial-reviewer': 0.2 } })).toEqual({ route: 'comment', category: 'adversarial-reviewer', rate: 0.2, bar: 0.3 });
    expect(at({}, { bar: 0.3, rates: { 'adversarial-reviewer': 0.3 } }).route).toBe('file');
    expect(at({}, { bar: 0.3, rates: {} }).route).toBe('file');
  });
});

describe('replay: 60 recorded findings against the retro (CUL-2876)', () => {
  // Each finding sees every earlier sample finding as an open issue, as a filer would have.
  const open = SAMPLE.map((s) => ({ id: s.id, title: s.f.title, cites: (s.f.cites ?? []).map((c) => c.file) }));
  const routes = SAMPLE.map((s, i) => ({ ...s, r: precheck(s.f, { open: open.slice(0, i), standing: {} }) }));
  const of = (score: string) => routes.filter((x) => x.score === score);

  it('is the sample it says it is', () => {
    expect(SAMPLE).toHaveLength(60);
    expect(new Set(SAMPLE.map((s) => s.id)).size).toBe(60);
    expect([of('worth').length, of('low').length, of('other').length]).toEqual([24, 30, 6]);
  });
  it('reroutes no worth-fixing finding', () => {
    expect(of('worth').filter((x) => rerouted(x.r)).map((x) => x.id)).toEqual([]);
  });
  it('reroutes no QUIET or untagged finding, and nothing carrying Live harm or a Gate', () => {
    const shielded = routes.filter((x) => protectedReasons(x.f).length);
    expect(shielded.length).toBeGreaterThan(20);
    expect(shielded.filter((x) => rerouted(x.r)).map((x) => x.id)).toEqual([]);
  });
  it("reroutes low-value findings at the retro's predicted share (20 to 24 of 29: 69% to 83%)", () => {
    const low = of('low');
    const share = low.filter((x) => rerouted(x.r)).length / low.length;
    expect(share).toBeGreaterThanOrEqual(20 / 29);
    expect(share).toBeLessThanOrEqual(24 / 29);
  });
  it('routes each finding as recorded', () => {
    const got = Object.fromEntries(routes.map((x) => [x.id, x.r.route === 'standing' ? `standing:${x.r.why}` : x.r.route]));
    expect(got).toEqual(EXPECTED);
  });
});

// The recorded routes: a change to the rules shows here as a diff of named findings.
const EXPECTED: Record<string, string> = {
  'CUL-2091': 'file', 'CUL-2098': 'file', 'CUL-2106': 'file', 'CUL-2114': 'standing:on main', 'CUL-2122': 'file',
  'CUL-2131': 'standing:on main', 'CUL-2147': 'standing:on main', 'CUL-2157': 'standing:on main', 'CUL-2172': 'standing:on main',
  'CUL-2182': 'standing:on main', 'CUL-2192': 'standing:on main', 'CUL-2217': 'file', 'CUL-2274': 'file', 'CUL-2315': 'file',
  'CUL-2323': 'file', 'CUL-2331': 'file', 'CUL-2340': 'file', 'CUL-2351': 'file', 'CUL-2361': 'file', 'CUL-2369': 'standing:on main',
  'CUL-2378': 'file', 'CUL-2389': 'standing:rare', 'CUL-2399': 'standing:rare', 'CUL-2409': 'file', 'CUL-2418': 'standing:rare',
  'CUL-2426': 'standing:rare', 'CUL-2433': 'duplicate', 'CUL-2442': 'file', 'CUL-2452': 'standing:rare', 'CUL-2465': 'file',
  'CUL-2473': 'file', 'CUL-2483': 'standing:on main', 'CUL-2493': 'duplicate', 'CUL-2501': 'file', 'CUL-2510': 'file',
  'CUL-2519': 'file', 'CUL-2528': 'file', 'CUL-2547': 'file', 'CUL-2557': 'standing:on main', 'CUL-2567': 'standing:rare',
  'CUL-2575': 'file', 'CUL-2584': 'standing:rare', 'CUL-2593': 'file', 'CUL-2600': 'standing:rare', 'CUL-2608': 'file',
  'CUL-2618': 'file', 'CUL-2640': 'standing:on main', 'CUL-2648': 'file', 'CUL-2677': 'standing:on main', 'CUL-2686': 'file',
  'CUL-2694': 'standing:on main', 'CUL-2706': 'standing:on main', 'CUL-2714': 'file', 'CUL-2752': 'file', 'CUL-2793': 'file',
  'CUL-2801': 'file', 'CUL-2810': 'file', 'CUL-2831': 'standing:rare', 'CUL-2842': 'file', 'CUL-2850': 'standing:on main',
};
