---
paths:
  - "supabase/functions/**"
  - "scripts/**/*.sql"
  - "lib/utils.ts"
---
# Edge Functions and service-role queries.

Loaded when a session reads a file under these paths. Each rule keeps its guard and its pointer into `docs/engineering-lessons.md`; a guarded rule fails CI wherever its text lives. Same standing as `CLAUDE.md` (Tier 1).

- **A read capped by a setting the code CANNOT SEE earns completeness from a count (CUL-975):** PostgREST caps a bare select at `max-rows` and, with no `ORDER BY`, keeps the OLDEST rows — the vet report silently lost its newest events. A pull pages through `fetchAll`, advancing by the rows RECEIVED (sound at any ceiling), newest-first on a TOTAL key (`<time> DESC, id DESC`; no time column is unique, a non-total sort skips rows). `count: 'exact'` decides completeness, never a short page; absent ⇒ incomplete. `guards/reportPullPagination.test.ts` reds on a pull that neither pages nor is a registered cap. _(`docs/engineering-lessons.md` §C-42)_
- **A shared module's boundary is what IMPORTS it, not what its name suggests (CUL-717):** owner-facing copy never goes in `lib/utils.ts`, which three Edge Functions import; the closure is `grep -rho '\.\./\.\./\.\./lib/[a-zA-Z]*\.ts' supabase/functions`. A change inside that closure redeploys those functions on merge (CUL-1147), so client-only code moves out of it. _(full account: `docs/engineering-lessons.md` §C-26)_
- **A service-role query names its subject by id PAIRED WITH ITS OWNER (CUL-696):** on the service-role path scope as `WHERE p.id = '<uuid>' AND p.user_id = (SELECT id FROM auth.users WHERE email = '<owner>')`, written exactly once (a CTE; a preflight reads the CTE, never re-typed literals). A name match and a bare id are not ownership checks; zero rows is ambiguous and never means "empty"; scoping the subject does not scope the JOINS (CUL-736); whether to guard `scripts/*.sql` is CUL-739. _(full account: `docs/engineering-lessons.md` §C-27)_

**Edge Functions deploy on merge (CUL-1147).** Merging to `main` runs `.github/workflows/edge-deploy.yml`: it deploys every function whose shipping closure changed since its last recorded deploy (`scripts/deploy-edge.sh <fn> --deploy`), checks it (version bumped, `ACTIVE`, `verify_jwt` on, a boot smoke test), and records it as a GitHub deployment. A session never deploys and never hands the PM a deploy command; a redeploy or rollback is Actions → Deploy Edge Functions → Run workflow. **A server change that must wait for an app build (or any other gate) is marked `hold` in `supabase/functions/deploy-manifest.json` in the same PR**, and a function change never merges before the migration it needs is applied. Holds, rollback, break glass: **`docs/edge-deploy-runbook.md`**.
