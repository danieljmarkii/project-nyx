# Culprit — Brand & Icon Direction

**Status:** Team-aligned direction (v1) — awaiting design execution + PM ratification of the two open decisions below.
**Date:** 2026-07-08 · **Session:** product-team review of the *Culprit Logo Explorations* (4 turns, 24 options)
**Rendered pitch (indicative):** Claude artifact — "Moon & Signal" direction (see session; favicon 🌙)
**Indicative master asset:** [`docs/brand/culprit-icon-moon-signal.svg`](./brand/culprit-icon-moon-signal.svg)

> All icon renders referenced here are **indicative geometric mocks** — a spec for design to execute, not final artwork.

---

## 1. What this session did

The PM ran four "turns" of icon exploration in Claude Design (Turn 1 most constrained → Turn 4 fully unconstrained) and asked the product team + an App-Store lens to (a) discuss the 24 options, (b) call out improvement opportunities, and (c) align on favourites. The PM then **delegated the pick to the team** with one north star: *"a great design that leads to great marketing and branding."*

The team resolved to a single direction — **Moon & Signal** — and mapped a verdict onto all 24 options (§6).

---

## 2. The decision

**Primary direction: "Moon & Signal"** — a warm moonlight **crescent** cradling a single **teal Signal dot**.

- The **crescent** is the night — calm, premium, the equity we already own (Nyx = goddess of night; the moon is the incumbent icon and already anchors onboarding).
- The **teal dot** is the **Signal** — the one thing the app found in the noise. The one thing that did it. It *is* the product's differentiator (the AI Signal) and it *is* the name (the culprit, caught).

One mark that is both the moon **and** the culprit.

### The strategic fork it resolves (Persona Conflict Protocol → resolved by team, PM delegated)

> **Designer + Jordan + Sam:** lead with the moon — calm, premium, on-benchmark (Calm/Oura/Linear), reassuring for an owner mid-crisis.
> **App-Store lens:** moons are a crowded cliché in Lifestyle/Health (Calm, Sleep Cycle, meditation apps) — risk of blending in; the *name* "Culprit" is the un-owned asset.
> **Resolution:** both are satisfied by the same mark. The crescent keeps the calm equity; the single teal dot makes it un-mistakable in a grid of generic moons and encodes the name. **Bridge both, don't pick a pole.**

Dr. Chen's "no pet-brand cutesiness near clinical trust" and Sam's "not cutesy about a sick cat" are honoured by keeping pet-warmth (paw/ears/tail) **out of the primary mark**.

---

## 3. The system (not just a logo)

One brand atom — the teal dot — recurs across the icon, the wordmark, and (literally) the product's Signal engine.

| Surface | Treatment |
|---|---|
| **Icon — night** (primary / App-Store face) | Midnight-indigo ground · moonlight crescent · teal dot |
| **Icon — teal badge** | Teal ground · moonlight crescent · indigo dot (the high-contrast home-screen pop) |
| **Icon — light** | Light ground · indigo crescent · teal dot |
| **Wordmark** | Crescent-as-**C** + "ulprit" in **Newsreader** (our locked display serif); the **i's tittle is the teal dot** — same atom (adopts Turn-3f) |
| **Marketing motif** | **The Whorl** — the crescent drawn as a fingerprint (Turn-3d). Hero art, loading, section breaks. Kept *out* of the app icon (ridge detail dies at icon size) |
| **Pet-warmth** | A restrained paw/constellation reserved for empty states, notifications, merch — never the primary mark |

**Legibility:** the mark holds down to 40 px; the Signal dot is nudged proportionally larger at the smallest sizes (29 px tray) so it never drops below a legible point — a refinement to lock with design.

---

## 4. Palette — a colour *world*, not just an accent

Teal alone gives a mark. Adding **midnight indigo** as a brand-night gives a *world* to market with (night sky + one point of light).

| Token | Hex | Status | Role |
|---|---|---|---|
| `colorBrandNight` (proposed) | `#13112E` | **New** | Brand / night ground, App-Store face |
| Indigo elevated (proposed) | `#251F57` | New | Cards / depth on the night |
| `colorAccent` | `#00C2A8` | Unchanged | **The one interactive accent** — the Signal dot |
| Moonlight | `#F2EEE4` | — | The crescent on dark grounds |
| `colorNeutralDark` | `#0A0A0A` | Unchanged | Type on light |

### Two rules that keep the design system intact
1. **Teal stays the single *interactive* accent** (buttons, trend line, live state). **Indigo is a *world* colour** (grounds, heroes, the icon field) — never a tappable accent. The "one accent, never decorative" rule from `theme.ts` survives.
2. **Red stays off the brand.** `#F43F5E` already means *symptom* in-app and `#DC2626` means *destructive*. Every red-forward Turn-4 mark (Verdict full-stop, Red Thread, Red-Pawed coral) would read faintly as a warning. Teal is our "gotcha."

---

## 5. Why the team landed here (the marketing/branding case)

1. **It says what the app does** — the only mark in 24 that encodes the Signal.
2. **It's distinct in a moon-crowded category** — the teal point of light is what the eye lands on in the grid.
3. **It bridges the fork** — keeps the moon's calm equity *and* answers the name.
4. **It's a system, not a logo** — one atom across icon, wordmark, colour, product → cheap, consistent marketing.
5. **It's an evolution, not a reset** — keeps teal + the incumbent moon, adds indigo; no new typeface, no abandoned equity (unlike every Turn-4 route).

---

## 6. The field of 24 — team verdict on each

`Lead` = advances now · `Keep` = has a role · `Hold` = parked, with the reason.

**Turn 1 · Six moon marks**
| Option | Verdict | One line |
|---|---|---|
| 1a Classic Crescent | Hold | Clean, but "just a moon"; superseded by 2a. |
| 1b The Crescent-C | Keep | The "C" idea graduates into the chosen wordmark (3f). |
| **1c Moon & Signal** | **Lead** | The concept — night + the one insight in one mark. |
| 1d Night Mode | Hold | Dark field + tiny star reads "sleep app." |
| 1e Eclipse | Hold | Reads as a pie/loading shape; loses the moon's warmth. |
| 1f Nyx the Cat | Keep | Pet-warmth → secondary surfaces, not the icon. |

**Turn 2 · Night indigo & refinements**
| Option | Verdict | One line |
|---|---|---|
| 2a Classic Teal Badge | Keep | Safe, max-legibility production fallback (held in reserve). |
| **2b Signal — Indigo** | **Lead** | 1c recast in the new indigo — the exact direction advancing. |
| 2c Midnight | Hold | Beautiful, but the most generic "meditation" reading. |
| 2d Afterglow | Hold | Two overlapping crescents muddy at icon size. |
| 2e Moontail | Keep | Pet homage — secondary/merch. |
| 2f Paw Constellation | Keep | Most restrained paw — still a paw. Empty states/merch. |

**Turn 3 · Swing for the fences**
| Option | Verdict | One line |
|---|---|---|
| 3a Moonpaw | Hold | Reads as a smiley face — not a paw, not a moon. |
| 3b Caught Looking | Hold | Eyes read "surveillance" — wrong tone. |
| 3c Red-Pawed | Hold | Red + paw (two guardrails); murky small. |
| 3d Whorl | Keep | Best moon↔detective bridge → adopted as the marketing motif. |
| 3e Nyx Constellation | Keep | Self-flagged not-the-icon. Merch/avatars/empty states. |
| **3f Crescent Logotype** | **Lead** | Adopted as the wordmark — crescent-C + teal tittle. |

**Turn 4 · The name is the brief**
| Option | Verdict | One line |
|---|---|---|
| 4a The Lineup | Hold | Reads as a generic bar chart at icon size; kraft off-palette. |
| 4b Red Thread | Hold | Rich idea, illegible small; red guardrail. |
| 4c The Interrobang | Hold | "Heist energy" clashes with calm/caring; "?!" reads as error. |
| 4d Circled | Hold | Purest concept, but reads as an eye/target or a UI radio. |
| 4e Chalk Outline | Hold | A chalk outline evokes a body — dangerous for an app about sick pets. |
| 4f The Verdict | Keep | Strongest non-moon identity — held as the strategic alternate. |

---

## 7. Held in reserve

- **2a Classic Teal Badge — safe fallback.** If the indigo path needs more bake time, white-crescent-on-teal ships today with zero brand risk and maximum legibility; it de-risks the App-Store deadline.
- **4f The Verdict — strategic alternate.** The one to pressure-test *if* we ever decide to lead with the name over the moon. Editorial, distinct — but abandons teal and needs a brand accent that isn't the symptom red.

---

## 8. Open decisions (need PM/Designer/Eng ratification)

1. **Adopt midnight indigo as a brand/background token?** (→ CLAUDE.md Open Questions; tracked as its own future theme PR.) The system is currently "one accent, teal." The proposal is *additive and background-only* (teal stays the sole interactive accent), so it does not violate the accent rule — but adding a brand colour is a design-system decision, not a free icon choice. Lock the exact `colorBrandNight` value and reconcile with the existing `colorSurfaceDark #101312`.
2. **Confirm moon-forward vs. keeping Verdict (4f) as a live hedge.** The team's answer is moon-forward (bridge). 4f stays on the table only if the PM later chooses "name over moon."

---

## 9. Refinements to lock before final

- [ ] Draw the crescent true-curve + squircle-aligned (these renders are indicative geometry).
- [ ] Set the wordmark in real **Newsreader**; confirm the teal tittle alignment.
- [ ] Size the Signal dot for 29 px (app tray) legibility.
- [ ] Produce iOS-18 variants (dark + tinted) + the 1024 px master (no alpha).
- [ ] Document the Whorl + pet-warmth as a secondary system so the primary mark stays clean.

---

## 10. Next steps

1. **Hand this direction to design** to execute the tightened Moon & Signal mark + Newsreader wordmark.
2. **Tokenise midnight indigo** in `constants/theme.ts` (its own PR — no interactive-accent change).
3. **Fold into the Nyx → Culprit rebrand (B-274)** — the `app.json` name + icon asset swap, before the Step-10 build.
4. **Ship the icon into App-Store submission** (`docs/app-store-submission-guide.md`) — it's on the critical path.

Tracked as **B-275** (finalise the icon/brand identity). The App-Store Consultant lens used here is not yet a formal persona in `docs/personas.md` — proposed for formalisation given App-Store Readiness is an active project.

---

## Persona sign-off

Designer ✓ (calm/premium, Principle 6, legibility) — Data Scientist ✓ (the mark = the Signal; red-vs-symptom guardrail) — Dr. Chen ✓ (no pet-brand cutesiness near clinical trust) — Jordan + Sam ✓ (reassuring, not "gotcha") — App-Store lens ✓ (differentiated, category-honest) — Dir. of Eng ✓ (design-system intact; indigo is additive/background-only; asset pipeline named) — Product Owner ✓ (B-275 filed, direction recorded).
