# Culprit brand — durable design artifacts

The permanent home for every brand-direction artifact (PM directive, 2026-07-09:
these review documents are durable records, kept in-repo so future sessions can
refer back to them). Each is a self-contained interactive HTML page — open in a
browser, no build step. Newest rounds iterate, they never overwrite: earlier
rounds stay intact as the decision record.

| Artifact | What it is | Date |
|---|---|---|
| [`culprit-direction.html`](./culprit-direction.html) | The icon & brand-system pitch — Moon & Signal, the wordmark, palette world, the field of 24. The origin document. | 2026-07-08 |
| [`culprit-in-app-direction.html`](./culprit-in-app-direction.html) | **Round 1** of carrying the brand into the app: "night is when Culprit thinks," the living mark (+ the carve fix), the Whorl loading system, the Signal night card, the Home briefing, the calendar pips, the completion ping. Decisions D1–D6. | 2026-07-09 |
| [`culprit-in-app-direction-r2.html`](./culprit-in-app-direction-r2.html) | **Round 2**, iterating on the PM's nine reactions: hero placements in-app, the night moment explained (playable), three Signal contrast treatments (dawn horizon / dusk card / tinted canvas), briefing scenarios, the calendar push with product-team voices, the completion landing arc. Decisions D7–D11. | 2026-07-10 |
| [`culprit-in-app-direction-r3.html`](./culprit-in-app-direction-r3.html) | **Round 3** (convergent): Landing hero + text-light pull-to-refresh **locked**; the night moment goes full-bleed (whorl at screen scale, opaque); the Signal ground resolves to a **rendering rule** — findings → the night-sky card, safety wears the design system's danger styling, nothing-established → a plain light card (no metaphors; the r2 treatments are dead); calendar v3 sheds the six-month strip (its read routes to the vet report). Open: D7–D11. | 2026-07-10 |
| [`culprit-icon-design-brief.md`](./culprit-icon-design-brief.md) | The generation brief handed to Claude Design for the icon master. | 2026-07-08 |
| [`culprit-icon-moon-signal.svg`](./culprit-icon-moon-signal.svg) | Indicative master SVG from the direction session. | 2026-07-08 |
| [`culprit-icon/`](./culprit-icon/) | The production master kit (SVG sources + PNG ladder) the shipped app assets derive from — see its README. | 2026-07-09 |

Conventions established by these documents:

- **The carve rule:** the crescent is drawn as a *mask/cutout*, never by laying a
  filled circle over the ground — the sky must pass through the opening.
- **The register rule (proposed, r1):** night grounds appear where the app is
  *working on the pet's behalf* (Signal, AI summary, real waits); capture and
  records stay the light day system.
- **Tokens:** night values cite `constants/theme.ts` (`colorBrandNight #13112E`,
  `colorBrandNightElevated #251F57`); proposed additions (dusk `#2B2660`, canvas
  tint `#F6F5FB`, `colorEventSymptomOnNight #FB7185`) land only via a ratified
  theme PR.
- Related specs elsewhere: `docs/culprit-icon-brand-direction.md` (the icon
  decision record), `docs/culprit-rename-requirements.md` (B-274 naming),
  `docs/culprit-rebrand-execution-plan.md` (rebrand PR plan), and — the
  culmination of the rounds indexed above — **`docs/culprit-in-app-brand-requirements.md`**
  (B-284, build-ready: PRs N1–N7, per-PR acceptance criteria, verbatim copy,
  the D8 on-device ground gate and D9 Tier-2 edit gate).
