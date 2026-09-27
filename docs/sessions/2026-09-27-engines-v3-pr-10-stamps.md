# Engines v3 PR-10 — the stamps (migration 075)

**Date:** 2026-09-27

Engines v3, Wave 1, step 10: the one schema-only migration serving EN-F (CUL-1267), EN-2 (CUL-1132) and CUL-1201 parts 1 and 3. Shipped via #963; applied to production the same session as `engines_v3_stamps`. Nothing reads or writes any of it until PR-11a.

## What 075 adds

- `app_config.engines_v3_en0`, seeded dark (`{"enabled": false, "allowlist": []}`), server-only. Named for the unit it gates (R-1: keys follow units that ship together).
- On `event_ai_analysis`: `photo_set_key`, `model_id`, `prompt_hash`, `rule_version`, `engine_flags text[]`. Nullable; NULL means pre-stamp; no backfill. Flag review's `model_version` split into `model_id` + `prompt_hash`; `photo_set_key` kept verbatim.
- `freeze_event_ai_analysis_stamps`: an INVOKER trigger refusing any client-role UPDATE that moves a stamp.
- `set_updated_at_monotonic`: `GREATEST(clock_timestamp(), OLD.updated_at + 1µs)` on `event_ai_analysis`, behind a count-only assertion that refuses to apply over a far-future row.
- On `ai_signals`: `engine_flags`, `engine_fingerprint`.
- `signal_shown_log`: append-only by RLS alone (SELECT + INSERT on own pets, UPDATE/DELETE grants revoked, no DELETE trigger), cascades from `pets`, a text hash never the text.
- A shape CHECK on every stamp and log column.

## Decisions made in the session

- **Freeze trigger, not column grants,** for the client-UPDATE hole on the stamps. Column-level UPDATE grants would also close the older hole (a client can write `recommendation` on its own rows), but they replace the whole table's client write posture, and the clone's history was too shallow to prove no installed build writes another column. Filed as CUL-1377.
- **`photo_set_key` is not forced to a SHA-256.** The phone has no hash library, so the CHECK admits hex, commas and hyphens (a hash or a sorted id list) and never a URL, path or words.
- **The log's writer stays the caller's JWT** (as planned; `generate-signal` runs as the caller). The reviewer's stronger option, a service-role writer with an HMAC'd text hash, is left to PR-11a and noted in 075 §5 and CUL-1378.

## Review

`rls-privacy-reviewer` built a Postgres harness and broke the first draft three ways, all same-account: stamps writable by the owner's own JWT, text smugglable through every log column but `text_hash`, and a far-future `updated_at` made permanent by the new trigger (it can pin the phone's read-copy watermark). All fixed before apply. The local replay of the fixed file then caught a fourth: `'{1,4000}'` exceeds Postgres's 255 regex repetition cap, so the first real `photo_set_key` write would have failed. Lesson worth carrying: a CHECK over a column that is all NULL at apply time proves nothing about its pattern; exercise it with a real value before production.

Live probes on the PM's own pet, in one rolled-back transaction: the stamp freeze refuses, a no-op dismiss passes, `updated_at` moves strictly later and cannot be forged, own-pet log insert passes, cross-account insert / forged `recorded_at` / log update / log delete / anon read each refused 42501. Live objects diffed against the harness (function bodies hash identical, 15 CHECKs, grants). Advisors: nothing new beyond the empty log's unused index.

## Follow-ups filed

- CUL-1377: column-level UPDATE grants on `event_ai_analysis`.
- CUL-1378: make `ai_signals` (and possibly the log) server-written.
- CUL-1379: clamp the phone's read-copy watermark.

## Next

PR-11a (the flag read, the pure context builder, the one stamp writer) and PR-12 (the phone copy gains the stamp columns) can start side by side. The PM's uid goes on `engines_v3_en0` by a recorded config update when EN-0 is ready to show.

## Definition of Done (wrap)

- Acceptance criteria (the PR-10 bundle prompt + the three issues' newest comments): all pass; listed on #963.
- Anti-patterns: none introduced. Schema in its own PR; migration pre-flight present; the new functions are pinned, revoked and registered.
- `tsc --noEmit` clean; `jest` 562 suites / 12,687 tests green; CI green on #963.
- Tests: `lib/functionHardening.test.ts` registers both new trigger functions, each proven by mutation. The table's policies, grants and CHECKs are proven by the harness probes and the live rolled-back probe, not by a committed test (no in-repo SQL harness exists to host one).
- Secrets: none new.
- Personas: Dir. of Engineering ✓ (one reconciled stamp vocabulary, single writer deferred to PR-11a) — Trust & Safety ✓ (R-5 line, `rls-privacy-reviewer` three breaks fixed before apply) — Data Scientist ✓ (the log derives first/last shown; no count or engine logic touched) — Designer N/A (no surface) — Dr. Chen N/A (no clinical logic; the "never lower a stored escalation" rule is PR-11a's to honour against these stamps).
- Adversarial review: N/A for clinical/statistical logic (none changed). The falsification pass that applied was access control: `rls-privacy-reviewer` tried an owner rewriting `engine_flags` to NULL so a flag-off re-read could lower an EN-0 escalation (broke, fixed by the freeze; re-probed live, refused 42501), a sentence smuggled through `finding_key` / `engine_flags` (broke, fixed by the CHECKs), and a 2099 `updated_at` pinning the phone watermark (broke, fixed by the assertion; the phone half is CUL-1379).
- Future-self: the stamp freeze is a new pattern (a role-judged INVOKER trigger). In 12 months it still earns its place unless CUL-1377's column grants land, at which point it becomes a second wall rather than the only one.
- PM actions: none new. CUL-1313 stays open; the PM's uid goes on `engines_v3_en0` when EN-0 (PR-13a) is ready to show, not now.
