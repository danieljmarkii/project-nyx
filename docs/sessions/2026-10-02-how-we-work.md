# How we work: the operating model page and its generic template

**Date:** 2026-10-02
**One thing:** G2 L1 — A branch is a movable label · check: pending
**One thing (re-ask):** G1 L1 — A commit is a saved snapshot · check: pending

The PM asked for one page, or one diagram, of how this project runs: the workflows, skills, cadences and ways of working, partly so the engine can be ported to another way of working. Then, answering three questions: the reader is the PM; yes to a generic version; yes to committing both. Shipped via #1001 (CUL-1455).

## What shipped

- `docs/how-we-work.html`, published as [The Culprit Operating Model](https://claude.ai/artifact/NA5jBZKbkC1egBsvTZyjxK). Written to the PM as "you": your week and where the system waits on you (with the gauges measured today), one session as an eight station schematic with five handoffs and four stores, one track from research to GA, the four rung enforcement ladder with the `CLAUDE.md` byte ratchet as its worked example, who decides what, where state lives, the clocks, how the PM asked to be briefed (each rule dated), and a table of where `operating-kit/` has drifted from this repo.
- `docs/how-we-work-template.html`, published as [The Operating Kit](https://claude.ai/artifact/41Qscq43pii1umUVqLAm1D). The generic version is the visual map of `operating-kit/`: the same two diagrams with every label tied to the kit file that installs it, the kit's twelve laws, a "what goes wrong" panel, and a twelve step install order starting from `BOOTSTRAP.md` §0.
- `scripts/how-we-work/`: `build.mjs` and one spec per page. One layout renders both, so the diagrams cannot drift apart. A label longer than its SVG slot throws at build time. A rebuild of the committed specs produces no diff.

## How it was made

Draft 1 was written from a read of `CLAUDE.md`, `docs/personas.md`, `.claude/`, `guards/`, `.github/workflows/` and the September retro, and published for the PM. Then a nine agent workflow ran: four isolated fact-checkers, one per page region; a completeness critic; a PM-as-reader pass; and two independent generic drafts (tool agnostic, Claude Code native) judged into one.

- **103 claims checked, 49 corrected** (47 imprecise, 2 wrong). The two wrong ones: the queue paragraph said the ruling replaced the label with a workflow state, the opposite of the PM's 2 Oct ruling 1a; and the lesson path said the byte-ratchet story lived in `engineering-lessons.md` (it lives in the retro and the guard's header). Representative imprecisions: the merge was drawn at Ship but happens after the wrap; "one issue" per session is false (a PR may finish several); the retro is ruled every ~10 sessions but nothing fires it (146 sessions since the last); "new surfaces ship dark" holds for most tracks, not the Signal fold or Design Polish; the timezone jest leg is advisory until CUL-586.
- **The miss the critic caught:** `operating-kit/` (#976, 29 Sep) already exists. Draft 1 rebuilt an eight item port kit from scratch. The Culprit page now points at the kit instead, and the generic page became the kit's map.
- **Main moved mid-session:** #997 (groomer prunes), #998 (the learning loop) and #995 merged while the review ran. The branch was reset to the new `main` before any commit, and every count was redone on it (7 commands, 6 subagents, 5 skills, 522 records).

## Decisions

- The Culprit page speaks to the PM; the stats row became today's gauges (156 waiting, 49 of 52 PRs draft, 88 merged in 7 days, 1.3 h median to merge, 146 sessions since the retro, 371 B of `CLAUDE.md` headroom) instead of lifetime totals.
- Committed although not read-path (CLAUDE.md § Documentation Update Protocol): the PM asked for it, and the pages describe the process the repo encodes.

## Open, for the PM

- **The kit's queue model.** `operating-kit/` teaches `Needs PM` as a state (BOOTSTRAP §4); this repo kept the label on 2 Oct. The groomer-prunes record already noted the kit was left alone and pointed at CUL-1366. Both pages show the difference as "your call". Noted on CUL-1455, not filed as a new issue.
- **Nothing keeps the kit in sync.** Its README asks sessions to copy lessons across, which is a prose rule. It has drifted both ways (the drift table on `docs/how-we-work.html`). No fix proposed here.

## Residuals

- The gauges and counts are dated 2 Oct and go stale. Rebuild from the specs when they matter; nothing refreshes them.
- The workflow's generic drafts reached into `operating-kit/` read-only; nothing in the kit was changed.
