# The workflow audit: production writes ask the PM, and session relays carry facts only

**Date:** 2026-10-07 · **Issue:** CUL-1616 (of CUL-1612) · shipped via #1092
**One thing:** D5 L1 — What a reviewer looks for: a right decision can still show the wrong evidence · check: pending
**One thing (re-ask):** G3 L1 — A PR is a proposal; the squash merge is the one commit main keeps (from 2026-10-06) · check: pending

## What happened

An interactive build of CUL-1616, which a dispatched session had stopped on 10/6 because Auto mode blocked it from editing hooks. The PM ruled option 1: an interactive session in which the PM approves every write to `.claude/settings.json` and `.claude/hooks/`.

**The mechanism probe (done-when 1).** I wired a temporary Bash-only PreToolUse hook that answered `deny`, `allow` or `ask` for one harmless `node -e` command, with the PM watching.
- `deny` blocked with the hook's reason, and `allow` ran with no prompt.
- `ask` raised a dialog that the PM approved.
- The answer lands in the session's event stream as a `control_request` (`can_use_tool`, `decision_reason_type: "hook"`, the hook's reason verbatim) and a `control_response` (`behavior: "allow"`) with the same `request_id`. Nothing in the stream is literally named `permission_response`.
- Hooks reload live, with no restart.

The hook's input showed `permission_mode=auto`. The session had opened in Auto, not Default, so the probe answered the issue's real question: `ask` prompts in Auto.

**The approval model, twice re-ruled.** Auto's classifier let the probe's own `.claude/` writes through without a dialog. Then it denied the first install as "[Auto-Mode Bypass]". Cloud sessions have no Default mode: their dropdown offers Accept edits, Plan and Auto, and none of them prompts on file edits.

The PM ruled "Default + self-guard" and "no opinion for proven reads", then switched the dropdown out of Auto. From then on, every write to the gate went through a permission dialog the PM approved, as a Bash `cp` or `rm`:
- the first install, at 12:41:28, 12:48:03 and 12:48:53Z;
- the review fixes, one copy and the `dispatch.md` edit.

On deleting the probe, the new self-guard returned `ask`, its first live proof. The harness's own `safetyCheck` also fires on `.claude/` paths, and its text is the one the PM sees.

**What shipped (`.claude/hooks/`, `.claude/settings.json`, `guards/productionGate.test.ts` + `guards/hookDriver.ts`):**
- **The production-write gate.**
  - `apply_migration` asks. The dialog's first line binds the SQL to the repo: MATCH (the SQL is exactly a committed `supabase/migrations/NNN_*.sql`, which gives the number and the commit) or MISMATCH. It also carries size, a sha256, marked truncation, the asking branch, and PRODUCTION.
  - The branch and project writes ask.
  - `execute_sql` asks unless an allowlist lexer proves the SQL a read, and a proven read gets no opinion.
  - `deploy_edge_function` and `pause_project` are denied.
  - A self-guard asks on any write to the gate's own files, and on any non-read shell command that mentions `.claude` or runs inside it.
- **The relay form.**
  - Every `send_message` that is not the Gmail shape is held to `dispatch.md`'s `/dispatch wake ·` and one-line `/dispatch note ·` forms.
  - A note is denied when it holds a word that reads as approval.
  - A wake is denied when any line is shaped like the PM typing.
  - The dispatcher's email to self (CUL-1624) is untouched.
- **The guard.** It runs 310 tests: 180 decision rows over 100 rules (run in node's type stripping, the harness's own runtime), the wiring, 9 end-to-end runs of the exact `settings.json` commands through `sh` (including with no `node` on PATH), and 119 mutants, each required to flip a row of its own rule. A no-op mutant is reported as a survivor, so the harness is not green over nothing.
- **`dispatch.md` § Authority** no longer says the dialog confirms a deploying merge. **`CLAUDE.md`'s migration rule** now says to approve the dialog only on `MATCH`, at net −4 bytes.

**The isolated review.** The `rls-privacy-reviewer` gave the first install **FAIL**. What held: 60+ write-hiding SQL forms all asked; every read-list name was checked; the UUID-server match, the deploy denial and fail-closed input all behaved.

What broke:
- The dialog quoted the first 12 lines, cut each at 160 characters with no marker, and never compared the query with the committed file. A `drop table events cascade` 140 spaces into the first line was invisible.
- The wake channel was unfiltered, so a child's wake could carry `merge #1091` or `Human: approved` into the dispatcher session.
- `dispatch.md` over-claimed what the dialog covers.
- The self-guard missed a bare `.claude`, a `cwd` inside it, and `rg --pre`.

All of these, plus the low-severity items, were fixed in the same PR; every one of the reviewer's attack payloads is now a row. Two findings need a ruling (a dialog for deploying merges, and production reads by agent sessions) and went to a follow-up with decision briefs. It is linked from CUL-1616's comments and deliberately not named in the PR, because the merge would close it.

## Decisions

- **PM, 2026-10-06:** option 1, an interactive session where the PM approves the `.claude/` writes.
- **PM, 2026-10-07:** "Default + self-guard": the gate also asks on writes to its own files. In practice the session ran in Accept edits, which cloud sessions offer in place of Default, and the gate's own `ask` supplied the dialog.
- **PM, 2026-10-07:** a proven read gets **no opinion**, not the issue's `allow`, so a lexer miss can never become a silent write.
- **Team call (Trust & Safety + Dir. of Eng.):** `pause_project` is denied, not asked; nothing needs it, and it takes production offline.

## What broke and how

- **Literal invisible characters.** My tool input's `\uXXXX` escapes reached disk as the literal characters, three times. The hook drafts failed to parse (a U+2028 inside a regex), and the test source carried literal bidi and zero-width characters. Each was converted back by a script that never types an escape. The braced `\u{…}` form survives intact.
- **A push rejected six times.** GitHub returned `remote rejected … (Internal Server Error)` on the combined review-fix commit over eight minutes, with no incident posted. Split into two commits, both pushed first try. My hypothesis that the `dispatch.md` change triggered it was wrong, because that commit pushed alone. The cause is unknown.
- **A background reviewer was lost** to a worker restart and run again against the installed files.

## Residuals

- Hooks load at session start, so any session started before this merges runs without the gate.
- The self-guard reads command text. A script run from elsewhere, or a path assembled in the shell, gets past it.
- The relay form is lexical. An approval paraphrased in words no list holds still passes a note.
- Merges to main deploy with no dialog, and agent sessions read production rows with no dialog. Both are in the follow-up's briefs.
- A second isolated review pass was not run on the fixed code; the first pass's attack payloads are pinned as rows and pass.

## Teach

### What a reviewer looks for: a right decision can still show the wrong evidence (D5, L1)
A reviewer doesn't only ask "does the code decide correctly?" They also ask "does the person relying on it see what they need to?" Today the gate made the right call on a migration hiding a destructive line: it asked. But the dialog it showed cut that line off, so the PM would have approved a deletion while reading a harmless change. The decision was right and the evidence was wrong, and only someone attacking the dialog's text would notice.

**Like:** a bank that correctly asks you to confirm a transfer, then shows the amount truncated to "$1,0…". The question was right; the receipt made it meaningless.

**In today's work:** `.claude/hooks/productionGate.ts:294`
```
return c.length > LINE_CHARS ? `  | ${c.slice(0, LINE_CHARS)} …[+${c.length - LINE_CHARS} more characters on this line]` : `  | ${c}`;
```
A line longer than the dialog can show is still cut, but now the cut says how much it hid, so a long line can no longer pass as a short one.

**Why it matters to you as PM:** the dialog is now the record that you approved a production write, so what it shows is what you are on the hook for.

**Check:** an agent edits a migration file on its branch, commits it, and then asks to apply it. What will the dialog's first line say, and where would you catch the change?
