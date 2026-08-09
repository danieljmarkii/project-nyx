# Signal/Home uplift SR-4 (B-721) — the generate-signal additive payload

**Date:** 2026-08-09 · **PR:** shipped via #615 (draft)

The track's one server payload PR. `generate-signal` gains two additive, **post-detection** payload facts plus the Change Contract v1.1 guardrail coverage. Nothing changes detection, ranking, or thresholds — a diff-scoped test asserts the detectors emit neither new field, and the full pre-existing detection suite passes unchanged.

Spec: `docs/nyx-signal-home-requirements.md` §3.3 (density rule), §5.4 (med-on-board line), §3.5 (residual vetoes), §8 (SR-4 = adversarial-mandatory), §11 (ACs).

## What shipped

**`densityComparable` — the falling-comparison density gate (§3.3).**
- `computeReflectionDensity` (`detection.ts`) computes "days-with-any-log" per week and returns `{ comparable, currentLoggingDays, priorLoggingDays }`. It reuses the **exact** window boundaries ③/④ use — the shared logging-days math was extracted out of `computeWindowedStats` into one `loggingDaysInWindow` helper, so the density gate and the reflection detector can never drift on what "this week / last week" means. (The refactor is behaviour-neutral: a 20k-input fuzz in the adversarial pass found `loggingEligible` byte-identical before/after.)
- `DENSITY_COMPARABLE_MIN_RATIO = 0.7`: a falling reflection's "down from N last week" is withheld when this week's logged-days fell below 70% of last week's. Asymmetric and **fail-toward-escalation** — it only ever *removes* a reassuring comparison, never adds one, never touches a rising/worsening comparison, and an absent `density` (old cached finding / null compute) renders byte-identically to pre-SR-4.
- `templateReflection` (`phrasing.ts`) withholds the clause on `density.comparable === false`; only the falling arm is gated (a flat "about the same" is not a reassuring improvement claim, §3.2).

**Med-on-board context (§5.4).** New `medContext = { drugLabel, doseCount }` on correlation + timing findings, computed from the *same* medication rows the confounder pass already reads.
- `mapMedDoseFacts` (`index.ts`) builds administered + nameable dose facts, reusing `doseToMedicationWindow` as the on-board filter — so a fact is *exactly* a dose the engine treats as on-board (missed / refused / the B-174 in-doubt combo dose all dropped identically; one definition, never a second).
- `computeMedOnBoard` (new `medContext.ts`) groups by drug case-insensitively and returns the most-dosed course's label + in-window dose count over `MED_CONTEXT_WINDOW_DAYS = 60`, or `null`. The drug is named regimen-first (`medications.drug_name`, NOT NULL), else the library item's brand/generic; an unnameable dose is excluded (never a blank `{drug}`, and `doseCount` is always ≥ 1 so the client never renders "0 doses").
- The two existing medication SELECTs gained `drug_name` and `medication_id` + `medication_items(generic_name, brand_name)` — additive columns on existing queries, no new round-trips.
- `decorateFinding` attaches both facts post-detection and returns a *new* finding (never mutating detector output). The handler decorates the curated set before phrasing so `templateReflection` sees the density.

**Guardrail regex coverage (§3.5).** `GLYPH_RE` + `PERCENT_RE` + the exported `hasBannedSignalVocabulary`, screened in `validatePhrasing` on every finding type — no direction glyphs (↑↓→/slope), no percentages, ever. The change-clause template audit is test-pinned per template (reflection carries a counted, time-ordered pair; worsening carries a prior clause across every tier×trigger; intake carries its duration; chronicity carries span+count and never a week-pair).

**Client note:** the med line and density-withheld/disclosure copy render in **SR-5** — this PR is facts only.

## Architecture choice — why decorate post-detection

The med label needs a DB read the detectors don't do, and the §11 AC forbids any detection/ranking/threshold delta. So both facts are attached by a decoration step *after* `detectSignals`, via pure helpers, leaving every `detect*` body byte-identical (the entire existing detection suite passes untouched, and a new test asserts the detectors emit no `density`/`medContext`). The optional finding fields live on the interfaces in `detection.ts`; the decoration logic lives in `medContext.ts` (med) and `computeReflectionDensity` (density). This kept the diff cleanly additive.

## Tests

345 → **398** deno tests (offline). `generate-report` and `ask` (which import `detection.ts`) still `deno check` clean; the app's `tsc`+jest are unaffected (`supabase/functions` is excluded). The adversarial pass ran the suite plus its own throwaway probes.

## adversarial-reviewer — PASS (mandatory for SR-4)

Every load-bearing claim survived a concrete counterexample:
- **Density gate is provably fail-toward-escalation** — it only ever replaces a falling reflection's "down from N" with a bare count; it cannot add a comparison, cannot resurrect a worsening/chronic-suppressed card (those never reach a reflection), and never touches a safety/rising comparison. Enumerated `[3..8]²` → `comparable` never false when density rose. Zero-prior guard holds.
- **Med count only ever reflects on-board, nameable doses** — a mix of given/partial/standalone-null + missed + refused + B-174 combo → `doseCount = 3` of 6; always ≥ 1; window inclusive-of-now, >60d excluded; blank labels dropped.
- **Detection output unchanged** across the decorate pass; the `loggingDaysInWindow` refactor is byte-identical under 20k-input fuzz.

Three residuals it flagged as **conscious-acceptance / PM decision briefs** (all spec-faithful, none a regression or reassurance-inversion), documented in code and filed:
1. **Any-log density blind spot** — the gate holds its invariant but "days-with-any-log" can't see a *symptom-only* logging lapse (meals kept density up while symptom logging fell), the most common real gap; the §9 withheld-copy "less to log" then over-claims coverage. → the copy fix is **B-726** (SR-5 / Dr. Chen).
2. **Med window ≠ finding window** — the 60d window is anchored at `now`, so an old correlation can carry a med line for a course that never overlapped its episodes (present tense keeps it honest). → **B-725**.
3. **Most-dosed pick is identity-agnostic** — a skin drug can be named on a vomit card and a GI drug omitted (no drug→side-effect data in v1). → **B-725**.

Two SR-5 client-copy flags → **B-726**: screen the *composed* med line for a `%`-in-drug-name (e.g. "Baytril 2.5%" trips the guardrail); pluralize "{n} dose(s) logged" (doseCount can be 1).

**DoD adversarial line:** Biostatistician/Data Scientist — tried an attention-bias week (meals daily, symptoms under-logged) → the gate correctly *cannot make the card more reassuring*, only ever withholds ✓ (but the any-log signal misses a symptom-only lapse — documented residual, PM/Dr. Chen accept); enumerated `[3..8]²` → comparable never false on a rise ✓; 20k-fuzz → `loggingEligible` byte-identical post-refactor ✓; mixed missed/refused/B-174 doses → count only on-board (3 of 6), always ≥1 ✓; med line names most-dosed course + windows at `now` — honest context, no reassurance/causation, flagged for PM ✓.

## Deploy — built + verified, live upload Codespace-gated

`scripts/deploy-edge.sh generate-signal` → `.edge-build/generate-signal/index.ts`, **113.2 KB** (115,935 bytes, un-minified, ASCII charset), **398 deno tests pass**, `node --check` valid, **sha256 `9c10d4977296fe5230682d3676b96da69d196a3e5062dca19f0dbc639233e018`**.

The live upload is **gated to the Codespace/token path** and left as a PM/Codespace action. Reasoning: this cloud session has no `SUPABASE_ACCESS_TOKEN`, and `generate-signal` is a large function (113 KB) — the Secrets Register's standing policy is that large-function deploys run from the Codespace, and the runbook warns the MCP inline path is unsafe past a few tens of KB (an agent would have to reproduce the artifact byte-for-byte to overwrite a **live clinical function**, with the sha check catching corruption only *after* the overwrite — and the same reproduction problem would block a fix). SR-4's payload is inert until SR-5 consumes it, and the only live-facing change is the safe density-withhold text, so there is no urgency to risk it. Current live: **v26 → v27** on deploy, `verify_jwt: true` preserved.

Deploy command (Codespace, token set): `bash scripts/deploy-edge.sh generate-signal --deploy`. Verify: `list_edge_functions` shows v27/ACTIVE, sha read-back matches `9c10d497…`, JWT'd bogus-pet id → `{"error":"Pet not found"}` HTTP 404, no-auth → 401.

## Follow-ups filed

- **B-725** — Signal med-on-board line: accept or refine the two targeting limits (window-vs-finding-span, identity-agnostic drug pick). `Later`, PM-optional.
- **B-726** — SR-5 copy pass for SR-4's new strings (screen the composed med line for `%`; pluralize dose count; reword the density-withheld line so it doesn't over-claim symptom coverage). `Next`, gates SR-5.
