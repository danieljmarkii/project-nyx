# Nyx Vet Files — Central Vet Records Library — Requirements (B-478)

**Version:** 1.0 — **BUILD-READY** | **Date:** 2026-07-26 | **Status:** **Every requirements decision is closed.** G1–G3 PM-ruled (new `vet_documents` table + `nyx-vet-documents` bucket; PDFs in v1 store-and-view; pet-profile entry); the mock round ran twice with Jordan/Sam persona reviews between rounds (`docs/culprit-vet-files-mockups.html`, round-2.1 is **design-locked**); D11–D14 PM-ruled (chips out; search out → B-479; multi-pet via duplicate-on-add; report paperclip out → B-480, explicitly not D8-gated). **The only open item is G4 (priority): B-478 stays `Later` until the PM promotes it — this spec is ready whenever that happens.** VF-0 can ship any time on its own `Now` mandate.

**Read with:** `docs/nyx-vet-report-requirements.md` (§8.3 scope cascade, §8/§12 attachment-handling pattern), `docs/nyx-ask-requirements.md` §6 (the D2 LLM-boundary template Phase 2 must mirror), `docs/monetization-and-throttling-requirements.md` §3 (the free-forever table), backlog rows B-478 / B-248 / B-466 / B-145 / B-041 / B-464.

---

## 0. Decision record

Proposed decisions (team recommendation attached; PM ratifies or overrides). Open gates are marked **G-n** and block the PR plan as noted.

| # | Decision | Recommendation / status |
|---|---|---|
| D1 | **What Vet Files is** | A per-pet, owner-held library of vet-facing documents: email comms (screenshots/forwards), prior-vet records, lab results, vaccination certificates, discharge summaries, invoices, referral letters. **v1 is store + browse + share. AI over the corpus is Phase 2, separately gated (D8).** |
| D2 | **Positioning** | A substrate feeding Nyx's two owned differentiators (correlation engine, clinical-grade report) — **never the headline value claim.** The competitive refresh repeatedly frames records-storage-as-the-product as the weak position (CompanAIn; PerkyPet's "dumb record locker"). Nyx's open lane is the fusion no one has: longitudinal owner-logged data + a document corpus + AI. |
| D3 | **Data model** — ~~G1~~ **ratified** (delegated, 2026-07-26) | New table **`vet_documents`** (see §5.1) rather than relaxing `vet_visit_attachments.vet_visit_id` to nullable. Rationale: the existing table is a shipped per-visit photo attach with none of the needed metadata (kind/title/source/mime/deleted_at); overloading it makes every existing read ambiguous. `vet_visit_id` on the new table is an **optional** link. Existing `vet_visit_attachments` rows stay put; a later backfill can link them in (§12). |
| D4 | **Storage** — ~~G1~~ **ratified** (delegated, 2026-07-26) | New **private** bucket **`nyx-vet-documents`**, created via dashboard (B-124 rule), with owner-scoped path policies, a `storage_path` prefix CHECK on the table, `file_size_limit`, and `allowed_mime_types` set **from day one** — correct-by-construction, so this bucket is never a B-248/B-464 class member. Do NOT grow `nyx-vet-attachments`: that is the bucket with the live cross-tenant read/delete hole. |
| D5 | **File types (v1)** — ~~G2~~ **RATIFIED yes (PM, 2026-07-26)** | Images (the PM's primary use case is email screenshots) **plus PDF store-and-view** — inbound lab PDFs are the #1 continuity-of-care record type and arrive as PDFs by construction. PDF scope is strictly: accept, store, render in a native viewer/WebView on the detail screen, share out. **No PDF thumbnailing, no server-side PDF processing, no text extraction in v1** (the project has no PDF pipeline; B-144 is still an open spike). |
| D6 | **Entry point** — ~~G3~~ **RATIFIED (PM, 2026-07-26)** | A **"Vet Files" section on the pet profile** (alongside the existing "Vet report" section), plus an add-document affordance inside the library itself. **Nothing on Home** (Principle 3: Home carries no shelf, no feature menu). Share-sheet / Files-app import is parked to a follow-up (§12) — high value, new capture class, not needed to prove the surface. |
| D7 | **The report-window protection rule** | The vet report's scope cascade keys rung 1 off `vet_visits.visited_at`. Therefore: **uploading a document never creates, dates, or re-dates a `vet_visits` row** — not in v1, not in Phase 2, not by AI extraction. A document may *link* to an existing visit; it may never *mint* one. (Generalizes the B-156 G1 fail-safe: a surface may lower the cost of confirming; it may never assume the event happened.) |
| D8 | **Phase 2 (AI over the corpus) is gated** | Out of v1 entirely. Requires a **D2-class PM ruling with T&S at the table** before any build, mirroring the Ask §6 five mechanisms (§7). Registered here so the v1 schema doesn't foreclose it, and so no session "helpfully" builds it early. |
| D9 | **Monetization** | The library is **free forever** — `docs/monetization-and-throttling-requirements.md` §3 row 1 ("core logging… photos, attachments — the record is never gated") plus the export-as-data-right row settle this; changing a §3 row is a PM decision this spec does not propose. The only legitimately gateable layer is Phase 2 **extraction/enrichment**, under the D-M2 class rule (decided once, for the class, data-informed). |
| D10 | **Provenance over polish** | Every document carries `source` (camera / photo library / files) and honest metadata. The original artifact is primary forever; any future AI read is an annotation linked back to it, never a replacement — the same owner-editable-analysis pattern as B-028. |

### Mock-round rulings (PM, 2026-07-26, after round 2 + the Jordan/Sam persona reviews)

- **D11 — Kind chips at the saved moment: OUT of v1.** PM ruled with Jordan: capture stays zero-decision with nothing added post-save; the recovery for the untitled-library problem is the **one-tap Name / Add-type affordance on the library row** (round-2 L-real), which ships in VF-2. Sam's chips proposal is recorded, not adopted; revisit only if real usage shows the list-side recovery isn't used.
- **D12 — Search: OUT of v1.** §4.1 stands as specced (kind filter only). Deferred to backlog (B-479); the trigger to revisit is real libraries crossing ~20 documents.
- **D13 — Multi-pet documents: SUPPORTED, via duplicate-on-add.** PM ruled multi-pet support is required. Mechanism (Engineer rec under that ruling): an **"Also add to {other pet}'s Vet Files"** action on the saved moment (and detail ⋯ menu) that creates a full independent copy — new row, new storage object — under the other pet. A shared-document model was considered and rejected for v1: one object serving two pets breaks the pet-prefixed `storage_path` CHECK, the per-pet bucket policies, and the delete-account cascade (removing one pet would orphan or destroy the other's reference). Copies may diverge after creation; that is accepted (they are separate filings, like forwarding an email twice). **Schema impact: none — `pet_id` stays NOT NULL**, VF-1 unblocked as drafted. The affordance renders only in multi-pet accounts.
- **D14 — The report paperclip: OUT of v1 (PM, 2026-07-26).** Attach-a-stored-document-on-report-send does not ship in v1; deferred to **B-480**. Two facts bind the future: **(a)** it is *not* gated by D8 — attaching an existing file involves no AI read, so when B-480 is picked up it needs only a scope ruling, never the D2-class boundary process; **(b)** until it ships, every surface states the current truth plainly (the A1-r2 blurb: "Not included in the vet report — shared one at a time") — the two Records cards sit adjacent, and silence would imply inclusion (both persona reviews assumed it).

### Gates — rulings (PM, 2026-07-26, same day as the draft)

- **G1 — CLOSED (delegated to the team → recommendation ratified).** New `vet_documents` table + new `nyx-vet-documents` bucket per D3/D4. VF-1 unblocked.
- **G2 — CLOSED: YES, PDFs in v1** (store-and-view only, per D5's bounds — no thumbnails, no extraction, no server-side processing). VF-5 dissolves into VF-3/VF-4.
- **G3 — CLOSED: pet-profile section** per D6. VF-2/VF-4 unblocked pending the mock round.
- **G4 — DELIBERATELY OPEN.** PM is "open minded on priority": B-478 **stays `Later`** until actively promoted; the §10 conflict stands recorded, not resolved. The hard sequencing in §6.1 holds either way (VF-0 = B-248/B-466 is already `Now` on its own merits). Revisit when a build slot opens or the PM promotes it.

---

## 1. The jobs (PM-defined, 2026-07-26)

1. **One home for vet comms and records.** Email threads with the clinic (as screenshots or forwards), records requested from a prior vet, lab PDFs, vaccination certificates, estimates — today these live in the owner's camera roll and inbox, unfindable at the moment of need (new vet, ER, boarding, insurance claim).
2. **A substrate AI can later read** to feed the Signal card, Ask, and the vet report — explicitly a future phase (D8).

The v1 user moment: Jordan is at a new clinic or the ER, and the vet asks "do you have the last bloodwork?" — the answer becomes two taps instead of an inbox excavation.

## 2. Evidence base (2026-07-26 discovery, three lanes)

**Competitive.** No incumbent combines daily logging + a document corpus + AI. Clinic-tethered apps (VitusVet, PetDesk) only surface records when the clinic uses the vendor; owner-held keepers (11pets, VetCore-class) store but don't understand; a 2024–26 **AI record-reader cohort** (PetRecord.ai, VetLens ~12k users, MyPetID) proves demand for extraction/explanation but has no longitudinal owner-logged data to correlate against. 11pets is the cautionary tale: broken uploads, an update that *removed* export, data corruption — users in this category now screen for export.

**Human-health analogues.** Apple Health organizes records by **category × provider × timeline simultaneously — no user-managed folders**; sharing consent is per-record; export is a single aggregated PDF. Transferable: (1) type × date × source, never folders; (2) the original artifact stays primary, structured reads are annotations; (3) per-record consent is the model for what Phase 2 may read; (4) one-tap aggregate export is the killer share affordance; (5) **explain-the-jargon is the proven first AI job** (VetLens's whole business) — cheaper and lower-risk than cross-record synthesis, and it fits the n=1 guardrails (explain, never reassure).

**Domain reality.** Owners have a right to record copies in effectively all US states; delivery is messy by construction — printed discharge sheets, emailed PDFs from PIMS (ezyVet/Covetrus), portal downloads, phone photos of paper, clinic-to-clinic fax. Assume image + PDF ingestion of wildly inconsistent layouts; never assume a structured feed. **Record types by continuity-of-care value:** ① lab results (specialists want the last year's bloodwork first) ② vaccination certificates (highest-frequency need: boarding, groomer, new vet) ③ discharge/visit summaries ④ imaging reports ⑤ prescriptions ⑥ referral letters ⑦ invoices/estimates (low clinical, high organizational value).

Full brief with sources: session record for 2026-07-26 (vet-files discovery). This evidence base is a candidate for a frozen `docs/research/` brief — flagged in §13.

## 3. Shipped substrate & gap analysis (code audit, 2026-07-26)

**Headline: vet visits are a write-only capture path.** `app/vet-visit.tsx` captures a visit + at most one photo, mirrored locally, pushed AND hydrated (bidirectional sync already works) — and then rendered **nowhere**. No visit list, no detail screen, no thumbnail; nothing in the codebase ever requests a signed URL against `nyx-vet-attachments`. The single entry point is two levels deep (Ask → rundown → "log visit" tile).

**Reusable as-is:** per-pet RLS shape; the upload pipeline (`compressForUpload` / `prepareAttachmentUpload` EXIF+GPS strip, `persistCapture` durable local copy); the `${pet_id}/…` path convention (CHECK-ready); offline-first SQLite mirror + `synced` flag; push/pull sync incl. LWW; sign-out wipe; `delete-account` bucket purge; `getSignedUrl`/`getSignedUrls` helpers proven on three other buckets; migration 025 as the copy-paste hardening template.

**Missing (and therefore this spec's scope):** the entire browse/read surface; a data model that permits visit-less documents (`vet_visit_attachments.vet_visit_id` is `NOT NULL`); document metadata (kind/title/source/mime/size); soft delete (neither table has `deleted_at`, and there is **no delete path at all today** — an owner cannot remove a logged visit or photo); PDF support (the whole pipeline assumes JPEG); the signed-URL read path (hydrated attachment rows carry `local_uri=''`, so on a second device the photo is unreachable by design); discoverability.

**Security context (binding):** `nyx-vet-attachments` policies are bucket-wide `TO authenticated` for SELECT/INSERT/**DELETE** — any authenticated user can read or delete any owner's vet documents (B-248, re-verified live 2026-07-25), and `vet_visit_attachments.storage_path` has no prefix CHECK (B-466, the last unclosed member of a five-member confused-deputy class). Both are `Now` pre-multi-user blockers and are **this feature's hard prerequisite** (§6.1).

## 4. v1 scope & design

### 4.1 The library (list)

- Per-pet, reached from the pet profile (G3). Renders as a **reverse-chron list with a kind filter** — type × date × source, no folders, ever (evidence: §2). The kind filter follows the house lens rule (`docs/nyx-filter-ux-requirements.md`): the kind set is long and growable → `ScopeMenu`, visible tint when non-default. **No search in v1 (D12; deferred to B-468).** The header carries the pet's name (round-2 review: the only filing cue a multi-pet household gets).
- **Untitled rows are the expected steady state, and the list is designed for them** (round-2 L-real): a defaulted row renders its "Document — {date}" title in a quieter weight, a dashed "Add type" chip, and a **one-tap Name affordance in place of the chevron**. This is the sanctioned recovery for the zero-decision capture default (D11) — the capture flow itself never asks.
- Each row: kind icon + title (defaulted, editable) + document date + source glyph. Thumbnails for images; a document glyph for PDFs (no PDF thumbnailing in v1, D5).
- **The empty state is the feature's primary screen** (most users, most of the time — Principle 5). It must be warm, forward-looking, and name the moment: what Vet Files is *for* (the ER, the new vet, boarding), not "No documents yet." Copy goes through `nyx-voice` at build.

### 4.2 Adding a document (the capture flow)

Principle 1 governs the *upload* moment — often a clinic parking lot:

- One tap from the library: **camera / photo library / files** (files = G2). Multi-select from the photo library (an email thread is N screenshots — see §4.4).
- On confirm, the document saves **immediately** with everything defaulted: `document_date` = EXIF date or today, `kind = other`, title = kind + date. **Metadata is editable afterward, never demanded at capture.** The failure mode to avoid is named in the backlog: B-155 flagged the med-capture path as "correct… not a 10-second path."
- Visit linkage is **optional, deferrable, and set from the detail screen** — never a capture-time question (D7 forbids the reverse direction entirely). **The visit-link row renders only when ≥1 vet visit exists on record** (round-2 ruling — visits have no browse surface today, so an empty picker reads as broken).
- **Multi-pet accounts** get an "Also add to {other pet}'s Vet Files" action on the saved moment and the detail ⋯ menu (D13, duplicate-on-add). Single-pet accounts never see it.
- The saved moment names the pet ("Saved to Pixel's Vet Files") and carries the offline line ("On this phone now — backs up when you're online"). Its secondary action is "Name it" — no kind chips, no metadata prompts (D11).

### 4.3 Document detail

- Full-screen view (existing `PhotoViewer` for images; native viewer/WebView for PDFs per G2).
- Editable: title, kind, document date, notes, optional visit link.
- **Share out via the native share sheet** — the single most important affordance after viewing (the "hand it to the ER vet" moment), and the v1 answer to export-anxiety (§2's 11pets/Fuzzy lesson). Aggregate "share all as one PDF" is parked (§12).
- **Soft delete** (`deleted_at`), consistent with the house rule on events.

### 4.4 Multi-page documents

An email thread or a multi-page discharge sheet is N images that are one document. v1 keeps this simple: multi-select at capture creates **one document row per page group** is *not* attempted — instead a `document_group_id` groups pages into one logical document rendered as a swipeable stack in the detail view. (Cheap now, expensive to retrofit; the alternative — one row per screenshot — makes the library read as clutter and makes Phase 2 attribution ambiguous.)

### 4.5 Kind taxonomy (v1)

`lab_result` · `vaccination` · `visit_summary` (discharge) · `imaging` · `prescription` · `referral` · `invoice_estimate` · `insurance` · `correspondence` (email/messages) · `other`. Ordered in pickers by the §2 continuity-of-care ranking, not alphabetically. Closed set, single-select → `ChipGroup` on the edit surface (B-146 rule).

## 5. Data model & architecture

### 5.1 Schema sketch (VF-1; final DDL at build, own PR per the schema-isolation rule)

```sql
CREATE TABLE vet_documents (
  id UUID PRIMARY KEY,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL,  -- optional link; never minted by upload (D7)
  document_group_id UUID NOT NULL,          -- §4.4 page grouping; equals id for single-page docs
  kind TEXT NOT NULL DEFAULT 'other',       -- §4.5 taxonomy
  title TEXT,
  document_date DATE,                       -- the date ON the document, owner-editable; distinct from created_at
  notes TEXT,
  source TEXT NOT NULL,                     -- 'camera' | 'photo_library' | 'files'
  storage_path TEXT NOT NULL CHECK (storage_path LIKE (pet_id::text || '/%')),  -- 025-style, day one
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  page_index SMALLINT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,                   -- soft delete, house rule
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: default-deny; owner policy per-pet, same shape as vet_visits_owner.
```

- All timestamps UTC (house rule). `document_date` is a DATE because documents carry dates, not times.
- Local SQLite mirror + `synced` flag; push in the sync cycle; **hydration added to `lib/hydration.ts` ordering in the same PR that ships sync** (B-054 is done — new tables must join it, not drift from it).
- **The signed-URL read path ships in v1** (`getSignedUrls`, short-lived, request-time — never baked long-TTL, per the report spec's §8 pattern). This also fixes the class of bug the audit found on the legacy table (hydrated rows unreachable on a second device).

### 5.2 Storage

- Bucket `nyx-vet-documents`: private; dashboard-created (B-124); owner-scoped path policies keyed on `(storage.foldername(name))[1] IN (SELECT id::text FROM pets WHERE user_id = auth.uid())`; `file_size_limit` (proposal: 15 MB) and `allowed_mime_types` (`image/jpeg`, `image/png`, `image/heic`, + `application/pdf` per G2) set at creation — never a B-464 member.
- Images: existing `compressForUpload` + `prepareAttachmentUpload` (EXIF/GPS strip). **Verify at build that no fallback path can upload the original with GPS intact** — the report spec names exactly that hazard in `lib/sync.ts`. PDFs upload as-is (no transform exists), which is acceptable because PDFs from a PIMS carry no GPS EXIF; flag any future scanned-to-PDF path.
- `delete-account`: bucket + table join the purge plan **in VF-1**, before any real upload can exist (T&S launch-gate posture, B-039 precedent).

### 5.3 What v1 explicitly does NOT touch

`generate-report` (documents do not render in the report), `ask` (no vet-documents tool), `generate-signal` (no read). All three are Phase 2, behind D8. `rundown.ts`'s `readLastVisitDate` and the report's scope cascade are unaffected by construction (D7).

## 6. Security & privacy invariants

### 6.1 Hard sequencing

**VF-0 = B-248 + B-466 land first** (one PR, per B-466's own note): owner-scope the legacy `nyx-vet-attachments` policies + the 025-style CHECK on `vet_visit_attachments`. Vet Files does not grow that bucket (D4), but shipping a feature that markets "your vet records, safe in one place" while the sibling bucket has a live cross-tenant read/delete hole is not a defensible posture. `rls-privacy-reviewer` on VF-0 and again on VF-1.

### 6.2 Standing rules

- Default-deny RLS; per-pet scope; uniform not-found on cross-tenant probes.
- Signed URLs: short-lived, request-time, `private, no-store` — never persisted.
- EXIF/GPS stripped on every image upload path, no original-fallback.
- Deletion: soft delete owner-side; account deletion purges bucket + rows (verified in VF-1's QA, not assumed).
- Export: B-041 formally owes this corpus — its scope line updates when VF-1 merges (§13). v1's share-sheet-per-document is the interim answer.
- Privacy policy + App Store nutrition label: a vet-document corpus is a **new data class disclosure** → B-229/B-268 pick it up before any store build containing VF-1 (§13).
- No secret changes; nothing new in the Secrets Register.

## 7. Phase 2 — AI over the corpus (registered, gated, not specced)

Deliberately thin here; a Phase-2 spec session happens after v1 ships and after the D8 ruling. What is binding now:

1. **The gate:** a D2-class PM ruling with T&S at the table, before any build. The Ask §6 five mechanisms are the template: **scoped retrieval** (a corpus is natively bulk-shaped — defining "scoped" over documents is the hardest open design problem and a precondition of the ruling), **transform-only** image access, **one read path**, **delimited untrusted text**, **nothing new persisted**.
2. **OCR'd document text is third-party-authored content** — more injection-exposed than an owner's own notes. The untrusted-input posture tightens, never relaxes; injection-via-document becomes a mandatory eval fixture.
3. **Extraction never silently mints records** (D7 generalized): no auto-created visits, medications, weights, or conditions. AI-proposed, owner-confirmed only — the B-145 lane, which this library **absorbs as its ingestion lane** rather than a separate surface.
4. **`clinical-guardrails` wholesale:** explain and escalate on presence; never reassure on absence; every number sourced from the document with provenance to the page (the `validateAnswer` discipline).
5. **The proven first job is explain-the-jargon** (per-document, n=1-safe), not cross-record synthesis. Sequence accordingly.
6. Any surface feeding the vet report from documents ⇒ `adversarial-reviewer` mandatory; any new read path ⇒ `rls-privacy-reviewer` mandatory.

## 8. Acceptance criteria (v1)

1. Owner adds a document (camera / library / files per G2) in ≤10s with zero required decisions; it appears in the library immediately and syncs when online.
2. A document exists and renders with **no visit linked**; linking/unlinking a visit from the detail screen never alters any `vet_visits` row (D7 — QA verifies the report window is byte-identical before/after an upload).
3. Library lists documents newest-first with kind filter; empty state passes the Principle-5 "excited, not deflated" test.
4. Multi-select of N screenshots produces one grouped document, swipeable in detail.
5. Detail: view full-screen, edit metadata, share via native share sheet, soft-delete into a **"Recently deleted" surface (30 days, undo restores)** — the delete action's copy names the window, and the object's final purge follows the B-249-class retention decision (named, not silent).
6. Second device: hydrated library renders every document via signed URLs (no `local_uri` dependence).
7. Cross-tenant probe (second test account) gets uniform not-found on rows AND storage objects; `rls-privacy-reviewer` reports the attack it tried on both VF-0 and VF-1.
8. `delete-account` leaves zero `vet_documents` rows and zero `nyx-vet-documents` objects (verified count, not assumed).
9. Offline: add → airplane mode → relaunch → reconnect → document present locally throughout and synced after.
10. No `ActivityIndicator` (WhorlSpinner tiers), theme tokens only, `ChipGroup`/`ScopeMenu` per the filter rules.
11. Multi-pet account: "Also add to {other pet}" on the saved moment files an independent copy (own row, own storage object) under the other pet; single-pet accounts never render the affordance (D13).
12. Offline read (Sam's ER case): a document opened at least once on this device renders with no network; a never-opened remote document shows an honest "needs a connection" state, never a spinner. _Engineer feasibility pass in VF-2 decides the cache mechanism; the honest-failure half is unconditional._

## 9. PR plan

All gates closed; every PR below is build-ready in order. One PR per session (house rule); each ships with its DoD, and VF-0/VF-1 each get an `rls-privacy-reviewer` pass. Design authority for VF-2–VF-4 is the **round-2.1 design-locked mock** (`docs/culprit-vet-files-mockups.html`).

| PR | Scope | Depends on |
|---|---|---|
| **VF-0** | **The security gate: B-248 + B-466 in one PR.** Owner-scope the `nyx-vet-attachments` bucket policies (migration 025 is the template: `(storage.foldername(name))[1] IN (SELECT id::text FROM pets WHERE user_id = auth.uid())` for SELECT/INSERT/DELETE) + the `storage_path` prefix CHECK on `vet_visit_attachments`. Schema/RLS only. Migration Safety Pre-flight; `rls-privacy-reviewer` reports the cross-tenant attack it tried. | nothing — `Now` on its own mandate |
| **VF-1** | **The substrate.** Migration: `vet_documents` per §5.1 (incl. the path-prefix CHECK, `deleted_at`, `document_group_id`). Bucket `nyx-vet-documents` created via dashboard (**PM action**: private, owner-scoped policies, `file_size_limit` 15 MB, `allowed_mime_types` jpeg/png/heic/pdf). `delete-account` purge coverage for table + bucket. Local SQLite mirror + push sync + hydration (`lib/hydration.ts` ordering). Schema-isolated — no UI. `get_advisors` after apply. | VF-0 merged |
| **VF-2** | **The library.** Profile "Records" cards (A1-r2 populated + A1z zero state, incl. the "not included in the vet report" line), empty state E1-r2, list L-real (untitled-row anatomy, one-tap Name, dashed Add-type chip, kind `ScopeMenu`, pet name in header), signed-URL read path (`getSignedUrls`, short-lived). 44pt hit target on the add button. | VF-1 |
| **VF-3** | **Capture.** Add sheet D1-r2 (camera multi-shot, Photos multi-select → one grouped document, Files PDF pick), instant save with defaults, saved moment D2-r2 (pet name, offline line, "Name it", D13 "Also add to {other pet}" in multi-pet accounts only). EXIF/GPS strip on every image path — verify no original-fallback (§5.2). | VF-2 |
| **VF-4** | **Detail.** Viewer (image full-screen + page swipe with dots; PDF native view via Open), metadata edit rows, conditional visit-link row (renders only when ≥1 visit exists; D7 invariant test — report window byte-identical before/after linking), Share via native sheet, ⋯ menu (Rename / Delete), soft delete + the 30-day "Recently deleted" surface the round-2 mock promises (adopted from Sam's review — the delete copy names it, so it must exist). | VF-3 |
| **VF-5** | ~~PDF store-and-view~~ **dissolved into VF-3/VF-4 by the G2 ruling.** | — |
| **VF-6** | **The finish pass.** `nyx-voice` over every string (incl. the Share vs "Send to vet" label reconciliation), `pm-feature-review` re-run against built screens, full §8 AC verification, on-device QA script for the PM. | VF-4 |

**Per-session kickoff prompts:**
- *VF-0:* "Build VF-0 from `docs/nyx-vet-files-requirements.md` §9 — the B-248+B-466 hardening migration. Read §6.1 and migration 025 first. Schema/RLS only; `rls-privacy-reviewer` mandatory."
- *VF-1:* "Build VF-1 from `docs/nyx-vet-files-requirements.md` §5 — the `vet_documents` migration + sync/hydration + delete-account coverage. The `nyx-vet-documents` bucket must exist first (PM dashboard action, §9). Schema-isolated; no UI."
- *VF-2 → VF-4:* "Build VF-{n} from `docs/nyx-vet-files-requirements.md` §4/§9 against the design-locked round-2.1 mock (`docs/culprit-vet-files-mockups.html`). Check §0 D11–D14 before deviating from any mock detail."
- *VF-6:* "Run VF-6 from `docs/nyx-vet-files-requirements.md` §9 — voice pass, `pm-feature-review`, §8 AC verification, and the Manual QA script."

Phase 2 gets its own spec + PR plan after the D8 ruling.

## 10. Persona positions & recorded conflicts

- **Designer:** empty state is the primary screen; zero-decision capture; no Home presence; kind filter follows the lens rules. Signed off on §4 as drafted, pending mocks.
- **Dir. of Engineering:** new table + new correct-by-construction bucket (D3/D4); VF-0 first; PDF kept to store-and-view because no PDF pipeline exists (B-144 open); hydration + signed-URL read path are v1 non-negotiables given the audit's second-device finding.
- **Data Scientist:** provenance columns from day one (D10); `document_date` distinct from `created_at` (the date on the document is the clinically meaningful one); grouping model (§4.4) exists partly so Phase-2 attribution has a stable unit.
- **Dr. Chen:** continuity-of-care ordering (§2/§4.5) is the clinical spine; wants document *facts* reaching the report eventually — accepts the D8 gate, notes that when it opens, the report renders sourced facts with page provenance, never paraphrase.
- **Jordan / Sam:** the parking-lot test (§4.2) and the ER moment (§4.3 share) are the two moments that matter; multi-screenshot email threads must not become list clutter (§4.4).
- **Trust & Safety:** deletion + export story before first upload (§5.2/§6.2); new-data-class disclosures (B-229/B-268); Phase-2 consent must be explicit and granular (Apple per-record model, §2); dissent registered on any future silent-ingestion design — consent is per-corpus at minimum, ideally per-document.
- **QA:** AC list §8; flags that AC 2's report-window check and AC 8's zero-residue check are the two easiest to hand-wave and therefore the two that get explicit verification steps.
- **Product Owner:** B-145 is absorbed as Phase 2's ingestion lane (its row updates when the D8 ruling happens, not before); B-478 row carries this spec; no new backlog scope invented here.

**Recorded conflict (not resolved — informs G4):**
> **Dr. Chen:** labs-in-one-place is real continuity-of-care value; every month at `Later` is another ER visit where the bloodwork stays in an inbox.
> **Product Owner / Dir. of Eng.:** the wedge is reactive tracking; Step 9/10, the widget, and Ask are all mid-flight, and VF-0's security work is the only urgent part — which is already `Now` on its own merits.
> **PM decision needed:** G4 — where Vet Files sits in the queue. (The security prerequisite lands either way.)

## 11. Parked (not dropped)

- **Share-sheet / Files-app import into Nyx** (system-level "send to Nyx") — the highest-leverage capture upgrade, a new capture class per the logging-capture discovery ladder; own discovery when promoted.
- **Aggregate export** ("everything as one PDF") — the killer share affordance per §2; pairs with B-041/B-089 rather than duplicating them.
- **Email-forwarding ingestion** (a per-account inbox address) — powerful, heavy T&S surface; Phase-2-adjacent at earliest.
- **Backfill-link legacy `vet_visit_attachments`** into the library view.
- **Retention rule for soft-deleted documents' storage objects** — joins the B-249 orphan/retention decision rather than forking it.
- **Caregiver/household access to Vet Files** — follows the B-292 household primitive decision, not this spec.

## 12. Follow-ups & flagged doc edits (Tier 2 — PM confirmation before writing)

- `docs/backlog.md` B-478 row: status head updated to reference this spec (done in the same PR, Tier-1-adjacent working state).
- B-145 row: annotate "absorbed as Vet Files Phase-2 ingestion lane per `docs/nyx-vet-files-requirements.md` §7" — **proposed, awaiting PM.**
- B-041 row: add `vet_documents` + `nyx-vet-documents` to its scope line **when VF-1 merges** — proposed.
- B-229 / B-268 rows: add the vet-document data class — proposed.
- The §2 evidence base → a frozen `docs/research/2026-07-vet-files-discovery.md` brief — proposed (README rule: material evidence shifts get a brief).
- CLAUDE.md Read-These table: row added for this spec (Tier 1, done inline this session).
