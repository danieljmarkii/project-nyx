# Vet report v2 PR-26: the smoke bake-off of the shipping AI-lead configuration

**Date:** 2026-11-05
**One thing:** D3 L1 — A test decides only if its pass mark was written before the result: today's rule said FAIL on one miss the code would have caught anyway, and it still counts · check: pending

Dispatched DISCOVERY row (CUL-2306), fifth launch, branch `claude/vet-report-v2-pr26-11051622`; shipped via #1441 (left open: the run failed).

## What happened

- **The key.** `ANTHROPIC_API_KEY` was unset. Of the environment's variable names, exactly one was a plausible Anthropic key: `NYX_BAKEOFF_ANTHROPIC_KEY`. It was exported as `ANTHROPIC_API_KEY` for each run command's own shell only; no value was printed, logged or written, and a scan of the committed folder found no key material.
- **Pre-registration first.** `PREREGISTRATION.md` and `harness.ts` were committed and pushed before any model call. The thin fixture was settled before any call too: Juniper's record reads thin at every length, because her one vomiting day can never be measured by the ongoing check, so the shipped pipeline must end `not_eligible` and make no model call. Both thin runs did exactly that.
- **The run.** 35 runs of the unedited `runAiLead` with the real `sendChecked` printed 3 leads (`cooper` twice, `r11` once); the checker rejected 23, the verifier 8 after one repair, and 1 hit the 60 s wall clock. The 96 set items and controls went through the checker exactly as step 7 calls it.
- **The verdict: FAIL.** Stop (2) fired on `cr-a`, Nyx's vomiting count before the possible plastic, which the checker passed clean. It is October's known miss, rephrased; the verifier's band-first rule refused it. §12 (2) and (3) also failed: every printed lead drew a minor finding, and usefulness tied the code lines at a median of 4. No printed lead drew a material H4 or H7. The full table is in `docs/vet-report-v3-discovery/bakeoff/2026-11-05-smoke/RESULT.md`.
- **The judges** (blind model personas) also scored the `h2` code lines material H2, as a chicken rechallenge read by order. That line is a hand-built verifier exhibit that no shipped code prints, so nothing was filed.
- **CUL-2532 (band order).** All three printed leads came from single-flag records, where snapshot order and printed order agree. Every `nyx-v2` run fell back, so the divergence never reached a printed lead.
- **Reproduced.** A keyless clean worktree ran `harness.ts score` and wrote a byte-identical `score.json`.

## Filed

- CUL-2548 (QUIET, `Live harm`, `Gate: clinical`, blocks CUL-2388): the checker passed `cr-a`.
- CUL-2549 (LOUD, Backlog, Found along the way): the checker rejects careful leads; 3 of 35 printed, 0 of 11 controls passed.

## Residual

The pre-registered stop rule names a checker miss that the verifier already closes. Whether a fix should change the checker, or a future pre-registration should judge the two nets together, is a question for the PR that fixes CUL-2548. It is not this run's to decide.

## Teach

**D3 · Reading a test: what it proves and what it cannot** (L1)

A test is only a decision if its pass mark is written down before anyone sees the score. Think of a referee who sets the offside line before the kick, not after watching where the ball lands.

One real line, from the stop rule today's run applied unchanged (`docs/vet-report-v3-discovery/bakeoff/adversarial/PROTOCOL.md`, written 2026-11-02):

> A stop is never cured inside the same run by changing a prompt, the checker, the verifier or the set.

That sentence is why today's answer is FAIL, even though no owner could have seen the bad summary (a second safety net, the code check, stopped it). Reading the result and then deciding "that miss doesn't really count" would make every future bake-off pass, because there is always a reason a miss doesn't count. The fix goes in its own PR, and then the test runs again under a rule written before that run.

**Check:** the checker missed one bad summary that the code check caught. Why can't we re-run just that one item, see it rejected, and call the bake-off a pass?
