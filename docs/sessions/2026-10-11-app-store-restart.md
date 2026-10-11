# The App Store restart: one Linear project from today to week one

**Date:** 2026-10-11
**One thing:** S1 L1 — Code vs build vs OTA: an update reaches only the builds whose version it was published for, and a new owner's first launch always runs the binary's own code · check: pending

Shipped via #1188 (docs). The plan itself lives in Linear: [App Store 1.2.0 · the first public release](https://linear.app/projectnyx/project/app-store-120-the-first-public-release-502a8de4b6cd) (P-CUL-27).

## What the PM asked

Restart the App Store track: research what is left, start a fresh Linear project (close the old one, move what is still live), give every task an owner (a Claude Code session or the PM) and its dependencies in a run order table, and add synthetic testing for the first real users. Plan before building.

The PM ruled four calls in session (D1 to D4 on the new page): **straight to the App Store** with no TestFlight beta; **no freeze**; synthetic panels on **the first ten minutes, the product page and a mock App Review**; **no target date**.

## What shipped

**In the repo (#1188):**

- `docs/research/2026-10-app-store-requirements.md` 🧊: Apple's live rules re-verified on 2026-10-11, every claim sourced. New since August: the 13+ age tier for infrequent medical information, the regulated medical device declaration, the 5.1.1(x) optional-contact-info rule, 2.3.3's in-use screenshot guidance (2026-10-05), and the Texas and California age laws.
- `docs/research/2026-10-synthetic-user-testing.md` 🧊: what simulated users can and cannot tell us. They are reliably too positive, too alike and too diligent; comprehension and teach-back probes hold up, purchase intent and completion counts do not.
- `docs/synthetic-testing-protocol.md` 🌱 v1.0: the four panels (T1 the consent screen, T2 a mock App Review, T3 the product page, T4 the first ten minutes), the rule that **a verified finding triggers a fix and a pass proves nothing**, "N of M runs" reporting, and at most two rounds per panel.
- `docs/sessions/2026-08-20-app-store-launch-project.md`: the August record, recovered from draft PR #687 (closed unmerged today).
- Two index rows in `docs/research/README.md`; this record; the STATUS.md track row; CLAUDE.md's "At a glance" line.

**In Linear:**

- The new project: 65 rows in seven waves (19 the PM's, 46 Claude Code sessions), in the /dispatch layout, with build notes, ordering rules and four critical paths. The stored page was parsed with `scripts/dispatch/page.ts` and reads identically to the local copy.
- 32 new issues (CUL-1825 → CUL-1857; CUL-1855 went to another session), led by the **decision sheet, CUL-1825**: 17 calls with recommendations, two persona conflicts (D16 here, D1 on CUL-1768), and the 7 calls already filed on their own issues.
- 35 existing issues moved in, each with its wave. Owner model: a PM row is assigned to Dan; a Claude row is unassigned. `Waiting on PM` sits only on what the PM can act on today.
- Every inherited PM issue opens with a dated **Now** line; every Claude row carries a restart comment. CUL-188's TL;DR had told the PM to accept the AI consent on the demo account, the one irreversible mistake under D13; it now says the opposite.
- The cut (CUL-559), Submit (CUL-560) and Release (CUL-1830) carry real `blocks` relations; three stale August blockers were removed.
- Moved out: CUL-557 canceled (deploy on merge superseded it); CUL-1152, CUL-1153, CUL-113, CUL-465, CUL-475 and CUL-442 standalone with Area labels. The old *App Store Launch* project (P-CUL-5) is Canceled with a pointer, for the PM to archive.

## How the plan was checked

Four research lanes ran first (Apple's rules, the codebase, the old board, synthetic testing). The draft then went to the App Store consultant and three isolated product team reviews before anything was filed: Product Owner with the Designer, Trust & Safety with Dr. Chen, and the Dir. of Engineering with QA. All four returned publish-after-edits.

What the reviews changed, beyond wording:

- **The consent sequence.** Client before server: the six held functions lift only after the consent client is on the PM's phone and the PM's own account has answered (D12), as a merge gate on PR-17 rather than an After item.
- **The demo account (D13).** No consent row, ever, and no seeded AI read: a read on an account that never said yes would look like one made without consent. A consent row cannot be deleted (migration 100), so a resubmission after a reviewer answers gets a fresh demo account. The consent screen gains a **Not now that writes nothing**.
- **OTAs after the cut (D15).** `runtimeVersion` follows the app version, so a new row (PR-64, CUL-1857) tags the cut and moves `main` to 1.2.1, making an OTA from `main` unable to reach a 1.2.0 phone. CUL-906 (a native microphone module) now waits on it.
- **The `/dispatch` wiring**, verified against `scripts/dispatch/plan.ts` and `page.ts`:
  - an After item with "your" or "ruling" holds until the page is rewritten, so "your typed go" in After would deadlock a row whose go is typed in its own session; typed gos moved to the build notes, where the reviewer and deletion keywords plan-gate the row;
  - a row with no project-nyx PR never reads as merged, so every row now opens one, even when its real output is a website PR, a comment or a production write;
  - a note saying "delete" rather than "deletion" does not plan-gate, so the test-user purge (PR-73) now says "a deletion";
  - "spec" in a build note launches the row in DISCOVERY mode, which caught two builds of mine (PR-21, PR-51).
- **Parents that must not close early.** A child that closes the last sub-issue closes its parent (CLAUDE.md; the dispatch prompt). Eight Claude rows I had filed under the PM's issues (the privacy label, the declarations, the listing, the demo, the sitting, the cut, Sentry) are now standalone with a `blocks` relation. Only CUL-552's three consent PRs stay sub-issues, because CUL-552 should close with the last of them.
- **Held closures.** `lib/dietTrial.ts` and `lib/symptomEpisodes.ts` sit inside both `generate-signal` (held) and `generate-report`, so PR-25 and PR-23 update the hold fingerprint and redeploy the vet report on merge.
- **The pet photo bucket** splits into the client's signed links (PR-34, CUL-1856, works on today's public bucket) and the private-bucket migration (PR-34b, CUL-594), because a schema change gets its own PR.
- A dependency cycle through CUL-66 (its password reset checks ran in a sitting that waited on it) broke by moving Q1 to Q3 into the binary sitting.

## Decided

- **PM, in session:** D1 to D4 above.
- **Team calls, logged on their issues and reversible:** the owner model; Not now writes nothing (Designer and T&S, on CUL-1832 and CUL-1834); the demo seed drops its photo under D13 (a) (it needs D13's ruling to stand); CUL-1769 keeps its own session and PR (#1184) as row PR-04.

## Residuals

- Linear's markdown round trip garbled bold and code marks in one inherited description (CUL-173); repaired by hand. Restart notes on the other inherited Claude rows went into comments rather than description edits for that reason.
- Both research lanes recommended a TestFlight beta before the store; D1 ruled it out. The synthetic panels are the only pre-launch user signal, and week one (CUL-562) is the first real one.
- The old submission guide and readiness register (`docs/app-store-submission-guide.md`, `docs/app-store-readiness.md`) still describe August's plan. A superseded banner on each is a proposed Tier-2 edit, not written.
- `docs/dev-handoff-runbook.md` still records 1.1.0 (35) as the installed build; PR-60 (CUL-1850) corrects it when it records the 1.2.0 build number.

## For the PM

CUL-1825 first: one sitting frees about 15 Claude rows. Then CUL-1826 (the Account Holder chores), CUL-1482 (the device script by OTA, before the TestFlight build expires about 27 Nov), CUL-1827 (counsel) and CUL-66 (the dashboard sitting). The project page's *Yours, in order* lists all twelve steps.
