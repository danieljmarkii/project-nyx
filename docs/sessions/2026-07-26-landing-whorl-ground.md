# Landing hero: the whorl ground ships, the ring-train ping retires

**Date:** 2026-07-26 · shipped via #478

The PM opened with a verdict: the B-322 ring-train Signal ping on the auth entry, tested on device, still isn't right — "we can't get the motion right on the rings and we've spent too much time on it" — and proposed adopting the getculprit.app background's whorl style instead, asking the Sr. Product Designer to weigh in with mockups, with motion kept only "if we can get it right."

**The design round** (`docs/culprit-landing-hero-mockups.html`, also published as a Claude artifact for iPad review). Four options: **A** quiet moon (`live` off, zero risk), **B** whorl ground (the site watermark echoed in-app — indigo ridges behind the carved moon, static; the designer recommendation), **C** whorl-as-the-mark (the literal read, argued against: it displaces the app icon's mark from the brand moment and puts decorative teal at hero scale), **D** whorl drift (B + slow counter-rotation via the proven WhorlSpinner mechanism, animated in the mock page itself).

Two arguments carried the recommendation beyond "the ping stutters": **(1) the ping was semantically empty on this surface** — the pulse contract (spec §3) ties `live` to a fresh unseen finding, and a logged-out screen has none, so the Landing was hard-coding the pulse as decoration; **(2) the motion question has an honest technical answer** — WhorlSpinner's continuous rotations (one loop restart per 9–25s period) are proven on device, while the ping's three staggered loops re-arm from the JS thread every 2.6s, which is structurally the fragile shape. So static-by-conviction, with D as the pre-approved fallback if B reads too still.

**PM ratified Option B same-session.** Build: `NightHeroGround` gained the static whorl layer — the brand system's Whorl motif geometry verbatim (`docs/brand/culprit-direction.html`) at hero scale, `colorBrandNightElevated` ridges layered between the aurora radials and the starfield, never teal (§1.3, the same rule that killed the teal radial in the 2026-07-12 QA pass). `app/(auth)/index.tsx` stops passing `live` — the Landing now carries **zero ambient loops** (§1.5), with code comments recording both retirement reasons so nobody re-adds the ping as polish. Placement/scale/opacity are constants lifted from the ratified mock; the exact values are an on-device tuning AC (the night-moment precedent).

**Regression pins:** `NightHeroGround.test.tsx` asserts the four ridges render in night-elevated indigo and never teal; `index.test.tsx` asserts no stroked circles render on the Landing (the pulse rings are the only stroked circles the hero could draw, so their absence pins the mark static). `tsc` clean; full suite green twice via the pre-push hook.

**Decision surfaced, not taken:** the Home header's ring train — where `live` *does* have real semantics — is now the open call (keep / drop to dot-breathe only / static). Added to CLAUDE.md Open Questions. The dot-breathe-only middle path is noted there: a single continuous loop sidesteps the ring train's restart-stall failure mode.

**Tier-2 flag (awaiting PM approval to write):** `culprit-in-app-brand-requirements.md` §4 — hero composition gains the whorl ground; the ping leaves the Landing; AC-N2b's "exactly one ambient loop (the ping)" becomes "zero ambient loops."

Personas: Sr. Product Designer (led — the option round, §1.1/§1.3/§1.5 compliance, the register argument that a moving whorl means "working" on a screen where nothing is); Dir. of Engineering (the loop-restart mechanics diagnosis; static SVG in the existing paint pass, no new deps); Jordan/Sam N/A; Dr. Chen N/A; adversarial review N/A (no clinical logic).
