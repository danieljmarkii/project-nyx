# CUL-94 — the intake-decline detectors read the owner's local day

**Date:** 2026-10-11
**One thing:** D3 L2 — A differential test: run the old and the new code side by side over many made-up records and count what each says that the other does not · check: pending

Shipped via #1181 (draft). Mode BUILD, Linear [CUL-94](https://linear.app/projectnyx/issue/CUL-94) (B-092), raised Low → High the night before by the October competitive brief's adversarial pass.

## The defect

Both intake-decline detectors had the same two flaws: the server's (`generate-signal/detection.ts`, detector ②) and the phone's mirror (`lib/analytics.ts`).

- **The baseline and the judged days didn't fit together.** The baseline was a raw `now − N×24h` cutoff, while the recent days were UTC calendar days. Every meal between 24h ago and the last UTC midnight was counted nowhere.
  - A New York cat lost its card at 20:00 EDT with nothing new logged.
  - A Pacific cat's previous-night dinner landed in "today's" UTC bucket and lifted a low day over the 2.0 cat ceiling, so it never fired.
- **The refusal check collapsed same-day re-logs by UTC day.** A bout across UTC midnight was half collapsed (the B-092 original).

## What shipped

- **Local days on both surfaces.**
  - The server reads `input.timezone`, falling back to UTC days when none is valid; it never silences the detector.
  - The phone reads the device zone.
  - A new optional `timeZone` input lets the tests pin the zone.
- **The judged days end at an anchor.** The anchor is today once today has a rated meal, else yesterday. This is PM ruling (a), given "go" in-session: the card holds overnight until the next rated meal.
- **The day before the judged days is read at every cut.** The baseline is tried with each prefix of that day's meals, and the accusing reading stands. Draft 1 used a clean partition and pass 1 broke it. Draft 2 read that day whole, in and out, and pass 2 broke it. See below.
- **The refusal check** collapses by local day.
- **The 14-day window edge stays raw.** A local-day edge only widens the window, and the extra older meals diluted a food's refusal history in the differential.
- **Tests:**
  - `lib/intakeDeclineLocalDay.test.ts` runs both real detectors over:
    - the comment's two runs;
    - the B-092 straddle;
    - the no-zone fallback;
    - both adversarial passes' counterexamples.
  - The parity suite now hands both sides a zone, with a non-vacuity floor on records the zone decides.
  - A property test: an evening refusal appended to the buffer day never removes the card. It reds on the whole-day reading.
  - The demo-story suite gained a profile-zone sweep.
  - The corpus and two free-fed-bowl expectations were updated, with the reason in each diff.

## How it was proven

- **Differential against the pre-CUL-94 detector.** Over 100,000 generated records (UTC days, both triggers), no card the old detector raised is lost, and 6,775 gain one, mostly from the overnight hold. Each draft was measured the same way:
  - draft 1: 13 to 17 losses;
  - draft 2: 2 losses;
  - shipped: 0.
- **Mutations.** Each of these turns tests red:
  - the phone ignoring the zone;
  - no carry;
  - either single reading of the buffer day;
  - the whole-day reading;
  - the refusal check on UTC days.
- **`adversarial-reviewer`, two passes (the cap).**
  - **Pass 1:** yesterday's refusals diluted the baseline once today had a rated meal. Four refusals then a "some" breakfast went silent, and harder refusal meant quieter.
  - **Pass 2:**
    - The whole-day reading still let one evening refusal after a good morning silence a cat on a marginal or thin baseline.
    - The raw window edge dropped a thin card at 21:00.
    - It found no new false-positive class.
  - Both are fixed and pinned. The window case is carried by the cuts, and its fixture documents it.

## Residuals, stated and filed

- [CUL-1796](https://linear.app/projectnyx/issue/CUL-1796) (LOUD): the overnight hold's card says "today" about yesterday.
- [CUL-1797](https://linear.app/projectnyx/issue/CUL-1797) (QUIET, and the old code had it too): a refusal day older than the buffer still dilutes the normal. Since CUL-94 a card shown at 06:00 can also be taken down by a still-low breakfast.
- [CUL-1790](https://linear.app/projectnyx/issue/CUL-1790) (QUIET): a bout across the owner's own midnight still splits.
- Not filed, stated in the PR (QUIET, low reachability): an owner whose profile zone never synced is read in New York days by the server (the column default) and in device days by the phone. The app stamps the zone into the profile on launch.

## Demo account

The seed writes a profile zone, so the live demo is now read in local days.

- Under the §8 seed-hour rule (no seed before 09:00 UTC), the intake card lasts 22–47h after a seed in every zone tested. Before, it lasted until the next UTC midnight, under an hour for a 23:30 seed.
- In a US zone, a seed between 00:00 and about 07:00 UTC now produces no card. The runbook's "or accept the clamp" escape is closed there.

Proposed Tier-2 edit, unwritten: `docs/nyx-demo-account-requirements.md`, the §3 timestamps note (line 141) and the §8 seed-hour rule (line 187).

## Personas

- **Data Scientist / Biostatistician:** the design, the differential and the property test.
- **Dr. Chen:** the overnight hold and the buffer-day onset shape.
- **QA:** the acceptance criteria from the newest comment.
- **Engineer:** the lock-step mirror and the deploy (no hold; `generate-signal` deploys on merge).
- **Designer:** N/A, no copy changed. CUL-1796 is the copy follow-up.
