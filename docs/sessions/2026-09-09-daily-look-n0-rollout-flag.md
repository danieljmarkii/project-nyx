# Noticed N-0 — the `daily_look` rollout flag

**Date:** 2026-09-09
**Issue:** CUL-866 (Home v2 — the redesign / Noticed; milestone *Noticed A · Foundation*)
**Mode:** BUILD
**PR:** shipped via #817 (draft)

---

## What shipped

The rollout gate the whole Noticed track queues behind, the `signal_design_v2`
template (055) verbatim — a dark allowlist flag, flag-off byte-identical,
seed-first, a beta shelf before GA, retire on a PM GA call only. It is the 5th
instance of the experimental-flag primitive (after Ask 037, the widget 054,
signal_design_v2 055, log_picker 056, event_types_v2 061), so there was no new
mechanism to design — the work was mirroring the 061 shape exactly.

- **`supabase/migrations/063_daily_look_config.sql`** — the dark seed
  `INSERT INTO app_config (key, value) VALUES ('daily_look', '{"enabled": false,
  "allowlist": []}'::jsonb) ON CONFLICT (key) DO NOTHING;` (data-only, the 061
  shape). Additive; rollback `DELETE FROM app_config WHERE key='daily_look'`.
- **`lib/appConfig.ts`** — `daily_look` joins `ALLOWLIST_FLAG_KEYS` + the unset
  baseline, with a comment block. **Client-render-only**: no server-side
  registration (a look never enters the engine or a coverage line, spec §5), so
  `supabase/functions/_shared/flags.ts` is untouched — the same posture as
  signal_design_v2 / log_picker / event_types.
- **`lib/betaFeatures.ts`** — the `BETA_REGISTRY` "Noticed" row (`serverCost:
  false`), with an nyx-voice blurb that names the record it builds and
  deliberately promises **no insight** (in v1 a look writes nothing but itself).
- **`app/settings/beta.tsx`** — the shelf card's `Eye` glyph via `presentationFor`;
  the card renders only for an allowlisted account and self-gates otherwise (the
  screen already maps over the registry, so the row is otherwise free).
- **Tests** mirror the 061 precedent across `appConfig.test.ts` (fail-closed +
  cache round-trip, **plus a GA `enabled:true` → every-account case pinning R1**),
  `betaFeatures.test.ts` (registry length 3→4, registry-order map, the serverCost
  gate), `beta.test.tsx` (a Noticed-render test), and `session.test.ts` (the
  sign-out wipe fixture).

Nothing consumes the flag yet (N-0). A rollout gate **only** — GA is every
account (spec §10 R1); no eligibility predicate references a trial or a watch.

## The deploy (done in-session, verified)

Per the issue's Deploy section and CLAUDE.md (cloud session applies additive
migrations via the Supabase MCP, no PM action item):

1. `apply_migration` name `daily_look_config` (project `aigchluqluzuhtbfllgh`) →
   `{"success":true}`. Read-back confirmed the dark seed `{"enabled":false,
   "allowlist":[]}`.
2. Verified the PM's uid **bidirectionally** before writing it (CUL-696 — pair
   the id with its owner): `danieljmarkii@gmail.com` → `2eeeaef5-753a-467c-8c17-
   2b9fed40ee34`, and that uid → `danieljmarkii@gmail.com`. It is also the exact
   uid already in the `widget_enabled` / `log_picker_v2` / `event_types_v2`
   allowlists.
3. Recorded allowlist UPDATE (`execute_sql` with `RETURNING`) →
   `{"enabled":false,"allowlist":["2eeeaef5-…"]}`. `enabled` stays **false**
   (cohort-gated to the PM, **not** GA). The App Review demo account (CUL-188) is
   **not** allowlisted — DB-1: allowlist values are readable by every
   authenticated client (B-744), so allowlisting the demo would leak its UUID and
   expose a surface GA users can't reach.
4. `get_advisors` (security + performance) after the migration: **zero new
   findings**. `app_config` appears nowhere in the results — a data-only seed
   introduces no DDL, no table, no index, no policy. Every finding is
   pre-existing and on other tables.

## What the checks caught

Jest (320 suites / 6849 tests / 6 snapshots) passed on the first run, but
`tsc --noEmit` (strict) flagged one gap jest didn't: `lib/session.test.ts`'s
cache-wipe fixture is typed as the full `AllowlistFlagValues`, which now
**requires** `daily_look`. Added it there (consistent with the fixture's
illustrative "allowlist UUIDs get wiped on sign-out" purpose). Typecheck then
clean. Worth noting because it is the one place the new required-property
propagated beyond the obvious registration sites — the `event_types_v2` grep is
what surfaced every site to mirror, and the typecheck is what caught the one the
grep's "illustrative, not a registration" judgment had set aside.

## Byte-identical, pinned

The flag-off byte-identical claim is pinned by the fail-closed unit tests (the
dark seed resolves off for everyone → no card renders on any real account) and
the green snapshot suite — the same place the 061 template pins it. There is no
separate snapshot for the seed itself; the property is a consequence of the
resolver, not of a rendered surface.

## Residuals / notes

- None functional. The flag is inert until N-4a (the Home card) and N-5 (the
  Patterns card) gate on `eligible && optedIn`.
- Migration numbering: this took **063**; **N-1 (CUL-867) mints 064** next — the
  spec's "never two sessions minting migrations at once" rule. N-1 is the schema
  (the `check_in` enum value + the `looks` child, RLS, the same-pet trigger).

## DoD

Acceptance criteria all pass (see the CUL-866 outcome comment). No adversarial
review owed — a rollout flag carries no clinical/statistical logic (the issue
says so explicitly). Persona sign-off: **Engineer ✓** (the template applied,
migration isolated, tests mirror + a GA case added) — **Designer / nyx-voice ✓**
(the one new owner-facing string, the beta blurb: warm, concrete, no exclamation,
promises no insight) — **Trust & Safety ✓** (demo excluded per DB-1; the
allowlist add is the PM's own uid, verified bidirectionally) — Data N/A —
Dr. Chen N/A.
