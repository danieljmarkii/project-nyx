# Engines v3 PR-38: EN-10 client, the context lines

**Date:** 2026-09-30

Shipped via #991 (CUL-1421). The app half of EN-10: the visit, trial and course lines the server composes (PR-22, #987) now reach the owner. Ships dark: `engines_v3_en10` has no `app_config` row (verified this session), and an absent key reads as off.

## What shipped

- **`lib/careContext.ts`**: one reader, `careContextLinesOf`, shared by both surfaces.
  - Gated to the five types the server decorates.
  - Relays the server's sentences verbatim and in its order, and never rebuilds a sentence from `count` / `loggedDays`. The server withheld every §5.1 zero, and a second composer would be the one place a withheld zero could come back.
  - All or nothing: one malformed line drops the set, so the trial is never left first beside a steroid.
- **Signal screen** (`lib/signalScreen.ts` `context`, `components/designV2/signal/SignalScreen.tsx`): an *Around this* section, mock §05 5a/5b.
  - Insight screen: under the sentence.
  - Safety screen: after the phone script, so the ask and its script stay one block (BRK-39).
- **Get ready** (`lib/getReady.ts`): a Signal row carries its lines as the row's `detail` (mock 5c). Copy as text (`rundownToPlainText`) is untouched.
- **`lib/signal.ts`**: mirrors `CareContextLine` as an optional field on the five types.
- Never on Home (care-state spec §3.4).

## How it was checked

- `tsc` is clean, and the full jest suite passes (580 suites).
- A round-trip test runs the server's own `linesForSign` over the mock's record. 5b's withheld zero never reaches the client.
- Mutation check: turning the all-or-nothing rule into a per-line filter makes 5 tests fail.
- `code-reviewer`: ship-ready. Its nits are fixed: the reader is type-gated, and the bullet dot is hidden from assistive tech.
- `adversarial-reviewer`, isolated:
  - **The relay held.** Order, all-or-nothing, and no attribution on Get ready.
  - **The screen failed §5.1's screen-wide rule.** Zeros printed by surfaces that predate EN-10 now sit beside the lines: the weekly bars' "0" for the steroid week, the drawn compare, and the trial strip's standing line in *Why* and on Get ready's trial row.

## Decision

The PM ruled option A on the CUL-1421 brief (2026-09-30): merge as built, keep `engines_v3_en10` off for every account, and fix the screen-wide rule as its own issue with a mock round first. That issue is filed in Linear, related to CUL-1421, and blocks the key's flip.

## Open

- The drug label is owner free text and is relayed without the `%` screen that the med-on-board line uses. Under all-or-nothing, that screen would erase every line beside an unresolved drug like "Baytril 2.5%".
