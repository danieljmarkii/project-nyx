# Out of beta — one project for three graduations

**Date:** 2026-09-22

DISCOVERY session, no code. The PM asked where the "log screen redesign + more event types to GA" thread was, then asked for Vet visits to join it as a standalone Linear project with a PR-by-PR plan and the most efficient session ordering. Delivered as the project **Out of beta — the log sheet, more event types, vet visits** (P-CUL-16).

## What was found first

- The thread is **CUL-960**, ruled 2026-09-14 (seven briefs). Its child issues CUL-961 / 962 / 963 and the sitting CUL-663 + CUL-729 sat untouched since: all three `app_config` rows still read `{"enabled": false, "allowlist": [<PM uid>]}` (verified by `execute_sql`).
- CUL-960 showed `Done` on the board while its own closing comments said it must stay `Todo / Waiting on PM`. #847's attachment auto-closed it on merge, which is exactly the CUL-803 rule that comment cites. Left `Done` as the ruling record, with a board note pointing at the new project rather than reopening it.
- Vet visits: VV-0 → VV-6 shipped; CUL-949 / 952 / 953 / 966 fixed since. CUL-905 (VV-GA) is blocked by CUL-950 (Urgent, a decision brief), CUL-951 (High, a decision brief) and CUL-970 (High). Its bake period was "the PM's next real appointment", which is an open-ended wait.
- **No Edge Function reads any of the three keys.** The picker pair was verified 2026-09-13; `vet_visits` was verified today by grep over `supabase/functions/` (the only hits are the *table*, in `generate-report`'s pull). So the whole graduation is client-only: no server step, no deploy-before-delete constraint, the deploy ledger untouched.

## The plan, in one paragraph

Three flags, one shape: flip (a config write, no PR) → removal PR → closeout (delete the row once no installed build reads it). Nine steps across five milestones. The PM's part is front-loaded: **one phone sitting** (the 27-check log-sheet script and a new 18-check vet-visits script, back to back), **one batch of four rulings** (CUL-950, 951, 970, 987 — each already carries a brief and a recommendation), then merges and one build install. Seven build sessions: CUL-962 (+961 riding in it), CUL-950, CUL-951, CUL-970, CUL-503+504, CUL-905 (+1081 riding in it), CUL-963 (+1082 riding in it).

## The efficiencies, stated as file collisions

- **Steps 2, 3, 4 (the three vet-visit fixes) run beside step 1 (the picker removal)** — `lib/getReady.ts`, `app/vet-visits/after.tsx`, `lib/vetVisits.ts` never meet `components/log/*` or `app/log.tsx`. They need only the rulings, so they can start before the sitting.
- **Step 6 (the vet-visits removal) waits on step 1** because both delete from `lib/appConfig.ts`, `lib/betaFeatures.ts` and `app/settings/beta.tsx`. Sequencing beats a three-file rebase on a deletion diff.
- **Step 5 (CUL-503 + CUL-504) waits on step 1** for a different reason: GA-2 deletes the flag branch the fix would otherwise need, so building it after is strictly less code (the sequencing note already on CUL-503).
- **The flips ride in the removal sessions.** A flip has no PR; the one-PR-per-session rule leaves room for it, and the write is quoted in the removal PR's body.
- **One closeout session, one migration deleting three rows**, instead of two closeouts that would both touch CLAUDE.md, STATUS.md and the runbook.
- **One native build** carrying all three removals (the runbook's installed-build line is stale and `package.json` has moved since the 2026-08-29 cut, so OTA is not safe). If it is also the 1.2.0 store cut, CUL-559's artifact checklist runs once.

## What was created and moved

- **Project P-CUL-16** with five milestones (0 the gate · 1 log sheet + event types · 2 vet visits · 3 the build · 4 the closeout), the run-order table, the lane rules, three decision briefs (D-A the vet-visits bake, D-B whether the vet-visits removal rides the store cut, D-C closing CUL-939 as already resolved), and four resources.
- **New issues:** CUL-1080 (GA-V0, the vet-visits sitting — VV-6's script + CUL-988's seven steps + CUL-984's check, merged into 18), CUL-1081 (GA-V1, the `vet_visits` flip), CUL-1082 (GA-V3, the vet-visits half of the closeout).
- **Moved in:** CUL-663, CUL-729, CUL-988, CUL-984 (milestone 0); CUL-961, CUL-962, CUL-503, CUL-504 (1); CUL-950, CUL-951, CUL-970, CUL-987, CUL-905 (2); CUL-963 (4). CUL-951 gained the `Waiting on PM` label its brief always implied; CUL-951 and CUL-970 now formally block CUL-905; CUL-503, CUL-504 and CUL-905 are blocked by CUL-962.
- **Amended in place:** CUL-905 (the flip split out, the bake re-pointed at D-A, the gate on CUL-962, the scope additions since it was written), CUL-963 (three rows, paired with CUL-1082).
- **Pointers left:** a comment on CUL-960 (the board defect and where execution lives), on the Vet visits and Event Taxonomy projects (what moved and why), and on CUL-988 / CUL-984 (their checks are steps of CUL-1080).

## Two things worth saying out loud

**The G7 sequencing rule was written for a build, not a graduation.** The vet-visits project says the track "runs after the submission cut"; every VV PR has since shipped, so the only G5 constraint that survives is the microphone (VV-7), which is untouched. Nothing about graduating v1 conflicts with the cut, and decision D-B makes that explicit rather than leaving it to be re-derived.

**CUL-939 is already fixed and nobody closed it.** Its two halves were the appointment cancel (shipped in #851) and the visit delete (shipped in VV-6, live since the `generate-report` v15 deploy). It is on `Waiting on PM`, so the close is the PM's; D-C asks for it.

## Outcome

No code, no schema, no deploy. One project, three issues, fourteen moves, two amendments, five pointer comments. CLAUDE.md and STATUS.md untouched (the closeout owns their edits; STATUS.md's vet-visits row will be stale until then, and that is the accepted cost of not writing to it every session).

## Addendum — the three briefs ruled (PM, same day)

- **D-A → (a).** The scripted sitting (CUL-1080) is the vet-visits bake; a real appointment before GA is a bonus pass, never a gate.
- **D-B → (a).** Vet visits ships in the 1.2.0 store cut. CUL-905 now blocks CUL-559 beside CUL-962. The implications are written on CUL-559: no new permission or purpose string (the microphone is VV-7), the demo-account seed carries a booked appointment and a logged visit for App Review, CUL-556 inherits CUL-1080's steps on the GA build, one re-read of `docs/app-privacy-answers.md` for the visit fields, one added line on the installed-build smoke script.
- **D-C → close.** CUL-939 closed as Done: the cancel (CUL-952) and the delete (VV-6, live at `generate-report` v15) both shipped.

The critical path is unchanged in shape and one step longer in consequence: the store cut now waits on the whole vet-visits chain, which is the point of the ruling.
