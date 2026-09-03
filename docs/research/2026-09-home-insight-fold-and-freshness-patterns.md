# Home-insight fold & freshness patterns — how daily-open apps tame a standing insight

**Date:** 2026-09-03 | **Status:** 🧊 Frozen point-in-time research artifact — do not version-bump; correct additively (§V at the foot) per the CUL-671 rule.
**Commissioned by:** the 2026-09-03 Signal-fold session — feeds **CUL-695 v1** (the minimize/expand fold on Signal cards; rulings D1–D5 still open) and the **Home Redesign spike** (CUL-775 → CUL-776 mock round 1).
**Method:** isolated research subagent, no build-conversation anchoring; 74 web calls (31 searches, 43 fetches) on 2026-09-03, primary sources preferred (vendor help centres, changelogs, standards text, App Store records via the iTunes Search API); cross-read against the three prior briefs so this one carries **deltas and a taxonomy**, not a re-tell of the time-grain / daily-brief findings already in `2026-08-home-freshness-inspiration.md`.
**Evidence convention:** every claim carries its source and access date (all 2026-09-03 unless stated). `[fetched]` = the cited page was retrieved and the quote is from its body; `[search-snippet]` = the claim rests on a search-result excerpt because the page could not be fetched (403 / JS-rendered / 404) — treat as one notch weaker; `[prior brief]` = carried from a 2026-08 brief, not re-verified. **No universal negatives:** every absence is phrased as "not found in the N sources checked" with the method stated. Vendor claims are vendor claims.
**Informs:** CUL-695 D1 (may a safety card fold?), D2 (what builds first), the fold's persistence and re-open contract; CUL-776/777 (what keeps a slow-truth Home fresh). Evidence only — no product decisions live here (research-folder contract).

---

## 1. Method, and the honest failures

**What was done.** (A) For each of 16 named surfaces — Apple Health, Google Discover, Gmail, iOS notifications / Siri Suggestions, Garmin Connect, Fitbit, Oura, Whoop, Strava, Spotify, Duolingo, Gentler Streak, Bearable, Linear (Pulse + Inbox), Slack, Todoist — the vendor's own help or engineering page was read for five things: *what the user can do*, *whether and where state persists*, *what brings a hidden item back*, *how the compressed state is labelled*, *whether any safety item is exempt*. (B) Design guidance: Apple HIG, Material, NN/g. (C) Habituation: NN/g eyetracking (2007, 2018), the BYU/Vance fMRI programme (2015–2018), Joint Commission SEA 50, and documented product decisions citing habituation. (D) Safety-critical: IEC 60601-1-8 alarm-state vocabulary, Dexcom G7, the OBD malfunction-indicator lamp, Apple Watch heart notifications, Oura Symptom Radar / Rest Mode, Whoop Health Monitor. (E) Pet category: five of the 22 teardown apps re-checked at use (CompanAIn, Petfetti, DogLog via the iTunes Search API; Tractive and Fi via help centres; PETKIT via search).

**What could not be reached — and what was substituted:**
- **Apple HIG "Disclosure controls"** and **Material 3 "Cards"** are JS-rendered; two fetches each returned only the title. Cited at `[search-snippet]` grade; verbatim guidance is research debt (§8).
- **Garmin support FAQ** → 404. Substituted DC Rainmaker's 2024-01-11 walkthrough `[fetched]`; the panel cap disagrees between sources (five in Jan 2024 vs six in a 2026 snippet) — recorded, not reconciled.
- **WHOOP support** → 403 / "CSS Error" shell; **whoop.com/thelocker** → 403. The5krunner's 2025-10-15 piece `[fetched]` has no customization or alert detail. Whoop claims are `[search-snippet]`, the same limit the 2026-08-31 teardown hit.
- **Tractive help centre** → 403 ×2; **Fi help centre** → 403. Both `[search-snippet]`.
- **Apple iPhone User Guide** pages returned a table of contents only (twice). Substituted `support.apple.com/en-us/104997` (Health, 2026-03-10) and `/108781` (notifications, 2026-04-06) `[fetched]`; Scheduled Summary / Time Sensitive detail is `[search-snippet]`.
- **Linear Pulse read/seen state:** not documented in `linear.app/docs/pulse` or the 2025-04-16 changelog `[fetched]`. The prior brief's "the system remembers what you have and haven't seen" is therefore *inferred from the product*, not documented.
- **Vance, Jenkins & Anderson 2018 (MISQ)** — abstract elided in the Semantic Scholar record; title/venue only.
- **Not checked this pass:** iOS Tips, Notion inbox, Things, Google Now (retired; its successor Discover was checked), the Apple Watch high/low-HR history view.

---

## 2. The pattern taxonomy

The commission asked for collapse vs dismiss vs snooze vs pin vs reorder. The sweep found those five plus four the prior briefs do not name — *feedback-dismiss*, *mode switch*, *latching acknowledge*, and *system rotation* — and the safety-fit column is where the evidence actually separates them.

| # | Pattern | What state persists | What brings it back | Where the compressed state lives | Examples (grade) | Fit for a safety card? |
|---|---|---|---|---|---|---|
| 1 | **Collapse / minimize** (disclosure) | Per-item open/closed; account- or device-scoped where documented (Bearable's Edit hide/unhide persists; HIG/NN/g are silent on persistence) | The user's own tap; nothing else | *In place* — a header or one-line summary that stays in the flow | HIG disclosure controls `[snippet]`; Nielsen 2006 progressive disclosure `[fetched]`; Bearable home "Edit → hide, unhide and reorder" `[fetched]` | **Yes, with a label test** — the compressed line must carry "strong information scent" (Nielsen) and stay in place; nothing in the sources lets a collapsed item leave the surface |
| 2 | **Dismiss** (one-shot, item-level) | The item is gone; state is the *absence* (a cleared notification, a swiped card) | Nothing (iOS clear); a new occurrence of the same event class | Nowhere on the surface; sometimes a history list (Notification Center history) | iOS "swipe left… or clear the notification" `[fetched]`; M1 "Cards can be dismissible" `[snippet]` | **No** — NN/g's action-required class "require[s] an action to be dismissed" `[fetched]`; no health surface checked lets a warning vanish without a trace |
| 3 | **Feedback-dismiss** ("not interested") | An account-level preference list that also *trains* the feed | The user un-checks it in a settings list | A named, reversible list: Discover "Manage your interests → Not interested → uncheck any topics you want to bring back" `[fetched]`; Spotify "Exclude from your taste profile" `[snippet]` | Google Discover `[fetched]`; Spotify Home "Not interested" `[snippet]`; Strava mute athlete/activity `[snippet]` | **No** — it is a taste signal; the closest health analog (Gmail nudges) is a category toggle, not per-item |
| 4 | **Snooze** (time-boxed hide with a guaranteed return) | Server-side, with the return time; the item is listed somewhere while hidden | The clock; **none of the four snooze docs fetched says a data change returns it early** | A named holding list: Gmail "Snoozed" / `in:snoozed` `[fetched]`; Linear Inbox (reappears "when that time arrives") `[fetched]`; Slack reminders (complete / delete / snooze again) `[snippet]` | Gmail, Linear, Slack, Todoist; **Dexcom G7 lets you snooze but the Urgent Low repeats at 30 min while still low** `[snippet]` | **Partial** — acceptable only if the condition, not just the clock, can re-fire it (the Dexcom shape) |
| 5 | **Pin / favourite** (promote) | Account/device-scoped ordered list with a cap or floor | n/a — the inverse of a fold | A named register: Apple Health "Pinned" (that-day metrics) beside "Highlights" (system-chosen, over time) `[fetched]`; Garmin "In Focus" (≤5 or ≤6) `[fetched]/[snippet]`; Oura Shortcuts (min 3) `[fetched]` | Apple Health, Garmin, Fitbit "Edit → replace a metric" `[fetched]`, Oura, Whoop `[snippet]` | **n/a** — no source lets the user pin a *warning*; pins are for standing metrics, and Apple keeps user-pinned and system-chosen in two labelled sections |
| 6 | **Reorder** | Account/device order | n/a | The same register as 5 | Garmin, Fitbit, Whoop `[snippet]`, Petfetti "rearrange cards for each one" `[fetched]`, Bearable `[fetched]` | **No** — nothing checked lets a safety element be ordered below the fold; safety items in the health apps are system-placed (Oura "spotlighted… the following morning") |
| 7 | **Mute / category off** | An account-level toggle for a *class* | The user flips the toggle back | Settings | Gmail nudges ("turn these nudges on or off in Settings") `[fetched]`; Siri Suggestions (four global toggles) `[snippet]`; Apple Health Highlights — **cannot be turned off** (2019 thread) `[fetched]` | **No** for the class; but note the Dexcom precedent: Urgent Low "cannot be turned off," only downgraded to vibrate `[fetched]` |
| 8 | **Mode switch** (a stated owner state changes the surface) | An explicit, reversible state the user declared; with an easing tail on exit | The user turns it off; the surface "gradually return[s] to normal… maximum of seven days" | A persistent banner "at the bottom of the Today tab" while the mode is on `[fetched]` | Oura Rest Mode (offered by a card only when temperature is elevated; user must tap to enter) `[fetched]` | **Yes** — this is the "dismiss only via a stated action" shape: the warning is answered by a declared state, and the declared state stays visible |
| 9 | **Latching acknowledge** | The condition, recorded; acknowledgment silences *audio*, never the *record* | The condition itself (non-latching clears when it ends; latching needs an explicit reset even after it ends) | A visible indicator that outlives the sound: MIL stays lit until three clean drive cycles `[snippet]`; Apple Watch AFib History in Health `[fetched]`; Whoop Health Monitor colour until back in range `[snippet]` | IEC 60601-1-8 `[fetched]`; Dexcom "acknowledge… by tapping OK" then repeat `[fetched]/[snippet]`; OBD MIL; Apple Watch | **Yes — the reference shape** |
| 10 | **System rotation / auto-expire** | None user-visible; the system decides daily | The system, on data or time-of-day | The surface itself, re-composed | Oura Today "Each day will look different" `[fetched]`; Apple Health Highlights (system-chosen, "Show All Highlights") `[fetched]`; Duolingo widget mood by time of day `[fetched]`; Symptom Radar "spotlighted… the following morning" `[fetched]` | **Yes for benign; no for safety** — Oura's safety card is *placed* by the system, not rotated out |
| 11 | **Deferred delivery / summary** | A schedule; the item is delivered later in a batch | The schedule (up to 12 daily summaries) `[snippet]` | A summary card | iOS Scheduled Summary; Linear Pulse daily/weekly at ~6:00 local `[fetched]` | **Only with a bypass class** — iOS Time Sensitive "breaks through summaries, Focus modes" `[snippet]` |

**Three observations the table forces.** (a) *Every reversible hide in the set has a named home while hidden* — Snoozed, Not interested, Manage interests, the Rest Mode banner, the lit MIL. A hide with no listed home is a delete. (b) *The clock returns snoozed items; the condition returns latched ones; nothing checked returns a hidden item on a **change** in the underlying data* — the "material-change fingerprint" the discovery's F3 proposes has no documented consumer precedent in these 16 products, only the safety-device analog (MIL/latching). (c) *User control and system control are kept in separately labelled registers* wherever both exist (Pinned vs Highlights; In Focus vs the rest; Shortcuts vs "Important updates and insights").

---

## 3. Per-app findings (short, sourced)

**Apple Health (Summary tab).** Two registers, two owners: "Your Pinned list shows how you're doing in each health category that day" — user-edited (Edit → tap to add/remove; drag to reorder) — versus "Highlights show your Health over time, so you can see how you're doing overall," system-chosen, overflow via "Show All Highlights" `[fetched, 104997, 2026-03-10]`. Highlights cannot be disabled — Apple Community Specialist, 2019: "There is no option to disable this" `[fetched]`; no later toggle found in 2 support pages + 1 thread. **How Highlights are chosen is not documented** — the rotation is observable, not explained.

**Google Discover.** Per-card "More → Not interested in [Topic] or Don't show stories from [Source]"; reversal is a settings list: "Manage your interests → Not interested → Uncheck any topics you want to bring back" `[fetched]`. The dismissed thing is *listed*, and the dismissal is a preference, not a deletion.

**Gmail.** Nudges are a *class* toggle, not per-item: "At the top of your inbox, you may see suggestions (or 'nudges') for emails you should reply to or follow up on… turn these nudges on or off in Settings" `[fetched]`. Snooze: "removed from your inbox temporarily… comes back to the top of your inbox when you want it to," listed under "Snoozed" / `in:snoozed` `[fetched]`; the page does not say a reply un-snoozes early.

**iOS notifications.** Per-item: "swipe left over a notification to manage alerts for that app, or clear the notification" `[fetched, 108781, 2026-04-06]`. Batch: Scheduled Summary, up to 12 per day `[snippet]`; **Time Sensitive is the bypass class** — "breaks through summaries, Focus modes" `[snippet]`. Siri Suggestions: only four global on/off toggles documented `[snippet]`; per-suggestion dismissal not found in the 10 support pages listed.

**Garmin Connect.** "In Focus" = user-selected large panels ("up to five customizable panels," DC Rainmaker 2024-01-11 `[fetched]`; "up to 6" + "See All" per a 2026 snippet); sections show/hide and reorder `[snippet]`. Nothing found on Garmin auto-changing In Focus. The 2024 forum thread "How do I go back to the original… home screen" is the muscle-memory cost of moving a customized home `[snippet]`.

**Fitbit / Google Health app.** "On the Today tab, tap Edit. Select one of the displayed metrics you want to replace… Tap Save" `[fetched]` — replace-in-slot, a bounded pin. Premium "Messages from your coach… throughout the day" are the insight-shaped element and are **not documented as dismissible** `[fetched]`.

**Oura.** Documented behaviour is *system rotation with time-of-day awareness*: "The Today tab surfaces the most important information about your health and will update throughout that day. Each day will look different and contain a different set of features depending on what is most timely and relevant to you" `[fetched]`. User control is confined to Shortcuts ("select and reorder… minimum of three"); **no dismiss/hide/collapse of Today cards is documented** (sections: "Important updates and insights," "Action items," "Recent events," "What's new") `[fetched]`. Safety handling is §5.

**Whoop.** "Completely customizable dashboard… reorder and prioritize" `[snippet, whoop.com]`; the Oct-2025 home moved "from a layout that used multiple tabs… to a more dense, scrollable home page" `[fetched, the5krunner]`. Health Monitor metrics are "color-coded to alert you of any potential abnormalities… Clicking on the metrics provides more details" `[snippet]`. No dismiss doc reachable.

**Strava.** Mute is *source-side*: "Muted activities will still be visible on your profile… and count towards progress charts, goals, and competitions" — hidden from the feed, never from the record; plus mute-an-athlete and a global Feed Ordering setting `[snippet, support.strava.com]`.

**Spotify.** "Not interested" on the Home feed; "Exclude from your taste profile" (2023-02-08), a per-playlist reversible exclusion that "reduces the impact they have on your recommendations" `[snippet, newsroom.spotify.com]`.

**Duolingo (widget).** A dated design decision: illustrations "show Duo's mood at different parts of the day, depending on whether or not you'd done your lesson… he gets more and more desperate as it nears midnight" — chosen against notification-likeness: "If the widget felt like just an extra layer of notifications, why would learners have any reason to keep it installed?" `[fetched, 2023-08-29]`. Freshness comes from *state × time of day*, not new content.

**Gentler Streak.** Only Home-Screen *widgets* are documented (Activity Status, Go Gentler, Vitals, Single Vital, Period) `[snippet, docs.gentler.app]`; no in-app card hide/collapse found in 8 results.

**Bearable.** "Use the 'Edit' button at the bottom of your homepage to hide, unhide and reorder the different tracking options" `[fetched]` — customization of *capture sections*; the Insights section is not documented as customizable or dismissable in the two pages read.

**Linear.** Inbox: "Snoozing hides a notification from your Inbox until the selected time. When that time arrives, the notification reappears in Inbox"; `H` snooze, `U` read/unread, `Backspace` delete, "We don't support archiving" `[fetched]`. Pulse: For me / Popular / Recent; digests "arrive in your Inbox around 6:00 AM in your local time," cadence "Weekly on Mondays, every weekday, or never" `[fetched]`; **no read/seen-state mechanics documented**.

**Slack / Todoist.** Slack "Remind me about this": 20 min / 1 h / 3 h / Tomorrow / custom; a fired reminder can be completed, deleted or snoozed again `[snippet]`. Todoist: "When snoozed…" interval `[snippet]`. Both clock-returned, listed while hidden.

**Design guidance.** HIG: "Disclosure controls reveal and hide information and functionality related to specific controls or views" `[snippet]`. Material: "Cards can be dismissible and rearranged" (M1); "a card should only have one swipe action assigned to it" (M2) `[snippet]`. NN/g progressive disclosure (Nielsen 2006): "disclose everything that users frequently need up front"; "Label the button or link in a way that sets clear expectations for what users will find" `[fetched]`. NN/g message types (Flaherty 2024-01-17): passive notifications are "a badge icon or a small nonmodal popover" and may auto-dismiss; action-required ones "should be intrusive" and "require an action to be dismissed" `[fetched]`.

---

## 4. Habituation evidence

**NN/g eyetracking.** 2007 (Nielsen): "Users almost never look at anything that looks like an advertisement, whether or not it's actually an ad" — and the avoidance generalises to "design elements that resemble ads, even if they aren't ads" `[fetched]`. 2018 (Pernice): "Ignoring ads is a learned behavior"; three triggers (position in a traditional ad zone, animation-like treatment, proximity to real promotions); the **hot-potato effect** — "users gaze at an item in which they are not interested, then look away and avoid fixating on that area on that page, and sometimes on other pages… and even on completely different websites"; one measured case: a right rail holding 25% of the content area drew 0.8% of fixations `[fetched]`. Read for a Home surface: a *position* that repeatedly holds unchanged content can be trained-out as a position, and the training transfers.

**The BYU/Vance fMRI programme.** CHI 2015 (Anderson, Kirwan, Jenkins, Eargle, Howard, Vance): "a dramatic drop in the visual processing centers of the brain after only the second exposure to a warning, with further decreases with subsequent exposures"; a *polymorphic* warning that "repeatedly changes its appearance" was "substantially more resistant to habituation" `[fetched, BYU ScholarsArchive]`. JMIS 33(3) 2016: fMRI n=25, cursor-tracking n=80 confirming the polymorphic effect `[fetched]`. MISQ 2018 ("Tuning Out Security Warnings: A Longitudinal Examination…"): title/venue only — abstract not retrievable this pass. Strength: peer-reviewed, security-warning domain; the transfer to health-insight cards is an inference, not a finding.

**Clinical alarm fatigue.** Joint Commission Sentinel Event Alert 50 (May 2013): "between 85% and 99% of alarm signals do not require clinical intervention"; first recommended action, "an inventory of all alarms (and eliminating those not necessary)" `[fetched, patientsafetysolutions.com summary]`; alarm management became a National Patient Safety Goal in 2014 `[snippet]`. The documented remedy is *fewer, individualized* alarms — not louder ones.

**Documented product decisions citing habituation.** Found one explicit: Duolingo's widget team designing *against* notification-likeness (§3) `[fetched]`. Oura documents the *behaviour* ("each day will look different") but not its rationale `[fetched]`. **Apple gives no rationale for how Highlights are chosen or rotate** in the two support pages checked; the 2019 thread shows users experiencing them as unremovable `[fetched]`. So: the "why Apple rotates highlights / why Duolingo rotates tiles" question the commission posed is answered for Duolingo only (and for the widget, not the home tiles); for Apple it is not found in 3 sources.

---

## 5. Safety-exception patterns — compressing an unresolved warning without hiding it

**The standard's vocabulary (IEC 60601-1-8).** "A NON-LATCHING ALARM SIGNAL shall automatically cease being generated when its triggering event no longer exists"; "A LATCHING ALARM SIGNAL shall continue to be generated after its triggering event no longer exists"; operators may enter "AUDIO PAUSED, AUDIO OFF, ALARM PAUSED or ALARM OFF" or "ALARM RESET"; and — the governance line — "The selection between LATCHING and NON-LATCHING ALARM SIGNALS shall be restricted to the RESPONSIBLE ORGANIZATION… Means shall be provided to prevent the OPERATORS from selecting" `[fetched, standards mirror]`. Inactivation is "indefinite (alarm off, audio off) or indeterminate (acknowledged) or timed (alarm paused, audio paused)" `[snippet, standards.iteh.ai]`. Translation: the *sound* is what the user silences; whether the *state* clears on condition or on acknowledgment is a policy the user cannot set.

**Dexcom G7 (the consumer medical-device case).** "Urgent Low and technical alerts (like Sensor Fail)" cannot be turned off; they "can be set to vibrate using Quiet Modes" `[fetched]`. Protocol: "When you get an alert, your first priority is to resolve it by making a treatment decision or fixing a system issue. Afterwards, acknowledge the alert on your display device by tapping OK" `[fetched]`; after acknowledgment the Urgent Low "repeats if your sensor reading stays urgently low for 30 minutes" `[snippet]`; users who want fewer repeats are told to *turn off Snooze*, not the alert `[fetched]`. The shape: acknowledge ≠ resolve; the condition re-fires; the escalation floor is downgradable in *modality* (vibrate) but not in *existence*.

**The car dashboard (OBD MIL).** The lamp "must only be switched on when the fault is detected in two sequential drive cycles and can only be extinguished when the fault no longer occurs in three successive drive cycles" `[snippet, klavkarr / aa1car]`. No driver-side dismiss; a debounced *on* and a stricter *off*, both data-driven. The most compact "unresolved warning" in the set is one lit glyph.

**Apple Watch heart notifications.** After an irregular rhythm notification: "If you have not been diagnosed with AFib by a physician, you should talk to your doctor" `[fetched, 120276, 2025-09-15]`. The notification is dismissable like any other, but the *record* persists: "To show your AFib history, go to the Health app… tap Heart, then tap AFib History," and a weekly Monday estimate arrives "if you've worn your watch for at least 5 of 7 days" `[fetched, watchOS guide]`. Compression = the transient notification goes, the standing record stays in a named place with a cadence.

**Oura Symptom Radar + Rest Mode.** "If there is a clear sign of strain, it will be spotlighted on the Today screen the following morning," three levels (No / Minor / Major signs) `[fetched]`; no user dismissal documented; the offered *action* is Rest Mode, whose card "will only appear if your average body temperature is elevated to the extent that your body temperature contributor suggests you pay attention" `[fetched]`. Rest Mode disables activity scoring, shows a persistent banner "at the bottom of the Today tab" for turning it off, and on exit "any insights will gradually return to normal… This easing period lasts as long as Rest Mode was on, or a maximum of seven days" `[fetched]`; Symptom Radar "will continue to monitor your metrics even with Rest Mode activated" `[snippet, same page]`. The only consumer-health instance found where the answer to a warning is a *declared state* that is visible while active, reversible, has an easing tail, and does not stop the monitor.

**Whoop Health Monitor.** Colour-coded out-of-range metrics with tap-through detail `[snippet]`; no dismissal documented; the colour is the compressed state and clears when the metric returns.

**The platform bypass.** iOS Time Sensitive exists so a batching system has a class that "breaks through" `[snippet]`; NN/g's action-required class "require[s] an action to be dismissed" `[fetched]`.

**What was not found (method: 12 safety-adjacent sources above):** any product in which a health/safety warning can be removed from view with no acknowledgment, no listed home, and no condition-driven return. Every one checked keeps at least one of the three.

---

## 6. Pet-category re-check at use (5 of the 22; listing/help-doc grade, no installs)

Method limit, stated up front: these are App Store records (iTunes Search API, 2026-09-03) and public help-centre text; an in-app collapse/dismiss affordance absent from listing or help copy would not be caught.

- **Tractive.** Help centre 403'd twice. Snippets: the Health tab shows "status cards for each health feature… tap any card to see detailed data and seven-day charts"; Health Alerts are *notifications* triggered only by Activity and Sleep Monitoring "when your pet's activity or sleep have shown unusual changes over a longer period"; a redesign article exists ("a simplified, seamless experience") `[snippet ×3, help.tractive.com]`. **No collapse / dismiss / customize behaviour for Health cards found** in the 9 help-centre results returned.
- **Fi.** Help centre 403'd. A "Managing Collar Alerts in the Fi App" article governs *notification* preferences `[snippet]`; no home-card customization found in the 10 results returned.
- **PETKIT.** No help-centre page on home customization found; a snippet describes a "homepage visual experience upgrade" with new positions for "healthy feeding, reminder, walk a pet and weight" `[snippet, support.petkit.com]`. Device-manager home; nothing on hiding or collapsing device cards found in 10 results.
- **CompanAIn** `[fetched, iTunes]`: v1.0.6, 2026-08-12, 20 ratings — unchanged vitals since the 2026-08-31 teardown. **Discrepancy to record:** the `releaseNotes` field returned today is a brand paragraph ("Your pet's health isn't a snapshot. It's a story…"), not the "New home screen: pet photo menu… and a profile-setup banner" text the teardown quoted verbatim for the same version. Either the listing text was edited in place at the same version number or one extraction misread the field; **re-verify before citing either** (§8). No dismiss/customize language in the description.
- **Petfetti** `[fetched, iTunes]`: v5.1.1, 2026-04-06, 27 ratings; release notes verbatim: "You can now reorder your pets and rearrange cards for each one, so everything is exactly where you want it"; description: "Home dashboard with widgets and a daily task overview." **The one pet app with documented reorder** — customization, not curation; no collapse/dismiss language.
- **DogLog** `[fetched, iTunes]`: v3.36, 2026-06-02, 1,339 ratings; release notes are the iOS 26 glass note; no home customization, hide, dismiss or insight-card language in the description.

**Net:** of five checked, one documents *reorder* (Petfetti), none documents collapse, dismiss, snooze, or acknowledge-and-persist on an insight or alert card, and the two collar apps route alerts to *notifications* with preference toggles (pattern 7), not to a persistent card state. Consistent with the teardown's §5.1 (no curated insight home in the category) — the category still has no fold problem because it has no standing-insight surface to fold.

---

## 7. Implications — evidence-backed observations, not decisions

### (i) For a v1 fold on Signal cards

1. **What the strip retains.** A compressed item that survives keeps a *label with information scent* (Nielsen 2006), a *state colour or glyph* (Whoop, MIL), and a *named home* (Snoozed, Manage interests, the Rest Mode banner). F3's count-anchored one-line strip sits inside all three; no source shows a compressed safety item reduced to a bare icon except the MIL, whose whole meaning is "go look."
2. **What re-opens it.** Documented triggers are the user's tap (pattern 1), the clock (4), and the condition (9). **A re-open on a change in the underlying data has no consumer precedent in these 16 products**; its nearest analogs are device-side and condition-driven (Dexcom's 30-minute repeat while still low; the MIL's three-cycle clear). A material-change fingerprint would be a new consumer pattern borrowing a device pattern, and a spec should say so. Snooze docs (Gmail, Linear, Slack) do not promise early return on change.
3. **Persistence.** Where documented, hide state is account- or device-scoped and *listed* (Discover, Gmail, Linear); nothing found keeps a fold for one session only. Every reversible hide in the set has a place to see what is hidden — a fold register with no "what's folded" view would be unlike anything checked.
4. **Safety cards.** (a) No health product checked lets a warning be removed with no trace; (b) the two consumer-health answers to "I've seen this" are *a declared state that stays visible* (Oura Rest Mode) and *a persistent record with a cadence* (Apple Watch AFib History + Monday estimate); (c) the device answer is *acknowledge silences the modality, the condition governs the state* (Dexcom; IEC latching); (d) IEC puts the latching policy out of the operator's hands. Against CUL-695 D1 this is evidence for the *(b) stated-owner-action* and *(c) sticky-strip* shapes; against *(a) never* only in that every product checked lets the *loud* form quiet while the *state* stays — the Designer's habituation point and Dr. Chen's never-quietly-shrink point coexist in the standard as *audio paused* versus *alarm off*.
5. **Habituation is measured, fast, and positional.** Second-exposure attenuation (CHI 2015) and the hot-potato transfer of avoidance from a position to other pages (NN/g 2018) bear directly on a hero slot that has held the same card since July; the documented counter-measures are *polymorphism* (change the form) and *alarm inventory* (fewer, individualized) — never a louder card.

### (ii) For a v2 Home — what keeps a slow-truth surface fresh

6. **Two registers, two owners.** Every mature health home checked pairs *user-pinned standing metrics* with *system-chosen highlights* (Apple), *user Shortcuts* with a *system-composed Today* (Oura), *In Focus* with the rest (Garmin). The prior brief's standing-vs-movement split is implemented in these products as *who controls the slot*, not only *what grain it shows*.
7. **Four documented freshness engines, only one of them "new content":** system re-composition by relevance and time of day (Oura; Apple Highlights); *state × time-of-day rendering of the same fact* (Duolingo's widget — a documented decision with retention data); *condition-driven clearing* (MIL; Whoop colour; Symptom Radar "the following morning"); *cadenced summaries* (Pulse ~6:00 local; Apple's Monday AFib estimate; iOS Scheduled Summary). No health app checked rotates benign insights for novelty — consistent with S10 and the discovery's dropped benign-card rotation.
8. **Customization is the pet category's answer; curation is the health-app answer.** Petfetti and Garmin let the user arrange; Oura, Apple Highlights and Fitbit's coach messages do not let the user remove the system's picks (Apple explicitly, since 2019). A Home that keeps Principle 3 has company at the design bar, not in the category.
9. **The bypass class is universal.** Every batching or quieting system checked keeps one class that cannot be batched, quieted or removed — Time Sensitive, Urgent Low, the latched alarm. Any v2 digest, summary or fold needs its equivalent named up front, or it is discovered at the first safety finding.

---

## 8. Research debt

1. **Hands-on installs** for the fold question: Oura (does a Today card have any long-press/hide?), Whoop (dashboard edit mode; Health Monitor dismiss), Fitbit coach messages, Tractive Health cards — every claim here is help-doc grade.
2. **Verbatim HIG "Disclosure controls" and Material 3 "Cards" guidance** — both JS-rendered; needs a browser or the Apple/Google PDF exports.
3. **Vance, Jenkins & Anderson 2018 (MISQ)** — the longitudinal habituation *and recovery* numbers (how much attention returns after time away) are exactly the fold-cadence evidence; abstract not retrievable via Semantic Scholar this pass.
4. **Apple Health Highlights selection logic** — undocumented in 3 sources; would need Apple's WWDC session notes or a developer-doc search.
5. **Linear Pulse read/seen mechanics** — not documented; the prior brief's "delta memory" characterization should be re-labelled as observed-in-product until a doc is found.
6. **CompanAIn release-notes discrepancy** between the 2026-08-31 and 2026-09-03 iTunes reads at the same version — re-fetch raw JSON and diff before either text is cited again.
7. **Oura Symptom Radar card lifetime** — how many mornings it persists and whether it can be acted on other than by Rest Mode; the support page is silent.
8. **Not checked:** iOS Tips, Notion inbox, Things, Apple Watch high/low HR history, Garmin's current panel cap (5 vs 6).

---

## 9. Source table

All accessed 2026-09-03. Flag: **F** = fetched and read; **S** = search-snippet only (page unreachable or JS-rendered); **P** = prior brief, not re-verified.

| # | Source | URL | Flag |
|---|---|---|---|
| 1 | Apple Support — Use the Health app on your iPhone or iPad (updated 2026-03-10) | https://support.apple.com/en-us/104997 | F |
| 2 | Apple Community — "how do i switch off apple health app highlights" (Sep–Oct 2019) | https://discussions.apple.com/thread/250678522 | F |
| 3 | Apple Support — iPhone User Guide, View your health data (returned TOC only) | https://support.apple.com/guide/iphone/view-your-health-data-iphe3d379c32/ios | S |
| 4 | Google Search Help — Customize what you find in Discover (iOS) | https://support.google.com/websearch/answer/2819496?hl=en&co=GENIE.Platform%3DiOS | F |
| 5 | Gmail Help — Reply to messages in Gmail (nudges section) | https://support.google.com/mail/answer/6585?hl=en&co=GENIE.Platform%3DDesktop | F |
| 6 | Gmail Help — Snooze emails | https://support.google.com/mail/answer/7622010 | F |
| 7 | Apple Support — Use notifications on your iPhone or iPad (updated 2026-04-06) | https://support.apple.com/en-us/108781 | F |
| 8 | Apple Support — Change notification settings on iPhone (returned TOC only) | https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios | S |
| 9 | Apple Support — Turn Siri Suggestions on or off on iPhone | https://support.apple.com/guide/iphone/turn-siri-suggestions-on-or-off-iph6f94af287/ios | S |
| 10 | Garmin Support — Editing the Home View in the Garmin Connect App (HTTP 404) | https://support.garmin.com/en-US/?faq=d7p0eCpRPJ4Q6bntYkdIb6 | S |
| 11 | DC Rainmaker — Garmin Connect App Revamp: Complete Walk-Through (2024-01-11) | https://www.dcrainmaker.com/2024/01/garmin-connect-through.html | F |
| 12 | Garmin Forums — "How do I go back to the original Garmin Connect home screen" | https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/marq-gen-2/369887/ | S |
| 13 | Google Health Help — Explore the redesigned Fitbit app | https://support.google.com/fitbit/answer/16959617 | F |
| 14 | Fitbit Community — rearrange tiles on the dashboard | https://community.fitbit.com/t5/iOS-App/How-do-I-rearrange-tiles-on-my-Fitbit-app-dashboard/td-p/2871775 | S |
| 15 | Oura Member Care — How to Use the Oura App | https://support.ouraring.com/hc/en-us/articles/360058599753-How-to-Use-the-Oura-App | F |
| 16 | Oura Member Care — Rest Mode | https://support.ouraring.com/hc/en-us/articles/360057065433-Rest-Mode | F |
| 17 | Oura Member Care — Symptom Radar | https://support.ouraring.com/hc/en-us/articles/35593651188115-Symptom-Radar | F |
| 18 | WHOOP — The Health Monitor: Breakdown of Key Metrics (HTTP 403) | https://www.whoop.com/us/en/thelocker/health-monitor-feature/ | S |
| 19 | WHOOP Support — Health Monitor & Report (CSS error shell) | https://support.whoop.com/s/article/WHOOP-Health-Monitor-Report | S |
| 20 | WHOOP — The All-New WHOOP Home Screen (locker; customizable dashboard claim) | https://www.whoop.com/us/en/thelocker/the-all-new-whoop-home-screen/ | S |
| 21 | the5krunner — Whoop Homescreen Gets a Revamp (2025-10-15) | https://the5krunner.com/2025/10/15/whoop-homescreen-gets-a-revamp/ | F |
| 22 | Strava Help — Mute Activity | https://support.strava.com/hc/en-us/articles/4415798243597-Mute-Activity | S |
| 23 | Strava Help — Feed Ordering | https://support.strava.com/en-us/articles/15402105-feed-ordering | S |
| 24 | Spotify Newsroom — Exclude From Your Taste Profile (2023-02-08) | https://newsroom.spotify.com/2023-02-08/exclude-from-your-taste-profile-will-make-your-personalized-recommendations-even-better/ | S |
| 25 | Spotify Engineering — Exclude from Your Taste Profile (2023-10) | https://engineering.atspotify.com/2023/10/exclude-from-your-taste-profile | S |
| 26 | Duolingo Blog — the widget feature (Mansur & Shuttleworth, 2023-08-29) | https://blog.duolingo.com/widget-feature | F |
| 27 | Gentler Streak docs — Overview of available widgets | https://docs.gentler.app/using-gentler-streak-widgets/overview-of-available-gentler-streak-widgets | S |
| 28 | Bearable — Getting started: personalising Bearable | https://bearable.app/support/tips/get-started-a-few-tips-to-personalise-bearable/ | F |
| 29 | Linear Docs — Inbox (snooze, read, delete) | https://linear.app/docs/inbox | F |
| 30 | Linear Docs — Pulse | https://linear.app/docs/pulse | F |
| 31 | Linear Changelog — Pulse (2025-04-16) | https://linear.app/changelog/2025-04-16-pulse | F |
| 32 | Slack Help — Set a reminder | https://slack.com/help/articles/208423427-Set-a-reminder | S |
| 33 | Todoist Help — Introduction to reminders | https://www.todoist.com/help/articles/introduction-to-reminders-9PezfU | S |
| 34 | Apple HIG — Disclosure controls (JS-rendered; title only) | https://developer.apple.com/design/human-interface-guidelines/disclosure-controls | S |
| 35 | Material Design 3 — Cards guidelines (JS-rendered; title only) | https://m3.material.io/components/cards/guidelines | S |
| 36 | Material Design 1 — Cards ("dismissible and rearranged") | https://m1.material.io/components/cards.html | S |
| 37 | Material Design 2 — Cards (one swipe action per card) | https://m2.material.io/develop/web/components/cards | S |
| 38 | NN/g — Progressive Disclosure (Nielsen, 2006-12-03) | https://www.nngroup.com/articles/progressive-disclosure/ | F |
| 39 | NN/g — Indicators, Validations, and Notifications (Flaherty, 2024-01-17) | https://www.nngroup.com/articles/indicators-validations-notifications/ | F |
| 40 | NN/g — Banner Blindness: Original Eyetracking Research (Nielsen, 2007-08-19) | https://www.nngroup.com/articles/banner-blindness-original-eyetracking/ | F |
| 41 | NN/g — Banner Blindness Revisited: Users Dodge Ads on Mobile and Desktop (Pernice, 2018-04-22) | https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/ | F |
| 42 | Anderson et al. — How Polymorphic Warnings Reduce Habituation in the Brain (CHI 2015; BYU ScholarsArchive) | https://scholarsarchive.byu.edu/facpub/9306/ | F |
| 43 | Anderson, Vance, Kirwan, Jenkins & Eargle — Why the Brain Habituates to Security Warnings (JMIS 33:3, 2016) | https://www.jmis-web.org/articles/1304 | F |
| 44 | Vance, Jenkins & Anderson — Tuning Out Security Warnings (MISQ 2018; abstract elided) | https://api.semanticscholar.org/graph/v1/paper/79e2e5bd1d1c64f73ca36c2c81d38bb88cf17fac | F (metadata only) |
| 45 | Patient Safety Solutions — summary of Joint Commission Sentinel Event Alert 50 (May 2013) | https://www.patientsafetysolutions.com/docs/May_2013_Joint_Commission_Sentinel_Event_Alert_Alarm_Safety.htm | F |
| 46 | IEC 60601-1-8 §6.10 Latching / non-latching (standards mirror) | https://standards.har-el.com/Projects/181701/60601-1-8/html/6-10-Latching.htm | F |
| 47 | IEC 60601-1-8 Ed. 2.0 Amd 1 sample (inactivation states) | https://cdn.standards.iteh.ai/samples/59935/58e3f4a16b774421af85d948685a6ae9/IEC-60601-1-8-2006-Amd-1-2012.pdf | S |
| 48 | Dexcom — How do I turn off G7 CGM alerts that I don't need? | https://www.dexcom.com/en-us/faqs/how-do-i-turn-off-alerts-that-i-dont-need | F |
| 49 | Dexcom — How do I stop repeated alerts when using Dexcom G7 CGM? | https://www.dexcom.com/en-us/faqs/how-do-i-stop-repeated-alerts | F |
| 50 | Connected in Motion — Dexcom G7's Enhanced Alerts (30-minute Urgent Low repeat) | https://www.connectedinmotion.ca/blog/dexcom-g7s-enhanced-alerts/ | S |
| 51 | klavkarr — How to read and clear confirmed OBD fault codes (MIL drive-cycle rule) | https://www.klavkarr.com/blog/72-confirmed-obd-fault-code | S |
| 52 | Apple Support — Heart health notifications on your Apple Watch (updated 2025-09-15) | https://support.apple.com/en-us/120276 | F |
| 53 | Apple Support — Apple Watch User Guide, Heart Health (AFib History) | https://support.apple.com/guide/watch/heart-health-apde39f5426c/watchos | F |
| 54 | Tractive Help — Health Alerts: How-To Guide (HTTP 403) | https://help.tractive.com/hc/en-us/articles/13362814092562-Health-Alerts-How-To-Guide | S |
| 55 | Tractive Help — App Redesign: What's new (HTTP 403) | https://help.tractive.com/hc/en-us/articles/22452180561554-Tractive-App-Redesign-What-s-new-and-how-to-navigate | S |
| 56 | Fi Help — Fi app features and navigation (HTTP 403) | https://support.fitracking.com/hc/en-us/articles/5296052598163-Fi-app-features-and-navigation | S |
| 57 | Fi Help — Managing Collar Alerts in the Fi App | https://support.tryfi.com/hc/en-us/articles/7264735794067-Managing-Collar-Alerts-in-the-Fi-App | S |
| 58 | PETKIT support forum — PETKIT APP Update (homepage upgrade) | https://support.petkit.com/support/discussions/topics/51000248965 | S |
| 59 | iTunes Search API — Petfetti (v5.1.1) | https://itunes.apple.com/search?term=petfetti&country=us&entity=software&limit=3 | F |
| 60 | iTunes Search API — DogLog (v3.36) | https://itunes.apple.com/search?term=doglog+dog+tracker&country=us&entity=software&limit=5 | F |
| 61 | iTunes Search API — CompanAIn (v1.0.6) | https://itunes.apple.com/search?term=companain&country=us&entity=software&limit=3 | F |
| 62 | Internal — `docs/research/2026-08-home-freshness-inspiration.md` (time-grain / daily-brief findings, not re-run) | repo | P |
| 63 | Internal — `docs/research/2026-08-home-screen-competitive-teardown.md` (22-record teardown, 2026-08-31) | repo | P |
| 64 | Internal — `docs/sessions/2026-08-29-signal-freshness-discovery.md` (F2–F7, D1–D5) | repo | P |

---

## §V — verification passes (append-only; none yet)

_Corrections to any claim above are added here as dated rows, with an inline ⚠ pointer at the corrected claim; the published wording is never edited in place._
