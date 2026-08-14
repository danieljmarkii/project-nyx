# `longGapHours` — the empty-stomach phenotype boundary (4h vs 6h)
**Status:** ✅ RULED — **6h** · **Decider:** Dr. Alex Chen (owned clinical calibration, spec §2 L1 / G6) · **PM ratified 2026-08-14** (deferred to Dr. Chen) · **Last Updated:** 2026-08-14
**Issue:** CUL-16 (decision brief) · **Blocks:** CUL-7 (PR 2 — L1 empty-stomach lane) floor lock · **Spec:** Signals v2 (B-755) §2 L1, §4.1, §8 OQ#2

---

## §0 — The decision (brief form)

**Deciding:** the empty-stomach lane's fasting threshold — the constant that defines the phenotype everywhere (the L1 detector's numerator, L3's retained-food join, the A2 card's third band, the Patterns bands).

**Options:**
- **(a) 4h** — the team's proposed *sweep-starting* value; more sensitive, catches borderline episodes.
- **(b) 6h — RULED.** Feline solid-phase gastric emptying is slower and far more variable than the "~4–6h" gloss implies; at 4h the median cat's meal is still **≳half in the stomach**, so the band's own label ("empty stomach") is not physiologically true there. 6h is past half-emptying for nearly all cats and clears the documented slow-motility baseline, while staying conservative versus the canonical 12h+ empty-stomach fast. For a band whose **label asserts physiology**, specificity is the safe direction — and the sensitivity cost is bounded (borderline episodes still render in the visible "in between" band, never dropped).

**Consequence:** sets the A2 card's third band to **`6h+`** (not the `4h+` in mock round 1) and unblocks CUL-7's floor lock — the property sweep now runs **at** the 6h boundary and locks the floors there. Changeable later only with a re-sweep (a phenotype definition, not a tuning knob).

---

## §1 — Ruling, and the distinction the issue's framing blurs

`longGapHours` = **6**.

The issue records the team's lean as "4h as the *starting* value for the property sweep." That conflates two different constants, and separating them is the core of this ruling:

- **The boundary** (`longGapHours`) is a **phenotype definition** — "how long since eating means the stomach is empty." Per **G6** it is anchored to the **gastric-emptying literature and nothing else**; it is explicitly *not* tuned to make any record fire. This is Dr. Chen's owned call, and it is set **now**.
- **The floors** (`minLongGapEpisodes`, `minLongGapFraction`, shared `minEligibleEpisodes`) are a **noise gate**. They are what the seeded null-model property sweep tunes, and they lock **at** whatever boundary the physiology sets.

So the correct sequence is not "start the boundary low and let the sweep move it" — moving the *boundary* to optimise firing is exactly what G6 forbids. It is: **Dr. Chen fixes the boundary from physiology (6h); the sweep then locks the floors at 6h.** The sweep can reveal that 6h + achievable floors still can't separate from a null model (a reason to revisit via a documented re-sweep), but it never nudges the boundary to fit the data.

---

## §2 — The clinical anchor (G6: literature only)

Feline **solid-phase** gastric emptying — the relevant phase for a fed stomach — is both slower and much more variable than the issue's "~4–6h" gloss:

| Measure | Value | Source |
|---|---|---|
| Solid-phase half-emptying (t½), median | **~5.5h** (330 min); range **3.5–12.8h** (210–769 min) | Determination of solid/liquid GE half-times in cats — [PubMed 10791934](https://pubmed.ncbi.nlm.nih.gov/10791934/) |
| 75% emptied (mean) | **~4.8h** (288 ± 62 min) | Scintigraphic GE, canned/dry diets — [PubMed 9563617](https://pubmed.ncbi.nlm.nih.gov/9563617/) |
| Half-emptying (faster meal/method) | ~3.3h (196 min scintigraphy / 203 min ultrasound) | Husnik 2017, JVIM ([repo brief](research/2026-05-feeding-windows-and-partial-eating.md) §2) |
| Baseline motility variability | some healthy cats show **delayed emptying >5h** at baseline | JAVMA 2022 (repo brief §2) |
| Undigested food vomited **>8–10h** post-meal | suspect **delayed emptying / outlet obstruction** | Vet Clinics SAP (repo brief §2) |

What the numbers say about the two candidate lines:

- **At 4h**, even on the *faster* estimates a solid meal is only around half-emptied; on the median-solid figure (t½ ~5.5h) it is **more than half still present**. "The stomach is emptying" is true; **"the stomach is empty" is not** — for a large fraction of cats, and for essentially all slow-motility ones. 4h names the *middle* of the emptying curve, not its tail.
- **At 6h**, the cat is past half-emptying on nearly every estimate and into the emptying tail; near-complete emptying of a solid meal commonly runs **≥6h** and, in the long-tail/slow-motility cats, far longer. "Empty" is defensible for the majority, and 6h clears the >5h baseline-delayed cats.

**The phenotype the lane actually surfaces is a long fast.** Empty-stomach (bile/foam) vomiting is classically a **12h+ / overnight** event — "not eaten since an early dinner the previous day," associated with once-daily feeding — and is, per the veterinary literature, **"rarely seen in cats"** and a **weak-evidence diagnosis of exclusion** (which is why the spec bans naming the syndrome — G3, §2 L1: the lane names the *timing band*, never "BVS"). Against that canonical picture, **6h is still conservative**: there is no risk of it being "too high" to catch the real pattern, whereas 4h reaches well below it into normal post-meal digestion.

Sources: [PubMed 10791934](https://pubmed.ncbi.nlm.nih.gov/10791934/) · [PubMed 9563617](https://pubmed.ncbi.nlm.nih.gov/9563617/) · [Husnik 2017 JVIM](https://onlinelibrary.wiley.com/doi/full/10.1111/jvim.14674) · [Bilious vomiting syndrome — Veterinary Partner (VIN)](https://veterinarypartner.vin.com/default.aspx?pid=19239&id=12296225) · [PetMD — BVS in cats](https://www.petmd.com/cat/conditions/digestive/bilious-vomiting-syndrome-bvs-cats) · repo brief [`docs/research/2026-05-feeding-windows-and-partial-eating.md`](research/2026-05-feeding-windows-and-partial-eating.md).

---

## §3 — Why 6h beats 4h (and an honest case for 4h)

Four reasons, in descending weight:

1. **The label asserts physiology, so it must be true for the whole numerator.** ⑥ (time-of-day) can afford a permissive, mildly-noisy band because its label — "4–8am" — is a *neutral clock fact* that is always true. L1's label — "empty stomach" — is a *physiological claim* that is often **false at 4h** (median cat >½ full). The track's spine is honest counts over honest denominators; a numerator that mislabels a still-full stomach as empty is a dishonest count, not merely a noisy one. This is the decisive asymmetry with ⑥, and it is why ⑥'s accepted-residual permissiveness does **not** transfer to L1.

2. **Error direction favours specificity for a phenotype classifier.** This lane is descriptive, not a safety alarm, so the "err toward firing" logic of a safety lane does not apply. A false **"empty"** (4h) systematically pulls retained-food / still-digesting episodes into the exact bucket L1 exists to isolate, and biases the reading toward the benign feeding-schedule framing when the truth may be delayed emptying or a dietary/GI problem. A false **"not-empty"** (6h) is a **bounded miss** — the borderline episode still renders in the visible `in between` band; nothing is dropped, and the vet still sees it.

3. **Coherence with L3's retained-food photo join.** L3 joins `retainedFoodCount` onto these findings. At **6h**, retained food in the vomit is a **clean anomaly** (food that late = delayed emptying → real signal for the vet). At **4h**, retained food is just… a half-full stomach — i.e. the "empty-stomach" tag was simply wrong, and L1 and L3 contradict each other on the same episode. 6h keeps the two lanes coherent; 4h makes them fight (and G4 forbids photo facts that reassure — a contradicted band edges toward exactly that).

4. **Null-model separation (direction only — CUL-7's sweep is authoritative).** A twice-daily meal-fed cat spends *most* of its inter-meal interval past the threshold, so the ≥threshold bucket carries a large **chance** base rate: ~⅔ of a 12h interval at 4h vs. ~½ at 6h. The provisional `minLongGapFraction 0.25` sits **below both**, so the sweep must raise it above the chance rate regardless — and 6h starts with materially more signal-to-noise headroom. This is the same dynamic that forced ⑥'s floors up (4 / 0.5 → 5 / 0.6, ~21.6% → ~3.3% on uniform-random onsets), where the stated safe direction is **silence**. Lowering the boundary moves *toward* the meal-fed noise floor. *(Stated as a prediction; the seeded sweep in CUL-7 sets the final floors.)*

**The honest case for 4h**, and why it loses: 4h is more sensitive to borderline early-AM episodes — a grazer whose small late snack was 4–5h prior may have a genuinely empty stomach that 6h files under `in between`. 4h is also clearly past the ≤30-min mechanical post-prandial zone, and since the vet interprets printed counts anyway (G1), a wider descriptive net is not obviously dangerous. It loses because the sensitivity gain is **bounded and still visible** (`in between` isn't a void), while the specificity cost of 4h is **systematic** — a physiological mislabel that contaminates the numerator, fights L3, and sits closer to the meal-fed null. For a band that asserts "empty," the tie breaks toward "only say it when it's true."

---

## §4 — What this sets downstream

- **A2 timing card (§4.1, CUL-12 / PR 5):** the third compare row becomes **`6h+`** (mock round 1 renders `4h+`); the `in between` band widens to **30 min – 6h**. Flag for mock round 2 so the axis label matches the ruling (the card's axis is one of the four surfaces CUL-16 defines).
- **CUL-7 floor lock (PR 2):** boundary is now fixed; the seeded property sweep (uniform-random, Poisson, grazing) runs at 6h and locks `minLongGapFraction` (likely **above** the provisional 0.25, to clear the ~0.5 meal-fed chance rate) and confirms `minLongGapEpisodes`. Boundary here; floors there.
- **`DEFAULT_CONFIG` (detection.ts):** add `longGapHours: 6` with the anchor comment in §5, per G6 (every constant carries its anchor beside it).
- **Re-sweep only:** any later change to 6h is a phenotype re-definition and requires a fresh null-model sweep, not a config tweak.

---

## §5 — Verbatim anchor for CUL-7 (lift into `DEFAULT_CONFIG`)

```ts
// Signals-v2 L1 empty-stomach lane. The empty-stomach BAND BOUNDARY: minimum hours since
// the last eligible feeding for a symptom episode to count as "empty stomach" (the L1
// numerator; the A2 card's "6h+" band; the reference gap for L3's retained-food join).
// ANCHOR (G6 — feline gastric-emptying literature, NOT tuned to any record): solid-phase
// half-emptying median ~5.5h (range 3.5–12.8h; PubMed 10791934), 75% emptied ~4.8h (PubMed
// 9563617); baseline motility variable, some healthy cats >5h (JAVMA 2022). At 4h a solid
// meal is still ≳half in the stomach, so "empty" is not defensible; 6h is past half-emptying
// for nearly all cats and clears the slow-motility baseline, while staying conservative vs.
// the canonical 12h+ empty-stomach (bile/foam) fast. Ruled 6h by Dr. Chen (CUL-16) for
// SPECIFICITY: this label asserts physiology (unlike ⑥'s neutral clock band), so a
// contaminated numerator mislabels a still-full stomach as empty and fights the L3 photo
// join; the specificity cost is a BOUNDED miss (borderline episodes render in the "in
// between" band, never dropped). Change only via a re-sweep — a phenotype definition, not a
// tuning knob. The property sweep locks the FLOORS at this boundary; it never moves it.
longGapHours: 6,
```

---

## §6 — Spec edits (Signals v2 requirements) — ✅ APPLIED to the canonical repo spec + the Linear mirror (2026-08-14)

Owned-call resolution; recorded here, in the CUL-16 comment, and **applied to the canonical spec** — both `docs/nyx-signals-v2-requirements.md` (which landed on `main` via PR #637 while this PR was open, and is merged in here) and its Linear project-description mirror:

- **§0 decision record** — added **D10**: `longGapHours` phenotype boundary = **6h** (Dr. Chen, CUL-16; PM deferred). Anchored to feline solid-phase gastric emptying; specificity over sensitivity for a physiology-asserting band; the sweep locks floors *at* 6h and never moves the boundary (G6). ✅
- **§2 L1** — `longGapHours` "candidate 4–6h" → **6h** (ruled, CUL-16), with the anchor inline. ✅
- **§4.1** — the face compare row `≤30 min / in between / 4h+` → `≤30 min / in between 30 min–6h / 6h+`, **and** the expand's dot-lane axis `ate · 30m · 2h · 4h+` → `ate · 30m · 2h · 6h+`. ✅
- **§8 open questions** — #2 marked **RESOLVED 2026-08-14 → 6h**. ✅

> **Divergence guard — resolved.** PR #637 (which brought the canonical `docs/nyx-signals-v2-requirements.md` onto `main`) merged while this PR was open; this PR merges `main` in and applies the same edits to that file, so the repo spec and the Linear mirror agree — both carry 6h. The repo file is canonical per its own header ("this file stays canonical; on any material edit here, update the Linear description in the same session"), which this session did.
