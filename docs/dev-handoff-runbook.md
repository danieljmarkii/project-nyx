# Dev Handoff Runbook

The exact, copy-pasteable command scripts the PM runs to get the latest code onto their phone after a push. Extracted from `CLAUDE.md` (which keeps the *rules* — when to use which runtime, the npm-test / migration / Edge-Function deploy reminders, and the Manual QA Script format). Read this file when emitting a Dev Handoff and paste the block for the runtime that matches the session.

There are **two runtimes**, and they map to two *different intentions*:

- **Runtime B (Metro + tunnel) is the per-push default** — it's how the PM tests a single pushed PR on-device for a one-off look. Emit this after a normal feature push.
- **Runtime A (`eas update` OTA → TestFlight) is a deliberate, separate "cut a new build" session** — the PM kicks it off **by hand, in its own session**, when changes are significant enough to warrant a new TestFlight version. It is **not** the handoff after every push.

Pick the one that matches the session's intention and emit only that block. **Default to Runtime B** unless the session's explicit goal is cutting a TestFlight build. (Runtime A went live 2026-06-07 — Apple enrollment + first TestFlight build are done, so `eas update` now reaches the build OTA; see `STATUS.md` → Runtime in Use.)

---

## Runtime A — OTA update to the TestFlight build (via `eas update`)

⚠️ **Not the per-push default.** This is the *deliberate* path the PM runs **by hand, in its own session**, when changes are significant enough to push a new version to TestFlight. For testing a single pushed PR, use Runtime B below.

The app is published as a JS bundle to Expo's CDN on the `preview` channel; the installed TestFlight build picks it up OTA on next cold open (matching channel + `runtimeVersion`). Live since 2026-06-07 (Apple enrollment + first TestFlight build done). No Codespace tunnel required for the PM to use the app — only to publish a new version.

**Sequence (run when the session's goal is cutting a new TestFlight version):**

```bash
git fetch origin <branch-name>
git checkout <branch-name>
git pull --ff-only
```
Gets the latest commits, **switches you onto the branch we just pushed to**, and fast-forwards it so the bundle you publish matches what was just built. The `git checkout` is the step that's easy to skip: if you're sitting on a *different* branch (e.g. a previous session's `claude/...` branch) and run a bare `git pull origin <branch-name>`, git tries to **merge** that branch into your current one — and if the two have diverged it stops with `fatal: Need to specify how to reconcile divergent branches`. Switching onto the branch first avoids that entirely. `--ff-only` then fast-forwards or fails loudly, never silently creating a merge commit.

> **One-time fix that kills the "divergent branches" prompt for good** — run this once per Codespace (or with `--global`): `git config --global pull.ff only`. After that, any stray `git pull` fast-forwards or fails fast instead of dropping you into the merge-vs-rebase chooser. And if you ever see that prompt again, the answer is **never** "pick merge or rebase" — it's: you're on the wrong branch. Run `git checkout <the branch named in the handoff>` and re-run. The PM consumes these `claude/...` branches read-only (Claude is the only one committing to them), so there is never a real divergence to reconcile — only a wrong-branch mistake to undo.

```bash
eas update --branch preview --message "<one-line description of change>"
```
Compiles the current JS bundle and uploads it to Expo's CDN on the `preview` channel. The installed **TestFlight build** picks it up on next cold open (it must match the build's channel + `runtimeVersion`). Note: EAS cloud builds inline env from the `eas.json` `env` block, not `.env.local` (which is gitignored and never seen by the cloud builder) — see the Secrets Register.

Then on your phone: **fully close the Nyx TestFlight app** (swipe it away from app switcher) and reopen it. It fetches the new bundle on launch. A warm reload is not enough — the bundle is cached and only refetched on cold open.

**One-time setup (first session only, then never again):**

```bash
npm install -g eas-cli
eas login
eas init                          # links the project, writes extra.eas.projectId into app.json
eas update:configure              # adds expo-updates runtime + updates.url to app.json
```
After this runs, commit any changes `eas` made to `app.json` and push. From then on, the PM only needs the two-command default sequence above.

---

## Runtime B — Active development (Metro + tunnel) — today's daily driver

Use this when iterating on a feature and you need hot reload. This is the daily driver until Runtime A is unblocked.

```bash
git fetch origin <branch-name>
git checkout <branch-name>
git pull --ff-only
```
Gets the latest commits and **switches you onto the handoff branch** before fast-forwarding — same reason as Runtime A: a bare `git pull origin <branch-name>` from a different branch triggers `fatal: Need to specify how to reconcile divergent branches`. Checkout first, then `--ff-only`. (See the Runtime A note above for the one-time `git config --global pull.ff only` fix.)

```bash
./node_modules/@expo/ngrok-bin-linux-x64/ngrok authtoken <your-token>
```
Authenticates the bundled ngrok binary — required once per Codespace session because the token is not persisted across container restarts.

```bash
npx expo start --tunnel
```
Starts Metro and opens a public ngrok tunnel so Expo Go on your phone can reach the dev server. Scan the QR code with the phone camera to open it.

Then press **`r`** in the Expo terminal to reload the app on your device after a pull. Hot reload picks up most JS edits automatically.

---

## Always, before pushing and in the handoff

**Before pushing**, if the diff touches a store, Edge Function, or shared utility, run:
```bash
npm test
```
Confirms automated tests pass locally. Do not push a chunk-completing PR with failing or skipped tests — fix or mark `tests: N/A` in the DoD with the Engineer's exemption rationale.

**When a Supabase migration is included in the push**, add to the handoff:
> Run `supabase/migrations/<filename>.sql` in the Supabase SQL Editor (dashboard → SQL Editor → New query → paste → Run). This applies the schema change to the live database — migrations are not run automatically.

**When an Edge Function is included**, add both deploy paths and let the PM pick:
> **Option A (CLI, preferred):** `supabase functions deploy <function-name>` in the Codespace terminal. Requires one-time `supabase login` + `supabase link --project-ref aigchluqluzuhtbfllgh` setup; the Supabase CLI is not yet installed in the Codespace as of v1.18.
> **Option B (dashboard paste, current default):** Supabase Dashboard → Edge Functions → `<function-name>` → paste the contents of `supabase/functions/<function-name>/index.ts` into the editor → Deploy. Used because Supabase CLI install in Codespaces has been flaky for the PM. Track Supabase CLI install as a one-time setup task in the next session that touches Edge Functions.

---

## Manual QA Script (required, every push)

After the command sequence, emit a numbered on-device QA script the PM can run in under 3 minutes. The script must:

- Start from a known state (e.g. "open Expo Go, reload with `r`")
- List the specific taps and inputs to exercise the change (golden path first, then 1–2 edge cases)
- Tell the PM **what to expect** at each step, so they can spot regressions without reading code
- Tie back to acceptance criteria for the current build step — call out which criterion each check verifies
- Flag any check the PM cannot perform on-device (e.g. "verify in Supabase dashboard that `events.synced=1`")

Format:

```
### Manual QA — <feature>
1. <action> → <expected> (AC: <criterion ref>)
2. <action> → <expected>
3. Edge case: <action> → <expected>
```

If the change is backend-only (Edge Function, migration, schema), the QA script is the curl/SQL/dashboard steps to verify it instead — same numbered format.
