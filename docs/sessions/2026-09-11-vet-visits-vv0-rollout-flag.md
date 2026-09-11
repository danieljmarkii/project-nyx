# Vet visits VV-0 — the `vet_visits` rollout flag and the AC 0 harness

**Date:** 2026-09-11
**Issue:** CUL-898 (Vet visits — the appointment companion; milestone *A — dark + substrate*)
**Mode:** BUILD
**PR:** shipped via #827 (draft)

---

## What shipped

The rollout gate the whole vet-visit companion queues behind, the `daily_look`
template (063) mirrored — a dark allowlist flag, flag-off byte-identical,
seed-first, a beta shelf before GA, retire on a PM GA call only. It is the 7th
instance of the experimental-flag primitive (Ask 037, widget 054,
`signal_design_v2` 055, log picker 056, `event_types_v2` 061, `daily_look` 063),
so the flag half had no mechanism to design. **The work of this session was the
AC 0 harness**, which had no precedent and turned out to be the part with real
decisions in it.

- **`supabase/migrations/065_vet_visits_config.sql`** — the dark seed
  `INSERT INTO app_config (key, value) VALUES ('vet_visits', '{"enabled": false,
  "allowlist": []}'::jsonb) ON CONFLICT (key) DO NOTHING;`. 064 went to Noticed
  N-1's `looks` (#820) between this issue being filed and being built, which the
  issue anticipated; 065 was confirmed free at build. Additive; rollback
  `DELETE FROM app_config WHERE key = 'vet_visits'`.
- **`lib/appConfig.ts`** — `vet_visits` joins `ALLOWLIST_FLAG_KEYS` + the unset
  baseline, with a comment block. **Client-render-only**: no Edge Function reads
  the key (`ask`, `generate-signal` and `generate-report` are all unaware of it)
  and VV-1's schema is account-agnostic, so `supabase/functions/_shared/flags.ts`
  is untouched.
- **`lib/betaFeatures.ts`** — the `BETA_REGISTRY` "Vet visits" row
  (`serverCost: false`), nyx-voice blurb naming the four moments the owner will
  notice and deliberately promising **no insight** (Get ready carries what the
  record already holds; a quiet record renders no findings at all, §7 AC 5).
- **`app/settings/beta.tsx`** — the `Stethoscope` glyph plus an **on-state hint**,
  which only the widget row has otherwise. The companion is the one beta whose
  surfaces stay invisible until there is an appointment on file, so an owner who
  flips it on and looks at Home would otherwise see nothing and reasonably
  conclude it broke.
- **`guards/vetVisitsFlagOff.test.tsx`** — AC 0. See below.
- **Tests** mirror the N-0 precedent across `appConfig.test.ts` (fail-closed +
  cache round-trip + the GA `enabled:true` case pinning G0), `betaFeatures.test.ts`
  (registry length 4→5, the serverCost gate), `beta.test.tsx`, `session.test.ts`.

Both "decide on the fly" choices took the team default: key name `vet_visits`, and
the PM's uid **not** allowlisted at seed.

Nothing consumes the flag (VV-0), and that is asserted rather than assumed.

## The deploy (done in-session, verified)

Pre-flight `SELECT key FROM app_config WHERE key = 'vet_visits'` → 0 rows, as the
issue predicted. Applied via the Supabase MCP `apply_migration`; read back as
`{"enabled": false, "allowlist": []}`. `get_advisors` (security) returns two
pre-existing WARNs (`record_ai_usage` signed-in-executable `SECURITY DEFINER`;
leaked-password protection off) — neither introduced here, since this migration
adds no table, function or policy. Nobody is allowlisted, so the seed changes
nothing an owner can see.

## The harness — why it is not the shape the issue's phrasing suggests

The issue and spec §5.5 both describe AC 0 as "a snapshot test toggles the flag
and diffs". The natural reading is an **A/B diff**: render flag-off, render
flag-on, assert the trees are equal. That shape is wrong in *both* directions,
and the file records it so nobody rebuilds it:

- It stays **green on the exact defect it exists to catch.** The mutation the AC
  itself names is VV-2 rendering its card ungated — and ungated, the card is in
  *both* trees, so the diff passes over the leak.
- It goes **red on correct code.** A properly gated card is present flag-on and
  absent flag-off. That is the feature working, so the first correct consumer
  would force the test to be deleted.

A golden `.snap` per surface bites the leak but reds on every unrelated change to
Home, and its repair is `jest -u` — a guard whose repair silently blesses the bug.

What shipped is **absent-module equivalence**:

> the tree with the flag off === the tree with `components/vetvisits/` stubbed out

"Byte-identical to an app without the companion", stated mechanically, with no
golden file and no testID convention to remember. Green today (the namespace is
empty), reds on the AC's named mutation, stays green when the card is gated, and
immune to unrelated churn because both sides of the comparison move together.
2.8 s for four surfaces.

It depends on one convention, which the file states and the tripwire enforces:
**the companion's rendering lives in `components/vetvisits/`.** A screen may hold
the gate; it delegates the drawing there. UI written inline in a screen is
invisible to this guard.

The **C-32 tripwire** is what makes the empty set an assertion (the
`firstCallerLands` shape from `guards/completionCard.test.ts`): exactly zero
consumers of `useAllowlistFlag('vet_visits')` today, naming CUL-900 as the PR that
reds it. When it reds, VV-2 owes its UI in the namespace *in the same change* —
"every consumer is gated" proves nothing over an empty set, and a guard completed
after the first consumer is a guard completed after the bug. A second, permanent
case survives the tripwire's deletion: once a consumer exists, the namespace must
be non-empty, because a consumer with an empty namespace makes every comparison
above vacuously green.

## Three findings, each from proving it by mutation rather than by reading

This is the session's real content. Every one of these was invisible on
inspection, and two of them were **green tests that proved nothing**.

1. **`react-test-renderer`'s JSON nodes carry their own `$$typeof`**
   (`Symbol.for('react.test.json')`). The first working normalizer tested for
   `$$typeof` before the rendered-node shape, in order to strip React elements
   sitting in props — so it caught every *rendered node* too and returned only its
   root. All four surfaces compared `{element:'View'}` against itself and **passed
   green**. The suite was green, fast, and measuring nothing. The mutation proof
   is what caught it, which is the entire argument for building one alongside the
   guard rather than deferring it to VV-2. Fixed by discriminating on shape —
   `children` as an own key marks a rendered node, a React element only ever has
   one inside `props` — and by adding a **non-vacuity floor** that asserts a real
   tree *before* the equality runs. The floor is not ceremony: an equality over
   two empty things is precisely this file's failure mode.

2. **An element-valued prop carries a fiber, and a fiber carries wall-clock
   timings.** Home's `ScrollView refreshControl={<RefreshControl …/>}` holds an
   `_owner` with `actualStartTime`, `actualDuration`, `treeBaseDuration`. So the
   raw `toJSON()` differs from *itself* between any two renders. Left in, all four
   surfaces failed against themselves and jest spent minutes emitting a 260 KB
   diff of numbers that mean nothing — the kind of red that gets a guard weakened
   rather than read. `normalize` drops `_owner` / `_store` / `_self` / `_source`,
   sorts keys, and collapses handlers to `'[fn]'` (a fresh closure per render is
   not a leak; a leak is a whole subtree).

3. **`jest.isolateModules` cannot be used to swap a module under a renderer.** It
   hands the screen a fresh React while the top-level renderer holds the original,
   so every hook dies on `Cannot read properties of null (reading 'useCallback')`.
   Requiring the renderer *inside* the isolated registry fixes the identity but
   re-runs RTL's module-scope hook registration, which jest rejects outright
   ("Hooks cannot be defined inside tests") — after taking **162 s for a single
   surface**. The shape that works is a **mutable proxy mock** registered once:
   the namespace module keeps its real exports, each is wrapped in a component
   that renders null while a module-scope flag is set, and the switch lives
   *inside the wrapper's render* so it does not depend on how the importing screen
   bound the symbol. One React, one RTL, no registry games.

4. **The consumer scan needs two detectors, and measurement said so.** The first
   cut matched the call shape, which the C-33 lesson names as bypassable by an
   aliased import. The obvious hardening — match the bare key — is wrong *here*,
   because of this PR's own choice of key name: `vet_visits` is also the table,
   which is why the key was named to match it. Run before adopting, the bare key
   flags `lib/sync.ts`, `lib/hydration.ts` and `lib/syncQueue.ts` — three
   legitimate table pushes, zero flag reads — and exempting the sync fabric would
   blind the scan to a consumer added there later. The scan therefore keeps the
   call shape and gains a separate, key-independent assertion that **nobody
   aliases `useAllowlistFlag`** (true repo-wide today, so free), proven by
   mutation with an aliased import. When a hardening's false positives are
   legitimate uses of the same token, the answer is a second orthogonal detector,
   not an exemption list.

A fifth, smaller one: the mutation fixture cannot `require('react')`. A file in
the OS temp directory has neither the repo's babel transform nor its
`node_modules` on its resolution path, and reaching react by absolute path yields
a *different module instance* from the renderer's — which produced an unrendered
element instead of a tree, silently. The fixture takes React and the RN primitives
through a shim module fed from `globalThis`, and its component **uses a hook on
purpose**, because a hookless component renders fine under a mismatched React and
so could not have detected finding 3.

## Proven by mutation (C-18), four directions, each run red pre-fix

- **The tripwire** — a fake `useAllowlistFlag('vet_visits')` dropped into
  `components/home/TrialStrip.tsx`: both tripwire cases red. Restored.
- **The non-vacuity floor** — the normalizer's rendered-node branch deleted (i.e.
  finding 1 re-introduced): all four surfaces red, where before the floor they
  were all green. Restored.
- **The alias detector** — an `import { useAllowlistFlag as useFlag }` added to
  `components/home/TrialStrip.tsx`: red. Restored.
- **The equivalence half** — the fixture's ungated companion card: the trees
  differ, the marker is present in one and absent in the other.

## Verification

`npx tsc --noEmit` clean. `npm test` — **7,612 passed / 350 suites**, including
all 15 guards. The five touched suites green under all three CI timezones
(Kiritimati +14, Chatham +12:45, Honolulu −10).

## Decisions made

- **AC 0 is absent-module equivalence, not an A/B diff** (PM go-ahead, this
  session, after the fork was put as a decision brief). The two rejected designs
  and *why* are written into the guard's header, since the wrong one is the one a
  future session would reach for first.
- **The companion's rendering lives in `components/vetvisits/`.** New convention,
  introduced here because the guard's soundness rests on it. A screen may hold the
  gate and delegate the drawing.
- Both issue defaults taken (key name; no uid at seed).

## Known issues / limits, stated rather than discovered

- **The stub wraps any function export into a component.** The namespace is UI by
  convention — that is what makes stubbing it equivalent to "the companion does
  not exist" — so a helper belongs in `lib/`. The line that widens is named in the
  file.
- **The consumer scan does not strip comments,** so a commented-out
  `useAllowlistFlag('vet_visits')` would red the tripwire. That direction is the
  safe one (a false red on a tripwire that is meant to be deleted by the next PR
  anyway), unlike `guards/completionCard.test.ts`, where a *sentence about* the
  rule matched as a call to it and produced a false positive on real work.
- **Heavy children are mocked** to get four real screens to mount
  (`WeightTrendCard` because `react-native-gifted-charts` ships untransformed
  ESM). This cannot produce a false pass on the trees compared, because the
  comparison is differential and both sides share the mocks — but it does cost
  *coverage*: a companion node rendered only inside a stubbed child would not be
  seen. None of the stubbed children has a companion surface in it today; VV-2 and
  VV-5 should re-check that when they add theirs.

## PM Action Items

None. Nothing here waits on the PM, and the cohort UPDATE is deliberately not part
of this PR.

## Recommended next steps

VV-1 (CUL-899) is unblocked by this merge and is the critical path. It is the
schema PR (`vet_appointments`, the three links, `vet_visits.deleted_at`, the
same-pet triggers, the local-first plumbing, the reader sweep,
`guards/visitReaders.test.ts`) and `rls-privacy-reviewer` is mandatory on it.
