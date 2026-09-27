# TS-6 — the Pet tab keeps a door to the trial screen

**Date:** 2026-09-27

Shipped via #950. Linear: CUL-1302 (TS-6), CUL-1339 #2 (ruling implemented), CUL-1347 (filed and folded in, then superseded by #948's identical fix at merge). Project **Diet trial — its own screen**, milestone C.

## What shipped (all dark behind `trial_screen`)

- **The Pet tab's door.** While a trial is active or in its 30-day grace, the trial slot is one row (`components/trialScreen/TrialDoorRow.tsx`, model `lib/trialDoorRow.ts`) that opens `/trial/{pet}`: the eyebrow, the strip's header (the card's kicker on an ended trial), the day bar, `{food} · ends {date}`, a chevron, no buttons. With no trial the start card is untouched. While the trial read still belongs to the previous pet, neither door nor card draws (B-789). The end clause is shared with the screen (`trialEndPart`, extracted from `sublineFor`).
- **The safety faces.** Wherever the screen leads with its safety block, the door drops its bar and end date and carries the screen's two register sentences verbatim on a rose rail. "Wherever" is the screen's own test (`trialSafetyLines(trialScreenCard(input))`), so the door and the screen cannot disagree about whether something is wrong.
- **Senders.** The Day Summary's trial strip opens `/trial/{recap pet}`; a widget `src=widget` trial tap forwards once to the widget pet's screen after CUL-1292's switch lands (consumed in the ref before the push, C-22). TS-4's Replace / Start hand-off was reused unchanged and is now tested with the flag on (opens exactly once).
- **CUL-1339 #2 (a).** *Manage the trial* on the trial screen's intake-decline face, after the doors, with a model test (before and after both Manage acts) and a loader-level test that the decline read takes the pet and never the trial.
- **Flag-off guard.** The Pet tab and the Day Summary joined `SURFACES` (the Day Summary also as a decider with a flag-off href proof). Merging main brought TS-5's Home in, so all four surfaces spec §7 names are registered. A planted ungated door reds the Pet tab surface.

## Decisions (all PM, 2026-09-27; written inline in the spec as ⚠ RULED)

1. The door on a safety face: (a) no bar, no end date.
2. (a′) after the adversarial pass: the door carries the screen's safety sentence. (a) assumed the call-today stays on Home's Signal card; it does for an intake decline and not for a trial refusal (the Signal cannot see a day-1 refuser, B-789, and Home's strip is silent on a refusal because the Pet tab's card held the register).
3. "Both": the first sentence is only the fact; the call lives in the second, so the door carries both.
4. Fold CUL-1347 (the DST fixture fix) into this PR. TS-5 landed the same fix on main first, so at merge main's version was kept and this PR's copy dropped out.

## Reviews

- **code-reviewer:** ship-ready; two nits (a stale Pet tab comment, fixed; the spec pointer, written at wrap).
- **adversarial-reviewer:** Change 1 (Manage on the decline face) held: Replace through an abandoned-as-refused trial keeps the decline register (`dietTrialCard.ts:969`), and the window cannot be shortened into a milestone (`dietTrialSetup.ts:991`). Change 2 failed on `trial_refusal` (finding #12 above), which produced rulings 2 and 3. Lower notes (door keyed on state, test injecting the decline) were fixed in the same PR.

## What broke

- The non-UTC CI job went red on every PR the day Chatham started daylight saving: two test helpers stepped back `n × 24h`. Filed as CUL-1347, verified, folded in at the PM's call; TS-5 had fixed it identically on main.

## Residuals

- The widget forward depends on the flag having hydrated; a cold start that reaches the forward first scrolls to the door row instead (stated in `profile.tsx`).
- A stood-down refusal (`isAnimalNotEating` true, no register lines) shows the bar and end date on the door, as on Home's strip and on the screen; the three agree.
- CUL-1339 #1, #3 and #4 remain open and gate the device pass (CUL-1306), not TS-6.
