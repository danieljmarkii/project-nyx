# Culprit — Filter & Scope UX Pattern Language
**Version:** 1.0 | **Last Updated:** 2026-07-24 | 🌱 Living

The app-wide answer to "which UI shape does a filter get?" — written after the History filter rework (#421) at the PM's direction ("Love the bottom sheet. Maybe that's the UX we go with app-wide for filters? I'll let the designer weigh in on that."). This is the Designer's weigh-in, grounded in a full inventory of every filter/scope surface in the app (2026-07-24).

**The headline finding that shapes this doc:** the bug class that prompted it — the hidden-overflow horizontal option rail (B-146) — is **already dead app-wide**. History's event-type rail was the last one; #421 retired it. Every other surface is on a wrapping `ChipGroup`, a segmented control, or has no filter at all. So "ScopeMenu app-wide" is a *consistency* question, not a bug hunt — and the inventory says consistency is already ~achieved. This doc **locks the pattern language** so it stays that way, and names the only two surfaces where a conversion is even arguable.

---

## 1. The four sanctioned shapes

| Shape | Component | Use when | Shipped examples |
|---|---|---|---|
| **Wrapping chip group** (capture) | `components/ui/ChipGroup` | The options **are** the screen's content — a capture/edit form field. | Medication Form/Route, food Format, pet Gender |
| **Visible lens chips** | `components/ui/ChipGroup` (filter usage) | A lens over a list with **≤5 short options that always fit without scrolling**, on a hot path where the one-tap switch matters. | FoodPicker scope (All/Meals/Treats/Wet/Dry), report range (Default/Custom…), Calendar lens (2–4 dynamic chips) |
| **Segmented control** | hand-rolled (tablist a11y) | Exactly **2–3 fixed, equal-weight windows** over the same data. | Metric detail Week/Month/3-Month |
| **ScopeMenu** (pill + sheet) | `components/ui/ScopeMenu` | A lens over a list where the set is **long (≳5), growable, or long-labelled**, or header space is scarce. | History event type (10), History date scope (4 + day drill-in) |

**Banned everywhere, no exceptions:** the hidden-overflow horizontal option row. B-146 killed it for capture pickers; #421 deleted its last carve-out (History's edge-fade rail — the peek cue that failed a real owner looking for the Medication filter). Horizontal scrolling remains legitimate only for *browse* shelves (Recent foods/meds), never for a closed option set — and always with a visible "there's more" cue.

**Why not sheets for everything:** a sheet costs a tap. It earns that tap by making a long set un-hideable. For a 2–5-option set that already fits on screen, the sheet *removes* at-a-glance visibility and adds friction on hot paths — a regression dressed as consistency. The rule is lens-shape-by-set-size, not one-shape-fits-all.

---

## 2. Rules every filter obeys, regardless of shape

1. **No option ever hides.** Wrap, segment, or sheet — never a hidden overflow. Sheets scroll *visibly inside themselves*, capped at 75% screen height (`ScopeMenu` does this by construction).
2. **Filtering is always legible at the control.** Any non-default scope shows a visible active cue — tinted pill (`ScopeMenu`), filled/tinted chip (`ChipGroup`), raised segment. "Why is my list short?" must be answerable from the header alone (#421's tint rule).
3. **Defaults are explicit options** ("All types", "All time", "All") — never an implicit nothing-selected state on a filter.
4. **Accessible by role:** radio semantics with announced selected state (`ChipGroup` radiogroup, `ScopeMenu` sheet rows); segmented controls use tablist/tab.
5. **An option that expands dependent inline UI stays visible.** The report range's "Custom…" reveals From/To date pickers in place — a sheet would sever the control from its own dependent UI. Such sets stay as visible chips.
6. **Filter state is screen-local** (resets on remount/pet switch) unless a spec says otherwise; deep-link doorways may set it (History `?date=…`), and a transient scope not in the option set renders as an override label on the pill with no sheet row selected (the B-308 day drill-in pattern).

---

## 3. Inventory & verdicts (2026-07-24)

| Surface | Control today | Options | Verdict |
|---|---|---|---|
| History type + date (`app/(tabs)/history.tsx`) | ScopeMenu ×2 | 10 / 4 | **Reference implementation** (#421) |
| FoodPicker scope (`components/log/FoodPicker.tsx`) | Visible lens chips | 5 short | **Keep** — hot log path; always visible; converting is a discoverability regression (D1) |
| Calendar lens (`components/dashboard/PatternCalendar.tsx`, B-310) | Visible lens chips | 2–4, dynamic | **Keep, with a named trigger** — convert to ScopeMenu if a pet's lens set reaches ≥5 (D2, → backlog B-405) |
| Metric detail range (`components/dashboard/MetricDetailScreen.tsx`) | Segmented | 3 fixed | **Keep** — textbook segmented case; carved out of any "app-wide" mandate |
| Report range (`app/report.tsx`, B-222) | Visible lens chips | 2 | **Keep** — "Custom…" expands inline date pickers (rule #5) |
| MedicationPicker / Foods tab / Patterns dashboard / Home | no filter control | — | Nothing to convert |
| Medication "Type" (Rx/OTC), Form/Route, food Format, etc. | ChipGroup (capture) | — | Out of scope — settled capture pattern (B-146) |

---

## 4. The two live decisions — recommend-and-proceed

- **D1 — FoodPicker scope chips stay visible chips.** Team rec (Designer + Jordan/Sam): the meal log is the app's hottest path; five short always-visible options beat a two-tap sheet, and nothing can hide (they wrap). Revisit trigger: the set outgrows one wrapped row on the smallest supported width. *(Related but separate: B-396 — whether an active scope chip should also narrow the rotation shelf. A behavior question, not a shape question; unchanged by this doc.)*
- **D2 — Calendar lens selector stays chips, with a conversion trigger.** Today it's 2–4 chips on a card with room. The set is dynamic (one per active symptom + "Meals"), so it *can* grow: at **≥5 lenses** the chips start crowding the card and the surface converts to a ScopeMenu pill in the card header. Tracked as **B-405** so the trigger isn't lost.

Both are recommend-and-proceed (reversible, no code shipped on them today); PM can override either — the conditional PRs below are pre-scoped for that case.

---

## 5. PR plan — deliberately conditional

**No unconditional code PRs.** The app already satisfies §1–§2 everywhere. The plan exists so an override or a trigger has a ready-made, session-sized PR:

| PR | Fires when | Scope | Gates |
|---|---|---|---|
| **F1 — Calendar lens → ScopeMenu** | D2's ≥5-lens trigger, or PM override | Replace the card's `ChipGroup` with a ScopeMenu pill in the card header (icon-less options; dynamic set; keep the drill-in-close-on-switch behavior + pet-switch reset) | `code-reviewer`; §6 AC |
| **F2 — FoodPicker scope → ScopeMenu** | Only on PM override of D1 | Pill beside the search field replacing the pinned chip row; must compose with search collapse (B-355 geometry) | `code-reviewer` + `pm-feature-review` (hot path); §6 AC |
| **F3 — Tier-2 doc edit** | PM sign-off | `design-principles.md` gains the §1 shape table + the §2 rules (flagged per Tier-2 protocol — **not written unilaterally**) | PM confirmation |

CLAUDE.md's Code Conventions carry the one-paragraph version of §1 (Tier-1, updated with this doc).

---

## 6. Acceptance criteria for any future ScopeMenu conversion

- [ ] Every option renders as a full-width sheet row; the sheet scrolls visibly within the 75% cap on the smallest supported screen
- [ ] Pill tints (accent border + `colorAccentLight` + accent label/chevron) whenever the value is non-default or an override label is set
- [ ] Pill announces `<prefix>: <current>`; rows announce selected state; scrim is labeled and closes without firing onChange
- [ ] hitSlop reaches the 44pt floor vertically; horizontal slop only if no sibling pill sits within 16pt
- [ ] Labels/glyphs read from the canonical constants (`EVENT_TYPES`-style single source), never re-declared
- [ ] Existing deep-links/derived scopes render as override labels, not fake options
- [ ] Tests: option list renders complete; select fires + closes; default fires `null`; override deselects all rows (mirror `ScopeMenu.test.tsx`)
