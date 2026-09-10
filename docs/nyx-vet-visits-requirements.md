# Nyx Vet Visits — The Appointment Companion — Requirements (CUL-878)

**Version:** 1.0 — **BUILD-READY** | **Date:** 2026-09-10 | **Status:** G1–G7 ruled by the PM (2026-09-10, the round-1 reactions) and the nine isolated persona interviews returned **2 BUILD · 7 BUILD WITH CONDITIONS · 0 DON'T BUILD**; every condition is folded in below as a rule or as an on-the-fly decision named on the issue that meets it. Ships **dark behind the `vet_visits` rollout flag** and retires it on a PM GA call. Mock round 2 (`docs/culprit-vet-visits-mockups.html`, one URL for every round) is the design authority; the evidence is `docs/research/2026-09-vet-visit-companion-evidence.md` 🧊; the build track is the Linear project **Vet visits — the appointment companion** (run order in §8 and on the project).

**Read with:** `docs/nyx-vet-report-requirements.md` §6 (the scope cascade keys off visits), `docs/nyx-vet-files-requirements.md` (D7, the VF substrate this reuses), `docs/nyx-ask-requirements.md` §3.3 (the rundown this promotes), `docs/nyx-beta-features-requirements.md` (the two-gate toggle this mirrors), `docs/nyx-notification-foundation-requirements.md` + CUL-253 (the reminder this unblocks), `docs/nyx-medication-logging-requirements.md` + `docs/nyx-diet-trial-requirements.md` (the flows the plan rows open), `docs/nyx-design-principles-v1_0.md` §3 + § Navigation.

---

## 0. Decision record

### 0.1 The rulings (PM, 2026-09-10 — reactions to round 1)

| # | Decision | Ruling |
|---|---|---|
| **G0** | **Feature toggle** | **Build behind a rollout flag; retire it at GA.** The `vet_visits` allowlist flag mirrors `daily_look` exactly (§5.5): a seed migration, a client key, a beta-shelf row, consumers behind `useAllowlistFlag && useBetaOptIn`. Flag-off is byte-identical to today. GA = a PM call, then a removal PR. |
| **G1** | What v1 is | **(a) The lifecycle, typed.** No microphone, no model call. |
| **G2** | Placement | **A1 + A2.** The Pet-tab "Vet visits" card is the home; the Home strip is the moment. No fifth tab. *"It's now weird to have Files as well as Visits"* — tabled by the PM (§10). |
| **G3** | The upcoming appointment's home | **A new `vet_appointments` table** (§5.1). |
| **G4** | Notes shape | **Structured plain text.** "Bolding is probably not happening if we're jotting notes in the room." |
| **G5** | When recording ships | **v1.x, after the App Store submission, behind the consent contract (§6).** "Good for v1.x; deep dive later." |
| **G6** | AI over the visit | **Deterministic first.** "Worth raising" quotes what the record already says; the summary and phrased questions are v2 behind a D2-class ruling; **live suggestions punted** ("makes a lot of sense to me"). |
| **G7** | Priority | **Greenlit as its own project**, after the submission cut and beside — never inside — Noticed. The PM's own visit is the dogfood pull; VV-5 is the cheap piece that can ride first once VV-1 and VV-2 land (§8). |
| **R-window** | The Home strip's window | "Fine anywhere between 3 and 7 days." **Five**, a constant, tunable at build (VV-5). |
| **R-share** | "Share the rundown" on Get ready | The PM doubted the rundown should go to the vet; all nine lenses agreed independently. **One primary, *Send the vet report*; the shipped text share (CUL-206) moves under ⋯ as *Copy as text*, addressed to no one** — Jordan and Sam both named the household as its reader. |
| **R-C1** | "Draft open-ended notes; jot down questions ahead of time — am I thinking about that right?" | Yes: questions are jotted **before** (Get ready, or one tap from the Home strip), notes are typed **during or after**, and the questions ride into the visit as ticks. A clarification, not a change. |
| **R-photo** | "Should the photo go in Files or live in this record?" | **Both, because it is one row:** Vet Files holds it, linked to the visit, filed under the visit's pet; the visit shows it under Paperwork. Never a second store. |
| **R-D1** | "If we have a medication logged, how do we start that med?" | **The row reads the record before it asks** (§4.1 D1): an existing course renders as a confirmation (*Keep · Changed · Stopped*); *Add* appears only for a course the record lacks and opens the real medication setup with the visit as its origin; *Later* keeps the visit saved with the row open. |
| **R-E** | E1 next/past, E2 empty + historic visits, plain text | Ruled as drawn. |

### 0.2 The team's verdict (nine isolated interviews, 2026-09-10)

**Jordan BUILD · Dr. Chen BUILD · Designer, Sam, Dir. of Engineering, Data Scientist, QA, Trust & Safety, Product Owner BUILD WITH CONDITIONS · none DON'T BUILD.** The conditions converged, and each is now a rule or a named decision:

| Condition | Named by | Where it landed |
|---|---|---|
| A safety or intake card leads; the appointment strip sits under the Signal in the trial strip's register; the visit never rewrites or re-dates a Signal string. | Designer, Sam, Dr. Chen | §4.1 A2 (a rule) + AC 3 |
| The strip asks once after the day passes, then leaves — never furniture for a month. | Designer | §4.1 A2b |
| "Worth raising" quotes the Signal's phrased sentence, never re-derives a count; caps at four; renders nothing when the record is quiet; never a preference word about a decline. | Data Scientist, Jordan, Sam, Dr. Chen | §4.1 B1 + AC 5 |
| A visit is a provenance anchor, never a source of numbers; the set of files that may read the visit tables is pinned by a guard. | Dr. Chen, Data Scientist | §5.6 (`guards/visitReaders.test.ts`) + AC 10 |
| Every row the after-visit screen creates is a local `synced = 0` write — and today the medication write is **remote-first** (`components/profile/AddMedicationModal.tsx:284`), so a local-first `startRegimen()` is a prerequisite PR. | Dir. of Engineering, QA | §5.4 + VV-3 |
| Same-pet triggers on `medications.vet_visit_id` and `diet_trials.vet_visit_id` (the 045 bare-FK class). | Data Scientist | §5.1 |
| The C1 draft needs a home before the visit row exists. | Data Scientist | §5.1 `vet_appointments.notes_draft` |
| A visit delete is invisible to the deployed report until CUL-19 runs; ship the column, hold the control. | Dir. of Engineering, QA, Product Owner | §4.1 D3 + VV-6's on-the-fly decision |
| The report's window anchors **strictly before today**, so a same-day report does not yet start from the visit; the saved moment must not say "from today". | QA | §4.1 D2 + AC 9 |
| The after-visit screen writes `pet_id` from the appointment, never from `activePet` (the shipped screen does the latter at `app/vet-visit.tsx:117`). | Data Scientist, QA | §4.1 D1 + AC 11 |
| Flag-off is byte-identical, proven by a snapshot that toggles the flag. | QA | AC 0 |
| The submission binary declares no microphone; VV-7 never merges before the submission build is cut — a toggle hides a screen, not a purpose string. | Trust & Safety | §6.1 + §8 |
| A written ruling on why typed notes soft-delete while a v1.x transcript hard-deletes. | Trust & Safety | §6.2 |
| The board tells the truth: own project, milestones, dependencies, related issues linked and left open. | Product Owner | §8 + the Linear project |
| Booking offers "Also for {other pet}" in multi-pet accounts; the diet row offers "add the food to the library" beside "start a trial"; the med row and the trial row carry *Stopped* / *Ended · Switched*. | Sam, Dr. Chen | §4.1 D1, E3 |

### 0.3 Decisions left to the issue (the PM's ask: decide on the fly while building)
Each build issue carries a **Decide on the fly** section with the team's default. They are listed in §8 per PR so nothing is decided silently and nothing blocks a start.

---

## 1. The jobs (PM-defined, 2026-09-09)

The PM's framing: *get a pet owner positioned to leverage their data during a vet visit, and during a visit take the input of what we know in the moment and make suggestions.* Three moments:

1. **Before** — know when it is, bring the record (the report), know what to say (the rundown), know what to ask.
2. **During** — capture what the vet said without losing the room to the phone.
3. **After** — the plan: what changed (a med, a diet, a recheck), where the paperwork went, what the next visit needs to know.

**Why this matters more to Culprit than to a generic pet app:** the visit is the *origin event of the wedge*. "Sent home with a diet trial or a symptom-monitoring directive" happens in that room, and today the directive enters the app only if the owner separately finds medication setup and trial setup. The after-visit capture is where the directive enters the record, as confirmations of things the vet just said.

**The user moment (v1):** Jordan is in the parking lot after a 15-minute recheck. The app already knows it was Tuesday at Riverside with Dr. Chen. Jordan types two sentences, taps *Keep* on the probiotic, *Oct 28* on the next-visit row, photographs the discharge sheet, and is done before the car warms up. Five days before Oct 28 the Home strip says *Vet visit on Tuesday*, and Get ready is one tap.

---

## 2. What exists today (code audit, verified at file:line 2026-09-09/10)

| Piece | Where | State |
|---|---|---|
| `vet_visits` table | `supabase/migrations/001_schema.sql:165` — `visited_at DATE NOT NULL`, `clinic_name`, `vet_name`, `reason`, `notes`, `next_visit_at DATE`, `updated_at` trigger | Live; synced both ways (`lib/sync.ts:1170/1184` push — **the push enumerates columns**, so a new column must join it (the events precedent at 1059); `:2259/2275` hydrate); local mirror `lib/localSchema.ts:130`; in the wipe set. No `deleted_at` — **no delete path exists for a visit.** |
| `vet_visit_attachments` | migration 003 + hardening 043 | Legacy per-visit photo attach. Superseded by Vet Files; gains no new writer. |
| The capture screen | `app/vet-visit.tsx` — photo step → details (date · clinic · vet · reason · notes `maxLength={600}` at :332 · next visit) → "Vet visit logged"; presented as a **modal** route (`app/_layout.tsx:294`) | **Write-only: rendered nowhere.** Writes `pet_id` from `activePet` at save time (`:117`) and names it (`:179`) — the CUL-574 shape the replacement must not inherit. Sole door: Ask → rundown → the "No prior visit logged" tile (`lib/rundown.ts:57, 873`; `app/rundown.tsx:67`). |
| The rundown | `lib/rundown.ts`, `app/rundown.tsx`, `components/ask/RundownTileRow.tsx` (Ask A6) | Shipped, deterministic, offline, capped-safe. **`readLastVisitDate` takes `MAX(visited_at)` with no upper bound** (`:642–649`). Share = plain text via the OS sheet (CUL-206). Entry: two accent chips in `app/ask.tsx:289, 387`. |
| The report's window | `supabase/functions/generate-report/report.ts:711–716` | Rung 1 = the most recent visit **strictly before today** — a future-dated row is ignored, and **a visit logged today anchors the window from tomorrow**. The row pull (`index.ts:809`) reads every row unfiltered; its redeploy is held (**CUL-19**, v13 live). |
| Vet Files | B-478 VF-0→VF-6 (July); `vet_documents.vet_visit_id` optional link; the picker lists every visit row unbounded (`lib/vetDocumentDetail.ts:189–192`) | Shipped. D7: a document never mints or re-dates a visit. |
| Medication setup | **`components/profile/AddMedicationModal.tsx` — an RN `Modal` hosted by the Pet tab (`app/(tabs)/profile.tsx:1581`)**, writing `supabase.from('medications').insert` **remote-first** (`:284`; "Could not save" at `:298`) although a `medications` push queue exists (`lib/sync.ts:1768`). `app/medication-capture.tsx` writes a catalog row + first dose; `app/medication/[id].tsx` edits the catalog. There is **no regimen route**. | The premise "opens the medication setup flow" was wrong in two ways: it is a modal, and it is remote-first. Both are VV-3/VV-4's work. |
| Diet-trial setup | `startDietTrial` (`lib/dietTrialSetup.ts:932`, local-first by design, `:16–22`), `StartTrialInput` (`:286`), the INSERT in one transaction (`:939–953`), `getActiveTrialForPet` (`:593`); `components/…/StartTrialModal.tsx` whose `onStarted` is `() => void` and discards the id (`:77, :343`); "Snap a new food" routes out to `/food-capture`. | Local-first already; needs `vetVisitId` threaded and the id returned. |
| Home order | `app/(tabs)/index.tsx:182–200`: `SignalZone` → `TrialStrip` ("a trial is context, not an insight") → `MedStrip`s → `TodayZone` → `TrendZone` | The context strips sit **under** the Signal. The appointment strip joins them. |
| The toggle primitive | `lib/appConfig.ts:85–111` (`ALLOWLIST_FLAG_KEYS`, `ALLOWLIST_FLAGS_UNSET`, `resolveAllowlistFlag`), `lib/betaFeatures.ts:124–146` (the registry, `serverCost`), `app/settings/beta.tsx:74, 86–87` (the glyph case; `useAllowlistFlag && useBetaOptIn`), migration `063_daily_look_config.sql:88–91` (the seed) | The daily look's N-0 is the template, verbatim. |
| Local-first plumbing | `LOCAL_WIPE_TABLES` in **`lib/hydration.ts:241`** (children first); the hydration order in **`lib/sync.ts:2785–2838`** (`hydrateFromCloud`, parents first, `vet_visits` at ~2811); `delete-account` cascades from `auth.users`/`pets` with no enumeration (`index.ts:6–7`) | Two lists, two directions. |
| Reminders | CUL-253 (B-662) | Data-gapped on an upcoming-visit fact; `vet_appointments` is that fact. |
| Related | CUL-397 (talking points on the report send), CUL-435 (D8-gated extraction), CUL-467 (Vet Files entry depth), CUL-206 / CUL-216 (rundown follow-ups: the share's label; "new foods since last visit" keys off the first-ever feed) | Linked "relates to"; none absorbed. |

**Consequences the design carries:** a logged visit is clinically load-bearing (it moves the report window — from tomorrow); the reader set that assumes "a `vet_visits` row is a visit that happened" is why the upcoming appointment gets its own table; and the medication write must go local-first before a plan row may open it.

---

## 3. Evidence base — conclusions (the full brief is `docs/research/2026-09-vet-visit-companion-evidence.md`)

_Three isolated research agents ran in parallel on 2026-09-09 (competitive · legal/T&S · technical); only the conclusions are restated here. Competitor facts are re-verified at use._

### 3.1 Competitive
- **The parts are commodities; the loop is whitespace.** Recording and transcription are OS-level on iPhone; clinic-side AI scribes already record a rising share of exam rooms and emit client summaries. No product, owner-side or human-side, combines **prep before → capture during → the visit landing in the owner's own longitudinal record after**. `[E]`
- **One owner-side app already records visits — Pawtient AI** (Dec 2025, one App Store rating): "first to record your vet visit" is a claim to retire. **Fi Intelligence** owns the phrase "vet visit companion" without recording anything. `[E]`
- **Nobody generates questions from the pet's own record, and nobody does anything live in the room** — the empty shelf "Worth raising" stands on. `[E]`
- **Don't sell the transcript** (Abridge's patient app died to clinician-side distribution); sell the record the visit lands in. 40–80 % of medical information is forgotten immediately; 72 % of patients listen to a recording; over half share it with a care partner. `[E]`
- **Consent is a design norm before it is a law**: every scribe vendor, AAHA, Medcorder and Apple converge on *ask first*. Two positioning claims: *prepared before, captured during, in your record after — at any clinic* and *bring the clinic's summary in, too*. `[E]`

### 3.2 Legal / Trust & Safety (diligence, not legal advice)
- The owner is the recorder; eleven states need every participant's consent or knowledge for an in-person recording (CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA; DE treated the same); Nebraska and 38 others are one-party. `[E]`
- *In re Otter.AI* (N.D. Cal., 2026-08-13) draws the app-maker line: a vendor that transcribes and hands the transcript back is a tool; one that retains and trains is a party. Never hold raw audio server-side, never train, no independent use. `[E]`
- Apple 2.5.14 (consent + visible/audible indication), 5.1.2(i) (an in-app permission before personal data goes to third-party AI, 2025-11-13) and **5.1.1(ix)** (sensitive information → a legal entity, not an individual) make the LLC already on the attorney brief a prerequisite of the microphone release. On-device transcription keeps the App Privacy label's Audio Data at *No*. `[E]`
- The waiting room is off limits (non-participant interception has no exception anywhere); no speaker identification (BIPA / CUBI / RCW; three live suits); live suggestions are the highest-risk item (real-time streaming of third parties' speech). `[E]`
- The lane's recommendation is G5; it added the audible start announcement (§9 conflict 3) and foreground-only capture.

### 3.3 Technical feasibility
- **The Claude API accepts no audio**; server transcription is a second vendor and a second processor. On-device transcription is the single-vendor, privacy-clean path. `[E]`
- iOS 26's SpeechAnalyzer is the one on-device engine that handles a 30-minute consult (~2 % / ~5 % WER vs ~9 % / ~16 % legacy), reachable from Expo managed through a thin local Swift module; older iOS is undocumented past a minute; Android is weak. `expo-audio` background recording is eight months old with a predecessor's history of lock-screen and phone-call failures → spike first. `[E]`
- Rich text is not worth v1 (ruled). A post-visit summary ≈ $0.015–0.045 per visit; live suggestions ≈ $0.08–0.29. `[E]/[A]`
- Six spikes with pass criteria precede VV-7 (evidence brief §3.5).

---

## 4. The proposal

### 4.1 v1.0 — the lifecycle, typed (mock round 2, §A–§E)

**The toggle (G0).** Every surface below renders only when `useAllowlistFlag('vet_visits') && useBetaOptIn('vet_visits')`; flag-off the tree is byte-identical to today — `app/vet-visit.tsx`, Ask's `log-visit` tile, the Pet tab's vet section and Home unchanged (AC 0). GA is a PM call (flip `enabled: true`, then a removal PR that deletes `app/vet-visit.tsx`).

**The home (Pet tab, mock A1).** A "Vet visits" card between Vet report and Vet Files: the next appointment leads, the last visit's plan sits under it in one line, "Open visits" is the door. At zero visits the card renders E2's two doors in place of the appointment and the plan line (Principle 5). The list (E1): *Next* then *Past*, newest first; each past row carries the plan it left behind as tags **derived from linked records, never typed**. The empty state (E2) is the primary screen for most owners.

**Booking (mock E3).** "Add" asks one thing first — *already happened, or booked?* A booked visit takes a date (required), an optional time, clinic/vet prefilled from the last visit, a reason. **"Also for {other pet}"** renders only in a multi-pet account and books a second appointment row under the other pet (the Vet Files D13 duplicate-on-add shape); each pet's Home shows its own. The last visit's `next_visit_at`, when present, seeds the sheet. No reminder is scheduled here (CUL-253's, unblocked).

**The moment (Home, mock A2).** Inside the window — **five days** before through the day of — the appointment strip renders **under the Signal, in the trial strip's register** (`index.tsx:182–200`): a context strip, never an insight. **Rule:** a live safety or intake card always renders above it, its own ask intact; no Signal string is changed, dated or re-phrased because an appointment exists; the strip never gains urgency styling. Two doors: **Get ready** and **Add a question** (a one-line sheet saved to the appointment). The report send lives inside Get ready.

**After the day (mock A2b).** If the appointment's day passes with no visit logged, the strip asks **once**: *Did Tuesday's visit happen?* — *Yes — how did it go?* opens D1 prefilled; *It didn't* cancels the appointment (`cancelled_at`). Either way the strip leaves Home. Never a second ask.

**Before — "Get ready" (mock B1).** The shipped rundown by a job title, reached from the strip, the Pet-tab card, the list and Ask (`/rundown` gains an `appointmentId` param; Ask keeps its chips). Three blocks and one primary:
- **The rundown**, the shipped screen verbatim (AC 4).
- **Worth raising** — deterministic, **one source per row, quoted never re-derived**: the leading Signal findings render their own phrased, count-anchored sentence from the cached payload (the Change Contract; never a new count with a new window — CUL-746); the active trial's day-of and coverage from `TrialFacts`; a course with no end recorded in the H1 register; the weight gap when no weigh-in is recent. **Capped at four; the section is absent when the record is quiet** (never "nothing to raise"); never *fussy / picky / preference* about a decline (the intake invariant); a safety finding always leads the list.
- **Your questions** — typed once (here or from the strip), stored on the appointment, carried into the visit as ticks, kept on the visit afterwards. Never read by a model in v1.
- **Send the vet report** (primary). ⋯ holds **Copy as text** (the CUL-206 share, renamed and demoted, for the human going in with the pet) and **Change the appointment**.

**During — "At the vet" (mock C1).** Opened from Get ready on the day (Get ready stays the day's primary door, so the tap on the leash lands on the numbers). One plain-text field, **autosaved to `vet_appointments.notes_draft`** as it is typed (a phone call loses nothing); the prepared questions as ticks (`questions[].asked_at`); **Photograph the paperwork** → Vet Files under the visit's pet with `vet_visit_id` set at save and no document type asked (D11). No toolbar, no mic.

**After — "How did it go?" (mock D1).** Every field prefilled from the appointment; `pet_id` comes **from the appointment** (never `activePet`); saving with nothing typed is allowed; an open row is never a blocker (*Later* is a row's resting state). The plan rows **read the record before they ask** (CUL-825: ask the record at press time, not state):
- **An active course** (`medications WHERE pet_id AND status='active'`) renders as a confirmation — *Keep* (links the course: `UPDATE … SET vet_visit_id, updated_at, synced = 0`; `started_at` never moves), *Changed* (opens the course's edit with the visit linked; never a second course that would split a dose count), *Stopped* (the owner action the H1 register requires; ends the course).
- **Started something new?** → *Add* opens the real medication setup **hosted inside the after-visit route** (one `Modal` presented by a pushed route — the CUL-662 pin), which returns the new regimen id to the row with no navigation; the label photo works there tomorrow. **Prerequisite: the medication write is local-first (VV-3).**
- **A running trial** (`getActiveTrialForPet`) renders *Keep* (link only) · *Ended* (`endActiveTrial` with the visit linked) · *Switched* (end + `startDietTrial` with `vetVisitId`, one flow). No trial → *Start a trial* opens the setup with the visit linked (the id returned — `StartTrialModal.onStarted` gains it).
- **A new food to try?** → `/food-capture` with a **resume-on-focus ref** (the `profile.tsx:264–272` shape: the pending link lives in a ref consumed once on focus, never in state — CUL-170); the food lands in the pet's library.
- **Next visit** → a new appointment pre-computed from the vet's words ("in six weeks") or a date.
- **Paperwork** → Vet Files, linked — including **the clinic's own summary** when the practice uses a scribe.
The saved moment (D2) names the pet and states the consequence honestly: **"Your next vet report starts from this visit"** (the window anchors strictly before today, so a report cut in the parking lot still runs to yesterday — never say "from today") and "since last visit on Home resets"; lists what was linked; the Vet Files offline line verbatim.

**The visit afterwards (mock D3).** Notes, the plan as live links whose numbers come from the linked records (never copied), the paperwork from Vet Files, "asked N of M". ⋯ holds *Edit* and *Delete*. **Delete ships only once CUL-19 has deployed** the reader that honours `deleted_at` (VV-6's on-the-fly decision); when it ships, the confirm names two facts — the report window moves back, and the linked course and trial survive.

**History.** A visit renders as its own row type in the timeline (date, clinic, reason; tap → the visit). It is **not an `events` row** and never enters the correlation engine, a count, a coverage line or Patterns (AC 10).

**The report.** No render change in v1. The cascade already consumes the new visit. *v1.x candidate (Dr. Chen):* a "Visits" line in the appendix — rides CUL-19.

**Reminders.** CUL-253 becomes a pure consumer of `vet_appointments` (T-2d / T-1d, category `vet_visit`, door → Get ready); its own issue under the notification foundation's posture.

**What v1 explicitly does not do:** no microphone, no transcript, no model call, no rich text, no Home entry outside the window, no fifth tab, no clinic-side surface, no calendar write, no visit delete before CUL-19 runs (§10).

### 4.2 v1.x — the recording (mock §C2–C3 boxed; the contract in §6)

Ships in a build **after** the App Store submission (G5), as VV-7 after its spikes. The spine: consent every time (a per-recording acknowledgment that is never remembered); state never hidden; exam room only; foreground only with the screen awake; on-device transcription (iOS 26 SpeechAnalyzer through a thin local module; older iOS only if spike S2 proves it; Android notes-only); audio never leaves the phone; no speaker identification; delete either at any time; disclosures move first. The one open design decision inside it is the audible start announcement (§9, conflict 3).

### 4.3 v2.0 — AI over the visit (G6; gated)

The visit summary (mock B2 as an option), phrased question suggestions over the deterministic rows, and — only ever as an experiment gated on real visits showing the pre-visit list insufficient — live suggestions (§9, conflict 1). Each needs a D2-class PM + T&S ruling first. Cost envelope: a summary ≈ $0.015 (Haiku 4.5) to $0.045 (Sonnet 4.6) per visit; live ≈ $0.08–0.29.

---

## 5. Data model & architecture

### 5.1 Schema (VV-1; final DDL at build, own PR, Migration Safety Pre-flight)

```sql
-- The booked-but-not-yet-happened visit. Separate from vet_visits so every
-- existing reader that assumes "a vet_visits row happened" stays true (G3):
-- the rundown's MAX(visited_at) (lib/rundown.ts:642) and the Vet Files picker
-- (lib/vetDocumentDetail.ts:189) are unbounded; the report skips today/future.
CREATE TABLE vet_appointments (
  id            UUID PRIMARY KEY,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,          -- a time matters for the reminder and the window
  clinic_name   TEXT,
  vet_name      TEXT,
  reason        TEXT,
  questions     JSONB,                          -- [{id, text, source: 'record'|'owner', source_ref, asked_at}]
  notes_draft   TEXT,                           -- the C1 draft, before a visit row exists
  visit_id      UUID REFERENCES vet_visits(id) ON DELETE SET NULL,  -- filled when the visit is logged
  cancelled_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS default-deny; owner policy per pet (the vet_visits_owner shape); SELECT/INSERT/UPDATE only, no DELETE verb (the 044 precedent).
-- Same-pet trigger over visit_id (the 023/041/045 mechanism, SECURITY DEFINER, negative-EXISTS, fails closed).

ALTER TABLE vet_visits    ADD COLUMN deleted_at   TIMESTAMPTZ;                                          -- the column ships now; the control waits for CUL-19 (§4.1 D3)
ALTER TABLE medications   ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;
ALTER TABLE diet_trials   ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;
-- Same-pet triggers on BOTH new links (the 045 bare-FK class: FK checks bypass RLS). vet_documents.vet_visit_id already has one.
```

- **`questions` as JSON, not a table:** never queried across visits, ≤ a dozen strings with an `asked_at`, moved from the appointment onto the visit at save. Promote to a table if any surface ever counts them (Data Scientist: acceptable; flagged).
- **`notes_draft` on the appointment** is the C1 draft's home: D1 creates the visit row and moves the draft into `vet_visits.notes`. No phantom visit rows; D7-clean.
- **Migration Safety Pre-flight:** additive (`n`); rollback = `DROP TABLE vet_appointments; ALTER TABLE … DROP COLUMN …`; backfill N/A.
- **Attendance:** logging a visit from an appointment writes the `vet_visits` row (`visited_at` = the appointment's local date, `pet_id` from the appointment) and sets `visit_id`; the appointment then leaves Home and *Next*. Logging a visit with no appointment is the repaired path.
- **Links are provenance, not truth:** a course or a trial linked to a visit says *where it came from*; its dates and counts stay its own (CUL-746 — one population, one owner; TG-5 — a link never moves a date). *Already on it* is an UPDATE of the link only; *new* carries the link in the same INSERT, inside the trial's existing transaction, never a follow-up UPDATE a crash can lose.

### 5.2 Local-first plumbing (VV-1)
- `vet_appointments` DDL joins `BASE_SCHEMA_SQL` (`lib/localSchema.ts`) and **`LOCAL_WIPE_TABLES` in `lib/hydration.ts:241`, children first** (before `vet_visits`); the hydration order in **`lib/sync.ts:2785–2838`, parents first** (after `vet_visits`, no local FK — the Vet Files precedent). `hydration.test.ts` reds otherwise.
- The push: a new LWW queue entry via `serializeQueuePush('vet_appointments', …)`; every mutation moves `updated_at` (`syncQueue.test.ts`). **`vet_visits`' push enumerates columns (`lib/sync.ts:1184–1189`) and gains `deleted_at`;** so do `medicationRowToRemote` / `dietTrialRowToRemote` and the hydration mappers for the two new links (`lib/medications.ts:156, 259, 1549, 1570`; `lib/dietTrialMirror.ts:295`; `lib/sync.ts:2464, 2576`).
- The draft autosave is a local write with `synced = 0` like any other; `questions[].asked_at` too.

### 5.3 Readers gain `deleted_at IS NULL` (VV-1, inert on the report until CUL-19)
`report.ts` (the pull at `index.ts:809`), `lib/rundown.ts` `readLastVisitDate` / `readSinceVisitChanges`, `lib/vetDocumentDetail.ts` `VET_VISIT_OPTIONS_QUERY`, hydration. The report's change lands on `main` and is inert until the CUL-19 redeploy, which gains this reader as a third rider — the reason the delete *control* waits (§4.1 D3).

### 5.4 The medication write goes local-first (VV-3 — a prerequisite)
`AddMedicationModal.tsx:284` inserts remote-first and shows "Could not save" offline (`:298`), while `lib/sync.ts:1768` already drains a `medications` queue. VV-3 adds **`startRegimen()` in `lib/medicationSetup.ts`** in the `startDietTrial` shape (`lib/dietTrialSetup.ts:16–22, 932–953`): the local INSERT with `synced = 0` in one transaction, the id returned, the queue pushing. The modal calls it (Jordan in the parking lot gets the same offline behaviour on the Pet tab); the plan row calls it with `vetVisitId`. `RegimenWritePayload` (`lib/medications.ts:1570`) carries `vet_visit_id`.

### 5.5 The toggle (VV-0 — mirrors the daily look's N-0 verbatim)
- **Migration `064_vet_visits_config.sql`:** `INSERT INTO app_config (key, value) VALUES ('vet_visits', '{"enabled": false, "allowlist": []}') ON CONFLICT (key) DO NOTHING` (`063:88–91`) — seed-first, default nobody; cohort enablement (the PM's uid) is a later recorded config UPDATE, never baked into the seed; the App Review demo account is never allowlisted.
- **Client:** `'vet_visits'` in `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET` (`lib/appConfig.ts:85–111`); a `BETA_REGISTRY` row (`lib/betaFeatures.ts:124–146`, title "Vet visits", `serverCost: false` — no server function reads the key; neither `ask` nor `generate-signal` reads `vet_visits`); the glyph/hint case in `app/settings/beta.tsx:74`; consumers behind `useAllowlistFlag('vet_visits') && useBetaOptIn('vet_visits')` (`lib/betaFeatures.ts:289`).
- **Flag-off byte-identical** (AC 0): a snapshot test toggles the flag and diffs Home, the Pet tab's vet section, `/rundown` and `app/vet-visit.tsx`; run red by rendering one new card flag-off.
- **Retirement:** a PM GA call flips `enabled: true`; a removal PR deletes the key, the registry row, `app/vet-visit.tsx` and Ask's `log-visit` tile.

### 5.6 Guards the build meets, and one it adds
`hydration.test.ts` (wipe set); `syncQueue.test.ts` (`updated_at` moves); `guards/recordPetName.test.ts` (every visit surface names the *record's* pet via `resolveRecordPetName(pets, appt.pet_id)`); `guards/completionCard.test.ts` (the saved moment is a completion surface); `guards/haptics.test.ts` (a visit save is a soft moment); the accent-on-light and Geist guards; the CUL-662 pin (exactly one `Modal` in the after-visit tree with the medication sheet open and closed). **New: `guards/visitReaders.test.ts`** — enumerates the files allowed to `SELECT` from `vet_visits` / `vet_appointments` or read `vet_visit_id`; a select added to `detection.ts`, `analytics.ts`, any coverage line or Patterns panel reds the build; proven by mutation (C-18).

---

## 6. Security, privacy & the recording contract

### 6.1 v1 (typed) — nothing new crosses a boundary
Per-pet RLS on the new table; same-pet triggers on the three links; no new bucket; no new secret; no model call; **no microphone in the submission binary** — VV-7 never merges before the submission build is cut (a toggle hides a screen, not a purpose string); verified on the built artifact (`Info.plist` carries no `NSMicrophoneUsageDescription`). The new rows join the deletion cascade (by `pets` cascade; `rls-privacy-reviewer` probes it — AC 12), the export scope line (doc-only today: no export function exists in `supabase/functions/`), and `wipeLocalSession`.

### 6.2 Soft delete vs hard delete — the written ruling
Typed notes (`vet_visits.notes`) are the owner's own words about the visit and **soft-delete** like every other record (the house rule; a delete must be reversible and the report window must be able to move back). A v1.x transcript is a **verbatim capture of a third party's speech** and **hard-deletes** on the owner's request: an honest erasure story for other people's words beats reversibility. The line is verbatim capture, and it is written here so VV-7 does not re-derive it. Flagged for the Dir. of Engineering as the second documented exception to the soft-delete rule.

### 6.3 v1.x — the consent contract (binding when VV-7 opens)
One all-party posture everywhere (the app collects no location, so it cannot know the state).
- **A first-use sheet, once per account** (re-shown after twelve months or a policy change; full-screen, never modal-on-modal): what recording does, that it captures everyone in the room, that audio stays on the phone and only the transcript syncs, that some states require everyone's agreement and the owner is responsible for asking, with the ask-your-vet script. **Copy constraints:** never state or imply recording is legal for this owner; never "you don't need permission in your state"; never frame the vet's refusal as an obstacle; never promise the transcript is complete.
- **Every recording — the gate (mock C2)**: one un-pre-checked acknowledgment — *"Everyone in the room knows I'm recording and is okay with it"* — stored as `consent_acknowledged_at`; not remembered, not skippable; plus *start once the exam-room door is closed*. No auto-start, nothing from the widget.
- **At start — the audible announcement** (*"Culprit is recording this visit"*, captured in the recording): the statutory form of consent in Washington, Oregon's "specifically informed", the defeat of Massachusetts' secrecy element, Apple's own choice. **T&S default: on and locked. Designer dissent recorded (§9). PM decision at VV-7.**
- **While recording (mock C3)**: a persistent pill on every reachable screen; foreground only, screen kept awake; Pause and Stop one tap each; auto-stop at 60 min.
- **Stop → review → keep or discard**: the transcript is shown before anything leaves the device; lines deletable; Discard deletes audio and partial transcript at every point.
- **On-device transcription only**; no silent server fallback; raw audio never uploaded, deleted when the transcript is saved or discarded (24 h ceiling), registered in `wipeLocalSession`; the transcript a pet-scoped row, synced like notes, exported, purged with the account, **hard-deleted on request** (§6.2).
- **"Summarize" is a separate explicit action** (v2) with a first-use 5.1.2(i) disclosure naming Anthropic; never auto-summarise.
- **No diarization, no speaker labels, no voice enrolment.** **Never built:** covert or screen-off mode, auto-start, background capture, a public share link for transcripts, any Culprit use beyond the owner's record, any "it's legal here" copy.
- **Disclosures in the same PR:** the microphone purpose string via the audio plugin (no background audio mode), `docs/legal/privacy-policy.md` (§1, §3, §6, §7 + a "Recording other people" section), `docs/app-privacy-answers.md` re-checked, a counsel-drafted Terms addition; verified on the built artifact and by a packet capture showing audio never hits the network. `rls-privacy-reviewer` runs on VV-7.

### 6.4 Questions only counsel can answer (Tier-2 addition to `docs/legal/attorney-brief.md`; the full ten in the evidence brief §2.11)
1. Does an in-app acknowledgment plus an audible announcement captured in the recording satisfy Massachusetts, Oregon, Washington and Illinois — is a *spoken* announcement required?
2. Should an LLC be formed before any microphone feature ships (Apple 5.1.1(ix); CIPA § 637.2 and BIPA per-violation damages)?
3. Post-Otter "tool" status under CIPA § 631; is sending the *transcript* to Anthropic a third party "learning the contents"?
4. Does content-based speaker labelling invite a voiceprint claim; do Illinois users need a written release?
5. The Terms addition's value; whether release needs re-acceptance.

---

## 7. Acceptance criteria (v1)

0. **Flag-off is byte-identical:** with `vet_visits` unset, Home, the Pet tab's vet section, `/rundown` and `app/vet-visit.tsx` render the same tree as `main` — a snapshot test toggling the flag, run red by rendering one new card flag-off.
1. From the Pet tab an owner reaches Vet visits in ≤2 taps; from Home inside the window, Get ready in 1.
2. Booking takes ≤10 s with only a date required; clinic/vet prefill from the last visit; "Also for {pet}" renders only in multi-pet accounts and creates a second row under the other pet.
3. The Home strip renders only inside the window (5 days), **under the Signal and any safety or intake card**, never changes a Signal string, disappears when the visit is logged or the appointment is cancelled, and after the day passes asks exactly once.
4. Get ready renders the shipped rundown **byte-identical** to `/rundown` (`toJSON()` deep-equal over one fixture DB) and makes **zero model calls** (a `fetch` / `functions.invoke` spy through mount and every tap); it works offline and capped.
5. "Worth raising" quotes the Signal's phrased sentence verbatim from the cached payload, caps at four, and **renders no section** for a quiet record; a safety finding leads; no row ever contains *fussy*, *picky* or *preference* about a decline (a guard over the row copy).
6. In-visit notes autosave to the appointment: kill the app mid-sentence → relaunch → the draft is there; a question tick survives the same.
7. After-visit: saving with nothing typed is allowed; an active course renders *Keep / Changed / Stopped* and *Keep* leaves `COUNT(*) WHERE status='active'` unchanged with `vet_visit_id` set; a running trial renders *Keep / Ended / Switched*, never a second trial; *Add* presents **exactly one `Modal`** (the CUL-662 pin) and a new regimen lands as a local row with `synced = 0` and `vet_visit_id` in the same insert — **under a mocked-offline client** (fails today; VV-3's condition); the next-visit row creates a `vet_appointments` row; *Later* saves the visit with the row open.
8. The saved moment names the pet, says "starts from this visit" (never "from today"), and lists what was linked; the offline line is present.
9. Logging a visit today changes the default window of a report generated **tomorrow** to start on the visit's day (the report's rung 1 is strictly before today — asserted, not assumed); a report generated the same day still runs to yesterday and the copy never claims otherwise. *(Delete reversal is VV-6's AC, gated on CUL-19.)*
10. A visit row in History taps to the visit; `guards/visitReaders.test.ts` pins the reader set — visits never appear in any count, coverage line, Patterns panel or engine input.
11. Multi-pet: every visit surface names the record's pet via `resolveRecordPetName`; open D1 for pet A, switch the store's active pet to B, save → `vet_visits.pet_id === A` (`app/vet-visit.tsx:117` is the bug this catches).
12. Cross-tenant probe on `vet_appointments` and the three links returns uniform not-found; `delete-account` leaves zero rows (verified count); `rls-privacy-reviewer` reports the attack it tried.
13. Theme tokens only; `ChipGroup` for the happened/booked choice and the plan chips; no `ActivityIndicator`; hit areas ≥44 pt; `ThemedText` throughout; every plan row's chips obey the adjacent-controls gap rule.

---

## 8. PR plan — the run order (the Linear project carries the same table)

One PR per session; each with its DoD, the persona line, `code-reviewer` before push; `rls-privacy-reviewer` on VV-1 and VV-3; `pm-feature-review` on VV-6. Design authority: mock round 2.

| PR | Scope | Depends on | Decide on the fly (default marked) |
|---|---|---|---|
| **VV-0** | **The flag.** Migration 064 seeds `vet_visits` dark; the client key; the `BETA_REGISTRY` row; the `beta.tsx` case; the AC 0 snapshot harness. No consumer. | nothing — **start now** | Key name (`vet_visits` ✓ vs `vet_visit_companion`); whether the PM's uid is allowlisted at seed (no ✓ — a later config UPDATE, the 063 lesson). |
| **VV-1** | **The schema + plumbing.** `vet_appointments` (+ RLS, no DELETE verb, same-pet trigger), `vet_visits.deleted_at`, `medications.vet_visit_id` + `diet_trials.vet_visit_id` (+ their same-pet triggers). Local DDL, wipe set (children first), hydration order (parents first), the push queue, the enumerated `vet_visits` push gaining `deleted_at`, the two link mappers. Readers gain `deleted_at IS NULL` (report inert until CUL-19). `guards/visitReaders.test.ts`. Migration Safety Pre-flight. | VV-0 merged | `questions` JSON ✓ vs a child table; `notes_draft` on the appointment ✓ vs a phantom visit row; ship `deleted_at` now ✓ (the control waits) vs with VV-6. |
| **VV-2** | **The home.** Pet-tab "Vet visits" card (A1, incl. the zero-visit state), the list (E1), the empty state (E2), booking (E3, "Also for {pet}"), the visit detail read-only (D3 without ⋯), all behind the flag. | VV-1 | "Add" asks happened-or-booked first ✓ vs two buttons; time optional ✓; the card's position between Vet report and Vet Files ✓. |
| **VV-3** | **The medication write goes local-first.** `startRegimen()` in `lib/medicationSetup.ts` (the `startDietTrial` shape); `AddMedicationModal` calls it; `RegimenWritePayload` carries `vet_visit_id`; `StartTrialModal.onStarted` returns the id; `startDietTrial` takes `vetVisitId`. No visible change flag-off beyond offline now working on the Pet tab. **Parallel-safe with VV-2** (disjoint files). | VV-1 | Adopt local-first for every caller ✓ vs only the plan row (the modal's offline "Could not save" is the bug Jordan named). |
| **VV-4** | **The visit.** "At the vet" (C1: the draft autosave, the ticks, paperwork → Vet Files linked under the visit's pet), "How did it go?" (D1: record-aware rows, the one hosted `Modal`, the resume-on-focus ref for `/food-capture`, *Later*), the saved moment (D2), the visit as written (D3 with Edit). Replaces `app/vet-visit.tsx` behind the flag (the file itself goes at GA). | VV-2, VV-3 | The after-visit screen as a pushed route ✓ (so it may present one Modal) vs the modal presentation the old screen has; *Changed* opens the course edit ✓ vs a mini-form; *Switched* = end + start in one flow ✓; where the recheck's "in six weeks" is parsed (a date picker seeded at +6 weeks ✓ vs free text). |
| **VV-5** | **The moment + Get ready.** The Home strip under the Signal (A2) with the window constant, the ask-once state (A2b), *Add a question*; `/rundown` promoted to Get ready (B1) with "Worth raising" quoting the Signal, the questions block, one primary, ⋯ *Copy as text* + *Change the appointment*; Ask keeps its chips. **Parallel-safe with VV-4** after VV-2. | VV-2 | Window = 5 ✓ (3–7 ruled fine); the strip's slot — between the Signal and the trial strip ✓ vs after the med strips; the "Worth raising" source set (Signal findings + trial + no-end course + weight gap ✓) and cap (4 ✓); the *Copy as text* label ✓ vs *Keep a copy*. |
| **VV-6** | **History row + delete + the finish pass.** The timeline row type; the ⋯ *Delete* with its two-fact confirm **only if CUL-19 has deployed**; `nyx-voice` over every string; `pm-feature-review` (Jordan + Sam); the §7 AC walk; the on-device QA script on the PM's own appointment. | VV-4, VV-5 | Delete ships now with a confirm naming the report lag vs **waits for CUL-19** ✓ vs CUL-19 gains this reader as a third rider (also ✓ — file the rider either way). |
| **VV-GA** | **General availability.** The PM's GA call → `enabled: true` → the removal PR (the key, the registry row, `app/vet-visit.tsx`, Ask's `log-visit` tile) — never silent. | VV-6 + the PM's own dogfood pass | The bake period (the PM's next real visit ✓ vs a fixed date). |
| **VV-7** *(v1.x)* | **The recording.** Spikes S1/S2/S4 first; then the consent contract §6.3, purpose string, policy + App Privacy + Terms edits in the same PR; `rls-privacy-reviewer`. **After the App Store submission build is cut, never before.** | a shipped v1; G5 | The audible announcement (T&S default-on locked vs Designer tap-only — §9 conflict 3); which iOS floor (26 only ✓ vs the legacy engine if S2 passes). |
| **v2** | The summary, phrased questions; live suggestions only as an experiment — own spec after the D2-class ruling. | G6 | — |

**Critical path:** VV-0 → VV-1 → VV-2 → VV-4 → VV-6 → VV-GA. **Parallel lanes:** VV-3 ∥ VV-2; VV-5 ∥ VV-4. **The one shared file to expect a collision on:** `app/(tabs)/profile.tsx` (VV-2's card vs VV-3's modal change) — sequence or rebase. **Deploy needs:** none (no Edge Function changes; the report reader lands inert). **Held:** CUL-19 gates only the delete control.

**Per-session kickoff prompts:**
- *VV-0:* "Build VV-0 from `docs/nyx-vet-visits-requirements.md` §5.5 — the `vet_visits` rollout flag: migration 064 (mirror 063 verbatim), the client key, the registry row, the `beta.tsx` case, and the AC 0 flag-off snapshot harness. No consumer. Schema-isolated."
- *VV-1:* "Build VV-1 from §5.1–5.3, §5.6 — `vet_appointments` + the three links + `vet_visits.deleted_at` with their same-pet triggers, the local-first plumbing (wipe set in `lib/hydration.ts`, hydration order in `lib/sync.ts`, the enumerated push), the reader sweep, and `guards/visitReaders.test.ts`. Migration Safety Pre-flight in the PR body; `rls-privacy-reviewer` mandatory."
- *VV-2 → VV-5:* "Build VV-{n} from §4.1 / §8 against mock round 2 (`docs/culprit-vet-visits-mockups.html`). Check the issue's *Decide on the fly* section and §0 before deviating from any frame."
- *VV-6:* "Run VV-6 from §8 — the History row, the delete control if CUL-19 has run, the voice pass, `pm-feature-review`, the §7 AC walk, the Manual QA script on the PM's own appointment."

---

## 9. Persona positions & recorded conflicts

- **Designer:** the lifecycle shape; a state strip inside a window, never a standing entry; one primary on Get ready; structured fields over rich text; the empty state as the primary screen. *Condition met:* the strip under the Signal; the ask-once state.
- **Dir. of Engineering:** `vet_appointments` (the reader set is the argument); the medication write local-first before a plan row may open it; the hosted single Modal; no microphone in the submission binary; the delete control waits for CUL-19.
- **Data Scientist:** visits are provenance anchors, never counts; the reader guard; triggers on both links; "Worth raising" quotes, never re-derives; `questions` as JSON is acceptable until something counts them; the draft has a home.
- **Dr. Chen:** *Stopped* / *Ended · Switched* on the plan rows (the recheck is where a failed course or trial is ended); the recheck date lands as an appointment that reappears on Home; the rundown is not for the vet — the report is.
- **Jordan:** two taps and zero typing in the parking lot; *Later* on every row; Get ready stays the day's primary door; the photo one tap from the visit; "Worth raising" never more than four.
- **Sam:** the intake card leads; "Also for Juniper" at booking; "add the food to the library" beside "start a trial"; never *fussy / picky / preference* about a decline; each pet's Home shows its own appointment.
- **QA:** AC 0, 4, 7, 9 and 11 get explicit verification steps; the same-day lag is asserted, not assumed; the offline med write is the condition.
- **Product Owner:** own project after the submission cut, beside Noticed; VV-5's early ride needs its own dependency line (it has one: VV-2); CUL-253 / CUL-397 / CUL-467 / CUL-206 / CUL-216 linked and left open; CUL-878 closed by the rulings.
- **Trust & Safety:** §6 in full; the disclosures-in-the-same-PR rule; the written soft-vs-hard-delete line; VV-7 after the submission cut.

**Recorded conflict 1 — live suggestions in the room: punted by the PM (2026-09-10).** Dr. Chen / Jordan / Designer / Engineer's dissent stands as the reason; a v2 experiment only if real visits show the pre-visit list insufficient.

**Recorded conflict 2 — recording in v1: ruled v1.x (G5, 2026-09-10).** The AI-first instinct is preserved as VV-7's mandate, after the submission cut.

**Recorded conflict 3 — the audible announcement at the start of a recording (v1.x, VV-7):**
> **Trust & Safety:** the acknowledgment tap is the owner's *claim*; the spoken line captured in the audio is the *record* that the room was told — the only element that maps onto a statutory consent form (Washington), Oregon's "specifically informed", and Apple's own call-recording precedent. Default on, not user-disableable.
> **Designer:** a phone announcing itself in a small exam room is socially awkward and will make owners skip the feature; the tap already carries the consent, and the visible recording state is honest.
> **Dr. Chen:** the announcement is what makes the clinic staff comfortable; the vet-side scribes ask out loud too.
> **PM decision needed at VV-7:** default-on and locked (T&S), default-on with a settings opt-out (compromise), or tap-only (Designer). No v1 impact.

---

## 10. Parked (not dropped)

- **Files and Visits as two cards** — "it's now weird to have files as well as visits" (PM, tabled). A later question about whether Vet Files becomes a section inside Visits.
- **The visit delete control** — VV-6, only once CUL-19 has deployed the reader (or with an honest lag line; decided on the issue).
- **The report's "Visits" appendix line** — v1.x, rides CUL-19.
- **Appointment reminders** — CUL-253, unblocked by VV-1; stays under the notification foundation.
- **Calendar write** (EventKit) — a permission and a new capture class; own discovery.
- **Share-sheet import** (CUL-467's fix) — the clinic-scribe client summary is the first document class it should be designed around.
- **Offering the recording from the prep card in the waiting room** — VV-7's design, not v1.
- **"What we changed" hand-back to the clinic** — composes with CUL-397 and the report's share.
- **Multi-pet appointments as a linked pair** — two rows today.
- **Household** — follows B-292.
- **Live suggestions** — conflict 1.

---

## 11. Follow-ups & flagged doc edits (Tier 2 — PM confirmation before writing)

- `docs/legal/attorney-brief.md`: §6.4's questions as a "recording feature" addendum; the LLC becomes a prerequisite of the microphone release — **proposed, gated on VV-7.**
- `docs/legal/privacy-policy.md`, `docs/legal/terms-of-service.md`, `docs/app-privacy-answers.md` — **written in VV-7's PR, not before.**
- `docs/nyx-vet-report-requirements.md` §6: a soft-deleted visit is excluded from rung 1 — **lands with VV-1.**
- `docs/nyx-ask-requirements.md` §3.3: the rundown gains a second door, a "Worth raising" block and the demoted share — **lands with VV-5**; CUL-206 gets a comment.
- `docs/nyx-notifications-v2-requirements.md:108` and CUL-253: the "column vs tiny table" question is answered by G3 — **comment on CUL-253.**
- `docs/nyx-medication-logging-requirements.md`: the regimen write goes local-first — **lands with VV-3.**
- CLAUDE.md Read-These row: updated to v1.0 BUILD-READY (Tier 1, inline).

---

## 12. Version history

| Version | Date | Summary |
|---|---|---|
| 0.1 | 2026-09-09 | Discovery draft from the PM brainstorm: the code audit, the lifecycle proposal, the G1–G7 briefs, the recording contract, mock round 1. |
| 1.0 | 2026-09-10 | **BUILD-READY.** The PM's round-1 reactions applied as rulings (G0 the toggle, G1–G7, the window, the demoted share, the photo's home, the record-aware plan rows); nine isolated persona interviews (2 BUILD · 7 BUILD WITH CONDITIONS · 0 DON'T BUILD) folded in as rules and on-the-fly decisions; **premises corrected at file:line** — the medication setup is a remote-first Modal, not a route (→ VV-3); the report's rung skips today/future (→ the same-day lag and the saved-moment copy); the wipe set lives in `lib/hydration.ts` and the hydration order in `lib/sync.ts`; the `vet_visits` push enumerates columns; the C1 draft had no home (→ `notes_draft`); the two new links need same-pet triggers; the delete control waits for CUL-19. Mock round 2 as one proposal; the VV-0 → VV-GA run order with a decide-on-the-fly column. |
