# Vet Files VF-2 — the library, the profile Records card, and the signed-URL read path

**Date:** 2026-07-26

Built VF-2 of B-478 against `docs/nyx-vet-files-requirements.md` §4.1/§9 and the design-locked round-2.1 mock (`docs/culprit-vet-files-mockups.html`). Shipped via #489.

## The gate, first

The task named the condition itself: B-478 is `Later` pending **G4 (priority)**. It still is, in both `STATUS.md` and the backlog — there is no record of a promotion. The build was requested directly, which is the only channel a promotion actually has, so it was treated as one and **flagged rather than assumed**. If G4 was not meant to open, nothing is lost: the entry point ships gated off (below), so VF-2 is merged-but-dark and costs nothing parked.

## What shipped

| File | What |
|---|---|
| `lib/vetDocumentLibrary.ts` | The read model: `LIBRARY_VET_DOCUMENTS_QUERY`, the row/card/filter builders, every owner-facing string, the two local writes (rename, set kind) |
| `lib/vetFilesEntry.ts` | `VET_FILES_ENTRY_ENABLED` — the profile-entry gate |
| `app/vet-files.tsx` | The library screen |
| `components/vetfiles/VetDocumentRow.tsx` | L-real row anatomy |
| `components/vetfiles/VetDocumentThumb.tsx` | The 44×56 document tile |
| `components/vetfiles/VetFilesCard.tsx` | A1-r2 + A1z, the profile Records card |
| `components/vetfiles/VetFilesEmptyState.tsx` | E1-r2 |
| `components/vetfiles/VetDocumentMetaSheets.tsx` | The D11 recovery sheets — Name, Add type |
| `app/(tabs)/profile.tsx` | Card wired in beneath Vet report, focus-reloaded, gated |
| `lib/vetDocumentLibrary.test.ts` | 32 tests |

`tsc --noEmit` clean; jest **140 suites / 2674 tests**, all green.

## The entry gate — the one deliberate deviation from a straight read of §9

§9 assigns the profile Records cards to VF-2, but capture is VF-3 and detail is VF-4, and these PRs merge to `main` individually. Shipping the card as specced would put a "Vet Files" entry on the profile whose add button leads nowhere.

Three options, and the two obvious ones are worse: a live button that silently does nothing, or placeholder copy ("coming soon") that VF-6's voice pass would delete anyway. So the surfaces ship complete and **unreachable**, behind `VET_FILES_ENTRY_ENABLED = false`. It is a build-time constant rather than an `app_config` flag on purpose — a flag would need its own migration under the schema-isolation rule, plus a runtime fetch, to answer a question that is settled at compile time by which PRs have merged. **Flipping it is the last line of VF-3.** The library stays reachable at `/vet-files` for QA, which is the only way VF-2's populated states can be exercised before capture exists.

Both forward links (add → VF-3, row tap → VF-4) go through one named `pendingScreen()` no-op, so they are greppable when those PRs land and cannot silently swallow a tap in a QA build.

## Decisions taken inside VF-2's scope

**The kind lens offers only kinds that are present.** Listing all ten would put nine dead options in front of a week-one owner: pick one, get an empty list, learn nothing. Offering only what exists makes the filtered-empty state *unreachable by construction* rather than something to design around — there is a test asserting exactly that (`never yields an empty list for any option it offers`). `reconcileKindFilter` covers the one residual path: deleting the last lab result drops a now-dangling selection instead of stranding the owner on it. Order is §4.5's continuity-of-care ranking, never alphabetical.

**`other` renders as the dashed "Add type" invitation, never as a chip reading "Other".** `other` is the capture default — an absence, not a fact about the document. A chip asserting "Other" would be the app claiming someone classified it.

**The default title is rendered, never stored.** A stored default is indistinguishable from an owner who typed "Document — Jul 26", and the row would lose its Name affordance forever. Corollary: clearing the Name field writes `NULL`, not `''`, so the default and its affordance come back.

**Name and Add type address the whole `document_group_id`, not the cover row.** Both are per-row *columns* but per-document *facts*; renaming only the cover would leave page 2 of a discharge sheet carrying a different title than page 1 — invisible in the library (which renders the cover) and confusing the moment VF-4's detail view swipes.

**Signed URLs are 15 minutes, not the Foods tab's 24 hours.** That tab caches for a browse session over a food photo; these are bloodwork with a clinic's letterhead and discharge sheets naming the owner's address, and a signed URL is a bearer token in a string. Re-signed on every focus, never persisted (§6.2).

## AC 12 — the offline-read feasibility pass VF-2 owed

The free half already works: a document captured on this device keeps a durable local file, and `local_uri` always wins over a signed URL when the row resolves its thumbnail. The unconditional half is implemented too — a tile that cannot be reached **rests on its paper glyph and never spins**, because a spinner over a record a vet just asked for reads as "almost there" when the honest answer is "not without a connection".

**Recommendation for the remaining half (VF-4's call):** on the first successful full-size open, persist the bytes to the durable `persistCapture` path and set `local_uri`. No new column, no second cache layer, and the list thumbnail starts rendering offline as a side effect.

## What a reviewer should look at hardest

`MIN(page_index)` in `LIBRARY_VET_DOCUMENTS_QUERY` is load-bearing, not decoration. It pins SQLite's single-min/max bare-column rule to the cover row; without it the engine may take each projected bare column from an arbitrary group member, and a four-page email thread could render page 3's thumbnail beside page 1's title. `LIBRARY_FOODS_QUERY` leans on the identical rule. There is a test that inserts page 2 first, with different values, specifically so a naive `GROUP BY` fails it.

Second: `formatVetDocumentDate` hand-parses the calendar date instead of using `new Date()`. `new Date('2026-07-26')` is UTC midnight by spec, so `toLocaleDateString` renders it as the **25th** anywhere west of Greenwich — a vaccination certificate filed one day early, silently, for every owner in the Americas. Verified the guard actually catches it (a naive implementation returns "Jul 25" under `TZ=America/Los_Angeles`).

## Known gaps

- **`rls-privacy-reviewer` was not run.** VF-2 adds a new read path (batch signed URLs against `nyx-vet-documents`), and §7 makes that reviewer mandatory for new read paths. This session was instructed not to dispatch subagents, so it is flagged as an open item rather than skipped silently. The read is `getSignedUrls` against paths that came from an RLS-scoped local mirror, and the bucket's own owner-scoped policies govern signing — but that is an argument, not the adversarial pass.
- **Populated states are not on-device QA-able until VF-3**, because nothing can create a document yet. Everything but the empty state is covered by unit tests instead.
- **VF-4 still owes** the detail screen, share, soft delete + the 30-day "Recently deleted" surface the mock's delete copy promises.
