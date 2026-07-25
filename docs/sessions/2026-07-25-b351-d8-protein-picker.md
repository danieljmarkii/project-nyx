# B-351 Phase A PR 3 — the D8 two-line protein picker

**Date:** 2026-07-25
**Shipped via #446.**

## What shipped

The manual capture path can now record more than one protein per food. Before this, `food_items.proteins` could only be filled by an AI label read — anything the model missed, and every hand-added food, stayed single-protein forever, which is the exposure the wedge cares about most going uncaptured.

**The control (§6 / D8) — `components/food/ProteinSetPicker.tsx`.** Two lines over one ordered array:

- **"Main protein"** — the shipped B-332 `ProteinPicker`, single-select, unchanged in shape. This is `proteins[0]`.
- **"Also contains"** — multi-select secondaries, over a new `components/ui/MultiChipGroup` (the multi-select sibling of `ChipGroup`, same wrapping layout and the same B-146 rule behind it; rendered as checkboxes, which is the actual semantics).

Two rules enforce "no captured exposure is ever lost":

- **Auto-demote** — picking a new main moves the *old* main into "Also contains" rather than dropping it, at the **front** of the tail (the array is prominence-ordered, and the outgoing main was the most prominent). §11 extends this to the clear case: a second tap on the main chip demotes it too, leaving the main line empty rather than deleting a protein the owner had recorded.
- **Never in both** — the current main is omitted from the secondaries' *options* entirely, so the two lines cannot disagree about one protein. Making it structurally impossible beat enforcing it in a handler.

**D9 — the typed escape normalizes, and says so (closes B-412).** An owner typing "Buffalo" stored `buffalo` while an AI read of the same label stored `bison`: one animal, two keys, exposure split below the effective-n floor on both, two rows on the vet report. The escape is a *write* path, so it now runs through `normalizeExtractedProtein` — **on commit (blur/submit), never per keystroke** — and the rewrite is legible rather than silent: the matching chip becomes selected (visible *in* the control) and a persistent inline note names both values.

The note (`components/food/proteinNote.tsx`, shared by both escapes) has two registers, picked by whether the saved key is still a word in what was typed:

- kept → *"Saved as Chicken — that's the protein in chicken liver."*
- swapped → *"Saved as Bison — that's the label name for buffalo."* (the PM's verbatim line)

Deliberately silent when only casing changed — the picker Title-cases for display anyway, so there is nothing to explain, and noting it would train owners to ignore the note that matters. Text the normalizer can't use ("fresh", "meal") is left exactly as typed rather than wiped; D9's scope is aliased/stripped terms, not junk rejection, and silently emptying a field someone just filled is the wrong direction.

**The seed rule (§11) — `seedPickerProteins` / `pickerProteinsToSet` in `lib/protein.ts`.** These are the whole mapping between the stored row and the two lines, and they live in `lib/` rather than the component because the seed rule is a *data* rule with a live-window history, and both host screens need the same answer.

- When `primary_protein` and `proteins` disagree (rows written in the window between migration 039 going live and this PR), **the owner's primary wins** and the set is rewritten `[primary, ...rest minus dupes]`. It never fires spuriously, because a legacy row's verbatim-dirty primary and its canonical `proteins[0]` are equal *under canonicalization* — which is what it compares.
- A **null** primary means no main is designated and the whole stored set reads as secondaries. That is the round-trip half of demote-on-clear: without it, re-opening a food would silently promote a secondary into the main slot, and the owner's clear would look like it had been ignored.

**Both host screens now write `primary_protein` AND `proteins` together on every save** — server row and SQLite mirror alike, closing the desync window B-412's second half named. `primary_protein` is the canonicalized main (migration 039's contract), with exactly one deliberate exception, described below: a *cleared* main writes NULL rather than the demoted `proteins[0]`. Both gate on an explicit `proteinTouched` signal, so an untouched picker still never clobbers an AI-hydrated set; on the detail screen that signal also gates the realtime reseed, which is more honest for a two-line control than diffing either line alone.

## The judgment call worth carrying forward

**`pickerProteinsToSet` is Class-A only, on purpose.** It canonicalizes but does *not* run `normalizeExtractedProtein` over the set. The tempting version — "the owner touched the picker, so normalize the whole thing" — would re-key a *seeded* `ocean whitefish` (3 live rows) because the owner edited the **brand** field. That is a retroactive Class-B merge, which D3a forbids, and §11 explicitly reserves the question of re-deriving stored primaries for the B-416 backfill and an explicit PM nod. The distinction is now locked by a test, so it can't ride along later by accident.

The general shape: **the write path an owner is looking at may normalize; a write path they are merely passing through may not.** D9 works precisely because the owner sees the rewrite in the control they just typed into.

## Naming

"Primary protein" → **"Main protein"** on both screens. D8 names the line that way, and the DB column name was leaking into the UI.

## The adversarial pass — FAIL, twice, and what it cost

`adversarial-reviewer` ran at wrap and **failed the pushed commit**, then failed the first round of fixes. Five defects across two rounds, all in the same seam, none caught by a green 85-case suite.

**Round 1 (against `c4091d7`):**

1. **Typing into the Main line's "Other" field filed every prefix as a secondary.** `ProteinPicker` emits per keystroke so nothing typed is lost; `ProteinSetPicker`'s auto-demote treated every emission as a designation. Typing `bison` persisted `proteins = ["bison","biso","bis","bi","b","chicken"]`. Worse, a *single paste* of `buffalo` persisted `["bison","buffalo"]` — **re-opening B-412 inside one row**, the exact split D9 was ratified to close. And because the demote prepends, against a 14-ingredient raw grind it pushed `rabbit` and `venison` past `MAX_CAPTURED_PROTEINS` — verbatim the two novel-protein trial targets the cap bump to 24 exists to protect.
2. **Blurring a seeded custom main re-keyed it without a keystroke.** The Other field auto-mounts for any non-chip stored value, and the D9 commit fired on blur regardless of typing — so tapping through a food whose protein is `ocean whitefish` (3 live rows) rewrote it to `whitefish`. A retroactive **Class-B** merge, which is precisely what D3a forbids and what this PR's Class-A-only serializer was written to prevent. The serializer was never reached: the value was rewritten upstream of it.
3. **Clearing the main did not survive a save/reopen.** The demote puts the old main at `proteins[0]`, and the hosts wrote `primary_protein = proteins[0]` — republishing the designation just cleared, which the reseed put straight back. The clear silently undid itself.

**Round 2 (against the round-1 fixes):** gating the demote on `kind === 'select'` over-corrected — it demotes nothing on a typed change, but the value it declines to move may be a *committed* protein. Retyping or backspacing over a seeded custom main dropped it. I had called that an acceptable typo-correction tradeoff; the reviewer was right that the class of value affected is exactly kangaroo / bison / ostrich — the non-chip proteins a novel-protein trial is built on. Fixed by demoting the last **designated** main (held in a ref) rather than the live prop.

**The finding that matters most is the process one.** All 85 cases were green in *both* states — before and after the fixes. Nothing discriminated, because nothing exercised the line-1 typed escape *inside* `ProteinSetPicker`: the tests covered chip taps through the composite and typing through a bare `ProteinPicker` host, and every bug lived at the seam between them, the one place neither component's own test file looks. Same example-vs-property gap that let B-414 ship under a docstring claiming idempotence.

So the invariant is now a **property test**: *after any interaction sequence, every persisted key is a chip value, a committed value, or a seeded value — nothing may be invented.* A fabricated key isn't merely wrong; it reaches the correlation engine, the Patterns ranking, the vet report and the §8 contaminant check as an exposure this pet never had. Plus a fixpoint property (a no-op interaction survives save→reseed unchanged). **Both verified by mutation** — reverting either fix fails them, and mutation 1 reports the invented key `biso` by name.

## Other reviews

`nyx-voice` pass on the section hint and both note registers. Designer / Engineer / Data / QA sign-off in the PR body. No `vet-report-cold-read` — nothing clinical renders yet; that gate belongs to slice 5.

## Numbers

`tsc --noEmit` clean; jest **1764** across **112** suites (37 new cases, incl. 2 property tests + 7 regression cases from the adversarial rounds). No schema — reads/writes migration 039's `food_items.proteins` and the `food_items_cache.proteins` mirror, both shipped in PR 1. Deno suites untouched: `supabase/functions/generate-signal/protein.ts` re-exports only `canonicalizeProtein`, which is unchanged. CI green on both jobs.

## Two things the PM should see

**1. `primary_protein === proteins[0]` now has one deliberate exception.** When the owner clears the main while secondaries remain, the save writes `primary_protein = NULL` with a non-empty `proteins`. Without it the clear silently undoes itself (round-1 defect ③). It is the honest representation — the exposure stays in `proteins`, and the primary records that no headline protein was named — but it **deviates from D4 / migration 039's stated contract** and wants a spec nod. Two consequences to carry: until Phase B keys on the set, `detection.ts` and `analytics.ts` still key on `primary_protein`, so that food reads as protein-unknown to the shipped detector while `proteins` says otherwise (a narrow, owner-initiated sensitivity hole in Job 1); and slices 4/5 must not assume a non-null head.

**2. One residual the reviewer could not settle statically → B-436.** Both hosts use `keyboardShouldPersistTaps="handled"`, so tapping Save with a typed-but-unblurred Other field dispatches blur *and* press. Whether the commit's state flush wins is platform- and ordering-dependent. If the press wins, the main line persists the raw pre-normalization value (the B-412 split, unfixed by D9) and — worse, because it is deterministic rather than a race on the secondaries line — a protein typed into "Also contains" and never blurred is **dropped entirely**, since that draft is local state and emits nothing until commit. Fix direction is a save-time commit rather than a blur-time one. On-device QA step added meanwhile: type into Other, tap Save immediately, reopen the food.

## What's next on this track

Slices **4** (Tier-1 disclosure + Tier-2 trial-contaminant flag) and **5** (vet-report render, `vet-report-cold-read` gate) are disjoint from each other and from this one — they can fan out as concurrent sessions. Both must read **B-413 / D10** before rendering a protein set: an empty or single-element set cannot distinguish "panel unread" from "no secondaries", and rendering it plainly is reassurance-on-absence on the surface a vet trusts most.

**B-416** (re-derive `proteins` from stored `ingredients_notes` — the existing library is still single-protein on every row) is now unblocked by this PR and by slice 0's length guard. Its one open PM sub-decision stands: does the pass also run existing primaries through the write-path normalizer, turning the 3 `ocean whitefish` rows into `whitefish`? That is a Class-B re-key of stored data and needs an explicit call.
