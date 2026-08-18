# Session Summary — 2026-08-18 · CUL-185 (B-782): WET/DRY format tag on the Daily Recap day spine

**Mode:** BUILD (Quick Win render-parity fix). **Outcome:** shipped via **#676** (draft).

### Build Phase
Parallel track — **The Daily Recap** (B-762 / DR-1 §2.4). A UX-polish parity follow-up to the DR-1 day spine (CUL-23), one of the `pm-feature-review` follow-ups filed off that build (B-778/781/782). Not part of the DR-0…DR-7 build sequence (which is complete).

### What Was Built
- **`components/recap/DaySpine.tsx`** — the spine now renders `describeDayEvent`'s `formatTag` (the B-568 wet/dry disambiguator). The title line was wrapped in a `titleLine` row so the title (`flexShrink:1`, `numberOfLines={1}`) truncates while the tag (`flexShrink:0`) holds its width — the "sibling, never a suffix" rule the `formatTag` docstring mandates. Screen-reader label extended to read the tag in visual order (title, detail, tag-lowercased, sub-line, time). File-header comment updated to name the tag.
- **`components/recap/DaySpine.test.tsx`** — 3 new cases: renders WET/DRY on two colliding rows, suppressed when the mapper returns null, and the a11y order with the tag.

Pure render addition — the mapper already produces `formatTag` and `DaySummaryRow` already carried it. **No mapper/schema/store/Edge Function change; no redeploy.**

### Decisions Made
- **Placement = option A (inline sibling), PM-ruled this session.** Not the "Trial diet" sub-line slot, because a meal can be *both* trial-diet and wet/dry — the tag and the sub-line can't share the slot. Matches the two sibling timeline surfaces that already render the tag (the Calendar drill-in `DayEventsSheet`, History `EventRow`), so all three name a food identically ("one mapper, all surfaces").
- **Night token = `colorTextOnNightMuted` (7.6:1), not `colorTextOnNightFaint` (3.8:1).** The tag is small *informational* text (it disambiguates two identical rows), so it must clear night AA like the time and sub-line — the same rule DaySpine's own comments already state for those.

### Persona Flags Raised
- **`code-reviewer` → ship-ready.** No bugs, no anti-patterns; confirmed dot-alignment preserved (the wrapper row is a plain stretch-child of `body`, so the title's resolved width and the dot's `DOT_TOP` alignment are unchanged), AA token correct, register parity holds (the `weightMedium`/`fontWeightMedium` split across sibling surfaces is a pre-existing theme alias, same `'500'` value — no drift).
- Not clinically/statistically load-bearing (a descriptive food-form tag — no read, verdict, or escalation), so no `adversarial-reviewer` pass warranted (stated in the DoD).

### Known Issues / Tech Debt
- **CUL-540 (filed, Low)** — a pre-existing a11y-order nit the review surfaced on `DayEventsSheet`: its a11y label reads `title, formatTag, detail` while it renders `title, detail, formatTag`. DaySpine's new order is the correct one; the drill-in should be brought into line. Not folded into this PR (different surface, out of scope).
- **DayLane checked, no gap.** DR-2's Home recap band was considered for the same parity but renders **dots only** (no titles/text; hidden from the screen reader — meaning lives in the count line beside it). No food-name surface there, so no tag applies. Nothing filed. (The PR body's initial "may not fit" note was corrected to this finding.)

### PM Action Items
- [ ] Review + merge draft PR **#676** (the PM merges by hand). On merge, the native GitHub↔Linear integration moves CUL-185 → Done.
- On-device spot-check (in the PR's Manual QA): a food logged in two formats today renders two distinguishable spine rows; a long name truncates while the tag survives; node dots stay aligned.

### DoD
- [x] AC (DR-1 §2.4 "one mapper, all surfaces"): spine renders `formatTag`, parity with drill-in + History; mapper suppression inherited (null → nothing).
- [x] Diff scanned against anti-patterns — none (theme tokens only, no inline styles, no hardcoded values, no new tap target, night AA respected).
- [x] `tsc --noEmit` clean; lint N/A (repo has no lint script — CI is tsc + jest).
- [x] Tests: 3 added; `DaySpine` 6/6; full pre-push suite **238 suites / 5301 tests** green. (Diff touches a component, not a store/Edge Function/`lib` utility, but the component test covers the new render logic.)
- [x] No new secret.
- [x] Persona sign-off — Designer ✓ (Principle 6 clinical-grade scannability, night AA) · Engineer ✓ (flex layout, dot alignment, token parity) · Data N/A · Dr. Chen N/A (descriptive tag, no read).
- [x] Adversarial review — N/A (not clinically/statistically load-bearing).
- [x] Future-self — reuses the shipped B-568 pattern; no new pattern introduced.

### Recommended Next Steps
- Merge #676. Nothing depends on it (leaf polish).
- **CUL-540** (drill-in a11y order) is a ready-to-run, disjoint Quick Win if a session wants to fold it in next.
- The open Daily Recap umbrella item is unchanged: the §5.5 portfolio slate reaction + the CUL-27 finish-pass decision briefs (B-779 refusal-clause ratification, B-780 multi-pet).

### Documentation Updates
CLAUDE.md — none.
STATUS.md — pruned B-782 from the Daily Recap section's open-follow-ups list (now: shipped via #676). Applied inline.
/docs/ files — none proposed.
