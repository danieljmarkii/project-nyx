# Food library trial-awareness — PM dogfood feedback + persona session

**Date:** 2026-07-31 (session opened 2026-07-30 UTC)

**Shipped via #520** — one backlog row (`B-616`, filed as B-614 and renumbered at wrap), no app code. A discussion session by design: the PM asked for the team to be convened on their dogfood feedback, not for a build.

## The feedback

While using the just-shipped diet-trial lifecycle (B-417 PRs 1–7), the PM noticed: the start-a-trial flow captures which foods are eligible during the trial, but the **Foods tab has almost no awareness of that set**. The library can't answer "can {pet} eat this?" during the one period that question is live.

## What research confirmed (two parallel read passes: code map + spec digest)

- `diet_trial_foods` (migration 040) holds the explicit **allowed set** — roles (`primary_diet` / `permitted_treat` / `permitted_other` / `supplement`), dated membership, closed-world (a row means allowed; off-diet is the complement).
- `app/(tabs)/foods.tsx` reads `food_items_cache` only — **zero trial reads**, no badge, no indicator. The food detail screen's only trial surface is the B-351 contaminant note, which fires on `off_diet_protein` alone — an allowed food and the trial diet itself render *nothing* (deliberate under C2).
- The FoodPicker is trial-blind on purpose (B-439 parked a per-tile glyph); off-diet detection fires **post-commit** on the meal completion card, never as a log-time gate.
- The allowed set **cannot be edited mid-trial from anywhere** — the schema supports dated removal (`allowed_until`) but no UI writes it; B-458's allowed-set screen is the planned non-punitive add path.
- The spec already knew: **D9 ruled trial-aware picker/library surfaces "fast-follows, not v1."** This feedback is that fast-follow arriving with real-use evidence. Adjacent rows: B-458 (list screens, Now), B-357 (rotation shelf), B-439 (picker glyph), B-475 (`explainVerdict` unwired), B-556 (`narrowRole` disagreement — flagged as blocking before another surface reads the allowed set).

## The persona session's shape (recorded on the B-616 row)

- **Positive marking only.** Badge the allowed set on library tiles + food detail; never mark off-diet foods — closed-world makes ~the whole library off-diet (red-sea alarm fatigue; §2.1's dismissal-training argument), and G2's two-sidedness means a badge's absence must never read as a verdict either.
- **One-predicate rule.** Membership derives from `matchAllowed` (`lib/dietTrial.ts`) — id first, then the case-folded brand+product key — never a fresh join (the §5.4 re-photographed-bag identity hazard; the `report.ts:2246` third-definition lesson).
- **§6.4 draws the surface line:** *a pre-decision surface may verdict; a record surface may not.* The library (browse) may badge; the picker at log time stays verdict-free — Dr. Chen's sharpening: a log-time warning risks suppressing the log of the very exposure the trial needs recorded (§6.7 record-and-continue).
- **Open design question:** the library is per-account, trials are per-pet — the badge needs an explicit pet scope the Foods tab doesn't carry today.
- **Gates:** B-556 first; QA edges named (archived allowed food vs B-005, `allowed_until` transitions, trial-end badge removal); T&S clean provided the badge stays a list-membership fact (C6 sensitivity).

## The one genuine conflict (Persona Conflict Protocol, unresolved by design)

Jordan (prevention at pick time) vs Designer + Dr. Chen (§6.4 log-time prohibition + log-suppression risk). PM decision needed: does any trial cue appear in the picker at log time (B-439's glyph), or does trial awareness live only on browse surfaces?

## PM rulings (landed mid-wrap, same session, 2026-07-31)

1. **Promoted to Now** — build the library's allowed-set marking with/alongside **B-458** as a combined build, once B-556 lands.
2. **Picker cue deferred to a mock round** — not ruled either way; round 1 of `docs/culprit-food-library-trial-mockups.html` (this session) draws the variants (no cue / B-439 glyph / pinned trial-list section) for a later call.
3. **Mid-trial add is IN** — an owner can add a food to the allowed set mid-trial. Mechanism is §3.2's dated membership exactly as shipped: new row with `allowed_from` = today; feedings before today keep their original reading (no reinterpretation of history — the confirm sheet in the mock discloses this).

The mock (round 1) shipped this session and was published as an artifact for PM review.

## Third ruling + the spec (later the same session)

The PM reviewed the mock in-session and **ruled the picker call: variant H** — the pinned "On the trial list" section, "the clearest" — closing the last open decision. The team concurred (H is the only variant that helps without marking anything, so the §6.4 log-suppression constraint holds by construction); **B-439's glyph option (variant G) is closed** by the same ruling.

With all calls ruled, the PM asked for the requirements spec: **`docs/nyx-food-library-trial-awareness-requirements.md` v1.0 — BUILD-READY** shipped this session. Decision record D1–D8; the three rules (positive-marking-only / one-predicate / §6.4); FR-1–FR-19 across the five surfaces plus the B-458 exposures half (against `explainVerdict`, closing B-475's destination); no schema change; copy pack; QA edge matrix; PR plan 0–4 with PR 0 = B-556. CLAUDE.md Read-These row added; B-616/B-458/B-439 backlog rows reconciled.

## Wrap notes

- **B-ID collision, handled per B-435 option (a):** this session filed the row as B-614; sibling PR #522 landed its own B-614 ("Medication strip on Home") on `main` first, so first-lands-keeps applied and this row was **renumbered to B-616** with an inline provenance note. Duplicate-ID check clean after the merge from `main`.
- CI green on the original push (run #380); merge from `main` resolved one `docs/backlog.md` conflict (both sides appended after B-613).
