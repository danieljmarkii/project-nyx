// The filing precheck (PR-15, CUL-2876): its shield, its routes, the dormant category bar, and
// the replay of 60 recorded findings against the retro's prediction (D3 on CUL-2854).

import { SAMPLE } from './fixtures/findings-sample-2026-11.ts';
import { FILING_BAR, precheck, protectedReasons, rerouted, titleOverlap, triggerLine, type ProposedFinding, type Route } from './precheck.ts';

const base: ProposedFinding = { title: 'A thing on the report', direction: 'neither', origin: 'diff', devices: 1, timing: 'any', precondition: 'none', harm: 'none', surface: 'vet report', category: 'adversarial-reviewer', text: 'Direction: neither · Harm: none' };
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
    ['already fixed', { origin: 'main', cites: [{ file: 'a.ts', snippet: 'x' }] }, { mainHas: () => false }],
    ['under the bar', {}, { bar: 0.5, rates: { 'adversarial-reviewer': 0.1 } }],
  ];
  const shields: [string, Partial<ProposedFinding>][] = [
    ['QUIET', { direction: 'QUIET' }],
    ['untagged', { direction: undefined }],
    ['a QUIET bundle item under a LOUD tag (CUL-2406)', { direction: 'LOUD', items: [{ text: 'a', direction: 'LOUD' }, { text: 'b', direction: 'QUIET' }] }],
    ['an untagged bundle item', { items: [{ text: 'a', direction: 'neither' }, { text: 'b' }] }],
    ['harm untagged', { harm: undefined }],
    ['the words say quiet, the tag says LOUD', { direction: 'LOUD', title: 'The decline card goes quiet after 48 hours' }],
    ['a QUIET Direction line in the text, neither in the fields', { text: 'Direction: QUIET' }],
    ['a Harm line in the text, none in the fields', { text: 'Harm: exposure' }],
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
    const r = at({ direction: 'QUIET', origin: 'main', cites: [{ file: 'a.ts', snippet: 'x' }] }, { open: [{ id: 'CUL-1', title: 'A thing on the report', cites: ['a.ts'] }], mainHas: () => false }) as Extract<Route, { route: 'file' }>;
    expect(r.notes.join(' ')).toMatch(/possible duplicate of CUL-1/);
    expect(r.notes.join(' ')).toMatch(/gone from main/);
  });
  it('an untagged Harm field is its own reason', () => expect(protectedReasons({ ...base, harm: undefined })).toEqual(['harm untagged (counts as harm)']));
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
  it('fixed only when a defect on main has every cited line gone from main', () => {
    const cites = [{ file: 'a.ts', snippet: 'x' }, { file: 'b.ts', snippet: 'y' }];
    expect(at({ origin: 'main', cites }, { mainHas: () => false }).route).toBe('fixed');
    expect(at({ origin: 'main', cites }, { mainHas: (f) => f === 'b.ts' }).route).toBe('standing');
    expect(at({ origin: 'main' }, { mainHas: () => false }).route).toBe('standing');
    expect(at({ origin: 'main', cites: [{ file: 'a.ts', snippet: '' }] }, { mainHas: () => false }).route).toBe('standing');
  });
  it('a line this diff adds is never "fixed": it is not on main before merge (pass 1)', () => {
    expect(at({ cites: [{ file: 'lib/newReport.ts', snippet: 'if (pets > 1) return []' }] }, { mainHas: () => false }).route).toBe('file');
  });
  it('a closed issue, or one on another surface by title alone, absorbs nothing', () => {
    const t = 'Intake refusal count wrong';
    expect(at({ title: t }, { open: [{ id: 'CUL-1', title: t, state: 'Done' }] }).route).toBe('file');
    expect(at({ title: t }, { open: [{ id: 'CUL-1', title: t, surface: 'Home' }] }).route).toBe('file');
    expect(at({ title: t }, { open: [{ id: 'CUL-1', title: t, surface: 'vet report' }] }).route).toBe('duplicate');
  });
  it('a class is never rare: it files', () => expect(at({ title: 'Three instances of a stale date', devices: 2 }).route).toBe('file'));
  it('the trigger line the sort reads (CUL-2123) maps onto its four causes only', () => {
    expect(triggerLine({ ...base, devices: 2 })).toBe('Trigger: rare (two phones)');
    expect(triggerLine({ ...base, timing: 'race' })).toBe('Trigger: rare (timing)');
    expect(triggerLine({ ...base, timing: 'clock' })).toBe('Trigger: rare (clock skew)');
    expect(triggerLine({ ...base, precondition: 'abnormal', preconditionCause: 'storage failure' })).toBe('Trigger: rare (storage failure)');
    expect(triggerLine({ ...base, precondition: 'abnormal', preconditionCause: 'other' })).toBeUndefined();
    expect(triggerLine(base)).toBeUndefined();
  });
  it('no trigger line for a bundle, a class or harm: the sort must never park those (pass 1)', () => {
    expect(at({ devices: 2, items: [{ text: 'weekly', direction: 'QUIET' }, { text: 'rare', direction: 'LOUD' }] })).toMatchObject({ route: 'file', trigger: undefined });
    expect(at({ direction: 'QUIET', timing: 'race', harm: 'loss' })).toMatchObject({ route: 'file', trigger: undefined });
    expect(at({ direction: 'QUIET', timing: 'race', text: 'Harm: loss' })).toMatchObject({ route: 'file', trigger: undefined });
    expect(triggerLine({ ...base, devices: 2, title: 'One class, two instances' })).toBeUndefined();
    expect(at({ direction: 'QUIET', timing: 'race' })).toMatchObject({ route: 'file', trigger: 'Trigger: rare (timing)' });
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
  // Each finding sees, as open issues, the earlier sample findings the precheck filed.
  const open: { id: string; title: string; cites: string[]; surface: string }[] = [];
  const routes = SAMPLE.map((s) => {
    const r = precheck(s.f, { open: [...open], standing: {} });
    if (r.route === 'file') open.push({ id: s.id, title: s.f.title, cites: (s.f.cites ?? []).map((c) => c.file), surface: s.f.surface });
    return { ...s, r };
  });
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
  'CUL-2473': 'file', 'CUL-2483': 'standing:on main', 'CUL-2493': 'standing:on main', 'CUL-2501': 'file', 'CUL-2510': 'file',
  'CUL-2519': 'file', 'CUL-2528': 'file', 'CUL-2547': 'file', 'CUL-2557': 'standing:on main', 'CUL-2567': 'standing:rare',
  'CUL-2575': 'file', 'CUL-2584': 'standing:rare', 'CUL-2593': 'file', 'CUL-2600': 'standing:rare', 'CUL-2608': 'file',
  'CUL-2618': 'file', 'CUL-2640': 'standing:on main', 'CUL-2648': 'file', 'CUL-2677': 'standing:on main', 'CUL-2686': 'file',
  'CUL-2694': 'standing:on main', 'CUL-2706': 'standing:on main', 'CUL-2714': 'file', 'CUL-2752': 'file', 'CUL-2793': 'file',
  'CUL-2801': 'file', 'CUL-2810': 'file', 'CUL-2831': 'standing:rare', 'CUL-2842': 'file', 'CUL-2850': 'standing:on main',
};

// The reviewers write the fields precheck reads: one line, the same words in all five.
describe('every reviewer carries the field line (CUL-2876)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  const FIELDS = '`Direction: QUIET|LOUD|neither · Origin: diff|main · Devices: 1|2+ · Timing: any|race|clock · Precondition: none|abnormal · Harm: none|exposure|loss|corruption`';
  for (const a of ['adversarial-reviewer', 'code-reviewer', 'rls-privacy-reviewer', 'vet-report-cold-read', 'pm-feature-review']) {
    it(a, () => {
      const s = fs.readFileSync(`${__dirname}/../../.claude/agents/${a}.md`, 'utf8');
      expect(s).toContain(FIELDS);
      expect(s).toMatch(/[Uu]ntagged counts as QUIET and as harm/);
    });
  }
  it('and the adversarial reviewer still blocks every QUIET break', () => {
    const s = fs.readFileSync(`${__dirname}/../../.claude/agents/adversarial-reviewer.md`, 'utf8');
    expect(s).toContain('Every QUIET break is blocking');
    expect(s).toContain('A QUIET break blocks at any pass.');
  });
});

// Adversarial pass 2 (the cap): each break as a named case, every shape on main so an
// unshielded finding would leave for the standing issue.
describe('pass 2: hand-built JSON and the words never outrank a quieter reading', () => {
  const onMain = (over: Record<string, unknown>) => at({ origin: 'main', text: 'Direction: neither · Origin: main · Harm: none', ...(over as Partial<ProposedFinding>) }).route;
  it.each([
    ['direction null (JSON untagged)', { direction: null }],
    ['direction "quiet"', { direction: 'quiet' }],
    ['direction "Quiet"', { direction: 'Quiet' }],
    ['direction "TBD"', { direction: 'TBD' }],
    ['a bundle item with direction null', { items: [{ text: 'a', direction: 'neither' }, { text: 'b', direction: null }] }],
    ['a label with a stray space', { labels: [' Live harm'] }],
    ['harm null', { harm: null }],
  ])('B1 %s → file', (_n, over) => expect(onMain(over)).toBe('file'));
  it.each([
    ['an unreadable Direction in the words', 'Decline flag check.\nDirection: TBD · Origin: main · Harm: none'],
    ['no Direction line in the words', 'The 48h check runs a day late. Origin: main · Harm: none'],
    ['no Harm line in the words', 'Direction: neither · Origin: main'],
    ['a Harm value it cannot read', 'Direction: neither · Origin: main · Harm: data loss'],
    ['a second Harm line naming harm', 'Direction: neither · Origin: main · Harm: none\nHarm: loss'],
  ])('B2 %s → file', (_n, text) => expect(onMain({ text })).toBe('file'));
  it('B2 a Harm line in the title → file', () => expect(onMain({ title: 'Export skips a pet. Harm: exposure' })).toBe('file'));
  it.each([
    ['softens the call-the-vet line', 'It softens the call-the-vet line to worth watching.'],
    ['delays the refusal flag', 'The refusal flag can be delayed a day.'],
    ['the card disappears', 'The decline card disappears after a sync.'],
  ])('B3 a LOUD tag over words that %s → file', (_n, words) => expect(onMain({ direction: 'LOUD', text: `${words}\nDirection: LOUD · Origin: main · Harm: none` })).toBe('file'));
  it('a text Origin: diff outranks a field main: never fixed, never standing', () => {
    expect(at({ origin: 'main', text: 'Direction: neither · Origin: diff · Harm: none', cites: [{ file: 'a.ts', snippet: 'x' }] }, { mainHas: () => false }).route).toBe('file');
  });
  it('no trigger line when the words name a loss, a leak or a regression', () => {
    expect(at({ direction: 'QUIET', timing: 'race', text: 'The vomit log is lost on retry.\nDirection: QUIET · Harm: none' })).toMatchObject({ route: 'file', trigger: undefined });
  });
  it('the template\'s own "2+" reads as two devices', () => expect(at({ devices: '2+' as unknown as 2 }).route).toBe('standing'));
});
