# Vet report: the flow after the button, and what to build around it

**Date:** 2026-10-30 · **Lenses:** Sr. Product Designer + Product Owner, with Dr. Chen, Data Scientist, Trust & Safety, Dir. of Engineering and QA consulted inline · **Mode:** DISCOVERY. No repo edits. Every code claim was read at the file:line given (repo at today's `main` checkout).
**Inputs:** `app/report.tsx` (all 723 lines), `lib/pdf.ts`, `lib/reportRange.ts`, `lib/reportRoute.ts`, the five entry points, `supabase/functions/generate-report/index.ts` + `report.ts` (scope resolver), migrations 001/026/029/044/066, `docs/nyx-vet-report-requirements.md` §6/§8/§9/§12, `docs/nyx-vet-visits-requirements.md`, `docs/nyx-vet-files-requirements.md` D7/D13/D14, `docs/nyx-beta-features-requirements.md`, `lib/betaFeatures.ts`, `docs/monetization-and-throttling-requirements.md` §3, `docs/nyx-filter-ux-requirements.md`, `docs/culprit-vet-report-v2-mockups.html` (round 2, B6 and O1), sessions `2026-09-16-r16-send-moment.md` and `2026-10-11-vet-report-v2-round-2-discovery.md`, and the two competitive briefs in the scratchpad.

---

## 0. The short version

- **Today the screen makes the report before it asks anything.** Opening it starts a build at once, with a window called "Default" that it only explains once the build is done. Everything after that is a fix-up: switch to "Custom…", wrestle two inline calendars, wait again, then send a PDF into a share sheet and lose it. Nothing is kept, so "what did I send Dr. Chen?" has no answer anywhere in the app. The `vet_reports` table built for this in migration 001 has never been written to.
- **Redesign:** ask first, then build. One composer where every window choice says why it exists and what it covers *before* anything is built. A preview with the send-moment lines kept. A send sheet with real targets (email the clinic, print, show on this phone, share, copy a summary). A saved, dated, unchangeable copy of every report sent, which can be linked to the visit it was for.
- **Recommended IA:** a Reports library (C) as the home, the composer (A) as the way in, and the visit (B) as the composer's best preset rather than a separate flow. Build it in phases: the composer first (client, plus one additive server change), then saving and visit linking (one schema PR), then the link much later.
- **v1/v2:** a server-checked allowlist flag plus the existing Beta features shelf, a `reportVersion` request field, and the version stamped on the response and on every saved copy. Flag off, the app stays exactly as it is today.

---

## 1. Today's flow, step by step

### 1.0 The doors: five labels, one destination, no intent

| Door | File:line | Label | What it sends |
|---|---|---|---|
| Pet tab card | `app/(tabs)/profile.tsx:1621–1633` | Card "Vet report", blurb *"A clinical summary of {pet}'s symptoms, diet, and trends — view it here, then send it to your vet as a PDF."*, button **Open vet report** | `/report`, no param, so the active pet |
| Get ready (appointment) | `app/rundown.tsx:416` (handler `:280–282`) | **Send the vet report** | `/report?pet=` only. The appointment id, its date and its questions are dropped |
| Plain rundown | `app/rundown.tsx:436` | **Share the full vet report** | `/report?pet=` or nothing |
| Trial screen / completed trial card | `components/trialScreen/TrialScreen.tsx:180`; `lib/dietTrialCard.ts:2978`; `lib/trialScreenModel.ts:60,374` | **Open vet report** / **Vet report** | `/report?pet=`. The trial is not passed, so if a visit happened after the trial started, rung 1 (since last visit) wins and the report the owner opened "for the trial" may not be scoped to the trial |
| Home Signal, quiet foot | `components/home/SignalZone.tsx:813`; `components/surfaces/signal/SignalZoneFoot.tsx:76–83` | **Vet report ›** | `/report?pet=` |

**Friction F1:** four verbs for one action (Open, Send, Share the full, plain noun). Every door gives up its context: the appointment, the trial, the reason the owner tapped. The screen cannot say "for Tuesday's visit" because no door tells it.

### 1.1 Arrival: the build starts before the owner chooses anything

- Header: **Vet report** (`report.tsx:308`), with no pet name in it. The pet's name appears only in the wait line.
- The range bar renders at once (`:310–436`): the label **Report range** (`:312`), chips **Default | Custom…** (`:81–84`, default `'default'` `:110`), then the notes row **Include your Noticed notes**, switched on by default (`:114`). Its hint reads *"What you wrote on your daily looks, printed in the report's Noticed appendix. Notes you add to a meal or a symptom are always included."* (`:420–423`).
- The body shows the report's own outline: *"Writing {pet}'s report…"* (`:539`; `components/surfaces/waits/ReportSilhouette.tsx:24`).
- Under the hood the build has already started (`:217–223`): a sync flush first (`flushBeforeReport`, `:194`), then `generate-report` with no dates and `includeNotes: true` (`:145–147`).

| The owner knows | The owner does not know |
|---|---|
| A report is being written for this pet | What "Default" means: since the last visit, the trial, or 90 days |
| That two controls exist | That the build has already started, so changing anything now restarts it |
| | How much of the record is logged in the window, or what the report will say |

**F2:** "Default" is a word with nothing behind it. The screen knows the cascade (since visit, then trial, then 90 days; `report.ts:1117–1129`) but says nothing until the build returns. **F3:** the notes switch sits under the "Report range" heading even though it controls content, not dates. **F4:** about a third of a 390pt screen goes to controls that most owners never touch, and that space stays taken through preview and send.

### 1.2 Ready: the window is named only now

- The window the server chose appears under the notes row, in tertiary ink: *"Since the last vet visit · Sep 16 – Oct 29"* (`:274–277`, `:434`; names from `lib/reportRange.ts` `SCOPE_BASIS_LABEL`). It shows only while status is `ready` (`:275`).
- The preview is a WebView of the server HTML (`:453–461`). The page sets `<meta name="viewport" content="width=794">` (`render.ts:10121`), so a Letter-width page is shrunk to phone width. Body text renders at about half size, and the owner pinches to read.
- The send bar (`:473–534`) can stack up to five lines over the button:
  1. a staleness line, when unsynced or quarantined rows remain (`:474–481`, copy in `lib/pdf.ts:142–157`);
  2. *"Includes N photos from logged incidents."* (`:482–489`);
  3. *"Your saved vet documents aren't part of this report. Share them one at a time from Vet Files."* (`:490–503`);
  4. the allowed-list gap: *"No allowed-food list is set for {pet}'s trial, so the report can't check feedings against it."*, with the button renamed **Send anyway** (`:504–521`);
  5. otherwise the button **Send to vet** (`:523–529`), with the hint *"Creates a PDF you can email, message, or AirDrop to your vet."* (`:531–533`).

**F5:** the window is a fact the owner needed *before* the build, and it arrives after, in the lowest-contrast text on the screen. **F6:** the owner learns what the report says by reading a shrunk page. There is no summary of what is in it: how many days were logged, what was counted, which sections are empty. **F7:** the R-16 session flagged that the bar with every line showing has never been seen on a device (`docs/sessions/2026-09-16-r16-send-moment.md`, Residuals).

### 1.3 Changing the window: the date pickers

- Tapping **Custom…** reveals From/To fields filled with the last 90 days (`:117–122`, `:324–358`). Each shows a long date and a teal **Change** (`:337–338`, `:353–354`).
- Tapping a field opens a full inline iOS calendar *inside the range bar* (`:383–411`), plus a **Done** toolbar above it (`:368–382`). The calendar pushes the report almost off a small screen.
- From cannot pass To (`maximumDate={customEnd}`, `:390`), and To cannot precede From or pass today (`:404–405`). To move a window *forward* past the current To, the owner must move To first and then From. No hint says so.
- The picker is hard-coded `themeVariant="light"` (`:388`, `:402`).
- Each edit rebuilds after a 600 ms settle (`lib/reportRange.ts:18–31`), under an **Updating…** pill (`:462–471`). The label becomes *"Custom range · …"*.
- **Any** explicit window is labelled "Custom range" and prints the cherry-pick disclosure. The header comment (`:58–65`) admits this is why there is no "Last 90 days" preset (B-236). The owner is never told that a chosen range makes the report count the symptoms left outside it. They find out only if they read that line in the preview.

**F8:** the PM is right that the date picker is badly designed. It is two separate one-date calendars for one range question, with no view of the record behind the dates (which days have entries, where the symptoms fall). The ordering rule traps the owner. It renders inline, so it takes over the screen. **F9:** the only way to get "this trial" or "last 30 days" when the cascade picks something else is Custom, which mislabels a principled window as a hand-picked crop. **F10:** the window choice and the notes switch each trigger a full multi-second server build and a sync flush (`:148` deps, `:194`). Exploring options is expensive, so owners don't.

### 1.4 Sending

- The button reads **Preparing PDF…** (`:517`, `:526`) while `expo-print` renders on the device (`lib/pdf.ts:202–205`; the print clip is [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864)). The file is copied to the transient directory as `{Pet}-vet-report-{start}-to-{end}.pdf` (`lib/pdf.ts:189–196`, `:221–228`).
- The share sheet opens titled **Send vet report** (`lib/pdf.ts:231–235`).
- Failure alerts: *"Sharing isn't available / This device can't open a share sheet."* (`:260`) and *"Couldn't create the PDF / Please try again."* (`:264`).

**F11:** the share sheet is the only target. Email lands in a blank compose window, and the owner types "see attached" ([CUL-397](https://linear.app/projectnyx/issue/CUL-397); v2 mock §04). Printing takes the share sheet, then Print, then the clip. "Show the vet in the room" means pinching the shrunk WebView. **F12:** the PDF does not carry the saved vet documents. The bar says so, and the fix is deferred (B-480).

### 1.5 After sending: nothing

- The sheet closes and the screen does not change. The temp PDF is deleted (`lib/pdf.ts:236–249`). There is no confirmation, no record, and no link to the appointment.
- `vet_reports` (migration 001:180–193, owner RLS :236–237) has **zero writers**: no code calls `from('vet_reports')` (2026-09 sessions confirm this). Spec §12 PR 5's planned "store snapshot" step was never built. `delete-account` already purges the table as forward-looking (`supabase/functions/delete-account/index.ts:234, 250–256`).

**F13:** "what did I send on Sep 14?" cannot be answered. Reopening the screen rebuilds against today's record. **F14:** a report sent from Get ready leaves no trace on the appointment or the visit, so the visit detail cannot say "you sent a report before this visit". **F15:** the questions typed into Get ready never reach the report, so the vet sees the record but not what the owner wanted to ask.

### 1.6 Error and edge states (verbatim)

- No pet: *"Add a pet before generating a report."* (`:179`)
- Build failed: **Couldn't prepare the report** / *"Something went wrong preparing the report. Try again in a moment."* / **Try again** (`:207`, `:442–448`)
- Pet not on the account: *"This pet isn't in your account any more."* (`lib/reportRoute.ts:22`; `:293–304`)
- Offline: the flush fails, and generation needs the server, so there is no report and the copy is the generic failure line. **F16:** at 2 a.m. in an ER car park with one bar of signal, nothing can be shown, because nothing was kept.

---

## 2. The jobs

| # | Job | Who / when | What decides success | Today |
|---|---|---|---|---|
| J1 | **Prep for a booked visit** | Jordan, in the 5 days before (the Home strip window) | The report covers what the vet hasn't seen, carries the owner's questions, and arrives before the visit | Window right by luck of the cascade; questions dropped; no trace |
| J2 | **Answer the vet's request** ("send me the last 2 weeks") | Any owner, after a call | The exact window the vet asked for, without it reading as a crop | Custom only, so it prints as hand-picked; two calendars |
| J3 | **Mid-trial update** ("day 28, how's it going") | Jordan, unprompted or asked | Scoped to *this trial*, adherence visible | "This trial" isn't offered when a visit exists after trial start |
| J4 | **Emergency at 2 a.m.** | Sam, ER vet, no history | Fast: suggested window, then send or show, two taps; works with poor signal | Builds first, then shows; offline is a dead end |
| J5 | **Hand a printout at the desk** | Owners without email habits | Prints cleanly, with a filing strip (v2) | Share sheet, then Print, then edges clip |
| J6 | **Keep a record of what was sent** | Everyone, later | "Sent Sep 14, covering Jul 2 – Sep 13, for the Sep 16 visit", reopenable unchanged | Not possible |
| J7 | **Show the vet on the phone in the room** | Owner at the exam table | Page 1 full-screen and legible, without fiddling; works offline | Pinch-zoom inside a half-height WebView |
| J8 | **Share with a second vet / specialist** | Referral, second opinion | A longer window ("everything"), the same frozen copy as the GP got, or a new one | Custom 90-day max feel; no "everything" option |
| J9 | **Share with a co-owner** | A household member taking the pet in | A readable copy without an account; ideally the plain-text rundown | Share sheet works; the rundown's *Copy as text* is the better fit (demoted under ⋯ in Get ready) |
| J10 | **Send an updated report** after more days logged | Before a recheck | "Same as last time, through today" | Start from scratch |
| J11 | **Tell the clinic it's urgent without an email sitting unread** | Sam, safety flag on page 1 | A "call the clinic" prompt (v2 B6) | Nothing |

J1, J3, J4 and J6 are the wedge. The diet-trial owner is the one who sends repeatedly, so the report history matters most to them.

---

## 3. Redesigned flow: three IAs

**The design rules all three share**
- **Ask, then build.** Nothing is rendered until the owner taps Preview. Before that, the screen shows what the report will cover, using counts the server computes with the same code that builds the report (one predicate, C-4).
- **Every window option names its reason and its dates.** "Default" goes away, and the cascade's pick is marked **Suggested** with a one-line reason.
- **The cherry-pick disclosure is kept and told to the owner up front** (Brief 3).
- **Clinical sections are counted, never toggled.** Only the owner's own content can be included or left out: notes, photos, questions, the owner's words (Brief 4).
- **The R-16 send-moment lines stay** at the moment of sending, deduplicated against what the composer has already said.
- **Never claim "Sent" when the app can't know.** `expo-mail-composer` reports `sent` on iOS; the share sheet and printing don't. Follow the `app/settings/feedback.tsx:38–42` rule.

### IA-A: one composer sheet (the "make a report" flow)

**A1 · Composer** (full-screen modal from any door; header **{Pet}'s vet report**)

```
WHAT IT COVERS
(•) Since the last vet visit                         Suggested
    Sep 16 – today · 44 days
    What Dr. Chen hasn't seen yet.
( ) This diet trial                                   day 46
    Sep 14 – today · 46 days
( ) Last 30 days                    Oct 1 – today
( ) Last 90 days                    Aug 1 – today
( ) Everything                      since May 4, the first entry
( ) Choose dates…

  ┌ Something logged on 39 of 44 days.
  │ Nothing logged Oct 3, Oct 12, Oct 20–22.
  └ (line absent when every day has an entry, C-3)

WHAT'S IN IT                          counted for this window
  Vomiting · 6 episodes, latest Oct 27
  Stool · 11 entries
  Meals · 128 · 4 off the trial list
  Medication · Cerenia, 16 doses given
  Weight · 2 weigh-ins
  Photos · 3 from logged incidents            Review ›
  Your Noticed notes · 5                       [on]
  Notes on meals and symptoms are always included.

FOR THE VET (optional)
  Anything to add?   [ He gets his Apoquel every evening;    ]
                     [ I didn't log the doses.               ]
  Printed as your words, not part of the record.

            [ Preview report ]
```

- **Order is a rule:** safety content leads. When the window holds a safety flag (blood, foreign material, an intake decline), the first row of *What's in it* is that flag in its report wording, and it can never be scrolled past or toggled off.
- **Rows that don't exist are left out** (no trial, so no trial row). A preset that would cover the same dates as the suggestion folds into it ("Since the last vet visit · also the whole trial").
- **Empty window state:** *"Nothing logged for Mochi between Oct 1 and today. The report will say so, and still list the diet and medication on file."* Preview stays available, because the spec's empty render is a designed state (§6).
- **Loading state:** the counts fill in under a quiet tick (the shared `Tick`), and the window rows are usable at once, because their dates come from local reads.
- **Offline state:** *"You're offline, so the counts can't be checked. The newest report you sent is below."* with a link to the saved copy (needs IA-C), and Preview disabled with the reason.

**A2 · Choose dates** (a sheet, replacing the two inline calendars)
- One month grid with a range selection: tap the start, tap the end, the band fills. Days with any entry carry a dot. Days with a symptom carry the symptom-category ink, so the owner sees what a range leaves out.
- Above the grid, quick anchors: **The last visit (Sep 16)**, **The trial start (Sep 14)**, **The first entry (May 4)**, **Today**.
- Top line: *"A range you choose is printed as chosen, and the report counts any symptoms that fall outside it."*
- The footer shows the live range and length (*"Sep 20 – Oct 29 · 40 days"*) and **Use these dates**.
- No ordering trap: tapping a day before the current start moves the start. The end is capped at today, and days before the first entry are dimmed with *"Nothing logged before May 4."*
- It honours dark mode (no hard-coded light theme) and offers a VoiceOver day-step that announces "has entries / vomiting logged".

**A3 · Preview** (full height)
- The server HTML with its own phone-readable stylesheet: page 1 sized to the phone width, not a 794px page shrunk to fit. The PDF keeps print CSS.
- A sticky top line names the scope: *"Since the last vet visit · Sep 16 – Oct 29 · 6 sheets"*.
- The bottom bar keeps R-16. The staleness line, the allowed-list gap (with **Send anyway**) and the documents line stay. The photo line moves up into the composer, since it is said there.
- Primary: **Send…**. Secondary: **Back to choices**.

**A4 · Send sheet** (bottom sheet)

```
Send Mochi's report
  ✉  Email the clinic                 pre-filled subject and note
  ⎙  Print
  ▢  Show it on this phone            full screen, page 1 first
  ⤴  AirDrop, Messages, Files…
  ⧉  Copy a summary                   for the clinic's notes

  Your ask (email only)
  [Review before our visit · Tue Nov 4] [Call me to book a visit] [For the file]
```

- **Email** (`expo-mail-composer`, B-288). The subject is a fixed template, never AI (v2 B6): *"Owner log: Mochi MARK, cat · flag: vomiting pattern · Sep 16 – Oct 29"*. The note is the v2 §04 template with the picked ask. The PDF is attached, and so are the saved vet documents when the owner ticks them (see §4, *Bundle*), which retires the R-16 documents line on this path. Recipient: the Mail app's own To field (no stored clinic email in v1).
- **Print** goes straight to `Print.printAsync` (AirPrint). It needs [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864) first.
- **Show it on this phone** gives a black-chrome full-screen viewer with page 1 first. The screen stays awake, landscape is allowed, and swipe moves between sheets.
- **Copy a summary** copies the page-1 facts as plain text with each scope inline (Clarity's *Copy as text*). The server writes the text from the same sentences as the report, never a client re-derivation.
- **Call prompt** (v2 B6/J11): when the window holds a safety flag, a line sits above the targets: *"Mochi's report has a flag worth a call: the Oct 27 vomit photo was read as possible foreign material. An email can sit unread. Call the clinic and ask how soon she should be seen."* plus **Call {clinic}** when a clinic phone is on file. It names the fact, never a verdict, and never says the pet is fine.

**A5 · After** (replaces the sheet)
- Email path with status `sent`: **Emailed** · *"Mochi's report, Sep 16 – Oct 29, went from your Mail app."*
- Share or print path: **Shared** · *"Mochi's report, Sep 16 – Oct 29, is ready wherever you sent it."* Never "sent", because the app can't see that.
- Without IA-C, A5 is a confirmation only, and the report is gone once the owner taps **Done**.

**IA-A covers** J2, J3, J4 (three taps: door, Preview, Send), J5, J7, J8, J11. **It fails** J6 and J10, and J1 only partly (no appointment context).

### IA-B: the report belongs to a visit ("Report for Tuesday's visit")

The appointment is the anchor. The door from Get ready, the Home strip and the visits list passes `?appointment=<id>`.

**B1 · Get ready gains a report row** (above the primary)
- Before sending: **Report for Tuesday's visit** · *"Not sent yet · would cover Sep 16 – today"* · primary **Make the report**.
- After sending: **Report sent Oct 30** · *"Sep 16 – Oct 29 · emailed"* · **Open** · **Send an updated one**.

**B2 · Composer, anchored**: the IA-A composer with three differences.
- A header line: **For Tuesday's visit** · *Riverside Veterinary · Dr. Chen* · **Change** (to "No visit, just sending").
- The suggested window is *Since the last vet visit*, with the reason *"Everything since Sep 16, through the day you send it."* The visit itself runs strictly before today (spec AC 9), so the copy never says "through the visit".
- **Your questions (3), printed on the report**: the appointment's `questions` with a tick per question (all ticked by default), labelled *"Printed as your questions, after the record."* An unticked question stays on the appointment and isn't printed.

**B3 · After**: *"Saved to Tuesday's visit."* The appointment row in Get ready flips to *Sent*. When the visit is logged ("How did it go?"), the report link moves with `visit_id`, the same way `questions` and `notes_draft` already do.

**B4 · The visit detail** (`components/vetvisits/VisitDetailBody.tsx`) gains a row **Report shared before this visit** · *"Oct 30 · Sep 16 – Oct 29"*, which opens the saved copy, beside *Paperwork · in Vet Files* (`:90`).

**Invariant (D7's sibling):** a report never creates, dates or re-dates a visit or an appointment. It only links to one that exists.

**IA-B covers** J1 fully, J6 and J10 for visits, and J11. **It fails** everything with no appointment (J2, J3, J4, J8), so it needs IA-A for those. On its own it is a feature, not the IA.

### IA-C: a Reports library (saved, dated, unchangeable)

**C1 · Pet tab card** (replaces the current one at `profile.tsx:1621–1633`)
- Title **Vet reports**.
- Latest row: **Oct 30 · for Tuesday's visit** · *"Sep 16 – Oct 29 · emailed"*.
- Primary **New report**, link **All reports ›**.
- Zero state: *"No reports yet. When you send one, a copy stays here, so you can always see exactly what your vet has."* + **Make Mochi's first report**.

**C2 · Reports list** (`/reports?pet=`)
- Grouped by year, newest first. Each row: the date made (bold), the window, where it went (*Emailed* / *Shared* / *Printed* / *Shown*), the linked visit as a tag, and a small *New layout* tag on a v2 report.
- When the record has changed since the newest report: *"14 days logged since your last report."* + **Make an updated one**. This is a fact line, not a nudge, and it appears only inside the list.

**C3 · Saved report detail**
- The stored HTML, unchanged, in the A3 viewer. A header strip reads: *"The report as you sent it on Oct 30. Anything logged or changed since isn't in it."*
- Actions: **Send again** (the same copy, re-printed from the stored HTML), **Print**, **Show it on this phone**, **Make an updated report** (opens the composer with the same window type, ending today), and under ⋯ **Delete this copy**.
- The delete confirm: *"Delete this copy? The report you already sent to your vet isn't affected, and nothing in Mochi's record changes."* This is a confirm, not an undo: one safety net (C-21).

**C4 · Offline:** the newest saved report is cached locally (in the wipe set), so *Show it on this phone* works with no signal (J4, J7).

**IA-C covers** J6, J10 and J8 (send the same frozen copy to the specialist), and makes J4/J7 work offline. **It fails** nothing, but on its own it is a list with no good way in. It needs IA-A as its composer.

### Recommendation: C as the home, A as the way in, B as the best preset

- Every door opens the composer (A1), with **intent passed** (`?for=appointment:<id>`, `?for=trial:<id>`, `?for=signal`), so the suggested window and its reason fit the door the owner came through. This fixes F1 and F9.
- When an appointment is in context, the composer is IA-B's anchored version (B2). Otherwise it is plain A1.
- Every send is saved to the library (C), linked to the appointment or visit when there is one.
- **Phase 1:** A1–A5 behind the beta (no saving). **Phase 2:** C + B (schema). **Phase 3:** the link.

Two things deliberately left out:
- **Visit purpose as a question** ("What's this visit for?", Guava). The door and the anchor already carry it, so asking would be a new decision.
- **Section drag-to-reorder** (Pawsitive). The report's page order is a clinical contract (spec §3), not the owner's to change.

---

## 4. Supporting features catalogue

Cost: S ≤ 1 PR, M 2–3, L 4+. "Schema" means a migration (its own PR, with the Migration Safety Pre-flight). Everything here passes Pets > $: the monetization doc's §3 row 48 says *"Vet report (full, complete, shareable) — Free forever … Never tier-dependent in content"*, and row 49 covers all history. **None of these is a Premium candidate.** The market paywalls exactly these features: WagWatch's links and windows over 60 days, Tend & Mend's 14 days, Amaeru's pass. Free is Culprit's advantage.

| Feature | Value | Cost · schema | Privacy / RLS risk | Rec |
|---|---|---|---|---|
| **Composer with suggested window + reasons + counts before building** (A1) | Fixes F2–F10. The single biggest owner-facing win. PawSolids' live counts plus our cascade, which no rival has | M · **no schema**. Server: additive `scope` field (`since_visit` / `trial` / `last:30` / `last:90` / `all` / `custom`) and an `outline` mode that returns per-preset counts without rendering or embedding photos, in one pull of the widest window | Low. Same authenticated, owner-verified function, no new egress. Counts must come from the assembler (C-3, C-4) | **Now** (Phase 1) |
| **Range calendar** (A2) | The PM's date-picker complaint. Shows the data behind a range | M · no schema. A new kit component; reuse History's window vocabulary (`lib/historyWindows.ts` `ANCHORED_WINDOW_NAMES`, CUL-1126: one name per window) | None | **Now** |
| **Send sheet**: email template + picked ask + print + show + copy summary (A4) | J5, J7, J11; promotes [CUL-397](https://linear.app/projectnyx/issue/CUL-397) / v2 B6. Ends the blank "see attached" email | M · no schema. **New native module** (`expo-mail-composer`, B-288), which means a new dev client and TestFlight cut. Print needs [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864) | Low. The subject names a flag, and email subjects are seen by clinic staff, which is the point. Template only, never AI (B6) | **Now** (after CUL-1864) |
| **Saved reports**: every sent report is an unchangeable server copy, with a history list and "what I sent on Sep 14" (C) | J6, J10, offline J4/J7, and the base for links and visit linking. The audit trail a careful owner wants | L · **schema y**. `vet_reports` exists (001:180–193) but needs: `share_token` **made nullable with no default** (today every row would carry a live-looking token, 001:187–188), plus `scope_basis`, `params jsonb` (preset, includeNotes, excluded photos, questions included), `report_version`, `engine_flags`, `photo_count`, `status draft/kept`, `shared_via`, `shared_at`. A private `nyx-vet-reports` bucket (dashboard-created, B-124). The server persists at preview as a **draft** with a 24 h reaper in the same PR (B-255's reaper is still open). Send flips it to *kept* | **Medium.** It puts health data at rest, including the EXIF-stripped photos embedded in the HTML. A copy outlives a later delete of the source entry or photo, so C3's header must say so, and the delete-entry confirm should not promise the report changes. Owner RLS exists (`generated_by = auth.uid()`). Account deletion already purges rows and objects (`delete-account/index.ts:234,250`) and must become a hard failure, not the "forward-looking, tolerated" degrade, once rows exist. Pet cascade: `ON DELETE CASCADE` on rows, objects need purge. `rls-privacy-reviewer` mandatory | **v2** (Phase 2, the core of it) |
| **Attach a report to a vet visit** (B) | J1/J6. Closes the loop: the visit shows what the vet was sent. The vet-visits spec already lists "What we changed hand-back" and CUL-397 as composing here (§10) | M · **schema y** (in the saved-reports migration): `vet_appointment_id`, `vet_visit_id` with same-pet triggers (the 045 bare-FK class); move the link at attendance alongside `notes_draft` | Low beyond saved reports. Links are provenance, not truth (vet visits §5.1): a link never moves a date or a window | **v2**, with saved reports |
| **Owner's questions printed on the report** (B2) | The questions typed in Get ready reach the vet (F15) | S–M · no schema (read from `vet_appointments.questions`). A render change, so **v2 document only** | Owner free text in a clinical document is a prompt-injection surface for clinic summarizers (the machine-readers brief §5). Print it in one labelled block, *Questions from the owner*, after the record, never interleaved | **v2** |
| **Owner's words at send** ("Anything to add?") | v2 mock O1 ("He gets his Apoquel every evening; I didn't log the doses."). Fills gaps the record can't | S · no schema (stored in `params`). **v2 document only** | Same injection containment: one labelled block, quoted, *not verified*, 300 characters | **v2** |
| **Auto-suggest a report before an appointment** | J1 | S · no schema. **Not a new push.** The Home appointment strip (5 days before, vet visits §4.1) already opens Get ready, so the right fix is B1's *Not sent yet* row there. Optionally, the appointment reminder (CUL-253) can name the report | None | **v2** (with B). **No** auto-generation and **no** separate notification: Principle 4 allows one nudge a day, and the strip already is it |
| **Photo review / exclude** (B-243) | Owners can drop an accidentally sensitive frame (a child's face, a home interior). Spec §8 calls it the deferred fast-follow | M · no schema (`excludePhotoIds` request param; stored in `params` once saving exists) | **Persona conflict, Brief 4.** T&S wants exclusion; Dr. Chen doesn't want a safety photo silently gone. The report must print *"1 photo left out by the owner"*, and a safety flag's text stays even when its photo is excluded | **v2** |
| **Bundle saved vet documents** (B-480, the paperclip) | Retires the R-16 documents line. KOTrol ships a "report with documents" bundle | **S** on the email path: `expo-mail-composer` takes several attachments, so ticked Vet Files are attached as separate files, with no PDF merge (B-144 stays parked). **L** for a merged PDF | Low. These are the owner's own files, and each is already shareable one at a time (D14(a): not D8-gated, scope ruling only) | **v2** (email path only); merged PDF **later** |
| **Revocable vet link** (spec PR 6) | The vet opens it without an attachment. A receipt ("opened by the clinic Oct 31") answers "did they see it?" WagWatch is the only pet app with a link lifecycle | **L** · **schema y** (tokens minted only on demand; an access log table). A service-role `view-report`. **Hosting:** Supabase serves HTML as text/plain (B-253), so the page lives on getculprit.app (`culprit-web`) and fetches the stored snapshot. QR carries a non-secret URL. Photos streamed through the token route (§8) | **High.** It is the app's first unauthenticated path to health data. B-218's lesson is already applied (026). **Revocation was declined by the PM on 2026-07-05 (B-143, recorded at 026:37–40)**: a link shipping without revocation leaves a mis-shared link live for 30 days, and the market (WagWatch) and the KTC norm both revoke. A link brief must re-rule B-143. `rls-privacy-reviewer` mandatory. Print is unrevocable | **Later** (Phase 3, after saved reports; needs the B-143 re-ruling) |
| **Report compare** (before the trial vs during) | Answers the wedge vet's exact question ("is it different since the switch?"). Clarity's Compare | M–L · no schema. Clinical logic: matched windows, coverage per column, "no longer seen" only above a floor, never on n=1 absence. Adversarial pass (at most two) | Low privacy. **High clinical risk**: the 2026-10-11 adversarial passes broke three before/after sentences | **Later**, as a *section* of the v2 document (round 1 D7, "split at the intervention"), not a separate report type |
| **Front desk email body** | J5/J11; v2 B6 | Included in the send sheet row above | — | **Now** (with the send sheet) |
| **Copy a summary as text** | Clinic PIMS paste; the clinic-AI-first reader | S · no schema. The server returns `summary_text` with the HTML | The text leaves the PDF's scope clauses behind unless every line carries its scope (round-trip rule) | **Now** (with the send sheet) |
| **Show it on this phone** | J7 | S · no schema; `expo-keep-awake` | None | **Now** |
| **Multi-pet** (two pets, one appointment) | The vet-visits "Also for {pet}" booking already makes two appointment rows | S–M once the send sheet exists: *"Also send Nyx's report"* builds a second report and attaches **two PDFs** to one email. Never a combined document (spec §9 cuts the comparative report) | Each report is generated through its own pet's ownership check | **v2** |
| **Co-owner share** | J9 | **L** (a household / shared-care model doesn't exist; `_shared/engineFlags.ts` notes "shared care may one day…") | High: a second account reading a pet's record is a new RLS model. Until then, the owner can send any report to anyone, and the rundown's *Copy as text* serves the household | **Later / no** as its own feature |
| **Vet reply capture** | Close the loop on what the vet said back | S, and largely exists: *How did it go?* captures the plan, and Vet Files takes a screenshot of the reply linked to the visit (D7). Add a door, not a feature: on a saved report linked to a visit, **Save the vet's reply** opens Vet Files' add with the visit linked | Low (the existing Vet Files path) | **v2**, as a door only. **No** inbox or email integration |
| **Edit window, then freeze** (Clue 24 h) | Fix an obvious mistake after sending | Not needed: the preview is the edit step, and a correction is a new report | — | **No** |
| **Scheduled auto-reports** | — | — | Sends health data on a timer without a consent moment (§8 "explicit owner action mints") | **No** |

---

## 5. Running v1 and v2 side by side

"v2" means two things that ship at different times: the **flow** (this doc; client-side) and the **document** (CUL-1859's record strip; server render). They should be separately switchable, because the composer is useful with today's document long before the v2 render is ready.

### Options

| | Per-account beta (allowlist flag + Beta features shelf) | `app_config` flag only | Request param to `generate-report` only |
|---|---|---|---|
| Who sees v2 | Allowlisted accounts that opt in on Settings → Beta features | Whoever the PM allowlists, with no owner choice | Anyone whose client asks |
| Server-checked | Yes, by D6/§4.2's standing rule: generate-report resolves the flag for the **record's owner** through `_shared/flags.ts`, as `engineFlags` already does | Yes | **No.** A modified client could send an unfinished clinical document to a real vet |
| Owner can compare | Yes (preview switch, below) | No | Yes, but ungated |
| Infrastructure | Exists: `BETA_REGISTRY` (`lib/betaFeatures.ts:58`, empty since the widget went GA, so the Settings row renders for no one), `useAllowlistFlag` + `useBetaOptIn`, the vet-visits G0 precedent (flag off, byte-identical) | Exists | Trivial |

### Recommended: the beta shelf + a server-checked param + a version stamp

1. **Two allowlist keys** in `app_config` (seeded dark, `{"enabled": false, "allowlist": []}`):
   - `report_composer_v2`: client-only, so `serverCost: false`. Its server half (`scope` and `outline` mode) is additive and harmless to v1 clients.
   - `report_document_v2`: server-checked, so `serverCost: true` in the D6 sense (it gates a server behaviour, not credits).
2. **Two shelf cards**, *"New report screen"* and *"New report layout"*, each opted in separately (Gate 2, local, default off, wiped in `wipeLocalSession`). The new layout is reachable only from the new screen, so the old screen never meets the v2 document.
3. **`app/report.tsx` branches at the top.** Flag off, today's screen is byte-identical (AC-0, the vet-visits G0 shape). Flag on, the composer renders. Doors don't change (`reportHref`). They gain the optional `for=` param, which the old screen ignores.
4. **Request:** `reportVersion: 'v1' | 'v2'`. The server renders v2 only when `report_document_v2` resolves on for the pet's owner, and otherwise renders v1. It never errors and never claims a version it didn't render.
5. **Response and snapshot carry the truth:** `report_version` plus the deploy fingerprint and `engine_flags`, the stamp the engine rows already use. The client labels from the response, never from its request (C-13: what was asked is an intent, not a fact). A saved copy stores the same three fields, and the C2 list tags a v2 copy *New layout*.
6. **On the page:** v2's filing strip already reserves a report id (*"report 7Q4K"* in mock round 2). Print the saved report's short id and version there, so a vet's feedback ("the one from Oct 30 was confusing") traces to the exact renderer.
7. **Comparing:**
   - **Owner (beta cohort):** the A3 preview carries a two-segment control, **Current | New layout (beta)**. Both render from identical params, and whichever is on screen is what Send sends. The R-16 lines come from that version's response.
   - **PM / team:** the existing render scripts over the Deno fixtures (Cooper, Nyx) emit v1 and v2 side by side from one fixture. One real-vet send of each, with the version printed, closes the loop.
8. **Graduation (D7):** each key gets an `owner` and a `reviewBy`. GA is the usual explicit call, then a removal PR. v1's document is **frozen except for honesty fixes**: new document content (questions, owner's words, the excluded-photo line) lands in v2. The one exception: the preset disclosure rule (Brief 3) must land in whichever renderer the composer can reach, because it is a clinical-trust rule, not a feature.

**Why not one key:** the composer ships months before the v2 render is ready, and putting them behind one card would force the cohort to take an unfinished document to get a better screen.

---

## 6. Decision briefs

**Brief 1 · The IA**
- **Deciding:** what the owner lands on after any vet report door, and the order we build in.
- **Options:**
  - A: a composer only.
  - B: tie reports to visits only.
  - C: a library only.
  - **★ Recommended: C as the home, A as the way in, B as the composer's anchored preset, built A, then C+B, then the link.** Why: A alone loses J6 and J10, B alone abandons every job with no appointment, and C alone has no good way in. Phasing A first ships the fix to every complaint the PM raised with no schema change.
- **Consequence:** the Pet tab card becomes *Vet reports*. Doors gain `for=`. Spec §6 "owner override at generation time" stands. The vet report spec gains a §6 "composer" subsection (a Tier-2 edit, PM to confirm).
- **Forecast:**
  - Phase 1: 4 PRs (server `scope` + `outline`; composer + preview; range calendar; send sheet).
  - Phase 2: 4 PRs (migration; persist + reaper; library + detail + offline cache; visit linking + Get ready row).

**Brief 2 · Saving reports**
- **Deciding:** whether every sent report is kept, and where.
- **Options:**
  - **★ Recommended: (a) an unchangeable server copy of every sent report, kept automatically (drafts reaped at 24 h), with *Delete this copy*.** Why: "what did I send?" only works if saving is automatic, and the table, owner RLS and deletion purge already exist.
  - (b) A metadata-only log ("Sent Oct 30, Sep 16 – Oct 29"), with no artifact.
  - (c) A device-local PDF archive, lost at sign-out and reinstall.
  - (d) No saving.
- **Consequence:**
  - Unblocks visit linking, offline *Show it*, *Send again*, and the future link.
  - Requires the `share_token` nullability change, a private bucket, the reaper (B-255's class) in the same PR, and turning `delete-account`'s `vet_reports` read into a hard failure.
  - Puts copies of health data at rest that outlive edits to the record, which the copy must say.
- **Forecast:** 3 PRs (migration; persist + reaper; library UI), plus 1 for visit linking.

**Brief 3 · Which windows print the cherry-pick disclosure** (a clinical rule; adversarial pass required)
- **Deciding:** spec §6 has two classes (the principled cascade, with no disclosure; custom, with disclosure). Named presets are a new third class.
- **Options:**
  - (a) Only *Choose dates* discloses; presets are labelled honestly and don't (the B-236 plan).
  - **★ Recommended: (b) any window other than the suggested one discloses, when symptom events fall outside it.** The label names the preset ("Last 30 days, chosen by the owner"), and with zero events outside there is no line. Why: "Last 30 days" can drop an episode on day 35 as well as any hand-picked range can, and the line costs nothing when nothing was dropped, so it errs loud.
  - (c) Disclosure on every report.
- **Consequence:** a §6 amendment (Tier-2 edit). The composer's top line tells the owner before they choose. Lands in v1's renderer too (§5.8). Dr. Chen + Data Scientist adversarial pass on the "chosen by the owner" wording.
- **Forecast:** 1 PR (inside Phase 1's server PR).

**Brief 4 · What the owner may leave out** (persona conflict on photos)
- **Deciding:** whether the composer has section toggles (PawSolids) or only counts.
- **Options:**
  - **★ Recommended for sections: counts only. Clinical sections are never toggled.** Why: dropping a section is a crop by content, and §6 exists to stop crops. Only the owner's own content (Noticed notes, questions, owner's words) toggles.
  - **On photos, no recommendation, because the personas disagree:**
    - **Trust & Safety:** owners must be able to exclude any photo before it leaves the phone (an accidental frame is a privacy harm the PDF can't recall).
    - **Dr. Chen:** a safety-flagged photo excluded is a clinical loss. If it can be excluded, the report must print *"1 photo left out by the owner (Oct 27, flagged)"*, and the flag text must stay.
    - **PM decision needed:** may a safety-flagged photo be excluded (with the disclosure), or only everyday ones?
- **Consequence:** settles B-243's shape and the `excludePhotoIds` contract. CUL-848 (event notes joining the toggle) stays its own open ruling.
- **Forecast:** 2 PRs (server param + disclosure line; the review sheet).

**Brief 5 · v1/v2 side by side**
- **Deciding:** how the new screen and the new document reach the beta cohort without reaching anyone else.
- **Options:**
  - **★ Recommended: two allowlist keys on the Beta features shelf, server-checked `reportVersion`, the version stamped on the response, the page and the saved copy (§5).** Why: it reuses the shipped two-gate system, satisfies D6's server-gate rule for a server behaviour, and lets the cohort compare in the preview.
  - One key for both (simpler, but it ties a ready screen to an unfinished document).
  - An `app_config` flag with no opt-in (no owner compare).
  - The param alone (ungated clinical content).
- **Consequence:**
  - It re-opens the Settings → Beta features row for allowlisted accounts only.
  - v1's document freezes except for honesty fixes.
  - Graduation follows D7 (owner + `reviewBy`).
- **Forecast:** 1 PR for the flags + shelf + branch (rides Phase 1's first client PR); the server check rides the v2 render's first PR.

---

*Not briefed, recorded:* the revocable link needs its own brief when Phase 3 opens, and that brief must re-rule **B-143** (revocation declined 2026-07-05), because shipping a link without revocation is the anti-pattern the market and the KTC norm both avoid. Spec §8 already names `rls-privacy-reviewer` as the link's mandatory gate.
