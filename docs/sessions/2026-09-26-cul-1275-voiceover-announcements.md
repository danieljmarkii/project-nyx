# CUL-1275 — completion cards and the incident record speak to VoiceOver

**Date:** 2026-09-26

Shipped via #938 (draft). BUILD session on CUL-1275 (Aug. 2026 Design Polish, the audit's defect fallout), sequenced before EN-3 (CUL-1133). Branch `claude/stoic-babbage-kppd14`.

## What shipped

**The completion surfaces.** `accessibilityLiveRegion` is Android-only, and every completion surface relied on it alone, so on an iPhone a save and an Undo were confirmed in silence. `hooks/useLiveRegionAnnouncement(message, key?)` lifts the iOS half that `TextField` and `SignalZone` each wrote inline. It is paired with every live region:
* `NamedCompletionCard`: the sentence and the removal line.
* `MealCompletionCard` and `MedicationCompletionCard`: the removal line, and the **header**. The header had no live region at all and was silent on both platforms; it is now an `accessible` summary node with one.
* `SheetLogBeat`.

Each card speaks its summary node's own label, only while shown, keyed on the event. `accessible` was added to the summary views because without it the label never applied (CUL-682's finding on the sheet). Visible text is unchanged; `code-reviewer` checked this by diff.

**The incident record.**
* The hero photo is an `imagebutton` labelled "{Event} photo", with a hint.
* "AI READ" is a heading.
* `components/event/useReadLandingAnnouncement` speaks "AI read: {line}" on both platforms when a read the owner waited for lands on the open record. The section reports its current line from a layout effect (the `noteStage` shape), and the parent's edge reads it.

**The guard.** `guards/liveRegion.test.ts` fails the build on a file with a live region and no iOS half. Run against the pre-fix tree, it named exactly the five sites the issue listed, and it also failed on a violation planted in the real tree.

**Docs.** CLAUDE.md gains the convention line. It is paid for by removing a duplicate of `STATUS.md` § Current phase from the at-a-glance paragraph; the budget guard is green. `docs/engineering-lessons.md` gains §C-44.

## Decisions

* **Every read that lands is announced, not only `worth_a_call`** (the issue's literal fix shape). Approved at the plan stage. If only escalations were spoken, silence would teach "calm", which is reassurance by absence. The one verdict-correlated lane is B-363's: a photoless incident renders no section unless it escalates, and the audio follows the screen.
* **The landing's trigger is not the arrival's.** It uses the same fact (`awaitingRead` falling) and none of the visual gates. Otherwise a photoless contextual escalation (no pending box) and a re-read after an owner edit (motion suppressed) would go unspoken. C-34, with a screen reader in place of a constant.
* **The landing speaks only when the row moved** (see the adversarial pass below).
* `TextField` and `SignalZone` were left on their inline form rather than migrated to the hook, to avoid churning a hot file. The guard accepts both forms.

## Falsification attempts

* **Mutation pass on my own tests.**
  * Removing the named card's hook call: 5 reds.
  * Dropping the key: the second-identical-save test reds.
  * The section not reporting its line: 8 reds.
  * An iOS gate copied onto the landing: the Android test reds.
  * **Removing the section's unmount clear survived, and that exposed a real gap.** A photoless Worth a call being re-run keeps painting the old card through the wait; when the re-read lands `not_enough_to_say` and renders nothing, the stale "Worth a call" would have been spoken. It is now pinned by a test.
  * **The edge's `!was` check survived as behaviour-neutral** (every current host's first frame is pending or empty). It is pinned by a direct hook test instead. The same pass moved the identity check into the edge's own layout effect, because a passive reset runs too late to stop an utterance.
* **`adversarial-reviewer`, round 1: FAIL, three breaks, all real.**
  1. **The watch's give-up** (offline) was spoken as "AI read: Not enough to say", which can happen over a record that may hold a Worth a call. The screen half is CUL-820.
  2. **A capped re-run the server skips** re-spoke the old verdict as a fresh read. The server writes nothing on that path. The screen half is CUL-1324, filed.
  3. **A dismissal outlives its read**, so a Worth a call the owner retried for landed hidden and was spoken as nothing. The screen half is CUL-1323, filed at High with a decision brief.
  * **Fixes:**
    * The landing compares `updated_at` (trigger-bumped since 013) at the start of the wait and at its end, and says nothing if it did not move.
    * A landing behind a dismissal speaks what the screen shows ("AI note hidden").
    * The hook's pager-safety claim is narrowed to what it guards.
  * The removal of the version check and the silencing of the hidden-note line were each proven by mutation.
* **`adversarial-reviewer`, round 2** (on the correction): **BREAKS.**
  * **Q1/Q2:** the wait's starting marker was the local copy's `updated_at`, which the owner's own Show or edit leaves stale while the server's moves. So "Show (or an edit), then a capped Re-run" still re-spoke the old verdict. **Fix:** Re-run re-reads the server's row before the wait flag rises.
  * **Q3:** after a silent give-up, a late in-flight re-read committed a Worth a call that was shown but never spoken. **Fix:** a quiet end stays armed, and the next movement of the row before another wait is the landing.
  * Each fix proven by mutation in both sections and in the hook.
  * **Residual Q4:** a failed first fetch is treated as "no row", so an old read can be spoken as a landing. It is harmful only after an unread photo swap; noted on CUL-1324 (the CUL-575 class).
* **`adversarial-reviewer`, round 3** (on the round-2 correction): **BREAKS, in the opposite direction.**
  * **R1/R2:** re-basing on the server's row treated "the server already had it" as "the owner already saw it". A Worth a call written by a path the section was not watching (the photo-add re-read, another device), or held all along behind a failed first fetch, arrived through a skipped re-run unspoken. **Fix:** re-base only when the server's row shows the same read as the screen (`showsSameRead`: state, verdict, words, hidden-ness).
  * **R3/R4:** a failed trigger left the local row `pending`, parking the section on "Reading the photo…" with nothing watching and a stored Worth a call hidden for the visit. This predates the PR, but the round-2 fix made it reachable from the not-enough frame too. **Fix:** a failed trigger restores the server's row, and the wait's fall speaks it if it is new. From the not-enough frame nothing is marked pending, which is `main`'s behaviour.
  * Each rule proven by mutation in both sections.
  * **Residuals** (stated in the hook):
    * R5: a failed re-base read plus a succeeding, skipped trigger can re-speak the current verdict (same root as CUL-1324).
    * R7: an armed quiet end, then the owner's own writes, then one late tick re-speaks the CURRENT verdict once. Never a stale or unseen one.
* **`code-reviewer`: ship-ready.** One cleanup, taken: a `new Date(x ?? 0)` epoch fallback left by hoisting the header's words above the early return. It was inert, but one refactor away from a 1970 time on screen.

## Residuals and follow-ups

* **CUL-1319:** the meal trial heads-up, the combo dose's in-doubt prompt and the double-dose note are spoken on neither platform.
* **CUL-1320:** the Design v2 day row may double-speak on Android. The addendum notes a possible third voice with Home mounted under the record, and a verdict-correlated form.
* **CUL-1323** and **CUL-1324:** the screen halves above. **CUL-820:** commented.
* **Device questions (CUL-556):**
  * An utterance posted as the pending box unmounts may be cut off when VoiceOver's focus moves.
  * A landing while backgrounded fires its one edge into an utterance iOS may drop, and nothing replays it.
  * The completion cards' utterances land in the same instant as a sheet or route dismissal.
  * `announceForAccessibilityWithOptions` (`queue` / `priority`) is the one knob in `useLiveRegionAnnouncement` if these bite.

## Checks

`tsc --noEmit` is clean. Full jest: 531 suites, 12,010 passed, 6 skipped. The touched suites also pass under `TZ=Pacific/Kiritimati` and `TZ=Pacific/Honolulu`. The `guards/` suite and the CLAUDE.md budget guard are green.
