# Design system PR-16: the pet profile design round

**Date:** 2026-10-23

Dispatched DISCOVERY row for CUL-1989, shipped via #1315. Page: https://claude.ai/artifact/4vM28YHSqzbrh9paeL1r5D (`docs/culprit-pet-profile-design-pass-mockups.html`).

**What was drawn.** Fourteen states of the Pet tab and its two forms, each three ways (today, faithful, design pass): a lived in record, a new pet with nothing logged, the photo (none, saving), loading, a failed read after a pet switch, two pets, the archive confirm, the archived pets list, Edit profile, Edit profile's failed and offline save, Add condition, Edit condition, 320pt and largest text at fontScale 3.1. Plus the VoiceOver order, motion, the state set against the contract, a ledger of briefs and the lenses. Build ready under the mock contract (#1297); rendered at 390pt and 1280pt with no horizontal scroll, and every phone node sits inside a tagged part.

**Scope call (S1).** `AddMedicationModal` is not drawn: the medication revamp ruled setup from the label (GC-5 A), which replaces it in all three hosts, the condition the issue named. The Current medications card gets faithful token moves only.

**Recommendations.** Faithful F1 to F8: links in the action colour, buttons on `PrimaryButton`, both forms on `Header` / `TextField` / `ChipGroup` with a new `PickerRow`, skeletons and the tick, the scale, the medicines card's tokens, the status chips on `ChipGroup`, `EmptyState`. Design pass P1 to P10: an identity row (the photo is the button), age and sex in one fact line with weight shown once, condition rows as doors with Mark resolved in the form, the running trial's door under the identity (LOUD), Monitoring off teal (LOUD), the condition form names the pet, Archive stays near black (reversible), save failures said inline and offline said before, the profile weight field says it is not a weigh-in (LOUD), a quiet foot.

**Found along the way.** CUL-2174 (Live harm, QUIET): the tab's lists are never cleared on an in place pet switch or a failed read, so a failed read shows the previous pet's conditions and medicines under the new pet's name, and "Log a dose" writes a dose for the new pet linked to the other pet's course (local first, so it succeeds offline; no server same pet guard on `medication_id`). Resolve and End act on the other pet's rows too.

**Residual.** The PM's real payload is not drawn (a production read waits on the PM's word). The build is CUL-1911.

**Ruled in session (PM, 2026-10-23): "take all the recommendations."** S1 (A); F1 to F8; P1 to P10 as recommended (P5 (B), the muted badge); D-1 (A) in its own fix row. The page is marked ruled and republished to the same URL.
