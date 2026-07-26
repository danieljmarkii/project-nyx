# B-416 — re-derive `food_items.proteins` from stored `ingredients_notes`

**Date:** 2026-07-26

Shipped via **#452**. Closes the B-351 Phase A fast-follow — the data half of a feature whose code half had already shipped.

## The problem, stated plainly

Slice 5 (#448) taught the vet report to render protein sets. It rendered them over a library where **every row still had `|proteins| ≤ 1`**, because migration 039 backfilled the naive `proteins = [canonical(primary_protein)]` and nothing had been re-extracted since. So the report was faithfully displaying a single-protein view of a multi-protein library.

The row that makes it concrete: `Tiki Cat after DARK Rabbit & Chicken Liver` was keyed `["rabbit"]` while its own stored panel reads *"Rabbit, **duck**, **chicken** broth, chicken liver, chicken heart…"*. A rabbit elimination trial run off this library passed the slice-4 contaminant check **clean** — the exact silent failure B-351 was written to stop, sitting in production, in the PM's own library.

The panels were already stored verbatim (spec §12), so nothing needed re-photographing. This was a text-only pass over data we already held.

## Result

**62 rows scanned · 35 changed · multi-protein rows 1 → 31.**

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

Recorded dissent (T&S / the D3a default): 2 of the 3 rows are `source='user'`, and B-416's own design constraint says no owner-edited value is overwritten. What resolved it: `Ocean Whitefish` is not producible from any `COMMON_PROTEINS` chip, so it was typed into the "Other" escape — and under D9 (shipped in PR 3) typing it *today* rewrites it to `Whitefish` **and tells the owner**. Stored data now matches what the product already does with that input. The residual — the owner sees the changed value without D9's inline note — is filed as **B-451** rather than papered over.

## The reporting defect worth remembering

The first run printed **"re-keyed 10"**. Only **3** of those were Class B. The other 7 were Class A (`Chicken By-Product Meal` → `chicken`, `Rabbit` → `rabbit` — casing and processing qualifiers, permitted always and retroactively).

Left alone, that line would have reported a **3× overstatement of the blast radius of the thing the PM had just ratified** — in the exact artifact D3a's standing guard asks for. `BackfillPlan.classBRekey` now tracks the semantic re-key separately from "the primary was rewritten", and the report labels every row `(A)` or `(B)`.

The general lesson: when a ruling is scoped to one class of change, the instrumentation has to be scoped the same way, or the audit trail quietly launders one warrant into the other.

## Deterministic scan, not a re-run of the vision model

The obvious alternative was to re-invoke the extractor's model over the stored panel text. Rejected on one ground: **a backfill over clinical data has to be reviewable row by row before it is applied**, and 43 model outputs nobody checked is not that. A lexicon scan is a pure function — unit-tested, stable across runs, diff fits on a screen, and it cannot hallucinate a protein into a novel-protein trial food.

The cost is real and named (**B-452**): it finds only animals it knows. That is an *under*-capture, and under-capture is the safe direction here — these foods captured nothing at all before.

The exclusion list turned out to be the load-bearing part, not tidiness. `chicken fat` appears in Hill's **duck** entrée; without excluding fats, oils, flavours and hydrolysates the pass would have appended `chicken` to a novel-protein trial food and fired a **false contaminant flag on a trial diet** — the most expensive false positive this feature can produce. Same mechanism correctly rejects `Natural Tuna Shrimp & Salmon Flavor` on a Temptations treat.

## The two guards, enforced structurally

This backfill is where a bug fixed in *code* last session could return as *data*. #448 keyed the vet report's read path Class-A only (`readProteinSet`), which is correct **because** migration 039 left `canonicalize(primary_protein) === proteins[0]` on every row. This pass is the one thing that could have broken that premise.

1. **Atomic rewrite.** `primary_protein` and `proteins` go in one statement; there is deliberately no code path in the generator that emits a single column. The failure it prevents is the shipped one — page 1 announcing that a whitefish trial food is contaminated with whitefish.
2. **Write-path normalizer + dedupe in normalized space.** Secondaries append through `normalizeExtractedProtein` (Class B is in contract on a write path). Dedupe compares *normalized* identities, which is what stops a panel's "Ocean Whitefish" landing beside a stored `ocean whitefish` — the same bug arriving from the secondary side instead of the primary side.

## What was deliberately *not* done

`ai_extraction_confidence` was left untouched. Writing it would have cleared the D10 gate and stopped these rows reading "ingredient list not read" on the vet report — which is the half of the PM's complaint this pass does *not* fix.

It would also have been a lie. A keyword scan finds only what its lexicon contains, so attesting completeness off one licenses *"nothing else on the label"* over a panel that may list an animal the scan never knew — reassurance-on-absence, on the surface a vet trusts most. Under-claiming is D10's named safe direction. The real fix is a provenance/coverage field written by an extractor that actually read the panel (**B-437**), or re-extraction (**B-452**) — not a value invented by a backfill.

## Verification

- **0** rows where `canonicalize(primary_protein) ≠ proteins[0]` — the read-path invariant, now held *literally* rather than under canonicalization
- **0** rows carrying a protein twice · **0** `ocean whitefish` remaining · **0** stored keys lost
- The applied database state **hashes identical** to the independently computed expected state
- Re-planning over the live post-state produces **zero** further changes
- 33 new tests, **mutation-verified** — deliberately broke the fat exclusion, the primary hoist, and the atomic write; each mutation was caught. The hoist test was strengthened mid-session after a mutation slipped past it: the original fixture stored `['duck']`, which made the assertion pass with or without the hoist.

One process note: the row dump was **checksummed row-by-row against the database before use**, which caught a genuine transcription error in one panel's tail. Worth keeping as a habit any time data crosses out of the database by hand.

## Artifacts

`scripts/b416-protein-backfill/` holds the applied SQL, the per-row rollback, and the before/after report — D3a's standing guard (every re-key ships with a before/after affected-row count), satisfied by construction rather than by a summary line.

## Follow-ups filed

- **B-451** — the 3 Class-B re-keys changed an owner-visible value without D9's inline disclosure (2 of 3 are `source='user'`). Do *not* fix by reverting the re-key; that reopens the widening split.
- **B-452** — the lexicon finds only known animals; plant proteins and hydrolysates are deliberately out of scope. Re-extraction, not a longer word list, is the complete fix — a bigger lexicon buys coverage without ever buying the attestation.
