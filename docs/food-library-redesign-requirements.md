# Food Library Redesign — Requirements

**Version:** 1.0 | **Status:** Requirements (pre-implementation) | **Date:** May 2026

> Output of a research/requirements session. Read this **and** `CLAUDE.md` before starting the implementation session. All decisions below were made by the PM with the product team in the room — they are not open questions unless explicitly marked.

---

## 1. Vision

Logging a meal should be photo-first, not text-first. Pet food packaging is visually distinctive; humans recognize an image in ~13ms vs. ~250ms to parse a text row. We will build a **photo-library-style food catalog** where each food entry is anchored by the photo(s) of its actual packaging, and a vision-model Edge Function extracts brand, product name, format, ingredients, and barcode asynchronously after upload.

This replaces the typeahead-from-third-party-catalog approach (OPFF / Chewy) that was explored and rejected this session. The photo-first approach gives us higher data quality (current-package ground truth, with provenance) and avoids both legal risk (no scraping) and crowd-source quality decay.

**The hero flow:** Jordan opens the picker → taps a photo of the can she just opened → meal is logged. After week one, no typing, no reading, no decisions.

---

## 2. Decisions made this session

| # | Decision | Notes |
|---|---|---|
| D1 | Food library is **globally shared** across all users at MVP | Defer multi-tenant overrides. Schema must remain compatible with future per-user overrides (i.e. do **not** add `user_id` to `food_items`). |
| D2 | **Photos-first** food entry. AI extraction populates structured fields async. | No reliance on third-party catalogs. No scraping. |
| D3 | **One photo required** (front of package). Barcode + ingredients photos are encouraged but optional. | The UI should heavily encourage all three but not block on the latter two. |
| D4 | **Confirm extracted brand + product name** in one tap on first-add. Ingredients & barcode extracted silently and shown editable on the food detail screen. | "Tier the trust by stakes" — high-stakes / high-accuracy fields confirmed, low-stakes / async fields verified post-hoc. |
| D5 | EXIF timestamp from food photo populates the **meal event time** when photo is added via the log flow; populates the **catalog entry time** when added via library management. | EXIF fallback to `new Date()` on malformed/absent EXIF (existing pattern). Source recorded as `occurred_at_source`. |
| D6 | Time-from-EXIF must be **surfaced in the UX** so the user knows we pre-populated it. | Inline subtle attribution beside the time selector: `"5:26 PM · set from your photo"`. Applies to **both** food and vomit photo flows for consistency. |
| D7 | Async extraction via Edge Function. **Never block logging on extraction.** | Meal logs immediately; library entry shows `ai_extraction_status='pending'` until completed. |
| D8 | Resolution of the Designer × Data Scientist conflict on user-edits-to-catalog: | Per-user overrides via additive `food_item_overrides` table — *deferred post-MVP*. MVP has direct edit on the (single-user) global library, which is acceptable because there is one user. |

---

## 3. Schema changes

**Single migration PR.** Schema-only, no UI bundled.

### 3.1 Additions to `food_items`

```sql
ALTER TABLE food_items
  ADD COLUMN upc_barcode             TEXT UNIQUE,
  ADD COLUMN photo_paths             TEXT[] NOT NULL DEFAULT '{}',
  -- Order convention: [0]=front, [1]=ingredients, [2]=barcode, [n]=additional
  ADD COLUMN ai_extraction_status    TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'completed' | 'failed' | 'manual' (manual = no photos, user-typed)
  ADD COLUMN ai_extraction_confidence JSONB,
  -- { "brand": 0.98, "product_name": 0.94, "ingredients": 0.71, ... }
  ADD COLUMN source                  TEXT NOT NULL DEFAULT 'user',
  -- 'user' | 'ai_extracted' | 'curated' | 'opff' (last reserved if we ever import)
  ADD COLUMN ai_extraction_error     TEXT;

CREATE INDEX idx_food_items_upc_barcode ON food_items(upc_barcode);
CREATE INDEX idx_food_items_status      ON food_items(ai_extraction_status);
```

### 3.2 Additions to `events` (or `meals`, decide at implementation)

```sql
ALTER TABLE events
  ADD COLUMN occurred_at_source TEXT NOT NULL DEFAULT 'manual';
  -- 'manual' | 'exif' | 'now'
  -- 'manual' means user explicitly set or changed the time.
```

### 3.3 No new tables for MVP

`food_item_overrides` is **deferred post-MVP**. Schema notes only.

### 3.4 RLS

`food_items` retains current `read-all-authenticated, insert-authenticated, update-by-creator` policies. Confirm policies still pass after the column additions.

---

## 4. UX flows

### 4.1 Log a meal — new picker

When the user taps "Meal" from the FAB, present a single screen with three zones, top to bottom:

| Zone | Content | Behavior |
|---|---|---|
| **Recent** | Last ~5 distinct foods logged in the past 14 days, shown as photo thumbnails with brand + product name underneath | Tap a thumbnail → meal logs immediately with current time. One-tap path. |
| **Library** | Full grid of all foods in the catalog, 2-column photo grid, searchable | Tap → same one-tap log. Search input filters by brand/product. |
| **+ Add new** | Camera CTA + "Choose from photos" option | Opens the photo-capture flow (4.2) |

**Empty states:**
- Recent empty (new user, no logs): collapse this zone; promote Library.
- Library empty (truly first log, ever): jump straight into the camera flow.

### 4.2 Add new food — photo capture

1. **Front of package required.** Camera opens. User snaps front of package.
2. **Encouraged next steps** (skippable, but with visual nudges that they're missing):
   - "Snap the ingredients label" — opens camera again
   - "Snap the barcode" — opens camera with a barcode-area hint overlay
3. **Confirm screen.** AI extraction runs (~2–4s, Edge Function). UI shows the photo with extracted brand + product name overlaid. Two buttons: **Looks right** (saves and proceeds) / **Edit** (one-screen form with extracted values pre-filled).
4. On confirm, the food is added to the library. If the user came here from the log flow, the meal is logged immediately with the EXIF time from the front-of-package photo (if available).
5. Ingredients + barcode are extracted async; the food detail screen updates via Supabase realtime subscription when complete.

### 4.3 Food detail screen

Editable view of a single food. Fields:
- Hero: front-of-package photo (tappable to view full size; swipe to other photos)
- Brand, product name, format — always editable
- Ingredients (free text, multi-line) — editable; shows "Extracting…" while pending
- UPC barcode — editable; shows "Tap to add" if missing
- Add additional photos (e.g. side panel, treats variation)
- Action: **Re-run AI extraction** (when ingredients failed or look wrong)

### 4.4 Time-from-EXIF attribution

Whenever the meal event's time was set from EXIF (not manually), the time selector area shows:

```
5:26 PM  ·  set from your photo
[Change]
```

The "set from your photo" text is muted (theme `colors.textSubtle`). It disappears the moment the user taps **Change** (because then it's no longer EXIF-sourced — `occurred_at_source` becomes `'manual'`).

Apply this consistently to the existing **vomit photo** flow as well — it currently uses EXIF silently and should get the same attribution treatment.

---

## 5. Async extraction architecture

### 5.1 Edge Function: `extract-food-from-photo`

**Trigger:** Called immediately after photos upload to Supabase Storage. Client invokes with `{ food_item_id, photo_paths }`.

**Body:**
1. Download photos from `nyx-food-photos` bucket via service role.
2. Call Claude vision (model TBD — see Open Questions) with a structured-output prompt requesting `{ brand, product_name, format, primary_protein, is_grain_free, is_prescription, ingredients_text, upc_barcode, confidence: {...} }`.
3. Update the `food_items` row: set fields, set `ai_extraction_status = 'completed'`, populate `ai_extraction_confidence`.
4. On error: set `ai_extraction_status = 'failed'`, populate `ai_extraction_error`. Surface a retry CTA on the food detail screen.

**Prompt structure (sketch — refine in implementation):**
- System prompt establishes role (extracting structured pet-food data) and constraints (verbatim ingredients, AAFCO order preserved, no hallucination).
- Input: 1–3 images.
- Output: strict JSON via tool-use / structured output.

**Confidence scoring:** Claude returns per-field confidence (0–1). The implementation session can choose to elicit this either via prompt instruction or by post-processing (e.g., absent fields → 0, extracted fields → 1 minus a penalty for ambiguity).

**Cost discipline:** Extraction fires **once per food** (on first-add only). Not on every meal log. Estimated cost <$0.02 per food. Bounded.

### 5.2 Storage bucket: `nyx-food-photos`

**CRITICAL — MUST be created via the Supabase dashboard UI, not via SQL.** Per the existing CLAUDE.md anti-pattern: SQL-created buckets have `owner=null` and RLS policies on `storage.objects` may silently fail. This is the same failure mode currently blocking `nyx-pet-photos`. Create via dashboard.

RLS policies (apply in SQL after bucket exists):
- Authenticated users can `INSERT` (upload).
- Authenticated users can `SELECT` (read).
- No `UPDATE` or `DELETE` for non-creators at MVP.

### 5.3 Image compression

Compress on the **client** before upload. Resize so longest edge ≤ 1600px, JPEG quality 75. Expo's `expo-image-manipulator` handles this. Cuts storage ~5–10× with no degradation for vision extraction.

---

## 6. Out of scope for MVP

Explicitly deferred. Do not silently expand scope.

- **Per-user overrides table** (`food_item_overrides`). Single user at MVP — defer.
- **Multi-tenant catalog moderation / curation queue.** Defer.
- **Barcode-only scan path** (Expo `expo-barcode-scanner` for fast SKU lookup with no AI). Designer wants this; deferred to post-MVP polish.
- **OPFF / Chewy import.** Explored and rejected this session. Out.
- **AI-driven ingredient verification UI** (e.g., highlighting low-confidence tokens). Defer until we see real extraction error rates.
- **Re-extraction on photo replacement.** If the user uploads a new front photo, we do *not* auto-rerun extraction at MVP. Manual "Re-run" button only.

---

## 7. New tech debt logged

- **Tap-target audit sweep.** Multiple interactive elements below the 44pt iOS HIG minimum. Tracked in CLAUDE.md anti-patterns; deferred to post-Step-10 polish unless a specific 3am-stumbling case forces it earlier.
- **Vomit photo EXIF attribution.** Existing vomit-photo flow uses EXIF silently. As part of this work, retrofit the "set from your photo" attribution to that flow too. Same pattern, both surfaces.

---

## 8. Open questions to surface in implementation session

| Question | Blocks |
|---|---|
| Which Claude vision model? Sonnet 4.6 vs Haiku 4.5. Cost vs accuracy on ingredient extraction. | Edge Function build |
| Where does image compression happen — client only, or also Edge Function (defensive resize before vision call)? | Client + Edge Function build |
| `nyx-food-photos` bucket RLS — same SQL-vs-dashboard landmine as `nyx-pet-photos`. Resolve before any upload code ships. | Storage / upload flow |
| Realtime subscription on `food_items` for status updates — confirm Supabase realtime is enabled on the project, and figure out the cleanest hook pattern for the food detail screen. | Food detail UI |

---

## 9. Implementation build order

Each step is its own PR. Schema is **never** bundled with UI per CLAUDE.md.

1. **Schema migration PR** — column additions in §3, no other changes.
2. **Bucket + RLS setup** — PM creates `nyx-food-photos` via dashboard, then a SQL-only PR adds RLS policies.
3. **Edge Function PR** — `extract-food-from-photo` with structured-output Claude call, status writes, error handling. Unit tests for the extraction logic (mocked Claude responses).
4. **Picker UX PR** — new three-zone meal-log screen (Recent / Library / + Add new). Replaces the current FlatList in `app/log.tsx`.
5. **Photo capture + confirm UX PR** — camera flow, AI confirm screen, library write.
6. **Food detail screen PR** — editable view, realtime status updates, manual "Re-run extraction" button.
7. **EXIF attribution UI PR** — inline `· set from your photo` next to time selector, on both food and vomit flows. Includes the `occurred_at_source` column wiring (this is technically a schema add — bundle with #1 if it doesn't bloat that PR; otherwise its own micro-migration).

---

## 10. Acceptance criteria — for QA before each PR merges

- **The 10-second test still passes** on the picker for an already-logged food. One-handed, in the dark, ≤10s.
- **First-add of a new food** is ≤30 seconds end-to-end (open camera → snap front → confirm → meal logged), assuming network is reasonable.
- **EXIF attribution** appears whenever `occurred_at_source = 'exif'` and disappears when changed manually.
- **No silent extraction failures** — failed status shows an actionable retry on the food detail screen.
- **All new interactive elements ≥44pt hit zone** (using `hitSlop` if visual is smaller).
- **Realtime status update** — food added with photos shows "Extracting…" then transitions to populated fields without the user re-opening the screen.
