// The ONE vomit-contents presence predicate (CUL-226 / B-759).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Two Edge Functions each answer "does this vomit read show food / hair / bile?"
// and, until now, each answered it with its OWN hand-written copy of the leaf
// checks:
//
//   • generate-signal/photoComposition.ts  (L3 `readFlags`) — the Signal-card
//     photo-composition evidence: three independent present-only rates.
//   • generate-report/report.ts (`classifyVomitContents`) — the vet-report
//     descriptor: one mutually-exclusive PRIMARY category.
//
// The atoms were identical (`contents.includes('hair')`; `undigested_food` OR
// `partially_digested_food`; `bile` in contents OR the authoritative
// `bile_present === 'yes'`), so a future edit to what "bile is present" means —
// a new token, a renamed one — had to be made in two places or the report
// descriptor and the Signal card would silently diverge on the SAME underlying
// read. That is exactly the client/server drift the "one predicate" doctrine
// (`lib/mealTiming.ts` §3/G9, `lib/dietTrial.ts` §5.3) exists to pre-empt — the
// diet-trial track shipped THREE contradictory off-diet definitions before it
// was collapsed into one. So the leaf checks are extracted HERE, once, and both
// functions import them.
//
// ── LEAVES ONLY — NOT THE AGGREGATION (the scope, deliberately) ───────────────
//
// This file owns only the ATOMS — "is marker X present in this one read". It does
// NOT own how the two callers combine them, and must not: their SHAPES genuinely
// differ and neither is wrong.
//   • the report picks ONE primary category by priority order (hair ▸ food ▸ bile
//     ▸ foam/liquid ▸ grass ▸ unsure) — mutually exclusive;
//   • L3 emits THREE independent present-only rates, each over its own answered
//     denominator, and never collapses them to a single label.
// Folding the aggregation together would force one shape onto both and lose that
// distinction. So `classifyVomitContents` keeps its priority ladder and L3 keeps
// its present-wins fold; they share only the leaves below. (The report's
// foam/liquid + grass leaves have a single caller and no Signal-card equivalent,
// so they stay local to report.ts — a one-caller "predicate" carries no drift to
// prevent, which is the whole reason this file exists.)
//
// ── PURE AND DEPENDENCY-FREE, AND THAT IS A HARD CONSTRAINT ───────────────────
//
// Same rule as `lib/mealTiming.ts` / `lib/dietTrial.ts`: plain data in, plain
// bool out, with ZERO imports. This module is consumed by the Deno Edge runtime
// (generate-signal, generate-report), by `tsc --noEmit`, and by jest — a runtime
// import at module scope (AsyncStorage, `./supabase`) is what made
// `lib/trialContaminant.ts` unreachable from a server and let a third definition
// be written. A shared primitive the server cannot import is not shared. So: no
// imports; any future one MUST carry a `.ts` extension (Deno will not resolve an
// extensionless specifier; Metro and `moduleResolution: "bundler"` accept one).
//
// TOKEN VOCABULARY. The `vomit_content[]` token strings are owned by
// analyze-vomit/index.ts (`const CONTENTS`, the write path). Bile additionally
// keys on the AUTHORITATIVE `bile_present` tristate, kept OUT of the bulk
// contents matrix by migration 013 so the two can't drift — `hasBile` fuses both
// sources exactly as both callers already did.

// The three leaves guard with `Array.isArray(contents)`, not the callers' original `contents != null`.
// For the declared `string[] | null` type the two are identical (a non-null value IS the array); the
// difference is only for an OUT-OF-CONTRACT value, and there `Array.isArray` is strictly safer. A bare
// string would make `contents != null` true and then `String.prototype.includes` SUBSTRING-match —
// `'hair'.includes('hair')` is true, so a mistyped `contents = 'hair'` would read as a hairball. The
// `vomit_content[]` column can't produce that (PostgREST deserializes it to an array or null, and both
// I/O shells pass it through uncoerced), so it is unreachable today — but this file is the single home
// these predicates are meant to be imported into, and a future caller reading a raw `jsonb` text field
// or hand-building a fixture is exactly the drift a shared primitive should be immune to, not merely
// far from. `Array.isArray` makes the divergence structurally impossible rather than incidentally
// unreachable (CUL-226 adversarial review). numerator ⊆ nothing here — these are plain presence bools.

/** The `vomit_content[]` tokens for retained food — undigested OR partially-digested. Both denote
 *  food that failed to digest; either present ⇒ food. A null or non-array read ⇒ false. */
export function hasFood(contents: readonly string[] | null): boolean {
  return (
    Array.isArray(contents) &&
    (contents.includes('undigested_food') || contents.includes('partially_digested_food'))
  );
}

/** The `vomit_content[]` hair token (the hairball marker). A null or non-array read ⇒ false. */
export function hasHair(contents: readonly string[] | null): boolean {
  return Array.isArray(contents) && contents.includes('hair');
}

/**
 * Bile present — the AUTHORITATIVE `bile_present` tristate is `'yes'`, OR a `bile` token appears in
 * `contents`. Either source counts (present-wins across the two fields). Only `'yes'` on the tristate
 * asserts presence here; `'no'`/`'unsure'`/`null` do not (a NON-bile read is answered elsewhere, never
 * inferred as "no bile" from this leaf). A null or non-array `contents` with a non-`'yes'` tristate ⇒ false.
 */
export function hasBile(contents: readonly string[] | null, bilePresent: string | null): boolean {
  return bilePresent === 'yes' || (Array.isArray(contents) && contents.includes('bile'));
}
