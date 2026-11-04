# Vet report Lane A: six sections no longer read quieter than the record

**Date:** 2026-11-04
**One thing:** G1 L1 — A commit is a saved snapshot, so a review covers the snapshot it read and no later one · check: pending

Shipped via #1436 (dispatched, Teach: yes). The PR body carries the Definition of Done and the QA script; this record carries the teach row and the short story.

## What changed

Six v1 vet report sections stated a fact more quietly than the same report held it. Each now says the louder fact, and every new fact the builder writes is an optional field, so a stored copy reads as unknown and Lane B's v2 sheet can read it:

- **CUL-2516** an off-diet trial's bottom line says the diet was not fed exclusively, with the days and the timing counts of the protein those feedings carried.
- **CUL-2510** the chronicity flag names how far back the record shows the same sign (Nyx: vomiting to Jul 27, coughing to Aug 2), and drops a "first logged" date the row itself contradicts.
- **CUL-2511** a weight change across the trial's start reaches the trial read and, as a loss, the bottom line (Nyx: about 15%, Jun 15 to Sep 16).
- **CUL-2512** a food first logged in the window is a change on the chart, its legend and "Reading the trend" (Nyx: two chicken foods from Oct 18).
- **CUL-2513** a permitted extra's contamination is measured against the trial, not its own front.
- **CUL-2509** medication rows carry their provenance; a dose given in food with no meal to name reaches the diet history; an ad-hoc drug counts its days dosed in the earlier trial days.

## What broke along the way

- The real-record run listed one chicken food twice (a bowl component and a plain meal were keyed two ways). Fixed and proven by mutation.
- The first push was blocked by the harness's own pin: `export.sql` gained a column, and the pin moves only after the `rls-privacy-reviewer` reads it (HOLDS).
- Adversarial pass 1 failed six QUIET findings; pass 2 caught one QUIET break that pass 1's own fix introduced (a sentence kept for a bookkeeping gap had dropped the timing counts). All fixed at `462d7d8`; the two-pass cap is reached, and every residual left is LOUD (CUL-2526).
- The cold read found a pre-existing QUIET gap on main, filed as CUL-2525 (page 1 no longer names doses given in food on Nyx's current record).

## Teach

### One thing — a commit is a saved snapshot (G1, L1)
Every time the work is saved to git, git keeps a full picture of the files at that moment, gives it a short fingerprint, and adds a one-line note saying what changed. Those pictures line up into a chain, and the chain is the project's history. A review, a test run or a check reads one picture, the one it was pointed at, and says nothing about pictures taken after it.

**Like:** a photo of a whiteboard. If someone signs the photo as "checked", the signature covers what the photo shows. Anything written on the board afterwards needs a new photo and a new signature.

**In today's work:** `git log --oneline`
```
462d7d8 Vet report: adversarial pass 2 on the six louder facts
```
`462d7d8` is the fingerprint of the picture; the words after it are the note. The second adversarial review read `b849724`, the picture before this one, found a break, and this commit fixed it. So that review's verdict covers `b849724`, not `462d7d8`. That is why the PR's Definition of Done names the commit beside the verdict.

**Why it matters to you as PM:** a green check or a reviewer's pass is only as current as the commit it names; when a session pushes after the review, ask which commit the verdict read.

**Check:** CI turned green on `d3b14b3`, and then the session pushed `b7192f6`. Before merging, does that green still tell you `b7192f6` passes its tests? Why or why not?
