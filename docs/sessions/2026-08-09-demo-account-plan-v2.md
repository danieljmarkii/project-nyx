# App Review demo-account plan — v2 refresh + finalize (B-271)

**Date:** 2026-08-09 · **Shipped via #623** · **Type:** planning / docs (no build-phase change, no app code)

## What this session did

Refreshed `docs/nyx-demo-account-requirements.md` from its 2026-07-11 v1 (written against migrations 001–029, before the wedge feature had a write path) to **v2**, matched to the app as actually shipped, then **finalized** it (PM ratified the v2 deltas) and added a detailed PR-by-PR + live-execution build plan. Committed to `claude/app-store-demo-account-bwrf87` and opened draft **PR #623**.

The PM's framing shaped it: *"we don't necessarily need data in every feature… I'll defer to the app store consultant for how much."* So the plan was restructured around a **tiered scope menu** the consultant reacts to, rather than the old maximal "make everything fire" seed.

## What actually changed (the load-bearing deltas)

Verified live before writing (not from the doc): `list_edge_functions` (8 ACTIVE — `generate-signal` v27, `generate-report` v14, `analyze-vomit` v9, `analyze-stool` v2, `ask` v4, extractors, `delete-account`); the migration set (001→055); `lib/hydration.ts` `LOCAL_WIPE_TABLES` (the trial tables are now mirrored on-device).

- **D5 INVERTED.** v1 said "reference existing *global* `food_items`, never create rows." Migration 033 (B-354) re-scoped `food_items` to **per-account**, so the demo now creates its **own** venison/beef rows — and *must*, because the `diet_trial_foods` RLS `WITH CHECK` (040) rejects a food the demo user doesn't own. The former catalog-leak hazard is now structurally impossible; the old rule would fail the write. This is the single biggest correction.
- **D10 — seed the real diet-trial lifecycle.** `diet_trials` held zero rows when v1 was written (the story faked a bare row). The B-417 lifecycle shipped (#450–#481), so the seed now writes the real schema — `diet_trials` (`indication`/`phase`/`ended_at`/`transition_started_at`), the dated **`diet_trial_foods`** allowed set, and `target_protein` (053) — and the "contraband beef" is caught by the **shipped** off-diet detector (`lib/dietTrial.ts`), not a fake.
- **§4 mechanism updated.** The trial tables are now mirrored on-device (B-417 PR 2, confirmed in `LOCAL_WIPE_TABLES`), so server-side seeding reaches the trial surfaces via hydration; only `ai_signals` is still read cache-only (why D3's explicit `generate-signal` run is required).
- **D8 — tiered scope menu** (new §3.5): Tier 1 (the floor: creds + non-empty + wedge visible) / Tier 2 (cheap richness: vomit read, weight, stool) / Tier 3 (skip as designed-empty). Consultant sets the Tier 2/3 line; Tier 1 is fixed regardless.
- **D9 — Ask out; Signal-v2 + widget not allowlisted.** Ask is a *correction, not a choice*: its client surface (A5) isn't shipped, so it isn't reviewable. Signal-v2 (`signal_design_v2`) is flag-dark/GA-held → reviewer sees the shipping (classic) Signal. Widget → not allowlisted (B-712 ruling) → neutral empty slot.
- **Rebrand + refresh:** Nyx → Culprit; schema list, Edge Function versions, and the B-152 dependency (email confirmation now ON, SMTP verified — the account-creation gate is cleared).

## The build plan added (§12)

- **12.1 — the single-source-of-truth decision** (resolves S4): a pure-data declarative story module consumed by the SQL emitter *and* both validation suites, so validation can't drift from what's seeded — recommended over pure `.sql` + a parallel fixture, because drift is exactly the failure mode the honesty check exists to prevent.
- **PR 1** — declarative story module + seed emitter + honest-firing validation (a Deno test that ① + ② fire and venison washes out; a jest test that `lib/dietTrial.ts` flags the beef off-diet). **`adversarial-reviewer` mandatory.** Unblocked now — runs offline against the engine, independent of the consultant's Tier 2/3 call.
- **PR 2** — `docs/app-review-notes.md` (nyx-voice, Culprit-branded, placeholder creds).
- **Live runbook (steps 1–6, owner-tagged)** — PM creates the account → Claude resolves ids + runs the emitted seed via MCP → Tier-2 photo + `analyze-vomit` read → POST `generate-signal` → verify (incl. `vet-report-cold-read` CLINIC-READY) → re-seed + re-generate right before Submit.

## Decisions ratified this session (PM)

- Scope framing = the tiered menu (D8). PM: *"Perfect scope. Love it."*
- Ask out of the demo (D9). PM: *"Leave it out of scope."*
- Finalization = ratification of the v2 deltas (D5 inversion, D8, D9, D10). D5 explicitly flagged as reversing a ratified v1 decision; forced by the shipped schema anyway.

## Why the Cooper story dodges the B-494 hold

The live `generate-report` (v14) still carries the pre-refusal-band heuristic (the B-494 redeploy is held). That hold bites a *refusing* patient (empty safety band read as reassurance). Cooper is a **found-trigger + mild-dip** story, not a refusal, so the held detector isn't the one his report needs and it renders correctly. Recorded in §3.2 so a future session doesn't "improve" the story into a refusal case and walk into the gate.

## Residuals / open

- **Consultant's Tier 2/3 line** (§3.5) — the one open item, non-blocking (Tier 1 is the floor). PM to take the menu to the App Store consultant.
- **Credentials** (email convention + password) — a Phase-D PM action; recommendation earlier in-session was `appreview@getculprit.app` (branded, routes via Cloudflare) + a generated strong password, both entered only in ASC (D4).
- **Auth email templates still say "Nyx"** (hardening audit §B7) — a reviewer creating their own account would see it; same submission window, tracked in STATUS.
- **PR 1 + PR 2 not yet built** — this session was the plan only.

## Gates

`adversarial-reviewer`: **N/A this session** — no clinical/statistical *logic* changed (a planning doc). The gate is scheduled for PR 1 (the seed's honest-firing) and is written into the plan as mandatory. Pre-push CI green (212 suites / 4762 tests) on the docs-only diff.
