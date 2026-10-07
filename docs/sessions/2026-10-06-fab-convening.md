# The FAB convening: the white plus, delight, and the jump from the fan to the sheet

**Date:** 2026-10-06 · **Issues:** CUL-1625 (DISCOVERY, the convening), CUL-1626 (BUILD, the white plus) · **Branch:** `claude/upbeat-cerf-4k6beb` · **Mock:** `docs/culprit-fab-mockups.html`, round 2 of the FAB, published at https://claude.ai/artifact/MJAkCFb5U93SsHYxXo6rQ9 · **Shipped via #1088**

**PM prompt (with two device screenshots, the fan open and the log sheet):** "I sort of hate how plus is teal. Can we make it white instead … Love the rotation of FAB when selected … Is there anything else that we could consider design delight wise … Do any other apps offer a similar experience? Is it strange that we go from the first fab page w bubbles to a more traditional bottom sheet … Let's convene the full product team and any associated consultants to discuss."

## What shipped

**The white plus (CUL-1626).** `components/log/FAB.tsx`'s plus bars moved from `colorAccent` to `colorTextOnDark`; one glyph turns into the ×, so both positions and the Reduce Motion cross are white, 14.87:1 on the indigo disc. The disc, the turn, the spring, the fan and Reduce Motion are untouched. It reverses only the teal half of CUL-322's D3 = C (2026-09-26) and is the first shipped piece of CUL-1279's G4 = C (2026-10-03: indigo means you can act, teal means a good fact), whose Home mock had already drawn the plus white. The finding that mattered: teal on the disc still passes the 3:1 floor, so no contrast row can stop it coming back. `FAB.test.tsx` now renders the disc in motion, under Reduce Motion and with the setting unknown, and asserts every bar is white; setting either bar back to teal reds all three tests (mutation run on each bar). The contrast suite's passing row is the white pair and its three failing rows stay. The theme comment and brand rule 3's amendment (`docs/culprit-in-app-brand-requirements.md` v1.4) describe the shipped pair, a doc edit that matches shipped code and so a team call the PM can reverse (CUL-1366).

**Round 2 of the FAB mock.** A new page rather than a fifth section on the Design v2 device page, which is a six reaction page whose FAB sections were round 1. It carries the white plus beside the teal it replaces, the competitive sweep, four live phones for the hand-off (A as shipped, D recommended, B and C as options, a veil toggle), the quick meal today beside the proposal, the proposed pills and D6's split stool pill, the turn with and without its bounce, seven briefs and the six voices. Every demo was driven in Chromium before publishing: no page errors, no sideways scroll at 390.

## The convening

One shared briefing (the PM's words, both screenshots, the settled rulings, the verified code facts), six isolated reads, then the lead's pass. Lenses: Sr. Product Designer; Motion & IA; the owner panel (Jordan, Sam) through `pm-feature-review`; Dr. Chen with the Data Scientist; Engineering with QA and an outside accessibility consultant; a research consultant with web search. The lead built the white plus in a separate worktree while the lenses read, so no lens read a half changed tree (C-4), and checked every claim that became an issue in the code.

**Q1, the white plus:** six of six agree. Conditions met in the build: pure white, not the warmer moonlight; the consumption test; the rule 3 amendment. Still owed on a phone: the stroke weight and the Reduce Motion crossfade.

**Q3a, who else:** the fan's shape is mainstream (almost exactly Material 3's FAB menu; Google Calendar and Keep ship versions). Recents that write a record in one tap inside an app's own fan have no precedent the sweep could find; the nearest relatives are the operating systems' quick actions (Android's two fixed plus two recent shortcuts, Apple's recent conversations) and Slack's frequent reaction. The caution that travels with it: Apple asks that recent actions change predictably, and a CHI 2004 study (Findlater and McGrenere) found fixed slots faster than reordering ones. Unverifiable apps (MyFitnessPal's current menu, the baby trackers, the pet apps) were left out.

**Q3b, the seam:** the change of surface is the convention; the seam is how the sheet arrives. `closeMenu(); openLogSheet();` run in one tick, so the fan's indigo veil fades while the RN Modal's `slide` carries its grey scrim up as one block, a hard edged band about 440pt tall over Vomit's confirm. Two veils, two motion systems (the OS slide ignores Reduce Motion, CUL-1178), two origins, two titles. Designer, Motion & IA and Engineering converged on D: one veil, one physics, one name. B (the morph) is large and a literal morph is not available on RN's native driver today; the owner panel wants it as a second step. Every lens rejected C.

**Q2, delight:** ranked by the panel: the meal lands in its card (a choice never plays the cancel; small first, the mark's flight only if that reads flat); the pills read like the record (the format tag; chevrons on doors); the press answers like the disc (and no spinner on a local write); a pet switch deals the fan again, chip first; hold and slide parked behind D1 and D4 with amendments. Rejected: blur and Home at 97%, any glow or celebration, an idle pulse, themed chrome, a reverse flight on Undo, staggered labels, a close haptic.

## Briefs for the PM (on CUL-1625)

D1 the hand-off (D recommended; owner panel dissent for a later B) · D2 the veil colour (grey recommended; deeper checked on the phone) · D3 the delight set (four ideas recommended) · D4 the order of the recent foods (frozen for the day, from a bounded window, recommended) · D5 the turn's bounce (compare both on the next build; a control rule into Principle 9 either way) · D6 normal stool in the fan (a persona conflict: the owner panel against the Data Scientist's capture rate rule) · D7 "Other" celebrates (calm recommended). Team defaults: the white plus ships; hold and slide loses its ring; the confirm stage's teal moves with CUL-1279; no trial mark on a fan pill.

## Filed and carried

Filed, each verified in code: CUL-1632 "Other" celebrates · CUL-1633 the quick meal's card ignores Reduce Motion · CUL-1634 the pills jump on the first open (blocks CUL-1278) · CUL-1635 the fan can open under a meal card still showing, its Undo over the lowest pills · CUL-1636 the fan has no height budget at large text sizes · CUL-1637 the sheet's meal glyph fails 3:1 · CUL-1638 a quick meal's "now" time is treated as exact by the timing lanes, and two client comments say the report and engine read a field no server code reads (blocks CUL-1278). Notes on CUL-1287 (the PM's device reactions), CUL-1278 (the amendments), CUL-1279, CUL-724, CUL-365, CUL-1280 and CUL-416. CUL-682's ruled copy split (2026-08-30) is reopened only through D1. Already filed: CUL-727, CUL-1593.

## Validation

`tsc --noEmit` clean. FAB and contrast suites 76 of 76; the guards and `components/log/` together 58 suites, 1,001 tests. The new pins proven by mutation on each bar.

## Lesson

A pin that guards a colour by contrast cannot guard a colour chosen for meaning. The FAB's contrast rows were green for teal and white alike, so the ruling that teal means a good fact needed a render test that names the colour the bars actually draw.

## The PM's rulings (same session)

The PM reacted to the round the same evening:

1. **The plus:** "if the plus is white in main then I'm just running an older build." The white plus is on #1088 and reaches main when it merges; the PM's build still draws teal.
2. **D1: D**, one veil, one physics, one name. Build: CUL-1642.
3. **D3: approved, "but it's subtle".** So the meal mark's flight is in from the start rather than held back as a second step. Builds: CUL-1643 (after CUL-1633), CUL-1644, CUL-1645, CUL-1646.
4. **"The pills you drew have a color contrast issue."** A drawing bug: the static pill frames inherited the page's ink, light in dark mode, on white pills. The first render check ran in light mode only. Fixed by giving every app frame the app's ink; the republished round was checked in both themes.
5. **D5: a touch more bounce.** Built here as CUL-1641: `TURN_SPRING` friction 7 → 6, damping ratio 0.54 → 0.47, about 19% overshoot (25° past the ×, was 18°), settling in about 420ms. Motion & IA's dissent recorded.
6. **D4: deferred to the design team**, which picked one order for the day from a bounded window (the Data Scientist sets the window). Build: CUL-1647.
7. **D7: calm.** Built here as CUL-1632: `commitToneOf` (`lib/commitTone.ts`, calm for every `SYMPTOM_TYPES` leaf plus `other`) is the one rule the log sheet and the full screen `/log` flow both ask; `stool_normal` keeps its celebrate beat. `lib/commitTone.test.ts` pins its set over every `EVENT_TYPES` key and the membership walk names the new consumer (C-11). The first cut put the predicate in `constants/eventTypes.ts`; CI's engine scorecard job showed that file is in `generate-signal`'s import closure, so merging would have redeployed the engine for a rule only the app reads, and C-26 moved it to its own client module.

Still open: **D2** (the veil's colour) and **D6** (normal stool in the fan). The mock was republished as one proposal at the same URL: D current, B and C gone (commit 462aa8a keeps them), the flight on, the ruled bounce beside today's, D2 and D6 in labelled boxes.

**Validation for the rulings:** `tsc --noEmit` clean; `components/log/`, `constants/`, `app/log.test.tsx`, `lib/haptics.test.ts`, `lib/commitTone.test.ts`, `store/momentStore.test.ts` and the guards, 68 suites and 1,312 tests. Each new pin was run red: Other back on celebrate reds two tests; friction back to 7 reds the motion test.

**Second lesson:** check a mock in dark mode before publishing. An app frame drawn on the page inherits the page's theme unless it sets its own ink, and the viewer's theme is not the author's.

## The FAB gets its own project (2026-10-07)

The PM asked where this work lived in Linear and how it was organised. The honest answer was one hub issue inside *Design v2 — the whole day*, a broad and mostly finished project, four issues in no project at all, and a run order written in a comment that /dispatch cannot read. On the PM's "Let's go w/ a dedicated project":

- **The FAB, round 2** holds the FAB's 19 open issues: 15 moved from *Design v2* and 4 that had no project. CUL-724 (the fan's VoiceOver gap, filed in August) joined them because it was homeless FAB work and PR-23 already carries half of it. Four milestones, one per wave: round 2 already built (#1088); a tap logs what the owner meant; the ruled builds; hold and slide.
- **The page is in the /dispatch layout** (alias `fab`): 14 rows, a merge gate on PR-20 (D2) and on PR-30 (a device pass on a real thumb), plan gates on PR-12 and PR-30 (clinical), and *never at the same time* rules for the three parts of `components/log/FAB.tsx` the rows share. The stored page was run through `scripts/dispatch/page.ts` and the gate predicate; every row parses with its wave, After and gates.
- **One change to the convening's order:** the rows that stop a tap logging the wrong thing lead (a pill under the meal card's Undo, the pills jumping, the wrong food under the thumb), and the jump fix (CUL-1634) now runs before the day's order (CUL-1647), because both change when the fan reads its recent foods.
- **CUL-1287 is the project's one device sitting**, run on the first TestFlight build that carries the wave 2 rows: one sitting per cut, never one ask per PR.
- **Stayed where they were:** CUL-1638 (the engine's meal timing, which gates hold and slide) and CUL-1279 (the app wide colour round, in *Design v2*). STATUS.md gains the track's row.

**Third lesson:** Linear stores a `#NNNN` on a project page as a pull request link, and it moved that link outside the bold of the wave header that held it. The cell stopped ending in `**`, and /dispatch's parser would have read the header as a broken row. A run order's wave headers name no PR number; the parser fix is filed as CUL-1653.

## The last rulings (2026-10-07)

1. **No phone check before a merge:** "I'm not going to do a phone check. I'll check it in production when I cut a build … We'll mature our QA efforts over time." CUL-1287 now asks for the checks on each build the PM cuts. The merge of #1088 still waits for the PM's word in this session (steward §7), since declining the check is not that word.
2. **D2: grey.** One veil for the fan and the log sheet, the sheet's own `colorScrim`; the fan's indigo veil goes. CUL-1642 carries it, and PR-20 lost its merge gate.
3. **D6: add a normal stool option.** The yes carried the brief's condition, so it is three PRs rather than one pill: CUL-1655, with CUL-1656 (a per-pet record of the day the fan first offered Normal, a migration), CUL-1657 (the split Normal and Loose pill, which writes that record) and CUL-1658 (the vet report's line beside the stool counts, which reads it). They are rows 29, 29b and 29c; hold and slide now waits for the split pill too.

CUL-1625 is closed with every brief ruled. The round 2 page was republished (version 3) with the grey veil and the split pill drawn as current; the veil toggle and the D6 option box left the page, and commit 6583200 keeps them.

**Fourth lesson:** a ruling inherits the condition written into its option. D6's brief said "if yes, the change date is recorded so the report can disclose it", so the PM's four word yes was also a yes to a migration and a report change. Writing the cost into the option is what kept that scope visible at the moment of ruling instead of surfacing after it.
