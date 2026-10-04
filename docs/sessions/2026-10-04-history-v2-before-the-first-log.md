# PR-39c: a visit or medicine start before the first log shows, and a visit-only record is not empty (CUL-1242)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: a test that something is absent needs a control that shows it present · check: pending

Dispatched session (Out of beta: Noticed, Design v2, History v2, the trial screen · PR-39c). Shipped via #1063.

## What shipped

On History v2 every window starts on the pet's first log (GAP-24). A vet visit, a course start or a bowl change dated before that day sat outside every window, so it never showed. A record holding only a visit read *Nothing logged yet*, which is the sentence v1's CUL-575 guard exists to stop. The PM ruled (b) (2026-10-03, CUL-1520 item 9), and this session built it.

- `preRecordItemsOf` (`lib/historyDays.ts`) reads the items over the whole record, keeping those strictly before its first day. With nothing logged, it keeps every item up to today. The fixture's Aug 1 regimen start, which no window holds, is exactly what it recovers.
- `preRecordLinesOf` (`lib/historyScreen.ts`) is the one gate. It needs every page loaded and a window that reaches the record's first day. It never applies under search. Under a course filter it starts at the course's first day, except when nothing is logged.
- The list (`HistoryList.tsx`) draws the items as footer lines below *{pet}'s record starts here*. They are never sections, so no count, coverage line, run or strip door sees them. Under a filter they follow the rows and the record-start line stays off. A record of only items shows them under *{pet}'s record starts with the first log*.
- Spec §3.12 v1.14 carries the ruled one-line edit. CUL-1238's separate row is not written. Mock §16 is published to the same URL (version 15).

## Decisions

- **Decided on the fly:** the first-log line reads *{pet}'s record starts with the first log*. It is new copy, in the record-start line's register: it says where the record will begin without calling the visit a log. Logged on CUL-1242 for the PM to reverse.
- **Decided on the fly:** under a filter, pre-record items follow the filter's rows without the record-start line. AC 11 keeps items under every filter, and the existing rule says "here" is false under a filter.
- **Left as built:** when a filter matches no row at all, the screen shows its quiet state, and pre-record items do not appear, the same as in-window items there (code-reviewer nit).

## Falsification

This is a display rule, not detection logic, so the adversarial line is N/A. `code-reviewer` found no bug and two nits, both applied (the docstring and the import order). Mutation proofs:

- The three positive list tests go red against the pre-fix screen.
- The absence test went green pre-fix as well, so it gained an All-time control.
- Deleting the gate's window check, or its search check, each turns it red.

## Residuals

- The pre-push hook ran typecheck and the full jest suite green on the code commit.

## Teach

### One thing — Reading a test: a test that something is absent needs a control (D3, L1)
Some tests check that a thing does not appear. Such a test passes whenever the thing is missing for any reason, including when the setup never made it appear at all. So the test first shows the thing appearing in a case where it should. Then its absence in the other case is the rule's doing, not the fixture's.

**Like:** testing that a smoke alarm stays quiet when you make toast. A quiet alarm proves nothing until you have seen it go off with real smoke.

**In today's work:** `components/historyV2/HistoryList.test.tsx`
`expect(screen.getByTestId(`history-pre-record-${dayAgo(10)}`)).toBeTruthy();`
"Under All time, the early visit's line is on screen." The lines after it check that a Today window and a search hide it. Before this line, the test passed on the code from before the fix, which drew no such line anywhere.

**Why it matters to you as PM:** "a test proves it never shows X" is only as strong as the proof that X shows when it should. Ask for the control when a never-rule matters.

**Check:** If the code were broken so that the early visit never shows under any window, what would this test say, with and without the control line?
