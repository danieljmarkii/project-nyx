---
paths:
  - "app/**"
  - "components/**"
  - "constants/**"
  - "lib/**"
  - "supabase/functions/**"
---
# Owner-facing copy: the copy guard and the voice re-pass. Voice itself is the `nyx-voice` skill.

Loaded when a session reads a file under these paths. Each rule keeps its guard and its pointer into `docs/engineering-lessons.md`; a guarded rule fails CI wherever its text lives. Same standing as `CLAUDE.md` (Tier 1).

- **Owner-facing copy is guarded, not just reviewed (CUL-445, CUL-651):** `guards/ownerFacingCopy.test.ts` fails the build when a display sink reads a string off an error (one local hop followed; a helper function is a known limit), when rendered owner copy carries a `!`, when error copy uses an untranslated clinical term, or when a STORED error field (`ai_extraction_error`, `syncError`, `last_error`) reaches a sink. Map through an `authErrorCopy`-style mapper; exemption `// copy-guard-ok: <reason>`. When a fix makes a hidden state visible, follow the CONTROL that widening exposes, not just the state it reveals. _(full account: `docs/engineering-lessons.md` §C-25)_
- **An adversarial rewrite of owner-facing copy re-enters the voice pass (CUL-778):** when a clinical or statistical pass changes a string an owner reads, the Designer / `nyx-voice` read runs again on the result and the DoD persona line says so — a clause squeezed under a length cap loses its "why" first. A worst-case fixture pins every variable the editor cannot see (month-name length), and a negative guard calls the layer that owns the behaviour. _(full account: `docs/engineering-lessons.md` §C-28)_
