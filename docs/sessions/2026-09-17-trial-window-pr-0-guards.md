# Trial window PR 0 — guards pinning today's behaviour, with two expected failures

**Date:** 2026-09-17

CUL-1036, shipped via #867 (draft). The first PR of the diet-trial window track
(CUL-156), and the only one that changes no behaviour. Test-only: nothing an owner
sees moved, no production source was touched, and no deploy is owed.

Spec: `docs/nyx-trial-extension-requirements.md` §7 (PR 0), §5.2, §5.4, §5.6.

## Why a PR that changes nothing goes first

The track is about to move a number the vet report reads. §5.4 is the record of what
happened the last time that was assumed rather than executed: the `adversarial-reviewer`
pass of 2026-09-16 returned FAIL and falsified draft 1's TE-6 — coverage is *not*
untouched by an extension. So the two executed defects are pinned as tests before any
repair can touch them.

## What shipped

**`guards/trialWindow.test.ts`** (new, 56 tests) — three green guards:

- **G1 · No mid-trial route to `trial_extend`, in any state.** Driven over
  `planTrialCard` / `resolveTrialCard`, never through a screen — C-41's lesson, and the
  issue asked for it explicitly. The walk is a `Record<TrialCardState, …>`, so adding a
  member to the union fails `tsc --noEmit` rather than escaping the guard; the two
  states that *cannot* be mid-window carry a named reason rather than being omitted.
  Each fixture is checked against the state it is filed under before the rule is
  asserted, so the walk cannot measure one state eleven times.
- **G2 · `nextTargetDays`' clamp as a property**, over a sweep grounded in the caller's
  real input space rather than invented: day counters from `trialDayCounter`'s actual
  range (`Math.max(1, …)`, so integers ≥ 1), extension sizes read from the shipped
  `extensionDays()` so a D5/CUL-367 ruling moves the sweep with it.
- **G3 · The off-diet exposure floor survives a target move.** Identical
  `totalFeedings` / `offDiet` before and after, over a fixture *proven* to be clipped
  before and unclipped after — the half of TE-6 that held.

**Three expected failures**, which is the point of the PR. `test.failing` in jest and an
`expectedFailure()` wrapper on the Deno side (Deno has no equivalent), never `skip`:

- **§5.4 — the coverage gate flip** (jest). A dog 28-day trial logged 10 of days 1–28
  then daily to day 50: one extension tap moves coverage 10/28 → 32/50, flips
  `belowCoverageFloor` true→false and `mayStateRecordClean` false→true, on zero new
  evidence, retroactively over days already reported. **CUL-1038 (PR 1b) turns it green.**
- **§5.4 again, in the OTHER direction** (jest). CUL-1036 named only the reassuring
  flip. Probing the spec's claim that the mechanism "runs both ways" found it holds
  exactly: a trial logged **every day** of its 28-day window and then silent to day 90
  reads 28/28 `supports` with the clean claim granted, and one tap re-reads it as 28/90
  `does_not_support` and **takes the claim away**. TE-6 is stated without a direction,
  so pinning only the reassuring half would have under-stated the hazard in the PR
  whose whole job is recording it — and a repair that only stops the movement one way
  would have passed. This direction is also the one that cannot be argued: the days it
  newly counts as gaps fall *after* the window the trial was designed against, and the
  owner did not stop logging — the trial ran out.
- **§5.2 — the shortening render** (Deno, in `render.test.ts` beside the B-532 block it
  extends). A 56-day trial shortened to 28 on day 28 and marked complete prints *"Ran
  its course — the full window was completed."* B-532 fixed the half the report can
  *see* — a trial short of its stored window — and this is the half it cannot: the
  window *moving*, which `target_duration_days` being overwritten in place makes
  invisible (TE-4).

## The mechanism, and why it is not a comment

Both markers **pass while the requirement is violated and go red the moment it holds**.
A repair cannot land without promoting the marker, and a repair that does not actually
repair leaves the marker exactly where it was. That is the property the issue asked for
("nobody can quietly ship a fix that doesn't actually fix them") and it is why `skip`
was forbidden: a skipped test asserts nothing in either direction.

§5.2's marker is unusual and the file says so: it is **not waiting on an issue**. D3a
holds the window forward-only, so the app ships no control that can reach the state —
the defect is held un-shippable rather than repaired. The test is the trip-wire on that
decision. A future spec re-opening backward movement owes §5.2 a render rule *before* a
UI control, and will find that out here rather than on a vet's desk.

## Proven by mutation, not by reading (C-18)

Eight source mutations, each reverted:

| Mutation | Result |
|---|---|
| `stateFor` `overrunDays === 0` → `<= 0` | 11 red |
| `stateFor` `overrunDays > 0` → `> -100` | 11 red |
| `intake_decline` action gate → `true` | 2 red |
| `trial_refusal` action gate → `true` | 2 red |
| `nextTargetDays` drops `base`'s max **alone** | **green** |
| drops the final clamp **alone** | **green** |
| drops both / `day + 1` → `day` with base's max gone | red |
| `intOr` drops `Math.floor` | red |
| exposure loop bounds on the clipped end | red |
| `render.ts` stops making the full-course claim | red, with the promote-this message |

Both expected-failure harnesses were additionally proven non-vacuous in both directions:
a simulated repair reds them; a non-assertion throw inside the Deno wrapper propagates
rather than being absorbed as "still failing"; and a broken fixture (day 50 → 27, so no
overrun and no clip) reds seven green companion tests rather than hiding inside the
marker. Every marker's name now opens with `EXPECTED FAILURE`, because jest reports
`test.failing` with a ✓ and a scan of the output would otherwise read it as an
ordinary pass.

## Two findings recorded in the files rather than left implicit

**`nextTargetDays`' criterion is implemented twice, and the two are mutually redundant.**
`base` takes `Math.max(currentTargetDays, day)` and the return takes
`Math.max(base + extra, day + 1)`; since `extra >= 1`, either alone is sufficient. So
**no single-line mutation can red G2** — measured, not reasoned: removing the final
clamp alone left every test green, and removing `base`'s max alone left the property
green (it red only the §5.4 fixture's derived tap, a different assertion). What reds it
is removing both, or removing `base`'s max together with `day + 1` → `day`, the
off-by-one that turns "strictly greater" into "at or equal". Stated as a blind spot in
the guard, because an undocumented one reads as coverage (C-38). If a future refactor
collapses the two into one, that line becomes load-bearing and single-line mutation
starts working.

**One correction to CUL-1036's own description, verified at file:line rather than taken
on trust.** The issue names three routes "each gated on `overrunDays >= 0`" at `:1576`,
`:1619` and `:1789`. Only the first two carry that expression. The third sits inside
`if (state === 'overrun')` and is gated by the *state*, which `stateFor` reaches only at
`overrunDays > 0` — the same bound by a different mechanism. It matters for what a
mutation proves: half (a) of G1 is what covers `:1789`, so a guard asserting only half
(b) would have left it unguarded. This is CUL-874's lesson applied early — verify a
premised surface at file:line before building on it.

## The adversarial pass returned FAIL, and it was right

`adversarial-reviewer` over PR 0's fixtures, isolated context. It found **no false
hazard** — both pinned defects reproduce exactly, and §5.2's fixture is genuinely
un-shippable today (the only writer of `target_duration_days` is `extendTrial`, whose
only caller clamps upward). Every finding was an **under-statement**, which in a PR
whose entire job is recording the hazard is the defect class. Each was re-executed
here before acting on it rather than taken on the reviewer's word.

Six closed in `222b371`:

1. **The harness asymmetry.** jest's `test.failing` passes on ANY throw — measured:
   `TypeError`, `ReferenceError` and a bare thrown string all satisfy it. So a dead
   fixture read as a live hazard, the one thing a marker must not do, and the header
   presented it as equivalent to the Deno wrapper that *does* filter. Replaced with a
   local `expectedFailure` filtering on jest's `matcherResult` (`err.name` is
   `'Error'` for jest assertions, so name is useless as a discriminator).
2. **The requirement was narrower than TE-6.** At 18 of 28 logged, `interpretability`
   moves `partially_supports` → `supports` while *both* pinned booleans hold — and it
   renders verbatim on the vet report. A conforming repair could still violate TE-6.
3. **The recorded ceiling was wrong, materially.** Nothing logged in the window, daily
   after it: one tap takes 0/28 `does_not_support` to **22 of 22, fraction 1.0,
   `supports`, clean claim granted**, because once the tail clip releases the *head*
   clip follows the target to the first logged day. `untrackedDaysBeforeFirstLog` is
   fabricated at 28, so the app asserts the first 28 days pre-date any logging — they
   are ordinary un-logged trial days. The head clip's own documented forbidden
   direction, re-entered through the target.
4. **Three of the spec's own claims are false**, executed: the tap is **inert at the
   milestone** (`overrunDays === 0` ⇒ no clip applies), a **mid-window extension is
   inert too**, and it is **not one tap of `Keep going`** but two, behind `Tell
   Culprit what's next` — a link whose label names nothing about a window. The hazard
   is overrun-only.
5. **G1 did not hold the property it advertised.** It walked only the card's action
   list, while `TrialCompletionSheet.tsx:246` fires `onExtend()` with no window gate
   and the header affordance is not on `TrialCardModel` at all — so PR 3 could ship
   the entire door without reding this file. That is the C-38 cheque the guard cited
   one block earlier, written by the guard itself. Half (c) now pins the two facts
   that do hold the door shut: exactly one `setCompletionEntry('decision')` call site,
   and the header verb still `Replace`. Three mutations red it.
6. **Scope and blast radius.** The fixture drove the client path under a heading
   about what the vet reads. **Fixed properly at the PM's direction rather than
   annotated** — see below. The four surfaces the tap moves that this PR still does
   not pin (the card's own disclosing sentence, `interpretabilityStatement`,
   `coveredDayIndices`, and `pet.dietTrialActive` muting report detectors ⑧/⑨/⑩)
   are stated rather than omitted.

## The report path, executed — and §5.6's transcription debt paid

The PM asked for the report-path fixture before merge rather than as PR 4's problem.
`supabase/functions/generate-report/trial.test.ts` now drives the whole path — raw
events → `assembleReport` → `renderReport` → the text a clinician reads — twice, with
`targetDurationDays` as the only difference between the runs.

This closes what §5.6 itself recorded as owed: *"no live Deno render — two report
strings were TRANSCRIBED, not executed."* Executed, they are directionally right and
numerically wrong, and **the real numbers are worse**, because the scope a diet-trial
owner actually gets is rung 1, *since the most recent vet visit* — the shortest window
on the page:

| scope | before the tap | after one tap |
|---|---|---|
| default | Meals logged on **10 of 28** days | **32 of 50** days |
| since the visit (rung 1) | Meals logged on **0 of 9** days | **22 of 31** days |

A literal **zero** becomes *"all 22 matched the trial diet or a permitted food."* And
the owner most likely to hit it is the one this product is for: sent home from a vet
visit on an elimination diet, which is precisely the record rung 1 scopes to.

**The tap also deletes the page's own disclosure.** The day line goes from *"day 50 —
22 days past the 28-day window"* to *"day 50 of 64"*. The one sentence telling the
clinician this trial had outrun the window it was designed against is what the tap
removes — the same shape the owner's card shows, on the document that matters more.
§5.4's *"nothing says the window moved"* understates it: the thing that did say so is
the casualty.

Four tests: the two scopes, the deleted disclosure, and a fourth expected failure
stating TE-6 at the report layer **over both scopes** — a repair that holds on the
full window and not on the since-visit one has not held where the wedge's own owner
reads it. Proven both ways: converted to a plain `Deno.test` it fails on its own
assertion; a frozen denominator reds all three companions and fires the marker's
promote-this message.

The Deno wrapper moved to `expectedFailure.testutil.ts` so the two suites share one
copy rather than drifting — `blankComments.ts`'s own argument for existing. The
`.testutil.ts` extension keeps it out of CI's `find … -name '*.test.ts'` (a file
matching that glob with no `Deno.test` in it would be a suite asserting nothing) and
out of the deploy ledger's fingerprint, which walks `index.ts`'s transitive relative
imports. Both confirmed rather than assumed: 29 suites still discovered, ledger guard
green.

## The seventh finding is a PM decision, and it is the serious one

**"CUL-1038 (PR 1b) is what turns this green" is false under D7(a) as ruled.** D7(a)
is a disclosure — *"a render, not a mechanism"*, in the spec's own words. But
`belowCoverageFloor` is `interpretability === 'does_not_support'` and
`mayStateRecordClean` reads `facts.interpretability`, both computed in
`lib/dietTrial.ts`, and neither reads `closedByOverrun`. A render cannot move them.

Executed both ways: a real frozen denominator (D7(b)) reds all three markers and their
companions; D7(a)'s render-only change reds none. So PR 1b as specced would land with
the suite green, the hazard fully intact, and — before this correction — a comment in
this file telling the next session that green *was* the repair signal. That is exactly
the C-38 failure this track exists to pay off, reproduced inside the guard written to
pin it.

The sentence came from CUL-1036's own description, so this is a falsified premise in
the issue, not a slip in the build. D7's justification is falsified too (finding 4
above: "already reachable at the milestone" and "multiplied by this feature" are both
false). Decision brief posted on **CUL-1038**, which is raised to Urgent and
`Waiting on PM`; recommendation is **D7(c)** — freeze *and* disclose — since the
freeze's prerequisite column is already PR 1's job under D2a, and (c) is the only
option under which PR 0's markers can ever go green.

Not resolved here. PR 0's job is to state the requirement accurately, and TE-6 is
stated without qualification in the spec's own spine.

## What did not need doing

No `deploy-manifest.json` bump. A `.test.ts` is outside the fingerprint closure
`guards/edgeFunctionDeploy.test.ts` walks (it follows `index.ts`'s transitive *relative*
imports), so adding a Deno test beside `render.ts` cannot trip it — confirmed green
rather than assumed.

No `STATUS.md` edit: no track boundary moved. No CLAUDE.md edit: this PR establishes no
*code* convention, only a test pattern that is documented at length in the two files
themselves, and the budget guard means an addition there is paid for by a deletion. The
pattern is flagged on the issue as an optional Tier-1 addition for the PM to rule on
rather than spent unasked.

## Verification

- `npx tsc --noEmit` clean
- `npm test -- --ci` — 8446 passed / 389 suites
- `TZ=Pacific/Chatham npm test -- --ci` — 8446 passed; the new guard also green under
  `Pacific/Kiritimati` and `Pacific/Honolulu`
- `deno test` over all 29 suites — 1799 passed

## Next

PR 1 (the migration, CUL-156's three D2 columns) and PR 1b (CUL-1038, D7a's disclosure)
are both unblocked. PR 1b is the one that turns §5.4's marker green, and when it does,
that test going red is the signal to promote it.
