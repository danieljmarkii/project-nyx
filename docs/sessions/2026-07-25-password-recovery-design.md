# Password recovery — requirements + design session (B-280)

**Date:** 2026-07-25

The app had no credential recovery at all (no `resetPasswordForEmail`, no deep-link handler). Spec **v1.2** + design-locked mocks + **5-PR plan**; **PR 1 build-ready**. `rls-privacy-reviewer` FAIL on v1.0 (5 blockers, all folded in — the cross-account wipe was designed for the wrong transition shape). All three PM rulings landed: **D1c accept · D4 yes + email change scoped (D9) · D6b yes** (best-practice session workflow, §7.2). Only the §9.3 device checks remain. Shipped via **#437**.
