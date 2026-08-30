# Event taxonomy §9a v1.6 · seam 1 — the F-C durable-card architecture (CUL-684)

**Date:** 2026-08-30

Shipped via **#TBD** (draft). Mode: BUILD. Branch `claude/cul-684-seam-1-f-c-idrcxt`.

## What this session was

The first execution session of the **v1.6 seam pass** — the shape v1.5's scope lesson
prescribed after five straight adversarial FAILs: rulings first, then **one seam per
session, re-attacked in isolation before landing**, instead of rewriting §9a as a block
again.

The PM ruled all five open briefs in the kickoff directive, adopting the 2026-08-30
team-endorsement recommendations verbatim with every execution rider: **D25** (F-C = A,
client-injected durable card), **D26** (F-F = A, finding-class as a fourth column on 5a,
plus the sharpening that post-D23 attribution is a naming axis, never an evidence-quality
guard), **D27** (F-H = A, two counts ranked — per-pet over attributed rows only, else
household over all rows), **D28** (F-J = A, same-tier re-arrival damps to the card, a
tier rise never damped, N is Dr. Chen calibration), **D29** (F14 + F17 defer to W2b's
activation with pre-registered shapes). All five are recorded in the spec's §0 and on
CUL-684; **only D25 was executed** — the other closures are each their own future seam,
and their §9b rows stay open, annotated with their rulings.

## What seam 1 wrote

`docs/nyx-event-taxonomy-requirements.md` — version 1.6 · seam 1:

- **New §9a rule 6a** — the durable-card architecture. Client-derived safety findings
  get their own **injection path into the Signal zone**: a client-local overlay card,
  derived from local rows on every evaluation, **never a write to `ai_signals`**;
  persisted state joins `wipeLocalSession` beside rule 3's marker (B-424 rules apply if
  SQLite); composition order defined with the path (client safety leads, one finding
  set, threading the zone's existing safety accounting — `hasSafetyFinding`,
  `visibleFindings`, the cross-pet banner); **no zone state gates the overlay**; D14
  chip columns stay out of `generate-signal` entirely, and the strain predicate keeps
  one client-side implementation (the report half rides CUL-19 per §10.3/§10.4,
  unchanged).
- **Rule 1's fourth exit** re-anchored to the 6a card — with the F-G marker
  contradiction explicitly left standing and unadjudicated (its own seam).
- **Rule 3's card paragraphs** (F7 stand-down, F12 current-state) re-anchored: the
  recompute-on-every-evaluation card is now implementable offline, which it never was
  against the server-cached card.
- **Rule 6's presentation table** cells repointed from the false "D4 already ships"
  premise to the 6a card.
- **Fixture 12** added (6a's offline existence: identity + zero-network-reads count,
  asserted across the zone's building and empty states too); **fixture 8's** second
  clause rewritten client-testable (D25 rider iv — F-I's untestable half resolves; its
  monotone-test half stays open).
- **§9b bookkeeping**: F-C's row removed per D19's closed-findings rule (17 open, four
  silent-on-the-sick); ruled-but-unexecuted rows annotated with D26/D27/D28/D29; the
  preamble's F-C paragraph kept as the class lesson with a closure note.
- **HR-27 reconciliation** extended one sentence: D25 completes the deterministic-client
  class's own logic on the delivery side; the statistical engine's cards remain
  server-computed, unchanged.

Also: CLAUDE.md's taxonomy row updated (v1.6 seam 1, the D25 resolution note on the
unverified-premise paragraph), and CUL-684 carries the claim, the rulings record, and
the outcome comment.

## The re-attack

Per the discipline, the seam was attacked in isolation before landing —
`adversarial-reviewer`, scoped to the seam's own material (6a's new mechanism, the
re-anchored paragraphs, the bookkeeping) plus its seams with the adjacent open findings,
with instructions to flag any silent adjudication of F-G/F-A/F-B/F-D/F-E rather than to
re-litigate them.

**Verdict: TBD**

## Why one seam only

v1.5 followed rule → write → attack → land exactly, preferred deletion throughout, and
still returned 18 findings — because it wrote fifteen closures at once, and four of the
five silence defects landed in the seams *between* them. This session is the first test
of the corrected scope: one ruling executed, everything else recorded but untouched,
the re-attack aimed at one seam's blast radius. F-G sits directly adjacent to this
seam's text (rule 1 × rule 3, the marker's scope) and staying out of it was the
hardest part of the writing — the seam edit brushes both contradictory sentences and
takes no side.

## Next

Seam 2. Recommended: **F-A** (the unacknowledged band-tier cluster permanently silent —
the worst open silence defect, and it lives in the rule 3 × 13 × acknowledgement seam),
or **F-G** first if the PM prefers to clear the contradiction the F-A closure must be
written against. Kickoff prompt on CUL-684 / in the session summary.
