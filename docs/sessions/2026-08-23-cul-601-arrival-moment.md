# CUL-601 — the first-insight arrival moment (dawn sweep)

**Date:** 2026-08-23

Shipped via **#708** (draft). Aug. 2026 Design Polish, DP-3. Client-only: no schema, no
Edge Function, no flag.

## What it is

The design principles have always asked for one animation — *"building → real insight
should feel like something arrived"* — and it had never been built. Now it is, to §4 of
`docs/nyx-app-polish-requirements.md`, which the PM locked in mock round 2 ("perfect").

The first time a pet's Signal card goes from *"We're getting to know Biscuit — Day 6, 14
events so far"* to a real insight, a wash of light (teal into a breath of moment-gold)
crosses the card over ~900ms while the building rows dissolve into the first headline,
with one soft tap at 900ms. Then it never happens again for that pet.

## The finding that shaped the build

**Almost none of this diff is animation.** The moment itself is about forty lines of
`Animated`; everything else is the four rules that decide when it must *not* play, and
those rules are the feature:

- **Once per pet, ever** — `lib/signalArrival.ts`, an AsyncStorage marker cleared in
  `wipeLocalSession` (B-402). A sweep that replays is not an arrival, it is chrome, and
  §3 bans chrome that animates. This is why the marker is the feature rather than
  bookkeeping around it.
- **Never for a safety finding** — plainness is the severity signal (S1). The subtle
  half, and the one worth writing down: **the marker is spent anyway**. A pet whose
  first-ever finding is a concern has had its moment. Holding the sweep back for some
  later, cheerier finding would mean the one owner whose record opened badly is the one
  the app later congratulates.
- **Never on a load** — the trigger is an *observed settled* building → live transition
  for one pet. A cold mount that is already live is not an arrival; nothing arrived, the
  owner just opened the app. The settled state is `null` while the cache read is in
  flight, which is what stops a slow or offline first read (the B-734 skeleton timing out
  into a real building frame) minting the app's one sanctioned animation out of network
  weather.
- **Reduced motion** keeps the crossfade and the tap, drops the sweep — touch is not
  motion. The moment *finishes* rather than freezes on blur: an ambient loop pauses
  because it will still be wanted on return, but resuming a 1.2s celebration minutes
  later, attached to nothing, is worse than having missed it.

## Decisions taken in-session

**1. The safety gate is stricter than the spec's wording, deliberately.** §4 says *"if the
first-ever finding **leads** the safety band"*; the code withholds on **any** safety-class
finding in the set. Ranking is decided server-side, and a sweep over a card carrying a
concern anywhere is still decoration over concern. The asymmetry is the point: this
reading can only ever withhold the moment, never grant it, which is the direction a
severity rule is allowed to be wrong in.

**2. An eighth haptic verb, and the codebase's first `haptics-guard-ok` exemption.** None
of CUL-604's seven verbs fit — nothing was *committed* here; the owner did not act at all,
the engine finished thinking — and §5.6's own rule forbids a call site reaching past the
module for a raw constant. So `insightArrival()` was added.

`components/home/SignalZone.tsx` is on `guards/haptics.test.ts`'s `ALWAYS_SCANNED` list,
so the import fails the build without a reasoned exemption. That is **CUL-604 working as
designed, not being worked around** — its header anticipated this exact beat: *"the
arrival beat this rule governs would live in the component, which is what is scanned."*
The alternative (moving the call into an unscanned helper file) would have avoided the
exemption and defeated its purpose. The rule holds here *by gate* rather than by
intention — the arrival is unreachable whenever the set contains a safety finding — and a
test pins that rather than the comment claiming it.

**3. One storage key, not a key per pet.** §4 names `signal_arrival_played:<petId>`; the
marker is one JSON blob keyed by pet id. The reason is the wipe, not the write: a key
prefix makes `clearSignalArrival` a `getAllKeys()` scan-and-filter, and **a wipe that
scans is a wipe that can miss**. One key is one `removeItem`, which `lib/session.test.ts`
can assert by name, and it is the shape every sibling marker already uses (the Daily
Recap offer, the beta opt-ins, the trial heads-up ledger). Owner-visible behavior is
identical.

**4. Where the spec's anatomy and the shipped anatomy disagree.** §4's sequence was
written against the mock, which has two elements the shipped card does not:

- *"the rail turns live"* describes a card-edge rail. The shipped rails are on the
  **building** state's watching rows, and §4 also says "no new anatomy" — so 0ms is
  simply the frame swap, and nothing was added.
- The 1200ms beat is the lead card's sub-line, which lives **inside `InsightCard`**.
  Staggering it would mean threading an arrival-only opacity prop through a shared safety
  renderer for a once-ever 1.2s beat, so the beat lands on the stack's **secondary rows**
  instead — the same staged settle, one layer out.

Both are flagged in the PR for the PM to overrule if the sub-line beat matters.

## Two defects found by the work itself

**The tests caught a real React bug before the first push.** The obvious build of this
feature — raise an `arrivalDue` state, decide in a second effect — fails in a way review
would not catch: that second effect must clear its own trigger, which sits in its own
dependency list, so React tears it down one tick after it starts, **cancelling the
animation and clearing the 900ms haptic timer it had just set**. Three haptic assertions
failed and named it immediately. The fix restructures the hook so the decision runs inside
the transition effect, the "already spent" latch is a ref rather than state, and nothing
the effect writes can re-enter it. The volatile inputs (safety, reduced motion, active pet)
are read from refs at the instant the arrival starts, so a findings refresh mid-sweep
cannot re-run the effect and stop it.

**Self-review caught a second one.** Halting the animation on a pet change stopped the
sweep but left `playing` true, so the wash stayed mounted at whatever value it had
reached — the owner switches pets mid-arrival and lands on the next card to find a band of
light parked across it with nothing left running to finish it. The pet-change and unmount
paths are now separate effects, because they want different things: the switch clears the
flag (a card is still on screen and must stop showing the moment), the unmount does not
(nothing is left to render, and setting state there is a warning waiting to happen).

## What three reviews found

`code-reviewer` · `rls-privacy-reviewer` (the wipe path) · `pm-feature-review`. Everything
actionable that was not a judgement call is in the PR; four decisions went to the PM on
the issue.

**code-reviewer — ship-ready, two nits, both taken.** The stage no longer leaves a wrapper
node on the shipped non-arrival path, and `spentFor` is a `Set` rather than one slot so
two pets' in-flight marker reads cannot claim the same latch. It also independently
reproduced the pet-switch freeze already fixed above, and named the mechanism better than
that commit did: **a delayed `Animated.timing` never fires its `onEnd` on `.stop()`**,
because the underlying `Animation` object was never created — which is exactly why
`playing` could stick.

**rls-privacy-reviewer — PASS, one residual, closed in-PR.** It traced all three
`wipeLocalSession` callers (the `SIGNED_OUT` handler, the post-deletion fallback, the
recovery deep link), tried an account swap without `SIGNED_OUT`, and used a recovered pet
UUID against `pets`/`events`/`ai_signals` with a second account's JWT — all held; the
UUIDs are inert against RLS. Its one finding is the cost of the one-key shape, and it is
a good one: a blob makes the write a **read-modify-write**, and SignalZone fires it
un-awaited, so a wipe landing between the read and the write could restore the *whole*
previous account's map after `wipeLocalSession()` had returned clean — N markers where the
per-key shape's stale write could resurrect one. It could not construct a reachable
trigger, but that is a property of today's navigation, not of the module. Closed with the
idiom `lib/sync.ts` already ships for the identical failure (`signOutEpoch` / `stale()`),
kept module-local. The header's shape argument now says the key is chosen *despite* that
cost rather than in ignorance of it, and the test fails if the guard is removed.

**pm-feature-review — the one with real teeth.** `findingCount` was the *unfiltered*
`findings.length`, but `LiveStack` drops a `fewer_during_trial` trial_response on a
not-eating record (B-789). When that suppressed card is the **sole** finding — the known
CUL-527 residual — `displayState` still reads `live` and the stack renders **empty**. So
the moment swept a gold wash and played a success tap over a blank card, and burned that
pet's once-ever marker doing it. It is insight-class, so the safety gate never saw it.
**The one owner it would have fired for is the one whose cat is refusing food.** Fixed by
counting what *renders*: the suppression predicate moved out of `LiveStack` into
`visibleFindings`, shared by both callers — one predicate, never a second copy (the
diet-trial §5.3 lesson). The safety gate deliberately keeps reading the **full** set, so
suppression can never *unhide* the moment.

It also caught a 400ms window where the lead sits at opacity 0 under a still-opaque
outgoing frame, so a tap on what looked like a ghost watching row landed on the invisible
`InsightCard` and expanded it. The stage is now inert for the moment's 1.2s.

## The four decisions with the PM (posted on CUL-601)

**D1 is the one that matters, and it is a spec-level miss the build surfaced.** §4's
trigger is `building → live`, written against the mock's two-state model. The shipped app
has **three** empty states, and `deriveDisplayState` drops a pet out of `building` into
`no_pattern` at **≥8 events AND ≥7 days of span** — so the trigger window closes around
day 7, while the engine's own advertised floors are 6 timeable episodes and **2 full
weeks** (`watchingChangeRow`). The window in which the moment can fire closes about a week
before the window in which a first finding opens. The sharpest evidence that this is an
oversight rather than an intent: `NO_PATTERN_SUB` reads *"That isn't an all-clear — keep
logging, and the moment something clears it, it'll be here"* — the arrival's own pitch,
living on the one state that can never fire it. Recommended fix is one condition: trigger
on any settled **empty → live**, which (since `deriveDisplayState` returns `live` whenever
`findings.length > 0`) is exactly *0 findings → first finding*.

The other three: the Success tap firing over insight-class bad news (`more_during_trial`
is a vomiting escalation); the active-pet-only safety gate letting a celebration render
under another pet's `CrossPetSafetyBanner`; and the marker recording that the animation
*ran* rather than that anyone *saw* it (the regen is debounced 5s after a log, by which
time the owner is plausibly scrolled away or backgrounded).

## Known limit, left for the device pass

The Card's **height** still jumps at the transition (building frame → live card) before the
dissolve plays. That is today's behavior unchanged — the shipped app jumps with no
animation at all — and smoothing it means a measured, non-native-driver height animation
§4 does not ask for. If it reads badly on device it is a follow-up issue, not a fix to
fold into this PR.

## Filed out of this session

| Issue | What |
|---|---|
| **CUL-636** | The arrival has no VoiceOver announcement — a blind owner gets an unexplained success buzz. The `announceForAccessibility` pattern is already in this file for the ack line. |
| **CUL-637** | The card's height snaps before the dissolve. Not a regression (today's app snaps with no animation at all); gated on the device pass, since it may read fine. |
| **CUL-638** | A durable "this is your first insight" trace in copy rather than motion — which would also give CUL-636 something to say, and give the safety-bypass owner *something* instead of nothing. |
| **CUL-527** *(comment)* | Not closed, but one new consumer is now fenced. Noted that this failure mode has now had to be taught to two consumers independently, which is usually the signal to fix it at the source. |

## Files

| File | What |
|---|---|
| `lib/signalArrival.ts` *(new)* | The per-pet marker — read/mark/clear, with the corrupt-blob and read-failure directions argued at each site. |
| `lib/session.ts` | `clearSignalArrival()` into `wipeLocalSession` (B-402). |
| `components/home/SignalZone.tsx` | `useArrivalMoment` (the state machine), `ArrivalWash` (the gradient band), the crossfade stage, the staggered `LiveStack`. |
| `lib/haptics.ts` | `insightArrival()` — the eighth verb. |
| `hooks/useSignal.ts` | Exposes `petId`, so the marker is keyed on the same id the findings were derived from. |
| `constants/theme.ts` | `colorMomentGlowLight` — the moment-gold's tinted surface, not the amber *attention* wash. |

## Verification

`tsc --noEmit` clean · full jest suite green (254 suites / 5610 tests) ·
`guards/haptics.test.ts` green with the one reasoned exemption. The four ACs §4 names —
marker-once, safety bypass, wipe-path inclusion, reduced-motion static frame — each have
tests, plus the five things that are *not* arrivals (cold mount, slow read, pet switch,
empty set, unreadable marker) and the mid-arrival pet switch.
