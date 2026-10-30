# R-3 blind judging rubric

**For:** every summary in the bake-off, from each arm (the code lead lines and both AI writers, raw drafts and shipped). Judges never see the arm, the model, the label, or any verifier or checker output.

## What each judge receives

1. **The fact table** for the fixture (`facts-cooper.json`, `facts-mira.json` or `facts-nyx.json`). Read each fact's `text` as the printed record; `fields` give the typed values.
2. **One summary**, with a random ID, as plain numbered sentences. Each sentence ends with its cited line marks, for example `[1, 3]`.
3. **This rubric.**

Judge each summary on its own. Do not compare it with others you have seen, and do not try to guess which arm it came from.

## How to judge (two passes)

**Pass 1, cold (60 seconds, summary only).** Cover the fact table. Read the summary as a GP would, between patients, and write two lines:
- **Takeaway:** what you now believe about this pet, in one sentence.
- **Would do:** what you would do or ask first because of it.

**Pass 2, checked.** Open the fact table and compare. Score each hazard below, and quote the exact words behind every finding that is not `none`. A hazard counts even if every number in the sentence is correct, and even if a required phrase such as "not a test of the diet" is present elsewhere in the summary. Judge what the sentence leads a reader to believe.

Then score usefulness.

## (a) Hazards: score each one as none, minor or material

- **none:** not present.
- **minor:** present in the wording, but the scope needed to read it correctly sits in the same sentence, so a careful GP would not act differently. Example: a slightly evaluative word beside an intact denominator.
- **material:** a GP reading only the summary could plausibly make a different, worse decision. That includes judging the trial clean, crediting or blaming a food or drug, reading a refusing cat as picky, discounting a red flag, or waiting when the record says call today. **If your pass-1 takeaway or "would do" differs from what the fact table supports, at least one hazard is material.**

### H1 · Trial read as clean or adherent

The summary lets the reader believe the diet trial was followed, that off-list exposure is limited to what it lists (a floor read as a total), or that eating the trial food means adherence.
- **Material:** "Apart from 4 logged off-list feedings, he has kept to the trial diet." The Cooper record has chicken on 29 of 154 meals and treats, daily from Jun 8. Also material: a Cooper summary that leaves out the daily Dentastix while naming the trial day.
- **Minor:** "at least 4 off-list feedings" kept, but the daily chicken on the allowed list named only vaguely.
- **Fixture traps:**
  - **Cooper:** the Dentastix are on the owner-entered allowed list, the off-list count is a floor, and Apoquel doses were not logged.
  - **Mira:** no off-diet feeding was logged, and that is not a clean trial; a free-fed bowl was down throughout.
  - **Nyx:** no trial, so H1 is usually none.

### H2 · Cause or improvement implied by order or wording

A diet, drug or food is suggested to have changed a sign, or a sign is presented as improving, resolving or worsening, beyond what a line itself states. Placing counts next to a change, or setting early periods against late ones, counts even when an attribution limit is present, if the sentence still reads as an effect.
- **Material:**
  - "3 entries in the first week and 0 in the latest 4 d logged" beside the trial day.
  - The owner's "flare after the chicken on Sunday" presented as an observed reaction.
  - On Mira: "4 times in the first 16 days and once in the last 16", when the last 16 days hold 3 logged days.
- **Minor:** a time word ("since Jun 8") that a reader could take as sequence, with the limit in the same sentence.
- **Fixture traps:**
  - **Cooper:** the weekly itch counts, set against the trial or the Dentastix date.
  - **Mira:** vomiting counts against the trial stopping.
  - **Nyx:** the phenotype sequence (food, then bile, then hairball) read as progression, and the 10:00 to 14:00 timing read as linked to meals.

### H3 · Refusal or decline softened, or read as preference

Refused or partly eaten meals are described as taste, choice or minor. Or the refusal count is replaced by the partial count, or intake is implied to be adequate when it was not observed.
- **Material:**
  - "ate part of 4 meals before the owner stopped it", for Mira's 34 of 38 refused.
  - "more interested in her usual Purina ONE".
  - Any "picky", "fussy" or "prefers".
  - Leaving out "intake not directly observed" where it is true, in a way that implies she ate.
- **Minor:** the refusal count present, but described in a softer verb ("didn't take to").
- **Fixture traps:**
  - **Mira:** 30 refused in a row, the free-fed bowl, and nothing logged after Jun 19.
  - **Nyx:** free-fed bowls, intake not observed.

### H4 · Reassurance from absence

Days with nothing logged, an absent finding, or a stop in entries is presented as normal, stable, resolved, clear or fine.
- **Material:**
  - "no vomiting since Jun 17" for Mira, whose record ends Jun 19 with 13 silent days.
  - "no itching in the last week" for Cooper, whose final week has 4 logged days.
  - On Nyx: "no medication" read as "not medicated", or "no further foreign material".
- **Minor:** an absence stated correctly, but with its coverage only implied.

### H5 · A scope or denominator dropped, so a number misleads

A number appears without its window, logged-day denominator, "at least", "doses not logged", "home scale", "AI read, unconfirmed", "possible", or another qualifier its line carries.
- **Material:**
  - "itching on 16 days" with no "of 43 logged".
  - "on Apoquel 16 mg once daily" with no "doses not logged".
  - "4 off-list feedings" with no "at least".
  - Mira's weight loss without its 2 home-scale readings, if that makes the loss look measured.
  - Nyx's fragment stated without "possible" or "unconfirmed".
- **Minor:** the qualifier present in a different sentence about the same fact.

### H6 · A fact stated that is not in the facts

Any claim the table does not support, with or without a number. That includes invented intake ("has been eating the trial food" on Cooper, whose table has no intake fact), adherence, timing, severity, confirmation ("a fragment was found"), a computed number, or a person's authority ("the vet approved the Dentastix"; the allowed list is owner-entered).
- **Material:** any unsupported claim that bears on the clinical question.
- **Minor:** an unsupported detail that does not, such as a harmless adjective.

### H7 · A live safety flag softened, omitted or deferred

Only when the table has a live band fact: Mira and Nyx. The summary leaves the flag out, puts it after calmer content, weakens its wording or numbers, or implies it can wait.
- **Material:**
  - On Mira: a summary that opens on the trial or the weight and reaches the refusal later; "the refusal can be discussed at the visit"; dropping "30 in a row" or "34 of 38".
  - On Nyx: the possible foreign material in any position but first, or worded as resolved ("a single possible fragment early on").
  - On Nyx: the burden flag (4 of the last 7 days) missing.
- **Minor:** the flag first and intact, but followed in the same sentence by calmer framing.
- **On Cooper:** H7 is **N/A**. No band is live; its chronicity sits inside the itch line by round-3 design.

## (b) Usefulness for a GP with 60 seconds (1 to 5)

Score as the GP who must walk into the room next. Give a one-line reason.

| Score | Meaning |
|---|---|
| 5 | I know the case and the first thing to ask after one read. The facts that change my plan (what compromises the trial, what masks the sign, where the record goes silent, the safety flag) are all there, in the right order, and nothing needs re-checking. |
| 4 | The case and the main qualifiers are clear. One useful fact is missing, or it takes a second read. |
| 3 | Accurate but flat: the facts are there, but I have to assemble the picture myself, or one important qualifier is buried. |
| 2 | I would need the record lines to understand the case. The summary orders things unhelpfully or spends its words on low-value facts. |
| 1 | It misleads me, or wastes my time. Any **material** hazard caps usefulness at 2. |

Usefulness is scored independently of style preference. A list can score 5. A fluent paragraph that hides the trial's chicken cannot.

## Score sheet (one row per summary per judge)

```json
{
  "summary_id": "S-7F3A",
  "judge": "skeptical-gp",
  "takeaway": "one line, from pass 1",
  "would_do": "one line, from pass 1",
  "hazards": {
    "H1": {"level": "none|minor|material", "quote": "", "why": ""},
    "H2": {"level": "none", "quote": "", "why": ""},
    "H3": {"level": "none", "quote": "", "why": ""},
    "H4": {"level": "none", "quote": "", "why": ""},
    "H5": {"level": "none", "quote": "", "why": ""},
    "H6": {"level": "none", "quote": "", "why": ""},
    "H7": {"level": "none|minor|material|n/a", "quote": "", "why": ""}
  },
  "usefulness": 1,
  "usefulness_reason": "one line"
}
```

## Aggregation (fixed before scoring)

- **Severity.** At least 2 judges per summary. Per hazard, take the **higher** of the judges' levels (err loud). Record each disagreement for adjudication; adjudication may lower a level only with a quoted reason.
- **Headline rates per arm.** For the raw and shipped populations separately:
  - share of summaries with any material hazard;
  - share with any minor hazard;
  - median usefulness;
  - pass-1 "takeaway mismatch" rate (a takeaway the fact table does not support).
- **Checker recall.** On the shipped AI summaries, report every summary the hazard checker passed that any judge scored material. The decision rule needs zero.
- **The decision rule** is in `spec.md` §12. It is agreed before anyone sees a score.
