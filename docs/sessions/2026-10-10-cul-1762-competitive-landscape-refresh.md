# Competitive landscape refresh, October 2026 (docs-only)

**Date:** 2026-10-10 (verification and close-out 2026-10-11)
**One thing:** P5 L1 — Pricing and value: a bounded job invites a bounded price · check: pending
**One thing (re-ask):** D2 L1 — Types: a function can only use what it is handed (from 2026-10-10, run-open PR-09) · check: pending

DISCOVERY mode for [CUL-1762](https://linear.app/projectnyx/issue/CUL-1762). Deliverable: `docs/culprit-competitive-landscape-2026-10.md`, a frozen, dated brief that supersedes the July read, published as an Artifact for phone reading. No app code, no schema, no deploys. Shipped via #1178.

## How it ran

- **Step 0.** Filed [CUL-1762](https://linear.app/projectnyx/issue/CUL-1762) (no project, `Area: Docs`) and claimed it per CLAUDE.md.
- **Step 1.** Read the July brief, the June refresh, the frozen v1.0, the July and [CUL-671](https://linear.app/projectnyx/issue/CUL-671) session records, and the feature-scoped briefs since July.
- **Pinned facts first.** Live `app_config`, the deployed Edge Function list and the build-state records were pinned in the main session before any agent ran, so all twelve started from one fact sheet.
- **One workflow, 25 agents.** It ran about 4.7 hours:
  - 4 code audits that treated every doc as unreliable;
  - 8 market sweeps under the 90-day evidence rule;
  - an adversarial verifier per report;
  - a completeness critic.
- **Verifier tally:** 171 confirmed, 93 narrowed, 19 refuted (all market claims), 9 unverifiable.
- **Main session verification.** Every load-bearing claim was then re-checked by hand: deployed versions, aggregate counts, file:line for each code claim, 24 App Store records re-fetched, second targeted searches for every "nobody does X" claim, and the cited studies and stats.
- **Adversarial review (one pass).** The `adversarial-reviewer` ran over the head-to-head and "where we win", told to falsify our differentiation claims. It returned **FAIL**: four claims broke or overstated against our own shipped code, not against rivals. Every finding was re-checked by hand at file:line, and the cat-intake probe was re-run before anything went in. Details are in the brief's §17 and on [CUL-1762](https://linear.app/projectnyx/issue/CUL-1762).
  - **Broken:** "cats on one low day". The cat path judges the UTC day, so a New York cat's card drops at 20:30 EDT ([CUL-94](https://linear.app/projectnyx/issue/CUL-94), raised to High).
  - **Broken:** "a quiet day is never read as a clean one". The report's weekly chart prints a measured 0 for a week with one logged meal-day ([CUL-1779](https://linear.app/projectnyx/issue/CUL-1779)). Home's bare end date reads as "nothing off-diet" at 50% coverage ([CUL-1780](https://linear.app/projectnyx/issue/CUL-1780)).
  - **Narrowed:** "no generated prose", "every protein on the panel", the photo posture, Matrix A's association cell, the scorecard framing (18 of 42 false food cards), and §10.2's timing line.
- **Published.** https://claude.ai/artifact/2MSRTqZ3dfkcqW2CPq4xvn (version 2 carries the review).

## What the brief says

- **Distribution is the finding.** We are not on the App Store and never submitted. The newest binary is an internal 1.2.0 TestFlight cut of 2026-08-29, with about 420 commits since. Live use is one human household. Every rival in the matrices passes our evidence rule; we do not.
- **The wedge's object layer filled in.** PawTrial (iOS, dog elimination-trial object, 0 ratings), ThePawcess (web, $39 per trial, AI-generated report), and the Tend & Mend and PawSolids bounded programs each hold part of it. Nobody holds the whole loop.
- **"Find the food" is the most crowded claim, and our weakest measured layer.** Owner food cards are the untested Early tier. Our own synthetic scorecard (a 3-seed drift report) is unflattering on the food lane. Digestly, a free human app, states and publishes a stricter design than any pet app.
- **What holds** (§7, ranked):
  - coverage honesty;
  - a free report with no generated prose and only corrected food findings;
  - single-photo reads that cannot reassure;
  - a single refusal routed to a safety card (cats on one day);
  - independence, now with an FDA warning-letter reason.
- **App Store search will not bring the wedge user.** Apple suggests nothing for any wedge term; web demand is vet-handout shaped and says "food trial".
- **The LLM substitute is roughly flat:** ~55–60% acute, about a quarter over a trial. Pulse is retired; free-tier scheduled tasks are unconfirmed.
- **July trip-wires mostly quiet.** Wonderdog fired. Furbo and Petcube already ship passive vomit alerts. Clinic AI summarizers now read attached PDFs.

## Decisions made

None by this session. Eight calls went to the PM as one round, **[CUL-1768](https://linear.app/projectnyx/issue/CUL-1768)**:

- D1: the positioning lead, a persona conflict with no team recommendation;
- D2: subtitle and description edits;
- D3: an Apple Search Ads popularity check;
- D4: multi-pet free forever vs D-M8;
- D5: a real vet reads the report before submission;
- D6: no vet portal yet;
- D7: bounded pricing deferred to Track 3;
- D8: a hands-on rival pass.

Plus ratification of the brief's §14 Tier-2 edits.

## Persona flags

- **Data Scientist vs Designer / Product Owner:** whether to lead with food findings while owner cards are the untested tier (D1, Conflict Protocol in §12).
- **Trust & Safety:**
  - the live privacy policy says symptom photos go to AI "when you request a read"; the code auto-fires on log, and Ask is not listed ([CUL-1769](https://linear.app/projectnyx/issue/CUL-1769));
  - the repo is public, so this brief is public on merge (comment on [CUL-1491](https://linear.app/projectnyx/issue/CUL-1491); security specifics kept out of the brief).
- **Dr. Chen:** no real veterinarian has read the report; the paid review was cancelled; [CUL-598](https://linear.app/projectnyx/issue/CUL-598) is the cheapest fix (D5).
- **Data Scientist (from the adversarial pass):** two of our own safety and honesty surfaces err quiet. These are the cat intake card's UTC day ([CUL-94](https://linear.app/projectnyx/issue/CUL-94), now High) and the report's weekly zero ([CUL-1779](https://linear.app/projectnyx/issue/CUL-1779)). The Home card's 50% gate ([CUL-1780](https://linear.app/projectnyx/issue/CUL-1780)) is a clinical threshold call for Dr. Chen and the Designer. Not a PM decision, so it is not on the PM queue.

## Filed

- **Decision round:** [CUL-1768](https://linear.app/projectnyx/issue/CUL-1768).
- **Follow-ups:**

  | Issue | What it covers |
  |---|---|
  | [CUL-1769](https://linear.app/projectnyx/issue/CUL-1769) | Privacy policy vs the code |
  | [CUL-1770](https://linear.app/projectnyx/issue/CUL-1770) | Reintroduction phase |
  | [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771) | Clinic-summarizer round-trip |
  | [CUL-1772](https://linear.app/projectnyx/issue/CUL-1772) | Vet-handout distribution experiment |
  | [CUL-1773](https://linear.app/projectnyx/issue/CUL-1773) | Ask and the off-diet predicate |
  | [CUL-1774](https://linear.app/projectnyx/issue/CUL-1774) | Burden card vs pre-1.2.0 builds |
  | [CUL-1775](https://linear.app/projectnyx/issue/CUL-1775) | Listing copy pass |
  | [CUL-1776](https://linear.app/projectnyx/issue/CUL-1776) | Frozen-brief corrections |
  | [CUL-1777](https://linear.app/projectnyx/issue/CUL-1777) | Hands-on rival pass |
  | [CUL-1778](https://linear.app/projectnyx/issue/CUL-1778) | IntakeQuestion test reds CI between midnight and 1 AM (found when this PR's CI ran at 00:30 UTC). **Fixed in this PR at the PM's request** after it also reddened the zone job at 11:05 UTC and blocked the merge: the suite's clock is pinned to local noon, the heading asserted exactly. |
  | [CUL-1779](https://linear.app/projectnyx/issue/CUL-1779) | Vet report's weekly off-diet chart prints a measured 0 for a week with one logged meal-day (adversarial pass) |
  | [CUL-1780](https://linear.app/projectnyx/issue/CUL-1780) | Home trial card's bare end date reads as "nothing off-diet" at 50% coverage (adversarial pass; a clinical threshold call) |


- **Comments on existing issues:**
  - [CUL-1370](https://linear.app/projectnyx/issue/CUL-1370): an L4-alone frame hides the watching row.
  - [CUL-559](https://linear.app/projectnyx/issue/CUL-559): the 08-29 build number is unrecorded; the runbook line is stale.
  - [CUL-1491](https://linear.app/projectnyx/issue/CUL-1491): the brief is public; the ruleset looks inactive.
  - [CUL-740](https://linear.app/projectnyx/issue/CUL-740): PetLog is resolved by text; option B is superseded.
  - [CUL-877](https://linear.app/projectnyx/issue/CUL-877): the trip-wire list.
  - [CUL-231](https://linear.app/projectnyx/issue/CUL-231): Vet Files never purges deleted files.
  - [CUL-598](https://linear.app/projectnyx/issue/CUL-598): D5.
  - [CUL-173](https://linear.app/projectnyx/issue/CUL-173): the listing section.

## The CI fix that rode along

The PM asked for the merge (`/wrap and merge`), and the head went red on `App (jest, non-UTC timezones)`: the same IntakeQuestion test, under Pacific/Chatham at 00:54 local. Rather than spend a second re-run, the PM asked for the fix, so [CUL-1778](https://linear.app/projectnyx/issue/CUL-1778) rides in this PR. The test now pins only `Date` to local noon on 2026-10-08 (the house pattern from `hooks/useEvents.test.ts`), builds its vomit from the pinned instant, and asserts the heading exactly ("since 11 AM yesterday"). The original was shown failing under Pacific/Tongatapu at 00:27 local and the fix passing in seven zones, then an adversarial review and an hour-of-day sweep across the CI zones ran before the push (outcome on the issue).

## Lessons

- **A "where we win" table has to be falsified against our own code, not only against rivals.**
  - The first draft's counterexample column tested rivals only. The adversarial pass broke three rows on our own shipped code. All three erred quiet: a cat's safety card lost every US evening, and a vet report reading thin logging as clean.
  - The main-session re-check had verified each claim's file:line, but it read the code as written, not under an adversarial input. Executing the detector with a timezone-shifted cat is what found it.
  - A competitive brief is now also a cheap audit of our own invariants.
- **Re-verify at use, again.** PetLog shipped v2.3.0 on the day it was re-checked. Every one of the eight market verifiers found an entrant its report missed. The sweep is not saturated, and the brief says so.
- **A shared per-turn search budget is a real constraint.** It ran out mid-workflow, so four verifiers worked with store APIs and direct fetches only. The main session re-ran the second searches itself. Budget searches per agent, and keep the main session's own budget for verification.
- **Linear auto-links "#N" tokens to PRs in other repos.** Two issue descriptions linked unrelated PRs until rewritten. Write "item 4", not "#4", in Linear text.

## Documentation updates

- **CLAUDE.md:** none. The off-diet-predicate divergence is a rule question, filed as [CUL-1773](https://linear.app/projectnyx/issue/CUL-1773) rather than edited.
- **STATUS.md:** untouched; no track started or ended.
- **Tier-2:** seven proposed edits in the brief's §14, awaiting ratification on [CUL-1768](https://linear.app/projectnyx/issue/CUL-1768). Execution is filed as [CUL-1775](https://linear.app/projectnyx/issue/CUL-1775) and [CUL-1776](https://linear.app/projectnyx/issue/CUL-1776).
