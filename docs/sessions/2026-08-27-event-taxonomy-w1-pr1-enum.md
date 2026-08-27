# Event taxonomy — W1-PR-1: the enum migration, `cough` + `sneeze` (CUL-674)

**Date:** 2026-08-27
**Shipped via #728.**

## What this was

W1-PR-1 of the Event Taxonomy Expansion track (B-756/CUL-509, spec
`docs/nyx-event-taxonomy-requirements.md` v1.3 §13a): teach the database the
two wave-1 words. Migration `062_event_type_cough_sneeze.sql` —
`ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'cough'` / `'sneeze'`, the
house shape (precedent `014_food_format_jerky.sql`). Own PR per schema
isolation; the only other file in the diff is this record.

**On the D5 gate:** per the W1-PR-0 session's recorded convention
(`2026-08-27-event-taxonomy-w1-pr0-flag.md` — "the D5 wave greenlight is the
PM's, per-PR"), the PM launching this session on CUL-674 is this PR's
kickoff. The one blocked-by (CUL-673 / W1-PR-0) closed `Done` via #727
earlier today; this branch is cut from that merge. The chain pauses cleanly
here — W1-PR-2 (CUL-675, capture) starts only on its own kickoff.

## What shipped

- **`supabase/migrations/062_event_type_cough_sneeze.sql`** — two additive
  `ADD VALUE IF NOT EXISTS` statements, appended at the end of the enum
  (deliberately no `AFTER` — unlike `food_format` in 014, enum order is not a
  display order here; `constants/eventTypes.ts` owns picker presentation, and
  the Respiratory group is presentation metadata per §3). The header carries
  the HR-8 mechanics note verbatim-in-spirit: a value added by
  `ALTER TYPE … ADD VALUE` cannot be *used* in the transaction that adds it;
  the PR-1/PR-4 split is the safety, and collapsing the PRs reintroduces the
  failure. Migration Safety Pre-flight: additive · destructive = n ·
  backfill = N/A · rollback = none in place (Postgres enum values don't
  drop — the reason values are added only per shipping wave, never
  pre-seeded).

## Verified before writing

- `event_ai_analysis.incident_type` is typed `event_type` (013:159) → extends
  automatically, no companion change (the issue's "(verified)" re-verified).
- No CHECK constraint, trigger, or policy enumerates `event_type` values —
  the literal-value grep hits in 001/013/034 are the enum definition itself
  and comments.
- Local SQLite mirrors `event_type` as TEXT (§3) → no local migration, no
  `localSchema.ts` change.
- The two migration-reading guard tests (`storagePolicies`,
  `functionHardening`) target other migrations; a new 062 file is inert to
  them.

## Applied live + advisors

Applied via the Supabase MCP `apply_migration` (`aigchluqluzuhtbfllgh`, name
`event_type_cough_sneeze`) — applied AND recorded, per the runbook. Read-back
`enum_range(NULL::event_type)` returns
`{meal, vomit, diarrhea, stool_normal, lethargy, itch, scratch,
skin_reaction, weight_check, medication, other, cough, sneeze}` — both
values present. `get_advisors` (security + performance): only the
pre-existing lint set (`record_ai_usage` SECURITY DEFINER, leaked-password
setting, the known unindexed-FK / RLS-initplan / unused-index items); nothing
new, nothing touching `event_type` — the same clean outcome as the
054/055/056/061 applies. Live effect is nil by construction: nothing writes
or renders the values until W1-PR-2+ (confirmed: 0 rows carry either value).

## Verification

- Pre-push hook ran the full gate on push: `tsc --noEmit` clean + full jest
  suite green (SQL-only diff; no TS changed, so this validates the tree, not
  the diff).
- DoD tests line: **N/A — SQL-only migration; no store / Edge Function /
  `lib/` logic changed.** The enum's client-side consumers arrive in
  W1-PR-2/3a with their own tests.
- Adversarial review: N/A — no clinical or statistical logic in the diff.
  The engine's cough lane membership (where that review is mandatory) is
  W1-PR-3b's, per §13a.

## Notes for the next session

Next is **W1-PR-2** (CUL-675): capture — `EVENT_TYPES` entries + the
Respiratory picker group + confirm copy + the §7 detail-contract rows + the
§8 audit, plus the two structural items v1.2 didn't budget for (the grid
exposure gate and the entry-record fields — `hasPhoto`, `species`, family
group, `confidenceModel`). Flag-gated behind `event_types_v2`; flag-off
byte-identical for capture surfaces only (§12 FL-1 — `EVENT_TYPES` itself is
never gated). Gated on its own PM kickoff, per the standing D5 convention.
