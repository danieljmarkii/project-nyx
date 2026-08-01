# B-618 PR 4 — the "Dose {n} of {target}" regimen card

**Date:** 2026-08-01

Shipped via **#538**. The final PR of B-618 — the profile's **Current medications** card now renders a doses-denominated fixed course as **`Dose {n} of {target}`** with a bar bound to `n / target`. This is the layer where **D7 is actually enforced** (the schema/predicate/entry can only guarantee nothing sets `status`; the ban on completion/stop language at `n >= target` is the card's to keep). No schema — PR 1 (#531) shipped it; PR 2 (#533) the predicate + data path; PR 3 (#535) the entry chips.

## What shipped

- **`doseCourseProgress(tally, target)`** (`lib/medications.ts`) — the one place the count line + bar fraction are formatted, so the line and the bar always state the same `n` (the diet-trial "bar lies" lesson). It **reads `dosesTowardTarget`**, it does not re-derive `given + partial` (D6). By construction it can emit no completion/stop word (D7). Returns `{ count, target, line, barFraction, pastTarget }`.
  - In range: `Dose {n} of {target}` (from `Dose 0 of 28` onward — honest before the first administration).
  - Past target: `{t} of {t} doses · {x} more logged` — cap the bar (`Math.min(count/target, 1)`), disclose the exact overage, render **no error**, and never fall back to "Started …" the way the days path must ("Day 30 of 7" is nonsense; "28 of 28" is true).
  - Unit word inflects on the target (`1 of 1 dose`, not `1 of 1 doses`).
- **`app/(tabs)/profile.tsx`** — `buildRegimenDisplay` derives a `doseCourse` field, non-null only when `target_duration_doses > 0`. The card's count-line/bar block branches on it: a doses course drives its own count line + `n/target` bar; days and ongoing courses render **byte-for-byte** as before (regression-safe — the fallback branch is the pre-PR-4 logic nested one level down). The two paths are mutually exclusive on any conforming row (the DB `medications_one_duration_denomination` CHECK).
- **Tests** (`lib/medications.test.ts`, `doseCourseProgress` describe) — zero state, in-range, partial-advances-the-count, exactly-at-target (D7, `NO_COMPLETION` regex), past-target cap+disclose, refused/missed/unrated never advance, single-dose singular grammar, and a `target × given × partial` property sweep pinning `barFraction ∈ [0,1]` and the no-completion-word invariant. Full jest suite **3863/3863** green; `tsc --noEmit` clean.

## The design call: bind the bar to its number, escalate the rest

A doses course now shows two independently-denominated numbers: the new `Dose n of target` line + `n/target` bar (bottle progress), and — unchanged, per spec §6 — the adherence compliance line (`88% given · 7 of 8 doses`, denominated on `doses_per_day × daysElapsed`). By D1 they diverge by exactly `tally.partial`, on purpose (therapy-delivered count vs a stricter given-only rate — two different questions the spec forbids reconciling).

`pm-feature-review` returned **NEEDS-WORK** on one blocking legibility item: the `n/target` bar sat directly above the adherence line, whose leading number (`88%`) is the one percentage on the card the bar does **not** represent — and a bar reads as the nearest percentage. Two-layer resolution:

1. **In-scope (applied, this PR):** the count line + bar are bound into one tight visual unit (`doseCourseGroup`, `gap: 2` vs `medRow`'s `gap: 4`) so the bar sits closer to the `Dose n of target` line it represents than to the `%` line below — bar semantics, which §6's own sign-off gate names. Days/ongoing courses keep the bar as a direct row child (there the bar *is* the adherence %, so it correctly sits above the % line and needs no grouping). Final pixel spacing is a device-pass tuning; the structural binding is the point.
2. **Escalated, not resolved silently (B-645, filed as B-641 — renumbered at wrap on a same-day collision with #537's `opacityDisabled` row):** whether the day-scheduled compliance % should render on a doses course *at all* is a spec-vs-experience product call (§6 mandates it; the review questions it under a differently-scaled bottle bar). Filed for the PM with the three options (keep / trim the second fraction / suppress and lean on the flag line).

Three more `pm-feature-review` findings deferred to backlog, none blocking: **B-642** (an at-target "keep going until your vet says" line — D7 bans stop language, not keep-going language; needs Dr. Chen + nyx-voice), **B-643** (zero-state voice pass for "Dose 0 of 28"; de-dupe with "No doses logged yet"), **B-644** (a PRN-with-dose-target QA case).

## Falsification attempts

Per the DoD's "state the counterexample you tried." Spec §9's posture: the predicate is deterministic and single-line, so the `adversarial-reviewer` subagent is optional (no statistical/escalation engine touched); the DoD's adversarial line is satisfied by the property tests + the named falsifications.

- *The refused-tail course that must never read complete* — a course refused N times has `count = 0` (refused never advances, D1); the line is `Dose 0 of 28`, the bar empty, and the refusals surface through `regimenFlagLine`. It cannot reach any completion state — there is none (D7).
- *Reaching the target reads as "done" and stops an antibiotic early* — at `count === target`, `pastTarget` is `false` (strict `>`), the line is `Dose 28 of 28`, and no completion/stop word is reachable (`NO_COMPLETION` regex, property-swept). The full bar's "done" pull is the residual risk, tracked as B-642 (a keep-going counterweight), not silenced here.
- *A corrupt local row with `target_duration_doses = 0`* — the local SQLite mirror does not enforce the server `> 0` CHECK, and the call site would pass `0` through `!= null`. Guarded: `buildRegimenDisplay` gates on `> 0`, so a 0 target degrades to the ongoing "Started …" path rather than rendering `Dose n of 0`.
- *A single-dose course past target* — `1 of 1 dose · N more logged` (unit inflects), never the ungrammatical `1 of 1 doses`.
- *The bar over-claiming progress* — `barFraction` is capped at 1 and the property test asserts it never exceeds `min((given+partial)/target, 1)`; more given+partial than target can never draw past full.

## DoD

- Acceptance criteria: §8 matrix rows 1–6 — unit-tested (rows 1/2/3/5 directly, 4 via tally-follows-record, 6 via unchanged-branch); §8.8 shipped in PR 1. On-device rows in the PR's Manual QA (the PM's to run). **Pass** at the logic layer; device pass pending.
- Types/lint clean (`tsc --noEmit`); full jest **3863/3863**.
- Tests: added — `lib/` shared utility (`doseCourseProgress`); the screen itself has no dedicated test (house convention pushes testable logic into `lib/`, which this diff does).
- Anti-patterns: none — theme tokens only (reused `progressTrack`/`progressBar`/`medDays`; one new zero-magic `doseCourseGroup`), no new secret, no `any`, no `ScrollView`-of-chips, no migration.
- Persona sign-off: **Engineer ✓** (D6 one-predicate, days/doses exclusivity, `> 0` degrade) — **Designer ✓** (principles 1/3, bar semantics: bar bound to its number) — **`code-reviewer` ✓** (no BUG; 2 NITs + 1 CLEANUP applied) — **`pm-feature-review`** NEEDS-WORK → bar-binding applied, product question escalated to B-645, device screenshots pending — **Dr. Chen N/A** (no new clinical read; D7 upheld) — **Data N/A**.
- Future-self: the helper is the single formatter every future course-target consumer reads (B-394's projection, the report if it ever renders targets) — the right home in 12 months.
