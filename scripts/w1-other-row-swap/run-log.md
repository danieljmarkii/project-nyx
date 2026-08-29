# W1-PR-4 swap — run log

**RUN 2026-08-29. Complete.** 33 of 34 candidates re-keyed; 1 held by ruling.

Ids and counts only — no note text.

---

## Gate 0 — preconditions

| Gate | Evidence | Met? |
|---|---|---|
| PR-3b deployed (`generate-signal`) | v33 ACTIVE, deployed 2026-08-29 13:26 UTC (prev v32, 2026-08-21); `verify_jwt` true; `guards/edgeFunctionDeploy` green against `main` | ☑ |
| Sync quiescent on every device | PM on-device at run time; the swap's own WHERE also re-asserts `event_type = 'other' AND deleted_at IS NULL`, so a mid-run device write cannot be overwritten by it | ☑ |
| `rls-privacy-reviewer` pass | Run on PR #735 → **FAIL**, 9 findings; F1–F5/F7 closed in that PR with tests, F1/F2/F3 red-checked against a deliberately broken emitter | ☑ |
| `rls-privacy-reviewer` **re-review** on the closing diff | **NOT RUN — PM waived, recorded rather than dropped.** The re-review was called for in the README's gate 3. Proceeding without it was a deliberate call, not an oversight | ☐ waived |

### Gate 2a — the behavioural check

**PARTIALLY DONE — PM waived the multi-device half, recorded rather than dropped.**

| Check | Result |
|---|---|
| Cough / Sneeze render on the PM's device | ☑ confirmed on-device 2026-08-29, post-TestFlight-build |
| Every *other* device on the account renders a cough row as a symptom | ☐ **not performed** — PM declined |

The waiver's stated reason was that the feature toggle would not be on for long. Noting for the record that the toggle is not what this gate turns on: `EVENT_TYPES` is never flag-gated (§12), so an out-of-date **build** — not the flag — is what would render these rows as a neutral "Event". Accepted risk, owner's own record, and reversible via the rollback script.

### Gate 2b — the version record (supporting only)

Not recorded. It would not have discriminated anyway: `APP_VERSION` is the embedded manifest version and `APP_BUILD` is the native `CFBundleVersion`, neither of which moves on an OTA, and no JS-bundle identifier is surfaced (**CUL-690**). The behavioural check above is the one that carries weight.

---

## Step 1 — candidate delta

Re-ran `candidates.sql` on **2026-08-29**, immediately before the run.

| | Count |
|---|---|
| Candidates at review (2026-08-28) | 34 |
| Candidates on run day | 34 |
| New rows since review | **0** |
| Of those → cough / → sneeze / held | — / — / — |

Ids identical to the reviewed set; no delta to re-review. Machine-audited the same day: 34/34 present, all still `other`, none soft-deleted, all owner-scoped, **0** cough/sneeze mis-assignments against note text.

---

## Step 3 — the prediction, recorded BEFORE the swap

Run at `2026-08-29T13:41:27Z`, pre-swap, ids re-keyed in memory:

```
cough: FIRES — tier 'firm'
  PASS  spanDays                 50  >= 21
  PASS  episodeCount             20  >= 4
  PASS  activeWeeks               6  >= 3
  PASS  daysSinceLastEpisode      2  <= 28
        symptomDays              16
        firstOnset         2026-07-06T23:02:27.182Z

vomit: FIRES — tier 'firm'
  PASS  spanDays                 50  >= 21
  PASS  episodeCount             14  >= 6
  PASS  activeWeeks               5  >= 3
  PASS  daysSinceLastEpisode      5  <= 14

⑦ findings: 2 · §9 cough↔vomit adjacency precondition MET
```

Predicted outcome in one line: **⑦ fires `firm` on cough; two chronicity cards, not one; Home's ③ reflection layer goes quiet.**

*The floors are clocks, and this run proved it in miniature:* the same prediction on 2026-08-28 read 21 episodes / 53-day span. Overnight the 56-day window slid forward and dropped the Jul 1 and Jul 3 coughs out the back. Nothing was wrong on either day.

---

## Step 4 — dry run

Executed against production inside a transaction ending in `ROLLBACK`, three times across 2026-08-28/29 (twice pre-hardening, once against the final emitter). Every run identical:

| event_type | before | after |
|---|---|---|
| cough | 0 | 22 |
| sneeze | 0 | 11 |
| other | 34 | 1 |
| *(meal / vomit / itch / lethargy / medication / weight_check)* | *unchanged* | *unchanged* |

Post-run state re-checked each time: nothing persisted.

Also falsified, rolled back: a **QA-mirror row** spliced into the id list → refused (`1 of 2 reviewed ids are not owner-scoped`); a **soft-deleted** row and an **already-re-typed** row simulated → prelude saw 1 of 3 and refused.

---

## Step 5 — live run

Ran at **2026-08-29 13:47 UTC**.

| event_type | before | after |
|---|---|---|
| cough | 0 | **22** |
| sneeze | 0 | **11** |
| other | 34 | **1** |
| itch | 3 | 3 |
| lethargy | 1 | 1 |
| meal | 844 | 844 |
| medication | 51 | 51 |
| vomit | 42 | 42 |
| weight_check | 3 | 3 |

Total before = total after? **☑** 979 / 979 — enforced inside the transaction, not merely observed.

---

## Step 6 — verification

| Check | Result |
|---|---|
| Notes preserved on every re-keyed row | ☑ 0 lost |
| `occurred_at_confidence` preserved | ☑ 0 changed |
| `updated_at` bumped (the propagation mechanism) | ☑ 33/33 re-keyed rows; **0** on the held row, correctly untouched |
| Date ranges intact | ☑ cough 2026-07-01→08-26, sneeze 2026-07-02→08-23 |
| `predictChronicity --after` matches step 3 | ☑ identical — cough `firm`, 20 / 50 / 6 / 2 |
| Rows arrive on every device rendering as cough/sneeze | ☐ per the gate-2a waiver above |
| ③ reflection layer quieter (expected, HR-26) | ☐ observe on device |
| Two chronicity cards where two courses are chronic (R4) | ☐ observe on device |

**Rollback, if needed:** `emit.deno.ts --rollback --live` re-keys the 33 ids back to `other`. It carries the same prelude discipline as the forward run — owner pin, per-source-leaf checks, the propagation assertion and a total invariant.

---

## The held row

One candidate stays `other` by ruling (D-A, PM 2026-08-28): its note names **both** target leaves, and an `UPDATE` re-keys a row — it cannot split one. Measurably costless: the row sits inside a 3h sneeze chain, so a sneeze re-key would add no episode, and a cough re-key would add one against a cat-cough floor of 4 that 20 in-window episodes already clear. ⑦'s outcome is identical under all three dispositions.
