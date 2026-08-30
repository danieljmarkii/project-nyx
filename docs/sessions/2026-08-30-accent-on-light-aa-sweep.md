# Accent-on-light AA — the residual walk, and guarding the class

**Date:** 2026-08-30

CUL-744, the residual sweep filed out of CUL-578 earlier the same day. Shipped via #774.

## What shipped

**76 accent-as-text sites repointed to `colorAccentInk`; 5 deliberately kept on `colorAccent`, each annotated in place with its ground and ratio.** The brand teal is a glyph tint — tuned for WCAG's 3:1 non-text target — and it was colouring small text across 52 files at 2.08–2.26:1 against a 4.5:1 floor.

The five keeps, and why they are keeps rather than misses:

| Site | Ground | Ratio |
|---|---|---|
| `Snackbar.action` | `colorNeutralDark` | 8.75:1 |
| `(auth)/index.learnMoreText` | `colorBrandNight` | 8.09:1 |
| `day-summary.emptyCta` / `.retry` | `colorBrandNight` | 8.09:1 |
| `DailyRecapOffer.turnOn` | `colorBrandNightElevated` | 6.57:1 |

`colorAccentInk` on those grounds is 2.88–3.83:1 — the *failing* half of the pair. The ink is not "the safer teal"; it is the teal for a light ground, and a mechanical repoint of all 81 would have shipped a worse defect than the one being fixed, on the night surfaces, under a green diff and a green test run. That is the whole reason CUL-578 refused to widen, and it held up under the walk.

**`guards/accentOnLight.test.ts`** now fails the build on a `color:` style key holding `theme.colorAccent` unless an inline `// accent-on-dark-ok: <ground>, <ratio>` within 10 lines above it records a decision. The scanner still cannot resolve an RN style cascade and does not pretend to — it requires that somebody *did*.

Supporting assertions: `theme.contrast.test.ts` gains the dark-ground inversion beside the existing light-ground half; `FilterChip.test.tsx` and `ScopeMenu.test.tsx` gain per-render assertions off the flattened style of the rendered tree.

## The thing worth carrying forward: the enumeration was the weak part, not the fix

The issue scoped itself with `grep -rn "color: theme.colorAccent,$"` → 76 sites (77 once `-a` reached a file with a non-UTF8 byte). Dropping the `$` anchor returns **81**. The four extras were single-line style declarations:

```
recLabelAttn: { color: theme.colorAccent },
retryText: { fontSize: theme.textMD, color: theme.colorAccent, fontWeight: theme.weightMedium },
```

One of those four was **`recLabelAttn` — the `worth_a_call` escalation label on the stool and vomit AI reads.** It renders on `cardAttn`, whose fill is `colorAccentLight`, so it sat at **2.08:1** — and it was the least legible of that card's three tones:

| Tone | Was | Now |
|---|---|---|
| `worth_a_call` (escalating) | **2.08:1** | 4.75:1 |
| `monitor` | 7.17:1 | 7.17:1 |
| muted | 4.35:1 | 4.35:1 |

The escalation read faintest, which inverts the severity ordering the plainness rule depends on: plainness is meant to *be* the severity signal, not illegibility. Both sites now carry a comment saying so.

*An enumeration chosen by a grep is only as complete as the grep — and the sites it misses are not distributed randomly. They are the ones written in a different style, which is uncorrelated with how much they matter.* The four missed sites were 5% of the class and contained its single highest-stakes member.

The generalisable move was to let the guard's own pattern define the set rather than inheriting the issue's, and to check the delta rather than assume the issue had counted correctly.

## The other thing: a guard test that could not fail

Every guard mechanism was proven by mutation rather than by inspection — widen the marker window, narrow it, let one marker cover every site, drop the mandatory reason, detect on raw source instead of stripped code, widen the regex to fills, drop the word boundary. Eight mutations.

**Two of the first seven probes came back green, and they failed for completely different reasons — which is why both were worth chasing.**

One was a bad probe: the `sed` mutating the regex to `[Cc]olor:` was a no-op, because the boundary group in front still rejects `backgroundColor`. Re-run with a mutation that genuinely widened the pattern, the test reddened correctly.

The other was **a real defect in the test itself**. The window test built its fixture from `MARKER_WINDOW`:

```ts
const far = '// accent-on-dark-ok: too far\n' + '//\n'.repeat(MARKER_WINDOW) + 'color: theme.colorAccent,\n';
```

Mutate the constant to 1000 and the fixture grows to 1000 lines with it, so the marker stays outside the window and the assertion still passes. It is structurally incapable of failing — a green guard over its own defect, the same shape CLAUDE.md already records for the monotone-max property test in the taxonomy spec (`§9a`'s partition defect). It now spells both distances as literals (10 exempt, 11 not), and **both** bounds are guarded, because a single case lets a mutation pick the other side for free.

Worth stating plainly: this was written by someone who had just finished reading the CUL-613 rule, specifically to satisfy it, and it still shipped un-discriminating. Reading a guard and agreeing with it is not the check. The thirty seconds of mutation is.

## Residuals

- **CUL-752 filed** — `colorTextTertiary` (`#737373`) is calibrated for white (4.74:1) and fails AA on every elevated surface: **4.35:1** on `colorSurfaceSubtle`, 4.36:1 on `colorAccentLight`, 4.54:1 on `colorNeutralLight`. ~174 sites. Same "the ground decides" shape as this issue, different token — but probably the *opposite* remedy, since there is one token and one direction of failure, so a ~0.15 darkening likely fixes all 174 at once with no per-site judgment. Filed rather than folded in.
- The `muted` tone in the table above is an instance of exactly that, left at 4.35:1 by this PR because fixing it is CUL-752's call, not this one's.
- `components/home/SignalZone.tsx`'s SR-3 comment was corrected: it ranked a dimmed teal as "worse than the shipped accent footer", which conceded too much — the footer it compared against was *also* failing, at 2.26:1. The comparison is gone; only the reason the receded state is grey survives.

## Verification

Guard written first, run against the pre-fix tree: **81 violations, 0 after.** `tsc --noEmit` clean. `jest --ci`: **6266 tests / 288 suites green**, before and after the base merge of `main` (`f63599b`, CUL-62 — no overlap beyond a one-line CLAUDE.md addition).
