# Culprit — Food Library Trial-Awareness Requirements (B-616 + B-458 combined build)

**Version:** 1.2 — SHIPPED | **Last Updated:** 2026-08-01 | 🌱 Living
_v1.2 (2026-08-01): PRs 0–4 all shipped; three PR-3 `pm-feature-review` findings ruled + closed (D9–D11 below) — the Foods-tab pet subtitle (B-626), the trial strip naming its foods rather than counting them (B-627), and the mid-trial add's vet-framing caption (B-628). Copy pack §4 updated for the two copy changes._
_v1.1 (2026-07-31): §6 expanded into the full per-PR build plan — scope, files, acceptance criteria, DoD gates, and per-session kickoff prompts, on the PM's request. No product decision changed._

**Origin:** PM dogfood feedback 2026-07-30 ("the Food library has almost no awareness of the foods eligible during the diet trial") → same-day persona session → mock round 1 (`docs/culprit-food-library-trial-mockups.html`) → PM review + rulings 2026-07-31. Session record: `docs/sessions/2026-07-31-food-library-trial-awareness.md`. Backlog: **B-616** (this track) + **B-458** (the two list screens, absorbed as the combined build's core) + **B-475** (consumed by §4.6).

**Every product decision is ruled. The build is gated on one engineering item: B-556** (the `narrowRole` disagreement — `lib/trialContaminant.ts` maps an unknown role to `primary_diet` where `lib/dietTrialFacts.ts` and `generate-report/trial.ts` map it to `permitted_other`; flagged as blocking before another surface reads the allowed set). PR 0 closes it.

---

## §0 Decision record

| # | Decision | Ruling | Authority |
|---|---|---|---|
| D1 | Sequencing | **Promoted to Now; combined build with B-458**, gated on B-556 | PM, 2026-07-31 |
| D2 | Marking polarity | **Positive only.** The library names the list on foods that are ON it; no food is ever marked off-diet (closed-world would mark ~the whole pantry), and a mark's absence is never a verdict either way (G2, two-sided) | Team, from spec §5.2/§2.1; PM-reviewed in mock |
| D3 | Membership predicate | **One predicate: `matchAllowed` (`lib/dietTrial.ts`)** — `food_item_id` first, then the case-folded brand+product key. No surface re-derives membership (the `report.ts:2246` third-definition lesson; the §5.4 re-photographed-bag hazard) | Standing rule, restated |
| D4 | Log-time picker | **Variant H ratified: a pinned "On the trial list" section at the top of the FoodPicker while a trial is active.** Ordering, not marking — no glyphs, no warnings, no tile chrome; everything else stays reachable below, unmarked. The completion-card post-commit flag is unchanged and is never replaced by the picker. **B-439's per-tile trial-marker option (variant G) is closed** | PM, 2026-07-31 (mock round 1: "H is the clearest"); team concurred — H is the only variant that helps without marking anything, so the §6.4/Dr.-Chen log-suppression constraint holds by construction |
| D5 | Mid-trial add | **In.** An owner can add a food to the allowed set mid-trial. Mechanism is §3.2's dated membership exactly as shipped: new `diet_trial_foods` row, `allowed_from` = today, role derived via `permittedRoleForFood` (never asked — Principle 1). **Feedings before today keep the reading they already have** — an add never rewrites history, and the confirm sheet says so | PM, 2026-07-31 |
| D6 | Foods-tab entry | A **trial strip** under the Foods header while a trial is active (day counter + "N foods on the trial list"), opening the allowed-set screen | Mock round 1, PM-reviewed |
| D7 | Pet scope | The library is per-account; trials are per-pet. **All trial chrome (strip, chips, picker section, detail row) renders for the active pet context only**, and the strip names the pet when the account has >1 pet. Build-time detail: the Foods tab and picker already operate in a pet context (`getRecentFoods(petId…)`, stats); the trial reads join on that same `pet_id` | Team; PM-reviewed in mock (flagged as the open build question; resolved: pet-context-scoped) |
| D8 | Mid-trial removal | **Out of v1.** Schema supports dated removal (`allowed_until`); no UI writes it in this track. Backlog residual on the B-616 row | Team; round 1 draws add only |
| D9 | Foods-tab pet context (B-626) | **A persistent `{Pet}'s library` subtitle** under the Foods header, whenever there is an active pet — NOT gated on multi-pet or on a trial. Three layers of the tab are per-active-pet over a per-account library (favorites shelf, intake notes, trial chips + strip); the subtitle is the one always-visible owner for all of them, so a chip on a shared library is not ownerless and an empty trial band reads as "this pet has no trial" rather than a dropped one. The mock's screen-A subtitle, restored | PM, 2026-08-01 (PR-3 review, decision 4) |
| D10 | Strip line names, not counts (B-627) | The Foods-tab strip's second line **names the foods** (`{lead}, and N more`, lead = the `primary_diet` row) rather than `{k} foods on the trial list`. The count pointed at the 10-second answer one tap away instead of giving it on the wedge's own surface. Truncation on long product names is the accepted cost (the strip is `numberOfLines={1}`; the full list is one tap away on §2.2) | PM, 2026-08-01 (PR-3 review, decision 1) |
| D11 | Vet framing on the add (B-628) | **A quiet caption on the confirm sheet** (both entry points share it): *"Extras are your vet's call — Culprit just records the dates."* FR-9's vet line only rendered on §2.2's empty extras group, so the add framed legitimacy from neither entry point. This is framing, NOT a wisdom-check (D5 / Dr. Chen's mock-C note forbid "are you sure this fits the trial?" — it states whose call an extra is, never second-guesses it, never blocks, never marks off-diet). Backlog option (c); it deliberately changes both entry points | PM, 2026-08-01 (PR-3 review, decision 2) |

## §1 The rules that govern every surface here

- **R1 — positive marking only** (D2). Copy is always about the *list* ("Trial diet", "Also allowed", "On Biscuit's trial list · since Jul 31"), never about the owner or the pet's behavior, never praise/blame (the C6 register), never a warning.
- **R2 — one predicate** (D3). Every membership render calls `matchAllowed` with the same dated `membershipOn` gating the classifier uses. A surface that can't hydrate the allowed set renders *nothing* — never a guess, never an "unknown" badge.
- **R3 — §6.4.** A pre-decision surface may verdict; a record surface may not. The library/detail/allowed-set screens browse → they may speak. The picker logs → it may only *order* (D4); nothing gates, warns, or judges at log time. Dr. Chen's constraint, restated because it decided D4: an owner must never hesitate to log a transgression — an unlogged exposure is worse than the exposure.
- **Standing guardrails unchanged by this track:** G2 (no negative claim at any coverage, two-sided), §6.9 (no coverage scores/streaks/badges — the chips here mark *identity*, not performance), C2 (trial-diet self-contamination stays a trial-level standing fact; the B-351 contaminant note is independent and untouched), B-005 (archive filters library/picker reads only; a chip never resurrects an archived tile), §6.7 record-and-continue.

## §2 Surfaces

### §2.1 Foods tab (mock screen A)
- **FR-1** While the pet's trial is active (`isTrialRunning`, never raw `status`), render the trial strip under the header: `Diet trial — day N of M` / `K foods on the trial list`, tap → §2.2. Multi-pet accounts prefix the pet's name (D7).
- **FR-2** Tiles whose food is on the allowed set today carry a chip: `Trial diet` (`primary_diet`) or `Also allowed` (any permitted role). All other tiles are untouched (R1).
- **FR-3** No coverage, adherence, or count-of-matches appears anywhere on this tab (§6.9).
- **FR-4** Trial ends (by `isTrialRunning` going false): strip and chips disappear on next render — no stale trial chrome, no farewell state.

### §2.2 Allowed-set screen — "What {pet} can eat" (mock screen B; the B-458 first half)
- **FR-5** Reached from: the trial strip (FR-1), the trial card's existing action surface, and food detail. Lands by passing a handler to `DietTrialCard` per B-458's note — no card change.
- **FR-6** Rows grouped `Trial diet` / `Also allowed`, each row a dated membership fact (`on the list since <date>`; a mid-trial add reads `added <date>, day N`).
- **FR-7** The C6 LOCKED disclosure line renders on this screen, verbatim: *"While the trial runs, Culprit records which feedings matched the trial diet and which didn't, with dates. That's the part your vet needs."*
- **FR-8** Primary action: `Add a food to the list` → §2.3.
- **FR-9** Empty "Also allowed" group renders a designed empty state (Principle 5): *"Just the trial diet for now. If your vet okays an extra, add it here."*

### §2.3 Mid-trial add (mock screen C)
- **FR-10** Entry: FR-8, and food detail's action (FR-14). Food selection reuses `FoodPicker` in selection mode (the start-modal machinery).
- **FR-11** Confirm sheet states exactly three facts — the food, `Joins the list: Today, <date> · day N`, `Earlier feedings: Keep the reading they already have` — and two actions, `Add to the list` / `Not now`. No role question, no wisdom-check copy (D5; Dr. Chen note in the mock: the dated record is the safety mechanism, second-guessing the vet's call would judge the owner).
- **FR-12** Write path: one new function in `lib/dietTrialSetup.ts` (`addTrialFood`), single insert + mirror + sync flush, reusing `buildTrialRows`'s row shape with `allowed_from` = today. Soft-path only; no UPDATE of existing rows.

### §2.4 Food detail (mock screen D)
- **FR-13** A `Trial` kv row renders the dated membership fact for a food on the list. For a food not on the list the row is **absent** (R1) — never "Not on the list".
- **FR-14** A food not on the list shows `Add to {pet}'s trial list` → §2.3's sheet.
- **FR-15** The B-351 contaminant note is untouched and may co-render with FR-14 (a protein-conflicting food can still be added — the vet may have sanctioned it; the note and the add never merge into a verdict, C2).

### §2.5 FoodPicker — variant H (mock screen H; D4)
- **FR-16** While the pet's trial is active, a pinned `On the trial list` section renders at the top of the picker (above the rotation shelf), containing the allowed set's tiles. Tiles are visually identical to every other tile — the section label is the only signal.
- **FR-17** The rotation shelf and library zones render unchanged below; nothing is removed, de-emphasized, or marked. (B-357's shelf-annotation direction is superseded by H for the trial case; B-396 unaffected.)
- **FR-18** Selection-mode uses of the picker (start modal, §2.3) do **not** render the pinned section — it would be circular while editing the list itself.
- **FR-19** The post-commit completion-card flag is unchanged (R3).

### §2.6 "Outside the trial diet" — the B-458 second half
The exposures list screen ships in this combined build against **`explainVerdict`** (B-475 — build it against that module, never new copy), reachable from the trial card's declared `view_exposures` action. Its content contract is already ruled (G2 phrasing, floor-never-total, per-feeding reasons via the rung that fired); this spec adds nothing to it beyond sequencing (PR 4).

## §3 Data & predicate

- **No schema change.** `diet_trial_foods` (migration 040) already carries roles + dated membership; the mirror and sync queue already handle the table. Zero migrations in this track.
- **Reads:** one hook (`useTrialAllowedSet(petId)` or equivalent) resolving the active trial + its dated set from the local mirror, exposing `matchAllowed`-keyed lookups for FR-2/FR-13/FR-16. Client-local; no new server surface, no RLS change (existing policies cover; `rls-privacy-reviewer` not required, `code-reviewer` is).
- **Writes:** FR-12 only.
- **Gate:** **PR 0 = B-556.** Align `narrowRole` across the three readers before this track's first read ships.

## §4 Copy pack (verbatim; `nyx-voice` reviewed)

| Surface | String |
|---|---|
| Trial strip | `Diet trial — day {n} of {m}` / `{k} foods on the trial list` |
| Chips | `Trial diet` · `Also allowed` |
| Detail row | `On {pet}'s trial list · since {date}` |
| Add sheet title | `Add to {pet}'s trial list?` |
| Add sheet rows | `Joins the list — Today, {date} · day {n}` · `Earlier feedings — Keep the reading they already have` |
| Add sheet actions | `Add to the list` · `Not now` |
| Empty extras | `Just the trial diet for now. If your vet okays an extra, add it here.` |
| Picker section | `On the trial list` |
| C6 line (LOCKED, §2.2 only) | `While the trial runs, Culprit records which feedings matched the trial diet and which didn't, with dates. That's the part your vet needs.` |

No exclamation marks; no "safe"/"unsafe"; no "picky"; nothing about the owner.

## §5 QA edge matrix

1. **Archived allowed food** — tile hidden per B-005; §2.2 still lists it (a list membership is a trial fact, not a library read) with the food's name resolving (the personas.md line 244 rule).
2. **`allowed_until` set (future data)** — membership is date-gated; a removed food loses chip/row/section from that date. (No UI writes it in v1 — D8 — but reads must honor it.)
3. **Trial end** — FR-4; picker section gone; detail row gone; §2.2 unreachable via strip (card lifecycle unchanged).
4. **Multi-pet** — pet A's trial renders no chrome in pet B's context (D7).
5. **Unhydrated set** (fresh install, sync pending) — render nothing, never a guess (R2).
6. **Re-photographed bag** (new `food_item_id`, same brand+product) — still reads on-list via the key arm of `matchAllowed` (D3).
7. **Add during day 1 vs day 40** — `day N` in the sheet always matches the card's counter (one day-math source, `lib/analytics.ts:838`'s helper).

## §6 Build plan — PR by PR

Five PRs across **~4 sessions** (PR 0 rides with PR 1). Sequencing: **0 → 1 → {2 ∥ 3} → 4**. PRs 2 and 3 are parallel-safe as separate sessions/branches once PR 1 lands (disjoint files; the one expected collision is `STATUS.md`/`docs/backlog.md` at wrap). No schema PR exists in this track — nothing to isolate. No `adversarial-reviewer` line anywhere: this track computes nothing, it renders the shipped predicate's answers; if any PR grows its own membership logic, that exemption dies with it and the DoD line comes back.

### PR 0 + PR 1 — the gate and the lib layer (one session)

**PR 0 — B-556: one `narrowRole`.**
- *Scope:* align `lib/trialContaminant.ts`'s `narrowRole` (unknown role → `primary_diet` today) with `lib/dietTrialFacts.ts` and `generate-report/trial.ts` (→ `permitted_other`). Own commit or own small PR — it is a behavior fix, not part of the new surface.
- *Why it gates:* §5.5 D-A derives `sanctionedProteins` from `primary_diet` rows **only** — mapping an unknown role to `primary_diet` lets a row of unknown provenance **widen what counts as on-diet**, which is the exact self-granted loophole D-A exists to close. Every new reader this track adds would inherit that inflation.
- *AC:* all three consumers produce identical role narrowing on an unknown token; a cross-consumer regression test pins it (read all three sources, assert one mapping — the `detectionSoftDelete.test.ts` pattern).
- *Gates:* `code-reviewer`. Tests mandatory.

**PR 1 — allowed-set read hook + `addTrialFood` write.**
- *Scope:* a read path — `useTrialAllowedSet(petId)` (or a pure `lib/` resolver + thin hook) that resolves the active trial via `isTrialRunning` (never raw `status`), loads the dated `diet_trial_foods` rows from the local mirror, and exposes `matchAllowed`-keyed lookups (`isOnList(food, date)`, role, `allowed_from`) for FR-2/FR-13/FR-16. And the one write — `addTrialFood` in `lib/dietTrialSetup.ts`: single insert reusing `buildTrialRows`'s row shape with `allowed_from` = today, role via `permittedRoleForFood`, mirror + fire-and-forget flush (FR-12).
- *Files:* `lib/dietTrialSetup.ts`, new `lib/trialAllowedSet.ts` (+ hook), tests co-located.
- *AC:* (1) membership is date-gated — a food with `allowed_from` tomorrow is not on-list today; (2) key-arm matching — a new `food_item_id` with the same case-folded brand+product key reads on-list (§5.4); (3) **convergence property test**: any (food, date) the hook calls on-list, `classifyFeeding` rungs to `permitted` for, and vice versa — the hook may never disagree with the classifier it fronts (R2 made executable); (4) `addTrialFood` row shape byte-matches a `buildTrialRows` row for the same input; (5) unhydrated set → the hook returns "unknown", and the contract says render nothing (FR/R2).
- *Gates:* `code-reviewer`; `npm test` (lib rule — tests mandatory, no N/A available).

> **Session kickoff prompt:**
> *"Build B-616 PRs 0+1 per `docs/nyx-food-library-trial-awareness-requirements.md` §6: first the B-556 `narrowRole` alignment with its cross-consumer regression test, then the `useTrialAllowedSet` read hook + `addTrialFood` write in the lib layer, including the §6 convergence property test against `classifyFeeding`. Read the spec §0–§3 and `lib/dietTrial.ts`'s header first. No UI in this session."*

### PR 2 — "What {pet} can eat" + the mid-trial add (one session)

- *Scope:* FR-5→FR-12. New screen `app/trial-foods.tsx` (rows grouped `Trial diet` / `Also allowed`, dated facts, C6 line verbatim, designed empty state) + the add flow (`FoodPicker` selection mode → the FR-11 confirm sheet → `addTrialFood`). Wire the screen as a `DietTrialCard` handler (B-458's mechanism — one handler, no card change) and from the trial card's manage surface.
- *Files:* `app/trial-foods.tsx`, `components/profile/` sheet component, `app/(tabs)/profile.tsx` (handler wiring only).
- *AC:* (1) the sheet shows exactly the three FR-11 facts and two actions — no role question, no wisdom-check copy; (2) an add renders in the list immediately with `added <date>, day N`, and `day N` equals the card's counter (§5 edge 7); (3) a pre-add feeding of that food keeps its off-diet classification (verify via the completion-card flag or `classifyFeeding` directly — D5's no-amnesty rule); (4) empty extras group renders the §4 empty state; (5) C6 line renders verbatim, this screen only.
- *Gates:* `pm-feature-review` (as Jordan), `nyx-voice`, `code-reviewer`. Manual QA script must include the D5 disclosure check on-device.

> **Session kickoff prompt:**
> *"Build B-616 PR 2 per spec §2.2–§2.3: the `What {pet} can eat` screen + mid-trial add flow over PR 1's lib layer, wired as a `DietTrialCard` handler. Mock screens B and C in `docs/culprit-food-library-trial-mockups.html` are the design authority. Copy pack is spec §4, verbatim."*

### PR 3 — Foods tab + food detail (one session; parallel-safe with PR 2)

- *Scope:* FR-1→FR-4 (trial strip + tile chips on `app/(tabs)/foods.tsx`) and FR-13→FR-15 (the `Trial` kv row + `Add to {pet}'s trial list` action on `app/food/[id].tsx`). The strip's tap target opens PR 2's screen when it exists; if PR 3 lands first, the strip ships tap-dead-ended to the trial card (acceptable for one PR, noted in the PR body).
- *AC:* (1) chips render only on on-list tiles, via the hook — zero marking of any other tile (R1); (2) strip renders only while `isTrialRunning`, disappears cleanly at trial end (FR-4, §5 edge 3); (3) pet B's context shows no trial chrome for pet A's trial (D7, §5 edge 4); (4) archived on-list food: tile stays hidden, PR 2's list still names it (§5 edge 1); (5) detail row absent — not "Not on the list" — for off-list foods (FR-13); (6) the B-351 contaminant note co-renders untouched (FR-15/C2).
- *Gates:* `pm-feature-review`, `nyx-voice`, `code-reviewer`.

> **Session kickoff prompt:**
> *"Build B-616 PR 3 per spec §2.1 + §2.4: the Foods-tab trial strip + allowed-set chips, and the food-detail membership row + add action. Mock screens A and D are the design authority. R1 is the review bar: nothing off-list is marked, anywhere."*

### PR 4 — the picker's pinned section + the exposures screen (one session)

- *Scope:* FR-16→FR-19 — the `On the trial list` section pinned above the rotation shelf in `components/log/FoodPicker.tsx` while the trial runs, tiles visually identical, absent in selection mode (FR-18). Plus §2.6: `app/trial-exposures.tsx` ("Outside the trial diet") built **against `explainVerdict`** — never new copy — wired via the card's declared `view_exposures` handler. Closes **B-458** and **B-475**.
- *AC:* (1) picker section renders only in logging mode during an active trial; ordering only — no tile chrome anywhere (D4); (2) rotation shelf + library zones unchanged below (FR-17); (3) post-commit completion-card flag unchanged (FR-19 — regression-test the `evaluateMealTrialFlag` path); (4) every exposure row's reason comes from `explainVerdict` (B-475's bar: a flag the owner cannot interrogate is an unfalsifiable accusation); (5) the exposures screen renders G2-compliant framing only — counts as floors, no negative claim at any coverage.
- *Gates:* `pm-feature-review`, `clinical-guardrails` (the exposures copy), `nyx-voice`, `code-reviewer`.

> **Session kickoff prompt:**
> *"Build B-616 PR 4 per spec §2.5–§2.6: the FoodPicker's pinned `On the trial list` section (variant H — ordering, not marking; absent in selection mode) and the `Outside the trial diet` screen against `lib/dietTrial.explainVerdict`, wired via the card's `view_exposures` handler. This PR closes B-458 and B-475. `clinical-guardrails` reviews the exposures copy; G2 governs every count."*

### Parallelism & efficiencies

- **PR 0+1 is the single unblocker** — everything else queues behind it; it needs no PM input and can run today.
- **PRs 2 and 3 fan out** after PR 1: disjoint files, no logical dependency either direction. Two concurrent sessions/branches are safe; expect only the wrap-time `STATUS.md`/backlog collision.
- **PR 4 last**, because FR-18 (selection-mode exclusion) wants PR 2's add flow in place to test against, and the exposures screen is the track's only clinically-registered copy — do it with full attention, not as a rider.
- Nothing in this track is gated on a PM or expert call. The one external dependency named in §2.6's content contract (`classifyFeeding` output) shipped in B-417 PR 5.

## §7 Out of scope

Mid-trial removal UI (D8) · any off-diet marking anywhere (D2, permanent) · B-357's shelf annotation (superseded by H for the trial case; the row stays for the no-trial recency question) · B-439's glyph (closed by D4) · med-picker analog (B-355's seam — separate call) · any coverage/adherence rendering (§6.9, permanent).
