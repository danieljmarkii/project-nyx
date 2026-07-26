# Vet Files (B-477) — discovery → build-ready spec + design-locked mocks, in one session

**Date:** 2026-07-26

**Shipped via #463** (docs-only: backlog + spec + mocks + CLAUDE.md row; no app code, no schema).

## What shipped

- **`docs/nyx-vet-files-requirements.md` v1.0 BUILD-READY** — the full requirements track for the central per-pet vet records library (email screenshots, lab PDFs, vaccination certs; Phase-2 AI ingestion separately gated). Went v0.1 (discovery draft) → v0.2 (G1–G3 ruled) → v1.0 (all decisions closed) in a single day, with the PM ruling in-session at each step.
- **`docs/culprit-vet-files-mockups.html`** — two mock rounds; round-2.1 is design-locked and is the authority for VF-2–VF-4.
- Backlog: **B-477** (the feature; renumbered from B-467 — see below), **B-478** (search, deferred out of v1), **B-479** (report paperclip, deferred; explicitly NOT D8-gated).

## How it ran (the process is the story)

1. **Three parallel discovery lanes** (Explore ×2 + web research): a shipped-code audit — headline: **vet visits are a write-only capture path** (captured, synced both ways, rendered *nowhere*; no signed-URL call against `nyx-vet-attachments` exists) — an internal constraint map (report scope-cascade coupling, Ask §6 as the Phase-2 template, monetization §3 free-forever), and an external brief (the 2024–26 AI record-reader cohort — PetRecord.ai, VetLens — validates the AI phase but has no longitudinal logged data; that fusion is Nyx's open lane).
2. **Spec drafted with gates** → PM ruled G1 (delegated → new `vet_documents` table + new `nyx-vet-documents` bucket), G2 (PDFs in v1, store-and-view), G3 (pet-profile entry). G4 (priority) deliberately open — stays `Later`.
3. **Mock round 1** → **Jordan + Sam persona reviews** (two isolated `pm-feature-review` subagents). Convergent findings drove round 2: E1/L1 ruled, the default-title cascade ("Document — Jul 26" everywhere), the "Link a visit" dead end (visits render nowhere), the report↔files adjacency implying inclusion, pet name absent (multi-pet mis-filing).
4. **Mock round 2** (demo pet switched to Sam's cats Pixel/Juniper so multi-pet gaps stay visible) → PM ruled **D11** chips out (Jordan's position; list-row Name affordance is the recovery), **D12** search out (→ B-478), **D13** multi-pet via **duplicate-on-add** (independent copy per pet — a shared-document model breaks the path CHECK, bucket policies, and deletion cascade; schema stays `pet_id NOT NULL`), **D14** report paperclip out (→ B-479).

## Decisions with teeth

- **D7 (report-window protection):** an uploaded document never mints or re-dates a `vet_visits` row — the report's scope cascade keys rung 1 off `visited_at`, so silence here would let an upload move the report window invisibly. QA'd as an invariant in VF-4 (window byte-identical before/after linking).
- **D8 (Phase-2 gate):** AI over the corpus requires a D2-class PM + T&S ruling mirroring Ask §6's five mechanisms; OCR'd third-party document text tightens the injection posture, never relaxes it.
- **D14's clause worth remembering:** the paperclip (attach a stored PDF to a report send) is *not* an AI read — when B-479 is picked up it needs a scope ruling only. Recorded explicitly so a future session doesn't treat D8 as blocking it.

## What broke / friction

- **B-435 ID race, third occurrence:** a sibling session claimed B-467 on `main` for the protein-rankings item while this session's B-467 was unmerged. Renumbered ours to B-477 across five files. The race window here was ~3 hours.
- Two `docs/backlog.md` merge conflicts against sibling sessions, both trivial append-collisions, both resolved keep-both.
- Round-1 mock hygiene: used "Mochi" (Jordan's dog in `personas.md`) as a cat. Sam's review caught it; round 2 uses the persona's real cats — which is also what surfaced the multi-pet gaps. Lesson: **mock with the persona's actual pets; the fidelity does review work for free.**

## Residuals

- **VF-0 (B-248 + B-466) is the hard prerequisite and is `Now` on its own mandate** — the legacy vet bucket's cross-tenant read/delete hole predates this feature.
- G4 (priority) open by choice; VF-1 needs a PM dashboard action (bucket creation with size/MIME limits).
- Persona-review items deliberately NOT filed as rows (parked in spec §11): share-sheet import from Mail, aggregate export, vaccination-expiry surfacing (Jordan-wants/Sam-warns conflict recorded in §10), diet-trial↔document link.
