# The analyze pair — `analyze-vomit` v12, `analyze-stool` v5

**Date:** 2026-09-15

Continuation of `2026-09-15-generate-report-deploy.md`, after that session's `/wrap` and merge. Same day, same session, separate record because the first one is already on `main` and a merged session file should not be rewritten.

## How this one started

The PM confirmed the report now shows cough, then asked the obvious follow-up nobody had asked: **are any other Edge Functions stale?**

Five were owed and one must never be deployed. Worth having asked.

## What the ledger scan found

| Function | Live | Verdict |
|---|---|---|
| `analyze-vomit` | v11 | owed, unblocked, safety-relevant |
| `analyze-stool` | v4 | owed, unblocked, second in a load-bearing order |
| `ask` | v6 | owed, but A8 requires the analyze pair first |
| `generate-signal` | v34 | blocked on an A-Native build carrying #798 (CUL-794) |
| `extract-food-from-photo` | v18 | CUL-258 only, low priority |
| `extract-medication-from-photo` | v5 | CUL-258 only, low priority |
| `delete-account` | v8 | **deliberate hold — deploying it would 401 every account deletion** |

`delete-account` is the one to keep flagged. It now fails closed with `reauth_required` when a request carries no password, and the shipped client sends none, so deploying ahead of a client build carrying that field is an Apple 5.1.1(v) erasure regression.

## The deploy

`analyze-vomit` then `analyze-stool`, the CUL-557 order, which is the A8 ordering gate rather than a preference.

**The upload was handed back to the Codespace rather than run inline, and that was a judgement call worth recording.** CUL-557 explicitly sanctions the MCP inline path for this pair, and at 35 KB and 37 KB they are within it. But `scripts/deploy-edge.sh`'s own note puts the inline ceiling at "a few tens of KB" — these sit exactly on it — and the inline path requires an agent to reproduce the bundle byte for byte. On a function whose output is a clinical read shown to an owner, a transcription slip inside a prompt string or a threshold would pass `node --check`, pass the boot smoke test, and change the read silently. One saved minute was not worth that class of risk, so the byte-exact path won. The concern was raised, not imposed: the PM was offered the inline route and chose the commands.

Deployed from `main` @ `bc3f3410`. 97 and 93 deno tests green; 35115 bytes / 735 lines and 37284 / 754, both matching the counts computed here beforehand.

## Verification, and one thing that looks like a defect

Both: version bump (11 → 12, 4 → 5), `ACTIVE`, `verify_jwt` preserved `true`.

Smoke tests went two levels deep rather than one. A malformed body returns `{"error":"event_id required"}` HTTP 400; a well-formed request carrying an anon JWT returns `{"error":"Unauthorized"}` HTTP 401, which is the `getUser()` caller gate; unauthenticated is 401. No `WORKER_ERROR` anywhere, so each function booted, parsed, and reached its auth gate. The first smoke attempt used `eventId` instead of `event_id` and only proved the 400 path — worth re-running with the real parameter, because the shallower version would have been green over a function that could not reach its own pipeline.

**`analyze-vomit` was read back in full** (`get_edge_function`, the runbook's strongest check). At 35 KB the source fits back through a session context, so unlike `generate-report`'s 490 KB this was a real check rather than a stated gap. The deployed v12 contains `buildFailureWrite` with its `worth_a_call` → `error-only` branch, the `existingReadFailed` fail-closed, the catch-block re-read, `existingRealAnalysis`, the no-reassure system prompt and monitor copy, `selectDescription`'s `worth_a_call` gate, and `fetchWithTimeout`.

**`analyze-stool` was not read back, and its ledger entry says so.** The CUL-812 fix lives entirely in `_shared/incident-analysis.ts`, which both functions inline and which was read back verbatim from `analyze-vomit`; what is unverified is the stool-specific descriptor, prompt and copy, covered instead by its 93 tests and `node --check`. Stating the blind spot rather than letting the entry read as full coverage is the C-38 rule applied to a ledger instead of a guard.

**The thing that looks wrong and is not:** `ezbr_sha256` did not move across either deploy, while the version and `updated_at` both did. `generate-report`'s *did* move on its deploy the same day, which is what made this look like a failed upload. It is not a currency signal in either direction — the version bump plus the read-back are what prove a deploy, and both entries now say so in as many words. Separately, the six functions showing an `updated_at` of 2026-09-13 00:04 with no version bump were a platform-side metadata touch, not a deploy; reading that as currency would have hidden exactly the staleness this scan was looking for.

## What the pair actually released

CUL-812 / CUL-539 is the one that mattered. On the pre-deploy code the outer catch could upsert `status: 'failed'` over a row already holding a `worth_a_call`, and the cap branch could write `'capped'` over exactly the rows the client renders as escalations — an escalation the owner had already been shown could be erased by a later failure or a cap. Also now live: the #671 no-reassure gate, which CUL-557 named as still inert on the live functions, and CUL-258's 30s Anthropic fetch timeout.

## Residual

`ask` is next and now unblocked by the ordering gate. `generate-signal` still waits on the build (CUL-794). The extract pair can ride any later train. `delete-account` stays held.

Shipped via #851.
