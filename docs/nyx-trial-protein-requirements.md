# Trial Protein Capture — Requirements & PR Plan (B-704)

**Version:** 1.0 · **Date:** 2026-08-04 · **Status:** 🌱 BUILD-READY except TP-1 (provisional, flagged for PM confirmation)
**Decision record:** TP-1–TP-4 (§0) · **Re-opens:** D6 (`nyx-multi-protein-requirements.md` §10 — "explicit protein on `diet_trials`: RATIFIED, deferred") — re-opened and ratified by the PM 2026-08-04
**Pairs with:** `docs/culprit-trial-protein-mockups.html` (round 2 — the design reference; frames cited below) · `docs/nyx-diet-trial-requirements.md` (§4.1 the start sheet, §5.3 the one predicate, §5.5 D-A the loophole guard) · `docs/nyx-multi-protein-requirements.md` (D6/D7/§8) · `docs/nyx-food-library-trial-awareness-requirements.md` (the allowed-set screen this adds a row to)

---

## 0. Decision record

| # | Decision | Ruling |
|---|---|---|
| **TP-1** | When nothing derives at setup — render an empty optional row (E1) or hide it (E2)? | **PROVISIONAL: E2 — hide at setup.** Taken under the one-session provisional rule; the PM ruled TP-2–TP-4 and skipped this one. Rationale for E2 over round 1's E1 lean: the PM's mid-trial requirement (TP-4) gives the protein a permanent, always-reachable home, so hiding at setup no longer orphans the affordance — and for a hydrolyzed patient "Not set" is the wrong register (the field is inapplicable, not incomplete). Designer's standing position was E2. **Flag to PM at next session; PR 3 renders E2 unless overridden.** |
| **TP-2** | Day-0 label mismatch — heads-up only, or require acknowledgment? | **RULED (PM, 2026-08-04): heads-up, never blocking — conditional on prominence.** The PM's own words: "as long as we believe that heads up is prominent enough." That condition is a **gate, not a hope** — see §6 for the prominence contract PR 3 must meet and QA must verify. Start stays enabled in every state. |
| **TP-3** | Mid-trial edit semantics — correction (whole-trial) or dated (forward-only)? | **RULED (PM, 2026-08-04): correction semantics, per the team recommendation.** One value, whole-trial, editable any time. The house never-rewrites-history rule protects **evidence and counts**, and the protein touches neither — it changes only what the record *calls* things. The edit is **disclosed, not versioned**: `target_protein_set_at` records when, and the report carries a provenance word when the set/change happened after day 1 (§8). The confirm moment states the whole-trial effect in plain words (§7.3). |
| **TP-4** | Where does mid-trial see/select live? | **RULED (PM, 2026-08-04): both, split by role — "strongly agree."** Surfaces that *name* the trial **show** it (the Pet-tab card and Home `TrialStrip` identity lines become "Rabbit trial …", zero new controls, so the card's §4.2 rule is untouched). The allowed-set screen ("What {pet} can eat", B-616) **edits** it — a "Trial protein" row above the food list opening the same picker as setup. **One editor, two-plus viewers.** |

Ruled at team level, recorded here as build contract (no PM input needed): stored-first resolution inside the one predicate (§4); the never-permits invariant carried by property test (§3 TG-1/TG-5); Class-A canonical key via `canonicalizeProtein` (§3 TG-4); **single protein in v1** — "No single protein (hydrolyzed or special diet)" is a first-class picker option, and a dual-novel-protein target is deferred (§9 A-1).

---

## 1. What this is

The start-a-trial sheet captures foods; the trial's protein is derived from their labels. The word the owner actually carries home from the vet — "rabbit" — never appears in the flow, attribution goes dark when food data is thin, and a wrong-primary trial food is structurally undetectable because the food defines its own target. This track stores the owner's intent as a first-class, optional, **confirm-not-ask** fact:

- **At setup:** a pre-filled "Trial protein" row derived from the picked trial foods (mock frame B). A glance, not a decision; the golden path stays two answers.
- **Mid-trial:** visible wherever the trial names itself; editable from the allowed-set screen (TP-4; mock frames F–H).
- **Downstream:** the vet report says "Elimination diet trial — **rabbit**", exposure attribution survives empty protein arrays ("3 poultry exposures", not "3 off-diet feedings"), and a day-0 label mismatch becomes a finding instead of a day-14 statistical residue.

## 2. What this is NOT

- **Not a permit path.** The food list (`diet_trial_foods`) remains the *only* thing that decides off-diet (diet-trial spec §5.5 D-A). The stored protein can add a *naming* to the record; it can never make anything allowed, and it can never remove an off-diet verdict. This is the load-bearing invariant of the whole track.
- **Not a required field.** Never blocks Start, never nags, settable never.
- **Not a detection change.** `classifyFeeding`, the sanctioned-set union, rung order, counts, denominators, coverage — all byte-identical before and after any value of `target_protein` (TG-1/TG-5).
- **Not a versioned history.** TP-3: one value, disclosed edits, no windows.

## 3. Invariants (the TG spine — each carries a test, named in the PR plan)

- **TG-1 · Never permits.** For every feeding and every trial state, `classifyFeeding`'s verdict is invariant under all values of `target_protein` (including null). Property test over the fixture corpus in PR 2.
- **TG-2 · Silence is never an all-clear.** A null target yields no naming anywhere — never "no off-target proteins", never an empty-state that reads as clean (the G2 rule inherited verbatim: a mark's absence is never a verdict).
- **TG-3 · The mismatch never alarms per-feeding.** Target-vs-trial-food tension is a **trial-level standing fact** (C2's shape): the day-0 heads-up at setup, the standing note on the allowed-set screen, a disclosure line on the report. It never renders on individual feedings of the prescribed food and never blocks anything.
- **TG-4 · Class-A canonical key.** The stored value is `canonicalizeProtein(...)` output — convergent, covered by the existing cross-product property test. A raw label never lands in the column.
- **TG-5 · A protein edit never moves a number.** Snapshot every count/denominator/coverage figure the trial surfaces (card, report facts, exposure counts), edit the protein, re-snapshot: byte-identical. Test in PR 2, re-asserted against the report builder in PR 5.

## 4. The one predicate

`lib/trialProtein.ts` gains the stored-first resolver; **every consumer reads through it** (the §5.3 lesson, applied before the third definition exists):

```ts
// Stored-first, derivation fallback. Returns the protein AND its provenance,
// because the report renders them differently ("owner-confirmed" vs "from the
// trial diet") and a consumer that can't tell them apart will eventually lie.
type TrialProteinSource = 'owner' | 'derived';
function trialTargetProtein(
  trial: { target_protein: string | null },
  primaryFoods: readonly { primaryProtein: string | null }[],
): { protein: string | null; source: TrialProteinSource | null };
```

`resolveTargetProtein` (the current derivation) becomes this function's fallback arm, not a public entry point. Consumers: `StartTrialModal` (derive-for-prefill), the allowed-set screen, the trial card / `TrialStrip` naming, `lib/trialContaminant.ts`, `generate-report`, `ask`. A consumer importing `resolveTargetProtein` directly after PR 2 is a review-blocking finding.

## 5. Schema (PR 1 — its own PR, house rule)

Migration 0NN: two nullable columns on `diet_trials`.

- `target_protein TEXT NULL` — canonical key (TG-4). Null = never set / cleared / "no single protein".
- `target_protein_set_at TIMESTAMPTZ NULL` — written on every set and change (TP-3's disclosure hook). Null whenever `target_protein` is null.

“No single protein (hydrolyzed)” stores **null** — deliberately indistinguishable from unset in the column, because the *product* distinction (inapplicable vs not-yet-set) is carried by the picker UI and matters nowhere downstream: both states mean "no naming, derivation off" (TG-2). RLS: existing `diet_trials` policies cover the columns; nothing new. **Rollback:** `DROP COLUMN` both. **Destructive:** n. **Backfill:** none — every existing trial derives at read, exactly as today.

Local mirror (PR 2): both columns join `DIET_TRIAL_SCHEMA_SQL`, hydration, and the push payload. `diet_trials` is already in `LOCAL_WIPE_TABLES`; the hydration guard test enforces the schema-constant rule by construction.

## 6. The mismatch prominence contract (TP-2's condition, made testable)

The PM's ruling is conditional: heads-up **only if prominent enough**. Prominence is therefore specified, not vibed:

1. The heads-up renders **inline, immediately below the offending food row** — inside the trial-diet block, not at the sheet's foot, not a toast (mock frame D).
2. Amber register (the multi-protein D7 Tier-2 escalation style), leading with the **fact**: "{Food} lists {protein} as its main protein."
3. It is visible whenever the food row is visible — no scroll, no disclosure, no truncation of the food name that hides which bag it means.
4. It persists while the condition holds (not dismissible-and-gone; removing the food or changing the target removes it).
5. Mid-trial, the same condition renders as the standing note on the allowed-set screen (TG-3's shape) — the setup sheet is not the only place the tension is visible.
6. **QA criterion (PR 3):** with three trial foods picked and the mismatch on the middle one, the heads-up is on-screen in the same viewport as its food row, on the smallest supported device.

Never blocking, in every state: Start enabled, save enabled, no acknowledge gate.

## 7. Surfaces

### 7.1 Start sheet (PR 3 — mock frames B, C, D)
The derived row under the trial diet block: label "Trial protein", value, sub-line "From the foods you picked — tap to change". Renders only when derivation returns a protein (TP-1 provisional E2: nothing derives → no row). Tap opens the picker sheet (§7.2). The mismatch heads-up per §6. **Designer's condition from the team read, carried as an AC:** the 15-second timed test re-runs on a physical device with the row present.

### 7.2 The picker sheet (PR 3, shared component — mock frame C)
Intro carries the invariant in owner language: *"If your vet named one protein for this trial, keep it here. Culprit uses it to name what shows up in the record — it never changes what counts as off-diet."* Groups: derived-from-trial-diet first (with provenance sub-labels), common proteins, then the two escape hatches as first-class options — "No single protein (hydrolyzed or special diet — the food list is the trial)" and "Not sure — leave it unset". One component, mounted by the start sheet and the allowed-set screen. Copy is draft until the PR 3 `nyx-voice` pass.

### 7.3 Mid-trial (PR 4 — TP-4, mock frames F–H)
- **Viewers (zero new controls):** the Pet-tab trial card and Home `TrialStrip` identity lines render "Rabbit trial · …" when a protein resolves (either source); current food-label naming is the unchanged fallback. §4.2 untouched — nothing here opens anything new.
- **Editor:** the allowed-set screen gains a "Trial protein" row above the food list — value + provenance sub-line, tap → §7.2 picker. This screen is also where the standing mismatch note lives (§6.5).
- **The correction confirm (TP-3):** when an edit *changes* an existing value mid-trial (not first-set), the picker's confirm states the whole-trial effect before committing: *"This updates the trial's whole record, including days already logged. What counted as off-diet doesn't change."* Two sentences, no checkbox — the C6/FR-11 disclosure pattern.

### 7.4 Vet report (PR 5 — mock section 06)
- Identity: "Elimination diet trial — **{protein}**" with a provenance word ("owner-confirmed" / "from the trial diet"); when `target_protein_set_at` falls after day 1, the provenance discloses it ("protein confirmed day {N}").
- Attribution: exposure naming reads the predicate stored-first, so "{N} poultry exposures" survives an empty array on the contaminant food.
- The §6 tension, when live, renders as a §5.5-style disclosure line — never as a per-feeding flag (TG-3).
- **Standing hold, stated plainly:** PR 5 merges on its own tests, but the `generate-report` **redeploy remains gated by B-494** (the refusal safety lane). The trial-protein render reaches production on the same redeploy that ships B-494 — it does not jump that queue.

### 7.5 Ask
Inherits through the predicate; no new tool, no boundary change (the §6 scoped-retrieval contract already covers `diet_trials` columns).

## 8. Copy pack (draft — every string passes `nyx-voice` in its PR)

| Where | String |
|---|---|
| Setup row sub-line | "From the foods you picked — tap to change" |
| Picker intro | "If your vet named one protein for this trial, keep it here. Culprit uses it to name what shows up in the record — it never changes what counts as off-diet." |
| Hydrolyzed option | "No single protein — hydrolyzed or special diet. The food list is the trial." |
| Unset option | "Not sure — leave it unset. Everything still works. You can set it later from {pet}'s trial." |
| Mismatch heads-up | "{Food} lists {protein} as its main protein. If {pet}'s trial is {target}-only, worth checking that bag with your vet." |
| Correction confirm | "This updates the trial's whole record, including days already logged. What counted as off-diet doesn't change." |
| Card identity | "{Protein} trial" (capitalized protein; falls back to today's food-label naming) |

Never say: "wrong food" · "mistake" · any per-feeding rendering of the mismatch · any all-clear derived from an absent protein ("no off-target proteins found") · "picky" anywhere near a refusal, as ever.

## 9. Deferred / residuals

- **A-1 · Multi-protein target** (a vet prescribing two novel proteins): deferred. The allowed set already handles the *permits*; only the naming is single. Revisit on real demand.
- **A-2 · TP-1 ratification**: E2 is provisional — confirm or override at next session; the PR 3 build follows E2.
- **A-3 · Setup-time mismatch vs mid-trial food adds**: a food added mid-trial (FR-12 path) with a label conflicting the target gets the standing note (§6.5) but no setup-style inline heads-up — the add-confirm sheet already carries FR-11's disclosure; adding a second amber there is Principle-4 debt. Revisit if the standing note proves too quiet.

## 10. PR plan

| PR | Contents | Gates |
|---|---|---|
| **1** | Migration 0NN (§5): `target_protein` + `target_protein_set_at` on `diet_trials`. Server only, own PR, Migration Safety Pre-flight in the description. Apply via MCP `apply_migration` + `get_advisors`. | Schema-isolation rule; pre-flight. |
| **2** | Local mirror + hydration + sync payload; `trialTargetProtein` stored-first predicate (§4) with `resolveTargetProtein` demoted to fallback; TG-1/TG-2/TG-4/TG-5 tests incl. the property passes. | **`adversarial-reviewer` mandatory** (feeds the vet report's naming). Engineer + Data sign-off. |
| **3** | Start-sheet row (E2 per TP-1 provisional) + shared picker sheet + day-0 heads-up per the §6 contract. | Designer sign-off incl. the **re-timed 15-second test** on device; §6.6 QA criterion; `nyx-voice` on every §8 string. |
| **4** | Mid-trial: card/`TrialStrip` identity naming + allowed-set screen row/editor + standing mismatch note + correction confirm (§7.3). | `pm-feature-review` on the mid-trial flow; `nyx-voice`. |
| **5** | Report render (§7.4): identity + provenance + stored-first attribution + disclosure line; TG-5 re-asserted against the report builder. | **`adversarial-reviewer` + `vet-report-cold-read`** on a rendered artifact. Merges independently; **production ships with the B-494 redeploy, never before.** |

Sequencing: 1 → 2 strictly; 3 and 4 parallel after 2 (disjoint surfaces; expect the usual STATUS.md wrap collision); 5 after 2 (not after 3/4). Each PR names its session-start kickoff from this table.
