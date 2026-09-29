# Dev handoff runbook

The exact commands the PM runs to see a pushed change, per runtime. `/handoff` and `/wrap` paste from here verbatim; nobody restates commands from memory (stale remembered commands were the predecessor project's most common handoff failure).

## One-time setup
```bash
git config --global pull.ff only
```
Makes every pull fast-forward or fail loudly, so the "divergent branches" prompt never appears.

## Runtime A: {{RUNTIME_A_NAME}}  <!-- e.g. "local dev server", "preview deploy", "device build" -->
```bash
git fetch origin
git checkout <branch-from-the-handoff>
git pull --ff-only
{{RUNTIME_A_COMMANDS}}
```

## Runtime B: {{RUNTIME_B_NAME}}  <!-- delete if there is only one -->

## Current build state
{{WHAT_IS_INSTALLED_OR_DEPLOYED_AND_KNOWN_TRAPS}}

## When git misbehaves
`docs/git-first-aid.md`, keyed by the literal error message.
