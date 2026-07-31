# Medication Course Length in Doses — Requirements (B-614)

**Version:** 1.0 — BUILD-READY | **Last Updated:** 2026-07-31
**Status:** All decisions closed (D1 PM-ratified 2026-07-31; D2 PM-delegated → team-ruled; D3 PM punt; D4–D7 team/Dr. Chen from the 2026-07-30 convening). Build queued in its own session per PM.
**Reads first:** `docs/sessions/2026-07-30-medication-duration-doses-discussion.md` (the convening record + conflict), backlog rows B-614 / B-441 / B-394.

---

## §0 Decision record

| # | Decision | Ruling | Who / when |
|---|---|---|---|
| **D1** | What does "Dose X of Y" count? | **Therapy delivered.** The counter advances on `given` **and** `partial` administrations — matching the vet report's shipped `administered = given + partial` (`render.ts:3845`). `refused`, `missed`, `unrated`, and `unconfirmed` **never** advance it; they surface through the existing flag line (`regimenFlagLine`), so Sam's bottle number stays visible without ever letting a refused tail read a course as complete. Note: the client compliance numerator (`administeredDoses = given` only, `lib/medications.ts:945`) is a deliberately stricter *rate* statistic and is unchanged — the spec names both so no session "fixes" one to match the other. | **PM-ratified 2026-07-31** (resolves the Dr. Chen vs Sam conflict toward Dr. Chen, with Sam's disclosure requirement kept) |
| **D2** | Entry default unit for a new fixed course | **Days.** Continuity with every existing course and the verbal-Rx phrasing ("give it two weeks"); doses is one tap away on the same visible chip row. When the label-extraction quantity prefill ships (B-615), an extracted "#28" flips the default to doses, prefilled. Reversible by data if most fixed courses turn out dose-entered. | PM delegated → team ruling, 2026-07-31 |
| **D3** | Pace / "behind schedule" concept | **Punted entirely from v1.** No pace copy anywhere — not on the card, not in a nudge. The existing compliance % (an adherence rate) is unchanged and orthogonal. When calendar and count diverge (the under-logging case), the card states only what the record shows; it never infers, never nags (Principle 4). | PM, 2026-07-31 |
| **D4** | Sequencing | B-441 (the `regimenDaysElapsed` UTC/DST over-count) closes in its **own session** — a soft pair, not a hard gate: the dose counter never touches `daysElapsed`, but the compliance line on the same card does, so the card isn't fully honest until both land. B-614's build runs in its own session against this spec. | PM, 2026-07-31 |
| **D5** | Diet trials | **Stay days-denominated.** A trial is a time exposure; the G3 duration defaults are week-banded (species × indication). No unit generalization to `diet_trials`. | Team (Engineer + Dr. Chen), 2026-07-30 |
| **D6** | One predicate | There is **one** count predicate, exported from `lib/medications.ts`, and every consumer reads it — the diet-trial §5.3 lesson (a second, contradictory off-diet definition shipped and had to be re-based). No surface re-derives "does this administration advance the count." | Team, 2026-07-30 |
| **D7** | Completion language | Reaching the target **never** renders completion or stop language — no "course complete", no checkmark-of-doneness, and no path to a stop instruction (end-of-course is the vet's call; antibiotic early-stop hazard, B-394's line). `status` remains the only lifecycle authority; the owner/vet ends a course, a counter never does. | Dr. Chen, non-negotiable, 2026-07-30 |

## §1 Problem and evidence

A fixed course is expressible only in days (`medications.target_duration_days`, migration 020). The PM's Motozol course was dispensed as **28 doses**; entered in days with an evening start, "Day X of Y" ran ahead of the bottle from day one and compliance under-read (expected = `doses_per_day × daysElapsed` charges a full first day the course never had). The label — "#28 dispensed, until gone" — is the dispensed truth; days is a derived approximation that fails at both ends (evening starts over-count the front; a missed day silently shifts the true end). Full grounding + the persona convening: the 2026-07-30 session record.

## §2 Scope / non-goals

**In:** dose-denominated fixed courses for medications — schema, entry, profile-card progress, one shared count predicate.
**Out (named, not implied):** tapers / variable-frequency schedules (a dose *total* still beats days for them, but the projection math needs per-phase frequency — future item); any pace concept (D3); diet trials (D5); the B-394 forward projection surface (its design session consumes this primitive); label-quantity prefill (**B-615**); Ask/report changes (§7 — verified no-ops for v1); B-441 (own session).

## §3 Schema — PR 1

Migration `049_medication_dose_duration.sql` (next free number after 048):

```sql
ALTER TABLE medications
  ADD COLUMN target_duration_doses INTEGER
  CHECK (target_duration_doses > 0);

ALTER TABLE medications
  ADD CONSTRAINT medications_one_duration_denomination
  CHECK (target_duration_days IS NULL OR target_duration_doses IS NULL);
```

- Both NULL = ongoing (unchanged). Exactly one non-null = a fixed course in that unit. The constraint makes a two-unit row unrepresentable rather than reconciled.
- **Pre-flight:** additive; rollback = `ALTER TABLE medications DROP CONSTRAINT medications_one_duration_denomination; ALTER TABLE medications DROP COLUMN target_duration_doses;`; destructive **n**; backfill **N/A** (every existing row is days- or ongoing-denominated and stays so).
- Local mirror: the column joins `MEDICATION_SCHEMA_SQL` (B-424 — schema constant, never inline DDL; `medications` is already in `LOCAL_WIPE_TABLES`, no wipe change). The hydration test enforces the constant path by construction.
- `get_advisors` after apply, per the runbook.

## §4 The count predicate — PR 2

One exported definition in `lib/medications.ts`:

```ts
// D1 (PM-ratified 2026-07-31): the dose counter means THERAPY DELIVERED.
// given + partial advance it — the same "administered" the vet report ships
// (render.ts medicationLine). refused / missed / unrated / unconfirmed never
// do; they stay visible via regimenFlagLine. This is deliberately NOT the
// compliance numerator (given-only), which is a stricter rate statistic.
export function dosesTowardTarget(tally: AdherenceTally): number {
  return tally.given + tally.partial;
}
```

- Consumers: the profile card (PR 4) and any future surface (B-394's projection, the report if it ever renders course targets). None re-derives it (D6).
- Soft-deleted dose events already fall out of the tally at the query layer — the count follows the record, so deleting a mislogged dose correctly decrements. Not a bug; assert it in tests.
- **Tests (PR 2):** refused/missed/unrated/unconfirmed never advance; `dosesTowardTarget(t) ≤ loggedDoses(t)` (property over random tallies); zero tally → 0; the predicate and `computeRegimenCompliance` disagree by exactly `tally.partial` (pins the two-definitions fact so a future "consistency fix" trips a test and reads this comment).

## §5 Entry — PR 3 (`AddMedicationModal.tsx`)

- The B-158 chip (Ongoing / Set an end) is unchanged. Picking **Set an end** now reveals the number field plus a second visible `ChipGroup`: **days | doses** (closed set, two options, gates the field's unit label — the B-146/filter-UX rules make this a chip, not a menu). Default **days** (D2). `allowDeselect` off.
- The form writes **exactly one** of `target_duration_days` / `target_duration_doses` (the other explicitly null — mirroring the existing "blank/zero never fakes a course" rule). Positive integer only.
- Editing an existing course preserves its stored unit (a days course opens with the days chip lit; switching units converts nothing — the number is the owner's to restate).
- Voice: the unit suffix is the word `days` / `doses` after the field, as today.

## §6 The card — PR 4 (`app/(tabs)/profile.tsx` regimen card)

- A doses course renders **`Dose {n} of {target}`** where `n = dosesTowardTarget(tally)`, and the progress bar encodes `n / target` — the bar and the line state the same number (the diet-trial bar lesson).
- `n` starts at 0: "Dose 0 of 28" before the first administration is honest; exact zero-state copy is a build-time `nyx-voice` pass.
- **Past-target:** extra administrations are evidence and are never hidden — line becomes `28 of 28 doses · 2 more logged` (exact copy at build; the rule is *cap the bar, disclose the extras, render no error*). The card does **not** fall back to "Started …" the way the days path must ("Day 30 of 7" is nonsense; "28 of 28" stays true).
- **No completion state** (D7): no checkmark, no "complete", no dismissal. The flag line (`2 refused`) and compliance line render exactly as today.
- Days courses and ongoing courses render unchanged.
- Sign-off: Designer (principles 1/3, bar semantics) + `pm-feature-review` on the built card.

## §7 Verified seams — no PRs, do not "fix" in this track

| Surface | Finding (verified 2026-07-31) | Action |
|---|---|---|
| Vet report | `ReportMedicationInput.targetDurationDays` (`report.ts:376`) is carried but **never read**; the meds line renders dates + window-scoped adherence. A doses course renders correctly today ("since <start>" + administered counts). | None. If the report ever renders course targets, it reads the D1 predicate. |
| Ask | The `medications` tool reads status/adherence, not duration. The forward projection ("when's her last dose") is **B-394's design session**, which now has an exact primitive: `remaining = target − dosesTowardTarget(tally)`; a *date* projection additionally needs `doses_per_day` (PRN + dose target ⇒ count only, no date — honest). | None here; hand this spec to the B-394 session. |
| generate-signal | Reads `diet_trials.target_duration_days` only. | None. |
| Sync | `lib/sync.ts` medications select/upsert gains the one column (PR 2). | PR 2. |
| Label extraction | Quantity dispensed ("#28") is on every Rx label; prefill → doses default. | **B-615** (filed). |

## §8 QA matrix (PR-4 acceptance)

1. New fixed course entered as 28 doses, evening start → card reads "Dose 1 of 28" after the first logged dose; no day arithmetic anywhere in the line.
2. Refused dose logged → count unchanged; flag line shows "1 refused".
3. Partial dose logged → count advances by 1 **and** flag line shows the partial (D1: advances *and* stays disclosed).
4. Soft-delete a logged dose → count decrements.
5. 29th administration on a 28-dose course → bar full, extras disclosed, no error, no "complete".
6. Existing days course + ongoing course → render exactly as before (regression).
7. Edit a days course → days chip lit, value intact; switch to doses → field cleared for restatement, save writes doses and nulls days.
8. DB refuses a row with both denominations set (constraint test in PR 1).

## §9 PR plan

| PR | Contents | Gates |
|---|---|---|
| **1** | Migration 049 (schema-only, isolated). Applied via MCP `apply_migration` with this PR; `get_advisors` after. | Pre-flight block in the PR body. |
| **2** | Client data path: `MEDICATION_SCHEMA_SQL` column, `Regimen`/`RegimenWritePayload` types, `buildRegimenPayload`, `lib/sync.ts` columns, `dosesTowardTarget` + §4 tests. No UI. | PR 1 applied. Tests per §4. |
| **3** | Entry UX (§5): unit ChipGroup, one-column write, edit-preserves-unit. | PR 2. Designer sign-off. |
| **4** | Card (§6): count line + bar + past-target handling. | PR 3. `pm-feature-review` + §8 matrix + on-device QA script. |

Kickoff prompt for the build session:
> Build B-614 PR 1 (schema) per `docs/nyx-medication-dose-duration-requirements.md` §3 — migration 049, isolated, pre-flight in the PR body, apply via MCP + `get_advisors`. Then continue PR 2 per §4 in the same session only if the PM confirms; otherwise stop at PR 1 per schema isolation.

**Adversarial-review posture:** the count predicate is adherence-adjacent but deterministic and single-line; the DoD's adversarial line is satisfied by §4's property tests plus a named falsification in each build PR (the convening's two: the refused-tail course that must never read complete; the taper that stays out of scope). No statistical engine is touched, so the `adversarial-reviewer` subagent is optional, not mandatory — unless a build PR grows a projection surface, which re-triggers it.
