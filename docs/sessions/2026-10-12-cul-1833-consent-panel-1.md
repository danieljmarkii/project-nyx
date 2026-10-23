# CUL-1833: synthetic panel 1, the AI consent teach-back

**Date:** 2026-10-12
**One thing:** P4 L1 — Leading vs lagging indicators: a simulated teach-back is a leading signal that can only trigger a fix; week one is the lagging signal that can clear the risk · check: pending
**One thing (re-ask):** P2 L1 — Reversibility (from 2026-10-12, CUL-1832: which of round 4's changes gets hard to undo once the 1.2.0 binary ships, and which stays cheap?) · check: pending

DISCOVERY, panel 1 of *App Store 1.2.0 · the first public release* (Wave 2, AI consent). Shipped via #1206: the dated review `docs/consent-panel-1-2026-10.md`, mock round 4 of `docs/culprit-ai-consent-mockups.html` (republished to https://claude.ai/artifact/NimqFXoYf8cgvZEFpL465f), and this record. No code.

## What ran

- **Pre-registration first** (`720e1a3`, pushed before any run): the Trust and Safety answer key for the seven items, the probe, eight persona cards mapped to the doors round 3 actually has, and the decision rule.
- **Round 1:** 8 personas × 3 runs on the approved round 3 frames. Each participant was an isolated agent that saw only its card and the rendered frames; an isolated expert verifier then tried to refute every finding against the pixels, the code and the policy.
- **Mock round 4:** every verified coercion and false reassurance fixed (PM, in session: all of them in this PR, then a reduced round 2).
- **Round 2:** 4 personas × 3 runs on round 4, then a second verifier pass.

## Found

- **The big one: "whether it's worth a call" promised an all-clear.** A read that flagged nothing was taken as "she's fine", "no need to call" or "wait till morning" in 17 of 21 round 1 runs, and no run could say the AI isn't a vet check, because no frame said so. The engine never gives a "not worth a call": its quiet label is "Keep an eye out". Round 4 says "points out some signs to call your vet about. It can't tell you Mochi is fine." In round 2 the teach-back got it right in 9 of 9; the probe still drew some relief (3 of 9 wrong, 5 partial). That moment belongs to the read itself, and the shipped quiet read already says "A single photo on its own can't tell you how Mochi is doing … your vet is the best call" beside the result (`analyze-vomit/index.ts:405`); EN-3's watch-for list adds to it once EN-3 is live.
- **"Claude" read as a person or a vet nurse**, "Until then" made the vet line conditional on Allow, and no screen an owner decides on said the photoless checks keep working. At 2 a.m. a no felt like "turning down the only help on offer" (2 of 3). All fixed; round 2 had no wrong item 5.
- **Smaller verified fixes:** a Not now on the record card, H no longer looks read, the "Photo read" label left unread states, G keeps one action (the call), Off stopped saying "Nothing new is sent" to owners who never said yes, and the record card now names everything a yes covers (5.1.2(i)).
- **A persona card error, mine:** P7's card said she'd say yes "if the app seems to want it", and two of her runs echoed it. The verifier discounted them; round 2 didn't reuse P7.
- **Policy behind the code** in three places (CUL-1769 comment) and one edge case for CUL-1835 (a failed upload while off auto-sends after a later yes).

## Decisions

- **PM, in session:** fix every verified round 1 finding in this PR; run a reduced round 2 (option a).
- **Team calls, logged:** Allow stays primary (a PM ruling the verifier didn't overturn); "train" stays; retention gets no number until Anthropic's terms and the policy both state one; the Ask sheet took the tested "isn't a vet" line after round 2.

## Next

The PM approves the round 4 frames on CUL-1834; PR-13 starts on that approval.

## Definition of Done

- Acceptance criteria (issue): findings on the issue ✓ (outcome comment); mock updated ✓ (round 4, same link); verified coercion and false reassurance fixed before PR-13 ✓ (round 2 verified clean); at most two rounds ✓; final frames approved on CUL-1834 — pending the PM.
- Anti-patterns: copy passed `nyx-voice` (no exclamation marks, the pet by name, plain words) and `clinical-guardrails` (no line asserts wellness; every non-read state keeps the vet line) ✓.
- Types, lint, tests: N/A, docs and a mock only.
- Secrets: none ✓.
- Adversarial: two isolated verifier passes (the P-16 cap). Counterexamples tried: the 2 a.m. owner with two vomits in an hour reading a quiet result (held: the frames now say the read can't tell you the pet is fine, and the shipped quiet read text carries "your vet is the best call" beside the result); a declined owner on a day the photoless check fires (held: G leads with the warning and backs it, "Mochi's log alone is reason to call your vet"); a never-allowed owner reading Off (fixed: "Nothing new is sent" implied a past send).
- Persona sign-off: Trust and Safety ✓ (answer key, 5.1.2(i) disclosure on the record card) · Dr. Chen ✓ (no reassurance on absence; the vet line on every unread state) · Designer ✓ (Principle 1 holds: the card never asks before the save; frames fit at 390) · Jordan / Sam ✓ via the panel · Data N/A · QA ✓ (criteria above).
- Future self: the pre-register, run, verify, fix, re-run shape is protocol T1's, not new here; the one new habit, writing the persona cards so they carry no opinion about the app, belongs in the protocol (§1 rule 2), proposed for the PM below.

## Proposed doc edit (Tier 2, awaiting PM)

`docs/synthetic-testing-protocol.md` §1 rule 2, persona cards: add "A card carries the persona's situation, words and habits, never an opinion about the app under test (panel 1's P7 card said she'd say yes 'if the app seems to want it', and two runs echoed it)."
