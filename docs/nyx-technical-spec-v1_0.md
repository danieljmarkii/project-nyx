# Project Nyx — Technical Specification
**Version:** 1.0 | **Status:** Living Document | **Last Updated:** May 2026

---

## Purpose

This document gives Claude Code the engineering context it needs to make consistent decisions across sessions without re-explanation. It covers stack, project structure, MVP feature set with acceptance criteria, key architectural decisions, and open questions that must be resolved before they become blockers.

Read this alongside `schema.sql` and `design-principles.md` before writing any code.

---

## Stack

| Layer | Technology | Decision Rationale |
|---|---|---|
| Frontend | React Native via Expo (managed workflow) | Single codebase for iOS and Android; testable on iPad via Expo Go without Xcode |
| Backend | Supabase | Postgres, real-time subscriptions, auth, storage, edge functions — all browser-manageable |
| Database | Postgres via Supabase | Schema already defined in `schema.sql` |
| Auth | Supabase Auth | Email + Apple Sign-In required for App Store submission |
| Local storage | Expo SQLite (via `expo-sqlite`) | Offline-first logging; sync on reconnect. WatermelonDB is an alternative if query complexity demands it — default to Expo SQLite first |
| PDF export | Supabase Edge Function | Server-side render; owner downloads or shares a link. Vet does not need a Nyx account |
| State management | Zustand | Lightweight, no boilerplate, works well with Expo |
| Navigation | Expo Router | File-based routing, plays well with managed workflow |

### Managed Workflow Constraint

Stay in Expo managed workflow for the MVP. Do not eject unless a required native module is unavailable. If ejection becomes necessary, flag it as a decision point rather than proceeding silently.

### Minimum Targets

- iOS 16+
- Android 13+ (API level 33)
- Test device: iPad Pro M4 via Expo Go

---

## Project Structure

```
/
├── app/                        # Expo Router screens
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/
│   │   ├── index.tsx           # Home screen
│   │   ├── history.tsx         # Timeline / log history
│   │   └── profile.tsx         # Pet profile
│   ├── log.tsx                 # Quick-log modal (not a tab)
│   ├── report.tsx              # Vet report generation
│   └── _layout.tsx
├── components/
│   ├── home/                   # Home screen zone components
│   ├── log/                    # Quick-log components
│   ├── history/                # Timeline components
│   └── shared/                 # Reusable primitives
├── lib/
│   ├── supabase.ts             # Supabase client init
│   ├── db.ts                   # Local SQLite client and queries
│   ├── sync.ts                 # Sync engine: local → Supabase
│   └── pdf.ts                  # Edge function call wrapper
├── store/
│   ├── petStore.ts             # Active pet state
│   ├── eventStore.ts           # Event log state
│   └── authStore.ts            # Auth session state
├── hooks/
│   ├── usePet.ts
│   ├── useEvents.ts
│   └── useSync.ts
├── constants/
│   ├── eventTypes.ts           # Icons, labels, colors per event type
│   └── theme.ts                # Design tokens from design principles
├── docs/                       # All project documentation lives here
│   ├── product-brief.md
│   ├── design-principles.md
│   ├── research.md
│   ├── technical-spec.md       # This file
│   └── schema.sql
└── supabase/
    ├── migrations/             # Schema migrations
    └── functions/
        └── generate-report/    # Edge function for PDF generation
```

---

## MVP Feature Set and Acceptance Criteria

These are the features that constitute a shippable MVP. Nothing else ships first.

### 1. Auth

**What it does:** Email signup/login and Apple Sign-In. On first login, creates a `user_profiles` row via Supabase trigger.

**Acceptance criteria:**
- User can sign up with email and password
- User can sign in with Apple ID
- Auth session persists across app restarts
- Unauthenticated users cannot access any app screen
- `user_profiles` row exists for every authenticated user

---

### 2. Onboarding

**What it does:** Collects the minimum information needed to make the first log possible: pet name and species. Primary food is prompted but optional — it seeds the food library. Everything else is deferred.

**Acceptance criteria:**
- Onboarding completes in under 60 seconds
- Required fields: pet name, species (dog/cat/other)
- Optional but prompted: primary food (brand + product name + format)
- If food is entered, a `food_items` row is created and linked to the pet's profile context
- First log is accessible immediately after onboarding completes
- Onboarding is shown only once; returning users skip directly to home

---

### 3. Quick-Log

**What it does:** The core interaction. One-tap access to log any event for the active pet. This is the most important screen in the product. It must be accessible from anywhere in the app, must require no decisions before reaching the event type selection, and must complete in under 10 seconds.

**Acceptance criteria:**
- Accessible via persistent `+` button regardless of active tab
- Pet is pre-selected (single pet at MVP — no selection required)
- Time is auto-stamped to `now()` in UTC; owner can back-date but never has to
- Event type is presented as large tap targets: Meal · Vomit · Diarrhea · Lethargy · Stool (normal) · Itch / Scratch · Other
- Selecting "Meal" immediately shows the food library, sorted by most recently used
- Food library shows the pet's previously used foods as one-tap confirms
- If the food is not in the library, owner can add it (brand + product name required; format prompted)
- Severity (for symptom events) is a 1–5 visual scale — not a number input, not a dropdown
- Notes field is present but optional and below the fold
- After confirming, a brief completion state is shown before returning to home
- Log is written to local SQLite immediately; sync to Supabase happens in background
- The entire flow — open log, select event type, confirm — completes in under 10 seconds for a returning user with a food already in the library

**Event type → fields mapping:**

| Event Type | Severity | Food | Notes |
|---|---|---|---|
| Meal | No | Required (library or new) | Optional |
| Vomit | Yes (1–5) | No | Optional |
| Diarrhea | Yes (1–5) | No | Optional |
| Lethargy | Yes (1–5) | No | Optional |
| Stool (normal) | No | No | Optional |
| Itch / Scratch | Yes (1–5) | No | Optional |
| Other | Optional | No | Optional |

---

### 4. Home Screen

**What it does:** Answers "is my pet okay, is it getting better?" before the owner has to ask. Three zones. No log feed. No navigation menu. No upsell.

**Acceptance criteria:**

**Zone 1 — The Signal (top):**
- Displays one AI-generated insight, updated daily
- In the first 5–7 days (insufficient data): warm, honest message — "We're getting to know Luna. Keep logging and patterns start appearing in about a week."
- Once sufficient data exists: a specific, confident sentence. Example: "Vomiting is down 60% since you switched to turkey."
- If no events logged in 48+ hours: the Signal acknowledges this honestly — "Not enough recent data to show a pattern. Log today and we'll keep building the picture."
- AI call is made server-side (Supabase Edge Function) and result is cached; home screen does not make a live LLM call on every open

**Zone 2 — Today (middle):**
- Icon-based summary of events logged today, scannable in two seconds
- If nothing logged: single warm nudge — "Nothing logged yet — how's [pet name] doing?" — with one-tap access to quick-log
- Nudge disappears the moment any event is logged today
- No red dots, no badge counts, no urgency language

**Zone 3 — The Trend (bottom):**
- One chart showing the most clinically relevant metric for this pet
- For a pet with active symptom events: symptom frequency over the last 14 days
- For a pet with an active diet trial: trial compliance (days logged / days elapsed)
- For a pet with no active condition: feeding consistency over the last 7 days
- Readable in three seconds without axis labels; directional trend is immediately obvious
- If fewer than 3 days of data: show the "keep logging" empty state, not a broken chart

---

### 5. Timeline / Log History

**What it does:** Chronological view of all logged events. Filterable. Not the primary surface — home screen is — but necessary for owners who want to review or edit.

**Acceptance criteria:**
- All events for the active pet, newest first, paginated (50 per load)
- Filter by event type and date range
- Each event shows: type icon, time (in user's local timezone), severity indicator if applicable, food name if meal
- Tap to expand: shows notes, food detail, edit and delete options
- Delete is a soft delete — event is hidden in UI but `deleted_at` is set in the database
- Edit is allowed for: occurred_at, severity, notes, food (for meals)
- No visual difference between manual and reminder-sourced events in the list

---

### 6. Pet Profile

**What it does:** Displays and allows editing of the pet's profile and known conditions. Single pet at MVP.

**Acceptance criteria:**
- Displays: name, species, breed, age (calculated from date_of_birth), sex, weight, photo
- Owner can edit all fields
- Photo upload stores to Supabase Storage; `photo_path` on `pets` row is updated
- Known conditions: list of active conditions with `condition_name` and `status`
- Owner can add a condition (name + optional diagnosed date + status)
- Owner can mark a condition as resolved
- Active diet trial (if any): shown as a prominent card with days elapsed / target duration and compliance percentage

---

### 7. Vet Report Export

**What it does:** Generates a clinical-grade PDF covering a selected date range. Shareable via link (no vet account required) or downloadable.

**Acceptance criteria:**
- Owner selects a date range (default: since last vet visit, or last 30 days)
- PDF is generated server-side via Supabase Edge Function using reference query [4] from `schema.sql`
- PDF content: pet name/species/breed/age, date range, event frequency counts by type, severity averages, meal log with food names and quantities, any active conditions and diet trials
- PDF is clinical in tone and layout — no decorative elements, no app branding beyond a small footer
- A `vet_reports` row is created with a `share_token` and 30-day expiry
- Owner can share via system share sheet (iOS/Android native) or copy link
- Link format: `nyx.app/report/{share_token}`
- Vet can open the link in a browser without a Nyx account
- Token expiry is enforced by RLS policy (already in schema)

---

### 8. Offline Sync

**What it does:** All logging works without connectivity. Data syncs to Supabase when connection is restored.

**Acceptance criteria:**
- Every event write goes to local SQLite first, then syncs to Supabase in the background
- If offline, the queue accumulates and flushes on reconnect
- Sync conflict resolution: **last-write-wins on `occurred_at`**. If the same event UUID exists in both local and remote with different `updated_at` values, the more recent `updated_at` wins. This is the decided resolution strategy — do not implement merge logic.
- Sync status is not surfaced to the user during normal operation; only show an indicator if sync has been pending for more than 24 hours
- Food library (read from Supabase, cached locally) refreshes on app open when online

---

## Architectural Decisions

These are decided. Do not revisit without a PM decision.

**Single event timeline.** Meals are events with a child `meals` row. There is no separate meals table with its own timeline. See `schema.sql` Option A pattern.

**Soft deletes on events.** `deleted_at` is set on delete; rows are never removed. The correlation engine requires the full history.

**Food items are globally scoped.** No `user_id` on `food_items`. Any authenticated user can read any food item. Creators can update their own entries. This is architected for a shared catalog post-MVP.

**Multi-pet ready, single-pet at launch.** Every table has `pet_id`. The UI exposes one pet. Adding a pet selector in a future sprint must not require schema changes.

**All timestamps stored in UTC.** User timezone is stored on `user_profiles`. All display conversion happens at the app layer.

**Correlation engine is server-side.** Reference query [2] in `schema.sql` is the implementation target. This runs as a Supabase Edge Function, not on-device. The AI Signal on the home screen calls this function.

**PDF generation is server-side.** Supabase Edge Function using reference query [4]. Do not attempt client-side PDF generation.

**Last-write-wins sync.** See Offline Sync acceptance criteria above.

---

## Open Engineering Questions

These are not decided. They need a resolution before the relevant feature is built.

| Question | Blocks | Notes |
|---|---|---|
| Which PDF rendering library for the Edge Function? | Vet report | Candidates: `pdf-lib`, `puppeteer` (heavier, more layout control), `react-pdf`. Recommend `pdf-lib` for simplicity unless layout requirements demand HTML rendering. |
| GDPR deletion cascade: what happens to event data when a user deletes their account? | Auth / data retention | `ON DELETE CASCADE` on `pets` and `events` will wipe all data. Confirm this is acceptable or implement an anonymization approach instead. |
| AI Signal generation: which model and prompt structure? | Home screen Zone 1 | Model: Claude via Anthropic API called from Edge Function. Prompt must include recent event data, food log, and active conditions. Output must be a single sentence. Rate limit and cache — do not call on every home screen open. |
| Minimum Expo SDK version? | Scaffold | Use latest stable Expo SDK at time of scaffold. Document the version in this file immediately after scaffold. |
| Push notification provider? | Nudge (post-MVP) | Expo Notifications handles the client side. Backend delivery requires a service. Decide before implementing any notification logic. |

---

## Build Sequence

Build in this order. Do not skip ahead.

1. **Scaffold and auth** — Expo project, Supabase project, auth flow, `user_profiles` trigger, confirm login works on iPad via Expo Go
2. **Schema** — run `schema.sql` against Supabase, confirm RLS policies, confirm all tables exist
3. **Onboarding** — pet creation, optional food entry, navigation to home
4. **Quick-log** — local SQLite write, food library, event type selection, completion state. This is done when it passes the 10-second test.
5. **Home screen** — three zones with real data. Zone 2 (Today) first since it requires only today's events. Zone 3 (Trend) second. Zone 1 (AI Signal) last since it requires the Edge Function.
6. **Timeline** — log history, filter, soft delete, edit
7. **Pet profile** — display and edit, photo upload, conditions, diet trial card
8. **Offline sync** — SQLite queue, flush on reconnect, last-write-wins conflict resolution
9. **Vet report** — Edge Function, PDF generation, share token, share sheet
10. **AI Signal Edge Function** — Claude API call, single-sentence output, caching

---

## Design Tokens (for `constants/theme.ts`)

Derived from `design-principles.md`. These values are directional — the designer owns final values.

```typescript
export const theme = {
  // Typography
  fontBody: 'System',           // One typeface, two weights
  fontDisplay: 'TBD',           // Warm, not clinical — serif or humanist sans
  fontWeightRegular: '400',
  fontWeightMedium: '500',

  // Color
  // One dominant neutral + one accent, used sparingly
  // Final values TBD by designer — do not hardcode colors inline
  colorAccent: 'TBD',           // Interactive elements and primary trend line only
  colorNeutralDark: 'TBD',
  colorNeutralLight: 'TBD',

  // Spacing (8pt grid)
  space1: 8,
  space2: 16,
  space3: 24,
  space4: 32,
  space5: 48,
  space6: 64,

  // Border radius
  radiusSmall: 8,
  radiusMedium: 16,
  radiusLarge: 24,

  // Motion
  durationFast: 150,            // Completion animations
  durationMedium: 250,          // Screen transitions
  easingDefault: 'ease-out',
};
```

---

## Event Type Constants (for `constants/eventTypes.ts`)

```typescript
export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: 'bowl',      hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: 'warning',   hasSeverity: true,  hasFood: false },
  diarrhea:     { label: 'Diarrhea',     icon: 'warning',   hasSeverity: true,  hasFood: false },
  stool_normal: { label: 'Stool',        icon: 'check',     hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: 'sleep',     hasSeverity: true,  hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: 'scratch',   hasSeverity: true,  hasFood: false },
  other:        { label: 'Other',        icon: 'plus',      hasSeverity: false, hasFood: false },
} as const;

// skin_reaction, scratch, weight_check, medication are in the schema
// but not exposed in the MVP quick-log UI. They are valid event_type values
// and may be written programmatically or added to the UI post-MVP.
```

---

## Version History

| Version | Date | Summary |
|---|---|---|
| v1.0 | May 2026 | Initial spec. Stack, project structure, MVP feature set with acceptance criteria, architectural decisions, open questions, build sequence, design tokens, event type constants. |
