# 2026-08-15 — Notifications v2 planning: research, team convening, requirements + mock round 3

**Outcome:** shipped via the session PR (branch `claude/notification-system-improvements-ex196q`). No app code. Deliverables: the best-of-breed research brief, `docs/nyx-notifications-v2-requirements.md` v0.9 (§0 D-1…D-6 **open** — the PM rulings gate the build), mock round 3 re-published over the same artifact URL (`af80ad9e-…`), backlog rows B-760/B-761 + six row annotations. PM kickoff: "get up to speed on notifications, convene the team, research best-of-breed, take it out of beta, build an awesome pre-permission screen, make the landing screen a retention lever, find notification types #2/#3, mock and lock requirements."

## State established first (reading, not assuming)

- **v1 (B-661) is shipped and device-verified** — PRs #562/#564/#567/#568/#574; the 9pm fire confirmed on a fresh native build (2026-08-03).
- **Notifications were never in beta.** No `app_config` flag, no `BETA_REGISTRY` row. What reads as "beta": notification-only discovery (B-673), off-by-default with no in-app introduction, and two rough edges (B-672 midnight handoff; the unclosed on-device checklist). So "out of beta" = an **adoption push + finish pass**, not a flag flip. G6 survives untouched.
- **The primer exists and is sound** (sheet, one-shot-guarding, decline-spends-nothing) — the open threads against it were B-666 (stakes line) and B-667 (chrome).
- **The Day Summary is deliberately minimal** — doorway-rows-only per the mock-round-2 ruling (B-670 DEFER), with a recorded rival-Home/G3 rationale. The PM's "boring / massive retention lever" read runs directly at that ruling — handled below as a designed-within-the-line proposal, not a silent flip.
- **`vet_visits` is past-tense** (`visited_at`) — B-662's "pure consumer" claim is wrong; an upcoming-visit fact is a schema + capture decision (and the report's scope cascade + D7 key off `visited_at`, so future-dating it is off the table).

## Research (Sr. Product Designer, subagent, web-grounded)

`docs/research/2026-08-notification-ux-landscape.md` (🧊 frozen; indexed in the research README). Headlines: primers belong at value moments (Duolingo protect-something-real, Atoms intention-first; Calm's bare prompt is the named anti-pattern); the winning landing structure is Whoop's tiered-depth-no-dead-ends with Gentler Streak's register; Oura's craft rule — the notification is a **doorbell, never the content** — is our G1 arrived at independently; health is the highest-trust category; >6 pushes/week ↔ 3.4× uninstall; provisional authorization doesn't out-convert a primer (recommend against, again). The unclaimed move: **the primer-as-privacy-promise** — mock previews are standard, but no surveyed app uses the preview to state what the lock screen *won't* say; our static G1 body makes that honest by construction. Explicit conflict table of patterns we must refuse (streak-savers, guilt win-backs, MyTherapy's 10-minute re-nag, Oura's "No signs" all-clear tier).

## The convening — where the team landed (and the two real conflicts)

1. **"Out of beta" (D-1):** A1 retarget TodayZone's existing today-door to `/day-summary` ("Full day ›") + A2 in-context offer banner on in-app summary visits + A2b value-moment re-surfacing (trial/med-course start, once each). A3 (post-first-week Home card) drawn, held — it spends Principle-3 trust for reach A1/A2 haven't failed to deliver.
2. **Primer v2 (D-2):** sheet sharpened — live lock-screen preview + privacy-promise caption + calm one-shot stakes line (resolves B-666) + per-category parameterization (B3). Full-screen variant drawn for comparison; the content is identical by design, so D-2 is purely a container call.
3. **Day Summary v2 (D-3) — the first real conflict, resolved by design rather than by picking a side.** PM wants a retention lever; the team's recorded B-670 ruling forbids a rival Home. The proposal threads it: **every added element is a record fact or a doorway** — C0 lead line (deterministic precedence: symptoms → trial facts → counts; curation-by-precedence is Home's own safety-leads rule), C1 day arc (SR-1 receipt dots on a time lane), C2 count chips, C3/C4 factual trial/med strips (B-670's own carve-out, existing predicates, dooring to the full cards), C5 forward line (never manufactured), C6 cumulative record line (drawn, cut-freely). Verdicts, scores, AI, viability/coverage/adherence language stay banned; the med strip's four forbidden things apply verbatim.
4. **The second conflict — the night register (D-3b).** The 9pm tap is the app's one natural evening ritual and the night tokens exist; but the brand register rule (and `constants/theme.ts`'s own comment) reserves night grounds for surfaces *working on the pet's behalf* — a record surface in night ink is a deliberate brand amendment (Tier-2), the D8-closed-light family. Drawn side-by-side with identical content; PM call, not a style pick. Two build notes if ruled in: med slate needs a night sibling token; symptom rose swaps to `colorEventSymptomOnNight`.
5. **Portfolio (D-5):** trial milestones first (B-761 — zero schema, serves the wedge; the target-end body must never read as permission to stop the diet, Dr. Chen signs), then vet-visit reminders (B-662 — after the upcoming-visit fact ships), with **B-288 opening in parallel as its own track** (the carve-out was ratified for it; research adds: no re-nag ever, self-pruning speaks Duolingo's self-silencing line). Weekly digest is the research's #1 by evidence and stays parked only on its missing surface (Signals v2's parked weekly review owns that queue) — pulling it forward is a legitimate ruling, named in the brief.
6. **Warmth bundle (D-6):** B-671's opt-in named body, single-pet only.
7. **B-672 (D-4):** fire-day anchor + >1-day clamp — teed as the ruling it always needed; V2-PR-1 when ruled.

## Deliverables

- **`docs/nyx-notifications-v2-requirements.md` v0.9** — §0 decision briefs (D-1…D-6, open), workstreams A (adoption) / B (primer) / C (summary) / D (portfolio, incl. NV-G7 — the mechanical new-category checklist) / E (warmth), G1–G6 carried verbatim, V2-PR-1…7 plan, AC, deferred table. Deliberately **not** marked build-ready: the rulings gate it.
- **Mock round 3** — re-published over the round-1/2 artifact URL (house rule; `<title>` + 🔔 stable; rounds 2/1 preserved below with supersede notes). Frames: A1 door (+ the two-doors alternative drawn inline), A2 offer, D-2a sheet vs D-2b full-screen, D-3a enriched daylight (ordinary-trial + incident days), D-3b night register, trial-milestone / vet-visit / B-288-expanded lock screens, the D-6 neutral-vs-named pair, and the six-ruling decision table. Verified light + dark via headless Chromium (document chrome darkens; app frames stay light; the night frame stays night).
- **Research brief** + README index row. **Backlog:** B-760 (the track), B-761 (milestones); annotations pointing B-662/B-666/B-670/B-671/B-672/B-673 at their v2 homes.

## Gates

Docs/mock session — no app code, no schema, no tests owed (`tests: N/A — no code touched`; Engineer sign-off). `clinical-guardrails` was in the room for every proposed string (all copy on round-3 frames is *proposed*, locking at each PR's own `nyx-voice` + `clinical-guardrails` pass — stated on the page). Designer owned the mock; Dr. Chen's constraints are encoded in the C0 precedence rule, the milestone copy rule, and the banned-patterns table. Persona conflicts (B-670-vs-retention-lever; night-register-vs-brand-rule) surfaced to the PM as D-3's options rather than resolved silently.

## Owed / next

- **The six rulings (D-1…D-6)** — everything downstream queues on them.
- The standing **Tier-2 `design-principles.md` §4 carve-out** wording (Part 1 §11) — still awaiting PM sign-off; re-surfaced.
- If D-3b: draft the brand Tier-2 amendment before V2-PR-2.
- **B-288 scoping doc** (own session): budget number, category-action + background-response spike, reconciliation card, Sam's day-close variant.
- Part 1 on-device checklist (tap-routing / OS-revocation reconcile / sign-out cancellation) — closes before "out of beta" is declared.
