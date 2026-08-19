# Per-incident AI reads: realtime instead of polling (CUL-171 / B-030)

**Date:** 2026-08-19
**Shipped via:** #683 (draft)

## What shipped

The per-incident AI read sections (`components/event/VomitAnalysisSection.tsx` and its sibling
`StoolAnalysisSection.tsx`) waited for the `analyze-*` Edge Function to write the `event_ai_analysis`
row by **polling** it every 3s, ≤12 times (~36s), then giving up to a manual retry. That fixed cliff
stranded a read that finished past ~36s even though the answer already existed, and a tight recurring
poll is the wrong mechanism for an async server write.

Replaced with the app's **first Supabase realtime surface**:

1. **`lib/analysis.ts` → new `watchAnalysisRow(eventId, check, onGiveUp)`** — a shared primitive both
   sections use. Opens a `postgres_changes` channel filtered to `event_id=eq.<id>`, reconciles with an
   authoritative re-read **on `SUBSCRIBED`** (closes the mount→subscribe race — `postgres_changes` only
   carries changes after the socket is live) and on every change, and keeps a **bounded 8/20/40s
   fallback re-read** behind realtime (not a tight poll). Tears the channel down on resolve / unmount /
   re-trigger; teardown is idempotent (`done` flag, checked-then-set synchronously). `onGiveUp` fires
   once if the fallback schedule exhausts, reproducing the old "~36s → manual retry" floor.
2. **Both sections converted** — the only two client consumers of `event_ai_analysis`. `pollUntilResolved`
   → `checkResolved` (the typed re-read) + `beginWatch` (opens the watch, stored in a `watchTeardown`
   ref). Render branches, props, and the clinical never-reassure invariants are **unchanged** — this is
   lifecycle/plumbing only.
3. **`supabase/migrations/059_event_ai_analysis_realtime.sql`** — `ALTER PUBLICATION supabase_realtime
   ADD TABLE event_ai_analysis`. Additive; applied to the live DB this session.

**Doorbell property (defense-in-depth):** the realtime handler reads *nothing* off the socket payload
(`() => tick()`); the authoritative read is a separate RLS-gated REST `SELECT`. So pet health data
never transits the realtime wire — the socket is only a "something changed, go re-read" signal.

**Stale-premise correction:** the issue said "switch to realtime *as food detail already does*." There
was **no** realtime anywhere in the app and the `supabase_realtime` publication held **zero** tables;
food capture writes its status inline, it doesn't subscribe. So this was built from scratch, not copied
— flagged to the PM before coding.

## Decisions (PM-approved this session — A/A/A)

1. **Scope: both sections** (not vomit-only). Byte-identical poll machinery, same table; converting one
   leaves a split-brain.
2. **Realtime + bounded reconciliation fallback** (not pure naked realtime). Dir. of Eng. lens: mobile
   realtime is best-effort (backgrounding, dropped sockets, RLS fail-closed); a stranded `worth_a_call`
   spinner is unacceptable for health UX. The fallback preserves the old reliability floor.
3. **Bundle the additive publication migration in this PR** (not a separate schema-only PR). It's inert
   without the client code and vice-versa; a zero-blast publication add doesn't benefit from the schema-
   PR-isolation rule (whose purpose is isolating high-blast structural review). Explicitly noted as the
   exception, not an oversight. Migration applied to live DB this session so on-device QA exercises the
   real realtime path, not the fallback.

## Reviews

- **`rls-privacy-reviewer` — PASS.** This adds a realtime read channel over pet health data, so the
  access-control red-team was mandatory. It attacked cross-user subscription (B's JWT targeting A's
  `event_id`), filter omission/spoofing (the `event_id=eq.` filter is a convenience, RLS is the control),
  anon subscription, token-refresh, and sign-out/account-swap on a shared device — **all fail closed**,
  anchored on a `pet_id` the Edge Function derives from an RLS-validated event read (never client input).
  Confirmed the doorbell property and that default replica identity is correct (governs only the OLD-row
  payload, never read). Standing caution recorded: any future `ADD TABLE` to `supabase_realtime` must be
  RLS-owner-scoped — worth a checklist item on future realtime-publication migrations.
- **Post-apply live verification** (the RLS reviewer's requested checks): `pg_publication_tables` shows
  `supabase_realtime` holds exactly `event_ai_analysis`, `puballtables = false`, RLS enabled;
  `get_advisors(security)` surfaced no finding for the table (two pre-existing unrelated WARNs only).
- **`code-reviewer` — fix-before-merge; fixes applied in `ac85cc3`.**
  - **[BUG]** `handleRetry` never re-checked `cancelled.current` after its trigger-await (both sections),
    unlike `start()` → navigating away mid-retry ran `setWorking(true); beginWatch()` on an unmounted
    instance, opening an orphan channel + timers (self-healing via the first tick, but a live socket +
    wasted fetch for a screen the user left). **Fixed:** added the guard mirroring `start()`.
  - **[NIT]** `tick()`'s catch swallowed a failed `check()` silently → violates "no silent failures".
    **Fixed:** logs `[analysis-watch] check failed`, still non-fatal.
  - **Verified clean:** teardown idempotency (both firing orders traced), effect-dep stability (no
    re-subscribe churn on `eventId` change), the `SUBSCRIBED` reconcile closing the mount→subscribe gap,
    give-up-exactly-once timing, and the two components staying honest siblings.

## Verification / DoD

- **AC (this quick win):** completed read renders with no manual tap (instant vs. up-to-36s) ✓;
  no change to which render branch shows for capped/read_disabled/worth_a_call/not_enough_to_say
  (existing safety-critical component tests green) ✓; dropped socket degrades to bounded fallback +
  manual retry, no infinite spinner ✓.
- **Tests:** `lib/analysis.ts` is a shared `lib/` util → `watchAnalysisRow` unit-tested in
  `lib/analysis.test.ts` (filter/SUBSCRIBED-reconcile, resolve-and-teardown, double-teardown idempotency,
  failing-check-is-logged-not-fatal, give-up-exactly-once via fake timers). Each component test adds a
  realtime-resolution test **and** an `onGiveUp`→retry-fallback fidelity test. Full suite **239 suites /
  5334 tests** green; `tsc --noEmit` clean; CI green on the head commit (App jest+typecheck, non-UTC
  timezones, Edge deno).
- **Adversarial-reviewer: N/A (stated).** Lifecycle/plumbing only — no detection, correlation,
  escalation, or vet-report logic touched; render branches verifiably unchanged. The clinical guardrails
  live in the unchanged Edge Functions and render branches.
- **Persona sign-off:** Engineer ✓ (managed-Expo realtime, shared primitive, idempotent teardown, no
  leaked channel/timer, tokens/house-rules clean) — Trust & Safety ✓ (`rls-privacy-reviewer` PASS; no new
  access; doorbell keeps health data off the wire) — Designer N/A (no visual/copy change; the pending/
  retry/read states render exactly as before, just resolved faster) — Dr. Chen N/A — Data N/A.
- **Future-self review (new pattern):** first realtime surface; `watchAnalysisRow` is reusable and the
  doorbell + bounded-fallback shape is right. Durable risk (a future non-RLS realtime table) is recorded
  by the RLS review as a checklist item.
- **Secrets Register:** unaffected — the socket uses the public anon key; the service-role key stays
  server-only in the unchanged Edge Functions.

## STATUS.md

**Untouched.** A Legacy-Backlog perf quick-win on already-shipped surfaces changes no working-state field
(Current Phase / Parallel Track / Blocking OQs / PM Action Items / Runtime), so the minimal — and
correct — STATUS.md diff is none.

## Linear

The PR body's `CUL-171` reference auto-links #683 and moves the issue Todo → In Progress; the squash-merge
moves it to Done. Outcome comment posted to CUL-171 at wrap.

## Residuals

- **Live realtime-plane enforcement** is the one thing not repo-verifiable (a Supabase platform default,
  not a code path): a two-account on-device test (B subscribed, A triggers an analysis → B's channel
  receives nothing) would confirm it. Every code-side precondition is correct (RLS enabled, table in
  publication, JWT auto-wired to the socket).
- **Non-blocking test gap left open by choice:** the `handleRetry` unmount-race guard itself isn't
  directly unit-tested (an unmount-mid-await race is awkward to pin cleanly); it's a defensive early-
  return mirroring `start()`'s tested-by-symmetry pattern. The `onGiveUp` fidelity path *is* now tested.
