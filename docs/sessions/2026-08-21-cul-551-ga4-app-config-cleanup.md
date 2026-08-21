# GA-4 (CUL-551) — retire the two Signal beta flags: delete the `app_config` rows + docs/Linear closeout

**Date:** 2026-08-21
**Mode:** BUILD · **PR:** shipped via #693 (draft) · **Closes:** CUL-546 (on merge) · **Issue:** CUL-551

## Outcome

The final step of the Signal betas' GA (CUL-546 Phase 3). Both `signal_design_v2`
(B-721, "Signal redesign") and `signals_v2` (B-755, "Deeper signals") graduated to
GA on 2026-08-20; this session deleted the two now-dead `app_config` rows and wrote
the graduation into the record. **Nothing in the product references either flag any
longer.**

One PR (#693, draft): migration 060 + the deploy-ledger flip + the Tier-2 doc records
+ CLAUDE.md/STATUS.md + the Linear closeout.

## The gate that almost fired the footgun — GA-3 was merged but NOT deployed

CUL-551 is explicitly blocked on GA-3 being **deployed, not merely merged**, because
`resolveAllowlistFlag` **fails closed on a missing row**: deleting `signals_v2` while
the deployed engine still read it would revert v2 → pre-v2 for **every** account.

On first inspection the gate was **not** clear, despite #691 (GA-3) having merged:

- `generate-signal` was at **v31**, deployed *after* #691 merged — but the deployed
  bundle still contained `var SIGNALS_V2_FLAG_KEY = "signals_v2"` and
  `signalsV2Eligible: resolveAllowlistFlag(byKey.get(SIGNALS_V2_FLAG_KEY), userId, false)`.
- The deploy ledger (`deploy-manifest.json`) independently agreed: `generate-signal`
  was `pending`, "deploy owed from the Codespace."

So GA-3's *code* was merged but the *live bundle* was the pre-GA-3 (B-777-gated) one.
**Root cause:** `scripts/deploy-edge.sh` bundles from the checked-out working tree and
has no `git pull` — the Codespace that ran the first `--deploy` wasn't on the post-#691
commit, so it shipped a stale bundle. Surfaced this to the PM as a hard STOP with the
exact pre-flight fix (the `grep signals_v2 supabase/functions/generate-signal/*.ts`
tell + `git checkout main && git pull` before the script).

The PM re-deployed from a fresh `main`. Verified the new **v32 ACTIVE** bundle is
gate-free — `signals_v2` / `SIGNALS_V2_FLAG_KEY` / `resolveAllowlistFlag` /
`signalsV2Eligible` all **0 occurrences**; `readGateConfig` now selects only
`[ai_signal_phrasing_enabled, ai_caps]`; v2 engine intact (`detectSignals`,
`timing_story`, `trial_response` present). **Only then** was the migration applied.

That verification is this session's load-bearing correctness check (the "falsification
attempt"): I tried to find any surviving deployed reader of the two rows before
deleting them, and there were none.

## What shipped

- **Migration `060_retire_signal_beta_flags.sql`** — `DELETE FROM app_config WHERE
  key IN ('signal_design_v2','signals_v2')`. Applied via the Supabase MCP
  (`apply_migration`), bracketed by the row-count check: **2 before → 0 after**.
  `get_advisors` (security + performance) clean — every lint returned is pre-existing
  and unrelated (`record_ai_usage` SECURITY DEFINER, leaked-password protection, the
  RLS-initplan/unindexed-FK/unused-index set across ~25 tables); `app_config` appears
  nowhere, and a two-row DELETE cannot create or clear any of them. Recorded in
  history as `20260821131515_retire_signal_beta_flags`. Config-data deletion, its own
  migration per schema-PR isolation (called out in the PR body).
- **Deploy ledger** — `generate-signal` `pending → deployed` (fingerprint
  `sha256:29df1af6…36995b3`, matching the current closure; `guards/edgeFunctionDeploy.test.ts`
  16/16 green). Reason notes the GA-3 deploy also carried the previously-undeployed
  CUL-258 fetch-timeout work, in the same `main` closure.
- **Tier-2 doc records** (PM approval = the GA ruling, CUL-546):
  - `nyx-signal-home-requirements.md` §7 — FR-FLAG-5 retirement record (the ordered
    removal + the "beta mechanism untouched" note); header GA'd.
  - `nyx-signals-v2-requirements.md` §5 — the **B-777 amendment** (the engine *did*
    gate server-side per-cohort during dogfood, amending the "computed uniformly /
    `serverCost:false`" framing) + the retirement record (incl. the deployed-not-merged
    gate); header GA'd.
  - `nyx-beta-features-requirements.md` §4.3.1 — **first two graduations** recorded:
    both `reviewBy` dates closed early as *graduate*, and the load-bearing lesson that
    a **server-gated** beta needs the gate removed + redeployed *before* the
    `app_config` row can be deleted (which `log_picker_v2`, client-only, won't need).
  - CLAUDE.md — the signal-home Read-These row annotated GA'd (+ a note that
    signals-v2 has no Read-These row of its own, Linear-first).
  - STATUS.md — the two Signals sections netted out to their GA-complete outcome; the
    two completed PM action-item blocks (GA-3 deploy; the redeploy-gates) removed
    (state-file hygiene).
- **Linear closeout:** CUL-547/548/549/550 → Done; CUL-31 (B-766) + CUL-95 (B-775) →
  Done as the ratified provisional rulings (comments naming the GA ratification);
  CUL-75 (B-770) → Canceled (obsolete — GA'ing both flags together deletes the mixed
  state it worried about); CUL-74 (B-755) + CUL-71 (B-721) → Done (comments → CUL-546).
  Searched for stale "dark behind the flag" titles: the two umbrellas that carried the
  framing are now closed; no open issue needs a re-title. CUL-546 + CUL-551 left open —
  they close on the #693 merge (the last PM touchpoint), with summary comments on both.

## DoD

- [x] AC: N/A — GA graduation / cleanup, not a `technical-spec.md` build step.
- [x] Anti-patterns: none. No app/TS source touched; migration data + docs + one JSON
      ledger row.
- [x] Types + lint: pre-push `tsc --noEmit` green; jest **241 suites / 5361** green
      (zero TS changed, so unchanged vs `main`).
- [x] Automated tests: **N/A — no store / Edge Function / `lib/` change.** The one
      code-adjacent file (`deploy-manifest.json`) is covered by the existing
      `guards/edgeFunctionDeploy.test.ts` (16/16). Migration is DML, not jest-testable.
      Engineer signs the exemption.
- [x] No new secret.
- [x] Persona sign-off: **Engineer ✓** (deploy-before-delete ordering verified on the
      live bundle; ledger fingerprint consistent; schema-PR isolation held) — **Product
      Owner ✓** (9-issue backlog closeout, correct terminal states + comments) — **T&S
      ✓** (deletion is of app-global *config* flags, not user data; no RLS / Storage /
      deletion-cascade / export boundary touched; `app_config` RLS unchanged) — **Data /
      Dr. Chen N/A** (no clinical/statistical logic changed; the engine change was GA-3,
      adversarial-reviewed in #691).
- [x] Adversarial review: **N/A for new logic** — this session changed none. The
      load-bearing gate (no deployed reader of the rows survives) was verified directly
      against the deployed v32 bundle (0 occurrences of the gate symbols), which is the
      appropriate falsification for a config-row deletion.
- [x] Future-self review: migration 060 is a known deletion-pattern, not a new one; the
      dead rows would otherwise be cruft future `app_config` readers puzzle over. The one
      named risk (server-gated betas need deploy-before-delete) is now written into
      beta-features §4.3.1 so the next graduation doesn't relearn it.

## Follow-ups / residuals (not folded in)

- **CUL-239 (B-727)** is still In Progress. Its client half shipped in Phase 0 (#689)
  and its server template rode the GA-3 redeploy (now live in v32), so it may now be
  fully deployed — worth a next-session verify + close, but **out of GA-4's scope**, so
  left alone rather than closed on assumption.
- **CUL-564** — `generate-report` still pinned pre-v2 (`composeV2:false`, under B-494);
  v2 adoption in the report is that issue, unaffected by this GA.
- Open Signals-v2 findings (CUL-116/124/527/460/440/205/139/…) keep their historical
  "dark behind `signals_v2`" wording in-description — accurate as history, not
  misleading now that GA is recorded on CUL-546 + the specs; not worth a mass re-title.
