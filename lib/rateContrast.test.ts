// lib/rateContrast.ts — the two-window C-test render-gate (B-755 PR 1, CUL-6).
//
// The spec (§3) names the three property tests this suite must carry: symmetry,
// monotonicity in each argument, degenerate windows. They are here, plus a numeric
// validation of the exact test against hand-computable binomial cases (so a
// regression in the lgamma/pmf core is caught, not just a regression in the gate),
// plus the L2-flavoured units the trial-response lane will depend on.
//
// The p-value is asserted on directly via `conditionalBinomialTwoSidedP` — which is
// exported FOR THESE TESTS ONLY. It never reaches a surface; `rateContrast` returns
// a boolean gate, and that is the only thing a renderer is handed.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_RATE_CONTRAST_ALPHA,
  conditionalBinomialTwoSidedP,
  rateContrast,
  type RateDirection,
} from './rateContrast';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const mirror = (d: RateDirection): RateDirection =>
  d === 'a_higher' ? 'b_higher' : d === 'b_higher' ? 'a_higher' : 'equal';

describe('rateContrast — numeric validation of the exact two-sided test', () => {
  // Hand-computable binomial cases at p₀ = 0.5 (equal exposures). pmf is symmetric,
  // so the two-sided minlike p-value is the sum of the two matching tails.
  it('0-vs-2 over equal exposure → p = 0.5 (an unremarkable coin split)', () => {
    // P(0)=P(2)=0.25, P(1)=0.5 → outcomes ≤ 0.25 are {0,2} → 0.5.
    expect(conditionalBinomialTwoSidedP(0, 2, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it('0-vs-5 → p = 0.0625; 0-vs-6 → p = 0.03125', () => {
    // n=5: P(0)=1/32; mirror P(5)=1/32 → 2/32 = 0.0625.
    expect(conditionalBinomialTwoSidedP(0, 5, 1, 1)).toBeCloseTo(0.0625, 10);
    // n=6: P(0)=1/64; mirror → 2/64 = 0.03125.
    expect(conditionalBinomialTwoSidedP(0, 6, 1, 1)).toBeCloseTo(0.03125, 10);
  });

  it('a balanced split is p = 1 (nothing to see)', () => {
    expect(conditionalBinomialTwoSidedP(5, 5, 1, 1)).toBeCloseTo(1, 10);
    expect(conditionalBinomialTwoSidedP(3, 3, 1, 1)).toBeCloseTo(1, 10);
  });

  it('the exposure OFFSET moves the null: same counts, 5× exposure gap is significant', () => {
    // x1=x2=10 but t1=10, t2=50 → p₀=1/6, expected X1≈3.3, observed 10 → tiny p.
    expect(conditionalBinomialTwoSidedP(10, 10, 10, 50)).toBeLessThan(0.001);
  });
});

describe('rateContrast — PROPERTY: symmetry (swapping the windows)', () => {
  it('gate is identical and direction mirrors under a→b swap; the statistic is equal', () => {
    const rng = makeRng(7);
    for (let trial = 0; trial < 500; trial++) {
      const x1 = Math.floor(rng() * 30);
      const x2 = Math.floor(rng() * 30);
      const t1 = 1 + Math.floor(rng() * 60);
      const t2 = 1 + Math.floor(rng() * 60);
      const ab = rateContrast({ count: x1, exposure: t1 }, { count: x2, exposure: t2 });
      const ba = rateContrast({ count: x2, exposure: t2 }, { count: x1, exposure: t1 });
      expect(ba.gate).toBe(ab.gate);
      expect(ba.direction).toBe(mirror(ab.direction));
      // The underlying statistic is exactly invariant under the swap.
      const pAB = conditionalBinomialTwoSidedP(x1, x2, t1, t2);
      const pBA = conditionalBinomialTwoSidedP(x2, x1, t2, t1);
      expect(pBA).toBeCloseTo(pAB, 12);
    }
  });
});

describe('rateContrast — PROPERTY: monotonicity in the split', () => {
  it('with equal exposure and fixed n, the p-value is symmetric and non-increasing away from balance', () => {
    for (const n of [6, 8, 12, 20, 41]) {
      const half = n / 2;
      let prev = Infinity;
      // Walk from the balanced centre outward; p must never RISE as we get more extreme.
      for (let k = Math.ceil(half); k <= n; k++) {
        const p = conditionalBinomialTwoSidedP(k, n - k, 1, 1);
        expect(p).toBeLessThanOrEqual(prev + 1e-12);
        // Symmetry of the split: k and n-k are the same evidence.
        expect(conditionalBinomialTwoSidedP(n - k, k, 1, 1)).toBeCloseTo(p, 12);
        prev = p;
      }
    }
  });

  it('the GATE inherits that monotonicity across an alpha sweep (more extreme never un-gates)', () => {
    const alphas = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5];
    const n = 20;
    for (const alpha of alphas) {
      let sawGate = false;
      // k from balanced (10) outward to extreme (20): once the gate turns on it stays on.
      for (let k = 10; k <= n; k++) {
        const { gate } = rateContrast({ count: k, exposure: 1 }, { count: n - k, exposure: 1 }, { alpha });
        if (sawGate) expect(gate).toBe(true);
        if (gate) sawGate = true;
      }
    }
  });
});

describe('rateContrast — PROPERTY: degenerate windows never manufacture a comparison', () => {
  it('a zero / negative / non-finite exposure gates false with a null rate', () => {
    const cases = [
      { a: { count: 5, exposure: 0 }, b: { count: 5, exposure: 10 } },
      { a: { count: 5, exposure: -3 }, b: { count: 5, exposure: 10 } },
      { a: { count: 5, exposure: Number.POSITIVE_INFINITY }, b: { count: 5, exposure: 10 } },
      { a: { count: 5, exposure: Number.NaN }, b: { count: 5, exposure: 10 } },
    ];
    for (const { a, b } of cases) {
      const r = rateContrast(a, b);
      expect(r.gate).toBe(false);
      expect(r.direction).toBe('equal');
      expect(r.rateA).toBeNull();
    }
  });

  it('no events at all (n = 0) gates false', () => {
    const r = rateContrast({ count: 0, exposure: 10 }, { count: 0, exposure: 40 });
    expect(r.gate).toBe(false);
    expect(r.direction).toBe('equal');
    expect(r.rateA).toBe(0);
    expect(r.rateB).toBe(0);
  });

  it('the internal statistic returns 1 (never gates) on degenerate inputs', () => {
    expect(conditionalBinomialTwoSidedP(5, 5, 0, 10)).toBe(1);
    expect(conditionalBinomialTwoSidedP(0, 0, 10, 10)).toBe(1);
    expect(conditionalBinomialTwoSidedP(5, 5, 10, Number.NaN)).toBe(1);
  });

  it('a NON-FINITE COUNT never fabricates a gate (adversarial: NaN → false gate)', () => {
    // Regression: a NaN count once slipped past the exposure-only guard, made n NaN so the
    // p-value loop never ran, returned p=0, and GATED TRUE on garbage. It must fail safe.
    const nan = rateContrast({ count: Number.NaN, exposure: 28 }, { count: 3, exposure: 28 });
    expect(nan.gate).toBe(false);
    expect(nan.direction).toBe('equal');
    expect(nan.rateA).toBeNull();
    // The realistic reachability path: a missing map key → `undefined` count.
    const missingKey = rateContrast(
      { count: undefined as unknown as number, exposure: 28 },
      { count: 3, exposure: 28 },
    );
    expect(missingKey.gate).toBe(false);
    expect(missingKey.rateA).toBeNull();
    // The internal statistic guards it too (defense in depth).
    expect(conditionalBinomialTwoSidedP(Number.NaN, 3, 28, 28)).toBe(1);
  });

  it('an INFINITE COUNT returns promptly and never gates (adversarial: no unbounded loop)', () => {
    // Regression: `Math.floor(Infinity)=Infinity` made `for (k=0; k<=n; k++)` never
    // terminate — a synchronous hang inside the Deno isolate. The jest timeout is the
    // hang tripwire; the assertions pin the safe answer.
    const inf = rateContrast({ count: Number.POSITIVE_INFINITY, exposure: 10 }, { count: 5, exposure: 40 });
    expect(inf.gate).toBe(false);
    expect(inf.direction).toBe('equal');
    expect(inf.rateA).toBeNull();
    expect(conditionalBinomialTwoSidedP(Number.POSITIVE_INFINITY, 2, 1, 1)).toBe(1);
  }, 2000);

  it('a pathologically lopsided exposure ratio yields a finite p-value, never NaN', () => {
    // p₀ = 1/(1+1e18) rounds toward a float endpoint; the endpoint pmf terms must
    // stay finite (the 0×-Infinity guard in logPmf). All events in the huge window is
    // the unremarkable outcome → p near 1; an event in the vanishing window is extreme.
    const pQuiet = conditionalBinomialTwoSidedP(0, 8, 1, 1e18);
    expect(Number.isFinite(pQuiet)).toBe(true);
    expect(pQuiet).toBeGreaterThan(0);
    const pLoud = conditionalBinomialTwoSidedP(8, 0, 1, 1e18);
    expect(Number.isFinite(pLoud)).toBe(true);
    // And the public gate stays a clean boolean under the same input.
    expect(typeof rateContrast({ count: 8, exposure: 1 }, { count: 0, exposure: 1e18 }).gate).toBe('boolean');
  });
});

describe('rateContrast — the render gate (what a surface actually asks)', () => {
  it('does NOT gate a small, unremarkable difference (counts render, sentence does not)', () => {
    // 2 vs 3 over equal exposure is noise — the never-over-claim discipline.
    expect(rateContrast({ count: 2, exposure: 28 }, { count: 3, exposure: 28 }).gate).toBe(false);
  });

  it('gates a clear difference and reports the direction (never a verdict)', () => {
    const r = rateContrast({ count: 20, exposure: 28 }, { count: 3, exposure: 28 });
    expect(r.gate).toBe(true);
    expect(r.direction).toBe('a_higher'); // A's rate is higher; the caller orders the sentence
  });

  it('reflects the exposure offset: equal counts but very unequal exposure gates on the rate', () => {
    const r = rateContrast({ count: 10, exposure: 10 }, { count: 10, exposure: 50 });
    expect(r.gate).toBe(true);
    expect(r.direction).toBe('a_higher'); // 1.0/unit vs 0.2/unit
    expect(r.rateA).toBeCloseTo(1, 10);
    expect(r.rateB).toBeCloseTo(0.2, 10);
  });

  it('a tighter alpha can withhold a borderline gate (the threshold is the owned knob)', () => {
    // 0-vs-5 over equal exposure: p = 0.0625 → below 0.1, above 0.05.
    const args = [{ count: 0, exposure: 14 }, { count: 5, exposure: 14 }] as const;
    expect(rateContrast(args[0], args[1], { alpha: 0.1 }).gate).toBe(true);
    expect(rateContrast(args[0], args[1], { alpha: 0.05 }).gate).toBe(false);
    // Default alpha is the conservative 0.05.
    expect(DEFAULT_RATE_CONTRAST_ALPHA).toBe(0.05);
    expect(rateContrast(args[0], args[1]).gate).toBe(false);
  });

  it("L2-flavoured: a clear trial-era reduction gates 'b_higher' (baseline rate higher)", () => {
    // Trial: 1 episode / 28 logged-days; baseline: 20 / 28. Same exposure, extreme split.
    const r = rateContrast({ count: 1, exposure: 28 }, { count: 20, exposure: 28 });
    expect(r.gate).toBe(true);
    expect(r.direction).toBe('b_higher');
  });

  it('L2-flavoured: a marginal trial difference stays quiet (counts only)', () => {
    const r = rateContrast({ count: 5, exposure: 28 }, { count: 6, exposure: 40 });
    expect(r.gate).toBe(false);
  });

  it('floors non-integer counts rather than trusting a fractional event', () => {
    // 2.9 events is 2 events; the gate must not read a fractional count as more evidence.
    const frac = rateContrast({ count: 2.9, exposure: 28 }, { count: 3.9, exposure: 28 });
    const whole = rateContrast({ count: 2, exposure: 28 }, { count: 3, exposure: 28 });
    expect(frac.gate).toBe(whole.gate);
  });
});

describe('rateContrast — the internal p-value never leaks to a surface (§3 hard rule)', () => {
  // The spec's one hard rule (§3): "p-values never surface anywhere, owner- or vet-facing."
  // `conditionalBinomialTwoSidedP` is exported ONLY so these property tests can assert on
  // the statistic; a docstring cannot stop a future component importing it and rendering
  // `p.toFixed(3)`. This scan enforces the rule STRUCTURALLY (the hydration.test.ts idiom):
  // the identifier may appear in exactly two files — the module and this test — nowhere else.
  const IDENT = 'conditionalBinomialTwoSidedP';
  const SOURCE_DIRS = ['lib', 'store', 'hooks', 'app', 'components', 'supabase/functions'];
  const ALLOWED = ['/lib/rateContrast.ts', '/lib/rateContrast.test.ts'];

  const referencingFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && readFileSync(full, 'utf8').includes(IDENT)) {
        referencingFiles.push(full);
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(__dirname, '..', dir));

  it('is referenced only by rateContrast.ts and its own test — never by a rendering surface', () => {
    const disallowed = referencingFiles.filter((f) => !ALLOWED.some((a) => f.endsWith(a)));
    expect(disallowed).toEqual([]);
    // Positive control: the scan really ran and found the module (not a vacuous empty walk).
    expect(referencingFiles.some((f) => f.endsWith('/lib/rateContrast.ts'))).toBe(true);
  });
});
