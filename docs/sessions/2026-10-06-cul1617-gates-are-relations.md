# The groomer: gates are relations, not sentences (CUL-1617)

**Date:** 2026-10-06
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1079. Dispatched by `/dispatch` (The workflow audit, CUL-1612 parent), branch `claude/the-workflow-audit-adhoc-10061235-e`.

## What shipped

- `.claude/skills/backlog-groomer/SKILL.md`: **step 16, gates are relations** (a `GA gate` or a `**Blocks:**` line that names something becomes a `blocks` relation or a report line) and **step 17, orphaned follow-ups** (open High/Urgent or gated issues from the last 30 days with no project). Three rows in § What an unattended pass may WRITE, one writable and two report; output-format lines for both halves.
- `guards/groomWriteBoundary.test.ts`: parses the boundary table and pins its writable and report halves exactly, plus the two load-bearing conditions on the new row (append-only; the contract-date gate). Six mutants, all killed (listed in the file header).

## What the board changed about the design

The first draft licensed an unattended `blocks` write whenever a **Blocks:** line named an open `CUL-NNN`. The read-only sweep of all 895 open issues (475 non-empty **Blocks:** lines) showed why that would mint wrong relations: 94 lines name an identifier, 55 name only closed issues, and of the 39 naming an open one, most name it as something else ("rides the `generate-report` redeploy (CUL-19); does not gate it", eleven lines; "found during CUL-1349"; "beside CUL-1487"). The second draft narrowed the write to a line that is the identifier alone. CUL-1542 broke that too: its line is the bare `CUL-1531.` and its TL;DR says it *waits on* CUL-1531. The cause is the old issue contract, which defined **Blocks:** as "the condition that should trigger this".

So the write now fires only on issues created after the CLAUDE.md issue-contract clause gives **Blocks:** one direction (the later PR the issue names; B holds CLAUDE.md). Until that clause is on `origin/main` the row writes nothing, and every gate on today's board is a report line with the direction read beside it. The guard pins that condition.

## Step 16 run on today's board (report only; zero writes, by the rule above)

- **CUL-1560** (`GA gate`, `Gate: clinical`): **linked**, blocks CUL-559 (the 1.2.0 cut), added before this run. Its sentence names "the daily look leaving beta", which is CUL-876, Done: the gate it was written for was missed, and the relation now carries it to the store build instead.
- **CUL-1074** (`GA gate`): **prose**, "D2-8 (brief 1 decides whether a lens lane precedes GA)", no relation. Candidate: Design v2's GA issue, CUL-1071, which is Done, so this is also a stale gate; report for the PM.
- **Named, not linked, read as blocks** (an attended pass adds the relation): CUL-1599 → CUL-1313 · CUL-1598 → CUL-1313 · CUL-1110 → CUL-409 (its body: "ships before, or with, CUL-409's verdict fix") · CUL-644 → CUL-19 · CUL-860 → CUL-847 · CUL-853 → CUL-847 · CUL-856 → CUL-847, CUL-282 · CUL-880 → CUL-507 · CUL-1287 → CUL-1278, CUL-1279 · CUL-592 → CUL-369 · CUL-1205 → CUL-66 · CUL-598 → CUL-424.
- **Named, not linked, read as blocked-by**: CUL-1542 ← CUL-1531 · CUL-1430 ← CUL-1002 · CUL-1294 ← CUL-51 · CUL-19's riders CUL-632, CUL-633, CUL-634, CUL-656, CUL-747, CUL-748, CUL-749, CUL-750, CUL-757, CUL-759, CUL-763 (each says it does not gate CUL-19; that is an inverted line, and CUL-860/CUL-853 ride CUL-19 the same way).
- **Named, neither direction** (provenance or a home, not a gate): CUL-1495, CUL-1353, CUL-1350, CUL-1320, CUL-1319, CUL-929, CUL-544, CUL-1104, CUL-742, CUL-1010, CUL-1011, CUL-877, CUL-969.
- **Missed or stale** (every named issue closed): 55 lines, in the appendix.
- **Prose**: 357 lines, in the appendix. The large majority are conditions and notes written under the old contract, not gates.

## Step 17 run: 52 orphaned follow-ups

Listed in the appendix's Table 2. Notable: CUL-1579, CUL-1468, CUL-1467, CUL-1356, CUL-1202, CUL-1105 (High, gated, no project).

## Decisions

- **Stricter than the issue on one point.** The issue allowed linking "a project's GA issue the step can identify with certainty". The skill's governing rule (a sentence the pass wrote is a report line) and the measured direction ambiguity both say no: an unattended pass links only an identifier written as the whole line under the new contract. Recorded on CUL-1617.
- `Gate: device|design|clinical|privacy|deploy` alone is not a blocks claim (those labels name what an issue waits on), so they enter step 16 only through a **Blocks:** line, and step 17 reads them.

## Residuals

- The write row yields nothing until the CLAUDE.md issue-contract clause lands; the clause's wording should match the `git log -S "a gate is a relation"` probe step 16 uses to date it.
- The 12 blocks-direction rows above want an attended pass to add their relations.

## Appendix: the dry run (read-only sweep, 2026-10-06)

The sweep's population is a slight superset of step 16's final rule: it kept 18 lines that open with `—` or `nothing` and add a note (`[nil+note]`), which the step now excludes.

### Dry-run: gating claims without a `blocks` relation — team Culprit, 2026-10-06

READ-ONLY sweep. Nothing was written to Linear.

- Open issues scanned (state type unstarted / backlog / started): **895** (807 unstarted, 51 backlog, 37 started at the start of the sweep). The description of every one of them was read individually; search was not used for coverage because it proved non-exhaustive.
- Candidates (A ∪ B): **475**. Population A (label `GA gate`): 2 (CUL-1560, CUL-1074), both of which also have a Blocks line. Population B: 475 (includes both A rows).
- **LINKED: 24** · **ID-NAMED: 94** · **PROSE: 357** · **LABEL-ONLY: 0**
- Sub-groups inside those counts: `[nil+note]` = 18 (the line opens with —/nothing but goes on to make a conditional or soft gating claim, so it was kept); `[mid-paragraph, not line start]` = 3 (the Blocks text is not at line start, so it was kept and marked).
- ID-NAMED split: in **55 of 94** rows every named issue is Done, Canceled or Duplicate, so the prose gate is stale. In **39** rows at least one named issue is still open, and those are the real link candidates. The open targets are, most often: CUL-19 (In Progress, 16 rows), CUL-847 (In Review), CUL-556, CUL-1349, CUL-1313, CUL-747/748, CUL-559, CUL-173, CUL-995, CUL-994, CUL-424, CUL-369, CUL-66, CUL-507, CUL-543, CUL-409, CUL-1531, CUL-1487, CUL-1278/1279, CUL-1101, CUL-1002, CUL-282 and CUL-51. Caveat: "names an id" is a textual test. Several Blocks lines name the id as the thing *this* issue rides on (e.g. "rides the CUL-19 deploy"), which is a blocked-by direction. The exact text is in the table, so read it before linking.
- Bracketed states on ID-NAMED rows are the named issue's state on 2026-10-06. Open issues are shown with their status name (Todo = unstarted), and closed ones were fetched individually. **Most ID-NAMED targets are Done, Canceled or Duplicate**, so those prose gates are stale rather than unlinked.
- Gate-label column shows only `GA gate` / `Gate: *` labels. "Legacy Backlog" is a project, not none.

### Table 1: candidates

| id | priority | gate labels | project | Blocks: (verbatim, ≤200) | relations.blocks | classification |
|---|---|---|---|---|---|---|
| CUL-1618 | Low | — | Engines v3: the accountable engine | re-enabling model phrasing on safety summaries (the B-096 re-enable gate). | none | PROSE |
| CUL-1615 | High | — | The workflow audit — the board, the queue, the ceremony | CUL-1517 (the operating kit port). | CUL-1517 | LINKED |
| CUL-1612 | High | — | The workflow audit — the board, the queue, the ceremony | the cap raise (D1). | none | PROSE |
| CUL-1614 | High | — | The workflow audit — the board, the queue, the ceremony | the D1 cap raise (with A1 and A2); C. | CUL-1615 | LINKED |
| CUL-1482 | High | — | App Store Launch | the 1.2.0 store build (App Store Launch, M5). | CUL-559 | LINKED |
| CUL-1609 | High | — | Engines v3: the accountable engine | — (lands as each row reaches the floor) | none | PROSE |
| CUL-1599 | Low | — | Engines v3: the accountable engine | EN-14 GA (CUL-1313); not PR-36. | none | ID-NAMED: CUL-1313 [Todo] |
| CUL-1598 | Low | — | Engines v3: the accountable engine | EN-14 GA beyond the PM's account (CUL-1313). | none | ID-NAMED: CUL-1313 [Todo] |
| CUL-1531 | Medium | — | Engines v3: the accountable engine | PR-35 (the client half) or any later care-state pass. | none | PROSE |
| CUL-1596 | Low | — | Engines v3: the accountable engine | turning the knob on, and the Home door for the question (unbuilt). | none | PROSE |
| CUL-845 | Medium | Gate: deploy | Home v2 — the redesign | DL-5 (Patterns) and the Ask track's next change cannot ship without gates 1 and 2. The link question itself (below) re-opens when the daily look has three months of looks in the record, or when the t… | none | PROSE |
| CUL-383 | Medium | — | Legacy Backlog | — (composes with B-067) | none | PROSE |
| CUL-638 | Medium | — | Aug. 2026 Design Polish | — . Needs a copy + design call (nyx-voice, and the safety register question is Dr. Chen-adjacent), so it is a mock-round item rather than a straight build. | none | PROSE |
| CUL-1583 | Medium | — | Design v2 — the whole day | — (start after CUL-1218 merges, for the title) | none | ID-NAMED: CUL-1218 [Done] |
| CUL-1556 | Medium | Gate: clinical | none | — (no GA gate; vet-report honesty). Each item is report copy and owes a re-run of the cold read. | none | PROSE |
| CUL-1074 | High | GA gate | Design v2 — the whole day | D2-8 (brief 1 decides whether a lens lane precedes GA). | none | PROSE |
| CUL-1563 | Low | — | none | — (the widget leaving beta) | none | PROSE |
| CUL-1552 | Medium | — | Design v2 — the whole day | — (GA does not need it: the in-process copy covers the exam-room case where the app was used before the signal dropped). | none | PROSE |
| CUL-1247 | High | — | History v2 · the record you can read | nothing today. GA (HV-14) wants 1–4 settled, because the finish pass (HV-12, CUL-1169) builds whatever is chosen. | none | ID-NAMED: CUL-1169 [Done] |
| CUL-1541 | Medium | — | Engines v3: the accountable engine | — (natural pairing with PR-36, CUL-1419, which builds the call record in the same list). | none | ID-NAMED: CUL-1419 [Done] |
| CUL-1542 | Low | — | Engines v3: the accountable engine | CUL-1531. | none | ID-NAMED: CUL-1531 [Todo] |
| CUL-1544 | Medium | — | Engines v3: the accountable engine | turning `engines_v3_en8` on for any account. | none | PROSE |
| CUL-1539 | High | Gate: clinical | History v2 · the record you can read | History v2 GA (CUL-1175) and Design v2 GA (CUL-1071), the same as CUL-1530, if the PM rules it a gate. | none | ID-NAMED: CUL-1175 [Done], CUL-1071 [Done], CUL-1530 [Done] |
| CUL-1390 | High | — | Engines v3: the accountable engine | W1 and W2 block PR-18, the migration. W3 to W7 block PR-37, the client. The thresholds are on CUL-583, not here. | none | ID-NAMED: CUL-583 [Done] |
| CUL-1380 | High | — | Design v2 — the whole day | CUL-1071 (GA). ⚠ Not a GA gate (Out of beta triage, CUL-1520, 2026-10-03): ships after GA. | none | ID-NAMED: CUL-1071 [Done], CUL-1520 [Done] |
| CUL-1527 | High | — | Design v2 — the whole day | CUL-1071 (GA). ⚠ Not a GA gate (Out of beta triage, CUL-1520, 2026-10-03): ships after GA. | none | ID-NAMED: CUL-1071 [Done], CUL-1520 [Done] |
| CUL-1525 | High | — | Design v2 — the whole day | CUL-1071 (GA). ⚠ Not a GA gate (Out of beta triage, CUL-1520, 2026-10-03): ships after GA. | none | ID-NAMED: CUL-1071 [Done], CUL-1520 [Done] |
| CUL-1259 | Low | — | History v2 · the record you can read | — (before GA, HV-14, ideally) | none | PROSE |
| CUL-1484 | Low | — | none | — (the daily look leaving beta, at the latest) | none | PROSE |
| CUL-910 | Medium | — | Home v2 — the redesign | nothing. Both want deciding before GA (CUL-876). | none | ID-NAMED: CUL-876 [Done] |
| CUL-908 | Medium | — | Home v2 — the redesign | nothing. Worth ruling before GA (CUL-876) since this line is on Home every answered day. | none | ID-NAMED: CUL-876 [Done] |
| CUL-907 | High | — | Home v2 — the redesign | nothing hard — N-4b ships with the label frame. Worth ruling before GA (CUL-876), because this is the sentence the feature is for. | none | ID-NAMED: CUL-876 [Done] |
| CUL-888 | Medium | — | Home v2 — the redesign | nothing. N-4a, N-4b, N-5, N-6 all proceed regardless. | none | PROSE |
| CUL-891 | Urgent | — | Home v2 — the redesign | nothing in the client. **Gates:** the honest answer to "may the flag be turned on?". | none | PROSE |
| CUL-616 | Medium | Gate: device | Aug. 2026 Design Polish | — (nothing; the chain proceeds on CUL-606 regardless). Naturally rides the next dev-client rebuild or TestFlight cut rather than warranting its own. | CUL-1070, CUL-1069 | LINKED (text also names CUL-606 [Done]) |
| CUL-1317 | Low | — | Diet trial — its own screen | — (after TS-4 ships; pairs with B-592's overrun disclosure sentence). | none | PROSE |
| CUL-1439 | Medium | — | Engines v3: the accountable engine | EN-3/4's go-live check. Gated on PR-28 (CUL-1134) merging. | none | ID-NAMED: CUL-1134 [Done] |
| CUL-1118 | Medium | — | Engines v3: the accountable engine | the intake half of the per incident recalibration; detector ②'s future. | CUL-1136 | LINKED |
| CUL-1107 | Medium | — | none | mock round 2, the Tier-2 report spec edit, the adversarial pass on the spec, then BUILD-READY. | none | PROSE |
| CUL-1132 | Medium | — | Engines v3: the accountable engine | EN-6. **Privacy:** Trust & Safety read on the tool's handling of photos (service role, session-only output). | CUL-1137 | LINKED |
| CUL-796 | High | — | Home v1 — The Signal fold | nothing hard — PR 2 ships on the provisional calls; the doc edits land in the next fold session after the ruling. | none | PROSE |
| CUL-1407 | Medium | — | Engines v3: the accountable engine | Wave 4 going live. | none | PROSE |
| CUL-1095 | Low | — | none | — (the widget ships behind `widget_enabled`; not a GA gate for the "Out of beta" project). | none | PROSE |
| CUL-1088 | High | — | Vet visits — the appointment companion | VV-GA is a judgment call — flagged, not asserted. | none | PROSE |
| CUL-1089 | High | — | Vet visits — the appointment companion | VV-GA is a judgment call — flagged, not asserted. Pairs with the "Trial started" tag issue filed alongside it (same root: the visit cannot say what it did to a record). | none | PROSE |
| CUL-1083 | Medium | — | Vet visits — the appointment companion | — (found during CUL-951's build; nothing gates on it). | none | ID-NAMED: CUL-951 [Done] |
| CUL-1090 | High | — | Vet visits — the appointment companion | VV-GA is a judgment call — flagged, not asserted. | CUL-559 | LINKED |
| CUL-1093 | High | Gate: clinical | Vet visits — the appointment companion | possibly VV-GA (CUL-905), PM call. | CUL-559 | LINKED (text also names CUL-905 [Done]) |
| CUL-1436 | High | — | Engines v3: the accountable engine | Wave 4 going live. | none | PROSE |
| CUL-1437 | Medium | — | Engines v3: the accountable engine | PR-28b's device-claim adoption. | none | PROSE |
| CUL-139 | Medium | — | Signals v2 — the record, decomposed | Extends B-755 (CUL-13); PM D3 ruling | none | ID-NAMED: CUL-13 [Done] |
| CUL-367 | Medium | — | Legacy Backlog | Dr. Chen ratification (with P-1) | none | PROSE |
| CUL-1493 | High | — | Engines v3: the accountable engine | EN-11's GA if the PM rules CUL-1489 B′ (the amended line needs this arm to be computed). | CUL-1495 | LINKED (text also names CUL-1489 [Done]) |
| CUL-1495 | High | — | Engines v3: the accountable engine | EN-11's GA, beside CUL-1487. | none | ID-NAMED: CUL-1487 [Todo] |
| CUL-1494 | High | — | Engines v3: the accountable engine | EN-11's GA if the PM rules CUL-1489 B′. If EN-11 misses the vet ask on the moderate rise, A′ (a floor relative to the pet's own rate) becomes the gate. | CUL-1495 | LINKED (text also names CUL-1489 [Done]) |
| CUL-1441 | High | — | Engines v3: the accountable engine | EN-11's first flag-on run. | CUL-1495 | LINKED |
| CUL-1442 | High | — | Engines v3: the accountable engine | EN-11's first flag-on run. | CUL-1495 | LINKED |
| CUL-1487 | High | — | Engines v3: the accountable engine | EN-11's GA (CUL-1141). Flag off is unchanged, so nothing reaches owners until then. | none | ID-NAMED: CUL-1141 [Done] |
| CUL-1444 | Low | — | Engines v3: the accountable engine | PR-23 (EN-9 server) going live. | none | PROSE |
| CUL-1492 | Low | — | none | the 1.2.0 native cut first | none | PROSE |
| CUL-1486 | Medium | — | Engines v3: the accountable engine | EN-11's GA (if the PM rules A). | none | PROSE |
| CUL-1488 | Low | — | Engines v3: the accountable engine | — (withhold-only; worth fixing before EN-11's GA if cheap). | none | PROSE |
| CUL-769 | High | Gate: privacy | none | — (independent, but see #788) | none | PROSE |
| CUL-947 | Medium | Gate: design | Vet visits — the appointment companion | — . Good to fold into VV-6's finish pass if it is not worth its own session. | none | PROSE |
| CUL-1460 | High | — | App Store Launch | CUL-560 (submission). | CUL-560 | LINKED |
| CUL-1456 | Medium | Gate: privacy | none | — (not the 1.2.0 binary; server-side, can ship any time) | none | PROSE |
| CUL-926 | Medium | — | The workflow audit — the board, the queue, the ceremony | the weekly Routine. Depends on CUL-922 (the write boundary). Full context: `docs/workflow-retro-2026-09.md` §4 Q2, §5 step 5. | CUL-928 | LINKED (text also names CUL-922 [Done]) |
| CUL-925 | Medium | — | The workflow audit — the board, the queue, the ceremony | the programme's early-warning signal. Full context: `docs/workflow-retro-2026-09.md` §2 F4, §5 step 4. | none | PROSE |
| CUL-1454 | High | — | App Store Launch | CUL-560 (submission). Do it before App Review, so the reviewer's 5.1.1(v) deletion exercises the shipped design. | CUL-560 | LINKED |
| CUL-1451 | High | — | Engines v3: the accountable engine | — (does not block the `engines_v3_en10` flip unless the PM rules it in scope) | none | PROSE |
| CUL-1321 | Low | Gate: clinical | Engines v3: the accountable engine | — (after PR-04b and PR-10) | none | PROSE |
| CUL-1187 | Low | Gate: clinical | none | 1 blocks S1 (`vomited_up`), if that is ever greenlit. | none | PROSE |
| CUL-381 | Urgent | Gate: clinical | Legacy Backlog | Pairs with B-341; touches `IntakeChipRow` / `MealCompletionCard` | none | PROSE |
| CUL-749 | High | Gate: clinical | none | rides the `generate-report` redeploy (CUL-19); does not gate it. Related: CUL-746, CUL-747, CUL-748 (same review round). | none | ID-NAMED: CUL-19 [In Progress], CUL-746 [Done], CUL-747 [Todo], CUL-748 [Todo] |
| CUL-311 | Medium | — | Legacy Backlog | B-417 PR 5 (`lib/dietTrial.ts`) | none | PROSE |
| CUL-757 | High | Gate: clinical | none | rides the `generate-report` redeploy (CUL-19); does not gate it. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-56 | Urgent | — | Legacy Backlog | #502 / the R1 mock round | none | PROSE |
| CUL-55 | Urgent | Gate: design | Legacy Backlog | #502 | none | PROSE |
| CUL-59 | High | — | Legacy Backlog | B-529 (identity); pairs B-575 | none | PROSE |
| CUL-57 | Urgent | — | Legacy Backlog | The R1 clinical sitting; pairs B-572 | none | PROSE |
| CUL-54 | Urgent | — | App Store Launch | #502 / the R1 stand-down ruling | CUL-559 | LINKED |
| CUL-60 | Urgent | — | Legacy Backlog | The R1/B-494 clinical sitting; pairs B-572, B-575 | none | PROSE |
| CUL-1438 | High | — | Engines v3: the accountable engine | — (a safety-direction fix; adopt provisionally under E-6). | none | PROSE |
| CUL-1430 | High | Gate: clinical | Engines v3: the accountable engine | — (blocked by CUL-1002's deploy). | none | ID-NAMED: CUL-1002 [In Progress] |
| CUL-1429 | Medium | — | Engines v3: the accountable engine | none. It becomes relevant once EN-10's lines reach owners through Ask (the care state, CUL-1139 PR-23). | none | ID-NAMED: CUL-1139 [Done] |
| CUL-1426 | Low | — | Engines v3: the accountable engine | — (after PR-22a merges, to avoid a collision in `index.ts`). | none | PROSE |
| CUL-1425 | Medium | — | Engines v3: the accountable engine | EN-10 (CUL-1140) dose-level context. **Sequencing:** after PR-14d (CUL-1410) lands, since it owns `_shared/engineCorpus/`. | none | ID-NAMED: CUL-1140 [Done], CUL-1410 [Done] |
| CUL-1402 | Low | — | none | — (fix it before any DEFINER function that writes `event_ai_analysis` ships) | none | PROSE |
| CUL-1398 | High | — | none | needs to land before 2026-12-31. Also, the Clock skew job should stay green on `main`. | none | PROSE |
| CUL-836 | Medium | — | none | — (nothing waits on it; the backstop covers the practical gap). | none | PROSE |
| CUL-1053 | Medium | — | The workflow audit — the board, the queue, the ceremony | — (nothing waits on this, but every DISCOVERY session is exposed to it until it is settled) | none | PROSE |
| CUL-1385 | Low | — | Engines v3: the accountable engine | EN-1's replay telling two unbumped builds apart. Not urgent while the engine changes are behind version bumps. | none | PROSE |
| CUL-1378 | Low | — | Engines v3: the accountable engine | PR-11a's reliance on `ai_signals.engine_flags` beyond a same-account hint. | none | PROSE |
| CUL-1188 | Medium | — | none | — (found building CUL-1162; the fabric is shared by every hydrate step, so it is its own session, not HV-5's). | none | ID-NAMED: CUL-1162 [Done] |
| CUL-1376 | Medium | — | Design v2 — the whole day | — (the device pass, CUL-1070, may confirm or waive it). | none | ID-NAMED: CUL-1070 [Canceled] |
| CUL-1361 | Low | — | Diet trial — its own screen | — (after CUL-1336 merges). | none | ID-NAMED: CUL-1336 [Done] |
| CUL-359 | Low | — | Legacy Backlog | ~~Push-notification provider open question~~ → B-661 Part 1 (local scheduling covers it, D2 2026-08-02); composes with B-117 D3 (deferred reminders) + B-015 | none | PROSE |
| CUL-992 | High | — | none | — (the vet report is correct for courses the owner did not re-log after ending). | none | PROSE |
| CUL-143 | Medium | Gate: clinical | Legacy Backlog | Photoless add-photo UX; `components/event/*AnalysisSection.tsx` | none | PROSE |
| CUL-1356 | High | Gate: clinical | none | — (pre-existing; independent of CUL-1323's PRs, but it shares the helper) | none | ID-NAMED: CUL-1323 [Done] |
| CUL-417 | Low | Gate: clinical | Legacy Backlog | Step 10 / B-117 PR 9 follow-up | none | PROSE |
| CUL-1352 | Medium | — | Design v2 — the whole day | — (defence in depth; the client gate is live). | none | PROSE |
| CUL-633 | Medium | Gate: clinical | none | rides the `generate-report` redeploy (CUL-19). | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-1355 | High | Gate: clinical | Engines v3: the accountable engine | trust in every falling reflection for a medicated pet. Mandatory `adversarial-reviewer`; in Engines v3 terms this removes a reassurance, so it ships on its own proof. | none | PROSE |
| CUL-736 | Medium | Gate: privacy | none | — (nothing). CUL-696 shipped with this recorded as a known limit in the script's join block. | none | ID-NAMED: CUL-696 [Done] |
| CUL-157 | Medium | — | Legacy Backlog | B-417 v1 shipped | none | PROSE |
| CUL-1353 | Medium | Gate: clinical | none | trustworthy "off-diet" facts for any trial where a pill is given in a pocket or treat. Found by Sam's isolated read in the medication revamp discovery (CUL-1349), verified on `main` at 5b9bd69. | none | ID-NAMED: CUL-1349 [In Progress] |
| CUL-1351 | Medium | Gate: clinical | none | trustworthy Ask medication answers once CUL-1099 lands. Latent until then, because Ask's dose read fails in production (deployed `ask` v8, verified 2026-09-27). | none | ID-NAMED: CUL-1099 [Done] |
| CUL-1350 | Medium | — | none | nothing. Found during CUL-1349 (the medication audit), verified on `main` at 5b9bd69. | none | ID-NAMED: CUL-1349 [In Progress] |
| CUL-380 | Medium | Gate: design | Diet trial — its own screen | B-417 follow-up | none | PROSE |
| CUL-335 | Medium | Gate: design | Diet trial — its own screen | R1 mock round on the trial card (rides B-592's train) | none | PROSE |
| CUL-1340 | Low | — | Diet trial — its own screen | — (follow-up to TS-8; wants the device pass TS-DP first). | none | PROSE |
| CUL-119 | Low | Gate: deploy | Legacy Backlog | Per-incident contextual-flag reliability | none | PROSE |
| CUL-1110 | High | — | none | CUL-409. | none | ID-NAMED: CUL-409 [Todo] |
| CUL-131 | Low | Gate: clinical | Legacy Backlog | Per-incident contextual-flag reliability (vomit + stool) | none | PROSE |
| CUL-882 | Medium | Gate: privacy | none | — (no track). Relates to CUL-867 (where it was measured), 023 / 041 (the siblings). | none | ID-NAMED: CUL-867 [Done] |
| CUL-1316 | Low | — | Engines v3: the accountable engine | — (no live leak, measured 2026-09-26: the two listed subjects' meals and arrangements reference 63 foods, 0 of them owned by another account). | none | PROSE |
| CUL-1331 | Low | — | Engines v3: the accountable engine | — (the cap is a stated blind spot; its floor is `main`'s behaviour). | none | PROSE |
| CUL-1328 | Low | — | Vet report — the v15 cold-read remediation | — (rare; no known record holds such a pair) | none | PROSE |
| CUL-1326 | Low | Gate: clinical | none | — (cheap enough to ride the 1.2.0 cut if a session is free; not required by it) | none | PROSE |
| CUL-1322 | Medium | — | Vet report — the v15 cold-read remediation | — (each is a report-copy fix; none gates the App Store cut) | none | PROSE |
| CUL-1327 | Medium | — | Engines v3: the accountable engine | — (after PR-04b, same function) | none | PROSE |
| CUL-881 | Medium | Gate: privacy | none | — (no track; a guard-correctness item). The live advisor board is the backstop until it lands. | none | PROSE |
| CUL-1320 | Low | Gate: device | Design v2 — the whole day | — (dark behind `design_v2`, so no owner hears it yet). **Needs device:** batch into CUL-556. | none | ID-NAMED: CUL-556 [Todo] |
| CUL-820 | High | Gate: design | Aug. 2026 Design Polish | — (not blocking CUL-802; it makes an existing state more visible rather than creating it) | none | ID-NAMED: CUL-802 [Done] |
| CUL-1177 | Low | — | History v2 · the record you can read | — (HV-11, CUL-1168, owns the doorway contract; this fits beside it or after it.) | none | ID-NAMED: CUL-1168 [Done] |
| CUL-644 | High | Gate: deploy | none | the `generate-report` redeploy's clinic-readiness (CUL-19). | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-1014 | Low | — | Vet report — the v15 cold-read remediation | — (nothing waits on it). | none | PROSE |
| CUL-929 | High | Gate: deploy | Home v2 — the redesign | nothing. The report renders and is legible either way; this is a quality and a truthfulness problem (the orient line), not a defect. Any change rides the held CUL-19 redeploy like everything else rep… | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-1319 | Medium | Gate: device, Gate: clinical | Aug. 2026 Design Polish | — (independent). **Needs device:** batch into CUL-556. | none | ID-NAMED: CUL-556 [Todo] |
| CUL-409 | Medium | — | Legacy Backlog | Detail-screen recommendation staleness; consistency with B-340 | none | PROSE |
| CUL-544 | Low | Gate: clinical | none | — (independent cleanup; no build step gated on it). Natural companion to the CUL-543 stool-report parity work when someone next touches this pair. | none | ID-NAMED: CUL-543 [Todo] |
| CUL-552 | Urgent | — | App Store Launch | [mid-paragraph, not line start] the production build cut (M5). | CUL-1174, CUL-559 | LINKED |
| CUL-1109 | High | — | none | — (sequencing: pairs with CUL-1105) | CUL-1105 | LINKED |
| CUL-686 | High | — | Event Taxonomy Expansion | nothing today; it is a known coverage gap for the whole of W1's live window. | none | PROSE |
| CUL-1293 | Low | — | Diet trial — its own screen | CUL-1291's rulings (where the list lives). | none | ID-NAMED: CUL-1291 [Done] |
| CUL-1104 | High | — | none | folded into CUL-1101's build unless the PM wants it patched ahead of it. | none | ID-NAMED: CUL-1101 [In Review] |
| CUL-1294 | Medium | — | none | — (a clinical ruling; rides CUL-51's sitting) | none | ID-NAMED: CUL-51 [In Progress] |
| CUL-1258 | Low | — | History v2 · the record you can read | — (a design question; the door is honest today) | none | PROSE |
| CUL-639 | High | Gate: privacy | none | — . B-039 class (deletion completeness). Needs a Trust & Safety call on whether the object is deleted or merely orphaned. | none | PROSE |
| CUL-535 | Medium | — | none | the Step 9 vet-report track's `description`-wiring (do not wire `description` into the report until this clears). | none | PROSE |
| CUL-805 | Medium | Gate: clinical | none | any Home v2 direction that renders a Patterns count on Home (the Change Contract must bind Patterns content wherever it renders — see the Home v2 project's decision briefs). | none | PROSE |
| CUL-957 | Low | — | none | — nothing. Purely confirmatory. | none | PROSE |
| CUL-565 | Medium | — | none | — (workflow/process improvement; no build step gated on it) | none | PROSE |
| CUL-814 | Medium | — | none | — (CUL-801 shipped without it; this is the residual it stated rather than closed). | none | ID-NAMED: CUL-801 [Done] |
| CUL-541 | Medium | Gate: deploy | none | — (reliability; complements CUL-135 — the ledger records *intent*, this proves *reality*). | none | ID-NAMED: CUL-135 [Done] |
| CUL-1061 | Low | — | none | — (deferred; surfaced by the Design v2 round 4 reactions). | none | PROSE |
| CUL-566 | Low | — | none | — (report-quality; not gating). Rides the B-494 `generate-report` redeploy whenever picked up. | none | PROSE |
| CUL-538 | Low | Gate: deploy | none | — (none; a hardening nice-to-have, not gating any feature). | none | PROSE |
| CUL-860 | Medium | — | none | Vet report v2 (CUL-847) PR 2; rides CUL-19. | none | ID-NAMED: CUL-847 [In Review], CUL-19 [In Progress] |
| CUL-543 | Medium | — | none | rides the **B-494** `generate-report` **redeploy hold** either way — the report is deploy-frozen until the refusal safety lane ships, so this can't reach production before that regardless. | none | PROSE |
| CUL-573 | High | — | none | — . CUL-284 shipped without it; the note is live on both card-showing dose paths. | none | ID-NAMED: CUL-284 [Done] |
| CUL-569 | Medium | — | none | — (nothing; CUL-284 shipped without it). | none | ID-NAMED: CUL-284 [Done] |
| CUL-572 | High | Gate: clinical | none | — . Referenced from a comment in `app/(tabs)/profile.tsx:handleLogDose`. | none | PROSE |
| CUL-730 | Medium | Gate: clinical | none | — (nothing queued behind it). Worth doing before or with the next `generate-signal` behaviour change so it rides one deploy rather than minting its own. | none | PROSE |
| CUL-747 | High | Gate: clinical | none | rides the `generate-report` redeploy (CUL-19); does not gate it. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-748 | Medium | Gate: deploy | none | rides the `generate-report` redeploy (CUL-19); does not gate it. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-750 | High | Gate: deploy | none | rides the `generate-report` redeploy (CUL-19); does not gate it. Related: CUL-746, CUL-747, CUL-748, CUL-749 (same review round). | none | ID-NAMED: CUL-19 [In Progress], CUL-746 [Done], CUL-747 [Todo], CUL-748 [Todo], CUL-749 [Todo] |
| CUL-759 | High | Gate: deploy | none | rides the `generate-report` redeploy (CUL-19); does not gate it. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-763 | High | Gate: deploy | none | rides the `generate-report` redeploy (CUL-19); does not gate it. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-853 | Medium | Gate: deploy | none | Vet report v2 (CUL-847); rides CUL-19. | none | ID-NAMED: CUL-847 [In Review], CUL-19 [In Progress] |
| CUL-856 | Medium | Gate: deploy | none | Vet report v2 (CUL-847) D5; CUL-282. | none | ID-NAMED: CUL-847 [In Review], CUL-282 [Todo] |
| CUL-1185 | Low | — | none | — (moot once Design v2 is every account's Home) | none | PROSE |
| CUL-779 | Medium | Gate: deploy | Event Taxonomy Expansion | — (the composed card is at 318/320 characters, so any shared-source refactor that touches the card clause has to be net-neutral on length). | none | PROSE |
| CUL-848 | High | — | History v2 · the record you can read | the share link (B-253's rebuild): any publicly linkable render must exclude notes by construction or carry its own explicit notes decision, default off — the daily look's rule 4, which applies to thi… | CUL-1172 | LINKED |
| CUL-545 | Low | Gate: privacy | none | — (rides the CUL-215 client-first deploy of `delete-account`; no separate deploy). | none | ID-NAMED: CUL-215 [Done] |
| CUL-733 | Medium | Gate: privacy | none | — . Worth doing before the App Store cut on the same vet-report reasoning as CUL-691, but it is strictly narrower. | none | ID-NAMED: CUL-691 [Done] |
| CUL-880 | Medium | Gate: device | none | CUL-507 PR-0 (video as evidence) inherits the widened `nyx-event-attachments` values. | none | ID-NAMED: CUL-507 [Todo] |
| CUL-742 | Low | Gate: deploy | Vet report — the v15 cold-read remediation | — . Cheap; natural to pick up with any other `generate-report` render work so it rides one deploy (the function is under the CUL-19 hold). | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-1046 | Medium | — | Diet trial — change the window | vet report PR 6 (the public share link). Nothing before that. | none | PROSE |
| CUL-1052 | Medium | Gate: design | Diet trial — change the window | — (independent of the trial-window track's remaining PRs). | none | PROSE |
| CUL-1042 | Low | — | Diet trial — change the window | nothing. Best done alongside whichever trial-window PR next touches the docs, rather than as its own session. | none | PROSE |
| CUL-1287 | High | — | Design v2 — the whole day | CUL-1278 (hold and slide) start; the CUL-1279 (D4) ruling. | none | ID-NAMED: CUL-1278 [Todo], CUL-1279 [Todo] |
| CUL-514 | Medium | — | The Daily Recap | DR-7 (CUL-27); any TodayZone interaction pass | none | ID-NAMED: CUL-27 [Done] |
| CUL-781 | Low | — | Legacy Backlog | — (pure CI cost/clarity) | none | PROSE |
| CUL-1280 | Low | — | Design v2 — the whole day | — (after CUL-322 is on device) | none | ID-NAMED: CUL-322 [Done] |
| CUL-732 | Low | — | none | — (no current track depends on it) | none | PROSE |
| CUL-1023 | High | — | Vet report — the v15 cold-read remediation | — (latent; no shipped record is known to hold both) | none | PROSE |
| CUL-1263 | Medium | — | History v2 · the record you can read | — (independent of HV-13; the device pass can check it if it lands first) | none | PROSE |
| CUL-1260 | Low | — | History v2 · the record you can read | — (consider with HV-15) | none | PROSE |
| CUL-1251 | Medium | — | History v2 · the record you can read | — (the disagreement is pre-existing: v1 History's 7 days was now − 168 hours, a third definition) | none | PROSE |
| CUL-1248 | Low | — | History v2 · the record you can read | nothing. HV-12's copy pass (CUL-1169) is the natural moment. | none | ID-NAMED: CUL-1169 [Done] |
| CUL-1246 | Medium | — | History v2 · the record you can read | — (a scope addition: the PM greenlights before a session builds it). | none | PROSE |
| CUL-1241 | Low | — | none | nothing. HV-12's accessibility sweep (CUL-1169) is the natural moment. | none | ID-NAMED: CUL-1169 [Done] |
| CUL-1240 | Low | — | History v2 · the record you can read | nothing. Fold into HV-12's copy pass (CUL-1169). | none | ID-NAMED: CUL-1169 [Done] |
| CUL-1239 | Medium | — | History v2 · the record you can read | nothing. Worth landing before HV-13, the device pass. | none | PROSE |
| CUL-336 | High | Gate: clinical | Legacy Backlog | Step 9/10 tz-consistency | none | PROSE |
| CUL-489 | Low | Gate: privacy | Legacy Backlog | Pre-scale hardening; interim check rides B-271 | none | PROSE |
| CUL-303 | Medium | — | Legacy Backlog | Offline-first polish; any session-persistence follow-up | none | PROSE |
| CUL-586 | High | Gate: device | none | nothing; until it lands, a timezone regression can merge green. | none | PROSE |
| CUL-66 | Urgent | Gate: device | App Store Launch | First App Store submission / real-user recovery rollout | none | PROSE |
| CUL-1205 | Urgent | Gate: device, Gate: privacy | App Store Launch | real-user password recovery (CUL-66's device checks, App Store M2). | none | ID-NAMED: CUL-66 [Todo] |
| CUL-1199 | Medium | — | History v2 · the record you can read | the next build cut that carries #907. | none | PROSE |
| CUL-1152 | High | — | App Store Launch | — (the workflow's first real use). | none | PROSE |
| CUL-189 | Medium | Gate: clinical | Legacy Backlog | Detector ② baseline review (Fable §6.3); Biostatistician + Dr. Chen before any threshold, then PM | none | PROSE |
| CUL-374 | Medium | Gate: clinical | Legacy Backlog | B-494 / the refusal safety lane | none | PROSE |
| CUL-346 | Medium | Gate: clinical | Legacy Backlog | B-456 (allowed_from dating); any surface asserting the triggering feeding stays counted as off-diet | none | PROSE |
| CUL-100 | Low | — | Legacy Backlog | Diet-trial track; rotation-shelf trial-awareness | none | PROSE |
| CUL-384 | Low | Gate: design | Legacy Backlog | Foods-tab design pass | none | PROSE |
| CUL-772 | Medium | — | Signals v2 — the record, decomposed | — . Self-heals on the next successful regen. | none | PROSE |
| CUL-700 | Medium | — | none | — nothing. Hygiene on the mechanism that is supposed to prevent exactly the class of confusion it just failed to prevent. | none | PROSE |
| CUL-795 | High | — | Home v1 — The Signal fold | on-device QA of CUL-787 (the compare renders only after this). | none | ID-NAMED: CUL-787 [Done] |
| CUL-48 | High | — | Legacy Backlog | Every future large Edge-Function deploy | none | PROSE |
| CUL-398 | Low | Gate: clinical | Legacy Backlog | B-417 follow-up | none | PROSE |
| CUL-80 | Low | Gate: clinical | Signals v2 — the record, decomposed | Extends B-755 (CUL-14) | none | ID-NAMED: CUL-14 [Done] |
| CUL-1153 | Low | — | App Store Launch | — (hardening). | none | PROSE |
| CUL-208 | Medium | — | Legacy Backlog | Step 9 vet-report; per-incident AI | none | PROSE |
| CUL-1013 | Medium | Gate: deploy | Vet report — the v15 cold-read remediation | — (rides any `generate-report` deploy). | none | PROSE |
| CUL-510 | Low | — | The Daily Recap | Any new column added to an existing local SQLite table | none | PROSE |
| CUL-990 | Medium | Gate: design | none | — (no live track depends on it; worth doing while the v15 cold-read remediation is fresh, since that track is generating the evidence for which rules would have paid). | none | PROSE |
| CUL-408 | Low | Gate: privacy | Legacy Backlog | Before VF-3 puts real objects in the bucket | none | PROSE |
| CUL-835 | Low | — | none | — (nothing waits on it; both fixes are merged and tested). | none | PROSE |
| CUL-761 | Medium | — | none | — (nothing; it is a process defect, not a gate). Filed 2026-08-30 after the fifth instance; the 8-30 pre-pass session raised it in prose and deliberately filed nothing, which is why it recurred with … | none | PROSE |
| CUL-405 | Medium | Gate: clinical | Legacy Backlog | B-079 merged; needs B-047 live FP data | none | PROSE |
| CUL-392 | Low | Gate: clinical | Legacy Backlog | B-474 / PR 5 floor work | none | PROSE |
| CUL-389 | Low | Gate: design | Legacy Backlog | D8 (mid-trial removal UI) | none | PROSE |
| CUL-387 | Low | Gate: clinical | Legacy Backlog | B-417 follow-up | none | PROSE |
| CUL-385 | Medium | Gate: clinical | Legacy Backlog | B-474 mock round | none | PROSE |
| CUL-432 | Low | — | Legacy Backlog | B-349 revisit | none | PROSE |
| CUL-378 | Low | Gate: deploy | Legacy Backlog | `generate-report` redeploy | none | PROSE |
| CUL-370 | Low | Gate: deploy | Legacy Backlog | B-614, or any surface that can produce a null regimen denominator | none | PROSE |
| CUL-366 | Low | Gate: deploy | Legacy Backlog | `generate-report` redeploy (rides the round-2 / B-225 deploy) | none | PROSE |
| CUL-365 | Low | Gate: device | Legacy Backlog | B-693 PR 3 / on-device QA | none | PROSE |
| CUL-428 | Low | — | Legacy Backlog | Patterns AI summary polish | none | PROSE |
| CUL-388 | Low | — | Legacy Backlog | An Android build / an eligible Android account | none | PROSE |
| CUL-386 | Low | — | Legacy Backlog | [nil+note] — (only if a non-attestation write to an active arrangement is added) | none | PROSE |
| CUL-323 | Low | — | Legacy Backlog | B-284 N5b follow-up | none | PROSE |
| CUL-363 | Medium | Gate: clinical | Legacy Backlog | Next TestFlight cut; B-614 (Home med strip); any regimen backfill | none | PROSE |
| CUL-349 | Low | Gate: clinical | Legacy Backlog | Real dogfood data volume; composes with B-032/B-040/B-048/B-050 | none | PROSE |
| CUL-348 | Low | Gate: deploy | Legacy Backlog | B-618 PRs 1–3 | none | PROSE |
| CUL-461 | Medium | — | Legacy Backlog | Design session pending; composes with B-302 / B-158 / the Ask track | none | PROSE |
| CUL-883 | Low | Gate: design | Home v2 — the redesign | [nil+note] nothing. Do it with N-4b (CUL-873) if the today-list work is already in that file's neighbourhood, or drop it. | none | ID-NAMED: CUL-873 [Done] |
| CUL-347 | Low | Gate: clinical | Legacy Backlog | Step 9 / Step 10 confounder model | none | PROSE |
| CUL-343 | Low | Gate: clinical | Legacy Backlog | Only reachable once an unrecognised `role` value exists in the enum — i.e. when a role is added | none | PROSE |
| CUL-339 | Medium | Gate: design | Legacy Backlog | B-351 slice 6 or the next vet-report pass; needs a design round | none | PROSE |
| CUL-332 | Low | Gate: design | Legacy Backlog | Build together with B-437 / D4a — one provenance column, three consumers | none | PROSE |
| CUL-316 | Low | — | Legacy Backlog | Post-dogfood, if the PM notices a renamed food | none | PROSE |
| CUL-310 | Low | — | Legacy Backlog | B-394; B-140 | none | PROSE |
| CUL-304 | Low | — | Legacy Backlog | B-140 | none | PROSE |
| CUL-301 | Low | — | Legacy Backlog | B-251 Landing a11y polish | none | PROSE |
| CUL-314 | Low | Gate: deploy | Legacy Backlog | Step 9 polish | none | PROSE |
| CUL-288 | Low | — | Legacy Backlog | [nil+note] — (B-186 UX; PM call) | none | PROSE |
| CUL-307 | Low | Gate: deploy | Legacy Backlog | Step 9 polish | none | PROSE |
| CUL-797 | Medium | Gate: clinical | Home v1 — The Signal fold | flipping `INTAKE_DECLINE_FOLDS` (the ratification issue under CUL-785). | none | ID-NAMED: CUL-785 [Done] |
| CUL-794 | Medium | Gate: device | Home v1 — The Signal fold | the on-device QA of CUL-786 (the stand-down line on the PM's own record). | none | ID-NAMED: CUL-786 [Done] |
| CUL-300 | Low | Gate: clinical | Legacy Backlog | Step 10 evolution | none | PROSE |
| CUL-299 | Medium | Gate: design | Legacy Backlog | B-417 PR 4 (trial card v2) | none | PROSE |
| CUL-290 | Low | Gate: privacy | Legacy Backlog | T&S / B-039 deletion & retention | none | PROSE |
| CUL-289 | Low | Gate: deploy | Legacy Backlog | Medication-item deletion UI | none | PROSE |
| CUL-287 | Low | Gate: deploy | Legacy Backlog | Backdated regimen / dose relink editing | none | PROSE |
| CUL-283 | Medium | Gate: privacy | Legacy Backlog | Step 9 (before scale / the public link is exercised broadly) | none | PROSE |
| CUL-274 | Medium | Gate: deploy | Legacy Backlog | Ask answer-integrity; Patterns intake card | none | PROSE |
| CUL-273 | Low | Gate: design | Legacy Backlog | [nil+note] — (B-186 polish) | none | PROSE |
| CUL-264 | Low | Gate: deploy | Legacy Backlog | generate-signal detector ⑤; a schema PR | none | PROSE |
| CUL-259 | Low | Gate: deploy | Legacy Backlog | Ask answer integrity tail | none | PROSE |
| CUL-247 | Medium | Gate: clinical | Signals v2 — the record, decomposed | Gates B-753 PR 3/PR 4 (the payload's `timingReliable` value + the meaningful gate) | none | PROSE |
| CUL-275 | Low | — | Legacy Backlog | B-284 N5b follow-up | none | PROSE |
| CUL-246 | Medium | Gate: deploy | Legacy Backlog | Ask answer integrity (G5/AC-9) | none | PROSE |
| CUL-234 | Low | — | Legacy Backlog | Ask offline/ capped "still-useful" polish | none | PROSE |
| CUL-239 | Medium | Gate: deploy | Signals v2 — the record, decomposed | SR-4 (`generate-signal` worsening-sentence audit) | none | PROSE |
| CUL-237 | Medium | Gate: clinical | Legacy Backlog | weight-loss-flag spec (own PR, adversarial-mandatory) | none | PROSE |
| CUL-236 | Medium | Gate: deploy | Signals v2 — the record, decomposed | Extends B-721 (Signal receipts); PR 1 shipped #636; PR 2 renderer / PR 3 payload+detector / PR 5 copy remain | none | PROSE |
| CUL-232 | Low | Gate: privacy | Legacy Backlog | First real-user release / GDPR; composes with B-039 | none | PROSE |
| CUL-231 | Low | Gate: privacy | Legacy Backlog | [nil+note] — (pre-prod hardening; composes with B-002) | none | PROSE |
| CUL-230 | Low | Gate: device | Legacy Backlog | Pairs B-590; `components/ui/PhotoViewer.tsx` | none | PROSE |
| CUL-228 | Low | Gate: privacy | Legacy Backlog | Account-deletion hardening; multi-user (dormant at 1 account) | none | PROSE |
| CUL-218 | Low | Gate: clinical | Legacy Backlog | composes with B-080 diet-structure / B-070 staple-washout | none | PROSE |
| CUL-217 | Medium | Gate: design | Legacy Backlog | The next native build carrying PR 3's gate to TestFlight | none | PROSE |
| CUL-176 | Low | — | Legacy Backlog | Ask v1 dogfood learnings | none | PROSE |
| CUL-213 | Low | Gate: clinical | Legacy Backlog | B-049 (1:M matching) | none | PROSE |
| CUL-211 | Low | Gate: privacy | Legacy Backlog | Account-deletion hardening; multi-user (dormant at 1 account) | none | PROSE |
| CUL-205 | Medium | Gate: clinical | Signals v2 — the record, decomposed | Extends B-755 (CUL-13); Dr. Chen copy + spec §2 L2 amendment | none | ID-NAMED: CUL-13 [Done] |
| CUL-202 | Low | Gate: privacy | Legacy Backlog | Scale (not pre-launch — invisible at one account) | none | PROSE |
| CUL-702 | Low | Gate: device | Aug. 2026 Design Polish | any Android build. `—` while the shipping target is iOS only. | none | PROSE |
| CUL-214 | Low | — | Legacy Backlog | Pairs B-588; `components/vetfiles/VetDocumentMetaSheets.tsx` | none | PROSE |
| CUL-196 | Low | Gate: clinical | Legacy Backlog | `generate-signal` red-flag count parity with the vet report | none | PROSE |
| CUL-206 | Low | — | Legacy Backlog | Ask v1 dogfood learnings; B-374 | none | PROSE |
| CUL-204 | Low | — | Legacy Backlog | Track-3 monetization (the premium gate build) | none | PROSE |
| CUL-168 | Low | — | Legacy Backlog | Post-A5 Ask evolution | none | PROSE |
| CUL-166 | Low | — | Legacy Backlog | on-device judgment | none | PROSE |
| CUL-160 | Low | — | Legacy Backlog | Post-A5 Ask evolution | none | PROSE |
| CUL-186 | Medium | Gate: privacy | Legacy Backlog | B-280 PR 1 (shares its foundations) | none | PROSE |
| CUL-656 | High | Gate: clinical | none | all of it rides the `generate-report` redeploy (CUL-19). | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-178 | Low | Gate: clinical | Legacy Backlog | Step 10 correlation weighting | none | PROSE |
| CUL-177 | Low | Gate: privacy | Legacy Backlog | App Store submission hardening; multi-user | none | PROSE |
| CUL-634 | Low | Gate: deploy | none | all of it rides the `generate-report` redeploy (CUL-19). | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-164 | Low | Gate: design | Legacy Backlog | composes with B-023; multi-sample intake data from real users | none | PROSE |
| CUL-632 | Medium | Gate: deploy | none | rides the `generate-report` redeploy (CUL-19) like every other report-side change. | none | ID-NAMED: CUL-19 [In Progress] |
| CUL-163 | Low | Gate: device | Legacy Backlog | Post first submission; extends B-280 | none | PROSE |
| CUL-162 | Medium | Gate: clinical | Legacy Backlog | Pairs B-572, B-580; the R1/B-494 clinical sitting | none | PROSE |
| CUL-161 | Medium | Gate: device | App Store Launch | First App Store submission | none | PROSE |
| CUL-146 | Low | Gate: privacy | Legacy Backlog | Data-retention accuracy of "deleted with your account"; storage tidiness | none | PROSE |
| CUL-138 | Medium | Gate: device | Legacy Backlog | B-614 on-device QA; med-strip transition polish | none | PROSE |
| CUL-126 | Low | — | Legacy Backlog | First App Store submission (homes B-229 / B-230 / B-231 / B-270) | none | PROSE |
| CUL-132 | Medium | Gate: clinical | Legacy Backlog | The Dr. Chen stand-down ruling (R1) | none | PROSE |
| CUL-105 | Low | — | Legacy Backlog | [nil+note] — (revisit on real multi-dose-per-vehicle usage) | none | PROSE |
| CUL-597 | Medium | Gate: privacy | none | any PR that ships a `photo_paths` writer. | none | PROSE |
| CUL-125 | Low | Gate: clinical | Legacy Backlog | B-156 Phase C follow-up; composes with B-070/B-053 staple-washout copy | none | PROSE |
| CUL-124 | Low | Gate: clinical | Signals v2 — the record, decomposed | Extends B-755; gated on B-753/B-754 (per-episode times) + the SignalReceipts DotLane multi-row support | none | PROSE |
| CUL-120 | Medium | Gate: design | Legacy Backlog | B-251 onboarding polish / app-store first-impression | none | PROSE |
| CUL-592 | Medium | Gate: device | none | CUL-369 (B-331, RevenueCat + `entitlements`), and Track-3 generally. | none | ID-NAMED: CUL-369 [Todo] |
| CUL-588 | High | Gate: privacy | none | treating the Vet Files privacy posture as verified. The track is otherwise complete (VF-0 → VF-6 shipped). | none | PROSE |
| CUL-117 | Medium | Gate: deploy | Legacy Backlog | Food-library track close-out | none | PROSE |
| CUL-88 | Medium | — | Signals v2 — the record, decomposed | Does NOT block the `generate-signal` redeploy (no card/count/rank move); if strict report byte-identity is wanted, settle before the `generate-report` deploy (separately B-494-gated) | none | PROSE |
| CUL-116 | Medium | Gate: clinical | Signals v2 — the record, decomposed | Extends B-755 (Signals v2); needs a `generate-signal` detector field + the PR-10 redeploy | none | PROSE |
| CUL-114 | Low | Gate: design | Legacy Backlog | Composes with B-046 | none | PROSE |
| CUL-82 | Low | — | Legacy Backlog | Multi-pet v1 shipped (B-086); needs real usage signal | none | PROSE |
| CUL-112 | Low | Gate: clinical | Legacy Backlog | B-417 PR 7 (the itemised appendix) | none | PROSE |
| CUL-99 | Low | Gate: clinical | Legacy Backlog | B-156 Phase C; future per-incident "pill not delivered" affordance | none | PROSE |
| CUL-554 | Medium | Gate: device | App Store Launch | [mid-paragraph, not line start] the submission build should not ship without it. | none | PROSE |
| CUL-94 | Low | Gate: clinical | Legacy Backlog | [nil+note] — (revisit with the B-084 local-day family; needs B-085) | none | PROSE |
| CUL-93 | Medium | Gate: design | Legacy Backlog | B-186 weight surfaces | none | PROSE |
| CUL-512 | Low | Gate: design | The Daily Recap | Any day-lane / spine density polish; combo (B-156) surfaces | none | PROSE |
| CUL-78 | Low | Gate: clinical | Signals v2 — the record, decomposed | Extends B-755 (CUL-14) | none | ID-NAMED: CUL-14 [Done] |
| CUL-77 | Medium | Gate: deploy | Legacy Backlog | Step 9 photo UX polish (fast-follow of PR 7 / #278) | none | PROSE |
| CUL-502 | Medium | Gate: clinical | Legacy Backlog | B-140; clinical-guardrails | none | PROSE |
| CUL-495 | Medium | Gate: clinical | Legacy Backlog | Step 9 polish; independent of the B-351 track | none | PROSE |
| CUL-61 | High | Gate: clinical | Legacy Backlog | `generate-report` redeploy — worth landing with it | none | PROSE |
| CUL-491 | Low | Gate: clinical | Legacy Backlog | Free-fed meal-rating / shared-bowl (`is_shared`) work; needs EventRow to receive free-fed status | none | PROSE |
| CUL-49 | Urgent | Gate: clinical | Legacy Backlog | Step 9; read alongside B-479 | none | PROSE |
| CUL-485 | Medium | Gate: clinical | Legacy Backlog | B-417 PR 3 (start-a-trial modal) — the obvious place to confirm the trial protein | none | PROSE |
| CUL-34 | High | Gate: clinical | Legacy Backlog | Step 9 (queue-jumped); cross-incident layer ties to Step 10 | none | PROSE |
| CUL-484 | Medium | Gate: privacy | Legacy Backlog | B-494 redeploy; B-271 live runbook (mitigated) | none | PROSE |
| CUL-927 | Medium | — | The workflow audit — the board, the queue, the ceremony | build LAST. It is the only item touching `main` write access and it depends on the least-proven parts. Full context: `docs/workflow-retro-2026-09.md` §3, §5 step 7. | none | PROSE |
| CUL-483 | Medium | Gate: design | Legacy Backlog | The R1 mock round (with B-573/B-574/B-592) | none | PROSE |
| CUL-481 | Medium | Gate: clinical | Legacy Backlog | Pairs B-538; `generate-report` redeploy train | none | PROSE |
| CUL-479 | Medium | Gate: clinical | Legacy Backlog | B-494 redeploy; step 12 frame 3 (enriched form) | none | PROSE |
| CUL-478 | Low | Gate: clinical | Legacy Backlog | B-351 slice 5 (vet report) if the qualifier reads wrong there; otherwise post-dogfood | none | PROSE |
| CUL-476 | Low | Gate: design | Legacy Backlog | Designer (§5.8 colour-carve); B-444 | none | PROSE |
| CUL-465 | Low | Gate: device | App Store Launch | Post-launch (app live in ASC) | none | PROSE |
| CUL-456 | Low | Gate: design | Legacy Backlog | Food-picker polish | none | PROSE |
| CUL-451 | Low | Gate: clinical | Legacy Backlog | Ask multi-read compare polish | none | PROSE |
| CUL-439 | Medium | Gate: design | Legacy Backlog | B-007 FAB revamp | none | PROSE |
| CUL-369 | Medium | — | Legacy Backlog | D-M1–D-M6 ratification; after (never blocking) submission | none | PROSE |
| CUL-420 | Low | Gate: clinical | Legacy Backlog | Before VF-3 ships the Vet Files capture surface — that is the first path built specifically for documents | none | PROSE |
| CUL-492 | Medium | Gate: clinical | Legacy Backlog | B-351 (any surface rendering a completeness claim); shares B-437's fix shape | none | PROSE |
| CUL-486 | Medium | — | Legacy Backlog | Step 9 polish; (2) folds with B-442/B-489 | none | PROSE |
| CUL-1004 | High | — | Vet report — the v15 cold-read remediation | the `Set it up` half of CUL-861 / R-16; nothing else. | none | ID-NAMED: CUL-861 [Done] |
| CUL-584 | Medium | — | none | board hygiene only. | none | PROSE |
| CUL-594 | Medium | — | none | [nil+note] nothing hard; it is the last unruled line of the pre-launch security audit. | none | PROSE |
| CUL-297 | Medium | — | Legacy Backlog | Any "what happens after the trial" work | none | PROSE |
| CUL-460 | Low | — | Signals v2 — the record, decomposed | GA polish (S10) | none | PROSE |
| CUL-433 | Low | — | Legacy Backlog | Next substantive change to the edit screen's time block | none | PROSE |
| CUL-109 | Medium | — | Legacy Backlog | Demo-account build; B-005 archive; free-feeding build | none | PROSE |
| CUL-104 | Medium | — | Legacy Backlog | B-251 PR 11 (flip `SOCIAL_AUTH_ENABLED`) | none | PROSE |
| CUL-219 | Medium | — | App Store Launch | Store build (guide step 10); pairs with B-269 listing | none | PROSE |
| CUL-333 | Low | — | Legacy Backlog | B-084 family | none | PROSE |
| CUL-1021 | High | — | Vet report — the v15 cold-read remediation | the next `vet-report-cold-read` round. | none | PROSE |
| CUL-1018 | Medium | — | Vet report — the v15 cold-read remediation | a ruling on "is a withdrawn permit a change, or the trial ending?" | none | PROSE |
| CUL-1022 | Urgent | — | Vet report — the v15 cold-read remediation | the next `vet-report-cold-read` round; any claim the report makes about a hydrolyzed elimination being clean. | none | PROSE |
| CUL-1010 | High | — | Vet report — the v15 cold-read remediation | R-12 (CUL-995, page-one consistency) is the natural home; it rides the next `generate-report` deploy. | none | ID-NAMED: CUL-995 [Todo] |
| CUL-1011 | High | — | Vet report — the v15 cold-read remediation | the safety-band lane; rides a `generate-report` deploy. Related: CUL-994 Part 1 (the qualifiers beside the claim), which is the other half of the same line's silence. | none | ID-NAMED: CUL-994 [Todo] |
| CUL-450 | Low | — | Legacy Backlog | B-478 v1 shipped; PM scope ruling | none | PROSE |
| CUL-1007 | Low | — | Vet report — the v15 cold-read remediation | the first UX that writes `feeding_arrangements.is_shared`, and the bowl-disambiguation clause on the R-5 follow-up issue. | none | PROSE |
| CUL-434 | Low | — | Legacy Backlog | Per-account catalog tidiness; diet-trial data integrity | none | PROSE |
| CUL-397 | Medium | — | Legacy Backlog | Step 9 share-flow polish (fast-follow of Phase 2) | none | PROSE |
| CUL-282 | Medium | — | Legacy Backlog | B-273 web presence | none | PROSE |
| CUL-598 | High | — | none | the irreversible public-share path (PR 6 / CUL-424). | none | ID-NAMED: CUL-424 [Todo] |
| CUL-216 | Low | — | Legacy Backlog | Ask rundown fidelity | none | PROSE |
| CUL-435 | Low | — | Legacy Backlog | composes with B-044 + Step 9; first real-user value (post-MVP) | none | PROSE |
| CUL-467 | Low | — | Legacy Backlog | Ties to G4 (priority) | none | PROSE |
| CUL-253 | Low | — | The Daily Recap | B-661 Part 1 | none | PROSE |
| CUL-507 | Low | — | Signals v2 — the record, decomposed | taxonomy Q3 (`docs/nyx-event-taxonomy-requirements.md:644`); the `hasPhoto`-style media gate on the cough/sneeze leaves. | none | PROSE |
| CUL-877 | Medium | — | none | [nil+note] — (team tooling; useful before the App Store listing is finalized, CUL-173) | none | ID-NAMED: CUL-173 [In Progress] |
| CUL-194 | Medium | — | Legacy Backlog | Discovery OQ2 (PM ratification) | none | PROSE |
| CUL-684 | High | — | Event Taxonomy Expansion | the W2 build (the safety trio — `urine_strain`, `labored_breathing`, `respiratory_rate`). **Does not block W1** (cough/sneeze) or the round-3 mocks (CUL-665). | CUL-751, CUL-667 | LINKED (text also names CUL-665 [Done]) |
| CUL-740 | Medium | — | none | any public-materials use of a competitor-absence claim (marketing, listing copy, a landing page, a pitch). | none | PROSE |
| CUL-513 | Medium | — | The Daily Recap | DR-7 (CUL-27) copy/finish pass | none | ID-NAMED: CUL-27 [Done] |
| CUL-272 | Medium | — | Legacy Backlog | B-117 PR 9 (escalation) | none | PROSE |
| CUL-203 | Medium | — | Legacy Backlog | Dogfood observation post-slice-6 deploy | none | PROSE |
| CUL-145 | Low | — | Legacy Backlog | B-251 onboarding design ratification (with the §Onboarding doc revision) | none | PROSE |
| CUL-309 | Low | — | Legacy Backlog | [nil+note] — (PM decision; schema PR if greenlit) | none | PROSE |
| CUL-169 | Low | — | Legacy Backlog | B-614 follow-up; med-strip design pass | none | PROSE |
| CUL-308 | Low | — | Legacy Backlog | Post first submission; extends B-271 | none | PROSE |
| CUL-159 | Medium | — | The Daily Recap | PM ruling on the CUL-23 multi-pet decision brief | none | ID-NAMED: CUL-23 [Done] |
| CUL-306 | Low | — | Legacy Backlog | Step 9 public link (revisit post-MVP / when prioritized) | none | PROSE |
| CUL-296 | Low | — | Legacy Backlog | B-140 PR 1 derivation | none | PROSE |
| CUL-424 | Medium | — | Legacy Backlog | Step 9 (vet report) ships the share token | none | PROSE |
| CUL-414 | Low | — | Legacy Backlog | Doc accuracy (living ref) | none | PROSE |
| CUL-149 | Medium | — | Legacy Backlog | B-614 follow-up; any med-strip collapse-predicate change | none | PROSE |
| CUL-148 | Medium | — | Legacy Backlog | PM call | none | PROSE |
| CUL-280 | Medium | — | Legacy Backlog | B-117 dose-logging follow-up | none | PROSE |
| CUL-122 | Low | — | Legacy Backlog | PM ratify template-only-for-v1; needs the fact-bound guard + food-name sanitization | none | PROSE |
| CUL-269 | Low | — | Legacy Backlog | B-045 protein-level shipped + real data; ingredient-normalization pass | none | PROSE |
| CUL-129 | Medium | — | Legacy Backlog | dashboard-range gated on re-deciding spec §13 #2 | none | PROSE |
| CUL-128 | Medium | — | Legacy Backlog | Food-library track close-out | none | PROSE |
| CUL-401 | Low | — | Legacy Backlog | Per-account catalog offline story | none | PROSE |
| CUL-266 | Low | — | Legacy Backlog | B-117 PR 7+ | none | PROSE |
| CUL-262 | Medium | — | Legacy Backlog | Composes with B-014 / B-015 / B-033 / B-040; ties to the 2026-07-10 "are owner-configured confirmations nudges?" Open Question | none | PROSE |
| CUL-396 | Medium | — | Legacy Backlog | B-005 archive UX coherence; multi-format foods (prescription diets) | none | PROSE |
| CUL-390 | Low | — | Legacy Backlog | [nil+note] — (only if session-persistence bugs resurface under concurrent auth ops) | none | PROSE |
| CUL-255 | Medium | — | Legacy Backlog | B-045 ship; informs B-046; composes with B-016 | none | PROSE |
| CUL-113 | Medium | — | App Store Launch | First real-user release; B-002 | none | PROSE |
| CUL-108 | Low | — | Legacy Backlog | ~~Push-notification provider decision~~ → B-661 Part 1 (local scheduling covers it — no provider needed, D2 2026-08-02); after B-014 v1 | none | PROSE |
| CUL-249 | Low | — | Legacy Backlog | B-045 shipped + retention data (B-047) + a proven calibrated-copy contract | none | PROSE |
| CUL-500 | Medium | — | Legacy Backlog | B-625; FoodPicker ordering (`lib/db.ts`); trial-foods add flow | none | PROSE |
| CUL-243 | Low | — | Legacy Backlog | Any doses-course card copy polish; nyx-voice pass | none | PROSE |
| CUL-1613 | High | — | The workflow audit — the board, the queue, the ceremony | the D1 cap raise (with A1 and B). | none | PROSE |
| CUL-1522 | High | — | The workflow audit — the board, the queue, the ceremony | the D1 cap raise (with A2 and B). | none | PROSE |
| CUL-1432 | High | — | Engines v3: the accountable engine | CUL-1407 (turning `engines_v3_en3` on). | CUL-1407 | LINKED |
| CUL-1600 | High | — | Engines v3: the accountable engine | EN-9 going live (the `engines_v3_en9` row). | none | PROSE |
| CUL-1135 | High | — | Engines v3: the accountable engine | [mid-paragraph, not line start] EN-5. | CUL-1136 | LINKED |
| CUL-421 | Medium | — | Legacy Backlog | CI `--frozen` posture (B-390) | none | PROSE |
| CUL-319 | Medium | — | Legacy Backlog | `generate-report` redeploy | none | PROSE |
| CUL-179 | Medium | Gate: clinical | Legacy Backlog | Step 10 evolution; composes with ④/⑤ | none | PROSE |
| CUL-188 | High | Gate: device | App Store Launch | First App Store submission | CUL-173 | LINKED |
| CUL-1349 | High | — | none | the scope of a medication revamp track (a Linear project, if the PM greenlights one). | none | PROSE |
| CUL-51 | High | — | Legacy Backlog | TestFlight build cut (R1) | none | PROSE |
| CUL-969 | Urgent | — | App Store Launch | CUL-559 (the 1.2.0 cut) reads on this either way. | none | ID-NAMED: CUL-559 [Todo] |
| CUL-173 | Medium | Gate: device | App Store Launch | First App Store submission | none | PROSE |
| CUL-43 | High | Gate: device | App Store Launch | First real-user release | none | PROSE |
| CUL-847 | Medium | — | none | Step 9 polish direction; supersedes the framing of CUL-358 / CUL-480 if a direction is ruled. | none | ID-NAMED: CUL-358 [Duplicate], CUL-480 [Duplicate] |
| CUL-425 | High | — | Legacy Backlog | Enforcing the existing squash-merge convention | none | PROSE |
| CUL-974 | High | — | Vet report — the v15 cold-read remediation | [nil+note] nothing hard. Worth ruling before the store cut, since `other` is reachable by every account today. | none | PROSE |
| CUL-509 | Medium | — | Event Taxonomy Expansion | B-755's cough lane; B-745/B-746 adjacency | none | PROSE |
| CUL-30 | High | — | The Daily Recap | Build = CUL-20…27; the §5.5 slate reaction | none | ID-NAMED: CUL-20 [Done] |
| CUL-140 | Medium | — | Legacy Backlog | Build sessions (N1 first; N5 parallel); D8 on-device ground call at N4; D9 Tier-2 §3 sign-off at N7 | none | PROSE |
| CUL-967 | Low | — | Vet visits — the appointment companion | [nil+note] nothing hard; wants a ruling before VV-GA (CUL-905) so GA doesn't ship a page the PM already reads as redundant. | none | ID-NAMED: CUL-905 [Done] |
| CUL-1560 | High | GA gate, Gate: clinical | Out of beta — Noticed, Design v2, History v2, the trial screen | the daily look leaving beta (the same claim CUL-1483 closes). The vomit variant is not tied to the look. | CUL-559 | LINKED (text also names CUL-1483 [Done]) |
| CUL-244 | High | — | Legacy Backlog | B-117 PR 5 / PR 6 | none | PROSE |
| CUL-144 | Low | Gate: design | Legacy Backlog | B-014 intake data from real users; Home-vs-destination design pass | none | PROSE |
| CUL-50 | Urgent | — | Legacy Backlog | `generate-report` redeploy (with B-494) | none | PROSE |
| CUL-101 | Medium | Gate: clinical | Legacy Backlog | B-023 PR 4 can land first; needs per-window baselineRead copy + adversarial review | none | PROSE |
| CUL-65 | High | Gate: clinical | Legacy Backlog | B-704 PR 5 (report render) | none | PROSE |
| CUL-522 | Medium | — | Backlog → Linear: operationalize the cutover | cleanup is one-time; prevention depends on Issue [B]. | none | PROSE |
| CUL-906 | Low | — | Vet visits — the appointment companion | v2 (the summary over the transcript — own spec after the D2-class ruling). | none | PROSE |
| CUL-968 | Low | — | Vet visits — the appointment companion | [nil+note] nothing hard. (a) is cheap and worth doing before VV-GA (CUL-905); (b) is its own PR and can follow GA. | none | ID-NAMED: CUL-905 [Done] |
| CUL-932 | Low | — | Home v2 — the redesign | [nil+note] nothing. Worth doing **before** CUL-876 rather than after, since GA is the change that has to touch every one of these sites. | none | ID-NAMED: CUL-876 [Done] |
| CUL-222 | Low | — | Legacy Backlog | Multi-pet (shared-bowl attribution); composes with B-014/B-023/B-010/Step 9 | none | PROSE |
| CUL-411 | Medium | — | Legacy Backlog | B-117 PR 8 / PR 9 (need per-dose timestamps) | none | PROSE |
| CUL-141 | Medium | — | Legacy Backlog | composes with B-017; PR6 gated on Step 9 | none | PROSE |
| CUL-103 | Medium | — | Legacy Backlog | First App Store submission | none | PROSE |
| CUL-376 | Medium | — | Legacy Backlog | Track-2 cap states (B-329/B-001); Track-3 paywall; B-283 Settings screen | none | PROSE |
| CUL-353 | Medium | — | Legacy Backlog | composes with B-051/B-052/B-033/B-047 | none | PROSE |
| CUL-317 | Medium | — | Legacy Backlog | Rides the B-156 promotion decision; extends B-156 (combo); composes with B-176 (Today parity) / B-173 (ate-around-the-pill) | none | PROSE |
| CUL-496 | Low | — | Legacy Backlog | Designer + Dr. Chen; Sam device pass | none | PROSE |
| CUL-229 | Low | — | Legacy Backlog | Portion/serving-size capture; Step 10 correlation quality | none | PROSE |
| CUL-474 | Medium | — | Legacy Backlog | Before the trial card is demoed | none | PROSE |
| CUL-85 | Low | — | Legacy Backlog | First real-user release; extends B-041 + Step 9 | none | PROSE |
| CUL-360 | Low | — | Legacy Backlog | [nil+note] — (hardens B-054 Phase 3) | none | PROSE |
| CUL-468 | Medium | — | Legacy Backlog | AI cost bound at scale | none | PROSE |
| CUL-79 | Medium | — | Legacy Backlog | B-080 (#138) — its follow-up | none | PROSE |
| CUL-90 | Medium | — | Legacy Backlog | Freemium-gate decision | none | PROSE |
| CUL-221 | Low | — | Legacy Backlog | Apple Sign-In ship (hard requirement once it lands) | none | PROSE |
| CUL-345 | Low | — | Legacy Backlog | B-312; B-310 | none | PROSE |
| CUL-475 | Low | — | App Store Launch | Post-launch | none | PROSE |
| CUL-454 | Low | — | Legacy Backlog | B-478 VF-2 shipped + real usage data | none | PROSE |
| CUL-76 | Medium | — | Signals v2 — the record, decomposed | Extends B-755 (CUL-14) | none | ID-NAMED: CUL-14 [Done] |
| CUL-200 | Medium | — | App Store Launch | B-229 / B-230 / B-269; first App Store submission | none | PROSE |
| CUL-453 | Low | — | Legacy Backlog | ~~Push provider~~ → B-661 Part 1 (local, no provider needed — D2 2026-08-02); B-288 | none | PROSE |
| CUL-463 | Low | — | Legacy Backlog | Any future `supabase db push` / CLI-from-disk flow; B-506 | none | PROSE |
| CUL-341 | Low | — | Legacy Backlog | Food library / intake evolution; feeds the Step 9 free-fed feeding line + Step 10 | none | PROSE |
| CUL-459 | Low | — | Legacy Backlog | B-507; any future CLI-from-disk migration flow | none | PROSE |
| CUL-195 | Low | — | Legacy Backlog | B-023 (B-096 AI-summary re-enable) | none | PROSE |
| CUL-331 | Medium | — | Legacy Backlog | Food-library track close-out | none | PROSE |
| CUL-338 | Low | — | Legacy Backlog | B-310 follow-up | none | PROSE |
| CUL-455 | Low | — | Legacy Backlog | B-378 (type-filter half shipped #584); pips→calendar still needs a calendar route | none | PROSE |
| CUL-444 | Medium | — | Legacy Backlog | Before trial data is load-bearing at scale | none | PROSE |
| CUL-182 | Low | — | Legacy Backlog | Ask post-dogfood; B-047/B-016 | none | PROSE |
| CUL-181 | Medium | — | The Daily Recap | PM ratification of discovery OQ1 **RESOLVED 2026-08-02 — full carve-out ratified** (B-661 kickoff; ...). Now blocked only on B-661 Part 1 (inherits the scheduling primitive, primer, prefs table + bud… | none | PROSE |
| CUL-191 | Medium | — | Legacy Backlog | First real-user release | none | PROSE |
| CUL-442 | Medium | — | App Store Launch | First App Store submission (soft — new-account coverage already holds) | none | PROSE |
| CUL-315 | Low | — | Legacy Backlog | Post-vet-report; B-117 follow-on | none | PROSE |
| CUL-180 | Low | — | Legacy Backlog | A real free-open-beta need > the allowlist ceiling; not on the Phase-2 path | none | PROSE |
| CUL-47 | High | — | Legacy Backlog | Any external-facing use of the figure | none | PROSE |
| CUL-324 | Low | — | Legacy Backlog | Post-dogfood; or whenever the library is re-photographed | none | PROSE |
| CUL-585 | Medium | — | none | [nil+note] nothing hard — but every unratified line is a doc telling the next session something untrue. | none | PROSE |
| CUL-187 | Low | — | Legacy Backlog | Program scale (B-722); B-016/B-047; T&S pass | none | PROSE |
| CUL-32 | High | — | The Daily Recap | Rides the CUL-23 clinical-guardrails / Dr. Chen ruling on the lead refusal clause | none | ID-NAMED: CUL-23 [Done] |
| CUL-438 | Low | — | Legacy Backlog | T3-D paywall un-mock (matters more once the paywall is real) | none | PROSE |
| CUL-426 | Medium | — | Legacy Backlog | Any change to the log flow's time affordance; feeds the vet report's confidence column | none | PROSE |
| CUL-437 | Medium | — | Legacy Backlog | Audit §A3 decision; T&S / data-minimisation | none | PROSE |
| CUL-436 | Medium | — | Legacy Backlog | B-452 | none | PROSE |
| CUL-582 | High | — | none | [nil+note] nothing hard; the data stays wrong until it runs. | none | PROSE |
| CUL-362 | Medium | — | Legacy Backlog | B-417 follow-up | none | PROSE |

### Table 2: orphaned follow-ups (52)

Criteria: open, created on or after 2026-09-06, no project, and either High/Urgent priority or a `Gate:*` / `GA gate` label. Priority and project come from a fresh get_issue where the issue was a candidate; otherwise they come from list_issues metadata captured during the sweep.

| id | priority | labels | created | title |
|---|---|---|---|---|
| CUL-1594 | High | Area: Docs | 2026-10-05 | CUL-845 gate 2 has no consumer after Design v2 GA: check the month and the metr… |
| CUL-1579 | High | Gate: clinical, Area: Correctness | 2026-10-04 | Signal engine: a regimen's on-board span starts and ends at UTC midnight, not t… |
| CUL-1556 | Medium | Gate: clinical, Area: Correctness | 2026-10-04 | Vet report medication content: the cold read's pre-existing findings (Appendix … |
| CUL-1555 | Medium | Gate: clinical, Bug | 2026-10-04 | Incident floor: a seen and an estimated vomit at the same instant count as one … |
| CUL-1543 | Low | Gate: privacy | 2026-10-03 | Two small residues after the sign-out wipe: an Ask answer that lands late, and … |
| CUL-1491 | High | Waiting on PM, Area: CI/Build, Area: Privacy/RLS | 2026-10-02 | PM: GitHub hygiene, your half (repo visibility, five settings toggles, branch p… |
| CUL-1478 | Low | Gate: privacy, Area: Privacy/RLS | 2026-10-02 | Keychain: chunks orphaned by a failed prune are not cleared by removeItem, so f… |
| CUL-1477 | Low | Gate: privacy, Area: Privacy/RLS | 2026-10-02 | A write in flight at sign-out can land in the next account's memory (IntakeFirs… |
| CUL-1476 | Medium | Gate: device, Area: Privacy/RLS | 2026-10-02 | Device check: two places a health file may outlive sign-out (iOS's own copy of … |
| CUL-1472 | Low | Gate: device, Area: Correctness | 2026-10-02 | Log sheet: a door tapped while a just-closed sheet is still sliding out re-keys… |
| CUL-1471 | Low | Gate: design, Area: UX polish | 2026-10-02 | Vet visits: if another phone logs the visit while "How did it go?" is open and … |
| CUL-1470 | Medium | Gate: clinical, Area: Copy/Voice, Area: Correctness | 2026-10-02 | The cross-pet banner states a vomit count as exact where the pet's own card say… |
| CUL-1468 | High | Gate: design, Gate: clinical, Area: Correctness, Bug | 2026-10-02 | The Signal's "stale" state hides the shortening-gaps warning while the run is s… |
| CUL-1467 | High | Gate: privacy, Area: Offline sync, Area: Correctness, Bug | 2026-10-02 | A food confirmed on a bad connection can still be deleted 30 minutes later: the… |
| CUL-1456 | Medium | Gate: privacy, Area: Privacy/RLS | 2026-10-02 | Service-role photo downloads follow `..` / `%2e%2e` path segments, so the path-… |
| CUL-1398 | High | Bug | 2026-09-28 | EventRow.look tests are a calendar time bomb: CI goes red on every PR and main … |
| CUL-1357 | High | Gate: clinical, Waiting on PM, Bug | 2026-09-27 | Old app builds can still hide an unseen Worth a call: make the hide rule hold o… |
| CUL-1356 | High | Gate: clinical, Area: Correctness, Bug | 2026-09-27 | An Edit on a stale incident screen overwrites a newer read's blood finding and … |
| CUL-1354 | High | Area: Correctness, Bug | 2026-09-27 | Pet tab: after a pet switch with a failed read, the card keeps the previous pet… |
| CUL-1353 | Medium | Gate: clinical, Area: Correctness | 2026-09-27 | A dose given "In a pill pocket" or "In a treat" never counts as a diet-trial ex… |
| CUL-1351 | Medium | Gate: clinical, Area: Correctness, Bug | 2026-09-27 | Ask's own copy of dose→course attribution still compares end dates as raw text … |
| CUL-1349 | High | Area: UX polish, Waiting on PM | 2026-09-27 | Medication revamp — discovery: the team brainstorm, competitive research, mock … |
| CUL-1326 | Low | Gate: clinical | 2026-09-26 | Record screen: an escalation at `capped` or `read_disabled` shows the cap band … |
| CUL-1325 | Low | Gate: privacy, Area: Privacy/RLS | 2026-09-26 | Realtime delivers every account's event_ai_analysis DELETEs to any subscriber (… |
| CUL-1295 | Medium | Gate: privacy, Area: Offline sync, Bug | 2026-09-26 | A replaced photo that finishes uploading late can come back and displace its re… |
| CUL-1256 | Medium | Gate: privacy | 2026-09-25 | A photo read started before sign-out can still open its watch and call analyze-… |
| CUL-1204 | Medium | Gate: clinical, Area: Offline sync, Bug | 2026-09-25 | Offline, the record a "Worth a call" opens shows no read: the incident screen's… |
| CUL-1202 | High | Gate: privacy, Area: Offline sync, Area: Privacy/RLS, Bug | 2026-09-25 | A password reset for another account on a shared phone can pull the first accou… |
| CUL-1187 | Low | Area: UX polish, Gate: clinical | 2026-09-25 | The read-only adherence chip: decide how a value this build doesn't know shows … |
| CUL-1151 | Medium | Gate: device, Waiting on PM, Area: Test coverage | 2026-09-24 | On-device pass for the 2026-09-24 second Quick Win sweep (#900): Early access, … |
| CUL-1149 | Medium | Gate: design, Area: Correctness | 2026-09-24 | An EXIF-dated time outlives the photo that set it: after a replace, and after B… |
| CUL-1148 | Medium | Gate: design, Area: Copy/Voice | 2026-09-24 | The start-trial helper says "Most skin trials run N weeks" with N taken from th… |
| CUL-1114 | High | — | 2026-09-24 | Pushing from a git worktree makes the pre-push test suite rewrite the real repo… |
| CUL-1110 | High | Area: Correctness | 2026-09-23 | After any owner edit, a replaced vomit or stool photo's new findings never reac… |
| CUL-1109 | High | Area: Correctness | 2026-09-23 | The Signal's daily cap skips detection outright, so past 12 rebuilds a pet's sa… |
| CUL-1105 | High | Area: Correctness, Gate: clinical | 2026-09-23 | A photo red flag reaches Home only at the next Signal rebuild: nothing regenera… |
| CUL-1104 | High | Area: Correctness | 2026-09-23 | An owner who marks a flagged photo's blood or foreign material "Unclear" clears… |
| CUL-1098 | Low | Area: Offline sync, Gate: privacy | 2026-09-23 | Event detail photo-add marks the local attachment synced without checking the r… |
| CUL-1059 | High | Area: Privacy/RLS | 2026-09-17 | anon and authenticated both hold TRUNCATE on diet_trials (and likely every publ… |
| CUL-1057 | High | Gate: privacy, Area: Privacy/RLS | 2026-09-17 | Three trigger functions are invisible to lib/functionHardening.test.ts — its re… |
| CUL-1049 | High | Area: Docs | 2026-09-17 | Agent sessions CAN run the Edge Function suite — deno 2.9.4 installs from npm; … |
| CUL-992 | High | — | 2026-09-15 | Doses logged after a course's recorded end top its adherence up to "N of N" — t… |
| CUL-990 | Medium | Gate: design | 2026-09-15 | The vet report's copy is outside the owner-facing copy guard — `guards/ownerFac… |
| CUL-944 | High | Waiting on PM, Area: Offline sync | 2026-09-11 | A quarantined row is visible in the app but absent from the vet report — and th… |
| CUL-938 | High | Gate: clinical | 2026-09-11 | The Pet tab's medication card reads regimens from Supabase, not the local mirro… |
| CUL-934 | Urgent | Waiting on PM | 2026-09-11 | Run the executive product & strategy review (and answer the PM intake first) |
| CUL-933 | High | — | 2026-09-11 | Executive product & strategy review — the kickoff prompt + the state-of-play ev… |
| CUL-882 | Medium | Gate: privacy, Area: Privacy/RLS | 2026-09-10 | Child-row integrity triggers (023, 041, 064) validate the child at write time o… |
| CUL-881 | Medium | Gate: privacy, Area: Privacy/RLS | 2026-09-10 | `lib/functionHardening.test.ts` treats `REVOKE … FROM PUBLIC` as clearing anon/… |
| CUL-880 | Medium | Waiting on PM, Gate: device, Area: Privacy/RLS | 2026-09-10 | Five Storage buckets have no size or type limit — set `file_size_limit` + `allo… |
| CUL-856 | Medium | Gate: deploy, Area: Correctness | 2026-09-09 | Vet report QR encodes the consumer landing page and is captioned "getculprit.ap… |
| CUL-853 | Medium | Gate: deploy, Area: Correctness | 2026-09-09 | Vet report "Reading the trend" fires on two standing free-fed diets as "3 chang… |

### Notes and caveats

- Metadata gap for Table 2: list_issues metadata was not captured for 58 open issues, because the last unstarted page had no cursor. All but CUL-1616 and CUL-1613 have ids ≤ 649. Ids are monotonic with creation date: the last id created before the cutoff is CUL-830 (2026-09-05) and the first after it is CUL-835 (2026-09-08). Those ≤ 649 ids therefore predate the cutoff and cannot qualify. CUL-1616 and CUL-1613 were fetched; both have a project, so neither qualifies.
- At sweep time the started list returned 36 issues where 37 were counted earlier, so one issue changed state mid-sweep. Every id was still read.
- **Excluded nil-plus-note lines.** These were left out because the text explicitly says the issue gates nothing ("independent", "not a GA blocker", "nothing — code correct either way"), or only says what blocks *this* issue ("rides the deploy", "CUL-170 must land first"). They are listed for audit:
  CUL-1044 CUL-1406 CUL-697 excluded: Blocks text is nothing/— with separate bold field or bare punctuation
  CUL-739 excluded: '— (nothing).'
  CUL-1278 excluded: 'nothing. **Blocked by:** CUL-322.'
  excluded CUL-718: '— (nothing waits on this)'; CUL-658 '—'; CUL-591 'nothing.'
  excluded CUL-344 '—'
  excluded CUL-828 '—'; CUL-824 '— (does not block CUL-802; it is on that PR's manual QA script)' (explicit non-block)
  excluded CUL-793 '—'; CUL-766 '— . Surfaced by...' (dash + provenance note only)
  excluded CUL-752 '—'
  excluded (dash + explicit non-blocking note): CUL-727 '— (not a GA blocker...)'; CUL-725 '— (the PR is green... verification, not a gate)'; CUL-724 '— (independent)...'; CUL-713 '— (nothing waits on it...)'; CUL-707 '— (independent; no build committed...)'
  excluded CUL-693 '— .'; CUL-692 '— .'; CUL-640 '— .'; CUL-661 '— (nothing is gated on this...)'
  excluded CUL-637 '— . Gated on the on-device pass...' (dash + blocked-by note); CUL-627 '— (CUL-600 ships regardless...)'; CUL-620 '—'
  excluded CUL-602 '— . CUL-383 returns to the backlog...'; CUL-115 '— (confirm intended scope or build parity)'; CUL-595 'nothing.'
  excluded CUL-527 '— (quality follow-up; not a redeploy gate)...'
  excluded CUL-771 '— (independent)'; CUL-720 '— (independent; ...)'; CUL-823 '— (cosmetic; does not block CUL-802)'
  excluded CUL-1115/1102/1113/1112/1024/416 '—'; CUL-1114 '— (but any worktree-based session is exposed until fixed)'; CUL-1100 '— (rides the owed generate-report deploy)'; CUL-1012 '— (rides any generate-report deploy).'; CUL-593 'nothing.'
  excluded CUL-619/406 '—'; CUL-150 '— (additive to the shipped DR-1 spine)'; CUL-1020 '— (the next cold-read round will raise it again...)'; CUL-1030 'nothing. It is the residue of CUL-977...'
  RECLASSIFIED CUL-754 '— (CUL-170 must land first.)' to excluded (dash + blocked-by note). excluded CUL-1027/1032/1029/1028/1026/1017/1025 '—'; CUL-1015 '— (confirmatory; nothing waits on it)'; CUL-1009 '— (R-11's territory...)'; CUL-1031 'nothing; it rides the next generate-report deploy' (nil + blocked-by note)
  RECLASSIFIED CUL-589 'nothing shipping; this is ratification...' to excluded (explicit non-gate). excluded CUL-972 'nothing shipping, but every future session...'; CUL-1006/715/685/689/705 '— (nothing waits / independent / no build gated)'; CUL-760 'nothing — the code is correct either way'; CUL-955 'nothing. Cosmetic-but-live...'
  excluded CUL-911 'nothing — it renders correctly today'; CUL-895 '—'; CUL-842 '— (deferred).'; CUL-841 '— (deferred, not gated).'; CUL-843 '— (v1.x; waits on the look shipping and on CUL-552)' (blocked-by); CUL-889 'nothing. The door ships as-is...'
  excluded CUL-799/798 'nothing — ...'; CUL-791 'nothing hard — PR 2 can build on the code as shipped'; CUL-731 'nothing. File-and-watch'; CUL-792/764 '—'; CUL-765/767/743 '— .'; CUL-768/770/722/721 '— (independent...)'; CUL-762 '— (nothing)'; CUL-629 '— (CUL-600 shipped; CUL-601 ships regardless.)'
  excluded CUL-419 '—'
  excluded CUL-1101 'nothing yet. Build scope is decided by the rulings.'; CUL-1616 'nothing; B's D3 text points at it.'; CUL-1617 'nothing.'; CUL-1179 '—'
  excluded CUL-924 'nothing, but it is the only pair...'; CUL-1130 '[mid-line] **Blocks:** nothing.'; CUL-1455/660 '—'; CUL-887 '— .'
  excluded CUL-68/64 '—'; CUL-530 '— none.'
  excluded CUL-1517 '—'; CUL-931 'nothing. Rides the held CUL-19 redeploy either way.'; CUL-531 '— (none; polish...)'; CUL-938 '— (VV-4 is unaffected...)'
  excluded CUL-571/568/581 '— (composes with ...)'; CUL-940 '—'; CUL-930 'nothing. Ordinary-case behaviour is correct'; CUL-918 'nothing. Natural companions...'
  excluded CUL-941/38 '—'
  excluded CUL-917 'nothing. Worth doing whenever...'; CUL-751 '—'
  excluded CUL-649/648/647/646 '— . Surfaced by...'
  excluded CUL-623 '— .'
  excluded CUL-590 'nothing; the prompt is live either way.'; CUL-587 'nothing.'
  excluded CUL-40 '—'
  
- No page failed. All 475 candidates got a get_issue with relations.
