# B-397 — orphaned `view-report` + `zz-deploy-probe` Edge Functions

**Date:** 2026-07-26

## Outcome

**Pre-flight complete; the deletion itself is blocked on the PM.** The Supabase
MCP has no tool to delete an Edge Function, so the one action B-397 actually
asks for cannot be performed from a cloud session. Everything that *could* be
done was: both orphans confirmed live, zero-impact deletion re-verified against
production data, and the deployed source archived so the deletion is
recoverable.

Backlog row B-397 stays **Open** with the finding recorded. It was not marked
Done — the functions are still deployed.

## The blocker

`docs/edge-deploy-runbook.md` establishes that backend deploys run from the
cloud session via the Supabase MCP with no PM action item (B-082). **Deletion is
the exception, and nothing had noticed.** The MCP's Edge Function surface is:

- `deploy_edge_function` (create or new version)
- `get_edge_function` (read source)
- `list_edge_functions` (enumerate)

There is no delete. Every other route is closed too:

- The runbook documents no deletion procedure (`grep delete\|remove` → only
  unrelated `deno bundle` / `npm install` / `delete-account` hits).
- No `SUPABASE_ACCESS_TOKEN` in the session environment.
- The Supabase CLI is not installed (`npx supabase` resolves 2.109.1, but
  `functions delete` needs a PAT).
- The Management API `DELETE /v1/projects/{ref}/functions/{slug}` needs the same
  PAT. CLAUDE.md's Secrets Register flags `nyx-cli-deploy` for revocation and
  states a PAT never lives in the repo.

So B-397 is genuinely dashboard-only. That is worth knowing in general, not just
here: the "no more paste-this-into-the-dashboard hand-offs" guarantee covers
deploys and migrations, but **not** teardown.

I deliberately did not work around this. Deploying a 404 stub over `view-report`
would close the latent exposure without the PM, but it leaves the orphan listed
(not what the row asks), mints a phantom v2, and writes unreviewed code to a
production public path — an outward-facing change beyond the ask.

## Verified before-state

`list_edge_functions` → **10 deployed**, against 8 source dirs in
`supabase/functions/`. The two extras are exactly the orphans:

| slug | version | `verify_jwt` | created | in repo? |
|---|---|---|---|---|
| `view-report` | 1 | **`false`** | 2026-07-05 | **no** |
| `zz-deploy-probe` | 1 | `true` | 2026-07-07 | **no** |

## Zero-impact deletion — re-confirmed against live data

The audit asserted this; it now has evidence.

- **`vet_reports` holds 0 rows and 0 live tokens.** So `view-report`'s
  `resolveSharedReport` returns `invalid` for every possible token and the
  function serves nothing but its 404 page. The exposure is **latent, not
  live** — which lowers the urgency but not the requirement, since the first
  `vet_reports` row PR 6 mints would arm it.
- **Nothing constructs a share link.** `share_token` / `shareUrl` / `share_url`
  return **zero** matches across `lib/`, `app/`, `components/`, and
  `supabase/functions/`.
- **Only two repo references to the slug exist, both prose:**
  `supabase/migrations/026_drop_vet_reports_public_share.sql:29` and
  `supabase/functions/generate-report/index.ts:13` — each naming PR 6 as future
  work.

## Archived the source first

`docs/archive/view-report-deployed-v1.md` now holds the verbatim deployed source
of both functions. The repo had **no** copy of `view-report`, so deleting the
deployment would have destroyed the only one that exists.

Filed under `docs/archive/` rather than `supabase/functions/` on purpose: it must
not be picked up by `scripts/deploy-edge.sh` or read as a live source tree. The
file says so at the top — it never had the mandatory `rls-privacy-reviewer` pass
and PR 6's spec supersedes it.

One thing worth carrying into PR 6: the deployed v1 already implements the
token + expiry + service-role single-row-lookup shape that migration 026's
comment names as the *intended safe pattern*, plus a strict CSP and `no-store`.
The design intent is sound; the unreviewed implementation is what goes.

## PM action item

- [ ] **Supabase Dashboard → Edge Functions → delete `view-report` and
      `zz-deploy-probe`** — the only step that closes B-397, and the only one a
      cloud session cannot do. Verify with `list_edge_functions`: it should
      return **8** functions, matching `supabase/functions/`.

## Files touched

- `docs/archive/view-report-deployed-v1.md` (new) — deployed source, archived
- `docs/backlog.md` — B-397 row updated with the blocker + pre-flight evidence
- `docs/sessions/2026-07-26-b397-orphaned-edge-functions.md` (new) — this record

No app code, no schema, no Edge Function deploys. Shipped via #TBD.
