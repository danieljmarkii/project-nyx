# Sheet B sitting: 38 clinical rulings and D6

**Date:** 2026-10-23
**One thing:** G1 L1 — A commit is a saved snapshot: "checked at 5fb9cd3a" was true of that snapshot, and 127 commits later seven of 38 rows had moved · check: pending

Attended PM sitting for the second clinical ruling sheet (CUL-1795), run as its own session per the PM's
D2 ruling on CUL-1962. Shipped via #1313 (docs only: the sheet's § 7 and this record).

## What happened

**Claimed and oriented.** I claimed the issue, read the sheet in full and gave the PM the phone page.

**Re-verified before relaying.** The sheet had been checked against `5fb9cd3a` on 2026-10-10, and 127 commits had
landed since. An isolated agent re-read every row against `main` at b51f5cc, and I spot-checked each row it called
changed. 31 rows held, many with line drift only. Seven had moved:
* **Q14** was built as A (#1242), then widened by the PM's CUL-2037 ruling (#1265).
* **Q12** was built (#1230).
* **Q4 W3** now contradicts the report's shipped `weight_loss` safety-band row (#1258).
* **Q2, Q3 and Q9** are affected by en9, en8 and en3 being seeded for the PM's account (migrations 101 and 102).
  Q9 also gained a possible newer installed build.
* **Q6** now has 22 queues, and a refused row already reaches the Signal and Ask.

All seven were relayed before the PM ruled.

**D6.** CUL-1725's question was whether an eaten bowl inside the 30-minute band before a refusal should exclude the
I5 episode. It came with no recommendation, so the Dr. Chen and Data Scientist lenses wrote one: A, keep counting
and pin it with a test. One isolated `adversarial-reviewer` pass held it. That pass:
* corrected two facts: the harness file's path and which waves it lists; and that I5 has fixture tests, just no
  rate line;
* relabelled C as "adds information with a softening risk";
* surfaced two findings, filed as CUL-2165 (I5's rank sits above firmer cards) and CUL-2166 (a picked second bowl
  never counts).

The brief was posted on CUL-1795.

**The rulings.** The PM: "I'll defer to your recommendations on all as long as the team agrees." A blanket defer
cannot cover the rows E-6 needs named or the persona conflicts, so those were put as four questions. The answers:
* all seven named rows: sign off Q9; explicit agree Q7, Q13.5, Q16.2, Q24, Q26, Q30;
* Q18 B (Jordan);
* Q19 A (keep it off);
* Q22 ordering a (span first);
* Q38 A (keep 2.5).

W3 was held for a re-brief rather than ruled on a premise the code no longer matches. Q12 and Q14 were ratified as
shipped. D6 was ruled A.

## Written

* The sheet's § 7: the rulings table, the re-verification note, § 7.2 (D6) and § 7.3 (what stays open).
* One ruling comment on each of the 38 row issues and on CUL-1725. The Q33 issue's stale `GA gate` label came off.
* `Waiting on PM` removed from CUL-1795.
* Filed: CUL-2165 and CUL-2166 (Backlog, from the D6 pass), and CUL-2173 (Todo, Engines v3: the test that pins D6,
  since its parent issue is Done).

## Left open

* **Q4 W3:** a re-brief against #1258 before PR-37's report half.
* **Q34:** the drafted critical-drug list comes back for an agree.
* **Q9:** the PM's EAS check of the installed build.
* **Every "adopted provisionally" row** stays live under E-6 until a measured row says otherwise.
