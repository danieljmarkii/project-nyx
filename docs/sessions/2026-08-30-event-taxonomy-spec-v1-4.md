# 2026-08-30 — Event Taxonomy: spec v1.4, the §9b silence-on-the-sick findings closed (CUL-684)

**Mode:** DISCOVERY (a spec writing pass — the deliverable is a committed doc). No code, no schema, no build.
**Outcome:** shipped via #PR — `docs/nyx-event-taxonomy-requirements.md` v1.3 → **v1.4**; §9a rewritten, §9b deleted, D16–D19 recorded. **The W2 gate on CUL-667 is lifted.**

## What this session was for

CUL-684 was `Waiting on PM` with a single named prerequisite: rule the three decision briefs on CUL-664. Those briefs had sat un-ruled since 2026-08-27 (verified against both issues' comment trails, not assumed). So the session opened by putting them to the PM as decision briefs rather than proceeding provisionally, and added two calls a writing session should not take alone.

**All four ruled A (PM, 2026-08-30):**

1. **Briefs 1 + 2 — A/A.** Re-open the broken HR-11/12/15/19 closures as a scoped v1.4 pass, adversarially reviewed before landing; and adopt the generalised rule into §9a. → **D16**
2. **Brief 3 — A.** Short-window de-dup, over-count accepted — **plus** the confirm-flow separator Dr. Chen's batch-recall rider requires. → **D17** (which went further; see below)
3. **Multi-cat attribution — A.** Pool at the ask tier only, never the band; a "not sure which cat" affordance. → **D18**
4. **Scope — A.** Full close-out: all 15 §9b findings + the 3 sentence-items + the 11 the 2026-08-27 nine-lens review verified.

## Code claims verified before they were used

The briefs rest on claims about shipped code, and this track has already been bitten by a spec sentence that was false at the file. Checked at file:line before writing:

- `DEDUP_WINDOW_MS = 60_000` and it anchors to the cluster's **first** member (`report.ts:200`, `:959`) — §9b finding 8's `span/W` saturation holds.
- The report's collapse **does** carry an escalate-on-presence merge (severity MAX, blood/foreign unioned over `memberEventIds`, `report.ts:935–943`). The review cited `914–923`; the substance is exact, the line numbers are ~20 off. It also picks its survivor by `rank`, not by earliest — confirming two devices can disagree on "the first survivor".
- `logged_by` exists in **no** migration; `038_logged_via.sql` says in its own header that it records a capture *surface*.
- `detectGapShortening` carries three gates, not one: a strict monotone run (`:5502`), a **magnitude test** (`latestGap ≤ ratio × median`, `:5081`) and a staleness/reversal guard — the review's correction to §9b finding 3 is right. Its docstring states the run length exists to hold the *by-chance* FPR at 1/4! on i.i.d. continuous gaps, and that it is an `insight`-class lane.
- **The finding that changed a ruling:** the app already has a **shared double-submit latch** — `useSubmitGuard` (B-336) — whose contract distinguishes *committed* (stay latched) from *failed* (release, the owner must be able to retry). `SimpleEventConfirm` routes its save through it (`:105`, `:641`), as does `app/log.tsx`. A double-tap on one flow cannot mint two rows, and the guard is a primitive to reuse rather than a pattern to copy.

## The one place the ruling was executed differently from how it was written, and why

Brief 3 was ruled "short window + confirm-flow separator". Implementing it revealed the window had nothing left to do: the double-submit it guards against is already prevented at the capture surface, while the window demonstrably *costs* the batch-recall case (three quick confirm passes → three rows at `occurred_at ≈ now`, which D10 and CUL-576 make the **modal** retrospective log, collapsed to one). So **D17 deletes the time-keyed collapse entirely** rather than shortening it: duplicate prevention belongs to the capture surface, and a qualifying row is a trip. This is strictly inside the ruling's intent — over-count accepted, batch recall protected — and it removes mechanism instead of adding it. The accepted cost is stated in place: two phones over-count by one.

That mattered beyond this rule. §10 gains **3a**: the report's generic observation de-dup must not apply to the strain count either, or the report prints a different trip number than the band the owner already saw (the B-067 two-numbers class, on a safety count). Where the report collapses strain rows for display, the collapse is escalate-on-presence — any member marked unproductive wins — or a "yes" survives over a marked "no", which is rule 0's inversion arriving through the report.

## What v1.4 actually changed in §9a

**Rule 0 (D16) is the spine:** *no evidence-quality guard may gate the EXISTENCE of a response — only its wording and its tier.* Four hatches violated it, each locking out the animal the rule exists to catch. It ships with the test a future wave applies to its own closures — *is there a patient for whom this guard can never be satisfied because of the illness?* — and with the boundary silence keeps: below-floor **observed-normal** is silence and carries no claim; below-floor **unevaluable** is never silence.

- **5a**: the window reset is deleted (finding 1 — it made the band structurally unreachable for the partially-obstructed cat and inverted the rule on owner attentiveness). One fixed lookback, four counts (U/P/R/**T**), six states. The new **T** axis closes two findings at once: the covered-box household reaches a tier on trip count alone (finding 4), and the pure-pollakiuria cat gets the frequency tier rule 9 had promised and 5a had rendered as *Silence*. The ask is conditioned on `R ≥ 1` everywhere, so it never asks over two explicit Nos (finding 13). **The verdict recomputes; the evidence never does** (findings 5, 7) — a late "yes" may soften what the flag claims, never delete the episode.
- **Rule 3**: identity by **member-set intersection** with a recorded `tierShown`. Intersection is stable under add, delete, `occurred_at` edit and partial hydration — four churn triggers closed by one property (finding 10) — and a tier rise *is* the re-escalation the rule always promised but could not express (finding 6). The false "every device computes the same identity" claim is deleted rather than defended; it was never needed. The durable card's **register** decays, its presence does not (finding 14).
- **Rule 11**: an unconfirmable sleeping count now gets its **own presence-class finding** — never a widening of the sustained state, per Dr. Chen's binding constraint, or the fix corrupts the dataset §15 Q4 asks the vet to trust. The count-duration minimum gates the *number*, never the response. The derived state is monotone against calendar downgrade, `minSeparation` gets a named greedy algorithm (B-188's shape), and night/timezone semantics exist for the first time. **11(c) re-derives its borrowed parameters**: non-decreasing run + a total-rise magnitude test carrying the FPR, because on ±2/min quantized counts the run length cannot — and because *a false-negative rate cannot be inherited from an `insight`-class lane whose false negatives are free*.
- **Rule 13**: timeout, fail direction (no haptic, the beat still names the record per CUL-614, decision routes to the Signal card), and the silent-cancel path — `handleLogged`'s `!visibleRef.current` early return (`EventTypeSheet.tsx:231`) meant a scrim tap during the awaited read cancelled the band outright.
- **Rules 14, 15 are new scope, not repairs**: multi-cat attribution (D18) and multi-leaf band composition.
- **Rule 1** gains the binding statement that the Signal card is never gated by the band's marker — §9b noted the fourth exit survived only by an unstated dependency a later "consistency fix" could silently close.
- **Five binding fixtures**, each asserting a number: 15 rows at 8-minute spacing = **15** trips (not "high"); three confirm flows in 90s = **3**; a double-submit = **1**; two phones = over-count by one, *asserted as the accepted cost* (v1.3's fixture demanded absorption, contradicting the ruling it shipped beside); two cats, six unattributed trips = a household ask.

## Decisions recorded

**D16** the §9b gate closes on rule 0 · **D17** de-dup by capture surface, not by time · **D18** multi-cat pooling at the ask tier only · **D19** §9b is deleted, not annotated — a spec that accumulates dead warning blocks becomes the thing nobody reads, which is the failure mode that made the old `STATUS.md` unreadable.

## Persona / review

Adversarial pass run on the rewrite **before** it landed — the discipline whose absence created this issue in the first place. Verdict and the counterexamples attempted are in the PR body and on CUL-684.

## Not done here, deliberately

The 2026-08-27 review's other routed items are **not** in this pass and stay on their own issues: CUL-676's three engine briefs (the L4 lane inventory, the logged-day denominators, the ⑦ one-card cap), CUL-677's T&S gate on the §11 swap, the W1 greenlight riders, and the recommendation to move §9a from prose to an executable decision table + property tests once the rulings settled — which is now unblocked and is a build item, not a writing one.

— Session 2026-08-30, branch `claude/spec-v14-silence-defects-9yp3we`.
