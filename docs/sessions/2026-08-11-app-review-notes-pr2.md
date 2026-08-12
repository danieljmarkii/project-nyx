# App Review reviewer notes — PR 2 (`docs/app-review-notes.md`)

**Date:** 2026-08-11

B-271, PR 2 of the App Review demo-account plan (`docs/nyx-demo-account-requirements.md` §12.2, v2.1). Shipped via **#628** (draft). The doc the PM pastes into App Store Connect → App Review Information → Notes for the Culprit 1.0 submission. No code, no schema — a single new doc; rides PR 1's merged session (#627), no code dependency.

## What shipped

- **`docs/app-review-notes.md`** — built to the rebuilt §7 nine-item outline, in order: (1) the 2-sentence informational-posture opener (no "clinical-grade") · (2) the pre-confirmed-account statement · (3) the numbered 2-minute golden path · (4) the 1.4.1 AI/health posture paragraph · (5) the negatives block · (6) permissions · (7) the permanent-deletion heads-up · (8) the trimmed reachable-but-empty surfaces list · (9) contact. The doc wraps a **fenced, plain-text pasteable block** (§2) with a PM-only preamble (§1 credentials placement) and a QA/sign-off footer (§3) that are *not* pasted.

## How it holds each gate (all mechanically verified)

- **No "clinical-grade"** — the phrase (and even standalone "clinical") is absent from the reviewer-facing block; the report is described as "a PDF a vet can scan in about a minute" (§7's "vet-ready" register). This is the whole point of the rebuild: the age rating answered Medical/Treatment = *None* on informational-posture grounds, and "clinical-grade" in the notes would invite the 1.4.1 lens the rest of the submission avoids.
- **`clinical-guardrails`** — every automated read is described as escalate-only ("it may suggest keeping an eye on something or calling a vet … never tells an owner their pet is healthy or fine"; "by design it never says a pet is fine from one photo"). The word "fine" appears *only* inside the guardrail's own negation. No reassurance-on-absence anywhere.
- **`nyx-voice`** — no exclamation marks; pet named (Cooper); specific over generic (counts, "Day 19 of 42", "the last two days", "four logged feedings"); plain language ("vomiting", not "emesis").
- **ASC field limit** — the pasteable block is **3,245 / 4,000** characters (measured; the doc reports the count in §3).
- **Golden path = seeded reality** — cross-checked against the merged PR-1 seed module `scripts/demo/demoStory.ts`, not just the spec prose: venison elimination trial `TRIAL_STARTED_DAY=-18` / `TARGET=42` → **"Day 19 of 42"**; `BEEF_EXPOSURE_DAYS=[-16,-12,-8,-3]` → **four** off-diet beef exposures; **card order ② intake-dip (safety) then ① beef-correlation** per Principle 3 (safety insights lead). The vet-report entry point is the **Pet tab** (`app/(tabs)/profile.tsx` → `router.push('/report')`); Trend is on Home; Patterns is reached via "All patterns ›". The visible history tab is labeled **History** (not "Timeline") — the doc uses the on-screen label.
- **No real credentials** — the password is a placeholder minted directly in ASC (D4); the username is the public `support@getculprit.app`. Credentials are directed to the Sign-In Required fields, not the Notes text.

## The one judgment call — reachable-surfaces trimmed to two (delta from spec §7 item 8)

§7 item 8 lists **four** reachable-but-empty surfaces (widget, medication, vet-document, notifications). Per this PR's brief the doc names **widget + notifications only**. The reconciliation, verified against the shipped nav: the bottom tab bar is **Home / History / Foods / Pet** (`app/(tabs)/_layout.tsx`), so the two empty surfaces an *unguided* reviewer actually reaches are the Home-Screen widget (added from the home screen → "No pet in this slot yet") and the notifications screen (Settings → off state). Medication and vet-files are secondary surfaces buried in the Pet profile, and their designed empty states are self-explanatory — naming every empty surface invites the reviewer curiosity R-12d exists to avoid (the same reason Ask is dropped entirely). This is flagged inline in the doc (§3 "Delta from spec §7") and in the PR body as a two-line add if the PM prefers all four.

## Gates / sign-off

`nyx-voice` ✓ · `clinical-guardrails` ✓ (no reassurance) · no-"clinical-grade" check ✓ · ASC char limit ✓ (3,245/4,000) · golden path = seed ✓. Persona sign-off in the doc: Designer ✓ — Trust & Safety ✓ — Dr. Chen ✓ — QA ✓. CI green (deno test · typecheck+jest · non-UTC-timezones jest). Docs-only, so `tests: N/A` and `adversarial-review: N/A` (no clinical/statistical logic changed) per the DoD.

## PM action

Paste the §2 block into ASC → App Review Information → Notes; put `support@getculprit.app` + the ASC-minted password in the Sign-In Required fields. Optionally rule the reachable-surfaces delta above. The remaining B-271 work is the PM-gated live seed (runbook step 2+).
