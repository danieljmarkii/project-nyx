# 2026-08-23 — CUL-319 (B-612): rendering the vet-report paths no artifact had ever exercised

**Issue:** CUL-319 · **PR:** shipped via #704 · **Mode:** BUILD (fixture/tooling, then the fixes its review produced)

## The problem, restated

Five sample artifacts existed (`scripts/render-trial-report-sample.deno.ts` → clean / refused /
completed / truncated / past-window). In all five, **every event was `seen` with an exact time,
nothing was photographed, and the latest weigh-in was inside the window or after it.** So a set of
render branches appeared in those artifacts only in the *legend that explains them* — which is not
a render. `vet-report-cold-read` raised it in three consecutive rounds on B-600, most sharply as:

> *"I can't cold-read a string I've only seen in code, and that is the whole point of this review."*

Measured before starting, in `trial-report-clean.html`:

| Path | Occurrences | Where |
|---|---|---|
| `class="conf">seen<` | 18 | real symptom rows |
| `est` / `range` / `unspecified` | 1 each | the legend only |
| `N logs` duplicate tag | 0 | legend only |
| `.phcard` / `.sbthumb` | CSS only | the incident-photo appendix never rendered |
| `(before this window)` | 0 | `past-window` renders the *`after`* side (the B-600 round-11 fix) |

## What was built

A sixth case, `trial-report-monitoring.html` — Pepper, a 9-year-old indoor cat under workup for
chronic intermittent vomiting, reported through the 31-day `since_visit` window her recheck opened.

**Deliberately a MONITORING report (no diet trial).** Every gap named in the issue is
trial-independent, and a sixth trial artifact would only re-render pages the cold read has already
graded five times. The narrative that makes all four co-occur without contrivance is the owner who
*finds* things: a cat vomits overnight, on a rug, and the owner meets the evidence in the morning
and photographs it.

Two mechanism notes that are the real content of the diff:

- **`index.ts` embeds photo bytes AFTER pure assembly** (report.ts never touches image bytes), so
  the emit loop gained a post-assembly hook. Without it `dataUri` is null on every photo and the
  thumbnails silently never appear — indistinguishable from the feature being broken.
- **The PNGs are generated, not checked in** — a dependency-free encoder over STORED deflate
  blocks. Validated by inflating the output through real zlib and checking every chunk CRC against
  Python's `zlib.crc32`, so the artifact carries real image bytes rather than a broken-image box.

One fixture decision worth its comment: incident 3's window straddles local midnight (23:00 the
previous evening → 07:20 the next morning) **on purpose**. That put the ambiguity in front of the
cold read instead of leaving it to a unit test that would have to already suspect it to assert it.

## What the cold read then found — NOT READY, three blockers

All three were in branches rendering for the first time. That is the issue's own thesis confirmed:
**an unexercised branch is where the defects were.**

1. **Overnight windows rendered dateless.** `~23:00–07:20` on a row dated Jun 14 — the 23:00 belongs
   to Jun 13. Not cosmetic: that incident reads yellow/bile/watery, and bilious vomiting syndrome is
   diagnosed *on* the overnight, empty-stomach, long post-prandial interval. Anchored to the wrong
   evening it becomes a ~4h post-prandial event and leaves the differential.
2. **The Logged column had the same hole.** The Date column is the *occurrence* day, so a bare
   `08:10` beside an event that occurred at 23:30 the previous evening states a log fifteen hours
   before the event's own earliest possible time — the occurred-vs-logged pair, the report's best
   provenance feature, contradicting itself on exactly the found-later events it exists to serve.
3. **The duplicate tag wore the `.conf` time-confidence chip** inside the Occurred column, so it read
   as a fifth confidence value — or as a second episode, colliding with page 1's count of 9 — and its
   only definition was on page 6.

### The third one, and the ruling behind it

The safety band printed `Vomiting has been ongoing 25 days (first logged Jun 5)` on a page also
stamped `Generated Jul 2`, four inches from a tile reading `28 d`. It was the **only** arithmetic
failure among ~15 figures the reviewer checked by hand — which is what made it expensive: once one
number fails to reconcile on a page whose whole value proposition is that its counts do, every other
number has to be hand-verified.

The 25 was not a typo. `spanDays` is a floored **instant** delta
(`Math.floor((last − first) / MS_PER_DAY)` in `detection.ts`), so it is **clock-dependent rather
than calendar-dependent** — moving the last episode one hour later, with no change to any date on
the page, prints 26. It also understates, inside a safety flag: the reassuring direction.

This was surfaced as a decision rather than fixed, because the honest source fix has blast radius
well beyond the report. **PM ruled option B: state the anchors, drop the derived number.**

- Fixing `spanDays` in `detection.ts` would be one predicate and correct everywhere — but it gates
  `minSpanDays`/`firmSpanDays`, so it changes **when the chronicity safety lane fires and at what
  tier, across the rolling Signal too**. A threshold change wanting its own adversarial pass.
- Re-deriving a calendar span for display only would mint a second definition of "span" — precisely
  the anti-pattern the §5.3 one-predicate rule exists to stop.
- Option B creates neither problem: the number simply stops being rendered.

The row now reads **"Vomiting has been logged from Jun 5 to Jul 1"**. The closing anchor rides the
local-day recount **that already existed on this flag** — added after an *earlier* cold read caught a
UTC-vs-local off-by-one on this same line — so there is no second traversal and no second notion of
"the last episode" that could drift from `daysSinceLastEpisode`. It is null, and the row states its
opening anchor only, when the window does not cover the detector's full episode set: an anchor from
a partial set would date the pattern's end *earlier* than the record does — again the reassuring
direction, on a chronicity flag.

B-532's three intents survive and are still asserted: the date attributes to **logging** rather than
to the animal's onset, never reads as "first noted", and the left-censor disclosure still fires at
the window edge (now without quoting a count).

## Two guards caught me, both correctly

- **`code-reviewer` proved by execution** — calling the real `dedupeEvents`, not reading it — that
  the fixture had the photo on the **surviving** duplicate. A member carrying a completed analysis
  always wins the representative election, so the union-across-members path three comments claimed
  to exercise **was not being exercised at all**; an implementation reading only the representative's
  own id would have passed. The attachment moved to `v-dup-a`. It also caught a "five unlogged days"
  comment that overcounted (the coverage tile counts days with *any* log, and two of the five carry
  a symptom event).
- **The deploy-ledger guard blocked the push twice** over `generate-report` fingerprint drift.
  Acknowledged both times under the existing CUL-19 hold, with the reasoning written into the entry.

Also worth recording: the PNG encoder was reviewed for validity rather than trusted — the reviewer
independently checked the stored-deflate framing (BFINAL/BTYPE, LEN/NLEN one's-complement), the zlib
header and Adler-32 trailer, IHDR fields, and CRC coverage, and confirmed with `file(1)` and Node's
`zlib.inflateSync`. No defects.

## Verdict context worth keeping

The reviewer rated the report's **doctrine** — denominators everywhere, the blood "never a 0 of N
count" rule, occurred-vs-logged, the suppressed-detector disclosure, no absence ever rendered as
wellness, no AI read ever reading as a diagnosis — *"better than most clinical summaries I
receive."* It failed on three renderings, not on its thinking.

## Filed, not folded in

| Issue | What |
|---|---|
| CUL-631 | CI type-checks nothing under `scripts/` — the artifact renderer can rot silently |
| CUL-632 | Letterhead weight has no year/elapsed interval; + should a missing in-window weight escalate (Dr. Chen) |
| CUL-633 | The `4 → 5` trend is confounded by concurrent antiemetic cover, direction unnamed |
| CUL-634 | The remaining cold-read secondaries and nits, as one checklist |

## The generalisable lesson

The same one B-604 and this issue both point at, now with a second data point: **a branch that has
never rendered in an artifact a human or a cold read actually looked at is not covered, however many
unit tests touch it.** Every one of the three blockers here had passing tests around it. What none
of them had was a page someone read as a page.

Corollary for fixture design: build the fixture so the ambiguity *shows up*. The midnight-straddling
window was chosen deliberately, and it produced the highest-consequence finding of the session.
