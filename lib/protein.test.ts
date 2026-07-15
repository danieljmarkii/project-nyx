import { canonicalizeProtein, COMMON_PROTEINS } from './protein';

// The picker's offered set (B-332) must stay in lockstep with the canonicalizer,
// or an owner-picked chip would key differently from the same protein extracted
// by AI — the exact fragmentation B-052 exists to prevent. These are the guards
// that keep the list honest as anyone edits it.
describe('COMMON_PROTEINS (picker set)', () => {
  it('is non-empty', () => {
    expect(COMMON_PROTEINS.length).toBeGreaterThan(0);
  });

  it('every value is canonicalize-STABLE — canonicalize(v) === v', () => {
    // If this fails, the chip stores a value that would be re-keyed on read, so
    // the chip and its own canonical form would rank as two different proteins.
    for (const p of COMMON_PROTEINS) {
      expect(canonicalizeProtein(p)).toBe(p);
    }
  });

  it('no value canonicalizes to junk/null', () => {
    for (const p of COMMON_PROTEINS) {
      expect(canonicalizeProtein(p)).not.toBeNull();
    }
  });

  it('has no duplicate values', () => {
    expect(new Set(COMMON_PROTEINS).size).toBe(COMMON_PROTEINS.length);
  });

  it('stores lowercase — matches how extraction writes the value', () => {
    for (const p of COMMON_PROTEINS) {
      expect(p).toBe(p.toLowerCase());
    }
  });

  // The load-bearing parity claim: an owner picking a chip and the AI extracting
  // the same protein under any casing land on ONE key. This is why the manual
  // path can be trusted to feed the same correlation the AI path does.
  it('keys owner-picked and AI-cased values identically', () => {
    expect(canonicalizeProtein('Chicken')).toBe('chicken');
    expect(canonicalizeProtein('chicken')).toBe(canonicalizeProtein('Chicken'));
    // A qualifier-laden AI label still collapses onto the same chip key.
    expect(canonicalizeProtein('Chicken By-Product Meal')).toBe('chicken');
    expect(COMMON_PROTEINS).toContain(canonicalizeProtein('Chicken By-Product Meal'));
  });
});
