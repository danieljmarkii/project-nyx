// The pure rule behind merge-check's production line (CUL-1654): which functions a
// landing deploys, given each side's fingerprints and holds. The I/O half is driven end
// to end against fixture repositories in guards/mergeCheck.test.ts.

import { deploysBetween, heldIn } from './deploys.ts';

const none = new Set<string>();

describe('deploysBetween', () => {
  it('a changed fingerprint deploys; an unchanged one does not', () => {
    expect(deploysBetween({ a: '1', b: '1' }, { a: '2', b: '1' }, none, none)).toEqual([{ fn: 'a', why: 'shipping code changed' }]);
  });

  it('a function the landing adds deploys; one it removes does not', () => {
    expect(deploysBetween({ gone: '1' }, { added: '1' }, none, none)).toEqual([{ fn: 'added', why: 'new function' }]);
  });

  it('a function held after the landing never deploys, changed or new', () => {
    expect(deploysBetween({ a: '1' }, { a: '2', b: '1' }, none, new Set(['a', 'b']))).toEqual([]);
  });

  it('releasing a hold deploys the function even when its code did not move', () => {
    expect(deploysBetween({ a: '1' }, { a: '1' }, new Set(['a']), none)).toEqual([{ fn: 'a', why: 'hold released' }]);
  });

  it('lists in name order', () => {
    expect(deploysBetween({}, { b: '1', a: '1' }, none, none).map((d) => d.fn)).toEqual(['a', 'b']);
  });
});

describe('heldIn', () => {
  it('reads the holds; no manifest holds nothing', () => {
    expect([...heldIn(JSON.stringify({ holds: { x: {}, y: {} } }))]).toEqual(['x', 'y']);
    expect(heldIn(null).size).toBe(0);
    expect(heldIn('{}').size).toBe(0);
  });

  it('an unreadable manifest throws rather than reading as no holds', () => {
    expect(() => heldIn('{ not json')).toThrow();
  });
});
