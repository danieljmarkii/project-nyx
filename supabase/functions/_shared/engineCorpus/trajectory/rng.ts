// Seeded randomness for the trajectory corpus (Engines v3 PR-15, CUL-508).
//
// Every draw comes from a stream named by (seed, scenario, pet, component, day), so a day's
// truth depends only on that day's name. That buys common random numbers: the same seed run
// under two observers (flag off, flag on) gets the same pet until the owner's responses
// actually diverge, which is what makes "flag off vs flag on over the same seeds" a paired
// comparison rather than two independent samples. mulberry32 is the generator the engine's
// own property sweeps use (generate-signal/detection.test.ts).

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over the parts, joined by a separator no part contains. */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  const s = parts.join('␟')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function stream(...parts: (string | number)[]): Rng {
  return mulberry32(hash32(...parts))
}

export function between(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng()
}

export function intBetween(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p
}

/** Knuth's method: exact, and fine at the rates here (well under one a day). */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0
  if (lambda > 30) throw new Error(`poisson: lambda ${lambda} is outside what this corpus models`)
  const limit = Math.exp(-lambda)
  let k = 0
  let p = rng()
  while (p > limit) {
    k++
    p *= rng()
  }
  return k
}

export function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Marsaglia and Tsang, with the shape < 1 boost. Mean `shape * scale`. */
export function gamma(rng: Rng, shape: number, scale: number): number {
  if (shape < 1) return gamma(rng, shape + 1, scale) * Math.pow(Math.max(rng(), 1e-12), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = normal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x ** 4) return d * v * scale
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale
  }
}

export function pickWeighted<T extends { weight: number }>(rng: Rng, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = rng() * total
  for (const item of items) {
    r -= item.weight
    if (r < 0) return item
  }
  return items[items.length - 1]
}

/**
 * A UUID-shaped id minted from its name. The second group is fixed at `c0a5` ("corpus"), so
 * a test can assert every id in the corpus was minted here and none was copied from a live
 * table.
 */
export function mintId(...parts: (string | number)[]): string {
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  const a = hex(hash32('a', ...parts))
  const b = hex(hash32('b', ...parts))
  const c = hex(hash32('c', ...parts))
  const d = hex(hash32('d', ...parts))
  return `${a}-c0a5-4${b.slice(0, 3)}-8${b.slice(3, 6)}-${c}${d.slice(0, 4)}`
}

export const MINTED_ID = /^[0-9a-f]{8}-c0a5-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
