# Nyx Care State and Outcome Loop — Requirements (EN-9 + EN-14)

**Version:** 1.0 — **DRAFT for PM review** | **Date:** 2026-09-28 | **Issues:** CUL-1139 (EN-9, the care state), CUL-1144 (EN-14, the outcome loop); project *Engines v3: the accountable engine*, Wave 3, PR-20 | **Status:** every ruling the build rests on is in §0.1; three calls remain (§0.3): **PMD-4** (before PR-20 lands), **the re-raise tolerance** (before PR-23), and **approval of the AC 10 wording** (§12). Design authority: `docs/culprit-engines-v3-mockups.html` **round 3** (published at https://claude.ai/artifact/XrAawavFSUgbBKdWdxFsdY; the repo file wins on divergence). Everything an owner sees ships dark behind the Engines v3 flag (EN-F, CUL-1267).

**Read with:** `docs/engines-v3-critique-2026-09.md` (R-2, BRK-4, GAP-15/16/17/19/23/27/29/32/33, MFU-3, PMD-4/5/6) · `docs/nyx-vet-visits-requirements.md` (AC 10, §5.6, "How did it go?") · `docs/nyx-signal-fold-requirements.md` (DF-5, DF-8, FS-3, FS-10, §3.3, §5.3, §7) · `docs/nyx-notification-foundation-requirements.md` (D2, D3, G1–G6) · `docs/nyx-diet-trial-requirements.md` · `supabase/migrations/075_engines_v3_stamps.sql` (the shown log).

---

## TL;DR — plain English

Today the app asks for a vet visit about a recurring symptom every evening, forever, even after the vet has seen the pet, because nothing the owner says ever reaches the engine. This spec gives every recurring concern a **care state**. It starts **raised** (the ask). When the owner tells the app the vet knows (a tick at the visit, an answer afterwards, "My vet knows", or "yes, the vet started this trial for it"), the concern moves to **with your vet**: Home stops asking and says instead who said what, when, and what has been logged since. It comes **back** only when a tested change in the record says so, never on a timer, and never quietly. A booked recheck hands the concern to the appointment strip. Safety warnings (a photo red flag, a pet not eating, a call-tier read, the burden card) are never quieted by any of this.

The second half is the **outcome loop**. When the app says "call your vet" and the owner taps "I've called", the call becomes its own small record in the pet's Vet visits, with an optional note no AI reads. A couple of days later the app asks once, inside the app, "What did the vet say?" Those answers are how the app will eventually learn which warnings were worth making.

**What the PM decides:** PMD-4 (does a vet-started trial count, recommended yes through one question to the owner), the re-raise tolerance (recommended at most 5% of stable pets re-asked within eight weeks), and the exact AC 10 wording in §12.

---

## 0. Decision record

### 0.1 Ruled (this spec builds on these)

| Ruling | Date · source | What it means here |
|---|---|---|
| **D1 = A** four tiers for the per-incident read | 2026-09-26 PM | Tiers are EN-3's; this spec keys the outcome loop to the **escalation**, whatever its tier. |
| **TD-4 = D** answers one tap away, never on Home | 2026-09-26 PM | Every answer lives on the finding's screen, the incident screen, "At the vet", "How did it go?" or the follow-up screen. Home keeps its three write classes (C-33). |
| **E-2 = A restated** the owner's answer acknowledges, per sign | 2026-09-26 PM | §3.2. A visit alone acknowledges nothing; the owner's answer about it does. |
| **E-3 as restated** recheck-keyed now; calendar fallback secondary | 2026-09-26 PM | §4.7. The eight-week question is CUL-1290, gated on EN-1. |
| **N-1 = A** a call's note lives on its own call record in Vet visits | 2026-09-26 PM | §6.4. |
| **AC 10 = amend** the engine's shell may read owner answers and appointment dates; no visit enters a count | 2026-09-26 PM (plan review defaults) | §12 carries the wording for approval. |
| **"My vet knows" acknowledges, per sign, as a dated fact** | 2026-09-26 PM (plan review) | §3.2 source `my_vet_knows`. |
| **Never lower a stored escalation automatically** | 2026-09-26 PM | An answer never lowers a tier or removes an ask on an escalation (§6.1). |
| **PMD-12** evaluation purpose published before outcome data from any account but the PM's is used | 2026-09-26 PM (CUL-1313) | §6.6. |
| **Pinned by the plan review** | 2026-09-26 comments on CUL-1139 / CUL-1144 | Draw Jordan's case; a care state never quiets safety lanes (a test pins it); `careState` computed inside PR-11b's pure pipeline; pass lines fixed in advance by PR-16; the call record is its own table; append-only by RLS alone; local-first; `visitReaders` registration in PR-22; PR-35 builds in `components/designV2/` right after PR-23. |

### 0.2 Calls this spec makes (no ruling needed; reverse any by comment)

1. **One owner vocabulary** (GAP-16): the states read *raised* (the shipped ask), **With your vet**, **Recheck booked**, and **Back because …** (the fold spec's DF-8 cue). Never "watching" (the Signal's word for "still needs data"), never "stood down" (a shipped marker with its own copy), never "seen", "acknowledged", "dismissed" or "resolved" in copy or in a11y labels (fold §7). Code names in §3.3.
2. **TD-5's count-start half:** counts after an answer start the **day after** the answer's anchor date (the visit, the "My vet knows" day), except a trial-scoped answer, which counts from the trial's first day because that is what the owner was asked about. The Data Scientist's reading; Jordan's inclusive bound loses because the visit day's episodes are the ones the vet was shown.
3. **No separate owner "close".** A concern leaves Home when its detector stops firing (the shipped stand-down path takes over). An owner's answer closes the *ask*, not the finding; the finding keeps `priorityClass: 'safety'` while the detector fires (GAP-16's recommendation).
4. **The follow-up arrives in-app first** (§6.3): a navigation line on the escalation's own Home row from 48 h, the finding/incident screen, and Vet visits. A notification is a separate default-off category and never the only way in.
5. **Acknowledgements are listed in Vet visits** as "you noted" rows (mock 2c), not in History's day rows: an acknowledgement is not something that happened to the pet.
6. **EN-3's tiers are not drawn here.** Round 2 promised them for round 3; the plan review moved them to PR-24's own page.

### 0.3 Open (decision briefs)

**PMD-4 · Does a vet-directed trial or course acknowledge a concern?** (rule before PR-20 lands)
- **Deciding:** whether an owner whose vet started a diet trial before the app was installed (Jordan's case) gets out of the raised state through the trial.
- **Options:** **A via the owner's answer (recommended):** while a trial or course runs, the concern's finding screen asks once, per sign, "Did his vet start it for his vomiting?"; *Yes, for this* stores an acknowledgement scoped to that trial or course, ending when it ends. *Why:* it is E-2's rule applied to the wedge; nothing is matched on an indication, and the owner names the sign. · **A from the record:** `vet_visit_id`, `vet_name` or `target_duration_vet_directed` acknowledges the indication's signs with no question (faster; but `target_duration_vet_directed` means only "the owner ticked a box" per migration 068's own comment, and `gi` covers two signs the owner never named). · **B:** trials and courses never acknowledge; "My vet knows" only.
- **Consequence:** A adds `scope_kind` / `scope_id` / `ends_on` to the acknowledgement row (PR-21) and one question to the finding screen (PR-35); B removes both and leaves the wedge's own owner in mock 1a for a whole trial unless they find "My vet knows".

**The re-raise tolerance** (the ruling sheet's "now" item; rule before PR-23)
- **Deciding:** how often a stable pet's owner may be asked again for nothing.
- **What changed (the adversarial pass, 2026-09-28):** the pair the first draft recommended (≤5% false, ≥80% of doublings in 4 weeks) looks **infeasible** at 2/week. No count test catches a doubling from that base reliably in four weeks; α 0.1 reached 58% at about 9% false. So the ruling is a point on a measured frontier, and fast worsening is covered by the burden card and the dense-day arm (§4.3–§4.4), not by this test.
- **Options:** **A: cap false re-raises at 5% of stable pets within eight weeks and take the sensitivity that buys, reported per base rate (recommended).** *Why:* noise is what made the drafted trigger unusable (59–81% re-raised), and the fast-worsening cases have their own nets. · **B: cap at 10%**, which roughly doubles sensitivity at low base rates for twice the noise. · **C: set a sensitivity floor first** (e.g. ≥50% of doublings within 8 weeks) and accept whatever false rate that costs.
- **Consequence:** PR-16 measures the frontier over α, r and the reference length on ≥1,000 pets per scenario and reports it. The PM picks the point before PR-23; PR-23 does not go live until the harness shows the chosen configuration meets it.

**AC 10 wording** — §12. Deciding: the words, not the rule (ruled "amend"). Recommend approve as written. Consequence: PR-21 writes it with the guard change.

---

## 1. The problem

Replayed over Nyx's record, Home asked for a vet about her vomiting on 110 evenings in a row, 101 of them "book a visit", and kept asking after the 9/16 visit (CUL-1139). Of those 101, 40 fell before her trial, 52 inside a vet-prescribed GI trial and 9 after the visit (PMD-4): **a visit-only rule reaches 9 of 101.** Repetition is the main driver of alert override (Ancker 2017: acceptance falls about 30% per extra reminder), and people follow an alert about as often as it has been right (Bliss 1995). The engine can't hear an answer, and no warning in the app has ever learned whether it was right.

The jobs:
- **J1 (Jordan, day 30 of a trial his vet started before the app):** stop asking me to book a visit my vet already made, and keep telling me if it gets worse.
- **J2 (Sam, after a visit):** tell me what's happened since the vet saw her, in numbers I can say to the vet, without telling me she's fine.
- **J3 (any owner after "call your vet"):** let me say I called, keep what the vet said, and don't nag.
- **J4 (the product):** learn, per warning, whether the vet thought the call was worth it.

---

## 2. What exists (verified at file:line, 2026-09-28)

- **The shown log exists.** `signal_shown_log` (migration 075 §5, lines 412–456): `pet_id` cascading from `pets`, `generated_at`, `finding_type`, `finding_key`, `tier`, `text_hash` (a hash, never the text), `engine_fingerprint`, `engine_flags`; append-only by RLS alone (SELECT + INSERT policies, UPDATE/DELETE grants revoked, no DELETE trigger, 391–395). Written with the service role (`_shared/engineStamps.ts` 209–216; CUL-1384 drops the unused client INSERT policy). First/last shown are derived as min/max. **MFU-3 is met;** this spec reads it and adds nothing to it.
- **Finding identity:** `lib/findingIdentity.ts` 40–55 — chronicity and worsening key as `type:symptomType`; a concern in this spec is `(pet_id, symptom_type)`, the same key without the type prefix, so chronicity and worsening for one sign share one care state.
- **The stand-down marker** (`generate-signal/standDown.ts`): minted when a chronicity course stops firing only because its recency floor closed and logging held; `priorityClass: 'insight'`, 7-day TTL, never reaches the report; copy "No {symptom} logged for {pet} in {n} days — this card has stood down. That isn't an all-clear. If you haven't been, the visit is still worth booking." (208–218). Rendered verbatim by `StoodDownLine` (`components/home/SignalZone.tsx` 920–932).
- **Safety leads everywhere by class:** Ask's `leadingSafetyText` keys on `priorityClass === 'safety'` (`ask/answer.ts` 1007–1031, attached at `ask/index.ts:912`); the cross-pet banner uses an explicit type allow-list (`lib/signalCopy.ts` 1998–2049); Get ready renders safety rows above its cap of four (`lib/getReady.ts` 293–301).
- **The vet tables:** `vet_visits` (`visited_at` DATE, `next_visit_at` DATE, `reason`, `notes`, `deleted_at`); `vet_appointments` (066: `scheduled_at`, `reason`, `questions` JSONB with `asked_at`, `vet_visit_id`, `cancelled_at`, `deleted_at`; no DELETE verb). "How did it go?"'s next-visit row writes both `next_visit_at` and a `vet_appointments` row (`app/vet-visits/after.tsx` 551–577).
- **Trials and courses:** `diet_trials.vet_name` (001:155), `indication` enum `skin|gi|other` (040:93, 109), `vet_visit_id` (066:272), `target_duration_vet_directed` (068:192–210, "the OWNER checked a box… never that a vet was consulted"). `medications.indication` TEXT, `prescribed_by` TEXT (020:167–168), `vet_visit_id` (066:271). There is **no** `diet_trials.prescribed_by`.
- **AC 10's guard:** `guards/visitReaders.test.ts` — `ALLOWED` is an exemption map (file → kinds); `MUST_STAY_CLEAN` pins `generate-signal/detection.ts`, `phrasing.ts`, `ask/index.ts` and four client modules at zero reads (247–255). `generate-signal/index.ts` has no entry, so any read there reds today.
- **Notifications:** local-first (D2), no server scheduler, every category default off (G6), only `daily_summary` registered; body never asserts record contents (D3/G1); fail-safe silence (G5).
- **Fold rules that bind:** DF-5 (no time-based re-open), DF-8 ("Back because" line), FS-3 (a safety strip never drops its ask), FS-10 ("an 'acknowledged' that reaches anything clinical is F4's own schema: owner-entered, dated"), §3.3 ("`Not yet` is never removed"), §5.3 (counts re-open increase-only), §7 (spoken label shape; never "seen"/"acknowledged").
- **The cough/vomit disclosure** is shipped in three registers: the card clause (`phrasing.ts` 312–315), the expand (`lib/signalCopy.ts` 904–920) and the phone-script row (1941–1950).

---

## 3. The model

### 3.1 Concerns

A **concern** is `(pet_id, symptom_type)` for a sign whose chronicity (⑦) or worsening lane fires with `priorityClass: 'safety'`. Two signs are two concerns, always — cough and vomiting included (GAP-29). A concern exists only while one of its lanes fires; when both stop, the concern is gone and the shipped stand-down path speaks.

**Out of scope, by rule:** an **escalation** — a photo red flag, a call-tier per-incident read, an intake decline, the burden card (CUL-1311) — is never a concern and never carries a care state. These are what the outcome loop (§6) keys on. **A care state never removes, reorders below itself, softens or re-words any of them** (test: §11 AC-3).

### 3.2 Acknowledgements — owner-entered, dated, per sign

An acknowledgement is a row the owner caused, stating that a vet knows about one sign. Sources:

| `source` | Where the owner says it | Anchor date | Ends |
|---|---|---|---|
| `at_vet_tick` | a Worth-raising row ticked on "At the vet" (mock round 2 §03 f3), confirmed in "How did it go?" | the visit's `visited_at` | at stand-down (below) |
| `visit_answer` | "Talked about it" in "How did it go?"'s *What Home was raising*, or the one question for a visit already on record (round 2 §03 f5) | the visit's `visited_at` | at stand-down |
| `my_vet_knows` | the finding screen's "My vet knows" (mock 2a–2b) | the day of the tap | at stand-down |
| `vet_started_trial` / `vet_started_course` | PMD-4 A's one question (mock 1b) | the trial's / course's start date | the earliest of: the trial's or course's end (`ended_at`, `completed_at`); for a trial, the end of its **initial** target (`target_duration_days_initial`, so an extension re-asks rather than silently extending); for a course, the last logged dose + 14 days, or 56 days from the answer when the course has no target; and stand-down |

- **Every acknowledgement belongs to the course of the concern it was given for.** It lapses when that concern stands down (its lanes stop firing and a stand-down marker is minted, or the finding leaves the set). A later recurrence is a new concern and is born `raised`; an old answer never covers it.
- **A visit answer must postdate the concern:** the past-visit question is offered, and a `visit_answer` / `at_vet_tick` accepted, only for a visit on or after the concern's first onset in the engine's lookback. A February vaccine visit never acknowledges June's vomiting.
- **Per sign:** each row names one `symptom_type`. A tick on a row whose sentence names two signs (the cough/vomit pair) writes one acknowledgement, for the row's own sign.
- **"Not yet"** writes nothing and is never removed (fold §3.3). **"Not this time"** in "How did it go?" writes nothing. **"Later"** writes nothing.
- **Undo / change** writes a new row with `retracts` pointing at the old one (append-only, §8.1).
- **A visit alone acknowledges nothing** (E-2). At GA every existing concern starts raised; a visit already on record gets the one question on the finding screen, at most one question a day across all concerns, never on Home.
- **No snapshot of Get ready rows** is stored or counted (E-2's rejected "A with a snapshot").

### 3.3 The care state (derived, never stored)

`careState` is a field on the live safety finding, computed **inside PR-11b's pure pipeline** in `generate-signal`'s shell, never in `detection.ts` and never on the device (GAP-15). The finding keeps `priorityClass: 'safety'`. Values:

| `careState` | When | Owner copy (Home row) | Rail |
|---|---|---|---|
| `raised` | no live acknowledgement for the sign, or the only one lapsed | the shipped chronicity/worsening row, ask intact | rose |
| `with_vet` | a live acknowledgement exists and no re-raise test fires | tag **With your vet** · "{source sentence}. {count since}, with something logged on {k} of {n} days." (plus "Last weighed {Mon d}." while §4.1's weight rule applies) | rose-soft |
| `recheck_booked` | `with_vet`, and an appointment **about this sign** is booked (§4.7) | tag **With your vet** · "{source sentence}. Recheck booked for {date}." | rose-soft |
| `raised_again` | a live acknowledgement exists and a §4.2 or §4.3 trigger has fired; latched until a newer answer (§4.5) | "Back because it's coming more often" line (DF-8) + the lane's row with its ask + the compared pair + the earlier answer as a fact | rose |

The source sentences, verbatim (nyx-voice pass at PR-35):
- `at_vet_tick` / `visit_answer`: "You said you talked about it at the {Mon d} visit."
- `my_vet_knows`: "You said on {Mon d} {pet's} vet knows."
- `vet_started_trial`: "You said {pet's} vet started the trial for it."
- `vet_started_course`: "You said {pet's} vet started {drug} for it."

Always **"you said"**, never "your vet saw" (the app knows only what the owner said).

**Ranking** (one server re-rank that Home, Ask, Get ready and the banner inherit): escalations first (unchanged order), then `raised` and `raised_again` concerns, then `with_vet` / `recheck_booked` concerns, then insights. A `with_vet` concern still counts as a safety finding for Ask's `leadingSafetyText`, which therefore leads with the highest-ranked safety finding: a raised one over a watched one (Ask fixtures, §11 AC-7). The cross-pet banner keeps its type allow-list and additionally skips a pet whose only safety findings are `with_vet` or `recheck_booked`.

**Regeneration:** every acknowledgement write (and retraction) triggers the debounced regen the log path already uses, so the cached Signal reflects the answer on the next read. Offline, the answer writes locally and the cached Signal keeps asking until the server recomputes (mock 3e); the device never computes a care state.

### 3.4 Where it shows, and where it never does

| Surface | Shows | Never |
|---|---|---|
| Home Signal zone | the §3.3 row; the follow-up line on an escalation row (§6.3) | a control, a form, the note |
| Finding screen (Design v2 Signal screen) | the answers; the state sentence; EN-10's lines; the weight fact (§5.3); the full cough/vomit disclosure | — |
| Incident screen | "I've called · Not yet"; the call's confirmation; the follow-up | a care state (an incident is an escalation) |
| Get ready | the finding's cached sentence verbatim (Worth raising), which now carries the state sentence | a new count |
| At the vet / How did it go? | tickable Worth-raising rows; *What Home was raising* with *Talked about it · Not this time · Later* | — |
| Vet visits | calls; "you noted" acknowledgements; visits; appointments | — |
| History | the call as its own row type on the call's day | acknowledgements |
| Ask | the cached finding text, with its state sentence | a care state phrased as a verdict ("under control", BRK-13 screens apply) |
| **The vet report and every off-device share** (Get ready's Copy as text included) | dated facts only: visits, courses, trials, counts with coverage | **a care state, a tier, a tap, a call answer or a note** (GAP-27). `generate-report` runs detection itself and never runs the shell's care-state step; pinned by a guard (§11 AC-9). |

---

## 4. Coming back: the re-raise tests

### 4.1 What may bring a concern back

Only a **tested change in the record**: the rate test (§4.2), the dense-day arm (§4.3), or the **other sign of the cough/vomit pair turning chronic** while this one is `with_vet` (GAP-29's seventh trigger; either count may hold the other's events). Also the **end of an acknowledgement** (§3.2 lapse rules). Never a calendar, never one bad day, never time since the answer (DF-5 stands; the calendar question is CUL-1290).

**Known gap, stated:** a pet that simply fails to improve (steady at 2/week for months after "come back if it continues") **never re-raises in v1**. That is PMD-5's case and it belongs to CUL-1290, behind EN-1's measurement. The row keeps printing its count and its logging, so the non-improvement is visible, but no ask returns.

**Weight:** a watched GI concern never waits for EN-8. Until EN-8 is live, the `with_vet` Home row carries the record fact "Last weighed {Mon d}." whenever the newest weigh-in predates the acknowledgement's anchor (§5.3). It is a fact line, not a door. PR-23 does not go live for a species until either EN-8 is live for it or this line ships with it.

### 4.2 The rate test (replaces "a band change" and "1.5× the rate")

Per concern, evaluated at each daily engine run:
- **Unit:** **episodes, collapsed exactly as ⑦ collapses them** (`computeChronicityStats` / `toEpisodeOnsets`, 3 h), not episode-days. There is no ceiling: a pet at 60% of days going to three a day can re-raise. The day key is the local day (C-40; ⑦'s UTC bucketing is filed separately).
- **Reference window: 28 days, frozen once and stored.** It is the 28 days before the acknowledgement's anchor (for a trial-scoped answer, the 28 days before the trial started). If those days are not logged on at least 20 of 28, the reference is instead the **first** 28-day window after the anchor that clears the floor. It is frozen at that moment and stored on the finding, and the row discloses it ("compared with Sep 1 to Sep 28"). The reference **never slides** (a sliding reference caught a step change 0.9% of the time against 16.5% fixed).
- **Current window:** the last 14 days, logged on at least 10 of 14.
- **Exposure:** days with anything logged, never calendar days.
- **Test:** the Poisson rate comparison as an exact conditional binomial. Given `n = a + b` episodes across both windows with logged days `Lc` and `Lr`, test `a ~ Binomial(n, Lc / (Lc + Lr))`, one-sided for excess. It fires when `p < α` and the current rate is at least `r` × the reference rate.
- **Persistence:** it must fire at `t` **and again on an evaluation within t+7 to t+14, with no evaluation in between failing the coverage floor**. Two unrelated flares months apart never add up.
- **Below the floor** the test does not run and the row says so: "Something logged on {k} of the last 14 days, too few to count from." (mock 3b).
- **Coverage wording:** always "something logged" or "days with anything logged", never "logged on k of n days" alone. Meal logging can continue while symptom logging tails off, and "logged on 14 of 14" would then read as full symptom coverage. A fixture pins it: meals logged every day, vomits logged on none, and the row makes no claim that reads as improvement.
- **The knobs are `α`, `r` and the two windows.** Measured by the adversarial pass (2026-09-28, 800–2,000 synthetic pets per cell): the first draft's settings (α 0.01, 2×, 14/14 episode-days) caught 2–4% of true doublings within 4 weeks. At 2/week, "≤5% false re-raises and ≥80% of doublings within 4 weeks" **looks infeasible** (α 0.1 reached 58% of doublings at about 9% false). **A doubling from about 2/week is not reliably detectable within four weeks by any count test.** So the tolerance ruling (§0.3) picks a point on a measured frontier, and the burden card and the dense-day arm are the net for fast worsening. Starting point for PR-16's grid: α ∈ {0.05, 0.1}, r ∈ {1.5, 2}, reference 28 or 56 days.
- **What the row then says:** the pair it compared, as counts with their windows ("8 episodes in the last 2 weeks; 5 in the 4 weeks before the trial"), never a rate or a percentage.
- **No tier drop without a fall in the count** (R-2): `raised_again` keeps the lane's own tier.

### 4.3 The dense-day arm

The worsening lane's shipped dense-day floor (④: a sign on 4 of the last 7 days, the floor that lifts chronicity to firm today, `detection.ts` ~6755–6775) is a re-raise trigger in its own right while a concern is `with_vet`, with the same persistence as §4.2. A tested floor the engine already trusts is never silenced by a care state.

### 4.4 The burden card is the net, and that is a pinned property

CUL-1311's absolute-burden card is never quieted by a care state (§3.1). §4.2 is weakest exactly where the reference rate is high or the rise is fast. PR-23's gate on CUL-1311 part 2 therefore gains a harness property: **on every PR-15 scenario where §4.2 is structurally slow (a reference at or above 50% of days, three or more episodes a day, or a doubling from a high base), the burden card or the dense-day arm fires within the ruled delay.** Until CUL-1311 records its threshold, this property cannot be checked, and PR-23 does not go live.

### 4.5 `raised_again` latches

Once raised again, a concern stays `raised_again`, ask and all, until the owner answers again with an acknowledgement **dated after the re-raise**. A cooling current window never drops it back quietly: that would be an automatic lowering (R-2, "never lower a stored escalation automatically").

### 4.6 Tested on

- A stable cat at 2/week.
- A true doubling at full logging, and behind a 50% lapse.
- Every other day going to daily, and to three a day (the old ceiling).
- A step change and a steady climb, each with a reference that could only be taken after the anchor.
- A reference taken at a peak.
- A dog with one-day spikes.
- A co-chronic cough/vomit cat.
- A relabelling cat, where counts change retroactively. The frozen reference keeps its stored counts, and the relabel is disclosed rather than re-deriving the reference.
- A trial ending mid-concern.
- A January acknowledgement, a stand-down, then a September recurrence (must be born `raised`).
- A visit answer for a visit before the concern's onset (must be refused).
- Meals logged with symptoms not logged.

### 4.7 A booked recheck (E-3)

A `vet_appointments` row for the pet moves `with_vet` to `recheck_booked` only when **all** of these hold:
- it is scheduled after the acknowledgement's anchor;
- it is not cancelled or deleted, and not yet past;
- it is **about this sign**, meaning one of:
  - its `reason` names the sign;
  - one of its `questions` rows carries this finding's `source_ref`;
  - it was booked from this finding's "Book a visit";
  - the owner answered the finding screen's one question "Is the {date} visit about his vomiting?" with Yes.

A dental booked four months out never quiets vomiting. The row names the date and asks nothing, and the appointment strip holds the one ask, as shipped (five-day window; after the day, "Did {day}'s visit happen?" once). After the appointment's day passes, the concern returns to `with_vet` until "How did it go?" is answered. Its *What Home was raising* re-asks for every raised or with-vet concern. Any §4.2–§4.3 trigger re-raises straight through a booked recheck.

---

## 5. EN-10's context lines (CUL-1140, PR-22)

Rendered on the finding screen and carried in the cached sentence where the plan needs them relayed (Get ready, Ask). Each is **a window, a count and its logging**; never a comparison, never an attribution. Mock §05.

### 5.1 The lines

- **Visit:** "Since the {Mon d} visit, {n} days: {count} {sign-unit}, with something logged on {k} of {n}." Reads `vet_visits.visited_at` (AC 10 as amended). Counts from the day after. **Within 14 days of a visit it never shows a zero** and carries "Anything given at the visit isn't in the record." whenever the count is below the reference, because an injection (Depo-Medrol, maropitant) never enters `medications`.
- **Trial:** "{Protein} trial, day {d} of {N}: {count} {unit} in its {d} days, with something logged on {k}." Only on concerns the trial covers: `indication = 'gi'` → vomiting and diarrhea; `skin` → itch and scratch; `other` → none (the trial screen speaks for it).
- **Course:** "{Drug} since {Mon d}, {n} days: {count} {unit}, with something logged on {k} of {n}." Shown beside **every concern the drug can move, in either direction**, from a curated drug-class table. Drugs that **mask**: systemic corticosteroids → every concern; inhaled corticosteroids (fluticasone) → cough; antiemetics and GI protectants → vomiting; antidiarrheals, metronidazole, tylosin and probiotics → diarrhea; antipruritics (oclacitinib, lokivetmab, cyclosporine) → itch/scratch; antitussives and bronchodilators → cough. Drugs that **cause**: NSAIDs, doxycycline, methimazole, cyclosporine and chemotherapy → vomiting and diarrhea. Matched on drug class, **never on `indication` free text**. **A drug name the table cannot resolve fails toward disclosure:** it shows beside every concern, like a systemic steroid. The table goes to the ruling sheet (CUL-583) with the "too soon" windows per drug.
- **No zero anywhere beside an on-board drug that can mask the sign.** Within that drug's too-soon window (14 days until CUL-583 rules per drug), no count on the same row or screen shows a zero: not the course line, not the visit line, not the trial line, and not the `with_vet` row itself ("You said Nyx's vet started prednisone for it. 0 episodes" is exactly the "it worked" reading). At zero the course line states the start and stops ("{Drug} since {Mon d}, {n} days. Started {n} days ago."), and the other lines state their window and logging without the count.
- **Order:** when a masking drug is on board inside a trial, the course line renders **above** the trial line, so the diet is never the first explanation a reader meets.
- **Co-chronic pair:** the cough and vomiting screens each carry the full shipped disclosure; a line never nets one sign's count against the other.

### 5.2 Rules

- No "too soon to read" (it promises a verdict); no "since then, down from" (an untested comparison).
- The phrasing prompt gains Ask's rule 10 (visits and treatments relayed as dated facts beside counts, never as containment or effect) in the same PR; `validatePhrasing`'s CUL-1271 screen stays the backstop.
- Dose-level context waits on CUL-1099 actually landing (reopened 2026-09-27); regimen start dates suffice for v1.

### 5.3 Weight, as a fact (not a lane)

On the finding screen and in Get ready, never on Home: "Last weighed {Mon d}, {source}. Nothing logged since." when the newest weigh-in predates the acknowledgement's anchor (the Get ready weight gate's record-anchored shape, build call 3: no duration threshold). No-scale household: the source "at the clinic" is offered on the weigh-in and the line never nudges. The weight card and its cutoffs are EN-8's.

---

## 6. The outcome loop (EN-14)

### 6.1 The escalation is the unit

An **escalation** is one per pet per incident family (vomit, stool, intake), opened by the first read or context fact at a call rung, re-alerting only on a higher rung or a new reason class, closed by the owner's answer or the rung's quiet window (GAP-33). EN-4 (PR-28) builds it; until then the outcome loop keys to the **first call-tier read of a bout**, where a bout is the same pet and incident family **within 24 h of the bout's first read** (never chained from the previous read). A read at a higher rung, or with a new reason class (blood, foreign material), opens a new bout with its own follow-up, mirroring GAP-33's latch rule. Three reads of one bout owe one follow-up. "I've called" attaches to the escalation, and the escalation's ask is **never lowered** by it (the row gains "You called on {Mon d}." and keeps its ask word for word; mock 4b).

### 6.2 The answers

On the finding or incident screen: **I've called · Not yet** (call tier) and **Book a visit · My vet knows · Not yet** (visit tier). After "I've called": the confirmation (mock 4a), **Add a note** (written after the save, never required, never read by a model), **Undo** (the one reversal net, C-21).

**TD-5, the call-now "Not yet" (persona conflict, left to PR-36 by the plan review; drawn in mock §04):**
> **Dr. Chen:** ask once more that evening, on the screen, the next time it opens after 6 PM; then never again for that escalation.
> **Jordan:** "Not yet" behaves exactly as today; a second ask is the nag that makes owners tap "I've called" falsely.
> **PM decision needed** at PR-36 (neither option notifies).

### 6.3 The follow-up

- **Owed:** one per escalation with an "I've called" answer, **due 48 h after the call answer, expiring 7 days after it**. Keyed on `(pet_id, escalation_key)`, where the escalation key is **the escalation as shown**, read from `signal_shown_log` / the read's stamps at the moment "I've called" was tapped, never its current tier (a later recompute can't orphan it, GAP-34). It names the first read's `event_id`; if that event is soft-deleted as a duplicate, the key re-points to the next read in the bout (any server writer of "owed" keys on both event and pet, per the plan review). **Undo** of "I've called" writes a `withdrawn` ledger row, and nothing is asked.
- **Where it arrives, notifications off (the default):** a navigation line on the escalation's own Home row, "You called on {Mon d}. What did the vet say? ›" (mock 4b; navigation, so no new write class, C-33), counted as the day's one nudge (Principle 4); the top of the finding/incident screen; the call record in Vet visits. Never a card of its own, never a sheet on Home.
- **Notifications on:** a new category `follow_ups`, **default off** (G6), body "A question about {pet}" (names no record fact, G1/D3), tap → the follow-up screen. Scheduled locally from the owed row once it syncs; cancelled on answer, on expiry and in `wipeLocalSession`. **The confirmation never names a day** ("We'll ask on Friday") because nothing guarantees delivery; with the category on it reads "We'll send a reminder in a couple of days."
- **Answered once, across phones:** the server ledger's `answered_at` is the truth; a device that sees an answered row cancels its local schedule. Server-initiated push is **not** needed for v1 (the Open Question narrows: needed only if a follow-up must reach a phone that never saw the escalation; that gates PR-36's notification half, not the in-app follow-up).
- **Expiry:** silent (G5). The Home line goes; the ledger marks `expired`; the call record keeps "Not recorded. Add it ›" (mock 4e).
- **The answer set** (mock 4c): **Wants to see him** (opens the booking form, reason carried in) · **Started a treatment** (opens the medication form, VV-3's local-first write) · **Keep watching** · **It was something else** (the vet named another cause; stored as a label, never re-types the event) · **Couldn't reach them**; then, optional, **"Did your vet think it was worth the call?" Yes · No · Didn't say**. No answer reads as "he's fine"; "Nothing needed" is dropped (round 2). "Keep watching" never acknowledges or quiets anything by itself.

### 6.4 The call record (N-1 = A)

Its own table in the vet-visit family (§8.2): the call's date, the escalation it was about, the follow-up's answer, and the owner's note. Listed in Vet visits beside visits and "you noted" rows (mock 2c, 4d), and as its own row type in History on the call's day. **Not an `events` row** (Ask's recall reads every event's notes, `ask/index.ts` ~581–586) and **not a `vet_visits` row** (it would become the report's window anchor, `report.ts` ~873–886, so a report would start at a phone call).

### 6.5 Logged-tier reads

A logged-tier read ("keep an eye out") gets no follow-up in v1, so misses are never counted (GAP-23's thread-in-the-gut counterexample). Filed for EN-3/PR-24 as a **sampled** follow-up on logged reads; the ledger here is built to hold it (`reason = 'sampled'`).

### 6.6 What the answers are for

Labels, per escalation, joined to the tier and the read's rule-version stamp (075). "Right" is defined per tier at design time (a call-now read is right if the vet wanted to see the pet or thought the call worthwhile; a sampled logged read is wrong if the vet wanted to see the pet). Used **only in aggregate**, **only at design time**, and **only from the PM's own account** until PMD-12's published purpose (CUL-1313). Nothing leaves the owner's record (FR-7 Tier 0). No model reads a note.

---

## 7. Accessibility (fold §7's shape)

- Each Home row's label is one sentence, read whole: **name. ask (when there is one). count line.** Dates spoken in full ("September 30"). Mock §06 has the table.
  - `with_vet`: "Vomiting, with your vet. You said {pet's} vet started the trial for it. 9 episodes in the 30 days of the trial, logged on 29 of them."
  - `raised_again`: "Back because it's coming more often. Recurring vomiting. Worth a word with your vet. 8 episodes in the last 2 weeks, 2 in the 2 before."
- Never "seen", "acknowledged", "dismissed", "resolved" or "watching".
- **Announcements:** an answer's save is announced once on the finding screen, from the write's result (never from an animation), on both platforms (`useLiveRegionAnnouncement` paired with `accessibilityLiveRegion`, C-44). A `raised_again` row is announced once, when Home next renders it (the fold's "Back because" rule prefixes the label). The follow-up line is part of its row's label, not announced.
- **Colour never carries the state alone:** "With your vet" is a word tag on a lighter rail; "Back because…" is a word line.
- The answer chips are ≥44 pt with the C-5 gap arithmetic; `ChipGroup` where the set is closed.

---

## 8. Data model (PR-21; final DDL at build, own PR, Migration Safety Pre-flight)

Three tables, all in the vet-visit family, all with `pet_id` and RLS, all **append-only by RLS policy alone** (SELECT + INSERT policies, UPDATE/DELETE grants revoked, **no trigger that raises on DELETE**, which would abort `auth.admin.deleteUser`'s cascade — the 075 / 032 shape), all `ON DELETE CASCADE` from `pets`.

### 8.1 `care_acknowledgements`

```sql
CREATE TABLE care_acknowledgements (
  id            UUID PRIMARY KEY,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  symptom_type  TEXT NOT NULL,                 -- one sign; CHECK against the lane's sign set
  source        TEXT NOT NULL CHECK (source IN ('at_vet_tick','visit_answer','my_vet_knows','vet_started_trial','vet_started_course')),
  anchor_on     DATE NOT NULL,                 -- the visit day / tap day / trial or course start (local day)
  vet_visit_id  UUID REFERENCES vet_visits(id) ON DELETE SET NULL,     -- provenance for the two visit sources
  diet_trial_id UUID REFERENCES diet_trials(id) ON DELETE CASCADE,     -- PMD-4 A only
  medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,     -- PMD-4 A only
  retracts      UUID REFERENCES care_acknowledgements(id),             -- a retraction row; never an UPDATE
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Same-pet triggers on every FK (the 023/041/045 mechanism, SECURITY DEFINER, errors carry only `NEW.*` values, C-31). A row whose trial/course has ended is simply not live; nothing is updated.

### 8.2 `vet_calls`

```sql
CREATE TABLE vet_calls (
  id              UUID PRIMARY KEY,
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  called_on       DATE NOT NULL,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,  -- the escalation's first read
  note            TEXT,                           -- owner-only; no model reads it
  supersedes      UUID REFERENCES vet_calls(id),  -- an Undo or an edited note is a new row
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.3 `vet_call_follow_ups` (the ledger)

```sql
CREATE TABLE vet_call_follow_ups (
  id            UUID PRIMARY KEY,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vet_call_id   UUID NOT NULL REFERENCES vet_calls(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,   -- owed keys on event AND pet
  reason        TEXT NOT NULL CHECK (reason IN ('called','sampled')),
  status        TEXT NOT NULL CHECK (status IN ('owed','answered','expired','withdrawn')),
  answer        TEXT CHECK (answer IN ('wants_to_see','started_treatment','keep_watching','something_else','could_not_reach')),
  worth_it      TEXT CHECK (worth_it IN ('yes','no','did_not_say')),
  due_at        TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One owed row per (pet_id, event_id); a status change is a NEW row, latest by created_at wins.
```

### 8.4 The privacy line (R-5)

- RLS default-deny, owner policy per pet on SELECT and INSERT; no UPDATE or DELETE verb for any role but the cascade.
- Local SQLite mirrors in a schema constant, all three in `LOCAL_WIPE_TABLES` (children first); `wipeLocalSession` also cancels scheduled `follow_ups` notifications.
- Export scope line and the deletion cascade (by `pets`); `rls-privacy-reviewer` probes a cross-tenant insert with a victim's `event_id` / `diet_trial_id` and the cascade's zero-row count.
- **The note:** a guard in the lookNotes shape keyed on `vet_calls` + `note` over `supabase/functions/`, whose allow-set is **empty** (the report does not print call notes; lookNotes' own allow-set holds `generate-report/`, this one holds nothing). Stated limit: syntactic, cannot catch `select('*')`, so every server reader of these tables uses an explicit column list, asserted by the same guard.
- `visitReaders.test.ts` gains the three tables in its scanned set; the shell is registered with `kinds: ['table']` (PR-22), and `detection.ts` / `phrasing.ts` stay in `MUST_STAY_CLEAN`.
- No model reads any of it. No new bucket, no new secret.

### 8.5 Migration Safety Pre-flight (for PR-21)

Additive (`n`); rollback `DROP TABLE vet_call_follow_ups; DROP TABLE vet_calls; DROP TABLE care_acknowledgements;`; backfill N/A (at GA every concern starts raised by design).

---

## 9. The flag and the GA seam

- Behind EN-F. **Flag-off, the shell never reads the three tables** and the Signal is byte-identical to today (the R-1 guard over the pure pipeline). Answers written while flag-on stay in their tables and in Vet visits; they take effect again when the flag returns (mock 3f). **A kill switch can make Home louder, never quieter.**
- Old builds: `careState` is a new optional field on a cached finding; an installed 1.2.0 build ignores it and renders the finding as today (still asking). The client half (PR-35/36) builds in `components/designV2/` and reaches owners at Design v2 GA (CUL-1071).
- **GA day for an existing owner:** every concern starts raised; the one past-visit question appears on the finding screen for the most recent visit on record (at most one a day); nothing is back-filled.

---

## 10. Persona positions and recorded conflicts

- **Dr. Chen:** holds the "never quiets safety" rule and the drug-class matching; dissents on TD-5 (above). Tried: *a cat at 3/week acknowledged, then vomiting daily behind a two-week logging gap* → the coverage floor stops the count and says so, and the burden card (CUL-1311), which is never quieted, is the daily-vomiting net: **unverifiable until CUL-1311 records its threshold** (§4.4), so not a ✓. Tried: *prednisone started for the cough; vomiting falls* → the course line sits beside vomiting too and states no comparison ✓.
- **Data Scientist:** §4.2 replaces both drafted triggers, counts ⑦'s episodes against a frozen reference, and states its own blind spot (a doubling from a low base).
- **Designer:** one vocabulary; every state drawn; Home carries no control.
- **Jordan:** PMD-4 A is his case; dissents on TD-5.
- **Sam:** the relabelling cat is in the fixtures (§4.6); "you said" is how she'd want it phrased.
- **Trust & Safety:** the note guard, append-only by RLS, PMD-12, the report line.
- **Dir. Eng / QA:** careState in the pure pipeline; the ranking in one server re-rank; the AC list below.

---

### 10.1 The adversarial pass (2026-09-28, `adversarial-reviewer`, isolated)

Verdict on the first draft: **FAIL, eleven counterexamples, all taken into this version.**

| Counterexample (Monte Carlo, 800–2,000 synthetic pets per cell) | First draft | Now |
|---|---|---|
| True doubling 2→4/week at full logging | caught 2.4% within 4 weeks | the tolerance is ruled on a measured frontier; the blind spot is stated (§4.2, §0.3) |
| Every other day → daily | 3% (the episode-day ceiling) | ⑦'s episodes counted, no ceiling; the burden card is a pinned net (§4.2, §4.4) |
| Sliding post-anchor reference, step change | 0.9% caught (16.5% fixed) | reference frozen once, stored, disclosed (§4.2) |
| January answer, stand-down, September recurrence | born `with_vet` | acknowledgements lapse at stand-down (§3.2) |
| Past-visit answer for a visit before the onset | acknowledged | refused (§3.2) |
| `raised_again` after a quieter fortnight | dropped back silently | latched until a newer answer (§4.5) |
| Dense-day ④ firing while `with_vet` | silenced | a trigger of its own (§4.3) |
| An unrelated dental appointment | "Recheck booked" | only an appointment about the sign (§4.7) |
| Vet-started prednisone, 0 vomits | the `with_vet` row printed the zero | no zero on any line beside a masking drug (§5.1) |
| Depo-Medrol given at the visit | "0 vomits since the visit" | no zero within 14 days of a visit, plus a disclosure line (§5.1) |
| Open-ended course / extended trial | acknowledged indefinitely | ends at last dose + 14 d, a 56-day cap, or the initial target (§3.2) |
| Reads every 20 h for 5 days, blood on day 5 | merged into day 1's bout | bout bounded from its first read; a new reason class opens a new one (§6.1) |
| Undo of "I've called" | follow-up still asked | `withdrawn` (§6.3) |
| Drug table | suppressors only; fluticasone missed | "can cause" rows; unresolved drugs disclose everywhere (§5.1) |
| Meals logged, vomits not | "logged on 14 of 14" read as full coverage | "something logged", with a fixture (§4.2) |

**Held:** a stable 2/week cat stays `with_vet` (about 0.3% false re-raise); attention-biased logging stays under the 2× bar because of the 10/14 floor; three reads in one bout owe one follow-up; escalations are untouched by a care state (AC-3); PMD-4's per-sign question stops a skin trial from covering vomiting.

**Unverifiable today:** the burden-card net, because CUL-1311 records no threshold. PR-23 is gated on it (§4.4).

**Stated, not fixed:** a pet that never improves never re-raises in v1 (CUL-1290).

## 11. Acceptance criteria

0. **Flag-off is today:** the pipeline with the flag off never selects from the three tables and produces the byte-identical Signal over the committed corpus (non-vacuity floor; proven by deleting the gate).
1. An acknowledgement for sign A never changes sign B's state (cough/vomit pair included); a fixture with a tick on a two-sign sentence writes exactly one row.
2. `careState` is computed only in `generate-signal`'s shell inside PR-11b's pipeline; `detection.ts` and `phrasing.ts` read none of the three tables or the vet tables (`visitReaders` `MUST_STAY_CLEAN`).
3. **A care state never quiets safety:** for every escalation type (incident red flag, call-tier read, intake decline, burden card) a fixture with every concern `with_vet` renders the escalation with its ask and rank unchanged (property test over the type list).
4. A `with_vet` row renders the source sentence, a count with its window and logging, and no ask; below the coverage floor it renders the too-few line instead of a count; a zero renders only above the floor.
5. `raised_again` fires only after two evaluations ≥7 days apart; a single-day spike never re-raises (dog fixture); the row states the compared pair.
6. A booked future appointment moves `with_vet` → `recheck_booked`; a cancelled, deleted or past one does not; a worsening re-raises through a booked recheck.
7. Ask: a watched concern is neither dropped from nor placed above a raised one in the safety lead; the BRK-13 screens reject "under control" / "helping" over a `with_vet` sentence.
8. Every cached sentence for a care state is template-only, names the pet and the sign, and states the source with its date; Get ready and Ask relay it whole.
9. **The report never carries a care state, a tier, a tap, a call or a note:** a guard over `generate-report/` for the three tables and the `careState` field (the `reportLookPull` shape).
10. One follow-up per escalation: three call-tier reads of one bout produce one owed row; an answered row is never re-asked on any device; an expired row is silent.
11. The follow-up's confirmation never names a weekday; the notification body names no record fact; the category defaults off.
12. Append-only: no UPDATE or DELETE policy or grant on the three tables; `delete-account` leaves zero rows; `rls-privacy-reviewer` reports the attacks it tried.
13. The note guard reds on a `vet_calls` `note` select anywhere under `supabase/functions/` (proven by a planted violation).
14. **Lapse:** an acknowledgement given in one course never covers a later course (a January answer, stand-down, a September recurrence: born `raised`); a visit answer for a visit before the concern's onset is refused.
15. **Latch:** `raised_again` never returns to `with_vet` without an acknowledgement dated after the re-raise.
16. **Recheck:** an appointment that is not about the sign (§4.7) never produces `recheck_booked`.
17. **Zero:** with a masking drug on board inside its window, no count on the row or screen renders zero (property test over every line type).
18. **The reference never slides:** a fixture where the first qualifying window is found after the anchor stores it once, and the row discloses it.
19. `nyx-voice` over every string; the words "seen", "acknowledged", "resolved", "watching" and "stood down" appear in no owner string or a11y label this spec adds.

---

## 12. Tier-2 edits for PM approval

**(a) `docs/nyx-vet-visits-requirements.md` §7 AC 10 (v1.2 → v1.3).** Append to AC 10:

> **Amended 2026-09-XX (CUL-1139; Engines v3 AC 10 ruling, 2026-09-26):** one reader crosses the line, and only with dates and owner answers. The Signal engine's shell (`supabase/functions/generate-signal/` outside `detection.ts` and `phrasing.ts`, which stay in the guard's must-stay-clean list) may read `vet_visits.visited_at`, `vet_appointments.scheduled_at` / `cancelled_at` / `deleted_at`, and the owner's acknowledgement rows, by explicit column list, to set a finding's care state and to state a visit date on EN-10's context line. No visit, appointment or answer enters a count, a floor, a window or a test statistic: every count the care state speaks is computed from events alone, from a date the owner's answer names. Notes, reasons, clinic and vet names never leave the vet tables for an engine. The guard's allow-set gains the shell with `kinds: ['table']` and a column-list assertion.

**(b) The same spec, §5.6, last sentence,** appended: "The one engine reader is the Signal shell (AC 10 as amended), registered with its column list; `detection.ts` and `phrasing.ts` stay pinned at zero reads."

**(c) Flagged, not yet proposed as text:** `docs/nyx-signal-fold-requirements.md` gains a §5.3 row stating that a `with_vet` concern's count increases do not re-open a fold (the care state, not the fold, governs a watched concern) — relevant only while `design_v2` is off, since the fold is retired under it (CUL-1285); and `docs/nyx-notification-foundation-requirements.md` registers the `follow_ups` category (default off). Both land with PR-35/36 if the PM wants them.

---

## 13. PR plan (the project table carries the same rows)

| PR | Issue | What | Needs |
|---|---|---|---|
| 20 | CUL-1139 + CUL-1144 | This spec + mock round 3 (docs only) | PMD-4 before it lands |
| 21 | CUL-1139 + CUL-1144 | Migration: the three tables (§8), same-pet triggers, wipe list, export line, note guard | PR-20 approved · CUL-1384 (the shown log's client INSERT policy dropped) · `rls-privacy-reviewer` |
| 22 | CUL-1140 | EN-10 server lines (§5), the drug-class table stub, Ask's rule 10 in the prompt, `visitReaders` registration of the shell, the AC 10 text (§12) | PR-20 · PR-11b |
| 23 | CUL-1139 | `careState` in the pipeline (§3.3), the §4.2 test, ranking, Ask handling + fixtures, the report guard | PR-21 · PR-22 · CUL-1311 pt 2 live with its threshold recorded (§4.4) · the tolerance ruled and met on PR-16 · EN-8 live or the weight line (§4.1) |
| 35 | CUL-1139 | Client: answers on the finding and incident screens, PMD-4's question, tickable rows at the vet, the past-visit question, the rows (in `components/designV2/`) | PR-23 |
| 36 | CUL-1144 | Client: the call record, the follow-up screen and Home line, the `follow_ups` category, TD-5 | PR-35 · CUL-1313 for any account but the PM's |

This spec's Read-These row in CLAUDE.md lands with PR-21 (CLAUDE.md is at its byte ceiling; the row is paid for by a trim there).

---

## 14. Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-28 | First draft (PR-20, CUL-1139 + CUL-1144), amended the same day after the adversarial pass (§10.1). Mock round 3. |
