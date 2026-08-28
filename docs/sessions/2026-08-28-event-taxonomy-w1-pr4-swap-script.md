# Event taxonomy — W1-PR-4: the §11 `other`-row swap mechanism (CUL-677)

**Date:** 2026-08-28
**Shipped via #735** (draft). _(Branch `claude/w1-pr4-other-row-swap-bqqy1f`.)_

## What this was

The last PR in the W1 chain: the one-time, dogfood-era re-key that turns the PM's
`other` rows into `cough` / `sneeze` events, so the ~9-week cough course the record
has been carrying in note text becomes something the engine, the report and every
read surface can see.

**It ships the mechanism, not the run.** Both §13a gates are unmet and are
release-cadence items — `generate-signal` is `pending` in the deploy ledger behind
CUL-676's client gate, and the installed build (1.1.0/35) predates the enum
migration. Nothing touched production except a dry run that rolled back.

## What shipped

`scripts/w1-other-row-swap/` — a pure emitter (`emitSwapSql.ts`, jest-covered), the
account-scoped candidate read, the PM-reviewed id list, a ⑦ predictor that calls the
shipped detector, a runbook, and a run-log template. Emitted SQL and the engine-input
export are gitignored: the SQL is deterministic from the id list, so committing it
adds nothing but a live-mode script sitting in the repo, and the export is a dump of
the health record — well past "ids and counts only".

## The T&S review's two additions, which are the shape of the PR

**1. The consent basis became a precondition instead of doctrine.** D3 clears this
script on "the reviewer *is* the rows' owner", but §11's SQL carried no account
predicate and runs service-role. The 2026-08-27 review called that out; the live
query made it concrete rather than theoretical:

| Account | Pet | `other` rows | Range |
|---|---|---|---|
| the owner | Nyx (cat) | 34 | 2026-07-01 → 08-26 |
| QA mirror | **also "Nyx"** | **16** | 2026-07-01 → 08-02 |

Same date range, same cough/sneeze note text, same pet name. A per-row review of
`(id, occurred_at, note)` shows the reviewer **no account signal at all** — which is
the argument for why review cannot substitute for the predicate, and it only becomes
obvious once you look at the two record slices side by side. Every emitted statement
is now owner-scoped and a `DO` prelude `RAISE`s before any write if one reviewed id
falls outside. Falsified against the real thing: a mirror row spliced into the list
was refused, `1 of 2 reviewed ids are not owner-scoped`.

**2. Step 0's device floor was re-specified, because the obvious check is a
no-op.** The review asked for "the right identifier (if PR-2 shipped OTA, the native
build number does not change; check the JS build)". Reading `lib/appInfo.ts`: there
**is no JS build to check.** `APP_VERSION` is the embedded manifest version and
`APP_BUILD` is `Application.nativeBuildVersion` — the native `CFBundleVersion`. Both
are properties of the installed binary; neither moves on an `eas update`, and nothing
in the app renders an `expo-updates` id. So reading the version foot on each device —
the check the review proposed, and the obvious one — proves nothing on the OTA path.

The runbook's gate is therefore **behavioural**: log a Cough on the beta device, then
confirm every other device renders it as a *symptom* rather than a neutral "Event".
That tests the §8(a) silent-de-symptomization capability the gate exists to protect,
which a version string cannot and a stale device cannot fake. The version foot is
recorded as supporting evidence with the caveat written beside it. The missing
identifier is **CUL-690**, filed rather than folded in.

## Decisions

**D-A (PM, this session) — the ambiguous row stays `other`.** One of the 34 rows has
a note naming *both* target leaves, and an `UPDATE` re-keys a row; it cannot split
one. Options were leave / →cough / →sneeze. Ruled (A): the permanent catch-all doing
its job, the note preserving both signs. Measurably costless — it sits inside a 3h
sneeze chain (so a sneeze re-key adds no episode) and a cough re-key would add one
episode against a cat-cough floor of 4 that 21 in-window episodes already clear. ⑦'s
outcome is identical under all three, which is worth saying out loud: it made this a
record-fidelity preference rather than a signal question, and the PM could rule in
seconds. Recorded as an explicit `hold` **with its reason**, so a run-day reviewer
meets a decision rather than a blank.

## Things worth keeping

**The predictor calls the shipped detector, and diagnoses non-fire by relaxing it.**
§11 step 4 wants the four floors computed on swap day, and the tempting shape is a
small calculator. That would be a third definition of chronicity (§5.3's lesson), so
`predictChronicity.deno.ts` imports `detectChronicity` / `chronicityFloorsFor`
instead. The wrinkle: `detectChronicity` returns `[]` on a non-fire and says nothing
about *why*, and `computeChronicityStats` is rightly not exported. Exporting it would
re-fingerprint a held Edge Function for a tooling script — so the diagnosis re-runs
**the real detector with its floors relaxed to nothing**, and the finding that comes
back carries the true stats. Every number printed comes from `detection.ts`.

**Prediction as of today** (illustrative; the runbook recomputes on the day): cough
**fires, tier `firm`** — 21 episodes / 53-day span / 6 active weeks / 2 days since
last, against cat-cough floors 4 / 21 / 3 / 28. Vomit is *already* chronic and firm,
so the §9 cough↔vomit adjacency precondition is met too.

**The `updated_at` bump is asserted, not written.** Hydration is watermark-incremental
on `updated_at`, so the trigger is how the re-key reaches the account's other devices.
The instinct is to write the column by hand for safety — that is backwards: it papers
over a disabled trigger instead of catching it, and widens a SET clause that may only
touch `event_type`. The prelude asserts the trigger is enabled and
`session_replication_role = origin`.

**The tests found two things review had not.** The `$verify$` block's staleness read
touched `events` **unscoped** — fixed in the emitter, not the test. And the first
scope assertion demanded a pet-ownership predicate on `pg_trigger`, because a bare
`/\bevents\b/` cannot tell a catalog identifier from a row read; matcher tightened to
actual table access. Both properties were then **red-checked** against a deliberately
broken emitter (scope predicate removed → red; `updated_at` hand-written into SET →
red), per the CUL-613 rule that a guard which has only ever been green has not been
tested. That rule also caught a bug in the predictor: it referenced a finding field
that does not exist, and neither `tsc` (excluded) nor `deno run` (no type-check by
default) noticed — `deno check` did.

**`predict-export.sql` had the same weakness one layer out**, found on a re-read: its
row subqueries filtered on `pet_id` alone. Correct today only because that literal
happens to name the owner's pet — a fact about the file's contents, not a property the
query enforces, which is exactly this directory's failure mode. Now paired with the
owner, so a mistyped pet id returns zero rows instead of another account's record
(verified: correct owner → 826 rows, mismatched owner → 0).

**`tsconfig`'s Deno exclude was one level deep.** `scripts/*.deno.ts` → `scripts/**/*.deno.ts`.
Its own comment predicts this exact forgetting ("excluded by name, which the next such
script would forget") — the suffix was carrying its half of the contract, the glob was
not, and the first `.deno.ts` in a subdirectory landed back in the app's tsc run.

## Verification

- Emitted dry run against production inside a transaction that **rolled back**:
  `other` 34→1, `cough` 0→22, `sneeze` 0→11, all other types unchanged, totals equal
  (975/975). Post-run state re-checked — nothing persisted.
- Reviewed list audited against live rows: 34/34 present, all still `other`, none
  soft-deleted, all owner-scoped, zero cough/sneeze mis-assignments.
- 18 new tests; full suite 276 suites / 6016 cases green; `tsc` clean; `deno check`
  clean on both `.deno.ts` entry points. CI green on all three jobs.

## Open / next

- **CUL-677 stays open** until the swap actually runs. Gates: PR-3b deploy (CUL-676),
  the device build floor, sync quiescence.
- **CUL-690** — no JS-bundle identifier on device. Not blocking; gate 2 does not need it.
- The issue text's floor numbers ("episodes ≥ 6", "recency ≤ 14") predate PR-3b
  session 2's per-type calibration. Left as-is: the predictor reads the config, not a
  written number.
