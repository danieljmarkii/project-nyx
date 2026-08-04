# Medication history (B-140 extended) PR 5 — the vet-report lifetime medication table

**Date:** 2026-08-04
**Shipped via #591** (draft) — the last PR of the medication-history track's *past* tense.

## What shipped

The window-ignoring **"Medication history" table** on the vet report (D2, spec §4.4, mock §05). The report's medication machinery was all scoped to the report **window** — a 30-day report never said "prednisolone in the spring" — so the vet's first intake question, *"what has she been on, ever?"*, was unanswerable from the artifact. This adds a compact four-column table (**Drug · Dates · Course · Doses logged**) in the appendix zone directly above the windowed Appendix D, listing every course active *and* past.

It reads the **one shared `lib/medicationHistory.ts` predicate** (`deriveMedicationCourses`, PR 1) that the profile card, med-detail and rundown surfaces already read — the diet-trial §5.3 one-predicate lesson applied to medications, so a count or an ending here can never contradict the app.

- **`report.ts`** — `buildMedicationHistory()` + the `MedicationHistoryEntry`/`MedicationHistoryTable` snapshot types. New `ReportInput.lifetimeDoses` (the untrimmed dose set) and `ReportMedicationInput.targetDurationDoses` (B-618). **H1 is structural**: `ended`/`endStatus`/`endedDay` are set only from the derivation's owner-action end register, so silence never becomes an ending. **H4**: `dosesLogged` is `dosesTowardTarget`.
- **`render.ts`** — the table beside Appendix D; a coverage note + the H1 and completeness disclosures stated **up front, before the data** (B-494). Four date registers, each self-disambiguated by its Course cell (see the fix below). Un-lettered by design (one table, not a second appendix — D2), but named in the appendix contents map where it renders.
- **`index.ts`** — the key data insight: the `medication_administrations` query already pulls the pet's **entire** dose history (a dose's instant lives on its parent event, so the query can't be `.gte`-bounded — the 180-day lookback is only an in-memory trim). So a *lifetime* table needs no wider query: `index.ts` maps that one pull **twice** — `doses` trimmed for the windowed sections, `lifetimeDoses` untrimmed for this table. `doseItemIds` is keyed off the lifetime set so a course whose doses predate the lookback still resolves its drug name.
- **Tier-2 spec edit** applied to `nyx-vet-report-requirements.md` §3.8 + Appendix D (the task's explicit deliverable, D2 ratified).
- **Tests:** 18 new §4.4 deno tests (12 assembly + 6 render); **417 `generate-report` tests green**, `tsc` clean, full jest green (pre-push, 4368).

## Gates (both mandatory for a report change)

**`adversarial-reviewer` — FAIL → fixed.** The derivation was confirmed safe; the break was one root cause in the renderer's `medHistoryDates`. The guard `if (e.ended && e.endedDay)` required `endedDay` **non-null** — the opposite of its own docstring's "H1's null-endedAt case" — so an owner-ended course with `ended_at = NULL` (schema-valid; nullable since migration 020, and the derivation explicitly models `{ended, endedAt:null}`) fell through to a closed `fmtRange(start, lastDoseDay)`, **fabricating an "ended by owner {last-dose date}"** the owner never recorded. The same fall-through made a `paused`/unknown-status regimen render a finished-looking closed range (its Course cell shows a real spec, not the orphan "No regimen recorded" tell, so nothing disambiguated it). Both **latent** — not reachable through the shipped app UI today (completed writes always date `ended_at`; `paused` isn't in the enum; inserts are always `active`) — but schema-valid and **roadmap-reachable** via B-394's status writes, the A-2 `paused` amendment, or any import/backfill. The kind of flaw that ships under ceremonial ✓s: the safe derivation is what everyone reviews; the inverted guard hid in a rendering seam with no test. **Fix:** `medHistoryDates` rewritten into four explicit registers — an ended course with no date now renders `started {day}` (never a fabricated range), and a non-active/non-ended regimen renders `started {day}` (never a closed range). Pinned by 3 new regression tests (1 assembly + 2 render) and confirmed by inspection: the edge row now renders `Prednisolone | started Apr 10, 2026 | 21 days, 1×/day · ended by owner | 18 of 21`.

Everything else the reviewer attacked **held**: H4 (count = `dosesTowardTarget`), window-ignoring (a pre-lookback-only course still lists + names), orphan name resolution, the active-vs-ended "of N" split (no countdown, no over-delivery "30 of 28"), and B-494 (an absent table never reads as "never on this drug" — Appendix D always carries the completeness caveat).

**`vet-report-cold-read` — the table earns its place.** Dr. Chen, reading the rendered artifact cold, extracted the cat's full GI treatment arc in one scan (*"Cerenia → Metronidazole → Motozol … changed my clinical read: recurrent/refractory GI"*), found the lifetime-vs-windowed relationship clear without instruction, confirmed "ended by owner" reads as an owner action (not a clinical completion judgment), and called the active-vs-ended count split "genuinely the safer design." Its one **in-scope** blocker — the completeness caveat ("absence is not evidence it was not given") belonged **on** the lifetime table, not only under Appendix D — is **fixed** (the caveat now leads the table). It also raised the un-lettered/contents-map nit → fixed.

The cold read's whole-document **NOT READY** rests on two **pre-existing** report defects my test fixture happened to surface, both explicitly *"not the med-table's fault"* and out of scope for this PR:
- **B-699** — the chronicity safety flag renders a lookback-bounded `firstOnsetIso` as an absolute "first logged" date that can contradict Appendix A and **under-state duration** (wrong direction for a safety lane). **Filed `Now`, flagged as gating the B-494 `generate-report` redeploy** (the redeploy ships the contradiction otherwise). Clinical → its own `adversarial-reviewer` gate.
- **B-700** — an OTC antihistamine reads as "a supplement" in the Reading-the-trend line (the pre-existing `is_prescription=false ⇒ "supplement"` mapping), while it's correctly a medication in the new table + Appendix D.

## Deploy

**No standalone deploy** — per D2/spec, this rides the **B-494 `generate-report` redeploy**, which is separately gated (B-494's own adversarial + Dr. Chen sign-off, plus now B-699). Until that redeploy, the live report keeps the pre-PR-7 behaviour; the lifetime table is code-complete and test-covered, waiting on the shared redeploy vehicle.

## Track status

B-140 PRs 1–3 shipped (#585/#587/#588); **PR 5 = this (#591)**; **PR 4** (rundown medication-history block, D3 provisional) is the only remaining, parallel-safe piece. Invariants H1–H4 hold across all built surfaces.
