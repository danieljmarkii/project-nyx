# On-device QA — deploy of 2026-07-01 (delta since the 2026-06-25 build)

**Prepared:** 2026-07-01
**Covers:** everything user-facing that landed after the 2026-06-25 deploy.

## What actually shipped in this build

| Feature | PRs | Where it lives | End-to-end testable on device? |
|---|---|---|---|
| **B-186 Weight tracking (v1, display-only)** | #244, #245, #248, #249, #251 | Log flow, Profile, History, Patterns dashboard | ✅ Yes — pure client + schema (migration 024 is live). Works offline. |
| **B-182 Chronicity signal (detector ⑦)** | #246, #247, #250 + `generate-signal` **v23** deploy | Home → Signal zone (safety card) | ✅ Yes — the redeploy is **confirmed live** (v23 contains the detector). Needs a synthesized "chronic course" + a sync + a Signal regen (recipe below). |

### ⚠️ The vet report did **not** ship in this build

You listed "the vet report" as a shipped feature — it isn't in this deploy. Evidence:

- `app/report.tsx` is still a **placeholder** (`"Report generation — coming in build step 9."`).
- `lib/pdf.ts` calls a `generate-report` Edge Function that **does not exist / is not deployed** — the only live functions are `extract-food-from-photo`, `analyze-vomit`, `generate-signal` (v23), `delete-account`, `extract-medication-from-photo`.
- STATUS.md has Step 9 as a **draft spec** blocked on two PM gates: (1) real-vet R1/R2 validation, (2) formal ratification of the HTML-first render path.
- No vet-report build commits exist between 2026-06-25 and today.

So there's nothing to QA for the vet report yet. It's spec-complete, not built. (If you thought a vet-report PR merged recently, it didn't — happy to dig if you have a PR number in mind.)

---

## Before you start

1. Make sure the device is running **this** build (it must include PRs #244–#251 — i.e. B-186 client code + the B-182 chronicity renderer).
2. For **B-182 only**, the device must be **online** at test time — the chronicity card is computed server-side by the `generate-signal` Edge Function, which reads *synced* data. Weight (B-186) has no such dependency.
3. Use a **test pet** for the B-182 recipe (you'll be back-dating a fake symptom course). B-186 is safe to run on any pet.

---

## QA 1 — B-186 Weight tracking (~3 min)

The clinical guardrail to keep front-of-mind while testing: **a weight trend never reassures.** Everything must read *neutral* — grey line, grey arrow, factual copy. If you ever see a green/teal "improving" or a red "alarm" treatment on weight, that's a bug.

### Golden path
1. Home → tap the log FAB → choose **Weight** (scale icon) → **expect** a numeric weight step, **pre-filled** with the pet's last known weight in **lbs** (blank if the pet has never had a weight on file).
2. Enter a value → save → **expect** the completion "moment" card, and you're returned Home. (Weight is witnessed by construction — you read a scale — with a "Change time" escape hatch for a back-dated reading.)
3. Go to **Profile** → **expect** a **Weight** card:
   - After **one** reading: the big number + "Last weighed {date}" + "One reading so far. Log another…".
   - After **two or more**: big number + a **neutral-grey sparkline** + a grey delta arrow + a factual line ("Down 0.4 lbs since …" / "Up …" / "No change"), plus "Last weighed {date} · N readings".
4. Go to **History** → **expect** a row with the **scale icon** and the reading as a quiet secondary line, e.g. `12.3 lbs`. Tap it → opens the event detail.
5. Home → tap **"See all of {pet}'s patterns →"** (Signal footer) to open **Patterns** → **expect** a **Weight** card in the health-trajectory group (after symptom cards, above food/intake), same neutral treatment.

### Edge cases
6. **Re-weigh:** log a second weigh-in → the field pre-fills with the value you just entered (not from scratch); Profile + Patterns cards update on return; the delta reflects the change.
7. **Back-date:** on the weight step use **"Change time"** to log a reading a few days earlier, with a different value → the sparkline/delta orders by date, not entry order.
8. **Empty state (fresh pet, no weight):** Profile weight card reads "No weight on file yet…"; Patterns weight card reads "No weigh-ins logged yet…" — a forward-looking nudge, **never** "looks healthy".
9. **Guardrail check:** confirm nowhere in any weight surface is the line/arrow coloured as good/bad, and no copy says "healthy", "improving", "steady", or "on track". Direction only, never valence.

**Acceptance:** capture + trend render across empty / single / multi-reading states; lbs display consistent across log step, Profile, History, Patterns; neutral framing everywhere (no wellness colour, no reassuring copy); v1 has **no** weight-loss flag (that's a separate spec).

---

## QA 2 — B-182 Chronicity signal (detector ⑦) (~10 min, scenario-based)

This one closes a real gap: STATUS.md notes the **live safety-card path has never been verified on device** (the real cat's data legitimately produces zero safety findings). Your normal data will **not** trigger this — you have to synthesize a chronic course.

**What fires the card** (all must hold, for a *single* symptom type — vomiting / loose stool / itching / scratching / skin irritation):
- **Span ≥ 21 days** between first and most-recent episode
- **≥ 6 distinct episodes** (same-day re-logs collapse into one — use different days)
- **≥ 3 distinct active weeks** carrying an episode
- **Most recent episode within the last 14 days** (still ongoing)
- All inside a **56-day** lookback

### Setup recipe (standard tier)
1. On a **test pet**, log **6 vomiting events on 6 different days**, back-dated via **"Change time"** on the log step. Suggested dates (relative to today, 2026-07-01):
   - **Jun 8, Jun 14, Jun 19, Jun 24, Jun 28, Jun 30**
   - → span ≈ 22 days, 6 episodes, ~5 distinct weeks, most recent 1 day ago. (6 distinct logging days also clears the "was the app used" floor automatically.)
2. Keep the device **online** so those events **sync** to Supabase (the detector reads server data, not local SQLite). Give sync a moment to flush.
3. **Trigger a Signal regen.** The Home Signal reads cache-only; a regen runs (a) automatically, debounced, after you log, or (b) on Home focus when the cache is stale (24h TTL). So: log the last event, wait ~10–20s, then leave and re-open **Home**. If nothing appears yet, background/foreground the app or log one more back-dated vomit to re-kick the debounced regen.

### What to expect
4. On **Home → Signal**, a **safety card leads the zone** with copy along the lines of:
   > "We've logged **vomiting** for {Pet} across **5 of the last 8 weeks** — **6 episodes** since **June**. A symptom that keeps recurring over weeks is **worth a word with your vet**. This is a read of your logs, not a diagnosis."
5. Tap the card → it expands for the detail read.
6. **Firm tier:** repeat with the first episode pushed to **≥ 6 weeks ago** (e.g. start **May 15**, span ≥ 42 days) → the ask sharpens to **"worth booking a vet visit"** (still no diagnosis, still no cause).

### Guardrail checks (these are the point of the test)
7. The card **never reassures** — no "improving", "fine", "nothing to worry about", "looks healthy".
8. **No exclamation marks.** **No causal claim** — it must not blame a food/protein or name a mechanism; it states duration + recurrence + count and routes to the vet.
9. It leads the Signal as **safety** (above any correlation/reflection card). It should also **suppress** a same-symptom "worsening" card (⑦ takes precedence over ④).

### Negative test (specificity)
10. On a pet with only **sporadic** symptoms (e.g. 2 vomits over 2 months, or episodes all older than 14 days) → **no** chronicity card should appear. A safety card that fires here is a false-positive bug.

**Acceptance:** the chronicity safety card renders on Home for a qualifying course, in the correct tier, with never-reassure / never-causal / no-"!" copy; it does not fire on a sporadic/stale course.

---

## Optional backend verification (Supabase dashboard)

- **B-186:** after logging a weigh-in, in the SQL editor confirm the `events` row (`event_type='weight_check'`) has a matching `weight_checks` child with the value, and `pets.weight_kg` snapshot updated to the latest reading.
- **B-182:** after a regen, inspect `ai_signals.findings` for the test pet — expect a `symptom_chronicity` finding in the set with `priorityClass: "safety"`.

---

## Notes / caveats found while preparing this

- The `generate-signal` redeploy that activates B-182 was still marked "pending" in STATUS.md — but the **live function is v23 and contains the detector**, so it's actually deployed. STATUS.md should be updated to reflect v23 live + the ⑦ chain complete.
- B-188 (a phase-stable distribution fix) rode inside B-182 PR 2 — it's a correctness fix inside the chronicity math, not a separate user-facing surface.
