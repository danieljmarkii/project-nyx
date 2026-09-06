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
server has actually been asked. The predicate became
`hasPhoto && (working || row?.status === 'pending')`, and the parameter is named
`awaitingRead` rather than `pending` so the next reader has to notice that the
stage's `pending` prop and the hook's question are different questions.

(The `hasPhoto` half came out again a few hours later, when the adversarial pass
showed it made the fact fall on a photo *removal* with no read having landed. What
survives is the `working` discriminator and the naming — see below.)

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
mutation did. Twenty-five tests here in the end, and every one that *can* be proven
by breaking the source was — fourteen mutations across the hook, the stage and the
sections, both directions of the fetch-vs-wait split on each section, and a real
haptics import dropped into the real tree for each guard registration. The two that
cannot be are named as such at the foot of this record.

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

## The adversarial pass returned FAIL, and four of the six were mine

Worth reading in full, because the two that generalise are not about animation.

**The empty tree was not harmless, and I had written that it was.** The hook's header
claimed a landing whose branch renders nothing would "settle in ~450ms with no
visual effect". False: `LayoutAnimation.configureNext` is a **global next-commit
config**, so beat 2 fired over an unrendered section applies its 370ms spring to
whatever else lays out in that commit — measured landing on the hero collapsing to
its empty state. I had reached for that claim to avoid duplicating the sections'
branch cascade, which was the right instinct and the wrong conclusion.

The fix is that the arrival now needs **two conditions, and each excludes a case
the other cannot see**: `awaitingRead` (the section's fact) excludes the fetch
frame; the **stage's own transition** — it was showing the pending box, it is now
showing content — excludes every question about which branch is rendering, which
is not a question the fact can answer. `hasPhoto` came out of the fact at the same
time: a photo removed mid-wait made it fall with nothing having landed.

**The rail was measuring the wrong box, and the G4 test was structurally blind to
it.** The rail's explicit height came from the wrapper holding the card *and* the
observations grid *and* the re-run row — while the rail is painted inside the
card, which clips. Block height is verdict-correlated (an escalation's facts never
fold, §5.3a), so an escalation's rail visibly lunged where a folded benign read's
crept: 0.92 of the card covered at t=20ms versus 0.60. G4 says the verdict changes
a colour and nothing else.

The G4 test could not see it because **both arms rendered identical children**, so
content height was held constant by construction, and the seed never appears in a
timing config. A same-timeline assertion is only as good as the inputs it varies.
The card now reports its own height, and a new test puts a tail below it and fires
the block's layout *first*, so the assertion cannot pass by ordering luck.

**Two more:** the edge moved to a `useLayoutEffect`, so the landed card can never be
committed unwrapped, unclipped and opaque for a frame before collapsing into the
spinner box — the worst frame this surface could show, on an escalation. And the
reduced-motion crossfade gained the safety valve the animated path already had,
because that is the accessibility path and an invisible read is least acceptable
there.

## The fix I tried that was worse than the bug

The pass also found that a blur landing *before* an arrival starts is never
settled, since the blur effect is edge-triggered. I gated `begin()` on `appActive`
— and the section tests went red, which is how I found that `AppState.currentState`
is `undefined` under jest **and can be `'unknown'` at iOS cold start**.

So the gate would have silently suppressed the first arrival after a cold launch:
log a vomit, navigate, and the moment never plays. That is a worse outcome than the
residual it fixed (beats running unseen while backgrounded, closed by the valve
within ~510ms and invisible throughout). The guard came out and the reason is in
the file: **`useAppActive()` is trustworthy as a transition and not as an initial
value.** The fold uses it as an edge too, which now reads as load-bearing rather
than incidental.

## Two things the suite cannot prove, said plainly

The `useLayoutEffect` change and the valve's `settle`-over-`goIdle` both survive
mutation — the tests stay green either way — and neither is a test I could write
honestly. `act()` flushes passive effects, so jest cannot distinguish effect
timing; and the idle tree binds none of the values a stalled beat would keep
driving, so no assertion through the public surface can see the difference. Both
changes are strictly more correct and are kept as such, marked in the code as
defence in depth rather than tested behaviour. The paint-order question is on the
manual QA script instead, where the reviewer put it: log a photographed vomit on a
throttled network and watch the frame the card lands.

## Filed, not folded in

- **CUL-830** — the arrival re-parents the read twice, resetting VoiceOver focus at
  the settle. New behaviour from this PR, but every fix trades against the §7
  no-node-when-idle proof this PR establishes, so it is a decision rather than a
  patch.
- **CUL-827** — commented rather than duplicated. The pass found two paths where a
  live `worth_a_call` does not merely blink out but is gone until the screen is
  rebuilt: `handleRetry`'s optimistic `'pending'` has no rollback when the trigger
  errors, and the watch's give-up leaves the same wedge. Both pre-existing, both
  reproduce before this track started, and both are covered by that issue's
  proposed shape — but only if its acceptance criteria name them.

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
