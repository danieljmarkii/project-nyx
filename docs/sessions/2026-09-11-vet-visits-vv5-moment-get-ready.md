# Vet visits VV-5 — the Home strip, and the rundown promoted to Get ready

**Date:** 2026-09-11
**Issue:** CUL-903 (Vet visits — the appointment companion, milestone **C — the visit + the moment**)
**Outcome:** shipped via #835
**Mode:** BUILD

---

## What shipped

The companion's **moment** and its **preparation**, behind the `vet_visits` flag. VV-2 gave the owner a place to browse visits; this is the first surface that comes to *her*.

**`components/vetvisits/AppointmentStrip.tsx`** — Home, between `SignalZone` and `TrialStrip`. Five days before through the day of: *Get ready* and *Add a question*. After the day passes with no visit logged it asks **once** — *Did Tuesday's visit happen?* — and leaves whatever the answer.

**Get ready** — `/rundown` gains an `appointmentId` and becomes the job. "Promote, don't rebuild" is implemented literally: it is the same route, and `components/ask/RundownBlock.tsx` is the extracted body both modes render, so AC 4's byte-identical claim is structural rather than a promise.

**`lib/getReady.ts`** — Worth raising: deterministic, one source per row, quoted never re-derived.

**`lib/signalVisible.ts`** — `visibleFindings` lifted out of `SignalZone`, so Home and Get ready cannot hold two copies of the B-789 suppression.

Every *Decide on the fly* default taken as marked: window 5 · the slot under the Signal · the four-source set · cap 4 · *Copy as text* · `cancelled_at` + a device-local asked key.

---

## The decision the build stopped for, before a line was written

Mounting **any** companion node on Home reds `guards/homeWrites.test.ts`. That was measured, not predicted — VV-2's read-only card was imported into `app/(tabs)/index.tsx` and the guard named two `lib/vetVisits.ts` lines, because the scan is by *reachability* and that file holds booking's own `INSERT`.

Two things fell out, and only the second was the PM's.

**The registration.** Those two hits are writes Home will never call. `lib/vetVisits.ts` joins `WRITE_PATH` with the entry `dietTrialSetup` and `medicationSetup` already carry — the write *layer*, which Home only reads through. But that registration silences its raw SQL, so the companion's four helpers were added to `WRITE_CALLS` in the same change: a Home card calling one is still caught **by name**. C-32 — a rule added after the first caller is a rule added after the bug.

**The decision.** *It didn't* writes `cancelled_at`, and `docs/nyx-med-strip-requirements.md` §0.1 says Home carries exactly two write classes and **a third is a Tier-2 amendment, never a marker**. Put to the PM as a brief; ruled the same day:

> **Option A — one confirmation, no form.** *It didn't* writes from the strip; ***Add a question* becomes a door into Get ready.**

It passes D1's *original* test rather than needing the daily look's carve-out, which is what keeps the amendment to one sentence: the app is describing the row **on screen, in the same breath as asking about it**, the control opens nothing, and it starts no record. The other door had to move because typing is a form, and that is the clause D1 draws a bright line at. A second bound composes with it — `guards/visitReaders.test.ts` pins that an appointment reaches no count, coverage line, Patterns panel or engine input. One guard bounds what Home may write; the other bounds what a visit may influence.

**The guard is why this reached the PM at all.** It went red before the strip existed, which is the difference between a Tier-2 amendment and an allow-set line nobody notices in a large diff.

---

## The near-miss that would have broken AC 4

The obvious way to read the Signal's findings here is `useSignal()`. It refreshes a stale cache: `readSignalsAndRefresh` → `regenerateSignal` → `functions.invoke('generate-signal')` → **the Haiku phrasing call**. Opening Get ready on a cache older than 24h would have spent a model call, on a screen whose acceptance criterion is that it spends none — and, worse, made the page's content depend on one.

It reads `readSignalCache` directly. The spy asserts `functions.invoke` is never called through mount and every pressable in the tree. The distinction the screen rests on: **quoting findings the engine already computed is not asking for a judgment**, and Get ready reports the record rather than asking for it to be re-judged because a visit is coming.

---

## Four build calls inside Worth raising

Each is recorded in the spec under a **⚠ BUILD CALLS** marker, where it narrows a sentence.

1. **The cap of four binds the record's rows, not the owner's questions.** Capping the merged list would mean typing a fifth question deletes a Signal finding.
2. **Safety findings sit above the cap.** The Signal's findings are unbounded server-side, so this is reachable rather than theoretical, and Principle 3 says safety insights are never dropped to honour a layout cap.
3. **The weight row ships with no duration threshold.** *"Recent"* would be a new claim over a new window on the one page whose whole rule is that it makes none — and there is no constant in the app to mirror, so this module would be deciding alone how long is too long between weigh-ins for any species, age or condition. Two record-anchored gates instead, printing a **date**, never a duration (C-19).
4. **A failed Signal read is not a quiet record.** It names the gap rather than falling silent (C-12).

---

## What the checks caught that reading did not

**AC 3's placement claim had nothing checking it.** "Under the Signal and any safety or intake card" is Principle 3, not a layout preference — but the strip's own suite can only prove what the strip draws, and the flag-off guard compares two renders of the *same* tree, so it moves with a reorder rather than catching one. `app/(tabs)/index.order.test.tsx` pins the sequence; proven by moving the strip above `SignalZone`.

**A survived mutant turned out to be dead code.** A safety-first sort in `buildSignalRows` enforced nothing — `buildWorthRaising` partitions into `safety` + `optional` and concatenates, so a safety row leads whatever order it arrives in. Deleted rather than kept: a line that looks like it enforces the safety rule while enforcing nothing is worse than no line, because the next reader trusts it.

**The flag-off guard's per-consumer rule did not fit a consumer that IS the namespace.** `AppointmentStrip` holds its own gate and imports its siblings by relative path, which never matches `components/vetvisits/`. The right answer was a branch, not a `DRAWS_ELSEWHERE_OK` entry — that registry excuses a file from the rule, and this file *meets* it, strictly more strongly: a file inside the namespace is itself one of the modules the equivalence half stubs. Proven by mutating a screen to draw inline, which still reds.

**Three lying `as` casts in a fixture.** `end: { kind: 'no_end_recorded' }` is not a member of `MedicationCourseEnd` at all — `end.kind !== 'ended'` happened to be true for it, so four tests passed over a shape `deriveMedicationCourses` cannot produce. `satisfies` is what would not have let it through.

**A green test that measured nothing, twice.** A DST test built from offset-qualified literals was identical in UTC — and jest resolves the timezone once per worker, so `process.env.TZ` mid-run does not move `Date` (measured: 144 hours where the zone should have given 143). Removed rather than kept as decoration; the limit is stated in the file and filed as **CUL-948**. Replaced with the property that *is* testable and reaches an owner: read at 23:30 on a booking at 00:30 six days later, anything dividing milliseconds says five.

---

## The reviews

Both mandatory reviews returned findings. **`adversarial-reviewer` returned FAIL with eight; `code-reviewer` returned fix-before-merge with six.** Two overlapped. Everything below is fixed here, each with a test proven by mutation.

### The one with the worst reach

**A Signal that had never been generated read as "nothing standing".** `readSignalCache` returns `null` for no row — and gets there **without throwing**, because PostgREST's `maybeSingle()` answers zero rows with `{data: null, error: null}`. So `row?.findings ?? []` turned *"nobody has looked at this animal"* into *"we looked and found nothing"*: `signalUnavailable` false, no gap line, the quiet-record treatment. Reachable on a new pet booking a first appointment, and on any pet whose regens have never succeeded.

This module's own header states the rule it broke — *an owner who cannot tell "nothing standing" from "we could not look" reads the first and walks into the room reassured*. The doctrine was written down and the code did the opposite one function away.

### The rest, in severity order

- **An Established food–symptom correlation was capped off the page to make room for a weight date** — on the wedge owner's record, at a recheck. The first ordering gave three of four optional slots to the trial, the course and the weight, leaving one for the whole insight band, and `mergeStandDowns` ranks a stand-down marker at the *top* of that band. The Signal's insights now sit above the course and the weight; the trial still leads them. **The stand-down stays** — the first instinct was to drop the class as "an absence, not a thing to raise", and that is wrong on the clinical read and contradicts the issue's own counterexample: the marker's copy refuses to reassure, and "the vomiting has been quiet a fortnight" is exactly what a vet wants at a recheck for vomiting. The *order* is what fixes the displacement.
- **`end.kind !== 'ended'` is true BY CONSTRUCTION for a dose-derived course.** `deriveMedicationCourses` says so outright — no regimen, no status, so `end` is always `none`. Every ad-hoc dose an owner has ever logged was a permanent "course with no end recorded": one Cerenia tablet held a capped slot forever under a question (*is she still meant to be on this?*) that is fabricated for a PRN dose. The row is a **regimen** the owner set up and never ended.
- **A nameless orphan dose suppressed the real unterminated regimen behind it** — while the rundown's past-meds block, printed directly below, named them both, because `lib/rundown.ts`'s namer has a `?? 'Medication'` fallback this module's private copy did not. Two namers over one population, on a module whose whole claim is that it quotes. It uses the rundown's own exported namer now.
- **The weight gate inverted on a future `lastVisitAt`**, printing *"Last weighed Sep 11 — before the last visit"* over a pet weighed an hour ago — self-contradictory on its face. `facts.lastVisitAt` is `readLastVisitDate`'s unbounded `MAX(visited_at)`, and **CUL-946 puts a tomorrow-dated row there for every visit logged after ~5pm PDT**, so this is live today. Bounded to strictly before today: the report's own rung-1 rule, so this page and the document it hands the vet agree about which visit is the last one.
- **The weight row led with a range and buried the claim.** Read aloud, item four of *Worth raising* was "4.0–4.2 kg" — a range over up to sixty readings — with the thing worth raising in tertiary fine print. Dr. Chen's lens; the claim leads now.
- **A second clock over the courses.** `splitPastCourses` ran on a fresh `Date.now()` while the block below had split on `generatedAtMs` — seconds wide, and literally a second window over the population this module's header says it never opens one over.
- **The preference screen deleted a coverage denominator.** It nulled the `detail` of any tripping row, so a trial whose food is called *"the kibble she prefers"* silently lost *meals logged on 20 of 23 days*, with no test. A screen that deletes evidence to avoid a word is the wrong trade on a page a clinician reads. It now covers only the one row this module *composes* — the course row's `${name} — ${value}` join — and the quoted rows are registered with a reason each. Quoted, never re-derived, applies to the screen as much as to the counts.
- **The guard's exemption claimed more than the server provides.** It said the intake invariant "is already enforced" in `phrasing.ts`; that screen is `/\b(picky|fussy|finicky)\b/i` and gated on safety class, so `prefers` / `preference` / `pickiness` and every insight-lane string are uncovered at both ends. Stated accurately now — C-38: an undocumented blind spot in a guard reads as coverage.
- **`AppointmentStrip.load()` had no monotonic id.** `loadedFor` stops the strip ever *showing* the wrong pet's row, but not an out-of-order *write*: a slow read for the previous pet resets it and the current pet's strip vanishes until the next focus. A real upcoming appointment silently missing after a routine pet switch, on the surface whose whole job is to surface it.
- **The loading copy named `activePet`** on a screen whose header says every read is the appointment's pet. Not reachable from today's only entry point; reachable from the next one (CUL-253's reminder deep link). It names nobody before a read answers — correct-but-anonymous beats confidently wrong (C-9).

### Found by reading, in this session's own code

**A stale load could commit its appointment over a newer one.** The `await` sat *inside* the object literal handed to `setGetReady`, which puts the write after it resolves — so the staleness check was one line **below** the write it guarded, while the identical call three lines up had it right. Both reviewers found it independently; it was already fixed when their reports landed.

Its regression test was then **green over nothing on the first cut** — it armed the hold and cleared the flag before the call it meant to park ever happened. Caught by mutation, not by reading. The gate is captured at the call now.

---

## Residuals

- **CUL-948** — the CI timezone matrix has no DST zone, so every local-day rounding rule in the repo is written correctly and checked by nothing. One zone in `.github/workflows/ci.yml` fixes it, and it may red existing tests, which is the point.
- The strip's after-the-day ask is bounded by the same five days, so an owner who does not open the app for a week is never asked on Home. The row is not lost — it is in the list's *Waiting on you* bucket, which is what VV-2 built it for. Stated in `lib/vetVisits.ts`.
- `guards/worthRaising.test.ts` now records that `phrasing.ts`'s dismissive screen is narrower than AC 5's vocabulary. Widening it is server-side work on the CUL-557 redeploy chain, not this PR's.

---

## What generalises

Nothing here needed a new Code Convention — every lesson was an existing one, which is itself the finding:

- **C-32** twice: the write-helper names registered on the PR that ships them, and two guard registries that had to earn each entry.
- **C-18** three times: a survived mutant that was dead code, a test green over nothing, and a guard proven by breaking the source.
- **C-35** verbatim: a fixture production cannot produce (`weighIns: []` beside a weight *range*) turned out to be hiding a real coupling — the module's gate asked the readings while printing the tile.
- **C-12** at its sharpest: the three-state rule failed not on a loading flag but on a **network call that answers "nothing here" without erroring**. `maybeSingle()` is the shape to watch — absence and emptiness arrive through the same door.
- **C-36**: a stated blind spot is coverage; an unstated one reads as coverage. Two of the eight adversarial findings were guards claiming more than they check.
