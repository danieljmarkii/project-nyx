# Food detail stops printing the stored extraction error — and the fix that got reverted

**Date:** 2026-08-30

CUL-651, shipped via #788 (draft). Three commits, five files: `app/food/[id].tsx`, a new
`components/food/ExtractionFailedBanner`, its test, a first-ever test for the food detail
screen, and a new rule in `guards/ownerFacingCopy.test.ts`.

## What shipped

`app/food/[id].tsx` rendered `row.ai_extraction_error` as the second line of the
owner-facing "Extraction failed" banner. That column is written by
`extract-food-from-photo`'s catch block as a verbatim `err.message`, so an owner could read
`Claude API error 529: {"type":"error"…}`, `Storage download failed for <path>: …`, or
`DB update failed: duplicate key value…` on a screen about their cat's food.

The B-399 leak class (CUL-445 / B-477), in a shape the guard could not see: it keys on the
**base** of the expression being error-like, and a database row is not.

**The banner became a component with no prop that could hold a display string** — the
`NamedCompletionCard` shape (CUL-606 / CUL-614), so the leak is unreachable by construction
rather than merely deleted. Putting it back means adding a prop and changing a test that
says why. A `@ts-expect-error` assertion fails `tsc` the day someone does. The raw cause is
not discarded: it goes to `console.warn` in `applyRow`, the single funnel both the initial
load and the realtime update pass through — the same split the load path immediately above
it already makes.

**The guard grew the rule that would have caught it.** A *stored error field* — a property
whose own name says it holds an error (`ai_extraction_error`, `syncError`, `last_error`) —
reaching a display sink is now a leak, independent of whether its base is error-like. The
bare name `error` is excluded, because `result.error` is the Supabase `{ data, error }`
object whose store-then-map is sanctioned. Bracket notation (`row['ai_extraction_error']`)
is covered by the same predicate, so the rule does not stop at the dot.

## The decision the issue asked for

CUL-651 explicitly left one thing open: should the guard grow a rule for error-bearing
columns, or is that too broad for a syntactic scan? Put to the PM as a decision brief with
the sizing attached, and ruled **add the rule**.

The sizing is what made it answerable rather than a matter of taste: run against the pre-fix
tree, the rule produced **exactly one finding** — the CUL-651 site. Zero false positives
app-wide. The near-miss shapes (`styles.error`, a style prop and not a display sink;
identifiers like `{error}` holding mapped copy, already covered and unchanged) do not move.

## The premise the guard had written down, and which turned out to be false

The `<Text>`-children rule was justified in place:

> a raw Error OBJECT as a Text child crashes RN ("Objects are not valid as a React child"),
> so a bare `{error}` here is always a mapped error-message STRING … which is the correct
> pattern — only `{error.message}` is a real leak.

That holds for an in-memory `Error` and fails for a **stored error string**, which renders
perfectly well and is mapped by nobody. `{row.ai_extraction_error}` sat in a `<Text>` child
for months under a guard that had reasoned itself into not looking. The correction is kept
beside the original comment rather than replacing it, because the shape of the mistake —
an argument that is sound for one kind of value and silently assumed to cover all of them —
is the part worth carrying forward.

## The change that was made and then reverted

The first commit also widened the banner's render gate from
`isFailed && row.ai_extraction_error` to `isFailed` alone. The reasoning: `food-capture.tsx`
upserts `ai_extraction_status: 'failed'` **without ever writing that column** — the §4.3
cap, the flag being off, and a transport fault all return from the Edge Function without
touching the row — so those foods showed no banner and no retry at all. A failure hidden by
the absence of a diagnostic string is still a hidden failure, and
`docs/food-library-redesign-requirements.md:239` forbids a silent extraction failure. That
argument stands.

**The remedy was wrong, and the `pm-feature-review` caught it by following the button rather
than the banner.** On exactly the rows the widening newly exposed, the retry is destructive:

- `handleRetry` writes `'pending'` to the server before invoking;
- the cap and flag-off paths answer with a typed **200**, so `error` is null and
  `handleRetry` — which inspects only `error` — sees nothing;
- the row stays `'pending'`, where the screen's `isPending` branch **replaces the
  Ingredients `TextInput` with a "Reading the label…" spinner** (the one field the banner's
  own copy tells the owner to fill in) and drops the banner and retry with it;
- and `reapStalePendingFoods` — keyed on `created_at`, not on when the row entered
  `pending` — becomes eligible to hard-delete the food on the next sync cycle, cascading
  into `diet_trial_foods`.

So the widening converted *"AI data missing, every field editable"* into *"one tap from
losing the food"*. Reverted in `b0bdb62`.

**The diagnosis had been backwards.** `ai_extraction_error` in that condition is not
belt-and-braces: it is the only thing on the client separating *"we tried and could not read
it"* from *"we did not try"*. The old gate was **under-specified, not wrong** — it shows
nothing where it should show the capture screen's calm care-first cap band. That needs the
state model `'failed'` is collapsing three ways, which is CUL-768, not this PR. The gate is
now pinned in **both** directions with the reasoning beside it, so re-widening reds a test.

The transferable half: *withholding an affordance is cheap; a destructive one is not* — and,
more sharply, **a fix that makes a hidden state visible can make a destructive control
reachable, so follow the affordance the widening exposes, not just the state it reveals.**

## Two review findings that did not survive checking

Both reviews were substantive and both contained a claim that fell over on verification.
Recording them because the habit is the point, not the errors.

- **"The capped retry burns a usage unit against the monthly 60."** It does not.
  `record_ai_usage` (migration 031) buckets on `(now() at time zone 'utc')::date` and
  `date_trunc('month', …)` — calendar buckets, not rolling windows — and `resolveGateState`
  denies on `count > cap`. An increment while already capped denies nothing that was not
  already denied and does not delay recovery. The counters inflate; owners lose nothing.
  Not filed.
- **"The curly apostrophe is the only one in the entire owner-facing tree."** Not so: 14
  files use curly contractions. But 55 use straight, and the sibling line in
  `food-capture.tsx` that this copy was modelled on uses straight — so it was changed
  anyway, for the right reason rather than the stated one.

A third finding was right and sharpened an issue rather than the PR: the revert **narrows**
the destructive-retry path without closing it, because a row with a *genuine* stored error
retried while capped hits the identical strand. `parseGateResponse` (`lib/appConfig.ts`) is
the shipped fix shape, already used by `food-capture.tsx` eight hundred lines away, and
`handleRetry` ignores `data` entirely. Recorded on CUL-769, which is where the fix belongs.

## Verification

Every guard was proved by **mutation** (CUL-613), one defect at a time — nine mutations,
each reddening exactly one test: the gate widened back; the raw string rendered again; the
diagnostic log deleted; a third line of copy; `disabled` dropped; the a11y label and `busy`
dropped; the stored-error-field detector removed; the bare-`.error` carve-out removed; the
bracket-notation branch removed.

A runtime "does not render the error" assertion was written first and **deleted** — it could
only ever pass, since the fixture has no error to hand over. That is the CUL-613 / CUL-699
green-guard-over-its-own-defect shape, caught in its own diff. What replaced it is the
compile-time `@ts-expect-error`, which discriminates: removing the directive makes `tsc`
fail with `Property 'detail' does not exist`.

One characterization test was wrong when first written, and the truth was better than the
claim: the two-step `authErrorCopy` idiom **is** spared over a stored field (its output is
read off a base named for the copy, not for the error), so per-cause copy has a clean shape
available when CUL-768 wants it. Only the inline form over-reaches.

`app/food/[id].tsx` had no test before this session; it has one now, covering all four
extraction states.

## Residuals — filed, not folded in

| Issue | |
|---|---|
| **CUL-769** (High) | The retry can hard-delete a food. `handleRetry` writes `'pending'`; `reapStalePendingFoods` is keyed on `created_at`, so any food older than 30 minutes is eligible the instant it does. Pre-existing, and live in the shipped app. The reaper's own header asserts the invariant `handleRetry` breaks. |
| **CUL-768** (Low) | `'failed'` collapses three states (fault / capped / flag-off). Owns the silent-failure gap the revert leaves standing, and the register — a capped owner must not meet symptom rose where the capture screen gave them the care-first band. |
| **CUL-770** (Medium) | The banner never clears after the owner fills the food in by hand; `handleSave` never touches the status. The new copy sharpens this from noise into an instruction the screen never retires. |
| **CUL-771** (Medium) | Four owner-facing names for label reading on one screen; the failure state never names the photo repair that would work; and `food-capture.tsx`'s *"we'll retry extraction in the background"* is a promise nothing in the codebase keeps. |

## Documented, deliberately not closed

Two shapes where the new rule over-reaches (an error object destructured under a name other
than `error`; an inline mapper at the sink) and one where it under-reaches (a stored field
destructured to a local, at a non-immediate sink). None exists in the tree today, each has a
legitimate `// copy-guard-ok:`, and adding mechanism to a guard on speculation is how guards
grow seams — the lesson v1.5 of the taxonomy spec paid five adversarial passes for. All
three are pinned as characterization tests, so widening the carve-out later is a visible
decision rather than a silent one.
