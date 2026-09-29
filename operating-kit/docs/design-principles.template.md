# {{PRODUCT}}: Design Principles

**Version:** 0.1, DRAFT (living; version in this header, never the filename) · **Last Updated:** {{DATE}}

## About this document
A constitution, not a component library. Read it before designing any surface, writing any user-facing string, or proposing any interaction. Update it when the PM ratifies a new principle or revises one; each revision is appended to the principle in dated italics: *Revised YYYY-MM-DD (PM-approved; source issue).*

**How a principle is written.** An imperative title; a paragraph on why it exists, grounded in the user's real moment; a **What this means in practice** list; and **The test:** one falsifiable question a reviewer can answer yes or no.

**A rule is a floor with a date on it.** When a better design violates a principle, raise a better-than-the-rule brief rather than quietly complying or quietly deviating. The predecessor project learned that a principles doc written only as restraint ("never" 66 times, "delight" zero) blocks good work as reliably as it blocks bad work; write at least one principle about what the product should *do*, not only what it must avoid.

---

## Design philosophy
{{THREE_ONE_LINE_THESES}}

---

## Core principles

The seven below are the predecessor project's, rewritten domain-neutral. **They came from a consumer mobile logging app: rewrite, don't fill.** For a desk-based or B2B product several change shape (capture speed becomes review throughput; the daily nudge may not exist; monetization is not "core is free"). Keep, adapt or replace each one at onboarding; the PM ratifies the final set.

### 1. Zero decisions at the moment of capture
The moment a user records something is the moment they have the least attention to give.
**In practice:** pre-select context; auto-stamp time; the primary choice is a single tap; optional fields sit below the fold.
**The test:** {{TIME_TEST}}

### 2. Confirmation over entry
Set up once; after that, routine work confirms something the system already proposes, and the system learns its defaults from what the user actually does.
**The test:** after week one, does any routine capture require typing?

### 3. Home is an understanding surface, not an archive
It answers the question the user is actually asking before they ask it: a curated, prioritized set, where concerns always lead and are never dropped to honour a layout cap. Never a feed, a nav menu or an upsell. Critical findings stay deliberately plain, so plainness itself signals severity.
**The test:** in five seconds, does the user know what matters today and why?

### 4. The nudge is warm, not nagging (if the product nudges at all)
At most one per day, specific copy, sent only when there is something genuinely worth saying.
**The test:** read it aloud. A thoughtful friend, or a metrics target?

### 5. Empty states are features
Warm, honest, forward-looking: name what is being built and when it pays off. A surface that renders only when it has something must **label its quiet** in one explicit line, never shrink silently.
**The test:** does a brand-new user feel invited or deflated?

### 6. The professional artifact is professional-grade
Anything read by {{DOMAIN_EXPERT}} is dense, scannable in about 60 seconds, explicit about its date range and denominators, and free of decoration.
**The test:** can a stranger extract what matters in 60 seconds with no context?

### 7. {{MONETIZATION_PRINCIPLE_TITLE}}
{{MONETIZATION_PRINCIPLE}}  <!-- the predecessor's: "Monetize convenience, never the core outcome: if gating a feature reduces the quality of care, it is free." A B2B product needs its own version, e.g. "never gate the safety signal behind a tier". -->
**The test:** {{MONETIZATION_TEST}}

---

## Cross-cutting rules
- **Data marks carry their context:** a mark per fact, a count on every mark, the denominator in view, the uncounted disclosed, the window named.
- **No option ever hides:** wrap, segment or sheet; never silent horizontal overflow. Pick the control shape by set size (≤5 short options → visible chips; 2–3 equal windows → segmented; a long or growable set → a menu sheet). A non-default filter always shows an active cue.
- **Navigation by kind:** a tab is a destination you act within; a computed view is a doorway, not a tab.
- **Motion is restrained:** nothing loops on its own, completion beats are small, and critical items never arrive differently from benign ones.
- **Onboarding completes at the first real capture**, not at setup.

## Copy principles
Specific over generic. Warm without being cute. Plain language, translated at the UI boundary. No exclamation marks manufacturing enthusiasm. No alarm language before the data justifies it; never reassurance on absence. Name the object of care. Full rules: the `product-voice` skill.

## Visual language
{{TONE_TYPE_COLOUR_MOTION_ICONOGRAPHY}}

## Benchmarks
{{DESIGN_BENCHMARKS}}. When in doubt: would a designer there be proud of this screen?

## Open design questions
| Question | Status |
|---|---|
