# The send moment — tell the owner before Send what the report will say (R-16, CUL-998)

**Date:** 2026-09-16

Shipped via #856. Closes CUL-861 and CUL-457 on merge. Filed CUL-1004 (`Waiting on PM`) and CUL-1005.

## What this is

Two things an owner used to learn by reading them in front of the vet, now said on the screen they are looking at when they tap Send:

1. **The allowed-food list gap (CUL-861).** When the report's diet trial is still running and has no allowed-food list, the report tells the vet, more than once, that nothing was checked against one. The report screen now says it first — *"No allowed-food list is set for Mochi’s trial, so the report can’t check feedings against it."* — and the send button reads `Send anyway`, labelled for what the owner just read. One send control, never a second button under `Send to vet`.
2. **Documents do not travel (CUL-457).** *"Your saved vet documents aren’t part of this report. Share them one at a time from Vet Files."* in the same register as the *Includes N photos* line, rendered only when the pet has at least one saved vet document (a local `readVetLibrary` read, the same the profile card makes). The profile card keeps its own blurb — **both surfaces**, the issue's default, and the session did not overturn it.

Client side; reaches phones on the next A-Native TestFlight cut. Item 1 additionally needs the `generate-report` deploy already owed for R-1 and R-2 (below).

The `other`-observations line (CUL-997 brief 7, option (c)) was **not built**: brief 7 was unruled at claim time. CUL-974 stays with S3.

## What the session cut, and why: `Set it up`

The issue paired the allowed-list line with a `Set it up` button into the allowed-set screen. It was built, tested, and **cut before merge** on the `pm-feature-review` walk as Jordan, whose blocking finding the `code-reviewer` reached independently and which was verified at file:line before acting:

- The fact behind the line is *no `primary_diet` row on the trial's allowed set*. The only writer of such a row is `startDietTrial`; the mid-trial add (`addTrialFood`) writes `permitted_treat` / `permitted_other` and refuses the diet-defining role by design — §5.5 D-A's loophole, opened by the front door. So an owner who tapped the button, added the trial diet, and came back would find the same line and the same button. The round trip could never clear it.
- On the common case — a trial started before the allowed-set track, which has zero rows — `loadTrialAllowedSet` resolves `unknown` and `/trial-foods` renders a bare spinner with no copy and no way forward. The profile already gates its own door on a hydrated set; this would have been the first ungated one.
- The suite was green over all of it because the return-trip test flipped the mock — *"the owner comes back with a list made"* — a fixture production could not produce (C-35, verbatim).

A button that cannot work costs more trust than the ambush it prevents, and the line alone carries the clinical value. So: the line ships with `Send anyway`; the door is **CUL-1004**, with a decision brief (build a mid-trial *set the trial diet* write, recommended; route to the trial card, worse; stay as shipped), plus the spinner state that must be designed before any ungated door points at it. The issue's test spec ("the line and both controls") is therefore not what shipped; the suite asserts the button's **absence**, so it cannot quietly return without the screen that makes it work.

Cutting the button also removed the `useFocusEffect` rebuild-on-return and, with it, the second finding the `code-reviewer` had reproduced: two independent cancellation domains (the params-driven load and the focus-driven load), where a slower, older response could overwrite a newer one and put the gap state back after the owner had fixed it. Worth carrying forward for whoever builds CUL-1004: a second trigger for `load()` needs one shared request id both effects bump and check, not two local tokens.

## The one fact that had to come from the server

The issue hoped the report "already returns enough to know this". It did not: the response carried the html, pet name, dates, scope basis and photo count, and the report's own verdict — `allowedSetUnavailable` on the trial block — was computed, printed, and never returned. So the response gains one additive field, `trial_allowed_list_missing`, and the client treats an absent field as false, so an older client over a newer function (or the reverse) shows nothing rather than something wrong.

Two scopings on that boolean, both deliberate and both tested:

- **"Missing" is the list's absence, not the heuristic.** `allowedSetUnavailable` has two arms: no `primary_diet` row, OR a primary row that matched none of ten-plus feedings (the unhydrated-set guess). The line says the list *is not set*, and the door that restores `Set it up` would send an owner with a list she already has to set one up — so the helper (`trialAllowedListMissing`, `trial.ts`) reads the trial block's `permittedFoods` for a `primary_diet` row and ignores the heuristic. The heuristic's caveat still prints on the report; de-duplicating it there is CUL-480.
- **Only while the trial is running**, by the shared `isTrialRunning` from `lib/dietTrial.ts` — the predicate the allowed-set screen resolves the running trial with. A trial that ended inside the report's 90-day grace still anchors the report and still prints the caveat, but there is nothing left to set up, so the line stays off. Kept even without the button, so the button can return without the fact changing under it.

The report's verdict, returned, rather than a client re-read of the local mirror: the line is a claim about **this document**, and a local re-derivation could name a different trial or a different day than the report did (C-4, one predicate both surfaces switch on). The `code-reviewer` checked the data path and found no hidden filtering: soft-deleted rows leave at the query, `mapAllowedFoods` filters nothing, so "no primary row" means none exists.

## Why the documents line renders only when a document exists

The issue left this to the session. Reasons, stated as asked: (a) the profile card's D14 line lives on the **populated** card only — the zero-state blurb does not carry it — so both surfaces now speak under the same condition; (b) an owner with no documents gets no sentence about documents she does not have, on a bar that can already carry a staleness line, a photos line and the allowed-list line; (c) a read that has not answered, or that failed, renders nothing (C-12) — an absent line makes no claim, and the profile card holds the same truth for the owner who lands there instead. The answer is cleared before a new pet's read starts, so a pet change never leaves the previous pet's line on screen (code review).

The line gained its second sentence on the review: the profile card states the fact **and** the remedy (*shared one at a time*), and the report screen — the one place the owner has a next action — stated only the gap. Now both agree on fact and completeness. A sentence, not a door: the send moment gains no navigational choice (Principle 1).

## Voice

Both lines through the `nyx-voice` pass: second person for the owner, the pet named on the gap line (the **report's** pet, `report.petName`, never `activePet` — C-9; fallback *your pet*), specific, no `!`, no jargon, no nag, no reassurance. The one soft finding is filed rather than fixed: "allowed-food list" is the report's own noun and appears nowhere else an owner reads, where the app says *What Mochi can eat* / *Trial diet* / *Also allowed* / *the trial list* — **CUL-1005**, because the vet-facing string should stay clinical and the owner-facing noun needs the PM's ear.

## Tests

- `app/report.test.tsx` (new, 7): the gap fixture renders the line and `Send anyway`, no `Send to vet`, **no `Set it up`**, and no navigation; the line names the report's pet and falls back to *your pet*; the list fixture renders the plain send and none of the three; `Send anyway` shares the report on screen; the documents line (fact + remedy) on one row, absent on zero, absent and non-blocking on a failed read. The first cut of this file was run red against the pre-R-16 tree (6 of 8 failed; the 2 green were the refactor-safety cases); the `code-reviewer` re-ran that from a worktree and got the same 6/8, and mutation-tested one guard.
- `lib/pdf.test.ts`: `trial_allowed_list_missing` true / absent / a truthy non-boolean.
- Deno: `trial.test.ts` (6 — a permitted treat is not a list; a primary row is a list whatever the heuristic says; an ended trial, an over-grace active trial and no trial are all false) and `index.test.ts` (4 — the response body on a running trial with and without a list, an ended-in-grace trial, and no trial). Full functions suite green under Deno 2.9.4 locally (1,631).
- Guards: `ownerFacingCopy`, `geistRollout`, `edgeFunctionDeploy` (re-fingerprinted twice: the field, then the comment-only header fix), `reportPullPagination` green; full `jest` green; the touched suites green under the three non-UTC CI zones.

## Reviews

- **`pm-feature-review` (Jordan):** flow 2, `Send anyway` — SHIP-SHAPED (one control, correctly labelled, same handler, under ten seconds, and the PDF genuinely carries the matching caveat). Flow 1, `Set it up` — NEEDS-WORK, blocking → cut, CUL-1004. Flow 4, the documents line dead-ended where the card names the remedy → fixed in copy. Flow 5, density with every line firing — INSUFFICIENT from a static read → on the device pass. Flow 6, voice — no pet name (fixed), one internal noun (CUL-1005). Its one-change-if-only-one was *cut the button, keep the line, ship the send*, which is what happened.
- **`code-reviewer`:** fix-before-merge on the two-effect race (removed with the button, and recorded above for CUL-1004); the same `unknown`-spinner dead end; the `hasVetDocuments` reset before a new pet's read (taken); the test header's "red pre-fix" claim tightened. Checked clean: the shared `isTrialRunning` on both sides with the device timezone threaded through the request, the data path into `permittedFoods`, both ledger claims, C-5, ThemedText, the copy guard.
- Adversarial review: N/A — no detection, correlation, AI-read or escalation logic changed; the report's HTML is byte-identical.

## Residuals (named, not fixed here)

- **CUL-1004** — the `Set it up` door, `Waiting on PM` on the brief. Until it lands, an owner with a running trial and no list meets the same line at every send; the report side is CUL-480.
- **CUL-1005** — one owner-facing noun for the allowed set.
- A trial that ended inside the report's grace with no allowed list gets no pre-send line (the owner cannot set one up; the report keeps its caveat).
- The allowed-list line is inert on a phone until the owed `generate-report` deploy lands; the documents line is live from the TestFlight cut.
- The documents read runs once per pet, not on focus — a document saved and returned to mid-session leaves the line stale until the screen is reopened. Low impact.
- The send bar with every line firing (a quarantine staleness line, photos, documents, the gap line, the hint) has not been seen on a device — the QA script asks for it on the smallest supported phone.
- CUL-974 (the `other`-typed observations) waits on CUL-997 brief 7.
