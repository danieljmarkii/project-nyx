// AI Signal — protein-key canonicalization (B-052).
//
// THIS FILE IS NOW A THIN RE-EXPORT. The implementation was promoted to the shared,
// dependency-free module `lib/protein.ts` (B-023 PR 1) so there is ONE source of
// truth for how a protein name is keyed across the whole product — the client
// analytics dashboard's "top protein" (lib/analytics.ts) and this Edge Function's
// case-crossover correlation key (./detection.ts) MUST agree, or the two surfaces
// would pool/rank proteins differently.
//
// Local imports keep their `./protein.ts` path (detection.ts, protein.test.ts), so
// this re-export keeps every existing Deno test green and changes no behavior — it
// only moves where the code lives. The relative path reaches the repo-root `lib/`
// from supabase/functions/generate-signal/; esbuild inlines it into the deploy
// bundle, so the deployed artifact stays self-contained.
//
// See lib/protein.ts for the full rationale, the narrow-scope decision (qualifier-
// strip + junk-drop only; no B-048 synonym mapping), and the documented examples.

export { canonicalizeProtein } from '../../../lib/protein.ts'
