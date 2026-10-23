# Design system PR-18: the event editor design round

**Date:** 2026-10-23

Dispatched DISCOVERY row for CUL-1990, shipped via #1318. Page: https://claude.ai/artifact/8ypJpfPALJF6Erh3GLDyd4 (`docs/culprit-event-editor-design-pass-mockups.html`).

**What was drawn.** The question first (§00): edit in place on the record, or a screen of its own, as three options side by side. Then seventeen states, each three ways (today, faithful, design pass): a vomit with a photo, a stool without one, a found time window, a cough (drawn against CUL-887's photo gate), a meal with its food list open, a mixed bowl, a dose, a weigh-in, a look with words, a look of nothing unusual, Other, loading, a failed save and offline, a synced photo on a second phone, the remove confirm, 320pt with two pets, and largest text at fontScale 3.1. Plus the VoiceOver order, motion, the state set against the contract, a ledger of briefs and the lenses. Build ready under the mock contract (#1297); rendered at 320, 390 and 1280pt with no horizontal scroll and no script errors, and every phone node sits inside a tagged part.

**Recommendations.** S1 (B): a screen that reads as the record in edit mode (whose record, the record's order, label/value rows, Remove at the foot), keeping the form's Cancel and its touched-only writes. Faithful F1 to F9: header actions on the kit, SectionLabel without overrides, `TimeEditSheet`, `SegmentedControl`, `TextField` / `NumberField` / `PickerRow`, card rows for the food list, the 44pt photo row, CUL-887's gate, the scale. Design pass P1 to P9: the record's order, the record's pet named, the meal's food through the log form's food step, Remove in the editor too, the remove confirm naming pet, type and time (the shared composer, every door), Save waiting for the record's reads (closes CUL-433's window), "A new photo gets a new read" (LOUD), a failed save said in place and offline said only for a pending photo, Other leading with its note.

**Found along the way.** CUL-2176 (Live harm, Todo): on a phone where the photo arrived by sync, the editor reads the attachment row's empty `local_uri` as no photo and offers "Attach a photo"; attaching one then detaches every prior row, deleting the original from Storage. CUL-2177 (parked): the look's "pick at least one word" alert sends the owner to a Remove the editor does not have.

**Residual.** The PM's real payload is not drawn (a production read waits on the PM's word). The build is CUL-1909.

**Ruled in session (PM, 2026-10-23): "Take all the recommendations."** S1 (B); F1 to F9 (F6 falls away with P3); P1 to P9 as recommended; D-1 (A) in its own fix row (CUL-2176); D-2 resolved by P4. The page is marked ruled and republished to the same URL; the picks are written on CUL-1909.

**One thing:** none — dispatched session, not this round's teach row
