# TestFlight cut prep — repo repair, #497 re-cut, and the definitive gate list

**Date:** 2026-07-30 · **Outcome:** shipped via #514

PM asked: with diet trial (B-417) and Vet Files (B-478) both shipped, what is the
absolute minimum remaining work to cut the next TestFlight build? This session's
answer is the gate list in the PR body + chat; the PR itself carries the prep work
that could be done immediately.

## What landed in this PR

1. **Repaired TWO committed merge-conflict blocks on `main`** (the botched-resolution
   class v1.27 documented; a repo-wide `git grep '^<<<<<<< '` now returns clean):
   - `STATUS.md` 218–224 — keeps the B-422 paragraph AND the ⛔ `generate-report`
     paragraph in its corrected form (the 2026-07-29 B-579 attribution), drops the
     stale duplicate.
   - `docs/backlog.md` 625–635 — both sides belong: the HEAD rows (B-596–B-599, the
     B-529 pass-5 filings) were renumbered precisely because the other side's rows
     (B-592–B-595, from #513) landed on `main` first. Resolution keeps both blocks in
     ID order; duplicate-ID check clean.
2. **Re-cut #497 onto current `main`** (that PR is draft + `mergeable_state: dirty`
   and its docs hunks can no longer apply — close it without merging):
   - `app.json` `version` 1.1.0 → **1.2.0** — the native-module OTA fence.
     `expo-document-picker` (VF-3) and `expo-clipboard` (B-298) landed after build 35;
     the clipboard import is static in the You-screen route graph, so a 1.1.0-runtime
     OTA would crash build 35 on the missing module. Next cut = native `eas build`,
     expect **build 36 = 1.2.0**; never revert the version to "fix" a non-arriving OTA.
   - **G4 closed by delegation** (PM deferred; team ruling: promotion stands) —
     B-478 Priority `Later` → `Now`, STATUS track header + PM item updated.
   - **B-485 closed** — `SUPABASE_ACCESS_TOKEN` provisioned as a Codespace secret,
     old `nyx-cli-deploy` PAT revoked; Secrets Register row flipped ✓ with the note
     that the token is deliberately NOT in cloud-session env.
3. **Refreshed the stale ship-gate records** against verified reality (PR states via
   the GitHub API, function versions via `list_edge_functions`, constants via grep):
   - #502 (R1 refusal register) **merged 2026-07-28** — STATUS + B-533's row no
     longer describe it as a held draft. Remaining R1 owings: B-572's two Dr. Chen
     numbers, the feline register word, the mock round (B-573/B-574 + four undrawn
     disclosure lines + B-592) — a threshold/copy follow-up, not a merge hold.
   - The deploy items now say the true thing: `generate-signal` redeploy **ready and
     required** (v25 live; slice 6 #458 + B-422 #513 merged since; the pre-built
     bundle predates #513, so rebuild); `generate-report` **still held** on B-532 +
     fresh cold read (v13 live).

## Verified, not assumed

- Bucket B open-in-code check: `ENDED_TRIAL_GRACE_DAYS = 14` (`lib/dietTrialFacts.ts:144`),
  `TRIAL_ANCHOR_GRACE_DAYS = 14` (`generate-report/report.ts:147`) — B-538 not done;
  no `bumpHydrationTick`/sync-gate in `lib/dietTrialSetup.ts` — B-534 not done;
  `profile.tsx` still pushes `/food-capture` with no resume — B-535 not done;
  `lib/dietTrialCompletion.ts` untouched since #481 — B-536 not done;
  `view_exposures` declared in the resolver, unhandled in `profile.tsx` — B-562 open.
- Edge functions live: `generate-signal` v25, `generate-report` v13, `ask` v4,
  `analyze-vomit` v9, `analyze-stool` v2, `extract-food` v16, `extract-medication` v3,
  `delete-account` v7 — all ACTIVE.
- `SUPABASE_ACCESS_TOKEN` absent from this cloud env (deploys stay Codespace-side).

## Addendum (same session, later): rebased down after #515/#516 landed

Both briefed sessions ran and merged while this PR sat: **#515** (Bucket B — B-534/B-535/B-536/B-538, Bucket B's code now DONE) and **#516** (B-532 + B-596/B-599; fresh cold read CLINIC-READY ×3 — but #515 filed **B-600** into Bucket A the same day, so the redeploy hold does NOT lift; the gate is now B-600 + a re-read that covers it). #516 also repaired the two committed conflict blocks independently, with the identical resolution — so this PR's repair half became redundant and merged cleanly.

`origin/main` was merged into this branch and resolved newest-truth-wins: main's ⛔ paragraph, "Do NOT cut" item, B-532 row and backlog tail (B-600–B-608) kept; this PR's "#502 merged" items, B-533 update tail, and the Edge-deploys block kept (its `generate-report` bullet updated to the B-600 gate). What this PR still uniquely carries: the `app.json` 1.2.0 OTA fence, the CLAUDE.md token-row flip, the B-485/B-478(G4)/B-533 backlog records, the G4 STATUS closure, and the fix for the stale "generate-signal needs no deploy" claim.

Then, mid-wrap, **#517 closed B-600** (cold read CLINIC-READY on all FIVE artifacts, twice consecutively) and **#518** landed the restored-session login fix — a second `main` merge picked both up, and the Edge-deploys block now records the `generate-report` gate as **CLEAR**: Bucket A is empty and both deploys wait only on the PM running them from the Codespace.

## Not done here, deliberately

No Bucket-B code (B-534/535/536/538 want their own PRs with their own reviews), no
deploys (token is Codespace-side; `generate-report` is gated anyway), no ruling on
B-562 (PM call). The full sequenced plan is in the chat summary + PR body.
