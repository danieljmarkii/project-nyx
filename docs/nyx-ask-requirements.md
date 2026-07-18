# Ask — Requirements & Build Plan
**Version:** 2.0 — SUPERSEDES rev 1 (2026-06-13) | **Date:** 2026-07-18 | **Status:** Build-ready, pending one PM confirm (D2, §2)
**Backlog anchor:** **B-228** (promoted — next main project; absorbs **B-088**, whose tier model this version resolves) · **B-089** (the AI-ready export escape-hatch — still separate, §11)
**Session record:** divergent/convergent product-team session 2026-07-18 (PR #394) — full persona pass, UX-landscape research (`docs/research/2026-07-ask-ai-ux-landscape.md`), PM rulings D1–D7, design-mock review (`docs/ask-mockups.html`, design-locked at PM review).
**Rides:** the shipped Track-2 infra (`app_config` #347, `ai_usage`/`record_ai_usage` #348, typed `cap_reached`/`feature_disabled` contract #353) — rev 1's hard prerequisite ("B-001 must land first") is now **satisfied**.

---

## 0. Supersession record (rev 1 → v2.0)

Two independent product-team sessions — 2026-06-13 (rev 1) and 2026-07-18 (this) — converged on the same core: deterministic queries the model never computes, a **closed toolset** (never text-to-SQL), chips-first, designed deflections, an `ask` Edge Function, caps as a precondition. v2.0 keeps rev 1's guardrail spine (the G-numbers below are rev 1's, preserved) and supersedes it where the PM ruled this session:

| Rev 1 position | v2.0 (authority) |
|---|---|
| Scope locked **Tier 1 only**; Tier 2 (general/generative) deferred | **D1:** nested toggles — `ask_enabled` + `ask_general_enabled` (seeded off, Dr. Chen-gated flip). Tier 3 (clinical judgment) stays **out in-app** — unchanged, reinforced (§7 G3). |
| Architecture: Haiku intent-parse → ONE whitelisted query → Haiku phrase (single-shot, no follow-ups) | **§5:** Sonnet **plans over the closed toolset** (multi-tool, in-session follow-ups) → tools compute → phrase → `validateAnswer`. The whitelist *discipline* survives as the tool layer; the model still never computes, never authors SQL. Why: single-shot can't serve D6's ratified answer anatomy or follow-ups (the documented Fitbit failure), and multi-part questions need planning. |
| Both LLM seams Haiku 4.5 (cheapest-capable) | **Sonnet 4.6** — planning/orchestration is load-bearing reasoning (the extraction precedent). Haiku stays right for the Signal's pure phrasing; this is a different job. |
| Post-MVP fast-follow; not a current step | **D4: the next main project.** |
| Entry TBD ("not a home card, not a nav tab") | **D5: Home header "Ask" pill** — chrome, not a card; rev 1's spirit held. |
| B-001 caps = unbuilt prerequisite | **Shipped** (#348/#353). D3 sets the tiers (§9). |
| Pre-monetization | **Born-Premium** (D-M1) + D3 free teaser; the no-exclusive-escalations invariant (§7.2) reconciles Pets > $. |
| Open decisions §10 a–e | Resolved: (a) chips **+ free text** (PM, via the mock); (b) online-only v1 with the deterministic rundown as the offline/capped-safe core; (c) **no question persistence in v1** (T&S lean ratified; → B-362); (d) name still open, **vet-implication ban stands** (D7); (e) post-answer CTA = tap-throughs + the rundown→report hand-off. |

**Rev 1 rulings that stand unchanged:** the rename ruling (nothing may imply a vet answers — Dr. Chen + Lawyer, non-negotiable; "Ask" complies); Tier-3 out via deterministic deflection that *drives the wedge* (G3); no text-to-SQL ever; G5 number-parity with the Timeline; the G-guardrails (§7); B-089 as the separate export escape-hatch.

---

## 1. What this is and why

**Ask** is owner-initiated Q&A over *this pet's own logged record* — "How many times has she vomited this month?", "Which foods does she actually finish?", "What's her weight doing?", including answering a clinician's question live in the exam room. Culprit's first open-ended conversational surface, and the third rung of the deliberate LLM ladder (templated finding-phrasing → bounded gestalt reviewer [open Q] → free-form Q&A over the record).

- **The PM's own behavior is the origin signal** (both sessions): exporting the DB into external AI sessions to ask exactly these questions. That workflow is the *unsafe baseline*; Ask replaces it with a bounded, minimized, in-app path. Rev 1's framing holds: owners will layer AI onto their pet's data whether or not we help — this gets ahead of it.
- **The pet space is whitespace** (research brief §b): every pet AI on the market answers *generic* questions (52% of ChatGPT's pet-health answers tested incorrect); none answers "what does *my* pet's data say." Only Culprit's longitudinal structured log can — the data-grounded version is both the safe version and the differentiated one.
- **It is the ratified Premium flagship** (D-M1: born-Premium, no takeback) — it carries the subscription's value story.
- **It is not a chatbot.** Chat is the query language, not the destination: answer-first cards built from the app's own components, chips before keyboard, every number carrying its denominator and a tap-through to source events.
- **Wedge fit:** a *reflective* surface (evening couch; parking lot before the vet). It never competes with 10-second capture, and it is only as good as the log — which it says out loud when data is thin.

---

## 2. Decision record

| # | Decision | Ruling | Date |
|---|---|---|---|
| D1 | Question scope | **Nested toggles.** `ask_enabled` (main) + `ask_general_enabled` (sub-gate, seeded **off**). General off → pet-data questions only; else warm deflection. General on → general recommendations permitted, visibly fenced ("General guidance — not from {pet}'s record"), still never diagnostic. **Dr. Chen review gates the first flip-on** (§7.5). Supersedes rev 1's Tier-1-only lock; rev 1's Tier 3 (clinical judgment) stays out under both positions. | PM 2026-07-18 |
| D2 | LLM data boundary | **Tier 2 — whitelisted structured fields (§6). PROVISIONAL — flagged for one-word PM confirm.** Ratified-by-reaction at mock review ("really like the header tldr and descriptive text style answers"; "I think I love what we have" — the tier-2-shaped answers); recorded provisionally because it extends the prior posture (Opus-PoC §7 / rev 1: computed results only) and T&S asked for explicit ratification. Notes and photos never cross under any tier. | Provisional 2026-07-18 |
| D3 | Free tier | **Free teaser + Premium full.** Free: **3 conversations/month** (provisional number), ~10 questions each. Premium: full version (§9). Rides shipped `ai_usage`; cap-hit UX follows the ratified §16.1 rules. Pets > $ reconciliation = the **no-exclusive-escalations invariant** (§7.2), enforced under Principle 7 standing authority. | PM 2026-07-18 |
| D4 | Sequencing | **The next main project.** Leads the roadmap (Steps 9/10 keep their MVP-sequence positions). Supersedes rev 1's post-MVP placement. | PM 2026-07-18 |
| D5 | Entry point | **A — Home header "Ask" pill** (mock §1; word + quiet teal dot, 44pt). Contextual "Ask about this" = fast-follow **B-359**. **Cap-state ruling (PM catch at mock review):** the entry **never changes, disables, or badges when capped** — Home carries no monetization state (Principle 3). The capped experience lives inside the surface (§9.3), where chips still work as navigation. | PM 2026-07-18 |
| D6 | Answer anatomy | **Ratified at mock review:** Newsreader headline TLDR + descriptive supporting text + embedded real component (chart/pips/list) + denominator + provenance tap-through + follow-up chips. Locked to mock §2–§3. | PM 2026-07-18 |
| D7 | Name | **Open.** "Ask" is the working label (functional; no sparkle icon). **Standing constraint from rev 1 (Dr. Chen + Lawyer, non-negotiable): no name or copy may imply a vet answers** — "ask my vet" framing is dead. Rename is one string; decide before A5 merges. | Open |

**Inherited rulings:** D-M1 (born-Premium) · D-M7/§16.1 cap-UX rules (calm band, never error-red, no transaction word near a symptom, cap gates only the model call) · shipped B-329/B-001 infra · the two safety invariants · Principles 1/3/4/5/7 · rev 1's standing rulings (§0).

**Relationship to the two open LLM-ladder Questions** (gestalt reviewer; council-report-to-owners): this spec defines the shared substrate — the boundary (§6) and output guardrails (§7) — which those rungs inherit if built. It does not build them. (Product Owner dedup; B-228's own row anticipated this.)

---

## 3. Product definition (locked to `docs/ask-mockups.html`)

### 3.1 Entry
Home header **"Ask" pill** beside the avatar, visible iff `ask_enabled` resolves true for this account (§8). Never a card on Home; never a badge; identical when capped (D5).

### 3.2 The surface (`app/ask.tsx`)
- **Fresh state:** one line of promise ("Anything in {pet}'s record — counts, trends, foods, meds. I'll show my sources."), **suggested chips seeded from this pet's actual data** (no vomit history → no vomit chip; generated client-side, deterministic §5.4), the vet-visit rundown chip, free-text input ("Ask about {pet}…"). Pet-scoped, pet pre-selected; every answer names the pet (multi-pet: switching re-scopes).
- **Empty-record state** (designed, Principle 5): "Once a few days are logged, I'll have things to answer." + log chip.
- **Thinking:** day-ground `WhorlSpinner` (sm) + skeleton shaped like the incoming card + honest narration ("Counting from {pet}'s record…"). Reduced-motion static frame; pauses on blur. No night ground.
- **Answer card (D6):** Newsreader headline → supporting detail → the app's own component where the answer is data-shaped (calendar pips / trend sparkline / ranked list / stat tiles) → provenance row (**denominator + range**, e.g. "7 events · logging on 28 of 30 days" + **tap-through** to filtered History/Patterns) → follow-up chips. Ink-token text; accent only on interactive/trend.
- **Follow-ups:** in-session context (statelessness was Fitbit's documented failure). **No persisted transcript** — leaving the surface ends the conversation (§10). The rundown is the pinnable artifact.
- **Online-only** (a deliberate, designed exception to offline-first — an LLM answer needs the network; same class as Signal regen). Designed offline state: "Ask needs a connection — {pet}'s record is still all here." + chips degrade to navigation. The **rundown** (§3.3) is the offline-and-capped-safe core.
- **Can't-answer is a designed deflection, never an error toast** (rev 1 §7; Principle 5).

### 3.3 The vet-visit rundown (deterministic — no model call)
One tap assembles the clinician's opening answers: symptom counts w/ denominators, timing cluster, appetite rate, weight range over weigh-ins, current meds + last dose, since-last-visit changes. Built client-side from the existing aggregate layer (`lib/analytics.ts`, `lib/weight.ts`, med queries) — **works capped and offline**. Every tile taps through to its source. "Share the full vet report" hands off to the Step-9 flow; "Save for the visit" pins it. No adjectives, no verdicts — the report's register.

### 3.4 v1 question families (each backed by deterministic tools, §5.2 — rev 1's whitelist ids regrouped)
1. **Counts & frequency** — symptom counts, per-day distribution, time-of-day clustering, window comparisons (`count_symptom`, `symptom_trend`, `timeOfDay`).
2. **Recall** — last/first/specific events with whitelisted structured detail (D2), meds given, foods fed, weigh-ins (`last_symptom`, `eventRecall`, `meds`).
3. **Rates & trends** — intake rate/distribution, item-finished rates, top foods/proteins (multi-sample positive framing only), weight series, meal/treat composition (`intake_summary`, `recent_foods`, finished-rates, weight).
4. **Regimen & trial state** — current meds, adherence summary, diet-trial progress, feeding arrangement (`diet_trial_status`, `free_fed`).
5. **Engine findings relay** — what the Signal engine currently says (cached findings, verbatim register) + coverage diagnostics.
6. *(flag-gated)* **General recommendations** — fenced, non-diagnostic, grounded back into the log where possible.

**Windows** (rev 1 G-window, kept verbatim): parsed onto a bounded enum (`7d`, `14d`, `30d`, `all`, `since_trial_start`) — never an arbitrary range that could mask acute worsening. Default unstated = 7d, **and the answer states the window it used.**

---

## 4. Voice & copy
nyx-voice throughout: specific over generic; no exclamation marks; pet by name (first-person-pet, second-person-owner); warm, not cute; "I" only as the app's quiet working voice, never a named character. Draft strings live in the mock; **final strings gate on nyx-voice + Designer, and the safety-adjacent set (§7 deflections, data-gap, cap states) additionally on clinical-guardrails + Dr. Chen falsification** (A5/A7). Cap copy reuses `constants/monetizationCopy.ts`; `careFirstLine` verbatim; no transaction word near a symptom.

---

## 5. Architecture

### 5.1 Shape
**LLM plans → deterministic tools execute → LLM phrases → validator gates.** New Edge Function **`ask`** (server-side always; JWT-verified; **pet-ownership gate before any cap increment or model call**, uniform 404 on foreign/missing pet — the B-354 PR 3 pattern).

`{ pet_id, question, conversation[] }` → flag check (§8) → cap check (§9) → **Sonnet tool-loop** (bounded iterations; the model NEVER sees raw tables — only tool results from the closed set) → `validateAnswer` (§7.3) → typed 200 `{ answer, component, provenance, followups }` | `{cap_reached}` | `{feature_disabled}` (the shipped §4.5 contract shapes).

**The closed-set discipline survives from rev 1 verbatim:** the model *selects and parameterizes* tools; it never authors a query (**no text-to-SQL, ever** — injection, hallucinated columns, RLS-bypass). **Adding a tool is a spec change** — each entry needs its query, output whitelist, guardrail class, and tests before it ships (clinical-guardrails Pattern 8). A low-confidence plan fails toward `unsupported`/`ambiguous` (§5.3), **never** toward a guessed query — a wrong-query answer to a health question is the worst failure mode.

### 5.2 The tool layer (`supabase/functions/ask/tools.ts`)
Pure, deno-tested, read-only, parameterized functions — one per family (§3.4). Contracts:
- **`deleted_at IS NULL` on every event read** — hard contract + the more-deleted-than-live fixture (B-071 lesson).
- **Output fields ⊆ the D2 whitelist (§6)** — enforced at the tool return type, not by prompt.
- **Floors & denominators:** every aggregate returns its denominator (logged-days, rated-meals N); below-floor returns typed `NotEnoughData` (the `ANALYTICS_FLOORS` posture) phrased as a first-class honest answer.
- **G5 — one source of truth (Data Scientist red line, rev 1):** tools reuse/port the same counting logic as Timeline/Patterns/Signal/report. If Ask's number can disagree with the Timeline's, we've built self-contradiction about a health fact. Enforced by shared helpers where runtime allows and by **parity tests** (§13 AC-1) always.
- Free-fed pets carry the "intake not directly observed" caveat; B-010 windowed/estimated timestamps render as windows, never false-precise points (G6).
- **No write tools. Ever.**

### 5.3 Plan outcomes (rev 1's four-way contract, kept)
The planner resolves every question to exactly one of: **(1)** tool plan → answer; **(2)** **`clinical_judgment`** → the deterministic Tier-3 deflection (§7 G3) — detected and deflected, never answered; **(3)** **`unsupported`** → honest "I can't answer that from {pet}'s record" + what CAN be asked (chips); **(4)** **`ambiguous`** → a clarifying chip (which pet / which symptom / which window), **never a guessed answer**.

### 5.4 Model & client-side deterministic pieces
- **Sonnet 4.6** (config-overridable, S3). System prompt encodes voice, the deflection taxonomy, never-diagnose/never-reassure, numbers-only-from-tools, the general-mode fence. The question is untrusted input: read-only owner-scoped tools mean injection can at worst produce a bad *sentence*, never a bad *action* — and the validator gates the sentence.
- **The model never does arithmetic** — every numeral must appear in a tool result (`validateAnswer` enforces ⊆).
- **Client-side, no model:** suggested chips (from local SQLite, data-aware), the rundown (§3.3), component rendering — the server returns a typed descriptor (`{kind: 'pips'|'spark'|'ranked'|'tiles', data}`), the client renders with existing components. The server never returns markup.

---

## 6. The D2 boundary — what crosses to the model (PROVISIONAL, pending PM confirm)

**Tier 2: computed results + whitelisted structured fields**, enforced in tool return types (A3). The privacy-policy sentence stays simple and true: *"your structured logging data — never your notes or photos."*

| Domain | MAY cross (via tool results) | NEVER crosses |
|---|---|---|
| Events | `event_type`, `occurred_at` (+ B-010 confidence/window), severity value | `notes` (free text), attachment/photo paths, EXIF anything |
| Vomit observations | structured enums only: color, consistency, `blood_present`, `foreign_material_present` (the owner-editable fields — override-aware source per the B-340 guardrail; never the stale `visual_flags` cache) | photo bytes/URLs, AI-read free prose |
| Meals | food/brand name (catalog string), `food_type`, `intake_rating`, canonicalized protein, paired-dose link presence | `ingredients_notes` (unstructured), photo paths |
| Medications | drug name, dose amount/unit, route, adherence value, regimen active/dates, `is_critical` | free-text instructions/notes |
| Weight | `weight_kg`, measured-at | — |
| Trials & feeding | trial food/start/target/progress, feeding arrangement (free-fed flag) | — |
| Engine | cached `ai_signals` findings payloads (already-minimized), coverage diagnostics | raw event dumps "for context" |
| Pet | name, species, breed, age (honest precision), sex | owner identity beyond auth |

Plus, unavoidably: **the owner's question text** (crosses by definition; Anthropic is already a disclosed processor — one policy line added at A5).

**If the PM rules tier 1 instead:** Recall's descriptive fields collapse to counts/dates; everything else stands. One-table change.

---

## 7. Safety specification (rev 1's G-spine, kept and extended)

### 7.1 The two invariants, mapped
- **Intake ≠ preference (G7):** preference answers only from N-sample finished-rates, positive framing; decline/refusal routes to the calm health-flag register; **"picky" is a banned token** (validator-enforced).
- **n=1 never reassures (G2):** recall answers are *factual recounts of what the owner logged*, never wellness verdicts. A 0/low count is **"nothing logged," never "she's well"** (absence ≠ wellness — the hepatic-lipidosis case). Weight trends are descriptive ranges — never "healthy/stable" (migration 024's carried note).

### 7.2 No exclusive escalations (the Pets > $ reconciliation — Principle 7, team-enforced)
Ask can only **relay** safety findings the deterministic engine already fired — free on Signal/alerts/report by construction. Ask never mints an escalation and never reassures; if a safety finding is live for the asked-about domain, **its card leads the answer**; if the engine is silent, Ask is silent about wellness. Gating Ask therefore never gates care.
**G4 — rising-count safety handoff (rev 1, kept concrete):** when a count/trend tool reveals worsening it reuses detector ④'s shared `isWorsening` predicate — so Ask and the Signal **cannot disagree about "worsening"** — and the answer carries the safety register, never a bare number that lets the owner infer "fine."

### 7.3 `validateAnswer` (the output gate; G8 — validation is a test assertion, not a comment)
Rejects → one re-phrase → deterministic template fallback (an answer is never blank or unguarded): exclamation marks; reassurance lexicon (`REASSURANCE_RE` reuse — "fine," "nothing to worry," "healthy," "normal for her"); diagnosis assertions; causal claims beyond engine findings (`CAUSAL_RE` posture); "picky"/fussy-verdict tokens; **any numeral not present in a tool result**; missing denominator on aggregate claims; missing stated window.

### 7.4 Deflection taxonomy (designed, warm — never an error; G1/G3)
1. **Diagnosis-shaped / interpretive** ("does she have IBD?", "is that a lot?", "should I worry?") → **G1: never interpret** — "That's one for her vet — a diagnosis needs an exam and bloodwork, not just a log." + line-up-the-evidence offer + rundown chip. **G3:** the deflection *drives the wedge* (report/rundown), it never dead-ends.
2. **Reassurance-fishing** ("so she's fine, right?") → "Her record can't rule that out — it only shows what's been seen." + facts w/ denominators + trust-your-gut escalation line.
3. **General (flag off)** → "I stick to what {pet}'s record shows — feeding advice is her vet's call." + redirect into the relevant log slice.
4. **Data-gap** → "Only N meals were logged last week — not enough to read appetite from. I'd rather tell you that than guess." + log chip.
5. **Notes/photos** → "I can't read your notes — here's the event." + tap-through.
6. **Out-of-scope / unsupported** → honest + chips (never a guessed answer); **ambiguous** → clarifying chip.

### 7.5 General mode (`ask_general_enabled`)
Fenced card ("GENERAL GUIDANCE — not from {pet}'s record"), non-diagnostic, vet-referral line, grounded back into the log where possible; same validator. **Gate before first production flip-on:** Dr. Chen review of the general-mode prompt + a general-question eval set; sycophancy posture reviewed (the GPT-4o medication episode is the named hazard class). Toxic-food/emergency basics are scoped at that review, not in v1 data-mode.

### 7.6 Function beats disclaimers (the Whoop-FDA lesson)
The rails are structural — validator, relay-only escalation, read-only tools, deterministic fallbacks, the four-way plan contract. The standing "informational, not veterinary advice" line (B-270 surface) is carried but is **not** the mechanism. Rev 1's Lawyer ruling stands: no vet implication anywhere in name or copy (D7).

---

## 8. Flags & rollout — the experimental-flag primitive

**The allowlist convention** (the PM's feature-toggle bet, generalized; zero schema): an `app_config` value MAY be `{"enabled": bool, "allowlist": ["<user-uuid>", …]}`. Resolution: `enabled=true` → on for everyone; else on iff caller ∈ allowlist. Plain-bool values keep working (back-compat with all six existing keys). Implemented once — client (`lib/appConfig.ts` + `useAppConfig`) and server (shared resolve util) — reusable for every future experiment.

**Seeded keys (A1):** `ask_enabled = {"enabled": false, "allowlist": []}` · `ask_general_enabled = {"enabled": false, "allowlist": []}`. Both **fail-closed** on config-unreachable (a missing experiment is hidden, not broken — the pill simply doesn't render).

**Rollout:** A4+A5 live → add the PM's uid to the allowlist (recorded config change, in-session via MCP) → PM dogfoods → iterate → general-mode flip per §7.5 when wanted → **Track-3 wires the Premium gate** (entitlement-aware caps; the B-263 paywall bullet already names Ask). Born-Premium means no free-to-all moment ever precedes entitlements.

---

## 9. Caps & monetization (D3)

### 9.1 Grains (rides shipped `ai_usage` unchanged — two function keys, zero schema)
- **`ask_conversation`** — incremented at conversation start; the **monthly** free-tier grain (`month_count` is already returned by `record_ai_usage`).
- **`ask_message`** — per model call; daily abuse backstop + per-conversation bound (~10) enforced in-function.

### 9.2 Numbers (provisional — code-default `CAPS` constant, overridable via `app_config.ai_caps`; ratified finally at Track-3 like D-M7)
| Tier | Conversations | Messages | Notes |
|---|---|---|---|
| Free (post-Track-3) | **3/month** | 10/conversation · 30/day backstop | The teaser; cap-hit = the upgrade moment |
| Experiment (allowlist) | uncapped | 40/day backstop | PM dogfood; single-user cost ≈ dollars/mo |
| Premium (future) | uncapped | 50/day (D-M7 "hardest-throttled" placeholder) | Sized finally at Track-3 |

### 9.3 Cap-hit UX (mock §6; §16.1 rules carried)
Calm accent-light band, never error-red; reset date named; `careFirstLine` verbatim; the meter appears from the **second** conversation of the month as one quiet ink-tertiary line; a symptom-shaped attempted question drops the Premium sentence entirely; **chips degrade to pure navigation** (the cap gates only the model call — Ask stays useful capped; the rundown always works). Entry pill unchanged (D5).

---

## 10. Privacy & T&S posture
- **No new persistence in v1** — no transcripts, no query log, no memories (rev 1 §10c lean, now ratified for v1). Nothing new to delete/export/disclose beyond the request itself; B-039/B-041 untouched. Future telemetry/query log = its own T&S-gated decision → **B-362**.
- **Boundary:** §6 whitelist; notes/photos never cross; general mode adds no pet data.
- **Policy touchpoint:** one line covering conversational questions in the AI section at A5 (Anthropic + usage metering already disclosed).
- **Caps identity:** `record_ai_usage` derives caller from `auth.uid()` — unforgeable (shipped T2-2 property).
- **Injection posture:** free text in, read-only closed toolset, validator out (§5.4); injection fixtures in the eval set (§13).
- `rls-privacy-reviewer` **mandatory at A4** (new service-role read surface + the boundary's enforcement point).

---

## 11. Non-goals v1 → where they live
Contextual "Ask about this" entries → **B-359** · voice input → **B-360** · pinned/saved answers beyond the rundown → **B-361** · ask telemetry/query log → **B-362** · **the AI-ready export "context pack" → B-089 (unchanged — still the Tier-3 escape-hatch, extends B-041 + Step 9)** · proactive anything (Signal owns proactivity — permanent posture) · write tools (permanent) · streaming (S1) · persisted threads/memories · rev 1's Tier 3 in-app (never — deflected, G3).

---

## 12. PR-by-PR build plan

Two independent chains after A1–A2: **server** (A3→A4) and **client** (A5; **A6 has no server dependency at all** — parallel-safe as a separate session/branch against A3/A4). STATUS.md at wrap is the expected shared-file collision. A4 deploy: mind the B-225 bundle-size ceiling (`scripts/deploy-edge.sh ask`, sha/byte read-back before live).

| PR | Scope | Gates |
|---|---|---|
| **A1** | Migration (next-numbered) `_ask_config.sql` — seed the two flag keys (allowlist shape), `ON CONFLICT DO NOTHING`; additive; rollback = `DELETE` the keys. Apply live via MCP + `get_advisors`. Own PR (migration isolation). | Pre-flight; Dir. of Eng |
| **A2** | The allowlist primitive — client decode in `lib/appConfig.ts`/`useAppConfig` (plain-bool back-compat; Ask keys fail-closed; malformed-value fallbacks) + the server resolve util `ask` will reuse. Unit-tested. | code-reviewer; Engineer |
| **A3** | `supabase/functions/ask/tools.ts` — the deterministic tool layer (§5.2): whitelist-typed outputs, floors/denominators, window enum + stated-window, `deleted_at` contract, free-fed caveat, G5 parity helpers. Deno-tested incl. deleted-heavy fixture. No deploy. | code-reviewer; Data Scientist (G5) |
| **A4** | The `ask` Edge Function (§5): ownership gate → flag/cap checks → Sonnet tool-loop → `validateAnswer` → deflection templates → typed 200s; general-mode path (flag-gated). Golden + adversarial deno fixtures (§13). Deploy (new fn, `verify_jwt=true` — safe pre-client). Secrets Register: add `ask` to the `ANTHROPIC_API_KEY` row. | **adversarial-reviewer MANDATORY**; **rls-privacy-reviewer MANDATORY**; code-reviewer |
| **A5** | Client surface: `app/ask.tsx` states (§3.2) + `components/ask/*` (typed component-descriptor renderer over existing pips/Sparkline/ranked rows), Home header pill (D5), suggested-chips generator, cap/disabled/offline/empty states, meter, policy line. | code-reviewer; nyx-voice; Designer; Jordan+Sam; **pm-feature-review**; QA state matrix |
| **A6** | The vet-visit rundown (§3.3) — client-only, deterministic, per-tile tap-throughs, report hand-off. **Parallel-safe with A3/A4.** | code-reviewer; Dr. Chen (content); pm-feature-review |
| **A7** | Copy & safety hardening: final-strings pass (nyx-voice + clinical-guardrails + **Dr. Chen falsification with named counterexamples**), eval-set expansion, the §7.5 general-mode review package (the flip-on gate). | Dr. Chen; clinical-guardrails; nyx-voice |

**Then:** allowlist the PM (recorded config change) → dogfood loop → Track-3 entitlement wiring (existing T3 plan; Ask cap differentiation + paywall bullet land there).

### Kickoff prompts (one session each; paste-ready)

> **A1:** Read `docs/nyx-ask-requirements.md` (§8, §12 A1). Build the Ask config-seed migration: next-numbered `_ask_config.sql` seeding `ask_enabled` and `ask_general_enabled` as `{"enabled": false, "allowlist": []}`, `ON CONFLICT DO NOTHING`, own PR with the Migration Safety Pre-flight, applied live via the Supabase MCP + `get_advisors`. Ship-dark: both off.

> **A2:** Read `docs/nyx-ask-requirements.md` (§8, §12 A2). Build the allowlist flag primitive: extend `lib/appConfig.ts` + `hooks/useAppConfig` to resolve `{"enabled", "allowlist"}` values (plain-bool keys unchanged; Ask keys fail-closed), plus the server-side resolve util the `ask` function will reuse. Unit-test both, including malformed-value fallbacks.

> **A3:** Read `docs/nyx-ask-requirements.md` (§5.2, §6, §12 A3). Build `supabase/functions/ask/tools.ts`: read-only deterministic tools with whitelist-typed outputs, floors + denominators, the bounded window enum (answers state their window), `deleted_at IS NULL` everywhere, the free-fed caveat, and G5 parity with the client aggregate layer. Deno tests per tool including the more-deleted-than-live fixture. Pure layer only — no I/O shell.

> **A4:** Read `docs/nyx-ask-requirements.md` (§5, §7, §9, §12 A4). Build the `ask` Edge Function on A3's tools: ownership gate before any cap increment, flag + cap checks (`ask_conversation`/`ask_message`), the Sonnet tool-loop with the four-way plan contract, `validateAnswer`, the §7.4 deflection templates, typed 200 bodies, and the flag-gated general-mode path. adversarial-reviewer and rls-privacy-reviewer are mandatory. Deploy per `docs/edge-deploy-runbook.md` (watch B-225 size). Update the Secrets Register row.

> **A5:** Read `docs/nyx-ask-requirements.md` (§3, §4, §9.3, §12 A5) + `docs/ask-mockups.html`. Build the Ask client surface: `app/ask.tsx` states (fresh/thinking/answer/capped/offline/empty-record), the component-descriptor renderer over existing chart components, the Home header pill (never changes when capped), suggested chips from local data, and the meter. Run pm-feature-review before calling it done.

> **A6 (parallel-safe):** Read `docs/nyx-ask-requirements.md` (§3.3, §12 A6) + mock §7. Build the deterministic vet-visit rundown, client-only from the existing aggregate libs, with per-tile tap-throughs and the vet-report share hand-off. No model call; works offline and capped.

> **A7:** Read `docs/nyx-ask-requirements.md` (§4, §7, §12 A7). Final copy + safety pass across every Ask string with nyx-voice, clinical-guardrails, and Dr. Chen falsification (named counterexamples: reassurance-fishing; the clear-foam-not-eaten-36h cat asked "is she fine?"; the declining-intake cat asked about "preferences"). Assemble the §7.5 general-mode review package; general stays off until the PM flips it.

---

## 13. QA, acceptance criteria & eval (rev 1 §9 folded in)

**AC (each must pass before "done"):**
1. **G5 parity:** `count_symptom`-family answers return the **same number** as the History/Timeline filter for the same window (shared/ported helpers + parity test).
2. A 0-count answer contains **no** reassurance/wellness vocabulary (G2; regex test).
3. An interpretive question is planned `clinical_judgment` → the deflection, never number-plus-opinion (G1/G3).
4. A rising count carries the safety register via detector ④'s shared predicate — Ask and Signal cannot disagree (G4).
5. Intake decline uses safety framing, **never "picky"** (G7; regex test).
6. A question about a pet the caller doesn't own → uniform 404, no cap burn (ownership gate).
7. Out-of-toolset → `unsupported` deflection; ambiguous → clarifying chip; **never a guessed answer**.
8. `window`-confidence events render as windows (G6); every aggregate states its window and denominator.
9. Every numeral in a rendered answer traces to a tool result (validator tests + fixture assertions).
10. Cap-hit mid-conversation: calm band, chips degrade to navigation, symptom-shaped question drops the Premium sentence.

**Eval fixtures:** golden set (the chips ARE the seed) × {rich, thin, empty, deleted-heavy, free-fed, multi-pet, windowed-timestamp}; adversarial set (reassurance-fishing, diagnosis-shaped, injection-shaped "ignore your instructions…", cap-at-symptom); LLM-down path (template fallback still answers, still guarded). **State matrix (A5):** flag off / allowlisted / capped / offline / empty record / second pet. On-device: PM dogfood via allowlist IS the acceptance environment.

## 14. Build-time sub-decisions (not PM-blocking)
S1 streaming vs single-shot (lean: single-shot + skeleton) · S2 in-session context depth (lean: last ~6 turns) · S3 model id via config (lean: yes) · S4 server shared-util placement for the flag resolver (esbuild bundling constraint) · S5 rundown entry when `ask_enabled` is off (lean: Ask-internal v1; revisit with B-359).

## 15. Persona sign-off (2026-07-18 session)
Sr. PM ✓ (D1–D6 ruled; D2 provisional; mock loved) · Designer ✓ (answer-first anatomy, entry chrome, deflection-as-feature; mock design-locked) · Dir. of Eng ✓ (closed toolset, online-only exception, infra reuse, B-225 flag) · Data Scientist ✓ (G5 red line kept; floors/denominators; no-arithmetic) · Dr. Chen ✓ conditional (deflections + never-reassure structural; general-mode flip gated on her review; falsification due at A4/A7) · Jordan ✓ (chips-first; log-more honesty) · Sam ✓ (preference framing; fussy-vs-sick relay; pet-scoping) · T&S ✓ conditional (D2 explicit confirm requested; no-persistence v1; rls-privacy at A4) · QA ✓ (AC list; state matrix; eval fixtures) · Product Owner ✓ (B-088 absorbed into B-228; rev-1 supersession recorded; the missed-doc grounding gap logged in the session summary).
