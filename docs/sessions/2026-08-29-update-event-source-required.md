# `updateEvent`'s `occurred_at_source` — required, not defaulted

**Date:** 2026-08-29

Shipped via **#746** (CUL-708). Aug. 2026 Design Polish track — the audit's defect fallout. No schema, no migration, no rendered surface.

## What the issue asked, and what shipped instead

CUL-708 was filed from the CUL-701 session (Dir. of Engineering lens) against this, in `lib/db.ts`:

```ts
const sets = ['occurred_at = ?', 'occurred_at_source = ?'];
const params = [fields.occurred_at, fields.occurred_at_source ?? 'manual'];
```

`occurred_at_source` was typed optional and sat in the signature beside `severity`, `notes` and `confidence` — the three fields CUL-606 deliberately made **optional-by-omission**, under a long comment training authors to omit a key they weren't told about. It read as a member of that group and behaved as its opposite: omission didn't preserve, it asserted that the **owner chose** the timestamp.

The issue offered (a) make it omission-preserving like its neighbours — *marked recommended*; (b) make it required; (c) document the asymmetry. It delegated the call explicitly: *"No PM action needed; this is an engineering call about what omission should mean."*

**Shipped (b), against the issue's own recommendation, with the departure surfaced as a decision brief and approved before any code was written.**

## Why (a) was wrong — the finding this session turned on

`occurred_at` is **required and written on every call**. That is the fact the three neighbours don't share, and it is what breaks the symmetry argument (a) rests on:

| Field | Relation to the unconditional write | Omission should mean |
|---|---|---|
| `severity`, `notes` | orthogonal — nothing to do with the time | preserve ✓ |
| `confidence` | describes *how well known* the time is; survives a re-point | preserve ✓ |
| `occurred_at_source` | describes **who produced the value this call overwrites** | …neither |

So silence has no safe meaning in either direction:

- **`'manual'` (the shipped default):** asserts the owner chose a timestamp on a save where they may have opened a picker, scrubbed nothing, and confirmed. That is **CUL-701** — the same defect arriving through a literal rather than through silence.
- **preserve (option a):** *not* the safer mirror. A caller that omits the key while **moving** the time leaves a clock-stamped row still claiming `'now'` over an owner-chosen point. That is **B-525** — and unlike the first, it *shipped*: `sourceAfterPointEdit`'s docstring cites the live row it was found on (a vomit set to a round 09:00:00 whose source stayed `'now'`).

Option (a) therefore would not have closed the trapdoor. It would have swapped it for one already stepped on in production — and quietly, because a preserving default *looks* like the conservative choice.

A fourth option was considered and rejected: compute it inside `updateEvent` by reading the stored row and applying `sourceAfterPointEdit`. It is the one silence-safe default, but it widens the injected db surface past `Pick<'runAsync'>` (every test adapter with it), turns a dumb writer into a policy holder, and has the app silently decide provenance on the caller's behalf — the CUL-576 lesson inverted.

## The change

- `lib/db.ts` — `occurred_at_source?:` → required; `?? 'manual'` deleted; moved directly under `occurred_at` in the signature so the required pair reads as a pair, with a block comment stating why this one is *not* like the three below it.
- **No runtime fallback behind the type, on purpose.** A default there would be the same trapdoor rebuilt one layer down, and a comment asking the next author not to add one is exactly the enforcement CUL-613 and CUL-701 both record failing.
- **Zero churn** — all four callers (`app/edit-event.tsx`, the three `*CompletionCard.tsx`) already pass the key. A clean full-project `tsc --noEmit` with no caller edits is the proof, not an assertion.

## Tests — split by required direction, both guard halves confirmed red first

Per the CUL-613 rule (*prove it by mutation, not by inspection*) and the companion rule that a guard must fail before the fix while a refactor-safety test must pass on both sides:

- **Guard, half one (type):** a `@ts-expect-error` on a call omitting the key. Pre-fix the directive is **unused** → `tsc` fails with `TS2578` → CI's `App (typecheck + jest)` goes red. Verified red before the fix. This is the enforcement mechanism, which is why it is a directive and not prose.
- **Guard, half two (runtime):** a caller evading the type is **refused**, and neither the provenance nor the time is written. Verified red before the fix — it resolved silently, writing `'manual'`, which is the defect itself observed.
- **Refactor-safety (green both sides):** `'exif'`, `'manual'` and `'now'` each land verbatim. `seed()` gained an optional `source` param defaulting to `'now'` — what a fresh log actually carries, so a wrong default has something real to overwrite.

## Falsification attempt

Not detection or statistical logic, so the `adversarial-reviewer` line is `N/A` — but the column feeds the vet report and the correlation engine, so the invariant was attacked directly rather than signed off with a ✓.

Five shapes were tried against the new signature in a scratch module, each asserted a genuine type error via `@ts-expect-error` (an *unused* directive marks a hole): bare omission; **explicit `undefined`** — the shape that defeated the `in` test on the optional fields, since `exactOptionalPropertyTypes` is off; a possibly-undefined variable; a **conditional spread**, the idiom this very call site uses for `confidence`; and a widened `string`. All five held.

Then the step that makes the pass mean something: a **negative control** — a legal call carrying the same directive — was confirmed to report `TS2578`, proving the five were discriminating rather than vacuously green. (Without it, five directives over five *legal* calls would also have exited 0.) Scratch module deleted; `tsc` re-verified clean.

## Residual, deliberately not folded in

Requiring the field does not stop a future caller writing a **wrong literal** to satisfy the compiler — which is precisely CUL-701's live defect (the meal and dose cards still write `occurred_at_source: 'manual'` unconditionally on a picker save that may have changed nothing). CUL-701 stays open and owns it. This PR is about what `updateEvent` does with silence; that one is about what two callers write.

## Records updated

- **CLAUDE.md** (Tier 1, applied inline): the CUL-576 convention bullet gains the CUL-708 rule and its generalisable test — *a field is only safely optional-by-omission if it is independent of what the call unconditionally writes; where it describes that value, silence is a claim, and the fix is to require it rather than to pick the less-bad default.*
- **STATUS.md:** untouched. No track boundary moved, no standing hold changed, no build phase advanced, no pointer went stale.
