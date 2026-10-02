# Engines v3: no zero beside a masking drug or a recent visit (CUL-1440)

**Date:** 2026-10-02
**One thing (re-ask):** G1 L1 — A commit is a saved snapshot · check: pending
**One thing:** G2 L1 — A branch is a movable label on the chain · check: pending

Shipped via #994. It gates turning `engines_v3_en10` on for any account (PM ruling, 2026-09-30).

## What happened

- **The six counterexamples were reproduced at file:line before any design work:** the weekly bars, the drawn compare, the trial standing line, the phone script dates, the chronicity compare and the lane order. The file:line list is on CUL-1440.
- **Mock round 4** (`docs/culprit-engines-v3-mockups.html` §00, the same artifact URL) drew each surface as it is today and as proposed, with four briefs.
- **The PM's reactions:** loved the grey boxes; asked why the app assumes what was given at a visit rather than asking; found the text-only compare "incredibly uninspiring"; liked 00c and 00d; asked "why hide it?" on the lanes; and found "With your vet" unclear.
- **Round 5 republished as one proposal.** The ledger maps each reaction to what moved on the page. The PM then deferred to the recommendations.
- **Rulings:**
  - **D1** — hatch the masked weeks; drop only a zero's numeral.
  - **D2** — charts keep their marks; a comparing sentence goes quiet on any fall; a rise always shows.
  - **D3** — the course line says what the drug can hide, and the phone script gains "On board" / "Last visit" rows.
  - **D4** — the lanes split at each intervention.
  - **D5** — ask what was given at the visit (filed as CUL-1446); keep the assumption until it is answered.
  - **D6** — "Your vet knows" plus one line on what it does (PR-35's build).

## What was built

- **`lib/maskingSpans.ts`.** The drug table, course placement and span rule, lifted out of `generate-signal/careContext.ts` so the server and the app share one rule.
- **D3 server copy.** The course line drops "Started n days ago"; every masking course line ends "It can hide {sign}." ("may" for a name the table cannot resolve).
- **`lib/screenMasking.ts`.** The client predicate, gated on the Signal row's `engine_flags` stamp (flag-off is byte-identical). It reads local courses and every visit day. A failed read masks every window.
- **Charts.** `MaskHatch`, plus masked states in `WeeklyBars`, `CompareBars` and `TimingLanes` (the hatch, no zero numeral, a caption, and a spoken label). There is also the three-lane split.
- **Sentences.**
  - The trial sentence is masked on the Signal screen and in Get ready's recheck.
  - A finding whose own sentence compares a masked window (a trial pair, a falling reflection, the stood-down line) is set aside on the Signal screen and dropped from Get ready.
  - A rise over a masked baseline zero keeps its count on both surfaces.
- **Phone script.**
  - The rows name each span.
  - The comparing row is withheld on a fall or a zero.
  - When a rise sits over a masked zero, the row keeps the recent count only.

## The adversarial passes

The `adversarial-reviewer` ran four times; the last pass was clean. What it caught along the way:

- The quoted finding sentences: the trial pair, a falling reflection and the stood-down line.
- Only the last visit counted as a span.
- Worsening windows at half width.
- The gallery's "0 in these 5 weeks" and the spoken zero total.
- A stale cache placed from today instead of from `generated_at`.
- A rise hidden behind "fewer" copy.
- Get ready dropping a rise.

Each one is now a test, and the anchor fix was proven by mutation.

## Filed, not fixed here

- CUL-1443 — Home's trial strip, lead card and expand.
- CUL-1446 — the visit question.
- CUL-1451 — the rundown tiles; scope ruling needed.
- CUL-1452 — the cold-hydration fail-open.
