# Design system PR-12: the food capture design round

**Date:** 2026-10-23

Dispatched DISCOVERY row for CUL-1987, shipped via #1308. Page: https://claude.ai/artifact/B3bzNcJMdGHksHKatfogDP (`docs/culprit-capture-design-pass-mockups.html`).

**What was drawn.** Fourteen states of adding a food from its label, each three ways (today, faithful, design pass): the first food, the consent sheet, consent not given, the optional shots, the wait, confirm (full read and front only), read failed, offline, the daily cap, the saved beat, 320pt, largest text at fontScale 3.1, and two pets. Plus the VoiceOver order on confirm, the wait in motion, the state set against the contract, a ledger of briefs and the lenses.

**Scope call.** Food capture only: the medication revamp's round 4 redraws medication capture ("You snap the label", the label photo per box), which is the condition the issue named. The AI consent sheet is drawn verbatim in all three columns.

**First build ready round.** This is the first page under the mock round contract (#1297). Every colour is a token, chrome included: the page chrome maps light mode onto the daylight tokens and dark mode onto the night tokens, so dark mode needs no typed value either. Inside a phone every size is a token times a drawing scale; the named exceptions are the device frame and the 1px hairline the app itself types. A scripted walk confirmed every phone node sits inside a tagged part.

**Recommendations.** Faithful F1 to F7 (buttons on `PrimaryButton` with a new icon slot, `TextField`, Type as a radio `ChipGroup`, the wait as a silhouette and tick, links in the action colour, the failed band off the rose, `CompletionMark`). Design pass P1 to P10: the slots up front; "Read the label" as the main button with the ingredients row saying why (LOUD); the wait with the owner's photo standing; the read as a card of facts (Format is read today and never shown); P5 recommended against; the meal row names the pet (two pets); the photo stays in view on the typed form; offline said before the wait; consent off said on the first screen; the saved beat names the food.

**Found along the way.** CUL-2164 (Live harm, QUIET): the failed read band promises "we'll retry extraction in the background"; nothing retries. Medication's twin says the photo is saved either way, untrue when the upload failed. Copy only stopgap described on the issue.

**Residual.** The PM's real payload is not drawn (a production read of the library waits on the PM's word). The round merges once ruled; the build is CUL-1910.
