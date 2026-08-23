# CUL-600 — the Home header: one row, the pet's photo leads

**Date:** 2026-08-23

Shipped via #709. One PR, no schema, no deploy, no flag.

Lane B (chrome) of the **Aug. 2026 Design Polish** track, and the second half of the
pair that started with CUL-599 the same day. Spec: `docs/nyx-app-polish-requirements.md`
§2 (DP-2) + §3 + §8. Design authority: mock round 3 §01, frame *"H2a · The pet alone"*.
Both rulings — D3 (one row, the pet alone) and D4 (the "new signal" dot deleted; no
looping chrome motion, ever) — were PM-ruled 2026-08-22, so this was execution.

## What was there before

Two rows. A chrome row carrying a "Culprit" wordmark, a `CulpritMark` that *pulsed*
when the Signal held an unseen finding, the Ask pill and the owner's monogram; below
it an identity row with a 38pt avatar, the pet's name at 22pt, and a breed · age line.
106pt of header below the safe-area inset, of which the pet occupied about a third.

It is now **56pt**, one row —

    [30pt photo] [Name ▾]                              [Ask] [you]

— and the 50pt goes entirely to the Signal, which is the point. Principle 3 says Home
is an intelligence surface; the header had been quietly annexing the top of it.

## The removals, and why they are load-bearing rather than tidying

D4 is the interesting ruling. The teal dot failed on the PM's own read — *"not
understanding it"* — and the conclusion drawn was not "explain it better" but **a cue
that needs explaining has failed**. The rule that fell out of that is absolute and
now lives in the component: *no looping animation in app chrome, ever.* "Something
new" is announced by **content** — the Signal card's live rail, the arrival moment —
never by chrome.

That is a rule a future session will be tempted to break as polish, so it is written
where a future session will read it, and the test suite asserts the absence
structurally (no `Animated` node anywhere in the rendered tree) rather than by
anyone remembering to look.

The breed · age line went with the second row. It lives on the Pet tab, which after
CUL-599 is reachable from every screen.

## The two ladders, and why they differ on purpose

The header's name overflow is `17pt → 16pt → tail-ellipsis` (`lib/headerName.ts`).
The Pet tab's is `11pt → 10pt → the literal word "Pet"`, with **no ellipsis rung**.
The spec writes both down explicitly so neither gets re-derived from the other, and
the reason they differ is worth keeping:

- On the **tab**, a chopped name reads worse than no name, and the avatar carries the
  identity in every rung — so the ladder ends in a whole word.
- On the **header**, there is no acceptable generic fallback. A header reading "Pet"
  over the pet's own photo is a downgrade, not a graceful one. So ellipsis is the
  floor — and it is reached **at the bottom rung**. Falling back *up* to 17pt would
  cut more of the name to say the same thing louder.

### What the estimate costs here, which is much less than on the tab

CUL-599 reasoned hard about the asymmetry of its estimate: over-estimating drops a
name a rung early (harmless), under-estimating renders it wider than its box (the
exact mid-word cut the ladder existed to prevent), so it spends 4% headroom entirely
on the safe side.

That reasoning does **not** transfer, and saying so was more useful than inheriting
it. This module only ever chooses between two point sizes; **the ellipsis is not its
decision at all** — it is `numberOfLines={1}` doing what RN does when text overruns
its box, which is a truthful measurement rather than an estimate. So the worst error
here is a whole name at 16pt where 17pt would have fit. Headroom is still spent, in
the same direction, because the other direction (an unnecessary tail) defeats the
middle rung's purpose — but if the shared table ever needs a wider margin, this
surface is not the reason.

### The table moved rather than being copied

`estimateLabelWidth` was private to `lib/petTabLabel.ts`. Two copies of a character
table are how two surfaces quietly stop agreeing about the width of the same pet's
name — the argument that moved `GlyphSvg` out of the event family one PR ago, applied
one PR later. It is now `lib/textWidth.ts`, and `petTabLabel` keeps its function as a
thin wrapper; its 28 unchanged tests passing is the proof the extraction is
behaviour-preserving.

One real design decision fell out: **`letterSpacing` is a required argument, not a
defaulted one.** The tab renders at `trackingWide`; this row renders at none. A
default would have silently given one surface the other's typography, and a caller
that forgets gets a compile error instead of a narrow answer.

## A finding the build produced that the ruling did not anticipate

**The 16pt rung fires for a ~6%-wide band of name lengths.** 17→16 is a small step,
so the window where a name fits at 16 but not 17 is narrow: `Captain Nibbles` at
320pt is exactly it, but most names that overrun 17pt overrun 16pt too and go
straight to the tail. The rung is not doing the volume of work the ladder's shape
implies. Ruled numbers, so built as ruled — recorded on CUL-628 with a 15pt option,
not silently "improved".

## The chain that went with the pulse

`live={hasUnseenSignal}` turned out to be the **only** reader of an entire mechanism:
`useSignal.hasUnseenSignal` → `signalCopy.hasUnseenFinding` / `signalFindingsSignature`
→ `store/signalMarkStore` → `SignalZone`'s `markSeen` effect. Deleting the header's
read would have left a store written on every Home focus and read by nobody.

PM ruled to remove it. The argument for removing rather than leaving it: the next
session looking for *"how does the app know something's new"* would find a
live-looking answer that feeds nothing, and CUL-601 is that session.

**What deliberately stayed:** `useSignal`'s render-body pet reset. Its comment was
entirely about the leak this deletion removes — pet A's finding signature landing
under pet B's `seenSignatures` key — so the temptation was to delete the comment and
then wonder about the code. Instead the comment now records that the *concrete* leak
is gone while the *invariant* is not: the reset is what makes "the id and the findings
this hook returns describe the same pet" true by construction, and every future
consumer inherits that for free. The same edit was needed one layer out, in
`useSignal.test.ts`'s header, and was missed until `code-reviewer` caught it — the
file-level comment still described `seenSignatures` as live.

## The spec line that nearly went the wrong way

§1 pins the tab's labels with `allowFontScaling={false}`; the obvious move was to
copy it. That would have been wrong for the opposite reason it was right there: the
tab pins because its box **cannot grow** and a scaled label would overflow the tab the
ladder had just fitted it to. This row grows, and its floor is already a tail — so a
scaled name degrades exactly the way the ruling says it should, and the pet's name is
the one thing on this row an owner may genuinely need larger. Scaling is allowed, and
the reason is in the component so the next reader doesn't "fix" the inconsistency.

The residual is honest and filed (CUL-630): the right cluster is `flexShrink: 0`, so
at accessibility sizes the name pays for **all** of the row's growth. Plausible end
state is the word "Ask" fully legible beside "Bisc…" — backwards for a header whose
whole ruling is that the pet leads. Needs a device shot before anyone acts on it.

## What the reviews found

Both mandated reviews ran (`code-reviewer`, `pm-feature-review`). `adversarial-reviewer`
and `rls-privacy-reviewer` are **N/A with reason**, not by silence: no clinical or
statistical logic, no data boundary, no schema, no service-role path.

### The one fix-before-merge, and it was the mistake this PR warns about

`code-reviewer` found that the **Ask pill's five geometry constants were duplicated**
— private inside `askPillWidth()`, and re-declared as bare literals in `HomeHeader`'s
stylesheet, with no linkage. They agreed. By coincidence.

The sting is that `lib/headerName.ts` opens with a paragraph saying the width budget
and the rendered row are the same fact and splitting them is how a name starts fitting
the arithmetic instead of the row — and every *other* constant in the file is exported
and consumed by the stylesheet correctly. The one sub-component I measured was the one
I split. This is precisely the defect CUL-599 shipped a follow-up commit for: a tab
budget protected by a 6pt padding the tab never rendered.

Fixed by exporting the five and consuming them in both the stylesheet and the JSX,
plus a guard test asserting the flattened pill and dot styles against them — because
"correct by construction" that nothing enforces is just "correct today".

### The test that could not have failed

`lib/textWidth.ts` shipped with no suite of its own, covered only through its two
consumers. `code-reviewer` was right that this is not coverage: a consumer's invariant
is of the form `estimate(t) <= budget`, which is **true by construction whatever the
table says**. That is the exact hole CUL-599 fell into, where 25 passing tests could
not notice that full-width scripts were billed half their true advance.

It has 14 cases now that test the *table*: the class ordering and its two case
exceptions (`I` narrow, `M` wide against their case), the full-width / astral /
accented-capital classes that exist because an ASCII-only table under-charged them,
letter spacing being real and charged per code point — and, as a passing test rather
than a docstring promise, that **Devanagari is under-charged**. A table of assumptions
has to say where it stops, and a test says it louder than a comment.

### What `pm-feature-review` found, and what did not survive checking

Verdict was SHIP-SHAPED on the layout, the removals and the shrink; NEEDS-WORK on
things this PR did not cause. Four findings held and were filed; two did not survive
verification, which is why they were checked rather than obeyed:

- *"PetAvatar has no failed-photo fallback."* Real, and genuinely made load-bearing by
  H2a — **already filed as CUL-617** by yesterday's CUL-599 session. Not re-filed.
- *"CLAUDE.md's `nyx-pet-photos` RLS Open Question is stale — migration 042 resolved
  it."* Migration 042 exists, but **CUL-555 exists precisely because nobody has
  verified an upload works** (0 objects, 0 `photo_path` rows at the July audit). The
  row is pending verification, not stale. Left alone.

The one that matters most is a premise, not a defect: **D3 chose H2a on the strength
of *"when my wife saw Nyx's photo she was delighted"* — and the app never asks for
that photo.** `app/onboarding/*` has no photo step and `app/add-pet.tsx` never writes
`photo_path`; the only upload path is buried on the profile screen. So every account
begins photo-less and the warmth argument renders as a tinted initial disc, including
in the first-run App Store screenshot. Filed CUL-627 (High). The build executed the
ruling faithfully; nobody had re-checked what the ruling rested on.

Also filed: CUL-628 (the two ladders compose badly — at 320pt a long name tails in the
header *and* falls back to "Pet" in the tab, so the full name renders nowhere on Home;
`Schrodingers Cat` is in the band), CUL-629 (the "something new" gap **outlives**
CUL-601 — the arrival moment fires once per pet ever and the `New` chip covers only
`isNewWorsening`, so the Nth new finding is announced by nothing), CUL-630 (Dynamic
Type). And a comment on **CUL-618**, which turns out to be the same fork from the other
side: the header's photo opens the switcher while the identical tab-bar photo opens the
profile — the same symbol, two meanings, now on one screen. That reframes CUL-618's
option (a) as the one that makes both faces mean the same thing.

## The PM call this PR takes

The name renders at **17pt**, which **overrules a 2026-06-12 PM device call** that had
raised it to 22pt (`textXL`) on the grounds that *"the mock-faithful 17 read small
on-device"*. That call was made against the two-row header, where the name led an
identity block with a sub-line beneath it; H2a makes it the single row's anchor beside
a 30pt photo, and §2 states the rungs numerically. Surfaced as a decision brief before
coding; **PM overruled their own earlier call.** First thing to check on device.

## Tests

41 new (18 ladder + 23 header) plus 14 for the extracted table, and the guard test
from the review pass. Full suite **255 suites / 5621 tests** green; `tsc --noEmit`
clean; all three CI jobs green.

Two harness notes carried forward from CUL-599 and applied here rather than
rediscovered: **jest-expo's default window is 750pt** — no supported phone, and a frame
on which the ladder never engages — so every width-dependent assertion states its own
frame; and a closure over a mock variable must be `mock`-prefixed for babel-jest's
hoist to allow it.
