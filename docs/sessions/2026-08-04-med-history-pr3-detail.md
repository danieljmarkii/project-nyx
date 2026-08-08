# Medication history (B-140 extended) — PR 3: detail past-course facts + History link

**Date:** 2026-08-04
**Outcome:** shipped via #588 (draft → squash-merged to `main`)
**Track:** B-140 extended · surface 2 of 4 (`docs/nyx-med-history-requirements.md` §4.2, mock §03)
**Depends on:** PR 1 (`lib/medicationHistory.ts`, #585). Ran parallel-safe with PR 2 (profile section, #587) — that merged to `main` mid-session; merging it into this branch was a clean auto-merge (git resolved the two `lib/medications.ts` additions on its own).

---

## What shipped

The vet asks *"what medications has she been on?"* and the app forgets a course the moment it ends (every surface filters `status = 'active'`). This PR is the **med-detail past-course presentation**: opening a drug's detail screen (`app/medication/[id].tsx`) now shows the active pet's **past** courses of that drug — course-grain facts over the event-grain evidence — plus a doorway down into the dose stream.

Three files of substance, split the house way (`medStrip` / `medStripFacts`), so the reads and the copy are each testable:

- **`lib/medicationHistoryFacts.ts`** (new) — the on-device loader. Reads **every** regimen status (not just `active` — the amnesia this track exists to undo) + all doses from the local mirror (offline, the med-strip choice), then runs PR 1's `deriveMedicationCourses`. A read failure → `null` → the surface renders no history section rather than a fabricated-empty one.
- **`lib/medicationHistoryDetail.ts`** (new) — the pure copy layer: `buildPastCourseFacts` (the labelled fact rows), timezone-honest date formatters, `EVIDENCE_LINK_LABEL`. Where H1/H2/H4 live.
- **`app/medication/[id].tsx`** — the "Medication history" section (each past course = a fact card + a "See doses in History" doorway), filtered to `medicationItemId === id && !isActive` so the active course (which lives on the profile card / med strip) is never duplicated (AC #3). Scoped to the active pet like every other medication surface.
- **`lib/medications.ts`** — extracted `totalTally(tally)` (see nits below).

31 new tests. `lib/medicationHistoryFacts.test.ts` runs the real SQL against `node:sqlite` — the **all-statuses load** and the **soft-delete-through-the-parent-event** filter are the load-bearing anti-regressions (a `WHERE status='active'` creeping back in drops the test to length 1 and fails). `lib/medicationHistoryDetail.test.ts` pins the H1/H2/H4 copy + mock §03 fidelity.

## The invariants, and how they're held

- **H1 — no ending from silence.** The *ending* copy (`endedValue`) is reachable only from `end.kind === 'ended'` (an owner `completed`/`stopped`). Every other branch states "Last dose logged {day}" / "No regimen set up" / nothing. A dose-derived course can never be ended at all (no regimen, no status). Test: an orphan course sweeps every fact value against an ending-word regex.
- **H2 — counted facts, never a percentage or grade.** "26 of 28 planned", never "93%". Test asserts no fact value carries `%` / "adherence" / a grade across four course shapes.
- **H4 — one count.** The dose count reads the derivation's `dosesLogged` field verbatim (a test hands it a 99-given tally with `dosesLogged: 26` and asserts the copy prints 26), so this screen can't contradict the profile card / strip / report for the same course.

## Decisions this session

**The evidence-link wording changed from the spec — deliberately, and flagged.** Spec §4.2 / mock §03 drew it as **"All N doses in History"**. The `pm-feature-review` pass flagged that as a two-way over-promise: the link opens History's **whole** medication stream (a per-drug filter is **B-688**, not v1), and a course's delivered count excludes the refused/missed events that are *also* in History. It now reads a plain **"See doses in History"** — the count already lives in the facts above, and the doorway is gated on **total** logged administrations (`totalTally`), not delivered doses, so a course the pet *refused entirely* keeps its route to those refusal events (*intake is not preference* — a refusal record is a signal, never stranded). Final wording is a PM call once B-688 makes a per-drug count true.

## Reviews

- **`code-reviewer` → ship-ready.** No bugs / no anti-patterns. It independently reproduced the two defects an earlier commit had already fixed (the evidence-link gate stranding a refused course; a missing `dosesLogged > plannedDoses` guard the derivation's own header warns is reachable). Verified the SQL loader, the course filtering (AC #3), H1/H2/H4, house rules, and the offline posture. **Two of three nits applied:** (1) extracted `totalTally` in `lib/medications.ts` as the one "total logged administrations" definition — now read by both `computeRegimenCompliance.loggedDoses` (was an inline five-bucket sum) and the doorway gate, so a future `AdherenceTally` field can't be missed by a second inline sum (the H4 / §5.3 one-predicate rule); (2) collapsed a dead `formatSchedule` branch. The third (extract a `useMedicationCourses` hook) is deferred by the reviewer's own advice until a second consumer lands — now slightly more tempting since PR 2 shipped its own `lib/pastMedications.ts` loader, but still out of this PR's scope.
- **`pm-feature-review` → copy/derivation SHIP-SHAPED**; drove the honest-link change above.
- **`nyx-voice`** (self, skill) — plain language throughout ("As needed" not "PRN", "Twice a day" not "BID", "No regimen set up" as a fact not a scold), no exclamation marks, never reassures (H2's no-percentage rule is the anti-reassurance guard).

## Residuals / follow-ups

- **B-698 (filed, `Next`)** — wire the profile "Past medications" rows to tap → this detail screen. PR 2 shipped them non-tappable because the detail was only a catalog form; PR 3 made the detail worth landing on, but the wiring touches PR 2's files (out of this PR's disjoint scope). Small, with one edge: an orphan course with a null `medication_item_id` has no id to route to.
- **Two open PM decisions (flagged on the PR, not silently decided):** (1) **screen placement** — built on this catalog-edit screen per spec §4.2 + the task, vs. a *dedicated* course screen the mock drew; (2) **final link wording + drug-name header** — both wait on **B-688** (the per-drug History lens).
- **Two `pastMedications`-vs-`medicationHistoryFacts` loaders now exist** (PR 2 and PR 3 built parallel on-device loaders over the same derivation). Not reconciled here (PR 2 is merged); the deferred `useMedicationCourses` hook is the eventual home if PR 4 wants a third.

## DoD

tsc clean · full suite **200 suites / 4368 tests** (post-merge with PR 2) · CI green (App typecheck+jest, non-UTC timezones, Edge Functions deno) · no schema / migration / secret / deploy — client-only, reads existing tables from the local mirror. Adversarial pass was PR 1's job (the clinical derivation); this is a consumer/presentation layer over it.
