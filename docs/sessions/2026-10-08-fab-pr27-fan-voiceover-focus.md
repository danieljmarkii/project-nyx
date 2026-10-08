# FAB PR-27: VoiceOver focus moves into the fan when it opens

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-724's remaining half, shipped via #1109.

**What shipped.** The fan's modal layer (CUL-322, BRK-37) kept VoiceOver inside it but never put focus there: focus stayed on the disc and the open said nothing. Now the open is announced on both platforms (`Log menu open`, unconditional because there is no live region, C-44), and after a 500ms beat (`FAN_FOCUS_DELAY_MS`, the one device knob) focus moves onto the fan's top row: the no-pet card, the pet chip or More events. The no-pet card is one focus stop. Pets landing under an open no-pet card move focus to the new top row without a second announcement. A pet flip inside the fan, and the lead re-rendering or remounting under the same key, move nothing. A close cancels a pending move at its start. A re-open caught mid-close speaks and focuses again.

**Shape.** A stable callback ref on the lead row is the trigger, not an effect. The rows are built below the capture-overlay stand-down's early return, where no hook may run, and the ref avoids restating which row leads. The lead's key is written at render; only a new key arms the timer. The timer reads the lead's live node when it fires. `openMenu`, the recent-foods read, `lib/fanBudget.ts` and `momentStore` are untouched (PR-10 / PR-26 lanes).

**Found on the way.** Animated's merged ref re-fires null, then the same node, on every render of a touchable. A callback ref on a TouchableOpacity is therefore not a mount signal, and the key check is what keeps it from re-arming. A failing jest matcher over a component instance pretty-prints its fiber and ran the heap out at 8GB, so the suite reads the focused node's label as a primitive.

**Proof.** `tsc` is clean. `FAB.test.tsx` passes 70/70 and `guards/` 1051/1051. I checked each guard by breaking the code it protects:
- Removing the chip's ref fails 4 tests.
- Announcing on every lead change fails 1.
- Dropping the mid-close re-arm fails 1.
- The scroll-branch live-node test is labelled refactor-safety: the jest renderer keeps the chip's instance across the flip, so reverting to the armed node stays green there (C-18).

**Review.** The code-reviewer subagent found two small bugs, both fixed in this PR. The timer used to focus the node it was armed with, which a remount could leave dead. A re-open mid-close got no announcement and no focus. Its nit stands for the device pass: in the single-pet scroll branch, focusing More events scrolls the column to its top, undoing the snap to the bottom.

**Residual.** The VoiceOver and TalkBack pass is the issue's `Gate: device` and rides the next TestFlight cut. It covers whether the announcement survives the focus move at 500ms, and the scroll-branch focus at AX3.
