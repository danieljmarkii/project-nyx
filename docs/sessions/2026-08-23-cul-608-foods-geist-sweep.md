# CUL-608 — Geist sweep: the Foods tab + the food screens

**Date:** 2026-08-23

PR 3 of 6 in the CUL-364 rollout (`docs/nyx-app-polish-requirements.md` §7, D9). Shipped via **#713**. Blocked-by CUL-605 (#699, the `ThemedText` primitive), which had landed; PR 2 (History, CUL-607) had not, so this is the first sweep to run against the primitive and the first to meet the questions a sweep asks. The sweeps are disjoint by file and parallel-safe, so nothing waited on PR 2.

## What shipped

Every owner-facing `<Text>` on `app/(tabs)/foods.tsx`, `app/food/[id].tsx`, `app/food-capture.tsx`, `components/food/` and `components/foods/` — 14 files — now renders through `components/ui/ThemedText`. Face only: no copy string changed, no layout, no behaviour.

What that actually fixes is worth stating plainly, because "font sweep" undersells it. RN synthesizes nothing for custom fonts, so every one of those style sheets already said `fontWeight: theme.weightMedium` over a loaded `Geist` face and **rendered at 400**. The weight token was inert, and had been since the design-system PR loaded the fonts. The sweep does not add weight to these screens; it makes the weights they already declare true.

## The two questions a sweep has to answer

Neither is in §7, and both will recur in PRs 4–6, so both are recorded on CUL-364 as well as here.

### 1. A glyph `<Text>` is an icon, not copy — it stays raw

`✓ ✕ ← + ＋ ›` are rendered as text on these screens because they stand in for vector glyphs the B-745 `GlyphSvg` migration has not reached. A mechanical sweep takes them along, which looks like finishing the job.

Rather than assume Geist covers them, I parsed the cmap tables of the shipped TTFs in `node_modules/@expo-google-fonts/geist/*`. **Geist carries no U+2713 (`✓`), U+2715 (`✕`) or U+FF0B (`＋`) at all** — across all three loaded weights. Sweeping those forces a family that lacks the codepoint and hands the render to OS fallback, at a `fontSize` tuned for a different face. Both platforms do cascade, so this is a small regression rather than a tofu box, but it is a regression bought for nothing: there is no prose on those nodes to gain the face.

The rule I wrote down is deliberately *not* the cmap finding, because a per-codepoint lookup is a rule nobody will repeat: **a `<Text>` whose entire content is an icon glyph is not copy, and keeps the system face** — including the chevrons Geist *does* carry. One question ("is this copy?") settles all seven sites. Each one says so inline, because §7's closing audit greps for exactly this shape and needs the answer where it lands rather than in a doc.

A **mixed** string goes the other way. `"Confirmed ✓"` in `AlwaysAvailableCard` is prose plus a tick; the prose must get the face, so the tick falls to fallback. Unavoidable, and normal for any app with a custom font — but it is on the device-pass list rather than asserted here, because I cannot see it render.

### 2. `Animated.Text` takes the family directly

`food-capture`'s completion line animates its opacity, and `ThemedText` is not an animated component. Rather than `Animated.createAnimatedComponent(ThemedText)` — which raises a ref-forwarding question the primitive's own docstring already had to litigate under React 19 — its style sheet names `theme.fontBodyMedium` outright. An explicit `fontFamily` is the primitive's sanctioned passthrough (it is how Newsreader survives a sweep), so this satisfies the contract rather than excepting it. The `fontWeight` is dropped for the reason `ThemedText` drops it: the family carries the weight, and a numeric weight left on top invites an Android faux-bold over an already-bold face.

## Falsification

No detection engine, no clinical or statistical logic, no RLS/Storage/deletion/export path — so no `adversarial-reviewer` or `rls-privacy-reviewer` pass was owed. The sweep's own failure modes were attacked instead, since both are invisible in a diff and point in opposite directions:

- **A missed swap** renders the system face at the right weight. It looks fine. It is just not Geist.
- **An over-eager swap** takes a glyph node with it — the §1 regression above.

`components/foods/FoodRow.test.tsx` gained one test per direction, asserting the resolved `fontFamily` on the product name / meta / trial chip, and asserting the chevron carries *no* family. Then both were mutated and confirmed red before being kept: reverting `styles.product` to a raw `<Text>` fails the first, sweeping the chevron to `ThemedText` fails the second. That step is the whole point — CLAUDE.md's completion-card guard shipped green over the very defect it existed for, and a guard that has only ever been green has not been tested.

The tests deliberately assert the family **without** the weight beside it: `ThemedText` drops the weight once the family carries it, so a test expecting both would pin a contradiction.

The `code-reviewer` returned **ship-ready** and did two things worth recording, because it did not take either on trust: it re-derived the cmap check with `fontTools` across all three loaded weights (same result) and it re-ran the mutation on both new tests itself. Its one actionable note was the nested `ThemedText` at `food-capture`'s `mealTimeText` / `mealTimeAttribution` — inert today, since both styles are weightless and resolve to the same regular face, but it is the exact case the primitive's docstring warns about.

**PR 2 then answered it better, and this PR deferred.** CUL-607 (the History sweep, #711) landed on `main` mid-session having hit the same case, and it drew a firmer rule than my annotation did: **a nested span is the one place a sweep must not swap.** An inner `<Text>` that differs from its parent only in colour (or, here, size) stays raw and inherits the parent's resolved face; swapping it mechanically ships a face change mid-sentence, which no test catches and no diff shows. My version was the fragile one — a comment saying "harmless *while* both styles are weightless" — where a raw child is harmless unconditionally. So the base merge did more than resolve text: `mealTimeAttribution` reverted to a raw `<Text>` carrying CUL-607's own comment, and the two carve-out sentences were merged into one CLAUDE.md bullet rather than one overwriting the other.

That is the sweeps' parallelism working as intended, and worth noting for PRs 4–6: they are disjoint in *code* but they all write the same convention line, so the base merge is where a rule gets reconciled. Take the landed rule over your own when they cover the same ground.

## Decisions

- **Glyph carve-out, stated as "is it copy?" rather than as a coverage table** (above). The cmap finding motivated it; the rule that survives it is simpler than it.
- **`Animated.Text` gets an explicit family, not a wrapper** (above).
- **`components/ui/SectionLabel` left alone.** It renders on the food screens but is a shared primitive used app-wide; sweeping it here would change surfaces this PR does not own, silently, in a PR whose title says "Foods". It belongs to PR 6's remainder — and is worth doing *first* there, since the `components/ui/` text primitives move several surfaces at once.
- **`app/food/[id].tsx`'s multi-line `react-native` import shape restored by hand** after the mechanical pass collapsed it. A sweep's diff should be one repeated substitution and nothing else; a reflowed import is the kind of noise that makes a reviewer stop reading.

## Out-of-scope work found and filed

**CUL-651** — `app/food/[id].tsx` prints `row.ai_extraction_error` verbatim into the owner-facing "Extraction failed" banner. That column holds whatever `extract-food-from-photo` failed with: a provider message, an HTTP status, a transport fault.

It is the B-399 leak class (CUL-445 / B-477) in a shape the guard structurally cannot see. `guards/ownerFacingCopy.test.ts` keys on the **base** of the expression being error-like — `error.message`, `String(err)`, a Postgres `.details`/`.hint` — and a database column is not error-like syntactically. The guard's own known-limit note names helper indirection; this is a second shape, and worth adding to that note when CUL-651 is worked. Pre-existing, untouched here, and filed rather than folded in: it is a copy defect, not a face one.

## Residuals

- **The device pass is outstanding and is the only real verification this PR can get.** The whole change is which face renders; jest asserts the resolved `fontFamily` and nothing more. The PR body carries the script, including the two checks that exist because of the cmap finding (`←`/`✕` in the capture header, `＋` on the photo carousel's add-slide) and the mixed-string case (`"Confirmed ✓"`).
- **The one place a face swap can move layout** is text that already wraps or truncates — Geist's metrics differ slightly from the system face. A long product name on `FoodRow` (2-line clamp) is the stress case and is on the script.
- **PRs 4, 5 and 6 are unblocked and mutually parallel.** They will each meet the two questions above; CUL-364's comment answers them so the next session does not re-derive the cmap check.
