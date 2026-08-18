# Extraction/AI Edge Functions — bounded request timeout on every Claude `fetch` (CUL-258 / B-130)

**Date:** 2026-08-18

Shipped via **#674** (draft). BUILD. Server-only (Edge Functions) + one shared util + tests. No schema, no migration, no client change, no redeploy.

## The problem

Every Anthropic `fetch` in `supabase/functions/` was unbounded — no `AbortController`, no timeout — so a hung upstream held the Edge Function open to Supabase's wall-clock ceiling. Low urgency (one image + one tool call responds well under 30s), but the clean, uniform fix is a 20–30s abort per call.

## Sanity check first (PM asked)

Confirmed before building: **(1) Linear** — CUL-258 is open (`completedAt: null`, no linked PR, no comments; it flipped Todo→In Progress today only as the auto-transition from starting work). **(2) Code** — zero `AbortController`/`setTimeout`/`signal:` anywhere in `supabase/functions/` (every grep hit was a `snap.signalment` false positive). Genuinely open, genuinely unfixed.

## Scope decision (Dir. of Eng — PM deferred)

The issue's description had drifted since it was filed (2026-06-19). It named three functions (`extract-medication-from-photo`, `extract-food-from-photo`, `analyze-vomit`), but the real inventory today is **six call sites across five files**:

- `_shared/incident-analysis.ts` — `analyze-vomit` no longer has its own `fetch`; since B-247 it routes through this shared module, **shared with `analyze-stool`**, so one fix covers both.
- `extract-food-from-photo`, `extract-medication-from-photo` — as named.
- `ask` (tool-loop) and `generate-signal` (phrasing + summary) — additional un-timed Anthropic callers the issue didn't name.

`generate-report` correctly out of scope (deterministic render, no Anthropic call). Call = **fix all six via one shared helper** — the issue's own "applied uniformly," and leaving `ask`/`generate-signal` un-timed would just mean reopening these files next month.

## What shipped

- **New `supabase/functions/_shared/http.ts`** — `fetchWithTimeout(url, init, timeoutMs = 30_000, fetchImpl = fetch)` using `AbortController` + `setTimeout` + `finally clearTimeout`; on abort it rejects with a legible `"…timed out after 30000ms"`. Exports `ANTHROPIC_FETCH_TIMEOUT_MS = 30_000`. `fetchImpl` is injectable for tests only; production callers pass just `(url, init)`.
- **New `_shared/http.test.ts`** — happy path (+ timer-cleanup proven by Deno's op-leak sanitizer), timeout, the **no-`"Claude API error 400"` substring** fail-safe contract, and non-abort network-error passthrough.
- **Wired the six sites** — mechanical `fetch(` → `fetchWithTimeout(`; the options object becomes the 2nd arg, so 30s default and real `fetch` apply. One import added per file.

## The fail-safe (the one clinically-adjacent surface)

`incident-analysis.ts`'s vision-call catch degrades to a benign `photoUnreadable` read **only** when the error message contains `"Claude API error 400"` (a permanently-unreadable image), and **re-throws everything else** as a transient failure → outer catch → `status:'failed'` row + 500 + retry CTA. The timeout error deliberately carries no `"400"` substring, so a hung upstream lands on the re-throw path — never a reassuring n=1 read. Every other site already degraded safely: `ask` → `llm_unavailable` deflection, `generate-signal` → deterministic template, extract-* → existing outer catch.

**Adversarial falsification tried (and held):** could a timeout produce a reassuring/benign read? (a) route to `photoUnreadable`? No — no `"400"` match, so it re-throws; and `photoUnreadable` copy is honest anyway. (b) drop the contextual escalation? On the throw path it isn't written — but that's *identical to today's* network-error path, and in fact strictly better: today a hung upstream is killed by the platform at ~150s with **no** `failed` row; now it fails cleanly at 30s with a retry affordance. No new hole; the cap-path escalation guarantee is untouched. This is infrastructure (a timeout wrapper), not clinical logic, so the isolated `adversarial-reviewer` subagent wasn't strictly mandated — but the contract is test-pinned.

## Out-of-scope discovery (filed, not folded in)

- **`ask` cumulative wall-clock** — `ask` is a tool *loop* (`MAX_TOOL_ITERATIONS = 5`), so a per-call 30s timeout bounds each hang but not the worst-case 5×30s total. Per-call is the issue's actual concern ("a hung upstream holds the function open") and fully addressed; a cumulative deadline threaded through the loop is a distinct, larger change → filed as its own CUL issue.

## DoD

- AC (CUL-258): all six Anthropic `fetch` sites carry a 20–30s `AbortController` timeout (30s), applied uniformly via one shared helper — **pass**.
- Fail-safe on the clinical `analyze-*` path (no reassuring read on timeout) — **pass** (test-pinned + adversarial falsification held).
- Types: `deno test` type-checks `supabase/functions/` (the only type check over this Deno-only path; app `tsconfig` excludes it) — **pass**. App `tsc`/jest/copy-guard all exclude `supabase/functions/` → provably unaffected.
- Tests: **1366/0** deno (full Edge Functions suite, incl. 5 new `http.test.ts` cases). App jest **N/A** — diff is confined to the Deno-only path jest ignores.
- Anti-patterns: none introduced (theme tokens N/A — backend; no RLS/Storage/sync change; no owner-facing copy — the timeout error is a server log/`error` column string, outside the copy-guard's scan roots and following the existing raw-message pattern).
- Secrets: none new (reuses `ANTHROPIC_API_KEY`).
- Persona sign-off: **Dir. of Eng ✓** (scope + shared-helper design, no-magic/DRY) — **Data/Dr. Chen ✓** (fail-safe: timeout can't mint a reassuring read; falsification stated) — Designer N/A — T&S N/A.
- Future-self (new pattern — a shared `_shared/http.ts`): yes — a single timeout wrapper is where a next upstream-caller should route too; low risk, injectable-for-test is a standard pattern.

## Deploy (PM step, not in this PR)

Code only — nothing redeployed here. Redeploying the six functions (`extract-food`, `extract-medication`, `analyze-vomit`, `analyze-stool`, `ask`, `generate-signal`) is a separate step that respects existing holds. **Unrelated to the B-494 `generate-report` hold** (`generate-report` doesn't call Anthropic); `generate-signal` rides its own already-pending redeploy. Note both `analyze-vomit` and `analyze-stool` must be redeployed to pick up the shared-module change.
