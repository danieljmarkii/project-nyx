# Culprit

A pet health tracker built for the owner who was just sent home from the vet with a diet trial or a "keep an eye on it." Logging takes seconds; the record turns into a clinical summary a vet can read in a minute.

Two sides, one app: **frictionless logging for owners, clinical-grade summaries for vets.** Core logging, health alerts, trends and the vet report are always free (Pets > $).

> The repo, the Supabase project and a lot of the code still say **Nyx**, the working name. The product is **Culprit**. `docs/culprit-rename-requirements.md` says which strings change and which stay.

## Stack

| Layer | What |
|---|---|
| App | Expo (managed workflow, SDK 57), React Native, TypeScript strict, Expo Router, Zustand |
| Local data | `expo-sqlite`, local-first; a sync queue pushes to Supabase (last write wins) |
| Backend | Supabase: Postgres with RLS on every table, Auth, Storage |
| Server logic | Supabase Edge Functions (Deno): the correlation engine, the vet report, AI reads |
| AI | Claude, called only from Edge Functions; the key never reaches the client |
| Widget | iOS home screen widget via `expo-widgets` and `@expo/ui` (`widgets/`) |

## Getting started

Requires **Node 22** (`.nvmrc`) and npm.

```bash
npm ci                          # lockfile is authoritative; .npmrc sets legacy-peer-deps
cp .env.example .env.local      # then fill in the Supabase URL and anon key
npx expo start -c               # -c clears Metro's cache so the env values are inlined
```

`npm ci` also points git at `.githooks/`, whose `pre-push` hook runs the type check and the test suite.

Getting a build onto a phone (Metro over a tunnel, or TestFlight) is in **[`docs/dev-handoff-runbook.md`](docs/dev-handoff-runbook.md)**. When git misbehaves: **[`docs/git-first-aid.md`](docs/git-first-aid.md)**.

## Tests and checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest: app, store, lib and guard tests
```

Edge Function tests run under Deno; the exact invocation is the `edge-functions` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

CI runs on every PR, and `main` only accepts a merge when these are green:

- **App (typecheck + jest)**
- **App (jest, non-UTC timezones)**, the same suite under UTC+14, UTC+12:45 and UTC−10, because the app's day boundary is local midnight
- **Edge Functions (deno test)**

Two more run on their own: a weekly **clock skew** job that runs the suite with the calendar moved forward, and the **engine scorecard**, which reports what a detection engine change does to alert burden without ever blocking.

`guards/` holds tests that read the source rather than run it. Each enforces one convention from `CLAUDE.md` (theme tokens, owner-facing copy, the reversal path, Home's write classes, and so on) and fails the build when it is broken.

## Deploys

- **Edge Functions deploy on merge to `main`** (`.github/workflows/edge-deploy.yml`). A function that has to wait for an app build is marked `hold` in `supabase/functions/deploy-manifest.json`. Runbook: [`docs/edge-deploy-runbook.md`](docs/edge-deploy-runbook.md).
- **Migrations** live in `supabase/migrations/` (numbered, applied in order) and always ship in a PR of their own.
- **App builds** go through EAS; see the dev handoff runbook.

## Repo map

```
app/                 screens (Expo Router)
components/          UI, grouped by surface
store/               Zustand stores
lib/                 shared logic: sync, local db, predicates, copy
hooks/               React hooks
constants/           theme tokens, event types, copy constants
widgets/             iOS widget layouts
guards/              convention guards (tests over the source)
supabase/functions/  Edge Functions (Deno)
supabase/migrations/ the canonical schema
scripts/             one-off and operational scripts
docs/                specs, research, mockups, session records
operating-kit/       the team process, extracted for reuse (inert here)
```

## How the work runs

- **[`CLAUDE.md`](CLAUDE.md)** is the rulebook: conventions, hard constraints, the design principles, the PR rules. Read it before changing code.
- **[`STATUS.md`](STATUS.md)** is a pointer card: which tracks are live and where their state lives.
- **Linear** (team Culprit) holds the backlog and every issue's status. A PR names the `CUL-NNN` it finishes, and the merge closes it.
- **`docs/sessions/`** has one record per working session: what shipped and why.
- Specs are `docs/nyx-*-requirements.md`; the "Read These" table in `CLAUDE.md` says which one governs which surface.

## Contributing

Branch off `main`, open a PR using the template, and squash merge once CI is green and the issue's QA criteria are met. Schema changes go in their own PR with the migration safety preflight from `CLAUDE.md`. Never commit `.env.local` or any secret; the secrets register in `CLAUDE.md` lists where each one lives.

## License

Proprietary. All rights reserved. No license is granted to use, copy or distribute this code.
