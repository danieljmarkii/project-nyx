# CUL-226 (B-759) — factor the vomit-contents presence leaves into a shared `lib/`

**Date:** 2026-08-19

**Shipped via #678** (draft → merged this session).

## What shipped

A single new shared primitive, `lib/vomitContents.ts`, holding the three vomit-contents
**presence leaves** that two Edge Functions had each hand-duplicated:

- `hasFood(contents)` — `undigested_food` OR `partially_digested_food`
- `hasHair(contents)` — the `hair` token
- `hasBile(contents, bilePresent)` — the authoritative `bile_present === 'yes'` OR a `bile` token
  (present-wins across the two fields)

Both call sites now import them instead of re-writing the atoms:

- `generate-signal/photoComposition.ts` — L3's `readFlags` (the Signal-card photo-composition evidence).
- `generate-report/report.ts` — `classifyVomitContents` (the vet-report descriptor).

This is the client/server drift the codebase's "one predicate" doctrine (`lib/mealTiming`,
`lib/dietTrial`) exists to pre-empt: the atoms were identical, so a future edit to what
"bile is present" means had to be made in two places, or the report descriptor and the Signal
card would silently diverge on the *same* underlying read. The diet-trial track shipped three
contradictory off-diet predicates before it was collapsed into one; this closes the same class
before it can happen.

## The scope decision (from the issue): leaves only, not aggregation

The issue was explicit — *"factor only the leaf presence checks, not the aggregation."* The two
callers keep their genuinely different **shapes**, and neither is wrong:

- the report collapses to **one** mutually-exclusive primary category by priority order
  (hair ▸ food ▸ bile ▸ foam/liquid ▸ grass ▸ unsure);
- L3 emits **three** independent present-only rates, each over its own answered denominator.

Forcing those into one shared function would lose the distinction, so both aggregations stayed
local. The report-only `foam`/`liquid_only` + `grass_or_plant` leaves have a **single caller** and
no Signal-card equivalent, so they stayed local too — a one-caller "predicate" carries no drift to
prevent, which is the whole reason the shared file exists. A repo-wide grep confirmed these were
the **only** two duplicate sites (no hidden third consumer client-side or elsewhere).

## Behaviour preservation

The predicates are literal lifts of the two originals. Verified three ways:

- The **unchanged** `photoComposition.test.ts` (19) + `report.test.ts` (112) suites pass, including
  the `Nyx dry-run — vomit phenotype: 12 food / 5 bile / 1 hairball` clinical regression and the L3
  G4 present-only/tristate/collapse suite — these are the behaviour-preservation guard.
- Full `deno test supabase/functions/` — **1366 / 0**. Full app `jest` — **5312 / 0** (incl. the new
  `lib/vomitContents.test.ts`). `tsc --noEmit` clean. `deno check scripts/*.deno.ts` clean.
- **`adversarial-reviewer` (Biostatistician lens) — PASS.** Swept `classifyVomitContents` old-vs-new
  over `null` + `[]` + all 128 token subsets (reversed + duplicated) × 5 `bilePresent` values —
  **3845 cases, zero divergence**; priority ladder, bile-OR commutativity, and the `Set.has`→
  `Array.includes` swap all preserved. The one input it *could* break was a **type-violating bare
  string** `contents = 'hair'` (`new Set('hair')` splits into characters so `.has('hair')` is false,
  but `String.prototype.includes` substring-matches → `'hairball'`) — **unreachable** through the
  `vomit_content[]` column (PostgREST deserializes to array-or-null; both I/O shells pass it through
  uncoerced), so out of contract, not a live break.

## Hardening + the review fix (follow-up commit)

Two changes landed on the reviewers' feedback, both cheap and verified:

- **The `Array.isArray(contents)` guard** (adversarial-reviewer's suggested belt-and-suspenders).
  The three leaves guard with `Array.isArray`, not the callers' original `contents != null`. For the
  declared `string[] | null` type the two are **identical**; the difference is only for an
  out-of-contract value, where `Array.isArray` is strictly safer — it turns the bare-string
  divergence from *incidentally unreachable* into *structurally impossible*. The right posture for a
  shared primitive meant to be imported by future callers (a raw `jsonb` read, a hand-built fixture).
  A pinning test models the case with `as unknown as string[]`. `tsc` confirms the `readonly string[]`
  narrowing is clean.
- **A stale-comment fix** (`code-reviewer`, the only finding, non-blocking). `photoComposition.ts`'s
  header claimed *"the only imports are …"*, which the new import made false — updated to name all
  three lib primitives. `code-reviewer` verdict: **ship-ready**, everything else clean (purity,
  `.ts`-tri-runtime resolution, semicolon conventions per file, the scope call, type correctness).

## Notes

- **No deploy required or triggered.** The change is byte-identical in output; when `generate-signal`
  / `generate-report` next deploy (behind their existing Signals-v2 gates, STATUS.md §"Signals v2
  redeploy gates"), the re-bundle naturally includes the refactor. This PR does not touch that gate.
- No schema, no migration, no new secret, no RLS/Storage/deletion/export surface.
- STATUS.md unchanged — the refactor advances no build step, changes no gate, adds no PM action item.

## Residuals

None. The out-of-contract bare-string boundary is closed by the guard; the two aggregations are
correctly left distinct; no follow-up issue filed.
