# Action colour, round 1: indigo acts, teal is a good fact, on every screen

**Date:** 2026-10-25
**One thing:** P7 L1 — Writing for decisions: a brief that carries its recommendation, its why and what it unblocks lets four calls be ruled in one sentence · check: pending

**Issue:** [CUL-1279](https://linear.app/projectnyx/issue/CUL-1279) · DISCOVERY · shipped via #1329 (the mock, the brand spec edit and this record)

## What this session found first

Most of what the issue asked for had already been built by the design system project in the three weeks since it was unparked: the action token (`colorAction #3F35A0`, the value the issue proposed, R1 of CUL-2145), the role layer in `constants/theme.ts`, the hue table in the principles (v2.1), the glyph walk (CUL-1666) and the colour guard (CUL-2175). The shared link and action primitives already resolve to indigo. What was left was exactly row PR-01 of *Design system · colour fills and links*, marked "to file at kickoff": the mock round for the links, choices, fills and buttons that still speak teal. This session became that row rather than filing a duplicate.

## What it delivered

`docs/culprit-action-colour-mockups.html`, a build ready round (CUL-1894 contract: 202 tagged elements, every colour a theme token), published at https://claude.ai/artifact/7XMfstTexYsef4faxGnBT3:

- **§01, six screens now and proposed:** History, Foods, the trial screen, the Signal screen, the log sheet (symptom confirm) and Home, which lands with the others so it is never the one screen in indigo. Each site classified by one question: can you act on it (indigo), is it a good fact (teal), or is it a position (neutral ink). Doors: the label and chevron act, a fact inside stays teal.
- **§02, three calls:** C1 the primary button (indigo recommended; R5 already made the symptom save indigo), C2 a good fact as a fill (two leaves recommended: glyph teal on white at 3.27:1, teal ink in a track at 4.53:1, because the glyph teal is 2.87:1 on the chart track), C3 the night call to action (moonlight recommended, per R3).
- **§03, the state set:** the failed and empty states, where most retry links live.
- **§04, brand rule 3:** the rewrite, for the PM's word (Tier 2, nothing written).
- **§05, the guard walk:** three new pinned leaves for `theme.contrast.test.ts`; `colourRoles.test.ts`'s registry falls; `accentOnLight.test.ts` cannot tell a teal link from a teal fact, which is why row 06 exists.

## Filed

- [CUL-2200](https://linear.app/projectnyx/issue/CUL-2200), the button (row 05), gated on C1 and C3.
- [CUL-2201](https://linear.app/projectnyx/issue/CUL-2201), the teal ink ratchet (row 06), after CUL-2161.
- [CUL-2202](https://linear.app/projectnyx/issue/CUL-2202), parked: teal on states that are neither action nor fact.
- The project's run order now names CUL-1279 as row 01 and carries rows 05 and 06; forecast 4 → 6, so the shape is back with the PM inside the brief.

## Corrections made before publishing

Two claims in the first draft did not survive a check: the snackbar sits on white (it moved to daylight in CUL-1691), not on a dark ground; and "teal ink reads close to the medication slate" was not measurable, so it was replaced with what option C2 (b) actually undoes (W3).

## The PM's reaction, same session

"Go with your recommendations on all four": C1 the primary button is indigo; C2 two fill leaves (glyph teal on white, teal ink in a track); C3 the night call to action and the Landing link are moonlight; B1 brand rule 3 approved as written. Written the same session:

- `docs/culprit-in-app-brand-requirements.md` v1.5: §1 rule 3 replaced, its two FAB amendments folded in.
- The mock republished as the reacted round (ledger, options not taken removed; they are in commit 7c66f80).
- CUL-2200 to Todo with the code comments that still quote the old rule added to its scope; CUL-2178 and CUL-2161 scoped site by site in comments; the project page's rulings updated. CUL-1279 off `Waiting on PM`.
- The six row shape follows from C1 and C3 and was not ruled separately.
