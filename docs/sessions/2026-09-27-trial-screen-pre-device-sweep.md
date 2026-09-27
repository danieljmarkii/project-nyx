# Trial screen — the pre-device-pass sweep (nine issues, built in parallel)

**Date:** 2026-09-27

Shipped via #956.

## What the session was

The PM had finished the bulk of **Diet trial — its own screen** (TS-0 → TS-9 merged) and was about to put a build on a phone for the device pass (CUL-1306). The ask: go through the project in Linear and pick up everything that could be knocked out in parallel first.

Triage of the project's open issues split them into four piles:

- **Buildable now, no ruling needed** (7 issues → 6 lanes): CUL-1335 + CUL-1338 (same file, one lane), CUL-1329, CUL-1336, CUL-1334, CUL-1360, CUL-1342.
- **Waiting on the PM:** CUL-1339 (four TS-4 calls; #2, *Manage the trial* on the intake-decline face, matters most now TS-6 has shipped), CUL-1348, CUL-1341, CUL-1315.
- **Needs Dr. Chen:** CUL-1337, CUL-1310.
- **Needs a mock round or the device first:** CUL-1345, CUL-1317, CUL-380, CUL-335 (mocks); CUL-1346 (only if the lane's late arrival visibly jumps on device); CUL-1340, CUL-1293, F1/F2 (product calls / backlog).

Each buildable lane ran as an isolated-worktree subagent with the issue text, the relevant CLAUDE.md conventions and a mutation-proof requirement; each committed on its own worktree branch and the main session cherry-picked the commits onto `claude/jolly-edison-2g9oam`, one commit per lane. Two more issues were pulled in mid-session (CUL-1363 after the PM's ruling on CUL-1342, CUL-1364 from the adversarial pass).

## What shipped

| Commit | Issue(s) | Change |
|---|---|---|
| `bb827e7` | CUL-1335, CUL-1338 | "1 logged feeding **was**" (floor sentence, free-fed line, two more slips in the ended-refusal sentence). Meals that name no food get `N logged feedings don't name a food, so they can't be checked against the trial diet.` instead of "Nothing logged against the trial yet" under a full coverage line. `generate-report` already said both correctly. |
| `f9049f9` | CUL-1329 | `endActiveTrial` writes only over `status = 'active'`; else `TrialEndRefused` (`not_running` / `not_found`), nothing written or queued. Three callers handle it: the completion sheet (re-read, close, no alert), the replace flow, the after-visit *Ended* chip. |
| `70bc299` | CUL-1336 | `usePetStore.petsLoaded` (set only when the pet read answered, reset via `reset()` → `wipeLocalSession`); `useTrialFacts.reload`; an unreadable facts read shows a cause + *Try again*; refocus re-reads facts; facts for another trial id read as loading. |
| `be4b5a7` | CUL-1334 | `/report?pet=` via `lib/reportRoute.ts` (`resolveReportSubject`): absent → active pet; a named pet the account doesn't hold → the pet-gone line, never the active pet's report. Trial screen doors open for every pet; Get ready's report button now builds the appointment's pet's report (it built the active pet's before — a latent C-9 bug). |
| `7985bae` | CUL-1342 | Get ready's by-mouth recheck question quotes the exposures screen's own oral-route rows + reasons (`oralRouteRows`, `oralRouteCopy`); the "chewable medicine included" clause appears only over a listed dose. |
| `e6d049a` | CUL-1363, CUL-1342 | The trial screen's *Outside the trial diet* door opens on doses by mouth (gated on the list's own builder). Get ready caps inline dose rows at 3 (`RECHECK_DOSE_ROWS_SHOWN`) and adds `See all N logged doses given by mouth` → `/trial-exposures?pet=`. |
| `55b737e` | CUL-1360 | `lib/signalTrialAnchor.ts`: a cached `trial_response` counted over another trial (recovered start day = local day of `generated_at` − (`trialDayNumber` − 1) ≠ the running trial's start) is never titled with the current trial. A stale falling pair is dropped; a stale rising pair is kept, titled by its own day. |
| `9672578` | CUL-1364, CUL-1360 | Get ready's *Worth raising* takes the same anchor (required, never defaulted). Tests for Home's `signalTrial` wiring and the arrival count, plus a pin tying the anchor to the engine's day-1 convention. |
| `975d8f6` | — | Jest (`testPathIgnorePatterns` + `modulePathIgnorePatterns`) and tsc skip `<rootDir>/.claude/worktrees/`. |

## Decisions

- **PM, CUL-1329:** replacing a trial whose old one was already ended on another device, with nothing else running → start the new trial silently; the other device's ending stands.
- **PM, CUL-1342:** the heading's chewable clause only over at least one listed dose (A); the list is capped with a door to the full list (B), which pulled CUL-1363 in.
- **Lane calls taken on their own recommendation (surfaced in #956 for override):** CUL-1360 keeps a stale *rising* pair titled "Diet trial, day N of M" (never hide an escalation on a guess about its age); CUL-1363 keeps the door label without a `Given by mouth` sub-line (the sub-line is the recommendation but needs a mock frame first).

## Adversarial review

`adversarial-reviewer` on CUL-1360, isolated, in a scratch copy: **HOLDS WITH NOTES.** Tried rabbit (day 22, falling) replaced by chicken today → dropped on Home, the Signal screen, the trial door; the rising version kept with its own day. *Keep going* and change-window leave `started_at` untouched, so a current finding stays current. A regen at 23:58 stamped 00:03 is inside the 10-minute band. Engine vs device timezone mismatch after travel hides a current falling pair until the next regen — the safe direction. Its two gaps — Get ready unwired (the stale falling pair quoted in the exam room) and Home's `signalTrial` wiring + arrival count untested (both mutations survived) — are closed in `9672578` and re-proved by mutation.

## What broke and how

**The pre-push hook took 25 minutes and failed twice.** Cause: every isolated subagent's worktree is a full checkout at `.claude/worktrees/agent-*`, *inside* the repo, and jest's default roots picked them all up — six copies of the suite, and duplicate `__mocks__` colliding in the haste map. `guards/fixtureRoot.test.ts` also failed inside every copy (its containment check resolves against the outer repo). A second attempt failed on `HistoryList.test.tsx` timeouts from CPU contention with a lane's concurrent jest run; the suite passes alone (62/62) and the branch doesn't touch History. The fix is `975d8f6`; the ignore is **rooted** (`<rootDir>/…`) so a run inside a worktree still sees its own tests — an unrooted `/.claude/worktrees/` would have ignored every test inside one. Lesson for the next parallel session: don't cherry-pick into the tree while a pre-push run is testing it, and expect the hook to be slow while lanes run jest.

**One merge conflict**, in `components/trialScreen/TrialScreen.tsx`: lane C added the `petsLoaded` read beside the `activePetId` read lane D deleted. Resolved by keeping C's read and dropping the now-unused `activePetId`.

## Residuals filed

CUL-1361 (the Signal screen's zero-pet skeleton), CUL-1362 (a device that hasn't synced can still re-end at the server — needs a trigger), CUL-1365 (regen the Signal after a trial start/replace), CUL-1367 (Ask relays a stale pair server-side), CUL-1368 (an ended trial with no replacement keeps its pair up), CUL-1369 (the flag-off trial card's exposures link ignores doses).

Not built from the lanes' notes: CUL-1336's `ready` with `facts: null` still drops the ledger silently (recommend the same error line; needs a different Get ready sentinel).
