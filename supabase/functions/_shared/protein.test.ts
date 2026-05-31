// Unit tests for the shared protein-name canonicalizer (B-052).
//
// Run with:  deno test supabase/functions/_shared/protein.test.ts
//
// Uses node:assert (bundled — no remote imports) so the suite runs in a
// network-restricted CI/dev container. Covers the two things B-052 cares about:
// (1) casing + label-rendering variants of ONE protein collapse to one key, and
// (2) the conservatism guarantee — two DISTINCT ingredients are never merged,
// and hydrolyzed stays a distinct key. The CONSERVATISM block pins the
// counterexamples the adversarial review (DoD gate) used to break the first cut.

import { strict as assert } from 'node:assert'
import { normalizeProtein } from './protein.ts'

Deno.test('casing + whitespace collapse to one canonical key', () => {
  assert.equal(normalizeProtein('chicken'), 'chicken')
  assert.equal(normalizeProtein('Chicken'), 'chicken')
  assert.equal(normalizeProtein('  CHICKEN  '), 'chicken')
  assert.equal(normalizeProtein('Chicken\t'), 'chicken')
})

Deno.test('by-product / meal / cut qualifiers strip to the base protein (the B-052 case)', () => {
  // The four real cat-Nyx variants the ticket names — all one protein now.
  for (const v of ['chicken', 'Chicken', 'Chicken By-Product Meal', 'chicken by-product meal']) {
    assert.equal(normalizeProtein(v), 'chicken', `expected ${v} → chicken`)
  }
  assert.equal(normalizeProtein('chicken meal'), 'chicken')
  assert.equal(normalizeProtein('Deboned Chicken'), 'chicken')
  assert.equal(normalizeProtein('salmon meal'), 'salmon')
  assert.equal(normalizeProtein('Chicken Fat'), 'chicken')
  assert.equal(normalizeProtein('Soy Protein'), 'soy') // non-hydrolyzed: 'protein' is a qualifier
})

Deno.test('CONSERVATISM: hydrolyzed stays a DISTINCT key from the intact protein', () => {
  // Clinical: a hydrolyzed elimination diet exists because the intact protein
  // reacts and the hydrolysate does not — merging them hides the trial signal.
  assert.equal(normalizeProtein('Hydrolyzed Chicken'), 'hydrolyzed chicken')
  assert.notEqual(normalizeProtein('Hydrolyzed Chicken'), normalizeProtein('Chicken'))
  // -zed / -sed spelling both canonicalize; 'protein' qualifier still strips.
  assert.equal(normalizeProtein('hydrolyzed soy protein'), 'hydrolyzed soy')
  assert.equal(normalizeProtein('Hydrolysed Soy Protein'), 'hydrolyzed soy')
  assert.notEqual(normalizeProtein('Hydrolyzed Soy Protein'), normalizeProtein('Soy'))
})

Deno.test('CONSERVATISM: a compound ingredient is NOT merged into a bare protein', () => {
  // 'sweet potato' must not collapse to 'potato' (two distinct ingredients) — the
  // single-token reduction only fires when ONE meaningful token remains.
  assert.notEqual(normalizeProtein('Sweet Potato'), normalizeProtein('Potato'))
  assert.equal(normalizeProtein('Sweet Potato'), 'potato sweet') // preserved, sorted
  assert.equal(normalizeProtein('free range chicken'), 'chicken free range') // not merged into 'chicken'
})

Deno.test('CONSERVATISM: two distinct known proteins are NEVER merged, and blends are order-stable', () => {
  // A genuine multi-protein label stays distinct (just normalized + sorted).
  assert.equal(normalizeProtein('chicken & duck'), 'chicken duck')
  // Order + connective variants of the SAME blend collapse to ONE key (the
  // fragmentation B-052 exists to kill — adversarial review caught the original).
  assert.equal(normalizeProtein('duck, chicken'), 'chicken duck')
  assert.equal(normalizeProtein('chicken and duck'), 'chicken duck')
  assert.equal(normalizeProtein('Duck with Chicken'), 'chicken duck')
  // Distinct proteins remain distinct keys.
  assert.notEqual(normalizeProtein('chicken'), normalizeProtein('beef'))
})

Deno.test('an unknown protein normalizes by casing/qualifier but is not guessed at', () => {
  assert.equal(normalizeProtein('ostrich'), 'ostrich')
  assert.equal(normalizeProtein('Ostrich Meal'), 'ostrich')
})

Deno.test('null / blank / all-qualifier input', () => {
  assert.equal(normalizeProtein(null), null)
  assert.equal(normalizeProtein(undefined), null)
  assert.equal(normalizeProtein(''), null)
  assert.equal(normalizeProtein('   '), null)
  assert.equal(normalizeProtein('---'), null)
  // All tokens are qualifiers → fall back to the collapsed base, never empty,
  // and never collides with a real protein key.
  assert.equal(normalizeProtein('By-Product Meal'), 'by product meal')
})

Deno.test('idempotent — normalizing a canonical value is a no-op', () => {
  for (const v of ['chicken', 'soy', 'chicken duck', 'ostrich', 'hydrolyzed soy', 'potato sweet']) {
    assert.equal(normalizeProtein(v), v, `expected ${v} stable`)
  }
})
