// `test.failing` for the Deno runner, which has none. TEST-ONLY.
//
// CUL-1036 (trial window PR 0) · docs/nyx-trial-extension-requirements.md §7.
//
// ── WHY IT IS A MODULE AND NOT A FUNCTION IN EACH TEST FILE ─────────────────────
// Two suites need it (`render.test.ts` for §5.2, `trial.test.ts` for §5.4's report
// path), and a helper copied into each is how `guards/blankComments.ts`'s own header
// says a subtle bug propagates. One copy, one set of semantics.
//
// ── WHY THE FILENAME ───────────────────────────────────────────────────────────
// `.testutil.ts`, not `.test.ts`: CI discovers suites with
// `find supabase/functions -name '*.test.ts'`, and a file matching that glob with no
// `Deno.test` in it would be a suite asserting nothing. It is also outside the
// deploy ledger's fingerprint, which walks `index.ts`'s transitive relative imports
// — nothing shipped imports this, and nothing shipped ever should.
//
// ── THE CONTRACT ───────────────────────────────────────────────────────────────
// The body states the REQUIREMENT. This passes while the requirement is violated and
// FAILS the moment it holds, so a repair cannot land without promoting the marker,
// and a repair that does not actually repair cannot land quietly either. `skip`
// (`{ ignore: true }`) is the thing this exists instead of: a skipped test asserts
// nothing in either direction.
//
// ONLY AN ASSERTION FAILURE COUNTS AS "STILL VIOLATED". A fixture that stopped
// building, a typo, a renderer that threw — each re-throws as a real failure rather
// than being absorbed as evidence the hazard is alive. jest's own `test.failing`
// lacks this filter (measured on CUL-1036: it passes on a `TypeError`, a
// `ReferenceError` and a bare thrown string), which is why the jest half of this PR
// carries its own wrapper rather than using it.
import { strict as assert } from 'node:assert'

export function expectedFailure(name: string, fn: () => void): void {
  Deno.test(name, () => {
    let thrown: unknown
    let threw = false
    try {
      fn()
    } catch (e) {
      threw = true
      thrown = e
    }
    if (!threw) {
      throw new Error(
        `EXPECTED FAILURE NOW PASSES: ${name}\n\n` +
          'The behaviour this documented has changed. That is the signal, not a bug: ' +
          'promote this to a plain Deno.test, delete the expectedFailure wrapper, and ' +
          'record the repair on the issue named in the block comment above it.',
      )
    }
    // A non-assertion throw is a broken fixture, not a documented hazard.
    if (!(thrown instanceof assert.AssertionError)) throw thrown
  })
}
