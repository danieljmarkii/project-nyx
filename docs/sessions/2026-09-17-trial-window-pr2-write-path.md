# Trial window PR 2 — the write path: `changeTrialWindow`, provenance, forward-only

**Date:** 2026-09-17
**Issue:** CUL-1039 · **Track home:** CUL-156 · **Spec:** `docs/nyx-trial-extension-requirements.md` §7 (PR 2)
**Outcome:** shipped via #868 (draft)

---

## What this was

PR 1 (CUL-1037, #866) added migration 068's three window-provenance columns and left them
**inert** — declared in the server schema, the local DDL and `COLUMN_UPGRADES`, and read or written
by nothing. This PR is where they stop being inert: the function PR 3's sheet will call, the
forward-only refusal that sits under it, and the two sync halves that make the columns travel.

## What shipped

**`changeTrialWindow`** (`lib/dietTrialSetup.ts`), beside `extendTrial` as the issue specified.
Reads the trial row, refuses unless the requested **total** is strictly above
`max(target_duration_days, dayCounter)`, then writes all four columns plus `updated_at,
synced = 0, sync_attempts = 0, sync_error = NULL` in one statement.

Each part of that floor earns its place, and it is worth writing down because the three reasons
are different:

- above the current **target** closes §5.2's laundering path — a 56-day trial shortened to 28 and
  marked complete prints *"Ran its course — the full window was completed"* (`render.ts:3948`);
- above the current **day** is `nextTargetDays`' own criterion, and it is the *binding* half in
  overrun (day 61 of 56), where the target alone would permit a window the owner is already past;
- **strict**, because equality is the no-op re-save. `target_duration_set_at IS NOT NULL` is the
  predicate every reader switches on, so a stamp with no move is a false clinical claim rather than
  a spare write.

The floor is read from the **record**, not taken from the caller (C-12). A caller passing its own
stale 56 against a stored 84 would slip a "forward" 70 through — the shortening TE-3 forbids,
arriving by the front door.

**`extendTrial` delegates to it.** This is the one place the build departed from the issue's literal
wording, and it was put to the PM as a decision brief before any code was written; the ruling was to
delegate. The reason is TE-4: §5.1's own worked sentence — *"extended from 56 days on 19 Sep (day
56)"* — **describes the milestone tap**, and the milestone is the only door that exists until PR 3
ships. Left separate, the majority path would go on writing exactly the byte-identical row TE-4
exists to prevent. One clamp, one provenance contract, two doors.

**The sync halves.** `dietTrialRowToRemote` forwards all three with the one coercion this mapper has
ever needed (`vet_directed` is INTEGER locally, BOOLEAN on the server; `1 → true`, `0 → false`,
`NULL → null`, and NULL is never normalised to false in either direction). `hydrateDietTrials` gains
them in the SELECT, the INSERT, the conflict clause and the params. `PENDING_MAPPER_COLUMNS` was
emptied in the same change, which is what PR 1 armed it to require.

**A guard PR 1's handoff asked for.** The hydrate's two column lists are hand-written strings with
nothing checking them against the DDL — a column absent from the SELECT never comes down, silently,
forever. The new tests derive the expected set from the executed DDL (C-38). `lib/sqlShape.test.ts`
proves the four sub-lists *count out* the same and cannot see a column missing from all four at
once. **Measured:** with `target_duration_set_at` removed consistently from all four, sqlShape is
168/168 green and the new tests red. Remove it from only three and sqlShape does catch it — so the
mutation that proves this guard has to be the *consistent* one, which was not the first mutation
tried.

## The two decisions the issue asked to be written down

**1. Concurrent change is last-write-wins, accepted.** D1a's totals denomination is the reason: two
caregivers each told *"twelve weeks"* both write 84 and converge on the right answer, where two
deltas would each have added their own fortnight and collapsed to one with both believing theirs
landed. §5.6 put a test for this in PR 2's plan and there was none; there is now — two real SQLite
mirrors over a stand-in LWW merge (`lib/dietTrialWindow.test.ts` § *two devices, one window*).

**2. `markSynced` matching on `updated_at`.** The write moves it, asserted against a real row that
was first parked at `synced = 1, sync_attempts = 4, sync_error = '23505: dup'` — so the same test
proves both the C-23 requirement and the quarantine re-arm.

The residual neither decision covers is **CUL-1044**, filed rather than folded in: a device a
hydration behind can write a total forward of what *it* saw and backward of what is stored. The
local floor provably cannot see it. It was widened during the session to a second shape the
adversarial pass found — a stale device doing something else entirely (confirming the trial's
protein) pushes the provenance columns as explicit NULLs and **un-records the window move without
touching a window**. That is the repo's last-write-wins hard constraint meeting a column whose whole
value is provenance, and it is pinned as current behaviour so it is not rediscovered as a new bug.

## The adversarial pass returned FAIL, and four of its findings were this PR's

Mandatory here because the write moves a denominator the vet report renders. It executed rather than
reasoned, and it was right about more than was comfortable.

- **The docstring claimed all three provenance columns describe the LAST move.** False for
  `target_duration_days_initial`, which is the **FIRST** move's predecessor. After 56→84 on day 28
  and 84→112 on day 56 the row holds `initial = 56` beside a day-56 stamp, so §5.1's template
  renders *"extended from 56 days on ‹day 56›"* — asserting a 56→112 move on a day the window went
  84→112. Both columns true, the sentence joining them false. **The mechanism is right and the
  comment was wrong**: D2(a) ruled the middle step absent, deliberately, on TP-3's
  disclosure-not-versioning contract. The C-38 shape — a comment writing a cheque the code does not
  cash — sitting *inside* the contract it was describing. The docstring now states the boundary and
  the constraint is on CUL-1041.
- **Every refusal arm now re-reads instead of alerting.** The `not_running` arm reached copy
  asserting *"The trial is still running on its current window"*, which the refusal itself
  contradicts, and no arm reloaded — so the card stayed stale and the alert repeated on every tap.
  Re-routing a control without re-reading the copy is how a true string becomes a false one (C-28).
- **A total above int4 was accepted.** PostgREST answers `22003`, which is **not** in
  `TERMINAL_SYNC_ERROR_CODES` — so the row would never quarantine, would retry forever, and
  everything that happened to that trial afterwards, its completion and outcome included, would
  never reach the server. The cost of a mistyped digit would be the whole row's sync, silently. The
  bound added is the **column's**, not a clinical maximum; PR 3's sheet still owns that (CUL-1040).
- **The status gate now reads `ended_at` explicitly.** `lib/dietTrial.ts:391` treats an `ended_at`
  on a row still marked `active` as a sync artefact that is nevertheless an owner-authored fact and
  honours it as the trial's end.

And three test gaps it measured:

- the `ended_at` half and `Math.floor` both had **surviving mutants** — behaviour-changing edits that
  left all 8,422 tests green, because the one "ended" fixture set *both* fields and nothing pinned
  the fractional case;
- the delegation sweep was a **tautology** restating the production floor (`next <= max(target,
  day)`) under a comment claiming it was not one (C-34). It now drives the real `extendTrial` over
  240 shapes and counts refusals.

## What was verified, stated so a list of only failures is not a falsification pass

The pass confirmed the core predicate sound: §5.2's exact shortening case refused with zero writes
and the row byte-identical afterwards; 330 milestone shapes driven end to end with **zero** refusals
of `nextTargetDays`' own arithmetic; five degraded `started_at` shapes all failing in the safe
direction; the vet flag round-tripping through the shipped mapper and the hydrate expression *lifted
verbatim from the source* with 1/0/NULL staying distinct; the local-midnight race unreachable.

It also drove the real `computeTrialFacts` across a real write on §5.4's fixture and reproduced the
spec's table exactly — `belowCoverageFloor` true→false, `mayStateRecordClean` false→true, the
denominator 28→50 — confirming PR 2's claim that it neither improves nor worsens the gate flip.

## One correction to the pass's own report

Its highest-severity finding was that **PR 1b never shipped** and that `git log` showed "no PR 0 and
no PR 1b". PR 0 (CUL-1036) **landed on `main` during this session**, after this branch was cut, and
CUL-1038 (PR 1b) is **In Progress at Urgent**. So the ruled order is being honoured; what the
reviewer saw was a stale base, not a skipped PR. `main` was merged in, and PR 0's guards — including
**G1, "no mid-trial route to `trial_extend`, in any state"** — pass against this change, which is a
useful independent confirmation that PR 2 adds no door.

PR 0 also carries something this session did not start with: **D7 has been re-ruled from (a) to
(c)** — freeze the coverage denominator *and* disclose. That makes `target_duration_days_initial` a
value PR 1b will *read*, not just something PR 4 renders, so CUL-1038 now carries a note on what
this write path guarantees it and the one thing it cannot: a trial extended **before** PR 2 ships
has `initial` = 068's backfill = the *already-extended* target, with a NULL stamp. Freezing on it
there freezes at the moved window. `set_at IS NOT NULL` has to be the gate.

## Files

| File | What |
|---|---|
| `lib/dietTrialSetup.ts` | `changeTrialWindow`, `TrialWindowRefused`, `PG_INT4_MAX`; `extendTrial` delegates |
| `lib/dietTrialMirror.ts` | both row shapes + the mapper's INTEGER↔BOOLEAN coercion |
| `lib/sync.ts` | `RemoteDietTrial`, the hydrate SELECT / INSERT / conflict clause / params |
| `app/(tabs)/profile.tsx` | the milestone absorbs a refusal it cannot act on |
| `lib/dietTrialWindow.test.ts` | **new** — the production function against real `node:sqlite`, and the two-device harness |
| `lib/dietTrialSetup.test.ts` | the statement's shape, the refusal arms, the delegation sweep |
| `lib/dietTrialMirror.test.ts` | the coercion, the emptied registry, the hydrate column-list guards |

## Numbers

8,485 tests across 390 suites, `tsc` clean, the touched suites green under the CI's three non-UTC
zones. Thirteen mutations run in total; every one reds. No migration, no Edge Function, no deploy —
confirmed by the C-26 closure grep: none of the touched `lib/` modules is imported by
`supabase/functions`.

The three columns do **not** reach the App Group widget snapshot. `ACTIVE_DIET_TRIAL_QUERY` is an
explicit column list, so PR 1's `rls-privacy-reviewer` constraint holds by construction rather than
by care — recorded here because 068 asked PR 2 to *make* that call, and the answer is that there was
nothing to decide.
