# Session: Backlog grooming (Linear, team Culprit)

**Date:** 2026-09-23
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens), plus one state-file fix (CUL-1034)
**Outcome:** shipped via #895
**Branch:** `claude/sleepy-gauss-96rh6c`
**Predecessor:** `docs/sessions/2026-09-06-backlog-grooming.md`. The 2026-08-29 pass's calls live on CUL-719; this pass's outcome is commented there rather than on a second grooming issue.

---

## What ran

The full `backlog-groomer` procedure, steps 0 to 11, with the product team's lenses on it: Product Owner (the board), Dir. of Engineering (deploys, CI, the PR queue), QA (quick-win verification against the tree), Dr. Chen (the Urgent tier and the clinical defects), Trust & Safety (the path-traversal class, the privacy quick-win rejects) and Designer (the rejects that need a mock round).

Seven read-only lenses ran in parallel as subagents: quick-win triage in two batches of 67, a re-verification of every existing `Quick Win`, an open-PR triage, an audit of issues closed since the last pass, Urgent/High aging, and a semantic dedup. They reported; this session verified and applied the writes.

**Evidence base.**

| | |
|---|---|
| Git history | `scripts/groom/preflight.sh` passed: 881 commits on `origin/main` (floor 837), not shallow. `origin/main` moved to 882 (#894) mid-pass. |
| Board at start | 704 open issues: 625 `Todo`, 48 `Backlog`, 21 `In Progress`, 10 `In Review` |
| Open PRs | 48, all read against `origin/main` @ `8cc96bb` |
| Deploy ledger | read off `origin/main`, then **every live Edge Function read back and hashed** against a bundle of `main` |

## Headline findings

1. **Merged-work drift is still zero.** Every issue named in the commits since the last pass is `Done`. The claim protocol and `/wrap` step 4 keep holding; the drift is elsewhere.
2. **The deploy record is a week stale, in the safe direction.** Production is further ahead than anything in the repo or on Linear says. `generate-report` has been at v17 since 2026-09-16, byte-identical to `main` at #861, and the four functions `STATUS.md` and `CLAUDE.md` called a standing hold are all live and byte-identical to `main`. Details below.
3. **Two live defects had no Linear home.** Both were found in unmerged PR branches and confirmed on `main` and against production: the Signal engine and Ask have read zero medication doses since 2026-06-23 (**CUL-1099**, verified `PGRST201` on the live API), and two B-600 report regressions have been in what a vet reads since the v15 deploy, with the validated fix sitting in draft #519 (**CUL-1100**).
4. **The `Quick Win` label had decayed.** 46 of the 58 labelled issues no longer met the definition. 24 new ones were added from 134 candidates read in full. 37 are open now.
5. **The PR queue is 48, and 10 of those PRs would close unfinished issues on merge.** The worst, #687, closes CUL-552 and CUL-54, both Urgent and both gating the 1.2.0 cut.
6. **Accidental closures continue.** Five issues closed since the last pass via an attachment on a spec, grooming or session-record PR while their work was open. CLAUDE.md's rule that the attachment closes an issue and a mention does nothing is wrong in both halves: a mention can create the attachment (CUL-1053) and a hand-made attachment has not closed anything (CUL-1035). Four open issues describe the mechanism.

---

## 1. Deploy reconciliation

Method: `scripts/deploy-edge.sh <fn> --no-test` bundles from a worktree of `main` (or of the commit under test), `get_edge_function` returns the deployed source through the Supabase MCP, and the two are compared by sha256. No token was needed, which makes most of CUL-541 available from any cloud session.

| Function | Live | Against `main` | Ledger on `main` |
|---|---|---|---|
| `generate-report` | **v17**, 2026-09-16 12:32 UTC | byte-identical to `main` @ `d1feafe` (#861), sha256 `fb2b27ef…548c`. One deploy behind: the trial-window report side (CUL-1036, CUL-1038 #870, CUL-1041 #869) plus D2-4's behaviour-neutral re-fingerprint | `pending`; reason still says R-1…R-18 are owed |
| `generate-signal` | v34 | byte-identical, `35a77a66…` | `pending` |
| `ask` | v6 | byte-identical, `d67b8038…` | `pending`, "rides the held CUL-557 chain" |
| `analyze-vomit` | v12, 2026-09-15 | byte-identical, `39107bc4…` | `pending`; the deploy record is on unmerged draft #852 |
| `analyze-stool` | v5, 2026-09-15 | byte-identical, `fc23c0f3…` | `pending`; same |
| `extract-food-from-photo` / `extract-medication-from-photo` | v18 / v5 | live source carries CUL-258's `fetchWithTimeout`; not hashed | `pending` (baseline) |
| `delete-account` | v8, 2026-08-02 | deliberately behind: CUL-215's client-first re-auth hold | `hold` (correct) |

Nothing under `supabase/` changed between the bundles (`c55d749`) and `8cc96bb`, so the comparison holds against current `main`.

**What it means.**

- The whole v15 remediation wave (R-1, R-2, R-5, R-7, R-11, R-13, R-14, R-16, R-17, R-18 and their riders) has been live for a week. R-20's cold read (CUL-1002) needs no deploy first, only the trial-window one if it should read the current document.
- The "standing hold" named in `STATUS.md` and `CLAUDE.md` had cleared on 2026-09-15, and nobody recorded it. Both are corrected in this PR.
- `generate-signal` went live **ahead of its client-build gate** (CUL-794). On the 08-29 TestFlight build, a pet whose only Signal is the stand-down marker can show a blank card for up to 7 days. No App Store user exists; the 1.2.0 build fixes it. The remaining behavioural check belongs in CUL-556.
- The stale ledger is now steering work: today's sibling quick-win sweep excluded every Edge-closure item "because every function in `deploy-manifest.json` is `pending` or `hold`".

**Not changed: the ledger itself.** The first attempt to carry #852's analyze entries onto this branch was stopped by the session's permission layer and backed out. It is decision **D1** below.

## 2. Status reconciliation

**Merged work:** zero drift (above).

**Open PRs:** four issues whose finished work sits in an open PR moved `In Progress` → `In Review`: CUL-887 (#846), CUL-933 (#831), CUL-923 (#841, which waits on the `Needs PM` state) and CUL-847 (#815, mock round 1, which waits on D1–D9). CUL-188 is referenced by #687 too, but #687 is an old session record, not its remaining work, so it stays.

**`In Progress`, 21 → 14.** Read by claim comment, not status, in the skill's table order.

| Shape | Issues | Action |
|---|---|---|
| Work in review | CUL-887, CUL-933, CUL-923, CUL-847 | → `In Review` |
| Never claimed; imported `In Progress` at the 08-15 migration | CUL-70, CUL-219 | → `Todo`, each with what was verified. CUL-70's ruled "Early access" rename is not on `main` (`app/settings.tsx:255`, `app/settings/beta.tsx:110/122/159`); CUL-219's step 1 is one agent session |
| Folded as a duplicate | CUL-44 | → Duplicate of CUL-66 |
| Blocked on the PM | CUL-30, 39, 43, 51, 64, 68, 173, 179, 188, 425, 969 | Left. Eleven, against thirteen on 09-06, with different members: the collision is structural (D5) |
| Deliberately held open | CUL-974 (closes when CUL-1033 lands, per its own comments), CUL-509 (track umbrella) | Left |
| Spent parent | CUL-19 (hold cleared at v15; its cold read happened as CUL-1047/1048) | Surfaced (D6) |

No `In Progress` issue matched the abandoned-claim row.

**Closed as already shipped, each with a commit-level comment:** CUL-631 (the `Deno check (scripts)` step, `.github/workflows/ci.yml:272-283`), CUL-886 and CUL-897 (#822; both suites pass under a skewed clock and in a fresh container), CUL-892 (N-5, #828), CUL-943 (#855), and CUL-1072 as obsolete (#893 deleted one of the two guards it wanted to share code between).

**Correction to this pass's own writes.** CUL-697 was closed as shipped, then **reopened and narrowed** once the dedup lens reported: its race is fixed (#750, #812), but its own recommended option, one shared file walker, is unbuilt and the case for it grew (12 guards now hand-roll `walk`; comment handling has drifted three ways). The correction comment says so.

**Dead labels.** `Waiting on PM` removed from six closed issues (CUL-615, 653, 741, 960, 965, 267), from the two folded duplicates (CUL-44, CUL-780) and from CUL-929, which the PM ruled on 09-16 and which is now a build (→ `Todo`). One closed issue keeps it deliberately: CUL-719 (D4).

## 3. Narrowed against the tree

- **CUL-64:** the deploy it waited on has run twice; PR 5's `protein_mismatch` flag is live. One ruling left (ratify §7.4).
- **CUL-948:** the premise is false. `Pacific/Chatham` is in the CI matrix and observes DST (springs forward 2026-09-27). What remains is rewriting the removed VV-5 test to find the running zone's own transition and fixing the comment at `lib/vetVisitsStrip.test.ts:134-137`.
- **CUL-893:** the helper shipped in #886 (`lib/mealTrialFlag.ts`). One call left in `components/log/IntakeFirstMealSheet.tsx`, plus a `SCREENS` entry.
- **CUL-1082:** its closeout plan marks CUL-984 done as "checked in GA-V0"; those sittings were waived on 09-22. Leave CUL-984 open at closeout.
- **CUL-228:** the `..` path class reaches three service-role read sites as well as the purge: `_shared/incident-analysis.ts:552/560` (paths from `:775-779`) and `generate-report/index.ts:1071`. Migration 025's CHECK is prefix-only. Latent, not live (paths are three UUIDv4 segments); one full-shape CHECK on `event_attachments.storage_path` closes the class.
- **CUL-697:** narrowed to the shared walker (above).

## 4. New defects filed

- **CUL-1099** (High, Signals v2): the unhinted embed `medication_administrations(...)` from `events` is ambiguous since migration 023 added a second FK, and returns `PGRST201` on the live API. `generate-signal/index.ts:854` and `ask/index.ts:607` read it as "no doses". Every other call site already uses `!medication_administrations_event_id_fkey`. The fix is one hint each, but it turns dose data back on for the engine, so it changes live Signal output and owes the adversarial pass.
- **CUL-1100** (High, vet-report remediation): the two B-600 regressions (a middle day lost from the logging-density line; a caption claiming "the 43 trial days" over rows past the trial's end) are live since v15. Draft #519's fix merges cleanly apart from the frozen backlog file and passes 792/792.

## 5. Quick wins

**Definition unchanged** (small AND grabbable today: one session, ~1 PR, no schema/deploy chain, no pending ruling, not a device chore, not `Waiting on PM`). Every candidate was read in full, description and comments.

**Labelled (24):** CUL-720 (option (b) only), 771, 782, 832, 881, 884, 885, 893, 937, 938, 947, 956, 971, 984, 1019, 1033, 1034, 1052, 1075, 1078, 1087, 1092, 1093, 1097. Notes a builder needs:

- **CUL-832 is dated.** The whole suite run under clocks skewed 7, 31, 90, 180 and 400 days: `lib/signalScreen.test.ts` goes red around **2026-11-13**, after which the pre-push hook blocks every push in the repo; `components/designV2/patterns/WeightCard.test.tsx` goes red 90 to 120 days out.
- **CUL-782** needs no code: both unchecked entry points type-check clean on CI's pinned Deno and `deno.lock` does not move.
- CUL-884 / 885 reuse `guards/blankComments.ts`; CUL-956 is down to `app/log.tsx`; CUL-1093 blocks the 1.2.0 cut and touches safety logic, so it owes the adversarial pass.

**Kept (12 of 58 existing):** CUL-80, 143, 382, 398, 399, 470, 492, 541, 544, 816, 827, 1098. CUL-816 and CUL-827 ship as one PR. CUL-143's claim must move ahead of `setAttachment` (`app/event/[id].tsx:645/655`) or the read fires twice. CUL-541 should start from draft #505.

**Dropped (47).** CUL-425 lost it too: it carried both `Quick Win` and `Waiting on PM`.

| Reason | Issues |
|---|---|
| Needs a server deploy | CUL-65 (`lib/trialProtein.ts`, in `generate-report`'s closure), 125, 239, 246 (`ask` is a Codespace deploy), 274, 295, 538, 581 |
| PM, clinical or design ruling inside the body | CUL-83 (contradicts CUL-812's shipped predicate), 109, 244, 381, 409 (contradicts `lib/analysis.ts`'s shipped rule), 460 (C-3 forbids the agreed line), 527, 823 (sequenced on CUL-552) |
| Needs a mock round | CUL-172, 217, 273, 439 |
| Options menu, not a fix | CUL-104, 260 |
| RLS, Storage, deletion or migration | CUL-177, 228, 283, 348, 408, 597, 692 |
| Scope bigger than the title | CUL-441 (~14 sheets, not 4–5), 498, 522 |
| Stale premise | CUL-275 (Design v2's month view), 487 (folded into CUL-319) |
| Already cut by an earlier sweep, reason still holds | CUL-150, 320, 350, 355, 370, 400, 406, 415, 433, 510, 781 |
| `Waiting on PM` / PM-only admin | CUL-425, 586 |

Two lapsed reasons, recorded so the next sweep does not re-derive them: CUL-239's "batch into one deploy" is gone (`generate-signal` is current, so it needs its own), and CUL-370's premise was wrong (`lib/medications.ts` is in `generate-report`'s closure only), so re-scoped it could return.

**Rejected from the 134 new candidates (103), recurring shapes:** about 20 vet-report or Signal fixes inside a deploy closure; decision briefs and Tier-2 approvals; options menus; privacy work that wants a planned session (CUL-1045, Urgent, is live at `lib/pdf.ts:206`: the shared report PDF lands in a cache folder the sign-out wipe never reaches; CUL-1057/1058/1059 likewise). Two against the obvious reading: **CUL-986** says "nothing to decide" but contradicts the current vet-visits mock frames, and **CUL-958** edits `lib/utils.ts`, which three Edge Functions import.

## 6. Dedup

**Folded as duplicates (16), keeper ← folded:** CUL-991 ← 355 · CUL-739 ← 735 · CUL-759 ← 199 · CUL-495 ← 494 · CUL-319 ← 487 · CUL-93 ← 248 · CUL-795 ← 780 · CUL-228 ← 238 · CUL-1057 ← 935 · CUL-619 ← 242 · CUL-68 ← 46 · CUL-297 ← 330 · CUL-66 ← 44 · CUL-231 ← 97 · CUL-1001 ← 480, 358.

Where the folded issue held something a builder needs, it was carried onto the keeper as a comment: CUL-1057 (the `record_ai_usage` exemption), CUL-739 (CUL-735's assertion list and marker), CUL-495 (the round-10 evidence), CUL-93 (the middle-path copy), CUL-619 (the two alternatives), CUL-66 (the leaked-password toggle).

**Not folded, a PM call:** five issues ask for one CLAUDE.md paragraph (`CLAUDE.md:269`, "a mention on its own does nothing"): CUL-1053, 973, 1035, 836, 761. Decision **D3**.

**Linked as related (18 relations):** CUL-640↔944, 61↔980, 816↔827, 532↔817, 571↔805, 853↔1027, 121↔477, 416↔419, 685↔689, 1020↔1048, 495↔1024/1012/486, 61↔1024, 748↔644/757, 567↔1047, 282↔856.

**The 2026-08-29 list of 29 pairs is resolved:** the live duplicates are folded above; CUL-536/537 was already closed; CUL-416/419, 632/634 and 685/689 are distinct and now linked or explained; CUL-48 duplicates CUL-37 except for one ask (the deploy token as a cloud-session secret), which is D6's to keep or drop.

Shared blockers worth knowing: CUL-108, 181, 453 and 842 all wait on the unset daily prompt budget; CUL-91, 656 and 730 share the 56-day chronicity lookback.

## 7. Closed but unfinished

Flagged, not re-opened, per the skill. The PM decides which need a home (D4).

- **CUL-946:** fixed by deleting the screen that wrote wrong dates, not the reader. `lib/rundown.ts:676-684` is still an unbounded `MAX(visited_at)`, so a future-dated visit makes Get ready say "No new foods or meds logged · Since Oct 28", on the screen an owner reads in the exam room. Nothing carries it.
- **CUL-719:** closed by #810's attachment with its calls unruled (commented today).
- **CUL-254** (with CUL-267 and CUL-107, same PR, same second): closed by #865, a spec PR whose own §10 lists them as open. CUL-267's code still says PROVISIONAL (`lib/dietTrial.ts:324`), and CUL-583's sitting would post its ruling onto a closed issue. CUL-107 is carried by CUL-30.
- **CUL-997 / CUL-993:** the ruled running footer on every report sheet was routed to R-11 three hours after R-11 closed. `render.ts` has no footer or identifier.
- **CUL-800 / CUL-804:** the acute `incident_red_flag` card firing from the per-incident row was never confirmed; an undecided re-run animation question; an unwritten Tier-2 edit.
- **CUL-1041, CUL-979:** Tier-2 edits proposed, not written. CUL-1041's leaves the spec contradicting shipped behaviour (`nyx-trial-extension-requirements.md:284`).
- **CUL-920:** the DoD / Session Summary collapse "wants its own issue"; none was filed.
- **CUL-1060:** standing brief R-10 (the first-week arc) disappears between rounds 3 and 4 with no ruling. Medium confidence; it may have been ruled in chat.
- **Waived sittings → CUL-556, one way only.** CUL-556 does not point back to CUL-663's 27-check script or CUL-1080's 18 steps, and CUL-683 now waits on a sitting that will not run.

Pattern: every one of the five accidental closures came from an attachment on a non-build PR (CUL-719 via #810; CUL-107, 254, 267 via #865; CUL-960 via #847).

## 8. Urgent / High aging

The aging lens read the whole Urgent tier (21) and the High issues untouched since 2026-09-09 before stalling on a permission prompt; its findings are recorded here from its notes, with the four it had not concluded read by this session.

**One meeting still blocks the most.** CUL-583, the Dr. Chen sitting, has been `Todo` since 08-22 and now blocks five Urgent (CUL-54, 55, 56, 57, 60), one High (CUL-59) and three Medium (CUL-179, 311, 367). CUL-60's floors now drive a live report escalation, so that harm is in production rather than latent. Four more need a Dr. Chen ruling and are not on the agenda: CUL-747, 749, 757, 758.

**Buildable now, no ruling needed:** CUL-991 (Urgent), CUL-1045 (Urgent, privacy, one line plus review), CUL-769 (High, a live silent hard-delete of foods; a deletion path, so plan plus `rls-privacy-reviewer`), CUL-815 (its vehicle, the per-incident chain, has run), CUL-61 and CUL-49 (pair with CUL-980), CUL-721 and CUL-722, CUL-750, CUL-759 (`render.ts:4046`).

**Mis-prioritized, recommended only (nothing applied):**

| Issue | Now | Recommend | Why |
|---|---|---|---|
| CUL-381 | Urgent | Medium | Copy plus a tap-to-reveal on the intake chips; a migrated "Now" row; nothing gates on it |
| CUL-989 | Urgent | High | Real class, no current exposure: the heaviest account is ~1,057 rows under a 5,000 cap |
| CUL-891 | Urgent | retitle, High | The defect is fixed and live since v15 (`report.ts`'s `countableEvents`); what is left is the flag-widening call, which CUL-914 and CUL-894 also gate |
| CUL-40 | High | Low | Waits on Track-3 Premium, outside launch |
| CUL-34 | High | Medium | Tracking parent; its shipped half is live |
| CUL-47 | High | Low | An unsourced figure that appears only in frozen research |
| CUL-731 | High | Low | A file-and-watch note |

**Blocked, with the blocker stated:** CUL-552 (Urgent, the AI-consent gate, not started, waits on the D10 ruling open since 08-20, blocks the 1.2.0 cut), CUL-934 (Urgent, the strategy review, waits on the PM's intake answers), CUL-66 (Urgent, the dashboard sitting), CUL-582 (migration 052 still absent from the live history, read-only check). `daily_look` and `widget_enabled` each reach one account (the PM's), which bounds CUL-894 and CUL-914.

## 9. Open PRs (48)

Triaged against `origin/main` @ `8cc96bb` in an isolated clone. The 8 clean PRs merged together cleanly (tsc clean, 445 suites / 9,727 tests).

| Recommendation | PRs |
|---|---|
| Merge as is (8) | #339, #754, #819, #831, #842, #846, #864, #871 |
| Merge after a fix (13) | #254, #411, #519, #572, #687, #692, #704, #736, #765, #780, #791, #815, #852 |
| Close as superseded (17) | #142, #143, #175, #252, #256, #352, #356, #434, #505, #510, #529, #544, #578, #640, #668, #789, #860 |
| Keep open (3) | #784, #841, #885 |
| PM decides (7) | #360 (staging project, ~$10/mo), #415 (reverse Ask's no-persisted-threads non-goal), #455 (iPad scope A after launch), #457 (is the July "Category Play" still a direction), #630 (onboarding / first-week track), #631 (diet-trial Home uplift), #843 (CUL-924's two rule changes) |

**Attachment traps** (merging closes an unfinished issue, and deleting the attachment does not stop it, per CUL-973): #687 → CUL-552, CUL-54, CUL-557, CUL-188 · #852 → CUL-557 · #815 → CUL-847, CUL-358 · #692 → CUL-194 · #765 → CUL-672 · #780 → CUL-629 · #784 → CUL-660 · #885 → CUL-1076 · #841 → CUL-923 · #860 → CUL-980. The id must leave the title and any closing phrase first. For #687, re-land its docs in a fresh PR that names no issue.

**Stranded knowledge:** #339 holds the financial model #831's evidence pack says was never written; #572 held CUL-1099; #510 held the `..` finding (now on CUL-228); #519 is CUL-1100; #852 holds the analyze deploy record; `main` already cites files that exist only on #736, #754 and #819.

**Closing is not free for 10.** #360, #415, #455, #457, #510, #519, #572, #578, #630 and #631 add backlog rows whose B-ids `main` later reused, so the 08-15 migration never ported them. Three are now filed (#510 → CUL-228, #519 → CUL-1100, #572 → CUL-1099) and six are the D2e calls, so among the 17 closures only #578 still needs its item filed first.

---

## Team review of the open decisions

Three isolated lenses reviewed every decision the pass left open. Each was told to challenge the recommendations first written here, not to endorse them. The lenses were: Dir. of Engineering + QA + Trust & Safety; Product Owner + Designer + Jordan + Sam; and Dr. Chen + Data Scientist + Trust & Safety.

The bar for sending a decision to the PM:

- only the PM can physically do it;
- it spends money;
- it changes product direction or a ratified decision;
- it changes the PM's own approval authority;
- it is a clinical ruling reserved for the PM's ratification; or
- tooling requires explicit approval.

Everything else belongs to the team. The session also spot-checked three of the review's own claims (the persona, CUL-924's approval, and the engine's unchecked errors) before accepting them.

### What the review corrected in this record

- **The mention mechanism was overstated here.** A `CUL-NNN` in a PR body does not always attach. #861 named CUL-974 and CUL-634 and attached neither; #850 attached two of four; CUL-19 is named in #852, #815, #791 and #704 with no attachment from any of them. What the evidence supports is narrower: whatever the integration links when the PR opens closes on merge, and deleting the attachment does not undo it. `/wrap` also cannot re-assert state after a merge the PM makes the next morning, so the backstop is the next grooming pass.
- **Only #578 of the 17 close-superseded PRs still holds an unfiled item.** Three of the ten PR-only items are now filed (#510 → CUL-228, #519 → CUL-1100, #572 → CUL-1099), and six are the D2e calls.
- **#843 is not an open decision.** The PM picked CUL-924 up directly on 09-12, per its claim comment. Merging #843 is the sign-off.
- **#831 is an eleventh trap.** Its body names CUL-934 and CUL-598.
- **"The Dr. Chen sitting" is not a meeting with a vet.** Dr. Alex Chen is a persona (`docs/personas.md`), and no real veterinarian has read the report (`docs/culprit-competitive-landscape-2026-07.md:89`). CUL-583's "our consulting vet" is wrong, which likely explains why it has not moved in a month.
- **The report does have a per-section footer** (`render.ts:6625`). What is missing is the running per-sheet footer with the date, the identifier and "N of M".
- **CUL-19's remainder is not fully covered.** The CUL-1047/1048 cold read used fixtures whose vomit events carry no phenotype fields, so CUL-19's descriptor bundle has never been read rendered.
- **CUL-989 is not only a future cap.** No pull in `generate-signal` checks its error: lines 885–951 on `main` read `data ?? []`, so a failed read becomes "nothing logged" today. CUL-1099 is one instance of that class.
- **D8 as first written would have buried live work.** The untouched legacy rows include three Urgent (CUL-54, 56, 57), five High, App Store Launch rows and security defects.

### Team-owned (applied on the PM's go)

| Decision | Team recommendation |
|---|---|
| D1 · ledger | Flip the four entries to `deployed` and restate `generate-report`. Hash the extract pair the same way. Move each entry's gate notes to CUL-794 / CUL-556 before deleting them. The guard stays green, because `deployed` needs no reason. This closes CUL-795. |
| D2 · PR queue | Defuse the 11 traps first by stripping the ids from titles and bodies. For #687, re-land its docs in a fresh PR that names no issue. File #578's item, then close the 17. #852 shrinks to its session file, since D1 carries the ledger. #704 is a rebuild, not a fix. |
| D2e · #360 staging | File it in `Backlog` with the cost and the trigger "before the first external account", then close the PR. T&S wants it raised again before the public release. |
| D2e · #415 Ask history | Close. Record the fork (save answers, or save whole conversations) on CUL-176, under the ratified v1 non-goal. |
| D2e · #455 iPad | File a Low post-launch issue carrying the Designer-vs-Engineering conflict and the open `PhotoCarousel` bug, then close. |
| D2e · #457 Category Play | Close unmerged. Comment its keyword check onto CUL-173 and its validation program onto CUL-598, and name it as an input on CUL-934. |
| D2e · #630 onboarding | File one Medium issue that combines R-1…R-6 with CUL-1060's lost R-10 (the first-week arc), as an input to CUL-934. Land the research brief. |
| D2e · #631 trial Home | Close as superseded: T2 shipped as `app/insights/trial.tsx`, and Design v2 overtook T1. Land the brief, and file D-T6 (the challenge phase) as Low. |
| D3 · mention rule | Correct CLAUDE.md § Git Workflow, `/wrap` step 4 and the groomer skill to say: whatever the integration links when the PR opens closes on merge, so name only what you finish. Fold CUL-973, 1035, 836 and 761 into CUL-1053. |
| D4 | Re-open CUL-254 and CUL-267, and restore CUL-267's label. Leave CUL-719 closed and strip its dead label. File the CUL-946 residual, bounded by the device's local day rather than `CURRENT_DATE`, which re-admits tomorrow's rows in the Americas. File the running-footer ruling. |
| D6 | Close CUL-50 and CUL-106 with evidence. Close CUL-19 only after adding the descriptor bundle to CUL-1002's read list. Set CUL-447 to Low. Close CUL-48 as a duplicate and decline the cloud PAT: an account-wide token in an agent environment bypasses the MCP's per-call permission gate. |
| D7 | See the priority list below this table. |
| D8 | Move only the untouched Low legacy rows (about 133). See the filter below this table. |
| Build-ready, no PM input | CUL-70, built before CUL-559. CUL-1045 and CUL-769: plan, run `rls-privacy-reviewer`, ship in 1.2.0. CUL-1099 with CUL-989's error half: adversarial pass with a shadow diff over live pets that have dose logs. The CUL-946 residual. CUL-894. |

**D7 in full:**

- CUL-381: Urgent → Medium.
- CUL-989: Urgent → High, with the error checks folded in.
- CUL-891: close as fixed rather than retitle it, because a rollout issue would duplicate CUL-876. Link CUL-914 and CUL-894 as blockers on CUL-876.
- CUL-894: Urgent → High, and build it; two ratified rules already decide it.
- CUL-914: Urgent → High.
- CUL-40 → Low; CUL-34 → Medium; CUL-47 → Low; CUL-731 → Low.
- Add CUL-749, 757 and 758 to CUL-583. The team rules CUL-747 itself: keep the count, state its coverage, and never print it as a rate below the floor.

**D8's filter.** Move a row only if every one of these holds:

- it carries the `Legacy` label;
- its priority is Low;
- it has not been updated after 08-30;
- it carries no `Waiting on PM` or `Quick Win` label;
- it has no relation to an open issue.

Anything naming RLS, privacy, delete, purge, token or spend is read by a human instead of moved.

### What truly needs the PM

**1 · CUL-552 D10: what a "no" to the AI consent sheet turns off.**
- **Deciding:** the scope of the consent gate that blocks the 1.2.0 cut.
- **Options:** **whole boundary, recommended.** A "no" drops the Signal to its shipped templates at no clinical cost, and one sheet covers photos, the Signal's phrasing call, Ask, looks and notes. The alternative is photos only, which needs a second sheet later while the phrasing call keeps sending findings and the pet's name without consent.
- **Consequence:** unblocks PRs 2 and 3. PR 1, the schema, can start today under either option; give the state a scope column. A failed consent read must count as "declined" (templates), never a blank Signal.

**2 · CUL-583: how clinical thresholds get ratified.**
- **Deciding:** what clears CUL-54, which blocks the 1.2.0 cut, along with five Urgent issues and one High.
- **Options:**
  - (a) **Recommended:** the team writes one ruling sheet, giving each item a recommendation, a counterexample and its failure direction. Fixes that move toward firing are adopted provisionally now; the PM ratifies the fixes that fire less in one async pass of about 30 minutes.
  - (b) Delegate the whole sheet, as was done with B-494.
  - (c) Wait for a real vet.
- **Consequence:** under (a), the three lowest-evidence numbers go on the real-vet question sheet without blocking.

**3 · CUL-934: the ten strategy-review intake questions.** Only the PM can answer them. Recommended: answer after #339 and #831 merge, with the team stripping the ids from #831 first, so the panel reads the financial model and the evidence pack instead of rebuilding them. The team corrects the issue's stale facts first.

**4 · CUL-914, the L-17 pairing line: a persona conflict.**
- **Designer / team:** sharpen the sentence.
- **Data Scientist (dissent):** a line that prints on up to 77% of pure-noise records stays noise even with a caption, so hold it out of v1.
- **Consequence:** it gates only widening Noticed, not the cut.

**Actions only the PM can take**

- **Merge, in this order:** #895, #842, #843, then #339, #819, #846, #864 and #871. Merge #831 after its ids are stripped. #754 can go any time; it re-closes CUL-719, which stays closed.
- **Create the `Needs PM` state** in Linear team settings, after D3 lands. While there, check the Git automations: the integration moves linked issues to `In Progress`, which would silently pull them out of the state.
- **Later, one Codespace deploy sitting:** `generate-signal` and `ask` once the CUL-1099 fix passes its adversarial pass, plus `generate-report`'s trial-window side, all before R-20's cold read.

## Blocks the current phase (App Store Launch)

- **CUL-552** (Urgent): the AI-consent gate, not started, waiting on the D10 ruling since 08-20. Blocks the 1.2.0 cut.
- **CUL-70:** the ruled "Early access" rename never shipped; `main` still says "Beta features". One small PR before the A-Native build (the Guideline 2.2 risk).
- **CUL-1045** (Urgent) and **CUL-769** (High): a privacy leak and a silent data-loss path, both client-side, both belong in the 1.2.0 binary.
- **CUL-1093, CUL-1090:** gate the 1.2.0 cut (PM, 2026-09-23).
- **CUL-583:** the clinical ruling sheet (a persona, not a vet meeting); five Urgent issues wait on it.
- **CUL-1002 (R-20):** the report cold read, unblocked now; the trial-window deploy first if it should read the current document.
- **CUL-219:** the auth email templates, step 1 is one agent session.
- **CUL-832:** not this phase, but dated: every push is blocked from about 2026-11-13.

## What this pass did not do

- Merge, close or comment on any PR.
- Change any priority (D7 is recommendations only).
- Edit the deploy ledger (D1).
- Re-open any accidentally closed issue, or file a replacement for one (D4).
- Add rows to CLAUDE.md § Open Questions: every call above already lives on a Linear issue carrying `Waiting on PM`, and CLAUDE.md is byte-budgeted.
- Add product scope.

## Every write

| Kind | Count | Issues |
|---|---|---|
| State: → `In Review` | 5 | CUL-887, 933, 923, 847, 1034 (this PR) |
| State: → `Todo` | 4 | CUL-70, 219, 929, 697 (reopened) |
| State: → `Done` (shipped or obsolete) | 7 | CUL-631, 697 (later reopened), 886, 892, 897, 943, 1072 |
| Duplicate | 16 | §6 |
| `Quick Win` added | 24 | §5 |
| `Quick Win` removed | 47 | §5 |
| `Waiting on PM` removed | 9 | CUL-44, 267, 615, 653, 741, 780, 929, 960, 965 |
| Related links | 18 | §6 |
| Issues filed | 2 | CUL-1099, CUL-1100 |
| Comments | 36 | every write above carries its evidence; CUL-719 carries the outcome; the close-out posted the four PM briefs on CUL-552, 583, 914 and 934 |

Repo, in this PR: this record; `STATUS.md` (the vet-report row per CUL-1034, the standing-hold section, two stale clauses); `CLAUDE.md`'s at-a-glance hold sentence (net shorter; `guards/claudeMdBudget.test.ts` passes at 136,541 B).

## Close-out (2026-09-24)

**Definition of Done.**

| Check | Result |
|---|---|
| CUL-1034's acceptance criteria | **Pass**: real span plus the run-order pointer; no per-PR list, and the row went from 898 to 669 B; the owed deploy and the `Waiting on PM` pointer are kept |
| Anti-pattern scan | **Pass**: docs only; no code, schema or copy change |
| Types / lint | **Pass**: `tsc --noEmit` clean in the pre-push hook |
| Automated tests | **N/A**: docs only. The full suite still ran green on push (444 suites, 9,688 tests) and CI was green on every head |
| Secrets | **Pass**: none used |
| Adversarial review | **N/A for code**: no clinical or statistical logic changed. The decision review ran isolated lenses with stated counterexamples: CUL-989 truncation and failed pulls; CUL-1099 dose suppression; CUL-946 far-future visits; CUL-60(b) a once-a-day refuser; D10 a failed consent read. Each is recorded under Team review |
| Future-self | **Keep:** the new pattern is an isolated-lens review of a pass's own decisions before escalating. It cut eight briefs to four decisions plus three actions and caught nine errors in this record |
| PM actions homed in Linear | **Pass**: CUL-552, CUL-583, CUL-934, CUL-914 and CUL-923 carry their decisions, and CUL-719 carries the merge batch and the team's pending go |

**Persona sign-off.**
- Product Owner ✓ (board reconciliation, dedup, D8 narrowed against live work)
- Dir. of Engineering ✓ (deploy currency by hash, the PR queue)
- QA ✓ (quick wins verified against the tree, 192 bodies read)
- Dr. Chen ✓ (the Urgent tier; the CUL-1099 and CUL-989 impact)
- Trust & Safety ✓ (the path-traversal class, the PAT declined)
- Designer ✓ (the mock-round rejects, the #630 / #631 calls)
- Data Scientist ✓ (the CUL-914 dissent)

**Residuals.**
- The team-owned set above waits on the PM's go and was not applied.
- #885 merged on 2026-09-23 and closed CUL-1076 through its attachment. The triage had called it a trap, but CUL-1076's own definition of done (a published mock page plus briefs) arguably holds. It is flagged, not reopened.

— Product Owner / Backlog Steward lens, with the Dir. of Engineering, QA, Dr. Chen, Trust & Safety and Designer lenses; session 2026-09-23-backlog-grooming
