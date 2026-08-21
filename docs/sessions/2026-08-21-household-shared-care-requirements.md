# 2026-08-21 — Household shared care (B-292 / CUL-194): requirements + PR plan

**Mode:** DISCOVERY (spec + plan; no feature code). **Deliverable:** `docs/nyx-household-shared-care-requirements.md` v1.0 draft — the brief Discovery OQ2's 2026-07-10 deferral asked for — shipped via the session PR (draft, references CUL-194).

## What ran
1. **Research fan-out (4 passes):** ownership/RLS census over migrations 001–059; sync/local-state architecture (`lib/sync.ts`, `lib/hydration.ts`, `lib/session.ts`); capture-surface inventory (every write surface a caregiver inherits); Linear sibling context (CUL-194 comment-free; B-054/B-086/B-288/B-290/B-291/B-293/B-015 statuses).
2. **Team convening** — all lenses; one genuine conflict escalated (C1: trial/regimen lifecycle owner-only vs symmetric — Dr. Chen vs Jordan, carried in decision brief D3), one converged conflict recorded (C2: catalog scope).
3. **`rls-privacy-reviewer` at spec stage** — attacked the proposed design on paper against live migrations; findings baked into the spec's §7 and the D-briefs/PR plan.

## Load-bearing findings (full detail in the spec §2)
- The B-054 pull machinery is **writer-agnostic by design** — the single-writer assumption lives in RLS + the pet-list read, not the sync loop. ~47 policies resolve through one textually-identical predicate → a `household_pet_ids()` helper makes the swap near-mechanical.
- Four breaks the discovery didn't know: per-account catalogs (033) break caregiver joins; **no authorship column exists** on the event family; `nyx-medication-photos` is user-prefixed (fails closed cross-caregiver); **no revocation/partial-wipe path exists**.
- Migration 026 is the ratified in-repo precedent for the invite token (service-role validation, never an anon-queryable predicate).
- Context drift since 2026-07-10: B-288 unblocked (D1 carve-out), widget informational-only (B-664), B-293 canceled (PM to confirm deliberate).

## Output
- Spec with decision briefs **D1–D6** (D1 = the OQ2 ratification itself), guardrail spine G1–G7, permission matrix, and a **9-PR plan (HH-1…HH-9)** — HH-1 the gate; HH-2∥HH-3∥HH-4; three isolated schema PRs; rls-privacy-reviewer on HH-1/3/4 + re-run at HH-9.
- Outcome comment with the D-briefs posted to CUL-194 so the PM can rule from the issue.

## Not done (deliberately)
No feature code, no migrations, no Linear scope edits beyond the outcome comment — B-292 stays gated on D1.
