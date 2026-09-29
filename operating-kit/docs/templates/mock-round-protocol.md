# The mock-round protocol

How a design goes from "idea" to "build-ready" with a PM who rules from what they can see. Distilled from ~40 mock tracks in the predecessor project.

## Artifact rules
- The committed `docs/<product>-<surface>-mockups.html` is the source of truth; the published Artifact is how the PM views it. **Every round republishes to the SAME URL** (same file path within a session; pass `url` across sessions; `Artifact list` recovers a lost URL). Keep `<title>` and icon stable; name the round inside the page.
- A top-of-file comment states the round, that it republishes to the same URL, and where retired ideas live (`git <sha>`, "not on this page, on purpose").
- **Real content** throughout: realistic names, lengths and densities (a busy day, an empty day), never lorem ipsum.
- Frames use the product's real tokens. One colour rule stated once (e.g. "red marks the one safety element; accent marks a door or selection; everything else is ink"), and every frame reads in greyscale.
- **Every interactive demo is driven in a headless browser before the PM sees it** (`scripts/design-critique/render.mjs` does this).

## Page anatomy
1. **Lede.** What this round is, what it supersedes, what was retired (with sha), whether it is additive.
2. **How to read a frame.** "`current` marks the proposal; a dashed box is an *option drawn for the decision, not the current proposal*. Everything outside a dashed box is what the team proposes to build."
3. **§00 Reaction ledger.** `Your reaction (verbatim) | How the team read it | What changed on this page (§ refs)`. Every reaction gets a row, including clarifications ("a clarification, not a change"), team-originated changes, corrections and items not drawn (with their issue). Earlier rounds' ledgers stay below as the record.
4. **Numbered sections.** Each heading is a claim ("The rows read the record first."). Frames carry a `current` tag, an ID (A1, B1b) and a caption naming the rule behind the frame.
5. **Option boxes** beside the frame they compete with. When ruled, the box leaves and a `ruled` tag says so.
6. **In scope / retired this round / deferred with a home.**
7. **Decision briefs** (Deciding / Options with recommendation / Consequence), each pointing at the frames that draw its options.
8. **Who ruled what, and which reviews ran on the page.**

## Lifecycle
1. **Round 1 is divergent.** Directions side by side.
2. **The PM reacts** in short bursts; quote them verbatim.
3. **Round N+1 is ONE proposal.** Retired directions leave the page (git keeps them); only still-live decisions stay, as labelled option boxes; every current frame is tagged; the ledger maps every reaction.
4. **Reviews run on the page as drawn** (product walk, adversarial pass, privacy, `/design-critique` for a big round) and are folded in the same session.
5. **Converge.** Every brief ruled → the page is tagged build-ready and the spec moves to v1.0, written from the frames with `⚠ RULED` markers.
6. **Decompose.** The spec's run order becomes a tracker project whose description holds the PR table; `/dispatch` reads it.
7. **Post-build rounds are additive:** redraw frames to match what shipped.
8. **Split** when the PM starts confusing current with legacy (usually past 4–5 rounds): a current-proposal page on its own URL, the old page as an archive with a banner linking to current.

## Mock what you change
Any change to a user-facing surface lands as frames in the current round in the same session it is proposed. A decision whose options differ visually renders them side by side. Describing a visual choice in words alone is the anti-pattern.
