# Engines v3 mock round 1: the proposed Home redrawn the way the rules would render it

**Date:** 2026-09-26 · **Issue:** CUL-1288 · **Mode:** DISCOVERY · **Branch:** `claude/jolly-goldberg-o1ursv` · **Artifact:** `docs/culprit-engines-v3-mockups.html`, published at https://claude.ai/artifact/XrAawavFSUgbBKdWdxFsdY · **Shipped via #931** (docs only)

**PM prompt:** "Would we benefit from a design / mockup round ahead of building this project?" I recommended a targeted round, not a whole-project one, because Phases 0 and 1 have nothing an owner sees. The PM said "yes, file round 1 and run it."

## Why this round, and why now

The design critique (CUL-1268, `docs/engines-v3-critique-2026-09.md`) found that the strategy page's proposed Sep 23 Home can't be built as drawn:
- "Seen by your vet Sep 16" rests on a record nothing stores, and AC 10 bars the engine from reading visits.
- It drew buttons on the Home Design v2 is replacing.
- It dropped the shipped cough and vomiting disclosure.
- It anchored a weight card on a June value no table holds.

The critique asked for three things before D3 is ruled: a redraw of that frame the way the rules would render it, TD-4 drawn both ways, and E-3 drawn both ways. Its gate for EN-9's mocks was CUL-1270's Home round. That round was ruled earlier today (D1 B, D2 a) and is in build in #927. So these frames draw the real Design v2 Home.

## What the page draws

A new current-proposal page. Round 2 republishes to the same URL.
- **§01, Nyx's Sep 23 evening three ways.**
  - Today's Design v2 Home with CUL-1270's rows, at the replay's Sep 23 counts.
  - Engines v3 on its first day, before any answer. This is the frame the strategy page skipped. The concerns still ask, because at GA every concern starts raised. The stored photo read keeps its words. Weight is the one new row, tagged with its dependencies.
  - The same evening after the owner answers about Sep 16: watched rows under the raised ones, each acknowledgement stated as "you said", the coughing row giving the course start and a count with no claim about the drug.
- **§02, TD-4 both ways:** J, chips on the Home row, beside D, answers on the finding's screen. Then the Home row after "I've called" and after "Not yet", which is the same under either option.
- **§03, E-2:**
  - The acknowledgement source for visits logged from now on: a "What Home was raising" section in "How did it go?".
  - For Sep 16: one question a day on the finding's screen, which also carries the cough and vomiting clause.
  - The snapshot variant in an option box, with its dissent.
- **§04, E-3 both ways at week 8 with no recheck:** V, the vet-keyed question, beside N, no clock with a stale-weight line. Then two frames both sides agree on: a booked recheck deferring to the appointment strip, and the concern coming back on a tested change.
- **§05, the Sep 4 read:** the stored read with a dated correction beside the struck clause (R-3), and a placeholder for a vomit like Sep 4's logged after the change ("Keep an eye out", a two-sentence watch-for list). The placeholder is tagged round 2.
- **§06:** the three briefs and what round 2 draws.

A ledger at the top maps each critique finding to what moved on the page. Every row that depends on something unruled or unbuilt carries a "needs X" tag.

## Calls made on the page (flag in review)

- **Watched rows stay in the safety class,** with a quieter rail and a "Watching" tag, and carry no red ask when the source is an owner's answer after a visit. After a bare tap ("I've called") the ask survives verbatim, per R-2. The final register is a round 2 item.
- **The cough and vomiting clause lives on each finding's screen,** following CUL-1270's ruling that cross-mentions move to the screen. The critique's rule that the disclosure is never dropped holds there.
- **The weight row speaks pounds and makes no percentage claim** (S3). It is tagged as needing June's reading re-entered, D7's cutoffs and EN-8.
- **The strategy page stated Sep 23 as a Tuesday.** It was a Wednesday. The mock uses Wednesday.

## Linear

- Filed CUL-1288 (DISCOVERY, project Engines v3), claimed, related to CUL-1146, CUL-1268, CUL-1139 and CUL-1270.
- The briefs for E-2, E-3 and TD-4 are posted on CUL-1288, with a pointer comment on CUL-1146.
- The mock is linked as a project resource.

## Next

The PM reacts to round 1 and rules E-2, E-3 and TD-4 on CUL-1146. Round 2 then draws EN-9's care states from day 30 of a GI trial and EN-3's tiers on every surface, republished to the same URL.

## Round 2, the same session (the PM's reactions)

The PM reacted to round 1:
- **TD-4:** "I like this being one tap away. That way we keep 'home' clean and less text heavy." This is a ruling, D.
- **Notes:** "What happens after selecting 'I called'… should we allow a pet owner to add notes? If so, where should those notes live?"
- **E-3:** "If we think we can nail this experience, let's do it. Otherwise, let's make this a secondary priority."
- **Connectivity:** "Let's ensure that there's tight feature connectivity between this revamped signal engine and the vet visit feature."

Round 2 republished to the same URL as one proposal. J left the page; round 1 stays in git at e6fb38f.
- **§02:** the answer on the finding's screen. After "I've called" the screen confirms, offers an optional note (written after the save, never read by a model) and Undo. Home gains one dated line.
- **§03 (new), the Signal and vet visits as one loop.** A diagram marks which links are new and which ship today. It draws the AC 10 line: doors go down, only owner answers and dates come up. Seven frames:
  - the finding's "Book a visit" door into the shipped booking form;
  - Worth raising rows tickable "At the vet" (a tick records an answer, so it stays option A);
  - "How did it go?" pre-filled from the ticks, with the recheck row giving the watched row its date;
  - the one question for a past visit;
  - the "What did the vet say?" follow-up, whose answers open the booking or medication form (amends EN-14's answer set; "Nothing needed" dropped as a reassurance about the pet);
  - the pet's Vet visits list holding the call and its note.
  - The snapshot variant stays in an option box.
- **§04, E-3 restated:** the recheck-keyed part ships with EN-9. The eight-week fallback becomes a secondary box and a Low issue, CUL-1290, blocked by EN-1 and EN-9.
- **§06:** TD-4 recorded as ruled. Four briefs: E-2 (confirm A restated), E-3 as restated (confirm), N-1 (where a call's note lives; recommend A, a small call record in Vet visits), and AC 10 (a better-than-the-rule brief; recommend amending so the engine's shell reads owner answers and appointment dates, with no visit in any count).

**Linear:**
- CUL-1146 records the TD-4 ruling and the four open calls.
- Comments on CUL-1288, CUL-1144 (the note, the answer set) and CUL-1139 (what EN-9 inherits).
- Filed CUL-1290.
- The project description gains the connectivity guardrail.

## Rulings on round 2 (the same session)

The PM on round 2: "Loving the signal section on home. It feels FAR less wordy." He ruled **E-2 A restated**, **E-3 as restated** and **N-1 A** ("love that idea of storing these notes in the vet visit feature"). AC 10 was not addressed and stays open. The page's pills now say ruled, and it's republished at the same URL.

**Reconciliation:** EN-9 (CUL-1139) and EN-10 (CUL-1140) had been closed at 15:49Z. PR #924 (CUL-1271) mentioned both, got linked to both, and closed both when it merged, with nothing built. Both are reopened to Backlog with a comment. This is the attachment-closes-on-merge hazard CLAUDE.md already documents.

**Build readiness, as answered to the PM:**
- Ready now, needing no ruling: CUL-1277 (the pre-1.2.0 unknown-verdict fallback, time-boxed by the cut), CUL-1203 (the analysis-row capture, before any EN writer touches `event_ai_analysis`), CUL-534, CUL-1276, and CUL-1272 to CUL-1275.
- Phase 0 (EN-F, then EN-0) is one ruling away: E-1.
- EN-9 needs AC 10, round 3 of the mock and a spec.
