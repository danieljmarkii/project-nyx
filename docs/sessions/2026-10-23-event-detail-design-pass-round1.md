# Design pass 1, round 1: the event detail screen, three ways

**Date:** 2026-10-23 · **Issue:** [CUL-1907](https://linear.app/projectnyx/issue/CUL-1907) · **Branch:** `claude/design-system-pr10-10231306` · **Mode:** DISCOVERY · shipped via #1291

## What happened
Dispatched as PR-10 of *Design system · one kit, every screen*. Posted the plan on the issue, got the PM's go in session, then drew `docs/culprit-event-detail-design-pass-mockups.html` from the shipped code: fifteen states (pending, call now, call today, an earlier-rule Worth a call, Keep an eye out, Not enough, unreached, failed, AI off, cap, folded, completion card, stool, no photo, loading) plus 320pt, largest text and two pets, each in three columns: today, faithful, design pass. Every element carries its part and token (D1 is unruled, so the page says the contract is pending). Published at https://claude.ai/artifact/Af8aerwLnD4k3cFgApWfXr.

## What the round proposes
- **Faithful (team calls F1 to F3):** Edit and Remove on `PrimaryButton`, labels on `SectionLabel`, the last two `WhorlSpinner`s on `Tick`, hand-typed values on the scale once D3 lands.
- **Design pass (P1 to P12, the PM's):** the footer leaves (Edit to the header, Remove to the foot of the record), a tighter record block, quiet reads on Home's one card surface with the rail in the gutter, the verdict as a 17pt headline at every tier, links kept teal until the colour roles land, and no week lane (recommended against: a lone dot reads as "isolated").
- **The four defects, ruled on the page:** D-820 (an unreached read gets the consent family's "The photo wasn't read" frame with the vet line), D-823 (paint the AI-off frame on the first frame; needs a device check, since CUL-1835 moved that state), D-824 (no footer, nothing to cover), D-828 (an absence keeps its label in the strip; the count names an edit).

## Found along the way
- Consent off no longer renders "no read section": since CUL-1835 it is the "AI reading is off" frame, so §4 of the incident spec and CUL-823's premise both trail the code.
- The completion card's ground is now daylight (`COMPLETION_GROUND = colorSurface`), so CUL-824's "two dark bars" premise has half changed; the overlap with the footer still holds.

- The reviewer's out-of-scope catch, verified and filed as CUL-2141 (Live harm, QUIET): an owner's edit that adds blood or foreign material under a quiet read leaves the card quiet and the facts foldable, because the fold gate reads only the stored verdict.

## Clinical floor
Every read string in all three columns is verbatim from the shipped modules; the call tiers keep fill against outline; no haptic is drawn or proposed. P3, P4, P5, P6, D-820 and D-828 change how a read looks and went to `adversarial-reviewer`. Pass 1 returned FAIL: D-820's "no signal" copy named a cause the branch cannot know (an unsynced photo and a timed-out watch land there too) and could delay a retry, so the copy is now cause-neutral; P3's call today outline went to 2pt after the reviewer found it one 1pt stroke from Keep an eye out once both cards were white; P5's Not enough headline moved to secondary grey; P6 keeps "Hide this note"; D-828 keys on the enum. The reviewer also caught five fixture strings that did not match the engine (call now's read text, a two-form "What to tell them", the watch-for deadlines, the dog's missing bloat line, the stool's read text); all corrected. P4 held.

## Ruling
PM, in session: "Take all the recommendations." Every brief's recommended option is taken (F1 to F3, P1 to P12 with P9 ruled no lane, D-820 B, D-823, D-824 b through P1, D-828 B). CUL-2141's clinical question carried no recommendation, so it stays with the PM.

## Next
CUL-1912 builds the picks after PR-03b, PR-05 and PR-06, carries the D-820 row into the incident spec's §4 (a Tier 2 edit this ruling approves), and runs the second adversarial pass on P3 to P6, D-820 and D-828 on the built screen.

**One thing learned:** a mock's sample copy is a claim about the engine. Five strings composed by hand drifted from what the app would print, one of them toward a later deadline; drawing every fixture through the shipped copy functions, not from memory of them, is the cheap guard.
