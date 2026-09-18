# Design system audit → the Design v2 brief, round 1 (CUL-1060)

**Date:** 2026-09-17 (ended 2026-09-18 UTC)

**PM prompt:** "a design system audit … a v2.0 of those design principles … I want us to be a leader when it comes to design … the outcome of this session: a brief, and that brief needs to contain design elements that I can react to." Plus a process directive for every workflow: when a better design violates a principle, surface it to the team rather than self-censor.

**Mode:** DISCOVERY. **Outcome:** the brief shipped via #875 (draft) — `docs/culprit-design-v2-brief.html`, published as an artifact (round 1; later rounds republish over the same URL), linked on CUL-1060 and as a resource on the new Linear project **Design v2 — the data and the delight**. No app code changed.

## The audit (four lenses)

- **What works:** token discipline (zero drift, three colour/typography guards); Geist + Newsreader; a real motion identity (`foldMotion.ts` / `arrivalMotion.ts` / `lookMotion.ts` — the rail is the continuous thread) used on three surfaces; the completion system; the clinical spine.
- **Where it reads as a records system:** Patterns is a B2B KPI column by the analytics spec's own citation (`MetricCard.tsx`); `Sparkline.tsx` is an 88×32 line through counts with no ground; the calendar is numerals and pips with a modal drill-in; the photographed AI reads appear on Patterns as "5"; the Signal card carries every guard as a sentence; every shipped delight moment is transitional or once-ever.
- **Measured:** the design-principles document says *never*/*not* 66 times and *delight* zero times; the DoD has no line about anything being better to look at.
- **Haptics:** the PM's "I don't even know if they work" is literally true — `expo-haptics` is native and the installed dev client predates it (CUL-616, Waiting on PM since Aug 22).
- **The Whorl "blur":** diagnosed, not confirmed — most likely `NightGround`'s three aurora radials banding on OLED (the pull-to-refresh band died of the same thing in July); two lesser suspects: the 700ms dissolve over Home, and `useAppActive` reading iOS's launch-through-`inactive` as paused (the static frame with the glow disc).
- **Root cause claimed:** the seven principles are all restraint principles; guards prevent bad and never produce good.

## What the brief proposes

- **Design Principles v2.0:** the seven kept verbatim; **Principle 8 — the data is the delight** (every number owns a shape; a shape never says more than its number; the screenshot test); **Principle 9 — motion is the record moving** (one physics; draw in · open in place · arrive · fold; chrome still; touch is the same vocabulary felt; verified on a phone); the Motion section rewritten from four sentences into that vocabulary (absorbs D4 and CUL-635's edit 2); the philosophy line *Calm is not quiet* and the chart-colour rule from the validator run (the three category hues fail CVD separation as neighbours; teal is 2.2:1 on white — a chart is never colour-alone).
- **Process rule (written into CLAUDE.md this session, R-11 asks to confirm/amend/revert):** *A rule is a floor with a date on it* — a better-than-the-rule brief in the decision-brief shape, every workflow. Paid for under the byte ratchet by compacting the daily-look Read-These row's narrative tail (guard green: 136,582 B / 136,728 B).
- **Directions, each as built vs proposed with an R-brief:** Patterns as "the record, drawn" (month ribbon with occurrence + coverage, evidence panels, the incident gallery); the calendar (filled days, coverage hairline, open in place — interactive); shapes not sparklines (bars for counts, area for continuous, the counted thing for rates); the Home Trend zone as the first better-than-the-rule brief against D8 (Aug 22); the Signal receipt drawn (100 words → 30, same facts, S2 satisfied by the drawing); one physics (interactive draw-in demo; the Reanimated decision with the Dir. of Eng's conditions); the wait (cold start → skeleton + draw-in; the night moment kept for the report build without the aurora); the first week arc (a strip, for wave 3).
- **The project:** three waves, eleven candidate issues with sizes and files, four existing issues reconciled (CUL-616, CUL-635, CUL-766/830 absorbed; CUL-383 stays closed as scoped; CUL-140's calendar half superseded; CUL-847 shares the chart family), three explicitly out of scope (CUL-322, CUL-493, CUL-447). Filed on the rulings, never ahead of them.

## Persona flags

- **Designer vs Dir. of Engineering on the motion engine (R-8):** the Designer wants Reanimated for the data motion; Engineering agrees on the tool with two conditions — one engine (migrate the three shipped motion modules, no two physics), and an on-device pass on every motion PR. Surfaced as a PM decision, not resolved.
- **Data Scientist (falsification on the drawn shapes):** a month with two unlogged weeks reads as unlogged, not quiet (the coverage hairline) ✓; a single vomit gets one bar and no colour verdict ✓; a trial younger than its baseline on the drawn compare must draw rates with denominators or nothing — written into W1-5's AC.
- **Dr. Chen:** the gallery's rail is the shipped enum, "monitor" stays grey, unlogged days stay visibly unlogged ✓. **Sam:** a "left some" meal stays a hollow dot, never amber. **T&S:** no new data path.

## Method notes

- One look at the render (headless Chromium per section), one edit pass (a wrapping column; the two word counts in §06 computed rather than estimated).
- The dataviz palette validator was run on the app's category hues and their inks; both fail CVD separation as neighbours, which is now a rule in the brief rather than an opinion.
- Mock-round conventions held: one committed page, one artifact URL, a ledger of R-briefs at the top, *as built* frames drawn from the shipped code they name.

## PM actions (all on CUL-1060, `Waiting on PM`)

React to the frames and rule R-1 … R-11. R-9's yes is also CUL-616's one step (the dev-client build).

## Round 2 — "The Record Moves" (same session, 2026-09-18)

**PM reactions to round 1 (transcribed on CUL-1060):** the day as the mark and the area sparkline ruled; the receipt ruled as direction, cluttered; the skeleton ruled ("pull the trigger; the vet report too"); the draw in named as the level of delight wanted; Patterns and the Home trend "not enough"; every Whorl "needs improved"; the one Replay did not move; "reimagine where we need to, don't rely on incremental"; and, mid-round, "I need a fresh artifact — this contains so much from previous builds".

**What shipped:** a fresh current-proposal page, `docs/culprit-design-v2-mockups.html`, published at its own URL (https://claude.ai/artifact/QZoaGcjkWZHbPm2pyewF51); round 1 stays at `docs/culprit-design-v2-brief.html` as the archive with a banner pointing forward and its own Replay fixed. That is the split rule from 2026-08-15, applied at the PM's word. The page: the signature ("the record moves"), six working motion demos (draw in, arrive, the wait as the shape, open in place, the moon, the breathing tick), Patterns reimagined as one scrubbable, layered instrument (Month = the calendar), the Home trend as the fortnight of day marks, the receipt decluttered and drawing in on unfold, every wait as its screen's silhouette with the Whorl and the night moment retired from the working app, the calendar current, the principles compact, the project re-cut (W1-0 the day-mark and chart family first), and the new decisions R2-1 … R2-4 with the standing R-1, R-9, R-10, R-11.

**The bug, and the lesson it carries into the build.** Round 1's Replay never moved: the CSS animated `rect.b`, the bars were `path` elements. Round 2's first harness run found a second, subtler version in its own draw-in: a per-mark `transition-delay` set inline before arming created a zero-length delayed transition in the armed state (which had no transition rule), and the play flip retargeted it to nothing. Both are the same class: a motion the author has not watched is a motion the author has not built. So round 2 drove every demo over the Chrome DevTools Protocol in headless Chromium and sampled a computed style mid-transition and after it settled (`scratchpad/verify-motion.js`): all seven probes moved before publishing, zero page errors. That harness is the shape of W2-1's on-device gate, and the reason the gate is a DoD line and not a habit.

**PM question at the end, answered in the wrap:** "are we spending too much time perfecting this instead of in app" — yes as of this round's end; the page is done and the next session builds W1-0 and W2-1.
