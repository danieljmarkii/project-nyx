# The stage-2 confirm header — a falsified premise, and a mock round

**Date:** 2026-08-30
**Issue:** CUL-726 (mock round shipped; R6-1 + R6-2 open, build deferred)
**Outcome:** shipped via #758

---

## What this session was

CUL-726 arrived as a small mechanical fix with a design footnote. It ended as the
reverse: the mechanical half evaporated under checking, and the footnote turned out to
be the whole issue.

The issue's ask: stage 2's header renders `{typeLabel} — {petName}` on one line, so the
ellipsis always eats the **pet's** name, never the event — and "a screen reader has no
way to recover it, because nothing spells the name out." Fix: add an
`accessibilityLabel`, mirroring what CUL-682 had just shipped one screen earlier.

## The premise, falsified

A truncated React Native `Text` **still announces its full string**, on both platforms.
Checked against the shipped source rather than assumed, the way CUL-682 checked its own
`disabled` → "dimmed" chain:

**iOS**
1. `Libraries/Text/Text.js:145` — `accessible` defaults to `accessible !== false`, so a
   bare `<Text>` is an accessibility element.
2. `RCTParagraphComponentView.mm:178` — when `paragraphProps.accessible`, the element
   list comes from `RCTParagraphComponentAccessibilityProvider`.
3. `RCTParagraphComponentAccessibilityProvider.mm:60–68` — the first element's
   `accessibilityLabel` is `_attributedString.getString()`: the **full** string. The
   comment in place says it outright — *"add first element has the text for the whole
   textview in order to read out the whole text."*
4. `numberOfLines` is a paragraph attribute applied at layout. It never edits the
   attributed string.

**Android** — `ReactTextView.java:382` `setNumberOfLines` → `setMaxLines`, `:439` →
`setEllipsize`. The full `Spanned` is what `setText` receives (`:208`/`:242`), and
`TextView.getText()` — what TalkBack reads — returns it unchanged. The ellipsis is a
draw-time `Layout` artifact.

**Render probe** of this component with `petName="Bartholomew Fitzgerald"`: no ancestor
of the header `Text` carries `accessible` or `accessibilityLabel`; the node has
`numberOfLines: 1` and children `["Vomit", " — ", "Bartholomew Fitzgerald"]`. And
`react-native-svg` ships no accessibility props, so the glyph disc is **not** a separate
stop — the header title is already exactly one VoiceOver stop, reading the whole string.

So the requested label would have changed nothing a screen reader announces. It was not
built. **A fix that is visible in the diff and inert on the device is the thing this
repo keeps writing rules about**, and shipping one here would have closed the issue
while leaving the real defect in place — worse than leaving it open, because the issue
would have read as done.

One consequence worth recording rather than burying: **CUL-682's second half rests on
the same wrong premise.** Its single-pet label is still the right shape — it groups the
disc and the sentence into one node — but its stated reason ("the full name had nowhere
to survive") was not the reason. Shipped, benign, and left alone; noted on both issues.

## What is real, and worse than filed

The visual cut. Nothing on this surface sets `allowFontScaling={false}` — deliberately;
only the tab bar does — so the header scales with the owner's system text size.

Measured from the shipped Geist SemiBold TTF (17px, `letterSpacing: -0.3`) against the
column the layout actually gives it: `screenWidth − 122` (24×2 header padding, 16 gap,
20 chevron, 30 disc, 8 gap) = **268px on a 390pt phone**.

| Header string | 17px default | 21px xxLarge | 28px AX1 |
|---|---|---|---|
| `Vomit — Buddy` | 122 ✓ | 151 ✓ | 203 ✓ |
| `Vomit — Bartholomew` | 178 ✓ | 222 ✓ | **297 cut** |
| `Itch/Scratch — Bartholomew` | 233 ✓ | **290 cut** | **389 cut** |
| `Vomit — Bartholomew Fitzgerald` | **264 — fits at 390pt, cuts at 375pt** | cut | cut |

At **xxLarge — a comfort setting, not an accessibility one** — an eleven-character name
on the longest label already truncates. The issue framed this as a long-name edge case;
it is a text-size problem, and the routine state one notch above default.

**The asymmetry that decides the design.** On this surface the *type* is stated three
times — the tinted disc, the header, and the summary pill that IS the save ("Vomit ·
today at 5:33 PM") — and the *pet* exactly once. The ellipsis eats the only one said
once, on the last surface before a health row is written, where the sheet has no
switcher and the name in that header is the write-time identity.

## The ruling, and the conflict inside it

PM ruled **two lines + the type yields before the name**, mock first.

Drawing it found that those are **not directly composable**. Wrapping to a second line
needs the header to be *one* paragraph (`numberOfLines={2}` on a single `Text`); making
the type shrink first needs it to be *two* flex children (`flexShrink` on siblings).
Nested `Text` spans are inline, not flex items, so they cannot carry `flexShrink`.

The shape that delivers both intents is already shipped **one row below this header**:
**AC-CHIP**. `timeRow` has `flexWrap: 'wrap'` and `chipPair` is `flexShrink: 0`, so the
chips drop to their own line *whole* rather than squeezing. Pointed at the header: the
row wraps, the type may shrink and ellipse, and the pet's name never shrinks — it drops
to its own line intact. Same pattern, same file, no new idea.

That leaves a fork only looking can settle — what the wrapped state looks like — which
is what §07 draws (P1 dash-with-type, P2 type-as-eyebrow, P3 two-lines-only).

## Two captions that were wrong

The first draft of §07.3 asserted that at AX1 the type takes the ellipsis, and that
`Bartholomew Fitzgerald` survives whole. Both false, and measuring rather than looking
is what caught it: `Itch/Scratch —` is 203px at 28px, so it fits its own line and
ellipses nothing until AX3 (290px); `Bartholomew Fitzgerald` is 322px at 28px, so it is
the one string that *does* get cut.

The section was rewritten as a four-rung ladder with each rung's measured width on it.
It also exposed a real CSS/RN bug in the draft: a name span with `flex: 0 0 auto` and
`nowrap` **overflows** rather than ellipsing, so the last resort needs `maxWidth: '100%'`
— in RN, the same prop on the name `Text`.

*This is the CUL-613 rule applied to a mock: a frame drawn by someone who knows what it
should show will show it, whether or not it is true.*

## Decisions

| # | Decision |
|---|---|
| 1 | The accessibility half of CUL-726 is **not a defect**. No `accessibilityLabel` added; the finding is recorded on the issue and in the mock. |
| 2 | The real defect is the visual cut, and it is a **Dynamic Type** problem, not a long-name one. |
| 3 | PM ruled the direction: two lines + the type yields. Mock first, per "Mock what you change" — the round-4 frame is design-locked (F1). |
| 4 | B and C are not composable as stated; the composition is AC-CHIP's wrap + `flexShrink: 0`, reusing an in-file precedent rather than inventing one. |
| 5 | §03's stage-2 frames stay on the round-4 header until R6-1 is ruled. The page says so rather than quietly showing an unruled design. |

## Residuals

- **CUL-726** — R6-1 (P1/P2/P3) and R6-2 (is a two-line header acceptable) open. The
  build PR follows the ruling: one PR against `SimpleEventConfirm.tsx`, guards pinning
  that the name never shrinks and never wraps, no schema, no copy, no flag.
- **CUL-682** — its label's stated rationale is falsified; the label itself stands.
  Noted, not reopened.
- **`accessibilityRole="header"`** — this header has none, and only 4 sites app-wide
  use it. Real, separate, app-wide; not folded in and not yet filed.

## Files

- `docs/culprit-more-events-mockups.html` — §07 (round 6), the round-6 CSS block, Geist
  loaded from Google Fonts so the 1:1 frames are metrically honest, masthead/header
  comment/footer moved to round 6, and §06's stale "CUL-682 needs a device check" note
  refreshed now that it has shipped.

Republished to the same artifact URL as rounds 1–5, per the same-URL round convention.

No app code changed. `STATUS.md` untouched: no track started or ended, no standing hold
changed, no build phase moved, no pointer went stale.
