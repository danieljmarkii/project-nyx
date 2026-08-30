# Event taxonomy §9a v1.6 · seam 1 — the F-C durable-card architecture (CUL-684)

**Date:** 2026-08-30

Shipped via **#783** (draft). Mode: BUILD. Branch `claude/cul-684-seam-1-f-c-idrcxt`.

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
re-litigate them. And then re-attacked after the corrections, per the CUL-69 rule
(re-run the falsification pass after every correction, not once at the end).

**Round 1: FAIL — 10 findings (S1-1…S1-10), three high.** The preamble's prediction
held on the pass that quoted it: every defect was in mechanism this seam *added*. The
three high: (S1-1) my composition bullet claimed a non-active pet's client finding
reaches the cross-pet banner "exactly as a server one does" — false at three
independent, fail-quiet points (the shipped banner is a network read of `ai_signals`
through a four-type allow-list; rider (i) forbids the overlay writing there), the
CUL-676 silent-partial-membership class in the one list `guards/symptomLists.test.ts`
structurally cannot see; (S1-2) "threads through `visibleFindings`" and "renders over
every zone state" were jointly unsatisfiable against the shipped zone, and the merge
direction made fixture 12's building/empty clauses assert unreachable states; (S1-3)
fixture 12 never exercised F-C's own patient — a post-save-only build passed it while
reproducing the basement flat, and its "zero network reads" clause was unassertable.
Plus S1-4 (the declared F-G neutrality quietly armed rule 1's side — the pinned test
is now held un-binding until F-G resolves), S1-5 (the timeout route inherited nothing;
fixed by the render model, not a fifth entry point), S1-6 (rule 15 mis-cited; the
same-rows client-vs-⑦ case ruled via §10.2a's precise-units), S1-7 (three false code
claims about the zone's state machine, in the bullet whose job was a code claim — F-C's
own class, repeated in the closure answering it), S1-8 (a second durable store existed;
already wipe-wired), S1-9 (counts unscoped; the promised verdict block missing; rule
11's stale "seven"), S1-10 (the one-predicate locus named: a shared `lib/` module, with
the CUL-717 fingerprint consequence budgeted).

All ten corrected in the same revision; the full record lives in the spec's new
**§9b § Seam-pass verdicts** block. What held is recorded there too — the offline
cold-start after an app kill (the hydration tick fires in `useSync`'s `finally`), the
lead-canvas register, the arrival/haptic gate, the type-system guard, both
fail-toward-firing directions, and F-A's non-adjudication.

**Round 2 (on the corrections): FAIL — 8 findings (S2-1…S2-8), three high** — and the
round-1 pattern repeated exactly: the deletions held, the added mechanism did not. The
big three: (S2-1) the derive-only model could not express rule 3's
never-stands-down-to-nothing card — the owner who sleeps thirteen hours on a
twelve-hour window past an unacknowledged band woke to an *empty zone*; closed by the
two-sources derivation rule (marker + member rows, both already persisted). (S2-2) the
fixture's marker-unset pin contradicted rule 3's own write side (a delivered band sets
the marker) and gave back the discrimination S1-3 was filed for — a marker-gated build
passed the whole fixture while reproducing the basement flat. (S2-3) the banner bullet
had named two of at least six fail-quiet gates on its path (`validateBannerPhrasing`
fail-safes to silence on exactly this leaf's emergency vocabulary; the banner is
single-slot and rank-ordered; `bannerCopy` is name-first against D23; and nothing had
ever said detection *evaluates* a non-active pet).

**And the round's structural finding redraws the seam map: F-C's closure cannot be made
fully binding while F-G stands.** Three independent findings across two rounds (S1-4,
S2-2, S2-4) hit the same wall — every fully-discriminating fixture and every coherence
invariant either contradicts rule 3's write side or quietly asserts rule 1's half of
the marker contradiction. Rather than dodge a third time, the residue is **held**:
fixture 12(e)/(f) (the basement-flat discriminator and the F7 persistence clause) sit
un-binding beside rule 1's pinned test, becoming binding the day F-G resolves — and
the verdicts block records the consequence in place: **seam 2 should be F-G.**

**Round 3 (on the round-2 corrections): FAIL — 10 findings (S3-1…S3-10), three high.**
The round-2 fixture rewrite had silently dropped the background→foreground assertion
from the binding set (S3-1); "unresolved markers" was undefined and excluded the
acknowledged marker F7's stand-down requires — the owner who acted lost the card
(S3-2); the all-members-soft-deleted corner was the one boundary unnamed (S3-3); and
the headline-suppression sentence cited a "shipped rule" that is a *comment* — S1-1's
class, one bullet from where it was fixed (S3-6). All ten corrected: definitions,
restorations, and disclosures almost throughout.

**Round 4 (on the round-3 corrections — the bounded final round): FAIL — 8 findings
(S4-1…S4-8), two high; 6 of 8 closable by disclosure or one clause.** The four-round
pattern is now data: **every disclosure-shaped fix survived attack; every mechanism
added in a correction drew new findings** (10 → 8 → 10 → 8). Per the
stop-when-not-converging rule, round 4's findings are recorded as the seam's
**standing residue** in the spec's § Seam-pass verdicts — with inline ⚠ markers on the
two clauses it broke (the tense-split overlap rule, S4-1/S4-4; the soft-delete
scoping, S4-3), the disproven "every marker-unset state" overclaim corrected at all
three closure sites (S4-2: a never-delivered cluster past the window has *neither*
derivation source — an open ruling that collides with F22's delivery-write rule), the
F-G record balanced with rule 1's branch cost (S4-6: an ungated ever-present card is
CE-8's wallpaper — D28's own hazard), and fixture 12(a′)'s premise pinned to the
reachable path (S4-5).

**Where the seam stands:** the durable-card architecture is written (6a + rules 1/3/6
re-anchored), attacked four times, and honest about itself — F-C closed for
marker-unset states within the window; the marker-set half held with F-G as fixture
12(e)/(f); S4-1…S4-8 recorded with fix classes; both W2 waves still gated. Of the four rounds'
thirty-six findings (10 + 8 + 10 + 8), every one drew an in-session edit —
correction, restructure, or recorded disclosure — except the four raised as the
standing residue: **S4-1** (one clause of mechanism), **S4-2's ruling**
(persist-on-evaluation vs F22), **S4-3's scoping line**, and **S4-4's composition
clause**; S4-7's two pointers ride whichever session takes those.

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

**Seam 2 = F-G, and this is no longer a preference — it is the seam pass's own
evidence.** Three findings across two re-attack rounds (S1-4, S2-2, S2-4) showed every
load-bearing piece of the durable-card architecture is gated on the rule 1 × rule 3
marker contradiction: the fourth exit's backstop, the fixture's discrimination, and the
coherence invariant each either die under rule 3's scope sentence or silently assert
rule 1's. Fixture 12(e)/(f) and rule 1's pinned test sit held un-binding until it
resolves. The evidence also points at the resolution (recorded as a recommendation,
not an adjudication): rule 3's own F7 and F12 paragraphs — the card as undelivered
message, the card as *current state* rather than an arrival event — already side
against its scope sentence's card clause, which reads as the "consistency fix" rule 1
warns against, shipped as a definitional sentence. F-A follows naturally as seam 3
(its closure must be written against a settled F-G). Kickoff prompt on CUL-684 / in
the session summary.
