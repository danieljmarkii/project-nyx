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

**`guards/trialWindow.test.ts`** (new, 47 tests) — three green guards:

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

**Two expected failures**, which is the point of the PR. `test.failing` in jest and an
`expectedFailure()` wrapper on the Deno side (Deno has no equivalent), never `skip`:

- **§5.4 — the coverage gate flip** (jest). A dog 28-day trial logged 10 of days 1–28
  then daily to day 50: one extension tap moves coverage 10/28 → 32/50, flips
  `belowCoverageFloor` true→false and `mayStateRecordClean` false→true, on zero new
  evidence, retroactively over days already reported. **CUL-1038 (PR 1b) turns it green.**
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
marker.

## Two findings recorded in the files rather than left implicit

**`nextTargetDays`' criterion is implemented twice, and the two are mutually redundant.**
`base` takes `Math.max(currentTargetDays, day)` and the return takes
`Math.max(base + extra, day + 1)`; since `extra >= 1`, either alone is sufficient. So
**no single-line mutation can red G2** — measured, not reasoned: removing the final
clamp alone left all 47 tests green, and removing `base`'s max alone left the property
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
- `npm test -- --ci` — 8437 passed / 389 suites
- `TZ=Pacific/Chatham npm test -- --ci` — 8437 passed; the new guard also green under
  `Pacific/Kiritimati` and `Pacific/Honolulu`
- `deno test` over all 29 suites — 1795 passed

## Next

PR 1 (the migration, CUL-156's three D2 columns) and PR 1b (CUL-1038, D7a's disclosure)
are both unblocked. PR 1b is the one that turns §5.4's marker green, and when it does,
that test going red is the signal to promote it.
