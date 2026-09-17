# CUL-1051 — migration 069, the initial-window ratchet

**Date:** 2026-09-17
**Mode:** BUILD · **Issue:** CUL-1051 (trial-window PR 1c) · **Also touched:** CUL-1038, CUL-1040 (surfaced), CUL-367 (first half of the session)
**Outcome:** migration 069 built, applied to production, then **re-applied after `rls-privacy-reviewer` returned FAIL on a claim in its own header**. Draft PR #874. Four issues filed: CUL-1057, CUL-1058, CUL-1059, plus a finding commented onto CUL-1038.

---

## How it started, and the first thing that went wrong

The PM said "build PR 3 next", off a recommendation I had made an hour earlier. **PR 3 was already built.** A parallel session claimed CUL-1040 at 19:09 UTC — twenty minutes *before* I claimed CUL-367 — shipped it to #873, and merged it to `main` while I was checking.

My recommendation was stale when I wrote it. I had read the PR plan in the spec and the git log in the same session and had not checked the issue's state before naming it as next. The collision guardrail caught it (CLAUDE.md § step 0: an open PR referencing the issue → surface, do not claim), but only because I looked before starting. **The run order in a spec is not the state of the board.**

## What was built instead

CUL-1051, chosen with the PM from three candidates because it was the only *live data-integrity* defect among them: the ratchet its own description says had to precede PR 2, which PR 2 shipped without.

**The hole, verified link by link on `main` before writing anything:** `COLUMN_UPGRADES` (`lib/localSchema.ts:484`) adds `target_duration_days_initial` to an upgrading device with no local backfill; `dietTrialRowToRemote` (`lib/dietTrialMirror.ts:375`) forwards it; `pushRows` (`lib/sync.ts:512`) is a full-row upsert so PostgREST sets it from `excluded`; sync is push-before-pull. So an owner on a freshly-updated phone who opens `Manage → Change the window` erases the server's designed window, and CUL-1038's freeze prints the vet report's denominator over that column.

The guard CUL-1051 said protected this (`NEVER pushes target_duration_days_initial`) **does not exist**, and `PENDING_MAPPER_COLUMNS` is now `{}` — so the drift guard actively *requires* the column to be forwarded. That correction is posted on the issue.

### Three calls, each written into the header rather than assumed

- **Immutable once non-NULL, not a NULL check.** A NULL-only guard misses the variant the issue itself names: a device whose *local* target is already extended pushes 84 over the server's 28.
- **Silent correction, not a `RAISE`.** The caller is a stale sync payload, not an owner. `23514` is terminal, so a refusal quarantines the entire trial over a column the client never meant to touch. C-38: writable-but-corrected is repairable, bricked is not.
- **INVOKER, not `SECURITY DEFINER`** (067's asymmetry). It reads nothing, so elevation is privilege with no purpose; it raises nothing, so it cannot be CUL-867's oracle.

The **INSERT** half was a PM call, taken before coding: it stamps every new row server-side, which closes the gap for every client and removes the need for the client-side `startDietTrial` change CUL-1051 anticipated.

## Verification, and why it was worth doing properly

Nothing here was proven by reading. Six logic cases in a rolled-back transaction on a scratch table; then **the control with the trigger absent, which reproduced the defect exactly** (`initial` → NULL on the clobber, → 84 on the overwrite), so the probe was not green over nothing; then five probes against the real `diet_trials` inside a rolled-back transaction, including a non-vacuity check that the row had a window to protect and an ordinary edit proving nothing bricks.

**Pre-flight measured, not assumed:** `trials_total 3 · initial_null 0 · window_moved 0 · initial_differs 0`. No window has ever moved in production and nothing was clobbered between #868 and the apply, so the ratchet shipped as a guard with no data repair owed. `initial_null` was re-confirmed 0 *after* the apply, because branch 3's entire defence rests on it.

## The review, which failed it — and the finding was mine

`rls-privacy-reviewer`, mandatory here (a trigger on a pet-scoped table). **The tenancy boundaries held, structurally**: every cross-account attack refused, and an instrumented clone proved the trigger body never executes on a foreign row at all, because RLS's `USING` is a scan qualifier that filters before the executor reaches the trigger. The only branch reading `OLD` is unreachable cross-tenant. The failure was integrity and claims, not access.

**What broke.** The header said *"a DELETE removes the trial outright rather than falsifying it."* False. Confirmed against production in a rolled-back transaction on a throwaway row: `DELETE` then re-`INSERT` of the same id takes the designed window **28 → 84**. This is a per-row-**version** guard, not a per-**id** guard — after a DELETE there is no `OLD`. Corrected to "immutable for the life of the row" in the header and the `COMMENT`; the gap is CUL-1058.

**It is worth naming what kind of mistake that is.** 045 and 066 both recorded the same shape — a `COMMENT` writing a cheque the code does not cash — and C-38 is the lesson written from it. I committed it *inside a paragraph citing C-38*, in a header that asked C-38's own question ("what else can move?") and answered it wrong. Reciting a lesson is not applying it. The question needs a probe, not a paragraph.

**Understated, not false:** the KNOWN LIMIT said a frozen-wrong value was legacy-only. Measured on production: a row sent with target 21 and `initial` 7 keeps 7, frozen. The INSERT branch trusts the client, deliberately, and `deriveWindowChange` rejects `<= 0` — so only a *plausible wrong positive* survives, which is the dangerous shape.

**Observability was zero.** The assign is unconditional and 069 fires first, so every later trigger sees `NEW = OLD` and a refused erase was invisible to any audit. Silence against quarantine and silence against observability are separable: a guarded `RAISE LOG` does not abort, never reaches the client, and names only `NEW.id` and the caller's own payload.

**The behaviour guard did not exist.** Only `lib/functionHardening.test.ts` referenced the function, and that pins *posture*. The reviewer proved the gap with the mutation that matters: `RETURN NULL` in the INSERT branch **silently disarms 066's cross-pet `vet_visit_id` guard**, because 069 fires first and a BEFORE trigger returning NULL cancels the write for every trigger after it. A link the database refuses today inserted with no error, and every suite stayed green.

## The guard, and the defect inside the guard

`guards/dietTrialRatchet.test.ts`: no `RETURN NULL`, exactly three `RETURN NEW`, no fall-through, the log guarded and C-31-clean, the REVOKEs beside the body.

Proven by four mutations — **and the third one failed to red it.** The C-31 assertion used `/RAISE\s+LOG[^;]*;/`, and the message literal contains a `;` ("(payload %);"), so the character class terminated *inside the string* and the captured slice never reached the arguments. The arguments are the only place a leak could be. It was green over nothing, in the exact way this repo has a convention about (a delimiter inside a literal is not a delimiter — `guards/blankComments.ts`). Replaced with a quote-aware scan plus a non-vacuity floor asserting the slice actually reaches `NEW.id`, and both the leak mutation and the floor mutation now red it.

**The lesson generalises past this file:** I wrote a guard *while* applying a review whose whole finding was "your guard does not cover the thing you claim". Writing it did not confer immunity. The only thing that caught it was running the mutation.

## Filed, not folded in

- **CUL-1057** — `lib/functionHardening.test.ts` builds its regexes from `Object.keys(EXPECTED)`, so the registry is an **inclusion list**: an unregistered function is never looked at, not loosely asserted. Three trigger functions are outside it, one `SECURITY DEFINER`. Registering them needs a posture ruling each. The gap is stated under `EXPECTED` so a green run is not read as full coverage.
- **CUL-1058** — the DELETE + re-INSERT per-id gap above.
- **CUL-1059** — `anon` **and** `authenticated` both hold **TRUNCATE** on `diet_trials`, measured on production. RLS does not filter TRUNCATE and it fires no row triggers, so the grant *is* the boundary. Not reachable via PostgREST, and probably true of every table in `public`.
- **CUL-1038** — commented rather than filed: 069's silent correction never reaches a device whose clock is equal to or ahead of the server (`shouldWriteRemoteRow` is `remoteT > localT`, strictly). Zero client readers today, so nothing clinical is reached — a reason with an expiry date. The moment the coverage freeze lands, the app and the vet report can disagree about `belowCoverageFloor` from the same record.

## Verification summary

`tsc` clean · 395 suites / 8625 tests green · `get_advisors` no new finding · INVOKER, pinned `search_path` and the revoked grants all re-verified **after** the `CREATE OR REPLACE`, which is the grant-reset trap `functionHardening` exists to catch.

`adversarial-reviewer`: **N/A with a reason.** No detection, correlation or escalation logic; this constrains a column those surfaces read. The boundary red-team that was owed ran.

## Two things to carry forward

1. **A spec's run order is not the board's state.** Check the issue before recommending or claiming it, even when the sequence looks obvious and you read the plan an hour ago.
2. **Citing a lesson is not applying it.** The false claim went into a paragraph that named C-38 and asked its question. What caught it was an adversary running the statement, and what would have caught it earlier was me running the statement instead of writing the sentence.
