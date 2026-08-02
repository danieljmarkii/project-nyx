# `delete-account` redeploy — ship the #558 purge-scope hardening live

**Date:** 2026-08-02

## What this session did

Redeployed the `delete-account` Edge Function from merged `main`, making the
B-463 + B-582 purge-scope hardening (merged in **#558**, commit `d5ffafa`)
actually **live**. For an Edge Function, merge ≠ deployed — #558 landed the
source, but the live function was still on the pre-#558 version until this
deploy. Both backlog rows now carry a "Deployed live 2026-08-02" confirmation
so the merge-vs-live gap is closed in the record.

Deploy path followed `docs/edge-deploy-runbook.md` Part 1 (MCP path — no
Supabase access token in this environment, so `scripts/deploy-edge.sh --deploy`
was unavailable and the MCP `deploy_edge_function` fallback was the route).

## Steps

1. **Confirmed source == merged `main`.** Branch HEAD and `origin/main` are both
   `d5ffafa` (#558); `git diff origin/main..HEAD -- supabase/functions/delete-account/`
   was empty. So bundling from the working tree is bundling merged main.
2. **Bundled** with `scripts/deploy-edge.sh delete-account` (build-only). The
   function's `deno test` suite ran **fully offline and passed (73 passed)**;
   esbuild inlined the local `./plan.ts` and tree-shook to a self-contained
   **11,682-byte / 251-line** ESM file; `node --check` passed; no escaping `../`
   import survived. **sha256 `3f766a52011df405cbcfbaee345a851a2daac7d81567f92a520615622247553c`.**
3. **Deployed** via Supabase MCP `deploy_edge_function` (project
   `aigchluqluzuhtbfllgh`, entrypoint `index.ts`, **`verify_jwt: true` preserved**
   — the function's existing setting, and all project functions are `true`).
   Version bumped **7 → 8**, `status: ACTIVE`.
4. **Verified:**
   - `list_edge_functions` / deploy response: version **8**, ACTIVE, `verify_jwt: true`.
   - **Read-back fidelity:** `get_edge_function` source is **byte-identical** to the
     verified bundle (`diff` clean) and re-hashes to the **same sha256**
     `3f766a52…47553c`. Exact merged-main bytes, zero transport corruption.
   - **Boot smoke-tests (live):**
     - POST, no auth → **HTTP 401** (verify_jwt gateway enforced).
     - GET, valid anon JWT → **405** `{"error":"Method not allowed"}` — proves the
       worker **booted and ran function code**, not a `WORKER_ERROR` boot crash.
     - POST, valid anon JWT → **401** `{"error":"Unauthorized"}` — ran the env +
       auth guard and correctly refused; the anon token carries no user, so the
       confused-deputy guard (identity from the verified token only) stops it well
       before any collection or deletion. **No real account was touched** — the
       only safe deep smoke-test for this function, since getting past the auth
       check requires a real user JWT, which would delete that user.

## Transport note (for the next person who deploys this via MCP)

The bundle is **not** pure ASCII: 7 comment lines carry em-dashes/ellipses as raw
UTF-8. `scripts/deploy-edge.sh`'s `--charset=ascii` only escapes non-ASCII in
string literals/identifiers, **not comments**, so those 7 chars ride through the
MCP hop as raw UTF-8 — the same class of bytes the runbook's 2026-07-03
`generate-report` mojibake incident was about. This deploy sidestepped it by
authoring the MCP `content` with JSON `—` / `…` escapes (pure ASCII in
transit, decoding to the exact codepoints), and the byte-identical read-back
sha confirms nothing was mangled. Harmless either way — they're inside `//`
comments — but worth knowing the ascii-charset guard has this hole.

## Outcome

Live: `delete-account` **v8**, ACTIVE, `verify_jwt: true`, read-back-sha-verified,
boot smoke-test clean. B-463 + B-582 hardening is now in effect on the live
service-role purge. Shipped via #558 (deploy documented here + on the two backlog
rows). No app/source change this session — deploy + record only.
