# Incident screen PR 3 — the read's arrival, rail-led on the fold's physics (CUL-804)

**Date:** 2026-09-05

Shipped via **#809** (draft). Mode: BUILD. Third and last of the build sub-issues
under **CUL-800**; follows **CUL-803** (#806, the screen), sequenced after
**CUL-788** (#800, the fold motion) whose module it lifts.

## What this was for

PR 1 put a photographed vomit on its own record; PR 2 made that record worth the
trip, with a rail down the read's left edge and a 16pt tick of that same rail
standing in the pending box. This is §7: the ~450ms between them.

The design principles allow exactly one considered animation — *the transition to
a real insight should feel like something arrived* — and D4 ruled the per-incident
read is that class of moment. The line the owner watched while waiting is the line
beside the verdict.

## What shipped

- **`components/motion/foldMotion.ts`** — CUL-788's module, lifted from
  `components/home/` verbatim. It has two consumers now, so it lives where neither
  owns it.
- **`components/motion/arrivalMotion.ts`** — `useIncidentArrival`. The fold's
  constants (`railLeadMs` 160 → `railLagMs` 80 → `openMs` 370, the sentence at
  `landDelayMs` 40 / `landMs` 300 from −`space1`) and its two-engine split, on a
  one-shot state machine.
- **`components/event/IncidentReadSection.tsx`** — the `AI READ` frame, until now
  duplicated in both analysis sections, and the stage the read arrives on.
- **`components/event/IncidentReadCard.tsx`** — an optional `arrival` prop that
  takes the rail out of the card's flow for beat 1.
- Both analysis sections wired; `guards/haptics.test.ts` gains the new surface.

## Why a sibling of `useFoldMotion` and not a call into it

The two look like the same choreography, and they are — beat for beat, constant
for constant. What differs is what gets deferred.

`useFoldMotion`'s host owns `folded` and **withholds its own state change** until
the choreography is ready to commit it; that is why the hook can be two-directional
and press-driven. A read cannot be deferred that way. It resolves when the server
says so, and the section's `row` is not the animation's to hold. So the arrival
defers **visibility** instead: the resolved content mounts at t0, clipped to the
pending box's height and held at opacity 0, and the beats reveal it.

That difference is small in code and total in shape, which is the argument for two
hooks in one directory over one hook with a mode flag. The mock's own ruling note
said it should cost "one component, not a new vocabulary" — the component is the
stage, and the vocabulary is `FOLD_MOTION`, untouched.

## The one real defect, and where it came from

`isPending` started as the union of the two branches that paint the pending box.
Both branches render identically, so the union looked obviously right.

It was wrong. The first of them is the section **reading its local row** — which it
also does when the read landed six weeks ago. Every time an owner opened an old
incident from History, the section would paint "Reading the photo…" for the length
of a local read and then play the full arrival. That is precisely the case §7
excludes by name ("a read that already exists on open paints on the first frame"),
arriving through the back door of a predicate that never mentions it.

`working` is the discriminator: the sections set it only on the path where the
server has actually been asked. The predicate is now
`hasPhoto && (working || row?.status === 'pending')`, and the parameter is named
`awaitingRead` rather than `pending` so the next reader has to notice that the
stage's `pending` prop and the hook's question are different questions.

**The generalisation: two states that render identically are not therefore the same
state.** The pending box is a *presentation*; "a read is being produced" is a
*fact about the record*. A predicate that reaches for the presentation because it
is nearer to hand will be right until the day the same pixels mean two things.

## The test that would not have caught it

Worth its own section, because the failure was silent.

The first section-level test asserted zero `configureNext` **the moment the read
text appeared**. Beat 2 fires 80ms later. So when the fetch-frame mutation was put
back into the source, the test stayed green — it was asserting before the thing it
was asserting about could have happened. It measured nothing, twice.

The fix was to the test (advance past `railLagMs`, then assert), and the rule it
re-earns is C-3's, verbatim: *a mutation that does not change behaviour has not
tested the guard.* Reading the test would not have found this; only running the
mutation did. Nineteen tests here, and every one of them was proven by breaking the
source — eight mutations on the hook and the stage, two directions of the
fetch-vs-wait split on each section, and a real haptics import dropped into the
real tree for the guard registration.

## Two smaller things worth keeping

**The ghost is hidden from assistive tech, and the test asserts it by accident of
the right kind.** The fading pending box says "Reading the photo…" over a read that
has already landed — possibly an escalation. A screen reader must never hear that.
It carries `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`,
and RTL's default query then cannot find it *for that reason* — so the test asks
for it with `includeHiddenElements: true`, and the query's own behaviour is half
the proof.

**G4 is pinned as an identical timeline, not by inspection.** The test collects
every `toValue/duration/delay` for a `worth_a_call` and for a benign read, sorts
both, and asserts equality. "Same physics on every verdict" is the kind of claim
that decays under a later edit to one branch; a structural comparison notices, a
reviewer's eye does not.

## Judgment call flagged, not buried

§7 excludes "a re-analysis after an owner edit". Read literally, that is
suppression on `edited_at` — which is what shipped, and which means a plain
`Re-run analysis` with no prior edit *does* animate. The wider reading (any re-run
is silent) is a one-line change. Raised on the PR and on CUL-804 rather than
resolved silently, because both readings are defensible and only the PM's is
binding.

## Not folded in

Nothing new was discovered that needed its own issue. CUL-143 (auto-refresh when a
photo is added mid-session) and CUL-208 (a standing flag for `worth_a_call`) are
unchanged and still out of scope, as §8 says.
