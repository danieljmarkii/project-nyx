// Unit tests for the shared protein-name canonicalizer (B-052).
//
// Run with:  deno test supabase/functions/_shared/protein.test.ts
//
// Uses node:assert (bundled — no remote imports) so the suite runs in a
// network-restricted CI/dev container. Covers the two things B-052 cares about:
// (1) casing + label-rendering variants of ONE protein collapse to one key, and
// (2) the conservatism guarantee — two DISTINCT known proteins are never merged,
// and an unknown protein still normalizes without being guessed at.

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
})

Deno.test('processing qualifiers (hydrolyzed / isolate / concentrate) reduce to the source', () => {
  assert.equal(normalizeProtein('hydrolyzed soy protein'), 'soy')
  assert.equal(normalizeProtein('Hydrolysed Soy Protein'), 'soy')
  assert.equal(normalizeProtein('Pea Protein Isolate'), 'pea')
})

Deno.test('a single known protein with filler words reduces to that protein', () => {
  assert.equal(normalizeProtein('free range chicken'), 'chicken')
  assert.equal(normalizeProtein('Lamb & Rice'), 'lamb') // lamb is the protein; rice is filler
})

Deno.test('CONSERVATISM: two distinct known proteins are NEVER merged', () => {
  // A genuine multi-protein label stays distinct (just normalized) — we must not
  // silently collapse it to one source and corrupt a correlation.
  assert.equal(normalizeProtein('chicken & duck'), 'chicken duck')
  assert.equal(normalizeProtein('Chicken and Turkey'), 'chicken and turkey')
  // These two must NOT be equal — different proteins, different keys.
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
  // All tokens are qualifiers → fall back to the collapsed base, never empty.
  assert.equal(normalizeProtein('By-Product Meal'), 'by product meal')
})

Deno.test('idempotent — normalizing a canonical value is a no-op', () => {
  for (const v of ['chicken', 'soy', 'chicken duck', 'ostrich']) {
    assert.equal(normalizeProtein(v), v, `expected ${v} stable`)
  }
})
