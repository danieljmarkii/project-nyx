# Nyx Vet Visits — The Appointment Companion — Requirements (CUL-878)

**Version:** 0.1 — **DISCOVERY DRAFT** | **Date:** 2026-09-09 | **Status:** the decision briefs in §0 are **open**; nothing here is build-ready until the PM rules G1–G7. Mock round 1 is published (`docs/culprit-vet-visits-mockups.html`); the evidence sits in `docs/research/2026-09-vet-visit-companion-evidence.md` 🧊.

**Read with:** `docs/nyx-vet-report-requirements.md` §6 (the scope cascade keys off visits), `docs/nyx-vet-files-requirements.md` (D7, the VF substrate this reuses), `docs/nyx-ask-requirements.md` §3.3 (the rundown this promotes), `docs/nyx-notification-foundation-requirements.md` + CUL-253 (the reminder this unblocks), `docs/monetization-and-throttling-requirements.md` §3 (free forever), `docs/nyx-design-principles-v1_0.md` §3 + § Navigation (Home is a state surface; a visit is a doorway, not a tab).

---

## 0. Decision record — the briefs

Each brief is written so the PM can rule from it alone (CLAUDE.md § Presenting decisions). The team's recommendation is marked; dissent is named where it exists.

| # | Deciding | Options | Consequence |
|---|---|---|---|
| **G1 — What v1 is** | Whether v1 is the whole lifecycle typed, or only a repaired form. | **(a) The lifecycle, typed — recommended:** a home for visits, the appointment as a first-class fact, the Home card inside the window, "Get ready" (the shipped rundown + questions), the after-visit capture whose plan rows hand off to medication / trial / next-visit / Vet Files. No microphone. *(b)* Repair only: make `app/vet-visit.tsx` reachable and add a list. *(c)* (a) plus recording. | (a) is 4–5 PRs and is what makes the visit worth logging; (b) ships a form nobody asked for; (c) pulls a permission and a privacy-policy edit into the App Store submission window (see G5). |
| **G2 — Placement** (mock §A) | Where visits live and where they show up. | **A1 + A2 — recommended:** a "Vet visits" card in the Pet tab's vet-facing trio *(the home)* + an appointment card on Home only inside the window, gone once the visit is logged *(the moment)*. *A1 alone* leaves prep eight cards deep on the day it matters (CUL-467). *A3 (status quo, Ask)* stays a secondary door. A fifth tab is rejected under the navigation rule. | Rules the entry points for VV-1 and VV-3. The Home window length (3 vs 7 days) is a mock reaction, not a gate. |
| **G3 — The upcoming appointment's home** | How a booked-but-not-yet-happened visit is stored. | **New `vet_appointments` table — recommended (Engineer + Data Scientist):** `scheduled_at`, clinic/vet/reason, `visit_id` filled when the visit is logged. *Alt:* lifecycle columns on `vet_visits` — but three readers (`report.ts:679`, `lib/rundown.ts readLastVisitDate`, `lib/vetDocumentDetail.ts` picker) treat every row as a visit that happened, and the rundown takes `MAX(visited_at)` with no upper bound, so a future row would silently corrupt "since last visit". *Alt:* keep only `next_visit_at` — leaves the CUL-253 gap. | Own schema PR (VV-0). D7 holds by construction. Unblocks CUL-253's T-2d/T-1d reminder as a pure consumer. |
| **G4 — Notes shape** | Plain text with structure, or rich text. | **Structured plain text — recommended (Designer + Engineer):** *what the vet said* (`notes`, the 600-char UI cap lifted; the column is already TEXT) + the plan as **links** to real records + the owner's questions. *Alt:* one Markdown-lite field with bullets (v1.x if notes grow long). *Alt:* a rich-text editor — every RN option is a WebView or a young native module, and formatting is a decision at the moment of capture on a one-thumb screen. | No schema change for v1. The technical lane's editor read is in the evidence brief §3. |
| **G5 — When recording ships** | v1, v1.x after launch, or never. | **v1.x, after the App Store submission, behind the consent contract (§6) — recommended (T&S + Engineer; the PM's AI-first instinct is the recorded counter-position):** per-recording "ask your vet" sheet, always-visible state, on-device transcription, audio never leaves the phone by default, no speaker identification. *v1:* adds the microphone purpose string, a privacy-policy edit ("no microphone" today), the App Privacy re-check and, per Apple 5.1.1(ix), the legal-entity question into the review window. *Never:* forfeits the strongest capture the PM named. | Rules VV-5 and whether the microphone enters the submission binary. Needs counsel on §6.4 Q1–Q3 and the LLC already in `docs/legal/attorney-brief.md` before the microphone ships; the state-law table is in the evidence brief §2. |
| **G6 — AI over the visit** | Which AI reads are in scope and when. | **Deterministic first — recommended:** "Worth raising" in v1 is the record's own findings phrased as questions, one source each (the Signal pattern). The **visit summary** (mock B2) and **LLM-phrased question suggestions** are v2 behind a **D2-class PM + T&S ruling** (the Vet Files D8 shape): a transcript is a third party's speech crossing the LLM boundary. **Live suggestions in the room: recorded dissent (§9), not built** in v1 or v1.x. | Nothing in v1 calls a model, works offline and capped. The v2 ruling is a separate session. |
| **G7 — Priority** | Where this sits against App Store Launch and the live Home v2 build. | **PM's call** (the Vet Files G4 pattern). Team read: VV-0 → VV-3 is a post-launch track that strengthens both moats (the report's window, the trial's front door); **VV-3's rundown promotion is cheap and could ride earlier** as the PM's own visit approaches. Nothing here may delay submission. | Sets the project and the kickoff order in §8. |

**Ratified by nothing yet.** A ruling row moves to `docs/decisions-archive.md` when closed.

---

## 1. The jobs (PM-defined, 2026-09-09)

The PM's framing of the job: *get a pet owner positioned to leverage their data during a vet visit, and during a visit take the input of what we know in the moment and make suggestions.* Three moments fall out of it:

1. **Before** — know when it is, bring the record (the report), know what to say (the rundown), know what to ask.
2. **During** — capture what the vet said without losing the room to the phone.
3. **After** — the plan: what changed (a med, a diet, a recheck), where the paperwork went, what the next visit needs to know.

**Why this matters more to Culprit than to a generic pet app:** the visit is the *origin event of the wedge*. "Sent home with a diet trial or a symptom-monitoring directive" (CLAUDE.md) happens in that room, and today the directive enters the app only if the owner separately finds medication setup and trial setup. The after-visit capture is where the directive should enter the record — as confirmations of things the vet just said, not as forms.

**The user moment (v1):** Jordan is in the parking lot after a 15-minute recheck. The app already knows it was Tuesday at Riverside with Dr. Chen. Jordan types two sentences of what the vet said, taps "Add" on the med row and "Oct 28" on the next-visit row, photographs the discharge sheet, and is done before the car warms up. Six weeks later the Home card says *Vet visit on Tuesday*, and "Get ready" is one tap.

---

## 2. What exists today (code audit, verified at file:line 2026-09-09)

| Piece | Where | State |
|---|---|---|
| `vet_visits` table | `supabase/migrations/001_schema.sql:165` — `visited_at DATE NOT NULL`, `clinic_name`, `vet_name`, `reason`, `notes`, `next_visit_at DATE`, `updated_at` trigger | Live; synced both ways (`lib/sync.ts:1169` push, `:2259` hydrate); local mirror `lib/localSchema.ts:130`; in the wipe set. No `deleted_at` — **no delete path exists for a visit.** |
| `vet_visit_attachments` | migration 003 + hardening 043 | Legacy per-visit photo attach. Superseded in practice by Vet Files; Vet Files §11 parks a backfill-link. |
| The capture screen | `app/vet-visit.tsx` — photo step → details (date · clinic · vet · reason · notes `maxLength={600}` · next visit) → "Vet visit logged" | **Write-only: rendered nowhere.** Header is hand-rolled (B-075 remainder). Sole door: Ask → rundown → the "No prior visit logged" tile (`lib/rundown.ts` `{ kind: 'log-visit' }`). |
| The rundown | `lib/rundown.ts`, `app/rundown.tsx`, `components/ask/RundownTileRow.tsx` (Ask A6) | Shipped, deterministic, offline, capped-safe. Tiles: symptoms + timing recount, appetite, weight range, current meds, past meds (12-month window), **since last visit** (`readLastVisitDate` = `MAX(visited_at)`, no upper bound). Share = plain text via the OS sheet (CUL-206). Entry: two accent chips in `app/ask.tsx:289,387`. |
| The report's window | `supabase/functions/generate-report/report.ts:669–723` | Rung 1 = the most recent visit **strictly before today**. Logging a visit moves every subsequent report's default window. |
| Vet Files | B-478 VF-0→VF-6 (July); `vet_documents.vet_visit_id` optional link; the visit-link row renders only when ≥1 visit exists (`lib/vetDocumentDetail.ts:169–219`) | Shipped. D7: a document never mints or re-dates a visit. |
| Pet tab | `app/(tabs)/profile.tsx:1477–1501` — "Vet report" section, then `VetFilesCard` | The vet-facing pair this spec makes a trio. |
| Microphone | `app.json:59` `microphonePermission: false` (image-picker plugin); no `expo-audio` / speech dependency | The app declares **no** microphone use today; `docs/legal/privacy-policy.md:42` says so in words. |
| Reminders | CUL-253 (B-662) | Scoped and found data-gapped: an upcoming appointment has no row. `docs/nyx-notifications-v2-requirements.md:108` proposed "a minimal `next_visit_at`-class fact, column vs tiny table decided at build". |
| Talking points | CUL-397 (B-337) | The report-send cover note; composes with "Get ready" rather than duplicating it. |
| Document extraction | CUL-435 (B-145) | D8-gated; untouched here. |

**Two consequences the design carries:** (1) a logged visit is already clinically load-bearing (it resets the report window), so the saved moment must say so (mock D2); (2) the reader set that assumes "a `vet_visits` row is a visit that happened" is why the upcoming appointment gets its own table (G3).

---

## 3. Evidence base — three lanes (conclusions; the full brief is `docs/research/2026-09-vet-visit-companion-evidence.md`)

_Three isolated research agents ran in parallel on 2026-09-09 (competitive · legal/T&S · technical); their sourced briefs are the evidence brief's §1–§3 and only the conclusions are restated here. The prior landscapes (`docs/nyx-competitive-landscape-refresh-2026-06.md`, `docs/culprit-competitive-landscape-2026-07.md`) still stand where they overlap; competitor facts are re-verified at use._

### 3.1 Competitive — conclusions (lane 1, 2026-09-09)

- **The parts are commodities; the loop is whitespace.** Recording and transcription are OS-level on iPhone; clinic-side AI scribes (Scribenote, ScribbleVet, Talkatoo, VetRec, Digitail's Tails AI, Covetrus free in Pulse, Provet's free tier, Chewy in-house) already record a meaningful share of exam rooms and several emit a client summary. No product, owner-side or human-side, combines **prep before → capture during → the visit landing in the owner's own longitudinal record after**. `[E]`
- **One owner-side app already records visits — Pawtient AI** (Dec 2025, one App Store rating, $5.99/mo): record + AI summary "with the vet's permission" and an owner-assembled pre-visit mode. "First to record your vet visit" is a claim to retire. `[E]`
- **Fi Intelligence owns the phrase "vet visit companion" without recording anything** — document Q&A over uploaded records, hardware-tethered. The June landscape's read holds. `[E†]`
- **Nobody generates questions from the pet's own record** (Pawtient's are editorial, VetCore ships a static pack, Fi answers rather than proposes) and **nobody does anything live in the room** — that is the empty shelf "Worth raising" stands on. `[E]` for every listing fetched.
- **The human-health analogue says: don't sell the transcript.** Abridge's patient app is gone (removed July 2025; the company won on clinician-side distribution); the surviving patient recorders are indie and stale. The defensible thing is the record the visit lands in and the questions that record generates. `[E]`
- **The evidence on recording itself is strong and old:** 40–80 % of medical information is forgotten immediately; 72 % of patients listen to a recording; over half share it with a care partner; clinician discomfort that was anticipated "did not eventuate" where recording was open and endorsed. `[E]`
- **Consent is a design norm before it is a law.** Every scribe vendor, AAHA and VIN converge on *ask first*; Medcorder confirms before every recording; Apple's call notice cannot be disabled; the 2025–26 lawsuits turned on consent boilerplate nobody heard. The consent sheet in mock C2 is the industry norm rendered owner-side. `[E]`
- **Two claims the brief hands positioning:** *prepared before, captured during, in your record after — at any clinic* and *bring the clinic's summary in, too* (Vet Files already has the surface). Full retire/make list in the evidence brief §1.6.
### 3.2 Legal / Trust & Safety — conclusions (lane 2, 2026-09-09; diligence, not legal advice)

- **The owner is the recorder; the law binds the owner first.** In-person recording by a participant is lawful without the other side's consent in 39 jurisdictions including Nebraska; it needs every participant's consent (Oregon: that everyone is "specifically informed") in eleven states — CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA — plus Delaware as a caution. A closed exam room is a private conversation under every state's test; in Massachusetts the element is *secrecy*, so an openly announced recording is by definition outside the offence. `[E]`
- **App-maker exposure is real, four weeks old, and design-controllable.** *In re Otter.AI* (N.D. Cal., 2026-08-13) drew the line: a vendor that transcribes and hands the transcript back is a tool; one that retains and trains is a party. Culprit stays a tool by never holding raw audio server-side, never training, having no use of the content beyond the owner's record, and binding every processor to no-train terms. `[E]`
- **Apple raises the floor regardless of state.** 2.5.14 (explicit consent + a clear visual or audible indication whenever the microphone is used); 5.1.2(i), revised 2025-11-13 (explicit permission before personal data goes to third-party AI — an in-app prompt, not a policy link); and **5.1.1(ix)** (apps requiring sensitive user information are submitted by a legal entity, not an individual) — which makes the LLC question already in the attorney brief a prerequisite of the microphone release. `[E]`
- **On-device transcription keeps the App Privacy label honest without a new row.** Data processed only on device is not "collected", so Audio Data stays *No* while audio never leaves the phone; the transcript is User Content, already declared. What changes is the microphone purpose string, the policy's "no microphone" sentence, and a first-use 5.1.2(i) prompt the day a transcript is sent for a summary. `[E]`
- **The waiting room is off limits.** Audio bleed from other clients is *non-participant* interception with no consent exception in any state — the strongest reason recording starts only in the exam room with the door closed. `[E]/[A]`
- **No speaker identification.** BIPA, Texas CUBI and Washington all name "voiceprint"; three pending suits (Basich v. Microsoft, Cruz v. Fireflies, Otter) target exactly "who said what"; no court has ruled on within-recording diarization. `[E]`
- **Live suggestions are the highest-risk item**, not the summary: they stream third parties' speech to a server in real time, the fact pattern pleaded against Otter. `[E]`
- **The lane lands on G5's recommendation**: typed notes in v1; recording in v1.x behind the full contract, on-device, no stored audio, after the entity question. It adds two design inputs the mock now carries: an **audible start announcement** (the statutory consent form in Washington, Oregon's "specifically informed", Apple's own call-recording choice — Designer dissent recorded, §9 conflict 3) and **foreground-only capture** (no background audio mode; locking the phone stops the recording and says so). The state table, the exposure theories and the ten questions for counsel are in the evidence brief §2.
### 3.3 Technical feasibility — conclusions (lane 3, 2026-09-09)

- **The Claude API accepts no audio** (Messages content is text / image / PDF; the SDK feature request was closed "not planned"). Server transcription is therefore a **second vendor and a second processor** in the privacy policy. On-device transcription is the only single-vendor path — and the cleanest privacy posture. `[E]`
- **The engine that handles a 30-minute conversation is iOS 26-only.** Apple's SpeechAnalyzer benchmarks at ~2 % / ~5 % word-error (clean / noisy) against ~9 % / ~16 % for the legacy on-device recognizer; it is long-form by design and reachable from Expo managed through a thin local Swift module (no ejection). The legacy path on iOS 17–25 is officially unlimited on-device but undocumented past one minute; Android's on-device recognition is segmented and weak. `[E]` → **iOS 26 first; older iOS and Android are notes-only or a later server option.**
- **Background recording in `expo-audio` is young** (shipped Jan 2026); its predecessor has a documented history of exactly the failures a vet visit produces (screen lock, an incoming call). A device spike precedes any UX commitment. Mono AAC at 48 kbps is ~11 MB per 30 minutes. `[E]`
- **Rich text is not worth it in v1.** Structure via fields beats formatting for a one-thumb owner; every downstream consumer (report, sync, any prompt) is simpler with text. If formatting is ever wanted, the one candidate that is native, accessible and stores text is Software Mansion's `react-native-enriched-markdown` — three weeks past 1.0, so v1.x at earliest. WebView editors sit outside the theme tokens and the `ThemedText` guard. `[E]`
- **Costs are not the objection to any of this.** A post-visit summary ≈ $0.015 (Haiku 4.5) to $0.045 (Sonnet 4.6) per visit; live suggestions polled every 30 s ≈ $0.08 (cached) to $0.29 per visit. The current Anthropic models in use are zero-data-retention-eligible. `[E]/[A]`
- **Server STT, if ever chosen:** AssemblyAI (URL in, webhook out, cheapest, self-serve BAA) fits an Edge Function best; OpenAI's is synchronous with a 25 MB cap; Deepgram has no self-serve zero-retention. All are a T&S decision before an engineering one. `[E]`
- **Spikes before VV-5** (each ~half a day to a day on a physical iPhone): S1 30-minute background capture across lock and a phone call; S2 on-device transcript accuracy on a scripted consult with twenty drug and food names; S4 the summary-prompt eval with the adversarial reviewer's counterexample. Full list in the evidence brief §3.

---

## 4. The proposal

### 4.1 v1.0 — the lifecycle, typed (mock §A, §B, §C1, §D, §E)

**The home (Pet tab).** A "Vet visits" card between Vet report and Vet Files (mock A1): the next appointment leads when one exists, the last visit's plan sits under it in one line, "Open visits" is the door. The list (E1): *Next* then *Past*, newest first; each past row carries the plan it left behind as tags **derived from linked records, never typed**. The empty state (E2) is the primary screen for most owners (Principle 5) and names the two ways in.

**The appointment.** "Add" asks one question first — *already happened, or booked?* A booked visit takes a date, an optional time, clinic/vet (prefilled from the last visit), and a reason. It is a `vet_appointments` row (§5). The existing `next_visit_at` on the last visit seeds it when present.

**The moment (Home).** Inside the window — N days before through the day of — an appointment card renders above the Signal (mock A2) with exactly two doors: **Get ready** and **Send the report**. It never gains urgency styling (the widget rule), never pushes a safety card below the fold in a way that drops it (Principle 3: safety leads and is never dropped), and leaves Home the moment the visit is logged or the appointment is cancelled. Drawn at N = 3; a reaction sets it.

**Before — "Get ready" (mock B1).** The shipped rundown, reached by a job title, plus two blocks:
- **Worth raising** — deterministic, one source per row, each row a finding the app already states elsewhere: the leading Signal finding(s) (the phrased sentence, count-anchored, never verdicted — the Signal/Home spine), the active trial's day-of and coverage, any course with no end recorded (H1 register), the weight gap when no weigh-in is recent. Sources are named on the row. Never a new claim; never reassurance (a quiet record yields no row, not "all good").
- **Your questions** — typed once, carried into the visit as ticks, kept on the visit afterwards. A question is the owner's own text and is never read by a model in v1.
- The two hand-offs the rundown already has: **Send the vet report** (primary) and **Share the rundown**.

**During — notes + the checklist (mock C1).** Opens from the appointment card on the day. One plain-text field ("What the vet said"), **autosaved as a draft on the visit row** so a phone call or a lock screen loses nothing; the prepared questions as ticks; "Photograph the paperwork" → Vet Files with `vet_visit_id` pre-linked. No toolbar, no mic in v1.

**After — "How did it go?" (mock D1).** Every field prefilled from the appointment (date, clinic/vet, reason); saving with nothing typed is allowed. The plan rows are **doors, not fields**:
- *Started or changed a medication?* → the medication setup flow with the visit linked.
- *Changed the diet?* → the diet-trial setup, or **Keep** when a trial is running (the honest state; never re-mint a trial).
- *Next visit* → a new appointment, pre-computed from "in six weeks" style input or the vet's date.
- *Paperwork* → Vet Files, linked — **including the clinic's own visit summary** when the practice uses an AI scribe (a photo of the printout or the emailed PDF). The competitive lane's finding that the room is often already recorded turns the clinic's artifact into our input; the row's copy says so ("the discharge sheet, or the clinic's summary if they sent one").
The saved moment (D2) names the pet and **states the consequence**: the next report starts from today and "since last visit" resets. Offline line verbatim from Vet Files.

**The visit afterwards (mock D3).** Notes, the plan as live links whose numbers come from the linked records (never copied onto the visit), the paperwork from Vet Files, "asked N of M". Edit and soft-delete from ⋯ (a visit gains `deleted_at`, §5).

**History.** A visit renders as its own row type in the timeline (date, clinic, reason; tap → the visit). It is **not an `events` row** and never enters the correlation engine or any count.

**The report.** No render change in v1 (the `generate-report` redeploy is held under CUL-19 regardless). The cascade already consumes the new visit. *v1.x candidate (Dr. Chen):* a "Visits" line in the appendix — date · clinic · reason · plan links — rides CUL-19.

**Ask.** Keeps both chips; `/rundown` becomes the shared prep route with a `from` param so the header can say whose visit it is preparing.

**Reminders.** CUL-253 becomes a pure consumer of `vet_appointments` (T-2d / T-1d, category `vet_visit`, door → Get ready). It stays its own issue under the notification foundation's posture; v1 of this track does not schedule anything.

**What v1 explicitly does not do:** no microphone, no transcript, no model call anywhere on these screens, no rich text, no Home entry outside the window, no fifth tab, no clinic-side surface, no calendar write (parked, §10).

### 4.2 v1.x — the recording (mock §C2–C3; the contract in §6)

Ships in a build **after** the App Store submission (G5). The spine:
1. **Consent every time.** The "Recording a visit — ask first" sheet precedes every recording; the primary button is a claim the owner makes ("I've asked — start recording"). No one-time toggle stands in for it.
2. **State never hidden.** A dark bar with elapsed time, what is happening to the audio, and Stop; iOS's own indicator on top.
3. **On the phone.** Transcription runs on-device: iOS 26's SpeechAnalyzer through a thin local Expo module; older iOS falls back to the legacy on-device recognizer only if spike S2 proves it past one minute, else notes-only; Android v1.x is notes-only (a server vendor is a separate T&S decision). Audio is **not uploaded by default**; the transcript is owner-editable text on the visit and syncs like notes. The tables this needs (`vet_visit_recordings`, `vet_visit_transcripts`, a local `ai_jobs` queue for the later summary) are decided at VV-5, in their own schema PR.
4. **No speaker identification.** The transcript is unattributed prose. Diarization is a voiceprint question (Illinois BIPA-class) and buys the owner little.
5. **Delete either at any time.** Transcript and audio each have their own delete; account deletion purges both; export (B-041) gains the transcript.
6. **Disclosures move first.** The `NSMicrophoneUsageDescription` purpose string (plus `NSSpeechRecognitionUsageDescription` only if the legacy recognizer ships; SpeechAnalyzer needs the microphone permission alone), the App Privacy answers re-checked (Audio Data stays *No* while audio never leaves the device; the transcript is User Content, already declared), and the privacy policy's "no microphone" sentence change **in the same PR** as the feature, never after.
7. **Exam room only.** Recording starts once the owner confirms the exam-room door is closed. The waiting room is other people's conversations, and no state's consent exception covers a non-participant.
8. **Foreground, screen on.** No background audio mode. The phone lies face-up with the recording state visible and the screen kept awake; locking it or leaving the app stops the recording and says so. A pocketed phone that stops recording is honest; a hidden one that keeps going is the thing every statute is written against.

### 4.3 v2.0 — AI over the visit (G6; gated)

- **The visit summary** (mock B2 as an option): written from notes + transcript, always labelled as such, one tap from the full visit, owner-editable, never a diagnosis restated as fact ("your vet said…" framing), never reassurance. Data-minimized where possible (notes + transcript are the minimum; no photos).
- **Suggested questions, phrased**: LLM phrasing over the deterministic "Worth raising" rows (the Signal's phrasing layer, same guardrails), plus questions drawn from the *last* visit's plan ("the recheck was for the weight — was it discussed?").
- **Live suggestions during the visit**: *recorded dissent (§9)*; if ever tested, as a v2 experiment gated on real visits showing the pre-visit list is not enough.
- **Cost envelope (list prices verified 2026-09-09, evidence brief §3):** a 30-minute visit ≈ 4–6k words ≈ 6–8k input tokens plus a glossary of the pet's own med and food names. One summary ≈ $0.015 on Haiku 4.5, ≈ $0.035 on Sonnet 5, ≈ $0.045 on Sonnet 4.6. Live suggestions every 30 s with prompt caching ≈ $0.08 (cached) to $0.29 (uncached) per visit on Haiku. Cost is not the objection to live mode; the room is.

---

## 5. Data model & architecture (VV-0; final DDL at build, own PR)

```sql
-- The booked-but-not-yet-happened visit. Separate from vet_visits so every
-- existing reader that assumes "a vet_visits row happened" stays true (G3).
CREATE TABLE vet_appointments (
  id            UUID PRIMARY KEY,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,          -- a time matters for the reminder and the Home window
  clinic_name   TEXT,
  vet_name      TEXT,
  reason        TEXT,
  questions     JSONB,                          -- the owner's prepared questions [{text, source, source_ref, asked_at}]
  visit_id      UUID REFERENCES vet_visits(id) ON DELETE SET NULL,  -- filled when the visit is logged
  cancelled_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS default-deny; owner policy per pet, the vet_visits_owner shape.
-- Same-pet trigger over visit_id (the 023/041/045 mechanism): an appointment may
-- never point at another pet's — or another account's — visit.

ALTER TABLE vet_visits ADD COLUMN deleted_at TIMESTAMPTZ;   -- soft delete, house rule; today there is no delete path at all
ALTER TABLE medications ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;
ALTER TABLE diet_trials ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;
-- vet_documents.vet_visit_id already exists (044).
```

- **Why `questions` is JSON, not a table:** questions are never queried across visits, they are ≤ a dozen strings with an `asked_at`, and they move from the appointment to the visit on attendance. A child table is the normal form the v2 phrasing layer might want; promote then, not now. *(Data Scientist: acceptable; flag if any surface ever counts them.)*
- **The `deleted_at` on `vet_visits` is the one destructive-adjacent change:** every reader (`report.ts` visit pull, `rundown.ts`, `vetDocumentDetail.ts`, hydration) gains `deleted_at IS NULL`. A deleted visit **un-anchors the report window** — the saved-moment consequence in reverse — and the delete confirm must say so. Migration Safety Pre-flight: additive (`n`), rollback = `DROP COLUMN`, backfill N/A.
- **Attendance:** logging a visit from an appointment writes the `vet_visits` row (`visited_at` = the appointment's local date) and sets `visit_id`; the appointment then leaves Home and *Next*. Logging a visit with no appointment is the existing path, repaired.
- **Links are provenance, not truth:** a course or a trial linked to a visit says *where it came from*; its dates and counts stay its own (the CUL-746 partition rule — one population, one owner).
- **Local-first:** `vet_appointments` joins `BASE_SCHEMA_SQL`, `LOCAL_WIPE_TABLES`, the LWW push queue (`updated_at` moves on every mutation — `syncQueue.test.ts`), and the hydration order (before `vet_visits`? no — after, since `visit_id` may reference one; no local FK, the Vet Files precedent). The draft notes autosave is a local write with `synced = 0` like any other.
- **Deletion / export:** the table joins the `pets` cascade and the B-041 export scope line when VV-0 merges (Tier-2 flag, §11).
- **Guards the build will meet:** `hydration.test.ts` (wipe set), `guards/recordPetName.test.ts` (every visit surface names the *record's* pet via `resolveRecordPetName`), `guards/completionCard.test.ts` (the saved moment is a completion surface — name the pet, say what was written), `guards/haptics.test.ts` (a visit save is a soft moment, not a success chime over a refusal record), the accent-on-light and Geist guards.

---

## 6. Security, privacy & the recording contract

### 6.1 v1 (typed) — nothing new crosses a boundary
Per-pet RLS on the new table; no new bucket; no new secret; no model call. The only new disclosure is none — typed visit notes are the same class as event notes already covered by the privacy policy.

### 6.2 v1.x — the consent contract (binding when G5 opens it)
One all-party posture everywhere: the app collects no location, so it cannot know the state, and asking "which state is your vet in?" is a decision at the moment of use. One rule satisfies the strictest state and matches every consumer precedent (Medcorder, Pawtient, Apple).

- **A first-use sheet, once per account** (re-shown after twelve months or a policy change; full-screen, never modal-on-modal): what recording does, that it captures *everyone in the room*, that the audio stays on the phone and only the written transcript syncs, that some states require everyone's agreement and the owner is responsible for asking, with the ask-your-vet script in the app's register. **Copy constraints:** never state or imply that recording is legal for this owner; never "you don't need permission in your state"; never frame the vet's refusal as an obstacle; never promise the transcript is complete.
- **Every recording — the gate (mock C2)**: one un-pre-checked acknowledgment, the record control disabled until it is tapped — *"Everyone in the room knows I'm recording and is okay with it"* — stored as `consent_acknowledged_at` on the recording row. Not remembered, not skippable. Plus the location check, which is not a legal one: *start once the exam-room door is closed.* No auto-start, nothing from the widget (V2-1: the widget never writes).
- **At start — the audible announcement.** The phone speaks one short line from its speaker — *"Culprit is recording this visit"* — and the line is captured in the recording. It is the statutory form of consent in Washington (RCW 9.73.030(3): a recorded announcement at the start), Oregon's "specifically informed", the defeat of Massachusetts' secrecy element, Montana's warning, and Apple's own choice for call recording. **T&S default: on and not user-disableable in v1.x. Designer dissent recorded (§9, conflict 3). PM decision.**
- **While recording — visible state (mock C3)**: a persistent recording pill on every reachable screen with the elapsed time (the system's orange dot is present but is not the app's indication under 2.5.14); foreground only, screen kept awake; Pause and Stop one tap each; an auto-stop ceiling (60 min, warned at 55).
- **Stop → review → keep or discard.** The transcript is shown *before* anything leaves the device; the owner can delete lines (the vet's aside, a voice from the corridor) before saving. Discard deletes the audio and any partial transcript immediately and is available at every point, including after the transcript is shown — the "way back" half of the confirm-XOR-reversal rule.
- **On-device transcription only.** A server transcription vendor is a new processor, a new privacy-policy section and a new retention promise — not for the first release of the feature. (The Claude API takes no audio, so "send it to the model we already use" is not an option; evidence brief §3.) When neither on-device engine is available the app says so and offers typed notes; there is **no silent server fallback**.
- **Raw audio:** never uploaded; written to the app sandbox, excluded from iCloud backup; **deleted when the transcript is saved or discarded**, with a 24-hour ceiling for an unfinished session; registered in `wipeLocalSession`. Never in the sync queue, never in a bucket, never in the App Group. No audio bucket exists in v1.x.
- **The transcript** is a pet-scoped row (RLS default-deny, cascading from `pets`), owner-editable, synced like notes, included in export, purged with the account — and **hard-deleted on the owner's request**: an honest erasure story for other people's words beats the soft-delete convention that exists for *events*. Flagged for the Dir. of Engineering as a second documented exception to the soft-delete rule.
- **"Summarize this visit" is a separate, explicit action** (v2, after G6) with a first-use 5.1.2(i) disclosure: *the written transcript, never the audio, is sent to Anthropic to write the summary; it is not kept or trained on.* Never auto-summarise.
- **No diarization, no speaker labels, no voice enrolment** (BIPA / CUBI / RCW 19.375). If a future version wants "you asked / the vet said", it infers roles from content or lets the owner tag lines — text operations — under a separate T&S ruling.
- **Never built:** covert or screen-off mode; auto-start; background capture; a public share link for transcripts; any Culprit use of a transcript beyond the owner's record; any "it's legal here" copy.
- **Disclosures in the same PR:** the microphone purpose string via the audio plugin (no background audio mode), `docs/legal/privacy-policy.md` (§1 the microphone paragraph replacing "no microphone"; §3 the Anthropic transcript sentence; §6 retention; §7 deletion bullets; a new "Recording other people" section), `docs/app-privacy-answers.md` re-checked, and a Terms addition drafted by counsel (an owner covenant to comply with recording law; Culprit records nothing covertly; transcripts are automated and may contain errors). Verified on the built artifact (`Info.plist`, `PrivacyInfo.xcprivacy`) and by a packet capture showing audio never hits the network.
- `rls-privacy-reviewer` runs on VV-5 even though no server path changes — the attack surface is the device (a backgrounded recording, the file's location, the wipe on sign-out).

### 6.3 The state-law posture (the table is in the evidence brief §2.3)
The owner is the recorder. Eleven states require every participant's consent or knowledge for an in-person recording (CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA; Delaware treated the same); Nebraska and 38 others are one-party. The app's obligation is design, not enforcement: make consent the default path, never enable covert capture (no silent mode, no hidden indicator, no background capture), confine recording to the exam room (a waiting room is other people's conversations, and no state exempts a non-participant), and say plainly that the owner is responsible for asking. The clinic may decline; the sheet's "Not this time" is a first-class exit, and every scribe vendor's own guidance falls back to notes the same way.

### 6.4 Questions only counsel can answer (for the Nebraska attorney; Tier-2 addition to `docs/legal/attorney-brief.md`, §11 — the full ten are in the evidence brief §2.11)
1. Does an in-app acknowledgment plus an audible announcement captured in the recording satisfy Massachusetts ("secretly"), Oregon ("specifically informed"), Washington (§ 9.73.030(3)) and Illinois ("surreptitious") — and is a *spoken* announcement required, or does a visible device plus the ask suffice?
2. Should an LLC be formed before any microphone feature ships, given Apple 5.1.1(ix) and per-violation statutory-damages regimes (CIPA § 637.2, BIPA) that expose a solo individual to class-scale numbers?
3. Post-Otter "tool" status: what contractual and technical facts keep Culprit on the *Rogers / Graham* side of CIPA § 631, and is sending the *transcript* to Anthropic for a summary a third party "learning the contents" in any all-party state?
4. Does any speaker labelling, even content-based, invite a voiceprint claim; do Illinois users need a written release for anything in the feature?
5. The Terms addition: the value of an owner covenant for recording-law compliance, and whether the feature's release needs re-acceptance.

---

## 7. Acceptance criteria (v1 — draft; QA finalizes at build)

1. From the Pet tab an owner reaches Vet visits in ≤2 taps; from Home inside the window, "Get ready" in 1.
2. Booking an appointment takes ≤10 s with only a date required; clinic/vet prefill from the last visit when one exists.
3. The Home card renders only inside the window, above the Signal, never displacing a safety card out of the visible set, and disappears when the visit is logged or the appointment is cancelled.
4. "Get ready" renders the shipped rundown byte-identical to `/rundown` today, plus "Worth raising" rows each carrying a named source, plus the owner's questions; it works offline and capped (no model call — asserted, not assumed).
5. "Worth raising" yields **no row** for a quiet record (never "nothing to raise" phrased as wellness); a Signal safety finding always leads the list.
6. In-visit notes autosave: kill the app mid-sentence → relaunch → the draft is on the visit.
7. "How did it go?" saves with nothing typed; each plan row opens its real flow with `vet_visit_id` set; a running trial renders **Keep**, never a second trial; the next-visit row creates a `vet_appointments` row.
8. The saved moment names the pet and states that the report window and the Home tile moved; the offline line is present.
9. Logging a visit changes the next report's default window to start on that day (verified via the report screen's window line); deleting a visit reverses it and the delete confirm says so.
10. A visit row in History taps to the visit; visits never appear in any count, coverage line, Patterns panel or engine input (the same-population rule).
11. Multi-pet: every visit surface names the record's pet via `resolveRecordPetName`; the appointment card on Home shows the active pet's appointment only.
12. Cross-tenant probe on `vet_appointments` returns uniform not-found; `delete-account` leaves zero rows.
13. Theme tokens only; `ChipGroup` for the happened/booked choice; no `ActivityIndicator`; hit areas ≥44 pt; `ThemedText` throughout.

---

## 8. PR plan (proposed; gated on G1–G4, ordered by G7)

| PR | Scope | Depends on |
|---|---|---|
| **VV-0** | **Schema.** `vet_appointments` (+ RLS, same-pet trigger), `vet_visits.deleted_at`, `medications.vet_visit_id`, `diet_trials.vet_visit_id`. Local mirror, wipe set, push queue, hydration order. Readers gain `deleted_at IS NULL`. Migration Safety Pre-flight. `rls-privacy-reviewer`. | G3 |
| **VV-1** | **The home.** Pet-tab "Vet visits" card (A1), the list (E1) + empty state (E2), the visit detail (D3, read-only in this PR), booking an appointment, soft delete with the window-consequence confirm. `VetVisitsCard` beside `VetFilesCard`. | VV-0 |
| **VV-2** | **The after-visit capture.** Replaces `app/vet-visit.tsx` (D1 + D2): prefill from the appointment, the plan hand-off rows into medication setup / trial setup-or-Keep / next appointment / Vet Files, the saved moment. The in-visit notes screen (C1) with autosave and the question ticks. | VV-1 |
| **VV-3** | **The moment + Get ready.** Home appointment card inside the window (A2); `/rundown` promoted to "Get ready" (B1) with "Worth raising" (deterministic, sourced) and the owner's questions; Ask keeps its chips. | VV-1 (parallel-safe with VV-2 on disjoint files) |
| **VV-4** | **History row + finish pass.** The timeline row type, `nyx-voice` over every string, `pm-feature-review` (Jordan + Sam), the §7 AC walk, the on-device QA script. | VV-2, VV-3 |
| **VV-5** *(v1.x)* | **The recording.** Spike first (on-device STT in Expo managed, 30-minute background capture); then the consent contract §6.2, purpose strings, App Privacy + policy edits in the same PR. `rls-privacy-reviewer`. **After the App Store submission.** | G5; a shipped v1 |
| **v2** | The summary, phrased questions — own spec after the D2-class ruling. | G6 |

**Per-session kickoff prompts (when G1–G4 are ruled):**
- *VV-0:* "Build VV-0 from `docs/nyx-vet-visits-requirements.md` §5 — the `vet_appointments` migration + the three FK links + `vet_visits.deleted_at`, with the reader sweep. Schema-isolated; `rls-privacy-reviewer` mandatory; Migration Safety Pre-flight in the PR body."
- *VV-1 → VV-3:* "Build VV-{n} from `docs/nyx-vet-visits-requirements.md` §4.1/§8 against the ruled frames in `docs/culprit-vet-visits-mockups.html` (round 1 or later). Check §0 before deviating from any frame."
- *VV-4:* "Run VV-4 from §8 — the History row, the voice pass, `pm-feature-review`, §7 AC, the Manual QA script."

---

## 9. Persona positions & recorded conflicts

- **Designer:** the lifecycle shape; the Home card as a state card inside a window, never a standing entry; structured fields over rich text; the empty state as the primary screen. Signed off on §4.1 pending the mock reaction.
- **Dir. of Engineering:** separate `vet_appointments` (G3) — the reader set is the argument; no microphone in the submission binary; on-device STT first; Vet Files as the paperwork path (no new writes to `vet_visit_attachments`); the `deleted_at` reader sweep is the one place VV-0 can bite.
- **Data Scientist:** visits are provenance anchors, never counts; links carry no numbers; `questions` as JSON is acceptable until something counts them; the report cascade unchanged.
- **Dr. Chen:** wants the visit line on the report (v1.x, CUL-19); "Worth raising" must read as the record's questions, never the app's advice; the recheck date is the single most-forgotten instruction and the next-visit row is the right fix.
- **Jordan:** the parking-lot test for D1 (nothing required to save); the phone stays in the pocket during the exam — C1's autosave is what makes a two-line note possible at all.
- **Sam:** two carriers, two cats — the Home card and every visit name the pet; a multi-pet appointment ("both cats Tuesday") is two appointments, drawn later.
- **QA:** AC 4 (byte-identical rundown), AC 9 (the window moves and moves back) and AC 5 (no wellness phrasing from silence) are the three that get explicit verification steps.
- **Product Owner:** related issues linked on CUL-878; CUL-253, CUL-397, CUL-467 stay their own issues and are *unblocked*, not absorbed.
- **Trust & Safety:** §6 in full; the disclosures-in-the-same-PR rule; the per-recording consent that is never remembered; no diarization.

**Recorded conflict 1 — live suggestions in the room (PM prompt 7.2):**
> **Dr. Chen:** a client reading prompts off a phone mid-exam degrades the consult; the questions belong before the visit.
> **Jordan:** I'm holding the dog.
> **Designer:** a suggestion feed during the most stressful fifteen minutes is a firehose at the moment of event (Principle 1).
> **Engineer:** needs network in a basement exam room and a model call a minute.
> **Sr. PM (the prompt):** "suggest questions to ask in real time as the transcript is being entered" could be very interesting.
> **PM decision needed:** G6 — does live mode stay off the roadmap until real visits show the pre-visit list is insufficient, or is it a v2 experiment to design now?

**Recorded conflict 2 — recording in v1 (PM prompt 6.1):**
> **Sr. PM (the prompt):** an AI-first approach — auto-capture a transcript via the microphone — is what would make this feature interesting.
> **T&S + Engineer:** the microphone permission, the Audio Data label and the privacy-policy edit should not enter the App Store submission window; on-device STT needs a spike; the consent contract needs the legal lane.
> **PM decision needed:** G5 — v1.x after launch (recommended), or v1 at the cost of the submission timeline.

**Recorded conflict 3 — the audible announcement at the start of a recording (v1.x):**
> **Trust & Safety:** the acknowledgment tap is the owner's *claim*; the spoken line captured in the audio is the *record* that the other parties were informed — the only element that maps onto a statutory consent form (Washington), Oregon's "specifically informed", and Apple's own call-recording precedent. Default on, not user-disableable.
> **Designer:** a phone announcing itself in a small exam room is socially awkward and will make owners skip the feature; the tap already carries the consent, and the visible recording state is honest.
> **Dr. Chen:** the announcement is what makes the clinic staff comfortable; the vet-side scribes ask out loud too.
> **PM decision needed:** announcement default-on and locked (T&S), default-on with a settings opt-out (compromise), or tap-only (Designer). Rides G5; no v1 impact.

---

## 10. Parked (not dropped)

- **Live suggestions** (conflict 1) — a v2 experiment at earliest.
- **The report's "Visits" appendix line** — v1.x, rides CUL-19.
- **Appointment reminders** — CUL-253, unblocked by VV-0; stays under the notification foundation.
- **Calendar write** (add the appointment to the phone's calendar via EventKit) — a permission and a new capture class; own discovery.
- **Share-sheet import** (CUL-467's fix) — paperwork from the clinic's email straight into the visit; the clinic-scribe client summary is the first document class it should be designed around.
- **Offering the recording from the prep card in the waiting room** (v1.x) — the human-analogue lesson (SecondEars, Medcorder): the moment to offer is when the owner is already looking at "Get ready", not on arrival in the exam room. Rides VV-5's design, not v1.
- **"What we changed" hand-back to the clinic** — a vet-facing summary of the plan as recorded; composes with CUL-397 and the report's share.
- **Multi-pet appointments** ("both cats Tuesday") — two rows today; a linked pair later.
- **Household** — follows B-292.
- **A visit-linked backfill of legacy `vet_visit_attachments`** — Vet Files §11.

---

## 11. Follow-ups & flagged doc edits (Tier 2 — PM confirmation before writing)

- `docs/legal/attorney-brief.md`: add §6.4's questions (the full ten in the evidence brief §2.11) as a "recording feature" addendum, and note that the LLC formation already on the brief becomes a prerequisite of the microphone release (Apple 5.1.1(ix)) — **proposed, gated on G5.**
- `docs/legal/privacy-policy.md` (§1, §3, §6, §7 + a "Recording other people" section), `docs/legal/terms-of-service.md` (the owner covenant, counsel-drafted) + `docs/app-privacy-answers.md` (re-check; Audio Data stays *No* on-device) — **written in VV-5's PR, not before.**
- `docs/nyx-vet-report-requirements.md` §6: note that a soft-deleted visit is excluded from rung 1 — **proposed, lands with VV-0.**
- `docs/nyx-notifications-v2-requirements.md:108` and CUL-253: the "column vs tiny table" question is answered by G3 — **comment on CUL-253 at ruling.**
- `docs/nyx-ask-requirements.md` §3.3: the rundown gains a second door and a "Worth raising" block — **proposed, lands with VV-3.**
- CLAUDE.md Read-These table: a row for this spec (Tier 1, added inline this session, marked v0.1 discovery).
- `docs/research/README.md`: index row for the evidence brief (done with the brief).

---

## 12. Version history

| Version | Date | Summary |
|---|---|---|
| 0.1 | 2026-09-09 | Discovery draft from the PM brainstorm: the code audit, the lifecycle proposal, the G1–G7 briefs, the recording contract, mock round 1. Evidence lanes in the companion brief. |
