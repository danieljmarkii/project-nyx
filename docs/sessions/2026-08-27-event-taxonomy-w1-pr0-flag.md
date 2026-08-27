# Event taxonomy — W1-PR-0: the `event_types_v2` flag, dark + the B-747 shelf fix (CUL-673)

**Date:** 2026-08-27
**Shipped via #727.**

## What this was

W1-PR-0 of the Event Taxonomy Expansion track (B-756/CUL-509, spec
`docs/nyx-event-taxonomy-requirements.md` v1.3 §12/§13a): seed the
`event_types_v2` `app_config` allowlist flag the wave ships dark behind, register
it client-side, add its Beta-features shelf card — and, per HR-10, carry the
**full B-747 fix** (the shelf-reachability OR-gate, live-bug-today) paired with
**B-729's** designed zero-card empty state. Nothing consumes the flag yet.

Followed the B-745 PR-0 precedent (#632, `056_log_picker_config.sql`,
`docs/sessions/2026-08-13-more-events-picker-pr0-flag.md`) exactly, plus the two
issues that session filed and this one closes.

**On the D5 gate:** the parent umbrella (CUL-666) is deliberately un-greenlit;
CUL-673 was launched as this session's task by the PM, which I read as the
greenlight **for this PR-0 only** — it is inert-by-construction (a dark seed +
plumbing + a live bug fix), and the chain pauses cleanly here. W1-PR-1 (the enum
migration) starts only on its own kickoff.

## What shipped

- **`supabase/migrations/061_event_types_v2_config.sql`** — seeds
  `event_types_v2` into `app_config` with the B-712 allowlist shape, **default
  nobody** (`{"enabled": false, "allowlist": []}`), idempotent via
  `ON CONFLICT DO NOTHING`. A structural clone of 056; the rationale block
  carries the two things that differ — the §12 writes-gated / **reads-never**
  split (`EVENT_TYPES` is never flag-gated), and the D12 note that W1's GA
  queues behind the `log_picker_v2` host chain.
- **`lib/appConfig.ts`** — `event_types_v2` added to `ALLOWLIST_FLAG_KEYS` +
  `ALLOWLIST_FLAGS_UNSET` (+ the explanatory comment). The seed is inert without
  this — `extractAllowlistFlags` picks only registered keys.
- **`lib/betaFeatures.ts`** — the `event_types_v2` `BETA_REGISTRY` row: title
  **"More event types"**, nyx-voice blurb ("More kinds of events to log,
  starting with cough and sneeze, so what you notice has a place in the
  record."), owner, `reviewBy` 2026-11-27 (~1 quarter; may legitimately be
  "extend" while the D12 host chain closes), **`serverCost: false`** (§12 —
  capture has no server component; engine/report membership is account-agnostic).
  Plus **`deriveBetaShelf`** — the pure OR-over-the-registry derivation
  (eligible list + the eligible∧opted-in `activeCount`) that the B-747 fix
  hangs on.
- **`hooks/useAppConfig.ts`** — `useAllowlistFlagsRaw()`, a bulk subscription to
  the raw allowlist map (one store read for surfaces that reduce over several
  flags).
- **`hooks/useBetaShelf.ts`** (new) — the React binding: bulk-reads the three
  stores once and reduces through `deriveBetaShelf` (never a per-entry hook call
  in a registry loop — the rules-of-hooks shape the old settings comment warned
  about).
- **`app/settings.tsx` — the B-747 fix.** The Beta-features row now gates on
  `useBetaShelf().eligible.length > 0` (an OR over the whole registry) and the
  "N on" count is the same derivation's `activeCount` — both halves of HR-10.
  Pre-fix, an account allowlisted only for `log_picker_v2` could not reach the
  shelf at all, and a non-widget opt-in never counted.
- **`app/settings/beta.tsx`** — the `event_types_v2` card presentation (a
  `Shapes` glyph — deliberately not a "+", the pm-feature-review affordance
  lesson; no on-state hint, like the log picker) **and the B-729 empty state**:
  zero eligible entries → a designed quiet block ("Nothing to try right now" /
  "Beta features come and go while we build…") replacing the intro + cards +
  honesty note, so the intro can never promise an action with no card to act on.
  Per-card self-gates stay (deep-link belt-and-braces; same stores, so they
  can't disagree).
- **Tests** — `lib/appConfig.test.ts` gains the `event_types_v2` block mirroring
  the earlier keys (unset baseline / extract / fail-closed / allowlisted-on /
  cache round-trip); `lib/betaFeatures.test.ts` registry length 2→3 +
  `serverCost` assertion + a `deriveBetaShelf` contract block (the B-747
  regression case verbatim, the killed-flag rule, signed-out fail-closed,
  registry order); `lib/session.test.ts` B-402 wipe fixture extended to the new
  key; **new component tests** `app/settings.test.tsx` (the row's OR-gate + "N
  on" count at the fix site) and `app/settings/beta.test.tsx` (empty state vs.
  cards vs. self-gate). Per the CUL-613 rule, both component suites were run
  against the **pre-fix** tree first and confirmed red (3 failures — the three
  tests written for the fix) before being trusted green.

## Applied live + advisors + enablement

Applied via the Supabase MCP `apply_migration` (`aigchluqluzuhtbfllgh`, name
`event_types_v2_config`). Read-back confirms `{"enabled": false, "allowlist":
[]}` as `jsonb` — dark. `get_advisors` (security + performance): only
**pre-existing** lints, all on other objects (`record_ai_usage`, leaked-password
setting, the known unindexed-FK / RLS-initplan / unused-index set); `app_config`
appears in none — same clean outcome as the 054/055/056 seeds.

Then, as a **separate recorded config UPDATE** (never baked into the seed — the
037/054/055/056 discipline), the PM's uid was allowlisted:
`enabled:false` + `["2eeeaef5-753a-467c-8c17-2b9fed40ee34"]` — gated to the PM
only. uid re-verified against `auth.users` (danieljmarkii@gmail.com) this
session; it's the same uid already on `widget_enabled` / `log_picker_v2`. Value
of allowlisting now: the PM is already in the cohort when W1-PR-2 lands, and can
see the new shelf card + the B-747/B-729 behavior on-device.

**Caveat (matches PR-0 precedent):** nothing consumes the flag, so the visible
effect on the PM's device (once a build with this JS is running) is the third
shelf card + its toggle. No capture surface changes until W1-PR-2.

## Verification

- `tsc --noEmit` clean; full `jest` suite green (see the PR's DoD block for
  counts); the five affected suites run targeted first.
- `code-reviewer` subagent run against the diff (general health + house rules).
- Advisors: no new lints (above).

## Notes for the next session

Next is **W1-PR-1** (CUL-674): the enum migration — `ALTER TYPE event_type ADD
VALUE IF NOT EXISTS 'cough', 'sneeze'`, own PR per schema isolation, with the
HR-8 mechanics note (a new enum value can't be *used* in the adding
transaction; the PR-1/PR-4 split is the safety). Gated on its own kickoff —
the D5 wave greenlight is the PM's, per-PR.
