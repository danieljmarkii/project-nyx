# Design v2, the whole day: the pre-GA critique (the first real `/design-critique` run)

**Date:** 2026-09-24 (ran into 2026-09-25 UTC) · **Issue:** CUL-1179 (moved into *Design v2 — the whole day*) · **Mode:** DISCOVERY · **Branch:** `claude/beautiful-pascal-guyr7o`

**PM prompt:** "We've recently shipped some code re this project, Design v2, the whole day. Please get up to speed on it. We've also recently shipped a design critique skill. I'd love to test it out on this project." The PM's answers to the session's three questions: run now on the shipped code against the round-4 renders (no phone can show Design v2 yet), at **full** depth, and put the PM's account on the `design_v2` allowlist.

## What shipped

`docs/design-v2-critique-2026-09.md` (🧊 dated review): the verdict by lens, seven decision briefs, four rules the team writes without a ruling, the GA sequencing, the lead's pass (what moved on `main`, what the lead checked, the dedupe map, what was filed), the method, and the full 112-item critique in the taxonomy with what held, what was refuted, the carried items and the device pass's 34-item checklist. The briefs are **CUL-1225** (`Waiting on PM`).

## The verdict

Ready for the device pass with conditions; not ready for GA. The design's shape held (S1's plain safety lead, no photo on Home, no verdict word in any title, compaction never crossing a symptom). What failed is underneath: the Signal counts a look as a logged day, draws comparisons the shipped card's own rules withhold, and lets two findings share one identity (folding one folds its twin, live for every account); the look header lost the old card's refusal protections; one Monday can put five vomiting counts into the exam room; and the device pass as written cannot see the chart lead on Nyx's record.

## How it ran

The skill was pushed but unmerged when the session started (#906 opened minutes before the claim), so it ran from its branch's files: `render.mjs` and the workflow copied to the scratchpad, nothing checked out. Ten isolated lenses (the nine standing ones plus Accessibility; Data seated as `adversarial-reviewer`, Jordan as `pm-feature-review`), a verifier each, a synthesis, a completeness critic, six follow-ups and a final synthesis: 29 agents, 14.2M tokens, 3,561 tool calls, 7 hours 14 minutes at two agents in flight. 146 findings: 134 confirmed, 11 plausible, 1 refuted; 61 more from the follow-ups.

## What the lead added

- **Renders that show the settled screen.** The mock plays Home's cold-start wait when the frame scrolls in, so the default shots caught the silhouette and a mid-crossfade Home. Twelve bespoke shots (Home and the quiet day after the wait, one viewport at a time; a look answered; a run opened) and a note at the top of the manifest.
- **A device tag.** The finding schema has nowhere to say "needs a phone", so every lens was told to prefix such evidence `NEEDS DEVICE:`; 34 did, and they are CUL-1070's checklist.
- **A recheck against a moving `main`.** Nine PRs merged during the run (History v2 HV-1 to HV-5, the Reduce Motion fix, the skill itself), changing 16 of the files the lenses read. The lead checked the load-bearing claims in the code on `a56f059`, and three read-only agents rechecked 43 more: 39 hold, 4 changed, none disappeared. Two findings were fixed outright by the merges (a refused bowl counted as eating; a worth-a-call vanishing offline) and were not filed.
- **Dedupe.** Other sessions filed on these surfaces overnight: BRK-13 was already CUL-1206; BRK-9 is CUL-1201; BRK-10's remainder is CUL-1198; the month's twin of BRK-1 is CUL-1194.
- **Grouping.** 62 shipped defects met the filing bar; filed as one issue per fix a session would take.

## Filed and updated

**New:** CUL-1212 (the Signal counts a look-only day as logged), CUL-1213 (two findings share one identity; live for every account), CUL-1214 (the cold-start wait blocks taps for a pet with nothing logged; App Store Launch), CUL-1216 (the withholding rules), CUL-1217 (one count at the recheck), CUL-1218 (the lead card's non-frequency types), CUL-1219 (the Signal screen reads once and needs the network), CUL-1220 (the look header's lost protections), CUL-1221 (the door's denominator and the missing date), CUL-1222 (make the device pass runnable), CUL-1223 (motion), CUL-1224 (the accessibility floor), CUL-1225 (the seven rulings), CUL-1215 (eight fixes to `/design-critique`).

**Updated:** CUL-336 (UTC day counts reach the Signal screen and under-escalate the worsening tier; raised to High), CUL-967 (the rundown tile's unit and clock), CUL-489 (recommend App Store Launch), CUL-188 (step 7's handover check read four keys, one deleted, and missed `daily_look` and `design_v2`; corrected in place), CUL-638 (reopened: closed by an attachment for another issue's PR), CUL-1163 and CUL-1167 (History v2 findings in their files), CUL-1077 (the flight's conditions), CUL-1074 (the six briefs' status), CUL-1178 (the FAB joins the sweep), CUL-1070 (the prerequisite and the phone checks), CUL-1071 (the chain; blocked by CUL-1163, CUL-1167, CUL-1121, CUL-1075 and the new defects), CUL-1176 (five render-step notes during the run).

## One production write

The PM's account was added to `app_config.design_v2`'s allowlist at the PM's word (2026-09-24 23:01Z; `enabled` stays false). It must come off before App Review handover, with the PM's `daily_look` entry, per CUL-188's corrected step 7.

## Persona sign-off

Designer ✓ (the seven principles and Principle 8 on each surface; copy through nyx-voice) · Motion ✓ (the six gestures, their Reduce Motion frames and budgets) · Mobile IA ✓ (the fold from the shipped styles; hit areas) · Data Scientist ✓ (every count broken with a record shape; the coverage predicate reproduced in code) · Dr. Chen ✓ (the exam-room questions; the not-eating gate; UTC days under-escalating a safety tier) · Jordan, Sam ✓ (owner flows; refusals hidden or softened) · Trust and Safety ✓ (the route, the flight's clone, the allowlist's readability, the handover check) · Engineering, QA ✓ (GA's retire list and order; the device pass made runnable) · Accessibility ✓ (VoiceOver, Dynamic Type, contrast, colour alone). Adversarial review: every clinical and count finding carries the counterexample it was tested with, and a verifier tried to refute each; the fixes that touch clinical logic (CUL-1216, CUL-1217, CUL-336) each owe their own `adversarial-reviewer` pass.

## The command's first field test

It held up: the settled lists kept lenses off ruled ground, the verifiers confirmed findings against the code rather than the mock, and the synthesis produced decisions rather than a list. What the lead had to patch is CUL-1215: fixed render delays against a wait played on scroll-in; one shot of a scrolling phone; a hidden control logged as a page error; no schema field for "needs a device"; no recorded snapshot for a lead's pass on a moving `main`; the shipped-before-screenshots mode unnamed; no guidance to group defects by fix; no doc generator; and the wall clock unstated (about 7 hours for a full ten-lens run).

## Outcome

Shipped via the session's draft PR (the doc and this record). Next: the PM rules CUL-1225; CUL-1222 makes the device pass runnable; the defect issues are independent sessions (CUL-1212, CUL-1213 and CUL-1221 are small; CUL-1216 and CUL-1217 owe adversarial passes and CUL-1217 waits on GC-4).
