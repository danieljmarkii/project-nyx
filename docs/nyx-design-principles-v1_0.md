# Project Nyx — Design Principles
**Version:** 1.0 | **Status:** Stable | **Last Updated:** May 2026

---

## About This Document

This document is the design constitution for Project Nyx. It answers two questions: what does Nyx feel like, and how do we make every product decision consistent with that feeling?

It is not a component library. It is not a style guide. It is the set of principles that makes both of those things coherent.

**Read this before:** designing any screen, writing any copy, specifying any interaction, or making any decision about what the app shows or hides.

**Update this document when** a core design assumption is invalidated by user research, a new surface (vet portal, widget, notification) requires principles not covered here, or the product team agrees a principle needs revision.

---

## The Design Philosophy

### Invisible Complexity. Visible Calm.

Nyx holds a tremendous amount of complexity — longitudinal health data, food libraries, AI correlation engines, clinical export formats — and Jordan should feel none of it. Every interaction should feel like the app already knew what Jordan needed. The complexity lives in the system. The surface is always calm.

This is not simplicity for its own sake. It is restraint in service of trust. A pet owner in the middle of a health scare does not need a feature-rich dashboard. They need one clear signal: *is my pet getting better?*

### The App Earns Its Place

Nyx lives on Jordan's home screen only if it earns that position daily. It earns it by being faster to open than a notes app, smarter than a spreadsheet, and more useful every week than it was the week before. Every design decision must be tested against this question: does this make Nyx more worth opening, or less?

### Data Is Not the Product. Understanding Is.

We are not building a logging tool that happens to have charts. We are building an understanding tool that happens to require logging. The distinction matters at every level of design. A log feed is an archive. An insight is a reason to act. Nyx shows Jordan what the data means, not what the data is.

---

## Core Design Principles

### 1. Zero Decisions at Moment of Event

The most important logging moments happen when Jordan is least equipped to make decisions: half asleep at 2am, mid-walk, mid-worry. Every decision we require at the moment of logging is a log that doesn't happen.

**What this means in practice:**
- Pet is pre-selected (single pet at MVP; most recently active pet in multi-pet)
- Time is auto-stamped — Jordan never types a time
- Food library is pre-populated from onboarding — Jordan confirms, not enters
- Event type is a single tap, not a menu
- Severity is a simple scale visible in one glance, not a dropdown

**The test:** Could Jordan complete this log with one hand, in the dark, in under 10 seconds? If no, redesign.

---

### 2. Confirmation Over Entry

The food library is the foundation of this principle. Jordan sets up their pet's diet once — during onboarding or on first encounter with a new food — and every subsequent meal log is a confirmation of something already known, not a new entry.

**What this means in practice:**
- Morning feeding: one tap on the pre-set food confirms it happened
- New food: one-time add to the library, then it becomes a tap forever
- Deviations (treats, snacks, new variety) surface as quick-adds that become library items
- The library grows passively — Jordan never feels like they're building a database

**The test:** After the first week of use, should any meal log require typing? No. Ever.

---

### 3. The Home Screen Is an Intelligence Surface

Jordan opens the app to understand, not to scroll. The home screen answers the question Jordan is actually asking — *is Luna okay, is it getting better?* — before Jordan has to ask it.

**The three-zone home screen:**

**Zone 1 — The Signal** (dominant, top)
One AI-generated insight, updated daily. A sentence, not a number. Warm, confident, specific. "Vomiting is down 60% since you switched to turkey." In the empty state (first 5–7 days): an honest, warm message about what's being built. Never a placeholder. Never generic.

**Zone 2 — Today** (middle)
A simple visual of what's been logged today — icon-based, scannable in two seconds. If nothing logged: a single, warm nudge. Not a notification badge. Not a red dot. A sentence. "Nothing logged yet — how's Luna doing?" One tap opens the quick-log. The nudge vanishes the moment anything is logged.

**Zone 3 — The Trend** (bottom)
One chart. The most clinically relevant metric for this pet right now. Symptom frequency for a pet on a diet trial. Feeding consistency for a pet in maintenance mode. Readable in three seconds. No axis labels required to understand the direction.

**What is not on the home screen:** a log feed, a settings shortcut, a feature menu, an upsell.

---

### 4. The Nudge Is Warm, Not Nagging

Nyx has one shot at the notification channel. If Jordan feels nagged, they turn off notifications and the feedback loop dies. Every push notification and in-app nudge must meet a single standard: would Jordan be glad this appeared?

**What this means in practice:**
- The today nudge appears once per day maximum, only if nothing has been logged
- Post-log notifications surface only when there's something genuinely worth saying — a contextual link between a recent event and recent food, or a pattern threshold crossed
- Notification copy is specific, never generic. "Luna vomited at 2am — she had a snack 20 minutes earlier. Want to note what it was?" Not: "Don't forget to log today!"
- Frequency caps: no more than one proactive insight notification per day; no more than one nudge per day

**The test:** Read the notification copy out loud. Does it sound like something a thoughtful friend would say, or like a product manager trying to hit a DAU metric? If the latter, rewrite.

---

### 5. Empty States Are Features, Not Gaps

Every empty state — first open, no logs today, no data for this time range — is a moment of trust-building. Jordan is most uncertain about the product when there's nothing to show yet. Empty states should be warm, honest, and forward-looking.

**What this means in practice:**
- First open: "We're getting to know Luna. Keep logging and patterns start appearing in about a week." Not: "No data yet."
- No logs today: the Zone 2 nudge, not a blank space
- Insufficient data for a trend: "A few more days of logs and we'll be able to show you Luna's pattern." Not: a broken chart or a hidden zone

**The test:** Show the empty state to someone who just downloaded the app. Do they feel excited or deflated?

---

### 6. The Vet Report Is Clinical-Grade, Not Pretty

When Jordan exports a report for a vet appointment, the output must look like something Dr. Alex Chen would pick up and read — not a branded PDF with a paw print logo. Clinical utility over brand expression on this surface.

**What this means in practice:**
- Report layout: structured, dense, scannable in under 60 seconds
- Content: frequency counts, severity averages, food-to-event time windows, date range clearly stated
- Format: clean enough to hand over without explanation; no app branding that would make a vet feel like they're reading a marketing document
- Delivery: shareable link and downloadable PDF; printable

**The test:** Hand the report to someone who has never used Nyx. Can they understand what it says in under 60 seconds without any context? If no, redesign.

---

### 7. Premium Wraps Convenience, Never Care

Every design decision about what is free and what is paid must pass a single test: does gating this feature reduce the quality of care this pet receives?

**What is always free:** logging, health alerts, trend visibility, vet report export, AI insights.

**What may be premium:** multi-pet support, extended history, advanced correlation views, customisation.

**The test:** If Jordan couldn't afford a subscription, would their pet receive meaningfully worse care through Nyx? If yes, the feature should be free.

---

## Visual Language

### Tone

Calm. Considered. Quietly confident. Nyx does not shout. It does not celebrate aggressively. It does not use exclamation marks to manufacture enthusiasm. It communicates the way a good vet communicates: clearly, warmly, without unnecessary drama.

This is especially important in moments of concern. If Luna's vomiting frequency has increased, Nyx surfaces that clearly — without alarm language that would spike Jordan's anxiety before the data justifies it.

### Typography

Two weights of one typeface for body and UI. One display typeface for the Signal insight on the home screen — slightly larger, slightly more considered, to signal that this sentence is worth reading. The display face should feel warm, not clinical. Medical apps use sans-serif everything. Nyx is not a medical app.

### Color

One dominant neutral (dark or light depending on theme). One accent — used sparingly, only for interactive elements and the primary trend line in charts. Never decorative. Never used to fill space.

The trend chart line color should carry emotional weight: green is not required, but the direction of the line should be immediately readable without a legend.

### Motion

Restrained and purposeful. Transitions between log confirmation and home screen should feel satisfying — a small, fast completion animation that signals "logged" without demanding attention. No looping animations. No loading spinners on actions that should be instant. The only moment that warrants a more considered animation is the first time the AI Signal appears — the transition from "building your picture" to a real insight should feel like something arrived.

### Iconography

Simple, consistent, slightly rounded. The event type icons — meal, vomit, lethargy, stool, custom — must be immediately legible at small sizes in the widget. No metaphor that requires explanation.

---

## Copy Principles

### Specific Over Generic

"Vomiting is down 60% since Tuesday" is better than "things are improving." Specificity is what makes Jordan trust the app. Generic copy reads as filler.

### Warm Without Being Cute

Nyx is not a pet brand. It is a health tool. Copy should feel like it was written by someone who understands both the emotional reality of owning a sick pet and the clinical reality of what vets actually need. Not playful. Not sterile. Somewhere in between — the register of a smart, caring friend who happens to know about veterinary medicine.

### First Person for the Pet, Second Person for the Owner

"Luna hasn't been logged today" not "Your pet hasn't been logged today." Using the pet's name creates the emotional stakes that make the nudge land. Jordan did not download an app for "their pet." They downloaded it for Luna.

---

## Interaction Principles

### The Quick-Log Screen

The single most important screen in the product. Principles:

- Opens directly from the home screen nudge, the widget, or the + button — never buried in navigation
- Pet pre-selected, time auto-stamped — no input required to get to the event type selection
- Event types visible as large tap targets, not a list: Meal · Vomit · Lethargy · Stool · Custom
- Selecting "Meal" immediately shows the food library — most recent or most frequent first
- Severity (for symptom events) is a 1–5 visual scale, not a number input
- Notes field is optional, below the fold, never required
- Confirmation is instant and satisfying — a brief completion state, then back to home

### Navigation

Flat. Three tabs maximum at MVP: Home · Log History · Pet Profile. The quick-log is not a tab — it is always accessible via a persistent action regardless of which tab is active.

### Onboarding

Minimum viable onboarding. Required: pet name, species. Optional but prompted: primary food (seeds the food library). Everything else is deferred. First log should be possible within 60 seconds of download. Onboarding is not complete when Jordan finishes setup — it is complete when Jordan logs their first event. Design toward that moment.

---

## Design Standard Reference

The benchmark for Nyx's design quality is top-tier consumer health and productivity apps: Calm (emotional calm, considered typography), Linear (invisible complexity, fast interactions), Oura (data made human, insight over dashboard). Not the benchmark: generic health apps, medical record tools, or anything that looks like it was designed to be functional rather than to be used.

When in doubt, ask: would a designer at one of these companies be proud of this? If the answer is uncertain, it needs more work.

---

## Open Design Questions

These are intentionally deferred — answers belong in a future design sprint informed by real user behavior.

- **Multi-pet home screen:** when Jordan has two pets, does the home screen show both Signals, or does Jordan toggle between pets? The data model supports both; the UX has not been decided.
- **Onboarding iteration:** the current approach is minimum viable. The optimal onboarding flow will be determined by observing where first-week drop-off occurs in the MVP.
- **Android widget:** iOS widget is the first implementation. Android widget follows in a later sprint; principles should apply to both but implementation details differ.
- **Vet portal visual language:** the vet-facing surface has different users, different context, and different needs. It will inherit some but not all of these principles and will require its own design pass when scoped.

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | May 2026 | Initial document. Core philosophy, seven design principles, visual language, copy principles, interaction principles. Based on product trio design session May 2026. |
