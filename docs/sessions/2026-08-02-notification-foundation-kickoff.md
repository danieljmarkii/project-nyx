# 2026-08-02 — Notification foundation kickoff (B-661)

**Type:** team convening / discovery → requirements. **PR:** shipped via #559. **No app code, no schema.**

_(Track filed in-session as B-658/B-659; **renumbered to B-661/B-662 at wrap** — both IDs were taken on `main` first the same day by #557's "% given" dose-card row and #558's purge-guard residuals row; first-lands-keeps per B-435. References below use the final IDs.)_

## What happened

The PM convened the product team on notifications — named as the product's main current feature gap — with explicit direction: don't design the eventual workflows (med reminders, feeding reminders, vet-appt reminders) now; build **Part 1**, the underlying infrastructure (permissions/consent, delivery plumbing, the settings surface) plus one first notification: a **fixed-time 9pm daily summary** of the pet's day.

Pre-work established the real state: zero delivery capability (no `expo-notifications`; `plugins/withoutPushEntitlement.js` actively strips the push entitlement), the settings Notifications screen already mocked for exactly this un-mocking (B-283 §5, D7 safety gate), `logged_via='notification'` already live (B-289), and the 2026-07 discovery having already established that local scheduling needs no push provider. Backlog sweep: B-288, B-227, B-015, B-543, B-292, B-002 — plus two standing Open Questions (push provider; the Principle-4 confirmation-vs-nudge conflict).

## The four PM rulings (same sitting)

1. **D1 — Principle 4 full carve-out.** Consented schedules are tools, not nudges; guarded by per-schedule opt-in, fail-safe silence, self-pruning, per-account budget. Resolves the 2026-07-10 OQ, **unblocks B-288**. The Designer's one-bucket dissent is recorded in the spec and shaped the guardrails. Tier-2 `design-principles.md` §4 edit flagged (spec §11), not written.
2. **D2 — local-first.** Part 1 ships entirely on `expo-notifications` local scheduling. The push-provider OQ narrows to server-initiated push (Part 2). Entitlement-stripper stays.
3. **D3 — safe body + Day Summary screen.** The body never asserts record contents (iOS runs no JS at local fire time → any content-bearing body can misstate the record; a stale "no incidents" is forbidden reassurance). Tap opens a live-rendering Day Summary surface. One notification per account across all pets.
4. **D4 — server `notification_preferences` + local mirror**, own schema PR.

## Artifacts

- **`docs/nyx-notification-foundation-requirements.md` v1.0** — decision record, consent model, the scheduling primitive (incl. the T&S wipe-path rule: scheduled notifications are cancelled in `wipeLocalSession` — a post-sign-out 9pm summary naming the previous account's pet is the leak class the wipe rules exist for), prefs schema (wall-clock `fire_local_time` as a documented exception to UTC-everywhere), the daily summary (builder + screen + zero-log designed state under the G2 lineage), the G1–G6 safety spine, the PR 1–5 plan (PRs 3–4 mock-gated), AC, deferrals.
- CLAUDE.md: OQ row resolved (Principle 4) + OQ row narrowed (push provider) + Read-These row added.
- Backlog: **B-661** (the track, `Now`) + **B-662** (vet-appt reminders, `Later`) filed; B-288/B-227/B-015/B-543 Blocks cells re-pointed off "push provider".
- STATUS.md: new parallel-track section.

## Open / next

- **Mock round** (`docs/culprit-notifications-mockups.html`): primer sheet, settings three states, Day Summary (ordinary / incident / zero-log / multi-pet), the lock-screen notification. Gates PRs 3–4.
- **PM:** approve the §11 Tier-2 wording for `design-principles.md` §4.
- PR 1 (primitive) and PR 2 (schema) are build-ready now, mock-independent.
