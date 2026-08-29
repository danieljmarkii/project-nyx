# W1-PR-4 — the §11 `other`-row swap (CUL-677)

A **one-time, dogfood-era** re-key: 33 of the PM's 34 `other` rows become `cough` /
`sneeze` events, so the ~9-week cough course the record has been carrying in note text
becomes something the engine, the report and every read surface can actually see.

Spec: `docs/nyx-event-taxonomy-requirements.md` §11 (D3), as hardened by the
2026-08-27 product-team review on CUL-677 (T&S + Dir. Eng lenses).

**Nothing here has been run against production except a dry run that rolled back.**
The gates below are unmet as of 2026-08-28 and the swap is not due yet.

---

## The stop rule (read first)

> **This script may never run over rows whose owner is not the person approving the id
> list.** D3's T&S clearance rests entirely on "the script's reviewer *is* the rows'
> owner". Anyone else's `other` rows wait for the future product re-type flow — which
> is a separate, D2-class product decision with its own T&S review, not this.

That is not a convention here, it is a precondition the code and the SQL both enforce.
**The account is pinned in code** — `SWAP_OWNER_EMAIL` / `SWAP_OWNER_USER_ID` in
`emitSwapSql.ts` — so a list naming anyone else is refused at emit time, and the prelude
asserts the same pin again at run time. Every statement carries
`pet_id IN (SELECT id FROM pets WHERE user_id = <the reviewing owner>)`, and the prelude
`RAISE`s before any write if even one reviewed id falls outside it.

The pin exists because the red-team broke the earlier version without it: the account
came from `reviewed-ids.json`, so **one edited field produced a fully-scoped,
self-consistent live script aimed at another account** — and every validator, every test
and the prelude passed, because each only ever checked internal *consistency*. Changing
those constants is not configuration; it is the D3 consent decision being re-taken for a
different person, which this script is not cleared for.

**Why the predicate and not the review.** This runs on the service-role path, which
sees every account. Verified live on 2026-08-28: the QA mirror account holds **16
`other` rows, on a pet also named "Nyx", in the same date range, with the same
cough/sneeze note text.** A per-row review of `(id, occurred_at, note)` shows the
reviewer no account signal, so human review cannot substitute for the predicate, and
RLS does not backstop a service-role write.

---

## Gates — all four, before any live run

| # | Gate | State (2026-08-28) |
|---|---|---|
| 1 | **PR-3b deployed** — `generate-signal` carries cough's ⑦ enrolment | ✗ `pending` in `deploy-manifest.json`, blocked on the client gate (CUL-676) |
| 2 | **Device build floor** — every device on the account renders the new types (§11 step 0) | ✗ installed build is 1.1.0 (35), which predates the enum migration |
| 3 | **`rls-privacy-reviewer` pass** over the emitted SQL + this runbook | ran on PR #735 → **FAIL**, 9 findings; F1–F5/F7 closed in that PR. **A re-review on the closing diff is owed before the first live run.** |
| 4 | **Sync quiescence** — every device's outbound queue empty | check on the day |

Gates 1 and 2 are release-cadence items. Nothing in this directory should be run live
until both are true.

### Gate 2 in detail — and why the obvious check does not work

§11 step 0 says the audited build must be on every device *"verified, not assumed"*, and
the T&S review correctly flagged that we had no mechanism for that. Here is the shape of
the problem, because it decides which check is honest:

- `lib/appInfo.ts` reads **`APP_VERSION`** from the embedded manifest
  (`Constants.expoConfig.version` — app.json's `"1.0.0"`) and **`APP_BUILD`** from
  **`Application.nativeBuildVersion`** — the native binary's `CFBundleVersion`.
- The Settings version foot renders exactly those two. **Neither one moves on an OTA
  update.** So if PR-2 reached a device via `eas update`, the foot reads *identically*
  before and after, and comparing it across devices proves nothing at all.
- There is no JS-bundle identifier surfaced anywhere in the app (`expo-updates`'
  `updateId` / `runtimeVersion` are not rendered, no migration carries build
  provenance, hydration sends no client-version header). So the "check the JS build"
  half of the T&S note has nothing to read. Tracked separately — do not fold a
  version-foot change into this PR.

**So gate 2 is discharged two ways, and the first one is the real check:**

**2a — the behavioural check (primary).** On the beta device, log one **Cough**. Then
open **every other device signed into the account** and find that event in History /
Today. It must render as a *symptom* — rose treatment, in the symptom lane, labelled
"Cough" — not as a neutral "Event". That is a direct test of §8(a) silent
de-symptomization, which is the exact failure gate 2 exists to prevent, and unlike a
version string it cannot be satisfied by a stale device that merely *looks* current.
(No synthetic row is needed: the cat is coughing near-daily, so log a real one.)

**2b — the version record (supporting).** On each device, Settings → the version foot
(`Culprit v1.0.0 (35)`). Record the value per device in the run log. This is evidence
for the record, **not** proof of freshness, for the OTA reason above — write it down,
do not lean on it.

**If 2a fails on any device, stop.** A server-side `UPDATE` reaches every device at its
next hydration; the build that renders the new type sanely arrives at release cadence.
Run the swap into that gap and the un-updated device silently shows the household's
cough rows as ordinary neutral events, on the day it matters.

---

## The `updated_at` bump is the propagation mechanism — never suppress it

Hydration pulls are **watermark-incremental on `updated_at`**
(`lib/hydration.ts` § FR-3), and `trg_events_updated_at` fires on every UPDATE. That
bump *is* how the re-key reaches the account's other devices.

Suppress it — run with `session_replication_role = replica`, or disable the trigger —
and every device except the one that ran the script keeps showing `other` **forever**,
with no error anywhere. So the prelude **asserts the mechanism is armed** rather than
writing `updated_at` by hand: a hand-written value papers over a disabled trigger
instead of catching it, and it would widen the SET clause past the one column this
script may touch.

Sync quiescence (gate 4) is the *push*-side guard — a server edit to a row with a
pending device write loses to last-write-wins. Different concern, both required.

---

## Files

| File | What it is |
|---|---|
| `candidates.sql` | §11 step 1 — the account-scoped candidate read. **Re-run on swap day.** |
| `reviewed-ids.json` | The PM-reviewed list. Ids, targets, counts and decisions **only — never note text.** |
| `emitSwapSql.ts` | The pure emitter. Five safety properties, documented in its header. |
| `emitSwapSql.test.ts` | Those properties, pinned in CI. Red-checked against a deliberately broken emitter. |
| `emit.deno.ts` | CLI. Writes `swap.dry-run.sql` by default; `--live` / `--rollback`. |
| `predict-export.sql` | §11 step 4 — the engine-input export for the predictor. |
| `predictChronicity.deno.ts` | Runs the **shipped** ⑦ detector to predict the swap's effect. |
| `run-log.md` | Fill this in as you go. It is the record that the gates were met. |

Emitted `.sql` and `predict-input.json` are **gitignored on purpose**: the SQL is
deterministic from `reviewed-ids.json` (so committing it adds nothing but a live-mode
footgun sitting in the repo), and the export is a dump of the health record, which is
well past "ids and counts only".

---

## Procedure

**0. Gates.** Work the table above. Record 2a and 2b in `run-log.md`. Do not continue
past a failure.

**1. Re-read the candidates.**

```sql
-- candidates.sql, via the Supabase MCP
```

`reviewed-ids.json` is a **snapshot** taken 2026-08-28, and the run is gated behind a
release. `other` grew **+11 rows in 13 days** while this was being specced, so a delta
is expected. Review the new rows **per-row, on their note text**, and add them to
`reviewed-ids.json`. A row you do not want to swap goes in `hold` **with a reason** —
a blank is an unfinished decision, not a default.

**2. Quiesce sync.** Foreground each device, let its queue drain, then leave the app.

**3. Predict — before the swap, in writing.**

```bash
# save predict-export.sql's single JSON value as predict-input.json, then:
deno run --allow-read scripts/w1-other-row-swap/predictChronicity.deno.ts
```

Paste the output into `run-log.md` **before** running the swap. That is the whole
point of §11 step 4: ⑦'s floors are **clocks, not facts** — its window start, its
28-day recency floor and its 28-day firm boundary are all evaluated at run time.

> **"⑦ does not fire, for recency" is an acceptable and predicted outcome, not a
> defect.** If W1 lands months from now and the cat has recovered, the lane going quiet
> is the engine working. Record it and move on. Never lower a floor to make a new
> stream feel alive (§9).

*Prediction as of 2026-08-28 (illustrative — recompute on the day):* cough **fires,
tier `firm`** — 21 episodes, 53-day span, 6 active weeks, 2 days since last, against
cat-cough floors of 4 / 21 / 3 / 28. Vomit is *already* chronic and firm, so the §9
cough↔vomit adjacency precondition is met too.

**4. Dry run.**

```bash
deno run --allow-read --allow-write scripts/w1-other-row-swap/emit.deno.ts
```

Run `swap.dry-run.sql` whole, in one statement, via the MCP. It ends in `ROLLBACK`, so
it persists nothing while still exercising the prelude, both UPDATEs, the
total-invariant check and the before/after counts. Confirm the counts are what you
expect; paste them into `run-log.md`.

**5. Run it.**

```bash
deno run --allow-read --allow-write scripts/w1-other-row-swap/emit.deno.ts --live
```

Run `swap.live.sql` whole, in one statement. Paste the before/after table into
`run-log.md`. The **total must be unchanged** — a swap moves rows between types, it
never creates or destroys one. (The SQL asserts this itself and rolls back if not.)

**5a. Two checks the repo cannot make for you** (named by the `rls-privacy-reviewer`
as unverifiable from source — do them on the day):

- **The MCP really runs this as one transaction.** The whole dry-run guarantee assumes
  `execute_sql` honours the trailing `ROLLBACK;` and that a mid-batch `RAISE` aborts
  everything. After the dry run, confirm
  `SELECT count(*) FROM events WHERE event_type = 'cough'` returns **0** *before* going
  live. If it does not, the tool split the batch into autocommit statements and the
  swap has already happened.
- **The reviewer's address is unique in `auth.users`.**
  `SELECT count(*) FROM auth.users WHERE email = '<owner>';` → expect exactly 1.
  (Verified 1 on 2026-08-28.) The prelude's `SELECT … INTO` is non-`STRICT` and would
  silently take the first row.

**6. Verify.**

- Re-open each device; the rows should arrive at the next hydration and render as
  cough / sneeze.
- Re-run the predictor with `--after` over a fresh export; the reading must match
  step 3's prediction.
- Expect Home to get **quieter**, by design: a chronic course blanks that pet's ③
  reflection layer for unrelated signs too (HR-26). Not a regression.
- Expect **two** chronicity cards, not one (R4 "both stated").
- **Delete `predict-input.json`.** It is a dump of the pet's symptom stream — gitignored,
  but there is no reason for it to sit in the working tree after the run.

**Rollback.** `emit.deno.ts --rollback --live` re-keys the swapped ids back to
`other`. It restores the *type* only, and it bumps `updated_at` again on purpose —
the reversal has to reach the other devices exactly as the forward swap did.

---

## What this is not

A product feature. There is no in-app re-type flow, and building one is a separate
later call (D3) that needs a D2-class PM + T&S ruling, real build telemetry as a
prerequisite (the manual check in gate 2 does not generalize past one account), and its
own `rls-privacy-reviewer` pass. Do not grow this script into that.
