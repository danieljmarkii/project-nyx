# 2026-08-20 — Scoped Linear backlog reconciliation (team Culprit)

**Session type:** discovery / hygiene (backlog-groomer pass). Deliverable = Linear status fixes + this report. No code PRs.
**Scope ruled in:** the 40 `In Progress` issues; the 30 Urgent/High `Todo` issues; a keep/archive recommendation pass over the ~398-issue Medium/Low tail. Ruled out: code-verifying the tail.
**Skipped by instruction:** CUL-98 / CUL-293 (shipped 2026-08-20 via #685/#686) and the five Quick Wins closed that day (CUL-133/151/84/92/446).
**Method:** four parallel read-only verification passes over the `project-nyx` clone (full history, all branches) + the squash-merge ledger (`main` @ #686, 2026-08-19) + `docs/sessions/` records + Linear. Every Done-close below was spot-checked in the main loop against the ledger and the cited file:line before the status was changed. Lens: Product Owner / Backlog Steward (`docs/personas.md`); procedure: `.claude/skills/backlog-groomer`.

> **Note on location:** this record's canonical home is here, `project-nyx/docs/sessions/`. It was first drafted from the `competitive-inteligence` repo (that session's designated branch — PR #12 there, closed in favor of this one) because the initial project-nyx attach was declined; the PM redirected it here the same day.

## Board shape, verified 2026-08-20

| State | Count | Notes |
|---|---|---|
| In Progress | 40 | 36 of 40 had `startedAt == createdAt` at the 2026-08-15 migration — the state was imported, not actively set |
| In Review | 0 | — |
| Todo | 428 | 13 Urgent · 17 High · 154 Medium · 240 Low · 4 no-priority (the "~300" working estimate was low) |
| Backlog | 4 | CUL-17, CUL-19, CUL-531, CUL-532 — deliberate holding pen, left alone |

Two orientation corrections surfaced by the verification itself: STATUS.md's "## Current Phase" header still says *Step 10 — AI Signal (#72–75)* — months stale (the live tracks per Linear projects + sessions are **Signals v2 GA**, **The Daily Recap**, and the **Backlog → Linear cutover**); and **Ask is not currently a live track** — A1–A8 shipped and deployed in July, but Track-3 has had no work since 2026-07-18. Neither doc was edited here (out of scope); STATUS.md's header deserves a one-liner next time it's open.

---

## APPLIED — status corrections (8 closes, each with an evidence comment + PR link on the issue)

### In Progress → Done (6)

- **CUL-71** (B-721 Signal/Home uplift — "SR-6 remaining"): SR-6 shipped via **#620** (2026-08-09, copy/safety + S10 audit + GA gate) + **#622** (beta-shelf join). The GA recommendation it owed was delivered ("HOLD GA, dogfood now"); the GA push is now CUL-546…549; SR-6 copy nits live on as CUL-452.
- **CUL-357** (B-322 CulpritMark pulse frozen on device): fixed via **#341** — native-driver transforms on `Animated.View` (`components/brand/CulpritMark.tsx:16-25` documents the mechanism); on-device confirm 2026-07-26; ring-train retired via #478.
- **CUL-471** (B-401 soft-verify routes to the login wall): fixed via **#436** — "I'll do this later" → `/(auth)` Landing (`app/(auth)/signup.tsx:260-276`), test-locked.
- **CUL-45** (B-413 "panel unread" vs "no secondaries" — "slice 5 remaining"): slice 5 shipped via **#448** — `generate-report` joins the three provenance columns and gates the render on the D10 predicate (`supabase/functions/generate-report/report.ts:276-292`). Prod visibility rides the B-494 redeploy (CUL-19).
- **CUL-207** (B-117 medication logging): all 9 build PRs merged (#192–#207, June) and the PR-10 deliverable verifiably renders — §4/B-117 adherence states (`generate-report/render.ts:33`), per-regimen adherence in appendix D (`render.ts:2684`), lifetime table via #591. Carry-forwards are their own open issues (CUL-244, CUL-411, …).
- **CUL-126** (B-283 Settings screen — "PR 1 of 5" was stale): the "You" screen live since **#316–#318**; PR-5 go-live flips landed via **#362** (`constants/links.ts:22` `LEGAL_LINKS_ENABLED = true`); notifications made real by B-661.

### Urgent Todo → Done (2)

- **CUL-53** (Urgent, B-566 bare coverage ratio over a whole-range refusal): resolved by its own named fix, the R1 refusal register, **#502** (2026-07-28) — `lib/dietTrialCard.ts:803-809` routes a live whole-range refusal to `trial_refusal`, which renders no ratio. Floor-quality follow-ups = CUL-54/57/60. (Cleanup pointer left on the issue: stale pre-#502 comment + fixture at `dietTrialCard.ts:913` / `dietTrialCard.test.ts:2137-2146`.)
- **CUL-52** (Urgent, B-562 exposures list screen missing): shipped via **#530** (2026-08-01) — `app/trial-exposures.tsx` (per-feeding rows, rung + reason sheets), `view_exposures` wired from the profile card (`app/(tabs)/profile.tsx:1188`).

### Deliberately NOT closed despite shipped code (1)

- **CUL-31** (High, B-766 pooled lead vs phenotype rows): Option A shipped via **#662** and is live in deployed v30 — but it shipped *provisionally*, and the PM's 2026-08-20 GA plan (CUL-546) explicitly closes it as-ruled at GA-4 after ratification. Closing it today would preempt that ruling. Left open, tagged decision.

---

## PART 1 — the 40 "In Progress" reconciled

**Verdict distribution: 6 closed Done · 3 genuinely active · 12 engineering-complete-awaiting-one-named-step · 18 parked (recommend → Todo) · 1 unclear.** Only CUL-30's track is actually moving; 36 of 40 states were migration imports.

### Genuinely active — leave In Progress (3)

- **CUL-74** (Signals v2 build track): title's "PRs 6, 7, 10 remaining" is stale (all merged 2026-08-15 — #650/#652/#655); the live remaining slice is the single gated `generate-signal` redeploy (bundle staged, held on PM/Dr. Chen sign-off). Track activity through 2026-08-18. *Title/description refresh would help the next reader; not edited here.*
- **CUL-530** (kickoff prompts carry a Linear link): complete on **draft PR #668** (branch tip 2026-08-17), unmerged — Done the moment #668 merges.
- **CUL-30** (Notifications v2 / Daily Recap umbrella): DR-0…DR-7 all merged (#645, #651–#661) and the track was still landing follow-ups on 2026-08-18 (#676); its own open slice is the §5.5 portfolio-slate PM reaction + finish-pass decision briefs.

### Hands off — flagged, untouched (1)

- **CUL-83** (B-164 edited-vomit failed-re-analysis hides corrections): flipped to In Progress 2026-08-19T23:12Z but **zero artifacts anywhere** (no branch, PR, session record, or comment; defect confirmed still present at `components/event/VomitAnalysisSection.tsx:242-261`). Either an in-flight unpushed sibling session or a stray flip — **PM: confirm which**; left untouched per the don't-disturb rule.

### Engineering-complete — one named non-code step remains (12; recommend a "waiting on PM/device" convention rather than In Progress)

The biggest source of the misleading count: code fully shipped, one named PM/device/decision step left. Leaving them In Progress reads as active build work; moving them to Todo hides that they're ~95% done. Recommendation: PM picks a convention (a `waiting-on-PM` label, or Todo + the remaining step as the first description line). Nothing moved this pass.

| Issue | Shipped | The one remaining step |
|---|---|---|
| CUL-44 (B-403 config hardening) | #511, migration 047 applied, advisors 9→2 | PM: flip leaked-password protection in the Supabase Auth dashboard (~1 min) |
| CUL-43 (B-432 signup deep-link) | #494 + dashboard config | Device: dev-client on-device pass |
| CUL-39 (B-275 app icon) | #307/#309/#310 | Device: iOS dark/tinted icon render check |
| CUL-68 (B-664 widget v2) | #569/#570/#577 | PM device: native TestFlight cut (build 36) + on-device pass |
| CUL-64 (B-704 trial protein capture) | #594–#598, both gates clean | PM: the B-494 `generate-report` redeploy (= CUL-19) |
| CUL-188 (B-271 demo account) | #627/#628 | PM: run the live seed (runbook step 2+) |
| CUL-173 (B-269 listing assets) | #619/#617/#624/#625 | PM: subtitle call + final ASC uploads |
| CUL-179 (B-182 chronicity lane) | #246/#247/#250, redeploy cleared 2026-07-18 | Dr. Chen: D2 `minEpisodes` 6-vs-5 ratification |
| CUL-425 (B-433 squash-only ruleset) | verified-open + comment 2026-08-18 | PM: ~30s GitHub settings flip (agent tokens lack Administration) |
| CUL-70 (B-712 beta program) | #605/#608/#611/#614 — the title's "copy/name decisions" actually shipped | PM device: TestFlight cut carrying the B-725 door + 4-item pass |
| CUL-51 (B-533 trial-card viability) | #498 + #502 | Dr. Chen: stand-down/feline rulings + mock round (4 undrawn disclosure lines) |
| CUL-219 (B-274 Culprit naming) | #307/#309/#310; `app.json` name="Culprit" | PM: ASC record-title rename (console); fuller repo rename deliberately post-launch |

### PARKED — recommend → Todo (18; PM confirms, nothing moved)

Slice A (4):
- **CUL-522** ([A] dual-source bleed close-out) — flipped In Progress 2026-08-16 but the one-time port/verify never ran (spot-check: B-128/B-137/B-441 absent in Linear). Parked since 2026-08-16.
- **CUL-50** (B-530 refusal lane vs identity misses) — partial #503 (2026-07-28); residuals re-filed to CUL-59 (zero commits); also behind the held B-494 redeploy. Parked since 2026-07-28.
- **CUL-140** (B-284 in-app brand alignment) — last slice #478 (2026-07-26); N4/N6/N7 untouched, two of them behind the GA call. Parked since 2026-07-26.
- **CUL-358** (B-502 vet-report page-1 length) — empty-block half #582 (2026-08-04); caveat de-dup re-filed to CUL-480; the wanted Designer pass never ran. Parked since 2026-08-04 (Designer-gated).

Slice B (14), each "looks parked since \<date\>, recommend → Todo":
- **CUL-353** (B-053 why-no-signal diagnostics) — v1 shipped #115; the (e) add-protein diagnostic still explicitly deferred in code (`detection.ts:5155-5156`), its B-052 write-time gate never shipped. Since 2026-06-07.
- **CUL-399** (B-075 shared Header primitive) — `log.tsx` migrated via #633, but `vet-visit.tsx:368` and `food-capture.tsx:1127` still hand-roll headers. Since 2026-08-13.
- **CUL-244** (B-122 med-catalog identity policy) — structural half #199; the identity-marker reject + capture nudge never built. Since 2026-06-19.
- **CUL-411** (B-135 double-dose flag) — detail-screen check live (`app/event/[id].tsx:262-325`); the Dr. Chen window-shape call never happened; log-time card split to CUL-157. Since 2026-06-20 (decision-gated).
- **CUL-376** (B-333 care-first monetization line) — first surface only (`constants/monetizationCopy.ts:19`); Settings/paywall registers bare; §7.6-vs-§16 wording unresolved. Since 2026-07-14.
- **CUL-317** (B-325 retroactive/med-first combo linking) — direction ① shipped #342; direction ② explicitly "STILL HELD" on B-111. Since 2026-07-12 (decision-gated).
- **CUL-222** (B-040 free-fed model) — R1 + report rendering shipped (#119–#123, #262); shared-bowl attribution split out; no work since 2026-07-02.
- **CUL-144** (B-023 preferences zone) — PRs 1–4 shipped; PR 5 (dashboard→vet-report bridge) never built though its gate cleared in July. Since 2026-06-14.
- **CUL-141** (B-102 human-food format) — PRs 1–6 shipped incl. the vet-report line (`render.ts:3891`); only PR 7 (in-app confounder note, spec'd "Later — its own feature") remains. Since 2026-07-03. *Near-closable; PM could rule PR 7 out of scope and close.*
- **CUL-103** (B-251 onboarding revamp) — PRs 1–10 shipped in one burst; PR 11 (functional social sign-in; `SOCIAL_AUTH_ENABLED=false`) untouched. Since 2026-07-06.
- **CUL-101** (B-093 dashboard doorways) — symptom doorway #164; intake-rate doorway + ranking/composition screens never built (`computeIntakeRateSeries` exists only as a comment, `lib/analytics.ts:766`). Since 2026-06-15.
- **CUL-91** (B-246 chronicity flag tally trace) — defect confirmed still present as a deliberate deferral (`generate-report/report.ts:3349-3379`). Since 2026-07-04.
- **CUL-65** (B-705 derived-arm source gate) — B-704 PR 5 explicitly deferred it (`report.ts:3078` still plain `canonicalizeProtein`). Since 2026-08-05.
- **CUL-38** (B-228 Ask Track-3) — A1–A8 shipped + deployed (#398–#410); Track-3 (RevenueCat/Premium + QA + flag flip) unstarted; sessions still call it "deferred". Since 2026-07-18.

---

## PART 2 — the genuinely-open Urgent/High shortlist (the map for the next build batches)

Verified current (file:line confirmations on the issues' claims), tagged, most impactful first.

**Purely engineering — buildable now:**
1. **CUL-72** (Urgent) — Signal E1 building-state load-flash + pet-switch `localCtx` staleness (`components/home/SignalZone.tsx:107`, `hooks/useSignal.ts:153-159`). Now a named CUL-549 pre-flip gate — first Phase-0 GA work.
2. **CUL-547 + CUL-548** (High) — GA-1/GA-2 flag retirement; verified fully unstarted (both flags live at every cited site); lands as one combined Phase-1 PR per the CUL-546 plan.
3. **CUL-69** (Urgent) — chronicity onset renders a lookback-bounded date as absolute "first logged" (`generate-report/render.ts:1406-1415`; censor guard keys only on `scope.startDate`).
4. **CUL-49** (Urgent) — refused trial never states how long intake has been unlogged (`render.ts:1290-1307`; a naive fix was tried and reverted in #503 — must compute from the intake log).
5. **CUL-62** (High) — out-of-window guard names count/date but never TYPE + doesn't fire on preset scopes (`render.ts:1133,1152-1154`; `report.ts:983-1002`).
6. **CUL-61** (High) — refusing cat's page 1 needs the consecutive-refusal RUN, not a denominator (`render.ts:1287,2431`; no run computation exists).
7. **CUL-40** (High) — paywall bullets still placeholder despite D-M1 ratified 2026-07-12 (`app/onboarding/paywall.tsx:39-43`) — unblocked bullet swap + voice/review re-run.
8. **CUL-546** (High, umbrella) — the GA plan itself; phase-per-session with PM gates interleaved.
9. **CUL-34** (High, umbrella) — per-incident AI rollout: infra + vomit + stool shipped; skin/eye analyzers unbuilt; no children attached in Linear yet.

**Decision-gated (route to PM / Dr. Chen before any build):**
10. **The refusal-floors package — CUL-54, CUL-57, CUL-60 (+ CUL-59's dilution half)** (3 Urgent + 1 High): all confirmed live in code (`lib/dietTrial.ts:1842-1866, 2527-2543`; `dietTrialCard.ts:795-801` carries the "STILL DR. CHEN'S" marker; the B-579 KNOWN-LIMIT tests still assert both blind spots). They converge on **one Dr. Chen sitting** (floors, duration criterion, recency threshold) — the single highest-leverage decision on the board.
11. **CUL-55** (Urgent) — free-fed bowl vs refusal-register ranking (`dietTrialCard.ts:1168` ranks `trial_refusal` above `free_fed`) — a whether-ruling, then small code.
12. **CUL-381** (Urgent) — WSAVA intake-scale explainer: Dr. Chen boundary copy + Designer reveal-form, then trivial build (`components/log/IntakeChipRow.tsx:37-72` bare labels confirmed).
13. **CUL-372** (High) — Signal reflection duplicates Trend counts with an independently computed window (drift risk, `signalCopy.ts:479` vs `useTrend.ts:79-107`) — suppress/demote/differentiate pick.
14. **CUL-32** (High) — Daily-Recap refusal-aware count chips (`components/recap/CountChips.tsx` has zero refusal awareness while the #656 lead names it) — needs the refusal-as-intake-attribute model ruling.
15. **CUL-31** (High) — shipped provisionally via #662; PM ratification at GA-4 closes it (see APPLIED note).

**Designer-gated:**
16. **CUL-56** (Urgent) — refusal register suppresses its own teach line + no recency (`dietTrialCard.ts:1590-1623` vs `:1768`) — Designer for the card composition, Dr. Chen for the recency number.
17. **CUL-28 + CUL-29** (High) — watching-system copy rows (quieted-pet Timing copy; escalate-only gap row) — Phase-0 GA gates, one session with CUL-72 per the GA plan.

**PM-action (no engineering content):**
18. **CUL-549** (High) — the GA flip itself (`app_config` UPDATE; blocked on Phase 0/1 + a fresh device build).
19. **CUL-46** (Urgent) — widget on-device pass + TestFlight build-36 cut (PM's device).
20. **CUL-66** (Urgent) — B-280 go-live: GoTrue dashboard checklist + device matrix (recovery isn't live until this).
21. **CUL-48** (High) — mint the Supabase PAT as a cloud-env secret (`scripts/deploy-edge.sh:221-222` hard-errors without it); unblocks every Edge deploy + GA Phase-3. **CUL-37 is a dedup candidate into this** — post-#679 their un-shipped remainder is identical.
22. **CUL-47** (High) — re-source or downgrade the "20–30% adherence" figure (doc ruling; warning box still in `nyx-diet-trial-requirements.md:124`).

**Cross-cutting:** the held **B-494 `generate-report` redeploy (CUL-19)** gates prod visibility of CUL-64, CUL-45's shipped fix, and CUL-50's partial fix; the **`generate-signal` redeploy** (CUL-74) is staged awaiting sign-off. Two deploys would make several "shipped" facts real.

---

## PART 3 — Low/Medium tail: keep/archive RECOMMENDATIONS (PM rules; nothing archived)

Triaged from titles/descriptions only (~398 issues: 154 Medium, 240 Low, 4 no-priority). Default for anything not listed: **keep**.

### A. Linear-workspace boilerplate — archive (4)
CUL-1 / CUL-2 / CUL-3 / CUL-4 — Linear's own onboarding starter issues (2026-07-10), not product work.

### B. Superseded by the backlog→Linear migration — archive (3, +1 check)
- CUL-431 (B-486) — "Open rows inside the ## Done table": maintenance of the now-frozen `docs/backlog.md`.
- CUL-404 (B-387) — backlog archive-split + Status-cell cap: process work on the retired file.
- CUL-263 (B-492) — seven duplicate B-IDs in the markdown: Linear IDs can't collide; the groomer skill itself retired this check. (A one-line note in backlog.md's banner would fully retire it.)
- CUL-410 (B-389) — consolidate the two Open-Questions homes: partially superseded; 2-minute re-read before ruling.

### C. Decision/question rows mis-shelved as Todos — move to the decision register / Open Questions (12)
CUL-267 (TRIAL_OVERRUN_GRACE_DAYS ratification — Dr. Chen) · CUL-247 (timingReliable predicate — DS + Dr. Chen) · CUL-413 (brand-first drug naming — clinical call) · CUL-272 (`is_critical` spec conflict) · CUL-90 (paywall placement revisit) · CUL-334 (retire owner-severity capture?) · CUL-361 (category hue?) · CUL-420 (higher cap for document photos?) · CUL-448 (primer one-shot signal?) · CUL-456 (scope-chip narrowing?) · CUL-145 (age-input deviation sign-off) · CUL-86 ("Default"→"Automatic" consider-item). These are rulings, not work; as Todos they pad the count and hide real engineering.

### D. Accepted-decision / awareness-only records — archive as recorded-no-action (5)
CUL-89 (B-091 — title says "accepted decision") · CUL-482 (B-439 — "deliberately NOT shipped") · CUL-395 (B-074 — fails safe, STATUS carries it as awareness-only) · CUL-87 (B-169 — contingent on a feature that doesn't exist) · CUL-183 (B-163 — real-data-gated awareness residual).

### E. Someday-maybe with no path — archive or icebox (8, +2 borderline)
CUL-220 (Apple Watch app) · CUL-210 (hardware-capture spike) · CUL-201 (Live Activity watch window) · CUL-507 (video capture + analysis) · CUL-110 (waitlist page, filed "(deferred)") · CUL-465 (post-launch PPO test) · CUL-469 (Custom Product Page) · CUL-427 (blue-sky picker directions, an explicit "revisit gate"). Borderline, keep if still roadmap: CUL-269 (ingredient-level correlation tier) · CUL-85 (AI context-pack export).

### F. Periodic chores mis-modeled as backlog items — move to a recurring routine / the CI repo (3)
CUL-256 (quarterly competitive re-check) · CUL-233 (landscape column + teardown) · CUL-268 (capture-speed benchmark). The PM already runs a separate competitive-intelligence workflow; these age poorly as Todos.

### G. Dedup candidates — link or fold, don't hold two live rows (7 clusters; flagged only)
- **CUL-536 ↔ CUL-537** — same `occurred_at_source` guard; a session commit literally corrected "CUL-536 → CUL-537". Keep 537.
- **CUL-487 ⊂ CUL-319** — B-612 supersets B-604's "no rendered artifact exercises est/range/duplicate-log" gap.
- **CUL-494 ↔ CUL-495** — both: correlation-null line needs denominator + power; one fix site.
- **CUL-227 ↔ CUL-235** — internal `Nyx*` rename ↔ docs codename sweep; one Nyx→Culprit sweep.
- **CUL-97 ↔ CUL-231 ↔ CUL-146** — three orphaned-Storage sweeps; one umbrella, three buckets.
- **CUL-359** — owner-configurable reminders duplicates the Notifications-v2 portfolio's territory (CUL-253/107/108).
- **CUL-37 → CUL-48** (High tier, from Part 2) — post-#679 their un-shipped remainder is identical (the PAT).

### H. Cheap verify-first candidates for the next quick-wins batch (not prunes)
CUL-506 (dead `symptom` step — the More-events-picker PRs reworked that surface) · CUL-501 (orphaned `attachmentStore.ts`) · CUL-472 (beta-shelf hint — that area moved recently). Same lesson as 2026-08-20: verify before building.

### Hygiene note
CUL-157's title is a full paragraph (the NARROWED ruling text) — retitle to the residual when next touched.

---

## Needs PM decision (Open Questions routed, not resolved here)

1. **CUL-83's In Progress flip** (2026-08-19 23:12Z, zero artifacts) — in-flight session or stray flip?
2. **Convention for "engineering-complete, one PM/device step remains"** (12 issues above) — label vs Todo-with-note; today they masquerade as active builds.
3. **The Dr. Chen refusal-floors sitting** (CUL-54/55/56/57/59/60 package) — scheduling it unblocks 6 Urgent/High issues at once.
4. **The two held redeploys** (`generate-report` B-494 / CUL-19; `generate-signal` / CUL-74) — each is one sign-off from making several shipped fixes real.
5. **Part 3 archive groups A–F** — rule per group (≈35 issues), not per issue.
6. **The 18 parked-In-Progress → Todo moves** — batch-approve or amend the list above.

## Outcome tally

- Verified: 40 In Progress + 30 Urgent/High Todos against code/ledger/sessions (70 issues; ~11% of the verified set was already done, vs ~60% in the Quick-Win-labelled sample — the bias in that sample was real).
- **Closed Done with evidence: 8** (6 In Progress, 2 Urgent Todos).
- Left open on purpose despite shipped code: 1 (CUL-31, ratification-gated).
- Parked-In-Progress recommended → Todo: 18. Engineering-complete-awaiting-one-step: 12 listed for a PM convention.
- Dedup candidates flagged: 7 clusters. Archive candidates for PM ruling: ≈35 across 6 groups.
- Genuinely-open Urgent/High shortlist: 22 entries, tagged {engineering 9 · decision 6 · designer 3 · pm-action 5}, with the two redeploys called out as the cheapest unlock.

---

## ADDENDUM — PM rulings applied, same day (2026-08-20)

The PM ruled on the three recommendation groups; all applied in Linear with a trail comment on every touched issue.

**Ruling 1 — parked In-Progress → Backlog (18 moved).** The PM chose the `Backlog` state (holding pen) over the recommended Todo: CUL-522, CUL-50, CUL-140, CUL-358, CUL-353, CUL-399, CUL-244, CUL-411, CUL-376, CUL-317, CUL-222, CUL-144, CUL-141, CUL-103, CUL-101, CUL-91, CUL-65, CUL-38. Each carries a "looks parked since \<date\>" comment with its evidence. (CUL-141 remains near-closable — ruling PR 7 out of scope would close it.)

**Ruling 2 — "Waiting on PM" convention created.** New team label **`Waiting on PM`** ("engineering-complete; one named PM/device/decision step remains"). Applied to **10** issues, each with a comment naming its single remaining step: CUL-44 (Auth-dashboard toggle) · CUL-43 (deep-link device pass) · CUL-39 (icon render check) · CUL-68 (TestFlight cut + device pass) · CUL-64 (B-494 redeploy = CUL-19) · CUL-188 (live demo seed) · CUL-173 (subtitle + ASC uploads) · CUL-179 (Dr. Chen D2 ratification) · CUL-425 (squash-only settings flip) · CUL-51 (Dr. Chen rulings + mock round). The PM sweeps this label view and closes/updates each. **Two of the twelve were excluded after checking live state:** the App Store Launch project (created earlier today, PR #687) gave **CUL-70** (the "Early access" rename slice, M1) and **CUL-219** (the four auth email templates, M2) fresh engineering scope — both corrected in-thread and left unlabeled.

**Ruling 3 — tail archive (22 canceled-as-archived).** Linear's API has no archive verb, so these went to `Canceled` with a per-issue reason; they auto-archive from there and restore in one click:
- A · Linear boilerplate (4): CUL-1, CUL-2, CUL-3, CUL-4.
- B · superseded by the migration (3): CUL-431, CUL-404, CUL-263.
- D · accepted-decision / awareness-only records (5): CUL-89, CUL-482, CUL-395, CUL-87, CUL-183.
- E · someday-maybe, no current path (7): CUL-220, CUL-210, CUL-201, CUL-507, CUL-110, CUL-469, CUL-427.
- F · periodic chores (3): CUL-256, CUL-233, CUL-268 — noted as belonging with the recurring competitive-intelligence workflow / a scheduled Routine.

**Held back from ruling 3, deliberately:**
- **CUL-465** — pulled from the cancel list at the last check: the App Store Launch project adopted it into **M6 · Review week + post-launch fence** two hours before this pass ran. Don't disturb.
- **Group C (12 decision rows)** — CUL-267, 247, 413, 272, 90, 334, 361, 420, 448, 456, 145, 86: these are *open decisions*, not stale work; the record recommended moving them to the decision register / Open Questions, not archiving. Archiving would hide pending rulings, so they stay Todo pending an explicit call (say the word and they get the same treatment, or a decision-register migration).
- **CUL-410** (needs its 2-minute re-read first) and the two borderline keeps **CUL-269 / CUL-85** (keep-if-roadmap).
- **Dedup clusters** — still recommendations only; nothing merged or marked duplicate.

**Net effect on the board:** In Progress 40 → 16 (3 active · 1 unclear CUL-83 · 10 Waiting-on-PM · CUL-70 + CUL-219 re-scoped by the launch project); Todo −24 (2 closed, 22 archived); Backlog +18; Done +8. (Absolute totals shifted further the same day by the App Store Launch project's own new issues — deltas here are this pass's only.)
