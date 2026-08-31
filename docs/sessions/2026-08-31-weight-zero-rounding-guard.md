# Weight gate: guard the converted kg, not just the lbs input (CUL-698)

**Date:** 2026-08-31

Shipped via **#786** (draft). Mode: BUILD. Branch `claude/weight-lbs-kg-zero-rounding-h75to3`.

## What shipped

One guard and three tests. `parseWeightLbsToKg` (`lib/weight.ts`) now checks the
value it is about to return, not only the string it parsed:

```ts
const kg = lbsToKg(lbs);
return kg > 0 ? kg : null;
```

Client-only. `lib/weight.ts` is in no Edge Function closure, so neither standing
deploy hold (CUL-19, CUL-557) is touched, and `guards/edgeFunctionDeploy.test.ts`
stays green.

## The defect

The function guarded `lbs <= 0` on the **pound** value and rounded to **kilograms**
afterwards. `0.01` lb is a positive pound and a zero kilogram, so it cleared the
gate and reached the write as the one value every consumer exists to refuse.
Verified before touching anything: `0.01`, `0.005`, `0.0001`, `1e-9` all returned
`0` rather than `null`.

Because `canConfirmWeight` (`app/log.tsx:1292`) gates the **Log** button on this
same function, the button lit up for all of them. The docstring had claimed the
opposite since it was written — it names zero explicitly, and names all three
costs a stored zero carries (trend corruption, a wedged sync queue, the profile
snapshot).

Filed by the `adversarial-reviewer` during CUL-641 and deliberately not folded
into it. That was the right call twice over: it is a different defect, and it
turned out to have a sibling of its own (below).

## What generalises

**A unit conversion is a place where a guard can be true of the input and false of
the output.** The check and the write were in the same four-line function and still
disagreed, because they were about different quantities — the check read pounds,
the write stored kilograms, and `lbsToKg` rounds in between. Nothing looked wrong
at either line. The rule the fix writes into the file: **guard the number you are
about to store, not the string it came from.**

Both checks are kept and the comment says why each is load-bearing, because they
now read as redundant to a skimmer and the input check is the only thing rejecting
`NaN` and a fat-fingered `9999` *before* a conversion happens. A "simplify to one
check" pass has to argue with a stated reason rather than shipping green.

The error direction is worth naming. On a record where **weight loss is the danger
signal** (the clinical guardrail carried at the top of `lib/weight.ts`), a false
*negative* here — refusing a real weigh-in — is the expensive mistake, not a false
positive. It cannot happen: `kg > 0` only rejects inputs that were converting to a
value the DB refuses anyway, so nothing storable is newly turned away.

## Tests, and the direction each one had to land on

Three added, and CUL-613's split-by-direction decided the shape of each before
they were written:

- Two **guards** — a rounds-to-zero rejection case, and a sweep asserting the gate
  never returns a value `CHECK (weight_kg > 0)` would refuse. Both confirmed **red
  against the pre-fix source** (`Received: 0`) before being trusted, then green.
- One **refactor-safety pin** — `0.02` lb → `0.01` kg, the allowed side of the
  edge. It passes on *both* sides on purpose. That is not a weak test; it is the
  half that proves the guard rejects rounds-to-zero rather than everything small,
  and it would be describing something else if it went red pre-fix.

The guards assert the **converted value**, not merely `toBeNull()`. `0` arriving by
some other route is the defect, so `toBeNull()` alone would leave a later change
free to reintroduce it.

One correction to the issue's own text, immaterial to the fix but worth the record:
it names `0.02` lb as "the smallest input that still rounds to a non-zero kg". The
real edge is ≈`0.01102` lb, so `0.015` also stores cleanly. The test uses `0.02`
anyway — a readable value safely on the allowed side — but the *guard* keys on the
converted value rather than a hardcoded input threshold, so it sits exactly on the
rounding edge wherever that edge moves to if `lbsToKg` ever changes precision.

## The sibling it turned up — CUL-765, filed not folded

Checking who else converts lbs→kg found `components/profile/EditPetModal.tsx:141`
calling `lbsToKg` **directly**, behind a hand-rolled `lbs != null && !isNaN(lbs)`.
That guard is strictly weaker than the shared one: no zero check, no negative
check, no `MAX_WEIGHT_LBS`. Transcribed and run, it writes `0` for `0`, `-2.27` for
`-5`, and `4535.48` for `9999` — the last overflowing `NUMERIC(5,2)` into the
generic `Could not save` alert.

It writes the same `pets.weight_kg` column CUL-698's third bullet is about, and
that column is the one with **no** `CHECK` — so a zero there persists silently, and
`seedWeightPrefill` (`app/log.tsx:306`) then offers it back as the next weigh-in's
pre-fill.

Not folded in, per the one-issue-per-PR rule and because it genuinely is not
mechanical: routing it through `parseWeightLbsToKg` needs a call on what an invalid
entry should *do* on a form where blank legitimately means "no weight on file"
(reject-on-Save with a named reason, as `app/edit-event.tsx:389` already does, vs.
gating `canSave`). Both options and that constraint are written into **CUL-765**.

This is the CUL-641 shape one layer out — *four hand-rolled "was this a weight
check?" checks is precisely the shape that produced this bug* — arriving as a
second hand-rolled parse of the same field.

## What was deliberately not done

No **plausibility floor**. `0.02` lb (≈9 g) is still accepted, because it stores a
real non-zero `0.01` kg. A minimum bound would be the symmetric half of
`MAX_WEIGHT_LBS`, but that constant's own comment scopes it as a fat-finger guard
rather than a clinical limit, and choosing a floor is a species call (a newborn
kitten is ~100 g), not a correctness fix. Named in the PR as a non-goal rather than
guessed at; no issue filed, because nothing is currently wrong without it.

## Verification

- `tsc --noEmit` clean.
- 295 suites / 6361 cases green — full run, and again through the pre-push hook.
- Both new guards proven red against the unfixed source, individually.
