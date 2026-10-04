# A timing or correlation lead takes the row's face — CUL-1218, PR-28

**Mode:** BUILD (dispatched, PR-28 of *Out of beta — Noticed, Design v2, History v2, the trial screen*). Outcome: shipped via the PR-28 PR.

## What was left

#960 shipped CUL-1218's rule fixes: an untitled type is refused, a correlation counts nothing, and the 56-day comment is corrected. #1050 and #1053 rewired the rows' counts through `lib/signalCounts.ts`. That left GC-5, ruled (a) on CUL-1225 on 2026-09-27: a timing or correlation lead takes CUL-1270's face, a small chart of the finding's own evidence. On `main` before this PR, a timing lead still took the lead card, which draws weekly bars of every episode plus "N in the last 7 days · M in the 7 before" under "Vomiting soon after meals". That count is one the claim never made. A correlation lead took the card with a title alone, with no line and no ask.

## What was built

- `leadTakesChartCard` (`lib/signalWindows.ts`) keeps the chart card for frequency findings only (reflection, trial response). Every timing type and every correlation returns false. The predicate is exhaustive over the `SignalFinding` union, so a new type fails the typecheck until it is decided.
- `SignalZone` routes a lead the bars would miscount to `SignalRow` with `isLead`: the display headline, the row's line, the ask and the door. For postprandial and time-of-day leads the row also draws the timing lane, built from the finding (the CUL-1270 build-call-i rule). The story types and correlations draw words only (#1053: no count the screen does not draw). `SignalLeadCard` carries the same check as a backstop and reads nothing for those leads.
- Tests: zone (a timing lead is a lead-register row with one lane and no read; a correlation lead is a row with no chart), card backstop, and the predicate itself. Mutation check: dropping the card backstop reds both card cases. Dropping the zone route stays green, because the backstop catches it, which is the intent.

## Deferred

- **CUL-1582:** a correlation's own chart. The engine has to emit the case-exposed episode days, because the client can only count the matched population by building a second predicate.

## Persona sign-off

Designer ✓ (CUL-1270 face, S1, Principle 3 untouched) · Data ✓ (no count on a timing/correlation lead that its finding did not make) · Dr. Chen N/A · Engineer ✓ (tsc, touched suites). Adversarial pass: see the PR.
