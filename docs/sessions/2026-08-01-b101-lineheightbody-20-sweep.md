# B-101 follow-up — migrate the remaining bare `lineHeight: 20` literals onto `lineHeightBody`

**Date:** 2026-08-01

## What shipped

Completed the **B-101 `lineHeightBody` sweep**. PR #172 (2026-06-16) had retired the raw
`lineHeight: 22` sites — a 22→22 no-op — but left the bare `lineHeight: 20` literals
behind. This pass migrated the remaining **25 `lineHeight: 20` literals across 19 files**
onto `theme.lineHeightBody`.

Because the token is `22`, this is a **deliberate 20→22 leading change** on the affected
body copy, not a no-op — hence the empty-state QA focus. Sites (all `theme`-based
`StyleSheet` body copy, `textSM` / `textMD` / raw `14`):

- **Weight cards' `emptyText`** — `components/dashboard/WeightCard.tsx`,
  `components/profile/WeightTrendCard.tsx` (explicitly called out in the task).
- Empty / subtitle / centered-body states — `app/(tabs)/profile.tsx`
  (`emptyConditionsText`), `app/archived-pets.tsx` (`subtitle` + `emptyText`),
  `components/profile/ArchivePetSheet.tsx`, `components/profile/DeleteAccountSheet.tsx`,
  `components/profile/StartTrialModal.tsx` (`sheetSub` + `consent`).
- List-row product names — `components/foods/FoodRow.tsx`,
  `components/foods/ArchivedFoodRow.tsx`, `components/log/FoodTile.tsx`,
  `components/log/MedicationPicker.tsx`.
- Home / Signal / Ask / history / dashboard body copy — `components/home/SignalZone.tsx`
  (×2), `components/home/InsightCard.tsx`, `components/ask/AskAnswerComponent.tsx`,
  `components/history/EventRow.tsx` (`notes`), `components/dashboard/RankingCard.tsx`
  (×4), `components/dashboard/MetricInfo.tsx`, `app/food-capture.tsx`, `app/log.tsx`.

`components/dashboard/MetricInfo.tsx` also had a `// raw lineHeight — folds into the
B-101 lineHeightBody token sweep` marker; that now-stale comment was removed.

## What was deliberately NOT touched

The `lineHeight: 16` XS `note` styles on the weight cards. Those belong to **B-193**'s
proposed `lineHeightXS` token, a separate item — leaving them out keeps the sweep to the
one class of literal the task named.

## Backlog

**B-193 now fully Done** (reconciled at merge). A sibling session (#540, its own theme-token
sweep) landed on `main` while this was in flight: it added `space0_5: 4` + `lineHeightXS: 16`
and migrated `gap: 4` + the `note` `lineHeight: 16` across MetricCard/WeightCard/WeightTrendCard,
**deliberately leaving the `emptyText` `lineHeight: 20` for this B-101 sweep** (per the
`MetricInfo.tsx:81` marker — a 20→22 behaviour change, out of #540's scope). This PR (#545)
migrated that last `emptyText` `lineHeight: 20` → `lineHeightBody`, closing B-193's final
sub-part. B-101 itself stays `Done` — its original scope was the `22` sites.

## Merge note

`main` advanced to `f646d67` mid-session (the large B-616/B-618/med-strip merge, #540 among
them), so this branch was merged up. Two conflicts, both orthogonal unions:
- `app/food-capture.tsx` `confirmProduct` — #540 migrated the hardcoded `rgba(255,255,255,0.92)`
  to the new `theme.colorTextOnDarkMuted` token (same value); this PR migrated its `lineHeight: 20`
  → `lineHeightBody`. Resolution takes both.
- `docs/backlog.md` B-193 — reconciled to the single "fully Done" row above.

Post-merge: zero bare `lineHeight: 20` literals remain in `**/*.{ts,tsx}`; full suite re-run green.

## Verification

- `tsc --noEmit` clean.
- Full jest suite green — 159 suites / 3610 tests, 2 snapshots unaffected (no snapshot
  captured the old `20`).
- Grep confirms zero bare `lineHeight: 20` literals remain in `**/*.{ts,tsx}`.
- Behaviour-preserving refactor (visual leading only), so DoD tests line reads
  `N/A — pure presentational token swap`; Engineer signs the exemption.

Persona sign-off: Designer ✓ (Principle 5 empty states) — Engineer ✓ (theme-token-only,
no magic) — Data N/A — Dr. Chen N/A.

Shipped via #545 (draft).
