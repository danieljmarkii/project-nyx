# Session — Noticed N-6: the vet report's page-1 line, the graph, the Noticed appendix, *Include your notes*

**Date:** 2026-09-11 · **Issue:** CUL-875 · **Mode:** BUILD · **Branch:** `claude/vet-report-noticed-additions-2nhjus` · **Outcome:** shipped via #830 (draft)
**Project:** Home v2 — the redesign · **Milestone:** Noticed D · Read-back
**Spec:** `docs/nyx-daily-look-requirements.md` §8, §9, §10.5 · **Tier-2 edits:** `docs/nyx-vet-report-requirements.md` (CUL-865 edit 2, approved)

---

## What was built

The owner's daily looks reach the document she hands a vet. One dated line under *At a glance*, a monochrome graph (bars, floored and spread-gated, plus a dated 28-day strip), a **Noticed appendix**, and an *Include your Noticed notes* option on the report screen.

**It merges inert.** `generate-report` is held at **v14 (2026-07-30)** by CUL-19; production shows none of this until that redeploy runs. The ledger is re-fingerprinted and stays `hold`.

| File | What it owns |
|---|---|
| `supabase/functions/generate-report/noticed.ts` **(new)** | The whole pure model: the four day counts over the shared counters, the words, the bars' floor and spread gate, the strip, the appendix rows, the intake state, the calibration fact, `ReportAudience`. |
| `generate-report/index.ts` | The `looks` pull joined through `events` (the one place in `supabase/functions/` that selects `looks.notes`), `mapLookRows`, `LOOK_PULL_CAP` + an exact `count`, the note's pull bound, the `includeNotes` request parameter, the required `audience` argument. |
| `generate-report/report.ts` | `ReportInput.lookRows` / `lookRowsComplete` / required `audience`; `ReportSnapshot.noticed`; `leftMostOfIt`; `check_in` filtered out of the countable events; `resolveScope` narrowed to `ScopeResolutionInput`. |
| `generate-report/render.ts` | The page-1 line, the conflict line, the bars, the strip, the appendix, the computed appendix letter, the legend entry, the styles. |
| `lib/lookDayCounts.ts` | `LookOutcome` moved here, making the module import-free — which is what lets the Edge Function share the counters instead of mirroring them. |
| `lib/lookCard.ts`, `components/event/LookRecordSection.tsx` | The note's cue: the vet-report clause restored, and the two surfaces' cues consolidated onto one shared clause. |
| `app/report.tsx`, `lib/pdf.ts` | The toggle, behind the `daily_look` allowlist + opt-in. |
| `guards/reportLookPull.test.ts` **(new)** | The two rules that were string literals nothing red-flagged. |

No schema, no migration, no model call, no new secret.

## Four build-time calls, taken by the team (PM deferred)

Each is on CUL-875 as a comment, written before the PR opened.

1. **The appendix's letter is COMPUTED, not `G`.** The letters here are already conditional — E is the meals appendix, photos take E or F, the *How to read* page is unlettered — so a hardcoded G would contradict the letterhead's own *Appendices A–X* line on any report with no meals and no photos. This file has paid for that once already ("the first round-2 artifact said A–F, sending a careful vet hunting for a non-existent appendix"). Noticed is the last lettered appendix, through the same single source.
2. **One counter module, no server-side mirror and no parity test.** The issue asked for the four day counts mirrored server-side with a parity test reading the client's fixtures. `lib/lookDayCounts.ts` was already pure; its only blocker to a Deno import was one extensionless type import. Moving `LookOutcome` into it made it import-free, so `generate-report` imports the real `answeredDays` / `wordDays` / `absenceDays` / `answeredVomitDays`. The diet-trial §5.3 rule: a parity test proves two implementations agree at the moment it runs; one implementation cannot disagree with itself.
3. **The share-link mint excludes notes by construction.** `ReportInput.audience` is a required union whose `shared_link` arm carries no notes field at all — so §9 rule 4 is a fact about the type. (It then turned out that is only true at the boundary where the field is required; see below.)
4. **The toggle's copy names what it governs today.** CUL-848 is still `Todo` on `Waiting on PM`, so this PR cannot make the control govern the shipped `events.notes` that already prints verbatim in appendices A and E. A control labelled *your notes* that leaves those printing is the CUL-848 defect restated one layer up. **CUL-848 is untouched and stays the PM's.**

Two corrections to the issue's own preamble, verified in session: live `generate-report` is **v14**, not v13; and `REPORT_SYMPTOM_TYPES`' explicit NO for `check_in` had already landed, so §10.5's "never neither" was already true in both halves — this PR pins them *together* in one test rather than writing either.

## Both mandatory reviews failed the first cut

`vet-report-cold-read` → **NOT READY**, 8 blockers. `adversarial-reviewer` → **FAIL**, 8 breaks. `rls-privacy-reviewer` → **FAIL**, one live break. `code-reviewer` → two BUGs. Sixteen distinct findings; every one fixed in session. The four that matter most:

**The onset date was window-scoped while its coverage clause was record-scoped.** A dog marked *Off* in July, recovered, and marked *Off* again in September under an August-opening window printed *"off on 3 (first Sep 2) … she had been answering since May 11, on 102 of the days before the first of these"* — and those 102 days **include the two July days that falsify the onset**. A vet reads 13 days; the record holds 67, waxing and relapsing. That is C-35 verbatim, one session after the lesson was written into CLAUDE.md, and the asymmetry is the tell: the block reached outside the window **only for the number that reassures**.

**`generateReportForPet`'s `audience` had a default.** The union forbids *writing* `shared_link + notes`; the default handed over `owner + notes` for writing nothing. Proven end to end by the reviewer: a seven-argument call type-checks under `--strict` and prints the owner's private sentence into the artifact. The file's own comment asserted the opposite. Required now, ahead of the optionals, so `tsc` makes PR 6's mint decide.

**The look's own `check_in` parent reached the report's type-agnostic denominators.** `index.ts` pulls `events` with every type, so production always hands assembly one row per look. Measured on one record: *days with a log* **3 → 31**, the trend's second half *0 of 23* → *23 of 23 logged*, the mask-events caveat from *"nothing was logged on 43 of 46 days"* to *"on 15 of 46"*. The strongest do-not-read-this-fall-as-improvement disclosure the report has, bought by tapping a chip once a day — CUL-787's cough defect re-created by the app's own prompt. §5.6 forbids it in one line. Filtered at the input boundary; this is the report half of CUL-891, and it changes existing numbers, so it is flagged for veto on the PR.

**Below the floor the absence caveat vanished and the claim stayed.** *"The owner's claim about a day, not an examination"* lived inside the bar block, which the fourteen-answered-day floor suppresses — so on the thinnest records, where over-reading an absence is most dangerous, page 1 asserted *marked nothing unusual on 6 of the 13* naked, with the only surviving caveat in a legend on the last page. A floor that suppresses the protection and keeps the claim is worse than no floor.

The rest: the strip drew an activity day identically to a concern (inflating a September cluster by a quarter) and used a calendar denominator where every neighbour uses answered days; *"3 of the 4 vomit days she marked nothing unusual"* was in the data and never on the page; the 48-hour refusal against *nothing unusual* was 11px muted grey appended to a paragraph about arithmetic; the sum clause printed unconditionally and was false on the dense report; the bars' floor counted days without §6.5's **spread**, so 16 contiguous days drew an 81% bar under a three-month title; `activityOnlyDays` was a falsy catch-all that called an unrecognised word an activity; the withheld state named the floor for three different reasons; the strip's title promised four weeks over a five-day window; the pull cap could bite inside the window with no disclosure; `rawNotes !== false` failed open on every malformed value; the note was unbounded on the way in (900 rows × 200 KB is ~360 MB of UTF-16 against Edge's 256 MB); and the day-keying comment asserted two clocks agree, which three renders falsified.

## Three things caught by tests and tools rather than by review

- **A CSS comment is shipped bytes.** A `▲` in a stylesheet comment tripped the existing R2-6 test, which forbids a triangle anywhere on a chartless report. The stylesheet is interpolated into the document; so is every comment in it. (A backtick in that same comment then terminated the template literal.)
- **Three of my own assertions were satisfied by class names in the stylesheet.** `/nb-track/.test(html)` is true of the rule `.nb-track{…}`, so the test checking that no bar renders below the floor was green against a report that drew one. Every assertion now goes through a `body()` helper that drops the `<style>` block.
- **`scripts/*.deno.ts` is a convention the pre-push hook enforces.** The seed script was written as `seed-noticed-report.ts` and failed `tsc` on `Deno` being undefined — the third time the tsconfig comment's own prediction has come true.

## The cold read's second pass, which was the sharper one

The first read estimated page 1 off the stylesheet. The re-read **rendered both artifacts to A4 in headless Chromium** and measured, which found four more blockers and retracted one of its own earlier recommendations:

1. **Two vomit-day sentences over two populations.** *"On 2 of the 2 vomit days she answered"* sat three lines above the strip's *"2 vomit days were not answered"* — one window-scoped, one strip-scoped, neither labelled, and 2 + 2 = 4 under a safety band saying six. A vet concluded two of six vomiting days went unobserved; the record said four. Each sentence was internally correct; together they partitioned nothing.
2. **The calibration fact ignored ordering.** Three of the five dense "misses" were 09:00 looks against evening vomits — 22:15, 12:05, 18:45. There was nothing to notice yet, and a sentence meant to calibrate her quiet days was inviting a reader to discard them. A day counts only when a look was recorded at or after that day's earliest vomit.
3. **The counts read as a partition and were not one, and the disclosure was suppressed by an arithmetic coincidence.** The reconciliation clause was gated on `countsSum !== answeredDays`; on the dense record one multi-word day and one activity-only day cancelled exactly, so the clause vanished precisely where the ambiguity still existed. Gated on the reasons now — and closing it opened a hole of its own, because the unreadable-days sentence had been riding the same gate.
4. **`.noticed-graph` split the A4 fold**, at y 853–1047 against a boundary at 1039, with a second condition bringing the legend within 6 px.

**The retraction is worth recording as much as the blockers.** The first read said cut the bar chart first. Measured, it saves **60 px on the dense report and 0 px on the sparse one** — the strip beside it sets the row height, and on a thin record the bars are already suppressed. Its revised list (the tautological *Reading the trend* callout, the photo-less *Vomit characteristics* section, the duplicate empty weight strip, two duplicate tiles) reaches ~1.40 pages, and one page is unreachable without deleting clinical content. Estimating and measuring gave opposite advice about the same element.

**And the branch nothing had ever rendered.** Fix 8 (*"first marked …, before this window"*) could not be signed off, because every first date in both fixtures fell inside the window even though the record reached back to May. A branch no artifact renders is a branch no cold read has ever seen — the dense fixture now carries a concern word first marked in July.

## The CI break my own change caused

Making `ReportInput.audience` required broke `scripts/render-trial-report-sample.deno.ts`, the sibling that renders the diet-trial artifacts for this same cold-read gate. CI type-checks it in **its own step** (`deno check --lock=deno.lock scripts/*.deno.ts`) that my local `deno test supabase/functions/` never touched — and ci.yml says why that step exists, two paragraphs below the one I had read. Reproduced red, fixed, verified green, and the whole CI set now runs locally before every push.

## New guard — `guards/reportLookPull.test.ts`

Two privacy rules here are string literals nothing red-flags:

1. **The `events(occurred_at, deleted_at)` embed** is the entire guard for a note the owner took back. Delete `deleted_at` from that select and every undone note starts printing on a document made for a clinic — with the whole suite green, because every fixture in the tree hand-builds a row that already carries the field.
2. **§9 rule 4's mint, which does not exist yet.** Per C-32, the rule is registered the PR its helper ships, with the empty set made the assertion: exactly zero share-link renders exist today, so the first one reds the guard and has to come back and state how it meets the rule. The type stripper that makes the count honest (the union's own arms are textually identical to constructing one) is itself proven.

The `audience`-has-no-default and the note's pull bound are pinned here too.

## Decisions made

- The appendix letter is computed; the doc's stale *"F — How to read this report"* is corrected to describe the shipped scheme (flagged on the PR as a rider beyond the approved Tier-2 text).
- `resolveScope` narrowed from `ReportInput` to a five-field `ScopeResolutionInput` — a widening for callers, and what stops a new required field forcing a decision on a function that will never read it.
- The Noticed block returns `null` rather than an empty state: a section headed *Owner's observations* over a zero invites the reader to score her.
- The strip's `clear` mark is **not** the owner's *nothing unusual* claim, which keeps its own count and its own sentence. `clear` is the weaker true statement: she answered, and nothing she said is a concern.
- The calibration fact prints only when non-zero — *"on 0 of the 4 vomit days"* is reassurance drawn from an absence.
- The note's cue leads the deploy on purpose. It is a **warning**, so over-warning costs an owner a sentence she chose not to write while under-warning is her words on a clinic's document; only over-warning is safe in both release orders, which is why `guards/lookNotes.test.ts` is keyed on what the source selects rather than on what production runs.

## Persona sign-off

`Dr. Chen` ✓ (cold read ×2 — NOT READY on 8 blockers, then NOT READY on 4 more from an A4 render; all twelve fixed. A third read is the PM's to call for) · `Data Scientist / adversarial-reviewer` ✓ (FAIL on 8 breaks, all fixed; tried a word marked before the window, a vocabulary key the held deploy does not know, the look's own parent event, a report generated from another timezone, 1,197 rows against the 900 cap, a 16-day contiguous burst, a quiet 41-of-46 record, and a 5-day window — and tried T-14's mixed day, ten taps in a day, the appendix's day grouping, the absence-never-a-bar rule and the notes union, which held) · `Trust & Safety / rls-privacy-reviewer` ✓ (FAIL on the default `audience`, proven end to end; cross-user reach, service-role scope, prototype keys, `<script>` keys, 20,000 keys, an `<img onerror>` note, the cap disclosure, the wipe and the deletion cascade all held) · `Engineer / code-reviewer` ✓ · `Designer` ✓ (Principle 6 — one hue, no colour on a day, the absence never sized) · `QA` ✓ (7782 jest, 1588 deno, `tsc` clean).

## Residuals filed

- **CUL-929** (High, `Waiting on PM`) — page 1 measures ~1.7 A4 pages, so *"Clinical summary: this page"* is false and the patient footer prints only on the second sheet. The cold read's cut list, in order: the Noticed bar chart, the *Reading the trend* callout, the page-1 QR. **The bars are ruled in the spec (L-13), so cutting them is the PM's.**
- **CUL-930** — a look's day is frozen at write in the device's zone while the record's days are placed at render; they differ by one when the owner is travelling. Disclosed in the legend; closing it needs the look row to carry its writing zone.
- **CUL-931** — §6.11's same-day pairing is specced for *"Patterns and the report"* and the report ships none. Three readings offered.
- **CUL-932** (Low) — four surfaces repeat the two-hook `daily_look` gate; worth one helper **before** GA rather than after.

## Conventions added

`CLAUDE.md` § Code Conventions **C-37**, full account `docs/engineering-lessons.md` §C-37.

**And the numbering collision, for the second time in one day.** This session wrote C-36 and CLAUDE.md v1.42. So did VV-0 (CUL-898), which merged to `main` while this branch was open — and VV-0's own record documents the identical collision with N-5 a few hours earlier. On merging: **CLAUDE.md conflicted loudly** (the rows shared an insertion point) while **`docs/engineering-lessons.md` auto-merged into two sections both numbered C-36**, with nothing in the build able to notice. VV-0 merged first, so it keeps C-36 and v1.42; this session renumbered to C-37 and v1.43, and the file carries a note at the join. The lesson is the one VV-0 already wrote down and this session then walked into anyway: **a shared monotonic counter in a doc is a merge hazard git cannot see** — diff the incoming head's identifiers before merging, because a clean merge is not evidence. Worth noting the reason it recurred: both sessions read a head that did not yet contain the other's work, so neither could have avoided it by reading more carefully. What catches it is checking at MERGE time, not at write time.
