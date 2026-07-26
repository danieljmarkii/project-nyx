# `view-report` — deployed v1 source, archived before deletion

**Archived:** 2026-07-26 · **Backlog:** B-397 · **Origin:** hardening audit §A2

## What this is

The verbatim source of the `view-report` Edge Function as it was deployed to
production (project `aigchluqluzuhtbfllgh`, v1, created 2026-07-05,
`verify_jwt=false`, sha256 `d67756e419401dfe26c0d3c9916403dc975255ac783be852069a2e22170766a3`),
captured via the Supabase MCP `get_edge_function` before B-397 deletes it.

It is archived here because **the repo never held a copy** — `supabase/functions/`
has no `view-report` directory, so deleting the deployment destroys the only
copy that exists. This file makes an otherwise irreversible action recoverable.

## What this is NOT

**This is not deployable code and must not be re-deployed.** It is filed under
`docs/archive/` rather than `supabase/functions/` deliberately, so it cannot be
picked up by `scripts/deploy-edge.sh` or mistaken for a live source tree.

- It never had an `rls-privacy-reviewer` pass, which is mandatory for this
  surface (an unauthenticated public path to pet health artifacts).
- It predates and does not implement `docs/nyx-vet-report-requirements.md`.
- **Vet-report PR 6 rebuilds this route properly.** That spec supersedes this
  file; treat this only as evidence of what was already attempted.

## Why it was safe to delete

Verified 2026-07-26 before deletion was requested:

- `vet_reports` holds **0 rows** and **0 live tokens** — every request to this
  function resolved to the "invalid" 404 page, so it served nothing. The
  exposure was latent, not live.
- Nothing constructs a share link anywhere in the app: `share_token` /
  `shareUrl` / `share_url` return **zero** matches across `lib/`, `app/`,
  `components/`, and `supabase/functions/`.
- The only two references to the slug in the repo are prose comments
  (`supabase/migrations/026_drop_vet_reports_public_share.sql:29`,
  `supabase/functions/generate-report/index.ts:13`), both describing PR 6 as
  future work.

Worth noting for PR 6: this v1 already implements the token + expiry +
service-role single-row-lookup shape that migration 026's comment names as the
intended safe pattern, along with a strict CSP and `no-store`. That design
intent is worth carrying forward; this specific unreviewed implementation is not.

## Source

```ts
// supabase/functions/view-report/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
var REPORT_BUCKET = "nyx-vet-reports";
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isShareToken(token) {
  return UUID_RE.test(token);
}
function parseToken(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const q = u.searchParams.get("token");
  if (q && q.trim()) return q.trim();
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("view-report");
  if (idx >= 0 && idx < parts.length - 1) {
    try {
      return decodeURIComponent(parts[idx + 1]).trim();
    } catch {
      return parts[idx + 1].trim();
    }
  }
  return null;
}
async function resolveSharedReport(client, token, nowMs) {
  if (!isShareToken(token)) return { kind: "invalid" };
  const { data, error } = await client.from("vet_reports").select("storage_path, token_expires_at").eq("share_token", token).maybeSingle();
  if (error) throw new Error(`vet_reports lookup failed: ${error.message}`);
  if (!data) return { kind: "invalid" };
  const row = data;
  const expMs = Date.parse(row.token_expires_at);
  if (Number.isNaN(expMs) || expMs <= nowMs) return { kind: "expired" };
  return { kind: "ok", storagePath: row.storage_path };
}
var SECURITY_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};
function statusPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f6f7f9; color: #1a1f2b; padding: 24px; }
  .card { max-width: 420px; text-align: center; background: #fff; border: 1px solid #e4e7ec;
    border-radius: 14px; padding: 32px 28px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 15px; line-height: 1.5; color: #4a5160; margin: 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #14181f; color: #e7eaf0; }
    .card { background: #1c212b; border-color: #2b313d; }
    p { color: #a5adbb; }
  }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
function pageResponse(html, status) {
  return new Response(html, { status, headers: SECURITY_HEADERS });
}
var INVALID_PAGE = statusPage(
  "This link isn't available",
  "It may have been mistyped, or the report was removed. Ask the pet's owner to send a fresh link."
);
var EXPIRED_PAGE = statusPage(
  "This link has expired",
  "Vet-report links stay active for 30 days. Ask the pet's owner to generate a new one."
);
var ERROR_PAGE = statusPage(
  "Something went wrong",
  "We couldn't load this report right now. Please try again in a moment."
);
Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return pageResponse(INVALID_PAGE, 405);
  }
  const token = parseToken(req.url);
  if (!token) {
    return pageResponse(INVALID_PAGE, 404);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("view-report: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return pageResponse(ERROR_PAGE, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  try {
    const resolved = await resolveSharedReport(admin, token, Date.now());
    if (resolved.kind === "invalid") return pageResponse(INVALID_PAGE, 404);
    if (resolved.kind === "expired") return pageResponse(EXPIRED_PAGE, 410);
    const { data, error } = await admin.storage.from(REPORT_BUCKET).download(resolved.storagePath);
    if (error || !data) {
      console.error("view-report: artifact download failed");
      return pageResponse(ERROR_PAGE, 500);
    }
    return new Response(data, { status: 200, headers: SECURITY_HEADERS });
  } catch (err) {
    console.error("view-report error:", err instanceof Error ? err.message : String(err));
    return pageResponse(ERROR_PAGE, 500);
  }
});
export {
  isShareToken,
  parseToken,
  resolveSharedReport
};
```

## `zz-deploy-probe` (deployed v1)

Not archived separately — it is a one-line deploy smoke-test with no logic worth
keeping, reproduced here in full for completeness:

```ts
Deno.serve(() => new Response("ok"));
// second line with a real newline above
```
