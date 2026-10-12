# CUL-1832: the AI consent screen, mock round 1

**Date:** 2026-10-12

DISCOVERY, PR-10 of *App Store 1.2.0 · the first public release*. Shipped via the session's draft PR (the mock page only, no code).

## What was drawn

`docs/culprit-ai-consent-mockups.html`, published as an Artifact (https://claude.ai/artifact/NimqFXoYf8cgvZEFpL465f), round 1:

- **§1 The screen** (frames A, B, A′). A headline ("Can an AI help read what you log?"), three lines (what goes to Claude, made by Anthropic; never trained on, changeable in Settings; the true cost of a no: checks that need no photo still warn, photos aren't read, so watch for blood yourself), Don't allow and Allow side by side in one style, nothing preselected, *What's sent, and when* one tap away, and Not now in the corner. The details sheet names every trigger: vomit and stool photos on log and on open; food and label photos with the name, clinic and Rx risk; the pet's name with the symptom, food and counts the Signal phrases; Ask where it is on; Anthropic's short retention; what a no costs. A′ is the option box placing the step after the pet is named.
- **A table of what each answer writes.** Allow: `granted = true` plus a `legal_acceptances` row. Don't allow: `granted = false`. Not now: nothing, so the demo account stays at zero rows (D13).
- **§2 The Settings switch** (E to H). A Preferences row, *AI reading*, opens the screen. Once answered it is a switch that writes on every flip, with no confirm either way. While unanswered it shows the full screen, because any switch position would look like an answer.
- **§3 Reading off on the record** (I to M). Vomit and stool, declined: a status that says nothing checked the photo, carries the when to call line (the stool line is event neutral), and offers *Turn on AI reading*. A photoless escalation that fires anyway still leads, with the off line under it. Not now gets an honest "you haven't decided yet" variant. After turning on, a one tap *Read this photo*.

## Decisions put to the PM (on CUL-1832)

- **A:** where the step sits. Recommended: after the pet is named.
- **B:** keep the no line on the face of the screen. Recommended: yes, and panel 1 scores it for coercion.
- **C:** the engines evaluation line (CUL-1313). Recommended: keep 1.2.0's consent functional only (D18).

## Found

The privacy policy §3 says pattern phrasing sends only the computed finding, but the pet's name goes with it. Added to CUL-1769, which already covers the "when you request a read" error.

## Next

Synthetic panel 1 (CUL-1833) on these frames, then the PM approves the final frames on CUL-1834.

## Round 2 (same session, after the PM's reactions)

PM rulings on round 1: no onboarding step, ask in the flow like other permissions; benefit-first copy, Settings included; no blood callout; Brief B as factual loss framing; Brief C functional only (D18). Brief A is superseded.

Round 2 republished to the same URL. The doors: a permission sheet before a food or label photo and before Ask; a card in the record's read slot for a vomit or stool photo, after the save and never modal; Settings. The Signal never asks. The sheet was redesigned (illustration, three benefits with icons, one disclosure block, a "Without it" line). The Settings screen lists the benefits under the switch. The record's vet guidance names several signs, never blood alone.

This unseats CUL-552's onboarding step and first-open sheet. CUL-1834 and CUL-1835 trade scope (heads-up posted on both). One new brief (D): whether anything asks at first launch; recommended nothing, with the reviewer notes and video pointing App Review at Settings. Team call: in-context doors write `source = 'backstop'`, so no migration.

## Round 3 (same session)

PM reactions to round 2: liked the "Skip the typing" sheet; Not now was hard to reach top right; "patterns in plain words" didn't mean anything to an owner; Allow should be the primary button. Round 3: Not now is a full-width text button under the pair ("Not now, I'll type it in" on the food door); Allow is filled and Don't allow stays a same-size outlined button (PM ruling, replacing the issue's "equal weight" line; T&S condition: Don't allow never shrinks to a link); the patterns benefit is out, and the disclosure still says the pet's name and patterns are sent. Brief D (first launch) still open.
