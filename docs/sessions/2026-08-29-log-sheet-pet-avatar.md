# The log sheet's title row carries the pet's avatar (CUL-679)

**Date:** 2026-08-29

Shipped via [#751](https://github.com/danieljmarkii/project-nyx/pull/751). Mock round 5 published to the
[design authority's own URL](https://claude.ai/code/artifact/d067fd20-9592-4318-8f28-128e56cccd30).

## What the issue was

`pm-feature-review` rated this its highest-priority product fix on the CUL-662 pass. The log sheet
titled itself `Log for {pet}` in plain text plus a chevron, while every other pet-identity affordance
in the app is avatar-led — the Home header, the FAB's *Logging for* chip (whose own comment calls the
name *"the wrong-pet safeguard — make it the chip's hero"*), and every row of the switcher the owner
had just tapped.

The reason it bites *here* and not on Home is that the eight tiles below the title are
**pet-independent**, so a switch moves nothing else on the surface. The entire confirmation of a
switch was four characters changing at the top of the sheet, ~300pt from where the finger had just
tapped, with no transition, while the finger was still covering the region. In Sam's voice: *"I tapped
Miso. The list disappeared. Did it take? The grid looks exactly the same."*

CUL-662 deliberately left it alone — the switch and the retitle land on the same tick and write-time
identity is correct — so this is a legibility gap, on the one capture surface where the wrong answer
writes a health row.

## Mock round 5, and the two things the frames found that the prose hadn't

The issue called for a mock round ("mock what you change"), so §06 was added to
`docs/culprit-more-events-mockups.html` and republished to the same artifact URL. Rounds 1–4 were left
untouched; while the fork was open, §03's stage-1 frame was annotated as the round-4 text-only version
so current and superseded stayed legible side by side. Drawing it turned up two things:

**1. An honest limit, which is now in the mock rather than waiting to be discovered.** Two photo-less
pets sharing an initial — Milo → Mochi, the issue's own stress case — render an *identical* disc, so
the delta is back to one word. The avatar never makes that case worse, but it does not fix it either.
A distinguishing cue for photo-less households is its own question, deliberately not folded in.

**2. The evidence that settled the fork.** The confirm stage's header *always* leads with a 30pt disc,
and `titleRow` already carried that header's exact geometry — 8pt gap, 44pt row, 24pt gutters. So the
single-pet question was not cosmetic: without the disc, the header slid **38pt sideways on every
single-pet log**, on the app's most-used two-step. Nobody had named that cost.

### R5-1 — ruled B (avatar for every household size), PM, 2026-08-29

Multi-pet §3.1 suppresses the **chevron** — the switch affordance — not the pet's identity, and the
Home header already draws the disc for a one-pet account. The rival reading (A, mirror the FAB chip,
which renders nothing at all for one pet) would have bought the 38pt jump. Ruled from the side-by-side
frames; §03's stage-1 frame now carries the avatar and §06 keeps the comparison as the record of how
it was decided.

## The build

Three small changes in `components/log/`:

- **`SimpleEventConfirm.tsx`** exports `SHEET_HEADER_DISC = 30`, and `headerCircle` reads it. The grid
  title's avatar reads the same constant, so the stage-1 ↔ stage-2 pairing is true **by construction**
  rather than by two literals agreeing — the shape CUL-621 asks for, and zero new coupling, since
  `EventTypeSheet` already imports this module.
- **`EventTypeSheet.tsx`** renders `PetAvatar` at that size in `titleRow`, guarded on `activePet`
  rather than reusing `petName` (which falls back to `"your pet"` — an avatar built from it would
  render a confident `"Y"` disc for a pet that is not there).
- **`title` gains `flexShrink: 1`**, which the confirm header's `headerText` already carries for the
  same reason: with a leading disc and a trailing chevron on the row, `numberOfLines` alone does not
  shrink a `Text`, so a long name pushed the chevron off the end instead of ellipsing itself. The full
  name stays in the row's accessibility label, matching the Home header's ruled ladder (the name is
  never lost, only unrendered).

No hit-area question (CUL-612): the avatar, name and chevron are all inside the one `TouchableOpacity`,
so there are no adjacent touchables. No wrong-pet question (CUL-574): this is a surface scoped to the
*active* pet, not to a record, so reading `activePet` is the correct source — and the confirm stage
still captures the pet at grid→confirm as before.

## The tests, and proving them by mutation

Three tests, each **proven red against a deliberately broken tree** rather than by inspection
(CUL-613, sharpened by CUL-621). Four mutations, each landing on exactly one test:

| Mutation | Red |
|---|---|
| Avatar deleted entirely (the pre-fix tree) | all three |
| Avatar gated on `multiPet` (option A, the rival R5-1 reading) | the R5-1 test only |
| Avatar names `pets[0]` instead of the active pet | the follows-a-switch test only |
| Avatar moved outside the touchable, rendered as its sibling | the membership test only |

Two details worth keeping:

- **Avatar identity is read off `PetAvatar`'s `name` prop, never the rendered initial.** The initial
  collides for Milo/Mochi — the very stress case the issue names — so an assertion on the glyph would
  pass straight over a switch that never happened.
- **The membership test compares owning-touchable node identity rather than firing a press**, because
  RTL-RN's `press` can descend from an enclosing composite and reach a handler the node does not own
  (CUL-579). A press-based version would have been green with the disc sitting outside the button.

`tsc` also earned its place: the first draft of the test helper had a hand-rolled parameter type that
jest accepted and `tsc --noEmit` rejected — CI would have caught it, and CI is the only type check
some of this repo gets.

## Verification

- `tsc --noEmit` clean.
- Full suite: **282 suites / 6156 tests, all passing** — including the `guards/` scanners (Geist
  rollout, haptics, completion-card, reverse-path, symptom-lists), none of which this diff perturbs.

## Deliberately not folded in

**CUL-682** owns this same title row's remaining nits — the *Logging for* (FAB chip) vs *Log for*
(sheet) copy split, and the single-pet row's VoiceOver "dimmed" announcement — both of which want a
device check first. Adding the avatar changes neither. One note for whoever takes it: `flexShrink`
means a very long name now ellipses on a single-pet account, where the row carries no accessibility
label to hold the full name; CUL-682's planned fix (a plain `View` + `ThemedText` when `!multiPet`)
is the natural place to give it one.

## Residual

The photo-less same-initial case above. Not filed as an issue — it is a design question about photo
prompting rather than a defect, and the mock now carries it where the next round of this surface will
see it.
