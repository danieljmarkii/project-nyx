# Event taxonomy — W1-PR-3b session 2: cough joins the engine (CUL-676)

**Date:** 2026-08-28
**Branch:** `claude/w1-pr-3b-cul-676-cough-uj2rm0` (restarted fresh from `main`; #730 and #731 merged)

## What this was

The feature half of W1-PR-3b. Session 1 (#731) built the per-lane membership map,
the per-type chronicity floor slot and the negative fixtures, all behaviour-neutral;
this session flips the ruled cells, calibrates the floors, implements the two PM
rulings that needed design work (R3, R4), does the §10.5/HR-3 report co-work, and
resolves the redeploy gate.

## What shipped

- **Cough enrols — in exactly two places.** `CORRELATION_SYMPTOM_TYPES` (the FETCH
  union) and `LANE_SYMPTOM_TYPES.chronicity`. Membership in the fetch buys the DB
  read and the logged-day denominators (R3) and nothing else; every lane reads its
  own cell, so ①/③④/L4/the diagnostics floor are untouched and their paired
  negative fixtures still hold. `sneeze` stays out of the fetch (data-only, §9).
  Pinned two ways: a per-cell `deepEqual`, and an assertion that the set of lanes
  containing cough is exactly `['chronicity']`.
- **The B-755 floors (owned calibration, Dr. Chen lens).** `perType.cough` =
  `minEpisodes: 4` (global 6) and `firmSpanDays: 28` (global 42). The three
  untouched floors are pinned by test with their reasons, because "calibrating
  cough" must not quietly become "loosening cough". The argument, in one line: the
  global floors were tuned to out-count a BENIGN BASE RATE, and a recurring cough
  has none — `minSpanDays: 21` (unchanged) is what excludes the self-limiting
  kennel-cough/post-viral course, and lowering it would fire hardest on exactly the
  cough that was about to stop on its own. **No veterinary numeric threshold exists**
  (the "≥4 weeks" figure is human paediatric; the vet chronic-bronchitis convention
  is a diagnostic label, not a call-someone boundary), so the copy never cites one.
- **R4 — both stated.** `detectChronicity` returned `[chronic[0]]`; it now returns
  every chronic course. The cap was a silent DELETION of a safety statement, and the
  sort made *longer* the winner, which is not *worse*. **Chose option (i) (per-course
  cards) over the team's (ii) (one composed card)** on evidence, not preference:
  `curateFindings` keeps every safety finding, `rankFindings` already orders
  co-firing safety cards, and `SignalZone`/`visibleFindings` does not dedupe by type
  — so both courses reach the owner **on the already-shipped client**. A composed
  card would have needed a new payload field AND a new renderer, because
  `lib/signalCopy.ts` composes this card's body client-side — i.e. a second App
  Store release before it could say anything. Per-FAMILY was rejected for still
  dropping a course (two chronic GI signs) to buy a bound we do not need. The calm
  surface is protected by the FLOORS, not a cap. Shipped precedent for the shape:
  two co-firing `incident_red_flag` cards (B-364), whose explicit tie-break this
  copies rather than leaning on `Array#sort` stability.
- **R3 — cough days are logged days**, plus a structural fix the fixture found. The
  engine needed no edit (denominators read the fetched input), but a test feeding the
  module a `sneeze` row proved the documented invariant `denominator == fetch union`
  held only because both callers happen to filter. All three denominators now enforce
  it themselves via `isFetchedSymptom`, so a later wave widening the fetch carries its
  denominators automatically. Both client mirrors moved in the same change, with a new
  `guards/loggedDayParity.test.ts` comparing them against the engine's list read from
  source (red-checked by adding `sneeze` to a mirror). The accepted cost — a pooled
  denominator with a vomit-only numerator can nudge a trial read toward "fewer during
  the trial" — is disclosed in `lib/dietTrialFacts.ts` rather than left to be
  rediscovered.
- **§9 cough↔vomit adjacency.** A composition-layer pass marks the LEADING chronicity
  finding when both courses are chronic; the card and the report flag then say the two
  counts may describe the same moments and ask for both to be raised together. It
  discloses overlap and never nets a count down or offers the hairball explanation.
  Only reachable because R4 stopped the collapse — under the cap the two could never
  be on screen together, so the §9 rule had nothing to bind.
- **HR-26 disclosed in place** at the ③ valve: a chronic cough now blanks the pet's
  whole reflection layer, for unrelated signs too. Intended (the valve exists so the
  app never soothes about one sign over a pet with an unresolved problem elsewhere),
  written next to the code so a suddenly-quiet Home is not filed as a bug.
- **Report co-work (§10.5 / HR-3).** `cough` + `sneeze` joined `REPORT_SYMPTOM_TYPES`
  — cough had to, because `buildDetectionInput` filters on the fetch union, so the
  report now runs ⑦ over cough and would otherwise print a chronicity flag about a
  sign its own §3.5 table never counts (the B-494 class). `render.ts` gained real
  clinical labels (`Coughing`/`Sneezing`) over a `default` that humanised to "cough".
  The report's `chronicity` extract became a **list**, mirroring `worsening`, so R4's
  second course is not discarded one layer later.
- **HR-7 settled, and it was live already.** The §3.5 frequency section counts
  minute-deduped rows and called them "episodes", one page from the chronicity flag's
  3h-chained "episodes". Applied the ruled fix — §3.5 says **entries**, the flag keeps
  **episodes**, plus a legend entry stating that the two differ on purpose and that
  their ratio is itself clinical signal. Found a third instance nobody had listed:
  `summary.ts`'s month clause counts RAW ROWS, so it now reads "I've logged coughing
  14 times", never "14 episodes".
- **Summary membership ruled explicitly** (session 1 named it session 2's decision):
  cough is IN the month-summary naming gate, on R3's own ground — the clause is a
  descriptive count of the owner's logs, and excluding it would print a "most-logged"
  claim that omits the most-logged sign.
- **Ask's G5 parity closed** — `ASK_SYMPTOM_TYPES` gained the pair, mirroring
  `SYMPTOM_EVENT_TYPES` (which moved in 3a) exactly as its walk row said it would.
  Deploy rides the held CUL-557 chain.
- **Membership walk 18 → 19 rows**, five rows flipped, one row's stated decision
  CORRECTED: `TRIAL_RESPONSE_LOGGED_DAY_TYPES`'s sneeze cell said "a sneeze log is
  logging too", which — followed literally — would have broken the client==server
  parity that row exists to protect, because sneeze is not fetched.

## The redeploy gate — NOT cleared

`generate-signal` is re-acknowledged **`pending`**, not deployed. The ruled
precondition is a live build carrying PR-3a (#730); the installed TestFlight build is
**1.1.0 (35), 2026-07-25** — a month older than #730 and older than the enum migration
(#728), so it does not know the `cough` event type at all. PR-3a's `symptomWord()`
fallback prevents a literal "undefined" but is defence-in-depth, not a licence to
deploy ahead of the gate. To clear: cut an A-Native TestFlight build carrying #730
(the SDK-57 fence makes OTA a no-op), confirm it is live, then redeploy.
`generate-report` stays **`hold`** — the CUL-19/B-494 hold is untouched. `ask` stays
`pending` behind CUL-557.

## Verification

- `tsc --noEmit` clean · **jest 275 suites / 5,995 tests** · **Deno 1,404 tests** ·
  5 snapshots unchanged.
- **CUL-613 red-checks, run before the new fixtures were trusted.** The R4 acceptance
  test was run against the restored `[chronic[0]]` cap: the four both-stated fixtures
  went red and both single-course controls stayed green — the discrimination is real,
  not incidental. The parity guard was run with `sneeze` added to a client mirror: two
  of four went red, including the sneeze-trap case.
- The R4 acceptance fixture is the **adversarial shape recorded on the issue**, not
  merely "two chronic symptoms": a 52-day / 10-episode MILD cough against a 24-day /
  8-episode denser vomiting course, with anti-vacuity assertions that the cough really
  is the longer course (so it would have won the old cap) and the vomiting course
  really clears the GI floor on its own.
- The lane sweep was **narrowed, not weakened**: it used to assert no finding names
  cough; it now asserts that the only finding type that may is `symptom_chronicity`,
  with an anti-vacuity check that the ⑦ shape still produced one.

## Decisions taken in-session (build-level)

- R4 mechanism = option (i), per the ruling's own "whichever passes the fixture
  smallest wins" — with "smallest" measured in DELIVERY, since (ii) could not reach an
  owner without another App Store release.
- The denominator invariant is enforced in the module rather than documented, because
  "correct because every caller remembers to filter" is the shape HR-1 was.
- The adjacency note marks only the leading card, so Home shows it once.

## Residuals / next

- **The B-755 cough floors are an owned calibration and want PM/Dr. Chen ratification**
  — presented as a decision brief at wrap. They are pinned by test, so a change is a
  visible diff.
- **R4 changes behaviour for the existing five types** (a chronic vomiting + chronic
  itch pet now gets two cards where it got one). Deliberate and disclosed; worth a
  sentence in the TestFlight release notes when the redeploy lands.
- The `signalWatching` gap row stays OPEN (the W1-greenlight rider), unchanged here.
- W2 remains blocked on §9b's six open defects (CUL-684); W1 touches no §9a rule.
