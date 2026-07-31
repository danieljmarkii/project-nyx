# Medication strip on Home — Requirements

**Version:** 1.0 (build-ready) · **Last Updated:** 2026-07-31 · **Backlog:** B-614
**Design authority:** `docs/culprit-med-strip-mockups.html` (round 2, design-locked)
**Composes with:** B-284 N7 (`docs/culprit-in-app-brand-requirements.md` §8.2 "Care due") · B-117 (`docs/nyx-medication-logging-requirements.md`) · B-417 §4.2 (the trial card's logging rule)

---

## §0 — Read this first

Three PM calls were open when this spec was commissioned. All three are ruled, and
**D1's ruling is the one that generalises past this feature** — it resolves a standing
contradiction between two PM-blessed texts, and any future surface that wants to put a
write action on Home inherits it.

| # | Call | Ruling (PM, 2026-07-31) |
|---|---|---|
| **D1** | What does each card carry — course context (A), today's action + one-tap (B), or both (C)? | **C — both.** |
| **D2** | Ship ad-hoc tolerant now, or run B-394's capture-path session first? | **Ad-hoc tolerant now.** *"I want everyone to get value from this."* |
| **D3** | One aggregated strip, most-relevant-only, or one card per med? | **One card per med.** No arbitrary favouring of one med's data over another. |

### §0.1 The register rule (what D1 actually decided)

D1 looked like a persona conflict with no clean answer, because two ratified texts
disagree head-on:

- **B-417 §4.2** — *"logging is the FAB — a second door to the same room is not a feature."*
  That argues for Option A: context only, tap through, no write action.
- **B-284 N7 §8.2** — the **Care due** row, adopted *with* a one-tap `Log dose` in it.
  That argues for B or C.

The ruling is not "C wins and §4.2 loses." It is that **the two texts were never in
conflict**, because they are about different registers:

> **A control that opens a FORM is a second door — §4.2 forbids it.**
> **A control that writes a row the app COULD ALREADY DESCRIBE is a CONFIRMATION — the briefing governs.**

The med card's tap is the second kind. The app already holds the drug, the dose amount,
the route and the cadence — from the regimen if there is one, from the last dose if
there isn't — so the tap confirms a dose the record already predicts. That is
**Principle 2 (confirmation over entry)** doing precisely its job, not a shortcut into
the FAB's multi-decision log flow.

**Any future surface proposing a write action on Home applies this test, not a
precedent.** The question is never "did the trial card allow it?" — it is *"can the app
describe the row before the owner taps?"*

### §0.2 The two things that fall out of the register rule

Both are hard gates in this spec, not polish:

1. **The confirmability gate (§5).** If the app cannot pre-fill the dose, there is
   nothing to confirm — so **no button renders**. Option A's behaviour survives as a
   **state**, not as a rival option. A button that guesses would be entry wearing a
   confirmation's clothes, and it would write a clinical record the owner never
   asserted.
2. **The collapse rule (§7).** D3 compounds C's weight — Sam's three-med cat pushes
   Today and Trend below the fold. The fix is that a med whose cadence is already
   covered today drops to one line with no button. Weight is paid down by **register**,
   never by dropping or ranking a med, which would be D3 by the back door.

---

## §1 — The problem

An active medication lives **only** on the Pet tab's "Current medications" card
(`app/(tabs)/profile.tsx`, B-117 PR 7). The Home-first owner never sees it.

That is exactly the gap `TrialStrip` was built to close for diet trials, and it is
worse here, because **the medication owner *is* the wedge user**: sent home from the
vet with a 14-day course and a directive. The surface they open daily says nothing
about the one thing the vet asked them to do.

**The data shape this must survive (D2's evidence).** On the PM's own account there are
**2 regimens and 0 with a `target_duration_days`**. The dominant real shape today is an
**ad-hoc dose with no regimen at all** (`medication_administrations.medication_id IS
NULL`). A strip that renders only for durationed regimens would render for almost
nobody — which is why D2 ruled ad-hoc tolerant, and why §4's model is keyed on doses
first and regimens second.

---

## §2 — The two jobs

| Job | Owner | The question the card answers |
|---|---|---|
| **J1 — Where are we in this course?** | Jordan (14-day antibiotic; finite, high-intent) | *"What day are we on, and is today handled?"* |
| **J2 — Is today handled, without leaving Home?** | Sam (chronic multi-med cat; indefinite) | *"Have I done these, and can I record one in a tap?"* |

C serves both from one card. A serves only J1; B serves only J2.

---

## §3 — What the app must never say

These four are invariants, not copy preferences. Three are inherited; the fourth is new.

**N1 — Never "missed", never "due".** The app has **no structured dose times**:
`medications.doses_per_day` is a `NUMERIC(4,2)` *count* and `schedule_notes` is free
text ("8am & 8pm"). Nothing in the schema knows when a dose was expected. And
**un-logged ≠ un-given** — the household under-count evidence (`docs/logging-capture-discovery.md`
§1.2) says the commonest reason a dose is missing from the record is that someone else
in the house gave it. Framing is **coverage** only: *"No dose logged yet today"*, never
*"Dose due"* or *"You missed a dose."* This is the exact mirror of B-156 G1's
*unanswered ≠ given*, pointed the other way.

**N2 — No compliance-bound progress bar.** The bar is **day progress and nothing else**
— `daysElapsed / target_duration_days`, the same fraction `TrialStrip` draws. A bar
bound to doses-given is the R2 defect the trial-card rebuild deleted. Note that
`profile.tsx`'s regimen rows **still carry one** (`computeRegimenCompliance` →
`regimenComplianceLine`): **do not copy that card to Home.** Meds with no duration
(ongoing) and ad-hoc meds get **no bar at all** — there is no honest fraction to draw.

**N3 — Never a cheery coverage line over a refusal record.** A refused or missed dose
on record is a **health signal**, not a scheduling gap (*intake is not preference*,
generalised to meds by B-117 §6.2). When the withholding set (§6) is non-empty the
coverage line is suppressed and the register changes. This mirrors `withholdingReasons`
in `lib/dietTrialCard.ts` — and mirrors its *shape* deliberately: **one list, in one
place, that both the card and any future consumer read**, so a seventh reason cannot be
added to one surface and forgotten on the other.

**N4 — Never reassure on absence (new here, inherited from `clinical-guardrails`).**
"No dose logged yet today" is a statement about **the record**, never about the pet. The
card may never render an affirmative like *"All caught up"* or *"Fully covered"* — the
app cannot know that, and B-494's ruling binds: *a surface that teaches the reader to
scan a zone may not leave that zone silent, and an empty zone is read as a negative
result.* Coverage renders as counted facts (*"2 of 2 doses logged today"*), never as a
verdict.

---

## §4 — Data model (what exists; nothing new)

**No schema change.** Everything reads live tables from migration 020 and their local
mirrors in `MEDICATION_SCHEMA_SQL` (`lib/medications.ts`).

### 4.1 Sources

| Source | Columns that matter | Note |
|---|---|---|
| `medications` (regimen) | `drug_name`, `dose_amount`, `route`, `doses_per_day`, `started_at` (DATE), `target_duration_days`, `status`, `ended_at`, `medication_item_id` | `status = 'active'` is the lifecycle authority (mirrors `diet_trials`). `doses_per_day` NULL = PRN. `target_duration_days` NULL = ongoing. |
| `medication_administrations` (dose) | `medication_id` (NULL = ad-hoc), `medication_item_id`, `adherence`, `dose_amount`, `created_at`, parent `events.occurred_at` / `events.deleted_at` | The dose is an `events` row + a 1:1 child. **Soft-delete is read through the parent** — every query filters `events.deleted_at IS NULL`. |
| `medication_items_cache` | `generic_name`, `brand_name`, `strength`, `form`, `default_route`, `is_critical` | Names the drug via `drugDisplayName` (B-171: the owner's word, brand-preferred). |

### 4.2 What renders a card

A card renders for each **distinct medication** that is either:

- **(a) an active regimen** — `medications.status = 'active'` for the active pet; or
- **(b) a recently-dosed ad-hoc med** — a non-deleted `medication_administrations` row
  with `medication_id IS NULL`, whose drug has a dose within **`MED_STRIP_ADHOC_WINDOW_DAYS = 14`**
  local days.

**D4 — the 14-day ad-hoc window.** An ad-hoc med has no `status` and nothing ever ends
it, so recency is the only available lifecycle signal. 14 days is chosen to match the
commonest short course (a 7–14 day antibiotic given ad-hoc without a regimen row) while
letting a genuinely one-off dose age off Home rather than accumulating forever. It is a
**named constant**, not a literal, because it is a product judgment that will be revisited
once B-394's capture path lands and regimens become common.

**Deduplication.** A drug with both an active regimen *and* ad-hoc doses renders **one**
card, keyed on `medication_item_id` (falling back to the regimen id for a free-text
regimen with no library item). The regimen supplies the header; all its doses — linked
and ad-hoc — count toward coverage. Two *different* active regimens for the same drug
is already ill-defined app-wide (`ACTIVE_REGIMEN_FOR_DRUG_QUERY` takes
`ORDER BY started_at DESC LIMIT 1`); the strip **matches that existing resolution**
rather than inventing a second one.

### 4.3 Day math — B-441 is a hard prerequisite (PR M0)

Any day counter routes through **`lib/utils.localDayIndexOf`**, never
`regimenDaysElapsed` as currently written.

`medications.started_at` is a date-only `DATE`. `new Date(started_at)` parses it as
**UTC** midnight, and the shipped function then floors it to **local** midnight — so for
anyone behind UTC the start lands on the previous local day and the count reads **one
day too high**. The same millisecond-span divide loses a day across a DST transition.
This is exactly the flaw B-421 removed from the trial counter and left here on scope
grounds.

It is not cosmetic: `daysElapsed` is the **denominator of `computeRegimenCompliance`**,
which feeds the clinical-guardrails adherence copy on the profile card. B-614's whole
premise is two surfaces counting the same course; B-421 exists because three surfaces
didn't.

---

## §5 — The confirmability gate

> **The button renders if and only if the app can describe the row it would write.**

### 5.1 What "can describe" means

The confirm writes through the existing `insertMedicationDose`
(`lib/medicationDose.ts`) — no new write path. It must be able to supply:

| Field | Source | Required? |
|---|---|---|
| `medicationItemId` | the regimen's, or the last dose's | **yes** — one of this or `medicationId` |
| `medicationId` | the active regimen (via `ACTIVE_REGIMEN_FOR_DRUG_QUERY`, B-153) | **yes** — one of this or `medicationItemId` |
| drug name | `drugDisplayName` over the regimen's `drug_name` / the cached item | **yes** — a card that cannot name the drug does not render at all |
| `adherence` | `'given'` — the owner's own affirmative tap | always |
| `doseAmount` | the regimen's `dose_amount`, else the **last dose's** `dose_amount` | **no — honest-null** |
| `occurredAt` | `now()` (a dose is witnessed) | always |

**D5 — a null `dose_amount` does NOT block the confirm.** The shipped one-tap path
already writes a null amount when there is no regimen to default from, with the
rationale in place: *"a drug's per-unit strength is NOT the dose, so we never fabricate
one. Honest-null over a guessed value."* The confirmation is of **identity and
occurrence** (*this drug, now*), which the app genuinely knows; the amount is recorded
when known and left null when not. Fabricating an amount to make the button eligible
would be the exact failure the gate exists to prevent.

### 5.2 When no button renders (context-only state)

1. **Nothing to attribute** — no `medication_item_id` *and* no resolvable active
   regimen. (Reachable when a library item was deleted out from under a free-text
   regimen's doses.)
2. **The drug cannot be named** — `drugDisplayName` yields nothing usable. The card does
   not render at all in this case; a nameless med on Home is the widget's
   **no-garbage rule** (`docs/nyx-widget-requirements.md` D-no-garbage: *the surface only
   logs what it can name*) applied to the same problem.
3. **Cadence already covered today** — see §7, the collapse rule.
4. **The withholding set is non-empty** — see §6. The register changes and the confirm
   stands down.

In cases 1 and 3 the card still renders its context; it is Option A's dress, reached as
a state.

### 5.3 Double-dose safety

The confirm reuses `insertMedicationDose`, so the shipped **B-135** post-hoc flag
(`getDoubleDoseFlag`, `lib/db.ts:1053`) continues to fire on the event detail screen
exactly as it does for every other logging path.

**D6 — the strip does NOT add a pre-emptive double-dose interstitial.** Two reasons.
First, the collapse rule (§7) already removes the button from the commonest double-tap
path: once today's cadence is covered, there is no button to tap twice. Second, an "are
you sure?" prompt on a confirmation is a decision at the moment of the event
(**Principle 1**), and the existing flag already catches the real case *after* the write
where it can be corrected non-destructively. A med with no `doses_per_day` (PRN) never
reaches "covered" and therefore always keeps its button — which is correct, since PRN
means repeat dosing is expected.

---

## §6 — Withholding (N3's mechanism)

One exported list, mirroring `withholdingReasons` in `lib/dietTrialCard.ts`:

```ts
export type MedStripWithholding =
  | 'refused_dose'        // a 'refused' dose in the recent window
  | 'missed_dose'         // a 'missed' dose in the recent window
  | 'dose_in_doubt'       // an unconfirmed combo dose (B-156 PR B3)
  | 'intake_decline';     // the pet-level intake-decline flag is live
```

**Effect.** When the list is non-empty:

- the coverage line is **suppressed** (N3);
- in its place the card carries the **fact**, not a verdict — *"1 of the last 4 doses
  refused"* — with the register set by `clinical-guardrails` at M5;
- the confirm button **stands down**. A refusal on record means the next thing that
  happened is exactly what a one-tap `given` cannot express, and a confirm placed
  beside a refusal invites the owner to paper over it with the cheaper tap. The card
  becomes a tap-through to the Pet tab, where the full adherence UI lives.

**A reason may be added to this list, never subtracted by a downstream guard** — the
rule `lib/dietTrialCard.ts` learned the hard way across rounds 8 and 9, where each
withholding reason was patched one at a time and the next one still rendered.

**`dose_in_doubt`** is the B-156 PR B3 state: a dose given in a vehicle the pet did not
finish lands `adherence = NULL` (never auto-`given`) and resurfaces with the
`DOSE_IN_DOUBT_TAG`. It withholds here for the same reason it withholds there.

---

## §7 — The collapse rule (paying for D3)

D3 is honest about its cost: Sam's cat has three meds, an active diet trial, and
Today/Trend below the fold. The rule that pays it down **without ranking or dropping a
med**:

> **A med whose cadence is already covered today collapses to one line, with no button.**

| Cadence | "Covered today" means | Collapsed appearance |
|---|---|---|
| `doses_per_day = n` (n ≥ 1) | `n` or more non-deleted doses logged today (local day) | one line, no bar, no button |
| `doses_per_day` NULL (PRN / ad-hoc) | **never collapses** — the app cannot know a PRN med is "done" | full dress retained |

**D7 — collapse is by state, not by count.** There is no "show 3, hide the rest"
cap. A cap would silently drop a med, which is the failure D3 was ruled to prevent, and
it would drop them in an order the app has no basis to choose. Collapse is deterministic
and self-explaining: a med is quiet **because the record says today is handled**, and it
expands again tomorrow. In the steady state — an owner who logs — most cards are
collapsed most of the time, so the fold cost is paid on the days when it is doing work.

**Ordering (D8).** Cards render in a stable, non-clinical order: **expanded before
collapsed**, then by `started_at` ascending (oldest course first), then by drug name.
No relevance ranking, no severity sort — those would re-introduce the favouring D3
rejected, and a Home surface that silently re-orders itself is unreadable at a glance.

---

## §8 — Placement

Below `TrialStrip`, above `TodayZone` — the same slot, same rationale
(`app/(tabs)/index.tsx:102–110`):

```
SignalZone      ← safety insights always lead (Principle 3)
TrialStrip      ← context
MedStrip[]      ← context  ← NEW
TodayZone
TrendZone
```

**A medication is context, not an insight.** Principle 3 reserves the lead for safety
insights; a med card is standing state the owner lives with, exactly like the trial
strip. And it renders **only when there is something to render** — the resolver returns
an empty array rather than the component checking a prop, which is how `TrialStrip`
avoids putting a hole in Home for owners with no meds.

**D9 — the med cards sit *below* the trial strip**, not above, when both are present.
The diet trial is the wedge's primary object and runs for 8–12 weeks; a 14-day course is
the shorter-lived guest on that screen. This is a fixed order, not a ranking — neither
can displace the other.

---

## §9 — States

Copy is **indicative** here and locks at **M5** (`nyx-voice` + `clinical-guardrails`).
The design-locked rendering is round 2 of `docs/culprit-med-strip-mockups.html`.

| # | State | Header | Bar | Line | Button |
|---|---|---|---|---|---|
| 1 | Fixed course, today open | `Amoxicillin · day 5 of 14` | day progress | `No dose logged yet today · usually 2×/day` | **Log dose** |
| 2 | Fixed course, partly covered | `Amoxicillin · day 5 of 14` | day progress | `1 of 2 doses logged today` | **Log dose** |
| 3 | Fixed course, covered → **collapsed** | `Amoxicillin · day 5 of 14 · 2 doses logged` | — | — | — |
| 4 | Ongoing med (no duration) | `Gabapentin · ongoing` | — | `Last dose yesterday, 9:10pm` | **Log dose** |
| 5 | Ad-hoc med (no regimen) | `Prednisone` | — | `3 doses this week · last Tuesday 7pm` | **Log dose** |
| 6 | Course length reached | `Amoxicillin · day 14 of 14` | full | `Course length reached — worth checking your vet's plan` | **Log dose** |
| 7 | Past course length | `Amoxicillin · day 17 — 3 days past` | full | `Worth checking your vet's plan` | **Log dose** |
| 8 | **Withholding** (§6) | `Prednisolone · day 5 of 14` | day progress | `2 of the last 5 doses refused` | **none** |
| 9 | Not confirmable (§5.2) | `Cerenia` | — | `1 dose logged · Monday 8am` | **none** |
| 10 | Just confirmed | unchanged | unchanged | `Dose logged just now` → settles into state 2/3 | — |

**On state 6/7 — the app never says "you can stop."** Ending a course is the vet's
call, and `target_duration_days` is a length the owner typed, not a prescription the app
verified. The line is a **calendar fact plus a prompt to check**, and it must never read
as permission to discontinue — the same trap G3 named for the diet trial's GI milestone
(*"the milestone must never read as permission to stop a diet ACVIM says to continue"*).

**Nothing auto-ends a regimen** — `status` stays `'active'` until an owner ends it,
so **stale-active is the steady state here too** (B-422's finding, and it applies to
`medications` for exactly the same reason). State 7 is therefore a **normal** state, not
an edge case, and the card keeps rendering: the Pet tab is the only place a course can
be ended, so removing the card would remove the only route to ending it.

---

## §10 — PR plan

| PR | Scope | Gates |
|---|---|---|
| **M0** | **B-441** — `regimenDaysElapsed` → `localDayIndexOf`, moved into `lib/medications.ts`, zone + DST tests | unit tests; `code-reviewer` |
| **M1** | `lib/medStrip.ts` — `resolveMedStrips` (pure), the confirmability gate, `medStripWithholdingReasons`, the collapse predicate | unit tests **mandatory** (shared `lib/` logic); `code-reviewer` |
| **M2** | `components/home/MedStrip.tsx` + Home wiring below `TrialStrip`; context-only, **no button yet** | component tests; Designer |
| **M3** | The confirm action — wires `insertMedicationDose`, optimistic state 10 | `code-reviewer`; on-device QA |
| **M4** | The collapse rule + multi-med ordering (§7) | unit tests; Designer |
| **M5** | Copy + safety pass — every string in §9 | **`nyx-voice` + `clinical-guardrails` + `pm-feature-review` mandatory** |

**Why M2 ships without the button.** The card is useful as context on its own (it is
Option A), and splitting the read path from the write path means M3's review is about
one thing: a new write action on Home. Bundling them would bury that under layout
review.

**Adversarial review.** Not mandatory for M1–M4 — the strip **displays** existing
clinical data and does not compute a clinical finding, so it is not
statistically load-bearing in the DoD's sense. **M5 is where the clinical judgment
lives** (what the app asserts about adherence and course state) and carries
`clinical-guardrails` as a hard gate. If M1's withholding logic grows a threshold —
anything of the form "N of the last M" deciding *whether* to speak rather than *what* to
print — that PR becomes adversarial-mandatory.

---

## §11 — Acceptance criteria

1. A pet with an active durationed regimen renders a card with a **day-progress** bar
   whose fraction is `daysElapsed / target_duration_days` and **no** dose-derived term.
2. A pet with **only ad-hoc doses** in the last 14 days renders a card (D2).
3. A pet with **no** meds renders **nothing** — no header, no empty state, no hole.
4. The strings `missed` and `due` appear **nowhere** in the rendered output (N1),
   enforced by a test over the resolver's output, not by review.
5. A refused/missed/in-doubt dose in the window suppresses the coverage line **and**
   removes the button (N3, §6).
6. A med with no attributable identity renders **no button** (§5.2).
7. A med whose `doses_per_day` count is met today renders **collapsed**; a PRN med
   **never** collapses (§7).
8. Day counters agree with `app/(tabs)/profile.tsx` **and** the widget for a device in
   UTC−7 and UTC+11, at 00:30 and 23:30 local, and across a DST boundary (M0/B-441).
9. Tapping the card opens the Pet tab; tapping the button writes exactly one dose and
   does not navigate.
10. Every dose read filters `events.deleted_at IS NULL` — a soft-deleted dose never
    counts toward coverage and never satisfies the collapse predicate.

---

## §12 — Open, deliberately

| # | Item | Owner |
|---|---|---|
| A-1 | **`is_critical` escalation.** A missed/refused dose of a critical drug (insulin, anti-seizure, cardiac) may warrant more than withholding — but that is the standing open question on the B-117 row (*"critical-drug escalation only"*), and it belongs to the Signal safety band, not to a context strip. The strip **withholds**; it does not escalate. | PM / Dr. Chen — existing Open Question |
| A-2 | **B-394's capture path.** Once regimens are commonly created (B-302 promote-on-repeat, or infer-from-first-dose), state 5 becomes rare and `MED_STRIP_ADHOC_WINDOW_DAYS` should be revisited. Not a blocker: D2 ruled the strip ships first. | B-394 session |
| A-3 | **B-284 N7 reconciliation.** This card is the medication half of "Care due". When N7 builds, it should adopt the register rule (§0.1) rather than adding a second action row. | B-284 N7 |
