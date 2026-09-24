// The ledger's shape rules (CUL-1147). The guard and the deploy job both parse the
// file through here, so a rule tested here holds in both places.

import { inDeployOrder, ledgerProblems, parseLedger } from './ledger.ts';

const fp = (c: string) => `sha256:${c.repeat(64)}`;
const HOLD = { ref: 'CUL-215', reason: 'waits on the client build', fingerprint: fp('1') };

describe('parseLedger', () => {
  it('accepts order + holds, and underscore-prefixed notes', () => {
    const { ledger, problems } = parseLedger({ _README: 'x', order: ['a', 'b'], holds: { c: { ...HOLD, since: '2026-08-20' } } });
    expect(problems).toEqual([]);
    expect(ledger).toEqual({ order: ['a', 'b'], holds: { c: { ...HOLD, since: '2026-08-20' } } });
  });

  it('accepts an empty file: no order, no holds', () => {
    expect(parseLedger({})).toEqual({ ledger: { order: [], holds: {} }, problems: [] });
  });

  it('rejects the retired per-function block with a message that says why', () => {
    const { problems } = parseLedger({ functions: { a: { status: 'pending' } } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^INVALID/);
    expect(problems[0]).toContain('merging to main deploys');
  });

  it('rejects unknown keys at the top and inside a hold', () => {
    expect(parseLedger({ deploys: [] }).problems[0]).toMatch(/unknown key "deploys"/);
    expect(parseLedger({ holds: { a: { ...HOLD, status: 'hold' } } }).problems[0]).toMatch(/unknown key "status" in holds.a/);
  });

  it('requires an issue ref and a reason on every hold', () => {
    const problems = parseLedger({ holds: { a: { fingerprint: fp('1') }, b: { ...HOLD, ref: 'B-494' }, c: { ...HOLD, reason: '  ' } } })
      .problems;
    expect(problems.filter((p) => p.startsWith('UNREASONED'))).toHaveLength(4);
  });

  it('requires a well-formed fingerprint and date', () => {
    expect(parseLedger({ holds: { a: { ...HOLD, fingerprint: 'abc' } } }).problems[0]).toMatch(/^INVALID: holds.a.fingerprint/);
    expect(parseLedger({ holds: { a: { ...HOLD, since: '20 Aug' } } }).problems[0]).toMatch(/since must be/);
  });

  it('rejects a malformed or repeated order', () => {
    expect(parseLedger({ order: 'a' }).problems[0]).toMatch(/must be an array/);
    expect(parseLedger({ order: ['a', 'a'] }).problems[0]).toMatch(/appears twice/);
  });
});

describe('ledgerProblems', () => {
  const current = { a: { fingerprint: fp('1') }, b: { fingerprint: fp('2') } };

  it('is clean when every name exists and every hold is current', () => {
    expect(ledgerProblems({ order: ['a'], holds: { a: HOLD } }, current)).toEqual([]);
  });

  it('flags names that match no function', () => {
    const problems = ledgerProblems({ order: ['ghost'], holds: { gone: HOLD } }, current);
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.startsWith('STALE'))).toBe(true);
  });

  it('flags a held function whose code moved, and prints the value to acknowledge it with', () => {
    const problems = ledgerProblems({ order: [], holds: { b: HOLD } }, current);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^HELD-DRIFT/);
    expect(problems[0]).toContain(fp('2'));
    expect(problems[0]).toContain('will NOT go live');
  });
});

describe('inDeployOrder', () => {
  it('puts ordered functions first, in order, then the rest alphabetically', () => {
    const items = ['generate-signal', 'ask', 'analyze-stool', 'analyze-vomit', 'extract-food-from-photo'].map((fn) => ({ fn }));
    expect(inDeployOrder(items, ['analyze-vomit', 'analyze-stool', 'ask']).map((i) => i.fn)).toEqual([
      'analyze-vomit',
      'analyze-stool',
      'ask',
      'extract-food-from-photo',
      'generate-signal',
    ]);
  });
});
