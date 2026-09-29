# Guards

A guard is a test that fails the build when a rule that must never regress is broken. In the predecessor project, rules enforced by prose fired approximately never; 40 guards had zero recorded misses. When a rule matters, it becomes a guard.

## Files in the kit
| File | What it is | Install as |
|---|---|---|
| `claudeMdBudget.test.ts.template` | Byte ratchet on CLAUDE.md: regrowth reds, and a trim that leaves the ceiling stale reds too | `guards/claudeMdBudget.test.ts`, with `CEILING_BYTES` set to the installed file's `wc -c` and `{{PRODUCT}}` filled |
| `fixtureRoot.ts.template` | Helper that puts detector fixtures OUTSIDE the scanned tree, with provenance-checked teardown | `guards/fixtureRoot.ts` once the first scanning guard exists |
| `blankComments.ts.template` | Single-pass, line-preserving comment blanker for source scans | `guards/blankComments.ts` once the first scanning guard exists |

These are TypeScript / Jest. For another stack, port the logic; the rules below are stack-independent.

## The discipline (engineering-lessons Tier C, condensed)
1. **Prove it by mutation.** Run the guard red against the pre-fix tree. Break the protected source one defect at a time and watch it red. Check the mutant actually applied and changed behaviour.
2. **Assert non-vacuity first.** Any equality verdict first asserts both sides are non-empty. Derive the expected set from the repository, never from the constant under test.
3. **Exemptions are inline and per site:** `// <guard>-ok: <reason>` within 10 lines above the site. A registry of files is an exemption list; never register a file to record that you thought about it.
4. **Fixtures live outside the scanned tree**; scanners take a REQUIRED root parameter.
5. **Blank comments and strings before scanning**, line-preservingly, in one pass (`blankComments`).
6. **No `.*` in a detector pattern.** Slice the object under test and anchor the match.
7. **State the guard's blind spots in the guard file.** An undocumented blind spot reads as coverage.
8. **Never fix a red guard by raising its ceiling, adding a file-wide exemption, or weakening the check** without saying so in the PR.
