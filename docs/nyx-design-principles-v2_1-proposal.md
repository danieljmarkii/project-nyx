# Design Principles v2.1: proposed edits for PM ratification

**Status:** 🟡 **Proposal, not in force.** Nothing here changes `docs/nyx-design-principles-v1_0.md` until the PM ratifies it. · **Drafted:** 2026-10-23 · **Issue:** CUL-1899 (D5 (a), ruled 2026-10-23)

## How to ratify

Each edit below is one Tier-2 change in the shape CLAUDE.md § Documentation Update Protocol asks for: where it goes, the exact text, where the rule came from, and whether the ruling behind it is already made. Rule them one line each on CUL-1899: `E1 yes`, `E5 no`, `E7 yes with <change>`. Ratified edits are written into the principles file as v2.1 in one PR, after the colour roles work (CUL-2145) merges, since that PR holds the principles file's § Color today. This file is then deleted; git and the v2.1 version-history row keep the record.

**Why these and not more.** The Design v2 critiques (`docs/home-design-language-critique-2026-10.md`, its five rulings on CUL-1496 of 2026-10-03; and the pre-GA critique on CUL-1179, an unmerged draft) found system rules that the code now enforces but the principles never said. A principle the code enforces and the doc omits is a rule the next screen's designer cannot see. Every edit here is already ruled or already shipped; none asks the PM to decide new product behaviour.

| Edit | Where | Rule | Ruling behind it | Enforced today by |
|---|---|---|---|---|
| E1 | Principle 8 | The chart standard lives in its own doc | D5 (a), 2026-10-23 | `docs/nyx-chart-standard.md` |
| E2 | New § Layout | One card surface; elevation never carries rank | G1 (A), 2026-10-03 | `guards/homeCardSurface.test.ts` |
| E3 | New § Layout | One text column; rails in the gutter | G1 (A) | the same guard (surface); the mock round |
| E4 | § Iconography | One glyph per verb, from one component | G1 (A) | `guards/homeCardSurface.test.ts` (raw ›) |
| E5 | Principle 3 | A context card is a headline, one line and a door | G2 (B), 2026-10-03 | CUL-1526 (shipped) |
| E6 | Principle 3 | No reassuring-direction line beside a live safety card | G3 (B), 2026-10-03 | CUL-1526 (shipped) |
| E7 | § Copy Principles | Every count states its number, unit and window | G5, team default, not vetoed when the PM ruled G1 to G6 | `.claude/rules/counts-and-claims.md` (C-3) |
| E8 | § Color | Each hue carries one meaning, in one table | G4 (C), 2026-10-03 | CUL-2145 writes the table |
| E9 | Principle 3 | A fold budget at the largest text size | G6 (B), 2026-10-03 | nothing yet: CUL-1527 (Todo) builds it |
| E10 | § Navigation | Zones are labelled, doors are not; one destination, one name | G5 team defaults; CUL-1502 | none yet |
| E11 | § Typography | The serif's two roles | Round 4 §01, designed (the critique's verifier refuted it as drift) | none |

---

## E1 · Principle 8 points at the chart standard

**Where:** Principle 8, the paragraph *A chart is evidence the reader can check without a legend.*

**Replace:**
> The shipped timing lane is the reference, and the Design v2 chart table (round 4 §05) is the table a new chart is added to before it ships. A cell that is not a yes is a defect.

**With:**
> The shipped timing lane is the reference, and `docs/nyx-chart-standard.md` is the table every chart is held to: a new chart joins it, every cell filled from the code, in the PR that ships it. A cell that is not a yes is a defect, and it names its Linear issue or the ruling that excepts it.

**Why:** the round 4 page stopped being edited on 2026-09-19; the week strip shipped after it and is not in it. The living table found three charts with no issue on its first pass (CUL-2153).

## E2 · One card surface, and elevation never carries rank

**Where:** a new **§ Layout** under Visual Language, after Typography.

**Add:**
> **One card surface.** Every card on a screen is drawn on one surface: soft shadow, no border, one inset. A card is never raised above its neighbours to say it matters more; order and words carry rank, the surface never does. The one exception is the Signal's lead, which takes the well.

**Source:** the Home critique found two card surfaces no mock drew (the Signal elevated, the rest bordered). Ruled G1 (A); built as `HomeCard` (CUL-1525); guarded on Home by `guards/homeCardSurface.test.ts`. This edit makes it a rule for every screen, which is what the M2 design passes inherit.

## E3 · One text column, rails in the gutter

**Where:** § Layout, after E2.

**Add:**
> **One text column.** Every card's text starts on one left edge. A rail, a dot or a tint that marks a card sits in the gutter, outside that edge, never inside the column pushing the words right.

**Source:** the Home critique measured three left text edges (the Signal's rail pushed its headlines about 19pt right). Ruled with G1 (A).

## E4 · One glyph per verb

**Where:** § Iconography, a new paragraph.

**Add:**
> **One glyph per verb, from one component.** "Goes somewhere" is one mark, drawn by one component (`DoorMark`), everywhere; "opens here" is another. A screen never invents a third door glyph, and a control that writes never looks like one that navigates.

**Source:** the Home critique counted five forms for "goes somewhere" and three for "opens here". Ruled G1 (A); the write-versus-navigate half is the team default BKL-1.

## E5 · A context card is a headline, one line and a door

**Where:** Principle 3, after *Home has two jobs, not a list of zones.*

**Add:**
> A context card (a running trial, an appointment) is a headline, at most one line and a door. Its detail lives on its own screen. The one line is chosen accusing-first: the slip a vet would ask about before the reassurance.

**Source:** the trial door was the densest card on Home (about 184pt, seven lines, five numbers) while being context, not an insight. Ruled G2 (B), with the PM's amendment that the end date always leads the line; built in CUL-1526.

## E6 · Nothing reassuring beside a live safety card

**Where:** Principle 3, after E5.

**Add:**
> While a safety card is live, no other card on the screen prints or draws anything whose direction reassures: no falling comparison, no coverage ratio, no "all within", no falling chart. The reassuring line yields; the safety card never does, and nothing here is met by removing or delaying it. Facts without a direction (an end date) and accusing facts (an off-diet count) stay. A line whose direction is unclear is withheld if it could read as reassurance, and an accusing fact is never withheld as unclear.

**Source:** ruled G3 (B), with Dr. Chen's concurrence; it extends the PM's 2026-09-27 lane ruling (CUL-1301) from the chart to the words. This is the n=1 and intake safety invariants applied to layout, so it is the one edit here on the clinical never-list. The last two sentences of the text, and "or draws", were added after the adversarial pass of 2026-10-23 found the first wording could be met by dropping the safety card, or by a falling chart instead of a line.

## E7 · Every count states its number, unit and window

**Where:** § Copy Principles, a new heading after *Specific Over Generic*.

**Add:**
> ### Every Number Says What It Counted
> A count states its number, its unit and its window in its own sentence: "4 vomiting episodes in the last 7 days", never "4 this week" under a heading that names another span. A month never labels a count over a different window. A ratio whose window differs from its card's names that window.

**Source:** team default G5 in the Home critique, carried by the pre-GA critique's GC-3 and its count findings; the code-side rule is `.claude/rules/counts-and-claims.md` (C-3, C-35). It is a copy rule as much as a data one, so it belongs in the principles.

## E8 · One meaning per hue

**Where:** § Color, after *One dominant neutral…*

**Add:**
> **Each hue means one thing, and the table says which.** A hue that carries two meanings carries neither. The roles live in one table in this section; a new use of a hue joins the table or takes a neutral.

**Source:** the Home critique found teal carrying six or seven meanings. Ruled G4 (C): indigo is "you can act", teal is "a good fact", rose is the safety lane only. **The table itself is the colour roles work (CUL-2145), which holds this section now;** E8 adds only the rule that the table is binding, and its wording must match that PR's table when both land. It also retires the current line *One accent, used sparingly, only for interactive elements and the primary trend line in charts*, which G4 (C) superseded.

## E9 · A fold budget

**Where:** Principle 3, after E6.

**Add:**
> **Only safety may push the day below the first screen.** A safety card starts within the first screen at every text size, and nothing is placed above it to make room. At the largest supported text size, the daily look starts within the first screen unless a safety card stands above it. Every benign section declares a compact form it takes when space runs out: pattern rows after the lead fold into a counted door ("1 more pattern · All patterns ›") while a safety card leads. Safety rows never fold. A compact form keeps its accusing fact (E5's accusing-first line), and a row carrying one (a refusal, a rising count) folds last, never into a bare count.

**Source:** ruled G6 (B) as a better-than-the-rule brief over CUL-1285 that keeps all of its protections (no stored state, no control, safety never collapses). Not built yet: CUL-1527 (Todo). Ratifying E9 before it lands writes the rule ahead of the code, which is the order the principles are meant to run in. The largest-text measurement is the device pass's (CUL-1070). The first and last sentences of the text were added after the adversarial pass of 2026-10-23: the first wording kept the look on screen but not the safety card, and a benign fold could hide an accusing fact behind "1 more pattern". E9 touches safety placement, so it joins E6 on the clinical never-list.

## E10 · Zones are labelled, doors are not

**Where:** § Navigation, a new paragraph.

**Add:**
> A zone on a screen carries a label ("Signal", "Today"); a door carries its destination's name and nothing else. One destination has one name everywhere it is reached from.

**Source:** team defaults in the Home critique; the two-names-one-destination finding is CUL-1502.

## E11 · The serif's two roles

**Where:** § Typography, replacing *One display typeface for the Signal insight on the home screen…*

**Replace:**
> One display typeface for the Signal insight on the home screen — slightly larger, slightly more considered, to signal that this sentence is worth reading.

**With:**
> One display typeface, in two roles: the Signal's sentence, which says this is worth reading, and the daily look's question, which says this one is yours to answer. Nothing else is set in it.

**Source:** round 4 §01 drew both; the Home critique's verifier confirmed the second role is designed, not drift, and asked that the principles say so.

---

## Version history row to add on ratification

| v2.1 | <date> | System rules from the Design v2 critiques (CUL-1899): one card surface and one text column (§ Layout, new), one glyph per verb, a context card's grammar and nothing reassuring beside safety (Principle 3), every count names its window (Copy), one meaning per hue (Color, with CUL-2145's table), a fold budget, zones labelled and doors not, the serif's two roles. Principle 8 points at `docs/nyx-chart-standard.md`. |
