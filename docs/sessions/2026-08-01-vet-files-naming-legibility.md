# Vet Files — close four naming/legibility findings (B-588–B-591)

**Date:** 2026-08-01

Shipped via **#550** (draft). Four Vet Files surfaces, each found by a prior
`pm-feature-review` pass, where the app worked as built but a real owner (Sam,
Jordan) would be left blind, misled, or stuck. All additive, guarded, minimal —
no schema, no behaviour change beyond each fix. Full jest suite green (now 3948
after the new suites), `tsc` clean.

## What shipped

- **B-591 — unreachable-PDF honest state (`components/vetfiles/DocumentHero.tsx`).**
  The render branch tested `isPdf` *before* reachability, so a never-opened remote
  PDF (second device, no signal) fell into the `isPdf` arm and drew the glyph +
  "PDF" badge with `openable` false — an openable-looking tile that isn't openable
  and explains nothing. §8 AC 12's honest "needs a connection" sentence was
  **structurally unreachable** for the PDF case. Fix: the `isPdf` arm now requires
  `uri != null`, so an unreachable PDF falls through to the honest line, worded for
  the case — *"Needs a connection to open this PDF"* (a PDF is opened, never
  previewed; there is no page to "show"). No spinner, self-heals on reconnect, and
  the Send path's own alert already agreed. New `DocumentHero.test.tsx` pins the
  branch order across reachable / unreachable / pending for both PDF and image.

- **B-590 — the image lightbox names the pet (`components/ui/PhotoViewer.tsx`,
  wired in `app/vet-document/[id].tsx`).** B-550 named the pet on the detail header
  and the PDF viewer's bar but missed the full-screen surface for an *image*
  document — a chrome-less black lightbox. Email screenshots are the feature's
  stated primary capture class (§1/§2), so this is the higher-volume handover
  surface: Sam turns the phone around to an ER vet and nothing says whose pet it is.
  Added an optional `caption`, rendered beside Close (render-only-when-passed, like
  `onReplace`/`onRemove`, so the four existing callers are untouched); Vet Files
  passes the pet name with the same resolve-or-stay-silent rule as the PDF bar.

- **B-588 — the Name sheet says which document
  (`components/vetfiles/VetDocumentMetaSheets.tsx`, `app/vet-files.tsx`).** Two
  untitled PDFs from one portal produced a byte-identical Name sheet, so an owner
  named one of two identical documents blind — the one surface that withheld the
  B-546 filename disambiguator. Added an optional `fileLabel`, shown as a quiet
  "File name" tag above the field, middle-truncated, threaded from `row.fileLabel`.
  Implemented the **zero-risk subtitle** option; the tappable-suggestion option
  stays a separate PM call (→ B-651).

- **B-589 — the multi-PDF saved moment drops the misleading "Name it"
  (`components/vetfiles/DocumentSavedMoment.tsx`, `lib/vetDocumentCapture.ts`).** A
  Files pick of two PDFs rendered one cover card reading "2 documents" whose "Name
  it" silently named only the cover group under a singular sheet title.
  `savedMomentCopy` now returns `multiDocument` (keyed on document count, not page
  count) and the button is gated on it; naming moves to the library rows (D11).

## Reviews

- **nyx-voice — pass.** The one new prose string, *"Needs a connection to open this
  PDF"*, is calm, exclamation-free, and "PDF" is established owner vocabulary in
  this feature. The B-589 cue *"You can name each one later."* echoes the add
  sheet's shipped "you can name things later"; "File name" is a plain functional
  label. B-590's caption and B-588's tag are identifiers/data, not prose.

- **pm-feature-review — all four SHIP-SHAPED, no blockers.** It surfaced three
  cheap improvements to the code, all folded in this session:
  - B-588: a **"File name" lead-in** (a rounded box above an empty field otherwise
    reads as a prefilled value or a tappable chip) + an **a11y label** so VoiceOver
    reaches "File name, CBC-…" rather than a raw filename mid-sheet (the same care
    the library row takes by voicing the filename last).
  - B-589: a **forward-looking cue** so the multi-doc saver still learns naming
    exists — the single-doc path teaches it via the button, and dropping the button
    silently would leave the multi-doc completion state saying nothing (Principle 5).

  And two it correctly could not call from a static read → backlog:
  - **B-652** — B-590's caption *prominence* (bottom, sub-Close) vs the PDF viewer's
    top title, for the phone-turned-to-a-vet case. Needs a screenshot; the caption
    strictly improves on the no-name state it replaces, so it ships.
  - **B-651** — the tappable filename → suggested-name option B-588 deliberately
    didn't build.

## Tests

New: `DocumentHero.test.tsx`, `DocumentSavedMoment.test.tsx`. Extended:
`PhotoViewer.test.tsx` (caption), `VetDocumentMetaSheets.test.tsx` (`fileLabel`
tag + "File name" label + a11y label), `vetDocumentCapture.test.ts`
(`multiDocument`).

## Follow-ups filed

- **B-651** — tappable filename → suggested name in the Name sheet (PM decision).
- **B-652** — device-confirm the B-590 image-caption prominence; reconcile with the
  PDF viewer's top title if a turned-around phone doesn't read it.
