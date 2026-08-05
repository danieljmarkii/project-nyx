# Trial protein capture (B-704) PR 4 — mid-trial see/select (TP-4)

**Date:** 2026-08-05
**Shipped via #596** (draft) · branch `claude/b704-pr4-trial-protein-3ebkf9`

## What this PR is

PR 4 of the B-704 trial-protein track (`docs/nyx-trial-protein-requirements.md` §10, TP-4). PR 1 (#594) added the columns, PR 2 (#595) built the local mirror + the one stored-first predicate. This PR makes the protein *visible and editable during the running trial*: the word the owner carries home from the vet ("rabbit") now names the trial wherever it names itself, and the allowed-set screen becomes the one place to see and change it.

The whole track's invariant holds throughout (§2, TG-1): the stored protein **only NAMES what the record already counts — it never permits.** `classifyFeeding` and the allowed set are untouched; the write path performs no classification change.

PR 3 (the setup sheet) had not landed, so per the task's "whichever PR lands second consumes it" rule, **the shared picker sheet (§7.2) was built here** and PR 3 will mount the same component.

## What shipped

- **Viewers (zero new controls, §4.2 untouched):** the Pet-tab card kicker and the Home `TrialStrip` header render `"{Protein} trial"` when a protein resolves (either source), via a new `trialIdentityLabel` in `lib/dietTrialCard.ts`. Resolved **once** in `loadDietTrialFacts` (`lib/dietTrialFacts.ts`) through the one predicate (`trialTargetProtein`, stored-first + derivation fallback) and threaded onto `TrialCardTrial.trialProtein` — the pure resolvers never re-derive. Falls back to the unchanged `"Diet trial"`; the food label stays the naming below. `target_protein` joins `TRIAL_FOR_CARD_SQL`.
- **The shared picker sheet:** `components/profile/TrialProteinPickerSheet.tsx` + the pure model/copy `lib/trialProteinPicker.ts`. Groups: derived-from-the-trial-diet (with provenance sub-labels), common proteins (`COMMON_PROTEINS`, same source of truth as `ProteinPicker`), and the two null escape hatches. Intro carries the invariant in owner language. **No free-text entry** — only canonical keys or the two null hatches, so arbitrary text can never reach the column (closes the write-path half of B-705 by construction, for both the editor and PR 3's setup mount).
- **The editor row:** `app/trial-foods.tsx` gains a "Trial protein" row above the food list → the picker. `lib/trialAllowedSet.ts` carries `targetProtein` on `TrialAllowedSetTrial` + `RUNNING_TRIAL_SQL`.
- **The correction confirm (TP-3):** a change to an existing **owner-set** value shows the §8 whole-trial note (*"This updates the trial's whole record… What counted as off-diet doesn't change."*) before committing; first-set / derived-confirm / re-tap skip it.
- **The §6.5 standing mismatch note:** now rendered on the allowed-set screen too, read through the **same** `useDietTrial` note the Pet-tab card shows — so a food carrying an off-trial protein reads identically on both surfaces (one-answer rule; the extra local read on this deliberate-nav screen is a documented consistency trade).
- **Write path:** `setTrialTargetProtein` (`lib/dietTrialSetup.ts`) — one LWW column update, the paired-null contract (`target_protein` null ⇔ `target_protein_set_at` null, §5), Class-A canonical-on-write (TG-4), the mirror re-arm (`synced=0, sync_attempts=0, sync_error=NULL`), `notifyTrialChanged()` (so card *and* strip re-read), fire-and-forget flush. Structurally identical to `extendTrial`.
- **Tests:** the picker model + correction gate (`lib/trialProteinPicker.test.ts`), the write path (`lib/dietTrialSetup.test.ts` — paired-null / canonical / re-arm / tick), card+strip naming (`lib/dietTrialCard.test.ts`), the loader resolution (`lib/dietTrialFacts.test.ts`), the allowed-set passthrough (`lib/trialAllowedSet.test.ts`), the sheet's confirm-step + escape-hatch interaction (`components/profile/TrialProteinPickerSheet.test.tsx`), and `capitalizeProtein`. Full suite green: **206 suites / 4514 (+ new) tests**, `tsc --noEmit` clean.

## The gates, and the one bug both caught

`pm-feature-review` (product walk) and `code-reviewer` (correctness) ran on the committed diff. Both independently found the **same BUG**, which is the value of two lenses:

> **The escape hatches were a silent no-op over any non-owner value.** The picker's no-op guard keyed on `resulting === storedOwnerValue`, and *both* escape hatches write `null` while `storedOwnerValue` collapses to `null` for any unset/derived state — so tapping "No single protein" over a derived name closed the sheet identically to a cancel, wrote nothing, and left the derived name. The exact hydrolyzed-correction path the option exists for.

**Fix (in this PR):** gate the no-op on **ownership + option identity** (`model.isOwnerSet && proteinValueOf(option) === model.selectedId`), never on the resulting write value — so every escape hatch over a non-owner state falls through to the documented first-set contract (`onCommit`), matching `isProteinCorrection`'s own docstring. Added two regression tests (escape hatch over unset / over derived) — the coverage gap that let it through.

**The residual is a genuine spec contradiction, escalated not silently resolved (→ B-707, Open Question):** §5 says the escape hatches store `null` and mean "derivation off", but the ratified predicate (§4/§7.3) treats `null` as *derive*. So even after the fix, tapping "No single protein" over a food that *derives* a protein writes null and the name re-appears — the owner cannot suppress it. This is **entangled with B-705** (whose PR-5 derived-arm source-gate would make hydrolyzed foods derive `null`, resolving the common case). The PM call: (A) accept §5 + rely on B-705 PR 5 (recommended), or (B) add a persistent no-derive state (its own schema PR). PR 4 fixed the *silent* half; the *suppression* half is the PM's.

**nyx-voice** (applied before commit): the editor row's owner sub-line went second-person — `"You set this — tap to change"`, not the report's third-person `"owner-confirmed"` (Pattern 1). The report keeps "owner-confirmed" as its vet-facing provenance word (PR 5). (The pm-review flagged the old string from its pre-edit transcript; already fixed in the committed code.)

Both reviewers' other notes were NIT/CLEANUP: the code-reviewer's two cheap NITs were applied (radiogroup role on the list; grabber → `theme.radiusFull`); the double-read on the allowed-set screen is a documented consistency trade it accepted; the `setTrialTargetProtein` write path, TG-1, the correction gate, theme/hitSlop/strict-TS/hook-rules all reviewed clean.

## Decisions

- **The shared picker has no free-text entry.** The mock frame C draws a radio list; `COMMON_PROTEINS` covers the elimination staples (rabbit/venison/duck) and the derived group covers whatever's on the trial food. No "Other" typed input → no arbitrary text can reach `target_protein` (a stronger guarantee than sanitising a typed field, closing B-705's write-path half). The rare "novel protein not on any food and not common" case → the owner leaves it unset; a typed Other is a future call if it proves needed.
- **The standing note is read through `useDietTrial`, not re-derived.** It costs a second local read on the allowed-set screen, chosen so the card and this screen can never disagree about a food's contamination (the §5.3 one-answer principle; the note carries the antigen-pause disclosure an opts-less re-derivation would miss).
- **The card/strip naming leads the identity token only.** The kicker/header lead with "{Protein} trial"; the food label stays the line below, so the no-protein fallback is today's surface exactly. All lifecycle kickers (active/finished/stopped early) inherit the protein identity.

## Known limits / follow-ups

- **B-707** — "No single protein" cannot suppress a *derived* name (the §5-vs-§4/§7.3 contradiction above); needs a PM ruling, entangled with B-705 PR 5. Filed + Open Question added to CLAUDE.md.
- **B-706** — the Foods-tab strip (`FoodsTrialStrip`, a separate `trialLibraryChrome.ts` module, not among the two viewers §7.3 names) still reads "Diet trial". Deliberate PR 4 scope boundary; small disjoint follow-up.
- **S5 (from pm-review):** a hydrolyzed food whose `primary_protein` is a real key derives an odd "{Process word} trial" name (e.g. "Hydrolyzed chicken trial") until B-705's PR-5 derived-arm gate lands. Downstream of the derived-arm keying, not this PR's naming.
- **PR 5** (report render) threads the stored value and reaches production **on the B-494 redeploy, never before** — unchanged by this PR.

## DoD

- Acceptance criteria (TG-1 never-permits · TG-2 silence · TG-4 canonical · TP-3 correction gate · §6.5 standing note): pass — see the PR body checklist.
- Types pass; full jest suite green; nyx-voice applied; `pm-feature-review` + `code-reviewer` run and their one shared BUG fixed with regression tests.
- Persona sign-off: Designer ✓ (the register split, the confirm) — Engineer ✓ (the write path, the shared component) — Data N/A (no classification change; TG-1 by construction) — the one clinical edge (hydrolyzed suppression) escalated to the PM, not resolved silently.
- On-device pass: pending (the PR's Manual QA script) — this is a static build + review; the device pass is the human half.
