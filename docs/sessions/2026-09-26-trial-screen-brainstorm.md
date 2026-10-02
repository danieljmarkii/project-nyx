# Should the diet trial get its own screen? The brainstorm

**Date:** 2026-09-26 · **Issue:** CUL-1291 (DISCOVERY) · **Outcome:** round-1 mock and six briefs, then the PM's rulings, the v1.1 spec, round 2 of the mock and the Linear project, shipped via #932

## The idea

The PM noticed that the Home trial strip opens the Pet tab, scrolled to the trial card, while the Design v2 Signal card opens a screen of its own. Should the trial get one too? The session convened the team and drew the answer.

## Prior art

This is the second pass at the idea. Draft PR #631 (2026-08-12) proposed T2, a read-only `/trial` room opened from the strip, and T3, a "For the recheck" section. Neither was ever ruled. On 2026-09-23 the backlog grooming marked #631 superseded because "T2 shipped as `app/insights/trial.tsx`". That is only half true: `/insights/trial` is a Patterns panel, and the strip still taps to the Pet tab. This round starts from today's app. Since August, these have shipped:

- the Signal screen
- trial window changes and Keep going
- Get ready
- History v2
- "The trial so far"

## Method

1. An Explore pass mapped every trial surface and door.
2. Five isolated reads, run in parallel, each on one shared brief (the idea, the surface map, the binding rules, the August proposal, what changed since):
   - Jordan
   - Sam
   - Dr. Chen with the Data Scientist
   - the Designer with the Mobile IA and Data Viz
   - Engineering with QA, the Product Owner and T&S
3. Every load-bearing claim was re-verified on `main` before it went on the page or into Linear.

## What every lens agreed

The verdict was yes, with conditions, from every lens.

- **A route.** It follows the Signal route's pattern: the pet comes from the link, never from `activePet` (C-9).
- **The Signal's physics, not its sections.** Copying the Signal screen's section order brings the mid-trial compare with it.
- **It computes nothing.** One resolver, `TrialFacts` and `computeTrialResponseCounts`. It withholds whatever the strip withholds.
- **Safety leads and replaces the top.** The order is the fact, the ask, the record, then the doors. Keep going hides while a refusal is live.
- **It only shows.** No write, no predicate. Logging stays on the FAB.
- **Start stays on the Pet tab.** §4.1 requires it. Also, `food-capture` exits with `router.dismissAll()`, which would pop a pushed screen and lose a half-filled form.
- **One home for the recheck: Get ready.** August's T3 retires.
- **Nothing about symptoms before CUL-1216.**
- **Motion.** The Signal's rise, no flight. The ledger draws in once.

## The sharpest arguments for it (verified)

- **Jordan.** The strip prints "Vomiting: 3 in the trial's 23 days · 11 in the 49 days before", and the card it opens carries no vomiting line.
- **Sam.** On a refusal the strip drops to its header by design, and `resolveTrialStrip` says the register is "one tap away on the Pet tab". That tap lands under the photo, weight chart, conditions and medications.

## Decision briefs (on the mock, §07)

| Brief | What it decides | Status |
|---|---|---|
| **D1** | The first frame: A, the trial leading with the ledger (Designer), or B, the shipped card on top (Engineering + Jordan) | Conflict |
| **D2** | The Pet tab keeps a one-row door (recommended) or the full card | Recommended |
| **D3** | Vomiting mid-trial | Conflict |
| **D4** | Its own flag and project, after the App Store cut (recommended), or ride `design_v2` | Recommended |
| **D5** | Get ready is the recheck's one home (recommended) | Recommended |
| **D6** | Vomiting when intake is unseen: Dr. Chen would keep a raw total on a refusal; the Data Scientist would withhold it (the shipped B-789 rule) | Conflict; routed to Dr. Chen with CUL-51 |

D3's shared floor is (a): Home's sentence plus a door to the Signal. On top of that, Dr. Chen argues for (b), weekly counts with no compare, and the Data Scientist for (c), one module-owned compare, gated, and withheld when a medication overlaps.

The mock also carries two better-than-the-rule briefs:

1. **§4.2's routing ruling (2026-07-25).** Amend the routing and the six-screen count; keep §4.1.
2. **The §05 chart standard's Sunday weeks (2026-09-19).** The ledger counts trial weeks instead.

## Found along the way

- **CUL-1292, filed High.** The widget's trial taps build `nyx:///profile?pet=<id>&src=widget` (`widgets/CulpritWidget.tsx:130-134, 545, 669`). The Pet tab reads only `focus` / `med` / `ts` (`app/(tabs)/profile.tsx:293`) and never calls `useWidgetPetLink`. So a multi-pet widget can open the wrong pet's profile. It is live today.
- **CUL-1216, commented.** Four findings:
  - The Signal screen's trial compare fires for any finding type once the trial passes `MIN_COMPARE_DAYS` (`lib/signalScreen.ts:392`), not only for `trial_response`.
  - Its baseline grows with the trial, where the strip's is a fixed 49 days.
  - It counts looks as logged days.
  - A symptom-logging-fatigue plus antiemetic record gets past the strip's own `densityComparable` gate.

  The proposed rule, TR-9: the gate travels with the number.
- **CUL-1293, filed Low.** Jordan's idea: send "What {pet} can eat" to the household. Food names only.
- **CUL-1294, filed Medium.** A shared bowl can hide a refusal. The other cat empties it, the owner logs "ate it all", and `liveRefusal` stands down.
- **PR #631.** This round supersedes its T2 and T3. The recommendation is to close it once the PM rules, keeping its research brief.

## Engineering's sequence, if the PM says go

1. A `petId` parameter on every trial hook and list screen (`useDietTrial` and the three trial routes read the active pet today).
2. The lifecycle sheets extracted from `profile.tsx` into one shared host.
3. The flag seed.
4. The route `app/trial/[pet].tsx`: the gate in the route, the drawing in its own namespace, and a flag-off answer that points to the Pet tab.
5. The senders: the strip, the Day Summary recap, and the widget via the app side.

After that, one PR per section. QA's standing risk is C-12: a read that hasn't answered must never print "No trial running" (CUL-400 is that defect on the list screens today).

## Artifacts

- **Mock:** `docs/culprit-trial-screen-mockups.html`, round 1, published at https://claude.ai/artifact/5AHCdRG9jXj2q48vC2o6cA. It was generated by one script so the ledgers agree across frames. Its fixture: Mochi (dog), a rabbit trial from Sep 4 to Oct 29, day 23; Pixel (cat), a duck trial from Sep 22.
- **Linear:** CUL-1291 (the discovery, carrying the briefs), CUL-1292, CUL-1293, CUL-1294, and the comment on CUL-1216.

## Personas

Designer ✓ (Principles 3 and 5; the S1 plainness of the safety face) · Mobile IA ✓ · Data Viz ✓ · Engineering ✓ · QA ✓ · Product Owner ✓ · T&S ✓ (no new data exposure, ids only in the route, no share in v1) · Dr. Chen ✓ · Data Scientist ✓ · Jordan ✓ · Sam ✓.

The adversarial line is N/A: no logic changed. The clinical counterexamples each lens tried are recorded on CUL-1216 and in §07 of the mock.

## The PM's reactions and the finalization (same day)

**The PM ruled three things on round 1:**

- **R-1:** option A. The trial leads, with its day ledger; "the card promoted feels a bit redundant to show the card twice".
- **R-2:** the strip becomes the door, "especially the this week's lane data vis".
- **R-3:** the Pet tab keeps "just a door to a diet trial".

The PM deferred the rest to the team, so the team settled it on the record (spec §0.2):

- **T-1:** vomiting in v1 is Home's sentence only. The Dr. Chen / Data Scientist dissent moves to CUL-1308.
- **T-2:** its own `trial_screen` flag and project, with the owner-visible steps after the App Store submission cut.
- **T-3:** Get ready is the recheck's home.
- **T-4:** a presence-only vomiting count on the refusal face.
- **T-5:** the parent spec's §4.2 routing is amended, and §4.1 is kept.
- **T-6:** the ledger counts trial weeks.

**The spec:** `docs/nyx-trial-screen-requirements.md` was written as v1.0 and sent to the `adversarial-reviewer` before any build. **It failed on seven findings**, and every one was verified on `main` and fixed in v1.1 (spec §12). The two that mattered most:

- **This week's lane would have drawn seven filled marks over a cat refusing her diet from day 1.** On a refusal the strip still prints its line; only an intake decline makes it header-only.
- ***Stopped early* on the refusal face would have dropped the feline "needs a call today" while she still wasn't eating.** Its "wouldn't eat it" reason moves the trial to `abandoned`.

The other five:

- the screen printed a coverage ratio the strip withholds after a stood-down refusal
- the ledger missed treat-only exposures
- *For the call* restated "refused", "meals" and a date the fact doesn't hold, in banned volitional wording
- the milestone drew a full grid beside the stop decision
- the vomiting line gained a heading it hadn't earned

**A correction to this record's round-1 half.** Frame §01c and the "sharpest arguments" above say the strip drops to its header on a refusal. It drops its coverage and vomiting lines; only an intake decline leaves the header alone. Round 2's §01c is redrawn accordingly.

**What changed in the repo and in Linear:**

- **Mock:** round 2 republished to the same URL as one proposal. Frame B, vomiting options (b) and (c), and the full-card Pet tab left the page (commit 5ad2cfb keeps them). The masthead maps each reaction to what moved.
- **Parent spec:** `docs/nyx-diet-trial-requirements.md` §4.2 carries two ⚠ RULED 2026-09-26 pointers.
- **CLAUDE.md:** the diet-trial Read-These row routes to the new spec. It was paid for inside the size budget by removing the check-in measurement sentence, whose account lives in `docs/sessions/README.md`.
- **Linear:** the project **Diet trial — its own screen** has four milestones and twelve run-order issues, CUL-1296 → CUL-1307, each with a paste-ready kickoff prompt. There are three follow-ups: CUL-1308 (F1, vomiting beyond Home's sentence), CUL-1309 (F2, fold "The trial so far" in) and CUL-1310 (F3, the free-fed pair). CUL-1291, CUL-1292, CUL-1293, CUL-380 and CUL-335 moved in.

