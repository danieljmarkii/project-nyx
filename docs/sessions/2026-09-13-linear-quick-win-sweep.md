# Linear `Quick Win` sweep — four shipped, four reconciled

**Date:** 2026-09-13

Shipped via #844. Twelve `Quick Win` candidates read in full, four built, four resolved as Linear
reconciliation with no code, one new issue filed. Six commits on `claude/elegant-bohr-3k4tbg`,
+443/−19 across nine files, all authored this session.

---

## What shipped

**CUL-879 — the vet-visit EXIF stamp is guarded.** `app/vet-visit.tsx`'s `handlePickPhoto` read
`DateTimeOriginal` and handed it straight to `setVisitedAt`. EXIF is a naive stamp off the camera's
own clock, and here the value is not cosmetic: it seeds both `vet_visit_attachments.taken_at` and
the visit's **date**, which the report's visit list reads. Every other photo path already wraps the
parse in `trustedPastExifIso` (`app/log.tsx`, `components/log/SimpleEventConfirm.tsx`,
`app/food-capture.tsx`; `lib/vetDocumentCapture.ts` restates the rule for the document path) — this
screen was the one that did not. Guarded at the parse so both consumers inherit it.

No `refreshedNowPoint` on the fall-through, unlike the log paths: that step exists for a point
time's `occurred_at_source` provenance, and `visited_at` is date-only with no source column.

The screen had no test suite. `app/vet-visit.test.tsx` is new, and drives the real picker path
rather than re-composing the guard in a fixture — a fixture would re-derive the production rule and
pass straight over the only thing that can regress, the call site dropping the wrapper (C-34).

**CUL-327 — the calendar says which bound it is on.** At the current month (forward disabled) and
the pet's oldest logged month (backward disabled), the only signal was a dimmed chevron. A quiet
line under the nav row now names it: `Current month`, `Oldest month with logs`, or — for a pet whose
first log is this month, where neither direction can page — the single sentence `Current month, and
the oldest with logs`. Two stacked fragments would read as a contradiction. Mid-range it renders
nothing, because a line on every month stops carrying information.

Under the row rather than beside a chevron: the nav row is a space-between `‹ label ›`, so text in
it would unbalance the centred label and put copy inside a 32pt control's reach (C-5).

The issue asked for one thing and the surface had two. The same defect exists one layer down for
screen-reader users, and is arguably the worse half: both chevrons already set `disabled`, which RN
copies into `accessibilityState` and VoiceOver speaks as "dimmed" — an assertion that a control
exists and is unavailable, with no reason given (C-7). A sighted owner got a dim chevron and no
explanation; a VoiceOver owner got told the control was unavailable and no explanation. Folded in
rather than filed, because it is the same finding rather than adjacent scope.

**CUL-472 — the fourth notification state explains its own off switch.** Permission undetermined
*here* while `enabled` arrived true from a device that did grant it. The switch renders OFF, which
is correct and stays — a live-looking ON would fire the disable branch and turn the summary off
account-wide (LWW) for the phone that actually delivers it. It is the only state where a plain OFF
is true of the device and false of the account, and nothing said so. One line now does:
*"On for your account — switch it on here to allow it on this phone too."*

The file header documented three honest states; the fourth is now named there, since that list is
what a future session reads before touching the screen, and the state with no entry was the one with
no explanation on screen either.

**CUL-734 — the W1 swap directory is marked a record.** The issue asked to resolve one thing first:
live tooling, or run artifact? `run-log.md` opens *"RUN 2026-08-29. Complete. 33 of 34 candidates
re-keyed; 1 held by ruling"*, and the swap is one-time and account-pinned. So the SQL is **not**
edited — rewriting executed SQL destroys the account of what ran and buys nothing, because a run
that cannot happen again cannot be mis-retargeted. That is the `b416-protein-backfill/` treatment
the issue named.

Two README changes instead. A banner replacing a status line that had gone stale and directly
contradicted the run log (it still read *"Nothing here has been run against production except a dry
run that rolled back. The gates below are unmet as of 2026-08-28"*) — the more actively misleading
of the two problems here, and not in the issue's scope; found while resolving the caveat. And a
scoping note carrying the CTE form, why the hand-maintained triplicate is the hazard (a partial
retarget yields a *silently mixed* export, worse than the CUL-696 bug the pairing fixes because the
output is coherent-looking rather than empty), and the forward rule: any new script under `scripts/`
starts from the CTE. That rule was previously only recoverable from CUL-696's diff.

---

## The thing that went wrong, and the lesson under it

`code-reviewer` found a real defect in CUL-472's first commit, and it is the most useful output of
the session.

The gate was `permission === 'undetermined' && enabled`. But `enabled` alone is not the fact the
sentence claims: `handleToggleDailySummary`'s undetermined branch sets it **optimistically**, so the
primer does not rise over a switch that snapped back off. That makes *this* device's unconfirmed
intent indistinguishable from a synced pref. On a fresh account with nothing on anywhere, tapping
the switch rendered "On for your account" — false, and precisely the failure the gate existed to
prevent. The first commit's own message stated the rule it then broke (*never shown on an
assumption*); a local optimistic write is an assumption.

Fixed with `&& !primerVisible`, mirroring `switchOn`, which already treats `primerVisible` as its
own higher-priority state for the same reason. Both primer exits were traced before choosing that
conjunct over something broader: dismiss reverts `enabled`; confirm either grants (so `undetermined`
stops holding) or reverts. The window it closes is exactly the open sheet, with no uncovered tail.

**The lesson, which generalises past this issue.** Three mutations had been run against that
predicate and all three passed. They could not have caught it: every 4th-state fixture started from
`enabled = true` **already synced**, which is the state *arriving by sync*. The bug lives in the
state being *entered locally*. A fixture set that only constructs one arrival path cannot be probed
by mutation for a defect on the other — mutation testing proves the assertions are load-bearing, it
does not prove the fixture set reaches every way into the state under test.

That is C-35 (a fixture shaped unlike production is green over a shape production never creates)
pointed in a new direction: here the fixtures were each individually *realistic*, and the gap was
that they were all realistic in the same way. The question mutation testing does not ask, and
should be asked beside it, is **how many ways can the system enter this state, and does the fixture
set contain one of each?**

Proposed as an addendum to `docs/engineering-lessons.md` §C-35 rather than written unilaterally
(Tier 2). Captured here regardless, so it is not lost if the doc edit is declined.

---

## Read and deliberately NOT built

**CUL-400 — the trial-foods spinner.** Looks like the mirror of the shipped `trial-exposures` fix
and is not. `buildTrialFoodsScreen` returns null only when `status !== 'ready'`, so the
`ready && model === null` arm carrying half the exposures fix has no counterpart. The whole defect
lives in `unknown`, which has **three** producers, and only one is a failure: the `catch`
(`lib/trialAllowedSet.ts:349`), the hook's D7 pet-mismatch withhold — and `rows.length === 0` on a
running trial that **read fine** (`:364`). That third one is a real, readable state currently drawn
as an indefinite spinner, so it is part of the reported bug, but it is not unreadable and saying so
would be false. The honest alternative is an empty state, which collides with the screen's own
header rule: *an empty allowed-set screen is the strongest "nothing is permitted" claim in the app*.
That is a §2.2 / R2 ruling, not a build call. Splitting only the `catch` would fix the rarest
producer, leave the reported spinner standing for the common one, and make the remainder look
reviewed.

**CUL-510 — the schema/COLUMN_UPGRADES guard.** Measured before designing, which is what killed it.
Built a `node:sqlite` DB from all four schema constants: **18 tables, 251 columns, 55 upgrade
entries, 206 columns with no entry, 193 of those on a table that has entries.** As literally
written the rule is **vacuous** — every column in a schema constant appears in a `CREATE TABLE` by
construction, so the first disjunct is always true. The non-vacuous reading flags 193 legitimate
original-shape columns, and a registry pre-authorising 193 holes is a scope error, not an exemption
(C-33, C-38).

The deeper blocker: the tree has **two correct styles** for a post-ship column, because `initDb`
runs `applyColumnUpgrades` unconditionally (`lib/db.ts:177`) so a fresh install gets the ALTER too.
Style A (upgrades only) is 10 measured columns — `events.occurred_at_source`, the three
`occurred_at_confidence/earliest/latest`, `meals.intake_rating`, `food_items_cache.photo_path` /
`food_type`, three `logged_via`. Style B (both places) is argued in-file at
`lib/localSchema.ts:179`. DR-6's bug was Style C (CREATE TABLE only). With two correct styles there
is no convention to enforce, and the one direction that *is* checkable today would not have caught
DR-6. The sound design is an `origin/main` ratchet, which also needs a CI `fetch-depth` change,
since `actions/checkout` is shallow by default.

**CUL-620 / CUL-705 / CUL-806.** Already adjudicated by earlier sweeps — CUL-620 three times now.
Confirmed each finding still holds against current source rather than re-opening it, then acted on
the disposition those comments had suggested twice and never taken: **pulled the `Quick Win` label**.
The label is what routes sweeps to them, and leaving it guaranteed a fourth read at full cost. Each
got a comment recording that it is a routing change, not a verdict, and that re-adding the label is
one click once the blocking ruling lands. CUL-806 is now also explicitly `blockedBy` CUL-568, which
owns its surface.

The rule applied, stated so it can be argued with: **the label comes off after a second independent
sweep reaches the same cut.** CUL-400 and CUL-510 are first cuts, so they keep the label and carry
the warning in their comment instead.

---

## Filed, not folded

**CUL-956** — replacing a vet-visit photo keeps the first photo's EXIF stamp when the second has
none. Found by `code-reviewer` while reading CUL-879; pre-existing and unchanged by that fix, so
filed rather than folded. Worth the honest note that CUL-879 slightly **widens its trigger**: a
future-dated photo B used to overwrite the stamp with a wrong future value and now correctly returns
`null`, landing in the stale-state path instead. Wrong-and-stale beats wrong-and-future, so the
guard is still right; CUL-956 is the next layer down.

Deliberately **not** labelled `Quick Win`, applying this session's own standard: its body carries a
real judgement call (whether `visitedAt` reverts or holds on replace, given the owner may have
edited it since), which is the exact shape that got three other issues cut here.

---

## Two review claims checked and not acted on

- **"`origin/main...HEAD` is 11 commits, 7 of them unrelated vet-visits work."** Not so. The
  reviewer was reading a **stale local `origin/main` ref** — the CUL-919 failure mode verbatim,
  one day after CUL-921 shipped for it. After `git fetch origin main`, `origin/main..HEAD` is
  exactly the six sweep commits. Verified before ignoring.
- **The factual correction that did land:** `taken_at` here is `vet_visit_attachments`, and the
  "vet-files chronology" named in `518ec5b`'s message and the first PR body is `vet_documents`, a
  different table that nothing in this path reads. The **report's visit list** half of the rationale
  stands, and that is the half the fix turns on. Corrected in the PR body rather than by rewriting
  a pushed commit.

---

## Verification

`tsc --noEmit` clean. Full suite **379 suites / 8178 tests** green. CI green on both pushed heads
(`fc44cfa`, then `be9c471`) across all three required checks, including
`App (jest, non-UTC timezones)` — which matters for CUL-879, whose fixtures are anchored to
`Date.now()` rather than literals (C-29), and whose EXIF round-trip is local → UTC → local.

Every new assertion proven by mutation against pre-fix source, not by reading the test:

| Change | Mutation | Result |
|---|---|---|
| CUL-879 | revert to unwrapped `exifDateToISO` | future case reds; past-stamp + no-EXIF stay green |
| CUL-327 | delete the rendered line | the 2 rendered cases red |
| CUL-327 | swap the directional branches | all 4 red |
| CUL-327 | revert the a11y label | the 2 label assertions red |
| CUL-472 | delete the render | presence case reds |
| CUL-472 | drop the `enabled` conjunct | all 3 absence cases red |
| CUL-472 | widen `undetermined` → `!granted` | denied case reds alone |
| CUL-472 | drop the new `!primerVisible` conjunct | only the new test reds |

The last row is the one that matters: it proves the fix's test is not restating the two conjuncts
that were already there.

---

## Residuals

- The manual on-device QA script (PR #844) has **not** been run. Three of the four changes are
  visible UI; filed as a `Waiting on PM` issue rather than left as prose.
- `app/vet-visit.tsx`'s photo-source chooser is still a native `Alert.alert` rather than the
  CUL-577 designed affordance — out of scope on CUL-879, noted on the issue.
- CUL-327's backward claim rests on an invariant held by two unrelated files agreeing
  (`lib/dashboardScreen.ts:318` gating the card on `views.length > 0`) with nothing pinning it.
  Documented at the derivation site rather than tested, because a test would have to construct a
  card production cannot produce (C-35). Two null producers, not one — the review named the
  empty-record case; the other is an `occurred_at` that will not parse.
