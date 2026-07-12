# VC Financial Projections — Modeling Session Kickoff

*Kickoff prompt — paste the body below into a fresh session. Scope set with the PM (2026-07-12): build the financial model + investor-discussion prep for a seed-stage VC conversation, at an assumed **$4.99/mo premium price with a free tier**. This prompt is the kickoff, not the deliverable — the deliverable is `docs/nyx-financial-model-v1_0.md`.*

---

You are acting as a **startup finance expert and consultant** (think: a fractional CFO who has taken consumer-subscription companies through seed and Series A) preparing the Nyx/Culprit PM for a **financial projection discussion with a VC**. You also have the full Nyx product team available as lenses, but this session leads with the finance lens — the product personas review, they don't drive.

**This session is MODELING + NARRATIVE PREP, not build.** No app code, no schema, no migrations. The single primary deliverable is one document, **`docs/nyx-financial-model-v1_0.md`**, plus its supporting model table(s). Everything must be defensible in a live conversation with a skeptical investor — every number either traces to a cited source in the repo's research docs or is explicitly labeled `ASSUMPTION` with a stated rationale and a sensitivity range.

---

## The outcome this session hangs from

A VC meeting has two failure modes: numbers that are obviously made up (hockey stick with no driver), and numbers so conservative there's no venture case. The outcome to produce: **a bottom-up model the PM can defend line by line, wrapped in a narrative that makes the venture case honestly** — and a one-page list of the 5 hardest questions a VC will ask about it, each with a prepared answer.

---

## Phase 0 — Orient (read before modeling anything)

**Must-read:**
- `docs/nyx-research-v1_0.md` — the evidence base. Market size ($158B US pet industry, 95M pet households), the clinical wedge (1.9–2.6M dogs in active chronic GI management; 43–65M annual "tracking directive" visit-instances), compliance data, personas. **Note its own flag:** the wedge triangulation is explicitly marked "not investor-grade — answer with primary data before investor conversations." Carry that caveat into the model verbatim; do not launder a triangulated estimate into a TAM slide.
- `docs/nyx-competitive-landscape-v1_0.md` + `docs/nyx-competitive-landscape-refresh-2026-06.md` — competitor pricing and funding comps: PokiPaw $2.99/mo, Tractive $5/mo+ (hardware), Maven Pet ($10.5M raised, hardware), PetDesk ($50M+, vet-side). The Whistle shutdown data point matters for the "why software-only" narrative.
- `CLAUDE.md` — the **Pets > $ constraint (Principle 7)**: core logging, health alerts, trend visibility, and vet report export are **always free**; premium wraps convenience, never care. This is a *constitutional* constraint on the revenue model, not a knob. Also read the Open Questions table rows on the **freemium gate** (narrowed 2026-07-06; B-263) — the actual paywall contents are undecided and the current mock ships placeholder bullets (themes / widgets / priority support).
- `docs/backlog.md` — B-263 (freemium-gate reconciliation), B-047/B-016 (retention + analytics instrumentation: the model's future ground truth), B-086 (multi-pet ships free — do not monetize it in the model).
- `STATUS.md` — current build phase, so the model's launch-timing assumptions match reality (pre-launch, Step 9/10 in progress, TestFlight live).
- `docs/nyx-vet-report-requirements.md` §1–2 (skim) — the vet report is the wedge's payoff and the free tier's anchor feature; the model's retention story leans on it.

**Robustness check:** if any must-read is missing, stop and flag it per CLAUDE.md — do not invent its contents.

---

## Workstream A — Market sizing (bottom-up only)  *(PRIORITY 1)*

Build TAM → SAM → SOM **bottom-up from the wedge**, not top-down from the $158B industry number (use that only as context). The funnel the research supports:

1. US pet households → households with a dog or cat with an active skin/GI/chronic condition
2. → annual visit-instances where a tracking/diet-trial directive is plausible (43–65M, **triangulated — flag it**)
3. → downloads (research uses an illustrative 5% conversion on the referral pool; treat as `ASSUMPTION`, range it)
4. → activated owners (complete onboarding + first week of logging)
5. → retained MAU (the research names week-6 retention as THE risk — model a realistic decay curve, not flat retention)
6. → paying subscribers

Every arrow gets a named conversion rate with a source or an `ASSUMPTION` tag and a low/base/high value.

## Workstream B — Unit economics at $4.99/mo  *(PRIORITY 1)*

- **Net ARPU:** $4.99/mo through Apple/Google (model the App Store Small Business Program 15% cut while <$1M revenue, 30% after; consider an annual plan at ~$39.99 and its mix effect).
- **Free→paid conversion:** benchmark consumer-subscription freemium (typically 2–5%), then **adjust DOWN for Pets > $** — the free tier deliberately includes the care features that drive retention, and the current premium placeholders (B-263) have weak willingness-to-pay. Be honest that this is the model's most fragile number; sensitivity-table it.
- **Variable COGS per MAU:** Supabase (DB/storage/Edge Functions), Anthropic API (Sonnet 4.6 food extraction — fires once per food; Haiku 4.5 signal phrasing behind a 24h cache; per-incident analyze reads), EAS. Estimate per-active-user monthly cost with stated call-volume assumptions; free users carry real AI COGS — model it, since Pets > $ means the free tier is not zero-marginal-cost.
- **Gross margin** on paid and blended (paid revenue vs. all-user COGS).
- **CAC by channel:** organic/ASO, paid social, and the **vet passive-distribution channel (QR on discharge sheets) at near-zero CAC** — this is the venture story; model its ramp explicitly (it activates only after owner-side PMF, per the research's Calm-model sequencing).
- **Churn → LTV**, LTV:CAC per channel, payback period.

## Workstream C — The projection  *(PRIORITY 1)*

Monthly cohort model, **48 months**, three scenarios (conservative / base / upside — each scenario is a coherent set of assumptions, not ±20% on everything):

- Cohorted acquisition by channel, retention decay per cohort, free→paid conversion with a time-to-convert lag
- Revenue (MRR/ARR), COGS, gross profit
- Opex ramp: founder/team hiring plan, tooling, marketing spend consistent with the CAC assumptions
- Burn, cumulative cash, and **the raise:** how much to raise now, what runway it buys, and which Series-A-ready milestones it funds (e.g., N retained MAU, vet-flywheel evidence, conversion ≥ X%)

## Workstream D — Sensitivity + the hard questions  *(PRIORITY 2)*

- Tornado/sensitivity table on the load-bearing assumptions: free→paid conversion, month-3 retention, vet-channel ramp timing, CAC.
- **The 5 hardest VC questions with prepared answers.** At minimum cover: (1) "Your free tier includes everything that matters — why will anyone pay?" (the honest answer routes through B-263 and convenience-premium comps); (2) "Your TAM slide rests on a triangulated estimate your own research doc calls not investor-grade"; (3) "What happens when Maven ships a no-hardware logging mode?" (12–18 month window per the competitive doc); (4) "Consumer pet apps are a graveyard — why is retention different here?" (the clinical directive + vet report payoff); (5) "Why $4.99 and not $9.99, or usage-based?"
- Pricing sensitivity: what the model looks like at $2.99 / $4.99 / $7.99, and whether the answer argues for revisiting the price before the meeting.

## Workstream E — Deliverable assembly  *(PRIORITY 2)*

Write **`docs/nyx-financial-model-v1_0.md`**: assumptions register (every `ASSUMPTION` tagged with owner + how to validate it), the funnel, unit economics, the three 48-month scenarios as tables, sensitivity, the raise ask, the 5 hard Q&As, and an Open Questions section that is *decidable* (the PM can pick an option, not "explore more"). If useful, also emit the cohort math as a CSV the PM can drop into a spreadsheet, and a one-page investor-facing summary the PM can rehearse from.

---

## Guardrails

- **Honesty over polish.** Flag every triangulated or assumed number. A VC discovering one laundered assumption discredits the whole model.
- **Pets > $ is not negotiable in any scenario** — no scenario may paywall care features to hit a revenue number. If the model can't work within the constraint, *that finding is the deliverable* — surface it as a PM decision, don't quietly bend the constraint.
- **B-263 is upstream of the conversion assumption.** The paywall contents are undecided; the model must state which premium feature set each conversion scenario presumes, and flag that deciding B-263 is a pre-VC-meeting action item.
- **No silent persona-conflict resolution** — if the finance lens and Pets > $ collide, use the Persona Conflict Protocol.
- This is a Tier-2-adjacent artifact: the model doc is new (no PM confirmation needed to create it), but do not edit the research or competitive docs — propose edits per the Documentation Update Protocol.

**Done-definition:** the assumptions register is complete and sourced/tagged; all three scenarios reconcile (cohort math sums); the raise ask names its milestones; the 5 hard questions have answers the PM could read aloud; Open Questions are decidable.
