// The two-window rate-contrast render-gate (Signals v2 / B-755 PR 1, CUL-6).
// Spec: docs/nyx-signals-v2-requirements.md §3 (the shared primitives), §2 L2
// (the trial-response lane, the first consumer), G1/G2 (counts and context only;
// the vet interprets).
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
//
// A conditional-binomial exact test — the "C-test" of Przyborowski & Wileński 1940,
// as characterised by Krishnamoorthy & Thomson 2004 — used as the INTERNAL RENDER
// GATE for every two-window comparison SENTENCE the engine ever emits ("fewer
// episodes during the trial than before"). It answers exactly one question: are two
// observed event counts, over two observation windows of possibly-different length,
// different enough that a sentence CLAIMING a difference is licensed — or should the
// surface show only the two counts and say nothing comparative?
//
// The model. Window A saw X₁ events over exposure T₁; window B saw X₂ over T₂
// (exposure = observation time / logged-days / whatever the caller counts rate
// against). Treat the counts as Poisson in their windows. CONDITION on the total
// n = X₁ + X₂: under the null that the underlying per-exposure rate is equal,
//   X₁ | n  ~  Binomial(n, p₀),   p₀ = T₁ / (T₁ + T₂).
// The exposure ratio is the whole point — 5 episodes in 50 logged days is not the
// same rate as 5 in 10, and p₀ carries that. The two-sided exact p-value of the
// observed X₁ under that binomial is the evidence; the gate is p < alpha.
//
// ── THE ONE HARD RULE: p-VALUES NEVER SURFACE ────────────────────────────────
//
// §3, verbatim: "Output is a gate + the counts — p-values never surface anywhere,
// owner- or vet-facing." The public `rateContrast` returns a BOOLEAN gate, the
// counts, and a direction. It never returns a p-value, and no caller can route one
// to a surface because none is handed out. A p-value on a pet-owner's phone is a
// false precision that invites "is 0.04 bad?"; a p-value on the vet report is a
// statistic the app is not positioned to defend. The gate is the honest artifact:
// "different enough to say so" / "not — show the counts and stop".
//
// The `alpha` knob exists so a PROPERTY TEST can probe the underlying statistic's
// monotonicity through the gate (the p-value is `inf{alpha : gate}`), without the
// statistic ever being exposed as a number to any surface. It is a render-gate
// threshold, owned and tunable, not a published significance level.
//
// ── PURE AND DEPENDENCY-FREE ─────────────────────────────────────────────────
//
// Zero imports, plain-data in / plain-data out, so both the Deno engine
// (`generate-signal`, the L2 lane) and the React Native client can call it — the
// same constraint as `lib/mealTiming.ts` and `lib/dietTrial.ts`, and for the same
// reason (a gate the server cannot import is not the "every comparison sentence"
// gate §3 asks for). `lgamma` is implemented here rather than pulled from a
// numerics package precisely to keep the import count at zero.
//
// ── WHY A GATE, NOT A THRESHOLD ON THE RATIO ─────────────────────────────────
//
// A naive "flag it when the trial rate is <½ the baseline rate" fires on 1-vs-3 as
// readily as on 20-vs-60, and the first is noise. The exact test makes small-n stay
// quiet BY CONSTRUCTION — 0-vs-2 over equal exposure never gates, because two events
// splitting all-to-one-side is an unremarkable coin outcome — which is precisely the
// discipline a never-over-claiming surface needs (§2 L2: "counts always render; a
// comparison sentence renders only when the gate passes").

/** One observation window: the events seen and the exposure they accrued over. */
export interface RateWindow {
  /** Event count in this window (X). Non-negative; non-integers are floored. */
  count: number;
  /** Exposure — observation time / logged-days / whatever rate is measured against
   *  (T). Must be > 0 for the window to define a rate; ≤ 0 is degenerate (below). */
  exposure: number;
}

/** Which window's per-exposure rate is higher — for ORDERING a sentence, never a
 *  verdict (§2 L2 phrasing contract: count-anchored, never "better"/"working"). Only
 *  meaningful when `gate` is true; 'equal' whenever a contrast can't be drawn. */
export type RateDirection = 'a_higher' | 'b_higher' | 'equal';

export interface RateContrastResult {
  /** THE render gate. True ⇒ the two rates differ beyond chance at `alpha` and a
   *  comparison sentence is licensed. False ⇒ show the counts, say nothing
   *  comparative. This boolean is the ONLY thing that crosses the p-value boundary. */
  gate: boolean;
  /** Direction of the rate difference (a vs b). See `RateDirection`. */
  direction: RateDirection;
  /** Per-exposure rate of A (count/exposure), or null when exposure ≤ 0. Provided so
   *  a caller can render the two rates; never a p-value. */
  rateA: number | null;
  /** Per-exposure rate of B, or null when exposure ≤ 0. */
  rateB: number | null;
}

/** Default render-gate threshold. Two-sided; conventional 0.05. Owned and tunable
 *  (it is a rendering decision, not a scientific claim), never surfaced. */
export const DEFAULT_RATE_CONTRAST_ALPHA = 0.05;

/**
 * The render gate. See the file header for the model and the p-never-surfaces rule.
 *
 * Degenerate inputs answer `{ gate: false, direction: 'equal' }` — a contrast that
 * cannot be drawn is never asserted:
 *   • either exposure ≤ 0 (or non-finite): no rate is defined, so no comparison;
 *   • n = X₁ + X₂ = 0: no events at all, nothing to compare.
 * These are the "degenerate windows" the property tests pin. Failing toward
 * `gate: false` here is the safe direction — a degenerate window can never
 * manufacture a comparison sentence.
 */
export function rateContrast(
  a: RateWindow,
  b: RateWindow,
  opts: { alpha?: number } = {},
): RateContrastResult {
  const alpha = opts.alpha ?? DEFAULT_RATE_CONTRAST_ALPHA;

  const t1 = a.exposure;
  const t2 = b.exposure;
  // Degenerate: a window with no (or nonsensical) exposure has no rate.
  if (!(t1 > 0) || !(t2 > 0) || !Number.isFinite(t1) || !Number.isFinite(t2)) {
    return { gate: false, direction: 'equal', rateA: rateOf(a), rateB: rateOf(b) };
  }

  const x1 = Math.max(0, Math.floor(a.count));
  const x2 = Math.max(0, Math.floor(b.count));
  const rateA = x1 / t1;
  const rateB = x2 / t2;
  const direction: RateDirection =
    rateA > rateB ? 'a_higher' : rateA < rateB ? 'b_higher' : 'equal';

  const n = x1 + x2;
  // Degenerate: no events observed in either window.
  if (n === 0) {
    return { gate: false, direction: 'equal', rateA, rateB };
  }

  // p₀ = T₁/(T₁+T₂) is strictly in (0,1) here (both exposures > 0 and finite), so
  // the test is always well-defined; the gate is simply "significant at alpha".
  const pValue = conditionalBinomialTwoSidedP(x1, x2, t1, t2);
  return { gate: pValue < alpha, direction, rateA, rateB };
}

/**
 * The two-sided exact conditional p-value — X₁ | (X₁+X₂) under H₀ of equal rates,
 * with the exposure-derived null p₀ = T₁/(T₁+T₂).
 *
 * ⚠️ INTERNAL — EXPOSED FOR PROPERTY TESTS ONLY, NEVER FOR RENDERING. This IS the
 * p-value the file header says never surfaces. It is exported so the monotonicity /
 * symmetry property tests can assert on the statistic directly; routing its return
 * value to any owner- or vet-facing surface violates §3 and the whole reason
 * `rateContrast` returns a boolean. If you are calling this outside a `.test.ts`,
 * you almost certainly want `rateContrast` instead.
 *
 * Method: the "minimum-likelihood" two-sided exact test (as in R's `binom.test`) —
 * sum the binomial pmf over every outcome at least as UNlikely as the observed one
 * (pmf(k) ≤ pmf(x₁), with a relative tolerance so the mirror outcome is included
 * despite floating error). Computed in log space via `lgamma` for numerical
 * stability at the event counts a 60-day record produces.
 */
export function conditionalBinomialTwoSidedP(
  x1: number,
  x2: number,
  t1: number,
  t2: number,
): number {
  if (!(t1 > 0) || !(t2 > 0) || !Number.isFinite(t1) || !Number.isFinite(t2)) return 1;
  const a = Math.max(0, Math.floor(x1));
  const b = Math.max(0, Math.floor(x2));
  const n = a + b;
  if (n === 0) return 1;
  const p = t1 / (t1 + t2);
  // p0 is strictly in (0,1) because t1,t2 are both > 0 and finite.
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  const logChoose = (k: number): number =>
    lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  // Add each log-probability term only when its multiplier is non-zero. For a
  // realistic exposure ratio p is well inside (0,1) and this is identical to
  // `logChoose(k) + k*logP + (n-k)*logQ`; the guard exists so a pathologically
  // lopsided exposure (p rounding to a float 0 or 1 → logP/logQ = -Infinity)
  // yields `0 * -Infinity = NaN` never — the k=0 / k=n endpoints stay finite.
  const logPmf = (k: number): number => {
    let lp = logChoose(k);
    if (k > 0) lp += k * logP;
    if (k < n) lp += (n - k) * logQ;
    return lp;
  };

  const observedLog = logPmf(a);
  // Relative tolerance in log space (ln(1 + 1e-7)) so an outcome whose probability
  // equals the observed one up to float error — the mirror outcome in the symmetric
  // case — is counted, matching R's `binom.test` (relErr = 1 + 1e-7).
  const tol = 1e-7;
  const threshold = observedLog + Math.log1p(tol);
  let total = 0;
  for (let k = 0; k <= n; k++) {
    const lk = logPmf(k);
    if (lk <= threshold) total += Math.exp(lk);
  }
  return Math.min(1, total);
}

/**
 * ln Γ(x) for x > 0 — Lanczos approximation (g = 7, the standard 9-coefficient set),
 * accurate to ~1e-15 across the range this module uses. Implemented locally to keep
 * the module import-free; only ever called on positive integers (n+1, k+1, n−k+1,
 * all ≥ 1), so the reflection formula for x < 0.5 is unnecessary but included for
 * safety.
 */
function lgamma(x: number): number {
  // Lanczos coefficients (g=7, n=9).
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx).
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const xm = x - 1;
  let aSum = c[0];
  const t = xm + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    aSum += c[i] / (xm + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(aSum);
}

/** Per-exposure rate, or null when exposure ≤ 0 / non-finite. */
function rateOf(w: RateWindow): number | null {
  if (!(w.exposure > 0) || !Number.isFinite(w.exposure)) return null;
  return Math.max(0, Math.floor(w.count)) / w.exposure;
}
