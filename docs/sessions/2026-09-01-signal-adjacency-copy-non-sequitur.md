# Signal card — the cough↔vomit adjacency clause read as a non sequitur (CUL-778)

**Date:** 2026-09-01
**Shipped via #790.** _(Branch `claude/signals-confusion-text-bug-512b7q`.)_

## What this was

The PM opened Home for Nyx, who has a chronic cough and chronic vomiting both on the
record, and read on the leading Signal card: _"Coughing and vomiting are easily
confused, so raise both with your vet together."_ Their question, verbatim: _"How does
that even make sense? How did that pass the personas text and voice pass?"_

Both halves of the question had an answer, and the second one is the finding.

## Why the sentence existed

CUL-676 (W1-PR-3b session 2, #732) added the §9 cough↔vomit adjacency disclosure:
when both courses are chronic, the composition layer marks the leading chronicity
card and the template appends a clause. The clinical basis is owner misattribution in
both directions — a cat's asthmatic cough posture looks like bringing up a hairball,
so coughs get logged as vomits, and a hard coughing bout can end in real vomiting, so
vomits ride on coughs (VCA, via the evidence pack §V.1d). The engine may never write
the hairball explanation, so the clause named no mechanism.

## Why it read as nonsense, and how it shipped

The adversarial pass on #732 rewrote the first draft from _"may describe some of the
same moments"_ (double-counting, the deflationary reading) to _"easily confused"_
(misattribution), and cut it to fit `validatePhrasing`'s 320-character cap. Both
changes were right on the clinical axis. Nobody then re-read the result for voice:
the #732 session record carries **no Designer or nyx-voice sign-off and no DoD persona
line at all** — the only reviewer named is the adversarial pass. So the card shipped
the _conclusion_ of the clinical caveat with its premise deleted, and to an owner who
had logged both signs deliberately it read as the app doubting the record.

**The rule this adds to the manual:** when an adversarial pass rewrites owner-facing
copy, the voice pass has to run _after_ it, not before — a clause optimised for
clinical honesty under a length cap is exactly the kind that loses its premise.

## What shipped

Three owner surfaces, one clinical surface deliberately untouched:

- **Card face** (`generate-signal/phrasing.ts`, `templateChronicity`): _"Coughing is
  logged too — a cough can look like retching or end in vomiting. Mention both."_ The
  bridge names the sign the card is _not_ about (a vomit-led card says coughing, a
  cough-led card says vomiting), so the cough no longer arrives from nowhere. Composed
  worst case (Bartholomew, 137 episodes, firm, a **September** onset) is **306 of
  320**.
- **Tap-to-expand** (`lib/signalCopy.ts`, `evidenceText`): same bridge and premise,
  then _"so the two can be hard to tell apart even when you're watching closely —
  either count could run low as easily as high"_. Attributes the blur to the **signs**,
  never to the owner's logging, and now sits _before_ the disclaimer so the expand
  closes on the same line the card does (it previously trailed after "not a
  diagnosis").
- **Vet phone script** (`lib/signalCopy.ts`, `phoneScript`): the "Also mention" row is
  now _"coughing as well — a cough can look like retching, so some episodes may be
  logged the other way round"_. The first rewrite said the counts _"may blur
  together"_, which is the overlap reading the #732 adversarial pass had rejected —
  the cold owner read caught it coming back in through a different door.
- **Composition fix** (`generate-signal/detection.ts`, `discloseCoughVomitAdjacency`):
  the note now marks the leading **cough-or-vomit** card, not the leading chronicity
  card of any sign. A longer diarrhea course could previously carry a note naming
  neither of its own counts — harmless under the old abstract wording, wrong the
  moment the clause opens "Vomiting is logged too". Pinned by a `detectSignals`-level
  fixture where diarrhea leads.
- **Vet report** (`generate-report/render.ts`): untouched. Its clinical register
  already carried the premise ("post-tussive vomiting, and cough mistaken for hairball
  retching") — the defect was owner-copy only.
- **Ledger:** `generate-signal` → `pending` (redeploy owed from main after merge;
  live v33 renders the old sentence until then). `generate-report`'s **hold is
  unchanged**; its fingerprint moved only because it inlines `detection.ts`.

## Reviews

- **pm-feature-review** (cold read as Sam/Jordan) on the first rewrite: NEEDS-WORK on
  all three surfaces — card never says the cough is logged; expand after the
  disclaimer; expand's "your counts may be off" reads as accusation; phone script
  reintroduced the overlap model. All four taken. Its one PM decision — "retching" vs
  "gagging" — resolved for "retching" (names the posture the owner sees; no length
  cost).
- **adversarial-reviewer**, pass 1 (on the bridged copy): FAIL, two findings, both
  taken. **(1) The "worst case" length fixture was the best case** — it pinned a May
  onset, the shortest month name, and read 318/320; the same card with a September
  onset was 323 and failed the contract the comment beside it cited. The card premise
  is now the shorter _"a cough can look like retching or end in vomiting"_ ("hard"
  lives on in the expand, where there is room), and the cap test pins September with a
  long name: 306/320. **(2) Two existing engine guards were vacuous** — "a chronic
  cough with no chronic vomiting is not marked" and "two chronic GI courses are not
  marked" called `detectChronicity`, which never sets the flag, so deleting the whole
  cough+vomit precondition left the file green. Both repointed at `detectSignals`;
  the deletion now reds them (mutation-checked in a scratch copy, alongside the
  symptomType guard and the bridge). Twelve copy mutations all discriminated. One
  clinical residual for Dr. Chen, not a break: on the vomit-led card both premise
  clauses read as airway explanations of the vomiting; the clause closes on "Mention
  both", so the action is escalatory, and no count is netted down.
- **adversarial-reviewer**, pass 2 (on the pushed head, after a session resume lost the
  first attempt to run it): **PASS**, one required fix taken, one residual. The fix is the
  same class as pass 1's, one axis over: the cap fixture enumerated the month but pinned
  `tier: 'firm'`, and the non-firm ask ("worth a word with your vet") is one character
  longer — real ceiling 307/320, a 24-letter pet name. The fixture now asserts both tiers
  and that the non-firm one is the longer. The residual: the card face is the only one of
  the three surfaces that dropped the "hard" qualifier ("a cough can look like retching
  **or end in vomiting**"); the vomiting card still carries its own vet ask and "Mention
  both", so nothing reads as "the vomiting is just the cough", but the trim landed on the
  qualifying word on the most-read surface. Restoring it costs ~9 of 13 chars and re-enters
  the voice pass. Appended to the Dr. Chen brief on CUL-778. Twelve source and client
  mutations each reddened exactly their own guard; reachability of the note on a non-pair
  card held across ranking, Home, the report path and the cross-pet banner.

## Tests

- `phrasing.test.ts`: the worst-case cap test now asserts both directions of the
  premise, the bridge on both leaders, and the absence of "easily confused" /
  "overlap" / "blur" / "hairball". The enumeration test's adjacency arm is scoped to
  cough/vomit (the two signs the engine can mark).
- `laneMembership.test.ts`: the diarrhea-leads fixture.
- `lib/signalCopy.test.ts`: a `§9 cough↔vomit adjacency` block — expand premise +
  bridge + ordering, a byte-identical refactor-safety test for the unmarked path, the
  phone-script row on both leaders, guardrail regexes on the adjacency arm.
- Full jest + both Deno suites green; `tsc` clean.

## Residuals

- The three owner surfaces are still three hand-written strings. The cold read
  proposed one shared clause source (the `lib/dietTrial.ts` shape); filed as
  CUL-779.
- The composed card is at 307/320 on the longest month, the longer tier ask and an
  11-letter name. A pet name past 24 letters breaches the contract; the template still ships (chronicity is
  template-only and `phraseFinding` returns before validating), so that is a contract
  breach rather than a render break.
- Dr. Chen residual (adversarial pass 1, #4): on the vomit-led card both premise clauses
  read as airway explanations of the vomiting, with the "either direction" hedge only on
  the expand. Recorded on CUL-778 for a ruling; not a build blocker, since the clause
  closes on "Mention both" and nets nothing down.
