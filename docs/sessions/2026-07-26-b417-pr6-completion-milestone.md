# B-417 PR 6 — the completion milestone, and the moment an owner decides whether to stop

**Date:** 2026-07-26
**Outcome:** shipped via #481
**Track:** Diet trial lifecycle (B-417) — the last of seven PRs

---

## What shipped

The milestone card state had a placeholder action — `Tell Culprit what's next` — that opened
nothing. This built what it opens.

- **`lib/dietTrialCompletion.ts`** (new, pure) — the three-way decision row, the extension
  arithmetic, the six stop reasons, the outcome-sheet model and the C5 density line.
- **`lib/dietTrialOutcomeFacts.ts`** (new) — the before/during symptom + meal-day read.
- **`components/profile/TrialCompletionSheet.tsx`** (new) — the outcome sheet, the
  stopped-early sheet, and the decision step the overrun card opens.
- **`lib/dietTrialCard.ts`** — milestone state 5 gains the three-way action row; the model's
  `action` becomes `actions[]` with an `emphasis` field; `indication` and `dayLineRole` added.
- **`lib/dietTrialSetup.ts`** — `extendTrial` (net new); `endActiveTrial` gains
  `outcome` / `outcome_notes`; `stopReasonOptions` delegates to §4.3's six.
- **`lib/dietTrialFacts.ts`** — selects `indication`; loads ended trials inside a 14-day grace;
  coverage and free-fed windows clipped at `ended_at`.

No schema. Migration 040 already shipped `outcome`, `outcome_notes`, `stopped_reason` and
`ended_at`; this is the first thing to write three of them.

## The clinical shape, and why it is shaped that way

§4.3's first requirement is not a copy note, it is the risk: **the milestone must never read as
permission to stop the diet.** On the GI default that is live harm — ACVIM 2026 says continue
≥12 weeks before transitioning away, so a day-28 "trial complete" tells an owner to stop a diet
their vet wanted continued for three months.

Three constructions carry it. **No completion vocabulary**, enforced by a source scan over
*prose* literals only — the module's own `'complete'` / `'stopped_early'` tokens are database
values a clinician never sees, and scanning every literal would have forced someone to weaken
the pattern later, which is how a guard stops guarding. **`Keep going` is never the weaker
option** and arrives with a named default (+28d skin, +14d GI), with weight declared on the
model rather than in a StyleSheet, because §4.3 makes relative weight an acceptance criterion
and a criterion asserted on a StyleSheet is asserted on nothing. **Action first, verdict
second** — the milestone card carries no fact lines and never asks how it went, because a
milestone that asks first turns an unanswered card into a stalled trial, and a stalled trial is
what the vet report renders as still ongoing.

`nextTargetDays` extends from `max(currentTarget, dayCounter)`. At the milestone the two are
equal; in overrun — which is what renders while the milestone is ignored — an owner on day 61
of a 56-day trial gets 89, not 84. Under-delivering on the one button that keeps a diet going
is the wrong direction to be sloppy in.

The C5 density line is the **meal series only, before vs during, with no verdict**. This was
not re-derived: `generate-report`'s `TrialLoggingDensity` records both failed denominators from
PR 7's four attempts. Two deliberate divergences from the report's version, both because this
is the owner's screen: before/during rather than half/half (it has to cover the stretches the
counts compare), and no 14-day floor (§4.3 makes the line mandatory, and two ratios with no
verdict cannot be made false by a short window).

## Two decisions the spec left to this PR

- **An ended trial keeps its card slot for 14 days.** PR 4 deferred this explicitly. The number
  is borrowed from `selectReportTrial`'s `endedGraceDays` so the card and the report agree about
  whether a trial is still the subject. Zero days was the tempting default and is wrong: state
  7a exists to carry "Open vet report" at the moment the report is most valuable, and dropping
  to state 0 would remove that action in the same tap that created the thing worth reporting.
- **`indication` is now selected for the card.** PR 4's note said it should not be — right about
  the principle, now wrong about the need, since the GI sentence and the extension default both
  key on it. The constraint still binds where it was written: it stays out of the App Group /
  widget projection, which crosses a process boundary and renders only a day counter.

## Both mandatory reviews failed the first cut, and both were right

`adversarial-reviewer`: **FAIL**. `pm-feature-review` (as Jordan): **NEEDS-WORK** on three of
four flows. Seven findings, fixed in `9e0c653`.

**The headline was mine and UTC hid it.** `lib/dietTrialOutcomeFacts.ts` inverted
`localDayIndexOf` — a UTC-anchored index of a *local* calendar day — using `toLocalDayKey`,
which reads local getters. At every negative offset that lands a day early, and the damage was
**not symmetric**: the before-window ran a day long against a 56-day denominator while the
during-window **lost today**, the day the owner is deciding. Both errors push the same way,
*before* up and *during* down, i.e. toward "it improved", on the one screen where an owner
decides whether to stop a medical intervention. Worst case, a trial started today: the
membership test became unsatisfiable and every during-count rendered a hard 0, so three vomits
today read as `Vomit: 4 before · 0 during`. The module's own test failed under
`TZ=America/Los_Angeles`; I had only ever run it in UTC.

B-421 exists because this feature already grew three disagreeing day-math paths. PR 6 quietly
added a fourth and pinned it at no offset at all. It is now inverted through UTC and pinned at
UTC−7, UTC+13 and UTC+5:30 — and the *first* cut of those tests repeated the same confusion in
miniature (a `T12:00:00Z` fixture is already the next local day in Auckland, so it failed
against correct code), which is recorded in the test file.

The other six:

| Finding | Why it mattered |
|---|---|
| **Every card button disabled.** `busyAction !== null` with an optional prop — `undefined !== null` read true everywhere the prop isn't passed, killing `Start a diet trial` on the empty state. | Caught by the existing entry-point test. |
| **Three of six stop reasons reached the owner *and the vet* as raw tokens** — `"Stopped because too_hard."`, `"Stopped: too_hard."` | The verbatim fallback is a good failure mode for a token nobody has got to yet and a terrible one for a token the same PR introduced. Both maps now carry all six. |
| **The density line contradicted the line above it** — *"nothing to compare these with"* then *"0 of 56 days before"*. | The fabricated comparison `beforeTracked` exists to prevent, rendered by the one line that never consulted it. The guard test scanned `factLines` only; it now scans every string. |
| **`beforeTracked` was all-or-nothing**, so an install-during-a-flare window (4 observable days in 56, at the attention *and* symptom peak) rendered as "the 8 weeks before it started". | Observability is now a count and a sparse stretch is named as sparse. Measure and disclose, as C5 and §7 do; no floor invented — §5.2 leaves that to PR 5. |
| **The milestone lost every affordance under an intake-decline flag**, so a trial that reached its window could not be ended on the sickest patient the feature has. | §4.3's "never expires" silently failed and §7 rendered a stopped intervention as ongoing. §5.2 says the flag replaces the *adherence line*; the decision is a different thing. |
| **The sheet that ends the intervention dropped the "needs a call today" line.** | The card carries it; the terminal screen said only that the numbers were hidden. Now present and species-aware. |

Two more both reviews reached independently: **"Meals logged" meant two different things two
taps apart** (treat-excluded on the card per §5.1, treat-included on the sheet, the sheet's
systematically larger — so the collision read as the record improving between screens; the
sheet's series is now "Days you logged any food"), and **no continuation statement survived the
decision** (§4.3 is a property of the *flow*, and a GI owner saw the ACVIM sentence once on the
card, then read the sheet that ends the trial with nothing).

Design-lock conformance from the PM pass: the milestone's day line was rendering through the
same caption style as an ordinary Tuesday — the smallest thing on the card, under the food
label — and now renders as the lock's serif headline; and the milestone drops its progress bar,
because a bar pinned at 100% is completion vocabulary drawn in pixels directly above copy
working to avoid saying "complete" (`completedCard` already makes this argument one state
along).

## Falsification attempts that held

From the second adversarial pass, and worth keeping because they are the load-bearing ones:
`nextTargetDays` is strictly greater than the day counter across milestone, overrun, NaN,
fractional and repeat-extension inputs. A refusal-ended trial cannot acquire an owner verdict —
tried a server-written row with `status='abandoned', outcome='improved'` and it never rendered.
Neither denominator `TrialLoggingDensity` rejected was reintroduced, and no verdict was
smuggled back in. The 14-day grace does not let a stale ended trial shadow a new one, and
`sheetTrial` is null unless the trial is active, so neither sheet can touch a ghost.

## The re-run, and the two it caught

The DoD's adversarial line was not satisfiable on the strength of my own fixes — the reviewer
had failed this PR once, and the fixes were themselves new clinically-load-bearing logic. The
re-run cleared all seven (52,608 instants × 9 zones on the day-key round trip, 0 failures; the
previous headline case now counts today at every offset; `nextTargetDays` held against 13
adversarial inputs) and failed the PR on two new ones.

**F1 — the SQL lower bound was never padded, under a comment saying it was.** Only the end was.
`${key}T00:00:00Z` is UTC midnight, so at a *positive* offset local midnight of that date is
**earlier** in UTC — 12 hours in Auckland, 5.5 in Kolkata — and the query dropped the front of
the before-stretch's first local day. A single 06:00 pre-trial log vanished and the sheet
rendered *"Nothing was logged in the 4 weeks before the trial started"*: false, and the exact
fabricated negative claim §5.2's S3 rule forbids, landing on the thin-record population
`beforeLoggedDays` exists to protect. The same defect sat in `readCoverage` with the same
misleading comment — fixed as a pattern rather than shipped a third time.

The tests could not have caught it: a mock that returns the whole fixture regardless of the
bounds exercises the query window at zero offsets. Three tests now assert on the bounds
themselves.

**F2 — the continuation statement reached the sheet and stopped there.** The fix commit's own
rationale was that the screens read *while* and *after* ending a GI trial are the ones that most
need it; only the first was true. The terminal card said nothing about continuing, and the
abandoned card rendered `symptoms_resolved` — an owner stopping *because* things improved —
back at them unanswered. It now lands on both, skipping `vet_advised` alone, because restating
"your vet decides when the diet changes" to an owner whose vet has already decided reads as
second-guessing the clinician; it renders on every other reason so its presence is never a tell.

Three should-fixes from the same pass: the decision step was the one screen offering the
*primary* action without the decline lead (F3); `render.ts` named the owner as the cause of a
stop, as an inability, on a page shown to the owner in-app (F5); and the decline replacement
drew a 100% bar over a pet that has stopped eating (F6). Residuals filed: **B-516** (the sparse
threshold leaks just above its trigger), **B-517** (the day-math guard's `CONSUMERS` list still
doesn't cover this file, so nothing stops a fifth path), **B-518** (two similar-sounding day
ratios with different numerators).

Both PM-routed items came back **not merge-blocking**, with the cadence one quantified for
Dr. Chen: five stop-button exposures on GI before ACVIM's 12 weeks against skin's two, a number
that appears nowhere in the spec. The reviewer would **close** the refusal-routing item rather
than leave it open — §6.5 explicitly authorises the two-path split, it is built accordingly and
documented honestly, and `render.ts` does read the token.

## Named, not fixed

`adversarial-reviewer` could not construct a fair test of whether the outcome sheet's counts are
pseudoreplication-safe — one symptom bout logged three times inflates whichever side it falls
on. PR 6 counts raw events with no episode collapse and the spec does not ask it to, so this is
not a break; filed as **B-515** so nobody records it as reviewed.

Three pre-existing test fixtures fail outside UTC (`lib/analytics.test.ts`,
`lib/widgetSnapshot.test.ts`, `lib/widgetResolution.test.ts`) in modules this branch never
touches. B-421's own explicit-zone tests all pass, so these are fragile fixtures rather than
production bugs — but CI runs UTC only, which is precisely why PR 6's real inversion got as far
as it did. Filed as **B-514**.

## The release-ordering constraint

§11: PR 6 must not ship before PR 7, because every report surface gates on `status='active'` and
completing a trial would delete it from the report — *"the most valuable report this feature
produces would be the one it destroys."*

PR 7 is on `main` (#467), so the gate is satisfied **at the code level**. It is not satisfied at
the deploy level: `generate-report` is still deployed at **v13 (Jul 18)** and deliberately held
behind **B-494**. On that deployed function the `status='active'` gate is live.

**Merge freely; do not cut a build carrying PR 6 until `generate-report` is redeployed.**

## Reviews

`adversarial-reviewer` (twice — FAIL, then a re-run against the fixes) · `pm-feature-review` as
Jordan (NEEDS-WORK, findings applied) · `nyx-voice` (one fix: a generic *"a pet turning food
down"* renamed to the pet, Pattern 1) · `clinical-guardrails` (Pattern 6's absence-of-log guard
is `beforeTracked`/`beforeLoggedDays`; Pattern 8's never-reassure invariant added as a test
assertion rather than left as a comment).
