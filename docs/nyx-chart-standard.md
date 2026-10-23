# Nyx chart standard

🌱 **Living.** **Version:** 1.0 · **Last Updated:** 2026-10-23 · **Issue:** CUL-1899

Every chart Nyx ships, in the app or in the vet report, is evidence a reader can check without a legend (Principle 8). This page is the table a chart joins **before it ships**, and the table every shipped chart is held to. It replaces the Design v2 round 4 §05 table (`docs/culprit-design-v4-mockups.html`, frozen 2026-09-19), which stopped being edited before `WeekStrip` shipped.

**A cell that is not a yes is a defect**, not a style choice. A defect gets a Linear issue, and the row names it until it is fixed. An exception is allowed only when a ratified spec or ruling draws it, and the row names that source.

---

## 1. The five cells

| Cell | What it asks | The test |
|---|---|---|
| **A mark per fact** | Each counted thing is its own mark, placed where its value is: a bar per week, a dot per reading by date, a dot per episode at its true minutes. Never smoothed, never spaced by index. | Point at any mark: can you say which fact it is? |
| **A count on every mark** | The number is printed on or beside the mark, a zero included. | Cover the axis: can you still read every value? |
| **The denominator in view** | What the count is out of: logged days, timed of total, the band a reading moves in. | Can a reader tell a quiet week from an unlogged one? |
| **The uncounted, disclosed** | What the chart leaves out is said on the chart: untimed episodes, unlogged days, a partial week, a reading past the edge. | Hand it to Dr. Chen with the caption covered: can she say what was left out? |
| **The window, named** | The span is dated or named on the chart: the first and last week, "before the trial · in the trial", the month. | Can a reader say what period this is without the screen around it? |

## 2. Form follows the number

- A **count** is bars. A **continuous** measure is dots by date (weight) or, where ruled, an area. A **rate** draws the counted thing, never only the ratio. **Timing** is the lane.
- **Never:** a line through counts, a smoothed curve, a dual axis, a legend the chart needs to be read, a sparkline with no ground, a fill on an axis that does not start at zero.
- **Never colour alone.** Chart text wears ink, never the series hue; a shape, a label or a gap carries every distinction (principles § Color). Lightness, not hue, tells filled from hollow.
- **The ~20pt floor.** A mark that carries a fact the reader must pick out gets about 20pt on a phone. A coverage tick is the disclosed exception: it carries no fact alone (the count is in words beside it), recorded in `components/charts/CoverageTick.tsx`.
- **The reference:** the shipped timing lane (`TimingLanes`). It does all five at once.

## 3. Adding a chart

1. Add its row to §4 in the PR that ships it, every cell filled from the code, not the mock.
2. A cell that is not a yes either names its exception's source or names its Linear issue; a chart with an unfiled no does not ship.
3. Charts that share a drawing share a row's evidence: the month and the week strip both draw `DayMarkFace`, the weekly bars and the compare both draw `CoverageTick`.
4. A Design or Data Visualization review checks the row (`docs/personas.md` § the chart standard).

## 4. The shipped charts

Checked against `main` at `a5988ca` (2026-10-23). Paths are as of that commit; `components/designV2/` is being renamed by the component front door work (CUL-1896), so find a component by name first.

### 4.1 The app: the chart family (`components/charts/`)

| Chart | Where | A mark per fact | A count on every mark | The denominator in view | The uncounted, disclosed | The window, named |
|---|---|---|---|---|---|---|
| **Timing lanes** (`TimingLanes`, the reference) | The Signal's screen | yes: a dot per timed episode at its true minutes | yes: the three bucket counts under each lane; a masked empty bucket prints no `0` (exception, CUL-1440 D1) | yes: "13 timed of 19" per lane | **no past an 84-day trial:** the untimed line always renders, but episodes before the trial's last 84 days are on no lane and in no line, [CUL-2154](https://linear.app/projectnyx/issue/CUL-2154) | **partial:** each lane is labelled, but past 84 days "In the trial" names the trial's last 84 days as the whole trial, [CUL-2154](https://linear.app/projectnyx/issue/CUL-2154) |
| **Weekly bars** (`WeeklyBars`) | Home's Signal lead, the Signal's screen, the month | yes: a bar per week, unsmoothed | yes: the number above every bar, zero included, except a masked zero week, which prints blank (exception, CUL-1440 D1) | yes: seven coverage ticks under each week | yes: no tick on a day ahead or before the record; "N days so far" on the partial week; episodes outside the weeks in words | yes: first and last week dated; the trial mark dated, "before these weeks" when it falls off |
| **The compare** (`CompareBars`) | The Signal's screen | yes: one bar per window | yes: the number beside each bar; a masked zero prints blank (exception, CUL-1440 D1) | yes: the window's days as a strip under its bar | yes: hollow days on the strip; "logged N of M days" | yes: each bar labelled with its window |
| **Day marks** (`DayMark` over `DayMarkFace`) | Patterns, the month | yes: a day per square, the date kept on it | yes: the count in the corner, on days that have one | yes: the coverage line (broken for a meal left unfinished) | yes: grey square = nothing logged; a layer switched off keeps date and line | yes: the month, with arrows |
| **Weight dots** (`WeightDots`) | Patterns, the weight card | yes: a dot per reading, by date | **partial:** only the first, last and clipped values are printed; an interior reading carries no number. [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) | yes: the band, edges labelled with its width (±10, 20 or 30 %) | yes: a reading past ±30 % drawn hollow at the edge with its value | yes: first and last dates under their dots |
| **Masking span** (`MaskHatch`) | On the bars and lanes | n/a: a region on another chart, not a chart; its span is spoken in the host chart's label | | | | |

### 4.2 The app: charts outside the family

| Chart | Where | A mark per fact | A count on every mark | The denominator in view | The uncounted, disclosed | The window, named |
|---|---|---|---|---|---|---|
| **Week strip** (`WeekStrip`, draws `DayMarkFace`) | History, the list header | yes: a day per cell | **exception:** no counts, by the History v2 spec §3.4; the list's count line carries the week's numbers. Recorded here for the first time: [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) | yes: the coverage line | **no:** under a filter, "logged, not this kind" and "nothing logged" draw almost alike, [CUL-1227](https://linear.app/projectnyx/issue/CUL-1227) (a PM ruling) | yes: the week announced on paging; the arrows |
| **Timing distribution** (`TimingDistribution`) | Patterns' Timing panel | yes: a dot per timeable episode at its true minutes | yes: the panel's band counts (`TimingPanelCard`) | yes: "N timed of M episodes" | yes: the untimed line, whenever any episode could not be timed | yes: "· whole record" |
| **Home's dot lane** (`DotLane`, `components/home/SignalReceipts.tsx`) | Home's Signal row (a timing finding) | **no:** dots spaced by index, not minutes, and "30m" sits at the midpoint while its band ends at a quarter | yes: the row's counts | partial: the row's sentence | **no:** the untimed episodes are not named | **no:** the 60-day window is not named. All three: [CUL-1499](https://linear.app/projectnyx/issue/CUL-1499) |
| **The stacked compare** (`StackedCompare`, same file) | Home's Signal row, the old `InsightCard` | **partial:** a bar per row, proportion only; in "N · was M" the baseline has no mark of its own. [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) | yes: "N" or "N · was M" | caller's: the trial card prints "Counted from the days you logged: N during the trial, M before" (`lib/signalCopy.ts`); the timing rows do not | caller's, as the denominator | caller's: the row labels. [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) |
| **Sparkline** (`components/dashboard/Sparkline.tsx`) | Profile's weight trend, the metric detail screen (from the rundown), an Ask answer | **no:** a line through readings spaced by index, no points | **no:** the card prints the latest value and a delta, not the marks | **no:** the range is the data's (fitted to fill) | **no** | caller's: the delta line's "since …". The four noes: [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) |
| **The spine** (Home's Today, `TodayCard` over `buildDay`) | Home | yes: a node per event; a compact node names its count | yes: "3 meals", "3 min after eating" | yes: the count line | yes: the quiet day says "nothing logged yet" | **partial:** named "Today", but the card carries no date. [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) |
| **Onboarding previews** (`ValuePreview`) | The Landing's value previews | n/a: an illustration of the product with fixed copy, not anyone's data | | | | |

### 4.2a Not yet checked cell by cell

Found by the first adversarial pass after the table was written; each gets its row in [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153). Until then a cell is not a yes.

| Chart | Where | What it draws |
|---|---|---|
| `RankingCard` | Patterns (flag-off dashboard), "Top food", "Top protein" | a share bar per food, normalised to the top row, with "% finished" |
| `CompositionCard` | Patterns (flag-off dashboard) | the month's meals against treats as one proportion bar with counts |
| `TrialLedger` | The trial's own screen | a day grid: hollow gaps, an ink off-diet mark, a count on every row |
| `DietTrialCard` progress bar | Profile | day progress only ("day N of M"); likely n/a as a chart, to be recorded so |

### 4.3 The vet report (`supabase/functions/generate-report/render.ts`)

| Chart | A mark per fact | A count on every mark | The denominator in view | The uncounted, disclosed | The window, named |
|---|---|---|---|---|---|
| **Symptom frequency** (`symptomChart`, the hero) | yes: a bar per week; a zero week a visible nub | yes: the count on every bar, `0` included | **partial:** "N/7 d" under every week up to 14 weeks, under every other week past 14 (the axis stride). [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) | yes: a week under the logged-day floor prints "–", never `0`, and the key says why (the "not read (N of 7 days logged)" wording is the alt text) | yes: week-start dates on the axis; the range box and caption carry the exact bounds |
| **Off-diet feedings** (`proteinTimelineChart`) | yes: a column per week | yes: a bar's count, a floor never a total; a measured `0` only above the coverage floor | **partial:** the diet-observed day count under every in-scope column up to 14 weeks, every other column past 14. [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) | yes: a week too thin to read is drawn NOT OBSERVED, never `0` | yes: the shared week axis |

## 5. What this table found on its first pass

The rows above marked **no** or **exception** that had no issue are filed as one finding, [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153) (the Sparkline's four noes, the week strip's count exception, and the stacked compare leaning on its caller). The adversarial pass then broke five more cells and found four charts missing; the cells are corrected above, the lane's cap is [CUL-2154](https://linear.app/projectnyx/issue/CUL-2154) (live, QUIET), and the rest joined [CUL-2153](https://linear.app/projectnyx/issue/CUL-2153). The dot lane's noes were already [CUL-1499](https://linear.app/projectnyx/issue/CUL-1499); the week strip's disclosure is [CUL-1227](https://linear.app/projectnyx/issue/CUL-1227).

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-23 | Moved out of round 4 §05 into a living doc (CUL-1899, D5 (a)). Every shipped chart audited against the code; the week strip, the timing distribution, the dot lane, the stacked compare, the sparkline and the two report charts join the table. |
