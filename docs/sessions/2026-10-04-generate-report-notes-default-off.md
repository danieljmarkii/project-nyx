# Out of beta PR-11b — generate-report prints Noticed notes only when asked (CUL-1548)

**Date:** 2026-10-04
**One thing:** D2 L1 — Types: a type is a promise about your own code, not about what arrives over the network · check: pending

Dispatched session (`/dispatch`, PR-11b of *Out of beta — Noticed, Design v2, History v2, the trial screen*). Shipped via #1067.

## What shipped

- `supabase/functions/generate-report/index.ts`: a new exported `parseIncludeNotes(body)` returns `true` only on an explicit boolean `true`. An absent field, `null`, `"true"`, `1` and every other shape now mean OFF. The handler starts `let includeNotes = false` and reads the option only through the helper. CUL-1548 option (a).
- `index.test.ts`: a unit test over absent, both spellings, which spelling wins, eight malformed values and the `null` fallthrough; and a source pin on the handler's wiring (the handler binds `Deno.serve` and is not exported, so the pin is stated as a source scan). Proven by three mutants, each red: the helper's old `: true` default, the handler's old `let includeNotes = true`, and an inlined `body.includeNotes ?? true` that bypasses the helper.
- Three comments that said "the server reads an absent value as ON" (`app/report.tsx`, `lib/pdf.ts`, `noticed.ts`) now say OFF, so nobody restores the old default to match them. The client field stays required.

## Decisions

- **No deploy hold.** The dispatch plan said to hold only if a shipping build omits the field. One does: the installed TestFlight binary 1.1.0 (35), 2026-07-25, predates the notes field (#830, 2026-09-11). But that build has no Noticed surface at all, so its silence means "no control was shown", and OFF is the right answer for it. Holding would keep the hole open, and the fix has to be live before 1.2.0. Every build that can show the switch sends an explicit boolean. Recorded on CUL-1548.
- **Option (b), a server-side `daily_look` allowlist check, dropped.** The flag is retired at GA (CUL-876, #1066), and the privacy reviewer confirmed generate-report reads no `daily_look` flag, so there is nothing to check against.
- The issue's product question (an owner who opted out of Noticed during the beta now finds the notes switch on) stays with the PM on CUL-1548. This PR does not touch it.

## Review

`rls-privacy-reviewer`: **PASS.** Attacks tried: a request with no `includeNotes` → off; `"true"`, `1`, `[true]`, `null` → off; a second construction of `includeLookNotes` or a public share route → only `index.ts`'s owner arm, no share route exists, and the `shared_link` arm has no notes field; a remaining `daily_look` flag read → none; the deploy order → no hold needed. Its three stale-comment findings were fixed in this PR.

## Definition of Done

- Acceptance criteria (CUL-1548 + the dispatch excerpt): absent / non-boolean `includeNotes` defaults to `false` ✓; option (b) assessed, moot at GA ✓; deploy hold assessed, none needed ✓; tests in the function's Deno suite ✓; rls-privacy-reviewer ✓. The opted-out product question is left to the PM by design.
- Anti-patterns: none introduced. No owner-facing copy changed.
- Types: `npx tsc --noEmit` clean; `deno check` on `index.ts` clean.
- Tests: generate-report Deno suite 838/838; `guards/edgeFunctionDeploy` + `guards/claudeMdBudget` green; the pre-push hook ran the full jest suite. New tests proven by three mutants.
- Secrets: none.
- Personas: Trust & Safety ✓ (rls-privacy-reviewer PASS) · Engineer ✓ (fail-closed parse, wiring pinned) · Designer N/A (no surface) · Data N/A · Dr. Chen N/A (the report's clinical content is unchanged; only the owner's own notes are gated).
- Adversarial review: not required (no clinical or statistical logic). The privacy falsification pass stands in: absent, `"true"`, `1`, `[true]`, `null` all tried and all off.
- Future self: a privacy option that fails closed and is parsed in one tested place is a pattern worth keeping.
- PM actions: none filed. The EAS OTA history check is noted on CUL-1548 as part of the residual, not a gate.

## Residual

JS bundles from #830 to #1025 (2026-09-11 to 2026-10-03) send an explicit `true` from state even when the switch was hidden. The server cannot tell that `true` from a real one, so this change cannot close it. Exposure depends on whether such a bundle ever reached binary 35 over the `production` OTA channel (runtime 1.1.0 accepts them) or ran in a dev client. Checkable only from the EAS update history (`eas update:list --branch production`); noted on CUL-1548.

## Teach

### One thing — A type is a promise about your own code, not about the network (D2, L1)
TypeScript lets code say what shape a value has, and the checker refuses to build code that breaks that promise. But the checker only sees code in this repo. A request body arrives as raw text from a phone, possibly an old app version or someone typing their own request, and nothing checked it on the way in. So the server has to treat what arrives as "unknown" and check it by hand.

**Like:** a delivery form that says "Quantity: number". The form tells your staff what to expect; it does not stop a customer from writing "lots" in the box.

**In today's work:** `supabase/functions/generate-report/index.ts:932`
`export function parseIncludeNotes(body: { includeNotes?: unknown; include_notes?: unknown }): boolean {` declares the incoming field `unknown` (could be anything), and the line after it, `return raw === true`, prints notes only when the value is literally `true`. The old code's type said `includeNotes?: boolean`, which was a hope, and it treated a missing value as yes.

**Why it matters to you as PM:** when a spec says "the app always sends X", the server still has to decide what happens when X is missing or garbled. That default is a product decision. Here it decides whether private notes print.

**Check:** An old copy of the app sends `includeNotes: "yes"` (a word, not true/false). Before today, would the notes have printed? After today?
