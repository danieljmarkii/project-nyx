# Event taxonomy — W1-PR-2: capture — cough + sneeze behind the flag (CUL-675)

**Date:** 2026-08-27
**Shipped via #729.**

## What this was

W1-PR-2 of the Event Taxonomy Expansion track (B-756/CUL-509, spec
`docs/nyx-event-taxonomy-requirements.md` v1.3 §13a): the visible half of wave 1.
Cough and Sneeze become loggable — tiles in a new **Breathing** group on the
expanded grid, dark behind `event_types_v2` (both gates), with the D10
witnessed-by-construction confirm, the §7 detail contract, the HR-6 ten-list
membership walk, and the §8 degradation pass. The confirmed round-3 W1 frame
(`docs/culprit-event-taxonomy-mockups.html`, "1·W1 CONFIRMED" 2026-08-27) is the
design authority.

**On the D5 gate:** per the standing per-PR convention (recorded in the PR-0/PR-1
session records), the PM launching this session on CUL-675 is this PR's kickoff.
Both blockers were `Done` first: CUL-673 (flag seed, #727) and CUL-674 (enum
migration, #728 — applied live, both values read back). The chain pauses cleanly
here — W1-PR-3a (client symptom mirrors) starts on its own kickoff.

## What shipped

- **`constants/eventTypes.ts`** — the HR-4 structural move: every `EVENT_TYPES`
  entry gains `family` / `species` / `hasPhoto` / `confidenceModel` / `v2Only`
  (fields the checklist assumed but the code didn't have); `cough` (Lucide
  AudioLines) + `sneeze` (Wind) entries, both `v2Only`, `witnessed`,
  `hasPhoto: false`, family `respiratory`, species `all`; `EVENT_FAMILIES` (the
  seven ruled family groups, "Breathing" as the respiratory label, "Digestion"
  never "Tummy") and `expandedPickerGroups(species, entries)` — the family
  grouping now lives in constants, so later waves edit data, not a component;
  `SYMPTOM_TYPES` gains both (§6 pairing rule half 1); the §8 degradation
  contract written down at the predicate it rides on.
  - For pre-W1 leaves the new fields **describe** the shipped surfaces, never
    re-decide them (lethargy/itch keep their chip pair; medication/weight keep
    their detail add-photo hero) — that is what keeps FL-1's byte-identical
    claim true by construction.
- **`components/log/EventTypePicker.tsx`** — `CATEGORY_TINT` gains cough/sneeze
  rose (§6 pairing rule half 2; compile-forced by the `Record<EventTypeKey, …>`
  type, exported for the pairing set-equality test); `grouped` hosts gain
  `expanded` + `species` props — expanded=false renders the pre-expansion
  three-group grid **verbatim** (the regroup rides the flag), expanded=true
  derives the seven-group W1 frame from constants; the flat grid filters
  `v2Only` **structurally** (no flag can leak a taxonomy tile into it); the
  expanded grid's row balancing reproduces the confirmed frame exactly (no
  odd-run promotion inside the split-Stool group — Vomit stays half-width, as
  drawn; single-tile groups still promote to full width).
- **`components/log/EventTypeSheet.tsx` + `app/log.tsx`** — both hosts read the
  `event_types_v2` two-gate pair (`useAllowlistFlag` × `useBetaOptIn`, the
  B-712 shape) and pass `expanded` + the active pet's species to the grid.
- **D10 on both confirm surfaces.** `SimpleEventConfirm`: a
  witnessed-by-construction leaf renders **no Saw it / Found it pair** (a window
  claim is unwritable by construction — the B-448 leak class) and **no photo
  row** (`hasPhoto`); "Change time" covers late logging; the third rose
  hand-list (`ROSE_FAMILY`) is deleted — the header now derives from
  `SYMPTOM_TYPES ∪ {stool_normal}`, the picker's rose set by definition.
  `app/log.tsx`'s simple step mirrors it (plain witnessed time row instead of
  `TimeConfidenceField`; photo row gated), and `handleTypeSelect` resets the
  B-010 state when a witnessed-by-construction type is chosen, so stale
  "Found it" state can never reach a leaf whose record can't hold a window.
- **§7 detail contract** — `lib/eventPhoto.ts` `isMeal` → `offersPhoto` (the
  per-leaf gate): a cough/sneeze detail never renders the empty Add-photo hero;
  an existing photo still renders (a swapped `other`→`cough` row keeps its
  evidence); an **unknown** type keeps today's generic offer (`?? true`) per §8.
  Identity/facts/notes/unknown-fallback were already correct by construction
  (`label ?? 'Event'`, `EventIcon` CircleHelp — HR-9's verification).
- **The HR-6 membership walk** — `constants/eventTypes.membership.test.ts`: the
  ten §13a lists (+ the signal mirrors) as an explicit decision table, one row
  per list with the intended end-state and the PR that lands it, asserted
  against the code **at this point in the chain** — the PR-2 lists are asserted
  joined; the PR-3a/3b lists are asserted still-absent, so those PRs flip the
  rows deliberately as visible diffs; the `patternsTiming` mirror row records
  that its answer is coupled to 3b's per-lane build (the loggedDays
  denominator). Server lists are pinned by source-text scan (Deno modules).
  Plus: the §6 pairing set-equality (rose tiles == SYMPTOM_TYPES ∪
  {stool_normal}), the §7 contract rows, the confirmed-frame derivation pin,
  the species mechanism (against hypothetical species-conditional entries), and
  the §8 assertions (a known new symptom is rose; an unknown future symptom
  de-symptomizes to neutral — the documented §8a cost; unknown day rows degrade
  to 'Event').
- **Tests updated as visible diffs** — the flat-grid pin now also asserts no
  v2Only tile at any flag state; the grouped completeness guard splits
  unexpanded (pre-W1 set) vs. expanded (every type); new expanded-grid
  snapshot + group/route/species cases; D10 confirm cases (no chips, no photo
  row, witnessed write with null bounds, artifact leaves untouched); sheet
  expansion-gate cases (flag-off byte-identical, one-gate-insufficient, cough
  confirms in place, **calm** beat); daySummary C0 tripwire extended with
  cough/sneeze + the interim noun-fallback case ("1 cough" until PR-3a lands
  the real nouns); EventIcon mapping; eventPhoto offersPhoto cases.

## Verification

- `tsc --noEmit` clean; **full jest suite green: 272 suites / 5,967 tests / 5
  snapshots.** The two pre-existing picker snapshots passed **unchanged** — the
  FL-1 byte-identical proof is the stored snapshot files not moving while
  `EVENT_TYPES` grew by two.
- **The CUL-613 red-check:** the new guards were run against a deliberately
  broken tree (cough flipped to `hasPhoto: true, confidenceModel: 'artifact',
  v2Only: false`) and went red — 7 failures across the membership, picker, and
  confirm suites — before being trusted green.
- `code-reviewer` subagent run against the diff (general health + house rules).
- Confirm copy took the nyx-voice pass: all new owner-facing strings are the
  ruled mock labels ("Cough", "Sneeze", "Breathing") or derive through the
  shipped `lib/logCopy` path (History parity); no exclamation marks, no jargon,
  no new empty states.

## Decisions taken in-session (build-level, none reversing a ruling)

- **The expanded grid's row balancing** follows the confirmed W1 frame over the
  legacy odd-run promotion in one spot: no promotion inside the split-Stool
  group (Vomit renders half-width beside the full split row, as drawn). The
  W1–W3 density frames are hand-drawn and not perfectly systematic about this;
  the W1 frame is the authority for this PR, and W3's mock re-decides at its
  density.
- **`hasPhoto` semantics for pre-W1 leaves** = the shipped photo affordance
  (medication/weight `true` — their detail hero exists today), so adding the
  field changes zero existing behavior. Only the new leaves carry the §6 rule.
- **`ROSE_FAMILY` deleted** rather than extended — the confirm's rose set is now
  derived from the two sanctioned predicates instead of being a third hand-list
  §6 forbids.

## Notes for the next session

Next is **W1-PR-3a** (CUL-676's client half): the client symptom mirrors, FIRST
and on their own — the signal union + both label maps (`lib/signal.ts`
`SignalSymptomType`, `lib/signalCopy.ts` `SYMPTOM_LABEL`), `TREND_SYMPTOM_TYPES`,
`SYMPTOM_EVENT_TYPES`, `SYMPTOM_NOUN`/`SYMPTOM_CHIP_ORDER`,
`WIDGET_SYMPTOM_LABELS`, History `TYPE_FILTER_KEYS`. The membership walk's
still-absent rows are the worklist: each flip is a visible diff in
`constants/eventTypes.membership.test.ts`. The release-order asymmetry (HR-2) is
why 3a precedes 3b: the mirrors ship at App Store cadence, and without them a
cough chronicity finding renders "recurring undefined" on the safety banner.
