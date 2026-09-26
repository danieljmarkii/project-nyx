# Ask and the Signal screens block delegation and treatment attribution

**Date:** 2026-09-26 · **Issue:** CUL-1271 · **Mode:** BUILD · **Branch:** `claude/intelligent-wright-s14v0h` · **Shipped via #924**

## Why

Every never-reassure screen in the app was a wellness lexicon ("fine", "healthy", "on the mend"). Two whole classes of reassuring sentence carry no wellness word, and the CUL-1268 critique (BRK-13) reproduced seven of them passing Ask's `validateAnswer` at `ffacb4e`:

- **Delegation / containment:** "her vomiting is under control since the Sep 16 visit", "your vet has it covered", "in the vet's hands now, with 4 episodes since".
- **Treatment attribution:** "the prednisone seems to be helping Nyx's cough", "her cough has settled since the prednisone started".

Ask reads medications today, so attribution was reachable now. EN-9 and EN-10 would hand the model a visit and a since-count, which makes delegation likely.

## What shipped

- **`lib/careClaimScreens.ts` holds both arms in one module.** The Edge Functions import it as `../../../lib/careClaimScreens.ts`, and so does the client banner. Before this, the banner mirrored `phrasing.ts` by hand ("KEEP IN SYNC"); for these arms that mirror is gone. Every arm is anchored on the verdict phrase, never on "since", "vet", a drug or a date. The honest form, a dated fact beside a count, passes.
- **Five screens now carry the arms:**
  - Ask `validateAnswer`, in every mode.
  - Ask `sanitizeFollowups`.
  - The Signal's `validatePhrasing`. It runs before the per-type branches, so it covers all twelve finding types, including insight-class `trial_response`.
  - `validateSummary`, added at the PM's go-ahead.
  - `validateBannerPhrasing`.
- **The decline tool's `clarifier` is screened.** It was the one model-authored channel no screen read. It now passes `validateAnswer` in general mode or falls back to the designed default.
- **Ask `SYSTEM_PROMPT` rule 10:** visits, care and treatments are relayed as dated facts beside counts, never as containment or effect. A "is it helping?" question gets deferred to the vet *without repeating the owner's effect word*. Otherwise the deferral itself would trip the screen.

## Reviews

- **`code-reviewer` (fix-before-merge, all fixed):**
  - False positives on past-tense "helped herself" / "worked through" and on bare "responds to her name".
  - Five insight-class Signal branches were unwired. That was fixed by hoisting the check above the per-type branches.
- **`adversarial-reviewer` (HOLDS WITH GAPS), about 250 paraphrases against the real functions.** Adopted, with fixtures:
  - The hands arm had hard-coded `nyx's`, so "in Juniper's vet's hands" passed.
  - The fronted clause "Since the prednisone started, her cough has settled" passed, as did "has since settled".
  - Also closed: "seems to help", "did its job", "Nyx's vet has this", "keeping an eye on it", "well controlled".
  - Comparisons and absences anchored on the date now block: "coughed less since", "appetite has come back since" (which passed the *safety* intake screen), "hasn't vomited since".
  - My second push regressed "She's responding to the prednisone"; that is fixed.
  - False positives fixed: "your vet worked her up", "vomited behind her bowl", and the rule-10 deferral.
  - Not adopted: a bare "will/would help". "Logging will help your vet" is honest copy, so only an effect on a symptom or the pet is screened.
- **Proof:** mutation, per C-18. Deleting each arm and unwiring each call site (seven in `validatePhrasing` before the hoist, then the hoist itself), plus the clarifier screen, the fronted-since arm, the any-possessive hands arm and the `respond` arms. Every mutant turned its fixtures red, and the tree was restored each time.
- **Suites:** jest 11,809 passed, Deno 1,848 passed, `tsc` clean.

## What stays open

- **Paraphrase no word list will close** ("the worst is over", "doing better on the prednisone", "Nyx responded to the prednisone" with a drug name as the object). This is CUL-271's structural question: a denylist, an allowlisted recount, or a judge. Commented there.
- **The Signal's `PHRASING_SYSTEM` and summary prompt have no rule-10 equivalent.** Once EN-10 puts a visit or drug into `phrasingPayload`, the screen is the only defence. Commented on CUL-1140.

## Deploy

Merging redeploys `ask` and `generate-signal`, because their closures now include `lib/careClaimScreens.ts`. Neither has a hold. No schema change.
