import {
  proteinSourceBase,
  proteinsAreKin,
  partitionKinOfPrimary,
  dropKinOfPrimary,
} from './proteinRelation';
import { canonicalizeProtein, COMMON_PROTEINS } from './protein';

describe('proteinSourceBase', () => {
  it('strips hydrolysis affixes and the trailing generic "protein"', () => {
    expect(proteinSourceBase('hydrolyzed chicken')).toBe('chicken');
    expect(proteinSourceBase('hydrolysed chicken')).toBe('chicken');
    expect(proteinSourceBase('Partially Hydrolyzed Whey')).toBe('whey');
    expect(proteinSourceBase('chicken hydrolysate')).toBe('chicken');
    expect(proteinSourceBase('hydrolyzed soy protein')).toBe('soy');
    expect(proteinSourceBase('soy protein')).toBe('soy');
    expect(proteinSourceBase('pea protein')).toBe('pea');
  });

  it('leaves an ordinary key alone', () => {
    for (const p of COMMON_PROTEINS) expect(proteinSourceBase(p)).toBe(p);
  });

  it('returns null for a process with no source, so it can absorb nothing', () => {
    // The guard that stops "hydrolyzed protein" being kin to every protein on
    // the panel: with no source term there is nothing to match on.
    expect(proteinSourceBase('hydrolyzed protein')).toBeNull();
    expect(proteinSourceBase('hydrolyzed')).toBeNull();
    expect(proteinSourceBase('protein')).toBeNull();
    expect(proteinSourceBase('null')).toBeNull();
    expect(proteinSourceBase('')).toBeNull();
    expect(proteinSourceBase(null)).toBeNull();
  });

  it('does NOT fold tissue terms — the deliberate under-claim', () => {
    // Leaves the finding standing rather than deleting a real one. Documented in
    // the module header as the intended direction.
    expect(proteinSourceBase('chicken liver')).toBe('chicken liver');
    expect(proteinsAreKin('hydrolyzed chicken liver', 'chicken')).toBe(false);
  });

  // The property the module's own docstring claims. An example list is exactly
  // what let B-414 ship a non-convergent canonicalizer under a docstring
  // claiming idempotence, so this is a cross-product, not a list.
  it('is convergent over the full cross-product of realistic spellings', () => {
    const heads = [...COMMON_PROTEINS, 'soy', 'whey', 'pea', 'chicken liver', 'ocean whitefish'];
    const wrappers = [
      (s: string) => s,
      (s: string) => `hydrolyzed ${s}`,
      (s: string) => `hydrolysed ${s}`,
      (s: string) => `partially hydrolyzed ${s}`,
      (s: string) => `${s} hydrolysate`,
      (s: string) => `${s} protein`,
      (s: string) => `hydrolyzed ${s} protein`,
      (s: string) => `  ${s.toUpperCase()} - `,
      (s: string) => `${s} meal`,
      (s: string) => `hydrolyzed ${s} by-product meal`,
    ];
    for (const head of heads) {
      for (const wrap of wrappers) {
        const input = wrap(head);
        const once = proteinSourceBase(input);
        const twice = proteinSourceBase(once);
        expect(twice).toBe(once);
      }
    }
  });
});

describe('proteinsAreKin', () => {
  it('relates the hydrolysed and intact terms for one source', () => {
    expect(proteinsAreKin('hydrolyzed chicken', 'chicken')).toBe(true);
    expect(proteinsAreKin('chicken', 'hydrolyzed chicken')).toBe(true);
    expect(proteinsAreKin('hydrolyzed soy protein', 'soy')).toBe(true);
    expect(proteinsAreKin('soy protein', 'soy')).toBe(true);
  });

  it('never relates two different sources', () => {
    expect(proteinsAreKin('hydrolyzed chicken', 'soy')).toBe(false);
    expect(proteinsAreKin('hydrolyzed chicken', 'turkey')).toBe(false);
    expect(proteinsAreKin('chicken', 'turkey')).toBe(false);
    expect(proteinsAreKin('beef', 'bison')).toBe(false);
    // The pair the alias table deliberately keeps apart.
    expect(proteinsAreKin('poultry', 'chicken')).toBe(false);
  });

  it('is false for the same key, and for an unusable side', () => {
    expect(proteinsAreKin('chicken', 'chicken')).toBe(false);
    expect(proteinsAreKin('Chicken', ' chicken ')).toBe(false); // same key once canonical
    expect(proteinsAreKin('hydrolyzed protein', 'chicken')).toBe(false);
    expect(proteinsAreKin('chicken', null)).toBe(false);
    expect(proteinsAreKin(null, null)).toBe(false);
  });

  it('is symmetric over the full cross-product', () => {
    const keys = [
      'chicken', 'hydrolyzed chicken', 'chicken hydrolysate', 'chicken liver',
      'soy', 'soy protein', 'hydrolyzed soy protein', 'turkey', 'poultry',
      'hydrolyzed protein', 'meal', 'null', '',
    ];
    for (const a of keys) {
      for (const b of keys) {
        expect(proteinsAreKin(a, b)).toBe(proteinsAreKin(b, a));
      }
    }
  });

  it('is never true for a key against itself, however spelled', () => {
    const keys = ['Chicken', 'hydrolyzed  CHICKEN', 'soy protein', 'chicken - meal'];
    for (const k of keys) {
      expect(proteinsAreKin(k, k)).toBe(false);
      expect(proteinsAreKin(k, canonicalizeProtein(k))).toBe(false);
    }
  });
});

describe('partitionKinOfPrimary', () => {
  it('absorbs the intact term of the primary, keeping genuine extras', () => {
    const p = partitionKinOfPrimary(['hydrolyzed chicken', 'chicken', 'beef'], 'hydrolyzed chicken');
    expect(p.derivedFromPrimary).toEqual(['chicken']);
    expect(p.extra).toEqual(['beef']);
  });

  it('excludes the primary itself from both lists', () => {
    const p = partitionKinOfPrimary(['duck'], 'duck');
    expect(p).toEqual({ extra: [], derivedFromPrimary: [] });
  });

  it('absorbs nothing when there is no usable primary', () => {
    const p = partitionKinOfPrimary(['duck', 'chicken'], null);
    expect(p.extra).toEqual(['duck', 'chicken']);
    expect(p.derivedFromPrimary).toEqual([]);
  });

  it('preserves prominence order in both lists', () => {
    const p = partitionKinOfPrimary(
      ['hydrolyzed soy protein', 'beef', 'soy', 'lamb'],
      'hydrolyzed soy protein',
    );
    expect(p.extra).toEqual(['beef', 'lamb']);
    expect(p.derivedFromPrimary).toEqual(['soy']);
  });

  it('never drops a key — every input is accounted for exactly once', () => {
    const keys = ['hydrolyzed chicken', 'chicken', 'beef', 'soy protein'];
    for (const primary of [...keys, null, 'duck']) {
      const p = partitionKinOfPrimary(keys, primary);
      const primaryKey = canonicalizeProtein(primary);
      const accounted = [...p.extra, ...p.derivedFromPrimary].length +
        keys.filter((k) => k === primaryKey).length;
      expect(accounted).toBe(keys.length);
    }
  });
});

describe('dropKinOfPrimary — and why it is not partitionKinOfPrimary', () => {
  it('KEEPS the primary itself, unlike the partition helper', () => {
    // The regression an existing D-B test caught during this build. On a DUCK
    // trial the vet-approved rabbit jerky's own `rabbit` is a genuine antigen
    // exposure — the treat stays permitted, the exposure is still recorded.
    // Routing the antigen path through partitionKinOfPrimary deleted it from the
    // vet report, because that helper drops the primary as its comparator.
    expect(dropKinOfPrimary(['rabbit', 'chicken'], 'rabbit')).toEqual(['rabbit', 'chicken']);
    expect(partitionKinOfPrimary(['rabbit', 'chicken'], 'rabbit').extra).toEqual(['chicken']);
  });

  it('absorbs only a kin term', () => {
    expect(dropKinOfPrimary(['chicken', 'beef'], 'hydrolyzed chicken')).toEqual(['beef']);
    expect(dropKinOfPrimary(['soy'], 'hydrolyzed soy protein')).toEqual([]);
  });

  it('absorbs nothing without a usable primary', () => {
    expect(dropKinOfPrimary(['chicken', 'beef'], null)).toEqual(['chicken', 'beef']);
    expect(dropKinOfPrimary(['chicken'], 'hydrolyzed protein')).toEqual(['chicken']);
  });

  it('is a subset of its input and preserves order', () => {
    const keys = ['chicken', 'beef', 'soy', 'lamb'];
    for (const primary of ['hydrolyzed chicken', 'hydrolyzed soy protein', 'duck', null]) {
      const out = dropKinOfPrimary(keys, primary);
      expect(keys.filter((k) => out.includes(k))).toEqual(out);
    }
  });
});

describe('a processing term with no source can absorb nothing', () => {
  // Adversarial residual: UNUSABLE_BASES listed the `hydrolyzed` spellings but
  // not the `hydrolysate` ones, so a bare `hydrolysate` kept a usable base and
  // was kin to `hydrolysate protein`. Impact was ~nil (both sides must be
  // source-less), but it contradicted the stated invariant.
  it.each(['hydrolyzed', 'hydrolysed', 'hydrolysate', 'hydrolyzate', 'protein'])(
    '%s has no usable source base',
    (key) => {
      expect(proteinSourceBase(key)).toBeNull();
    },
  );

  it('is kin to nothing, including another source-less term', () => {
    expect(proteinsAreKin('hydrolysate', 'hydrolysate protein')).toBe(false);
    expect(proteinsAreKin('hydrolyzed', 'hydrolysate')).toBe(false);
    expect(proteinsAreKin('hydrolysate', 'chicken')).toBe(false);
  });
});
