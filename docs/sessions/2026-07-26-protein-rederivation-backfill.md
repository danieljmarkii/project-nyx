# B-416 — re-derive `food_items.proteins` from stored `ingredients_notes`

**Date:** 2026-07-26

Shipped via **#452**. Closes the B-351 Phase A fast-follow — the data half of a feature whose code half had already shipped.

## The problem, stated plainly

Slice 5 (#448) taught the vet report to render protein sets. It rendered them over a library where **every row still had `|proteins| ≤ 1`**, because migration 039 backfilled the naive `proteins = [canonical(primary_protein)]` and nothing had been re-extracted since. So the report was faithfully displaying a single-protein view of a multi-protein library.

The row that makes it concrete: `Tiki Cat after DARK Rabbit & Chicken Liver` was keyed `["rabbit"]` while its own stored panel reads *"Rabbit, **duck**, **chicken** broth, chicken liver, chicken heart…"*. A rabbit elimination trial run off this library passed the slice-4 contaminant check **clean** — the exact silent failure B-351 was written to stop, sitting in production, in the PM's own library.

The panels were already stored verbatim (spec §12), so nothing needed re-photographing. This was a text-only pass over data we already held.

## Result

**62 rows scanned · 37 changed · multi-protein rows 1 → 34.** (Applied in two increments — the first pass, then the lexicon widening described in the addendum below. The final numbers are stated here; the addendum gives the split.)

| Food | before | after |
|---|---|---|
| Tiki Cat after DARK Rabbit & Chicken Liver | `rabbit` | `rabbit`, `duck`, `chicken` |
| Blue Buffalo Wilderness **Duck** | `duck` | `duck`, `chicken`, `turkey` |
| Hill's Sensitive Stomach **Duck** & Vegetable | `duck` | `duck`, `pork`, `turkey` |
| Weruva **Lamb** Burger-ini | `lamb` | `lamb`, `fish`, `tuna` |
| Fancy Feast Tender **Beef** | `beef` | `beef`, `fish` |

Three of those are novel-protein or limited-ingredient foods. Their hidden secondaries are what silently breaks a home trial, and they were invisible to every clinical surface until this landed.

## The PM decision, and why it went the way it did

B-416 carried one open sub-decision that D3a required be *asked*, not assumed: does the pass also run existing primaries through the write-path normalizer? That is a retroactive **Class-B** re-key of stored rows.

Surfaced early with the live blast radius measured first — **exactly 3 rows**, all `ocean whitefish` → `whitefish`; every other stored primary was already normalize-stable. The PM asked for the team's recommendation, then ratified it.

The argument that decided it was not "it's only 3 rows". It was that **declining would not have preserved the status quo.** `'ocean whitefish' → 'whitefish'` is *already shipped on the write path* — it is spec §5's own B-048 example, live in `EXTRACTION_PROTEIN_ALIASES` today. So a Fancy Feast Ocean Whitefish photographed tomorrow stores `whitefish` while these three keep `ocean whitefish` forever. Refusing bakes in a **widening** divergence. And the pass invents no species judgement of its own; it applies only a mapping already ratified and shipped.

Recorded dissent (T&S / the D3a default): 2 of the 3 rows are `source='user'`, and B-416's own design constraint says no owner-edited value is overwritten. What resolved it: `Ocean Whitefish` is not producible from any `COMMON_PROTEINS` chip, so it was typed into the "Other" escape — and under D9 (shipped in PR 3) typing it *today* rewrites it to `Whitefish` **and tells the owner**. Stored data now matches what the product already does with that input. The residual — the owner sees the changed value without D9's inline note — is filed as **B-452** rather than papered over.

## The reporting defect worth remembering

The first run printed **"re-keyed 10"**. Only **3** of those were Class B. The other 7 were Class A (`Chicken By-Product Meal` → `chicken`, `Rabbit` → `rabbit` — casing and processing qualifiers, permitted always and retroactively).

Left alone, that line would have reported a **3× overstatement of the blast radius of the thing the PM had just ratified** — in the exact artifact D3a's standing guard asks for. `BackfillPlan.classBRekey` now tracks the semantic re-key separately from "the primary was rewritten", and the report labels every row `(A)` or `(B)`.

The general lesson: when a ruling is scoped to one class of change, the instrumentation has to be scoped the same way, or the audit trail quietly launders one warrant into the other.

## Deterministic scan, not a re-run of the vision model

The obvious alternative was to re-invoke the extractor's model over the stored panel text. Rejected on one ground: **a backfill over clinical data has to be reviewable row by row before it is applied**, and 43 model outputs nobody checked is not that. A lexicon scan is a pure function — unit-tested, stable across runs, diff fits on a screen, and it cannot hallucinate a protein into a novel-protein trial food.

The cost is real and named (**B-453**): it finds only animals it knows. I originally called that under-capture "the safe direction", which the PM corrected the same day — see the addendum. It is only safe relative to capturing *nothing*; against the vet report's job it is the dangerous direction, and the lexicon was widened hard in response.

The exclusion list turned out to be the load-bearing part, not tidiness. `chicken fat` appears in Hill's **duck** entrée; without excluding fats, oils and flavours the pass would have appended `chicken` to a novel-protein trial food and fired a **false contaminant flag on a trial diet** — the most expensive false positive this feature can produce. Same mechanism correctly rejects `Natural Tuna Shrimp & Salmon Flavor` on a Temptations treat. (Hydrolysates were on this list too, and should not have been — the addendum explains why that was a defect rather than a bound.)

## The two guards, enforced structurally

This backfill is where a bug fixed in *code* last session could return as *data*. #448 keyed the vet report's read path Class-A only (`readProteinSet`), which is correct **because** migration 039 left `canonicalize(primary_protein) === proteins[0]` on every row. This pass is the one thing that could have broken that premise.

1. **Atomic rewrite.** `primary_protein` and `proteins` go in one statement; there is deliberately no code path in the generator that emits a single column. The failure it prevents is the shipped one — page 1 announcing that a whitefish trial food is contaminated with whitefish.
2. **Write-path normalizer + dedupe in normalized space.** Secondaries append through `normalizeExtractedProtein` (Class B is in contract on a write path). Dedupe compares *normalized* identities, which is what stops a panel's "Ocean Whitefish" landing beside a stored `ocean whitefish` — the same bug arriving from the secondary side instead of the primary side.

## What was deliberately *not* done

`ai_extraction_confidence` was left untouched. Writing it would have cleared the D10 gate and stopped these rows reading "ingredient list not read" on the vet report — which is the half of the PM's complaint this pass does *not* fix.

It would also have been a lie. A keyword scan finds only what its lexicon contains, so attesting completeness off one licenses *"nothing else on the label"* over a panel that may list an animal the scan never knew — reassurance-on-absence, on the surface a vet trusts most. Under-claiming is D10's named safe direction. The real fix is a provenance/coverage field written by an extractor that actually read the panel (**B-437**), or re-extraction (**B-453**) — not a value invented by a backfill.

## Verification

- **0** rows where `canonicalize(primary_protein) ≠ proteins[0]` — the read-path invariant, now held *literally* rather than under canonicalization
- **0** rows carrying a protein twice · **0** `ocean whitefish` remaining · **0** stored keys lost
- The applied database state **hashes identical** to the independently computed expected state
- Re-planning over the live post-state produces **zero** further changes
- 41 new tests (33 before the widening), **mutation-verified** — deliberately broke the fat exclusion, the primary hoist, and the atomic write; each mutation was caught. The hoist test was strengthened mid-session after a mutation slipped past it: the original fixture stored `['duck']`, which made the assertion pass with or without the hoist.

One process note: the row dump was **checksummed row-by-row against the database before use**, which caught a genuine transcription error in one panel's tail. Worth keeping as a habit any time data crosses out of the database by hand.

## Artifacts

`scripts/b416-protein-backfill/` holds the applied SQL, the per-row rollback, and the before/after report — D3a's standing guard (every re-key ships with a before/after affected-row count), satisfied by construction rather than by a summary line.

## Follow-ups filed

- **B-452** — the 3 Class-B re-keys changed an owner-visible value without D9's inline disclosure (2 of 3 are `source='user'`). Do *not* fix by reverting the re-key; that reopens the widening split.
- **B-453** — the lexicon finds only known animals; plant proteins and hydrolysates are deliberately out of scope. Re-extraction, not a longer word list, is the complete fix — a bigger lexicon buys coverage without ever buying the attestation.

---

## Addendum — the lexicon was widened, on a PM steer that corrected the original call

**"I think we need to err on surfacing a protein for the vet. We need to make this robust."**

That reversed a judgement in the first pass. I had written "under-capture is the safe direction", reasoning that these foods captured nothing before so finding *some* proteins is strictly better. True as far as it goes, and it misses the asymmetry that matters:

- **Miss a protein** → the vet report tells a vet a contaminated food is clean. They conclude the elimination trial ran clean when it didn't. That is precisely the failure B-351 exists to prevent.
- **Over-capture** → the report names something arguable. Visible, checkable against the bag, correctable through the picker.

Those are not symmetric, and the first one is the one this feature was built to stop.

### What changed

**The lexicon went deep on the categories a trial actually controls** — novel mammals (kangaroo, goat, horse, elk, reindeer…), birds (goose, quail, emu, guinea fowl…), the full fish and shellfish range (~35 terms), insect protein, and **dairy**. Dairy is a first-rank food allergen, routinely excluded from elimination diets, and it was sitting unread on live panels as "dried cultured skim milk" and "dried cheese".

**Hydrolysates went from dropped to captured whole**, which was a real defect under the new steer. Skipping them meant a **hydrolysed prescription diet rendered with no protein at all** to a vet — the worst possible miss, on the food a GI or dermatology patient eats every single day. Folding it the other way (`hydrolyzed chicken` → `chicken`) would claim an exposure the pet never had, which is the whole premise of the diet. `lib/protein.ts` already preserves `hydrolyzed` through its normalizer, so the fix was to normalize the *whole term* rather than the species token inside it: `hydrolyzed chicken liver` → `hydrolyzed chicken`, honest and distinct.

### Two false positives the widening introduced, both caught by test before touching data

- **`sole`** — a real fish, but `\bsole\b` matches *"sole source of vitamin K"*, which is real panel boilerplate. Dropped; missing Dover sole costs nothing next to that.
- **`milk`** inside **"milk thistle"** — a liver-support botanical, not dairy. Now excluded outright.

Both were predicted while writing the list and then confirmed by a failing test. Worth noting the second one only failed because I wrote the test *before* checking whether my own edit had landed — the `sole` removal had silently applied a comment without removing the entry.

### Delta

**+7 rows · multi-protein 31 → 34 · ZERO new contaminant alarms.** That last number is the one that made this safe to apply unilaterally: every one of the 7 rows already carried `chicken`, so each was already flagging on any non-chicken trial. The owner-facing copy just names one more protein; no food starts flagging that wasn't already.

End state re-verified from scratch: applying the two increments lands on a hash **identical** to one clean pass from the original data.

### What I did NOT widen, and why that is the PM's call (B-455)

`food_items.proteins` feeds the **shipped owner-facing contaminant flag** as well as the vet report, and every key in it becomes owner copy — *"This one has X. {Pet}'s duck trial should skip X."* So two categories are not a data decision:

- **Fats and oils.** The exclusion is what stops `chicken fat` in Hill's **duck** entrée from firing a contaminant flag on a novel-protein trial diet. But the mainstream veterinary position — rendered chicken fat is acceptable in an elimination diet — is the *vet's* call, and D1's governing steer is "let the vet piece it together". A vet wants it disclosed; an owner told their duck trial food contains chicken fat would reasonably panic about something clinically fine.
- **Plant proteins.** Real exposures the extractor already emits, but nearly every dry treat in the library carries corn or wheat, so including them makes almost *every* treat flag off-trial — a volume change to a safety prompt, which is an alarm-fatigue question (Principle 4), not a completeness one.

Persona conflict recorded rather than resolved: **Dr. Chen** — disclose both, withholding an ingredient is my judgement to make. **Designer / Jordan** — every extra key spends the safety prompt's credibility, and *"should skip chicken fat"* is advice a vet would contradict.

The likely resolution is not a wider lexicon but a **second channel**: a vet-report disclosure line that is not a `proteins` key and therefore never reaches the contaminant check. That needs a design round → **B-455**. Dairy is the precedent worth reading when it's taken up: it was included, and it cost zero new alarms.
