# Per-incident read — an escalation outlives a failed re-analysis (CUL-812)

**Date:** 2026-09-05

Shipped via **#804**. Mode: BUILD. Also closes **CUL-539**, the same defect filed
2026-08-18 and parked on a verification this session made.

## The defect

`supabase/functions/_shared/incident-analysis.ts`'s outer catch wrote
`{status: 'failed', error}` as an upsert on `event_id` with no guard — the only
write path in the function without one. A failed **re**-analysis of an incident
that already held `recommendation: 'worth_a_call'` therefore overwrote the status,
and the client renders `status === 'failed'` *before* the read card
(`VomitAnalysisSection.tsx:264`, `StoolAnalysisSection.tsx:275`), so the owner was
shown "Couldn't finish reading this one." with a Try again button where a live
escalation belonged. A transient Claude/network error is enough to reach it, and
`checkResolved` resolves on any non-`pending` status, so the display was terminal
for that session.

The harm is not that an error is shown. It is that an escalation the record had
already earned is replaced by an error, which to an owner reads as *nothing was
found* — on the one surface built never to reassure.

Worth recording: the guard was not merely missing. `humanEdited` and
`existingRealAnalysis` are `const`s declared inside the `try`, so they were **out
of scope at the catch**. The issue's fix shape could not have been written without
hoisting something, which is probably why it was never written.

## The rule that shipped

> An **escalation** already in the record survives a failed re-read. A benign or
> uncertain read does not.

This departs from CUL-812's stated fix shape (`existingRealAnalysis || humanEdited`,
the guard the rest of the function uses) and the reason is the one thing in this
session worth carrying forward. Photo replacement is one of the named ways a second
analysis is reached. Preserving a benign prior read across a failed re-read would
stand a `monitor` — "keep an eye out" — in front of an image nothing successfully
read: reassurance-on-absence, the n=1 invariant inverted. So presence is preserved
and absence is not. Presence is a fact the record holds; absence is a claim about a
photo we may no longer be looking at.

`humanEdited` deliberately does not widen it: the failure write touches only
`status` + `error`, never a structured column, so an owner's edits are never lost —
only hidden behind the retry frame until a read succeeds.

## Two halves, because the server fix alone reaches nobody

- **Server** — `buildFailureWrite` (pure, tested) returns `upsert` | `error-only` |
  `skip`. On an escalation the catch records the error alongside and never touches
  `status` / `recommendation` / `read_text`.
- **Client** — `escalationSurvivesFailure` in `lib/incidentReadState.ts` gates the
  `failed` render branch in both sections.

The client half is the one that matters first: the function deploy rides the held
**CUL-557** chain, and nothing server-side can repair rows *already* flipped to
`failed` over an escalation. Only the render can put those back in front of an owner.

## What the reviews broke, and what it cost

The `code-reviewer` and `adversarial-reviewer` ran in parallel against the first
commit. The adversarial pass returned **FAIL** with five broken cases. Three were
fixed on the branch; the rest were filed.

**Fixed (commit 2).**

1. *TOCTOU.* Both reviewers found it, the adversarial one more sharply. `existing`
   was read at step 3b and written in the catch, with the vision call in the gap —
   10-60s. Two throw sites (the attachments fetch, `computeContextualFlags`) also sit
   *before* step 3b, so a network hiccup there reached the catch with `petId` set and
   `existing` still null, and the upsert branch clobbered anyway. The code-reviewer
   proposed moving the step-3b read earlier; that closes the first race by widening
   the second, because a **sibling** invocation can write into the gap — Ask's A8
   live read runs in a separate process and holds no analysis-chain claim, so
   CUL-801's in-memory claim cannot serialize it. The catch now **re-reads at the
   moment of the write decision**, which is the only version of the check whose
   window is worth nothing.
2. *Fail-open on the read itself.* That re-read can fail, and a failed read is not
   "no row" — the caller cannot tell an empty table from an unreachable one. It now
   fails **closed** (`existingReadFailed` → `skip`).
3. *The cap buried the rescued row.* `existingRealAnalysis` excluded `'failed'`, so
   the rows the client now renders as escalations were exactly the rows the cap
   branch believed it had nothing to protect. An owner tapping re-run on a rescued
   "Worth a call" with the day's cap spent watched it become the cap band — the
   client checks `capped` *before* the card. **This was exposure the first commit
   created, not a pre-existing bug**: before the rescue, that escalation wasn't on
   screen to lose. A `worth_a_call` is now a real analysis whatever its status says.

**The finding that reframed the fix, and is still open.** The asymmetry is aimed at
the wrong axis. Presence-vs-absence is not the axis a photo replacement acts on —
that axis is record-derived vs photo-derived. So the fix preserves exactly the
escalations a photo swap *invalidates* (a visual flag, the model's own call) and
discards the ones it *cannot* (contextual flags — CUL-815). A preserved "I can see
what looks like blood in this photo" can stand over a replaced photo containing
none, on the surface whose whole premise (CUL-800 D3) is showing it to a vet. And
because nothing renders `error`, a failed re-read is now indistinguishable from one
that succeeded and reconfirmed — pre-fix that failure was visible, wrongly framed
but visible.

The resolution is neither preserve nor revert, and the repo already holds it: the
diet-trial rule, *a blackout is DISCLOSED beside the verdict, never reverted*. Keep
the escalation, say the latest read didn't finish. That is new owner-facing copy on
a safety card, so it needs `nyx-voice` and mock frames — filed as **CUL-819** with a
decision brief rather than invented here.

## Falsification attempts (the DoD line)

Every guard proved by **mutation**, both directions, not by reading:

- server guard reverted → only the escalation test reds;
- server guard widened to any recommendation (the issue's literal shape) → the two
  benign-read tests red — the asymmetry defending itself;
- client predicate forced false → 3 tests red; widened to any recommendation → 3 red.

Before the predicate moved to `lib/incidentReadState.ts`, that last pair red **zero**
component tests: both component suites replace the whole `lib/analysis` module (it
pulls `./sync` → expo-sqlite), so each had hand-mirrored the predicate in its mock,
free to drift from the real one without either suite noticing. Moving it to a module
that imports nothing let the sections import it directly, and the tests now exercise
the real thing. `jest.requireActual` cannot substitute here — it would drag
expo-sqlite in.

## Not folded in

- **CUL-815** (High) — the failure path discards a contextual escalation computed in
  the *same run*. `clinical-guardrails` Pattern 5 says it must run the contextual
  floor anyway; it doesn't. Same defect class as CUL-812, different fix shape (the
  catch must *write* the escalation, not merely decline to overwrite).
- **CUL-816** (High) — a refused re-run leaves a permanent spinner where the read
  was. Pre-existing, but this session made "Re-run analysis" the only affordance on a
  rescued row, so it is now the door those owners are pointed at.
- **CUL-817** (Medium) — step 3b's read swallows its own `error`, so `humanEdited`,
  `existingRealAnalysis` and the escalation guard all fail **open**, toward
  clobbering. The catch now fails closed; the main path still doesn't.
- **CUL-818** (Low) — `guards/ownerFacingCopy.test.ts` excludes the bare name `error`
  (it collides with the Supabase `{data, error}` shape), so `event_ai_analysis.error`
  is an unguarded stored error column. Nothing renders it; a `{row.error}` would ship
  green.
- **CUL-819** (`Waiting on PM`) — the disclosure decision above.

## Residual worth knowing

On a **legacy** row already flipped to `failed` over an escalation, the card renders
but `canEdit` (`status === 'completed' || 'uncertain'`) is false, so the owner sees
the escalation, its read text and its observations but cannot edit them. Correct
trade, and it disappears once the function deploys, since the row never reaches that
state again.

The vet report turned out to be a second reason `status` is load-bearing:
`generate-report/report.ts:2436-2449` gates `bristol` / `stoolColour` /
`contentsCategory` on `status === 'completed'`. Blood and foreign material survive
regardless — `unionPresentFlags` folds present flags "REGARDLESS of that member's
status" — so the top safety signal was never at risk, but the secondary observations
would have gone missing from a spuriously-flipped row. The report's own
escalate-on-presence defence held under attack; it is worth knowing it was the only
thing standing.

## Deploy

`analyze-vomit` and `analyze-stool` re-fingerprinted in `deploy-manifest.json`, both
still `pending` on the **CUL-557** chain (analyze-vomit → analyze-stool → ask). No
migration, no new secret, no model / prompt / cap / floor change — the failure path
only.
