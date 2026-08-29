# W1-PR-4 swap — run log

Fill this in **as you go**, not afterwards. It is the record that the gates were met,
and step 3 only counts if it is written down *before* step 5.

**Ids and counts only. No note text.**

---

## Gate 0 — preconditions

| Gate | Evidence | Met? |
|---|---|---|
| PR-3b deployed (`generate-signal`) | deploy-manifest status + version | ☐ |
| Sync quiescent on every device | | ☐ |
| `rls-privacy-reviewer` pass | PR link | ☐ |

### Gate 2a — the behavioural check (the real one)

Log one Cough on the beta device, then open every other device on the account and find
it. It must render as a **symptom** (rose, in the symptom lane, labelled "Cough") — not
as a neutral "Event".

| Device | Renders as a symptom? | Notes |
|---|---|---|
| | ☐ | |
| | ☐ | |

### Gate 2b — the version record (supporting only)

Settings → version foot, per device. **This does not prove freshness** — neither
`APP_VERSION` nor the native `APP_BUILD` moves on an OTA. Recorded for the record.

| Device | Version foot | Reached by |
|---|---|---|
| | | ☐ native build ☐ OTA |

---

## Step 1 — candidate delta

Re-ran `candidates.sql` on: `____-__-__`

| | Count |
|---|---|
| Candidates at review (2026-08-28) | 34 |
| Candidates today | |
| New rows since review | |
| Of those → cough / → sneeze / held | / / |

---

## Step 3 — the prediction, recorded BEFORE the swap

```
<paste predictChronicity.deno.ts output here>
```

Predicted outcome in one line: `____________________`

(“Does not fire, for recency” is an acceptable and predicted outcome — §11 step 4.)

---

## Step 4 — dry run

```
<paste the before/after table from swap.dry-run.sql>
```

---

## Step 5 — live run

Ran at: `____-__-__ __:__ UTC`

```
<paste the before/after table from swap.live.sql>
```

Total before = total after? ☐

---

## Step 6 — verification

| Check | Result |
|---|---|
| Rows arrived on every device, rendering as cough / sneeze | ☐ |
| `predictChronicity --after` matches step 3 | ☐ |
| ③ reflection layer quieter (expected, HR-26) | ☐ |
| Two chronicity cards where two courses are chronic (R4) | ☐ |
