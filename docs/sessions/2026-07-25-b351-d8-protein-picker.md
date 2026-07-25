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

**Both host screens now write `primary_protein` AND `proteins` together on every save** — server row and SQLite mirror alike, with `primary_protein = proteins[0]` (migration 039's stated contract for this PR). That closes the desync window B-412's second half named. Both gate on an explicit `proteinTouched` signal, so an untouched picker still never clobbers an AI-hydrated set; on the detail screen that signal also gates the realtime reseed, which is more honest for a two-line control than diffing either line alone.

## The judgment call worth carrying forward

**`pickerProteinsToSet` is Class-A only, on purpose.** It canonicalizes but does *not* run `normalizeExtractedProtein` over the set. The tempting version — "the owner touched the picker, so normalize the whole thing" — would re-key a *seeded* `ocean whitefish` (3 live rows) because the owner edited the **brand** field. That is a retroactive Class-B merge, which D3a forbids, and §11 explicitly reserves the question of re-deriving stored primaries for the B-416 backfill and an explicit PM nod. The distinction is now locked by a test, so it can't ride along later by accident.

The general shape: **the write path an owner is looking at may normalize; a write path they are merely passing through may not.** D9 works precisely because the owner sees the rewrite in the control they just typed into.

## Naming

"Primary protein" → **"Main protein"** on both screens. D8 names the line that way, and the DB column name was leaking into the UI.

## Reviews

`nyx-voice` pass on the section hint and both note registers. `adversarial-reviewer` run at wrap. Designer / Engineer / Data / QA sign-off in the PR body. No `vet-report-cold-read` — nothing clinical renders yet; that gate belongs to slice 5.

## Numbers

`tsc --noEmit` clean; jest **1757** across **112** suites (30 new cases). No schema — reads/writes migration 039's `food_items.proteins` and the `food_items_cache.proteins` mirror, both shipped in PR 1. Deno suites untouched: `supabase/functions/generate-signal/protein.ts` re-exports only `canonicalizeProtein`, which is unchanged. CI green on both jobs.

## What's next on this track

Slices **4** (Tier-1 disclosure + Tier-2 trial-contaminant flag) and **5** (vet-report render, `vet-report-cold-read` gate) are disjoint from each other and from this one — they can fan out as concurrent sessions. Both must read **B-413 / D10** before rendering a protein set: an empty or single-element set cannot distinguish "panel unread" from "no secondaries", and rendering it plainly is reassurance-on-absence on the surface a vet trusts most.

**B-416** (re-derive `proteins` from stored `ingredients_notes` — the existing library is still single-protein on every row) is now unblocked by this PR and by slice 0's length guard. Its one open PM sub-decision stands: does the pass also run existing primaries through the write-path normalizer, turning the 3 `ocean whitefish` rows into `whitefish`? That is a Class-B re-key of stored data and needs an explicit call.
