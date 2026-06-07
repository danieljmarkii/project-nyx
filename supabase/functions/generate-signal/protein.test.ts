// Unit tests for B-052 protein-key canonicalization.
//
// Run with:  deno test supabase/functions/generate-signal/protein.test.ts
//
// Pure-logic suite (no I/O), mirroring detection.test.ts. Covers the documented
// dirty data from dogfooding cat Nyx (the chicken / Chicken By-Product Meal /
// "null"-string fragmentation that motivated B-052) plus the boundary cases the
// narrow scope must NOT over-reach on (no synonym mapping; no touching of words
// that merely end in "meal").

import { strict as assert } from 'node:assert'
import { canonicalizeProtein } from './protein.ts'

Deno.test('lowercases and trims so casing/whitespace variants pool', () => {
  assert.equal(canonicalizeProtein('Chicken'), 'chicken')
  assert.equal(canonicalizeProtein('  CHICKEN  '), 'chicken')
  assert.equal(canonicalizeProtein('chicken'), 'chicken')
})

Deno.test('collapses internal whitespace runs', () => {
  assert.equal(canonicalizeProtein('Chicken   By-Product   Meal'), 'chicken')
})

Deno.test('strips the by-product-meal qualifier family to the base protein', () => {
  assert.equal(canonicalizeProtein('Chicken By-Product Meal'), 'chicken')
  assert.equal(canonicalizeProtein('chicken by-product meal'), 'chicken')
  assert.equal(canonicalizeProtein('Turkey By Product Meal'), 'turkey')
  assert.equal(canonicalizeProtein('Turkey Byproduct Meal'), 'turkey')
  assert.equal(canonicalizeProtein('chicken by-product'), 'chicken')
  assert.equal(canonicalizeProtein('Chicken Meal'), 'chicken')
})

Deno.test('the four real Nyx variants all collapse to one key', () => {
  const variants = ['chicken', 'Chicken', 'Chicken By-Product Meal', 'chicken by-product meal']
  const keys = new Set(variants.map(canonicalizeProtein))
  assert.deepEqual([...keys], ['chicken'])
})

Deno.test('junk / sentinel strings become null (protein-unknown)', () => {
  for (const junk of ['', '   ', 'null', 'NULL', 'none', 'N/A', 'na', 'unknown', 'undefined', 'unspecified']) {
    assert.equal(canonicalizeProtein(junk), null, `expected ${JSON.stringify(junk)} → null`)
  }
})

Deno.test('null / undefined pass through as null', () => {
  assert.equal(canonicalizeProtein(null), null)
  assert.equal(canonicalizeProtein(undefined), null)
})

Deno.test('a qualifier with no protein left is null, not an empty key', () => {
  assert.equal(canonicalizeProtein('meal'), null)
  assert.equal(canonicalizeProtein('by-product meal'), null)
})

Deno.test('does NOT map species synonyms (B-048 lane, not B-052)', () => {
  // Narrow scope: distinct sources stay distinct. "ocean whitefish" keeps its
  // qualifier because "ocean" is not a processing form.
  assert.equal(canonicalizeProtein('ocean whitefish'), 'ocean whitefish')
  assert.equal(canonicalizeProtein('Salmon'), 'salmon')
  assert.notEqual(canonicalizeProtein('ocean whitefish'), canonicalizeProtein('whitefish'))
})

Deno.test('does NOT strip a word that merely ends in "meal" with no boundary', () => {
  // "oatmeal" must not become "oat" — the qualifier rule requires a space before
  // "meal". (Not a protein, but the guard is what keeps the rule safe.)
  assert.equal(canonicalizeProtein('oatmeal'), 'oatmeal')
})

Deno.test('idempotent: canonicalize(canonicalize(x)) === canonicalize(x)', () => {
  for (const raw of ['Chicken By-Product Meal', 'ocean whitefish', 'Turkey Meal', 'null']) {
    const once = canonicalizeProtein(raw)
    assert.equal(canonicalizeProtein(once), once)
  }
})
