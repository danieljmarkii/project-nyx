# 2026-11-19 · Vet contacts PR-01: the build-ready mock round

**Date:** 2026-11-19
**One thing:** D4 L2 — A generated file plus a guard is what lets a mock say "this is the app's colour" and stay true · check: pending

**Issue:** [CUL-2763](https://linear.app/projectnyx/issue/CUL-2763) (DISCOVERY, dispatched) · **Branch:** `claude/vet-contacts-pr01-11191427` · **Outcome:** shipped via #1566

## What happened

- **Round 3.1 was redrawn as the build-ready round** in `docs/culprit-vet-contact-mockups.html` and republished to the same URL. It carries the build-ready marker, takes every in-frame value from `docs/mockups/theme.css`, tags every in-frame element with its kit part, and draws the state set.
- **The four frames round 3.1 left undrawn are drawn:** the clinic field on a remote contact (B1), History's row (D4), a contact with nothing sent or started keeping the shipped check (C5), and a trial with no target showing no *Keep going until* (C3).
- **The invented record became the real one.** Round 3.1 drew Nyx as a dog examined Sep 18 and Nov 9 as a Sunday. Her record (read with read-only queries) says a cat, last examined Wed Sep 16 at Completely Cat Clinic, and Nov 9, 2026 is a Monday.
- **The contract critique said NOT READY, and it was right.** `/design-critique`, contract lens, light depth (three agents). The page met the letter of the contract. Several tags named a shipped part the drawing contradicted, so a builder would have had to guess. The lead's pass confirmed each claim in code and the round was redrawn:
  - primary buttons are indigo, secondary ones transparent;
  - a plan row's action is the shipped 44pt box under its title, and a started course is the shipped inert row;
  - the sheet keeps the shipped *Where* block;
  - Home sits on `HomeCard` with `DoorMark`;
  - loading is a silhouette.
- **The critique's largest finding is a spec gap.** The shipped *Log a visit that already happened* button exists only while a pet has no visits (`VetVisitsCard.tsx:55-69`, `VetVisitsEmptyState.tsx`). The spec cites those lines as the entry without saying so. Nyx has a visit, so she had no way in at all.
- **A second one is a wording trap.** History titles every visit record "Vet visit" (`lib/historyScreen.ts:404`). A phone contact through that path would say a visit happened. D4 draws the title following the channel.

## Decisions waiting on the PM

Drawn or briefed on the page and posted on the issue:

- **G1:** where a pet that already has a visit logs a call. Recommended: the non-empty card gains the button.
- **G3:** what a contact adds to a Home card that already says "You called on". Recommended: a second line only when it says something different. Clinical surface.
- **G4:** whether a saved contact's channel can be edited. Recommended: yes, all four chips, with a test that the report window follows the edit.
- **The ear medication's real name.** Not on [CUL-2771](https://linear.app/projectnyx/issue/CUL-2771), and no Nov 9 course exists on the record.

## Team calls (logged on the issue, the PM can reverse)

- Plan rows are reused as shipped rather than declared as new tappable parts.
- *Also about* is chips (`MultiChipGroup`) on the logging door; the booking door keeps its switches.

## Method

One lens (contract), one verifier, one synthesis. Renders: 120 shots from `scripts/design-critique/render.mjs`, no page errors, no sideways scroll at 390px. The redraw was re-rendered and re-checked by script (every in-frame element tagged, no typed colour, every `var()` a real token). The lens was not re-run on the redraw.

## Teach

### A generated file and a guard — why the mock's colours can be trusted (D4, L2)

A mock is a drawing, and a drawing can use any colour its author types. Round 3.1 typed its own teal for links. The app had moved to indigo weeks earlier, and nothing told the mock. The fix is to stop typing colours. One file holds the app's colours; a script writes a copy the mock can read; a test fails the build if the copy and the original ever differ.

**Like:** a restaurant menu printed from the till's price list every morning. Nobody retypes prices onto the menu, so the menu cannot disagree with what the till charges. The test is the manager checking the two match before the doors open.

**In today's work:** `docs/culprit-vet-contact-mockups.html`

```
<meta name="mock-round" content="build-ready">      ← the page promises it follows the contract
<link rel="stylesheet" href="mockups/theme.css">    ← it loads the generated copy of the app's colours
.btn { background:var(--colorAction); … }           ← "use the app's action colour", by name, no value typed
.chip.on { border-color:var(--colorAction); … }     ← the same name again: one change moves both
```

`docs/mockups/theme.css` opens with "GENERATED from constants/theme.ts … Do not edit", and `guards/mockupThemeCss.test.ts` reds if it drifts.

**Why it matters to you as PM:** when you approve a build-ready frame you are approving the colour the phone will show, and today's critique still caught black buttons, because a correct colour name on the wrong part is a mistake the generated file cannot see.

**Check:** if someone changes the action colour in the app's theme file and forgets to regenerate the mock's copy, what happens on their pull request, and what would have happened before this guard existed?
