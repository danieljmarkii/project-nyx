# Geist sweep 6 of 6 — the periphery remainder + the closing audit (CUL-611)

**Date:** 2026-08-24

Shipped via #716 (draft). The last sweep in the CUL-364 §7 chain, and the one that turns the convention from something six PRs happened to follow into something the build enforces.

## What shipped

440 raw `<Text>` elements onto `ThemedText` across 108 files — `components/ui/` (the shared chrome, swept **first** per the CUL-610 scope note), `components/event/`, `components/dashboard/`, `components/vetfiles/`, `components/recap/`, `app/insights/`, `app/onboarding/` + `components/onboarding/`, `app/(auth)/`, the trial screens, `app/event/[id].tsx`, day-summary and the stragglers. Plus 33 `TextInput` styles, 10 nested-span corrections, 2 CUL-652 defects, 34 annotated exemptions, and `guards/geistRollout.test.ts`.

Face only. No layout, no copy, no logic, no schema.

## Reframing the audit is what found the bugs

The issue specifies the closing audit as a grep: *no raw `<Text>` without an explicit family*. Written literally that is the wrong question twice over. An already-Geist surface (`ask`, `report`, `settings`) is full of raw `<Text>` that is entirely correct — 96 of the tree's 583 sites, which a grep reports as violations. And a *swept* node can still render wrong, which a grep reports as clean.

So the audit resolves each node's `style` expression against the file's own `StyleSheet.create` and asks the real question: **is a family actually declared here?** That is ~60 lines more work than a grep and it is what surfaced both defect classes below. Neither is visible to a tag scan, and neither was in the issue.

## The regression the earlier sweeps shipped, ten times

Under a parent carrying an explicit `fontFamily`, a child's `fontWeight` is **inert**. RN does not synthesize weights for custom fonts, and RN's native text cascade hands the parent's resolved family down to the child; the child's numeric weight then has nothing to act on.

Which means **sweeping a parent silently flattens every weight contrast its children asked for.** Before this PR:

| Site | Declared | Rendered |
|---|---|---|
| `WeightCard :: unit` — `12.4 **lbs**` | medium under a semibold number | semibold |
| `RankingCard :: finishedSub` — `37% *finished*` | regular under a semibold rate | semibold |
| `paywall :: priceUnit` — `£29.99 */yr*` | regular under a semibold price | semibold |
| `paywall :: freeLineEmphasis` — `**Always free:**` | semibold leading a regular line | regular |
| `CountChips :: count`, `VetFilesEmptyState :: exampleLead`, the three auth inline links | medium/semibold | parent's face |

Ten sites. None of it shows in a diff, because **the child was never touched** — the defect arrives entirely from a change to its parent, in a file the author was reading for a different reason. This is the same shape as CUL-610's `Fragment` trap, one level out: correct-looking code that only becomes wrong when something above it changes.

The rule the sweeps now follow, and the reason it splits where it does:

- a nested span differing only in **colour** stays a raw `<Text>` — it *should* inherit, and a `ThemedText` there would break the cascade (the CUL-607 rule, unchanged);
- one carrying its own **weight** goes to `ThemedText` if it is copy (the wrapper derives the right face from the weight it already declares), or spells `fontFamily` on its style if it is a glyph.

`components/onboarding/ValuePreview.tsx :: vDown` is the site that needed the third answer: a `↓` inside a vet-summary value, so a glyph by the carve-out's shape rule *and* carrying a real semibold. It stays raw and names its face — neither swept nor flattened.

## The other half of the rollout nobody owned

**33 `TextInput` fields still rendered SF**, ten of them inside lanes PRs 3–5 had already swept. `ThemedText` wraps `Text`; it cannot reach a field. CLAUDE.md has named this since CUL-610 and no sweep owned it, because the chain assigns work by *surface* and a field is not a text node. Each took an explicit `fontFamily` derived from the block's own weight — and where a block declared a weight, the weight was **replaced** rather than joined, since it is inert the moment a custom family is set.

## CUL-652 measured at 2, not 7

That issue reports 7 style blocks declaring a family and a weight that disagree. The tree has **8 blocks declaring both**, of which **6 agree** (`fontBodyMedium` + `weightMedium`, etc. — redundant, harmless on iOS, and `ThemedText` already drops the redundant weight where it matters) and **2 genuinely disagree**:

- `app/settings/feedback.tsx:179` — `fontBody` + `weightSemibold`, a screen heading rendering regular
- `components/ask/AskChip.tsx:51` — `fontBody` + `weightMedium`, rendering regular

Both fixed. The discrepancy is reported on CUL-652 rather than papered over; the guard asserts the disagreement class only, so the 6 agreeing blocks stay untouched (they sit on already-Geist surfaces this issue is told to leave alone).

## The cmap check, done rather than assumed

CLAUDE.md's glyph carve-out claims Geist carries no `✓` / `✕` / `＋`. Parsing the shipped `.ttf` cmap tables for all three loaded weights confirms it exactly — and adds the other half, which nobody had written down:

```
·  U+00B7  yes    ✓  U+2713  NO     ←  U+2190  yes
✕  U+2715  NO     +  U+002B  yes    ›  U+203A  yes
—  U+2014  yes    →  U+2192  yes    ＋  U+FF0B  NO
↓  U+2193  yes
```

The rule stays stated as *is this copy?* rather than as a coverage table — deliberately, so no one has to re-read a cmap to annotate a chevron. The table is here as evidence for the rule, not as the rule.

## The guard

`guards/geistRollout.test.ts` — four assertions plus floor checks, in the shape of `guards/completionCard.test.ts`:

1. no raw `<Text>` / `Animated.Text` without a resolvable explicit family (or a marker);
2. no `<TextInput>` without one;
3. no nested node losing its weight — both directions (a raw child with an inert weight; a weightless `ThemedText` injecting regular over its parent);
4. no style block naming a family and a *disagreeing* weight.

Three design choices worth the words:

**Parsed, not grepped.** The CUL-609 comment asked for comment-stripping in both directions, citing `completionCard`'s lexical strip. Reading the AST gets both directions structurally instead: a `fontFamily` inside a comment is trivia and can never satisfy an assertion; a `<Text>` inside a comment is not a JSX element and can never violate one. Both have a detector test, because "it follows from the parser" is the kind of claim that should be pinned rather than asserted.

**Unresolvable is flagged, not spared.** A style arriving via a prop or a helper returns false and is reported. A guard that assumed the unresolvable was fine would be green on exactly the sites nobody can eyeball.

**One marker covers one site.** A "is there a marker anywhere above me" test would let one annotated chevron exempt every unannotated sibling within reach — and the file would then read as fully reviewed, which is worse than having no exemption mechanism at all. Markers and sites are walked in source order and consumed pairwise. A marker also never excuses assertion 3: it says a node is deliberately *raw*, never that it deliberately renders the wrong *weight*.

**And it was run against a known-bad tree before being trusted**, per the lesson `completionCard` paid for. Each of the four assertions was pointed at a real defect and confirmed red, then green after restore:

- reverted `VetFilesCard.tsx` → assertion 1 red, 9 findings
- reverted the `FoodPicker` input fix → assertion 2 red
- reverted *only the child* of the `RankingCard` pair, keeping the parent swept → assertion 3 red
- reverted the `AskChip` fix → assertion 4 red

The third of those is the one that mattered: my first attempt reverted the *whole* file, which reverts the parent too and is therefore **not** the bad state — the scan correctly reported nothing, and a less careful reading of that green would have shipped an assertion that had never fired.

## Absorbed, and why

`components/ui/` was CUL-650's in the parent's plan, but both scope-note comments on CUL-611 assign it here ("They're yours"), and newest-comment-wins. It is 17 non-compliant sites, it lands the guard fully green rather than with an allowlist, and it is the one directory whose swap changes every screen at once. CUL-650 can close as absorbed. PM confirmed all three scope calls (this, the TextInput class, and the CUL-652 split) before any code was written.

## Verification

`tsc --noEmit` clean. `jest --ci`: 262 suites / 5815 tests green. One snapshot updated — `EventTypePicker`'s grouped grid, where the swept `SectionLabel` now resolves `fontFamily: "Geist-Medium"` in place of `fontWeight: "500"`, which is the `ThemedText` contract rendering correctly.

The risk no test covers is unchanged from the earlier sweeps and is now the whole content of the device pass: Geist's metrics differ from the system face, so a label can wrap or a number column lose its alignment without any assertion noticing. What *is* newly checkable on device, and worth checking first, is that the ten flattened weights came back — `12.4 **lbs**` and `37% *finished*` should now read with a visible contrast they have not had since PR 5.

## Residual

The rollout is complete and guarded in source; it is **not** verified in pixels. CUL-655 (and CUL-653 for the merged sweeps) remain the only real verification, and this PR makes that pass more valuable rather than less — with `components/ui/` swept, the app is finally all-Geist at once, which is the honest moment to judge whether the "feels bland" lever moved at all.

## Postscript — the code review found two ways the guard itself could go green

An independent `code-reviewer` pass ran against the committed diff and returned **fix-before-merge**. It found no defect in the 440-site sweep, the ten nested-weight fixes, the 33 input fixes or the two CUL-652 fixes — it verified those clean, including a content-level diff of every JSX text node across all 108 files (zero copy changes) and a manual walk of all 24 nested text pairs. What it broke was the **guard**, which given D9's "no runtime backstop by design" is the part that had to be airtight.

**It probed rather than read, which is exactly why it worked.** Both findings were reproduced here before being fixed:

**1. `declaresWeight` resolved block names out of the attribute *text*** with `/styles\.(\w+)/`, so it only ever saw a style sheet literally named `styles`. `FilterChip.tsx` alone breaks that (`defaultVariant` / `filledVariant` / `onDarkVariant`). The silent version is the bad one: a raw `<Text>` child with an inert weight under a non-`styles` object went **fully green** when it also carried a `geist-ok` marker — because the marker silences assertion 1 and the regex blinded assertion 4. That combination defeated `a geist-ok marker does NOT excuse a lost weight`, the test written for precisely this. Now AST-resolved, symmetric with `hasExplicitFamily`.

**2. `familyBlocks` / `weightBlocks` were flat, unscoped by object**, so one `StyleSheet.create` vouched for another: a file with `dayStyles.label` (family) and `nightStyles.label` (none) reported the second compliant. Two style sheets in one file is the ordinary day/night shape, so this was latent, not hypothetical. Blocks are now keyed by object then key.

Also tightened the marker pairing to **nearest marker, sites in line order**. `sites` arrives in AST traversal order — parent before child, not positional — and the pairing took the *first* marker within reach, so which marker covered which site depended on JSX shape. No wrong answer on this tree, but not checkable by eye either.

**The limit that cannot be closed, now stated in the file:** a marker cannot validate its own reason. An author who writes `geist-ok` above real copy is obeyed, exactly as with `completion-card-ok` and `copy-guard-ok`. The guard makes an exemption a *named decision*; it cannot make the name a good one.

Four fixture tests added (28 total). And the lesson repeats one level up from where this session already applied it: I ran the guard against known-bad trees for the failure modes **I** anticipated, and it passed all four. The two it missed were the modes I hadn't thought of — which is the whole argument for an isolated reviewer that never saw the build conversation, and the reason "I tested it against a bad tree" is a weaker claim than it sounds.

The nit was worth taking too: four `geist-ok` markers on `·` separators and one `—` placeholder had inherited the icon-glyph boilerplate, which claims B-745's `GlyphSvg` migration owns them. It doesn't — there is no vector to replace a middle dot with. The carve-out still applies (neither is copy); the reason now says what is true, which matters more once a marker is machine-read.

## Postscript 2 — base drift, and a conflict that was two supersets

`main` moved during the wrap: **#715 (CUL-579, tap targets on the capture hot paths)**. Two files overlapped. `components/log/TimeConfidenceField.tsx` auto-merged — CUL-579 changed its `hitSlop`, this PR changed its text tags, and the two never touched the same lines.

`CLAUDE.md` conflicted, and it is worth recording *why* the resolution was mechanical rather than a judgement call: **each side had extended a different bullet of the same list, and neither had touched the other's.** My side extended the `ThemedText` bullet (the guard, the marker, the inert-weight rule); CUL-579's side extended the adjacent-hit-area bullet (its "pick the tool by the geometry" addendum) and added a third bullet about `fireEvent.press`. So the resolution is one superset per bullet plus the new one — and that was *verified* before being written, not eyeballed:

```
assert ours[0].startswith(theirs[0])   # ThemedText: main's is a prefix of mine
assert theirs[1].startswith(ours[1])   # hitSlop:    mine is a prefix of main's
assert len(theirs) == 3 and len(ours) == 2
```

The first attempt at this asserted the hitSlop bullet was *identical* on both sides and **failed** — which is the only reason I looked at it instead of keeping my copy and silently dropping CUL-579's addendum. That is the failure mode the 2026-07-25 retro was written about: the damage from a conflict happens in the resolution, not the conflict. A resolution that asserts its own assumptions fails loudly when one is wrong, instead of shipping a plausible-looking merge that quietly loses a paragraph.

Full suite green on the merged head (264 suites / 5831 tests — CUL-579's two new suites included).
